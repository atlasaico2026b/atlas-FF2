// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// SCHEMATIC SYMBOLS — vector glyphs for the fittings that can be
// attached to a pipe node (the "Points" feature).
//
// Every drawer paints inside the normalised box [-1, 1] on both axes,
// so callers only translate + scale before invoking it. Line widths are
// expressed in normalised units too, which keeps the drawing crisp at
// any size while staying perfectly proportional.
//
// The shapes follow the conventions used on fire-protection / P&ID
// drawings (bow-tie valves, gauge circle with needle, hydrant
// elevation, monitor with spray fan).
// ═══════════════════════════════════════════════════════════════════

const INK = '#0f172a'

type Drawer = (ctx: CanvasRenderingContext2D, accent: string) => void

/** Fittings that sit *inline* on the pipe axis (valves, meters, plates). */
export const NODE_INLINE_ITEMS = new Set([
  'inline_inductor',
  'butterfly_valve',
  'inline_valve',
  'blind_flange',
])

/** Fittings that branch off the pipe on a stub (monitors, hydrants). */
export const NODE_BRANCH_ITEMS = new Set([
  'water_monitor',
  'foam_monitor',
  'water_foam_monitor',
  'hydrant_single',
  'hydrant_double',
])

// ─── shared primitives ───────────────────────────────────────────────

/** Standard two-triangle bow-tie body used by every valve symbol. */
function bowtie(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  ctx.moveTo(-0.9, -0.68)
  ctx.lineTo(-0.9, 0.68)
  ctx.lineTo(0, 0)
  ctx.closePath()
  ctx.moveTo(0.9, -0.68)
  ctx.lineTo(0.9, 0.68)
  ctx.lineTo(0, 0)
  ctx.closePath()
  ctx.stroke()
}

/** Vertical stem + lever handle above a valve. */
function leverHandle(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -0.95)
  ctx.moveTo(-0.3, -0.95)
  ctx.lineTo(0.3, -0.95)
  ctx.stroke()
}

/** Vertical stem + round hand-wheel above a valve. */
function wheelHandle(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -0.72)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(0, -0.84, 0.34, 0.15, 0, 0, Math.PI * 2)
  ctx.stroke()
}

/** Monitor pedestal: base plate, riser and elbow ending in a barrel. */
function monitorBody(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  ctx.moveTo(-0.4, 1)
  ctx.lineTo(0.4, 1)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, 1)
  ctx.lineTo(0, 0)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(0.05, -0.58, 0.5, -0.58)
  ctx.lineTo(0.6, -0.58)
  ctx.stroke()
}

/** Solid concentric arcs = pressurised water spray fan. */
function waterSpray(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.strokeStyle = accent
  ctx.lineWidth = 0.08
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath()
    ctx.arc(0.58, -0.56, i * 0.13, -Math.PI * 0.82, -Math.PI * 0.02)
    ctx.stroke()
  }
}

