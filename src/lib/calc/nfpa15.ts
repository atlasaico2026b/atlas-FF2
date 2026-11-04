// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// NFPA 15 — FIXED WATER SPRAY (VESSEL / TANK EXPOSURE PROTECTION)
//
// Structure: classify the equipment first, then resolve only the requirements
// that the design basis declares applicable to that class, then compute
// geometry, then report what is still unresolved.
//
// Nothing here decides on its own that a requirement applies. Every clause
// reference is carried with the verification status of its basis entry, and an
// unconfirmed applicability is reported as exactly that rather than being
// silently assumed in or out.
// ═══════════════════════════════════════════════════════════════════

import {
  annularRingAreaM2,
  generateRingElevations,
  horizontalVesselShellAreaM2,
  lateralCylinderAreaM2,
  nozzlesPerRing,
  planAreaM2,
  sphereAreaM2,
  idealSprayWidthM,
  preliminaryHorizontalSpacingM,
  type HeadType,
  type RingLayout,
  type SurfaceBreakdown,
} from './geometry'
import { basisNumber, basisString, K } from './basis'
import { NFPA15 } from './constants'
import type { DesignBasis, ResultStatus, VerificationStatus } from './provenance'
import { assertPositive, assertRange } from './units'

// ─── Equipment classification ──────────────────────────────────────
export type EquipmentClass =
  | 'pressure_vessel'
  | 'vertical_atmospheric_tank'
  | 'horizontal_vessel'
  | 'spherical_vessel'
  | 'other'

export const EQUIPMENT_CLASS_LABELS: Record<EquipmentClass, string> = {
  pressure_vessel: 'ظرف تحت فشار',
  vertical_atmospheric_tank: 'مخزن ذخیره اتمسفریک عمودی',
  horizontal_vessel: 'ظرف افقی',
  spherical_vessel: 'ظرف کروی',
  other: 'سایر تجهیزات',
}

/** Dome/roof type as recorded on a vertical tank element. */
export type TankRoofType = 'cone_roof' | 'floating_internal' | 'floating_external' | 'contaminated'

export interface ClassificationInput {
  /** The class the engineer selected — never inferred silently. */
  declared?: EquipmentClass | null
  /** Roof type from the element, used only to suggest, never to decide. */
  roofType?: TankRoofType | null
}

export interface ClassificationResult {
  equipmentClass: EquipmentClass
  /** True when the class came from the element rather than an explicit choice. */
  inferred: boolean
  reason: string
  status: VerificationStatus
}

/**
 * Classify the protected equipment.
 *
 * A pressure vessel is only ever returned when it was declared as one. An
 * atmospheric storage tank is never promoted to pressure-vessel rules, because
 * the pressure-vessel clauses do not describe an atmospheric tank's exposure
 * scenario.
 */
export function classifyEquipment({ declared, roofType }: ClassificationInput): ClassificationResult {
  if (declared) {
    return {
      equipmentClass: declared,
      inferred: false,
      reason: `کلاس تجهیز صریحاً «${EQUIPMENT_CLASS_LABELS[declared]}» انتخاب شده است`,
      status: declared === 'pressure_vessel' ? 'requires_engineering_review' : 'verified',
    }
  }
  if (roofType) {
    return {
      equipmentClass: 'vertical_atmospheric_tank',
      inferred: true,
      reason: `از نوع سقف (${roofType}) به‌عنوان مخزن اتمسفریک عمودی استنتاج شد. بندهای ظرف تحت فشار اعمال نمی‌شود.`,
      status: 'requires_engineering_review',
    }
  }
  return {
    equipmentClass: 'other',
    inferred: true,
    reason: 'کلاس تجهیز تعیین نشده است',
    status: 'requires_engineering_review',
  }
}

// ─── Protected surfaces ────────────────────────────────────────────
export interface ProtectedSurfaceInput {
  equipmentClass: EquipmentClass
  diameterM: number
  /** Vertical protected height, or vessel length for a horizontal vessel. */
  heightM: number
  headType?: HeadType
  /** Foam dam / secondary seal offset for a floating-roof annulus. */
  damOffsetM?: number
  /** Design-basis decision: is the top/roof surface protected? */
  includeTop?: boolean
  /** Design-basis decision: is the bottom surface protected? */
  includeBottom?: boolean
}

/**
 * Protected surface area for the declared class.
 *
 * Every result lists the surfaces that contributed **and** the surfaces that
 * were excluded with a reason, so `A = πDH` can never be mistaken for the whole
 * of the protected area.
 */
