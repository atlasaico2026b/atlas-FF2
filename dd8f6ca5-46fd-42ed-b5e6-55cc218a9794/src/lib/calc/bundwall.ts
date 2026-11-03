// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// BUNDWALL / SECONDARY CONTAINMENT
//
// The "110% of the largest tank, or 25% of the aggregate" rule that shipped in
// the previous engine is a **project/regulatory rule**, not a universal NFPA
// requirement, and its source was never recorded. It is preserved as the
// default so existing designs do not move, but it is labelled as unverified and
// the alternative formulations are implemented side by side so the governing
// basis can be chosen explicitly.
//
// Capacity is reported gross AND net usable, with every deduction itemised.
// ═══════════════════════════════════════════════════════════════════

import { cylinderVolumeM3, footprintAreaM2 } from './geometry'
import { basisNumber, K } from './basis'
import type { DesignBasis, ResultStatus, VerificationStatus } from './provenance'
import { assertNonNegative, assertPositive } from './units'

export type BundwallRuleId =
  | 'legacy_110_or_25'
  | 'largest_110'
  | 'largest_100_plus_10_others'

export interface BundwallRule {
  id: BundwallRuleId
  label: string
  expression: string
  /** This engine does not assert that any of these is a universal requirement. */
  normativeClaim: false
}

export const BUNDWALL_RULES: BundwallRule[] = [
  {
    id: 'legacy_110_or_25',
    label: 'موتور قبلی: بیشترین مقدار از (۱۱۰٪ بزرگ‌ترین مخزن) و (۲۵٪ مجموع مخازن)',
    expression: 'V_req = MAX(1.10 × V_largest , 0.25 × ΣV)',
    normativeClaim: false,
  },
  {
    id: 'largest_110',
    label: '۱۱۰٪ حجم بزرگ‌ترین مخزن',
    expression: 'V_req = 1.10 × V_largest',
    normativeClaim: false,
  },
  {
    id: 'largest_100_plus_10_others',
    label: '۱۰۰٪ بزرگ‌ترین مخزن + ۱۰٪ مجموع سایر مخازن',
    expression: 'V_req = 1.00 × V_largest + 0.10 × (ΣV − V_largest)',
    normativeClaim: false,
  },
]

export interface BundwallTank {
  id?: string
  name?: string
  diameterM: number
  heightM: number
}

export interface BundwallRequirement {
  requiredVolumeM3: number
  /** Every candidate formulation and the volume it would require. */
  candidates: { ruleId: BundwallRuleId; label: string; expression: string; valueM3: number }[]
  governing: BundwallRuleId
  governingExpression: string
  largestVolumeM3: number
  totalVolumeM3: number
  source: string
  status: ResultStatus
  verification: VerificationStatus
  note: string
}

/**
 * Required containment volume for a set of tanks under a chosen rule.
 *
 * `ruleId` defaults to the design basis entry, which defaults to the legacy
 * rule — so an existing project keeps the number it always had, while the report
 * states plainly that the rule has no verified regulatory source.
 */
export function requiredBundwallVolume(tanks: BundwallTank[], basis: DesignBasis, ruleId?: BundwallRuleId): BundwallRequirement {
  if (!tanks.length) {
    return {
      requiredVolumeM3: 0,
      candidates: [],
      governing: 'legacy_110_or_25',
      governingExpression: '—',
      largestVolumeM3: 0,
      totalVolumeM3: 0,
      source: '—',
      status: 'blocked',
      verification: 'requires_engineering_review',
      note: 'هیچ مخزنی برای محاسبه ظرفیت باندوال تعریف نشده است.',
    }
  }

  const entry = basis.entries[K.bundwallRule]
  const chosen = ruleId ?? ((entry?.value as BundwallRuleId | undefined) ?? 'legacy_110_or_25')

  const volumes = tanks.map(t => cylinderVolumeM3(t.diameterM, t.heightM))
  const largest = Math.max(...volumes)
  const total = volumes.reduce((a, b) => a + b, 0)

  const candidates = BUNDWALL_RULES.map(r => ({
    ruleId: r.id,
    label: r.label,
    expression: r.expression,
    valueM3: r.id === 'legacy_110_or_25'
      ? Math.max(largest * 1.1, total * 0.25)
      : r.id === 'largest_110'
        ? largest * 1.1
        : largest * 1.0 + (total - largest) * 0.1,
  }))

  const governing = candidates.find(c => c.ruleId === chosen) ?? candidates[0]

  return {
    requiredVolumeM3: governing.valueM3,
    candidates,
    governing: governing.ruleId,
    governingExpression: governing.expression,
    largestVolumeM3: largest,
    totalVolumeM3: total,
    source: entry?.reference ?? '—',
    status: 'calculated',
    verification: entry?.status ?? 'unverified_legacy',
    note: 'این قاعده یک قاعده پروژه/مقرراتی است. برای اعتبار آن باید آیین‌نامه محلی، مشخصات پروژه و نظر مرجع آتش‌نشانی (AHJ) مستند شود.',
  }
}

