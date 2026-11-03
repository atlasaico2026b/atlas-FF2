// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// PIPE POINTS — nodes placed on a drawn fire-water pipe.
// A node carries a combination of fittings; the map symbol is the
// union of everything ticked on the node.
// ═══════════════════════════════════════════════════════════════════

import type { PipeNode } from './pipeNodeTypes'

export interface PipePointItemDef {
  id: string
  label: string
  /** Short tag rendered next to the node on the map */
  short: string
  color: string
}

export const PIPE_POINT_ITEMS: PipePointItemDef[] = [
  { id: 'water_monitor',       label: 'مانیتور آب',            short: 'WM',  color: '#dc2626' },
  { id: 'foam_monitor',        label: 'مانیتور فوم',           short: 'FM',  color: '#eab308' },
  { id: 'water_foam_monitor',  label: 'مانیتور آب و فوم',      short: 'WFM', color: '#f97316' },
  { id: 'inline_inductor',     label: 'اینلاین ایندکتور',      short: 'IND', color: '#8b5cf6' },
  { id: 'hydrant_single',      label: 'هایدرانت تک',           short: 'H1',  color: '#ef4444' },
  { id: 'hydrant_double',      label: 'هایدرانت دوبل',         short: 'H2',  color: '#b91c1c' },
  { id: 'butterfly_valve',     label: 'ولو پروانه‌ای',          short: 'BV',  color: '#0ea5e9' },
  { id: 'inline_valve',        label: 'ولو بین مسیر',          short: 'IV',  color: '#0891b2' },
  { id: 'blind_flange',        label: 'بندفلنج',               short: 'BF',  color: '#78716c' },
]

export function getPipePointItem(id: string): PipePointItemDef | undefined {
  return PIPE_POINT_ITEMS.find(i => i.id === id)
}

export function createPipeNode(
  pipeId: string,
  x: number,
  y: number,
  segIndex: number,
): PipeNode {
  return {
    id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    pipeId,
    x,
    y,
    segIndex,
    items: [],
  }
}

// ─── retired fittings ────────────────────────────────────────────────
// These three were dropped from the product. Saved designs may still carry
// them, so they are stripped on load *and* on save, and the symbol library
// paints nothing for them either way.
export const RETIRED_PIPE_POINT_IDS = ['check_valve', 'flowmeter', 'pressure_gauge']

/** Groups where at most ONE member may be fitted to a node. */
export const PIPE_POINT_GROUPS: string[][] = [
  ['water_monitor', 'foam_monitor', 'water_foam_monitor'],
  ['hydrant_single', 'hydrant_double'],
  ['butterfly_valve', 'inline_valve'],
]

function groupOf(id: string): string[] | undefined {
  return PIPE_POINT_GROUPS.find(g => g.includes(id))
}

/**
 * Can `id` be fitted to a node that already carries `current`?
 * Ticking a group member is always allowed — it replaces its group mate.
 * The blind flange is the one true exclusion: it is a blanking plate, so it
 * fits only a bare node, and nothing else may be added while it is on.
 */
export function canFitPointItem(current: string[], id: string): { ok: boolean; reason?: string } {
  if (current.includes(id)) return { ok: true }
  const others = current.filter(x => x !== id && !RETIRED_PIPE_POINT_IDS.includes(x))
  if (id === 'blind_flange' && others.length > 0) {
    return { ok: false, reason: 'بندفلنج فقط روی گره بدون تجهیز نصب می‌شود' }
  }
  if (others.includes('blind_flange')) {
    return { ok: false, reason: 'ابتدا بندفلنج را بردارید' }
  }
  return { ok: true }
}

/**
 * Tick or untick `id`. Ticking a member of an exclusive group swaps out its
 * group mates, so the catalog can never end up with two monitors (etc.).
 */
export function togglePointItem(current: string[], id: string): string[] {
  const clean = current.filter(x => !RETIRED_PIPE_POINT_IDS.includes(x))
  if (clean.includes(id)) return clean.filter(x => x !== id)
  if (!canFitPointItem(clean, id).ok) return clean
  const g = groupOf(id)
  return g ? [...clean.filter(x => !g.includes(x)), id] : [...clean, id]
}

/** Repair a saved node: drop retired fittings and resolve exclusivity clashes. */
export function sanitizePointItems(ids: string[]): string[] {
  let out: string[] = []
  for (const id of ids) {
    if (RETIRED_PIPE_POINT_IDS.includes(id)) continue
    if (!getPipePointItem(id)) continue
    out = togglePointItem(out, id)
  }
  return out
}
