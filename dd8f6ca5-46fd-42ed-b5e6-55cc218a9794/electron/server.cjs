// SPDX-License-Identifier: Apache-2.0
// ATLAS desktop sidecar server.
//
// Runs inside the Electron main process (no child process, no external
// runtime). It serves the built SPA from `dist/` and implements the
// `/api/projects` CRUD surface backed by a plain JSON file, so the desktop
// build needs neither Prisma nor a platform-specific native module.

const http = require('node:http')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
}

const DEFAULT_PROJECT = {
  description: null,
  projectType: 'blank',
  widthMeters: 100,
  heightMeters: 100,
  mapImageUrl: null,
  calibration: null,
  layers: '[]',
  elements: '[]',
  checklist: '[]',
  zones: '[]',
  worstCase: null,
  designBasis: null,
  designData: null,
  ringDesign: null,
  owner: null,
  userId: null,
}

const CUID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

function newId() {
  let out = 'c'
  const bytes = crypto.randomBytes(24)
  for (let i = 0; i < 24; i += 1) out += CUID_ALPHABET[bytes[i] % CUID_ALPHABET.length]
  return out
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    // Project documents carry base64 map images; allow generous payloads.
    if (size > 200 * 1024 * 1024) throw new Error('payload_too_large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function createStore(file) {
  let cache = null
  let writeQueue = Promise.resolve()

  async function load() {
    if (cache) return cache
    try {
      const raw = await fsp.readFile(file, 'utf8')
      const parsed = JSON.parse(raw)
      cache = Array.isArray(parsed) ? parsed : []
    } catch {
      cache = []
    }
    return cache
  }

  function persist() {
    const snapshot = JSON.stringify(cache, null, 0)
    writeQueue = writeQueue.then(async () => {
      await fsp.mkdir(path.dirname(file), { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      await fsp.writeFile(tmp, snapshot, 'utf8')
      await fsp.rename(tmp, file)
    }).catch((err) => {
      console.error('[atlas] failed to persist projects:', err)
    })
    return writeQueue
  }

  return { load, persist, get cache() { return cache } }
}

function asListResponse(items) {
  return { items, total: items.length }
}

async function startServer({ distDir, dataDir, port = 0, host = '127.0.0.1' }) {
  const projectsFile = path.join(dataDir, 'projects.json')
  const store = createStore(projectsFile)

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
    const pathname = decodeURIComponent(url.pathname)
    const method = (req.method || 'GET').toUpperCase()

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      })
      res.end()
      return
    }

    try {
      if (pathname === '/health') {
        sendJson(res, 200, { ok: true, timestamp: new Date().toISOString() })
        return
      }

      if (pathname === '/api/projects' && method === 'GET') {
        const items = await store.load()
        const sorted = [...items].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        sendJson(res, 200, asListResponse(sorted))
        return
      }

      if (pathname === '/api/projects' && method === 'POST') {
        const body = await readBody(req)
        if (!body) {
          sendJson(res, 400, { error: { code: 'bad_json', message: 'request body is not valid JSON' } })
          return
        }
        if (!body.name || typeof body.name !== 'string') {
          sendJson(res, 400, { error: { code: 'validation_failed', message: 'name is required' } })
          return
        }
        const items = await store.load()
        const now = new Date().toISOString()
        const project = {
          id: newId(),
          ...DEFAULT_PROJECT,
          ...body,
          createdAt: now,
          updatedAt: now,
        }
        items.push(project)
        await store.persist()
        sendJson(res, 200, { data: project })
        return
      }

      const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/)
      if (projectMatch) {
        const id = projectMatch[1]
        const items = await store.load()
        const index = items.findIndex((p) => p.id === id)

        if (method === 'GET') {
          if (index === -1) {
            sendJson(res, 404, { error: { code: 'not_found', message: `project ${id} not found` } })
            return
          }
          sendJson(res, 200, { data: items[index] })
          return
        }

        if (method === 'PATCH' || method === 'PUT') {
          if (index === -1) {
            sendJson(res, 404, { error: { code: 'not_found', message: `project ${id} not found` } })
            return
          }
          const body = await readBody(req)
          if (!body) {
            sendJson(res, 400, { error: { code: 'bad_json', message: 'request body is not valid JSON' } })
            return
          }
          const merged = { ...items[index], ...body, id: items[index].id, updatedAt: new Date().toISOString() }
          items[index] = merged
          await store.persist()
          sendJson(res, 200, { data: merged })
          return
        }

        if (method === 'DELETE') {
          if (index === -1) {
            sendJson(res, 404, { error: { code: 'not_found', message: `project ${id} not found` } })
            return
          }
          items.splice(index, 1)
          await store.persist()
          sendJson(res, 200, { data: { id } })
          return
        }
      }

      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, {
          error: {
            code: 'not_available_offline',
            message: 'این سرویس در نسخه آفلاین دسکتاپ در دسترس نیست.',
          },
        })
        return
      }

      // Static SPA with history fallback. A missing *asset* (one with a file
      // extension) must 404 rather than fall back to index.html, otherwise the
      // browser receives HTML for a .js/.css request and fails on MIME type.
      const relative = pathname.replace(/^\/+/, '')
      const candidate = path.join(distDir, relative)
      const isFile =
        relative &&
        path.resolve(candidate).startsWith(path.resolve(distDir)) &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile()

      if (!isFile && path.extname(relative) && relative !== 'index.html') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not found')
        return
      }

      const target = isFile ? candidate : path.join(distDir, 'index.html')

      if (!fs.existsSync(target)) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('dist/index.html not found — the app bundle is missing from this installation.')
        return
      }

      const ext = path.extname(target).toLowerCase()
      const stream = fs.createReadStream(target)
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
      })
      stream.pipe(res)
      stream.on('error', () => res.destroy())
      return
    } catch (err) {
      console.error('[atlas] request failed:', err)
      if (!res.headersSent) sendJson(res, 500, { error: { code: 'internal_error', message: String(err && err.message ? err.message : err) } })
      else res.destroy()
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })

  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port
  return { server, port: actualPort }
}

module.exports = { startServer }