export interface BundwallDeduction {
  label: string
  volumeM3: number
  source: string
}

export interface BundwallCapacity {
  /** Geometric volume inside the bund: A × h. */
  grossVolumeM3: number
  deductions: BundwallDeduction[]
  totalDeductionsM3: number
  /** Volume actually available to contain a spill. */
  netUsableVolumeM3: number
  note: string
}

export interface BundwallCapacityInput {
  /** Internal floor area of the bund, excluding the wall thickness, m². */
  areaM2: number
  /** Wall height, m. */
  wallHeightM: number
  /** Tanks standing inside the bund — their footprint displaces liquid. */
  tanksWithin?: BundwallTank[]
  /** Freeboard held back, m. */
  freeboardM?: number
  /** Rainfall allowance held back, m. */
  rainfallAllowanceM?: number
  /** Volume displaced by foundations, supports and internal structures, m³. */
  displacementM3?: number
}

/**
 * Gross vs net usable containment volume.
 *
 * Net = (A − Σtank footprints) × (h − freeboard − rainfall allowance)
 *       − structural displacement
 *
 * Which deductions the governing basis actually requires is a design decision;
 * every one applied is itemised with its source so the arithmetic is auditable.
 */
export function bundwallCapacity(input: BundwallCapacityInput, basis: DesignBasis): BundwallCapacity {
  const areaM2 = assertPositive(input.areaM2, 'bund floor area')
  const wallHeightM = assertPositive(input.wallHeightM, 'bund wall height')
  const freeboard = assertNonNegative(input.freeboardM ?? basisNumber(basis, K.bundwallFreeboard) ?? 0, 'freeboard')
  const rainfall = assertNonNegative(input.rainfallAllowanceM ?? basisNumber(basis, K.bundwallRainfallAllowance) ?? 0, 'rainfall allowance')
  const displacement = assertNonNegative(input.displacementM3 ?? basisNumber(basis, K.bundwallDisplacement) ?? 0, 'displacement')

  const grossVolumeM3 = areaM2 * wallHeightM
  const deductions: BundwallDeduction[] = []

  const tanks = input.tanksWithin ?? []
  if (tanks.length) {
    const footprint = tanks.reduce((s, t) => s + footprintAreaM2(t.diameterM), 0)
    const effectiveHeight = Math.max(0, wallHeightM - freeboard - rainfall)
    deductions.push({
      label: `حجم اشغال‌شده توسط تصرف مخازن داخلی (${footprint.toFixed(2)} m² × ${effectiveHeight.toFixed(3)} m)`,
      volumeM3: footprint * effectiveHeight,
      source: 'هندسه — تصرف مخازن',
    })
  }
  if (freeboard > 0) {
    deductions.push({ label: `ارتفاع آزاد (${freeboard} m)`, volumeM3: areaM2 * freeboard, source: basis.entries[K.bundwallFreeboard]?.reference ?? '—' })
  }
  if (rainfall > 0) {
    deductions.push({ label: `ذخیره بارش (${rainfall} m)`, volumeM3: areaM2 * rainfall, source: basis.entries[K.bundwallRainfallAllowance]?.reference ?? '—' })
  }
  if (displacement > 0) {
    deductions.push({ label: 'جابه‌جایی سازه‌ای', volumeM3: displacement, source: basis.entries[K.bundwallDisplacement]?.reference ?? '—' })
  }

  const totalDeductionsM3 = deductions.reduce((s, d) => s + d.volumeM3, 0)
  const netUsableVolumeM3 = Math.max(0, grossVolumeM3 - totalDeductionsM3)

  return {
    grossVolumeM3,
    deductions,
    totalDeductionsM3,
    netUsableVolumeM3,
    note: 'حجم ناخالص هندسی و حجم مفید قابل استفاده هر دو گزارش می‌شوند. تعریف «ظرفیت» (ناخالص یا مفید) باید در مبنای طراحی تعیین و مستند شود.',
  }
}
