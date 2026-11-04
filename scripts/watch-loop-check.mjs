// SPDX-License-Identifier: Apache-2.0
/**
 * Guards against a self-triggering Vite build watch loop.
 *
 * `vite build --watch` uses Rollup's watcher, not Vite's dev-server watcher, so
 * `.shogo/` MUST be excluded via `build.watch` in vite.config.ts. The runtime-
 * generated `.shogo/vite.watch.config.ts` only sets `server.watch.ignored`,
 * which the build watcher ignores entirely.
 *
 * When that exclusion is missing the build rewrites `.shogo/build-output.json`
 * and `.shogo/build-output-history.json` on every pass, the watcher sees those
 * writes, and the build restarts forever — thousands of rebuilds, each firing an
 * "Update available" toast at whoever has the app open.
 *
 * Run: node scripts/watch-loop-check.mjs
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

let pass = 0
let fail = 0

function check(name, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`PASS  ${name}${detail ? ' :: ' + detail : ''}`)
  } else {
    fail++
    console.log(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`)
  }
}

function viteWatcherPid() {
  // `pgrep -f` also matches the shell that runs this very check — its command line
  // contains the pattern too, and that shell has no inotify watches at all, which
  // makes the kernel watch set read as empty. Pick the real node process by its
  // argv instead of by a substring of some wrapper's command line.
  let pids = []
  try {
    pids = execSync('pgrep -f "vite build --watch"', { encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
  } catch {
    return null
  }
  for (const pid of pids) {
    let argv = []
    try {
      argv = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean)
    } catch {
      continue
    }
    if (!argv.length) continue
    const bin = path.basename(argv[0])
    if (bin === 'sh' || bin === 'bash' || bin === 'dash') continue
    if (!bin.startsWith('node')) continue
    if (!argv.some((a) => a.includes('vite'))) continue
    if (!argv.includes('--watch')) continue
    return pid
  }
  return null
}

/** Inodes the process is watching via inotify, read straight from the kernel. */
function watchedInodes(pid) {
  const set = new Set()
  const fdinfo = `/proc/${pid}/fdinfo`
  if (!existsSync(fdinfo)) return set
  for (const f of readdirSync(fdinfo)) {
    let txt = ''
    try {
      txt = readFileSync(path.join(fdinfo, f), 'utf8')
    } catch {
      continue
    }
    for (const line of txt.split('\n')) {
      if (!line.startsWith('inotify')) continue
      const m = /ino:([0-9a-f]+)/.exec(line)
      if (m) set.add(parseInt(m[1], 16))
    }
  }
  return set
}

function inodeOf(p) {
  try {
    return statSync(p).ino
  } catch {
    return null
  }
}

const pid = viteWatcherPid()
if (!pid) {
  console.log('SKIP  no running `vite build --watch` process to inspect')
  process.exit(0)
}

const watched = watchedInodes(pid)
check('kernel reports a non-empty inotify watch set', watched.size > 0, `${watched.size} inodes`)

for (const p of ['.shogo', '.shogo/build-output.json', '.shogo/build-output-history.json', 'dist']) {
  const i = inodeOf(p)
  check(`not watched: ${p}`, i !== null && !watched.has(i))
}

for (const p of ['src/App.tsx', 'src/main.tsx']) {
  const i = inodeOf(p)
  check(`still watched (source rebuilds work): ${p}`, i !== null && watched.has(i))
}

// Idle rebuild probe: a healthy watcher rebuilds only when something changes.
const MARK = 'dist/index.html'
const idleMs = 8000
let rebuilds = 0
let last = 0
try {
  last = statSync(MARK).mtimeMs
} catch {
  console.log('SKIP  dist/index.html missing — nothing built yet')
  process.exit(fail ? 1 : 0)
}
const t0 = Date.now()
while (Date.now() - t0 < idleMs) {
  try {
    const m = statSync(MARK).mtimeMs
    if (m !== last) {
      last = m
      rebuilds++
    }
  } catch {
    /* build mid-flight */
  }
  await new Promise((r) => setTimeout(r, 20))
}
check(`no rebuild while idle for ${idleMs / 1000}s`, rebuilds === 0, `${rebuilds} rebuild(s)`)

console.log(`\n==== ${pass}/${pass + fail} passed ====`)
process.exit(fail ? 1 : 0)
