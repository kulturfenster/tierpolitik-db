import fs from 'node:fs'
import path from 'node:path'
import fallbackBundled from '../../data/vorstoesse.json' with { type: 'json' }
import { withPgClient } from '../../crawler/db-postgres.mjs'

const ALLOWED_ORIGINS = new Set([
  'https://monitor.tierimfokus.ch',
  'https://tierpolitik.netlify.app',
])

const corsHeaders = (origin = '') => ({
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://monitor.tierimfokus.ch',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization',
  'access-control-allow-credentials': 'false',
})

const initiativeLinksPath = path.resolve(process.cwd(), 'data/initiative-links.json')
const decisionsPath = path.resolve(process.cwd(), 'data/review-decisions.json')
const vorstoessePath = path.resolve(process.cwd(), 'data/vorstoesse.json')
const initiativeLinkMap = fs.existsSync(initiativeLinksPath)
  ? JSON.parse(fs.readFileSync(initiativeLinksPath, 'utf8'))
  : {}
const reviewDecisions = fs.existsSync(decisionsPath)
  ? JSON.parse(fs.readFileSync(decisionsPath, 'utf8'))
  : {}

let fallbackVorstoesse = []
try {
  if (fs.existsSync(vorstoessePath)) {
    fallbackVorstoesse = JSON.parse(fs.readFileSync(vorstoessePath, 'utf8'))
  }
} catch {
  // ignore and try bundled fallback below
}

if (!Array.isArray(fallbackVorstoesse) || !fallbackVorstoesse.length) {
  fallbackVorstoesse = Array.isArray(fallbackBundled) ? fallbackBundled : []
}

const inferType = (title = '', sourceId = '') => {
  const text = `${title} ${sourceId}`.toLowerCase()
  if (text.includes('postulat') || text.includes('postulato')) return 'Postulat'
  if (text.includes('motion') || text.includes('mozione')) return 'Motion'
  if (text.includes('fragestunde') || text.includes('question time') || text.includes('heure des questions') || text.includes('ora delle domande')) return 'Fragestunde. Frage'
  if (text.includes('interpellation') || text.includes('interpellanza')) return 'Interpellation'
  if (text.includes('anfrage') || text.includes('frage') || text.includes('question') || text.includes('interrogazione')) return 'Anfrage'
  if (text.includes('standesinitiative') || text.includes('initiative cantonale') || text.includes('iniziativa cantonale')) return 'Standesinitiative'
  if (text.includes('parlamentarische initiative') || text.includes('initiative parlementaire') || text.includes('iniziativa parlamentare')) return 'Parlamentarische Initiative'
  if (text.includes('volksinitiative') || text.includes('initiative populaire') || text.includes('iniziativa popolare')) return 'Volksinitiative'
  if (text.includes('initiative') || text.includes('iniziativa')) return 'Volksinitiative'
  return 'Interpellation'
}

const extractStance = (reason = '', title = '', summary = '', body = '') => {
  const text = `${title} ${summary} ${body}`.toLowerCase()
  if (text.includes('stopfleber') || text.includes('foie gras')) return 'pro-tierschutz'
  const m = String(reason).match(/stance=([^·]+)/)
  return (m?.[1] || 'neutral/unklar').trim()
}

const mapStatus = (status = '') => {
  const s = String(status).toLowerCase()
  if (s === 'published') return 'Angenommen'
  if (s === 'approved') return 'In Beratung'
  if (s === 'rejected') return 'Abgelehnt'
  return 'In Beratung'
}

const inferScope = (sourceId = '', title = '', body = '') => {
  const sid = String(sourceId || '').toLowerCase()
  const text = `${title} ${body}`

  if (sid.startsWith('ch-municipal-')) {
    const m = text.match(/([A-Z]{2})/)
    return { ebene: 'Gemeinde', kanton: m ? m[1] : null, regionGemeinde: null }
  }

  if (sid.startsWith('ch-cantonal-')) {
    const m = sid.match(/cantonal-(?:portal-core:)?(?:cantonal-portal-)?([a-z]{2})/)
    return { ebene: 'Kanton', kanton: m ? m[1].toUpperCase() : null, regionGemeinde: null }
  }

  return { ebene: 'Bund', kanton: null, regionGemeinde: null }
}

