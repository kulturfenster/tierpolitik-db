"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Section = 'radar' | 'tasks' | 'calendar' | 'agents' | 'projects' | 'content' | 'memory' | 'docs' | 'people' | 'office' | 'health' | 'recipes' | 'fundraising' | 'diary' | 'files'
type EntityType = 'project' | 'content' | 'client' | 'memory' | 'doc' | 'person' | 'office'

type Task = {
  id: string
  title: string
  status: 'open' | 'doing' | 'waiting' | 'done'
  priority: 'low' | 'med' | 'high'
  impact?: 'low' | 'med' | 'high'
  area?: 'medien' | 'politik' | 'buch' | 'ops'
  deadline?: string
  tocAxis?: 'wertschoepfung' | 'weltbild' | 'repraesentation'
  assignee: 'Tobi' | 'ALF' | 'Beide'
}

type Entity = {
  id: string
  type: EntityType
  title: string
  notes?: string
  owner?: 'Tobi' | 'ALF' | 'Beide'
  status?: 'idea' | 'brief' | 'draft' | 'review' | 'approved' | 'published' | 'repurposed'
  kpis?: string
  tocAxis?: 'wertschoepfung' | 'weltbild' | 'repraesentation'
}

type RadarItem = {
  id: string
  title: string
  source: string
  url: string
  lane: 'medienarbeit' | 'politik' | 'buchprojekt'
  kind: 'news' | 'vorstoss' | 'kampagne' | 'analyse'
  score: number
  impact: 'low' | 'med' | 'high'
  urgency: 'low' | 'med' | 'high'
  tocAxis?: 'wertschoepfung' | 'weltbild' | 'repraesentation'
  status: 'new' | 'accepted' | 'watchlist' | 'rejected'
}

type RadarStats = { total: number; accepted: number; watchlist: number; rejected: number; fresh: number; highScore: number; lanePolitik: number; laneMedien: number; laneBuch: number }

type SomedayItem = {
  id: string
  fileName: string
  title: string
  description?: string
  status?: string
  impact?: string
  effort?: string
  tags?: string[]
}

type CronJob = {
  id: string
  name: string
  agentId?: string | null
  enabled: boolean
  scheduleLabel: string
  scheduleKind?: 'every' | 'cron' | null
  scheduleExpr?: string | null
  scheduleTz?: string | null
  scheduleEveryMs?: number | null
  status: string
  cronType?: string | null
  source?: 'openclaw' | 'launchd'
  sessionTarget?: string | null
  wakeMode?: string | null
  payloadKind?: string | null
  payloadMessage?: string | null
  deliveryMode?: string | null
  deliveryChannel?: string | null
  deliveryTo?: string | null
  deliveryTargetLabel?: string | null
  createdAtMs?: number | null
  updatedAtMs?: number | null
  nextRunAtMs: number | null
  nextRunAtIso: string | null
  lastRunAtMs: number | null
  lastRunStatus?: string | null
  lastDurationMs?: number | null
  lastError?: string | null
  consecutiveErrors?: number | null
  lastDelivered?: boolean | null
  lastDeliveryStatus?: string | null
  lastRunReportPath?: string | null
  lastRunSummary?: string | null
  lastRunModel?: string | null
}

type AgentSummary = {
  id: string
  emoji?: string
  model?: string
  purpose: string
  status: 'active' | 'idle' | 'sleeping' | 'bootstrapping'
  heartbeat: string
  lastActiveLabel: string
  sessionsCount: number
  lastWorkedOn: string
  lastSessionKey?: string
}

type FundraisingIdea = {
  id: string
  title: string
  ideaId?: string
  approvedAt?: string
  sourceFile: string
  path: string
}

type DiaryEntry = {
  id: string
  title: string
  date: string
  weekday?: string
  weatherEmoji?: string
  weatherLabel?: string
  path: string
  excerpt: string
  content: string
}

type FilePreviewState = {
  open: boolean
  name?: string
  path?: string
  content?: string
  loading: boolean
  saving?: boolean
  error?: string
  readOnly?: boolean
  renderMarkdown?: boolean
  hidePath?: boolean
}

type KnowledgeEntry = {
  name: string
  path: string
  relPath: string
  group: string
}

type HealthZoneDetail = {
  status?: string
  priority?: string
  side?: string
  symptoms: string[]
  triggers: string[]
  relief: string[]
  tests: string[]
}

type RadarDecisionUndo = {
  id: string
  title: string
  from: RadarItem['status']
  to: RadarItem['status']
}

const maxRadarUndoDepth = 5

function createEmptyRadarStats(): RadarStats {
  return { total: 0, accepted: 0, watchlist: 0, rejected: 0, fresh: 0, highScore: 0, lanePolitik: 0, laneMedien: 0, laneBuch: 0 }
}

function computeRadarStatsFromRows(rows: RadarItem[]): RadarStats {
  return {
    total: rows.length,
    accepted: rows.filter((r) => r.status === 'accepted').length,
    watchlist: rows.filter((r) => r.status === 'watchlist').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    fresh: rows.filter((r) => r.status === 'new').length,
    highScore: rows.filter((r) => r.score >= 80).length,
    lanePolitik: rows.filter((r) => r.lane === 'politik').length,
    laneMedien: rows.filter((r) => r.lane === 'medienarbeit').length,
    laneBuch: rows.filter((r) => r.lane === 'buchprojekt').length,
  }
}

function radarFollowupConfig(item: RadarItem) {
  if (item.lane === 'politik') {
    return {
      taskTitle: `Politik: Vorstoss-Chance prüfen (Kurzbrief) – ${item.title}`,
      taskArea: 'politik' as const,
      entityType: 'doc' as const,
      entityTitle: `Radar-Politik: ${item.title}`,
    }
  }

  if (item.lane === 'buchprojekt') {
    return {
      taskTitle: `Buchprojekt: Quelle einordnen & Notiz erstellen – ${item.title}`,
      taskArea: 'buch' as const,
      entityType: 'memory' as const,
      entityTitle: `Radar-Quelle Buch: ${item.title}`,
    }
  }

  return {
    taskTitle: `Medienarbeit: Angle-Vorschläge (1-3) – ${item.title}`,
    taskArea: 'medien' as const,
    entityType: 'client' as const,
    entityTitle: `Radar-Story: ${item.title}`,
  }
}

function radarFollowupDeadlineIso(urgency: RadarItem['urgency']) {
  const dueInDays = urgency === 'high' ? 1 : urgency === 'med' ? 3 : 5
  const dueAt = new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000)
  dueAt.setHours(17, 0, 0, 0)
  return dueAt.toISOString()
}

const sectionOrder: Section[] = ['tasks', 'calendar', 'agents', 'content', 'projects', 'docs', 'memory', 'people', 'office', 'health', 'recipes', 'fundraising', 'diary', 'files']

const sectionMeta: Record<Section, { label: string; hint?: string; entityType?: EntityType }> = {
  radar: { label: 'Radar', hint: 'Signale & Entscheide' },
  tasks: { label: 'Heute', hint: 'Top-Prioritäten im Cockpit' },
  calendar: { label: 'Kalender', hint: 'Cron-Jobs der Woche' },
  agents: { label: 'Agents', hint: 'Zweck, Status, letzter Arbeitskontext' },
  content: { label: 'Content Factory', hint: 'Discord-first (Planung im Cockpit)', entityType: 'content' },
  projects: { label: 'Strategie & Projekte', hint: 'Roadmap / Prioritäten', entityType: 'project' },
  docs: { label: 'Politik', hint: 'Vorstösse / Agenda', entityType: 'doc' },
  memory: { label: 'Wissen & Notizen', hint: 'Privat + Arbeit', entityType: 'memory' },
  people: { label: 'Stakeholder', hint: 'Personen / Rollen', entityType: 'person' },
  office: { label: 'Archiv & Backoffice', hint: 'Ablage / Nebenaufgaben', entityType: 'office' },
  health: { label: 'Health', hint: 'Obsidian/Physio Problemzonen' },
  recipes: { label: 'Rezepte', hint: 'Sammlung + visuelle Karten' },
  fundraising: { label: 'Fundraising', hint: 'Gespeicherte Ideen mit Approval' },
  diary: { label: 'Tagebuch', hint: 'Tägliche strukturierte Zusammenfassungen' },
  files: { label: 'Files', hint: 'Wichtige Dateien & Scripts' },
}

const importantFiles = [
  {
    group: 'Ops · OpenClaw Backup & Migration',
    items: [
      {
        name: 'backup-openclaw.ps1',
        note: 'Windows-Backup (inkl. ~/.openclaw, Metadaten, ZIP)',
        path: 'C:/Users/yokim/.openclaw/workspace/scripts/openclaw-backup/backup-openclaw.ps1',
      },
      {
        name: 'restore-openclaw-on-mac.sh',
        note: 'Restore auf macOS aus Backup-ZIP oder entpacktem Ordner',
        path: 'C:/Users/yokim/.openclaw/workspace/scripts/openclaw-backup/restore-openclaw-on-mac.sh',
      },
      {
        name: 'README.md (Backup)',
        note: 'Schnellanleitung Backup -> Mac Restore',
        path: 'C:/Users/yokim/.openclaw/workspace/scripts/openclaw-backup/README.md',
      },
      {
        name: 'TIF-Setup Lokales Modell (Mac mini)',
        note: 'Mehruser-Betrieb: 1x lokaler Model-Server, getrennte OpenClaw-Instanzen',
        path: 'C:/Users/yokim/.openclaw/workspace/TIF-Setup-Lokales-Modell-Mehruser-Mac-mini.md',
      },
      {
        name: 'Recherche SAUGUT / Suisseporcs (Bernhard)',
        note: 'Andreas & Simon Bernhard + kampagnenrelevante Angriffsflächen mit Quellen',
        path: 'C:/Users/yokim/.openclaw/workspace/SAUGUT-Suisseporcs-Andreas-Simon-Bernhard-Recherche.md',
      },
    ],
  },
  {
    group: 'Stallbrände Schweiz',
    items: [
      {
        name: 'Dashboard v0',
        note: 'Live-Dashboard (Heatmap + SVG-Karte + Tierzahlen-KPIs)',
        path: 'C:/Users/yokim/.openclaw/workspace/PARA/Projects/Stallbraende-Schweiz/public/dashboard-stallbraende.v0.html',
        href: 'http://192.168.50.219:3020/stallbraende-dashboard',
      },
      {
        name: 'Review v0',
        note: 'Review-UI mit accept/reject/needs-info',
        path: 'C:/Users/yokim/.openclaw/workspace/PARA/Projects/Stallbraende-Schweiz/public/review-stallbraende.v0.html',
        href: 'http://192.168.50.219:3020/stallbraende',
      },
      {
        name: 'animal-estimates.v0.json',
        note: 'min/realistisch/max + QA-Status (pending-review/manual-confirmed)',
        path: 'C:/Users/yokim/.openclaw/workspace/PARA/Projects/Stallbraende-Schweiz/data/stallbraende/animal-estimates.v0.json',
      },
      {
        name: 'animal-reports.inbox.txt',
        note: 'Text-Inbox für manuelle Nachmeldungen (Link/PDF + Zahlen)',
        path: 'C:/Users/yokim/.openclaw/workspace/PARA/Projects/Stallbraende-Schweiz/data/stallbraende/animal-reports.inbox.txt',
      },
    ],
  },
  {
    group: 'Cockpit',
    items: [
      {
        name: 'ABKUERZUNGEN.md',
        note: 'Chat-Kurzformen (z. B. j/y = ja, n = nein)',
        path: 'C:/Users/yokim/.openclaw/workspace/ABKUERZUNGEN.md',
      },
      {
        name: 'DB (single source of truth)',
        note: 'Projekte, Tasks, Entities',
        path: 'C:/Users/yokim/.openclaw/workspace/cockpit/data/db.json',
      },
      {
        name: 'UI (diese App)',
        note: 'Navigation, Radar, Files-Ansicht',
        path: 'C:/Users/yokim/.openclaw/workspace/cockpit/app/ui.tsx',
      },
    ],
  },
  {
    group: 'ALF · System & Profil',
    items: [
      {
        name: 'SOUL.md',
        note: 'Wie ich arbeite und antworte (Persona/Vibe)',
        path: 'C:/Users/yokim/.openclaw/workspace/SOUL.md',
      },
      {
        name: 'USER.md',
        note: 'Was ich über dich weiss (Präferenzen & Arbeitsmodus)',
        path: 'C:/Users/yokim/.openclaw/workspace/USER.md',
      },
      {
        name: 'MEMORY.md',
        note: 'Langzeit-Memory (kuratierte Fakten/Kontext)',
        path: 'C:/Users/yokim/.openclaw/workspace/MEMORY.md',
      },
      {
        name: 'IDENTITY.md',
        note: 'Meine Identität (Name/Charakter-Basis)',
        path: 'C:/Users/yokim/.openclaw/workspace/IDENTITY.md',
      },
    ],
  },
]

const pScore = { high: 3, med: 2, low: 1 }
const radarStatusPriority = { new: 4, watchlist: 3, accepted: 2, rejected: 1 }
const radarDedupeStatusPriority = { accepted: 4, watchlist: 3, new: 2, rejected: 1 }

function radarLeverageRank(item: RadarItem) {
  return pScore[item.urgency] * 1_000 + pScore[item.impact] * 100 + item.score
}

function pickTopActionableRadar(rows: RadarItem[]) {
  const actionable = rows.filter((r) => r.status === 'new' || r.status === 'watchlist')
  if (actionable.length === 0) return null

  return [...actionable].sort((a, b) => {
    const leverageDelta = radarLeverageRank(b) - radarLeverageRank(a)
    if (leverageDelta !== 0) return leverageDelta
    return a.title.localeCompare(b.title, 'de-CH')
  })[0]
}

function parseTaskDeadlineMs(deadline: string | undefined) {
  if (!deadline) return Number.NaN

  const dateOnlyMatch = deadline.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnlyMatch) {
    const [, yearRaw, monthRaw, dayRaw] = dateOnlyMatch
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    const day = Number(dayRaw)

    const localEndOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)
    if (localEndOfDay.getFullYear() !== year || localEndOfDay.getMonth() !== month - 1 || localEndOfDay.getDate() !== day) {
      return Number.NaN
    }

    return localEndOfDay.getTime()
  }

  return new Date(deadline).getTime()
}

function formatTaskDeadline(deadline: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    const [year, month, day] = deadline.split('-')
    return `${day}.${month}.${year}`
  }

  const parsed = new Date(deadline)
  if (Number.isNaN(parsed.getTime())) return deadline
  return parsed.toLocaleString('de-CH')
}

function taskDeadlinePressure(task: Task, nowMs: number) {
  if (!task.deadline || task.status === 'done') return 0

  const deadlineMs = parseTaskDeadlineMs(task.deadline)
  if (!Number.isFinite(deadlineMs)) return 0

  if (deadlineMs < nowMs) return 3
  if (deadlineMs - nowMs <= 24 * 60 * 60 * 1000) return 2
  if (deadlineMs - nowMs <= 3 * 24 * 60 * 60 * 1000) return 1
  return 0
}

function taskExecutionRank(task: Task, nowMs: number) {
  const doingScore = task.status === 'doing' ? 10_000 : 0
  const deadlineScore = taskDeadlinePressure(task, nowMs) * 1_000
  const impactScore = pScore[task.impact || 'med'] * 100
  const priorityScore = pScore[task.priority] * 10

  return doingScore + deadlineScore + impactScore + priorityScore
}

function parseSomedayScale(value: string | undefined, fallback = 2) {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()

  if (normalized.startsWith('h')) return 3
  if (normalized.startsWith('m')) return 2
  if (normalized.startsWith('l')) return 1

  return fallback
}

function somedayExecutionRank(item: SomedayItem) {
  const impactScore = parseSomedayScale(item.impact, 2) * 1_000
  const effortScore = (4 - parseSomedayScale(item.effort, 2)) * 100
  const hasDescriptionScore = item.description ? 20 : 0

  return impactScore + effortScore + hasDescriptionScore
}

const sectionStorageKey = 'missionControl.section'
const taskCacheStorageKey = 'missionControl.tasks.cache.v1'
const entityCacheStorageKey = 'missionControl.entities.cache.v1'
const radarCacheStorageKey = 'missionControl.radar.cache.v1'
const radarRequestTimeoutMs = 12_000
const boardRequestTimeoutMs = 10_000
const radarActionTimeoutMs = 8_000
const taskActionTimeoutMs = 20_000
const taskActionRetryDelayMs = 550
const taskActionMaxRetries = 1
const radarActionRetryDelayMs = 650
const radarActionMaxRetries = 1
const followupActionRetryDelayMs = 700
const followupActionMaxRetries = 1
const somedayActionTimeoutMs = 8_000
const somedayActionRetryDelayMs = 650
const somedayActionMaxRetries = 1
const radarAutoRefreshCooldownMs = 10_000
const boardAutoRefreshCooldownMs = 10_000
const radarRetryBaseMs = 2_500
const radarMaxAutoRetries = 2
const boardLoadRetryDelayMs = 450
const boardLoadMaxRetries = 1
const radarFutureSkewToleranceMs = 5 * 60_000
const radarStaleThresholdMinutes = 15
const radarDedupedCountDriftTolerance = 1

function radarMaxAcceptedFutureMs() {
  return Date.now() + radarFutureSkewToleranceMs
}
const radarUnsafeSourceTooltip = 'Quelle ist ungültig oder unsicher und wurde blockiert'
const radarOfflineRefreshError = 'Offline: Radar kann ohne Internet nicht aktualisiert werden.'
const filePreviewOfflineLoadError = 'Offline: Datei-Vorschau kann ohne Netzwerk nicht geladen werden.'
const filePreviewOfflineInterruptedError = 'Offline: Datei-Vorschau wurde unterbrochen. Bitte erneut versuchen, sobald die Verbindung zurück ist.'
const filePreviewOfflineSaveInterruptedError = 'Offline: Speichern wurde unterbrochen. Bitte erneut speichern, sobald die Verbindung zurück ist.'
const radarTimeoutError = 'Radar-Antwort zu langsam. Letzte Daten bleiben sichtbar.'
const radarUnavailableError = 'Radar temporär nicht verfügbar. Letzte Daten bleiben sichtbar.'
const radarMaxUrlLength = 2_048
const radarMaxHostnameLength = 253
const radarMaxPathnameLength = 1_500
const radarMaxSearchLength = 512
const radarMaxHashLength = 128
const radarMaxIdLength = 160
const radarMaxTitleLength = 280
const radarMaxSourceLength = 120
const radarUrlWhitespacePattern = /\s/
const radarUrlControlCharPattern = /[\u0000-\u001F\u007F]/
const radarTextControlCharPattern = /[\u0000-\u001F\u007F]/
const radarIdUnsafePattern = /\s|[\u0000-\u001F\u007F]/
const radarHostnameDotAnomalyPattern = /^\.|\.$|\.\./
const radarHostnameControlCharPattern = /[\u0000-\u001F\u007F]/
const radarHostnameLabelPattern = /^[a-z0-9-]+$/
const radarPortPattern = /^[0-9]{1,5}$/
const radarMinPort = 1
const radarMaxPort = 65_535
const radarIpv4OctetMin = 0
const radarIpv4OctetMax = 255
const radarPrivate10FirstOctet = 10
const radarCarrierNat100FirstOctet = 100
const radarLoopback127FirstOctet = 127
const radarLinkLocal169FirstOctet = 169
const radarPrivate172FirstOctet = 172
const radarPrivate172SecondOctetMin = 16
const radarPrivate172SecondOctetMax = 31
const radarCarrierNat100SecondOctetMin = 64
const radarCarrierNat100SecondOctetMax = 127
const radarBenchmark198FirstOctet = 198
const radarMulticast224FirstOctet = 224
const radarBenchmark198SecondOctetMin = 18
const radarBenchmark198SecondOctetMax = 19
const radarPrivate192FirstOctet = 192
const radarLocalhostHostname = 'localhost'
const radarLocalDomainSuffix = '.local'
const radarIpv4Pattern = /^(\d{1,3})(?:\.(\d{1,3})){3}$/
const radarLinkLocal169SecondOctet = 254
const radarPrivate192SecondOctet = 168

function isValidRadarHostnameSyntax(hostname: string) {
  if (!hostname || hostname.length > radarMaxHostnameLength) return false

  const labels = hostname.split('.')
  if (labels.length === 0) return false

  for (const label of labels) {
    if (!label) return false
    if (label.length > 63) return false
    if (!radarHostnameLabelPattern.test(label)) return false
    if (label.startsWith('-') || label.endsWith('-')) return false
  }

  return true
}

function isPrivateRadarHostname(hostname: string) {
  if (hostname === radarLocalhostHostname || hostname.endsWith(radarLocalDomainSuffix)) return true

  if (!radarIpv4Pattern.test(hostname)) return false

  const octets = hostname.split('.').map((part) => Number(part))
  if (octets.some((octet) => !Number.isInteger(octet) || octet < radarIpv4OctetMin || octet > radarIpv4OctetMax)) return true

  const [a, b] = octets
  if (a === 0) return true
  if (a === radarPrivate10FirstOctet) return true
  if (a === radarLoopback127FirstOctet) return true
  if (a === radarLinkLocal169FirstOctet && b === radarLinkLocal169SecondOctet) return true
  if (a === radarPrivate172FirstOctet && b >= radarPrivate172SecondOctetMin && b <= radarPrivate172SecondOctetMax) return true
  if (a === radarPrivate192FirstOctet && b === radarPrivate192SecondOctet) return true
  if (a === radarCarrierNat100FirstOctet && b >= radarCarrierNat100SecondOctetMin && b <= radarCarrierNat100SecondOctetMax) return true
  if (a === radarBenchmark198FirstOctet && b >= radarBenchmark198SecondOctetMin && b <= radarBenchmark198SecondOctetMax) return true
  if (a >= radarMulticast224FirstOctet) return true

  return false
}

function normalizeTitle(value: string | undefined) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('de-CH')
}

function normalizeRadarHostname(value: string) {
  let host = value.toLowerCase()

  while (/^(www|m|mobile|amp)\./i.test(host)) {
    host = host.replace(/^(www|m|mobile|amp)\./i, '')
  }

  return host
}

function normalizeComparableUrl(value: string | undefined) {
  if (!value) return ''

  try {
    const parsed = new URL(value.trim())
    parsed.hash = ''

    const trackingKeys = new Set([
      'fbclid',
      'gclid',
      'igshid',
      'mc_cid',
      'mc_eid',
      'mkt_tok',
      'ref',
      'ref_src',
      'si',
      'spm',
      'utm_campaign',
      'utm_content',
      'utm_id',
      'utm_medium',
      'utm_name',
      'utm_source',
      'utm_term',
      'wt_mc',
    ])

    for (const key of [...parsed.searchParams.keys()]) {
      const normalized = key.toLowerCase()
      if (normalized.startsWith('utm_') || trackingKeys.has(normalized)) {
        parsed.searchParams.delete(key)
      }
    }

    parsed.searchParams.sort()

    const normalizedHost = normalizeRadarHostname(parsed.hostname)
    const isDefaultPort = (parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')
    const normalizedPort = parsed.port && !isDefaultPort ? `:${parsed.port}` : ''

    const normalizedPath = (() => {
      const collapsed = parsed.pathname.replace(/\/{2,}/g, '/')
      const withoutIndex = collapsed.replace(/\/(index\.(html?|php))$/i, '/')
      return withoutIndex === '/' ? '' : withoutIndex.replace(/\/$/, '')
    })()

    const normalizedBase = `${normalizedHost}${normalizedPort}${normalizedPath}${parsed.search}`.toLowerCase()
    const isHttpLikeProtocol = parsed.protocol === 'http:' || parsed.protocol === 'https:'

    return isHttpLikeProtocol ? normalizedBase : `${parsed.protocol}//${normalizedBase}`
  } catch {
    return value.trim().toLowerCase().replace(/\/$/, '')
  }
}

function parseSafeRadarUrl(value: string): URL | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed || trimmed.length > radarMaxUrlLength) return null
  if (radarUrlWhitespacePattern.test(trimmed)) return null
  if (radarUrlControlCharPattern.test(trimmed)) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const hostname = parsed.hostname.toLowerCase()
    if (!hostname) return null
    if (radarHostnameDotAnomalyPattern.test(hostname)) return null
    if (radarHostnameControlCharPattern.test(hostname)) return null
    if (!isValidRadarHostnameSyntax(hostname)) return null
    if (isPrivateRadarHostname(hostname)) return null
    if (parsed.pathname.length > radarMaxPathnameLength) return null
    if (parsed.search.length > radarMaxSearchLength) return null
    if (parsed.hash.length > radarMaxHashLength) return null
    if (parsed.username || parsed.password) return null
    if (parsed.port) {
      if (!radarPortPattern.test(parsed.port)) return null
      const port = Number(parsed.port)
      if (!Number.isInteger(port) || port < radarMinPort || port > radarMaxPort) return null
    }
    return parsed
  } catch {
    return null
  }
}

function isSafeRadarHttpUrl(value: string) {
  return parseSafeRadarUrl(value) !== null
}

function normalizedRadarDomain(value: string | undefined) {
  if (!value) return ''

  try {
    return normalizeRadarHostname(new URL(value.trim()).hostname)
  } catch {
    return ''
  }
}

