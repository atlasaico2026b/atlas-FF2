// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// NFPA 11 — FOAM SYSTEMS
//
// Foam solution and foam concentrate are kept apart everywhere: the solution
// volume is Q × t and the concentrate volume is the solution volume scaled by
// the proportioning fraction. The previous engine derived the solution *from*
// the concentrate, which loses precision and obscures the distinction.
//
// Table look-ups are explicit data with declared inputs, band edges and an
// edition. A tank diameter outside the published bands returns
// `extrapolated: true` instead of a number that looks like a table entry.
// ═══════════════════════════════════════════════════════════════════

import { planAreaM2 } from './geometry'
import { basisNumber, basisString, K } from './basis'
import { NFPA11 } from './constants'
import type { DesignBasis, ResultStatus, VerificationStatus } from './provenance'
import { assertPositive } from './units'
import {
  BELOW_SEAL,
  FIXED_ROOF_OUTLETS,
  HOSE_STREAMS,
  TOP_OF_SEAL,
  parseNum,
} from '../spec/registry'
import { FIXED_ROOF_OPEN_BAND_FROM_M, fixedRoofOutletCount } from '../spec/engine'

// ─── Fuels ─────────────────────────────────────────────────────────
export type FoamFuelGroup = 'A' | 'B'

export const FOAM_GROUP_LABELS: Record<FoamFuelGroup, string> = {
  A: 'گروه A — نقطه اشتعال ۳۸ تا ۹۳ درجه سلسیوس',
  B: 'گروه B — نقطه اشتعال زیر ۳۸ درجه سلسیوس یا محصول گرم‌شده',
}

/** Flashpoint bracket recorded on the fuel, per NFPA 30 classification. */
export type FlashpointCategory = 'below_38' | '38_to_93' | 'above_93'

export function foamFuelGroup(category: FlashpointCategory): FoamFuelGroup {
  return category === '38_to_93' ? 'A' : 'B'
}

// ─── Application rate and duration ─────────────────────────────────
export type FoamProtectionType = 'foam_chamber' | 'monitor_hose'

export interface FoamRateResolution {
  group: FoamFuelGroup
  protectionType: FoamProtectionType
  rateLpmM2: number
  durationMin: number
  rateKey: string
  durationKey: string
  rateReference: string
  durationReference: string
  status: VerificationStatus
  note: string
}

const PROTECTION_LABELS: Record<FoamProtectionType, string> = {
  foam_chamber: 'چمبر فوم (حفاظت اولیه)',
  monitor_hose: 'مانیتور/شیلنگ دستی (حفاظت اولیه)',
}

/**
 * Rate and duration for the selected fuel group and protection method.
 *
 * Both values come from the design basis and are labelled `unverified_legacy`:
 * the previous engine held them as literals with no edition or table reference,
 * so this is not a verified standard requirement.
 */
export function resolveFoamRate(fuelCategory: FlashpointCategory, protectionType: FoamProtectionType, basis: DesignBasis): FoamRateResolution {
  const group = foamFuelGroup(fuelCategory)
  const rateKey = protectionType === 'foam_chamber' ? K.foamChamberRate : K.foamMonitorHoseRate
  const durationKey = protectionType === 'foam_chamber'
    ? (group === 'A' ? K.foamChamberDurationGroupA : K.foamChamberDurationGroupB)
    : (group === 'A' ? K.foamMonitorDurationGroupA : K.foamMonitorDurationGroupB)

  const rate = basisNumber(basis, rateKey)
  const duration = basisNumber(basis, durationKey)
  assertPositive(rate ?? NaN, `design basis entry ${rateKey}`)
  assertPositive(duration ?? NaN, `design basis entry ${durationKey}`)

  const rateEntry = basis.entries[rateKey]
  const durationEntry = basis.entries[durationKey]

  return {
    group,
    protectionType,
    rateLpmM2: rate as number,
    durationMin: duration as number,
    rateKey,
    durationKey,
    rateReference: rateEntry?.reference ?? '—',
    durationReference: durationEntry?.reference ?? '—',
    status: rateEntry?.status ?? 'unverified_legacy',
    note: `${PROTECTION_LABELS[protectionType]} — ${FOAM_GROUP_LABELS[group]}`,
  }
}

