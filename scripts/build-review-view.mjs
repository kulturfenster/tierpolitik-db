import fs from 'node:fs'

const dbPath = new URL('../data/crawler-db.json', import.meta.url)
const outPath = new URL('../public/review.html', import.meta.url)
const reviewDataPath = new URL('../data/review-items.json', import.meta.url)
const decisionsPath = new URL('../data/review-decisions.json', import.meta.url)
const fastlaneTagsPath = new URL('../data/review-fastlane-tags.json', import.meta.url)
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'))
const localDecisions = fs.existsSync(decisionsPath)
  ? JSON.parse(fs.readFileSync(decisionsPath, 'utf8'))
  : {}
const fastlaneTags = fs.existsSync(fastlaneTagsPath)
  ? JSON.parse(fs.readFileSync(fastlaneTagsPath, 'utf8'))
  : {}

const sourcesConfigPath = new URL('../crawler/config.sources.json', import.meta.url)
const configuredSources = fs.existsSync(sourcesConfigPath)
  ? JSON.parse(fs.readFileSync(sourcesConfigPath, 'utf8'))
  : []

const enabledSourceIds = new Set(((configuredSources.length ? configuredSources : (db.sources || [])) || [])
  .filter((s) => s.enabled !== false)
  .map((s) => s.id))

const TARGET_SINCE_YEAR = Math.max(2012, Number(process.env.REVIEW_TARGET_SINCE_YEAR || 2016))
const targetSinceTs = Date.UTC(TARGET_SINCE_YEAR, 0, 1, 0, 0, 0)
const isInTargetHorizon = (item) => {
  const iso = item?.publishedAt || item?.fetchedAt
  if (!iso) return false
  const ts = Date.parse(String(iso))
  if (Number.isNaN(ts)) return false
  return ts >= targetSinceTs
}

const isMunicipalOverviewNoise = (item) => {
  const sid = String(item?.sourceId || '')
  if (!sid.startsWith('ch-municipal-')) return false
  const t = String(item?.title || '').toLowerCase()
  const url = String(item?.meta?.sourceLink || item?.sourceUrl || '').toLowerCase()
  return t.includes('übersichtsseite')
    || t.includes('vorstösse und grsr-revisionen')
    || t.includes('antworten auf kleine anfragen')
    || t.includes('erste beratung von jugendvorst')
    || /^parlamentsgesch(ä|a)ft\s+municipal-/.test(t)
    || url.includes('vorstoesse-und-grsr-revisionen')
    || url.includes('antworten-auf-kleine-anfragen')
    || url.includes('suche-curia-vista/geschaeft?affairid=municipal')
}

const MUNICIPAL_THEME_STRONG_KEYWORDS = [
  'tier', 'tierschutz', 'tierwohl', 'tierpark', 'tierversuch', 'wildtier', 'haustier',
  'zoo', 'vogel', 'hund', 'katze', 'fisch', 'jagd',
]

const MUNICIPAL_THEME_CONTEXT_KEYWORDS = [
  'biodivers', 'wald', 'siedlungsgebiet', 'landwirtschaftsgebiet', 'feuerwerk', 'lärm', 'laerm',
]

const CANTONAL_THEME_STRONG_KEYWORDS = [
  'tier', 'tierschutz', 'tierwohl', 'tierhalteverbot', 'nutztier', 'masthuhn', 'geflügel', 'schlacht',
  'tierversuch', '3r', 'wildtier', 'jagd', 'zoo', 'tierpark', 'biodivers', 'artenschutz', 'wolf', 'fuchs',
]

const isCantonalReadableRelevant = (item) => {
  const sid = String(item?.sourceId || '')
  if (!sid.startsWith('ch-cantonal-')) return true
  const title = String(item?.title || '').trim()
  const summary = String(item?.summary || '').trim().toLowerCase()
  const text = `${title}\n${summary}\n${String(item?.body || '')}`.toLowerCase()

  const looksUnreadable =
    /^parlamentsgesch(ä|a)ft\s+/i.test(title)
    || title.toLowerCase().includes('quell-adapter vorbereitet')
    || summary.includes('0 relevante linkziele erkannt')
    || summary.includes('verifying your browser')

  if (looksUnreadable) return false
  return CANTONAL_THEME_STRONG_KEYWORDS.some((kw) => text.includes(kw))
}

const isMunicipalTopicRelevant = (item) => {
  const sid = String(item?.sourceId || '')
  if (!sid.startsWith('ch-municipal-')) return true
  const decisionKey = `${item?.sourceId || ''}:${item?.externalId || ''}`
  const decisionStatus = String(localDecisions?.[decisionKey]?.status || '').toLowerCase()
  const feedbackQueued = String(item?.reviewReason || '').toLowerCase().includes('user-feedback=irrelevant')
  if (feedbackQueued || decisionStatus === 'queued' || decisionStatus === 'new' || decisionStatus === 'rejected') return true
  const text = `${item?.title || ''}\n${item?.summary || ''}\n${item?.body || ''}`.toLowerCase()
  const strongHits = MUNICIPAL_THEME_STRONG_KEYWORDS.filter((kw) => text.includes(kw)).length
  const contextHits = MUNICIPAL_THEME_CONTEXT_KEYWORDS.filter((kw) => text.includes(kw)).length
  return strongHits > 0 || contextHits >= 2
}