/** Dashed arc + droplets = aspirated foam discharge. */
function foamSpray(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.strokeStyle = accent
  ctx.fillStyle = accent
  ctx.lineWidth = 0.075
  ctx.beginPath()
  ctx.arc(0.58, -0.56, 0.36, -Math.PI * 0.82, -Math.PI * 0.02)
  ctx.setLineDash([0.12, 0.1])
  ctx.stroke()
  ctx.setLineDash([])
  for (const a of [-0.95, -0.44, 0.1]) {
    ctx.beginPath()
    ctx.arc(0.58 + Math.cos(a) * 0.32, -0.56 + Math.sin(a) * 0.32, 0.1, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Elevation of a hydrant barrel with a dome, top nut and outlet(s). */
function hydrantBody(ctx: CanvasRenderingContext2D, outlets: number) {
  ctx.beginPath()
  ctx.moveTo(-0.85, 1)
  ctx.lineTo(0.85, 1)
  ctx.stroke()
  ctx.beginPath()
  ctx.rect(-0.32, -0.25, 0.64, 1.25)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, -0.25, 0.32, Math.PI, 0)
  ctx.stroke()
  ctx.beginPath()
  ctx.rect(-0.16, -0.76, 0.32, 0.19)
  ctx.stroke()

  const sides = outlets >= 2 ? [-1, 1] : [-1]
  for (const s of sides) {
    ctx.beginPath()
    ctx.moveTo(s * 0.32, 0.22)
    ctx.lineTo(s * 0.62, 0.22)
    ctx.stroke()
  }
}

function hydrantOutlets(ctx: CanvasRenderingContext2D, accent: string, outlets: number) {
  ctx.fillStyle = accent
  const sides = outlets >= 2 ? [-1, 1] : [-1]
  for (const s of sides) {
    ctx.beginPath()
    ctx.ellipse(s * 0.68, 0.22, 0.11, 0.17, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ─── drawers ─────────────────────────────────────────────────────────

const waterMonitor: Drawer = (ctx, accent) => {
  monitorBody(ctx)
  waterSpray(ctx, accent)
}

const foamMonitor: Drawer = (ctx, accent) => {
  monitorBody(ctx)
  foamSpray(ctx, accent)
}

const waterFoamMonitor: Drawer = (ctx, accent) => {
  monitorBody(ctx)
  ctx.strokeStyle = '#0284c7'
  ctx.lineWidth = 0.09
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath()
    ctx.arc(0.6, -0.58, i * 0.12, -Math.PI * 0.78, -Math.PI * 0.02)
    ctx.stroke()
  }
  ctx.fillStyle = accent
  for (const a of [-0.95, -0.3]) {
    ctx.beginPath()
    ctx.arc(0.6 + Math.cos(a) * 0.34, -0.58 + Math.sin(a) * 0.34, 0.1, 0, Math.PI * 2)
    ctx.fill()
  }
}

const inlineInductor: Drawer = (ctx, accent) => {
  // Rectangular throat flanked by tapers — reads as a venturi tube, not a bow-tie.
  ctx.beginPath()
  ctx.moveTo(-1, -0.42)
  ctx.lineTo(-0.62, -0.42)
  ctx.lineTo(-0.44, -0.18)
  ctx.lineTo(0.44, -0.18)
  ctx.lineTo(0.62, -0.42)
  ctx.lineTo(1, -0.42)
  ctx.moveTo(-1, 0.42)
  ctx.lineTo(-0.62, 0.42)
  ctx.lineTo(-0.44, 0.18)
  ctx.lineTo(0.44, 0.18)
  ctx.lineTo(0.62, 0.42)
  ctx.lineTo(1, 0.42)
  ctx.stroke()
  // Suction branch, arrow pointing into the throat.
  ctx.beginPath()
  ctx.moveTo(0, -0.56)
  ctx.lineTo(0, -0.95)
  ctx.stroke()
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.moveTo(0, -0.2)
  ctx.lineTo(-0.17, -0.56)
  ctx.lineTo(0.17, -0.56)
  ctx.closePath()
  ctx.fill()
}

const hydrantSingle: Drawer = (ctx, accent) => {
  hydrantBody(ctx, 1)
  hydrantOutlets(ctx, accent, 1)
}

const hydrantDouble: Drawer = (ctx, accent) => {
  hydrantBody(ctx, 2)
  hydrantOutlets(ctx, accent, 2)
}

const butterflyValve: Drawer = (ctx, accent) => {
  bowtie(ctx)
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.ellipse(0, 0, 0.17, 0.44, 0, 0, Math.PI * 2)
  ctx.fill()
  leverHandle(ctx)
}

const inlineValve: Drawer = (ctx, accent) => {
  bowtie(ctx)
  ctx.strokeStyle = accent
  ctx.lineWidth = 0.22
  ctx.beginPath()
  ctx.moveTo(0, -0.62)
  ctx.lineTo(0, 0.62)
  ctx.stroke()
  wheelHandle(ctx)
}

const blindFlange: Drawer = (ctx, accent) => {
  ctx.beginPath()
  ctx.moveTo(-1, 0)
  ctx.lineTo(-0.16, 0)
  ctx.moveTo(0.16, 0)
  ctx.lineTo(0.62, 0)
  ctx.stroke()
  ctx.beginPath()
  ctx.rect(-0.16, -0.88, 0.32, 1.76)
  ctx.stroke()
  ctx.fillStyle = accent
  for (const [bx, by] of [
    [-0.34, -0.58],
    [0.34, -0.58],
    [-0.34, 0.58],
    [0.34, 0.58],
  ]) {
    ctx.beginPath()
    ctx.arc(bx, by, 0.12, 0, Math.PI * 2)
    ctx.fill()
  }
}

const DRAWERS: Record<string, Drawer> = {
  water_monitor: waterMonitor,
  foam_monitor: foamMonitor,
  water_foam_monitor: waterFoamMonitor,
  inline_inductor: inlineInductor,
  hydrant_single: hydrantSingle,
  hydrant_double: hydrantDouble,
  butterfly_valve: butterflyValve,
  inline_valve: inlineValve,
  blind_flange: blindFlange,
}

/**
 * Paint one schematic symbol centred on (cx, cy) with a bounding box of
 * `size` px. `accent` tints the moving part of the fitting so different
 * items stay distinguishable when several share a node.
 */
export function drawSchematicSymbol(
  ctx: CanvasRenderingContext2D,
  id: string,
  cx: number,
  cy: number,
  size: number,
  accent = '#0ea5e9',
) {
  const drawer = DRAWERS[id]
  if (!drawer) return
  const s = size / 2
  if (!(s > 0.6)) return
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  ctx.lineWidth = 0.15
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  ctx.fillStyle = INK
  drawer(ctx, accent)
  ctx.restore()
}

/** True when at least one drawer exists for the id. */
export function hasSchematicSymbol(id: string): boolean {
  return Boolean(DRAWERS[id])
}
