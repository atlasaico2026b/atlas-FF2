// SPDX-License-Identifier: Apache-2.0
// Paints the real node renderer so the cluster layout can be inspected with
// eyes, on the pipe the fittings are actually fitted to.
// Run through scripts/ui-check.sh (bundle -> chromium) with a screenshot.
import { drawPipeNodes, NODE_ICON, NODE_PLATE_RATIO, DEFAULT_NODE_STYLE } from '../src/components/DesignCanvas'
import type { NodeStyle } from '../src/components/DesignCanvas'
import { PIPE_POINT_ITEMS } from '../src/lib/pipePoints'
import { pointIconElement } from '../src/lib/pointIconSprites'

const IDS = PIPE_POINT_ITEMS.map(i => i.id)

const CASES: { label: string; items: string[]; selected?: boolean; vertical?: boolean; style?: NodeStyle }[] = [
  { label: '1 — exactly on the node',        items: IDS.slice(0, 1) },
  { label: '2 — one each side',              items: IDS.slice(0, 2) },
  { label: '3 — two on one side, one on the other', items: IDS.slice(0, 3) },
  { label: '4 — two up, two down',           items: IDS.slice(0, 4) },
  { label: '3 — selected (bigger + ring)',   items: IDS.slice(0, 3), selected: true },
  { label: 'all 9 — selected',               items: IDS, selected: true },
  { label: 'all 9 — vertical run',           items: IDS, vertical: true },
  { label: 'bare node / retired in saved data', items: ['check_valve', 'flowmeter'] },
  // The two settings the size / placement sliders drive.
  { label: 'size 150%',                      items: IDS.slice(0, 3), style: { size: 1.5, spread: 1 } },
  { label: 'size 60%',                       items: IDS.slice(0, 3), style: { size: 0.6, spread: 1 } },
  { label: 'placement 200% (further from the node)', items: IDS.slice(0, 5), style: { size: 1, spread: 2 } },
  { label: 'placement 50% (hugging the pipe)', items: IDS.slice(0, 5), style: { size: 1, spread: 0.5 } },
]

const ROW = 250
const W = 1180
const cv = document.createElement('canvas')
cv.width = W
cv.height = ROW * CASES.length
cv.style.width = W + 'px'
cv.style.height = ROW * CASES.length + 'px'
cv.style.display = 'block'
document.body.style.margin = '0'
document.body.appendChild(cv)
const ctx = cv.getContext('2d')!

const PIPE_W = 36

function paint() {
  ctx.fillStyle = '#eef2f7'
  ctx.fillRect(0, 0, cv.width, cv.height)

  CASES.forEach((c, i) => {
    const cy = ROW * i + ROW / 2 + 10
    const pts = c.vertical
      ? [{ x: 560, y: cy - 95 }, { x: 560, y: cy + 95 }]
      : [{ x: 300, y: cy }, { x: 900, y: cy }]
    const nx = c.vertical ? 560 : 600
    const pipe = {
      id: 'p', points: pts, layer: 1, color: '#dc2626', pipeWidth: PIPE_W,
      nodes: [{ id: 'n', pipeId: 'p', x: nx, y: cy, segIndex: 0, items: c.items }],
    }

    ctx.save()
    ctx.strokeStyle = '#dc2626'
    ctx.lineWidth = PIPE_W
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    ctx.lineTo(pts[1].x, pts[1].y)
    ctx.stroke()
    ctx.restore()

    drawPipeNodes(ctx, [pipe] as never, new Set([1]), 1, c.selected ? 'n' : null, c.style || DEFAULT_NODE_STYLE)

    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(c.label, 16, ROW * i + 28)
  })
}

/** Wait for the renders to decode, otherwise the shot only shows stand-ins. */
function spritesReady(): Promise<number> {
  let ready = 0
  return Promise.all(PIPE_POINT_ITEMS.map(item => new Promise<void>(resolve => {
    const img = pointIconElement(item.id)
    if (!img) return resolve()
    const settle = () => { if (img.naturalWidth > 0) ready++; resolve() }
    if (img.complete) return settle()
    img.addEventListener('load', settle, { once: true })
    img.addEventListener('error', () => resolve(), { once: true })
  }))).then(() => ready)
}

// report the numbers so the run is checkable, not just lookable
spritesReady().then(loaded => {
  paint()
  const state = {
    icon: NODE_ICON,
    plate: NODE_ICON * NODE_PLATE_RATIO,
    renders: `${loaded}/${PIPE_POINT_ITEMS.length}`,
    cases: CASES.map(c => ({ label: c.label, n: c.items.filter(id => IDS.includes(id)).length })),
  }
  const pre = document.createElement('pre')
  pre.id = 'results'
  pre.textContent = 'ready ' + JSON.stringify(state)
  document.title = loaded === PIPE_POINT_ITEMS.length ? 'OK' : 'MISSING-RENDERS'
})