function radarSearchHaystack(item: RadarItem) {
  const normalizedUrl = normalizeComparableUrl(item.url)
  const normalizedUrlText = normalizedUrl
    .replace(/[/?#&=._:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalizeTitle(
    `${item.title} ${item.source} ${item.kind} ${item.lane} ${item.tocAxis || ''} ${normalizedRadarDomain(item.url)} ${normalizedUrlText}`,
  )
}

const radarStatusFilterStorageKey = 'missionControl.radar.statusFilter'
const radarLaneFilterStorageKey = 'missionControl.radar.laneFilter'
const radarQueryStorageKey = 'missionControl.radar.query'
const radarLeverageFilterStorageKey = 'missionControl.radar.leverageOnly'
const radarSortModeStorageKey = 'missionControl.radar.sortMode'
const defaultRadarStatusFilter: 'all' | 'actionable' | 'new' | 'watchlist' | 'accepted' | 'rejected' = 'actionable'

function radarUpdatedAtMs(item: RadarItem) {
  const updatedAt = (item as { updatedAt?: unknown }).updatedAt
  if (typeof updatedAt !== 'string') return Number.NEGATIVE_INFINITY

  const parsedMs = new Date(updatedAt).getTime()
  return Number.isFinite(parsedMs) ? parsedMs : Number.NEGATIVE_INFINITY
}

function dedupeRadarItems(rows: RadarItem[]): RadarItem[] {
  const bestByKey = new Map<string, RadarItem>()

  for (const item of rows) {
    const urlKey = normalizeComparableUrl(item.url)
    const titleKey = normalizeTitle(item.title)
    const sourceKey = normalizeTitle(item.source)
    const domainKey = normalizedRadarDomain(item.url)
    const titleFallbackKey = titleKey
      ? `${titleKey}::${domainKey || sourceKey || 'unknown-source'}`
      : ''
    const dedupeKey = urlKey || titleFallbackKey || `id::${item.id}`
    const existing = bestByKey.get(dedupeKey)

    if (!existing) {
      bestByKey.set(dedupeKey, item)
      continue
    }

    const existingRank =
      radarDedupeStatusPriority[existing.status] * 10_000 +
      pScore[existing.urgency] * 100 +
      pScore[existing.impact] * 10 +
      existing.score
    const nextRank =
      radarDedupeStatusPriority[item.status] * 10_000 +
      pScore[item.urgency] * 100 +
      pScore[item.impact] * 10 +
      item.score

    if (nextRank > existingRank) {
      bestByKey.set(dedupeKey, item)
      continue
    }

    if (nextRank === existingRank) {
      const existingSafe = isSafeRadarHttpUrl(existing.url)
      const nextSafe = isSafeRadarHttpUrl(item.url)

      if (nextSafe && !existingSafe) {
        bestByKey.set(dedupeKey, item)
        continue
      }

      if (existingSafe && !nextSafe) {
        continue
      }

      if (radarUpdatedAtMs(item) > radarUpdatedAtMs(existing)) {
        bestByKey.set(dedupeKey, item)
      }
    }
  }

  return [...bestByKey.values()]
}

function sanitizeTaskCacheRows(rows: unknown): Task[] {
  if (!Array.isArray(rows)) return []

  const allowedStatus = new Set<Task['status']>(['open', 'doing', 'waiting', 'done'])
  const allowedPriority = new Set<Task['priority']>(['low', 'med', 'high'])
  const allowedImpact = new Set<NonNullable<Task['impact']>>(['low', 'med', 'high'])
  const allowedArea = new Set<NonNullable<Task['area']>>(['medien', 'politik', 'buch', 'ops'])
  const allowedAxis = new Set<NonNullable<Task['tocAxis']>>(['wertschoepfung', 'weltbild', 'repraesentation'])
  const allowedAssignee = new Set<Task['assignee']>(['Tobi', 'ALF', 'Beide'])

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const task = row as Partial<Task>

      if (typeof task.id !== 'string' || typeof task.title !== 'string') return null
      if (!allowedStatus.has(task.status as Task['status'])) return null
      if (!allowedPriority.has(task.priority as Task['priority'])) return null
      if (!allowedAssignee.has(task.assignee as Task['assignee'])) return null

      return {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        impact: allowedImpact.has(task.impact as NonNullable<Task['impact']>) ? task.impact : undefined,
        area: allowedArea.has(task.area as NonNullable<Task['area']>) ? task.area : undefined,
        deadline: typeof task.deadline === 'string' ? task.deadline : undefined,
        tocAxis: allowedAxis.has(task.tocAxis as NonNullable<Task['tocAxis']>) ? task.tocAxis : undefined,
        assignee: task.assignee,
      } as Task
    })
    .filter((task): task is Task => task !== null)
}

function sanitizeEntityRows(rows: unknown): Entity[] {
  if (!Array.isArray(rows)) return []

  const allowedType = new Set<EntityType>(['project', 'content', 'client', 'memory', 'doc', 'person', 'office'])
  const allowedOwner = new Set<NonNullable<Entity['owner']>>(['Tobi', 'ALF', 'Beide'])
  const allowedStatus = new Set<NonNullable<Entity['status']>>(['idea', 'brief', 'draft', 'review', 'approved', 'published', 'repurposed'])
  const allowedAxis = new Set<NonNullable<Entity['tocAxis']>>(['wertschoepfung', 'weltbild', 'repraesentation'])

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const entity = row as Partial<Entity>

      if (typeof entity.id !== 'string' || typeof entity.title !== 'string') return null
      if (!allowedType.has(entity.type as EntityType)) return null

      return {
        id: entity.id,
        type: entity.type,
        title: entity.title,
        notes: typeof entity.notes === 'string' ? entity.notes : undefined,
        owner: allowedOwner.has(entity.owner as NonNullable<Entity['owner']>) ? entity.owner : undefined,
        status: allowedStatus.has(entity.status as NonNullable<Entity['status']>) ? entity.status : undefined,
        kpis: typeof entity.kpis === 'string' ? entity.kpis : undefined,
        tocAxis: allowedAxis.has(entity.tocAxis as NonNullable<Entity['tocAxis']>) ? entity.tocAxis : undefined,
      } as Entity
    })
    .filter((entity): entity is Entity => entity !== null)
}

function readTaskCache(): Task[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(taskCacheStorageKey)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    return sanitizeTaskCacheRows(parsed)
  } catch {
    return []
  }
}

function readEntityCache(): Partial<Record<EntityType, Entity[]>> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(entityCacheStorageKey)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<Record<EntityType, Entity[]>> = {}

    for (const entityType of ['project', 'content', 'client', 'memory', 'doc', 'person', 'office'] as const) {
      out[entityType] = sanitizeEntityRows(parsed?.[entityType])
    }

    return out
  } catch {
    return {}
  }
}

function persistEntityCache(cacheByType: Partial<Record<EntityType, Entity[]>>) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(entityCacheStorageKey, JSON.stringify(cacheByType))
  } catch {
    // ignore cache write failures (private mode / quota)
  }
}

function persistTaskCache(rows: Task[]) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(taskCacheStorageKey, JSON.stringify(rows))
  } catch {
    // ignore cache write failures (private mode / quota)
  }
}

function sanitizeRadarCacheRows(rows: unknown): RadarItem[] {
  if (!Array.isArray(rows)) return []

  const allowedLane = new Set<RadarItem['lane']>(['medienarbeit', 'politik', 'buchprojekt'])
  const allowedKind = new Set<RadarItem['kind']>(['news', 'vorstoss', 'kampagne', 'analyse'])
  const allowedImpact = new Set<RadarItem['impact']>(['low', 'med', 'high'])
  const allowedUrgency = new Set<RadarItem['urgency']>(['low', 'med', 'high'])
  const allowedStatus = new Set<RadarItem['status']>(['new', 'accepted', 'watchlist', 'rejected'])
  const allowedAxis = new Set<NonNullable<RadarItem['tocAxis']>>(['wertschoepfung', 'weltbild', 'repraesentation'])

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const item = row as Partial<RadarItem>

      if (typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.source !== 'string' || typeof item.url !== 'string') {
        return null
      }

      const id = item.id.trim().slice(0, radarMaxIdLength)
      const title = item.title.trim().replace(/\s+/g, ' ').slice(0, radarMaxTitleLength)
      const source = item.source.trim().replace(/\s+/g, ' ').slice(0, radarMaxSourceLength)
      const url = item.url.trim()

      if (!id || !title || !source || !url) return null
      if (radarIdUnsafePattern.test(id)) return null
      if (radarTextControlCharPattern.test(title) || radarTextControlCharPattern.test(source)) return null
      if (url.length > radarMaxUrlLength) return null
      if (radarUrlWhitespacePattern.test(url)) return null
      if (radarUrlControlCharPattern.test(url)) return null
      if (!isSafeRadarHttpUrl(url)) return null

      if (!allowedLane.has(item.lane as RadarItem['lane'])) return null
      if (!allowedKind.has(item.kind as RadarItem['kind'])) return null
      if (!allowedImpact.has(item.impact as RadarItem['impact'])) return null
      if (!allowedUrgency.has(item.urgency as RadarItem['urgency'])) return null
      if (!allowedStatus.has(item.status as RadarItem['status'])) return null

      const rawUpdatedAt = (item as { updatedAt?: unknown }).updatedAt
      const parsedUpdatedAtMs = typeof rawUpdatedAt === 'string' ? new Date(rawUpdatedAt).getTime() : Number.NaN
      const updatedAt = Number.isFinite(parsedUpdatedAtMs) ? new Date(parsedUpdatedAtMs).toISOString() : undefined

      return {
        ...item,
        id,
        title,
        source,
        url,
        updatedAt,
        score: Math.max(0, Math.min(100, Math.round(Number(item.score) || 0))),
        tocAxis: allowedAxis.has(item.tocAxis as NonNullable<RadarItem['tocAxis']>) ? item.tocAxis : undefined,
      } as RadarItem
    })
    .filter((item): item is RadarItem => item !== null)
}

function sanitizeRadarStats(stats: unknown, fallbackRows: RadarItem[]): RadarStats {
  if (fallbackRows.length === 0) {
    return createEmptyRadarStats()
  }

  if (!stats || typeof stats !== 'object') return computeRadarStatsFromRows(fallbackRows)

  const parsed = stats as Partial<RadarStats>
  const asNonNegativeInt = (value: unknown) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric < 0) return 0
    return Math.floor(numeric)
  }

  const sanitized: RadarStats = {
    total: asNonNegativeInt(parsed.total),
    accepted: asNonNegativeInt(parsed.accepted),
    watchlist: asNonNegativeInt(parsed.watchlist),
    rejected: asNonNegativeInt(parsed.rejected),
    fresh: asNonNegativeInt(parsed.fresh),
    highScore: asNonNegativeInt(parsed.highScore),
    lanePolitik: asNonNegativeInt(parsed.lanePolitik),
    laneMedien: asNonNegativeInt(parsed.laneMedien),
    laneBuch: asNonNegativeInt(parsed.laneBuch),
  }

  // Corrupted or legacy cache payloads can contain stale/invalid stats despite valid rows.
  // In that case rebuild stats from rows so offline Cockpit stays trustworthy.
  if (fallbackRows.length > 0) {
    const expectedStats = computeRadarStatsFromRows(fallbackRows)

    if (
      sanitized.total !== expectedStats.total ||
      sanitized.accepted !== expectedStats.accepted ||
      sanitized.watchlist !== expectedStats.watchlist ||
      sanitized.rejected !== expectedStats.rejected ||
      sanitized.fresh !== expectedStats.fresh ||
      sanitized.highScore !== expectedStats.highScore ||
      sanitized.lanePolitik !== expectedStats.lanePolitik ||
      sanitized.laneMedien !== expectedStats.laneMedien ||
      sanitized.laneBuch !== expectedStats.laneBuch
    ) {
      return expectedStats
    }
  }

  return sanitized
}

function deriveRadarLastUpdatedAt(rows: RadarItem[]) {
  let latestMs = Number.NEGATIVE_INFINITY
  const maxAcceptedFutureMs = radarMaxAcceptedFutureMs()

  for (const row of rows) {
    const updatedAt = (row as { updatedAt?: unknown }).updatedAt
    if (typeof updatedAt !== 'string') continue

    const ts = new Date(updatedAt).getTime()
    if (!Number.isFinite(ts) || ts > maxAcceptedFutureMs) continue
    if (ts > latestMs) latestMs = ts
  }

  return Number.isFinite(latestMs) ? new Date(latestMs).toISOString() : null
}

function readRadarCache(): { rows: RadarItem[]; stats: RadarStats; lastUpdatedAt: string | null; dedupedCount: number } | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(radarCacheStorageKey)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    const sanitizedRows = sanitizeRadarCacheRows(parsed?.rows)
    const dedupedRows = dedupeRadarItems(sanitizedRows)
    const computedDedupedCount = Math.max(0, sanitizedRows.length - dedupedRows.length)
    const dedupedCountRaw = Number(parsed?.dedupedCount)
    const parsedDedupedCount =
      Number.isFinite(dedupedCountRaw) && dedupedCountRaw >= 0
        ? Math.min(Math.floor(dedupedCountRaw), sanitizedRows.length)
        : Number.NaN
    const dedupedCountDrift = Math.abs(parsedDedupedCount - computedDedupedCount)
    const dedupedCount =
      Number.isFinite(parsedDedupedCount) && dedupedCountDrift <= radarDedupedCountDriftTolerance
        ? parsedDedupedCount
        : computedDedupedCount
    const parsedLastUpdatedAtMs =
      typeof parsed?.lastUpdatedAt === 'string' ? new Date(parsed.lastUpdatedAt).getTime() : Number.NaN
    const maxAcceptedFutureMs = radarMaxAcceptedFutureMs()
    const lastUpdatedAt =
      Number.isFinite(parsedLastUpdatedAtMs) && parsedLastUpdatedAtMs <= maxAcceptedFutureMs
        ? new Date(parsedLastUpdatedAtMs).toISOString()
        : deriveRadarLastUpdatedAt(dedupedRows)

    return {
      rows: dedupedRows,
      stats: sanitizeRadarStats(parsed?.stats, dedupedRows),
      lastUpdatedAt,
      dedupedCount,
    }
  } catch {
    try {
      window.localStorage.removeItem(radarCacheStorageKey)
    } catch {
      // ignore cache cleanup failures
    }
    return null
  }
}

function persistRadarCache(rows: RadarItem[], stats: RadarStats, lastUpdatedAt: string | null, dedupedCount: number) {
  if (typeof window === 'undefined') return

  const safeDedupedCount = Math.min(rows.length, Math.max(0, Math.floor(dedupedCount)))

  try {
    window.localStorage.setItem(
      radarCacheStorageKey,
      JSON.stringify({ rows, stats, lastUpdatedAt, dedupedCount: safeDedupedCount }),
    )
  } catch {
    // ignore cache write failures (private mode / quota)
  }
}

function isSection(value: string | null): value is Section {
  if (!value) return false
  return Object.prototype.hasOwnProperty.call(sectionMeta, value)
}

function safeGetLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetLocalStorage(key: string, value: string) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore storage write failures (private mode / quota / denied storage)
  }
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal })

    if (!response.ok) {
      let errorDetails = ''

      try {
        const payload = (await response.clone().json()) as { error?: unknown; message?: unknown }
        if (typeof payload?.error === 'string' && payload.error.trim()) errorDetails = payload.error.trim()
        else if (typeof payload?.message === 'string' && payload.message.trim()) errorDetails = payload.message.trim()
      } catch {
        // ignore non-JSON error payloads
      }

      const suffix = errorDetails ? ` (${errorDetails})` : ''
      throw new Error(`Request failed: ${response.status}${suffix}`)
    }

    try {
      return (await response.json()) as T
    } catch {
      throw new Error('Ungültige JSON-Antwort vom Server')
    }
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
  const upstreamSignal = init.signal

  const onUpstreamAbort = () => controller.abort()

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort()
    } else {
      upstreamSignal.addEventListener('abort', onUpstreamAbort, { once: true })
    }
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timeoutId)
    if (upstreamSignal) {
      upstreamSignal.removeEventListener('abort', onUpstreamAbort)
    }
  }
}

function parseFailedRequestStatus(error: unknown) {
  if (!(error instanceof Error)) return null
  const match = error.message.match(/^Request failed:\s*(\d+)/)
  if (!match) return null
  const status = Number(match[1])
  return Number.isFinite(status) ? status : null
}

function isRetryableBoardLoadError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof TypeError) return true

  const status = parseFailedRequestStatus(error)
  return status === 408 || status === 425 || status === 429 || (typeof status === 'number' && status >= 500)
}

async function fetchJsonWithTransientRetry<T>(url: string, timeoutMs: number) {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= boardLoadMaxRetries; attempt += 1) {
    try {
      return await fetchJsonWithTimeout<T>(url, timeoutMs)
    } catch (error) {
      lastError = error

      const shouldRetry =
        attempt < boardLoadMaxRetries &&
        isRetryableBoardLoadError(error) &&
        (typeof navigator === 'undefined' || navigator.onLine)

      if (!shouldRetry) {
        throw error
      }

      await wait(boardLoadRetryDelayMs)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed')
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function isRetryableRadarPatchStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function isRetryableRadarPatchError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof TypeError) return true
  return false
}

function isRetryableTaskPatchStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function isRetryableTaskPatchError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof TypeError) return true
  return false
}

function isRetryableSomedayActionStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function isRetryableSomedayActionError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof TypeError) return true
  return false
}

async function runSomedayActionWithRetry(url: string, init: RequestInit, errorMessage: string) {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= somedayActionMaxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, somedayActionTimeoutMs)
      if (response.ok) return response

      const shouldRetry =
        attempt < somedayActionMaxRetries &&
        isRetryableSomedayActionStatus(response.status) &&
        (typeof navigator === 'undefined' || navigator.onLine)

      if (!shouldRetry) {
        throw new Error(errorMessage)
      }

      await wait(somedayActionRetryDelayMs)
    } catch (error) {
      lastError = error

      const shouldRetry =
        attempt < somedayActionMaxRetries &&
        isRetryableSomedayActionError(error) &&
        (typeof navigator === 'undefined' || navigator.onLine)

      if (!shouldRetry) {
        throw error instanceof Error ? error : new Error(errorMessage)
      }

      await wait(somedayActionRetryDelayMs)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(errorMessage)
}

async function patchTaskStatusWithRetry(id: string, status: Task['status']) {
  const requestInit: RequestInit = {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  }

  let lastError: unknown = null

  for (let attempt = 0; attempt <= taskActionMaxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`/api/tasks/${id}`, requestInit, taskActionTimeoutMs)
      if (response.ok) return response

      const shouldRetry =
        attempt < taskActionMaxRetries &&
        isRetryableTaskPatchStatus(response.status) &&
        (typeof navigator === 'undefined' || navigator.onLine)

      if (!shouldRetry) {
        throw new Error('Status konnte nicht gespeichert werden.')
      }

      await wait(taskActionRetryDelayMs)
    } catch (error) {
      lastError = error

      const shouldRetry =
        attempt < taskActionMaxRetries &&
        isRetryableTaskPatchError(error) &&
        (typeof navigator === 'undefined' || navigator.onLine)

      if (!shouldRetry) {
        throw error
      }

      await wait(taskActionRetryDelayMs)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Status konnte nicht gespeichert werden.')
}

async function patchRadarStatusWithRetry(id: string, status: RadarItem['status']) {
  const requestInit: RequestInit = {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  }

  let lastError: unknown = null

  for (let attempt = 0; attempt <= radarActionMaxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`/api/radar/${id}`, requestInit, radarActionTimeoutMs)
      if (response.ok) return response

      const retryableStatus = isRetryableRadarPatchStatus(response.status)
      const shouldRetry = attempt < radarActionMaxRetries && retryableStatus && (typeof navigator === 'undefined' || navigator.onLine)

      if (!shouldRetry) {
        throw new Error('Radar-Status konnte nicht gespeichert werden.')
      }

      await wait(radarActionRetryDelayMs)
    } catch (error) {
      lastError = error
      const shouldRetry =
        attempt < radarActionMaxRetries &&
        isRetryableRadarPatchError(error) &&
        (typeof navigator === 'undefined' || navigator.onLine)

      if (!shouldRetry) {
        throw error
      }

      await wait(radarActionRetryDelayMs)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Radar-Status konnte nicht gespeichert werden.')
}

async function fetchWithRetry(url: string, init: RequestInit, timeoutMs: number, errorMessage: string) {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= followupActionMaxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs)
      if (response.ok) return response

      const shouldRetry =
        attempt < followupActionMaxRetries &&
        isRetryableRadarPatchStatus(response.status) &&
        (typeof navigator === 'undefined' || navigator.onLine)

      if (!shouldRetry) {
        throw new Error(errorMessage)
      }

      await wait(followupActionRetryDelayMs)
    } catch (error) {
      lastError = error

      const shouldRetry =
        attempt < followupActionMaxRetries &&
        isRetryableRadarPatchError(error) &&
        (typeof navigator === 'undefined' || navigator.onLine)

      if (!shouldRetry) {
        throw error instanceof Error ? error : new Error(errorMessage)
      }

      await wait(followupActionRetryDelayMs)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(errorMessage)
}

