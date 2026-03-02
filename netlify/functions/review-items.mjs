import { withPgClient } from '../../crawler/db-postgres.mjs'

const ALLOWED_ORIGINS = new Set([
  'https://monitor.tierimfokus.ch',
  'https://tierpolitik.netlify.app',
])

const corsHeaders = (origin = '') => ({
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://tierpolitik.netlify.app',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization',
})

export const handler = async (event) => {
  const origin = String(event?.headers?.origin || event?.headers?.Origin || '')

  if (event?.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' }
  }

  if (event?.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders(origin),
      body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
    }
  }

  try {
    const includeDecided = String(event?.queryStringParameters?.includeDecided || '').toLowerCase() === 'true'
    const limit = Math.min(5000, Math.max(1, Number(event?.queryStringParameters?.limit || 500)))

    const { rows, titleFallbacks } = await withPgClient(async (client) => {
      const res = await client.query(
        `select
          m.source_id,
          m.external_id,
          m.source_url,
          m.language,
          m.published_at,
          m.fetched_at,
          m.score,
          m.matched_keywords,
          m.status as motion_status,
          m.review_reason,
          mv.title,
          mv.summary,
          mv.body,
          lr.status as review_status,
          lr.decided_at
        from motions m
        left join lateral (
          select title, summary, body
          from motion_versions mv
          where mv.motion_id = m.id
          order by mv.version_no desc
          limit 1
        ) mv on true
        left join lateral (
          select status, decided_at
          from reviews r
          where r.motion_id = m.id
          order by r.decided_at desc nulls last
          limit 1
        ) lr on true
        where ($1::boolean = true)
           or (lr.decided_at is null and coalesce(lr.status, m.status, 'new') in ('new','queued'))
        order by coalesce(m.published_at, m.fetched_at) desc nulls last, m.updated_at desc
        limit $2`,
        [includeDecided, limit],
      )

      const affairIds = [...new Set(res.rows
        .filter((r) => String(r.source_id || '').startsWith('ch-parliament-'))
        .map((r) => String(r.external_id || '').split('-')[0])
        .filter(Boolean))]

      let titleFallbacks = []
      if (affairIds.length) {
        const fallbackRes = await client.query(
          `select
             split_part(m.external_id, '-', 1) as affair_id,
             mv.title,
             mv.summary
           from motions m
           left join lateral (
             select title, summary
             from motion_versions mv
             where mv.motion_id = m.id
             order by mv.version_no desc
             limit 1
           ) mv on true
           where split_part(m.external_id, '-', 1) = any($1)
             and coalesce(mv.title, '') <> ''
             and mv.title !~* '^Parlamentsgeschäft\\s+[0-9]+'
           order by m.updated_at desc`,
          [affairIds],
        )
        titleFallbacks = fallbackRes.rows
      }

      return { rows: res.rows, titleFallbacks }
    })

    const bestTitleByAffair = new Map()
    for (const row of titleFallbacks) {
      const key = String(row.affair_id || '')
      if (!key || bestTitleByAffair.has(key)) continue
      bestTitleByAffair.set(key, {
        title: String(row.title || ''),
        summary: String(row.summary || ''),
      })
    }

    const items = rows.map((r) => {
      const affairId = String(r.external_id || '').split('-')[0]
      const genericParliamentTitle = /^Parlamentsgeschäft\s+[0-9]+$/i.test(String(r.title || '').trim())
      const titleFallback = genericParliamentTitle ? bestTitleByAffair.get(affairId) : null

      return {
        id: `${r.source_id}:${r.external_id}`,
        sourceId: r.source_id,
        externalId: r.external_id,
        sourceUrl: r.source_url,
        language: r.language || 'de',
        title: titleFallback?.title || r.title || '',
        summary: titleFallback?.summary || r.summary || '',
        body: String(r.body || '').slice(0, 1200),
        publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
        fetchedAt: r.fetched_at ? new Date(r.fetched_at).toISOString() : null,
        score: Number(r.score || 0),
        matchedKeywords: Array.isArray(r.matched_keywords) ? r.matched_keywords : [],
        status: r.review_status || r.motion_status || 'new',
        reviewReason: r.review_reason || '',
        decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
      }
    })

    const sourceRank = (sourceId = '') => {
      const s = String(sourceId || '').toLowerCase()
      if (s === 'ch-parliament-business-de') return 0
      if (s === 'ch-parliament-motions-de') return 1
      if (s.startsWith('ch-parliament-')) return 2
      return 3
    }

    const keyFor = (item) => {
      const sid = String(item?.sourceId || '')
      if (sid.startsWith('ch-parliament-')) return `affair:${String(item?.externalId || '').split('-')[0]}`
      return `id:${item?.id || `${sid}:${item?.externalId || ''}`}`
    }

    const dedupedMap = new Map()
    for (const item of items) {
      const key = keyFor(item)
      const prev = dedupedMap.get(key)
      if (!prev) {
        dedupedMap.set(key, item)
        continue
      }

      const prevRank = sourceRank(prev.sourceId)
      const nextRank = sourceRank(item.sourceId)
      if (nextRank < prevRank) {
        dedupedMap.set(key, item)
        continue
      }
      if (nextRank === prevRank) {
        const prevScore = Number(prev.score || 0)
        const nextScore = Number(item.score || 0)
        if (nextScore > prevScore) {
          dedupedMap.set(key, item)
          continue
        }
        if (nextScore === prevScore) {
          const prevTs = Date.parse(prev.publishedAt || prev.fetchedAt || '') || 0
          const nextTs = Date.parse(item.publishedAt || item.fetchedAt || '') || 0
          if (nextTs > prevTs) dedupedMap.set(key, item)
        }
      }
    }

    const dedupedItems = [...dedupedMap.values()]

    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({ ok: true, count: dedupedItems.length, items: dedupedItems }),
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders(origin),
      body: JSON.stringify({ ok: false, error: error?.message || 'review-items failed' }),
    }
  }
}

export default handler