const normalizeReviewStatus = (item) => String(item?.status || '')

const baseReviewItems = [...db.items]
  .filter((item) => enabledSourceIds.has(item.sourceId) || String(item.sourceId || '') === 'user-input')
  .filter((item) => {
    const sid = String(item.sourceId || '')
    return sid.startsWith('ch-parliament-') || sid.startsWith('ch-municipal-') || sid.startsWith('ch-cantonal-') || sid === 'user-input'
  })
  .filter((item) => ['new', 'queued'].includes(normalizeReviewStatus(item)))
  .filter((item) => !isMunicipalOverviewNoise(item))
  .filter((item) => isMunicipalTopicRelevant(item))
  .filter((item) => isCantonalReadableRelevant(item))
  .filter((item) => isInTargetHorizon(item))

const affairKey = (item) => {
  const sid = String(item.sourceId || '')
  const external = String(item.externalId || '')
  if (sid.startsWith('ch-parliament-')) return external.split('-')[0] || `${sid}:${external}`
  return `${sid}:${external}`
}
const entryKey = (item) => `${item.sourceId}:${item.externalId}`
const decidedEntryKeys = new Set(Object.keys(localDecisions || {}))
const decidedAffairKeys = new Set(Object.keys(localDecisions || {})
  .map((id) => {
    const externalId = String(id).split(':')[1] || ''
    return String(externalId).split('-')[0]
  })
  .filter(Boolean))

const langRank = (item) => {
  const src = String(item.sourceId || '').toLowerCase()
  if (src.endsWith('-de')) return 0
  if (src.endsWith('-fr')) return 1
  if (src.endsWith('-it')) return 2
  return 3
}

const statusRank = (item) => {
  const s = String(normalizeReviewStatus(item) || '')
  if (s === 'published') return 3
  if (s === 'approved') return 2
  if (s === 'queued' || s === 'new') return 1
  return 0
}

const pickPreferredItem = (next, current) => {
  const betterStatus = statusRank(next) > statusRank(current)
  const betterLang = langRank(next) < langRank(current)
  const betterScore = (next.score ?? 0) > (current.score ?? 0)

  if (betterStatus || (!betterStatus && (betterLang || (!betterLang && betterScore)))) {
    return next
  }
  return current
}

const grouped = new Map()
for (const item of baseReviewItems) {
  const key = affairKey(item)
  const prev = grouped.get(key)
  if (!prev) {
    grouped.set(key, item)
    continue
  }
  grouped.set(key, pickPreferredItem(item, prev))
}

const normalizeForKey = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const extractBusinessNo = (item) => {
  const title = String(item?.title || '').replace(/\s+/g, ' ').trim()
  const fromTitle = title.match(/\b(\d{2}\.\d{2,4})\b/)
  if (fromTitle?.[1]) return fromTitle[1]

  const rawExternal = String(item?.externalId || '').split('-')[0]
  const numericExternal = rawExternal.match(/^(\d{4})(\d{2,4})$/)
  if (numericExternal) {
    const yy = numericExternal[1].slice(2)
    const suffix = String(Number(numericExternal[2]))
    if (suffix && suffix !== 'NaN') return `${yy}.${suffix}`
  }

  return ''
}

const hardDuplicateKey = (item) => {
  const sid = String(item?.sourceId || '')
  if (!sid.startsWith('ch-parliament-')) return `id:${sid}:${item?.externalId || ''}`

  const businessNo = extractBusinessNo(item)
  const normalizedTitle = normalizeForKey(String(item?.title || '').replace(/\b\d{2}\.\d{2,4}\b/g, ''))

  if (businessNo && normalizedTitle) return `hard:${businessNo}|${normalizedTitle}`
  if (businessNo) return `hard:${businessNo}`
  return `id:${sid}:${item?.externalId || ''}`
}

const hardGrouped = new Map()
for (const item of grouped.values()) {
  const key = hardDuplicateKey(item)
  const prev = hardGrouped.get(key)
  if (!prev) {
    hardGrouped.set(key, item)
    continue
  }
  hardGrouped.set(key, pickPreferredItem(item, prev))
}


const isLikelyPoliticalVorstoss = (item) => {
  const text = `${item?.title || ''}
${item?.summary || ''}
${item?.body || ''}`.toLowerCase()
  if (/\d{2}\.\d{3,4}/.test(text)) return true
  return /(vorstoss|geschäftsnummer|geschaeftsnummer|motion|postulat|interpellation|anfrage|initiative|parlamentarische initiative|standesinitiative)/i.test(text)
}


const effectiveReviewScore = (item) => {
  const raw = Number(item?.score || 0)
  if (String(item?.sourceId || '') === 'ch-cantonal-portal-core' && !isLikelyPoliticalVorstoss(item)) {
    return Math.min(raw, 0.45)
  }
  return raw
}

const isHighConfidenceReview = (item) => {
  const reason = String(item.reviewReason || '').toLowerCase()
  const score = Number(item.score || 0)
  const queued = item.status === 'queued' || item.status === 'new'
  if (!queued) return false
  if (reason.includes('feedback-negative-only') || reason.includes('noise-without-anchor')) return false

  if (String(item.sourceId || '') === 'ch-cantonal-portal-core' && !isLikelyPoliticalVorstoss(item)) return false

  const hasStrongRule = reason.includes('[anchor+score]') || reason.includes('[anchor2+support]') || reason.includes('[feedback-recall]')
  const hasAnchorSignal = /anchor=(?!-)/.test(reason)
  return hasStrongRule && hasAnchorSignal && score >= 0.78
}