export function protectedSurfaces(input: ProtectedSurfaceInput): SurfaceBreakdown {
  const { equipmentClass, diameterM, heightM, headType = 'ellipsoidal', damOffsetM = 0, includeTop = false, includeBottom = false } = input
  const d = assertPositive(diameterM, 'diameter')
  const h = assertPositive(heightM, 'protected height')

  const parts: SurfaceBreakdown['parts'] = []
  const excluded: SurfaceBreakdown['excluded'] = []

  switch (equipmentClass) {
    case 'vertical_atmospheric_tank':
    case 'pressure_vessel': {
      if (damOffsetM > 0) {
        parts.push({
          name: 'سطح حلقوی بین دیواره و دمپ/سیل ثانویه',
          areaM2: annularRingAreaM2(d, damOffsetM),
          note: 'مخزن سقف شناور — سطح حفاظت‌شده حلقوی است، نه کل مقطع',
        })
      } else {
        parts.push({ name: 'بدنه جانبی استوانه (π·D·H)', areaM2: lateralCylinderAreaM2(d, h) })
      }
      if (includeTop) parts.push({ name: 'سقف (π·D²/4)', areaM2: planAreaM2(d) })
      else excluded.push({ name: 'سقف', reason: 'مبنای طراحی و سناریوی حریق سطح سقف را الزامی نکرده است' })
      if (includeBottom) parts.push({ name: 'کف (π·D²/4)', areaM2: planAreaM2(d) })
      else excluded.push({ name: 'کف', reason: 'معمولاً غیرقابل‌دسترس برای پاشش؛ در صورت نیاز مبنای طراحی وارد شود' })
      break
    }
    case 'horizontal_vessel': {
      const shell = horizontalVesselShellAreaM2(d, h, headType)
      parts.push({ name: 'بدنه استوانه افقی (π·D·L)', areaM2: shell.shellM2 })
      parts.push({ name: `دوطرف (${headType})`, areaM2: shell.headsM2, note: 'مساحت هندسی — الزام پوشش باید در مبنای طراحی تأیید شود' })
      break
    }
    case 'spherical_vessel': {
      parts.push({ name: 'کل سطح کره (π·D²)', areaM2: sphereAreaM2(d) })
      excluded.push({ name: 'اتکا به سرریز آب زیر خط استوا', reason: 'در ظروف کروی اتکا به rundown محدودیت دارد و باید جداگانه بررسی شود' })
      break
    }
    case 'other':
    default:
      excluded.push({ name: 'همه سطوح', reason: 'کلاس تجهیز تعیین نشده است — سطح حفاظت‌شده قابل محاسبه نیست' })
      break
  }

  const totalM2 = parts.reduce((s, p) => s + p.areaM2, 0)
  return { totalM2, parts, excluded, status: parts.length ? 'calculated' : 'blocked' }
}

// ─── Application rate ──────────────────────────────────────────────
export interface RateResolution {
  /** Rate the clause requires, when that clause is confirmed applicable. */
  requiredRateLpmM2: number | null
  requiredReference: string
  requiredStatus: VerificationStatus
  /** Rate the project has selected (legacy default carries over). */
  projectRateLpmM2: number
  projectReference: string
  projectStatus: VerificationStatus
  governing: 'required' | 'project'
  effectiveRateLpmM2: number
  /** True when the project rate is below the clause value that is available. */
  belowAvailableRequirement: boolean
  /** True when the clause's applicability to this class is unconfirmed. */
  applicabilityUnconfirmed: boolean
  status: ResultStatus
}

export function resolveApplicationRate(equipmentClass: EquipmentClass, basis: DesignBasis): RateResolution {
  const requiredRate = basisNumber(basis, K.sprayRequiredRate)
  const requiredEntry = basis.entries[K.sprayRequiredRate]
  const projectRate = basisNumber(basis, K.sprayProjectRate)
  const projectEntry = basis.entries[K.sprayProjectRate]
  const governing = (basisString(basis, K.sprayRateGoverns) ?? 'required') as 'required' | 'project'

  const effective = governing === 'required' ? (requiredRate ?? 0) : (projectRate ?? 0)
  // Anything not actually checked against the licensed text still has to have its
  // applicability to *this* equipment class confirmed — that is a warning about
  // the design, not a value the engineer has to type in.
  const applicabilityUnconfirmed = equipmentClass === 'other' || requiredEntry?.status !== 'verified'

  return {
    requiredRateLpmM2: requiredRate,
    requiredReference: requiredEntry?.reference ?? '—',
    requiredStatus: requiredEntry?.status ?? 'requires_engineering_review',
    projectRateLpmM2: projectRate ?? 0,
    projectReference: projectEntry?.reference ?? '—',
    projectStatus: projectEntry?.status ?? 'unverified_legacy',
    governing,
    effectiveRateLpmM2: effective,
    belowAvailableRequirement: requiredRate !== null && effective < requiredRate,
    applicabilityUnconfirmed,
    status: applicabilityUnconfirmed ? 'requires_engineering_review' : 'calculated',
  }
}

