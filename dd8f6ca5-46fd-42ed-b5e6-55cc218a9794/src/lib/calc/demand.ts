// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// FIRE WATER DEMAND — MONITORS AND HYDRANTS
//
// The design demand is an aggregation with assumptions attached: which
// scenarios are assessed, which outlets operate simultaneously, which are
// mutually exclusive, and where each flow figure came from.
//
// Q_demand = Σ Q(simultaneous outlets) + Σ max(Q within each exclusive group)
// ═══════════════════════════════════════════════════════════════════

import { basisNumber, K } from './basis'
import type { DesignBasis, ResultStatus, SourceType, VerificationStatus } from './provenance'
import { convert, U, assertPositive } from './units'

export type OutletKind = 'monitor' | 'hydrant'
export type DemandMode = 'simultaneous' | 'exclusive'
export type FlowUnitId = 'L/min' | 'gpm'

export const OUTLET_LABELS: Record<OutletKind, string> = {
  monitor: 'مانیتور',
  hydrant: 'هایدرانت',
}

export interface OutletRequirement {
  id: string
  kind: OutletKind
  /** Pipe / node the outlet sits on, for the controlling-node check. */
  location: string
  /** Flow per single outlet, in the declared unit. */
  flow: number
  unit: FlowUnitId
  outletCount: number
  source: SourceType
  reference: string
  status: VerificationStatus
  mode: DemandMode
  /** Outlets sharing a group are alternatives to each other. */
  exclusiveGroup?: string
  /** Required residual pressure at the outlet, bar (for the controlling check). */
  residualPressureBar?: number | null
  elevationM?: number | null
}

export function outletToLpm(o: OutletRequirement): number {
  assertPositive(o.flow, `outlet ${o.id} flow`)
  const unit = o.unit === 'gpm' ? U.flow.gpm : U.flow.Lmin
  return convert(o.flow, unit, U.flow.Lmin)
}

export interface DemandBreakdownRow {
  id: string
  kind: OutletKind
  location: string
  outletCount: number
  flowPerOutletLpm: number
  subtotalLpm: number
  mode: DemandMode
  exclusiveGroup?: string
  source: SourceType
  reference: string
  status: VerificationStatus
}

export interface FireWaterDemand {
  /** Sum of the outlets that operate together. */
  simultaneousLpm: number
  /** One representative (the largest) from each mutually exclusive group. */
  exclusiveGroupMaxima: { group: string; outletId: string; flowLpm: number }[]
  exclusiveSubtotalLpm: number
  totalDemandLpm: number
  byKind: Record<OutletKind, { count: number; flowLpm: number }>
  rows: DemandBreakdownRow[]
  /** Outlets with the largest residual + elevation demand — network decides the rest. */
  controllingCandidates: DemandBreakdownRow[]
  equation: string
  substitution: string
  scenario: string
  status: ResultStatus
  notes: string[]
}

export interface DemandInput {
  outlets: OutletRequirement[]
  /** Which fire scenario this demand represents. */
  scenario: string
  /** Generic project allowance, e.g. the legacy 20% margin. */
  allowanceFraction?: number
}

/**
 * Aggregate the outlets into a design demand.
 *
 * Anything marked `exclusive` is not added to the total alongside its group
 * peers — only the largest member of each group counts, which is what stops a
 * design from claiming several alternative fire scenarios at once.
 */