// ─── Volumes ───────────────────────────────────────────────────────
export interface FoamVolumes {
  areaM2: number
  rateLpmM2: number
  durationMin: number
  /** Foam solution discharge rate, L/min. */
  solutionFlowLpm: number
  /** Total foam solution, L. */
  solutionVolumeL: number
  concentrateFraction: number
  /** Foam concentrate, L. */
  concentrateVolumeL: number
  waterVolumeL: number
  equations: string[]
  substitution: string[]
}

/**
 * Q_foam = A × R ;  V_solution = Q_foam × t ;  V_concentrate = V_solution × C
 */
export function foamVolumes(
  areaM2: number,
  rateLpmM2: number,
  durationMin: number,
  concentratePercent: number,
): FoamVolumes {
  const A = assertPositive(areaM2, 'protected area')
  const R = assertPositive(rateLpmM2, 'application rate')
  const t = assertPositive(durationMin, 'discharge duration')
  if (!(concentratePercent > 0 && concentratePercent < 100)) {
    throw new RangeError(`concentrate proportion must be between 0 and 100 % (got ${concentratePercent})`)
  }
  const C = concentratePercent / 100

  const solutionFlowLpm = A * R
  const solutionVolumeL = solutionFlowLpm * t
  const concentrateVolumeL = solutionVolumeL * C
  const waterVolumeL = solutionVolumeL - concentrateVolumeL

  return {
    areaM2: A,
    rateLpmM2: R,
    durationMin: t,
    solutionFlowLpm,
    solutionVolumeL,
    concentrateFraction: C,
    concentrateVolumeL,
    waterVolumeL,
    equations: [
      'Q_foam = A × R',
      'V_solution = Q_foam × t',
      'V_concentrate = V_solution × C',
    ],
    substitution: [
      `${A.toFixed(2)} m² × ${R} L/min/m² = ${solutionFlowLpm.toFixed(1)} L/min`,
      `${solutionFlowLpm.toFixed(1)} L/min × ${t} min = ${solutionVolumeL.toFixed(0)} L محلول فوم`,
      `${solutionVolumeL.toFixed(0)} L × ${C} = ${concentrateVolumeL.toFixed(0)} L کنسانتره (آب: ${waterVolumeL.toFixed(0)} L)`,
    ],
  }
}

// ─── Table look-ups ────────────────────────────────────────────────
export interface TableLookup<T> {
  found: boolean
  row: T | null
  /** Value outside the published bands — a decision, not a table entry. */
  extrapolated: boolean
  edition: string | null
  status: VerificationStatus
  inputs: Record<string, number | string>
  rule: string
  note: string
}

interface Band<T> {
  /** Inclusive upper bound of the band, or null for the open-ended top band. */
  maxDiameterM: number | null
  value: T
  rule: string
}

/**
 * §3.1 of the engine specification — the minimum number of foam chambers, i.e. the fixed
 * outlets of the engine specification. Bands and counts are read from that
 * table; they are not re-typed here.
 *
 * The previous engine carried its own bands (24/36/42/48/54/60), which differ
 * from the specification's (24/37/43/49/55/61): for a 36.5 m tank they gave 3
 * and 2 respectively. The specification governs.
 */
export const TABLE_E3_CHAMBERS: Band<number>[] = [
  ...FIXED_ROOF_OUTLETS.filter((r) => r.band.maxInclusive !== undefined).map((r) => ({
    maxDiameterM: r.band.maxInclusive as number,
    value: r.count,
    rule: `§3.1 «${r.bandText}» → ${r.count}`,
  })),
  (() => {
    const open = FIXED_ROOF_OUTLETS.find((r) => r.band.open)
    return {
      maxDiameterM: null,
      value: open?.count ?? 6,
      rule: `§3.1 «${open?.bandText ?? '>61 m'}» → ${open?.count ?? 6} + ۱ به‌ازای هر ${open?.perAreaSqm ?? 465} m²`,
    }
  })(),
]