// ─── Water demand ──────────────────────────────────────────────────
export interface WaterDemand {
  surfaces: SurfaceBreakdown
  rateLpmM2: number
  demandLpm: number
  equation: string
  substitution: string
  status: ResultStatus
}

/** Q = Σ(A_i × R_i). */
export function waterDemand(surfaces: SurfaceBreakdown, rateLpmM2: number): WaterDemand {
  const rate = assertPositive(rateLpmM2, 'application rate')
  const demandLpm = surfaces.totalM2 * rate
  return {
    surfaces,
    rateLpmM2: rate,
    demandLpm,
    equation: 'Q = Σ(A_i × R_i)',
    substitution: `${surfaces.totalM2.toFixed(2)} m² × ${rate} L/min/m² = ${demandLpm.toFixed(1)} L/min`,
    status: surfaces.status === 'blocked' ? 'blocked' : 'calculated',
  }
}

// ─── Spacing ───────────────────────────────────────────────────────
export interface SpacingResolution {
  horizontalSpacingM: number
  horizontalReference: string
  horizontalStatus: VerificationStatus
  verticalSpacingM: number
  verticalReference: string
  verticalStatus: VerificationStatus
  rundownMaxM: number | null
  rundownReference: string
  rundownStatus: VerificationStatus
  overlapFraction: number
}

export function resolveSpacing(basis: DesignBasis): SpacingResolution {
  return {
    horizontalSpacingM: basisNumber(basis, K.sprayHorizontalSpacing) ?? NFPA15.horizontalSpacingM,
    horizontalReference: basis.entries[K.sprayHorizontalSpacing]?.reference ?? '—',
    horizontalStatus: basis.entries[K.sprayHorizontalSpacing]?.status ?? 'unverified_legacy',
    verticalSpacingM: basisNumber(basis, K.sprayVerticalSpacing) ?? NFPA15.verticalSpacingM,
    verticalReference: basis.entries[K.sprayVerticalSpacing]?.reference ?? '—',
    verticalStatus: basis.entries[K.sprayVerticalSpacing]?.status ?? 'unverified_legacy',
    rundownMaxM: basisNumber(basis, K.sprayRundownMax),
    rundownReference: basis.entries[K.sprayRundownMax]?.reference ?? '—',
    rundownStatus: basis.entries[K.sprayRundownMax]?.status ?? 'requires_engineering_review',
    overlapFraction: basisNumber(basis, K.sprayOverlapFraction) ?? 0,
  }
}

// ─── Nozzle layout ─────────────────────────────────────────────────
export interface RingNozzles {
  elevationM: number
  count: number
  circumferenceM: number
}

export interface NozzleLayout {
  rings: RingNozzles[]
  layout: RingLayout
  totalNozzles: number
  horizontalSpacingM: number
  verticalSpacingM: number
  /** Legacy preliminary form, kept for comparison only. */
  legacyPreliminaryEstimate: number
  exceededRundownLimit: boolean
  rundownLimitM: number | null
  status: ResultStatus
  /** Geometry is not coverage. */
  coverageValidated: false
}

export interface NozzleLayoutInput {
  diameterM: number
  protectedHeightM: number
  spacing: SpacingResolution
  /** Whether the design relies on water rundown along the surface. */
  reliesOnRundown?: boolean
}

