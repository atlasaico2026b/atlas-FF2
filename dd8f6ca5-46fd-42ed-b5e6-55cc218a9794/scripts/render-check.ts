// Deterministic render test: runs the real canvas drawing functions with an
// instrumented 2D context and asserts what is actually painted on screen.
import { drawBackground, drawTankCoolingRing, drawPipeNodes, DEFAULT_NODE_STYLE } from '../src/components/DesignCanvas'
import type { NodeStyle } from '../src/components/DesignCanvas'
import { PIPE_POINT_ITEMS } from '../src/lib/pipePoints'
import { drawSchematicSymbol } from '../src/lib/schematicSymbols'
import {
  pointIconUrl, pointIconIds, pointIconRect, pointIconElement,
} from '../src/lib/pointIconSprites'

const calls: { m: string; args: any[] }[] = []
const texts: string[] = []
let arcCount = 0
let ellipseCount = 0

function makeCtx(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {}
  return new Proxy(target, {
    get(_t, prop: string) {
      if (prop === 'measureText') return (t: string) => ({ width: String(t).length * 6 })
      if (prop === 'fillText' || prop === 'strokeText') {
        return (t: string) => { texts.push(String(t)); calls.push({ m: prop, args: [t] }) }
      }
      if (prop === 'arc') return (...a: unknown[]) => { arcCount++; calls.push({ m: 'arc', args: a }) }
      if (prop === 'ellipse') return (...a: unknown[]) => { ellipseCount++; calls.push({ m: 'ellipse', args: a }) }
      // createRadialGradient really does return a gradient object, so model it —
      // otherwise chained addColorStop calls blow up on a stub that returns void.
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
        return (...a: unknown[]) => {
          calls.push({ m: String(prop), args: a })
          return {
            addColorStop: (...s: unknown[]) => { calls.push({ m: `${String(prop)}.stop`, args: s }) },
          }
        }
      }
      return (...a: unknown[]) => { calls.push({ m: String(prop), args: a }) }
    },
    set(_t, prop, value) { calls.push({ m: 'set:' + String(prop), args: [value] }); return true },
  }) as unknown as CanvasRenderingContext2D
}

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`PASS  ${name}${detail ? ' :: ' + detail : ''}`) }
  else { fail++; console.log(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`) }
}

// ─── 1. Background: SW-origin axes ───
const ctx1 = makeCtx()
const WORLD = 1000 // 100 m at 10 px/m
drawBackground(ctx1, 1600, 1000, WORLD, WORLD)

check('X axis labels start at "X 0"', texts.includes('X 0'), JSON.stringify(texts.filter(t => /^X /.test(t))))
check('Y axis labels start at "Y 0"', texts.includes('Y 0'), JSON.stringify(texts.filter(t => /^Y /.test(t))))
check('Y axis counts upward (Y 100 exists)', texts.includes('Y 100'))
check('origin marker "(0,0) SW" drawn', texts.some(t => t.includes('(0,0) SW')))
const originArc = calls.find(c => c.m === 'arc' && c.args[0] === 0 && c.args[1] === WORLD)
check('red origin dot drawn at bottom-left of the site rect (0, worldH)', !!originArc)
check('no old-style "m" axis suffix labels', !texts.some(t => /^\d+m$/.test(t)))

// ─── 2. Cooling ring around a tank with diameter 30 / height 12 ───
const el = {
  id: 't1', type: 'oil_tank', x: 400, y: 400, width: 80, height: 60,
  rotation: 0, layer: 2, label: 'مخزن نفتی',
  properties: { cooling: true, diameter: '30', height: '12' },
} as any

const ctx2 = makeCtx()
arcCount = 0; ellipseCount = 0
drawTankCoolingRing(ctx2, el, 1)

check('ring ellipse drawn around tank', ellipseCount >= 1, 'ellipse=' + ellipseCount)
check('dashed ring guide line used (ellipse present)', ellipseCount === 1)
check('nozzle dots drawn (arcs)', arcCount === 40, 'arcs=' + arcCount + ' (expect 40 = ⌈π·30/2.4⌉)')
check('badge text shows "160 آبپاش کولینگ"', texts.some(t => t === '160 آبپاش کولینگ'),
  JSON.stringify(texts))
check('badge drawn below the tank', calls.some(c => c.m === 'set:fillStyle' && c.args[0] === 'rgba(219,234,254,0.92)'))

// ─── 3. Ring must NOT draw when cooling is off or geometry missing ───
const off = makeCtx()
arcCount = 0; ellipseCount = 0
drawTankCoolingRing(off, { ...el, properties: { cooling: false, diameter: '30', height: '12' } } as any, 1)
check('no ring when cooling unchecked', ellipseCount === 0 && arcCount === 0)

const noGeom = makeCtx()
arcCount = 0; ellipseCount = 0
drawTankCoolingRing(noGeom, { ...el, properties: { cooling: true } } as any, 1)
check('no ring when diameter/height missing', ellipseCount === 0 && arcCount === 0)

// ─── 4. Pipe point nodes (Points feature) ───
// A node's fittings are laid out in the pipe's own frame: one sits exactly on
// the node, two straddle the run, and three or more spread over both sides but
// never on the fire line. None of them is tethered with a leader line.
const ICON = 26, SEL_ICON = 40
const PLATE = ICON * 0.62
const CLEAR = 18 + PLATE + 2.5   // pipe half-width 18 for a 36 px pipe at zoom 1

const PIPE = {
  id: 'p1', points: [{ x: 100, y: 500 }, { x: 700, y: 500 }], layer: 6,
  color: '#dc2626', label: 'لوله آب آتش‌نشانی', pipeSize: '4"', pipeWidth: 36,
} as any

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

function nodeWith(items: string[], over: Record<string, unknown> = {}) {
  return { ...PIPE, nodes: [{ id: 'n1', pipeId: 'p1', x: 300, y: 500, segIndex: 0, items, ...over }] }
}

function paints(items: string[], selected: string | null = null, zoom = 1, pipe = nodeWith(items), style?: NodeStyle) {
  calls.length = 0
  const ctx = makeCtx()
  drawPipeNodes(ctx, [pipe], new Set([6]), zoom, selected, style)
  // One radial gradient is created per fitting, centred on it, so this is the
  // position a fitting is actually painted at — independent of how it is drawn.
  const at = calls.filter(c => c.m === 'createRadialGradient')
    .map(c => [c.args[0] as number, c.args[1] as number])
  const scales = calls.filter(c => c.m === 'scale').map(c => c.args[0] as number)
  return { at, scales }
}

{
  const { at } = paints(['water_monitor'])
  check('a lone fitting is drawn exactly on the node',
    at.length === 1 && at.every(([x, y]) => near(x, 300) && near(y, 500)), JSON.stringify(at))
}

{
  const { at } = paints(['water_monitor', 'butterfly_valve'])
  const ys = at.map(([, y]) => y)
  check('two fittings straddle the run, neither on the axis',
    at.length === 2 && at.every(([x]) => near(x, 300))
      && ys.includes(500 - CLEAR) && ys.includes(500 + CLEAR), JSON.stringify(at))
  check('two fittings sit on opposite sides of the pipe',
    new Set(ys.map(y => Math.sign(y - 500))).size === 2)
}

{
  const items = ['water_monitor', 'butterfly_valve', 'hydrant_single']
  const { at } = paints(items)
  const xs = at.map(([x]) => x)
  const ys = at.map(([, y]) => y)
  const above = ys.filter(y => y < 500).length
  const below = ys.filter(y => y > 500).length
  check('three fittings split two on one side and one on the other',
    at.length === 3 && above === 1 && below === 2, JSON.stringify(at))
  check('a third fitting is offset along the pipe, not stacked',
    xs.filter(x => !near(x, 300)).length === 2, JSON.stringify(xs))
  check('no fitting is ever left on the fire line',
    ys.every(y => Math.abs(y - 500) >= CLEAR - 1e-9), JSON.stringify(ys))
}

{
  // A leader line would mean extra path commands beyond the artwork itself.
  const ids = ['water_monitor', 'butterfly_valve', 'hydrant_single']
  let baseline = 0
  {
    calls.length = 0
    const ctx = makeCtx()
    for (const id of ids) drawSchematicSymbol(ctx, id, 300, 500, ICON, '#000')
    baseline = calls.filter(c => c.m === 'moveTo' || c.m === 'lineTo').length
  }
  calls.length = 0
  const ctx = makeCtx()
  drawPipeNodes(ctx, [nodeWith(ids)], new Set([6]), 1, null)
  const drawn = calls.filter(c => c.m === 'moveTo' || c.m === 'lineTo').length
  check('nothing is tethered to the node with a leader line',
    drawn === baseline, `moveTo/lineTo=${drawn} vs artwork-only ${baseline}`)
  check('the old black leader colour is never used',
    !calls.some(c => c.m === 'set:strokeStyle' && c.args[0] === '#334155'))
}

{
  const { scales } = paints(['water_monitor', 'butterfly_valve'], 'n1')
  check('selecting a node enlarges its fittings',
    scales.length > 0 && scales.every(s => near(s, SEL_ICON / 2, 1e-9)), JSON.stringify(scales))
  check('the selected cluster is ringed in orange',
    calls.some(c => c.m === 'set:strokeStyle' && c.args[0] === '#f97316')
      && calls.some(c => c.m === 'setLineDash' && Array.isArray(c.args[0]) && c.args[0].length > 0))
}

{
  for (const zoom of [0.5, 1, 2]) {
    const { scales } = paints(['water_monitor'], null, zoom)
    check(`fittings keep a constant size on screen at zoom ${zoom}`,
      scales.length === 1 && near(scales[0] * zoom, ICON / 2, 1e-9), JSON.stringify(scales))
  }
}

{
  const vertical = { ...PIPE, points: [{ x: 300, y: 200 }, { x: 300, y: 600 }] }
  const { at } = paints(['water_monitor', 'butterfly_valve'], null, 1, { ...vertical, nodes: [{ id: 'n1', pipeId: 'p1', x: 300, y: 500, segIndex: 0, items: ['water_monitor', 'butterfly_valve'] }] })
  check('a vertical run puts its fittings left and right, not on the line',
    at.length === 2 && at.every(([, y]) => near(y, 500))
      && at.map(([x]) => x).includes(300 - CLEAR) && at.map(([x]) => x).includes(300 + CLEAR),
    JSON.stringify(at))
}

{
  const { at } = paints(['check_valve', 'flowmeter'])
  check('fittings retired from the catalogue paint nothing',
    at.length === 0, JSON.stringify(at))
}

{
  calls.length = 0
  const ctx = makeCtx()
  drawPipeNodes(ctx, [nodeWith([])], new Set([6]), 1, null)
  check('a bare node still draws its connector mark', arcCount >= 1, 'arcs=' + arcCount)
}

{
  calls.length = 0; arcCount = 0
  const ctx = makeCtx()
  drawPipeNodes(ctx, [nodeWith(['water_monitor'])], new Set([0]), 1, null)
  check('no nodes drawn when the pipe layer is hidden', arcCount === 0 && calls.length === 0)
}

// ─── 5. Node fittings are the supplied catalogue renders ───
// The map paints the extracted PNGs; the vector glyph is only a stand-in for
// the frames before a render decodes (and for ids that have no render at all).
{
  const ids = PIPE_POINT_ITEMS.map(i => i.id)
  const missing = ids.filter(id => !pointIconUrl(id))
  check('every catalogue fitting has a render', missing.length === 0, JSON.stringify(missing))
  check('no render is orphaned from the catalogue',
    pointIconIds().every(id => ids.includes(id)), JSON.stringify(pointIconIds()))
  check('render URLs are versioned, so the immutable cache cannot serve stale art',
    /_v\d+\.png$/.test(pointIconUrl('water_monitor') || ''), pointIconUrl('water_monitor') || '')
  check('retired fittings have no render',
    ['check_valve', 'flowmeter', 'pressure_gauge'].every(id => pointIconUrl(id) === null))

  const fs = await import('node:fs')
  const absent: string[] = []
  const mismatched: string[] = []
  for (const id of pointIconIds()) {
    const file = 'public' + (pointIconUrl(id) || '')
    if (!fs.existsSync(file)) { absent.push(file); continue }
    const png = fs.readFileSync(file)               // IHDR width/height
    const w = png.readUInt32BE(16)
    const h = png.readUInt32BE(20)
    const rect = pointIconRect(id, 200)
    if (Math.abs(rect.w - w) > 1 || Math.abs(rect.h - h) > 1) {
      mismatched.push(`${id}: module ${rect.w.toFixed(0)}x${rect.h.toFixed(0)} vs file ${w}x${h}`)
    }
  }
  check('every render exists on disk', absent.length === 0, JSON.stringify(absent))
  check('declared proportions match the shipped file', mismatched.length === 0, JSON.stringify(mismatched))

  // Stand in for the browser's Image so the decoded path can be exercised.
  class FakeImage {
    complete = true
    naturalWidth = 200
    naturalHeight = 200
    src = ''
    addEventListener() {}
    removeEventListener() {}
  }
  ;(globalThis as unknown as { Image: unknown }).Image = FakeImage

  const spritePaints = (items: string[], selected: string | null = null, zoom = 1) => {
    calls.length = 0
    drawPipeNodes(makeCtx(), [nodeWith(items)], new Set([6]), zoom, selected)
    return calls.filter(c => c.m === 'drawImage').map(c => c.args as number[])
  }

  {
    const imgs = spritePaints(['water_monitor'])
    check('a decoded render is what actually gets painted', imgs.length === 1, 'drawImage=' + imgs.length)
    const [, dx, dy, dw, dh] = imgs[0]
    check('the render is centred on the node',
      near(dx + dw / 2, 300) && near(dy + dh / 2, 500), `centre ${dx + dw / 2},${dy + dh / 2}`)
    check('the render keeps its own proportions',
      near(dw / dh, 200 / 169, 1e-9), `${dw.toFixed(2)}x${dh.toFixed(2)}`)
    check('the render sizes to the icon box, not to the source pixels',
      near(Math.max(dw, dh), ICON, 1e-9), 'longest=' + Math.max(dw, dh).toFixed(2))
  }

  for (const zoom of [0.5, 1, 2]) {
    const [, , , w] = spritePaints(['water_monitor'], null, zoom)[0]
    check(`the render keeps a constant size on screen at zoom ${zoom}`,
      near(w * zoom, ICON, 1e-9), 'w=' + w)
  }

  {
    const [, , , w] = spritePaints(['water_monitor'], 'n1')[0]
    check('selecting a node enlarges its render', near(w, SEL_ICON, 1e-9), 'w=' + w)
  }

  {
    let shaped = true
    for (const id of PIPE_POINT_ITEMS.map(i => i.id)) {
      const [, , , w, h] = spritePaints([id])[0]
      const ref = pointIconRect(id, 1)
      if (!near(w / h, ref.w / ref.h, 1e-9) || Math.max(w, h) > ICON + 1e-9) shaped = false
    }
    check('no fitting is ever stretched or overflows its box', shaped)
  }

  {
    // Force the pending state: the glyph must cover the frame before decode.
    const pending = pointIconElement('water_monitor') as unknown as { complete: boolean; naturalWidth: number }
    pending.complete = false
    pending.naturalWidth = 0
    calls.length = 0
    drawPipeNodes(makeCtx(), [nodeWith(['water_monitor'])], new Set([6]), 1, null)
    check('the vector glyph stands in until the render has decoded',
      calls.some(c => c.m === 'scale') && !calls.some(c => c.m === 'drawImage'))
    pending.complete = true
    pending.naturalWidth = 200
  }
}

check('catalogue exposes exactly the nine remaining fittings',
  PIPE_POINT_ITEMS.length === 9, 'n=' + PIPE_POINT_ITEMS.length)

// ─── 6. Fitting look: a faded halo, adjustable size and placement ───
{
  const style = (size: number, spread: number): NodeStyle => ({ size, spread })

  {
    const { at } = paints(['water_monitor'])
    const grads = calls.filter(c => c.m === 'createRadialGradient')
    check('every fitting sits on its own glow', grads.length === at.length && at.length === 1,
      'gradients=' + grads.length)
    const stops = calls.filter(c => c.m === 'createRadialGradient.stop')
      .map(c => String(c.args[1]))
    const alpha = stops.map(s => parseFloat(s.slice(s.lastIndexOf(',') + 1)))
    check('the glow fades all the way out',
      stops.length >= 2 && /rgba\(255,\s*255,\s*255,\s*0\)$/.test(stops[stops.length - 1]),
      JSON.stringify(stops))
    check('the glow is faded, never opaque white',
      alpha.length > 0 && Math.max(...alpha) < 0.85, 'peak alpha=' + Math.max(...alpha))
    check('the hard white plate is gone',
      !calls.some(c => c.m === 'roundRect')
        && !calls.some(c => c.m === 'set:fillStyle' && c.args[0] === 'rgba(255,255,255,0.94)'))

    // The glow must stay behind its own fitting: any reach past the wall margin
    // shows up as a pale smudge on the run.
    const outer = grads.map(c => c.args[5] as number)
    const clearance = 18 + PLATE + 2.5 - PLATE     // wall margin the layout keeps
    check('the glow fades out before it can spill onto the run',
      outer.every(r => r - PLATE <= 0.35 * PLATE) && outer.every(r => r > PLATE * 1.05),
      `outer=${outer.map(r => r.toFixed(1)).join(',')} margin=${clearance}`)
  }

  {
    const drawn = (s: NodeStyle) => {
      calls.length = 0
      drawPipeNodes(makeCtx(), [nodeWith(['water_monitor'])], new Set([6]), 1, null, s)
      return calls.filter(c => c.m === 'drawImage').map(c => c.args as number[])[0]
    }
    // Only meaningful with a decoded render, so stub one in.
    class FakeImage { complete = true; naturalWidth = 200; naturalHeight = 200; src = ''; addEventListener() {} removeEventListener() {} }
    ;(globalThis as unknown as { Image: unknown }).Image = FakeImage

    const base = drawn(DEFAULT_NODE_STYLE)
    check('size 100% is exactly the default fitting',
      near(base[3], ICON, 1e-9), 'w=' + base[3].toFixed(2))
    for (const [size, factor] of [[1.5, 1.5], [0.6, 0.6], [1.8, 1.8]] as const) {
      const rect = drawn(style(size, 1))
      check(`size ${Math.round(size * 100)}% scales the artwork by ${factor}`,
        near(rect[3], ICON * factor, 1e-9), 'w=' + rect[3].toFixed(2))
    }
    const big = drawn(style(1.8, 1))
    check('a larger fitting still keeps its own proportions',
      near(big[3] / big[4], base[3] / base[4], 1e-9), `${big[3].toFixed(1)}x${big[4].toFixed(1)}`)
  }

  {
    const sides = (s: NodeStyle) => {
      const { at } = paints(['water_monitor', 'butterfly_valve'], null, 1, nodeWith(['water_monitor', 'butterfly_valve']), s)
      return at.map(([, y]) => Math.abs(y - 500)).sort((a, b) => a - b)
    }
    check('spread 100% is exactly the default cluster',
      sides(DEFAULT_NODE_STYLE).every(d => near(d, CLEAR, 1e-9)),
      JSON.stringify(sides(DEFAULT_NODE_STYLE)))
    check('a wider spread pushes the fittings away from the node',
      sides(style(1, 2)).every(d => near(d, CLEAR * 2, 1e-9)),
      JSON.stringify(sides(style(1, 2))))
    check('fittings hug the pipe at the tightest setting',
      sides(style(1, 0.5)).every(d => near(d, CLEAR, 1e-9)),
      JSON.stringify(sides(style(1, 0.5))))
    check('spread can never drag a fitting onto the fire line',
      sides(style(1, 0.5)).every(d => d - 26 * 0.62 >= 18 - 1e-9),
      JSON.stringify(sides(style(1, 0.5))))
  }

  {
    const alongs = (s: NodeStyle) => paints(
      ['water_monitor', 'butterfly_valve', 'hydrant_single'], null, 1,
      nodeWith(['water_monitor', 'butterfly_valve', 'hydrant_single']), s,
    ).at.map(([x]) => x - 300)
    const wide = alongs(style(1, 1.6))
    const tight = alongs(style(1, 1))
    check('spread also spaces fittings along the run',
      Math.max(...wide.map(Math.abs)) > Math.max(...tight.map(Math.abs)),
      `${Math.max(...wide.map(Math.abs))} vs ${Math.max(...tight.map(Math.abs))}`)
  }

  {
    const sel = (s: NodeStyle) => paints(['water_monitor'], 'n1', 1, nodeWith(['water_monitor']), s).at
    const a = sel(DEFAULT_NODE_STYLE)[0]
    const b = sel(style(1, 2))[0]
    check('a fitting centred on its node ignores the spread',
      near(a[0], b[0]) && near(a[1], b[1]), JSON.stringify([a, b]))
  }
}

// The glow must be the only new drawing: nothing else may have crept in.
{
  check('no leftover plate helper is still exported as the old solid box',
    !calls.some(c => c.m === 'roundRect'))
}

console.log(`\n==== ${pass}/${pass + fail} checks passed ====`)
if (fail) process.exit(1)