export default function ClientBoard() {
  const [section, setSection] = useState<Section>(() => {
    const savedSection = safeGetLocalStorage(sectionStorageKey)
    return isSection(savedSection) ? savedSection : 'tasks'
  })

  const cachedTasks = useMemo(() => readTaskCache(), [])
  const cachedEntitiesByType = useMemo(() => readEntityCache(), [])
  const cachedRadar = useMemo(() => readRadarCache(), [])

  const [tasks, setTasks] = useState<Task[]>(() => cachedTasks)
  const [entities, setEntities] = useState<Entity[]>(() => cachedEntitiesByType.project || [])
  const [boardError, setBoardError] = useState<string | null>(null)
  const [taskActionPending, setTaskActionPending] = useState<Record<string, boolean>>({})
  const [entityActionPending, setEntityActionPending] = useState<Record<string, boolean>>({})
  const [radar, setRadar] = useState<RadarItem[]>(() => cachedRadar?.rows || [])
  const radarRef = useRef<RadarItem[]>(cachedRadar?.rows || [])
  const [radarStats, setRadarStats] = useState<RadarStats>(() => cachedRadar?.stats || createEmptyRadarStats())
  const [radarActionPending, setRadarActionPending] = useState<Record<string, boolean>>({})
  const [radarPendingTargetStatus, setRadarPendingTargetStatus] = useState<Record<string, RadarItem['status']>>({})
  const [radarActionError, setRadarActionError] = useState<string | null>(null)
  const [radarLoading, setRadarLoading] = useState(false)
  const [tasksLoading, setTasksLoading] = useState(false)
  const [entitiesLoading, setEntitiesLoading] = useState(false)
  const [radarError, setRadarError] = useState<string | null>(null)
  const [radarDedupedCount, setRadarDedupedCount] = useState(() => cachedRadar?.dedupedCount || 0)
  const [radarRetryScheduledAt, setRadarRetryScheduledAt] = useState<number | null>(null)
  const [isOffline, setIsOffline] = useState(() => (typeof navigator === 'undefined' ? false : !navigator.onLine))
  const [radarLastUpdatedAt, setRadarLastUpdatedAt] = useState<string | null>(() => cachedRadar?.lastUpdatedAt || null)
  const [radarStatusFilter, setRadarStatusFilter] = useState<'all' | 'actionable' | 'new' | 'watchlist' | 'accepted' | 'rejected'>(() => {
    const saved = safeGetLocalStorage(radarStatusFilterStorageKey)
    return saved === 'all' || saved === 'actionable' || saved === 'new' || saved === 'watchlist' || saved === 'accepted' || saved === 'rejected'
      ? saved
      : defaultRadarStatusFilter
  })
  const [radarLaneFilter, setRadarLaneFilter] = useState<'all' | 'medienarbeit' | 'politik' | 'buchprojekt'>(() => {
    const saved = safeGetLocalStorage(radarLaneFilterStorageKey)
    return saved === 'medienarbeit' || saved === 'politik' || saved === 'buchprojekt' ? saved : 'all'
  })
  const [radarQuery, setRadarQuery] = useState(() => safeGetLocalStorage(radarQueryStorageKey) || '')
  const [radarLeverageOnly, setRadarLeverageOnly] = useState(() => safeGetLocalStorage(radarLeverageFilterStorageKey) === '1')
  const [radarSortMode, setRadarSortMode] = useState<'status' | 'leverage'>(() => {
    const saved = safeGetLocalStorage(radarSortModeStorageKey)
    return saved === 'leverage' ? 'leverage' : 'status'
  })
  const [nowTick, setNowTick] = useState(() => Date.now())
  const radarLoadSeq = useRef(0)
  const radarAbortRef = useRef<AbortController | null>(null)
  const radarSearchInputRef = useRef<HTMLInputElement | null>(null)
  const knowledgeSearchInputRef = useRef<HTMLInputElement | null>(null)
  const radarPendingIdsRef = useRef<Set<string>>(new Set())
  const radarAutoRefreshAtRef = useRef(0)
  const radarRetryCountRef = useRef(0)
  const radarRetryTimerRef = useRef<number | null>(null)
  const radarDeferredDecisionRef = useRef<{ id: string; status: RadarItem['status'] } | null>(null)
  const topTaskShortcutCandidateRef = useRef<Task | null>(null)
  const topDoingTaskShortcutCandidateRef = useRef<Task | null>(null)
  const topSomedayShortcutCandidateRef = useRef<SomedayItem | null>(null)
  const quickAcceptCandidateRef = useRef<RadarItem | null>(null)
  const [radarDeferredDecision, setRadarDeferredDecision] = useState<{ id: string; status: RadarItem['status']; title: string } | null>(null)
  const [radarDecisionUndoStack, setRadarDecisionUndoStack] = useState<RadarDecisionUndo[]>([])
  const latestRadarDecision = radarDecisionUndoStack[0] || null
  const tasksLoadSeq = useRef(0)
  const entitiesLoadSeq = useRef(0)
  const somedayLoadSeq = useRef(0)
  const cronLoadSeq = useRef(0)
  const knowledgeLoadSeq = useRef(0)
  const agentsLoadSeq = useRef(0)
  const cronLoadingRef = useRef(false)
  const tasksLoadingRef = useRef(false)
  const entitiesLoadingRef = useRef(false)
  const somedayLoadingRef = useRef(false)
  const radarLoadingRef = useRef(false)
  const knowledgeLoadingRef = useRef(false)
  const agentsLoadingRef = useRef(false)
  const filePreviewAbortRef = useRef<AbortController | null>(null)
  const filePreviewSaveAbortRef = useRef<AbortController | null>(null)
  const filePreviewLoadingPathRef = useRef<string | null>(null)
  const filePreviewLoadSeq = useRef(0)
  const entitiesCacheRef = useRef<Partial<Record<EntityType, Entity[]>>>(cachedEntitiesByType)
  const tasksAutoRefreshAtRef = useRef(0)
  const calendarAutoRefreshAtRef = useRef(0)
  const entitiesAutoRefreshAtRef = useRef(0)
  const knowledgeAutoRefreshAtRef = useRef(0)
  const taskActionPendingRef = useRef<Record<string, boolean>>({})
  const somedayBusyIdRef = useRef<string | null>(null)
  const entityActionPendingRef = useRef<Record<string, boolean>>({})
  const canSaveFilePreviewRef = useRef(false)
  const sectionNavRefs = useRef<Partial<Record<Section, HTMLButtonElement | null>>>({})

  const [tocAxis, setTocAxis] = useState<'wertschoepfung' | 'weltbild' | 'repraesentation'>('weltbild')
  const [filter] = useState<'all' | 'Tobi' | 'ALF' | 'Beide'>('all')
  const [somedayItems, setSomedayItems] = useState<SomedayItem[]>([])
  const [somedayLoading, setSomedayLoading] = useState(false)
  const [somedayError, setSomedayError] = useState<string | null>(null)
  const [somedayBusyId, setSomedayBusyId] = useState<string | null>(null)
  const [somedayTagFilter, setSomedayTagFilter] = useState<string>('all')
  const [filePreview, setFilePreview] = useState<FilePreviewState>({ open: false, loading: false })
  const [fileDraft, setFileDraft] = useState('')
  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>([])
  const [knowledgeQuery, setKnowledgeQuery] = useState('')
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null)
  const [healthZoneDetails, setHealthZoneDetails] = useState<Record<string, HealthZoneDetail>>({})
  const [healthZoneLoading, setHealthZoneLoading] = useState<Record<string, boolean>>({})
  const [cronJobs, setCronJobs] = useState<CronJob[]>([])
  const [cronLoading, setCronLoading] = useState(false)
  const [cronError, setCronError] = useState<string | null>(null)
  const [cronTypeFilter, setCronTypeFilter] = useState<string>('all')
  const [cronSortMode, setCronSortMode] = useState<'time' | 'type'>('time')
  const [selectedCronJob, setSelectedCronJob] = useState<{ job: CronJob; runAtMs: number | null } | null>(null)
  const [cronFixPendingJobId, setCronFixPendingJobId] = useState<string | null>(null)
  const [cronRunPendingJobId, setCronRunPendingJobId] = useState<string | null>(null)
  const [cronPausePendingJobId, setCronPausePendingJobId] = useState<string | null>(null)
  const [cronDeletePendingJobId, setCronDeletePendingJobId] = useState<string | null>(null)
  const [cronSummaryModal, setCronSummaryModal] = useState<{ title: string; text: string } | null>(null)
  const [agentsSummary, setAgentsSummary] = useState<AgentSummary[]>([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [agentsError, setAgentsError] = useState<string | null>(null)
  const [agentsControlPending, setAgentsControlPending] = useState<string | null>(null)
  const [agentsControlError, setAgentsControlError] = useState<string | null>(null)
  const [fundraisingIdeas, setFundraisingIdeas] = useState<FundraisingIdea[]>([])
  const [fundraisingLoading, setFundraisingLoading] = useState(false)
  const [fundraisingError, setFundraisingError] = useState<string | null>(null)
  const [fundraisingDeletePending, setFundraisingDeletePending] = useState<string | null>(null)
  const [fundraisingSelectedIndex, setFundraisingSelectedIndex] = useState(0)
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([])
  const [diaryLoading, setDiaryLoading] = useState(false)
  const [diaryError, setDiaryError] = useState<string | null>(null)
  const [diaryQuery, setDiaryQuery] = useState('')
  const [diarySelectedIndex, setDiarySelectedIndex] = useState(0)

  function isOfflineClient() {
    return typeof navigator !== 'undefined' && !navigator.onLine
  }

  async function loadSomeday() {
    if (somedayLoadingRef.current) return

    const loadSeq = somedayLoadSeq.current + 1
    somedayLoadSeq.current = loadSeq
    somedayLoadingRef.current = true

    if (isOfflineClient()) {
      if (loadSeq !== somedayLoadSeq.current) return
      setSomedayLoading(false)
      setSomedayError(null)
      somedayLoadingRef.current = false
      return
    }

    setSomedayLoading(true)
    try {
      const rows = await fetchJsonWithTransientRetry<SomedayItem[]>('/api/someday', boardRequestTimeoutMs)
      if (loadSeq !== somedayLoadSeq.current) return
      setSomedayItems(Array.isArray(rows) ? rows : [])
      setSomedayError(null)
    } catch {
      if (loadSeq !== somedayLoadSeq.current) return
      setSomedayError('Someday-Liste konnte nicht geladen werden.')
    } finally {
      if (loadSeq === somedayLoadSeq.current) {
        setSomedayLoading(false)
        somedayLoadingRef.current = false
      }
    }
  }

  async function promoteSomeday(item: SomedayItem, removeSource = false) {
    if (somedayBusyId) return
    setSomedayBusyId(item.id)
    try {
      await runSomedayActionWithRetry(
        '/api/someday/promote',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: item.id, removeSource }),
        },
        'Someday konnte nicht zur Taskliste übernommen werden.',
      )
      await Promise.all([loadTasks(), loadSomeday()])
      setBoardError(null)
    } catch {
      setBoardError('Someday konnte nicht zur Taskliste übernommen werden.')
    } finally {
      setSomedayBusyId(null)
    }
  }

  async function deleteSomeday(item: SomedayItem) {
    if (somedayBusyId) return
    setSomedayBusyId(item.id)
    try {
      await runSomedayActionWithRetry(
        `/api/someday/${item.id}`,
        { method: 'DELETE' },
        'Someday-Eintrag konnte nicht gelöscht werden.',
      )
      await loadSomeday()
      setBoardError(null)
    } catch {
      setBoardError('Someday-Eintrag konnte nicht gelöscht werden.')
    } finally {
      setSomedayBusyId(null)
    }
  }

  function canPreviewFile(filePath?: string) {
    if (!filePath) return false
    return /\.(md|txt|json|ya?ml|ps1|sh|ts|tsx|js|mjs|cjs)$/i.test(filePath)
  }


  function parseHealthZoneMarkdown(content: string): HealthZoneDetail {
    const lines = content.split(/\r?\n/)
    const detail: HealthZoneDetail = { symptoms: [], triggers: [], relief: [], tests: [] }

    let currentSection: 'none' | 'symptoms' | 'triggers' | 'tests' = 'none'
    let triggerMode: 'none' | 'bad' | 'good' = 'none'

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue

      const statusMatch = line.match(/^-\s*\*\*Status:\*\*\s*(.+)$/i)
      if (statusMatch) detail.status = statusMatch[1].trim()
      const priorityMatch = line.match(/^-\s*\*\*Priorit[aä]t:\*\*\s*(.+)$/i)
      if (priorityMatch) detail.priority = priorityMatch[1].trim()
      const sideMatch = line.match(/^-\s*\*\*Seite:\*\*\s*(.+)$/i)
      if (sideMatch) detail.side = sideMatch[1].trim()

      if (line.startsWith('## Symptome')) {
        currentSection = 'symptoms'
        triggerMode = 'none'
        continue
      }
      if (line.startsWith('## Trigger')) {
        currentSection = 'triggers'
        triggerMode = 'none'
        continue
      }
      if (line.startsWith('## Tests')) {
        currentSection = 'tests'
        triggerMode = 'none'
        continue
      }
      if (line.startsWith('## ')) {
        currentSection = 'none'
        triggerMode = 'none'
        continue
      }

      if (/^\-\s*\*\*Verschlechtert durch/i.test(line)) {
        triggerMode = 'bad'
        continue
      }
      if (/^\-\s*\*\*Verbessert durch/i.test(line)) {
        triggerMode = 'good'
        continue
      }

      if (/^\-\s+/.test(line) && !/^\-\s*\*\*/.test(line)) {
        const item = line.replace(/^\-\s+/, '').trim()
        if (!item) continue

        if (currentSection === 'symptoms' && detail.symptoms.length < 4) detail.symptoms.push(item)
        if (currentSection === 'triggers') {
          if (triggerMode === 'bad' && detail.triggers.length < 5) detail.triggers.push(item)
          if (triggerMode === 'good' && detail.relief.length < 5) detail.relief.push(item)
        }
        continue
      }

      if (currentSection === 'tests' && (/^\d+\./.test(line) || /^\-\s*\*\*Test/i.test(line))) {
        const cleaned = line.replace(/^\d+\.\s*/, '').replace(/^\-\s*/, '').replace(/\*\*/g, '').trim()
        if (cleaned && detail.tests.length < 4) detail.tests.push(cleaned)
      }
    }

    return detail
  }

  async function loadHealthZoneDetail(zone: KnowledgeEntry) {
    if (healthZoneDetails[zone.path] || healthZoneLoading[zone.path]) return
    setHealthZoneLoading((prev) => ({ ...prev, [zone.path]: true }))
    try {
      const res = await fetchWithTimeout(`/api/files/read?path=${encodeURIComponent(zone.path)}`, { cache: 'no-store' }, boardRequestTimeoutMs)
      const payload = await res.json().catch(() => null)
      if (!res.ok || typeof payload?.content !== 'string') throw new Error('detail load failed')
      const parsed = parseHealthZoneMarkdown(payload.content)
      setHealthZoneDetails((prev) => ({ ...prev, [zone.path]: parsed }))
    } catch {
      setHealthZoneDetails((prev) => ({ ...prev, [zone.path]: { symptoms: [], triggers: [], relief: [], tests: [] } }))
    } finally {
      setHealthZoneLoading((prev) => ({ ...prev, [zone.path]: false }))
    }
  }

  function closeFilePreview() {
    if (filePreview.saving) {
      setFilePreview((prev) => ({
        ...prev,
        error: 'Bitte warten: Datei wird gerade gespeichert und kann noch nicht geschlossen werden.',
      }))
      return
    }

    const hasUnsavedChanges = fileDraft !== (filePreview.content || '')
    if (hasUnsavedChanges) {
      const shouldClose = window.confirm('Ungespeicherte Änderungen verwerfen und Vorschau schliessen?')
      if (!shouldClose) return
    }

    filePreviewLoadSeq.current += 1
    filePreviewAbortRef.current?.abort()
    filePreviewAbortRef.current = null
    filePreviewLoadingPathRef.current = null
    setFileDraft('')
    setFilePreview({ open: false, loading: false })
  }

  async function openFilePreview(name: string, filePath: string, opts?: { readOnly?: boolean; renderMarkdown?: boolean; hidePath?: boolean }) {
    if (!canPreviewFile(filePath)) return
    if (filePreview.open && filePreview.saving) {
      setFilePreview((prev) => ({
        ...prev,
        error: 'Bitte warten: Datei wird noch gespeichert. Danach kann eine andere Datei geöffnet werden.',
      }))
      return
    }
    if (filePreviewLoadingPathRef.current === filePath) return
    if (filePreview.open && !filePreview.loading && filePreview.path === filePath && typeof filePreview.content === 'string') return

    const hasUnsavedChangesInOpenPreview =
      filePreview.open &&
      filePreview.path &&
      filePreview.path !== filePath &&
      !filePreview.saving &&
      fileDraft !== (filePreview.content || '')

    if (hasUnsavedChangesInOpenPreview) {
      const shouldDiscard = window.confirm('Ungespeicherte Änderungen in der geöffneten Datei verwerfen und neue Datei öffnen?')
      if (!shouldDiscard) return
    }

    const loadSeq = filePreviewLoadSeq.current + 1
    filePreviewLoadSeq.current = loadSeq

    if (isOfflineClient()) {
      if (loadSeq !== filePreviewLoadSeq.current) return
      setFilePreview({
        open: true,
        loading: false,
        name,
        path: filePath,
        error: filePreviewOfflineLoadError,
        readOnly: !!opts?.readOnly,
        renderMarkdown: !!opts?.renderMarkdown,
        hidePath: !!opts?.hidePath,
      })
      return
    }

    filePreviewAbortRef.current?.abort()
    const abortController = new AbortController()
    filePreviewAbortRef.current = abortController
    filePreviewLoadingPathRef.current = filePath

    setFilePreview({ open: true, loading: true, name, path: filePath, readOnly: !!opts?.readOnly, renderMarkdown: !!opts?.renderMarkdown, hidePath: !!opts?.hidePath })
    try {
      const res = await fetchWithTimeout(
        `/api/files/read?path=${encodeURIComponent(filePath)}`,
        { cache: 'no-store', signal: abortController.signal },
        boardRequestTimeoutMs,
      )

      let payload: any = null
      try {
        payload = await res.json()
      } catch {
        payload = null
      }

      if (!res.ok) throw new Error(payload?.error || 'Datei konnte nicht geladen werden')
      if (typeof payload?.content !== 'string') throw new Error('Datei-Vorschau enthaelt kein lesbares Textformat')

      if (loadSeq !== filePreviewLoadSeq.current) return
      setFileDraft(payload.content)
      setFilePreview({ open: true, loading: false, name, path: filePath, content: payload.content, readOnly: !!opts?.readOnly, renderMarkdown: !!opts?.renderMarkdown, hidePath: !!opts?.hidePath })
    } catch (error) {
      if (loadSeq !== filePreviewLoadSeq.current) return

      const message =
        error instanceof DOMException && error.name === 'AbortError'
          ? (typeof navigator !== 'undefined' && !navigator.onLine
            ? filePreviewOfflineInterruptedError
            : 'Datei-Vorschau hat zu lange gedauert. Bitte erneut versuchen.')
          : error instanceof Error && error.message
            ? error.message
            : 'Datei konnte nicht geladen werden'

      setFilePreview({ open: true, loading: false, name, path: filePath, error: message, readOnly: !!opts?.readOnly, renderMarkdown: !!opts?.renderMarkdown, hidePath: !!opts?.hidePath })
    } finally {
      if (filePreviewAbortRef.current === abortController) {
        filePreviewAbortRef.current = null
      }
      if (filePreviewLoadingPathRef.current === filePath) {
        filePreviewLoadingPathRef.current = null
      }
    }
  }

  async function saveFilePreview() {
    if (!filePreview.path || filePreview.loading || filePreview.saving || filePreview.readOnly) return

    if (isOfflineClient()) {
      setFilePreview((prev) => ({ ...prev, error: 'Offline: Datei kann aktuell nicht gespeichert werden.' }))
      return
    }

    filePreviewSaveAbortRef.current?.abort()
    const saveAbortController = new AbortController()
    filePreviewSaveAbortRef.current = saveAbortController

    setFilePreview((prev) => ({ ...prev, saving: true, error: undefined }))
    try {
      const res = await fetchWithTimeout(
        '/api/files/write',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: filePreview.path, content: fileDraft }),
          signal: saveAbortController.signal,
        },
        boardRequestTimeoutMs,
      )

      let payload: any = null
      try {
        payload = await res.json()
      } catch {
        payload = null
      }

      if (!res.ok) throw new Error(payload?.error || 'Datei konnte nicht gespeichert werden')

      setFilePreview((prev) => ({ ...prev, saving: false, content: fileDraft, error: undefined }))
    } catch (error) {
      const wasAborted = saveAbortController.signal.aborted
      const message =
        error instanceof DOMException && error.name === 'AbortError'
          ? (typeof navigator !== 'undefined' && !navigator.onLine
            ? filePreviewOfflineSaveInterruptedError
            : wasAborted
              ? 'Speichern wurde abgebrochen. Bitte erneut versuchen.'
              : 'Speichern hat zu lange gedauert. Bitte erneut versuchen.')
          : error instanceof Error && error.message
            ? error.message
            : 'Datei konnte nicht gespeichert werden'
      setFilePreview((prev) => ({ ...prev, saving: false, error: message }))
    } finally {
      if (filePreviewSaveAbortRef.current === saveAbortController) {
        filePreviewSaveAbortRef.current = null
      }
    }
  }

  async function loadKnowledgeIndex() {
    if (knowledgeLoadingRef.current) return

    const loadSeq = knowledgeLoadSeq.current + 1
    knowledgeLoadSeq.current = loadSeq

    if (isOfflineClient()) {
      if (loadSeq !== knowledgeLoadSeq.current) return
      setKnowledgeError('Offline: Wissensindex kann nicht geladen werden.')
      return
    }

    knowledgeLoadingRef.current = true
    setKnowledgeLoading(true)
    setKnowledgeError(null)
    try {
      const payload = await fetchJsonWithTransientRetry<{ entries?: KnowledgeEntry[] }>('/api/files/index', boardRequestTimeoutMs)
      if (loadSeq !== knowledgeLoadSeq.current) return

      const rows = Array.isArray(payload?.entries) ? payload.entries : []
      const collator = new Intl.Collator('de-CH', { sensitivity: 'base', numeric: true })
      const sortedRows = [...rows].sort((a, b) => {
        const groupDelta = collator.compare(a.group || '', b.group || '')
        if (groupDelta !== 0) return groupDelta

        const pathDelta = collator.compare(a.relPath || '', b.relPath || '')
        if (pathDelta !== 0) return pathDelta

        return collator.compare(a.name || '', b.name || '')
      })
      setKnowledgeEntries(sortedRows)
    } catch {
      if (loadSeq !== knowledgeLoadSeq.current) return
      setKnowledgeError('Wissensindex konnte nicht geladen werden.')
    } finally {
      if (loadSeq === knowledgeLoadSeq.current) {
        setKnowledgeLoading(false)
        knowledgeLoadingRef.current = false
      }
    }
  }

  async function loadTasks() {
    if (tasksLoadingRef.current) return

    const loadSeq = tasksLoadSeq.current + 1
    tasksLoadSeq.current = loadSeq
    tasksLoadingRef.current = true
    setTasksLoading(true)

    if (isOfflineClient()) {
      if (loadSeq !== tasksLoadSeq.current) return
      setBoardError('Offline: Aufgaben bleiben im letzten bekannten Stand sichtbar.')
      setTasksLoading(false)
      tasksLoadingRef.current = false
      return
    }

    try {
      const rows = await fetchJsonWithTransientRetry<Task[]>('/api/tasks', boardRequestTimeoutMs)
      if (loadSeq !== tasksLoadSeq.current) return
      setTasks(sanitizeTaskCacheRows(rows))
      setBoardError(null)
    } catch {
      if (loadSeq !== tasksLoadSeq.current) return
      setBoardError('Heute konnte nicht geladen werden. Letzte Daten bleiben sichtbar.')
    } finally {
      if (loadSeq === tasksLoadSeq.current) {
        setTasksLoading(false)
        tasksLoadingRef.current = false
      }
    }
  }

  async function loadCronJobs() {
    if (cronLoadingRef.current) return

    const loadSeq = cronLoadSeq.current + 1
    cronLoadSeq.current = loadSeq
    cronLoadingRef.current = true

    if (isOfflineClient()) {
      if (loadSeq !== cronLoadSeq.current) return
      setCronError('Offline: Kalender bleibt im letzten bekannten Stand sichtbar.')
      setCronLoading(false)
      cronLoadingRef.current = false
      return
    }

    setCronLoading(true)
    try {
      const payload = await fetchJsonWithTransientRetry<{ jobs?: CronJob[] }>('/api/cron', boardRequestTimeoutMs)
      if (loadSeq !== cronLoadSeq.current) return
      const rows = Array.isArray(payload?.jobs) ? payload.jobs : []
      setCronJobs(rows)
      setCronError(null)
    } catch (error) {
      if (loadSeq !== cronLoadSeq.current) return
      const msg = error instanceof Error ? error.message : ''
      if (/pairing required/i.test(msg)) {
        setCronError('Kalender konnte nicht geladen werden: OpenClaw-Gateway verlangt Pairing/Token. Bitte Gateway-Auth prüfen.')
      } else {
        setCronError('Kalender konnte nicht geladen werden. Letzte Daten bleiben sichtbar.')
      }
    } finally {
      if (loadSeq === cronLoadSeq.current) {
        setCronLoading(false)
        cronLoadingRef.current = false
      }
    }
  }

  async function loadAgentsSummary() {
    if (agentsLoadingRef.current) return

    const loadSeq = agentsLoadSeq.current + 1
    agentsLoadSeq.current = loadSeq
    agentsLoadingRef.current = true

    if (isOfflineClient()) {
      if (loadSeq !== agentsLoadSeq.current) return
      setAgentsError('Offline: Agent-Status bleibt im letzten bekannten Stand sichtbar.')
      setAgentsLoading(false)
      agentsLoadingRef.current = false
      return
    }

    setAgentsLoading(true)
    try {
      const payload = await fetchJsonWithTransientRetry<{ agents?: AgentSummary[] }>('/api/agents', boardRequestTimeoutMs)
      if (loadSeq !== agentsLoadSeq.current) return
      const rows = Array.isArray(payload?.agents) ? payload.agents : []
      setAgentsSummary(rows)
      setAgentsError(null)
    } catch {
      if (loadSeq !== agentsLoadSeq.current) return
      setAgentsError('Agent-Übersicht konnte nicht geladen werden. Letzte Daten bleiben sichtbar.')
    } finally {
      if (loadSeq === agentsLoadSeq.current) {
        setAgentsLoading(false)
        agentsLoadingRef.current = false
      }
    }
  }

  async function loadFundraisingIdeas() {
    if (fundraisingLoading) return
    if (isOfflineClient()) {
      setFundraisingError('Offline: Fundraising-Ideen bleiben im letzten bekannten Stand sichtbar.')
      return
    }

    setFundraisingLoading(true)
    try {
      const payload = await fetchJsonWithTransientRetry<{ ideas?: FundraisingIdea[] }>('/api/fundraising', boardRequestTimeoutMs)
      setFundraisingIdeas(Array.isArray(payload?.ideas) ? payload.ideas : [])
      setFundraisingError(null)
    } catch {
      setFundraisingError('Fundraising-Ideen konnten nicht geladen werden.')
    } finally {
      setFundraisingLoading(false)
    }
  }

  async function loadDiaryEntries() {
    if (diaryLoading) return
    if (isOfflineClient()) {
      setDiaryError('Offline: Tagebuch bleibt im letzten bekannten Stand sichtbar.')
      return
    }

    setDiaryLoading(true)
    try {
      const payload = await fetchJsonWithTransientRetry<{ entries?: DiaryEntry[] }>('/api/diary', boardRequestTimeoutMs)
      setDiaryEntries(Array.isArray(payload?.entries) ? payload.entries : [])
      setDiaryError(null)
    } catch {
      setDiaryError('Tagebuch konnte nicht geladen werden.')
    } finally {
      setDiaryLoading(false)
    }
  }

  async function deleteFundraisingIdea(fileName: string) {
    if (!fileName || fundraisingDeletePending) return
    const confirmed = window.confirm(`Idee wirklich löschen?\n${fileName}`)
    if (!confirmed) return

    setFundraisingDeletePending(fileName)
    setFundraisingError(null)
    try {
      const res = await fetch(`/api/fundraising?file=${encodeURIComponent(fileName)}`, { method: 'DELETE' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'Löschen fehlgeschlagen')
      }
      await loadFundraisingIdeas()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Löschen fehlgeschlagen'
      setFundraisingError(message)
    } finally {
      setFundraisingDeletePending(null)
    }
  }

  useEffect(() => {
    if (fundraisingIdeas.length === 0) {
      setFundraisingSelectedIndex(0)
      return
    }
    setFundraisingSelectedIndex((prev) => Math.max(0, Math.min(prev, fundraisingIdeas.length - 1)))
  }, [fundraisingIdeas])

  async function triggerAgentControl(action: 'heartbeat-enable' | 'heartbeat-disable' | 'gateway-restart' | 'cockpit-self-heal') {
    if (agentsControlPending) return

    setAgentsControlPending(action)
    setAgentsControlError(null)

    try {
      const res = await fetch('/api/agents/control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'Aktion fehlgeschlagen')
      }

      await loadAgentsSummary()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent-Steuerung fehlgeschlagen'
      setAgentsControlError(message)
    } finally {
      setAgentsControlPending(null)
    }
  }

  async function loadEntities(entityType: EntityType, sectionLabel: string) {
    if (entitiesLoadingRef.current) return

    const loadSeq = entitiesLoadSeq.current + 1
    entitiesLoadSeq.current = loadSeq
    entitiesLoadingRef.current = true
    setEntitiesLoading(true)

    if (isOfflineClient()) {
      if (loadSeq !== entitiesLoadSeq.current) return
      setBoardError(`Offline: ${sectionLabel} bleibt im letzten bekannten Stand sichtbar.`)
      setEntitiesLoading(false)
      entitiesLoadingRef.current = false
      return
    }

    try {
      const rows = await fetchJsonWithTransientRetry<Entity[]>(`/api/entities?type=${entityType}`, boardRequestTimeoutMs)
      if (loadSeq !== entitiesLoadSeq.current) return
      const sanitizedRows = sanitizeEntityRows(rows)
      setEntities(sanitizedRows)
      entitiesCacheRef.current = { ...entitiesCacheRef.current, [entityType]: sanitizedRows }
      persistEntityCache(entitiesCacheRef.current)
      setBoardError(null)
    } catch {
      if (loadSeq !== entitiesLoadSeq.current) return
      setBoardError(`${sectionLabel} konnte nicht geladen werden. Letzte Daten bleiben sichtbar.`)
    } finally {
      if (loadSeq === entitiesLoadSeq.current) {
        setEntitiesLoading(false)
        entitiesLoadingRef.current = false
      }
    }
  }

  function clearRadarRetryTimer() {
    if (radarRetryTimerRef.current !== null) {
      window.clearTimeout(radarRetryTimerRef.current)
      radarRetryTimerRef.current = null
    }
    setRadarRetryScheduledAt(null)
  }

  function scheduleRadarRetry() {
    if (radarRetryCountRef.current >= radarMaxAutoRetries) return
    if (radarRetryTimerRef.current !== null) return
    if (section !== 'radar') return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return

    const retryInMs = radarRetryBaseMs * (radarRetryCountRef.current + 1)
    setRadarRetryScheduledAt(Date.now() + retryInMs)
    radarRetryTimerRef.current = window.setTimeout(() => {
      radarRetryTimerRef.current = null
      setRadarRetryScheduledAt(null)
      if (section !== 'radar') return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return

      radarRetryCountRef.current += 1
      void loadRadar()
    }, retryInMs)
  }

  async function loadRadar(options?: { force?: boolean }) {
    const force = options?.force === true

    if (radarLoadingRef.current) return

    if (!force && radarAbortRef.current) {
      return
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOffline(true)
      setRadarError(radarOfflineRefreshError)
      setRadarLoading(false)
      radarLoadingRef.current = false
      return
    }

    setIsOffline(false)
    clearRadarRetryTimer()

    const loadSeq = radarLoadSeq.current + 1
    radarLoadSeq.current = loadSeq

    radarAbortRef.current?.abort()
    const abortController = new AbortController()
    radarAbortRef.current = abortController

    let didTimeout = false
    const timeoutId = window.setTimeout(() => {
      didTimeout = true
      abortController.abort()
    }, radarRequestTimeoutMs)

    radarLoadingRef.current = true
    setRadarLoading(true)
    setRadarError(null)
    try {
      const rowsRes = await fetch('/api/radar?mode=board', { cache: 'no-store', signal: abortController.signal })

      if (!rowsRes.ok) {
        throw new Error('Radar-Daten konnten nicht geladen werden.')
      }

      const rows = await rowsRes.json()

      if (!Array.isArray(rows)) {
        throw new Error('Radar-Antwort hat ein ungueltiges Format.')
      }

      const sanitizedRows = sanitizeRadarCacheRows(rows)

      if (rows.length > 0 && sanitizedRows.length === 0) {
        throw new Error('Radar-Antwort enthielt nur ungueltige Signale.')
      }

      if (sanitizedRows.length === 0 && radarRef.current.length > 0) {
        setRadarError('Radar lieferte voruebergehend keine Signale. Letzte Daten bleiben sichtbar.')
        scheduleRadarRetry()
        return
      }

      if (loadSeq !== radarLoadSeq.current) return

      const pendingStatuses = new Map<string, RadarItem['status']>()
      for (const item of radarRef.current) {
        if (radarPendingIdsRef.current.has(item.id)) {
          pendingStatuses.set(item.id, item.status)
        }
      }

      const mergedRows = sanitizedRows.map((item) => {
        const pendingStatus = pendingStatuses.get(item.id)
        return pendingStatus ? { ...item, status: pendingStatus } : item
      })
      const dedupedRows = dedupeRadarItems(mergedRows)
      const mergedStats = computeRadarStatsFromRows(dedupedRows)

      const latestSignalUpdatedAt = deriveRadarLastUpdatedAt(dedupedRows)
      setRadar(dedupedRows)
      setRadarStats(mergedStats)
      setRadarDedupedCount(Math.max(0, mergedRows.length - dedupedRows.length))
      setRadarLastUpdatedAt(latestSignalUpdatedAt)
      radarRetryCountRef.current = 0

      persistRadarCache(dedupedRows, mergedStats, latestSignalUpdatedAt, Math.max(0, mergedRows.length - dedupedRows.length))

      const deferredDecision = radarDeferredDecisionRef.current
      if (deferredDecision) {
        const deferredCandidate = dedupedRows.find((item) => item.id === deferredDecision.id)

        if (!deferredCandidate) {
          radarDeferredDecisionRef.current = null
          setRadarDeferredDecision(null)
          setRadarActionError('Geplante Radar-Entscheidung konnte nicht ausgeführt werden: Signal nicht mehr vorhanden.')
        } else if (!radarPendingIdsRef.current.has(deferredCandidate.id)) {
          radarDeferredDecisionRef.current = null
          setRadarDeferredDecision(null)
          void setRadarStatus(deferredCandidate.id, deferredDecision.status, { allowStale: true })
        }
      }
    } catch (error) {
      if (loadSeq !== radarLoadSeq.current) return
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (didTimeout) {
          setRadarError(radarTimeoutError)
          scheduleRadarRetry()
        }
        return
      }
      setRadarError(radarUnavailableError)
      scheduleRadarRetry()
    } finally {
      window.clearTimeout(timeoutId)
      if (loadSeq === radarLoadSeq.current) {
        setRadarLoading(false)
        radarLoadingRef.current = false
      }
      if (radarAbortRef.current === abortController) radarAbortRef.current = null
    }
  }

  useEffect(() => {
    safeSetLocalStorage(sectionStorageKey, section)

    if (section !== 'radar') {
      radarAbortRef.current?.abort()
      clearRadarRetryTimer()
      radarDeferredDecisionRef.current = null
      setRadarDeferredDecision(null)
      setRadarLoading(false)
    }

    if (section === 'tasks') {
      void loadTasks()
      void loadSomeday()
    } else if (section === 'radar') {
      void loadRadar()
    } else if (section === 'calendar') {
      void loadCronJobs()
    } else if (section === 'agents') {
      void loadAgentsSummary()
    } else if (section === 'files' || section === 'health') {
      setKnowledgeError(null)
      knowledgeAutoRefreshAtRef.current = Date.now()
      void loadKnowledgeIndex()
    } else if (section === 'recipes') {
      setBoardError(null)
    } else if (section === 'fundraising') {
      setBoardError(null)
      setFundraisingSelectedIndex(0)
      void loadFundraisingIdeas()
    } else if (section === 'diary') {
      setBoardError(null)
      setDiarySelectedIndex(0)
      void loadDiaryEntries()
    } else {
      const entityType = sectionMeta[section].entityType!
      setEntities(entitiesCacheRef.current[entityType] || [])
      void loadEntities(entityType, sectionMeta[section].label)
      if (section === 'memory') {
        knowledgeAutoRefreshAtRef.current = Date.now()
        void loadKnowledgeIndex()
      }
    }
  }, [section])

  useEffect(() => {
    persistTaskCache(tasks)
  }, [tasks])

  useEffect(() => {
    safeSetLocalStorage(radarStatusFilterStorageKey, radarStatusFilter)
  }, [radarStatusFilter])

  useEffect(() => {
    safeSetLocalStorage(radarLaneFilterStorageKey, radarLaneFilter)
  }, [radarLaneFilter])

  useEffect(() => {
    safeSetLocalStorage(radarQueryStorageKey, radarQuery)
  }, [radarQuery])

  useEffect(() => {
    safeSetLocalStorage(radarLeverageFilterStorageKey, radarLeverageOnly ? '1' : '0')
  }, [radarLeverageOnly])

  useEffect(() => {
    safeSetLocalStorage(radarSortModeStorageKey, radarSortMode)
  }, [radarSortMode])

  useEffect(() => {
    radarRef.current = radar
  }, [radar])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTick(Date.now())
    }, 60_000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!radarRetryScheduledAt) return

    const intervalId = window.setInterval(() => {
      setNowTick(Date.now())
    }, 1_000)

    return () => window.clearInterval(intervalId)
  }, [radarRetryScheduledAt])

  const refreshCurrentSection = useCallback((options?: { forceRadar?: boolean }) => {
    setNowTick(Date.now())
    if (isOffline) return

    if (section === 'radar') {
      if (radarLoadingRef.current) return
      if (radarPendingIdsRef.current.size > 0) return
      setRadarError(null)
      setRadarActionError(null)
      radarAutoRefreshAtRef.current = Date.now()
      void loadRadar(options?.forceRadar ? { force: true } : undefined)
      return
    }

    if (section === 'tasks') {
      if (tasksLoadingRef.current || somedayLoadingRef.current) return
      const hasPendingTaskMutation = Object.values(taskActionPendingRef.current).some(Boolean)
      if (hasPendingTaskMutation || Boolean(somedayBusyIdRef.current)) return
      setBoardError(null)
      setSomedayError(null)
      tasksAutoRefreshAtRef.current = Date.now()
      void Promise.all([loadTasks(), loadSomeday()])
      return
    }

    if (section === 'calendar') {
      if (cronLoadingRef.current) return
      setCronError(null)
      calendarAutoRefreshAtRef.current = Date.now()
      void loadCronJobs()
      return
    }

    if (section === 'agents') {
      if (agentsLoadingRef.current) return
      setAgentsError(null)
      void loadAgentsSummary()
      return
    }

    if (section === 'files' || section === 'health') {
      if (knowledgeLoadingRef.current) return
      setKnowledgeError(null)
      setFilePreview((prev) => {
        if (!prev.open || !prev.error) return prev
        const isOfflinePreviewError =
          prev.error === filePreviewOfflineLoadError ||
          prev.error === filePreviewOfflineInterruptedError ||
          prev.error === filePreviewOfflineSaveInterruptedError
        return isOfflinePreviewError ? { ...prev, error: undefined } : prev
      })
      knowledgeAutoRefreshAtRef.current = Date.now()
      void loadKnowledgeIndex()
      return
    }

    if (section === 'recipes') {
      setBoardError(null)
      return
    }

    if (section === 'fundraising') {
      setBoardError(null)
      void loadFundraisingIdeas()
      return
    }

    if (section === 'diary') {
      setBoardError(null)
      void loadDiaryEntries()
      return
    }

    const entityType = sectionMeta[section].entityType
    if (entityType) {
      if (entitiesLoadingRef.current) return
      if (Object.values(entityActionPendingRef.current).some(Boolean)) return
      setBoardError(null)
      if (section === 'memory') {
        setKnowledgeError(null)
        knowledgeAutoRefreshAtRef.current = Date.now()
        void loadKnowledgeIndex()
      }
      entitiesAutoRefreshAtRef.current = Date.now()
      void loadEntities(entityType, sectionMeta[section].label)
    }
  }, [isOffline, section])

  useEffect(() => {
    if (section !== 'radar') return

    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (isOffline) return
      if (radarLoadingRef.current) return
      if (radarPendingIdsRef.current.size > 0) return

      const now = Date.now()
      if (now - radarAutoRefreshAtRef.current < radarAutoRefreshCooldownMs) return

      radarAutoRefreshAtRef.current = now
      void loadRadar()
    }

    const intervalId = window.setInterval(refreshIfVisible, 60_000)
    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshIfVisible)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshIfVisible)
    }
  }, [section, isOffline])

  useEffect(() => {
    if (section !== 'tasks') return

    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (isOffline) return
      if (tasksLoadingRef.current || somedayLoadingRef.current) return

      const hasPendingTaskMutation = Object.values(taskActionPendingRef.current).some(Boolean)
      if (hasPendingTaskMutation || Boolean(somedayBusyIdRef.current)) return

      const now = Date.now()
      if (now - tasksAutoRefreshAtRef.current < boardAutoRefreshCooldownMs) return

      tasksAutoRefreshAtRef.current = now
      void Promise.all([loadTasks(), loadSomeday()])
    }

    const intervalId = window.setInterval(refreshIfVisible, 60_000)
    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshIfVisible)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshIfVisible)
    }
  }, [section, isOffline])

  useEffect(() => {
    if (section !== 'calendar') return

    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (isOffline) return
      if (cronLoadingRef.current) return

      const now = Date.now()
      if (now - calendarAutoRefreshAtRef.current < boardAutoRefreshCooldownMs) return

      calendarAutoRefreshAtRef.current = now
      void loadCronJobs()
    }

    const intervalId = window.setInterval(refreshIfVisible, 60_000)
    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshIfVisible)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshIfVisible)
    }
  }, [section, isOffline])

  useEffect(() => {
    if (section !== 'files' && section !== 'memory' && section !== 'health') return

    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (isOffline) return
      if (knowledgeLoadingRef.current) return

      const now = Date.now()
      if (now - knowledgeAutoRefreshAtRef.current < boardAutoRefreshCooldownMs) return

      knowledgeAutoRefreshAtRef.current = now
      void loadKnowledgeIndex()
    }

    const intervalId = window.setInterval(refreshIfVisible, 120_000)
    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshIfVisible)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshIfVisible)
    }
  }, [section, isOffline])

  useEffect(() => {
    const entityType = sectionMeta[section].entityType
    if (!entityType) return
    if (section === 'tasks' || section === 'radar') return

    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (isOffline) return
      if (entitiesLoadingRef.current) return
      if (Object.values(entityActionPendingRef.current).some(Boolean)) return

      const now = Date.now()
      if (now - entitiesAutoRefreshAtRef.current < boardAutoRefreshCooldownMs) return

      entitiesAutoRefreshAtRef.current = now
      void loadEntities(entityType, sectionMeta[section].label)

      if (section === 'memory' && !knowledgeLoadingRef.current) {
        knowledgeAutoRefreshAtRef.current = now
        void loadKnowledgeIndex()
      }
    }

    const intervalId = window.setInterval(refreshIfVisible, 120_000)
    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshIfVisible)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshIfVisible)
    }
  }, [section, isOffline])

  useEffect(() => {
    taskActionPendingRef.current = taskActionPending
  }, [taskActionPending])

  useEffect(() => {
    somedayBusyIdRef.current = somedayBusyId
  }, [somedayBusyId])

  useEffect(() => {
    entityActionPendingRef.current = entityActionPending
  }, [entityActionPending])

  useEffect(() => {
    radarLoadingRef.current = radarLoading
  }, [radarLoading])

  useEffect(() => {
    tasksLoadingRef.current = tasksLoading
  }, [tasksLoading])

  useEffect(() => {
    entitiesLoadingRef.current = entitiesLoading
  }, [entitiesLoading])

  useEffect(() => {
    somedayLoadingRef.current = somedayLoading
  }, [somedayLoading])

  useEffect(() => {
    cronLoadingRef.current = cronLoading
  }, [cronLoading])

  useEffect(() => {
    knowledgeLoadingRef.current = knowledgeLoading
  }, [knowledgeLoading])

  useEffect(() => {
    agentsLoadingRef.current = agentsLoading
  }, [agentsLoading])

  useEffect(() => {
    const markOnline = () => {
      setIsOffline(false)
      setNowTick(Date.now())
      setBoardError(null)
      setRadarError(null)
      setRadarActionError(null)
      setCronError(null)
      setSomedayError(null)
      setKnowledgeError(null)
      setFilePreview((prev) => {
        if (!prev.open) return prev

        const shouldClearError =
          prev.error === filePreviewOfflineInterruptedError ||
          prev.error === filePreviewOfflineSaveInterruptedError ||
          prev.error === filePreviewOfflineLoadError

        if (!prev.loading && !shouldClearError) return prev

        const next = { ...prev }
        if (next.loading) next.loading = false
        if (shouldClearError) next.error = undefined
        return next
      })

      if (section === 'radar') {
        if (radarLoadingRef.current) return
        if (radarPendingIdsRef.current.size > 0) return
        radarAutoRefreshAtRef.current = Date.now()
        void loadRadar({ force: true })
        return
      }

      if (section === 'tasks') {
        if (tasksLoadingRef.current || somedayLoadingRef.current) return
        const hasPendingTaskMutation = Object.values(taskActionPendingRef.current).some(Boolean)
        if (hasPendingTaskMutation || Boolean(somedayBusyIdRef.current)) return

        tasksAutoRefreshAtRef.current = Date.now()
        void Promise.all([loadTasks(), loadSomeday()])
        return
      }

      if (section === 'calendar') {
        if (cronLoadingRef.current) return
        calendarAutoRefreshAtRef.current = Date.now()
        void loadCronJobs()
        return
      }

      if (section === 'agents') {
        if (agentsLoadingRef.current) return
        void loadAgentsSummary()
        return
      }

      if (section === 'files' || section === 'health') {
        if (knowledgeLoadingRef.current) return
        knowledgeAutoRefreshAtRef.current = Date.now()
        void loadKnowledgeIndex()
        return
      }

      const entityType = sectionMeta[section].entityType
      if (entityType) {
        if (entitiesLoadingRef.current) return
        if (Object.values(entityActionPendingRef.current).some(Boolean)) return

        const now = Date.now()
        entitiesAutoRefreshAtRef.current = now
        void loadEntities(entityType, sectionMeta[section].label)

        if (section === 'memory' && !knowledgeLoadingRef.current) {
          knowledgeAutoRefreshAtRef.current = now
          void loadKnowledgeIndex()
        }
      }
    }

    const markOffline = () => {
      setIsOffline(true)
      setNowTick(Date.now())
      setRadarActionError(null)
      knowledgeLoadSeq.current += 1
      clearRadarRetryTimer()
      radarAbortRef.current?.abort()
      radarAbortRef.current = null
      setRadarLoading(false)
      radarLoadingRef.current = false
      setCronLoading(false)
      cronLoadingRef.current = false
      setTasksLoading(false)
      tasksLoadingRef.current = false
      setSomedayLoading(false)
      somedayLoadingRef.current = false
      setEntitiesLoading(false)
      entitiesLoadingRef.current = false
      setKnowledgeLoading(false)
      knowledgeLoadingRef.current = false
      filePreviewAbortRef.current?.abort()
      filePreviewAbortRef.current = null
      filePreviewSaveAbortRef.current?.abort()
      filePreviewSaveAbortRef.current = null
      filePreviewLoadingPathRef.current = null
      setFilePreview((prev) => {
        if (!prev.open) return prev

        if (!prev.loading && !prev.saving) {
          return prev
        }

        const nextError = prev.saving ? filePreviewOfflineSaveInterruptedError : filePreviewOfflineInterruptedError

        return {
          ...prev,
          loading: false,
          saving: false,
          error: nextError,
        }
      })

      if (section === 'radar') {
        setRadarError(radarOfflineRefreshError)
        return
      }

      if (section === 'tasks') {
        setBoardError('Offline: Aufgaben und Someday bleiben im letzten bekannten Stand sichtbar.')
        return
      }

      if (section === 'calendar') {
        setCronError('Offline: Kalender bleibt im letzten bekannten Stand sichtbar.')
        return
      }

      if (section === 'agents') {
        setAgentsError('Offline: Agent-Status bleibt im letzten bekannten Stand sichtbar.')
        return
      }

      if (section === 'files' || section === 'health') {
        setKnowledgeError('Offline: Wissensindex kann nicht geladen werden.')
        setBoardError(null)
        return
      }

      const sectionLabel = sectionMeta[section].label
      setBoardError(`Offline: ${sectionLabel} bleibt im letzten bekannten Stand sichtbar.`)
    }

    window.addEventListener('online', markOnline)
    window.addEventListener('offline', markOffline)

    return () => {
      window.removeEventListener('online', markOnline)
      window.removeEventListener('offline', markOffline)
      radarAbortRef.current?.abort()
      radarAbortRef.current = null
      setRadarLoading(false)
      radarLoadingRef.current = false
      setCronLoading(false)
      cronLoadingRef.current = false
      setTasksLoading(false)
      tasksLoadingRef.current = false
      setSomedayLoading(false)
      somedayLoadingRef.current = false
      setEntitiesLoading(false)
      entitiesLoadingRef.current = false
      setKnowledgeLoading(false)
      knowledgeLoadingRef.current = false
      knowledgeLoadSeq.current += 1
      filePreviewAbortRef.current?.abort()
      filePreviewAbortRef.current = null
      filePreviewSaveAbortRef.current?.abort()
      filePreviewSaveAbortRef.current = null
      filePreviewLoadingPathRef.current = null
      setFilePreview((prev) => (prev.loading || prev.saving ? { ...prev, loading: false, saving: false } : prev))
      clearRadarRetryTimer()
    }
  }, [section])

  useEffect(() => {
    const hasUnsavedFileChanges = filePreview.open && fileDraft !== (filePreview.content || '')
    const hasPendingFileSave = filePreview.open && !!filePreview.saving
    if (!hasUnsavedFileChanges && !hasPendingFileSave) return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [filePreview.open, filePreview.content, filePreview.saving, fileDraft])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.isComposing) return
      if (e.repeat) return

      const key = e.key.toLowerCase()
      if (cronSummaryModal) {
        if (key === 'escape') {
          e.preventDefault()
          setCronSummaryModal(null)
        }
        return
      }
      const isUndoCombo = key === 'z' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey
      const isRadarSearchCombo = key === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey
      const isMemoryFindCombo = key === 'f' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey
      const isManualRefreshShortcut = key === 'r' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey
      const isSaveFileCombo = key === 's' && (e.metaKey || e.ctrlKey) && !e.altKey
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable

      if (isSaveFileCombo && !filePreview.open) {
        e.preventDefault()
        return
      }

      if (isTyping) {
        if (key === 'arrowleft' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault()
          sectionNavRefs.current[section]?.focus()
          return
        }

        if (isManualRefreshShortcut) {
          e.preventDefault()
          refreshCurrentSection({ forceRadar: true })
          return
        }

        if (section === 'memory' && isMemoryFindCombo) {
          e.preventDefault()
          knowledgeSearchInputRef.current?.focus()
          knowledgeSearchInputRef.current?.select()
          return
        }

        if (filePreview.open && isSaveFileCombo) {
          e.preventDefault()
          if (!canSaveFilePreviewRef.current) return
          void saveFilePreview()
          return
        }

        const isRadarSearchTypingTarget = section === 'radar' && target === radarSearchInputRef.current
        if (isRadarSearchTypingTarget && e.shiftKey && (key === 'a' || key === 'w' || key === 'x' || key === 'o' || key === 'enter')) {
          const candidate = quickAcceptCandidateRef.current
          if (!candidate || radarActionPending[candidate.id]) return

          e.preventDefault()
          if (key === 'o') {
            openRadarSource(candidate.url, candidate.title)
            return
          }

          if (key === 'enter') {
            if (!openRadarSource(candidate.url, candidate.title)) return
            void setRadarStatus(candidate.id, 'accepted')
            return
          }

          const nextStatus = key === 'a' ? 'accepted' : key === 'w' ? 'watchlist' : 'rejected'
          void setRadarStatus(candidate.id, nextStatus)
          return
        }

        const isKnowledgeSearchTypingTarget = section === 'memory' && target === knowledgeSearchInputRef.current
        if (isKnowledgeSearchTypingTarget && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && key === 'enter') {
          e.preventDefault()
          if (knowledgeLoadingRef.current) return
          knowledgeAutoRefreshAtRef.current = Date.now()
          void loadKnowledgeIndex()
          return
        }

        if (isKnowledgeSearchTypingTarget && key === 'escape' && knowledgeQuery.trim()) {
          e.preventDefault()
          setKnowledgeQuery('')
          return
        }

        if (section === 'radar' && key === 'escape') {
          if (radarQuery.trim()) {
            e.preventDefault()
            setRadarQuery('')
            return
          }

          if (radarStatusFilter !== defaultRadarStatusFilter || radarLaneFilter !== 'all' || radarLeverageOnly || radarSortMode !== 'status') {
            e.preventDefault()
            setRadarStatusFilter(defaultRadarStatusFilter)
            setRadarLaneFilter('all')
            setRadarLeverageOnly(false)
            setRadarSortMode('status')
            return
          }
        }

        if (filePreview.open && key === 'escape') {
          e.preventDefault()
          closeFilePreview()
          return
        }
        return
      }

      if (filePreview.open) {
        if (isManualRefreshShortcut) {
          e.preventDefault()
          refreshCurrentSection({ forceRadar: true })
          return
        }

        if (isSaveFileCombo) {
          e.preventDefault()
          if (!canSaveFilePreviewRef.current) return
          void saveFilePreview()
          return
        }

        if (key === 'arrowleft') {
          e.preventDefault()
          closeFilePreview()
          window.setTimeout(() => sectionNavRefs.current[section]?.focus(), 0)
          return
        }

        if (key === 'escape') {
          e.preventDefault()
          closeFilePreview()
        }
        return
      }

      if (section === 'radar' && isUndoCombo && latestRadarDecision) {
        e.preventDefault()
        void undoLastRadarDecision()
        return
      }

      if (section === 'memory' && isMemoryFindCombo) {
        e.preventDefault()
        knowledgeSearchInputRef.current?.focus()
        knowledgeSearchInputRef.current?.select()
        return
      }

      if (isRadarSearchCombo) {
        e.preventDefault()

        if (section === 'memory') {
          knowledgeSearchInputRef.current?.focus()
          knowledgeSearchInputRef.current?.select()
          return
        }

        if (section !== 'radar') {
          setSection('radar')
          window.setTimeout(() => {
            radarSearchInputRef.current?.focus()
            radarSearchInputRef.current?.select()
          }, 0)
        } else {
          radarSearchInputRef.current?.focus()
          radarSearchInputRef.current?.select()
        }
        return
      }

      if (section === 'fundraising' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (key === 'j' || key === 'arrowdown') {
          e.preventDefault()
          setFundraisingSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, fundraisingIdeas.length - 1)))
          return
        }
        if (key === 'k' || key === 'arrowup') {
          e.preventDefault()
          setFundraisingSelectedIndex((prev) => Math.max(prev - 1, 0))
          return
        }
        if (key === 'enter') {
          const idea = fundraisingIdeas[fundraisingSelectedIndex]
          if (!idea) return
          e.preventDefault()
          void openFilePreview(idea.title, idea.path, { readOnly: true, renderMarkdown: true, hidePath: true })
          return
        }
        if (key === 'd') {
          const idea = fundraisingIdeas[fundraisingSelectedIndex]
          if (!idea) return
          e.preventDefault()
          void deleteFundraisingIdea(idea.sourceFile)
          return
        }
      }

      if (section === 'diary' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const q = diaryQuery.trim().toLowerCase()
        const diaryVisible = !q
          ? diaryEntries
          : diaryEntries.filter((entry) => `${entry.title}\n${entry.excerpt}\n${entry.content}`.toLowerCase().includes(q))

        if (key === 'arrowleft') {
          e.preventDefault()
          sectionNavRefs.current[section]?.focus()
          return
        }

        if (key === 'j' || key === 'arrowdown') {
          e.preventDefault()
          setDiarySelectedIndex((prev) => Math.min(prev + 1, Math.max(0, diaryVisible.length - 1)))
          return
        }
        if (key === 'k' || key === 'arrowup') {
          e.preventDefault()
          setDiarySelectedIndex((prev) => Math.max(prev - 1, 0))
          return
        }
        if (key === 'enter') {
          const entry = diaryVisible[diarySelectedIndex]
          if (!entry) return
          e.preventDefault()
          void openFilePreview(entry.title, entry.path, { readOnly: true, renderMarkdown: true, hidePath: true })
          return
        }
      }

      if (isManualRefreshShortcut) {
        e.preventDefault()
        refreshCurrentSection({ forceRadar: true })
        return
      }

      if (selectedCronJob) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const activeEl = document.activeElement as HTMLElement | null
      const activeNav = activeEl?.getAttribute('data-nav') || ''
      const isSidebarNavFocused = activeNav === 'section-item'
      const isCalendarCardFocused = activeNav === 'cron-card'

      if (key === 'arrowup' || key === 'arrowdown') {
        e.preventDefault()
        if (isSidebarNavFocused) {
          focusSidebarSection(key === 'arrowdown' ? 1 : -1)
        } else if (section === 'calendar') {
          focusCalendarCardVertical(key === 'arrowdown' ? 1 : -1)
        } else {
          focusSidebarSection(key === 'arrowdown' ? 1 : -1)
        }
        return
      }

      if (section === 'calendar' && isCalendarCardFocused && (key === 'arrowleft' || key === 'arrowright')) {
        e.preventDefault()
        focusCalendarCardHorizontal(key === 'arrowright' ? 1 : -1)
        return
      }

      if (key === 'arrowleft') {
        if (!isSidebarNavFocused) {
          e.preventDefault()
          sectionNavRefs.current[section]?.focus()
          return
        }
      }

      if (key === 'arrowright' && section === 'calendar' && isSidebarNavFocused) {
        e.preventDefault()
        const first = document.querySelector<HTMLButtonElement>('[data-nav="cron-card"]')
        first?.focus()
        return
      }

      if (key === 'arrowright' && section === 'calendar' && !isSidebarNavFocused && !isCalendarCardFocused) {
        e.preventDefault()
        focusCalendarCardHorizontal(1)
        return
      }

      if (key === 'h') {
        e.preventDefault()
        setSection('tasks')
      } else if (key === 'r') {
        e.preventDefault()
        if (section === 'radar') {
          refreshCurrentSection({ forceRadar: true })
        } else {
          setSection('radar')
        }
      } else if (key === 'm') {
        e.preventDefault()
        setSection('memory')
      } else if (section === 'tasks' && e.shiftKey && (key === 'd' || key === 'f')) {
        const shortcutCandidate = topTaskShortcutCandidateRef.current
        if (!shortcutCandidate || taskActionPending[shortcutCandidate.id]) return

        e.preventDefault()
        const nextStatus = key === 'd' ? 'doing' : 'waiting'
        void move(shortcutCandidate.id, nextStatus)
      } else if (section === 'tasks' && e.shiftKey && key === 's') {
        const doingCandidate = topDoingTaskShortcutCandidateRef.current
        if (!doingCandidate || taskActionPending[doingCandidate.id]) return

        e.preventDefault()
        void move(doingCandidate.id, 'done')
      } else if (section === 'tasks' && e.shiftKey && key === 'p') {
        const somedayCandidate = topSomedayShortcutCandidateRef.current
        if (!somedayCandidate || somedayBusyId) return

        e.preventDefault()
        void promoteSomeday(somedayCandidate, true)
      } else if (section === 'radar' && key === '/') {
        e.preventDefault()
        radarSearchInputRef.current?.focus()
        radarSearchInputRef.current?.select()
      } else if (section === 'memory' && key === '/') {
        e.preventDefault()
        knowledgeSearchInputRef.current?.focus()
        knowledgeSearchInputRef.current?.select()
      } else if (section === 'memory' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && key === 'enter') {
        e.preventDefault()
        if (knowledgeLoadingRef.current) return
        knowledgeAutoRefreshAtRef.current = Date.now()
        void loadKnowledgeIndex()
      } else if (section === 'radar' && (e.shiftKey && (key === 'a' || key === 'w' || key === 'x' || key === 'o') || (e.shiftKey && key === 'enter'))) {
        const candidate = quickAcceptCandidateRef.current

        if (!candidate || radarActionPending[candidate.id]) return

        e.preventDefault()
        if (key === 'o') {
          openRadarSource(candidate.url, candidate.title)
          return
        }

        if (key === 'enter') {
          if (!openRadarSource(candidate.url, candidate.title)) return
          void setRadarStatus(candidate.id, 'accepted')
          return
        }

        const nextStatus = key === 'a' ? 'accepted' : key === 'w' ? 'watchlist' : 'rejected'
        void setRadarStatus(candidate.id, nextStatus)
      } else if (section === 'radar' && key === 'escape') {
        if (radarQuery.trim()) {
          e.preventDefault()
          setRadarQuery('')
          return
        }

        if (radarStatusFilter !== defaultRadarStatusFilter || radarLaneFilter !== 'all' || radarLeverageOnly || radarSortMode !== 'status') {
          e.preventDefault()
          setRadarStatusFilter(defaultRadarStatusFilter)
          setRadarLaneFilter('all')
          setRadarLeverageOnly(false)
          setRadarSortMode('status')
        }
      } else if (section === 'memory' && key === 'escape') {
        if (knowledgeQuery.trim()) {
          e.preventDefault()
          setKnowledgeQuery('')
          return
        }

        e.preventDefault()
        knowledgeSearchInputRef.current?.focus()
        knowledgeSearchInputRef.current?.select()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    section,
    radarQuery,
    radarStatusFilter,
    radarLaneFilter,
    radarLeverageOnly,
    radarSortMode,
    radarActionPending,
    latestRadarDecision,
    taskActionPending,
    somedayBusyId,
    refreshCurrentSection,
    filePreview.open,
    selectedCronJob,
    cronSummaryModal,
    fundraisingIdeas,
    fundraisingSelectedIndex,
    fundraisingDeletePending,
    diaryEntries,
    diaryQuery,
    diarySelectedIndex,
  ])

  const visible = useMemo(() => (filter === 'all' ? tasks : tasks.filter((t) => t.assignee === filter)), [tasks, filter])
  const sidebarDateLabel = useMemo(() => {
    const d = new Date(nowTick)
    const months = [
      'Januar',
      'Februar',
      'März',
      'April',
      'Mai',
      'Juni',
      'Juli',
      'August',
      'September',
      'Oktober',
      'November',
      'Dezember',
    ]
    return `${String(d.getDate()).padStart(2, '0')}. ${months[d.getMonth()]}`
  }, [nowTick])

  const rankedOpenTasks = useMemo(() => {
    const nowMs = nowTick

    return [...visible]
      .filter((t) => t.status !== 'done')
      .sort((a, b) => {
        const rankDelta = taskExecutionRank(b, nowMs) - taskExecutionRank(a, nowMs)
        if (rankDelta !== 0) return rankDelta
        return a.title.localeCompare(b.title, 'de-CH')
      })
  }, [visible, nowTick])

  const todayFocus = useMemo(() => rankedOpenTasks.slice(0, 3), [rankedOpenTasks])

  const topTaskShortcutCandidate = useMemo(() => {
    return rankedOpenTasks.find((task) => task.status === 'open') || null
  }, [rankedOpenTasks])

  const topDoingTaskShortcutCandidate = useMemo(() => {
    return rankedOpenTasks.find((task) => task.status === 'doing') || null
  }, [rankedOpenTasks])

  const somedayTags = useMemo(() => Array.from(new Set(
    somedayItems.flatMap((item) => Array.isArray(item.tags) ? item.tags : [])
  )).sort((a, b) => a.localeCompare(b, 'de-CH')), [somedayItems])

  const visibleSomedayItems = useMemo(() => {
    const filtered = somedayTagFilter === 'all'
      ? [...somedayItems]
      : somedayItems.filter((item) => (item.tags || []).includes(somedayTagFilter))

    return filtered.sort((a, b) => {
      const rankDelta = somedayExecutionRank(b) - somedayExecutionRank(a)
      if (rankDelta !== 0) return rankDelta
      return a.title.localeCompare(b.title, 'de-CH')
    })
  }, [somedayItems, somedayTagFilter])

  const topSomedayShortcutCandidate = useMemo(() => {
    if (visibleSomedayItems.length === 0) return null
    return visibleSomedayItems[0]
  }, [visibleSomedayItems])

  const visibleDiaryEntries = useMemo(() => {
    const q = diaryQuery.trim().toLowerCase()
    if (!q) return diaryEntries
    return diaryEntries.filter((entry) => {
      const haystack = `${entry.title}\n${entry.excerpt}\n${entry.content}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [diaryEntries, diaryQuery])

  useEffect(() => {
    if (visibleDiaryEntries.length === 0) {
      setDiarySelectedIndex(0)
      return
    }
    setDiarySelectedIndex((prev) => Math.max(0, Math.min(prev, visibleDiaryEntries.length - 1)))
  }, [visibleDiaryEntries])

  useEffect(() => {
    topTaskShortcutCandidateRef.current = topTaskShortcutCandidate
  }, [topTaskShortcutCandidate])

  useEffect(() => {
    topDoingTaskShortcutCandidateRef.current = topDoingTaskShortcutCandidate
  }, [topDoingTaskShortcutCandidate])

  useEffect(() => {
    if (somedayTagFilter !== 'all' && !somedayTags.includes(somedayTagFilter)) {
      setSomedayTagFilter('all')
    }
  }, [somedayTagFilter, somedayTags])

  useEffect(() => {
    topSomedayShortcutCandidateRef.current = topSomedayShortcutCandidate
  }, [topSomedayShortcutCandidate])

  const overdueCount = useMemo(() => {
    const now = new Date(nowTick)
    return visible.filter((t) => t.status !== 'done' && t.deadline && parseTaskDeadlineMs(t.deadline) < now.getTime()).length
  }, [visible, nowTick])

  const dueSoonCount = useMemo(() => {
    const nowMs = nowTick
    const next24hMs = nowMs + 24 * 60 * 60 * 1000

    return visible.filter((t) => {
      if (t.status === 'done' || !t.deadline) return false
      const deadlineMs = parseTaskDeadlineMs(t.deadline)
      if (!Number.isFinite(deadlineMs)) return false
      return deadlineMs >= nowMs && deadlineMs <= next24hMs
    }).length
  }, [visible, nowTick])

  const tocCounts = useMemo(() => {
    const c = { wertschoepfung: 0, weltbild: 0, repraesentation: 0 }
    visible.forEach((t) => {
      if (t.tocAxis) c[t.tocAxis] += 1
    })
    return c
  }, [visible])

  const filteredRadar = useMemo(() => {
    const normalizedQuery = normalizeTitle(radarQuery)

    return radar
      .filter((r) => {
        if (radarStatusFilter === 'all') return true
        if (radarStatusFilter === 'actionable') return r.status === 'new' || r.status === 'watchlist'
        return r.status === radarStatusFilter
      })
      .filter((r) => (radarLaneFilter === 'all' ? true : r.lane === radarLaneFilter))
      .filter((r) => {
        if (!normalizedQuery) return true
        return radarSearchHaystack(r).includes(normalizedQuery)
      })
      .filter((r) => {
        if (!radarLeverageOnly) return true
        return r.score >= 80 || r.impact === 'high' || r.urgency === 'high'
      })
      .sort((a, b) => {
        if (radarSortMode === 'leverage') {
          const leverageDelta = radarLeverageRank(b) - radarLeverageRank(a)
          if (leverageDelta !== 0) return leverageDelta

          const statusDelta = radarStatusPriority[b.status] - radarStatusPriority[a.status]
          if (statusDelta !== 0) return statusDelta

          return a.title.localeCompare(b.title, 'de-CH')
        }

        const statusDelta = radarStatusPriority[b.status] - radarStatusPriority[a.status]
        if (statusDelta !== 0) return statusDelta

        const urgencyDelta = pScore[b.urgency] - pScore[a.urgency]
        if (urgencyDelta !== 0) return urgencyDelta

        const impactDelta = pScore[b.impact] - pScore[a.impact]
        if (impactDelta !== 0) return impactDelta

        return b.score - a.score || a.title.localeCompare(b.title, 'de-CH')
      })
  }, [radar, radarStatusFilter, radarLaneFilter, radarQuery, radarLeverageOnly, radarSortMode])

  const radarStaleMinutes = useMemo(() => {
    if (!radarLastUpdatedAt) return null
    const parsedMs = new Date(radarLastUpdatedAt).getTime()
    if (!Number.isFinite(parsedMs)) return null
    return Math.max(0, Math.floor((nowTick - parsedMs) / 60_000))
  }, [radarLastUpdatedAt, nowTick])

  const radarHasUnknownFreshness = radar.length > 0 && radarStaleMinutes === null
  const radarIsStale = radarHasUnknownFreshness || (radarStaleMinutes ?? 0) >= radarStaleThresholdMinutes
  const radarRetrySecondsRemaining = radarRetryScheduledAt ? Math.max(1, Math.ceil((radarRetryScheduledAt - nowTick) / 1_000)) : null

  const quickAcceptCandidate = useMemo(() => pickTopActionableRadar(filteredRadar), [filteredRadar])
  const quickAcceptCandidateSafeUrl = quickAcceptCandidate ? safeRadarSourceUrl(quickAcceptCandidate.url) : null

  useEffect(() => {
    quickAcceptCandidateRef.current = quickAcceptCandidate
  }, [quickAcceptCandidate])

  const quickCandidateContext = useMemo(() => {
    if (!quickAcceptCandidate) return null
    const title = quickAcceptCandidate.title.length > 90
      ? `${quickAcceptCandidate.title.slice(0, 87)}...`
      : quickAcceptCandidate.title
    return `${title} (${quickAcceptCandidate.source})`
  }, [quickAcceptCandidate])

  const actionableInFocusCount = useMemo(
    () => filteredRadar.filter((r) => r.status === 'new' || r.status === 'watchlist').length,
    [filteredRadar],
  )

  const actionableTotalCount = useMemo(
    () => radar.filter((r) => r.status === 'new' || r.status === 'watchlist').length,
    [radar],
  )

  const unsafeRadarSourceCount = useMemo(
    () => radar.filter((r) => !safeRadarSourceUrl(r.url)).length,
    [radar],
  )

  const highLeverageActionableInFocusCount = useMemo(
    () =>
      filteredRadar.filter(
        (r) =>
          (r.status === 'new' || r.status === 'watchlist') &&
          (r.score >= 80 || r.impact === 'high' || r.urgency === 'high'),
      ).length,
    [filteredRadar],
  )

  const highLeverageActionableTotalCount = useMemo(
    () =>
      radar.filter(
        (r) =>
          (r.status === 'new' || r.status === 'watchlist') &&
          (r.score >= 80 || r.impact === 'high' || r.urgency === 'high'),
      ).length,
    [radar],
  )

  const hasActiveRadarFilters =
    radarStatusFilter !== defaultRadarStatusFilter ||
    radarLaneFilter !== 'all' ||
    radarSortMode !== 'status' ||
    radarLeverageOnly ||
    Boolean(radarQuery.trim())

  function safeRadarSourceUrl(url: string): string | null {
    const parsed = parseSafeRadarUrl(url)
    return parsed ? parsed.toString() : null
  }

  function openRadarSource(url: string, contextTitle?: string) {
    const safeUrl = safeRadarSourceUrl(url)
    const suffix = contextTitle ? ` (${contextTitle})` : ''

    if (!safeUrl) {
      setRadarActionError(`Quelle konnte nicht sicher geöffnet werden${suffix}. Bitte URL prüfen.`)
      return false
    }

    setRadarActionError(null)
    const openedWindow = window.open(safeUrl, '_blank', 'noopener,noreferrer')
    if (!openedWindow) {
      setRadarActionError(`Quelle konnte nicht geöffnet werden${suffix}. Popup-Blocker prüfen.`)
      return false
    }

    return true
  }

  async function move(id: string, status: 'open' | 'doing' | 'waiting' | 'done') {
    if (taskActionPending[id]) return

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setBoardError('Offline: Task-Änderungen sind aktuell nicht möglich. Bitte erneut versuchen, sobald die Verbindung zurück ist.')
      return
    }

    const current = tasks.find((t) => t.id === id)
    if (!current || current.status === status) return

    const previousStatus = current.status

    // Invalidate older in-flight task loads so they cannot overwrite this optimistic update.
    tasksLoadSeq.current += 1

    setTaskActionPending((prev) => ({ ...prev, [id]: true }))
    setBoardError(null)
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, status } : task)))

    try {
      await patchTaskStatusWithRetry(id, status)
      await loadTasks()
    } catch (error) {
      setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, status: previousStatus } : task)))

      if (error instanceof DOMException && error.name === 'AbortError') {
        setBoardError('Speichern hat zu lange gedauert. Bitte erneut versuchen.')
      } else {
        setBoardError('Status konnte nicht gespeichert werden. Bitte erneut versuchen.')
      }
    } finally {
      setTaskActionPending((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  async function setRadarStatus(
    id: string,
    status: 'new' | 'accepted' | 'watchlist' | 'rejected',
    options?: { allowStale?: boolean; suppressUndoCapture?: boolean },
  ): Promise<boolean> {
    if (radarPendingIdsRef.current.has(id) || radarActionPending[id]) return false

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOffline(true)
      setRadarActionError('Offline: Status-Änderungen sind aktuell nicht möglich. Bitte erneut versuchen, sobald die Verbindung zurück ist.')
      return false
    }

    const current = radar.find((r) => r.id === id)
    if (!current || current.status === status) return false
    const previousStatus = current.status

    if (radarIsStale && !options?.allowStale) {
      radarDeferredDecisionRef.current = { id, status }
      setRadarDeferredDecision({ id, status, title: current.title })
      setRadarActionError(`Radar-Daten sind älter als ${radarStaleThresholdMinutes} Minuten. Aktualisierung läuft – Entscheidung wird danach automatisch ausgeführt.`)
      void loadRadar({ force: true })
      return false
    }

    if (radarDeferredDecisionRef.current?.id === id && radarDeferredDecisionRef.current?.status === status) {
      radarDeferredDecisionRef.current = null
      setRadarDeferredDecision(null)
    }

    const isHighLeverageSignal = current.score >= 80 || current.impact === 'high' || current.urgency === 'high'
    if (status === 'rejected' && isHighLeverageSignal && previousStatus !== 'rejected') {
      const shouldReject = window.confirm(
        `Dieses Signal hat hohen Hebel (Score ${current.score}, Impact ${current.impact}, Urgency ${current.urgency}). Wirklich auf "Rejected" setzen?`,
      )

      if (!shouldReject) return false
    }

    const shouldCaptureUndo = !options?.suppressUndoCapture

    setRadarActionError(null)
    radarPendingIdsRef.current.add(id)
    setRadarActionPending((prev) => ({ ...prev, [id]: true }))
    setRadarPendingTargetStatus((prev) => ({ ...prev, [id]: status }))
    setRadar((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, status } : item))
      const nextStats = computeRadarStatsFromRows(next)
      setRadarStats(nextStats)
      persistRadarCache(next, nextStats, radarLastUpdatedAt, radarDedupedCount)
      return next
    })

    let patchPersisted = false

    try {
      await patchRadarStatusWithRetry(id, status)

      patchPersisted = true

      if (shouldCaptureUndo) {
        setRadarDecisionUndoStack((prev) => [{ id, title: current.title, from: previousStatus, to: status }, ...prev].slice(0, maxRadarUndoDepth))
      }

      const becameAccepted = status === 'accepted' && current && current.status !== 'accepted'
      let followupWarning: string | null = null

      if (becameAccepted) {
        try {
          const followup = radarFollowupConfig(current)
          const taskTitle = followup.taskTitle
          const entityTitle = followup.entityTitle
          const followupAxis = current.tocAxis || 'weltbild'

          const [taskRowsRaw, entityRowsRaw] = await Promise.all([
            fetchJsonWithTransientRetry<unknown>('/api/tasks', boardRequestTimeoutMs),
            fetchJsonWithTransientRetry<unknown>(`/api/entities?type=${followup.entityType}`, boardRequestTimeoutMs),
          ])

          const taskRows = sanitizeTaskCacheRows(taskRowsRaw)
          const entityRows = sanitizeEntityRows(entityRowsRaw)

          const normalizedTaskTitle = normalizeTitle(taskTitle)
          const normalizedEntityTitle = normalizeTitle(entityTitle)
          const normalizedRadarUrl = normalizeComparableUrl(current.url)

          const existingTask = taskRows.find((t: Task) => normalizeTitle(t.title) === normalizedTaskTitle)
          const followupDeadline = radarFollowupDeadlineIso(current.urgency)

          const desiredImpact = current.impact === 'high' ? 'high' : 'med'

          if (existingTask) {
            const existingDeadlineMs = existingTask.deadline ? parseTaskDeadlineMs(existingTask.deadline) : Number.NaN
            const followupDeadlineMs = new Date(followupDeadline).getTime()
            const shouldTightenDeadline =
              !Number.isFinite(existingDeadlineMs) ||
              (Number.isFinite(followupDeadlineMs) && existingDeadlineMs > followupDeadlineMs)

            const needsTaskRefresh =
              existingTask.status === 'done' ||
              existingTask.priority !== 'high' ||
              (existingTask.impact || 'med') !== desiredImpact ||
              (existingTask.area || 'ops') !== followup.taskArea ||
              (existingTask.tocAxis || 'weltbild') !== followupAxis ||
              shouldTightenDeadline

            if (needsTaskRefresh) {
              await fetchWithRetry(
                `/api/tasks/${existingTask.id}`,
                {
                  method: 'PATCH',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    status: existingTask.status === 'done' ? 'open' : existingTask.status,
                    priority: 'high',
                    impact: desiredImpact,
                    area: followup.taskArea,
                    tocAxis: followupAxis,
                    ...(shouldTightenDeadline ? { deadline: followupDeadline } : {}),
                  }),
                },
                radarActionTimeoutMs,
                'Follow-up Task konnte nicht aktualisiert werden.',
              )
            }
          } else {
            await fetchWithRetry(
              '/api/tasks',
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  title: taskTitle,
                  assignee: 'ALF',
                  priority: 'high',
                  impact: desiredImpact,
                  area: followup.taskArea,
                  tocAxis: followupAxis,
                  deadline: followupDeadline,
                }),
              },
              radarActionTimeoutMs,
              'Follow-up Task konnte nicht erstellt werden.',
            )
          }

          const hasMatchingEntity = entityRows.some((e: Entity) => {
            if (normalizeTitle(e.title) === normalizedEntityTitle) return true

            const noteUrls = (e.notes || '').match(/https?:\/\/\S+/g) || []
            return noteUrls.some((url) => normalizeComparableUrl(url) === normalizedRadarUrl)
          })

          if (!hasMatchingEntity) {
            await fetchWithRetry(
              '/api/entities',
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  type: followup.entityType,
                  title: entityTitle,
                  notes: `${current.source} | Score ${current.score} | ${current.url}`,
                  owner: 'ALF',
                  status: 'brief',
                  tocAxis: followupAxis,
                }),
              },
              radarActionTimeoutMs,
              'Follow-up Kontakt konnte nicht erstellt werden.',
            )
          }
        } catch {
          followupWarning = 'Radar akzeptiert, aber Follow-up (Task/Entity) konnte nicht vollständig erstellt werden. Bitte kurz manuell prüfen.'
        }
      }

      await loadRadar({ force: true })
      if (becameAccepted) {
        await loadTasks()
      }

      if (followupWarning) {
        setRadarActionError(followupWarning)
      }

      return true
    } catch (error) {
      if (!patchPersisted && previousStatus) {
        setRadar((prev) => {
          const next = prev.map((item) => (item.id === id ? { ...item, status: previousStatus } : item))
          const nextStats = computeRadarStatsFromRows(next)
          setRadarStats(nextStats)
          persistRadarCache(next, nextStats, radarLastUpdatedAt, radarDedupedCount)
          return next
        })
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        setRadarActionError('Radar-Änderung hat zu lange gedauert. Bitte erneut versuchen.')
      } else if (error instanceof Error) {
        setRadarActionError(
          patchPersisted
            ? 'Status gespeichert, aber Ansicht konnte nicht vollständig aktualisiert werden. Bitte kurz neu laden.'
            : error.message,
        )
      } else {
        setRadarActionError('Aktion fehlgeschlagen. Bitte erneut versuchen.')
      }

      return false
    } finally {
      radarPendingIdsRef.current.delete(id)
      setRadarActionPending((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setRadarPendingTargetStatus((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  async function undoLastRadarDecision() {
    if (!latestRadarDecision) return

    const decisionToUndo = latestRadarDecision

    const undoApplied = await setRadarStatus(decisionToUndo.id, decisionToUndo.from, {
      allowStale: true,
      suppressUndoCapture: true,
    })

    if (undoApplied) {
      setRadarDecisionUndoStack((prev) => prev.slice(1))
    }
  }

  async function removeEntityById(id: string, reason: 'false' | 'duplicate') {
    if (entityActionPending[id]) return

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setBoardError('Offline: Einträge können aktuell nicht aussortiert werden. Bitte erneut versuchen, sobald die Verbindung zurück ist.')
      return
    }

    const label = reason === 'duplicate' ? 'Duplikat' : 'falsch'
    const shouldDelete = window.confirm(`Eintrag als ${label} aussortieren und entfernen?`)
    if (!shouldDelete) return

    setEntityActionPending((prev) => ({ ...prev, [id]: true }))
    setBoardError(null)

    try {
      const res = await fetchWithTimeout(`/api/entities/${id}`, { method: 'DELETE' }, taskActionTimeoutMs)
      if (!res.ok) throw new Error('Eintrag konnte nicht entfernt werden.')

      if (sectionMeta[section].entityType) {
        await loadEntities(sectionMeta[section].entityType!, sectionMeta[section].label)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setBoardError('Aussortieren hat zu lange gedauert. Bitte erneut versuchen.')
      } else {
        setBoardError('Eintrag konnte nicht entfernt werden. Bitte erneut versuchen.')
      }
    } finally {
      setEntityActionPending((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  const cronPalette = ['#a21caf', '#2563eb', '#0891b2', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#7c3aed']

  function getCronJobColor(job: CronJob) {
    const key = `${job.name}|${job.scheduleLabel}|${job.source || 'openclaw'}`
    let hash = 0
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0
    }
    return cronPalette[hash % cronPalette.length]
  }

  function simplifyCronJobName(name: string) {
    const raw = (name || '').trim()
    const lower = raw.toLowerCase()

    if (!raw) return 'Cron Job'
    if (lower.includes('github') && lower.includes('backup')) return 'GitHub Backup'
    if (lower.includes('backup')) return 'Backup (GitHub)'
    if (lower.includes('heartbeat')) return 'System-Heartbeat'
    if (lower.includes('radar')) return 'Radar-Synchronisierung'
    if (lower.includes('newsletter')) return 'Newsletter-Pipeline'
    if (lower.includes('cockpit') && lower.includes('heal')) return 'Cockpit Selbstheilung'
    if (lower.includes('gateway') && lower.includes('restart')) return 'Gateway Neustart'

    return raw
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\bcron\b/gi, '')
      .replace(/\bjob\b/gi, '')
      .replace(/\bopenclaw\b/gi, '')
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase()) || 'Cron Job'
  }

  function formatCronDateTime(ms?: number | null) {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return '–'
    return new Date(ms).toLocaleString('de-CH', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function cronPurposeSummary(job: CronJob) {
    const targetLabel = String(job.deliveryTargetLabel || '').trim()
    const targetChannel = targetLabel && !targetLabel.startsWith('#') ? `#${targetLabel}` : targetLabel

    const simplify = (text: string) => text
      .replace(/\d{17,20}/g, targetChannel || 'Discord-Channel')
      .replace(/\/Users\/[^\s]+/g, 'lokaler Pfad')
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, 'Job-ID')
      .replace(/\s+/g, ' ')
      .trim()

    const name = String(job.name || '').toLowerCase()

    if (name.includes('crawler') && name.includes('zh') && name.includes('daily')) {
      return `Aktualisiert den ZH-Crawler und publiziert 1× täglich den Stand${targetChannel ? ` in ${targetChannel}` : ''}.`
    }
    if (name.includes('crawler') && name.includes('zh') && name.includes('weekly')) {
      return 'Führt 1× pro Woche den vollständigen ZH-Import durch und erstellt einen Qualitätsbericht.'
    }
    if (name.includes('crawler') && name.includes('zh')) {
      return `Verbessert stündlich die ZH-Crawler-Trefferqualität${targetChannel ? ` und meldet Updates in ${targetChannel}` : ''}.`
    }
    if (name.includes('heartbeat')) return 'Prüft regelmässig den Agent-Zustand und meldet Auffälligkeiten.'
    if (name.includes('health')) return 'Führt einen täglichen System- und Sicherheits-Check aus.'
    if (name.includes('stadtrat')) return 'Verarbeitet neue Stadtrat-Trigger und synchronisiert sie ins System.'

    const payload = String(job.payloadMessage || '').trim()
    if (payload) {
      const firstLine = payload.split('\n').map((line) => line.trim()).find(Boolean) || ''
      if (firstLine) return simplify(firstLine).slice(0, 180)
    }

    const type = String(job.cronType || '').trim()
    if (type) return `${type} · ${job.enabled ? 'aktiv' : 'pausiert'}`

    const label = String(job.scheduleLabel || '').trim()
    if (label) return `Schedule: ${label}`

    return 'Keine Beschreibung hinterlegt.'
  }

  function cronActionDetails(job: CronJob) {
    const payload = String(job.payloadMessage || '').trim()
    const delivery = [job.deliveryMode, job.deliveryChannel, job.deliveryTargetLabel || job.deliveryTo].filter(Boolean).join(' · ')

    if (payload) {
      return payload
        .replace(/\s+/g, ' ')
        .replace(/\b\d{17,20}\b/g, job.deliveryTargetLabel || 'Channel-ID')
        .replace(/\/Users\/[^\s]+/g, 'lokaler Pfad')
        .trim()
    }

    const bits: string[] = []
    if (job.agentId) bits.push(`Agent: ${job.agentId}`)
    if (job.cronType) bits.push(`Typ: ${job.cronType}`)
    if (job.scheduleLabel) bits.push(`Intervall: ${job.scheduleLabel}`)
    if (delivery) bits.push(`Delivery: ${delivery}`)

    return bits.join(' · ') || 'Keine technischen Details hinterlegt.'
  }

  function cronActionDetailsBullets(job: CronJob) {
    const raw = cronActionDetails(job)
    const normalized = raw
      .replace(/\s*;\s*/g, '. ')
      .replace(/\s*\)\s*/g, ') ')
      .trim()

    const parts = normalized
      .split(/(?<=[.!?])\s+/)
      .map((p) => p.trim())
      .filter(Boolean)

    if (parts.length <= 1) return [normalized]
    return parts.slice(0, 8)
  }


  function formatCronDayMonth(ms?: number | null) {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return '–'
    const d = new Date(ms)
    const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
    return `${String(d.getDate()).padStart(2, '0')}. ${months[d.getMonth()]}`
  }

  function formatCronDuration(ms?: number | null) {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '–'
    if (ms < 1000) return `${ms} ms`
    const totalSeconds = Math.round(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    if (minutes === 0) return `${seconds}s`
    return `${minutes}m ${seconds}s`
  }

  function cronStatusTone(status?: string | null) {
    const s = String(status || '').toLowerCase()
    if (s === 'ok' || s === 'done' || s === 'success') {
      return { fg: '#86efac', bg: '#102218', border: '#14532d', label: 'OK' }
    }
    if (s === 'error' || s === 'failed' || s === 'fail') {
      return { fg: '#fecaca', bg: '#2b1111', border: '#7f1d1d', label: 'Error' }
    }
    if (s === 'running' || s === 'working') {
      return { fg: '#bfdbfe', bg: '#10233d', border: '#1e3a8a', label: 'Running' }
    }
    return { fg: '#e5e7eb', bg: '#1b1b1b', border: '#3f3f46', label: status || 'Unknown' }
  }

  function beautifyCronSummary(text?: string | null) {
    const raw = String(text || '').trim()
    if (!raw) return ''
    return raw
      .replace(/^executive summary:?\s*/i, '')
      .replace(/^zusammenfassung:?\s*/i, '')
      .replace(/^summary:?\s*/i, '')
  }

  function renderInlineMarkdown(text: string) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return <strong key={`md-bold-${idx}`}>{part.slice(2, -2)}</strong>
      }
      return <span key={`md-text-${idx}`}>{part}</span>
    })
  }

  function resolveCronBaseJob(job: CronJob) {
    const directMatch = cronJobs.find((row) => row.id === job.id)
    if (directMatch) return directMatch

    const baseId = job.id.includes('@') ? job.id.split('@')[0] : job.id
    const idMatch = cronJobs.find((row) => row.id === baseId)
    if (idMatch) return idMatch

    return cronJobs.find((row) => row.name === job.name && row.scheduleLabel === job.scheduleLabel && (row.source || 'openclaw') === (job.source || 'openclaw')) || job
  }

  function focusSidebarSection(step: 1 | -1) {
    const currentEl = document.activeElement as HTMLElement | null
    const currentSection = (currentEl?.getAttribute('data-section') || section) as Section
    const currentIdx = Math.max(0, sectionOrder.indexOf(currentSection))
    const nextIdx = (currentIdx + step + sectionOrder.length) % sectionOrder.length
    const nextSection = sectionOrder[nextIdx]
    setSection(nextSection)
    window.setTimeout(() => sectionNavRefs.current[nextSection]?.focus(), 0)
  }

  function focusCalendarCardVertical(step: 1 | -1) {
    const active = document.activeElement as HTMLElement | null
    const dayIdx = Number(active?.getAttribute('data-day-idx'))
    const jobIdx = Number(active?.getAttribute('data-job-idx'))

    if (!Number.isFinite(dayIdx) || !Number.isFinite(jobIdx)) {
      const first = document.querySelector<HTMLButtonElement>('[data-nav="cron-card"]')
      first?.focus()
      return
    }

    const nextJobIdx = jobIdx + step
    const next = document.querySelector<HTMLButtonElement>(`[data-nav="cron-card"][data-day-idx="${dayIdx}"][data-job-idx="${nextJobIdx}"]`)
    if (next) {
      next.focus()
      return
    }

    // wrap within same day
    const dayCards = Array.from(document.querySelectorAll<HTMLButtonElement>(`[data-nav="cron-card"][data-day-idx="${dayIdx}"]`))
    if (dayCards.length === 0) return
    ;(step === 1 ? dayCards[0] : dayCards[dayCards.length - 1])?.focus()
  }

  function focusCalendarCardHorizontal(step: 1 | -1) {
    const active = document.activeElement as HTMLElement | null
    const dayIdx = Number(active?.getAttribute('data-day-idx'))
    const jobIdx = Number(active?.getAttribute('data-job-idx'))

    if (!Number.isFinite(dayIdx) || !Number.isFinite(jobIdx)) {
      const first = document.querySelector<HTMLButtonElement>('[data-nav="cron-card"]')
      first?.focus()
      return
    }

    const dayCount = weeklyJobColumns.length
    if (!dayCount) return

    let targetDay = dayIdx + step
    while (targetDay >= 0 && targetDay < dayCount) {
      const sameRow = document.querySelector<HTMLButtonElement>(`[data-nav="cron-card"][data-day-idx="${targetDay}"][data-job-idx="${jobIdx}"]`)
      if (sameRow) {
        sameRow.focus()
        return
      }

      const dayCards = Array.from(document.querySelectorAll<HTMLButtonElement>(`[data-nav="cron-card"][data-day-idx="${targetDay}"]`))
      if (dayCards.length > 0) {
        dayCards[Math.min(jobIdx, dayCards.length - 1)]?.focus()
        return
      }

      targetDay += step
    }

    // edge reached: stay where you are (no wrap)
  }

  async function fixCronJob(job: CronJob) {
    if (!job?.id || cronFixPendingJobId) return
    setCronFixPendingJobId(job.id)
    setCronError(null)

    try {
      const res = await fetchWithTimeout('/api/cron/fix', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      }, 300_000)

      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(payload?.error || 'Fix fehlgeschlagen')
      }

      await loadCronJobs()
      setSelectedCronJob((prev) => {
        if (!prev) return prev
        const refreshed = cronJobs.find((row) => row.id === prev.job.id)
        return refreshed ? { ...prev, job: refreshed } : prev
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fix fehlgeschlagen'
      setCronError(`Cron-Fix fehlgeschlagen: ${message}`)
    } finally {
      setCronFixPendingJobId(null)
    }
  }

  async function runCronJobNow(job: CronJob) {
    if (!job?.id || cronRunPendingJobId) return
    setCronRunPendingJobId(job.id)
    setCronError(null)

    try {
      const res = await fetchWithTimeout('/api/cron/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      }, 300_000)

      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(payload?.error || 'Test-Run fehlgeschlagen')
      }

      await loadCronJobs()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test-Run fehlgeschlagen'
      setCronError(`Cron-Test-Run fehlgeschlagen: ${message}`)
    } finally {
      setCronRunPendingJobId(null)
    }
  }

  async function pauseCronJob(job: CronJob) {
    if (!job?.id || cronPausePendingJobId || job.source === 'launchd') return
    setCronPausePendingJobId(job.id)
    setCronError(null)

    try {
      const res = await fetchWithTimeout('/api/cron/control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, action: 'pause' }),
      }, 120_000)

      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(payload?.error || 'Pause fehlgeschlagen')
      }

      await loadCronJobs()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pause fehlgeschlagen'
      setCronError(`Cron-Pause fehlgeschlagen: ${message}`)
    } finally {
      setCronPausePendingJobId(null)
    }
  }

  async function deleteCronJob(job: CronJob) {
    if (!job?.id || cronDeletePendingJobId || job.source === 'launchd') return
    if (typeof window !== 'undefined' && !window.confirm(`Cron-Job wirklich löschen?\n\n${simplifyCronJobName(job.name)}`)) return

    setCronDeletePendingJobId(job.id)
    setCronError(null)

    try {
      const res = await fetchWithTimeout('/api/cron/control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, action: 'delete' }),
      }, 120_000)

      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(payload?.error || 'Delete fehlgeschlagen')
      }

      setSelectedCronJob(null)
      await loadCronJobs()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete fehlgeschlagen'
      setCronError(`Cron-Delete fehlgeschlagen: ${message}`)
    } finally {
      setCronDeletePendingJobId(null)
    }
  }

  const startOfWindow = (() => {
    const start = new Date(nowTick)
    start.setHours(0, 0, 0, 0)
    return start
  })()

  const weekDays = Array.from({ length: 7 }).map((_, idx) => {
    const date = new Date(startOfWindow)
    date.setDate(startOfWindow.getDate() + idx)
    const weekday = date.toLocaleDateString('de-CH', { weekday: 'short' })
    const startMs = date.getTime()
    return {
      label: weekday.charAt(0).toUpperCase() + weekday.slice(1),
      startMs,
      endMs: startMs + 24 * 60 * 60 * 1000,
      dateLabel: date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' }),
    }
  })

  const expandCronOccurrencesForWindow = (jobs: CronJob[]) => {
    const windowStartMs = weekDays[0]?.startMs ?? Date.now()
    const windowEndMs = (weekDays[weekDays.length - 1]?.endMs ?? windowStartMs) - 1
    const expanded: CronJob[] = []

    for (const job of jobs) {
      if (!job.enabled) continue

      if (typeof job.nextRunAtMs === 'number' && job.nextRunAtMs >= windowStartMs && job.nextRunAtMs <= windowEndMs) {
        expanded.push(job)
      }

      const hasDailyShape = job.scheduleKind === 'cron' && typeof job.scheduleExpr === 'string' && /^\s*\d{1,2}\s+\d{1,2}\s+\*\s+\*\s+\*\s*$/.test(job.scheduleExpr)
      if (!hasDailyShape || !job.scheduleExpr) continue

      const [minuteRaw, hourRaw] = job.scheduleExpr.trim().split(/\s+/)
      const minute = Number(minuteRaw)
      const hour = Number(hourRaw)
      if (!Number.isFinite(minute) || !Number.isFinite(hour)) continue
      if (minute < 0 || minute > 59 || hour < 0 || hour > 23) continue

      for (const day of weekDays) {
        const runAt = new Date(day.startMs)
        runAt.setHours(hour, minute, 0, 0)
        const runAtMs = runAt.getTime()
        if (runAtMs < windowStartMs || runAtMs > windowEndMs) continue

        if (typeof job.nextRunAtMs === 'number' && Math.abs(runAtMs - job.nextRunAtMs) < 60_000) continue

        expanded.push({
          ...job,
          id: `${job.id}@${runAtMs}`,
          status: 'scheduled',
          nextRunAtMs: runAtMs,
          nextRunAtIso: new Date(runAtMs).toISOString(),
        })
      }
    }

    return expanded
  }

  const availableCronTypes = useMemo(() => {
    const types = new Set<string>()
    for (const job of cronJobs) {
      if (!job.enabled) continue
      const type = String(job.cronType || 'General').trim()
      if (type) types.add(type)
    }
    return [...types].sort((a, b) => a.localeCompare(b, 'de-CH'))
  }, [cronJobs])

  const calendarSourceJobs = useMemo(() => {
    return cronJobs.filter((job) => {
      if (!job.enabled) return false
      if (cronTypeFilter === 'all') return true
      return (job.cronType || 'General') === cronTypeFilter
    })
  }, [cronJobs, cronTypeFilter])

  const calendarJobs = expandCronOccurrencesForWindow(calendarSourceJobs)

  const weeklyJobColumns = weekDays.map((day) => ({
    ...day,
    jobs: calendarJobs
      .filter((job) => typeof job.nextRunAtMs === 'number' && job.nextRunAtMs >= day.startMs && job.nextRunAtMs < day.endMs)
      .sort((a, b) => {
        if (cronSortMode === 'type') {
          const typeCmp = String(a.cronType || 'General').localeCompare(String(b.cronType || 'General'), 'de-CH')
          if (typeCmp !== 0) return typeCmp
        }
        return (a.nextRunAtMs || 0) - (b.nextRunAtMs || 0)
      }),
  }))

  const hiddenDisabledCronJobsCount = cronJobs.filter((job) => !job.enabled).length
  const activeCronJobsCount = calendarSourceJobs.length
  const weeklyVisibleCronJobsCount = new Set(calendarJobs.map((job) => (job.id.includes('@') ? job.id.split('@')[0] : job.id))).size
  const outsideWeekCronJobsCount = Math.max(0, activeCronJobsCount - weeklyVisibleCronJobsCount)
  const modelByAgentId = useMemo(() => {
    const map = new Map<string, string>()
    for (const agent of agentsSummary) {
      if (!agent.id) continue
      map.set(agent.id, agent.model || 'unbekannt')
    }
    return map
  }, [agentsSummary])

  const hasPendingTaskMutation = useMemo(() => Object.values(taskActionPending).some(Boolean), [taskActionPending])
  const hasPendingRadarMutation = useMemo(() => Object.values(radarActionPending).some(Boolean), [radarActionPending])
  const hasPendingEntityMutation = useMemo(() => Object.values(entityActionPending).some(Boolean), [entityActionPending])

  const refreshButtonDisabledReason = useMemo(() => {
    if (isOffline) return 'Offline: Aktualisierung pausiert bis Verbindung wieder da ist.'

    if (section === 'radar') {
      if (radarLoading) return 'Radar wird bereits aktualisiert.'
      if (hasPendingRadarMutation) return 'Radar-Entscheidung läuft noch. Danach erneut aktualisieren.'
      return null
    }

    if (section === 'tasks') {
      if (tasksLoading) return 'Aufgaben werden bereits aktualisiert.'
      if (somedayLoading) return 'Someday-Liste wird bereits aktualisiert.'
      if (hasPendingTaskMutation || Boolean(somedayBusyId)) return 'Task-Änderung läuft noch. Danach erneut aktualisieren.'
      return null
    }

    if (section === 'calendar') {
      if (cronLoading) return 'Kalender wird bereits aktualisiert.'
      return null
    }

    if (section === 'agents') {
      if (agentsLoading) return 'Agent-Status wird bereits aktualisiert.'
      return null
    }

    if (section === 'files' || section === 'health') {
      if (knowledgeLoading) return 'Wissensindex wird bereits aktualisiert.'
      return null
    }

    if (entitiesLoading) return 'Einträge werden bereits aktualisiert.'
    if (hasPendingEntityMutation) return 'Änderung läuft noch. Danach erneut aktualisieren.'

    return null
  }, [isOffline, section, radarLoading, hasPendingRadarMutation, tasksLoading, somedayLoading, hasPendingTaskMutation, somedayBusyId, cronLoading, agentsLoading, knowledgeLoading, entitiesLoading, hasPendingEntityMutation])

  const canRefreshCurrentSection = refreshButtonDisabledReason === null


  const filteredKnowledgeEntries = useMemo(() => {
    const q = knowledgeQuery.trim().toLowerCase()
    if (!q) return knowledgeEntries
    return knowledgeEntries.filter((entry) => {
      const hay = `${entry.name} ${entry.relPath} ${entry.group}`.toLowerCase()
      return hay.includes(q)
    })
  }, [knowledgeEntries, knowledgeQuery])

  const groupedKnowledgeEntries = useMemo(() => {
    const out = new Map<string, KnowledgeEntry[]>()
    for (const entry of filteredKnowledgeEntries) {
      const rows = out.get(entry.group) || []
      rows.push(entry)
      out.set(entry.group, rows)
    }
    return [...out.entries()]
  }, [filteredKnowledgeEntries])

  const healthProblemZones = useMemo(() => {
    return knowledgeEntries
      .filter((entry) => entry.relPath.startsWith('Physio/Problemzonen/') && entry.name.toLowerCase().endsWith('.md') && entry.name.toLowerCase() !== 'readme.md')
      .map((entry) => {
        const raw = entry.name.replace(/\.md$/i, '')
        const title = raw
          .split('-')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ')
        return { ...entry, title }
      })
      .sort((a, b) => a.title.localeCompare(b.title, 'de-CH'))
  }, [knowledgeEntries])

  useEffect(() => {
    if (section !== 'health') return
    if (isOffline) return
    for (const zone of healthProblemZones) {
      if (!healthZoneDetails[zone.path] && !healthZoneLoading[zone.path]) {
        void loadHealthZoneDetail(zone)
      }
    }
  }, [section, isOffline, healthProblemZones, healthZoneDetails, healthZoneLoading])


  const canRefreshSomeday = !somedayLoading && !tasksLoading && !Boolean(somedayBusyId)
  const refreshSomedayDisabledReason =
    somedayLoading
      ? 'Someday-Liste wird bereits aktualisiert.'
      : tasksLoading
        ? 'Aufgaben werden gerade aktualisiert. Danach Someday erneut laden.'
        : somedayBusyId
          ? 'Someday-Aktion läuft noch. Danach erneut laden.'
          : null

  const canSaveFilePreview = !isOffline && !filePreview.readOnly && !filePreview.loading && !filePreview.saving && fileDraft !== (filePreview.content || '')
  const saveFilePreviewDisabledReason =
    isOffline
      ? 'Offline: Datei kann aktuell nicht gespeichert werden.'
      : filePreview.readOnly
        ? 'Read-only Vorschau.'
        : filePreview.loading
          ? 'Datei lädt noch. Danach speichern.'
          : filePreview.saving
            ? 'Datei wird bereits gespeichert.'
            : fileDraft === (filePreview.content || '')
              ? 'Keine Änderungen zum Speichern.'
              : null

  const canRefreshKnowledgeIndex = !knowledgeLoading && !isOffline
  const refreshKnowledgeDisabledReason = knowledgeLoading
    ? 'Wissensindex wird bereits aktualisiert.'
    : isOffline
      ? 'Offline: Wissensindex kann ohne Netzwerk nicht geladen werden.'
      : null

  useEffect(() => {
    if (!selectedCronJob) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setSelectedCronJob(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedCronJob])

  useEffect(() => {
    canSaveFilePreviewRef.current = canSaveFilePreview
  }, [canSaveFilePreview])

  const polishedButtonStyle = {
    background: 'linear-gradient(180deg, #2b2b2b 0%, #202020 100%)',
    color: '#f5f5f5',
    border: '1px solid #454545',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 12,
    cursor: 'pointer',
  }

  const polishedSelectStyle = {
    background: '#1b1b1b',
    color: '#f5f5f5',
    border: '1px solid #474747',
    borderRadius: 8,
    padding: '5px 8px',
    fontSize: 12,
  }

  const col = (s: 'open' | 'doing' | 'waiting', colTitle: string) => (
    <div
      style={{ background: '#1f1f1f', border: '1px solid #343434', borderRadius: 12, padding: 12 }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const id = e.dataTransfer.getData('text/task-id')
        if (id) move(id, s)
      }}
    >
      <h3 style={{ marginTop: 0 }}>{colTitle}</h3>
      {visible
        .filter((t) => t.status === s)
        .sort((a, b) => {
          const rankDelta = taskExecutionRank(b, nowTick) - taskExecutionRank(a, nowTick)
          if (rankDelta !== 0) return rankDelta
          return (a.title || '').localeCompare(b.title || '', 'de-CH')
        })
        .map((t) => (
        <div
          key={t.id}
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/task-id', t.id)}
          style={{ background: '#202020', border: '1px solid #3b3b3b', borderRadius: 10, padding: 10, marginBottom: 8, cursor: 'grab' }}
        >
          <div><strong>{t.title}</strong></div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>👤 {t.assignee} · ⚡ {t.priority} · 🎯 {t.impact || 'med'} · 🧭 {t.area || 'ops'}</div>
          {t.deadline && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }} suppressHydrationWarning>⏰ {formatTaskDeadline(t.deadline)}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button disabled={!!taskActionPending[t.id]} onClick={() => move(t.id, 'open')}>Open</button>
            <button disabled={!!taskActionPending[t.id]} onClick={() => move(t.id, 'doing')}>Doing</button>
            <button disabled={!!taskActionPending[t.id]} onClick={() => move(t.id, 'waiting')}>
              {taskActionPending[t.id] ? 'Saving…' : 'Waiting For'}
            </button>
            <button disabled={!!taskActionPending[t.id]} onClick={() => move(t.id, 'done')}>
              {taskActionPending[t.id] ? 'Saving…' : 'Done'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <main className="cockpit-shell" suppressHydrationWarning style={{ maxWidth: 1320, margin: '0 auto', padding: 20, display: 'grid', gridTemplateColumns: '236px 1fr', gap: 16 }}>
      <aside style={{ background: 'linear-gradient(180deg, #1f1f1f 0%, #181818 100%)', border: '1px solid #343434', borderRadius: 14, padding: 10, height: 'fit-content', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Cockpit 🚀</div>
        </div>
        {sectionOrder.map((s) => (
          <button
            key={s}
            ref={(el) => { sectionNavRefs.current[s] = el }}
            data-nav="section-item"
            data-section={s}
            onClick={() => setSection(s)}
            style={{ width: '100%', textAlign: 'left', marginBottom: 6, background: section === s ? 'linear-gradient(180deg, #2e3d56 0%, #243246 100%)' : '#181818', color: '#f5f5f5', border: section === s ? '1px solid #46618a' : '1px solid #3a3a3a', borderRadius: 10, padding: '9px 10px', boxShadow: section === s ? '0 4px 12px rgba(70,97,138,0.28)' : 'none' }}
          >
            <div style={{ fontWeight: 600 }}>{sectionMeta[s].label}</div>
            {sectionMeta[s].hint && <div style={{ fontSize: 11, opacity: 0.7 }}>{sectionMeta[s].hint}</div>}
          </button>
        ))}
      </aside>

      <section style={{ background: 'linear-gradient(180deg, #1b1b1b 0%, #171717 100%)', border: '1px solid #2f2f2f', borderRadius: 14, padding: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
          <h1 style={{ margin: 0 }}>{sectionMeta[section].label}</h1>
        </div>
        {(section === 'content') && (
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
            Operative Umsetzung läuft primär in Discord/Telegram; das Cockpit dient hier als Überblick, Priorisierung und Entscheidungslage.
          </div>
        )}
        {boardError && section !== 'radar' && section !== 'fundraising' && (
          <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #7f1d1d', background: '#2b1111', color: '#fecaca', fontSize: 13 }}>
            {boardError}
          </div>
        )}

        {section === 'tasks' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginBottom: 14 }}>
              <div style={{ background: '#1f1f1f', border: '1px solid #343434', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Heute-Fokus (Top 3 offen)</div>
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  {todayFocus.length === 0 ? (
                    <span style={{ opacity: 0.75 }}>Alles erledigt 🎉</span>
                  ) : (
                    todayFocus.map((t, idx) => (
                      <div key={t.id} style={{ marginTop: idx === 0 ? 0 : 4 }}>
                        {idx + 1}. {t.title}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div style={{ background: '#1f1f1f', border: '1px solid #343434', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Überfällig</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{overdueCount}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Offene Tasks mit verpasster Deadline</div>
              </div>
              <div style={{ background: '#1f1f1f', border: '1px solid #343434', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Fällig in 24h</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{dueSoonCount}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Offene Tasks mit Deadline bis morgen</div>
              </div>
              <div style={{ background: '#1f1f1f', border: '1px solid #343434', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Aktiv in Bearbeitung</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{visible.filter((t) => t.status === 'doing').length}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Tasks im Status Doing</div>
              </div>
            </div>

            <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.72 }}>
              Fokusansicht: nur wichtigste Aufgaben und aktueller Bearbeitungsstand.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12, marginTop: 12 }}>
              {col('doing', 'In Arbeit')}
              {col('open', 'Als Nächstes')}
            </div>

            <div style={{ marginTop: 16, background: '#1f1f1f', border: '1px solid #343434', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>Someday / Maybe</h3>
                <button
                  onClick={() => void loadSomeday()}
                  disabled={!canRefreshSomeday}
                  title={refreshSomedayDisabledReason || 'Someday-Liste aktualisieren'}
                >
                  {somedayLoading ? 'Lädt…' : 'Aktualisieren'}
                </button>
              </div>
              {somedayError && <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>{somedayError}</div>}

              {somedayTags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  <button
                    style={{ fontSize: 12, padding: '4px 8px', borderRadius: 999, border: '1px solid #3a3a3a', background: somedayTagFilter === 'all' ? '#1d4ed8' : '#1f2937', color: '#fff' }}
                    onClick={() => setSomedayTagFilter('all')}
                  >
                    Alle Themen
                  </button>
                  {somedayTags.map((tag) => (
                    <button
                      key={tag}
                      style={{ fontSize: 12, padding: '4px 8px', borderRadius: 999, border: '1px solid #3a3a3a', background: somedayTagFilter === tag ? '#1d4ed8' : '#111827', color: '#dbeafe' }}
                      onClick={() => setSomedayTagFilter(tag)}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}

              {visibleSomedayItems.length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  {somedayItems.length === 0 ? 'Keine Someday-Einträge gefunden.' : 'Keine Einträge für dieses Thema.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {visibleSomedayItems.map((item) => (
                    <div key={item.id} style={{ border: '1px solid #3a3a3a', borderRadius: 8, padding: 8 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
                      {item.description && <div style={{ fontSize: 12, opacity: 0.88, marginBottom: 4 }}>{item.description}</div>}
                      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>
                        {item.status ? `Status: ${item.status}` : ''}
                        {item.impact ? ` · Impact: ${item.impact}` : ''}
                        {item.effort ? ` · Effort: ${item.effort}` : ''}
                      </div>
                      {item.tags && item.tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                          {item.tags.map((tag) => (
                            <button
                              key={`${item.id}-${tag}`}
                              style={{ fontSize: 11, padding: '2px 6px', borderRadius: 999, border: '1px solid #334155', background: '#0f172a', color: '#bfdbfe' }}
                              onClick={() => setSomedayTagFilter(tag)}
                            >
                              #{tag}
                            </button>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button disabled={somedayBusyId === item.id} onClick={() => void promoteSomeday(item, true)}>Zur Taskliste</button>
                        <button disabled={somedayBusyId === item.id} onClick={() => void deleteSomeday(item)}>Löschen</button>
                        {(item.tags || []).includes('tierschutzmeldungen') && (
                          <>
                            <button
                              onClick={() => setBoardError('Mock aktiv: Rückfrage an meldende Person vorbereiten (inkl. fehlende Angaben).')}
                              title="Mock: Rückfrage-Flow"
                            >
                              Rückfrage senden (Mock)
                            </button>
                            <button
                              onClick={() => setBoardError('Mock aktiv: Kanton + zuständiges Veterinäramt ermitteln und Meldung vorbereiten.')}
                              title="Mock: Behörden-Flow"
                            >
                              Behörde informieren (Mock)
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : section === 'radar' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <button
                onClick={() => refreshCurrentSection({ forceRadar: true })}
                disabled={!canRefreshCurrentSection}
                title={refreshButtonDisabledReason || 'Aktualisiert Radar jetzt'}
              >
                {section === 'radar' && radarLoading ? 'Aktualisiere…' : 'Jetzt aktualisieren'}
              </button>
            </div>
            {isOffline && (
              <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #92400e', background: '#2b1a0a', color: '#fde68a', fontSize: 13 }}>
                Offline erkannt. Cockpit zeigt die letzten Radar-Daten und aktualisiert automatisch, sobald die Verbindung zurück ist.
              </div>
            )}
            {radarError && (
              <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #7f1d1d', background: '#2b1111', color: '#fecaca', fontSize: 13 }}>
                <div>{radarError}</div>
                {radarRetrySecondsRemaining !== null && (
                  <div style={{ marginTop: 4, opacity: 0.9 }}>
                    Nächster Auto-Retry in ca. {radarRetrySecondsRemaining}s.
                  </div>
                )}
              </div>
            )}
            {radarActionError && (
              <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #7f1d1d', background: '#2b1111', color: '#fecaca', fontSize: 13 }}>
                {radarActionError}
              </div>
            )}
            {radarDeferredDecision && (
              <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #1d4ed8', background: '#0f1b33', color: '#bfdbfe', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <span>
                  Ausstehende Aktion: <strong>{radarDeferredDecision.status}</strong> für <strong>{radarDeferredDecision.title}</strong>. Wird nach dem Refresh automatisch ausgeführt.
                </span>
                <button
                  onClick={() => {
                    radarDeferredDecisionRef.current = null
                    setRadarDeferredDecision(null)
                    setRadarActionError(null)
                  }}
                >
                  Abbrechen
                </button>
              </div>
            )}
            {latestRadarDecision && (
              <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #14532d', background: '#0e2518', color: '#bbf7d0', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <span>
                  Letzte Entscheidung: <strong>{latestRadarDecision.title}</strong> ({latestRadarDecision.from} → {latestRadarDecision.to})
                  {radarDecisionUndoStack.length > 1 ? ` · +${radarDecisionUndoStack.length - 1} weitere` : ''}
                </span>
                <button
                  onClick={() => {
                    void undoLastRadarDecision()
                  }}
                  disabled={!!radarActionPending[latestRadarDecision.id]}
                  title="Setzt den letzten Status-Wechsel direkt zurück"
                >
                  Rückgängig
                </button>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 8, marginBottom: 8 }}>
              {[
                ['Einträge', radarStats.total],
                ['Handlungsbedarf', radarStats.fresh + radarStats.watchlist],
                ['Neu', radarStats.fresh],
                ['Accepted', radarStats.accepted],
                ['Rejected', radarStats.rejected],
                ['Score ≥ 80', radarStats.highScore],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ background: '#1f1f1f', border: '1px solid #343434', borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{k}</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{String(v)}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 12 }}>
              Kategorien: Medienarbeit {radarStats.laneMedien} · Politik {radarStats.lanePolitik} · Buchprojekt {radarStats.laneBuch}
              {radarDedupedCount > 0 && <span style={{ marginLeft: 10, opacity: 0.75 }}>Duplikate entfernt: {radarDedupedCount}</span>}
              {unsafeRadarSourceCount > 0 && (
                <span style={{ marginLeft: 10, color: '#fca5a5', fontWeight: 600 }}>
                  Unsichere Quellen blockiert: {unsafeRadarSourceCount}
                </span>
              )}
              <span style={{ marginLeft: 10, opacity: 0.75 }}>
                {radarLastUpdatedAt
                  ? `Auto-Refresh aktiv · zuletzt ${new Date(radarLastUpdatedAt).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Auto-Refresh aktiv'}
              </span>
              {(radarStaleMinutes !== null || radarHasUnknownFreshness) && (
                <span style={{ marginLeft: 10, color: radarIsStale ? '#fca5a5' : '#a3e635', fontSize: 12 }}>
                  {radarHasUnknownFreshness
                    ? 'Datenalter: unbekannt (bitte aktualisieren)'
                    : `Datenalter: ${radarStaleMinutes} min${radarIsStale ? ' (bitte aktualisieren)' : ''}`}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                {filteredRadar.length} Signale im Fokus · {actionableInFocusCount} mit Handlungsbedarf im Fokus
                {actionableTotalCount !== actionableInFocusCount && (
                  <span style={{ opacity: 0.75 }}> (gesamt: {actionableTotalCount})</span>
                )}
                {' · '}
                {highLeverageActionableInFocusCount} mit hohem Hebel im Fokus
                {highLeverageActionableTotalCount !== highLeverageActionableInFocusCount && (
                  <span style={{ opacity: 0.75 }}> (gesamt: {highLeverageActionableTotalCount})</span>
                )}
              </div>
              <label style={{ fontSize: 12, opacity: 0.9 }}>
                Status{' '}
                <select value={radarStatusFilter} onChange={(e) => setRadarStatusFilter(e.target.value as 'all' | 'actionable' | 'new' | 'watchlist' | 'accepted' | 'rejected')}>
                  <option value="all">Alle</option>
                  <option value="actionable">Handlungsbedarf (Neu + Hold)</option>
                  <option value="new">Neu</option>
                  <option value="watchlist">Hold</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <label style={{ fontSize: 12, opacity: 0.9 }}>
                Lane{' '}
                <select value={radarLaneFilter} onChange={(e) => setRadarLaneFilter(e.target.value as 'all' | 'medienarbeit' | 'politik' | 'buchprojekt')}>
                  <option value="all">Alle</option>
                  <option value="medienarbeit">Medienarbeit</option>
                  <option value="politik">Politik</option>
                  <option value="buchprojekt">Buchprojekt</option>
                </select>
              </label>
              <label style={{ fontSize: 12, opacity: 0.9 }}>
                Sortierung{' '}
                <select value={radarSortMode} onChange={(e) => setRadarSortMode(e.target.value as 'status' | 'leverage')}>
                  <option value="status">Status zuerst</option>
                  <option value="leverage">Hebel zuerst</option>
                </select>
              </label>
              <label style={{ fontSize: 12, opacity: 0.9 }}>
                Suche{' '}
                <input
                  ref={radarSearchInputRef}
                  value={radarQuery}
                  onChange={(e) => setRadarQuery(e.target.value)}
                  placeholder="Titel, Source, Lane, Domain…"
                  style={{ minWidth: 220 }}
                />
              </label>
              <label style={{ fontSize: 12, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={radarLeverageOnly}
                  onChange={(e) => setRadarLeverageOnly(e.target.checked)}
                />
                Nur hoher Hebel (Score ≥ 80 oder hohe Wirkung/Dringlichkeit)
              </label>
              <button
                onClick={() => {
                  setRadarStatusFilter('actionable')
                  setRadarLaneFilter('all')
                  setRadarSortMode('leverage')
                  setRadarQuery('')
                  setRadarLeverageOnly(true)
                }}
                disabled={radarStatusFilter === 'actionable' && radarLaneFilter === 'all' && radarSortMode === 'leverage' && !radarQuery.trim() && radarLeverageOnly}
                title="Setzt den Fokus auf sofort triagierbare High-Leverage-Signale"
              >
                High-Leverage-Triage
              </button>
              {hasActiveRadarFilters && (
                <button onClick={() => {
                  setRadarStatusFilter(defaultRadarStatusFilter)
                  setRadarLaneFilter('all')
                  setRadarSortMode('status')
                  setRadarQuery('')
                  setRadarLeverageOnly(false)
                }}>
                  Fokus zurücksetzen
                </button>
              )}
              <button
                disabled={!quickAcceptCandidate || !quickAcceptCandidateSafeUrl}
                onClick={() => {
                  if (!quickAcceptCandidate) return
                  openRadarSource(quickAcceptCandidate.url, quickAcceptCandidate.title)
                }}
                title={
                  quickAcceptCandidate
                    ? quickAcceptCandidateSafeUrl
                      ? `Öffnet Quelle: ${quickAcceptCandidate.title}`
                      : radarUnsafeSourceTooltip
                    : 'Kein offenes Signal im aktuellen Fokus'
                }
              >
                {quickAcceptCandidate ? 'Top-Signal öffnen' : 'Kein offenes Signal'}
              </button>
              <button
                disabled={!quickAcceptCandidate || !quickAcceptCandidateSafeUrl || !!radarActionPending[quickAcceptCandidate.id]}
                onClick={() => {
                  if (!quickAcceptCandidate) return
                  if (!openRadarSource(quickAcceptCandidate.url, quickAcceptCandidate.title)) return
                  void setRadarStatus(quickAcceptCandidate.id, 'accepted')
                }}
                title={
                  quickAcceptCandidate
                    ? quickAcceptCandidateSafeUrl
                      ? `Öffnet Quelle und akzeptiert: ${quickAcceptCandidate.title}`
                      : radarUnsafeSourceTooltip
                    : 'Kein offenes Signal im aktuellen Fokus'
                }
              >
                {quickAcceptCandidate ? 'Öffnen + akzeptieren' : 'Kein offenes Signal'}
              </button>
              <button
                disabled={!quickAcceptCandidate || !!radarActionPending[quickAcceptCandidate.id]}
                onClick={() => quickAcceptCandidate && setRadarStatus(quickAcceptCandidate.id, 'accepted')}
                title={
                  quickAcceptCandidate
                    ? `Akzeptiert: ${quickAcceptCandidate.title}`
                    : 'Kein offenes Signal im aktuellen Fokus'
                }
              >
                {quickAcceptCandidate ? 'Top-Signal akzeptieren' : 'Kein offenes Signal'}
              </button>
              <button
                disabled={!quickAcceptCandidate || !!radarActionPending[quickAcceptCandidate.id]}
                onClick={() => quickAcceptCandidate && setRadarStatus(quickAcceptCandidate.id, 'watchlist')}
                title={
                  quickAcceptCandidate
                    ? `Auf Watchlist: ${quickAcceptCandidate.title}`
                    : 'Kein offenes Signal im aktuellen Fokus'
                }
              >
                {quickAcceptCandidate ? 'Top-Signal auf Watchlist' : 'Kein offenes Signal'}
              </button>
              <button
                disabled={!quickAcceptCandidate || !!radarActionPending[quickAcceptCandidate.id]}
                onClick={() => quickAcceptCandidate && setRadarStatus(quickAcceptCandidate.id, 'rejected')}
                title={
                  quickAcceptCandidate
                    ? `Verwerfen: ${quickAcceptCandidate.title}`
                    : 'Kein offenes Signal im aktuellen Fokus'
                }
              >
                {quickAcceptCandidate ? 'Top-Signal verwerfen' : 'Kein offenes Signal'}
              </button>
              {quickCandidateContext && (
                <span style={{ fontSize: 11, opacity: 0.78 }}>Quick-Aktion Ziel: {quickCandidateContext}</span>
              )}
              {quickAcceptCandidate && !quickAcceptCandidateSafeUrl && (
                <span style={{ fontSize: 11, color: '#fca5a5' }}>
                  Top-Signal hat eine unsichere URL: Öffnen ist blockiert, Triage per Shift+A/W/X bleibt möglich.
                </span>
              )}
              <span style={{ fontSize: 11, opacity: 0.65 }}>Shortcuts: Shift+R = aktuelle Ansicht aktualisieren, / = Suche, Cmd/Ctrl+K = Radar-Suche fokussieren, Shift+Enter = Öffnen + akzeptieren, Shift+O = Top-Signal öffnen, Shift+A = Top-Signal akzeptieren, Shift+W = Top-Signal auf Watchlist, Shift+X = Top-Signal verwerfen, Cmd/Ctrl+Z = letzte Entscheidung rückgängig, Esc = Reset</span>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {filteredRadar.map((r) => {
                const safeSourceUrl = safeRadarSourceUrl(r.url)

                return (
                <div key={r.id} style={{ background: '#1f1f1f', border: '1px solid #343434', borderRadius: 10, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <strong>{r.title}</strong>
                    <span style={{ fontSize: 12, opacity: 0.8 }}>{r.source} · {normalizedRadarDomain(r.url) || 'ohne-domain'} · {r.kind} · {r.lane} · Score {r.score}</span>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>Status: {r.status === 'watchlist' ? 'hold' : r.status} · Impact: {r.impact} · Urgency: {r.urgency} · ToC: {r.tocAxis || '-'}</div>
                  {safeSourceUrl ? (
                    <a href={safeSourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#f59e0b', fontWeight: 600, textDecoration: 'underline' }}>Open source link</a>
                  ) : (
                    <span style={{ fontSize: 12, color: '#fca5a5', fontWeight: 600 }}>Source link blocked (invalid URL)</span>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button
                      disabled={!!radarActionPending[r.id] || r.status === 'new'}
                      onClick={() => setRadarStatus(r.id, 'new')}
                      title={r.status === 'new' ? 'Bereits auf Neu' : undefined}
                    >
                      {radarPendingTargetStatus[r.id] === 'new' ? 'Saving…' : 'Neu'}
                    </button>
                    <button
                      disabled={!!radarActionPending[r.id] || r.status === 'accepted'}
                      onClick={() => setRadarStatus(r.id, 'accepted')}
                      title={r.status === 'accepted' ? 'Bereits akzeptiert' : undefined}
                    >
                      {radarPendingTargetStatus[r.id] === 'accepted' ? 'Saving…' : 'Accept'}
                    </button>
                    <button
                      disabled={!!radarActionPending[r.id] || r.status === 'watchlist'}
                      onClick={() => setRadarStatus(r.id, 'watchlist')}
                      title={r.status === 'watchlist' ? 'Bereits auf Hold' : undefined}
                    >
                      {radarPendingTargetStatus[r.id] === 'watchlist' ? 'Saving…' : 'Hold'}
                    </button>
                    <button
                      disabled={!!radarActionPending[r.id] || r.status === 'rejected'}
                      onClick={() => setRadarStatus(r.id, 'rejected')}
                      title={r.status === 'rejected' ? 'Bereits abgelehnt' : undefined}
                    >
                      {radarPendingTargetStatus[r.id] === 'rejected' ? 'Saving…' : 'Reject'}
                    </button>
                  </div>
                </div>
                )
              })}
              {radarLoading && <div style={{ opacity: 0.7 }}>Radar wird geladen…</div>}
              {!radarLoading && filteredRadar.length === 0 && (
                <div style={{ opacity: 0.82, background: '#171717', border: '1px solid #2e2e2e', borderRadius: 8, padding: '10px 12px' }}>
                  <div>Keine Radar-Signale für den aktuellen Fokus.</div>
                  {actionableTotalCount > 0 && (
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                      Es gibt aktuell insgesamt {actionableTotalCount} Signale mit Handlungsbedarf ausserhalb dieses Filters.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {actionableTotalCount > 0 && (
                      <button
                        onClick={() => {
                          setRadarStatusFilter('actionable')
                          setRadarLaneFilter('all')
                          setRadarSortMode('leverage')
                          setRadarQuery('')
                          setRadarLeverageOnly(false)
                        }}
                      >
                        Handlungsbedarf zeigen ({actionableTotalCount})
                      </button>
                    )}
                    {hasActiveRadarFilters && (
                      <button
                        onClick={() => {
                          setRadarStatusFilter(defaultRadarStatusFilter)
                          setRadarLaneFilter('all')
                          setRadarSortMode('status')
                          setRadarQuery('')
                          setRadarLeverageOnly(false)
                        }}
                      >
                        Filter zurücksetzen
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : section === 'agents' ? (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => { void triggerAgentControl('heartbeat-enable') }}
                disabled={!!agentsControlPending}
                title="Globale Heartbeats aktivieren"
              >
                {agentsControlPending === 'heartbeat-enable' ? 'Aktiviere…' : 'Heartbeat an'}
              </button>
              <button
                onClick={() => { void triggerAgentControl('heartbeat-disable') }}
                disabled={!!agentsControlPending}
                title="Globale Heartbeats deaktivieren"
              >
                {agentsControlPending === 'heartbeat-disable' ? 'Deaktiviere…' : 'Heartbeat aus'}
              </button>            </div>
            {agentsControlError && (
              <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #7f1d1d', background: '#2b1111', color: '#fecaca', fontSize: 13 }}>
                {agentsControlError}
              </div>
            )}
            {agentsError && (
              <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #7f1d1d', background: '#2b1111', color: '#fecaca', fontSize: 13 }}>
                {agentsError}
              </div>
            )}
            <div style={{ display: 'grid', gap: 10 }}>
              {agentsSummary.map((agent) => (
                <div key={agent.id} style={{ background: '#1f1f1f', border: '1px solid #343434', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{agent.emoji || '🤖'} {agent.id.replace(/^tif-/, '')}</div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>{agent.purpose}</div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>Model: {agent.model || 'unbekannt'}</div>
                    </div>
                    <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 999, border: '1px solid #3a3a3a', background: '#181818' }}>
                      {agent.status === 'bootstrapping' ? 'starting' : agent.status}
                    </span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.86 }}>
                    Last active: {agent.lastActiveLabel} · Heartbeat: {agent.heartbeat} · Sessions: {agent.sessionsCount}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                    Zuletzt gearbeitet an: <strong>{agent.lastWorkedOn}</strong>
                  </div>
                  {agent.lastSessionKey && (
                    <code style={{ display: 'block', marginTop: 6, fontSize: 11, opacity: 0.72, wordBreak: 'break-all' }}>{agent.lastSessionKey}</code>
                  )}
                </div>
              ))}
              {!agentsLoading && agentsSummary.length === 0 && <div style={{ opacity: 0.75 }}>Keine Agent-Daten verfügbar.</div>}
            </div>
          </>
        ) : section === 'calendar' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                OpenClaw Cron-Jobs mit nächster Ausführung in der aktuellen Woche.
                <span style={{ marginLeft: 8, opacity: 0.72 }}>
                  Aktive Jobs gesamt: {activeCronJobsCount}
                </span>
                <span style={{ marginLeft: 8, opacity: 0.72 }}>
                  · Davon diese Woche mit Run: {weeklyVisibleCronJobsCount}
                </span>
                {outsideWeekCronJobsCount > 0 && (
                  <span style={{ marginLeft: 8, opacity: 0.72 }}>
                    ({outsideWeekCronJobsCount} ausserhalb dieser Woche)
                  </span>
                )}
                {hiddenDisabledCronJobsCount > 0 && (
                  <span style={{ marginLeft: 8, opacity: 0.72 }}>
                    · {hiddenDisabledCronJobsCount} deaktivierte Jobs ausgeblendet
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, opacity: 0.85 }}>
                  Typ
                  <select value={cronTypeFilter} onChange={(e) => setCronTypeFilter(e.target.value)} style={{ ...polishedSelectStyle, marginLeft: 6 }}>
                    <option value="all">Alle</option>
                    {availableCronTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, opacity: 0.85 }}>
                  Sortierung
                  <select value={cronSortMode} onChange={(e) => setCronSortMode(e.target.value as 'time' | 'type')} style={{ ...polishedSelectStyle, marginLeft: 6 }}>
                    <option value="time">Zeit</option>
                    <option value="type">Typ, dann Zeit</option>
                  </select>
                </label>
              </div>
            </div>
            {cronError && (
              <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #7f1d1d', background: '#2b1111', color: '#fecaca', fontSize: 13 }}>
                {cronError}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 10, marginBottom: 16 }}>
              {weeklyJobColumns.map((day, dayIdx) => (
                <div key={day.label} style={{ background: `linear-gradient(180deg, rgba(37,99,235,0.14) 0%, rgba(31,41,55,0.92) 70%)`, border: '1px solid #35507a', borderRadius: 12, padding: 10, minHeight: 190, boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}>
                  <div style={{ fontSize: 12, color: '#bfdbfe', letterSpacing: 0.2 }}>{day.dateLabel}</div>
                  <div style={{ fontWeight: 800, marginBottom: 10, color: '#eff6ff', fontSize: 14 }}>{day.label}</div>
                  {day.jobs.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#93c5fd' }}>Keine Jobs</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {day.jobs.map((job, jobIdx) => {
                        const sourceColor = getCronJobColor(job)
                        return (
                          <button
                            key={`${day.label}-${job.id}`}
                            type="button"
                            data-nav="cron-card"
                            data-day-idx={dayIdx}
                            data-job-idx={jobIdx}
                            onClick={() => {
                              const baseJob = resolveCronBaseJob(job)
                              setSelectedCronJob({ job: baseJob, runAtMs: job.nextRunAtMs ?? null })
                            }}
                            title="Cron-Details öffnen"
                            style={{ border: '1px solid #4b6b98', borderLeft: `5px solid ${sourceColor}`, background: 'linear-gradient(180deg, #1b2533 0%, #141c27 100%)', borderRadius: 10, padding: 8, textAlign: 'left', color: '#f8fafc', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.25)' }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35, color: '#e2e8f0' }}>{simplifyCronJobName(job.name)}</div>
                            <div style={{ fontSize: 11, color: '#93c5fd' }}>
                              {job.nextRunAtMs ? new Date(job.nextRunAtMs).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : 'ohne Zeit'} · {job.cronType || 'General'}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {selectedCronJob && (
              <div
                onClick={() => setSelectedCronJob(null)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 60, display: 'grid', placeItems: 'center', padding: 16 }}
              >
                <div
                  onClick={(event) => event.stopPropagation()}
                  style={{ width: 'min(860px, 100%)', maxHeight: '88vh', overflowY: 'auto', background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)', border: '1px solid #334155', borderRadius: 14, padding: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.45)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.72 }}>Cron-Details</div>
                      <h3 style={{ margin: '4px 0 2px 0' }}>{simplifyCronJobName(selectedCronJob.job.name)}</h3>
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>Kurzfassung</div>
                      <div style={{ marginTop: 2, fontSize: 13, lineHeight: 1.5, color: '#e2e8f0', maxWidth: 680 }}>
                        {cronPurposeSummary(selectedCronJob.job)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => { void runCronJobNow(selectedCronJob.job) }}
                        disabled={selectedCronJob.job.source === 'launchd' || cronRunPendingJobId === selectedCronJob.job.id}
                        style={{ ...polishedButtonStyle, opacity: selectedCronJob.job.source === 'launchd' ? 0.55 : 1, cursor: selectedCronJob.job.source === 'launchd' ? 'not-allowed' : 'pointer' }}
                        title={selectedCronJob.job.source === 'launchd' ? 'Bei System-Jobs nicht verfügbar' : 'Job sofort testweise ausführen'}
                      >
                        {cronRunPendingJobId === selectedCronJob.job.id ? 'Test läuft…' : 'Run'}
                      </button>
                      {(selectedCronJob.job.status === 'error' || !!selectedCronJob.job.lastError) && (
                        <button
                          type="button"
                          onClick={() => { void fixCronJob(selectedCronJob.job) }}
                          disabled={cronFixPendingJobId === selectedCronJob.job.id}
                          style={{ ...polishedButtonStyle, borderColor: '#7f1d1d', background: 'linear-gradient(180deg, #3a1313 0%, #2b1111 100%)' }}
                          title="Versucht bekannte Cron-Fehler automatisch zu reparieren und startet den Job neu"
                        >
                          {cronFixPendingJobId === selectedCronJob.job.id ? 'Fix läuft…' : 'Fix Error'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { void pauseCronJob(selectedCronJob.job) }}
                        disabled={selectedCronJob.job.source === 'launchd' || cronPausePendingJobId === selectedCronJob.job.id || selectedCronJob.job.enabled === false}
                        style={{ ...polishedButtonStyle, opacity: selectedCronJob.job.source === 'launchd' ? 0.55 : 1, cursor: selectedCronJob.job.source === 'launchd' ? 'not-allowed' : 'pointer' }}
                        title={selectedCronJob.job.source === 'launchd' ? 'Bei System-Jobs nicht verfügbar' : 'Cron-Job pausieren (disable)'}
                      >
                        {cronPausePendingJobId === selectedCronJob.job.id ? 'Pausiert…' : (selectedCronJob.job.enabled === false ? 'Pausiert' : 'Pause')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { void deleteCronJob(selectedCronJob.job) }}
                        disabled={selectedCronJob.job.source === 'launchd' || cronDeletePendingJobId === selectedCronJob.job.id}
                        style={{ ...polishedButtonStyle, borderColor: '#7f1d1d', color: '#fecaca', opacity: selectedCronJob.job.source === 'launchd' ? 0.55 : 1, cursor: selectedCronJob.job.source === 'launchd' ? 'not-allowed' : 'pointer' }}
                        title={selectedCronJob.job.source === 'launchd' ? 'Bei System-Jobs nicht verfügbar' : 'Cron-Job löschen'}
                      >
                        {cronDeletePendingJobId === selectedCronJob.job.id ? 'Lösche…' : 'Delete'}
                      </button>
                      <button type="button" onClick={() => setSelectedCronJob(null)} style={polishedButtonStyle}>Schliessen</button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginTop: 12 }}>
                    <div style={{ background: '#162132', border: '1px solid #2f4564', borderRadius: 8, padding: 8 }}>
                      <strong>Status:</strong>{' '}
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          color: cronStatusTone(selectedCronJob.job.status).fg,
                          background: cronStatusTone(selectedCronJob.job.status).bg,
                          border: `1px solid ${cronStatusTone(selectedCronJob.job.status).border}`,
                        }}
                      >
                        {cronStatusTone(selectedCronJob.job.status).label}
                      </span>
                    </div>
                    <div style={{ background: '#162132', border: '1px solid #2f4564', borderRadius: 8, padding: 8 }}><strong>Typ:</strong> {selectedCronJob.job.cronType || 'General'}</div>
                    <div style={{ background: '#162132', border: '1px solid #2f4564', borderRadius: 8, padding: 8 }}><strong>Quelle:</strong> {selectedCronJob.job.source === 'launchd' ? 'System-Job (launchd)' : (selectedCronJob.job.source || 'openclaw')}</div>
                    <div style={{ background: '#162132', border: '1px solid #2f4564', borderRadius: 8, padding: 8 }}><strong>Agent:</strong> {selectedCronJob.job.agentId || (selectedCronJob.job.source === 'launchd' ? 'System-Task' : '–')}</div>
                    <div style={{ background: '#162132', border: '1px solid #2f4564', borderRadius: 8, padding: 8 }}><strong>LLM-Modell:</strong> {selectedCronJob.job.agentId ? (modelByAgentId.get(selectedCronJob.job.agentId) || selectedCronJob.job.lastRunModel || 'unbekannt') : (selectedCronJob.job.lastRunModel || '–')}</div>
                    <div style={{ background: '#162132', border: '1px solid #2f4564', borderRadius: 8, padding: 8 }}><strong>Nächster Run:</strong> {formatCronDateTime(selectedCronJob.job.nextRunAtMs)}</div>
                    <div style={{ background: '#162132', border: '1px solid #2f4564', borderRadius: 8, padding: 8 }}>
                      <strong>Letzter Run:</strong>{' '}
                      {selectedCronJob.job.source === 'launchd' && !selectedCronJob.job.lastRunAtMs ? (
                        'nicht im Cockpit-Feed verfügbar'
                      ) : selectedCronJob.job.lastRunReportPath ? (
                        <a
                          href="#last-run-report"
                          onClick={(event) => {
                            event.preventDefault()
                            void openFilePreview('cron-run-report.md', selectedCronJob.job.lastRunReportPath || '', { readOnly: true, renderMarkdown: true })
                          }}
                          title="Run-Report öffnen"
                        >
                          {formatCronDayMonth(selectedCronJob.job.lastRunAtMs)}
                        </a>
                      ) : (
                        formatCronDayMonth(selectedCronJob.job.lastRunAtMs)
                      )}
                    </div>
                    <div style={{ background: '#162132', border: '1px solid #2f4564', borderRadius: 8, padding: 8 }}><strong>Letzte Dauer:</strong> {formatCronDuration(selectedCronJob.job.lastDurationMs)}</div>
                    <div style={{ background: '#162132', border: '1px solid #2f4564', borderRadius: 8, padding: 8 }}><strong>Intervall:</strong> {selectedCronJob.job.scheduleLabel}</div>
                    <div style={{ background: '#162132', border: '1px solid #2f4564', borderRadius: 8, padding: 8 }}><strong>Delivery:</strong> {selectedCronJob.job.deliveryMode || '–'} {selectedCronJob.job.deliveryChannel ? `· ${selectedCronJob.job.deliveryChannel}` : ''}</div>
                    <div style={{ background: '#162132', border: '1px solid #2f4564', borderRadius: 8, padding: 8 }}><strong>Discord-Channel:</strong> {selectedCronJob.job.deliveryTargetLabel || selectedCronJob.job.deliveryTo || '–'}</div>
                    <div style={{ background: '#162132', border: '1px solid #2f4564', borderRadius: 8, padding: 8 }}><strong>Consecutive Errors:</strong> {typeof selectedCronJob.job.consecutiveErrors === 'number' ? selectedCronJob.job.consecutiveErrors : 0}</div>
                    <div style={{ gridColumn: '1 / -1', background: 'linear-gradient(180deg, #1d2b40 0%, #162235 100%)', border: '1px solid #36557a', borderRadius: 10, padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <strong style={{ color: '#dbeafe' }}>Was macht der Job konkret?</strong>
                        <button
                          type="button"
                          style={{ ...polishedButtonStyle, padding: '3px 8px', fontSize: 11 }}
                          onClick={() => setCronSummaryModal({ title: `${simplifyCronJobName(selectedCronJob.job.name)} · Job-Details`, text: cronActionDetails(selectedCronJob.job) })}
                        >
                          Vollansicht
                        </button>
                      </div>
                      <div style={{ marginTop: 8, lineHeight: 1.55, fontSize: 13, color: '#e2e8f0' }}>
                        {cronActionDetailsBullets(selectedCronJob.job).map((line, idx) => (
                          <div key={`cron-detail-line-${idx}`} style={{ marginTop: idx === 0 ? 0 : 6 }}>
                            • {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.82 }}>
                    {selectedCronJob.job.lastRunSummary && (
                      <div style={{ marginTop: 6, padding: 12, borderRadius: 10, border: '1px solid #2c3e50', background: 'linear-gradient(180deg, #132234 0%, #0f1a29 100%)', color: '#dbeafe' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span aria-hidden>📝</span>
                            <strong>Letztes Ergebnis</strong>
                          </div>
                          <button
                            type="button"
                            style={{ ...polishedButtonStyle, padding: '3px 8px', fontSize: 11 }}
                            onClick={() => setCronSummaryModal({ title: `${simplifyCronJobName(selectedCronJob.job.name)} · Letztes Ergebnis`, text: beautifyCronSummary(selectedCronJob.job.lastRunSummary || '') })}
                          >
                            Vollansicht
                          </button>
                        </div>
                        <div style={{ lineHeight: 1.55, fontSize: 14, whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'hidden' }}>
                          {beautifyCronSummary(selectedCronJob.job.lastRunSummary).slice(0, 700)}
                          {beautifyCronSummary(selectedCronJob.job.lastRunSummary).length > 700 ? '…' : ''}
                        </div>
                      </div>
                    )}
                    {selectedCronJob.job.lastError && (
                      <div style={{ marginTop: 6, padding: 8, borderRadius: 8, border: '1px solid #7f1d1d', background: '#2b1111', color: '#fecaca' }}>
                        <strong>Letzter Fehler:</strong> {selectedCronJob.job.lastError}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          </>
        ) : section === 'recipes' ? (
          <>
            <div style={{ marginBottom: 12, fontSize: 13, opacity: 0.85 }}>
              Rezeptbereich im Cockpit – mit Bildvorschau und Direktzugriff auf die Rezeptdateien.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
              <article style={{ background: 'linear-gradient(180deg, #1f1f1f 0%, #191919 100%)', border: '1px solid #343434', borderRadius: 14, overflow: 'hidden' }}>
                <img
                  src="/recipes/protein-cheesecake.jpg"
                  alt="Protein-Cheesecake"
                  style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }}
                />
                <div style={{ padding: 12 }}>
                  <h3 style={{ margin: '0 0 6px 0' }}>Protein-Cheesecake (vegan)</h3>
                  <div style={{ fontSize: 13, opacity: 0.86, marginBottom: 10 }}>
                    Mit Tofu, Datteln, Cashews, Kichererbsen und Kokosmilch – ohne stimulierende Zutaten.
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => void openFilePreview('protein-cheesecake-vegan.md', 'recipes/protein-cheesecake-vegan.md', { readOnly: true, renderMarkdown: true })}>
                      Rezept öffnen
                    </button>
                    <button onClick={() => void openFilePreview('db.json', 'recipes/db.json', { readOnly: true })}>
                      Rezept-DB öffnen
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </>
        ) : section === 'fundraising' ? (
          <>
            <div style={{ marginBottom: 10, fontSize: 13, opacity: 0.85 }}>
              Hier siehst du alle freigegebenen Fundraising-Ideen aus dem Fundraisier-Ideenfundus.
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {fundraisingIdeas.length === 0 ? (
                <div style={{ opacity: 0.75 }} />
              ) : (
                fundraisingIdeas.map((idea, idx) => (
                  <article key={idea.id} style={{ border: idx === fundraisingSelectedIndex ? '1px solid #6aa2ff' : '1px solid #2f2f2f', borderRadius: 12, padding: 12, background: idx === fundraisingSelectedIndex ? 'linear-gradient(180deg, #1a2230 0%, #171d28 100%)' : 'linear-gradient(180deg, #1a1a1a 0%, #171717 100%)', boxShadow: idx === fundraisingSelectedIndex ? '0 6px 18px rgba(106,162,255,0.20)' : '0 4px 12px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <button
                        onClick={() => void openFilePreview(idea.title, idea.path, { readOnly: true, renderMarkdown: true, hidePath: true })}
                        style={{ background: 'transparent', border: 'none', padding: 0, margin: 0, color: 'inherit', fontWeight: 700, textAlign: 'left', cursor: 'pointer' }}
                        title="Idee öffnen"
                      >
                        {idea.title}
                      </button>
                      <button
                        onClick={() => void deleteFundraisingIdea(idea.sourceFile)}
                        disabled={fundraisingDeletePending === idea.sourceFile}
                        title="Idee löschen"
                        aria-label="Idee löschen"
                        style={{
                          width: 28,
                          height: 28,
                          minWidth: 28,
                          borderRadius: '999px',
                          padding: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1,
                          border: 'none',
                          background: '#2a2a2a',
                          boxShadow: 'none',
                          outline: 'none',
                          appearance: 'none',
                          WebkitAppearance: 'none',
                          fontSize: 13,
                          color: '#f3f4f6',
                          fontWeight: 700,
                        }}
                      >
                        {fundraisingDeletePending === idea.sourceFile ? '…' : '🗑️'}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </>
        ) : section === 'diary' ? (
          <>
            <div style={{ marginBottom: 10, fontSize: 13, opacity: 0.85 }}>
              Tägliche strukturierte Zusammenfassungen mit den wichtigsten Punkten und Referenzen.
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                value={diaryQuery}
                onChange={(e) => setDiaryQuery(e.target.value)}
                placeholder="Tagebuch durchsuchen (Text, Dateien, Links)"
                style={{ flex: 1, minWidth: 260, background: '#121212', border: '1px solid #3a3a3a', borderRadius: 10, padding: '10px 12px', color: '#f3f4f6' }}
              />
            </div>
            {diaryError && <div style={{ marginBottom: 10, color: '#ffb4b4', fontSize: 13 }}>{diaryError}</div>}
            <div style={{ display: 'grid', gap: 10 }}>
              {diaryLoading ? (
                <div style={{ opacity: 0.75 }}>Lade Tagebuch…</div>
              ) : visibleDiaryEntries.length === 0 ? (
                <div style={{ opacity: 0.75 }}>Keine Einträge gefunden.</div>
              ) : (
                visibleDiaryEntries.map((entry, idx) => (
                  <article key={entry.id} style={{ border: idx === diarySelectedIndex ? '1px solid #6aa2ff' : '1px solid #2f2f2f', borderRadius: 12, padding: 12, background: idx === diarySelectedIndex ? 'linear-gradient(180deg, #1a2230 0%, #171d28 100%)' : 'linear-gradient(180deg, #1b1b1b 0%, #171717 100%)', boxShadow: idx === diarySelectedIndex ? '0 6px 18px rgba(106,162,255,0.20)' : '0 4px 12px rgba(0,0,0,0.2)' }}>
                    <button
                      onClick={() => void openFilePreview(entry.title, entry.path, { readOnly: true, renderMarkdown: true, hidePath: true })}
                      style={{ background: 'transparent', border: 'none', padding: 0, margin: 0, color: 'inherit', fontWeight: 700, textAlign: 'left', cursor: 'pointer' }}
                      title="Eintrag öffnen"
                    >
                      {entry.title}
                    </button>
                    <div style={{ marginTop: 4, opacity: 0.82, fontSize: 12 }}>
                      {entry.weekday || '—'} · {entry.weatherEmoji || '🌤️'} {entry.weatherLabel || 'keine Angabe'}
                    </div>
                    {entry.excerpt ? <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>{entry.excerpt}</div> : null}
                  </article>
                ))
              )}
            </div>
          </>
        ) : section === 'memory' ? (
          <>
            <div style={{ marginBottom: 10, fontSize: 13, opacity: 0.85 }}>
              Zentrales Wissensarchiv mit 1-Klick-Öffnen. Suche über Dateiname, Pfad und Bereich.
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                ref={knowledgeSearchInputRef}
                value={knowledgeQuery}
                onChange={(e) => setKnowledgeQuery(e.target.value)}
                placeholder="Suche in Wissen & Notizen (z. B. memory, monitor, soul, deploy)"
                style={{ flex: 1, minWidth: 260 }}
              />
              {knowledgeQuery.trim() && (
                <button
                  onClick={() => {
                    if (knowledgeLoading) return
                    setKnowledgeQuery('')
                    knowledgeSearchInputRef.current?.focus()
                  }}
                  disabled={knowledgeLoading}
                  title={knowledgeLoading ? 'Bitte warten, Index lädt gerade…' : 'Suche leeren (Esc)'}
                >
                  Leeren
                </button>
              )}
              <button
                onClick={() => {
                  knowledgeAutoRefreshAtRef.current = Date.now()
                  void loadKnowledgeIndex()
                }}
                disabled={!canRefreshKnowledgeIndex}
                title={refreshKnowledgeDisabledReason || 'Wissensindex aktualisieren'}
              >
                {knowledgeLoading ? 'Indexiere…' : 'Index neu laden'}
              </button>
              {knowledgeQuery.trim() && (
                <button
                  onClick={() => {
                    if (!canRefreshKnowledgeIndex) return
                    setKnowledgeQuery('')
                    knowledgeAutoRefreshAtRef.current = Date.now()
                    void loadKnowledgeIndex()
                    knowledgeSearchInputRef.current?.focus()
                  }}
                  disabled={!canRefreshKnowledgeIndex}
                  title={refreshKnowledgeDisabledReason || 'Suche leeren und Index neu laden'}
                >
                  Reset + Reload
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, opacity: 0.68, marginTop: -4, marginBottom: 10 }}>
              Shortcuts: /, Cmd/Ctrl+K oder Cmd/Ctrl+F fokussiert die Suche · Esc leert die Suche · Shift+Enter (ohne Ctrl/Cmd/Alt) lädt den Index neu · Reset + Reload leert Suche und lädt neu
            </div>
            {knowledgeError && (
              <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #7f1d1d', background: '#2b1111', color: '#fecaca', fontSize: 13 }}>
                {knowledgeError}
              </div>
            )}
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
              Treffer: {filteredKnowledgeEntries.length}
            </div>
            <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
              {groupedKnowledgeEntries.map(([groupName, rows]) => (
                <div key={groupName} style={{ background: '#1f1f1f', border: '1px solid #343434', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>{groupName}</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {rows.map((entry) => (
                      <div
                        key={`${groupName}-${entry.path}`}
                        style={{ background: '#181818', border: '1px solid #2f2f2f', borderRadius: 8, padding: 10, cursor: 'pointer' }}
                        onClick={() => { void openFilePreview(entry.name, entry.path) }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                          <strong>{entry.name}</strong>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              void openFilePreview(entry.name, entry.path)
                            }}
                            style={{ fontSize: 12 }}
                          >
                            Öffnen
                          </button>
                        </div>
                        <code style={{ display: 'block', marginTop: 6, fontSize: 11, opacity: 0.82, wordBreak: 'break-all' }}>{entry.relPath}</code>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!knowledgeLoading && groupedKnowledgeEntries.length === 0 && (
                <div style={{ opacity: 0.75 }}>
                  Keine Treffer für deine Suche.
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Zusätzliche Wissenseinträge aus der Entity-Datenbank:</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {entities.map((e) => (
                <div key={e.id} style={{ background: '#1f1f1f', border: '1px solid #343434', borderRadius: 10, padding: 10 }}>
                  <strong>{e.title}</strong>
                  <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>Owner: {e.owner || '-'} · Status: {e.status || '-'} · ToC: {e.tocAxis || '-'}</div>
                  {e.notes && <div style={{ fontSize: 12, opacity: 0.88, marginTop: 4 }}>{e.notes}</div>}
                </div>
              ))}
              {entities.length === 0 && <div style={{ opacity: 0.7 }}>Noch keine zusätzlichen Wissenseinträge.</div>}
            </div>
          </>
        ) : section === 'health' ? (
          <>
            <div style={{ fontSize: 13, opacity: 0.86, marginBottom: 12 }}>
              Aktuelle Problemzonen aus <code>Obsidian / Health (Physio/Problemzonen)</code>.
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {healthProblemZones.map((zone) => {
                const detail = healthZoneDetails[zone.path]
                const loading = !!healthZoneLoading[zone.path]
                return (
                  <div key={zone.path} style={{ background: 'linear-gradient(180deg, #1f1f1f, #1a1a1a)', border: '1px solid #343434', borderRadius: 12, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>{zone.title}</div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{zone.relPath}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {detail?.status && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, border: '1px solid #7f1d1d', color: '#fecaca' }}>Status: {detail.status}</span>}
                        {detail?.priority && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, border: '1px solid #92400e', color: '#fde68a' }}>Prio: {detail.priority}</span>}
                        {detail?.side && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, border: '1px solid #1d4ed8', color: '#bfdbfe' }}>Seite: {detail.side}</span>}
                      </div>
                    </div>

                    {loading ? (
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 10 }}>Lade Details…</div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10 }}>
                        <div style={{ background: '#171717', border: '1px solid #2f2f2f', borderRadius: 10, padding: 10 }}>
                          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>Trigger</div>
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.4 }}>
                            {(detail?.triggers || []).slice(0, 4).map((item) => <li key={`t-${zone.path}-${item}`}>{item}</li>)}
                            {(detail?.triggers || []).length === 0 && <li style={{ opacity: 0.65 }}>Keine Details</li>}
                          </ul>
                        </div>
                        <div style={{ background: '#171717', border: '1px solid #2f2f2f', borderRadius: 10, padding: 10 }}>
                          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>Entlastung</div>
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.4 }}>
                            {(detail?.relief || []).slice(0, 4).map((item) => <li key={`r-${zone.path}-${item}`}>{item}</li>)}
                            {(detail?.relief || []).length === 0 && <li style={{ opacity: 0.65 }}>Keine Details</li>}
                          </ul>
                        </div>
                        <div style={{ background: '#171717', border: '1px solid #2f2f2f', borderRadius: 10, padding: 10 }}>
                          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>Selbstchecks</div>
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.4 }}>
                            {(detail?.tests || []).slice(0, 4).map((item) => <li key={`s-${zone.path}-${item}`}>{item}</li>)}
                            {(detail?.tests || []).length === 0 && <li style={{ opacity: 0.65 }}>Keine Details</li>}
                          </ul>
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                      <button onClick={() => { void openFilePreview(zone.name, zone.path) }} style={{ fontSize: 12 }}>Details öffnen</button>
                    </div>
                  </div>
                )
              })}
              {!knowledgeLoading && healthProblemZones.length === 0 && (
                <div style={{ opacity: 0.75 }}>Keine Problemzonen gefunden unter <code>Physio/Problemzonen</code>.</div>
              )}
            </div>
          </>
        ) : section === 'files' ? (
          <>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
              Kuratierte Schnellzugriffe auf wichtige Arbeitsdateien (deine + meine Kernfiles).
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {importantFiles.map((group) => (
                <div key={group.group} style={{ background: '#1f1f1f', border: '1px solid #343434', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>{group.group}</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {group.items.map((item) => {
                      const previewable = canPreviewFile(item.path)
                      return (
                        <div
                          key={`${group.group}-${item.name}`}
                          style={{ background: '#181818', border: '1px solid #2f2f2f', borderRadius: 8, padding: 10, cursor: previewable ? 'pointer' : 'default' }}
                          onClick={() => {
                            if (previewable) void openFilePreview(item.name, item.path)
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                            <strong>{item.name}</strong>
                            <div style={{ display: 'flex', gap: 10 }}>
                              {previewable && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void openFilePreview(item.name, item.path)
                                  }}
                                  style={{ fontSize: 12 }}
                                >
                                  Anzeigen
                                </button>
                              )}
                              {item.href && (
                                <a onClick={(e) => e.stopPropagation()} href={item.href} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#f59e0b', textDecoration: 'underline' }}>
                                  Öffnen
                                </a>
                              )}
                            </div>
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>{item.note}</div>
                          <code style={{ display: 'block', marginTop: 6, fontSize: 11, opacity: 0.8, wordBreak: 'break-all' }}>{item.path}</code>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 8 }}>
              {entities.map((e) => (
                <div key={e.id} style={{ background: '#1f1f1f', border: '1px solid #343434', borderRadius: 10, padding: 10 }}>
                  <strong>{e.title}</strong>
                  <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>Owner: {e.owner || '-'} · Status: {e.status || '-'} · ToC: {e.tocAxis || '-'}</div>
                  {e.kpis && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>KPI: {e.kpis}</div>}
                  {(
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        disabled={!!entityActionPending[e.id]}
                        onClick={() => removeEntityById(e.id, 'false')}
                        style={{ borderColor: '#7f1d1d' }}
                      >
                        {entityActionPending[e.id] ? 'Aussortiere…' : 'Falsch'}
                      </button>
                      <button
                        disabled={!!entityActionPending[e.id]}
                        onClick={() => removeEntityById(e.id, 'duplicate')}
                        style={{ borderColor: '#92400e' }}
                      >
                        {entityActionPending[e.id] ? 'Aussortiere…' : 'Duplikat'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {entities.length === 0 && <div style={{ opacity: 0.7 }}>Noch keine Einträge.</div>}
            </div>
          </>
        )}


        {cronSummaryModal && (
          <div
            onClick={() => setCronSummaryModal(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1250 }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: 'min(980px, 96vw)', maxHeight: '90vh', overflow: 'auto', background: '#101215', border: '1px solid #31363d', borderRadius: 10, padding: 14 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10 }}>
                <div style={{ fontWeight: 700 }}>{cronSummaryModal.title}</div>
                <button type="button" style={polishedButtonStyle} onClick={() => setCronSummaryModal(null)}>Schliessen</button>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.65, color: '#e5e7eb', background: '#0b0d10', border: '1px solid #2f3640', borderRadius: 8, padding: 12 }}>
                {cronSummaryModal.text.split('\n').map((line, idx) => {
                  const trimmed = line.trim()
                  if (!trimmed) return <div key={`sum-empty-${idx}`} style={{ height: 8 }} />
                  if (trimmed.startsWith('- ')) return <div key={`sum-li-${idx}`} style={{ marginLeft: 8 }}>• {renderInlineMarkdown(trimmed.slice(2))}</div>
                  if (trimmed.match(/^\d+[\).]\s+/)) return <div key={`sum-ol-${idx}`} style={{ marginLeft: 4 }}>{renderInlineMarkdown(trimmed)}</div>
                  return <p key={`sum-p-${idx}`} style={{ margin: '6px 0' }}>{renderInlineMarkdown(line)}</p>
                })}
              </div>
            </div>
          </div>
        )}

        {filePreview.open && (
          <div
            onClick={closeFilePreview}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: 'min(1100px, 96vw)', maxHeight: '90vh', overflow: 'auto', background: '#101215', border: '1px solid #31363d', borderRadius: 10, padding: 12 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10 }}>
                {!filePreview.hidePath ? (
                  <div>
                    <div style={{ fontWeight: 700 }}>{filePreview.name || 'Datei-Vorschau'}</div>
                    <div style={{ fontSize: 11, opacity: 0.75 }}>{filePreview.path}</div>
                  </div>
                ) : <div />}
                <div style={{ display: 'flex', gap: 8 }}>
                  {!filePreview.readOnly && (
                    <button
                      onClick={() => { void saveFilePreview() }}
                      disabled={!canSaveFilePreview}
                      title={saveFilePreviewDisabledReason || 'Speichern (Shortcut: Cmd/Ctrl+S)'}
                    >
                      {filePreview.saving ? 'Speichere…' : 'Speichern'}
                    </button>
                  )}
                  <button onClick={closeFilePreview} disabled={!!filePreview.saving} title={filePreview.saving ? 'Bitte warten, Speichern läuft…' : 'Vorschau schliessen'}>Schliessen</button>
                </div>
              </div>
              {filePreview.loading && <div style={{ opacity: 0.8 }}>Lädt…</div>}
              {!filePreview.loading && filePreview.error && <div style={{ color: '#fca5a5', marginBottom: 8 }}>{filePreview.error}</div>}
              {!filePreview.loading && (
                <>
                  {filePreview.renderMarkdown ? (
                    <div style={{ width: '100%', minHeight: '65vh', background: '#0b0d10', color: '#f5f5f5', border: '1px solid #31363d', borderRadius: 8, padding: 14, fontSize: 14, lineHeight: 1.6, overflow: 'auto' }}>
                      {fileDraft.split('\n').map((line, idx) => {
                        const trimmed = line.trim()
                        if (!trimmed) return <div key={`md-empty-${idx}`} style={{ height: 8 }} />
                        if (trimmed.startsWith('### ')) return <h3 key={`md-h3-${idx}`} style={{ margin: '10px 0 6px' }}>{renderInlineMarkdown(trimmed.slice(4))}</h3>
                        if (trimmed.startsWith('## ')) return <h2 key={`md-h2-${idx}`} style={{ margin: '12px 0 8px' }}>{renderInlineMarkdown(trimmed.slice(3))}</h2>
                        if (trimmed.startsWith('# ')) return <h1 key={`md-h1-${idx}`} style={{ margin: '14px 0 10px', fontSize: 22 }}>{renderInlineMarkdown(trimmed.slice(2))}</h1>
                        if (trimmed.startsWith('- ')) return <div key={`md-li-${idx}`} style={{ marginLeft: 8 }}>• {renderInlineMarkdown(trimmed.slice(2))}</div>
                        return <p key={`md-p-${idx}`} style={{ margin: '6px 0' }}>{renderInlineMarkdown(line)}</p>
                      })}
                    </div>
                  ) : (
                    <textarea
                      value={fileDraft}
                      disabled={filePreview.loading || !!filePreview.saving || !!filePreview.readOnly}
                      onChange={(e) => {
                        setFileDraft(e.target.value)
                        setFilePreview((prev) => (prev.error ? { ...prev, error: undefined } : prev))
                      }}
                      title={filePreview.saving ? 'Bearbeitung ist während dem Speichern kurz pausiert.' : undefined}
                      style={{ width: '100%', minHeight: '65vh', resize: 'vertical', background: '#0b0d10', color: '#f5f5f5', border: '1px solid #31363d', borderRadius: 8, padding: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12, lineHeight: 1.45, opacity: filePreview.saving ? 0.75 : 1 }}
                    />
                  )}
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.78 }}>
                    {filePreview.readOnly
                      ? 'Read-only Vorschau.'
                      : fileDraft === (filePreview.content || '')
                        ? 'Keine ungespeicherten Änderungen.'
                        : isOffline
                          ? 'Ungespeicherte Änderungen vorhanden (offline – Speichern derzeit nicht möglich).'
                          : 'Ungespeicherte Änderungen vorhanden.'}
                  </div>
                  {!filePreview.readOnly && (
                    <div style={{ marginTop: 4, fontSize: 11, opacity: 0.62 }}>
                      Shortcut: Cmd/Ctrl+S speichert die Datei.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}