export function nozzleLayout({ diameterM, protectedHeightM, spacing, reliesOnRundown = true }: NozzleLayoutInput): NozzleLayout {
  const d = assertPositive(diameterM, 'diameter')
  const h = assertPositive(protectedHeightM, 'protected height')
  const S = assertPositive(spacing.horizontalSpacingM, 'horizontal spacing')
  const V = assertPositive(spacing.verticalSpacingM, 'vertical spacing')

  const layout = generateRingElevations({ protectedHeightM: h, maxVerticalSpacingM: V })
  const { circumferenceM } = nozzlesPerRing(d, S)
  const perRing = nozzlesPerRing(d, S).count

  const rings: RingNozzles[] = layout.elevationsM.map(elevationM => ({ elevationM, count: perRing, circumferenceM }))
  const totalNozzles = rings.reduce((s, r) => s + r.count, 0)

  const exceededRundownLimit =
    reliesOnRundown && spacing.rundownMaxM !== null && (
      // The design intends a nozzle row every V; if V itself is beyond the limit
      // the layout exceeds it even when rounding happens to leave smaller gaps.
      V > spacing.rundownMaxM + 1e-9 ||
      layout.maxGapM > spacing.rundownMaxM + 1e-9
    )

  return {
    rings,
    layout,
    totalNozzles,
    horizontalSpacingM: S,
    verticalSpacingM: V,
    legacyPreliminaryEstimate: Math.ceil(circumferenceM / S) * Math.max(1, Math.ceil(h / V)),
    exceededRundownLimit,
    rundownLimitM: spacing.rundownMaxM,
    // Geometry alone never establishes coverage.
    status: 'preliminary',
    coverageValidated: false,
  }
}

// ─── Nozzle flow and demand-based count ────────────────────────────
export type NozzleKUnit = 'L/min/bar^0.5' | 'gpm/psi^0.5'

/** Converts a gpm/psi^0.5 K-factor to L/min/bar^0.5. */
export const K_GPM_PSI_TO_LPM_BAR = 3.785411784 * Math.sqrt(14.5037738) // ≈ 14.4163

/**
 * Nozzle data resolved from the design basis.
 *
 * Returns null only when the basis genuinely has no K-factor or no operating
 * pressure, so a caller that passes nothing still gets a number without having to
 * type anything in.
 */
export function nozzleFromBasis(basis: DesignBasis): { k: number; kUnit: NozzleKUnit; pressurePa: number; source: string } | null {
  const k = basisNumber(basis, K.sprayNozzleK)
  const pressureBar = basisNumber(basis, K.sprayNozzlePressure)
  if (k === null || k === undefined || pressureBar === null || pressureBar === undefined) return null
  if (!(k > 0) || !(pressureBar > 0)) return null
  const kEntry = basis.entries[K.sprayNozzleK]
  return {
    k,
    kUnit: 'L/min/bar^0.5',
    pressurePa: pressureBar * 1e5,
    source: kEntry?.reference ?? 'پایه طراحی',
  }
}

export interface NozzleFlowInput {
  k: number
  kUnit: NozzleKUnit
  /** Operating pressure at the nozzle, Pa. */
  pressurePa: number
  source: string
}

export interface NozzleFlow {
  flowLpm: number
  /** K expressed in L/min/bar^0.5, as stored for the report. */
  kLpmBar: number
  pressureBar: number
  kUnit: NozzleKUnit
  source: string
  equation: string
  substitution: string
}

/** Q_n = K · √P. The manufacturer's unit convention is recorded, not assumed. */
export function nozzleFlow({ k, kUnit, pressurePa, source }: NozzleFlowInput): NozzleFlow {
  const Kv = assertPositive(k, 'nozzle K-factor')
  const P = assertPositive(pressurePa, 'nozzle operating pressure')
  const pressureBar = P / 1e5
  const kLpmBar = kUnit === 'gpm/psi^0.5' ? Kv * K_GPM_PSI_TO_LPM_BAR : Kv
  const flowLpm = kLpmBar * Math.sqrt(pressureBar)
  return {
    flowLpm,
    kLpmBar,
    pressureBar,
    kUnit,
    source,
    equation: 'Q_n = K · √P',
    substitution: `K = ${kLpmBar.toFixed(4)} L/min/bar^0.5 (واحد اصلی: ${kUnit}) × √${pressureBar.toFixed(3)} bar = ${flowLpm.toFixed(2)} L/min`,
  }
}

/**
 * Lower bound on nozzle count from the demand alone: N = ⌈Q_required / Q_n⌉.
 *
 * This is a demand estimate. It says nothing about whether the nozzles cover the
 * surface — the layout and coverage checks decide that.
 */
export function nozzlesFromDemand(requiredFlowLpm: number, flowPerNozzleLpm: number): {
  count: number
  requiredFlowLpm: number
  flowPerNozzleLpm: number
  status: ResultStatus
  note: string
} {
  const Q = assertPositive(requiredFlowLpm, 'required flow')
  const qn = assertPositive(flowPerNozzleLpm, 'nozzle flow')
  return {
    count: Math.ceil(Q / qn),
    requiredFlowLpm: Q,
    flowPerNozzleLpm: qn,
    status: 'preliminary',
    note: 'فقط تخمین مبتنی بر دبی — الزام پوشش و چیدمان جداگانه بررسی می‌شود و فشار یکسان در همه نازل‌ها فرض نشده است.',
  }
}

