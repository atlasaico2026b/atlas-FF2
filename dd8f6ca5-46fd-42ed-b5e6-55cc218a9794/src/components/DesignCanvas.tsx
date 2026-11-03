// SPDX-License-Identifier: Apache-2.0
import { useRef, useEffect, useState, useCallback } from 'react'
import type { DesignElement, PipeSegment, LayerConfig } from './DesignWorkspace'
import type { PipeNode } from '@/lib/pipeNodeTypes'
import { EQUIPMENT_SVG, ELEMENT_COLORS, ELEMENT_LABELS } from '@/lib/equipmentSvgData'
import { calcCoolingNozzleCount } from '@/lib/fireCalculations'
import { createPipeNode, PIPE_POINT_ITEMS } from '@/lib/pipePoints'
import { drawSchematicSymbol } from '@/lib/schematicSymbols'
import { getPointIcon, pointIconRect, preloadPointIcons } from '@/lib/pointIconSprites'
import { isFireSystemActive, type FireSystemId } from '@/lib/fireSystemRules'
import { runSpecEngine } from '@/lib/spec/engine'
import { roofKindFromTankType, specConfigFromProject } from '@/lib/specProject'

interface DesignCanvasProps {
  project: any
  elements: DesignElement[]
  pipes: PipeSegment[]
  layers: LayerConfig[]
  activeLayer: number
  activeTool: string
  selectedElement: string | null
  selectedPipe: string | null
  onSelectElement: (id: string | null) => void
  onSelectPipe: (id: string | null) => void
  onDeleteElement: (id: string) => void
  onDeletePipe: (id: string) => void
  onUpdatePipe: (id: string, updates: Partial<PipeSegment>) => void
  onUpdateElement: (id: string, updates: Partial<DesignElement>) => void
  onAddElement: (element: DesignElement) => void
  onAddPipe: (pipe: PipeSegment) => void
  onAddNode?: (pipeId: string, node: PipeNode) => void
  onUpdateNode?: (pipeId: string, nodeId: string, updates: Partial<PipeNode>) => void
  selectedNodeId?: string | null
  onSelectNode?: (id: string | null) => void
  zoom: number
  pan: { x: number; y: number }
  onPanChange: (pan: { x: number; y: number }) => void
  /** Zoom is owned by the workspace, so the canvas needs the setter back. */
  onZoomChange?: (zoom: number) => void
  /** Fitting size and cluster spread, also owned by the workspace. */
  nodeStyle?: NodeStyle
  phase: string
  zones: Record<string, string>
  drawShapeType?: string
  drawPipeType?: string
  pipeSize?: string
  gridSnap?: boolean
  orthogonal?: boolean
  showRoadLabel?: boolean
  showPipeName?: boolean
  showPipeSize?: boolean
}

const PX_PER_METER = 10

const LARGE_TYPES = new Set([
  'water_tank', 'oil_tank', 'control_building', 'warehouse',
  'foam_tank', 'turbine', 'manifold', 'underground_tank', 'contamination_tank', 'electrical_station',
  'telecom_station', 'parking', 'co2', 'office_building', 'hse_building',
  'equipment_store', 'workshop', 'tank_cooling', 'tank_foaming', 'shed_cooling', 'auto_co2',
  'gas_station',
])

const DESIGN_CANVAS_SPEC_CONFIG = specConfigFromProject(null, [], [])
const foamOutletCountCache = new Map<string, number | null>()

function specRunForFoamOutlets(
  d: number,
  h: number,
  ctx?: { tankType?: string | null; fuelType?: string | null },
): ReturnType<typeof runSpecEngine> {
  const roofKind = roofKindFromTankType(ctx?.tankType)
  if (roofKind === null) {
    return null as any
  }

  const shellH = h > 0 ? h : 15

  return runSpecEngine(
    {
      id: 'design-canvas',
      label: 'tank',
      diameterM: d,
      shellHeightM: shellH,
      liquidLevelM: shellH * 0.85,
      fuelKey: (ctx?.fuelType as string) || 'nafte_gaz',
      roofKind,
      coolingHeightM: shellH,
    },
    DESIGN_CANVAS_SPEC_CONFIG,
  )
}

function foamOutletCountFor(
  d: number,
  h: number,
  tankType: string | null | undefined,
  fuelType: string | null | undefined,
): number | null {
  const roofKind = roofKindFromTankType(tankType)
  if (roofKind === null) return null

  const key = `${d}|${h}|${roofKind}|${fuelType ?? ''}`
  const cached = foamOutletCountCache.get(key)
  if (cached !== undefined) return cached

  try {
    const run = specRunForFoamOutlets(d, h, { tankType, fuelType })
    const count = (run as any)?.foam?.outletCount ?? null
    foamOutletCountCache.set(key, count)
    return count
  } catch {
    foamOutletCountCache.set(key, null)
    return null
  }
}

const PIPE_COLORS: Record<string, string> = {
  fire_water: '#dc2626', underground: '#16a34a', foam: '#eab308', co2: '#6b7280',
  road: '#78716c',
}

const PIPE_SIZES: { label: string; widthPx: number }[] = [
  { label: '1"', widthPx: 1 },
  { label: '1.5"', widthPx: 2 },
  { label: '2"', widthPx: 2 },
  { label: '2.5"', widthPx: 3 },
  { label: '3"', widthPx: 3 },
  { label: '4"', widthPx: 4 },
  { label: '6"', widthPx: 6 },
  { label: '8"', widthPx: 8 },
  { label: '10"', widthPx: 10 },
  { label: '12"', widthPx: 12 },
]

const PIPE_TYPE_LABELS: Record<string, string> = {
  fire_water: 'لوله آب آتش‌نشانی',
  underground: 'لوله زیرسطحی',
  foam: 'لوله فوم',
  co2: 'لوله CO₂',
  road: 'جاده',
}

const LINE_DRAW_TYPES = new Set(['pipe', 'road'])

// ─── view transform ──────────────────────────────────────────────────
// The canvas paints at `screen = pan + zoom * world`. Zoom is a controlled
// prop, so every change must be pushed back up via `onZoomChange`; the pan is
// adjusted at the same time so the point under the cursor stays put. Skipping
// that push is what made the drawing slide instead of magnify.

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
}

export function screenToWorld(px: number, py: number, pan: { x: number; y: number }, zoom: number) {
  return { x: (px - pan.x) / zoom, y: (py - pan.y) / zoom }
}

/**
 * Pan that keeps the world point under (anchorX, anchorY) exactly where it is
 * while the scale goes from `zoom` to `next`.
 */
export function zoomPan(
  pan: { x: number; y: number }, zoom: number, next: number, anchorX: number, anchorY: number,
): { x: number; y: number } {
  const k = next / zoom
  return { x: anchorX - k * (anchorX - pan.x), y: anchorY - k * (anchorY - pan.y) }
}

/** Wheel delta → zoom multiplier, normalising the three deltaMode units. */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1
  return Math.exp(-deltaY * unit * 0.0015)
}

/** Log-scale slider mapping, so 100% sits in the middle of the track. */
export function zoomToSlider(zoom: number): number {
  return Math.round(100 * Math.log(zoom / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM))
}
export function sliderToZoom(value: number): number {
  return clampZoom(MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, value / 100))
}

// ─── node fitting layout ─────────────────────────────────────────────
export interface NodeSlot {
  /** Distance down the pipe, from the node. */
  along: number
  /** Distance perpendicular to the pipe, from the node. */
  across: number
}

/**
 * Fraction of the icon box taken by the soft glow a fitting sits on. It is a
 * faded halo rather than a solid plate: enough separation from a busy map,
 * but no hard white edge competing with the artwork.
 */
export const NODE_PLATE_RATIO = 0.62

/**
 * Radius of the glow behind a fitting, as a fraction of its half-extent. It is
 * kept just past the artwork so the glow fades out before it can spill onto
 * the run itself — it separates the fitting from the map, not from the pipe.
 */
export const NODE_GLOW_RATIO = 1.2

/** How a node's fittings are drawn. Both factors are plain multipliers. */
export interface NodeStyle {
  /** Fitting size, 1 = the default icon box. */
  size: number
  /** How far fittings sit from their node, 1 = the default tight cluster. */
  spread: number
}

