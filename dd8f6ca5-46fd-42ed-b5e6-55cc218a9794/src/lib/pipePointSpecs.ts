// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// PIPE POINT SPECS — what a fitted item actually *is*.
//
// Ticking a monitor on a node says a monitor is there; it does not say how
// big it is or how much water it throws. Those are the numbers the output
// schedules and the pump demand need, so each fitting carries its own spec
// and the editor records them per node.
//
// Specs are stored beside the fitting list (`PipeNode.specs`, keyed by
// fitting id) rather than inside it, so a design saved before specs existed
// still loads: a missing spec simply resolves to the defaults below.
// ═══════════════════════════════════════════════════════════════════

export type SpecValue = number | string
export type PipePointSpec = Record<string, SpecValue>

export interface SpecField {
  key: string
  label: string
  /** Shown after the input, e.g. `اینچ`. */
  unit?: string
  /** Present → the field is a picker over these nominal sizes. */
  sizes?: number[]
  /** Range for a free numeric field. */
  min?: number
  max?: number
  step?: number
  /** Value used until the user sets one. */
  default: number
  /**
   * Flow field only: the outlet's flow for each nominal size. Changing the
   * size re-fills the flow from here, and the user can then override it.
   */
  bySize?: Record<number, number>
}

export interface PipePointSpecDef {
  /** What the fitting does in the network — drives the statistics. */
  role: 'discharge' | 'valve' | 'inductor'
  /** Outlets that discharge at once (a double hydrant has two). */
  outlets: number
  fields: SpecField[]
}

// Nominal sizes, in inches.
const MONITOR_SIZES = [1.5, 2, 2.5, 3]
const HYDRANT_SIZES = [2.5, 4, 5]
const VALVE_SIZES = [2, 3, 4, 6, 8, 10]

/**
 * Outlet flows, in L/min. These are starting estimates for the designer to
 * adjust — the 2.5" hydrant figure is the 250 gpm NFPA 24 reference, and the
 * monitors scale with outlet area from there. Nothing in the reports treats
 * them as anything other than the entered design value.
 */
const MONITOR_FLOW: Record<number, number> = { 1.5: 500, 2: 1000, 2.5: 1900, 3: 2850 }
const HYDRANT_FLOW: Record<number, number> = { 2.5: 950, 4: 2400, 5: 3800 }

const outletSize = (sizes: number[], fallback: number, label = 'قطر خروجی'): SpecField =>
  ({ key: 'size', label, unit: 'اینچ', sizes, default: fallback })

const outletFlow = (table: Record<number, number>, fallback: number, label: string): SpecField =>
  ({ key: 'flow', label, unit: 'L/min', min: 50, max: 20000, step: 50, default: fallback, bySize: table })

const sizeOnly = (label: string): SpecField[] => [outletSize(VALVE_SIZES, 4, label)]

export const PIPE_POINT_SPEC_DEFS: Record<string, PipePointSpecDef> = {
  water_monitor: {
    role: 'discharge', outlets: 1,
    fields: [outletSize(MONITOR_SIZES, 2.5), outletFlow(MONITOR_FLOW, 1900, 'دبی خروجی')],
  },
  foam_monitor: {
    role: 'discharge', outlets: 1,
    fields: [outletSize(MONITOR_SIZES, 2.5), outletFlow(MONITOR_FLOW, 1900, 'دبی خروجی')],
  },
  water_foam_monitor: {
    role: 'discharge', outlets: 1,
    fields: [outletSize(MONITOR_SIZES, 2.5), outletFlow(MONITOR_FLOW, 1900, 'دبی خروجی')],
  },
  hydrant_single: {
    role: 'discharge', outlets: 1,
    fields: [outletSize(HYDRANT_SIZES, 2.5), outletFlow(HYDRANT_FLOW, 950, 'دبی خروجی')],
  },
  hydrant_double: {
    role: 'discharge', outlets: 2,
    fields: [outletSize(HYDRANT_SIZES, 2.5), outletFlow(HYDRANT_FLOW, 950, 'دبی هر خروجی')],
  },
  inline_inductor: { role: 'inductor', outlets: 0, fields: sizeOnly('قطر') },
  butterfly_valve: { role: 'valve', outlets: 0, fields: sizeOnly('قطر') },
  inline_valve: { role: 'valve', outlets: 0, fields: sizeOnly('قطر') },
  blind_flange: { role: 'valve', outlets: 0, fields: sizeOnly('قطر') },
}