// ─── Obstruction / coverage flags ──────────────────────────────────
export interface CoverageCheck {
  id: string
  label: string
  status: ResultStatus
  detail: string
  reference: string
  requires: string
}

/**
 * The checks that a pure geometric nozzle count cannot answer. Each one is
 * reported as open until the data behind it exists.
 */
export function coverageChecks(layout: NozzleLayout, spacing: SpacingResolution, hasManufacturerData: boolean): CoverageCheck[] {
  return [
    {
      id: 'spray-pattern',
      label: 'الگوی پاشش و هم‌پوشانی نازل',
      status: hasManufacturerData ? 'requires_engineering_review' : 'blocked',
      detail: hasManufacturerData
        ? 'داده سازنده موجود است ولی هم‌پوشانی در فشار کارکرد و فاصله واقعی باید بررسی شود'
        : 'داده الگوی پاشش سازنده (عرض پاشش در فشار کارکرد و فاصله نصب) در دسترس نیست',
      reference: 'NFPA 15 — الزام هم‌پوشانی الگو روی سطح حفاظت‌شده',
      requires: 'نمودار پاشش سازنده + فشار کارکرد + فاصله نازل تا سطح + جهت‌گیری نازل',
    },
    {
      id: 'obstruction',
      label: 'موانع و سایه‌های پوشش‌نشده (projections)',
      status: 'requires_engineering_review',
      detail: 'برجستگی‌ها، نردبان‌ها، سکوها، اتصالات و لوله‌های مجاور می‌توانند بخشی از سطح را از پوشش خارج کنند',
      reference: 'NFPA 15:2022 §7.4.2.5 (به نقل از بریف کارفرما — نیازمند تأیید نسخه)',
      requires: 'نقشه موانع + تعیین نواحی سایه + نازل اضافه یا راه‌حل مهندسی مستند',
    },
    {
      id: 'coverage-completeness',
      label: 'کامل بودن پوشش سطح',
      status: 'blocked',
      detail: `${layout.totalNozzles} نازل روی ${layout.rings.length} رینگ چیده شده است — اما چیدمان هندسی به‌تنهایی پوشش مؤثر را اثبات نمی‌کند`,
      reference: 'بررسی پوشش',
      requires: 'تأیید پوشش کامل سطح بر اساس داده پاشش و هندسه واقعی نصب',
    },
    {
      id: 'rundown',
      label: 'اتکا به سرریز آب روی سطح',
      status: layout.exceededRundownLimit ? 'blocked' : 'requires_engineering_review',
      detail: layout.exceededRundownLimit
        ? `حداکثر فاصله عمودی نصب‌شده (${layout.layout.maxGapM.toFixed(2)} m) از حد مجاز (${layout.rundownLimitM} m) بیشتر است`
        : `حداکثر فاصله عمودی نصب‌شده ${layout.layout.maxGapM.toFixed(2)} m و حد مجاز ${layout.rundownLimitM ?? '—'} m است`,
      reference: spacing.rundownReference,
      requires: 'تأیید تعلق بند rundown به این هندسه (مخزن افقی/کروی محدودیت‌های جداگانه دارد)',
    },
    {
      id: 'end-coverage',
      label: 'پوشش لبه بالا و پایین بدنه',
      status: 'preliminary',
      detail: `پایین‌ترین رینگ ${layout.layout.bottomEdgeM.toFixed(2)} m از کف و بالاترین رینگ ${layout.layout.topEdgeM.toFixed(2)} m از لبه بالا فاصله دارد`,
      reference: 'هندسه چیدمان',
      requires: 'تأیید پوشش لبه‌ها بر اساس داده پاشش واقعی',
    },
  ]
}

// ─── Assembled design ──────────────────────────────────────────────
export interface WaterSprayDesign {
  classification: ClassificationResult
  rate: RateResolution
  demand: WaterDemand
  spacing: SpacingResolution
  layout: NozzleLayout
  nozzleFlow: NozzleFlow | null
  demandBasedCount: { count: number; note: string } | null
  checks: CoverageCheck[]
  /** Preliminary geometric spacing from the idealised cone, for reference. */
  preliminarySpacing: { idealWidthM: number; spacingM: number; angleDeg: number; nozzleToTargetM: number } | null
  status: ResultStatus
  reportNotes: string[]
}

