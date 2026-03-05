import { withPgClient } from '../../crawler/db-postgres.mjs'

const ALLOWED_ORIGINS = new Set([
  'https://monitor.tierimfokus.ch',
  'https://tierpolitik.netlify.app',
])

const corsHeaders = (origin = '') => ({
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://monitor.tierimfokus.ch',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization',
  'access-control-allow-credentials': 'false',
})

export const handler = async (event) => {
  const origin = String(event?.headers?.origin || event?.headers?.Origin || '')
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: corsHeaders(origin), body: '' }
    }
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, headers: corsHeaders(origin), body: 'Method Not Allowed' }
    }

    const decisionId = String(event?.queryStringParameters?.id || '').trim()
    if (!decisionId.includes(':')) {
      return {
        statusCode: 400,
        headers: corsHeaders(origin),
        body: JSON.stringify({ ok: false, error: 'id must be sourceId:externalId' }),
      }
    }

    const [sourceId, externalIdRaw] = decisionId.split(':')
    const externalId = String(externalIdRaw || '')
    const externalIdFallback = externalId.replace(/-[a-z]{2}$/i, '')
    const affairId = externalIdFallback.split('-')[0]

    const data = await withPgClient(async (client) => {
      const motion = await client.query(
        `select id, status, updated_at
         from motions
         where
           (source_id = $1 and (external_id = $2 or external_id = $3))
           or external_id = $2
           or external_id = $3
           or split_part(external_id, '-', 1) = $4
         order by
           case when source_id = $1 then 0 else 1 end,
           updated_at desc
         limit 1`,
        [sourceId, externalId, externalIdFallback, affairId],
      )

      const row = motion.rows[0]
      if (!row) {
        return {
          id: null,
          status: null,
          reviewedAt: null,
          dbServerTime: new Date().toISOString(),
        }
      }

      const review = await client.query(
        `select decided_at
         from reviews
         where motion_id = $1
         order by decided_at desc
         limit 1`,
        [row.id],
      )

      return {
        id: row.id,
        status: row.status || null,
        reviewedAt: review.rows[0]?.decided_at || null,
        dbServerTime: new Date().toISOString(),
      }
    })

    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({ ok: true, ...data }),
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders(origin),
      body: JSON.stringify({ ok: false, error: error?.message || 'status lookup failed' }),
    }
  }
}

export default handler
