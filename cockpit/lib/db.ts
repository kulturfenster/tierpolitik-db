import fs from 'node:fs'
import path from 'node:path'

export type TaskStatus = 'open' | 'doing' | 'waiting' | 'done'
export type TaskPriority = 'low' | 'med' | 'high'
export type Assignee = 'Tobi' | 'ALF' | 'Beide' | 'main' | 'tif-coding' | 'tif-health' | 'tif-medien' | 'tif-politik' | 'tif-text' | 'tif-website'
export type Impact = 'low' | 'med' | 'high'
export type Area = 'medien' | 'politik' | 'buch' | 'ops'
export type TocAxis = 'wertschoepfung' | 'weltbild' | 'repraesentation'

export type Task = {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  assignee: Assignee
  impact?: Impact
  area?: Area
  deadline?: string
  tocAxis?: TocAxis
  createdAt: string
  updatedAt: string
}

export type EntityType = 'project' | 'client' | 'memory' | 'doc' | 'person' | 'office' | 'content'
export type EntityStatus = 'idea' | 'brief' | 'draft' | 'review' | 'approved' | 'published' | 'repurposed'

export type Entity = {
  id: string
  type: EntityType
  title: string
  notes?: string
  owner?: Assignee
  status?: EntityStatus
  kpis?: string
  tocAxis?: TocAxis
  createdAt: string
  updatedAt: string
}

export type Link = {
  id: string
  from: string
  to: string
  relation: string
  createdAt: string
}

export type RadarStatus = 'new' | 'accepted' | 'watchlist' | 'rejected'

export type RadarItem = {
  id: string
  title: string
  source: string
  url: string
  lane: 'medienarbeit' | 'politik' | 'buchprojekt'
  kind: 'news' | 'vorstoss' | 'kampagne' | 'analyse'
  score: number
  impact: Impact
  urgency: 'low' | 'med' | 'high'
  tocAxis?: TocAxis
  status: RadarStatus
  createdAt: string
  updatedAt: string
}

type DB = { tasks: Task[]; entities: Entity[]; links: Link[]; radar: RadarItem[] }

const DB_PATH = path.resolve(process.cwd(), 'data/db.json')

function loadDb(): DB {
  const init: DB = { tasks: [], entities: [], links: [], radar: [] }

  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
    fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2))
    return init
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) as Partial<DB>
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      links: Array.isArray(parsed.links) ? parsed.links : [],
      radar: Array.isArray(parsed.radar) ? parsed.radar : [],
    }
  } catch {
    const corruptPath = `${DB_PATH}.corrupt.${new Date().toISOString().replace(/[:.]/g, '-')}`
    fs.copyFileSync(DB_PATH, corruptPath)
    fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2))
    return init
  }
}

function saveDb(db: DB) {
  const serialized = `${JSON.stringify(db, null, 2)}\n`
  const tmpPath = `${DB_PATH}.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}.tmp`

  fs.writeFileSync(tmpPath, serialized, 'utf8')

  const maxAttempts = 4
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      fs.renameSync(tmpPath, DB_PATH)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      const isRetriable = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      if (!isRetriable || attempt === maxAttempts) {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
        } catch {
          // noop: best effort cleanup
        }
        throw error
      }

      // Windows can keep a short file lock (antivirus/indexer). Brief sync backoff keeps writes stable.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * attempt)
    }
  }
}

function compareByUpdatedAtThenTitle<T extends { updatedAt: string; title?: string }>(a: T, b: T) {
  const updatedAtDelta = b.updatedAt.localeCompare(a.updatedAt)
  if (updatedAtDelta !== 0) return updatedAtDelta

  return (a.title || '').localeCompare(b.title || '', 'de-CH')
}

export function listTasks() {
  return loadDb().tasks.sort(compareByUpdatedAtThenTitle)
}

