#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const workspace = process.cwd()
const now = new Date()
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(now)

const memoryPath = path.join(workspace, 'memory', `${date}.md`)
const outDir = path.join(workspace, 'diary')
const outPath = path.join(outDir, `${date}.md`)

function unique(items) {
  return [...new Set(items)]
}

function collectLinks(text) {
  const web = unique(Array.from(text.matchAll(/https?:\/\/[^\s)\]]+/g)).map((m) => m[0].replace(/[.,;]$/, '')))
  const files = unique(
    Array.from(text.matchAll(/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:md|json|tsx|ts|js|mjs|cjs|jpg|jpeg|png|pdf)/g)).map((m) => m[0]),
  )
  return { web, files }
}

function topBullets(text) {
  const bullets = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.replace(/^-\s+/, ''))
  return unique(bullets).slice(0, 12)
}

async function main() {
  await mkdir(outDir, { recursive: true })

  let memoryRaw = ''
  try {
    memoryRaw = await readFile(memoryPath, 'utf8')
  } catch {
    memoryRaw = ''
  }

  const bullets = topBullets(memoryRaw)
  const { web, files } = collectLinks(memoryRaw)

  const md = [
    `# Tagebuch ${date}`,
    '',
    '## Kurzfazit',
    bullets.length ? bullets.slice(0, 3).map((b) => `- ${b}`).join('\n') : '- Kein verwertbarer Tageskontext in memory-Datei gefunden.',
    '',
    '## Strukturierte Zusammenfassung',
    bullets.length ? bullets.map((b) => `- ${b}`).join('\n') : '- (leer)',
    '',
    '## Relevante Dateien',
    files.length ? files.map((f) => `- \`${f}\``).join('\n') : '- (keine erkannt)',
    '',
    '## Relevante Weblinks',
    web.length ? web.map((u) => `- ${u}`).join('\n') : '- (keine erkannt)',
    '',
    '## Quelle',
    `- memory/${date}.md`,
    '',
  ].join('\n')

  await writeFile(outPath, md, 'utf8')
  console.log(`Wrote ${path.relative(workspace, outPath)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