export interface WaterSprayInput {
  equipmentClass: EquipmentClass
  diameterM: number
  heightM: number
  damOffsetM?: number
  headType?: HeadType
  includeTop?: boolean
  includeBottom?: boolean
  reliesOnRundown?: boolean
  /** Nozzle stand-off from the surface and full spray angle, for the idealised estimate. */
  nozzleToTargetM?: number
  sprayAngleDeg?: number
  /** Manufacturer datasheet on file? */
  hasManufacturerData?: boolean
  /** Optional manufacturer nozzle data, when it exists. */
  nozzle?: { k: number; kUnit: NozzleKUnit; pressurePa: number; source: string } | null
}

export function computeWaterSpray(input: WaterSprayInput, basis: DesignBasis): WaterSprayDesign {
  const classification = classifyEquipment({ declared: input.equipmentClass })
  const rate = resolveApplicationRate(input.equipmentClass, basis)
  const surfaces = protectedSurfaces({
    equipmentClass: input.equipmentClass,
    diameterM: input.diameterM,
    heightM: input.heightM,
    damOffsetM: input.damOffsetM,
    headType: input.headType,
    includeTop: input.includeTop,
    includeBottom: input.includeBottom,
  })
  const demand = waterDemand(surfaces, rate.effectiveRateLpmM2)
  const spacing = resolveSpacing(basis)
  const layout = nozzleLayout({
    diameterM: input.diameterM,
    protectedHeightM: input.heightM,
    spacing,
    reliesOnRundown: input.reliesOnRundown ?? true,
  })

  // Nozzle data falls back to the design basis. That is what makes the
  // demand-based nozzle count compute on a fresh project with nothing typed in;
  // pass `nozzle` explicitly to override it with the real datasheet.
  let flow: NozzleFlow | null = null
  const nozzle = input.nozzle ?? nozzleFromBasis(basis)
  if (nozzle) {
    flow = nozzleFlow({ k: nozzle.k, kUnit: nozzle.kUnit, pressurePa: nozzle.pressurePa, source: nozzle.source })
  }
  const demandBasedCount = flow ? { count: nozzlesFromDemand(demand.demandLpm, flow.flowLpm).count, note: nozzlesFromDemand(demand.demandLpm, flow.flowLpm).note } : null

  let preliminarySpacing: WaterSprayDesign['preliminarySpacing'] = null
  if (input.nozzleToTargetM !== undefined && input.sprayAngleDeg !== undefined) {
    const idealWidthM = idealSprayWidthM(input.nozzleToTargetM, assertRange(input.sprayAngleDeg, 'spray angle', 1, 179))
    preliminarySpacing = {
      idealWidthM,
      spacingM: preliminaryHorizontalSpacingM(idealWidthM, spacing.overlapFraction),
      angleDeg: input.sprayAngleDeg,
      nozzleToTargetM: input.nozzleToTargetM,
    }
  }

  const checks = coverageChecks(layout, spacing, input.hasManufacturerData ?? false)

  const reportNotes: string[] = [
    `کلاس تجهیز: ${EQUIPMENT_CLASS_LABELS[input.equipmentClass]}${classification.inferred ? ' (استنتاج‌شده)' : ''}`,
    `میزان آب‌پاشی مؤثر: ${rate.effectiveRateLpmM2} L/min/m² — مبنا: ${rate.governing === 'required' ? rate.requiredReference : rate.projectReference}`,
    'نتیجه «مقدماتی» است: پوشش مؤثر بر اساس داده سازنده و هندسه واقعی نصب تأیید نشده است.',
  ]
  if (rate.belowAvailableRequirement) {
    reportNotes.push(`هشدار: میزان آب‌پاشی انتخابی (${rate.effectiveRateLpmM2}) از مقدار بند موجود (${rate.requiredRateLpmM2}) کمتر است.`)
  }
  if (input.damOffsetM && input.damOffsetM > 0) {
    reportNotes.push('سطح حفاظت‌شده حلقوی محاسبه شده است؛ از جمع‌شدن همزمان با مقطع کامل باید پرهیز شود.')
  }

  return {
    classification,
    rate,
    demand,
    spacing,
    layout,
    nozzleFlow: flow,
    demandBasedCount,
    checks,
    preliminarySpacing,
    status: demand.status === 'blocked' ? 'blocked' : 'preliminary',
    reportNotes,
  }
}