export function addTask(input: Pick<Task, 'title' | 'priority' | 'assignee'> & Partial<Pick<Task, 'status' | 'impact' | 'area' | 'deadline' | 'tocAxis'>>) {
  const now = new Date().toISOString()
  const task: Task = {
    id: `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: input.title,
    priority: input.priority,
    assignee: input.assignee,
    impact: input.impact,
    area: input.area,
    deadline: input.deadline,
    tocAxis: input.tocAxis,
    status: input.status ?? 'open',
    createdAt: now,
    updatedAt: now,
  }
  const db = loadDb()
  db.tasks.push(task)
  saveDb(db)
  return task
}

export function patchTask(id: string, patch: Partial<Pick<Task, 'status' | 'priority' | 'assignee' | 'impact' | 'area' | 'deadline' | 'tocAxis'>>) {
  const db = loadDb()
  const idx = db.tasks.findIndex((t) => t.id === id)
  if (idx < 0) throw new Error('Task nicht gefunden')

  const cur = db.tasks[idx]
  const hasChanges = Object.entries(patch).some(([key, value]) => cur[key as keyof Task] !== value)

  if (!hasChanges) {
    return cur
  }

  db.tasks[idx] = { ...cur, ...patch, updatedAt: new Date().toISOString() }
  saveDb(db)
  return db.tasks[idx]
}

export function listEntities(type?: EntityType) {
  const db = loadDb()
  const rows = type ? db.entities.filter((e) => e.type === type) : db.entities
  return rows.sort(compareByUpdatedAtThenTitle)
}

export function addEntity(input: Pick<Entity, 'type' | 'title'> & Partial<Pick<Entity, 'notes' | 'owner' | 'status' | 'kpis' | 'tocAxis'>>) {
  const now = new Date().toISOString()
  const entity: Entity = {
    id: `${input.type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type: input.type,
    title: input.title,
    notes: input.notes,
    owner: input.owner,
    status: input.status,
    kpis: input.kpis,
    tocAxis: input.tocAxis,
    createdAt: now,
    updatedAt: now,
  }
  const db = loadDb()
  db.entities.push(entity)
  saveDb(db)
  return entity
}

export function patchEntity(
  id: string,
  patch: Partial<Pick<Entity, 'title' | 'notes' | 'owner' | 'status' | 'kpis' | 'tocAxis'>>,
) {
  const db = loadDb()
  const idx = db.entities.findIndex((e) => e.id === id)
  if (idx < 0) throw new Error('Entity nicht gefunden')

  const cur = db.entities[idx]
  const hasChanges = Object.entries(patch).some(([key, value]) => cur[key as keyof Entity] !== value)

  if (!hasChanges) {
    return cur
  }

  db.entities[idx] = { ...cur, ...patch, updatedAt: new Date().toISOString() }
  saveDb(db)
  return db.entities[idx]
}

export function removeEntity(id: string) {
  const db = loadDb()
  const idx = db.entities.findIndex((e) => e.id === id)
  if (idx < 0) throw new Error('Entity nicht gefunden')
  const [removed] = db.entities.splice(idx, 1)
  db.links = db.links.filter((l) => l.from !== id && l.to !== id)
  saveDb(db)
  return removed
}

export function listAllLinkables() {
  const db = loadDb()
  return [
    ...db.tasks.map((t) => ({ id: t.id, label: `task: ${t.title}` })),
    ...db.entities.map((e) => ({ id: e.id, label: `${e.type}: ${e.title}` })),
  ]
}

export function listLinks() {
  return loadDb().links
}

export function addLink(input: Pick<Link, 'from' | 'to' | 'relation'>) {
  const db = loadDb()
  const ids = new Set([...db.tasks.map((t) => t.id), ...db.entities.map((e) => e.id)])
  if (!ids.has(input.from) || !ids.has(input.to)) throw new Error('from/to nicht gefunden')
  const link: Link = {
    id: `link_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    from: input.from,
    to: input.to,
    relation: input.relation || 'related',
    createdAt: new Date().toISOString(),
  }
  db.links.push(link)
  saveDb(db)
  return link
}

export function listRadar() {
  const statusRank: Record<RadarStatus, number> = {
    new: 0,
    watchlist: 1,
    accepted: 2,
    rejected: 3,
  }
  const urgencyRank: Record<RadarItem['urgency'], number> = {
    high: 0,
    med: 1,
    low: 2,
  }

  return loadDb().radar.sort((a, b) => {
    const byStatus = statusRank[a.status] - statusRank[b.status]
    if (byStatus !== 0) return byStatus

    const byUrgency = urgencyRank[a.urgency] - urgencyRank[b.urgency]
    if (byUrgency !== 0) return byUrgency

    const byScore = b.score - a.score
    if (byScore !== 0) return byScore

    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

export function addRadarItem(input: Pick<RadarItem, 'title' | 'source' | 'url' | 'lane' | 'kind' | 'score' | 'impact' | 'urgency' | 'status'> & Partial<Pick<RadarItem, 'tocAxis'>>) {
  const now = new Date().toISOString()
  const item: RadarItem = {
    id: `radar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: input.title,
    source: input.source,
    url: input.url,
    lane: input.lane,
    kind: input.kind,
    score: input.score,
    impact: input.impact,
    urgency: input.urgency,
    tocAxis: input.tocAxis,
    status: input.status,
    createdAt: now,
    updatedAt: now,
  }
  const db = loadDb()
  db.radar.push(item)
  saveDb(db)
  return item
}

export function patchRadarItem(
  id: string,
  patch: Partial<Pick<RadarItem, 'title' | 'source' | 'url' | 'kind' | 'status' | 'score' | 'impact' | 'urgency' | 'tocAxis' | 'lane'>>,
) {
  const db = loadDb()
  const idx = db.radar.findIndex((r) => r.id === id)
  if (idx < 0) throw new Error('Radar-Item nicht gefunden')

  const cur = db.radar[idx]
  const hasChanges = Object.entries(patch).some(([key, value]) => cur[key as keyof RadarItem] !== value)

  if (!hasChanges) {
    return cur
  }

  db.radar[idx] = { ...cur, ...patch, updatedAt: new Date().toISOString() }
  saveDb(db)
  return db.radar[idx]
}

export function getDbCountsSnapshot() {
  const db = loadDb()

  return {
    tasks: db.tasks.length,
    entities: db.entities.length,
    radar: db.radar.length,
  }
}

export function getRadarStats() {
  const rows = loadDb().radar
  const total = rows.length
  const accepted = rows.filter((r) => r.status === 'accepted').length
  const watchlist = rows.filter((r) => r.status === 'watchlist').length
  const rejected = rows.filter((r) => r.status === 'rejected').length
  const fresh = rows.filter((r) => r.status === 'new').length
  const highScore = rows.filter((r) => r.score >= 80).length
  const lanePolitik = rows.filter((r) => r.lane === 'politik').length
  const laneMedien = rows.filter((r) => r.lane === 'medienarbeit').length
  const laneBuch = rows.filter((r) => r.lane === 'buchprojekt').length
  return { total, accepted, watchlist, rejected, fresh, highScore, lanePolitik, laneMedien, laneBuch }
}
