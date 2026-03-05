import http from 'node:http'
import { URL } from 'node:url'

import { handler as homeDataHandler } from '../netlify/functions/home-data.mjs'
import { handler as feedbackSubmitHandler } from '../netlify/functions/feedback-submit.mjs'
import { handler as reviewDecisionHandler } from '../netlify/functions/review-decision.mjs'
import { handler as reviewFastlaneTagHandler } from '../netlify/functions/review-fastlane-tag.mjs'
import { handler as reviewStatusHandler } from '../netlify/functions/review-status.mjs'

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '127.0.0.1'

const routes = {
  '/api/home-data': homeDataHandler,
  '/api/feedback-submit': feedbackSubmitHandler,
  '/api/review-decision': reviewDecisionHandler,
  '/api/review-fastlane-tag': reviewFastlaneTagHandler,
  '/api/review-status': reviewStatusHandler,
}

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  req.on('error', reject)
})

const send = (res, statusCode = 200, headers = {}, body = '') => {
  res.writeHead(statusCode, headers)
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const handler = routes[url.pathname]

    if (!handler) {
      send(res, 404, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify({ ok: false, error: 'Not Found' }))
      return
    }

    const rawBody = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
      ? ''
      : await readBody(req)

    const event = {
      httpMethod: req.method,
      headers: req.headers,
      body: rawBody || '',
      path: url.pathname,
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    }

    const result = await handler(event)
    const statusCode = Number(result?.statusCode || 200)
    const headers = result?.headers || { 'content-type': 'application/json; charset=utf-8' }
    const body = typeof result?.body === 'string' ? result.body : JSON.stringify(result?.body ?? '')

    send(res, statusCode, headers, body)
  } catch (error) {
    send(
      res,
      500,
      { 'content-type': 'application/json; charset=utf-8' },
      JSON.stringify({ ok: false, error: error?.message || 'Internal Server Error' }),
    )
  }
})

server.listen(PORT, HOST, () => {
  console.log(`API server listening on http://${HOST}:${PORT}`)
})