export const DEFAULT_NODE_STYLE: NodeStyle = { size: 1, spread: 1 }
export const NODE_SIZE_LIMITS = { min: 0.6, max: 1.8, step: 0.05 }
export const NODE_SPREAD_LIMITS = { min: 0.5, max: 2.2, step: 0.05 }

/** Read a stored style back, ignoring anything out of range. */
export function clampNodeStyle(s: Partial<NodeStyle> | null | undefined): NodeStyle {
  const pick = (v: unknown, lim: { min: number; max: number }, fallback: number) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
    return Math.min(Math.max(n, lim.min), lim.max)
  }
  return {
    size: pick(s?.size, NODE_SIZE_LIMITS, DEFAULT_NODE_STYLE.size),
    spread: pick(s?.spread, NODE_SPREAD_LIMITS, DEFAULT_NODE_STYLE.spread),
  }
}

/** Fitting box, and the half-extent of the glow behind it, for one node. */
export function fittingBox(selected: boolean, style: NodeStyle) {
  const icon = (selected ? SELECTED_ICON : NODE_ICON) * style.size
  return { icon, plate: icon * NODE_PLATE_RATIO }
}

/**
 * Push a layout out (or pull it in) by `spread`. Nothing may be dragged into
 * the run itself, so the perpendicular offset keeps its wall clearance and
 * only the distance beyond it is adjustable. A fitting centred on the node
 * stays there.
 */
export function spreadSlots(slots: NodeSlot[], spread: number, wallClearance: number): NodeSlot[] {
  return slots.map(s => ({
    along: s.along * spread,
    across: s.across === 0
      ? 0
      : Math.sign(s.across) * Math.max(Math.abs(s.across) * spread, wallClearance),
  }))
}

/**
 * Where one node's fittings sit, in the pipe's own frame. All offsets share
 * one unit (whatever the caller passes) and never depend on the zoom, so the
 * fittings keep a constant size on screen.
 *
 *   1 fitting  → exactly on the node
 *   2 fittings → one on each side of the run, as close as the wall allows
 *   3+         → spread over both sides, never left on the fire line
 */
export function nodeSlots(
  n: number, pipeHalf: number, icon: number, plate = icon * NODE_PLATE_RATIO,
): NodeSlot[] {
  if (n <= 0) return []
  if (n === 1) return [{ along: 0, across: 0 }]
  // Closest a fitting centre may sit to the pipe axis: its plate must clear the wall.
  const clear = pipeHalf + plate + 2.5
  if (n === 2) return [{ along: 0, across: -clear }, { along: 0, across: clear }]
  const top = Math.ceil(n / 2)
  const row = (m: number, sign: number): NodeSlot[] =>
    Array.from({ length: m }, (_, i) => ({
      along: (i - (m - 1) / 2) * 2 * plate,
      across: sign * clear,
    }))
  return [...row(top, 1), ...row(n - top, -1)]
}

/** Unit axis + normal of the pipe at a node, so fittings follow the run. */
function pipeAxisAt(pipe: PipeSegment, node: PipeNode): { u: { x: number; y: number }; v: { x: number; y: number } } {
  const pts = pipe.points
  const i = Math.min(Math.max(node.segIndex, 0), Math.max(pts.length - 2, 0))
  const a = pts[i] || { x: node.x, y: node.y }
  const b = pts[i + 1] || a
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const u = { x: dx / len, y: dy / len }
  return { u, v: { x: -u.y, y: u.x } }
}

// ─── Project coordinate system ───
// The project origin (0,0) is at the SOUTH-WEST corner (bottom-left) of the
// site: X grows to the east, Y grows to the north. Internally the canvas uses
// screen pixels with Y growing downwards, so every conversion flips Y.
function worldToProject(worldX: number, worldY: number, worldH: number) {
  return { x: worldX / PX_PER_METER, y: (worldH - worldY) / PX_PER_METER }
}
function projectToWorld(projX: number, projY: number, worldH: number) {
  return { x: projX * PX_PER_METER, y: worldH - projY * PX_PER_METER }
}

function snapToGrid(x: number, y: number, gridSize: number): { x: number; y: number } {
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  }
}

function snapToOrthogonal(prev: { x: number; y: number }, curr: { x: number; y: number }): { x: number; y: number } {
  const dx = Math.abs(curr.x - prev.x)
  const dy = Math.abs(curr.y - prev.y)
  if (dx > dy) return { x: curr.x, y: prev.y }
  return { x: prev.x, y: curr.y }
}

function drawFlowArrows(
  ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[],
  color: string, _zoom: number, direction: 'forward' | 'backward' = 'forward'
) {
  if (pts.length < 2) return
  // Spacing is in world units so arrows keep their proportion to the drawing at
  // every zoom level instead of crowding together when zoomed out.
  const step = 80
  let accum = 0
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x
    const dy = pts[i].y - pts[i - 1].y
    const segLen = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx)
    let dist = step - (accum % step)
    while (dist < segLen) {
      const t = dist / segLen
      const ax = pts[i - 1].x + dx * t
      const ay = pts[i - 1].y + dy * t
      const actualAngle = direction === 'backward' ? angle + Math.PI : angle
      ctx.save()
      ctx.translate(ax, ay)
      ctx.rotate(actualAngle)
      ctx.fillStyle = color
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      ctx.moveTo(6, 0)
      ctx.lineTo(-4, -4)
      ctx.lineTo(-4, 4)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 1.0
      ctx.restore()
      dist += step
    }
    accum += segLen
  }
}