const germanParliamentByAffair = new Map(
  [...db.items]
    .filter((it) => String(it?.sourceId || '').startsWith('ch-parliament-') && String(it?.sourceId || '').endsWith('-de'))
    .filter((it) => String(it?.title || '').trim().length > 0)
    .sort((a, b) => Date.parse(String(b?.fetchedAt || b?.publishedAt || 0)) - Date.parse(String(a?.fetchedAt || a?.publishedAt || 0)))
    .map((it) => [String(it?.externalId || '').split('-')[0], it]),
)

const withGermanDisplay = (item) => {
  const sid = String(item?.sourceId || '')
  if (!sid.startsWith('ch-parliament-') || sid.endsWith('-de')) return item
  const affair = String(item?.externalId || '').split('-')[0]
  const de = germanParliamentByAffair.get(affair)
  if (!de) return item
  return {
    ...item,
    displayTitle: String(de?.title || item?.title || ''),
    displaySummary: String(de?.summary || item?.summary || ''),
    displayBody: String(de?.body || item?.body || ''),
    displaySourceLabel: 'Parlament.ch Curia Vista (DE)',
  }
}

const reviewItems = [...hardGrouped.values()]
  .map(withGermanDisplay)
  .sort((a, b) => {
    const aPending = (a.status === 'queued' || a.status === 'new') ? 1 : 0
    const bPending = (b.status === 'queued' || b.status === 'new') ? 1 : 0
    if (bPending !== aPending) return bPending - aPending

    const aFast = isHighConfidenceReview(a) ? 1 : 0
    const bFast = isHighConfidenceReview(b) ? 1 : 0
    if (bFast !== aFast) return bFast - aFast

    const scoreDelta = effectiveReviewScore(b) - effectiveReviewScore(a)
    if (Math.abs(scoreDelta) > 0.0001) return scoreDelta

    const aTs = Date.parse(String(a.publishedAt || a.fetchedAt || '')) || 0
    const bTs = Date.parse(String(b.publishedAt || b.fetchedAt || '')) || 0
    return bTs - aTs
  })

const sourceMap = new Map((db.sources || []).map((s) => [s.id, s.label]))
const SOURCE_LABELS_OBJ = Object.fromEntries([...sourceMap.entries()])

const esc = (v = '') => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
// Status-Summen werden clientseitig aus den aktuell sichtbaren Zeilen berechnet.