/** Area increment beyond the top §3.1 band, m². Stated by the specification. */
export const TABLE_E3_BEYOND_AREA_STEP_M2: number =
  FIXED_ROOF_OUTLETS.find((r) => r.band.open)?.perAreaSqm ?? 465

/** Last bounded §3.1 diameter, the datum for the "additional area" rule. */
const E3_TOP_BOUND_M: number = (() => {
  const bounded = FIXED_ROOF_OUTLETS.filter((r) => r.band.maxInclusive !== undefined)
  return bounded.length ? (bounded[bounded.length - 1].band.maxInclusive as number) : 61
})()

export function foamChamberLookup(diameterM: number, basis: DesignBasis): TableLookup<number> & { count: number } {
  const d = assertPositive(diameterM, 'tank diameter')
  const edition = basisString(basis, K.foamTableEdition)

  // One implementation of the §3.1 rule, in the specification engine. This
  // facade used to carry its own copy and the two drifted: for a 62 m tank this
  // one said 7 and the engine said 13.
  const r = fixedRoofOutletCount(d, planAreaM2(d))
  const count = r.count ?? 1
  const open = d > FIXED_ROOF_OPEN_BAND_FROM_M

  return {
    found: r.count !== null,
    row: count,
    count,
    extrapolated: open,
    edition,
    status: 'requires_engineering_review',
    inputs: { diameterM: d, edition: edition ?? 'ثبت‌نشده', reference: '§3.1 (T3.1)' },
    rule: r.note,
    note: open
      ? `برون‌یابی: قطر بزرگ‌تر از ${FIXED_ROOF_OPEN_BAND_FROM_M} m است؛ قاعده §3.1 برای مساحت مازاد اعمال شد.`
      : 'از جدول §3.1 سند مشخصات خوانده شد؛ نسخه NFPA 11 باید تأیید شود.',
  }
}

/**
 * §3.9 supplementary hand hose streams. Bands, counts and durations come from
 * the specification table.
 *
 * The previous engine's bands were 11/20/29/37 with durations 10/20/20/30; the
 * specification's are 20/36 with durations 10/20/30. For a 30 m tank the two
 * gave 30 and 20 minutes respectively.
 */
export const TABLE_E5_HAND_HOSE: Band<{ count: number; durationMin: number }>[] = HOSE_STREAMS.map((h) => ({
  maxDiameterM: h.band.maxInclusive === undefined ? null : h.band.maxInclusive,
  value: { count: h.streams, durationMin: parseNum(h.operatingTime) ?? 10 },
  rule: `§3.9 «${h.bandText}» → ${h.streams} × ${h.flowLpm} L/min / ${h.operatingTime}`,
}))

export function handHoseLookup(diameterM: number, basis: DesignBasis): TableLookup<{ count: number; durationMin: number }> {
  const d = assertPositive(diameterM, 'tank diameter')
  const edition = basisString(basis, K.foamTableEdition)
  const band = TABLE_E5_HAND_HOSE.find(b => b.maxDiameterM !== null && d <= b.maxDiameterM) ?? TABLE_E5_HAND_HOSE[TABLE_E5_HAND_HOSE.length - 1]
  const maxBounded = Math.max(...TABLE_E5_HAND_HOSE.filter(b => b.maxDiameterM !== null).map(b => b.maxDiameterM as number))
  const extrapolated = band.maxDiameterM === null && d > maxBounded
  return {
    found: true,
    row: band.value,
    extrapolated,
    edition,
    status: 'requires_engineering_review',
    inputs: { diameterM: d, edition: edition ?? 'ثبت‌نشده', reference: '§3.9 (T3.9)' },
    rule: band.rule,
    note: extrapolated
      ? 'قطر بزرگ‌تر از بزرگ‌ترین بازه جدول §3.9 است؛ مقدار از بالاترین ردیف به‌عنوان سقف استفاده شده و نیازمند تأیید است.'
      : 'از جدول §3.9 سند مشخصات خوانده شد.',
  }
}

/** Discharge rate per hand hose line, L/min. §3.9 governs; the basis may override. */
export function handHoseFlowPerLine(basis: DesignBasis): number {
  const v = basisNumber(basis, K.foamHandHoseFlow)
  if (v !== null && Number.isFinite(v) && v > 0) return v
  return NFPA11.handHoseFlowLpm
}