function drawPipeLabel(
  ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[],
  label: string,
  pipeSize: string | undefined,
  _zoom: number,
  color: string,
  showPipeName: boolean,
  showPipeSize: boolean
) {
  if (!label || pts.length < 2) return
  const mid = pts[Math.floor(pts.length / 2)]
  // World units: the label zooms with the plan, so its stroke weight and the
  // text stay proportional to the pipe it names.
  const fontSize = 12
  ctx.save()
  ctx.font = `bold ${fontSize}px Vazirmatn, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const parts: string[] = []
  if (showPipeName && label) parts.push(label)
  if (showPipeSize && pipeSize) parts.push(`(${pipeSize})`)
  const displayText = parts.join(' ')
  if (!displayText) return
  const metrics = ctx.measureText(displayText)
  const pad = 4
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.roundRect(
    mid.x - metrics.width / 2 - pad,
    mid.y - fontSize / 2 - pad,
    metrics.width + pad * 2,
    fontSize + pad * 2,
    3
  )
  ctx.fill()
  ctx.fillStyle = color
  ctx.fillText(displayText, mid.x, mid.y)
  ctx.restore()
}

function getLayerForType(type: string): number {
  if (['water_tank', 'pump', 'jockey_pump'].includes(type)) return 1
  if (['oil_tank', 'bundwall', 'underground_tank', 'contamination_tank'].includes(type)) return 2
  if (['turbine', 'manifold'].includes(type)) return 3
  if (['control_building', 'office_building', 'hse_building', 'warehouse', 'equipment_store',
       'parking', 'workshop', 'electrical_station', 'telecom_station'].includes(type)) return 4
  if (['gas_station'].includes(type)) return 5
  if (['monitor', 'hydrant', 'valve', 'butterfly_valve', 'co2', 'auto_co2'].includes(type)) return 6
  if (['foam_tank', 'tank_cooling', 'tank_foaming', 'shed_cooling'].includes(type)) return 7
  return 0
}

const iconImages: Record<string, HTMLImageElement> = {}
let iconsLoaded = false

function ensureIconImages(onReady?: () => void) {
  if (iconsLoaded) return
  for (const [type, svg] of Object.entries(EQUIPMENT_SVG)) {
    if (iconImages[type]) continue
    const img = new Image()
    img.onload = () => onReady?.()
    img.onerror = () => onReady?.()
    const hrefMatch = svg.match(/<image[^>]*href="([^"]+)"/)
    img.src = hrefMatch
      ? hrefMatch[1]
      : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    iconImages[type] = img
  }
  iconsLoaded = true
}

export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, worldW: number, worldH: number) {
  ctx.fillStyle = '#eef2f7'
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, worldW, worldH)
  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 2
  ctx.strokeRect(0, 0, worldW, worldH)

  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1.5
  for (let x = 0; x <= worldW; x += PX_PER_METER * 50) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, worldH)
    ctx.stroke()
  }
  for (let y = 0; y <= worldH; y += PX_PER_METER * 50) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(worldW, y)
    ctx.stroke()
  }

  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 0.8
  for (let x = 0; x <= worldW; x += PX_PER_METER * 10) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, worldH)
    ctx.stroke()
  }
  for (let y = 0; y <= worldH; y += PX_PER_METER * 10) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(worldW, y)
    ctx.stroke()
  }

  // ─── Axis labels ───
  // Origin (0,0) sits at the SOUTH-WEST corner: X increases eastward along the
  // bottom edge, Y increases northward along the left edge.
  ctx.fillStyle = '#475569'
  ctx.font = 'bold 12px monospace'
  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 1.5

  // X axis — drawn along the BOTTOM edge with labels placed inside the plan
  ctx.textAlign = 'center'
  for (let x = 0; x <= worldW; x += PX_PER_METER * 50) {
    ctx.beginPath()
    ctx.moveTo(x, worldH + 15)
    ctx.lineTo(x, worldH + 5)
    ctx.stroke()
    ctx.fillText(`X ${x / PX_PER_METER}`, x + 3, worldH + 28)
  }

  // Y axis — drawn along the LEFT edge, counted upward from the bottom
  ctx.textAlign = 'right'
  for (let y = 0; y <= worldH; y += PX_PER_METER * 50) {
    ctx.beginPath()
    ctx.moveTo(-15, y)
    ctx.lineTo(-5, y)
    ctx.stroke()
    ctx.fillText(`Y ${Math.round((worldH - y) / PX_PER_METER)}`, -20, y + 4)
  }

  // Origin marker
  ctx.beginPath()
  ctx.arc(0, worldH, 5, 0, Math.PI * 2)
  ctx.fillStyle = '#dc2626'
  ctx.fill()
  ctx.fillStyle = '#dc2626'
  ctx.font = 'bold 12px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('(0,0) SW', 10, worldH - 10)
}

function drawMapImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, worldW: number, worldH: number, opacity: number) {
  if (img.complete && img.naturalWidth > 0) {
    ctx.globalAlpha = opacity / 100
    const imgRatio = img.naturalWidth / img.naturalHeight
    const worldRatio = worldW / worldH
    let drawW: number, drawH: number, drawX: number, drawY: number
    if (imgRatio > worldRatio) {
      drawW = worldW
      drawH = worldW / imgRatio
      drawX = 0
      drawY = (worldH - drawH) / 2
    } else {
      drawH = worldH
      drawW = worldH * imgRatio
      drawX = (worldW - drawW) / 2
      drawY = 0
    }
    ctx.drawImage(img, drawX, drawY, drawW, drawH)
    ctx.globalAlpha = 1.0
  }
}

function getPerpendicularOffset(
  pts: { x: number; y: number }[], idx: number, halfW: number
): { dx: number; dy: number } {
  let dx: number, dy: number
  if (pts.length === 1) { return { dx: 0, dy: halfW } }
  if (idx === 0) {
    dx = pts[1].x - pts[0].x; dy = pts[1].y - pts[0].y
  } else if (idx === pts.length - 1) {
    dx = pts[idx].x - pts[idx - 1].x; dy = pts[idx].y - pts[idx - 1].y
  } else {
    dx = pts[idx + 1].x - pts[idx - 1].x; dy = pts[idx + 1].y - pts[idx - 1].y
  }
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  return { dx: (-dy / len) * halfW, dy: (dx / len) * halfW }
}

function drawRealRoad(
  ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[],
  halfWidth: number, _zoom: number
) {
  if (pts.length < 2) return
  const left: { x: number; y: number }[] = []
  const right: { x: number; y: number }[] = []
  for (let i = 0; i < pts.length; i++) {
    const off = getPerpendicularOffset(pts, i, halfWidth)
    left.push({ x: pts[i].x + off.dx, y: pts[i].y + off.dy })
    right.push({ x: pts[i].x - off.dx, y: pts[i].y - off.dy })
  }

  // Asphalt fill
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(left[0].x, left[0].y)
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y)
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y)
  ctx.closePath()
  ctx.fillStyle = '#525252'
  ctx.fill()

  // Left white edge line
  ctx.beginPath()
  ctx.moveTo(left[0].x, left[0].y)
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y)
  ctx.strokeStyle = '#f5f5f5'
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.stroke()

  // Right white edge line
  ctx.beginPath()
  ctx.moveTo(right[0].x, right[0].y)
  for (let i = 1; i < right.length; i++) ctx.lineTo(right[i].x, right[i].y)
  ctx.strokeStyle = '#f5f5f5'
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.stroke()

  // Yellow dashed center line
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.strokeStyle = '#facc15'
  ctx.lineWidth = 2
  ctx.setLineDash([12, 8])
  ctx.lineJoin = 'round'
  ctx.stroke()
  ctx.setLineDash([])
}

/**
 * Cooling ring around a tank (NFPA 15).
 * Draws an elliptical ring of water-spray nozzles at the calculated spacing so
 * the operator sees the real number of nozzles required for that tank diameter.
 */
export function drawTankCoolingRing(
  ctx: CanvasRenderingContext2D, el: DesignElement, _zoom: number
) {
  const props = el.properties
  if (!props) return
  if (!isFireSystemActive(el.type, props, 'cooling')) return
  const d = parseFloat(String(props.diameter ?? '')) || 0
  const h = parseFloat(String(props.height ?? '')) || 0
  if (d <= 0 || h <= 0) return

  const sizing = calcCoolingNozzleCount(d, h)
  const coolingOverride = (() => {
    const v = Number(props.coolingNozzleOverride ?? NaN)
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : null
  })()

  const perRing = coolingOverride ? Math.max(1, Math.ceil(coolingOverride / Math.max(1, sizing.rings))) : sizing.perRing
  const rings = sizing.rings
  const total = perRing * rings

  const cx = el.x + el.width / 2
  const cy = el.y + el.height / 2
  const rx = el.width / 2 + 10
  const ry = el.height / 2 + 10

  ctx.save()
  // Ring guide line
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.strokeStyle = '#3b82f6'
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 1.2
  ctx.setLineDash([5, 4])
  ctx.stroke()
  ctx.setLineDash([])

  // Nozzle dots distributed on the ring (per-ring count, capped for readability)
  const dots = Math.min(perRing, 48)
  const r = 3.2
  for (let i = 0; i < dots; i++) {
    const a = (i / dots) * Math.PI * 2 - Math.PI / 2
    const px = cx + Math.cos(a) * rx
    const py = cy + Math.sin(a) * ry
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fillStyle = '#3b82f6'
    ctx.globalAlpha = 0.95
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.globalAlpha = 1
    ctx.stroke()
  }

  // Count badge
  const coolingBadgeOpacityPct = Number(props.coolingBadgeOpacity ?? 100)
  const coolingBadgeAlpha = Math.min(1, Math.max(0, coolingBadgeOpacityPct / 100))
  const coolingBadgeDX = Number(props.coolingBadgeOffsetX ?? 0)
  const coolingBadgeDY = Number(props.coolingBadgeOffsetY ?? 0)

  if (coolingBadgeAlpha > 0) {
    const label = `${total} آبپاش کولینگ`
    ctx.font = 'bold 9px Vazirmatn, sans-serif'
    const m = ctx.measureText(label)
    const bx = cx - m.width / 2 - 4 + coolingBadgeDX
    const by = cy + ry + 4 + coolingBadgeDY
    ctx.globalAlpha = coolingBadgeAlpha
    ctx.fillStyle = 'rgba(219,234,254,0.92)'
    ctx.beginPath()
    ctx.roundRect(bx, by, m.width + 8, 14, 4)
    ctx.fill()
    ctx.fillStyle = '#1d4ed8'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, cx + coolingBadgeDX, by + 7)
    ctx.globalAlpha = 1.0
  }
  ctx.restore()
}

/**
 * Fittings attached to a pipe (Points feature). Each node is drawn as a marker
 * whose glyphs are the union of the items ticked in the point editor.
 */
/** Icon box, in screen pixels, for a road-map node's fittings. */
export const NODE_ICON = 26
export const SELECTED_ICON = 40

/**
 * One fitting's artwork on the map, centred on (x, y) with a bounding box of
 * `box`. The photographic render is preferred; the vector glyph stands in
 * until the image has decoded, and for any id that has no render.
 */
function drawNodeFitting(
  ctx: CanvasRenderingContext2D, id: string, color: string,
  x: number, y: number, box: number,
) {
  const img = getPointIcon(id)
  if (!img) {
    drawSchematicSymbol(ctx, id, x, y, box, color)
    return
  }
  const { w, h } = pointIconRect(id, box)
  ctx.drawImage(img, x - w / 2, y - h / 2, w, h)
}

/**
 * Paint every node on the drawn pipes. A node carries zero or more fittings;
 * the map shows them as a cluster of real schematic symbols, laid out in the
 * pipe's own frame. All sizes are in world units, so a fitting keeps the same
 * proportion to the plan at every zoom level. (They used to be divided by
 * `zoom`, which pinned them to a fixed screen size — that made fittings grow
 * relative to the drawing as the operator zoomed out.)
 */
export function drawPipeNodes(
  ctx: CanvasRenderingContext2D, pipes: PipeSegment[], vis: Set<number>,
  _zoom: number, selectedNodeId?: string | null, style: NodeStyle = DEFAULT_NODE_STYLE
) {
  for (const pipe of pipes) {
    if (!vis.has(pipe.layer) || !pipe.nodes?.length) continue
    const pipeHalfWorld = (pipe.pipeWidth || 10) / 2

    for (const node of pipe.nodes) {
      const isSel = selectedNodeId === node.id
      const items = PIPE_POINT_ITEMS.filter(i => node.items.includes(i.id))

      if (items.length === 0) {
        // Bare node: a small connector mark so it still reads on the map.
        ctx.beginPath()
        ctx.arc(node.x, node.y, 5, 0, Math.PI * 2)
        ctx.fillStyle = isSel ? '#f97316' : '#94a3b8'
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.stroke()
        continue
      }

      const { icon, plate } = fittingBox(isSel, style)
      const wallClearance = pipeHalfWorld + plate + 2.5
      const slots = spreadSlots(nodeSlots(items.length, pipeHalfWorld, icon, plate), style.spread, wallClearance)
      const { u, v } = pipeAxisAt(pipe, node)

      if (isSel) {
        // Ring the whole cluster, not one fitting.
        let reach = 0
        for (const s of slots) reach = Math.max(reach, Math.hypot(s.along, s.across))
        ctx.beginPath()
        ctx.arc(node.x, node.y, reach + plate + 7, 0, Math.PI * 2)
        ctx.strokeStyle = '#f97316'
        ctx.lineWidth = 2
        ctx.setLineDash([5, 4])
        ctx.stroke()
        ctx.setLineDash([])
      }

      for (let i = 0; i < items.length; i++) {
        const s = slots[i]
        // Placed in the pipe's own frame, but never rotated: a fitting reads
        // upright however the run was drawn.
        const x = node.x + s.along * u.x + s.across * v.x
        const y = node.y + s.along * u.y + s.across * v.y

        // A faded glow, not a white plate: it separates the artwork from a busy
        // map without drawing a box around every fitting.
        const glow = plate * NODE_GLOW_RATIO
        const grad = ctx.createRadialGradient(x, y, plate * 0.45, x, y, glow)
        grad.addColorStop(0, 'rgba(255,255,255,0.62)')
        grad.addColorStop(0.55, 'rgba(255,255,255,0.30)')
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.beginPath()
        ctx.arc(x, y, glow, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()

        drawNodeFitting(ctx, items[i].id, items[i].color, x, y, icon)
      }
    }
  }
}

function drawRealPipe(
  ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[],
  halfWidth: number, color: string
) {
  if (pts.length < 2) return
  const left: { x: number; y: number }[] = []
  const right: { x: number; y: number }[] = []
  for (let i = 0; i < pts.length; i++) {
    const off = getPerpendicularOffset(pts, i, halfWidth)
    left.push({ x: pts[i].x + off.dx, y: pts[i].y + off.dy })
    right.push({ x: pts[i].x - off.dx, y: pts[i].y - off.dy })
  }

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(left[0].x, left[0].y)
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y)
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.globalAlpha = 0.5
  ctx.stroke()
  ctx.globalAlpha = 1.0
}

function drawSelectionHighlight(
  ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[],
  halfWidth: number
) {
  if (pts.length < 2) return
  const left: { x: number; y: number }[] = []
  const right: { x: number; y: number }[] = []
  for (let i = 0; i < pts.length; i++) {
    const off = getPerpendicularOffset(pts, i, halfWidth + 6)
    left.push({ x: pts[i].x + off.dx, y: pts[i].y + off.dy })
    right.push({ x: pts[i].x - off.dx, y: pts[i].y - off.dy })
  }
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(left[0].x, left[0].y)
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y)
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y)
  ctx.closePath()
  ctx.strokeStyle = '#2563eb'
  ctx.lineWidth = 3
  ctx.setLineDash([8, 4])
  ctx.stroke()
  ctx.setLineDash([])
}

function drawPipes(
  ctx: CanvasRenderingContext2D, pipes: PipeSegment[], vis: Set<number>,
  zoom: number,
  selectedPipeId: string | null,
  showRoadLabel: boolean,
  showPipeName: boolean,
  showPipeSize: boolean
) {
  for (const pipe of pipes) {
    if (!vis.has(pipe.layer) || pipe.points.length < 2) continue

    const isRoad = pipe.label === 'جاده'
    const pw = (pipe.pipeWidth || 10) / 2

    if (isRoad) {
      drawRealRoad(ctx, pipe.points, (pipe.roadWidth || 36) / 2, zoom)
    } else {
      drawRealPipe(ctx, pipe.points, pw, pipe.color)
      drawFlowArrows(ctx, pipe.points, pipe.color, zoom, (pipe.flowDirection === 'backward' ? 'backward' : 'forward'))
      drawPipeLabel(
        ctx,
        pipe.points,
        pipe.label || '',
        pipe.pipeSize,
        zoom,
        pipe.color,
        showPipeName,
        showPipeSize
      )
    }

    if (selectedPipeId === pipe.id) {
      if (isRoad) {
        drawSelectionHighlight(ctx, pipe.points, (pipe.roadWidth || 36) / 2)
      } else {
        drawSelectionHighlight(ctx, pipe.points, pw)
      }
    }

    if (isRoad && showRoadLabel) {
      const mid = pipe.points[Math.floor(pipe.points.length / 2)]
      ctx.font = 'bold 13px Vazirmatn, sans-serif'
      ctx.fillStyle = '#f5f5f5'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 3
      ctx.textAlign = 'center'
      ctx.strokeText(pipe.label || '', mid.x, mid.y - 14)
      ctx.fillText(pipe.label || '', mid.x, mid.y - 14)
    }
  }
}

function drawFireSystemBadges(
  ctx: CanvasRenderingContext2D, el: DesignElement, _zoom: number
) {
  const props = el.properties
  if (!props) return
  const active = (id: FireSystemId) => isFireSystemActive(el.type, props, id)
  const badges: { text: string; color: string }[] = []
  if (active('foam_chamber')) badges.push({ text: '🧯', color: '#f59e0b' })
  if (active('co2_system')) badges.push({ text: '⚪', color: '#6b7280' })
  if (active('sprinkler')) badges.push({ text: '🚿', color: '#0ea5e9' })

  if (badges.length > 0) {
    const r = Math.max(el.width, el.height) / 2 + 4
    const badgeR = 7
    for (let i = 0; i < badges.length; i++) {
      const angle = -Math.PI / 2 + (i / badges.length) * Math.PI * 2
      const bx = el.x + el.width / 2 + Math.cos(angle) * r
      const by = el.y + el.height / 2 + Math.sin(angle) * r
      ctx.save()
      ctx.beginPath()
      ctx.arc(bx, by, badgeR, 0, Math.PI * 2)
      ctx.fillStyle = badges[i].color
      ctx.globalAlpha = 0.9
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(badges[i].text, bx, by)
      ctx.restore()
    }
  }

  // ─── Text summary of the active systems ───
  const labelParts: string[] = []
  if (active('cooling')) {
    const d = parseFloat(String(props.diameter ?? '')) || 0
    const h = parseFloat(String(props.height ?? '')) || 0
    if (d > 0 && h > 0) {
      labelParts.push(`کولینگ (${calcCoolingNozzleCount(d, h).total} نازل)`)
    } else {
      labelParts.push('کولینگ')
    }
  }
  if (active('foam_chamber')) labelParts.push('فوم چمبر')
  if (active('co2_system')) labelParts.push('CO₂')
  if (active('sprinkler')) labelParts.push('اسپرینکلر')
  if (labelParts.length > 0) {
    const systemLabelOpacityPct = Number(props.systemLabelOpacity ?? 100)
    const systemLabelAlpha = Math.min(1, Math.max(0, systemLabelOpacityPct / 100))
    const systemLabelDX = Number(props.systemLabelOffsetX ?? 0)
    const systemLabelDY = Number(props.systemLabelOffsetY ?? 0)

    if (systemLabelAlpha > 0) {
      ctx.save()
      const fontSize = 8
      ctx.font = `bold ${fontSize}px Vazirmatn, sans-serif`
      ctx.textAlign = 'center'
      ctx.globalAlpha = systemLabelAlpha
      ctx.fillStyle = '#dc2626'
      ctx.fillText(labelParts.join(' + '), el.x + el.width / 2 + systemLabelDX, el.y - 8 + systemLabelDY)
      ctx.globalAlpha = 1.0
      ctx.restore()
    }
  }
}

function drawEquipmentIcon(
  ctx: CanvasRenderingContext2D, el: DesignElement, _zoom: number,
  isSel: boolean, zone: string | undefined
) {
  ctx.save()
  ctx.translate(el.x + el.width / 2, el.y + el.height / 2)
  ctx.rotate((el.rotation * Math.PI) / 180)
  ctx.translate(-el.width / 2, -el.height / 2)

  if (isSel) {
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 2.5
    ctx.shadowColor = '#2563eb'
    ctx.shadowBlur = 10
    ctx.strokeRect(-3, -3, el.width + 6, el.height + 6)
    ctx.shadowBlur = 0
  }

  const cachedImg = iconImages[el.type]
  if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
    ctx.drawImage(cachedImg, 0, 0, el.width, el.height)
  } else {
    ctx.fillStyle = el.color || ELEMENT_COLORS[el.type] || '#94a3b8'
    ctx.strokeStyle = isSel ? '#2563eb' : '#334155'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(0, 0, el.width, el.height, 4)
    ctx.fill()
    ctx.stroke()
  }

  // ─── Name label (position / visibility / scale are user-customisable) ───
  if (!el.properties?.labelHidden) {
    const offX = Number(el.properties?.labelOffsetX ?? 0)
    const offY = Number(el.properties?.labelOffsetY ?? 14)
    const scale = Number(el.properties?.labelScale ?? 1)
    const fontSize = 11 * scale
    const text = el.label || ELEMENT_LABELS[el.type] || el.type
    ctx.font = `bold ${fontSize}px Vazirmatn, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const lx = el.width / 2 + offX
    const ly = el.height + offY
    const m = ctx.measureText(text)
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    ctx.beginPath()
    ctx.roundRect(lx - m.width / 2 - 3, ly - fontSize, m.width + 6, fontSize + 4, 3)
    ctx.fill()
    ctx.fillStyle = '#1e293b'
    ctx.fillText(text, lx, ly)
  }

  if (zone) {
    const zoneColors: Record<string, string> = {
      A: '#ef4444', B: '#f97316', C: '#eab308', D: '#22c55e', E: '#10b981',
    }
    ctx.fillStyle = zoneColors[zone] || '#94a3b8'
    ctx.beginPath()
    ctx.arc(el.width - 4, -4, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 9px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(zone, el.width - 4, -4)
    ctx.textBaseline = 'alphabetic'
  }

  ctx.restore()
}

