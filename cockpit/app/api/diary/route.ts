import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

type DiaryRow = {
  id: string
  title: string
  date: string
  weekday: string
  weatherEmoji: string
  weatherLabel: string
  path: string
  excerpt: string
  content: string
}

function formatDateCH(isoDate: string) {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return isoDate
  return `${m[3]}.${m[2]}.${m[1]}`
}

function pickKeywords(raw: string) {
  const lines = raw.split(/\r?\n/).map((line) => line.trim())
  const bullets = lines
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^-\s+/, ''))
    .filter(Boolean)

  return bullets.slice(0, 4).join(' · ')
}

function weekdayDE(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
  return new Intl.DateTimeFormat('de-CH', { weekday: 'long', timeZone: 'Europe/Zurich' }).format(dt)
}

function inferWeather(raw: string) {
  const t = raw.toLowerCase()
  if (/(regen|nass|schauer|gewitter)/.test(t)) return { emoji: '🌧️', label: 'Regen' }
  if (/(schnee|frost|eis|kalt)/.test(t)) return { emoji: '❄️', label: 'Kalt/Schnee' }
  if (/(sonn|klar|warm|heiss)/.test(t)) return { emoji: '☀️', label: 'Sonnig' }
  if (/(bewölk|wolk|grau)/.test(t)) return { emoji: '☁️', label: 'Bewölkt' }
  return { emoji: '🌤️', label: 'keine Angabe' }
}

const noStoreHeaders = {
  'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
}

function diaryBaseDir() {
  return path.join(process.cwd(), '..', 'diary')
}

export async function GET() {
  try {
    const baseDir = diaryBaseDir()
    const files = await readdir(baseDir).catch(() => [])
    const mdFiles = files.filter((f) => f.toLowerCase().endsWith('.md'))

    const rows: DiaryRow[] = []
    for (const file of mdFiles) {
      const fullPath = path.join(baseDir, file)
      const raw = await readFile(fullPath, 'utf8').catch(() => '')
      if (!raw) continue

      const date = file.replace(/\.md$/i, '')
      const title = formatDateCH(date)
      const excerpt = pickKeywords(raw)
      const weather = inferWeather(raw)

      rows.push({
        id: date,
        title,
        date,
        weekday: weekdayDE(date),
        weatherEmoji: weather.emoji,
        weatherLabel: weather.label,
        path: `../diary/${file}`,
        excerpt,
        content: raw,
      })
    }

    rows.sort((a, b) => b.date.localeCompare(a.date))

    return NextResponse.json({ entries: rows }, { headers: noStoreHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tagebuch konnte nicht geladen werden'
    return NextResponse.json({ error: message }, { status: 500, headers: noStoreHeaders })
  }
}