// ─── Foam dam ──────────────────────────────────────────────────────
export interface FoamDamResult {
  heightMm: number
  heightCm: number
  baseMm: number
  rule: string
  status: ResultStatus
  reference: string
  note: string
}

/**
 * Foam dam height — DAM-001 of the specification:
 *
 *     H_dam = MAX(H_min, H_secondary_seal + 50 mm, H_burnout_panel + 50 mm)
 *
 * `H_min` is 300 mm from §3.6. The elevation terms are only available when the
 * project has stated the seal and burn-out panel elevations; without them the
 * dam sits at the §3.6 minimum, which is what that clause requires rather than
 * a remembered stepped rule.
 *
 * The retired 300/450/600 mm steps by diameter are gone: they were a project
 * default with no source, and the specification gives an explicit formula.
 */
export function foamDamHeight(diameterM: number, basis: DesignBasis): FoamDamResult {
  const d = assertPositive(diameterM, 'tank diameter')
  const base = basisNumber(basis, K.foamDamHeight) ?? NFPA11.damHeightMm
  const Hsecondary = basisNumber(basis, K.damSecondarySealHeight)
  const Hburnout = basisNumber(basis, K.damBurnoutPanelHeight)

  const overSecondary = Hsecondary !== null && Number.isFinite(Hsecondary) ? Hsecondary + 50 : null
  const overBurnout = Hburnout !== null && Number.isFinite(Hburnout) ? Hburnout + 50 : null

  const candidates = [base, overSecondary, overBurnout].filter(
    (v): v is number => v !== null && Number.isFinite(v),
  )
  const heightMm = Math.max(...candidates)

  const which =
    overSecondary !== null && heightMm === overSecondary
      ? `H_secondary + 50 = ${overSecondary} mm`
      : overBurnout !== null && heightMm === overBurnout
        ? `H_burnout + 50 = ${overBurnout} mm`
        : `حداقل §3.6 = ${base} mm`

  const complete = overSecondary !== null && overBurnout !== null
  return {
    heightMm,
    heightCm: heightMm / 10,
    baseMm: base,
    rule: `DAM-001: MAX(${base}, ${overSecondary ?? '—'}, ${overBurnout ?? '—'}) = ${heightMm} mm → ${which}`,
    status: complete ? 'calculated' : 'preliminary',
    reference: '§3.6 (T3.6) · DAM-001',
    note: complete
      ? 'ارتفاع دام طبق DAM-001 با هر دو ارتفاع ورودی محاسبه شد.'
      : 'ارتفاع سیل ثانویه و/یا پنل سوختگی ثبت نشده است؛ دام روی حداقل §3.6 (۳۰۰ mm) قرار گرفته. با ثبت آن دو ورودی، DAM-001 ارتفاع را بالا می‌برد.',
  }
}

// ─── Floating roof spacing ─────────────────────────────────────────
export type SealType = 'pantograph' | 'tube_seal_high' | 'tube_seal_low'

export interface FloatingRoofSpacing {
  spacingM: number | null
  status: VerificationStatus
  note: string
  inputs: Record<string, string | number>
}

/** Row of §3.5 that corresponds to a legacy seal type. */
const BELOW_SEAL_ROW: Record<SealType, number> = {
  pantograph: 0,
  tube_seal_high: 1,
  tube_seal_low: 2,
}

/**
 * Maximum discharge device spacing on a floating roof — §3.4 for top-of-seal
 * and §3.5 for below-the-seal. Both tables are read, not restated.
 *
 * The previous engine used 39.6 / 18.3 / 12.2 m; the specification states
 * 40 m (mechanical shoe, below-seal), 18 m (tube seal, below-seal) and
 * 40 m / 24.4 m (top-of-seal, by dam height).
 */