function drawInfoLabels(
  ctx: CanvasRenderingContext2D, el: DesignElement, _zoom: number, vis: Set<number>
) {
  if (!vis.has(-2)) return
  const props = el.properties
  if (!props) return

  const infoOpacityPct = Number(props.tankInfoOpacity ?? 80)
  const generalAlpha = Math.min(1, Math.max(0, infoOpacityPct / 100))

  const infoOffsetX = Number(props.tankInfoOffsetX ?? 0)
  const infoOffsetY = Number(props.tankInfoOffsetY ?? 0)

  const baseX = el.x + el.width - 2 + infoOffsetX
  const startY = el.y + el.height + 18 + infoOffsetY

  const fontSize = 8
  const lineStep = fontSize + 2

  const generalLines: string[] = []
  if (props.name) generalLines.push(`نام: ${props.name}`)
  if (props.number) generalLines.push(`شماره: ${props.number}`)
  if (props.diameter) generalLines.push(`قطر: ${props.diameter}m`)
  if (props.height) generalLines.push(`ارتفاع: ${props.height}m`)
  if (props.volume) generalLines.push(`حجم: ${props.volume}`)
  if (props.fuelType) generalLines.push(`نوع مواد: ${props.fuelType}`)
  if (props.tankType) generalLines.push(`نوع سقف: ${props.tankType}`)
  if (props.flowRate) generalLines.push(`دبی: ${props.flowRate} L/min`)
  if (props.head) generalLines.push(`هد: ${props.head}m`)
  if (props.power) generalLines.push(`توان: ${props.power}kW`)
  if (props.motorNumber) generalLines.push(`موتور شماره: ${props.motorNumber}`)
  if (props.motorType) generalLines.push(`نوع موتور: ${props.motorType}`)
  if (props.manufacturer) generalLines.push(`سازنده: ${props.manufacturer}`)
  if (props.material) generalLines.push(`مواد: ${props.material}`)

  const coolingEnabled = isFireSystemActive(el.type, props, 'cooling')
  const foamEnabled = isFireSystemActive(el.type, props, 'foam_chamber')

  const coolingLine = (() => {
    if (!coolingEnabled) return null
    const d = parseFloat(String(props.diameter ?? '')) || 0
    const h = parseFloat(String(props.height ?? '')) || 0
    if (d <= 0 || h <= 0) return 'کولینگ: —'

    const override = Number(props.coolingNozzleOverride ?? NaN)
    const count = Number.isFinite(override) && override > 0
      ? Math.floor(override)
      : calcCoolingNozzleCount(d, h).total
    return `کولینگ: ${count} نازل`
  })()

  const foamLine = (() => {
    if (!foamEnabled) return null
    const d = parseFloat(String(props.diameter ?? '')) || 0
    const h = parseFloat(String(props.height ?? '')) || 0
    if (d <= 0 || h <= 0) return 'فومینگ: —'

    const override = Number(props.foamOutletOverride ?? NaN)
    const count = Number.isFinite(override) && override > 0
      ? Math.floor(override)
      : foamOutletCountFor(d, h, props.tankType as string | null, props.fuelType as string | null)

    return `فومینگ: ${count ?? '—'} عدد`
  })()

  if (generalLines.length === 0 && !coolingLine && !foamLine) return

  ctx.save()
  ctx.font = `${fontSize}px Vazirmatn, sans-serif`
  ctx.textAlign = 'right'
  ctx.fillStyle = '#64748b'

  let lineIndex = 0

  for (const t of generalLines) {
    lineIndex += 1
    ctx.globalAlpha = generalAlpha
    ctx.fillText(t, baseX, startY + lineIndex * lineStep)
  }

  if (coolingLine) {
    const coolingVisible = props.coolingInfoVisible ?? true
    const coolingAlphaPct = coolingVisible
      ? Number(props.coolingInfoOpacity ?? infoOpacityPct)
      : 0
    const coolingAlpha = Math.min(1, Math.max(0, coolingAlphaPct / 100))
    const coolingDX = Number(props.coolingInfoOffsetX ?? 0)
    const coolingDY = Number(props.coolingInfoOffsetY ?? 0)

    lineIndex += 1
    ctx.globalAlpha = coolingAlpha
    ctx.fillText(coolingLine, baseX + coolingDX, startY + lineIndex * lineStep + coolingDY)
  }

  if (foamLine) {
    const foamVisible = props.foamInfoVisible ?? true
    const foamAlphaPct = foamVisible
      ? Number(props.foamInfoOpacity ?? infoOpacityPct)
      : 0
    const foamAlpha = Math.min(1, Math.max(0, foamAlphaPct / 100))
    const foamDX = Number(props.foamInfoOffsetX ?? 0)
    const foamDY = Number(props.foamInfoOffsetY ?? 0)

    lineIndex += 1
    ctx.globalAlpha = foamAlpha
    ctx.fillText(foamLine, baseX + foamDX, startY + lineIndex * lineStep + foamDY)
  }

  ctx.globalAlpha = 1.0
  ctx.restore()
}

