// Builds the `dist-desktop` bundle that ships inside the Windows installer.
//
// The cloud preview serves the app under `/p/<projectId>/`, so the build in
// `dist/` references its assets with that prefix. Electron loads the app from
// `http://127.0.0.1:<port>/`, where that prefix does not exist — leaving it in
// place makes every stylesheet and script 404 and the window renders blank.
// This script rewrites the prefix to `/` and bundles the Persian webfonts
// locally so the app needs no internet connection.

import { createRequire } from 'node:module'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const projectRoot = path.resolve(process.cwd(), '..')
const srcDir = path.join(projectRoot, 'dist')
const outDir = path.join(projectRoot, 'dist-desktop')
const projectId = path.basename(projectRoot)

const FONT_CDN = 'https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003'
const EXCLUDED = ['*.zip', '*.tar.gz', '__probe.txt']

function isExcluded(name) {
  return EXCLUDED.some((pattern) => {
    if (pattern.startsWith('*.')) return name.endsWith(pattern.slice(1))
    return name === pattern
  })
}

async function copyTree(from, to) {
  await fsp.mkdir(to, { recursive: true })
  for (const entry of await fsp.readdir(from, { withFileTypes: true })) {
    if (isExcluded(entry.name)) continue
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) await copyTree(src, dst)
    else await fsp.copyFile(src, dst)
  }
}

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`)
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  await fsp.writeFile(dest, Buffer.from(await res.arrayBuffer()))
}

async function bundleFonts() {
  const cssUrl = `${FONT_CDN}/Vazirmatn-font-face.css`
  const res = await fetch(cssUrl)
  if (!res.ok) throw new Error(`GET ${cssUrl} -> HTTP ${res.status}`)
  let css = await res.text()

  const refs = [...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map((m) => m[1])
  const unique = [...new Set(refs)]
  const fontDir = path.join(outDir, 'fonts')
  const webfontDir = path.join(fontDir, 'webfonts')

  for (const ref of unique) {
    const fileName = path.basename(ref)
    await download(`${FONT_CDN}/${ref.replace(/^\.?\//, '')}`, path.join(webfontDir, fileName))
  }

  css = css.replace(/url\(['"]?([^'")]+)['"]?\)/g, (match, ref) => {
    return `url('/fonts/webfonts/${path.basename(ref)}')`
  })

  await fsp.writeFile(path.join(fontDir, 'vazirmatn.css'), css, 'utf8')
  return unique.length
}

async function main() {
  if (!fs.existsSync(path.join(srcDir, 'index.html'))) {
    throw new Error(`no build found at ${srcDir}/index.html — build the app first`)
  }

  await fsp.rm(outDir, { recursive: true, force: true })
  await copyTree(srcDir, outDir)

  const indexPath = path.join(outDir, 'index.html')
  let html = await fsp.readFile(indexPath, 'utf8')

  const prefix = `/p/${projectId}/`
  const beforeCount = html.split(prefix).length - 1
  html = html.split(prefix).join('/')

  let fontCount = 0
  try {
    fontCount = await bundleFonts()
    html = html
      .replace(/<link[^>]*Vazirmatn-font-face\.css[^>]*>\s*/g, '')
      .replace(/<link[^>]*IRANSans\.css[^>]*>\s*/g, '')
      .replace('</head>', '    <link rel="stylesheet" href="/fonts/vazirmatn.css" />\n  </head>')
  } catch (err) {
    console.warn(`[desktop-dist] font bundling skipped: ${err.message}`)
  }

  await fsp.writeFile(indexPath, html, 'utf8')

  const remaining = html.split(prefix).length - 1
  if (remaining > 0) throw new Error(`base prefix still present in index.html (${remaining} left)`)

  console.log(`[desktop-dist] wrote ${outDir}`)
  console.log(`[desktop-dist] rewrote ${beforeCount} preview asset prefix(es) -> '/'`)
  console.log(`[desktop-dist] bundled ${fontCount} local webfont file(s)`)
}

main().catch((err) => {
  console.error(`[desktop-dist] ${err.message}`)
  process.exit(1)
})
