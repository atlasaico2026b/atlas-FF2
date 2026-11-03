// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// NODE FITTINGS → FIRE WATER DEMAND
//
// The bridge between what the designer recorded on each pipe node and the
// demand engine. It exists so the demand is aggregated by `calc/demand.ts`
// rather than by ad-hoc arithmetic in a component, and so every outlet carries
// where its flow figure came from.
//
// The distinction it draws: a flow the designer typed in is a **project value**
// awaiting review; a flow that is still the built-in starting estimate has no
// source at all and is reported as a legacy value.
// ═══════════════════════════════════════════════════════════════════

import { PIPE_POINT_ITEMS } from './pipePoints'
import { fittingFlow, specOutlets, resolveSpec } from './pipePointSpecs'
import type { PipePointSpec } from './pipePointSpecs'
import type { StatsPipe } from './fittingStats'
import type { OutletKind, OutletRequirement, DemandMode } from './calc/demand'
import type { DesignBasis, SourceType, VerificationStatus } from './calc/provenance'
import { basisNumber, K } from './calc/basis'

export interface NodeDemandOptions {
  /** Which fire scenario this set of outlets represents. */
  scenario: string
  /** Generic project allowance applied to the base demand (e.g. 0.2). */
  allowanceFraction?: number
  /** Override the simultaneity assumption for a given outlet. */
  modeFor?: (outlet: OutletRequirement) => { mode: DemandMode; exclusiveGroup?: string }
  /** Residual pressure the designer requires at each outlet, bar. */
  residualPressureFor?: (kind: OutletKind) => number | null
}

export interface NodeOutletSource {
  outlet: OutletRequirement
  /** The fitting id it came from, so the UI can link back to the editor. */
  fittingId: string
  /** Where on the drawing it sits. */
  location: string
  /** True when the flow is still the built-in starting estimate. */
  isBuiltInEstimate: boolean
  /** The recorded size in inches, for the schedule. */
  sizeInches: number | null
}

const kindOf = (id: string): OutletKind | null => {
  if (id.includes('monitor')) return 'monitor'
  if (id.includes('hydrant')) return 'hydrant'
  return null
}

/**
 * Flatten pipe nodes into discharge outlets.
 *
 * A node's outlet is a single requirement with a per-outlet flow and an outlet
 * count, which is what lets `fireWaterDemand` handle simultaneity properly — a
 * double hydrant is one requirement with two outlets, not an unexplained doubled
 * number.
 */
export function outletsFromNodes(pipes: StatsPipe[], basis: DesignBasis, opts: NodeDemandOptions): NodeOutletSource[] {
  const sources: NodeOutletSource[] = []

  // The residual each kind of outlet needs is a design-basis parameter, not a
  // number invented here — and it sits in the basis as a project assumption.
  const residualFromBasis = (kind: OutletKind): number | null =>
    basisNumber(basis, kind === 'monitor' ? K.pumpMonitorResidual : K.pumpHydrantResidual)

  pipes.forEach((pipe, pipeIndex) => {
    const pipeLabel = pipe.label || `لوله ${pipeIndex + 1}`
    ;(pipe.nodes || []).forEach((node, nodeIndex) => {
      const location = `${pipeLabel} — گره ${nodeIndex + 1}`

      for (const def of PIPE_POINT_ITEMS) {
        if (!node.items?.includes(def.id)) continue
        const kind = kindOf(def.id)
        if (!kind) continue

        const stored = node.specs?.[def.id] as PipePointSpec | undefined
        const outlets = Math.max(1, specOutlets(def.id))
        const total = fittingFlow(def.id, stored)
        if (!(total > 0)) continue

        // `fittingFlow` already multiplies by the outlet count, so the
        // per-outlet figure is the resolved flow on its own.
        const flowPerOutlet = total / outlets
        const isBuiltInEstimate = stored?.flow === undefined || stored?.flow === null
        const resolved = resolveSpec(def.id, stored)
        const sizeInches = typeof resolved.size === 'number' ? resolved.size : null

        const source: SourceType = isBuiltInEstimate ? 'legacy_value' : 'project_default'
        const status: VerificationStatus = isBuiltInEstimate ? 'unverified_legacy' : 'requires_engineering_review'
        const reference = isBuiltInEstimate
          ? `برآورد اولیه داخلی برنامه برای سایز ${sizeInches ?? '?'}\" (بدون منبع تأییدشده)`
          : `دبی واردشده توسط طراح روی ${location}`

        const outlet: OutletRequirement = {
          id: `${pipeIndex}:${nodeIndex}:${def.id}`,
          kind,
          location,
          flow: flowPerOutlet,
          unit: 'L/min',
          outletCount: outlets,
          source,
          reference,
          status,
          mode: 'simultaneous',
          residualPressureBar: opts.residualPressureFor?.(kind) ?? residualFromBasis(kind),
          elevationM: null,
        }

        const override = opts.modeFor?.(outlet)
        if (override) {
          outlet.mode = override.mode
          outlet.exclusiveGroup = override.exclusiveGroup
        }

        sources.push({ outlet, fittingId: def.id, location, isBuiltInEstimate, sizeInches })
      }
    })
  })

  return sources
}

/** The demand engine's inputs, ready to hand to `fireWaterDemand`. */
export function demandInputFromNodes(pipes: StatsPipe[], basis: DesignBasis, opts: NodeDemandOptions) {
  const sources = outletsFromNodes(pipes, basis, opts)
  return {
    sources,
    input: {
      outlets: sources.map(s => s.outlet),
      scenario: opts.scenario,
      allowanceFraction: opts.allowanceFraction,
    },
  }
}

/** How many outlets are still running on a built-in estimate. */
export function countBuiltInEstimates(sources: NodeOutletSource[]): number {
  return sources.filter(s => s.isBuiltInEstimate).length
}

/**
 * Fitting counts as distinct from outlet counts.
 *
 * A double hydrant is **one** fitting but **two** outlets. The old schedules
 * counted fittings while the demand engine counts outlets, so both numbers are
 * reported rather than one being silently substituted for the other.
 */
export function countDischargeFittings(sources: NodeOutletSource[]): { monitor: number; hydrant: number; total: number } {
  const monitor = sources.filter(s => s.outlet.kind === 'monitor').length
  const hydrant = sources.filter(s => s.outlet.kind === 'hydrant').length
  return { monitor, hydrant, total: monitor + hydrant }
}

/** Outlet counts (a double hydrant contributes two). */
export function countDischargeOutlets(sources: NodeOutletSource[]): { monitor: number; hydrant: number; total: number } {
  const sum = (kind: OutletKind) => sources.filter(s => s.outlet.kind === kind).reduce((n, s) => n + s.outlet.outletCount, 0)
  return { monitor: sum('monitor'), hydrant: sum('hydrant'), total: sum('monitor') + sum('hydrant') }
}

/** The default scenario label used when the designer has not stated one. */
export function defaultScenarioLabel(): string {
  return 'آتش‌سوزی طراحی — همه خروجی‌های ثبت‌شده روی نقشه به‌صورت هم‌زمان'
}