function drawCurrentDrawing(
  ctx: CanvasRenderingContext2D, drawPts: { x: number; y: number }[],
  drawShapeType: string, drawPipeType: string, zoom: number,
  mouseWorld: { x: number; y: number } | null, roadWidth: number
) {
  if (drawPts.length === 0) return

  if (drawShapeType === 'road') {
    const pts = mouseWorld ? [...drawPts, mouseWorld] : drawPts
    if (pts.length >= 2) drawRealRoad(ctx, pts, roadWidth / 2, zoom)
  } else {
    const color = PIPE_COLORS[drawPipeType] || '#dc2626'
    const pts = mouseWorld ? [...drawPts, mouseWorld] : drawPts
    if (pts.length >= 2) {
      drawRealPipe(ctx, pts, roadWidth / 2, color)
    }
  }

  for (const p of drawPts) {
    ctx.fillStyle = '#2563eb'
    ctx.beginPath()
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = x1 + t * dx, cy = y1 + t * dy
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
}

function hitTestPipe(px: number, py: number, pipe: PipeSegment, threshold: number): boolean {
  for (let i = 0; i < pipe.points.length - 1; i++) {
    const a = pipe.points[i], b = pipe.points[i + 1]
    if (pointToSegmentDist(px, py, a.x, a.y, b.x, b.y) < threshold) return true
  }
  return false
}

/**
 * Nearest point on a polyline to an arbitrary point, together with the index of
 * the segment it falls on. Used by the Points tool to anchor a node on a pipe.
 */
function nearestOnPolyline(
  px: number, py: number, pts: { x: number; y: number }[]
): { x: number; y: number; segIndex: number; dist: number } {
  let best = { x: pts[0]?.x ?? 0, y: pts[0]?.y ?? 0, segIndex: 0, dist: Infinity }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const dx = b.x - a.x, dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    let t = lenSq === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    const cx = a.x + t * dx, cy = a.y + t * dy
    const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
    if (dist < best.dist) best = { x: cx, y: cy, segIndex: i, dist }
  }
  return best
}