export function specFields(id: string): SpecField[] {
  return PIPE_POINT_SPEC_DEFS[id]?.fields ?? []
}

export function specRole(id: string): PipePointSpecDef['role'] | undefined {
  return PIPE_POINT_SPEC_DEFS[id]?.role
}

/** How many outlets discharge at once — 2 for a double hydrant, else 0 or 1. */
export function specOutlets(id: string): number {
  return PIPE_POINT_SPEC_DEFS[id]?.outlets ?? 0
}

/** A fitting that throws water (monitors and hydrants). */
export function isDischargeFitting(id: string): boolean {
  return specRole(id) === 'discharge'
}

/** Outlet flow a size implies, so the flow can follow the size. */
export function defaultFlowFor(id: string, sizeInches: number): number | undefined {
  return specFields(id).find(f => f.bySize)?.bySize?.[sizeInches]
}

export function defaultSpec(id: string): PipePointSpec {
  const spec: PipePointSpec = {}
  for (const f of specFields(id)) spec[f.key] = f.default
  return spec
}

const clampNumber = (f: SpecField, v: number) => {
  const lo = f.min ?? -Infinity
  const hi = f.max ?? Infinity
  return Math.min(Math.max(v, lo), hi)
}

/**
 * The stored spec resolved against the field definitions: unknown keys are
 * dropped, missing keys fall back to defaults, numbers are clamped, and a
 * size that is not a listed nominal falls back to the default one.
 */
export function resolveSpec(id: string, stored?: PipePointSpec | null): PipePointSpec {
  const out: PipePointSpec = {}
  for (const f of specFields(id)) {
    const raw = stored?.[f.key]
    if (f.sizes) {
      const n = typeof raw === 'number' ? raw : Number(raw)
      out[f.key] = f.sizes.includes(n) ? n : f.default
    } else {
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''))
      out[f.key] = Number.isFinite(n) ? clampNumber(f, n) : f.default
    }
  }
  return out
}

/**
 * Water this fitting puts out, in L/min — outlet flow times the outlets that
 * discharge together. Valves and the inductor contribute nothing.
 */
export function fittingFlow(id: string, stored?: PipePointSpec | null): number {
  const def = PIPE_POINT_SPEC_DEFS[id]
  if (!def || def.role !== 'discharge') return 0
  const spec = resolveSpec(id, stored)
  const flow = Number(spec.flow) || 0
  return flow * Math.max(1, def.outlets)
}

/** `Ø2.5" • 1900 L/min` — one line for a schedule or a report. */
export function specSummary(id: string, stored?: PipePointSpec | null): string {
  const parts: string[] = []
  for (const f of specFields(id)) {
    const v = resolveSpec(id, stored)[f.key]
    if (f.sizes) parts.push(`Ø${v}"`)
    else parts.push(`${v} ${f.unit ?? ''}`.trim())
  }
  if (specOutlets(id) > 1) parts.push(`${specOutlets(id)} خروجی`)
  return parts.join(' • ')
}

/**
 * Repair a saved node: specs for fittings that are no longer ticked are
 * dropped, and the rest are normalised so the calculation never sees a stray
 * value. Returns undefined when nothing is left, so a node with no specs is
 * stored exactly as it used to be.
 */
export function sanitizeNodeSpecs(
  items: string[],
  specs?: Record<string, PipePointSpec> | null,
): Record<string, PipePointSpec> | undefined {
  const out: Record<string, PipePointSpec> = {}
  for (const id of items) {
    if (!PIPE_POINT_SPEC_DEFS[id]) continue
    const stored = specs?.[id]
    out[id] = stored ? resolveSpec(id, stored) : defaultSpec(id)
  }
  return Object.keys(out).length ? out : undefined
}