export function floatingRoofSpacing(
  sealType: SealType,
  foamDamHeightCm: number,
  position: 'top' | 'below',
  basis: DesignBasis,
): FloatingRoofSpacing {
  const edition = basisString(basis, K.foamTableEdition)
  const inputs = { sealType, foamDamHeightCm, position, edition: edition ?? 'ثبت‌نشده' }

  if (position === 'top') {
    const row = TOP_OF_SEAL[0]
    // The two columns of §3.4 are keyed on the dam height.
    const uses305 = foamDamHeightCm <= 30.5
    const spacingM = (uses305 ? row?.spacing305 : row?.spacing600) ?? null
    return {
      spacingM,
      status: 'requires_engineering_review',
      note: `از جدول §3.4 — ستون دام ${uses305 ? '۳۰۵ mm' : '۶۰۰ mm'}; نسخه NFPA 11 باید تأیید شود.`,
      inputs,
    }
  }

  const idx = BELOW_SEAL_ROW[sealType] ?? 0
  const row = BELOW_SEAL[idx] ?? BELOW_SEAL[0]
  return {
    spacingM: row?.spacingM ?? null,
    status: 'requires_engineering_review',
    note: `از جدول §3.5 «${row?.sealConfiguration}» — دام: ${row?.foamDam}`,
    inputs,
  }
}

/** Number of discharge devices around the seal: N = ⌈π·D / spacing⌉. */
export function dischargeDeviceCount(diameterM: number, maxSpacingM: number): number {
  const d = assertPositive(diameterM, 'tank diameter')
  const s = assertPositive(maxSpacingM, 'maximum spacing')
  return Math.ceil((Math.PI * d) / s)
}

// ─── Assembled foam design ─────────────────────────────────────────
export interface FoamDesign {
  rate: FoamRateResolution
  volumes: FoamVolumes
  chambers: (TableLookup<number> & { count: number }) | null
  handHose: TableLookup<{ count: number; durationMin: number }> | null
  handHoseTotalFlowLpm: number | null
  supplementaryConcentrateL: number | null
  totalConcentrateL: number
  dam: FoamDamResult | null
  status: ResultStatus
  notes: string[]
}

export interface FoamInput {
  /** Protected foam area (plan area for a cone roof, annulus for a floating roof). */
  areaM2: number
  diameterM: number
  fuelCategory: FlashpointCategory
  protectionType: FoamProtectionType
  concentratePercent: number
  /** Include the §3.9 supplementary hand hose lines. */
  includeHandHose?: boolean
  /** Include the foam dam sizing (floating roof tanks). */
  includeFoamDam?: boolean
}

export function computeFoam(input: FoamInput, basis: DesignBasis): FoamDesign {
  const rate = resolveFoamRate(input.fuelCategory, input.protectionType, basis)
  const volumes = foamVolumes(input.areaM2, rate.rateLpmM2, rate.durationMin, input.concentratePercent)

  const chambers = input.protectionType === 'foam_chamber' ? foamChamberLookup(input.diameterM, basis) : null
  const handHose = input.includeHandHose ? handHoseLookup(input.diameterM, basis) : null

  let handHoseTotalFlowLpm: number | null = null
  let supplementaryConcentrateL: number | null = null
  if (handHose?.row) {
    const flowPerLine = handHoseFlowPerLine(basis)
    handHoseTotalFlowLpm = handHose.row.count * flowPerLine
    supplementaryConcentrateL = handHoseTotalFlowLpm * handHose.row.durationMin * (input.concentratePercent / 100)
  }

  const notes: string[] = [
    'حجم محلول فوم و حجم کنسانتره جداگانه گزارش می‌شوند: V_concentrate = V_solution × C',
    `نرخ و مدت تخلیه از مبنای طراحی خوانده شد (${rate.rateReference}) — بدون شماره نسخه، نیازمند تأیید.`,
  ]
  if (chambers?.extrapolated) notes.push(`تعداد چمبر فوم برون‌یابی شد: ${chambers.rule}`)
  if (handHose?.extrapolated) notes.push('ردیف جدول E-5 برای این قطر در بازه منتشرشده نیست.')

  return {
    rate,
    volumes,
    chambers,
    handHose,
    handHoseTotalFlowLpm,
    supplementaryConcentrateL,
    totalConcentrateL: volumes.concentrateVolumeL + (supplementaryConcentrateL ?? 0),
    dam: input.includeFoamDam ? foamDamHeight(input.diameterM, basis) : null,
    status: 'calculated',
    notes,
  }
}