export default function DesignCanvas({
  project, elements, pipes, layers, activeLayer, activeTool,
  selectedElement, selectedPipe, onSelectElement, onSelectPipe, onDeleteElement, onDeletePipe, onUpdatePipe,
  onUpdateElement, onAddElement, onAddPipe,
  onAddNode, selectedNodeId, onSelectNode,
  zoom, pan, onPanChange, onZoomChange, phase, zones, drawShapeType = '', drawPipeType = 'fire_water',
  pipeSize = '2"',
  gridSnap = false,
  orthogonal = false,
  showRoadLabel = true,
  showPipeName = true,
  showPipeSize = true,
  nodeStyle = DEFAULT_NODE_STYLE,
}: DesignCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  /** Ctrl/Cmd held — the left button becomes a sheet-drag, so the cursor says so. */
  const [ctrlDown, setCtrlDown] = useState(false)
  const [drawPts, setDrawPts] = useState<{ x: number; y: number }[]>([])
  const [drawing, setDrawing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [mapImg, setMapImg] = useState<HTMLImageElement | null>(null)
  const [forceRedraw, setForceRedraw] = useState(0)
  const [mouseWorld, setMouseWorld] = useState<{ x: number; y: number } | null>(null)
  const [resizeHandle, setResizeHandle] = useState<string | null>(null)
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [roadWidth, setRoadWidth] = useState(36)
  const [mapOpacity, setMapOpacity] = useState(45)
  const [draggingPipe, setDraggingPipe] = useState(false)
  const [pipeDragOffset, setPipeDragOffset] = useState({ x: 0, y: 0 })

  // ─── zoom plumbing ───────────────────────────────────────────────
  // The wheel handler needs the *latest* view without re-binding a listener on
  // every frame, so the values it reads are mirrored into refs.
  const viewRef = useRef({ zoom, pan, size, drawing })
  viewRef.current = { zoom, pan, size, drawing }
  // Zoom value this component already compensated the pan for, so the
  // external-change effect below knows not to compensate a second time.
  const compensatedZoom = useRef<number | null>(null)

  /** Apply a scale change while pinning the world point under `anchor` (screen px). */
  const applyZoom = useCallback((next: number, anchor: { x: number; y: number }) => {
    const { zoom: z0, pan: p0 } = viewRef.current
    const nz = clampZoom(next)
    if (nz === z0) return
    compensatedZoom.current = nz
    onPanChange(zoomPan(p0, z0, nz, anchor.x, anchor.y))
    onZoomChange?.(nz)
  }, [onPanChange, onZoomChange])

  // Scroll wheel. React's onWheel is registered passively, so preventDefault
  // there is ignored and the page scrolls behind the canvas — bind natively.
  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { zoom: z0, pan: p0, size: s0, drawing: drawingNow } = viewRef.current
      if (e.shiftKey && drawingNow) {
        setRoadWidth(prev => Math.max(10, Math.min(120, prev + (e.deltaY > 0 ? -3 : 3))))
        return
      }
      // Ctrl+wheel is a trackpad pinch: same path, just a steeper curve.
      const factor = wheelZoomFactor(e.deltaY, e.deltaMode)
      const k = e.ctrlKey ? 1 + (factor - 1) * 2 : factor
      const next = clampZoom(z0 * k)
      if (next === z0) return
      const rect = cvs.getBoundingClientRect()
      const ax = e.clientX - rect.left
      const ay = e.clientY - rect.top
      compensatedZoom.current = next
      onPanChange(zoomPan(p0, z0, next, ax, ay))
      onZoomChange?.(next)
      void s0
    }
    cvs.addEventListener('wheel', onWheel, { passive: false })
    return () => cvs.removeEventListener('wheel', onWheel)
  }, [onPanChange, onZoomChange])

  // A zoom that arrives from the outside (the toolbar's +/− buttons, a saved
  // view, keyboard shortcuts) has no anchor to hand, so keep the canvas centre
  // fixed rather than letting the drawing swing out from the top-left corner.
  const lastZoom = useRef(zoom)
  useEffect(() => {
    const prev = lastZoom.current
    lastZoom.current = zoom
    if (prev === zoom || prev <= 0) return
    if (compensatedZoom.current === zoom) { compensatedZoom.current = null; return }
    const { pan: p0, size: s0 } = viewRef.current
    const cx = s0.w / 2
    const cy = s0.h / 2
    onPanChange(zoomPan(p0, prev, zoom, cx, cy))
  }, [zoom, onPanChange])

  useEffect(() => {
    ensureIconImages(() => setForceRedraw(n => n + 1))
    // Node fittings are photographic renders too, so start decoding them now
    // and repaint once each one lands.
    preloadPointIcons(() => setForceRedraw(n => n + 1))
    const timer = setTimeout(() => setForceRedraw(n => n + 1), 500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!project?.mapImageUrl) { setMapImg(null); return }
    const img = new Image()
    img.src = project.mapImageUrl
    img.onload = () => { setMapImg(img); setForceRedraw(n => n + 1) }
  }, [project?.mapImageUrl])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setSize({ w: Math.floor(r.width), h: Math.floor(r.height) })
    }
    update()
    const obs = new ResizeObserver(update)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const c2w = useCallback((cx: number, cy: number) => ({
    x: (cx - pan.x) / zoom,
    y: (cy - pan.y) / zoom,
  }), [zoom, pan])

  const showToastFn = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }, [])

  // ─── MAIN DRAW LOOP ───
  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs || size.w < 10 || size.h < 10) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    cvs.width = size.w * dpr
    cvs.height = size.h * dpr
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#eef2f7'
    ctx.fillRect(0, 0, size.w, size.h)

    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)

    const wM = project?.widthMeters || 100
    const hM = project?.heightMeters || 100
    const worldW = wM * PX_PER_METER
    const worldH = hM * PX_PER_METER

    drawBackground(ctx, size.w, size.h, worldW, worldH)

    if (mapImg) {
      drawMapImage(ctx, mapImg, worldW, worldH, mapOpacity)
    }

    const vis = new Set(layers.filter(l => l.visible).map(l => l.id))

    drawPipes(
      ctx,
      pipes,
      vis,
      zoom,
      selectedPipe,
      showRoadLabel,
      showPipeName,
      showPipeSize
    )

    for (const el of elements) {
      if (!vis.has(el.layer)) continue
      drawTankCoolingRing(ctx, el, zoom)
    }

    for (const el of elements) {
      if (!vis.has(el.layer)) continue
      drawEquipmentIcon(ctx, el, zoom, selectedElement === el.id, zones[el.id])
      drawFireSystemBadges(ctx, el, zoom)
      drawInfoLabels(ctx, el, zoom, vis)
    }

    drawPipeNodes(ctx, pipes, vis, zoom, selectedNodeId, nodeStyle)

    if (drawing && drawPts.length > 0) {
      drawCurrentDrawing(ctx, drawPts, drawShapeType, drawPipeType, zoom, mouseWorld, roadWidth)
    }

    ctx.restore()

    const barM = 50
    const barPx = barM * PX_PER_METER * zoom
    ctx.fillStyle = '#475569'
    ctx.fillRect(size.w - barPx - 20, size.h - 25, barPx, 3)
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`${barM}m`, size.w - barPx / 2 - 20, size.h - 30)

  }, [size, elements, pipes, layers, selectedElement, zoom, pan, project, zones, drawing, drawPts, mapImg, forceRedraw, drawPipeType, drawShapeType, mouseWorld, roadWidth, mapOpacity, selectedNodeId, nodeStyle, showRoadLabel, showPipeName, showPipeSize])

  // ─── MOUSE DOWN ───
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const w = c2w(cx, cy)

    // Middle button, Ctrl+left, or Cmd+left drags the sheet itself — the same
    // gesture as grabbing the paper in a drawing tool.
    if (
      activeTool === 'pan' ||
      e.button === 1 ||
      (e.button === 0 && (e.ctrlKey || e.metaKey))
    ) {
      e.preventDefault()
      setPanning(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
      return
    }

    if (activeTool === 'draw') {
      const isLineType = LINE_DRAW_TYPES.has(drawShapeType)
      if (isLineType || drawShapeType === 'pipe') {
        let pt = w
        if (gridSnap) pt = snapToGrid(pt.x, pt.y, 10)
        if (orthogonal && drawing && drawPts.length > 0) {
          pt = snapToOrthogonal(drawPts[drawPts.length - 1], pt)
        }
        if (!drawing) {
          setDrawing(true)
          setDrawPts([pt])
        } else {
          setDrawPts(prev => [...prev, pt])
        }
      }
      return
    }

    if (activeTool === 'point') {
      // Only pipes respond to the Points tool — attach a node at the nearest
      // point on the clicked pipe.
      let bestPipe: PipeSegment | null = null
      let bestHit: { x: number; y: number; segIndex: number; dist: number } | null = null
      for (const pipe of pipes) {
        if (pipe.label === 'جاده' || pipe.points.length < 2) continue
        const hit = nearestOnPolyline(w.x, w.y, pipe.points)
        const threshold = Math.max(12, (pipe.pipeWidth || 4) / 2 + 14)
        if (hit.dist <= threshold && (!bestHit || hit.dist < bestHit.dist)) {
          bestPipe = pipe
          bestHit = hit
        }
      }
      if (bestPipe && bestHit) {
        const node = createPipeNode(bestPipe.id, bestHit.x, bestHit.y, bestHit.segIndex)
        onAddNode?.(bestPipe.id, node)
        onSelectPipe(bestPipe.id)
        onSelectElement(null)
        showToastFn('⚙️ گره روی لوله ایجاد شد — تجهیزات گره را انتخاب کنید')
      } else {
        showToastFn('⚠️ روی یک لوله آب آتش‌نشانی کلیک کنید')
      }
      return
    }

    if (activeTool === 'select' || activeTool === 'move') {
      // A node click takes priority over the pipe underneath it
      for (const pipe of pipes) {
        for (const node of pipe.nodes || []) {
          const dist = Math.hypot(w.x - node.x, w.y - node.y)
          if (dist <= Math.max(9, 11 / Math.max(zoom, 0.5))) {
            onSelectNode?.(node.id)
            onSelectElement(null)
            onSelectPipe(null)
            return
          }
        }
      }
      let foundEl: DesignElement | null = null
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i]
        if (w.x >= el.x && w.x <= el.x + el.width && w.y >= el.y && w.y <= el.y + el.height) {
          foundEl = el
          break
        }
      }
      if (foundEl) {
        onSelectElement(foundEl.id)
        onSelectPipe(null)
        if (activeTool === 'move' || activeTool === 'select') {
          setDragging(true)
          setDragOffset({ x: w.x - foundEl.x, y: w.y - foundEl.y })
        }
      } else {
        let foundPipe: PipeSegment | null = null
        for (const pipe of pipes) {
          const threshold = (pipe.roadWidth || 10) / 2 + 5
          if (hitTestPipe(w.x, w.y, pipe, threshold)) {
            foundPipe = pipe
            break
          }
        }
        if (foundPipe) {
          onSelectPipe(foundPipe.id)
          onSelectElement(null)
          setDraggingPipe(true)
          setPipeDragOffset({ x: w.x, y: w.y })
        } else {
          onSelectElement(null)
          onSelectPipe(null)
        }
      }
      return
    }

    if (activeTool === 'edit') {
      let found: DesignElement | null = null
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i]
        if (w.x >= el.x && w.x <= el.x + el.width && w.y >= el.y && w.y <= el.y + el.height) {
          found = el
          break
        }
      }
      if (found) {
        onSelectElement(found.id)
        showToastFn(`✏️ «${found.label || found.type}» — پنل ویرایش باز شد`)
      } else {
        onSelectElement(null)
      }
      return
    }

    if (activeTool === 'resize') {
      let found: DesignElement | null = null
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i]
        if (w.x >= el.x && w.x <= el.x + el.width && w.y >= el.y && w.y <= el.y + el.height) {
          found = el
          break
        }
      }
      if (found) {
        onSelectElement(found.id)
        setDragging(true)
        setDragOffset({ x: w.x - (found.x + found.width), y: w.y - (found.y + found.height) })
        setResizeStart({ x: found.x, y: found.y, w: found.width, h: found.height })
      } else {
        onSelectElement(null)
      }
      return
    }

    if (activeTool === 'add') {
      const type = drawShapeType || 'building'
      const isLg = LARGE_TYPES.has(type)
      const elW = isLg ? 80 : 50
      const elH = isLg ? 60 : 50
      const newEl: DesignElement = {
        id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        x: w.x - elW / 2,
        y: w.y - elH / 2,
        width: elW,
        height: elH,
        rotation: 0,
        layer: getLayerForType(type),
        label: ELEMENT_LABELS[type] || type,
        color: ELEMENT_COLORS[type] || '#94a3b8',
      }
      onAddElement(newEl)
      onSelectElement(newEl.id)
      showToastFn(`✓ «${newEl.label}» اضافه شد`)
      return
    }
  }, [activeTool, c2w, pan, elements, pipes, drawing, drawPts, activeLayer, drawShapeType, drawPipeType, onSelectElement, onSelectPipe, onAddElement, onAddNode, onSelectNode, showToastFn, zoom])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const w = c2w(e.clientX - rect.left, e.clientY - rect.top)
    setMouseWorld(w)

    if (panning) {
      onPanChange({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
      return
    }
    if (draggingPipe && selectedPipe) {
      const dx = w.x - pipeDragOffset.x
      const dy = w.y - pipeDragOffset.y
      const pipe = pipes.find(p => p.id === selectedPipe)
      if (pipe) {
        const newPoints = pipe.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
        onUpdatePipe(selectedPipe, { points: newPoints })
      }
      setPipeDragOffset({ x: w.x, y: w.y })
      return
    }
    if (dragging && selectedElement) {
      if (activeTool === 'resize' && resizeStart) {
        const newW = Math.max(30, w.x - resizeStart.x)
        const newH = Math.max(30, w.y - resizeStart.y)
        onUpdateElement(selectedElement, { width: newW, height: newH })
      } else {
        onUpdateElement(selectedElement, { x: w.x - dragOffset.x, y: w.y - dragOffset.y })
      }
    }
  }, [panning, dragging, draggingPipe, selectedElement, selectedPipe, pipes, pipeDragOffset, dragStart, dragOffset, c2w, onPanChange, onUpdateElement, onUpdatePipe, activeTool, resizeStart])

  const handleMouseUp = useCallback(() => {
    setPanning(false)
    setDragging(false)
    setDraggingPipe(false)
    setResizeStart(null)
  }, [])

  const finishDrawing = useCallback(() => {
    if (drawing && drawPts.length >= 2) {
      const totalLen = drawPts.reduce((sum, p, i) => {
        if (i === 0) return 0
        const dx = p.x - drawPts[i - 1].x
        const dy = p.y - drawPts[i - 1].y
        return sum + Math.sqrt(dx * dx + dy * dy)
      }, 0)
      const pipeColors: Record<string, string> = {
        fire_water: '#dc2626', underground: '#16a34a',
        foam: '#eab308', co2: '#6b7280',
        road: '#78716c',
      }
      const sizeDef = PIPE_SIZES.find(s => s.label === pipeSize)
      const pw = sizeDef ? sizeDef.widthPx : roadWidth
      const pipeLayer = drawShapeType === 'road' ? 0 : 6
      const label = drawShapeType === 'road' ? 'جاده'
                    : (PIPE_TYPE_LABELS[drawPipeType] || drawPipeType)
      const isPipe = drawShapeType !== 'road'
      const pipe: PipeSegment = {
        id: `pipe-${Date.now()}`,
        points: drawPts,
        layer: pipeLayer,
        color: drawShapeType === 'road' ? '#78716c' : (pipeColors[drawPipeType] || '#dc2626'),
        length: Math.round(totalLen / PX_PER_METER * 10) / 10,
        roadWidth: drawShapeType === 'road' ? roadWidth : undefined,
        pipeWidth: isPipe ? pw : undefined,
        pipeSize: isPipe ? pipeSize : undefined,
        pipeType: isPipe ? drawPipeType : undefined,
        flowDirection: isPipe ? 'forward' : undefined,
        label,
        nodes: [],
      }
      onAddPipe(pipe)
      showToastFn(`✓ ${label} اضافه شد (${pipe.length}m — ${pipeSize || ''})`)
    }
    setDrawPts([])
    setDrawing(false)
  }, [drawing, drawPts, drawPipeType, drawShapeType, pipeSize, roadWidth, onAddPipe, showToastFn])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    // macOS reports Ctrl + left as a secondary click, and that is the pan
    // gesture — it must not cancel an in-progress drawing.
    if (e.ctrlKey || e.metaKey) return
    finishDrawing()
  }, [finishDrawing])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPipe) {
      e.preventDefault()
      onDeletePipe(selectedPipe)
      showToastFn('🗑️ لوله/جاده حذف شد')
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElement) {
      e.preventDefault()
      onDeleteElement(selectedElement)
      onSelectElement(null)
      showToastFn('🗑️ تجهیز حذف شد')
    }
    if (e.key === 'Escape' && drawing) {
      finishDrawing()
    }
  }, [selectedPipe, selectedElement, onDeletePipe, onDeleteElement, onUpdateElement, onSelectElement, showToastFn, drawing, finishDrawing])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    // Ctrl/Cmd turns the left button into a sheet-drag, so the cursor has to
    // say so before the drag even starts.
    const syncModifier = (e: KeyboardEvent) => setCtrlDown(e.ctrlKey || e.metaKey)
    const clearModifier = () => setCtrlDown(false)
    window.addEventListener('keydown', syncModifier)
    window.addEventListener('keyup', syncModifier)
    window.addEventListener('blur', clearModifier)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keydown', syncModifier)
      window.removeEventListener('keyup', syncModifier)
      window.removeEventListener('blur', clearModifier)
    }
  }, [handleKeyDown])

  const handleDoubleClick = useCallback(() => {
    finishDrawing()
  }, [finishDrawing])

  const cursor = panning ? 'cursor-grabbing' :
    activeTool === 'pan' ? 'cursor-grab' :
    ctrlDown && (activeTool === 'select' || activeTool === 'move') ? 'cursor-grab' :
    activeTool === 'add' ? 'cursor-copy' :
    activeTool === 'draw' ? 'cursor-crosshair' :
    activeTool === 'point' ? 'cursor-crosshair' :
    activeTool === 'move' ? 'cursor-move' :
    activeTool === 'select' ? 'cursor-default' : 'cursor-crosshair'

  const toolHints: Record<string, string> = {
    select: 'روی تجهیز کلیک کنید تا انتخاب شود — روی گره لوله کلیک کنید تا ویرایش شود',
    add: `روی نقشه کلیک کنید تا «${ELEMENT_LABELS[drawShapeType] || drawShapeType}» قرار گیرد`,
    move: 'روی تجهیز کلیک و درگ کنید تا جابجا شود',
    draw: LINE_DRAW_TYPES.has(drawShapeType) || drawShapeType === 'pipe'
      ? 'کلیک چپ: ادامه | راست/دابل‌کلیک: پایان | Shift+ولوم: تغییر عرض'
      : 'روی نقشه کلیک کنید',
    point: 'روی لوله آب آتش‌نشانی کلیک کنید تا گره (Point) ایجاد شود',
    pan: 'کلیک و درگ کنید تا نقشه حرکت کند',
  }

  return (
    <div id="design-canvas-container" ref={containerRef} className="absolute inset-0 bg-white">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 ${cursor}`}
        style={{ width: size.w, height: size.h }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
      />

      <div className="absolute bottom-3 left-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 text-xs text-gray-600 border border-gray-200 shadow-sm flex items-center gap-3 flex-wrap">
        <span className="whitespace-nowrap">{project?.widthMeters || 100}m × {project?.heightMeters || 100}m</span>
        <span className="text-gray-300">|</span>

        {/* Zoom Slider */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 whitespace-nowrap">🔍 زوم:</span>
          <input
            type="range"
            min={0}
            max={100}
            value={zoomToSlider(zoom)}
            onChange={(e) => applyZoom(sliderToZoom(parseInt(e.target.value)), { x: size.w / 2, y: size.h / 2 })}
            className="w-24 h-1 accent-sky-500 cursor-pointer"
          />
          <span className="text-[10px] font-bold text-sky-600 w-8 text-center">{Math.round(zoom * 100)}%</span>
        </div>

        <span className="text-gray-300">|</span>

        {/* Map Opacity Slider */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 whitespace-nowrap">🗺️ شفافیت نقشه:</span>
          <input
            type="range"
            min={0}
            max={100}
            value={mapOpacity}
            onChange={(e) => setMapOpacity(parseInt(e.target.value))}
            className="w-20 h-1 accent-amber-500 cursor-pointer"
          />
          <span className="text-[10px] font-bold text-amber-600 w-8 text-center">{mapOpacity}%</span>
        </div>

        <span className="text-gray-300">|</span>

        <span className="whitespace-nowrap">عناصر: {elements.filter(e => e.layer >= 0).length}</span>
        <span className="text-gray-300">|</span>
        <span className="whitespace-nowrap">لوله‌ها: {pipes.length}</span>
        <span className="text-gray-300">|</span>
        <span className="whitespace-nowrap">گره‌ها: {pipes.reduce((s, p) => s + (p.nodes?.length || 0), 0)}</span>
        <span className="text-gray-300">|</span>
        <span className="whitespace-nowrap text-[10px] text-gray-400">
          مبدأ (0,0): جنوب‌غربی
          {mouseWorld && (
            <span className="mr-2" dir="ltr">
              X: {Math.round(worldToProject(mouseWorld.x, mouseWorld.y, (project?.heightMeters || 100) * PX_PER_METER).x)}
              , Y: {Math.round(worldToProject(mouseWorld.x, mouseWorld.y, (project?.heightMeters || 100) * PX_PER_METER).y)}
            </span>
          )}
        </span>
      </div>

      {toolHints[activeTool] && (
        <div className={`absolute bottom-12 left-1/2 -translate-x-1/2 text-white rounded-2xl px-6 py-3 text-sm shadow-xl z-10 flex items-center gap-3 ${
          activeTool === 'add' ? 'bg-emerald-600/90' :
          activeTool === 'draw' ? 'bg-sky-600/90' :
          activeTool === 'move' ? 'bg-violet-600/90' :
          'bg-gray-600/80'
        }`}>
          <span className="animate-pulse w-2 h-2 bg-white rounded-full" />
          {toolHints[activeTool]}
          {drawing && drawPts.length > 0 && (
            <span className="text-white/70 mr-2">({drawPts.length} نقطه)</span>
          )}
        </div>
      )}

      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white rounded-2xl px-6 py-3 text-sm shadow-xl z-20 font-medium">
          {toast}
        </div>
      )}
    </div>
  )
}
