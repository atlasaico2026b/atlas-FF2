// Deterministic checks for the zoom behaviour and the Points catalogue.
// Run: bun scripts/verify.ts
import { zoomPan, clampZoom, screenToWorld, nodeSlots, clampNodeStyle, fittingBox, spreadSlots, DEFAULT_NODE_STYLE, NODE_SIZE_LIMITS, NODE_SPREAD_LIMITS } from '../src/components/DesignCanvas'
import { drawSchematicSymbol } from '../src/lib/schematicSymbols'
import {
  PIPE_POINT_ITEMS, RETIRED_PIPE_POINT_IDS, togglePointItem, canFitPointItem,
  sanitizePointItems, PIPE_POINT_GROUPS,
} from '../src/lib/pipePoints'

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`PASS  ${name}${detail ? ' :: ' + detail : ''}`) }
  else { fail++; console.log(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`) }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

// ─────────────────────────── zoom ───────────────────────────
// The reported bug: scrolling changed pan but never zoom, so the drawing slid
// across the screen instead of getting larger.
{
  const anchor = { x: 300, y: 200 }
  let pan = { x: 40, y: -25 }
  let zoom = 1

  const before = screenToWorld(anchor.x, anchor.y, pan, zoom)
  const next = clampZoom(zoom * 1.25)
  pan = zoomPan(pan, zoom, next, anchor.x, anchor.y)
  zoom = next
  const after = screenToWorld(anchor.x, anchor.y, pan, zoom)

  check('zoom actually changes the scale', zoom === 1.25, `zoom=${zoom}`)
  check('the point under the cursor stays put', near(before.x, after.x) && near(before.y, after.y),
    `(${before.x.toFixed(4)}, ${before.y.toFixed(4)}) -> (${after.x.toFixed(4)}, ${after.y.toFixed(4)})`)
}

// A scale change must not be a pure translation: this is exactly what the old
// pan-only code did, and it is what made the shape wander.
{
  const pan = { x: 40, y: -25 }
  const moved = zoomPan(pan, 1, 1.25, 300, 200)
  check('zooming is not a pure translation of the old pan', !near(moved.x, pan.x) && !near(moved.y, pan.y))
}

// Zooming in then back out returns to the original view.
{
  const anchor = { x: 512, y: 384 }
  const start = { pan: { x: 17, y: -63 }, zoom: 1 }
  const inPan = zoomPan(start.pan, start.zoom, 2.5, anchor.x, anchor.y)
  const backPan = zoomPan(inPan, 2.5, start.zoom, anchor.x, anchor.y)
  check('zoom in then out restores the original pan',
    near(backPan.x, start.pan.x, 1e-9) && near(backPan.y, start.pan.y, 1e-9),
    `${JSON.stringify(backPan)}`)
}

// Centre-anchored zoom (the toolbar +/-) keeps the middle of the canvas fixed.
{
  const w = 800, h = 600
  const pan = { x: 10, y: 20 }, zoom = 1.5
  const before = screenToWorld(w / 2, h / 2, pan, zoom)
  const next = clampZoom(zoom + 0.1)
  const after = screenToWorld(w / 2, h / 2, zoomPan(pan, zoom, next, w / 2, h / 2), next)
  check('toolbar zoom keeps the canvas centre fixed', near(before.x, after.x) && near(before.y, after.y))
}

// Limits are respected at both ends.
{
  check('zoom is clamped low', clampZoom(0.0001) === 0.1, String(clampZoom(0.0001)))
  check('zoom is clamped high', clampZoom(500) === 8, String(clampZoom(500)))
}

// ───────────────────── node fitting placement ─────────────────────
const ICON = 26, PIPE_HALF = 18
const PLATE = ICON * 0.62
// closest a fitting may sit to the pipe axis: its plate must clear the wall
const D = PIPE_HALF + PLATE + 2.5

{
  const one = nodeSlots(1, PIPE_HALF, ICON, PLATE)
  check('a single fitting is drawn exactly on the node',
    one.length === 1 && one[0].along === 0 && one[0].across === 0, JSON.stringify(one))
}
{
  const two = nodeSlots(2, PIPE_HALF, ICON, PLATE)
  const across = two.map(s => s.across).sort((a, b) => a - b)
  check('two fittings sit one on each side of the run',
    two.length === 2 && near(across[0], -D) && near(across[1], D), JSON.stringify(across))
  check('two fittings sit as close to the node as the pipe allows',
    two.every(s => s.along === 0), `along=${two.map(s => s.along).join(',')}`)
}
{
  const three = nodeSlots(3, PIPE_HALF, ICON, PLATE)
  const sides = three.filter(s => s.across > 0).length
  check('three fittings split across both sides', three.length === 3 && sides === 2, `top=${sides}`)
  check('no fitting is ever left on the fire line',
    three.every(s => Math.abs(s.across) >= D - 1e-9), JSON.stringify(three.map(s => s.across)))
  // the plate must not bite into the pipe
  check('no plate overlaps the pipe wall',
    three.every(s => Math.abs(s.across) - PLATE >= PIPE_HALF - 1e-9),
    `clearance=${Math.min(...three.map(s => Math.abs(s.across) - PLATE))}`)
  const closest = Math.min(...three.map(s => Math.hypot(s.along, s.across)))
  check('the closest fitting is only the pipe wall away', near(closest, D, 1e-9), closest.toFixed(3))
}
{
  for (const n of [3, 4, 5, 7, 9, 12]) {
    const slots = nodeSlots(n, PIPE_HALF, ICON, PLATE)
    const clean = slots.every(s => Math.abs(s.across) - PLATE >= PIPE_HALF - 1e-9)
    // plates inside one row must not overlap
    let spaced = true
    for (const sign of [1, -1]) {
      const row = slots.filter(s => Math.sign(s.across) === sign).map(s => s.along).sort((a, b) => a - b)
      for (let i = 1; i < row.length; i++) {
        if (row[i] - row[i - 1] < 2 * PLATE - 1e-9) spaced = false
      }
    }
    check(`${n} fittings: plates stay clear of the pipe and of each other`,
      slots.length === n && clean && spaced)
  }
}
{
  // Fittings keep a constant size on screen, so the layout must not depend on zoom.
  const a = nodeSlots(4, PIPE_HALF, ICON, PLATE)
  const b = nodeSlots(4, PIPE_HALF, ICON, PLATE)
  check('layout is deterministic', JSON.stringify(a) === JSON.stringify(b))
}

// ───────────────────── retired fittings ─────────────────────
{
  const ids = PIPE_POINT_ITEMS.map(i => i.id)
  for (const gone of RETIRED_PIPE_POINT_IDS) {
    check(`${gone} is gone from the catalogue`, !ids.includes(gone))
  }
  check('the catalogue is exactly the nine remaining fittings', ids.length === 9, ids.join(', '))
}
{
  // A retired fitting must paint nothing even if it is still in a saved design.
  let calls = 0
  const ctx = new Proxy({}, {
    get: () => () => { calls++ },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D
  for (const gone of RETIRED_PIPE_POINT_IDS) drawSchematicSymbol(ctx, gone, 10, 10, 26, '#000')
  check('retired fittings draw nothing on the map', calls === 0, `calls=${calls}`)

  let live = 0
  const ctx2 = new Proxy({}, {
    get: () => () => { live++ },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D
  for (const def of PIPE_POINT_ITEMS) drawSchematicSymbol(ctx2, def.id, 10, 10, 26, def.color)
  check('every remaining fitting still has artwork', live > 0, `calls=${live}`)
}

// ───────────────────── exclusivity rules ─────────────────────
{
  const monitors = ['water_monitor', 'foam_monitor', 'water_foam_monitor']
  check('only one monitor can be fitted',
    monitors.every(m => togglePointItem([m], monitors.filter(x => x !== m)[0]).length === 1))
  check('ticking a monitor replaces the previous one',
    JSON.stringify(togglePointItem(['water_monitor'], 'foam_monitor')) === JSON.stringify(['foam_monitor']))
  check('only one hydrant can be fitted',
    JSON.stringify(togglePointItem(['hydrant_single'], 'hydrant_double')) === JSON.stringify(['hydrant_double']))
  check('only one valve can be fitted',
    JSON.stringify(togglePointItem(['butterfly_valve'], 'inline_valve')) === JSON.stringify(['inline_valve']))
  check('unrelated fittings coexist',
    JSON.stringify(togglePointItem(['water_monitor'], 'inline_inductor'))
      === JSON.stringify(['water_monitor', 'inline_inductor']))

  check('nothing can be added while a blind flange is fitted',
    !canFitPointItem(['blind_flange'], 'water_monitor').ok)
  check('a blind flange is refused once a fitting exists',
    !canFitPointItem(['water_monitor'], 'blind_flange').ok)
  check('a blind flange fits an empty node', canFitPointItem([], 'blind_flange').ok)
  check('a blocked row explains itself',
    typeof canFitPointItem(['blind_flange'], 'water_monitor').reason === 'string')

  check('every grouped id belongs to exactly one group',
    PIPE_POINT_GROUPS.flat().length === new Set(PIPE_POINT_GROUPS.flat()).size)

  const saved = sanitizePointItems(['check_valve', 'water_monitor', 'flowmeter', 'pressure_gauge'])
  check('a saved design loses its retired fittings',
    JSON.stringify(saved) === JSON.stringify(['water_monitor']), JSON.stringify(saved))
  const clash = sanitizePointItems(['water_monitor', 'foam_monitor'])
  check('a saved clash is resolved to one fitting', clash.length === 1, JSON.stringify(clash))
  const solo = sanitizePointItems(['blind_flange', 'water_monitor', 'check_valve'])
  check('a saved blind flange survives alone', JSON.stringify(solo) === JSON.stringify(['blind_flange']), JSON.stringify(solo))
}

// ─────────────────── node fitting look (size / placement) ───────────────────
{
  const c = clampNodeStyle
  check('a missing style falls back to the defaults',
    JSON.stringify(c(null)) === JSON.stringify(DEFAULT_NODE_STYLE), JSON.stringify(c(null)))
  check('garbage in the stored style is ignored',
    JSON.stringify(c({ size: 'huge' as never, spread: NaN })) === JSON.stringify(DEFAULT_NODE_STYLE),
    JSON.stringify(c({ size: 'huge' as never, spread: NaN })))
  check('an over-large size is clamped to the slider maximum',
    c({ size: 99, spread: 1 }).size === NODE_SIZE_LIMITS.max, String(c({ size: 99, spread: 1 }).size))
  check('an under-sized value is clamped to the slider minimum',
    c({ size: 0.01, spread: 1 }).size === NODE_SIZE_LIMITS.min, String(c({ size: 0.01, spread: 1 }).size))
  check('an over-wide spread is clamped to the slider maximum',
    c({ size: 1, spread: 99 }).spread === NODE_SPREAD_LIMITS.max, String(c({ size: 1, spread: 99 }).spread))
  check('a stored style inside the range is kept exactly',
    JSON.stringify(c({ size: 1.25, spread: 1.7 })) === JSON.stringify({ size: 1.25, spread: 1.7 }))
}
{
  const d = fittingBox(false, DEFAULT_NODE_STYLE)
  const s = fittingBox(true, DEFAULT_NODE_STYLE)
  check('the default fitting is the plain icon box',
    near(d.icon, ICON) && near(d.plate, ICON * 0.62),
    JSON.stringify(d))
  check('a selected fitting is still the larger one',
    near(s.icon, ICON * (40 / 26)) && s.icon > d.icon, JSON.stringify(s))
  const big = fittingBox(false, { size: 1.8, spread: 1 })
  check('the size setting scales both the artwork and its glow',
    near(big.icon, d.icon * 1.8) && near(big.plate, d.plate * 1.8), JSON.stringify(big))
}
{
  const base = nodeSlots(3, PIPE_HALF, ICON, PLATE)
  const same = spreadSlots(base, 1, D)
  check('spread 1 leaves the layout untouched',
    same.every((s, i) => near(s.along, base[i].along) && near(s.across, base[i].across)),
    JSON.stringify(same))
  const wide = spreadSlots(base, 2, D)
  check('spread scales the offset from the node',
    wide.every((s, i) => near(s.across, base[i].across * 2) && near(s.along, base[i].along * 2)),
    JSON.stringify(wide))
  const tight = spreadSlots(base, 0.4, D)
  check('spread can never pull a fitting into the pipe',
    tight.filter(s => s.across !== 0).every(s => Math.abs(s.across) >= D - 1e-9),
    JSON.stringify(tight.map(s => s.across)))
  const one = spreadSlots(nodeSlots(1, PIPE_HALF, ICON, PLATE), 2, D)
  check('a fitting centred on the node stays on the node',
    one.length === 1 && one[0].along === 0 && one[0].across === 0, JSON.stringify(one))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