const toIsoDate = (value, fallbackYear) => {
  const d = value ? new Date(value) : null
  const base = d && !Number.isNaN(d.getTime()) ? d : null

  if (base) {
    let year = base.getUTCFullYear()
    if (fallbackYear && Number.isFinite(fallbackYear) && Math.abs(year - fallbackYear) >= 2) {
      year = fallbackYear
    }
    const month = String(base.getUTCMonth() + 1).padStart(2, '0')
    const day = String(base.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  if (fallbackYear && Number.isFinite(fallbackYear)) return `${fallbackYear}-01-01`
  return new Date().toISOString().slice(0, 10)
}

const langFromSource = (sourceId = '') => {
  const low = String(sourceId).toLowerCase()
  if (low.endsWith('-fr')) return 'fr'
  if (low.endsWith('-it')) return 'it'
  return 'de'
}

const langRank = (lang = 'de') => {
  if (lang === 'de') return 0
  if (lang === 'fr') return 1
  if (lang === 'it') return 2
  return 3
}

const typeLabels = {
  Volksinitiative: { de: 'Volksinitiative', fr: 'Initiative populaire', it: 'Iniziativa popolare', en: 'Popular initiative' },
  'Parlamentarische Initiative': { de: 'Parlamentarische Initiative', fr: 'Initiative parlementaire', it: 'Iniziativa parlamentare', en: 'Parliamentary initiative' },
  Standesinitiative: { de: 'Standesinitiative', fr: 'Initiative cantonale', it: 'Iniziativa cantonale', en: 'Cantonal initiative' },
  Interpellation: { de: 'Interpellation', fr: 'Interpellation', it: 'Interpellanza', en: 'Interpellation' },
  Motion: { de: 'Motion', fr: 'Motion', it: 'Mozione', en: 'Motion' },
  Postulat: { de: 'Postulat', fr: 'Postulat', it: 'Postulato', en: 'Postulate' },
  Anfrage: { de: 'Anfrage', fr: 'Question', it: 'Interrogazione', en: 'Question' },
  'Fragestunde. Frage': { de: 'Fragestunde. Frage', fr: 'Heure des questions. Question', it: 'Ora delle domande. Domanda', en: 'Question Time. Question' },
}

const inferYearFromBusiness = (title = '', externalId = '') => {
  const titleMatch = String(title || '').match(/^\s*(\d{2})\.(\d{2,4})\b/)
  if (titleMatch?.[1]) {
    const yy = Number(titleMatch[1])
    return yy >= 70 ? 1900 + yy : 2000 + yy
  }

  const num = String(externalId || '').split('-')[0]
  const exMatch = num.match(/^(\d{4})\d{2,4}$/)
  if (exMatch?.[1]) return Number(exMatch[1])
  return undefined
}

const formatBusinessNumber = (title = '', externalId = '', summary = '', body = '') => {
  const bodyMatch = String(body || '').match(/Geschäftsnummer:\s*([A-Za-z0-9.\-]+)/i)
  if (bodyMatch?.[1]) return bodyMatch[1]
  const summaryMatch = String(summary || '').match(/·\s*([0-9]{4}\.[A-Z]{2}\.[0-9]{4}|\d{2}\.\d{4})\s*·/)
  if (summaryMatch?.[1]) return summaryMatch[1]
  const titleMatch = String(title || '').match(/\b(\d{2}\.\d{4})\b/)
  if (titleMatch?.[1]) return titleMatch[1]
  const num = String(externalId || '').split('-')[0]
  const m = num.match(/^(\d{4})(\d{4})$/)
  if (m) {
    const yy = String(Number(m[1]) % 100).padStart(2, '0')
    return `${yy}.${m[2]}`
  }
  return String(externalId || '')
}

const fallbackPersonByLang = {
  de: { name: 'Gemäss Curia Vista', rolle: '', partei: '' },
  fr: { name: 'Selon Curia Vista', rolle: '', partei: '' },
  it: { name: 'Secondo Curia Vista', rolle: '', partei: '' },
}

const TYPE_OVERRIDES = {
  '24.331': 'Standesinitiative',
}

const SUBMITTER_OVERRIDES = {
  '25.4380': { name: 'Mathilde Crevoisier Crelier', rolle: 'Ständerat', partei: 'SP' },
  '24.3277': { name: 'Lorenz Hess', rolle: 'Nationalrat', partei: 'Die Mitte' },
  '25.404': { name: 'Kommission für Wissenschaft, Bildung und Kultur Nationalrat', rolle: 'Kommission', partei: '' },
  '21.3002': { name: 'Kommission für Umwelt, Raumplanung und Energie Ständerat', rolle: 'Kommission', partei: '' },
  '22.3299': { name: 'Schneider Meret', rolle: 'Nationalrat', partei: 'Grüne Partei der Schweiz' },
  '24.331': { name: 'Jura', rolle: 'Kanton', partei: '' },
}

const THEME_OVERRIDES = {
  '21.3002': ['Umwelt', 'Landwirtschaft'],
  '22.3299': ['Schweinezucht', 'Tierarzneimittel', 'Tierschutz'],
  '24.331': ['Tierschutz', 'Bienen', 'Landwirtschaft', 'Klimafolgen', 'Subventionen'],
}

const SUMMARY_OVERRIDES = {
  '21.3002': 'Die Motion verlangt, den Handlungsspielraum im Jagdgesetz per Verordnung auszuschöpfen, um die Koexistenz zwischen Menschen, Grossraubtieren und Nutztieren zu regeln (u. a. Regulierung und Herdenschutz).',
  '25.4809': 'Der Vorstoss verlangt konkrete Massnahmen gegen Tierqual bei der Geflügelschlachtung und eine konsequent tierschutzkonforme Praxis.',
  '22.3299': 'Die Motion verlangt ein Verbot PMSG-haltiger Tierarzneimittel in der Schweizer Schweinezucht und will verhindern, dass diese durch synthetische PMSG-Produkte ersetzt werden.',
  '24.331': 'Die Standesinitiative des Kantons Jura verlangt finanzielle Unterstützung für Imkerinnen und Imker bei geoklimatischen Ausnahmebedingungen, insbesondere für notwendige Zuckerfütterung zur Sicherung des Überlebens von Honigbienenvölkern.',
}

const parseMunicipalSubmitters = (body = '') => {
  const m = String(body || '').match(/eingereicht von:\s*([^\n]+)/i)
  if (!m?.[1]) return []
  return m[1]
    .split(',')
    .map((x) => String(x || '').replace(/\s+/g, ' ').trim())
    .filter((x) => x.length >= 3)
    .slice(0, 6)
    .map((entry) => {
      const withParty = entry.match(/^(.+?)\s*\(([^)]+)\)$/)
      if (withParty) {
        return { name: withParty[1].trim(), rolle: 'Gemeinderat', partei: withParty[2].trim() }
      }
      return { name: entry, rolle: 'Gemeinderat', partei: '' }
    })
}

const inferSubmitter = (lang, title = '', summary = '', body = '') => {
  const text = `${title} ${summary} ${body}`.toLowerCase()
  if (text.includes('blv') || text.includes('lebensmittelsicherheit') || text.includes('veterinärwesen')) {
    return { name: 'BLV', rolle: 'Regierung', partei: 'Bundesverwaltung' }
  }
  if (text.includes('eingereicht von bundesrat') || text.includes('message du conseil fédéral') || text.includes('messaggio del consiglio federale')) {
    return { name: 'Bundesrat', rolle: 'Regierung', partei: 'Bundesrat' }
  }
  if (text.includes('kommission') && text.includes('curia vista')) {
    return fallbackPersonByLang[lang] || fallbackPersonByLang.de
  }
  return fallbackPersonByLang[lang] || fallbackPersonByLang.de
}

const buildInitiativeLinks = ({ typ, externalId }) => {
  if (typ !== 'Volksinitiative') return undefined

  const affairId = String(externalId || '').split('-')[0]
  const mapped = initiativeLinkMap[affairId] || {}
  const campaignUrl = String(mapped.campaignUrl || '').trim()
  const resultUrl = String(mapped.resultUrl || '').trim()

  if (!campaignUrl && !resultUrl) return undefined
  return {
    ...(campaignUrl ? { campaignUrl } : {}),
    ...(resultUrl ? { resultUrl } : {}),
  }
}

const clean = (text = '') => String(text)
  .replace(/\s+/g, ' ')
  .replace(/^\s+|\s+$/g, '')

const normalizeDisplayTitle = (row, title = '') => {
  let t = clean(title)
  if (!t) return t
  const isBern = String(row?.source_id || '').includes('municipal-')
    && String(row?.source_url || '').includes('stadtrat.bern.ch')
  if (isBern) t = t.replace(/^Bern\s*[·:-]\s*/i, '')
  return t
}

const THEME_EXCLUDE = new Set(['botschaft', 'initiative', 'motion', 'postulat', 'interpellation', 'anfrage', 'gesetz'])
const sanitizeThemes = (arr = []) => arr
  .map((x) => String(x || '').trim())
  .filter((x) => x && !THEME_EXCLUDE.has(x.toLowerCase()))
  .filter((x) => !['tiere', 'animals', 'animali'].includes(String(x || '').toLowerCase()))

const formatThemeLabel = (value = '') => {
  const s = String(value || '').trim()
  if (!s) return s
  if (/^tierversuch(e)?$/i.test(s)) return 'Tierversuche'
  if (/^geflügel$/i.test(s) || /^gefluegel$/i.test(s)) return 'Masthühner'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const municipalThemesFromTitle = (title = '') => {
  const t = String(title || '').toLowerCase()
  const out = []
  if (t.includes('feuerwerk') || t.includes('lärm') || t.includes('laerm')) out.push('Feuerwerk')
  if (t.includes('tierpark')) out.push('Zoo')
  if (t.includes('biodivers')) out.push('Biodiversität')
  if (t.includes('wald')) out.push('Wald')
  if (t.includes('siedlungsgebiet')) out.push('Siedlungsgebiet')
  if (t.includes('landwirtschaftsgebiet')) out.push('Landwirtschaft')
  if (!out.length && t.includes('tier')) out.push('Tierschutz')
  if (!out.length) out.push('Tierschutz')
  return [...new Set(out)].slice(0, 4)
}

const firstSentence = (text = '') => {
  const c = clean(text)
  if (!c) return ''
  const low = c.toLowerCase()
  if (
    low.includes('stellungnahme zum vorstoss liegt vor')
    || low.includes('beratung in kommission')
    || low.includes('erledigt')
  ) return ''
  const m = c.match(/(.{40,220}?[.!?])\s/)
  if (m) return m[1]
  return c.slice(0, 220)
}

const isWeakSummarySentence = (text = '') => {
  const s = String(text || '').toLowerCase().trim()
  if (!s) return true
  return s.includes('stellungnahme zum vorstoss liegt vor')
    || s.includes('stellungnahme liegt vor')
    || s.includes('antwort liegt vor')
    || s.includes('zugewiesen an die behandelnde kommission')
    || s.includes('überwiesen an den bundesrat')
    || s.includes('ueberwiesen an den bundesrat')
    || s.includes('|')
    || /^parlamentsgesch(ä|a)ft\s+/i.test(s)
}

const summarizeVorstoss = ({ title = '', summary = '', body = '', status = '', sourceId = '' }) => {
  const t = clean(title)
  if (String(sourceId || '').startsWith('ch-municipal-')) {
    const state = status === 'published' ? 'abgeschlossen' : 'in Beratung'
    return `${t} (Gemeinde, ${state}).`
  }
  const summaryClean = clean(summary).replace(/eingereicht von:[^\n]*/ig, '').trim()
  const bodyClean = clean(body).replace(/eingereicht von:[^\n]*/ig, '').trim()
  const s = firstSentence(summaryClean)
  const b = firstSentence(bodyClean)
  const low = `${t} ${summary} ${body}`.toLowerCase()
  const statusLabel = status === 'published' ? 'abgeschlossen' : 'in Beratung'

  const sentences = []

  if (low.includes('chlorhühner') || low.includes('chlorhuehner') || (low.includes('geflügel') && low.includes('importverbot'))) {
    sentences.push('Der Vorstoss verlangt ein klares Importverbot für chemisch behandeltes Geflügelfleisch ("Chlorhühner") und die Verankerung im Gesetz.')
    sentences.push('Im Fokus steht, ob Tierschutz- und Konsumentenschutzstandards im Import konsequent abgesichert werden.')
  } else if (low.includes('stopfleber') || low.includes('foie gras')) {
    sentences.push('Dieser Vorstoss betrifft die Stopfleber-Thematik (Foie gras) und die politische Umsetzung eines indirekten Gegenentwurfs mit stufenweisen Importbeschränkungen.')
    sentences.push('Im Zentrum steht, wie streng der Schutz von Tieren in der Produktions- und Importkette rechtlich ausgestaltet werden soll.')
  } else if (low.includes('tierversuch') || low.includes('3r') || low.includes('expérimentation animale')) {
    sentences.push('Dieser Vorstoss behandelt Alternativen zu Tierversuchen (3R) und die Frage, wie Forschung gezielt in tierfreie bzw. tierärmere Methoden gelenkt werden kann.')
    sentences.push('Diskutiert werden typischerweise Ressourcen, Anreize und konkrete Umsetzungsmechanismen im Forschungsbereich.')
  } else if (low.includes('wolf') || low.includes('wildtier') || low.includes('jagd') || low.includes('chasse')) {
    sentences.push('Dieser Vorstoss betrifft die Wildtierpolitik, insbesondere das Spannungsfeld zwischen Schutz, Regulierung und Jagd.')
    sentences.push('Für die Einordnung ist zentral, ob die vorgeschlagenen Massnahmen den Schutzstatus stärken oder Eingriffe ausweiten.')
  }

  if (s && !isWeakSummarySentence(s)) sentences.push(s)
  if (b && b !== s && !isWeakSummarySentence(b)) sentences.push(b)

  const unique = []
  const seen = new Set()
  for (const line of sentences) {
    const key = clean(line).toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(line)
  }

  return unique
    .slice(0, 3)
    .join(' ')
}

const isParliamentSourceId = (sourceId = '') => String(sourceId || '').startsWith('ch-parliament-')
const isPublicSourceId = (sourceId = '') => {
  const sid = String(sourceId || '')
  return sid.startsWith('ch-parliament-') || sid.startsWith('ch-municipal-') || sid.startsWith('ch-cantonal-')
}

const effectiveStatusForRow = (row) => {
  const key = `${row?.source_id || ''}:${row?.external_id || ''}`
  const decisionStatus = String(reviewDecisions?.[key]?.status || '').toLowerCase()
  if (decisionStatus) return decisionStatus
  return String(row?.status || '').toLowerCase()
}

export const handler = async (event) => {
  const origin = String(event?.headers?.origin || event?.headers?.Origin || '')
  if (event?.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' }
  }
  try {
    const rows = await withPgClient(async (client) => {
      const res = await client.query(`
        select
          m.source_id,
          m.external_id,
          m.source_url,
          coalesce(lr.status, m.status) as status,
          m.review_reason,
          m.published_at,
          m.fetched_at,
          m.matched_keywords,
          mv.title,
          mv.summary,
          mv.body
        from motions m
        left join lateral (
          select title, summary, ''::text as body
          from motion_versions mv
          where mv.motion_id = m.id
          order by mv.version_no desc
          limit 1
        ) mv on true
        left join lateral (
          select status
          from reviews r
          where r.motion_id = m.id
          order by r.decided_at desc nulls last
          limit 1
        ) lr on true
        where coalesce(lr.status, m.status) in ('approved','published')
          and (
            m.source_id like 'ch-parliament-%'
            or m.source_id like 'ch-municipal-%'
            or m.source_id like 'ch-cantonal-%'
          )
          and coalesce(mv.title, '') <> ''
          and coalesce(m.published_at, m.fetched_at) >= (now() - interval '10 years')
        order by m.updated_at desc
        limit 2500
      `)
      return res.rows
    })

    const effectiveRows = rows
      .filter((r) => ['approved', 'published'].includes(effectiveStatusForRow(r)))

    const affairIds = [...new Set(
      effectiveRows
        .filter((r) => isParliamentSourceId(r.source_id))
        .map((r) => String(r.external_id || '').split('-')[0])
        .filter(Boolean),
    )]

    const deRows = affairIds.length
      ? await withPgClient(async (client) => {
        const res = await client.query(
          `select m.external_id, mv.title, mv.summary, mv.body
           from motions m
           left join lateral (
             select title, summary, ''::text as body
             from motion_versions mv
             where mv.motion_id = m.id
             order by mv.version_no desc
             limit 1
           ) mv on true
           where m.source_id like 'ch-parliament-%-de'
             and split_part(m.external_id, '-', 1) = any($1::text[])
           order by m.updated_at desc`,
          [affairIds],
        )
        return res.rows
      })
      : []

    const deByAffair = new Map()
    for (const row of deRows) {
      const affairId = String(row.external_id || '').split('-')[0]
      if (!deByAffair.has(affairId)) deByAffair.set(affairId, row)
    }

    const variantsByAffair = new Map()
    for (const row of effectiveRows) {
      if (!isParliamentSourceId(row.source_id)) continue
      const affairId = String(row.external_id || '').split('-')[0]
      if (!affairId) continue
      const lang = langFromSource(row.source_id)
      const prevAffair = variantsByAffair.get(affairId) || {}
      const prev = prevAffair[lang]
      const prevTs = new Date(prev?.fetched_at || prev?.published_at || 0).getTime()
      const curTs = new Date(row.fetched_at || row.published_at || 0).getTime()
      if (!prev || curTs >= prevTs) {
        prevAffair[lang] = row
        variantsByAffair.set(affairId, prevAffair)
      }
    }

    const grouped = new Map()
    for (const row of effectiveRows) {
      const isParliament = isParliamentSourceId(row.source_id)
      const key = isParliament
        ? String(row.external_id || '').split('-')[0]
        : `${row.source_id}:${row.external_id}`
      if (!key) continue
      const lang = langFromSource(row.source_id)
      const prev = grouped.get(key)
      if (!prev) {
        grouped.set(key, row)
        continue
      }
      const prevLang = langFromSource(prev.source_id)
      const betterLang = isParliament && (langRank(lang) < langRank(prevLang))
      const newer = new Date(row.fetched_at || row.published_at || 0).getTime() > new Date(prev.fetched_at || prev.published_at || 0).getTime()
      if (betterLang || (!betterLang && newer)) grouped.set(key, row)
    }

    const dedupedRows = [...grouped.values()]

    const mapped = dedupedRows.map((r, index) => {
      const sprache = langFromSource(r.source_id)
      const isParliament = isParliamentSourceId(r.source_id)
      const affairId = String(r.external_id || '').split('-')[0]
      const deVariant = isParliament ? deByAffair.get(affairId) : null
      const displayTitleRaw = deVariant?.title || r.title
      const displayTitle = normalizeDisplayTitle(r, displayTitleRaw)
      const displaySummary = deVariant?.summary || r.summary
      const displayBody = deVariant?.body || r.body
      const inferredYear = inferYearFromBusiness(displayTitle, r.external_id)
      const eingereicht = toIsoDate(r.published_at || r.fetched_at, inferredYear)
      const updated = toIsoDate(r.fetched_at || r.published_at, inferredYear)
      const stance = extractStance(r.review_reason, displayTitle, displaySummary, displayBody)
      const idSafe = String(r.external_id || `${Date.now()}-${index}`).replace(/[^a-zA-Z0-9-]/g, '-')
      const sourceLinkFromBody = String(displayBody || '').match(/Quelle:\s*(https?:\/\/\S+)/i)?.[1] || ''
      const link = sourceLinkFromBody.startsWith('http')
        ? sourceLinkFromBody
        : (String(r.source_url || '').startsWith('http')
          ? r.source_url
          : `https://www.parlament.ch/de/ratsbetrieb/suche-curia-vista/geschaeft?AffairId=${affairId}`)
      const businessNumber = formatBusinessNumber(
        displayTitle,
        r.external_id || `AUTO-${index + 1}`,
        displaySummary,
        displayBody,
      )
      const typ = TYPE_OVERRIDES[businessNumber] || inferType(displayTitle || '', r.source_id || '')
      const statusLabel = mapStatus(r.status)
      const initiativeLinks = buildInitiativeLinks({
        typ,
        title: displayTitle,
        externalId: r.external_id,
        status: statusLabel,
      })
      const normalizedSummary = clean(SUMMARY_OVERRIDES[businessNumber] || summarizeVorstoss({
        title: displayTitle,
        summary: displaySummary,
        body: displayBody,
        status: r.status,
        sourceId: r.source_id,
      }))
      const summaryText = normalizedSummary.length >= 10
        ? normalizedSummary
        : `Kurzüberblick: ${displayTitle || `Vorstoss ${index + 1}`} (${statusLabel}).`

      const normalizedThemes = sanitizeThemes(Array.isArray(r.matched_keywords) && r.matched_keywords.length ? r.matched_keywords : ['Tierschutz'])
      const isMunicipal = String(r?.source_id || '').startsWith('ch-municipal-')
      const themeOverride = THEME_OVERRIDES[businessNumber]
      const baseThemes = Array.isArray(themeOverride) && themeOverride.length
        ? themeOverride
        : (isMunicipal
          ? municipalThemesFromTitle(displayTitle)
          : (normalizedThemes.length ? normalizedThemes : ['Tierschutz']).slice(0, 6))

      if (!clean(displayTitle)) return null

      const i18nOut = {
        title: { de: clean(displayTitle) },
        summary: { de: summaryText },
        type: { de: typeLabels[typ]?.de || typ },
        themes: { de: baseThemes },
      }
      const affairVariants = isParliament ? (variantsByAffair.get(affairId) || {}) : {}
      for (const [lang, variant] of Object.entries(affairVariants)) {
        const l = ['de', 'fr', 'it', 'en'].includes(lang) ? lang : 'de'
        const vTitle = clean(variant?.title || '')
        const vSummaryRaw = summarizeVorstoss({
          title: variant?.title || displayTitle,
          summary: variant?.summary || '',
          body: variant?.body || '',
          status: variant?.status || r.status,
        })
        const vSummary = clean(vSummaryRaw || summaryText)
        const vType = TYPE_OVERRIDES[businessNumber] || inferType(vTitle || displayTitle, variant?.source_id || r.source_id || '')
        if (vTitle) i18nOut.title[l] = vTitle
        if (vSummary) i18nOut.summary[l] = vSummary
        i18nOut.type[l] = typeLabels[vType]?.[l] || typeLabels[typ]?.[l] || vType
        i18nOut.themes[l] = baseThemes
      }

      const municipalSubmitters = String(r?.source_id || '').startsWith('ch-municipal-')
        ? parseMunicipalSubmitters(displayBody)
        : []
      const submitterOverride = SUBMITTER_OVERRIDES[businessNumber]

      const scope = inferScope(r.source_id, displayTitle, displayBody)

      return {
        id: `vp-${idSafe.toLowerCase()}`,
        titel: clean(displayTitle),
        typ,
        kurzbeschreibung: summaryText,
        geschaeftsnummer: businessNumber,
        ebene: scope.ebene,
        kanton: scope.kanton,
        regionGemeinde: scope.regionGemeinde,
        status: statusLabel,
        datumEingereicht: eingereicht,
        datumAktualisiert: updated,
        themen: [...new Set(baseThemes.map((x) => formatThemeLabel(x)))],
        schlagwoerter: (Array.isArray(r.matched_keywords) && r.matched_keywords.length ? r.matched_keywords : ['Tierpolitik']).slice(0, 8),
        einreichende: submitterOverride
          ? [submitterOverride]
          : (municipalSubmitters.length ? municipalSubmitters : [inferSubmitter(sprache, displayTitle, displaySummary, displayBody)]),
        linkGeschaeft: link,
        resultate: [{ datum: eingereicht, status: statusLabel, bemerkung: 'Stand gemäss Parlamentsdaten' }],
        medien: [],
        metadaten: { sprache, haltung: stance, initiativeLinks, i18n: i18nOut, zuletztGeprueftVon: 'DB Live API' },
      }
    })

    const cleanedMapped = mapped.filter(Boolean)
    const payload = cleanedMapped.length > 0 ? cleanedMapped : fallbackVorstoesse

    const finalPayload = Array.isArray(payload) && payload.length >= 20
      ? payload
      : (Array.isArray(fallbackVorstoesse) && fallbackVorstoesse.length ? fallbackVorstoesse : payload)

    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify(finalPayload),
    }
  } catch {
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify(fallbackVorstoesse),
    }
  }
}

export default handler
