import { NextRequest, NextResponse } from 'next/server'
import { addTask, listTasks, patchTask } from '@/lib/db'

const noStoreHeaders = {
  'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
}

function jsonNoStore<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...noStoreHeaders,
      ...(init?.headers || {}),
    },
  })
}

const maxTaskTitleLength = 180

function sanitizeTaskTitle(raw: unknown): string {
  const title = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!title) throw new Error('title fehlt')
  if (title.length > maxTaskTitleLength) {
    throw new Error(`title zu lang (max. ${maxTaskTitleLength} Zeichen)`)
  }

  return title
}

function normalizeTitle(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de-CH')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDeadline(raw: unknown): string | undefined {
  if (typeof raw === 'undefined' || raw === null) return undefined

  const deadline = String(raw).trim()
  if (!deadline) return undefined

  const dateOnlyMatch = deadline.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnlyMatch) {
    const [, yearRaw, monthRaw, dayRaw] = dateOnlyMatch
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    const day = Number(dayRaw)

    const parsed = new Date(Date.UTC(year, month - 1, day))
    const isSameDate =
      parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day

    if (!isSameDate) {
      throw new Error('Ungueltiges deadline-Format (Datum existiert nicht)')
    }

    return `${yearRaw}-${monthRaw}-${dayRaw}`
  }

  const parsed = new Date(deadline)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Ungueltiges deadline-Format')
  }

  return parsed.toISOString()
}

export async function GET() {
  return jsonNoStore(listTasks())
}

export async function POST(req: NextRequest) {
  let body: any

  try {
    body = await req.json()
  } catch {
    return jsonNoStore({ error: 'Ungueltiges JSON im Request-Body' }, { status: 400 })
  }

  let title: string
  try {
    title = sanitizeTaskTitle(body?.title)
  } catch (error) {
    return jsonNoStore({ error: (error as Error).message }, { status: 400 })
  }

  let deadline: string | undefined
  try {
    deadline = parseDeadline(body?.deadline)
  } catch (error) {
    return jsonNoStore({ error: (error as Error).message }, { status: 400 })
  }

  const normalizedTitle = normalizeTitle(title)
  const status = ['open', 'doing', 'waiting', 'done'].includes(body?.status) ? body.status : 'open'
  const priority = ['low', 'med', 'high'].includes(body.priority) ? body.priority : 'med'
  const assignee = ['Tobi', 'ALF', 'Beide', 'main', 'tif-coding', 'tif-health', 'tif-medien', 'tif-politik', 'tif-text', 'tif-website'].includes(body?.assignee)
    ? body.assignee
    : 'tif-website'
  const impact = ['low', 'med', 'high'].includes(body.impact) ? body.impact : 'med'
  const area = ['medien', 'politik', 'buch', 'ops'].includes(body.area) ? body.area : 'ops'
  const tocAxis = ['wertschoepfung', 'weltbild', 'repraesentation'].includes(body.tocAxis) ? body.tocAxis : undefined

  const sameTitleTasks = listTasks().filter((task) => normalizeTitle(task.title) === normalizedTitle)
  const existingOpen = sameTitleTasks.find((task) => task.status !== 'done')
  if (existingOpen) {
    return jsonNoStore({ ...existingOpen, duplicate: true }, { status: 200 })
  }

  const latestDone = sameTitleTasks.find((task) => task.status === 'done')
  if (latestDone) {
    const reopened = patchTask(latestDone.id, {
      status,
      priority,
      assignee,
      impact,
      area,
      deadline,
      tocAxis,
    })
    return jsonNoStore({ ...reopened, reopened: true }, { status: 200 })
  }

  const task = addTask({
    title,
    status,
    priority,
    assignee,
    impact,
    area,
    deadline,
    tocAxis,
  })

  return jsonNoStore(task, { status: 201 })
}