const isValidHttpUrl = (value = '') => {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const resolveOriginalUrl = (item) => {
  const meta = item?.meta || {}

  if (item.sourceId?.startsWith('ch-municipal-parliament-bern-zurich')) {
    const guidMatch = String(item.externalId || '').match(/municipal-bern-api-([a-f0-9]{12,})/i)
    if (guidMatch) {
      return `https://stadtrat.bern.ch/de/geschaefte/detail.php?gid=${guidMatch[1]}`
    }
  }

  if (isValidHttpUrl(meta.sourceLink)) {
    const sourceLink = String(meta.sourceLink)
    if (!/geschaefte_data_server\.php/i.test(sourceLink)) return sourceLink
  }

  const extracted = Array.isArray(meta.extractedLinks) ? meta.extractedLinks : []
  const firstExtractedHref = extracted.map((x) => x?.href).find((href) => isValidHttpUrl(href))
  if (firstExtractedHref) return String(firstExtractedHref)

  const body = String(item?.body || '')
  const bodySourceMatch = body.match(/(?:^|\n)Quelle:\s*(https?:\/\/\S+)/i)
  if (bodySourceMatch && isValidHttpUrl(bodySourceMatch[1])) {
    const bodyUrl = String(bodySourceMatch[1])
    if (!/geschaefte_data_server\.php/i.test(bodyUrl)) return bodyUrl
  }

  if (isValidHttpUrl(item.sourceUrl) && !/geschaefte_data_server\.php/i.test(String(item.sourceUrl))) return item.sourceUrl

  if (item.sourceId?.startsWith('ch-parliament-business-')) {
    const affairId = String(item.externalId || '').split('-')[0]
    if (/^\d+$/.test(affairId)) {
      return `https://www.parlament.ch/de/ratsbetrieb/suche-curia-vista/geschaeft?AffairId=${affairId}`
    }
  }

  return ''
}

const clean = (v = '') => String(v).replace(/\s+/g, ' ').trim()

const isGenericStatusSummary = (text = '') => {
  const low = clean(text).toLowerCase()
  return (
    low.includes('stellungnahme zum vorstoss liegt vor')
    || low.includes('beratung in kommission')
    || low.includes('erledigt')
    || low.includes('fin des discussions en commission')
  )
}

const summarizeForReview = (item) => {
  const title = clean(item.title)
  const summary = clean(item.summary)
  const reason = String(item.reviewReason || '')

  const stance = (reason.match(/stance=([^·]+)/)?.[1] || 'neutral/unklar').trim()
  const anchor = (reason.match(/anchor=([^·]+)/)?.[1] || '').trim().replaceAll('|', ', ')
  const support = (reason.match(/support=([^·]+)/)?.[1] || '').trim().replaceAll('|', ', ')

  if (summary && !isGenericStatusSummary(summary)) return summary

  const topicHint = anchor && anchor !== '-' ? anchor : support && support !== '-' ? support : 'allgemeine Tierpolitik'
  const stanceLabel = stance === 'pro-tierschutz'
    ? 'stellt eher einen positiven Bezug zum Tierschutz her'
    : stance === 'tierschutzkritisch'
      ? 'kann aus Tierschutzsicht kritisch sein'
      : 'hat einen indirekten bzw. unklaren Tierbezug'

  return `Kurzfassung: Das Geschäft behandelt ${topicHint}. Einordnung: Es ${stanceLabel}.`
}

const humanizeReason = (reason = '') => {
  if (!reason) return '-'
  const text = String(reason)

  const rule = (text.match(/\[(.*?)\]/)?.[1] || '').trim()
  const score = (text.match(/score=([0-9.]+)/)?.[1] || '').trim()
  const stance = (text.match(/stance=([^·]+)/)?.[1] || '').trim()
  const anchor = (text.match(/anchor=([^·]+)/)?.[1] || '').trim()
  const support = (text.match(/support=([^·]+)/)?.[1] || '').trim()
  const people = (text.match(/people=([^·]+)/)?.[1] || '').trim()
  const noise = (text.match(/noise=([^·]+)/)?.[1] || '').trim()

  const ruleMap = {
    'anchor+score': 'Klare Tier-Relevanz (Schlüsselbegriffe + Score erfüllt)',
    'anchor2+support': 'Mehrere starke Tier-Begriffe mit zusätzlichem Kontext',
    'whitelist+theme': 'Thematisch relevant und von priorisiertem Parlamentsprofil',
    'missing-anchor': 'Keine klaren Tier-Schlüsselbegriffe gefunden',
    'below-threshold': 'Tierbezug vorhanden, aber Relevanz aktuell zu schwach',
  }

  const toList = (v) => v && v !== '-' ? v.split('|').map((x) => x.trim()).filter(Boolean) : []
  const anchorList = toList(anchor)
  const supportList = toList(support).filter((x) => !anchorList.includes(x))
  const peopleList = toList(people)

  const stanceMap = {
    'pro-tierschutz': 'pro Tierschutz',
    'tierschutzkritisch': 'tierschutzkritisch',
    'neutral/unklar': 'neutral / unklar',
  }

  const parts = []
  if (stance) parts.push(`<div><strong>Einordnung:</strong> ${esc(stanceMap[stance] || stance)}</div>`)
  if (rule) parts.push(`<div><strong>Bewertung:</strong> ${esc(ruleMap[rule] || rule)}</div>`)
  if (anchorList.length) parts.push(`<div><strong>Tier-Begriffe:</strong> ${esc(anchorList.join(', '))}</div>`)
  if (supportList.length) parts.push(`<div><strong>Kontext:</strong> ${esc(supportList.join(', '))}</div>`)
  if (peopleList.length) parts.push(`<div><strong>Priorisierte Profile:</strong> ${esc(peopleList.join(', '))}</div>`)
  if (noise && noise !== '-') parts.push(`<div><strong>Störsignale:</strong> ${esc(noise.replaceAll('|', ', '))}</div>`)
  if (score) parts.push(`<div><strong>Score:</strong> ${esc(score)}</div>`)

  return parts.length ? parts.join('') : esc(text)
}

const fastLaneItems = reviewItems.filter((item) => {
  if (!isHighConfidenceReview(item)) return false
  if (decidedEntryKeys.has(entryKey(item))) return false
  if (decidedAffairKeys.has(affairKey(item))) return false
  return true
})

const fastLaneRows = fastLaneItems.map((item) => {
  const id = `${item.sourceId}:${item.externalId}`
  const scoreValue = effectiveReviewScore(item)
  const isTaggedFastlane = Boolean(fastlaneTags[id]?.fastlane)
  return `<div class="fastlane-card" data-id="${esc(id)}" data-fastlane-tagged="${isTaggedFastlane ? '1' : '0'}">
    <div class="fastlane-head">
      <strong>${esc(item.displayTitle || item.title)}</strong>
      <span class="fastlane-score">${scoreValue.toFixed(2)}</span>
    </div>
    <div class="fastlane-actions">
      <button onclick="setDecision(this,'${esc(id)}','approved')">Approve</button>
      <button onclick="setDecision(this,'${esc(id)}','rejected')">Reject</button>
      <button class="tag-btn" data-tag-btn="${esc(id)}" onclick="toggleFastlaneTag(this,'${esc(id)}')">${isTaggedFastlane ? '⭐ Fastlane' : '☆ Fastlane'}</button>
      <a class="orig-link" href="${esc(resolveOriginalUrl(item) || '#')}" target="_blank" rel="noopener noreferrer">Original</a>
    </div>
  </div>`
}).join('')

const rows = reviewItems.map((item) => {
  const fastLane = isHighConfidenceReview(item)
  const id = `${item.sourceId}:${item.externalId}`
  const displayStatus = normalizeReviewStatus(item)
  const isPending = displayStatus === 'queued' || displayStatus === 'new'
  const pendingBadge = isPending ? '<strong class="pending">offen</strong>' : '<span class="historic">historisch</span>'
  const sourceLabel = esc(item.displaySourceLabel || sourceMap.get(item.sourceId) || item.sourceId)
  const entryType = item.sourceId === 'user-input' || item.sourceId === 'user-feedback' ? 'User-Feedback' : 'Crawler'
  const scoreValue = effectiveReviewScore(item)
  const priorityLabel = fastLane ? 'fast-lane' : (scoreValue >= 0.8 ? 'hoch' : scoreValue >= 0.55 ? 'mittel' : 'niedriger')
  const sourceUrl = resolveOriginalUrl(item)
  const isTaggedFastlane = Boolean(fastlaneTags[id]?.fastlane)
  const originalLink = sourceUrl
    ? `<a class="orig-link" href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">Original-Vorstoss öffnen</a>`
    : '<span class="muted">kein gültiger Link</span>'

  return `
<tr data-id="${esc(id)}" data-status="${esc(displayStatus)}" data-fastlane-tagged="${isTaggedFastlane ? '1' : '0'}" class="${fastLane ? 'row-fastlane' : ''}">
<td>
  <strong>${esc(item.displayTitle || item.title)}</strong><br>
  <small>${esc(summarizeForReview({ ...item, title: item.displayTitle || item.title, summary: item.displaySummary || item.summary, body: item.displayBody || item.body }))}</small><br>
  ${originalLink}
</td>
<td>${entryType}</td>
<td>
  <div>${sourceLabel}</div>
  <small class="muted">${esc(item.sourceId)}</small>
</td>
<td>${scoreValue.toFixed(2)}<br><small class="muted">Priorität: ${priorityLabel}</small>${fastLane ? '<br><small class="fast-lane">⚡ Sehr wahrscheinlich relevant</small>' : ''}${isTaggedFastlane ? '<br><small class="fast-lane">⭐ von dir als Fastlane markiert</small>' : ''}</td>
<td>${esc((item.matchedKeywords || []).join(', '))}</td>
<td>${esc(displayStatus)} (${pendingBadge})</td>
<td><small>${humanizeReason(item.reviewReason || '-')}</small></td>
<td>
<button onclick="setDecision(this,'${esc(id)}','approved')">Approve</button>
<button onclick="setDecision(this,'${esc(id)}','rejected')">Reject</button>
<button class="tag-btn" data-tag-btn="${esc(id)}" onclick="toggleFastlaneTag(this,'${esc(id)}')">${isTaggedFastlane ? '⭐ Fastlane' : '☆ Fastlane'}</button>
</td>
</tr>`
}).join('')

const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Crawler Review</title>
<style>
  body{font-family:Inter,Arial,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px}
  .wrap{max-width:1280px;margin:0 auto}
  h1{margin:0 0 8px}
  p{color:#a9bfd8}
  code{background:#1f2937;border:1px solid #334155;color:#dbeafe;padding:1px 5px;border-radius:6px}
  .links{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
  .links a{display:inline-block;border:1px solid rgba(255,255,255,.18);padding:6px 10px;border-radius:999px;text-decoration:none;color:#dbeafe}
  .status{margin:10px 0 14px;color:#bfdbfe}
  button{margin-right:6px;border:1px solid #4b5563;border-radius:8px;padding:5px 9px;background:#22364f;color:#e8effa;cursor:pointer}
  button:hover{background:#2b4565}
  .export{margin:10px 0 12px}
  table{width:100%;border-collapse:collapse;background:#111827;border:1px solid #334155;border-radius:12px;overflow:hidden}
  td,th{border-bottom:1px solid #1f2937;padding:10px;vertical-align:top;text-align:left}
  th{background:#1b2433;color:#dbeafe;font-weight:700;position:sticky;top:0}
  tr:hover td{background:#172133}
  .orig-link{display:inline-block;margin-top:6px;color:#93c5fd}
  .muted{color:#94a3b8}
  .pending{color:#f59e0b}
  .historic{color:#94a3b8}
  .fast-lane{color:#fbbf24;font-weight:700}
  .row-fastlane td{background:rgba(251,191,36,.08)}
  .fastlane-wrap{margin:12px 0 16px;padding:12px;border:1px solid #475569;border-radius:10px;background:#111827}
  .fastlane-wrap h2{font-size:16px;margin:0 0 10px;color:#fde68a}
  .fastlane-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}
  .fastlane-card{border:1px solid #334155;border-radius:10px;padding:10px;background:#0b1220}
  .fastlane-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
  .fastlane-score{font-weight:700;color:#fde68a}
  .fastlane-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px}
  @media (max-width: 760px){
    body{padding:12px}
    td,th{padding:8px;font-size:13px}
    .fastlane-wrap{position:sticky;top:0;z-index:5}
  }
</style>
</head>
<body>
  <main class="wrap">
    <h1>Review-Ansicht</h1>
    <p>Diese Ansicht zeigt strikt nur <strong>offene</strong> Einträge (queued/new). Bereits bearbeitete Einträge findest du unter <a href="/review-history.html">Review-History</a>. Wenn ein Vorstoss in mehreren Sprachen vorliegt, wird bevorzugt die <strong>deutsche Version</strong> angezeigt.</p>
    <p class="status" id="status-summary">Status-Summen (sichtbar): queued=0, approved=0, published=0</p>
    <nav class="links"><a href="/">Zur App</a><a href="/user-input.html">User-Input</a><a href="/review-history.html">Review-History</a></nav>
    <p id="decision-status" class="muted" aria-live="polite"></p>
    ${fastLaneRows ? `<section class="fastlane-wrap">
      <h2>⚡ Fast-Lane</h2>
      <div class="fastlane-grid">${fastLaneRows}</div>
    </section>` : ''}
    <table>
      <thead>
        <tr>
          <th>Titel</th>
          <th>Typ</th>
          <th>Quelle</th>
          <th>Score</th>
          <th>Treffer</th>
          <th>Status</th>
          <th>Warum relevant / nicht</th>
          <th>Aktion</th>
        </tr>
      </thead>
      <tbody><tr><td colspan="8">Lade aktuelle Review-Daten…</td></tr></tbody>
    </table>
  </main>
<script>
const key='tierpolitik.review';
const fastlaneTagKey='tierpolitik.review.fastlaneTags';
const initialFastlaneTags=${JSON.stringify(fastlaneTags)};
const API_BASE=(window.__REVIEW_API_BASE__||'/.netlify/functions').replace(/\\/$/,'');
const SOURCE_LABELS=${JSON.stringify(SOURCE_LABELS_OBJ)};
const FALLBACK_ROWS_HTML=${JSON.stringify(rows || '<tr><td colspan="8">Keine Einträge.</td></tr>')};
const escHtml=(v)=>String(v??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');
const normalizeStatus=(s='')=>{ const x=String(s||'').toLowerCase(); return (x==='new'||x==='queued'||x==='approved'||x==='rejected'||x==='published')?x:'queued'; };
const shortSummary=(item)=>{ const raw=String(item.summary || item.body || '').replaceAll('\\n',' ').replaceAll('\\t',' '); return raw.replace(/ +/g,' ').trim().slice(0,220); };
const humanize=(reason='')=>String(reason||'').split('·').join(' | ').replace(/stance=/gi,'Haltung: ').replace(/keyword-match=/gi,'Keywords: ').replace(/signal-match=/gi,'Signal: ').replace(/source-signal=/gi,'Quelle: ').replace(/no-tier-signal/gi,'kein Tierbezug').trim() || '-';

function renderRowsFromItems(items){
  const tbody=document.querySelector('tbody');
  if(!tbody) return;
  if(!Array.isArray(items) || !items.length){
    tbody.innerHTML='<tr><td colspan="8">Keine Einträge.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map((item)=>{
    const id = item.id || ((item.sourceId||'') + ':' + (item.externalId||''));
    const st = normalizeStatus(item.status);
    const pending = (st==='queued'||st==='new');
    const pendingBadge = pending ? '<strong class="pending">offen</strong>' : '<span class="historic">historisch</span>';
    const score = Number(item.score||0);
    const sourceLabel = SOURCE_LABELS[item.sourceId] || item.sourceId || 'Quelle';
    const sourceUrl = item.sourceUrl || '';
    const link = sourceUrl ? '<a class="orig-link" href="' + escHtml(sourceUrl) + '" target="_blank" rel="noopener noreferrer">Original-Vorstoss öffnen</a>' : '<span class="muted">kein gültiger Link</span>';
    return '<tr data-id="' + escHtml(id) + '" data-status="' + escHtml(st) + '" data-fastlane-tagged="0">'
      + '<td><strong>' + escHtml(item.title||'') + '</strong><br><small>' + escHtml(shortSummary(item)) + '</small><br>' + link + '</td>'
      + '<td>Crawler</td>'
      + '<td><div>' + escHtml(sourceLabel) + '</div><small class="muted">' + escHtml(item.sourceId||'') + '</small></td>'
      + '<td>' + score.toFixed(2) + '</td>'
      + '<td>' + escHtml((item.matchedKeywords||[]).join(', ')) + '</td>'
      + '<td>' + escHtml(st) + ' (' + pendingBadge + ')</td>'
      + '<td><small>' + escHtml(humanize(item.reviewReason||'')) + '</small></td>'
      + '<td><button onclick="setDecision(this,\\\'' + escHtml(id) + '\\\',\\\'approved\\\')">Approve</button>'
      + '<button onclick="setDecision(this,\\\'' + escHtml(id) + '\\\',\\\'rejected\\\')">Reject</button>'
      + '<button class="tag-btn" data-tag-btn="' + escHtml(id) + '" onclick="toggleFastlaneTag(this,\\\'' + escHtml(id) + '\\\')">☆ Fastlane</button></td>'
      + '</tr>';
  }).join('');
}

async function loadReviewItemsFromDb(){
  try{
    const res=await fetch(API_BASE + '/review-items?limit=1000',{headers:{accept:'application/json'}});
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data=await res.json().catch(()=>null);
    if(!data?.ok || !Array.isArray(data.items)) throw new Error('invalid payload');
    renderRowsFromItems(data.items);
  }catch{
    const tbody=document.querySelector('tbody');
    if (tbody) tbody.innerHTML = FALLBACK_ROWS_HTML;
  }
}

const read=()=>JSON.parse(localStorage.getItem(key)||'{}');
const write=(v)=>localStorage.setItem(key,JSON.stringify(v,null,2));
const readFastlaneTags=()=>{
  const local = JSON.parse(localStorage.getItem(fastlaneTagKey)||'{}');
  return { ...initialFastlaneTags, ...local };
};
const writeFastlaneTags=(v)=>localStorage.setItem(fastlaneTagKey,JSON.stringify(v));
async function postJson(path,payload){
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  let data = null
  try { data = await res.json() } catch {}
  if (!res.ok || data?.ok === false) throw new Error(data?.error || ('HTTP ' + res.status))
  return data || { ok: true }
}


let activeRowIndex = 0;

function allRows(){
  return [...document.querySelectorAll('tbody tr[data-id]')].filter((r)=>r.style.display !== 'none')
}

function setActiveRow(index){
  const rows = allRows()
  if (!rows.length) return
  activeRowIndex = Math.max(0, Math.min(index, rows.length - 1))
  rows.forEach((r,i)=>{
    r.style.outline = i === activeRowIndex ? '2px solid #60a5fa' : ''
    r.style.outlineOffset = i === activeRowIndex ? '-2px' : ''
  })
  rows[activeRowIndex].scrollIntoView({ block: 'nearest' })
}

function focusActiveRow(){
  const row = currentRow()
  if (!row) return
  row.setAttribute('tabindex','-1')
  row.focus({ preventScroll: true })
}

function currentRow(){
  const rows = allRows()
  if (!rows.length) return null
  if (activeRowIndex >= rows.length) activeRowIndex = rows.length - 1
  return rows[activeRowIndex]
}

function actCurrent(action){
  const row = currentRow()
  if (!row) return
  const id = row.getAttribute('data-id')
  if (!id) return
  if (action === 'approve') return setDecision(null, id, 'approved')
  if (action === 'reject') return setDecision(null, id, 'rejected')
  if (action === 'fastlane') return toggleFastlaneTag(null, id)
}

function keyboardHandler(e){
  const tag = (e.target && e.target.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return
  if (tag === 'button' && (e.key === ' ' || e.key === 'Enter')) return

  if (e.key === 'j') { e.preventDefault(); setActiveRow(activeRowIndex + 1); return }
  if (e.key === 'k' || e.key === 'l') { e.preventDefault(); setActiveRow(activeRowIndex - 1); return }
  if (e.key === 'a') { e.preventDefault(); actCurrent('approve'); return }
  if (e.key === 'r') { e.preventDefault(); actCurrent('reject'); return }
  if (e.key === 'f') { e.preventDefault(); actCurrent('fastlane'); return }
}

function updateStatusSummary(){
  const stats = { queued: 0, approved: 0, published: 0 }
  let visibleRows = 0
  document.querySelectorAll('tr[data-id]').forEach((row)=>{
    const hidden = row.style.display === 'none'
    if (hidden) return
    visibleRows += 1
    const status = row.getAttribute('data-status')
    if (status && status in stats) stats[status] += 1
  })
  const el = document.getElementById('status-summary')
  if (el) {
    el.textContent = 'Status-Summen (sichtbar): queued=' + stats.queued + ', approved=' + stats.approved + ', published=' + stats.published
    if (visibleRows === 0) el.textContent += ' · keine offenen Einträge'
  }
}

function hideDecidedRows(){
  const decisions = read();
  const rows = [...document.querySelectorAll('tr[data-id]')]
  const decidedById = {}

  const localAffairDecided = new Set(Object.entries(decisions)
    .filter(([id, d]) => String(id).startsWith('ch-parliament-') && d && d.storage === 'server')
    .map(([id]) => {
      const external = String(id).split(':')[1] || ''
      return String(external).split('-')[0]
    })
    .filter(Boolean))

  rows.forEach((row)=>{
    const id = row.getAttribute('data-id');
    if (!id) return
    const status = row.getAttribute('data-status') || ''
    const serverDecided = status !== 'queued' && status !== 'new'
    const localDecided = Boolean(decisions[id] && decisions[id].storage === 'server')
    const isParliamentEntry = String(id).startsWith('ch-parliament-')
    const affairId = isParliamentEntry ? (String(id).split(':')[1] || '').split('-')[0] : ''
    const localAffairHit = Boolean(affairId) && localAffairDecided.has(affairId)
    const decided = serverDecided || localDecided || localAffairHit
    decidedById[id] = decided
    row.style.display = decided ? 'none' : ''
  });

  document.querySelectorAll('.fastlane-card[data-id]').forEach((card)=>{
    const id = card.getAttribute('data-id')
    if (!id) return
    const decided = Boolean(decidedById[id]) || Boolean(decisions[id])
    card.style.display = decided ? 'none' : ''
  })

  updateStatusSummary();
}

function resetLocalReviewState(){
  localStorage.removeItem(key)
  localStorage.removeItem(fastlaneTagKey)
  const statusEl = document.getElementById('decision-status')
  if (statusEl) statusEl.textContent = 'Lokale Entscheidungen/Fastlane-Tags zurückgesetzt.'
  hideDecidedRows()
}

function renderFastlaneTagButton(id){
  const tags = readFastlaneTags();
  const isTagged = Boolean(tags[id]?.fastlane);
  document.querySelectorAll('[data-tag-btn="' + id + '"]').forEach((btn)=>{
    btn.textContent = isTagged ? '⭐ Fastlane' : '☆ Fastlane';
  });
}

async function toggleFastlaneTag(btn,id){
  const tags = readFastlaneTags();
  const next = !Boolean(tags[id]?.fastlane);
  const taggedAt = new Date().toISOString();
  if (btn) btn.disabled = true;

  try {
    await postJson('/review-fastlane-tag', { id, fastlane: next, taggedAt })
    tags[id] = { fastlane: next, taggedAt, storage: 'server' };
  } catch {
    tags[id] = { fastlane: next, taggedAt, storage: 'local-only' };
  }

  writeFastlaneTags(tags);
  renderFastlaneTagButton(id);

  const row = document.querySelector('tr[data-id="' + id + '"]');
  if (row) row.setAttribute('data-fastlane-tagged', next ? '1' : '0');
  const card = document.querySelector('.fastlane-card[data-id="' + id + '"]');
  if (card) card.setAttribute('data-fastlane-tagged', next ? '1' : '0');

  if (btn) btn.disabled = false;
}

const API_BASE='/.netlify/functions';
const FETCH_TIMEOUT_MS = 12000;

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS){
  const ctrl = new AbortController()
  const t = setTimeout(()=>ctrl.abort(new Error('timeout')), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

async function postJson(path,payload, retries = 1){
  let lastErr = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchWithTimeout(API_BASE + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      let data = null
      try { data = await res.json() } catch {}
      if (!res.ok || data?.ok === false) throw new Error(data?.error || ('HTTP ' + res.status))
      return data || { ok: true }
    } catch (err) {
      lastErr = err
      if (attempt >= retries) break
      await new Promise((resolve)=>setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
  throw lastErr || new Error('postJson failed')
}

async function getJson(path, retries = 1){
  let lastErr = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchWithTimeout(API_BASE + path, { headers: { accept: 'application/json' } })
      let data = null
      try { data = await res.json() } catch {}
      if (!res.ok || data?.ok === false) throw new Error(data?.error || ('HTTP ' + res.status))
      return data || { ok: true }
    } catch (err) {
      lastErr = err
      if (attempt >= retries) break
      await new Promise((resolve)=>setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
  throw lastErr || new Error('getJson failed')
}

async function verifyDecisionInDb(id, expectedStatus){
  const data = await getJson('/review-status?id=' + encodeURIComponent(id))
  const saved = String(data?.status || '').toLowerCase()
  return saved === String(expectedStatus || '').toLowerCase()
}

async function persistDecisionWithRetry(id, status, decidedAt, retries = 2){
  let attempt = 0
  let lastErr = null
  while (attempt <= retries) {
    try {
      await postJson('/review-decision', { id, status, decidedAt })
      const ok = await verifyDecisionInDb(id, status)
      if (!ok) throw new Error('verify-mismatch')
      return true
    } catch (err) {
      lastErr = err
      if (attempt >= retries) break
      const delayMs = 300 * Math.pow(2, attempt)
      await new Promise((resolve)=>setTimeout(resolve, delayMs))
      attempt += 1
    }
  }
  throw lastErr || new Error('persist-failed')
}

async function setDecision(btn,id,status){
  const decidedAt = new Date().toISOString();
  const statusEl = document.getElementById('decision-status');
  if (statusEl) statusEl.textContent = 'Speichere Entscheidung…';

  if (btn) btn.disabled = true;

  const row = document.querySelector('tr[data-id="' + id + '"]');
  if (row) row.style.opacity = '0.72'

  const s=read();
  s[id]={status,decidedAt,storage:'pending-sync'};
  write(s);

  try {
    await persistDecisionWithRetry(id, status, decidedAt, 2)
    const x=read();
    x[id]={status,decidedAt,storage:'server'};
    write(x);

    if (row) {
      row.setAttribute('data-status', status)
      row.style.opacity = ''
      if (!showDecided) row.style.display='none'
    }
    const card = document.querySelector('.fastlane-card[data-id="' + id + '"]');
    if (card) card.style.display = 'none'
    updateStatusSummary();
    if (statusEl) statusEl.textContent = 'DB confirmed ✅';
  } catch (err) {
    const x=read();
    x[id]={status,decidedAt,storage:'local-only',lastError:String(err && err.message ? err.message : err)};
    write(x);
    if (row) row.style.opacity = ''
    if (statusEl) statusEl.textContent = 'DB write fehlgeschlagen für ' + id + ' (nicht als entschieden markiert).';
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function syncLocalDecisions(){
  const decisions = read();
  for (const [id, d] of Object.entries(decisions)) {
    if (!id || !d || d.storage === 'server') continue
    try {
      await persistDecisionWithRetry(id, d.status, d.decidedAt || new Date().toISOString(), 1)
      decisions[id] = { ...d, storage: 'server' }
    } catch {
      // keep local-only if sync fails
    }
  }
  write(decisions)
}

function exportDecisions(){
  const blob=new Blob([JSON.stringify(read(),null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='review-decisions.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

for (const id of Object.keys(readFastlaneTags())) renderFastlaneTagButton(id)
document.addEventListener('keydown', keyboardHandler)
window.addEventListener('load', ()=>{ setTimeout(()=>{ setActiveRow(0); focusActiveRow(); }, 0) })
;(async ()=>{
  await syncLocalDecisions()
  await loadReviewItemsFromDb()
  hideDecidedRows()
  setActiveRow(0)
  focusActiveRow()
})();
</script>
</body>
</html>`

fs.writeFileSync(outPath, html)
fs.writeFileSync(reviewDataPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  total: reviewItems.length,
  ids: reviewItems.map((item) => `${item.sourceId}:${item.externalId}`),
}, null, 2))
console.log(`Review-Ansicht gebaut: ${outPath.pathname} (${reviewItems.length} Eintraege)`)
