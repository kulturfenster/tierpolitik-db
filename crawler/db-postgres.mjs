import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'

function loadDotEnvLikeFile() {
  const localCandidates = ['.env', '.env.local', '.env.db', '.env.db.local']
  for (const candidate of localCandidates) {
    try {
      const full = resolve(process.cwd(), candidate)
      const raw = readFileSync(full, 'utf8')
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const i = trimmed.indexOf('=')
        if (i <= 0) continue
        const key = trimmed.slice(0, i).trim()
        let value = trimmed.slice(i + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        if (!(key in process.env)) {
          process.env[key] = value
        }
      }
    } catch {
      // optional files -> ignore
    }
  }
}

export function getDatabaseUrl() {
  loadDotEnvLikeFile()
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL fehlt. Siehe .env.db.example')
  }
  return url
}

export async function withPgClient(fn) {
  const connectionTimeoutMillis = Math.max(3000, Number(process.env.PG_CONNECT_TIMEOUT_MS || 15000))
  const queryTimeout = Math.max(5000, Number(process.env.PG_QUERY_TIMEOUT_MS || 60000))
  const statementTimeout = Math.max(queryTimeout, Number(process.env.PG_STATEMENT_TIMEOUT_MS || 120000))
  const lockTimeout = Math.max(1000, Number(process.env.PG_LOCK_TIMEOUT_MS || 8000))

  const client = new Client({
    connectionString: getDatabaseUrl(),
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis,
    query_timeout: queryTimeout,
    statement_timeout: statementTimeout,
    lock_timeout: lockTimeout,
    application_name: process.env.PG_APPLICATION_NAME || 'tierpolitik-db',
  })

  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export async function ensureSource(client, source) {
  await client.query(
    `insert into sources (id, label, type, adapter, url, enabled, fallback_path, options, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb, now())
     on conflict (id) do update
     set label = excluded.label,
         type = excluded.type,
         adapter = excluded.adapter,
         url = excluded.url,
         enabled = excluded.enabled,
         fallback_path = excluded.fallback_path,
         options = excluded.options,
         updated_at = now()`,
    [
      source.id,
      source.label,
      source.type,
      source.adapter || null,
      source.url,
      source.enabled ?? true,
      source.fallbackPath || null,
      JSON.stringify(source.options || {}),
    ],
  )
}

function contentHashFor(item) {
  const base = `${item.title || ''}\n${item.summary || ''}\n${item.body || ''}`
  let hash = 0
  for (let i = 0; i < base.length; i += 1) {
    hash = ((hash << 5) - hash) + base.charCodeAt(i)
    hash |= 0
  }
  return `v1:${Math.abs(hash)}`
}

export async function upsertMotionWithVersion(client, item) {
  const upsert = await client.query(
    `insert into motions (
      source_id, external_id, source_url, language, published_at, fetched_at,
      score, matched_keywords, status, review_reason, first_seen_at, last_seen_at, updated_at
    )
    values (
      $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10, now(), now(), now()
    )
    on conflict (source_id, external_id) do update
    set source_url = excluded.source_url,
        language = excluded.language,
        published_at = excluded.published_at,
        fetched_at = excluded.fetched_at,
        score = excluded.score,
        matched_keywords = excluded.matched_keywords,
        status = excluded.status,
        review_reason = excluded.review_reason,
        last_seen_at = now(),
        updated_at = now()
    returning id`,
    [
      item.sourceId,
      item.externalId,
      item.sourceUrl,
      item.language || 'de',
      item.publishedAt,
      item.fetchedAt,
      Number(item.score || 0),
      JSON.stringify(item.matchedKeywords || []),
      item.status || 'new',
      item.reviewReason || '',
    ],
  )

  const motionId = upsert.rows[0].id
  const hash = contentHashFor(item)
  const currentVersion = await client.query('select coalesce(max(version_no), 0) as max_version from motion_versions where motion_id = $1', [motionId])
  const nextVersionNo = Number(currentVersion.rows[0].max_version) + 1

  await client.query(
    `insert into motion_versions (motion_id, title, summary, body, content_hash, version_no)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (motion_id, content_hash) do nothing`,
    [motionId, item.title || '', item.summary || '', item.body || '', hash, nextVersionNo],
  )

  return motionId
}

export async function insertReviewSnapshot(client, motionId, item) {
  if (!item.status || item.status === 'new') return

  const mapStatus = ['approved', 'rejected', 'queued'].includes(item.status) ? item.status : 'queued'
  await client.query(
    `insert into reviews (motion_id, status, reason, reviewer, decided_at)
     values ($1,$2,$3,'migration-json', now())`,
    [motionId, mapStatus, item.reviewReason || 'Migration aus JSON-Status'],
  )
}

export async function upsertSubmission(client, row) {
  await client.query(
    `insert into submissions (id, title, url, summary, created_at, processed, created_source, meta)
     values ($1,$2,$3,$4,$5,$6,'user-input',$7::jsonb)
     on conflict (id) do update
     set title = excluded.title,
         url = excluded.url,
         summary = excluded.summary,
         created_at = excluded.created_at,
         processed = excluded.processed,
         meta = excluded.meta`,
    [
      row.id,
      row.title || '',
      row.url || '',
      row.summary || '',
      row.createdAt || new Date().toISOString(),
      Boolean(row.processed),
      JSON.stringify({ importedFrom: 'data/user-input.json' }),
    ],
  )
}

export async function loadJsonCompatibleSnapshot(client) {
  const sourcesRes = await client.query(
    `select id, label, type, adapter, url, enabled, fallback_path, options
     from sources
     order by id`,
  )

  const itemsRes = await client.query(
    `select
      m.source_id,
      m.source_url,
      m.external_id,
      m.language,
      m.published_at,
      m.fetched_at,
      m.score,
      m.matched_keywords,
      m.status,
      m.review_reason,
      mv.title,
      mv.summary,
      mv.body
     from motions m
     left join lateral (
       select title, summary, body
       from motion_versions mv
       where mv.motion_id = m.id
       order by mv.version_no desc
       limit 1
     ) mv on true
     order by m.updated_at desc`,
  )

  return {
    sources: sourcesRes.rows.map((r) => ({
      id: r.id,
      label: r.label,
      type: r.type,
      adapter: r.adapter || undefined,
      url: r.url,
      enabled: r.enabled,
      fallbackPath: r.fallback_path || undefined,
      options: r.options || {},
    })),
    items: itemsRes.rows.map((r) => ({
      sourceId: r.source_id,
      sourceUrl: r.source_url,
      externalId: r.external_id,
      title: r.title || '',
      summary: r.summary || '',
      body: r.body || '',
      publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
      fetchedAt: new Date(r.fetched_at).toISOString(),
      language: r.language,
      score: Number(r.score || 0),
      matchedKeywords: Array.isArray(r.matched_keywords) ? r.matched_keywords : [],
      status: r.status,
      reviewReason: r.review_reason || '',
    })),
    publications: [],
    updatedAt: new Date().toISOString(),
  }
}
