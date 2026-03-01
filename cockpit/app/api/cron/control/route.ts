import { execFile } from 'node:child_process'
import os from 'node:os'
import { promisify } from 'node:util'
import { NextResponse } from 'next/server'

const execFileAsync = promisify(execFile)

const noStoreHeaders = {
  'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
}

function runtimeEnv() {
  return {
    ...process.env,
    PATH: `${process.env.PATH || ''}:/opt/homebrew/bin:/usr/local/bin`,
    HOME: process.env.HOME || os.homedir(),
  }
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json().catch(() => ({}))) as { jobId?: string; action?: string }
    const rawJobId = String(payload?.jobId || '').trim()
    const jobId = rawJobId.includes('@') ? rawJobId.split('@')[0] : rawJobId
    const action = String(payload?.action || '').trim().toLowerCase()

    if (!rawJobId) return NextResponse.json({ ok: false, error: 'jobId missing' }, { status: 400, headers: noStoreHeaders })
    if (!action) return NextResponse.json({ ok: false, error: 'action missing' }, { status: 400, headers: noStoreHeaders })

    if (jobId.startsWith('launchd:')) {
      return NextResponse.json({ ok: false, error: 'Aktion nur für OpenClaw-Cronjobs verfügbar (nicht für launchd/System-Jobs).' }, { status: 400, headers: noStoreHeaders })
    }

    const args = action === 'pause'
      ? ['cron', 'disable', jobId]
      : action === 'delete'
        ? ['cron', 'rm', jobId]
        : null

    if (!args) {
      return NextResponse.json({ ok: false, error: `unsupported action: ${action}` }, { status: 400, headers: noStoreHeaders })
    }

    const { stdout, stderr } = await execFileAsync('openclaw', args, {
      env: runtimeEnv(),
      timeout: 120_000,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    })

    return NextResponse.json({ ok: true, jobId, rawJobId, action, stdout, stderr }, { headers: noStoreHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cron-Aktion fehlgeschlagen'
    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: noStoreHeaders })
  }
}