export function fireWaterDemand(input: DemandInput, _basis: DesignBasis): FireWaterDemand {
  const rows: DemandBreakdownRow[] = input.outlets.map(o => {
    const per = outletToLpm(o)
    const count = Math.max(0, Math.floor(o.outletCount))
    return {
      id: o.id,
      kind: o.kind,
      location: o.location,
      outletCount: count,
      flowPerOutletLpm: per,
      subtotalLpm: per * count,
      mode: o.mode,
      exclusiveGroup: o.exclusiveGroup,
      source: o.source,
      reference: o.reference,
      status: o.status,
    }
  })

  const simultaneousRows = rows.filter(r => r.mode === 'simultaneous')
  const simultaneousLpm = simultaneousRows.reduce((s, r) => s + r.subtotalLpm, 0)

  const groups = new Map<string, DemandBreakdownRow[]>()
  for (const r of rows.filter(r => r.mode === 'exclusive')) {
    const g = r.exclusiveGroup || r.id
    groups.set(g, [...(groups.get(g) || []), r])
  }
  const exclusiveGroupMaxima = [...groups.entries()].map(([group, members]) => {
    const top = members.reduce((a, b) => (b.subtotalLpm > a.subtotalLpm ? b : a))
    return { group, outletId: top.id, flowLpm: top.subtotalLpm }
  })
  const exclusiveSubtotalLpm = exclusiveGroupMaxima.reduce((s, g) => s + g.flowLpm, 0)

  const baseTotal = simultaneousLpm + exclusiveSubtotalLpm
  const allowance = Math.max(0, input.allowanceFraction ?? 0)
  const totalDemandLpm = baseTotal * (1 + allowance)

  const byKind = (['monitor', 'hydrant'] as OutletKind[]).reduce((acc, kind) => {
    const kindRows = rows.filter(r => r.kind === kind)
    acc[kind] = { count: kindRows.reduce((s, r) => s + r.outletCount, 0), flowLpm: kindRows.reduce((s, r) => s + r.subtotalLpm, 0) }
    return acc
  }, {} as Record<OutletKind, { count: number; flowLpm: number }>)

  const controllingCandidates = [...rows].sort((a, b) => b.subtotalLpm - a.subtotalLpm).slice(0, 2)

  const notes: string[] = [
    'دبی هر خروجی از مشخصات ثبت‌شده روی گره خوانده می‌شود؛ مقدار پیش‌فرض سراسری برای هایدرانت به‌عنوان الزام استاندارد تلقی نمی‌شود.',
    'نقطه کنترل نهایی باید از نتایج هیدرولیک شبکه تعیین شود؛ این فهرست فقط کاندیدها را نشان می‌دهد.',
  ]
  if (rows.some(r => r.mode === 'exclusive')) {
    notes.push('خروجی‌های هم‌زمان‌نشدنی: از هر گروه فقط بزرگ‌ترین مقدار در جمع اعمال شده است.')
  }
  if (allowance > 0) {
    notes.push(`ضریب ذخیره ${(allowance * 100).toFixed(0)}٪ روی دبی پایه اعمال شد (فرض پروژه، نه الزام استاندارد).`)
  }
  if (rows.some(r => r.status === 'unverified_legacy' || r.status === 'requires_engineering_review')) {
    notes.push('برخی دبی‌ها منبع تأییدشده ندارند و در گزارش به‌عنوان «نیازمند بازبینی» علامت خورده‌اند.')
  }

  // The written arithmetic. When nothing is mutually exclusive the per-kind
  // terms are shown directly (which is how a designer reads it on paper); when
  // there are exclusive groups the group maxima are shown instead, so the
  // substitution always explains the number rather than just restating it.
  const parts: string[] = []
  if (rows.some(r => r.mode === 'exclusive')) {
    parts.push(`${simultaneousLpm.toFixed(0)} + ${exclusiveSubtotalLpm.toFixed(0)} = ${baseTotal.toFixed(0)} L/min`)
    if (exclusiveGroupMaxima.length) {
      parts.push(exclusiveGroupMaxima.map(g => `max(${g.group}) = ${g.flowLpm.toFixed(0)}`).join(' ، '))
    }
  } else {
    parts.push(`${byKind.monitor.flowLpm.toFixed(0)} + ${byKind.hydrant.flowLpm.toFixed(0)} = ${baseTotal.toFixed(0)} L/min`)
  }
  if (allowance > 0) parts.push(`× (1 + ${allowance}) = ${totalDemandLpm.toFixed(0)} L/min`)

  return {
    simultaneousLpm,
    exclusiveGroupMaxima,
    exclusiveSubtotalLpm,
    totalDemandLpm,
    byKind,
    rows,
    controllingCandidates,
    equation: 'Q_demand = Σ Q(simultaneous) + Σ max(Q | exclusive group), × (1 + allowance)',
    substitution: parts.join('  ·  '),
    scenario: input.scenario,
    status: rows.length ? 'calculated' : 'blocked',
    notes,
  }
}

/**
 * The hydrant outlet figure the previous engine carried.
 *
 * It is a project reference default only. NFPA 24 addresses private fire service
 * mains and appurtenances; presenting this number as a universal NFPA 24 outlet
 * flow requirement is not supported by anything in this repository.
 */
export function hydrantOutletReference(basis: DesignBasis): { flowLpm: number | null; reference: string; status: VerificationStatus; caution: string } {
  const entry = basis.entries[K.hydrantOutletFlow]
  return {
    flowLpm: basisNumber(basis, K.hydrantOutletFlow),
    reference: entry?.reference ?? '—',
    status: entry?.status ?? 'unverified_legacy',
    caution: 'این عدد الزام سراسری NFPA 24 نیست. معیار دبی خروجی هایدرانت باید با استاندارد مصوب، نظر مرجع آتش‌نشانی، معیار پروژه و شرایط هیدرولیک تأیید شود.',
  }
}

export function monitorFlowToLpm(flow: number, unit: FlowUnitId): number {
  return convert(flow, unit === 'gpm' ? U.flow.gpm : U.flow.Lmin, U.flow.Lmin)
}

/** Express a canonical L/min flow in the declared unit. */
export function lpmAs(flowLpm: number, unit: FlowUnitId): number {
  return convert(flowLpm, U.flow.Lmin, unit === 'gpm' ? U.flow.gpm : U.flow.Lmin)
}
