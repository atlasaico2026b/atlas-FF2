// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// AUDITABLE REPORT MODEL
//
// A report is a list of sections, each carrying the equation, the substituted
// values, the result, the source reference and a status. The status vocabulary
// keeps "the formula ran" ("calculated") distinct from "an engineer checked this
// against the standard" ("verified").
//
// The report never asserts compliance. It states what was computed, on what
// basis, and what is still open.
// ═══════════════════════════════════════════════════════════════════

import { needsReview, RESULT_STATUS_LABELS, SOURCE_LABELS, STATUS_LABELS, type AdoptedStandard, type BasisEntry, type DesignBasis, type ResultStatus, type VerificationStatus } from './provenance'
import type { ValidationIssue } from './validate'
import type { WaterSprayDesign } from './nfpa15'
import { EQUIPMENT_CLASS_LABELS } from './nfpa15'
import type { FoamDesign } from './nfpa11'
import type { FireWaterDemand } from './demand'
import type { BundwallCapacity, BundwallRequirement } from './bundwall'
import type { PumpDutyCheck } from './nfpa20'
import type { HazenWilliamsResult } from './hydraulics'

export const CALC_ENGINE_VERSION = '3.0.0'

export interface ReportEquation {
  id: string
  title: string
  standardRef: string
  status: ResultStatus | VerificationStatus
  equation: string
  substitution: string
  result: string
  notes?: string[]
}

export interface ReportTableRow {
  label: string
  value: string
  unit?: string
  source: string
  status: string
}

export interface ReportSection {
  id: string
  title: string
  status: ResultStatus
  equations: ReportEquation[]
  table?: { columns: string[]; rows: ReportTableRow[] }
  notes: string[]
}

export interface CalculationReport {
  generatedAt: string
  engineVersion: string
  basisVersion: string
  overallStatus: ResultStatus
  /** A true sentence about the report. Never "compliant". */
  statement: string
  adoptedStandards: AdoptedStandard[]
  sections: ReportSection[]
  /** Basis parameters an engineer still has to sign off. */
  reviewItems: { key: string; parameter: string; value: string; unit: string; source: string; reference: string; status: string }[]
  warnings: ValidationIssue[]
  blockers: ValidationIssue[]
  limitations: string[]
  /** Anything the migration from a previous schema had to interpret. */
  migrations: string[]
}

const DEFAULT_LIMITATIONS = [
  'هیچ‌یک از مقادیر «الزام استاندارد» در این ساخت از متن مجاز/رسمی استخراج نشده است و همه با وضعیت تأیید خود گزارش می‌شوند.',
  'محاسبات هیدرولیک در این نسخه روی افت برآوردی شبکه انجام می‌شود، نه حل کامل شبکه لوله.',
  'پوشش مؤثر نازل‌ها بدون داده الگوی پاشش سازنده اثبات نمی‌شود.',
  'این گزارش «منطبق با استاندارد» نیست؛ انطباق نیازمند تأیید همه معیارها، داده تجهیزات و بازبینی مهندسی است.',
]

export function reviewItemsFromBasis(basis: DesignBasis): CalculationReport['reviewItems'] {
  return Object.values(basis.entries)
    .filter(needsReview)
    .map(e => ({
      key: e.key,
      parameter: e.parameter,
      value: String(e.value ?? '—'),
      unit: e.unit ?? '',
      source: SOURCE_LABELS[e.source],
      reference: e.reference,
      status: STATUS_LABELS[e.status],
    }))
}

export function buildReport(params: {
  basis: DesignBasis
  sections: ReportSection[]
  validation: { blockers: ValidationIssue[]; warnings: ValidationIssue[]; statement: string; ok: boolean }
  overallStatus: ResultStatus
  now?: Date
  extraLimitations?: string[]
}): CalculationReport {
  const { basis, sections, validation, overallStatus } = params
  return {
    generatedAt: (params.now ?? new Date()).toISOString(),
    engineVersion: CALC_ENGINE_VERSION,
    basisVersion: basis.basisVersion,
    overallStatus,
    statement: validation.statement,
    adoptedStandards: basis.adoptedStandards,
    sections,
    reviewItems: reviewItemsFromBasis(basis),
    warnings: validation.warnings,
    blockers: validation.blockers,
    limitations: [...DEFAULT_LIMITATIONS, ...(params.extraLimitations ?? [])],
    migrations: basis.migrations,
  }
}

// ─── Section builders ──────────────────────────────────────────────
export function sectionFromWaterSpray(design: WaterSprayDesign): ReportSection {
  const equations: ReportEquation[] = [
    {
      id: 'spray-rate',
      title: 'میزان آب‌پاشی و دبی طراحی',
      standardRef: design.rate.governing === 'required' ? design.rate.requiredReference : design.rate.projectReference,
      status: design.rate.status,
      equation: 'Q = Σ(A_i × R_i)',
      substitution: design.demand.substitution,
      result: `${design.demand.demandLpm.toFixed(1)} L/min`,
      notes: [
        `کلاس تجهیز: ${EQUIPMENT_CLASS_LABELS[design.classification.equipmentClass]}`,
        `میزان مؤثر: ${design.rate.effectiveRateLpmM2} L/min/m² (حاکم: ${design.rate.governing === 'required' ? 'الزام' : 'پیش‌فرض پروژه'})`,
        ...(design.rate.belowAvailableRequirement ? ['میزان انتخابی از مقدار بند موجود کمتر است.'] : []),
      ],
    },
    {
      id: 'spray-layout',
      title: 'چیدمان نازل (رینگ‌ها و تعداد)',
      standardRef: design.spacing.horizontalReference,
      status: design.layout.status,
      equation: 'N_ring = max(2, ⌈π·D / S⌉) ; رینگ‌ها از ارتفاع واقعی نصب',
      substitution: `D = ${design.layout.rings[0]?.circumferenceM ? (design.layout.rings[0].circumferenceM / Math.PI).toFixed(2) : '—'} m، S = ${design.layout.horizontalSpacingM} m، V = ${design.layout.verticalSpacingM} m → ${design.layout.rings.length} رینگ × ${design.layout.rings[0]?.count ?? 0} نازل`,
      result: `${design.layout.totalNozzles} نازل`,
      notes: [
        `ارتفاع رینگ‌ها (m): ${design.layout.layout.elevationsM.map(z => z.toFixed(2)).join('، ')}`,
        `حداکثر فاصله عمودی نصب‌شده: ${design.layout.layout.maxGapM.toFixed(2)} m — حد مجاز: ${design.layout.rundownLimitM ?? '—'} m`,
        `پوشش لبه پایین ${design.layout.layout.bottomEdgeM.toFixed(2)} m و لبه بالا ${design.layout.layout.topEdgeM.toFixed(2)} m`,
        'این چیدمان هندسی است و به‌تنهایی پوشش مؤثر را اثبات نمی‌کند.',
      ],
    },
  ]

  if (design.nozzleFlow) {
    equations.push({
      id: 'spray-nozzle-flow',
      title: 'دبی نازل از ضریب K',
      standardRef: design.nozzleFlow.source,
      status: 'requires_engineering_review',
      equation: design.nozzleFlow.equation,
      substitution: design.nozzleFlow.substitution,
      result: `${design.nozzleFlow.flowLpm.toFixed(2)} L/min`,
      notes: [`واحد اصلی ضریب K: ${design.nozzleFlow.kUnit}`],
    })
  }
  if (design.demandBasedCount) {
    equations.push({
      id: 'spray-demand-count',
      title: 'تعداد نازل از روی دبی (کران پایین)',
      standardRef: 'برآورد مقدماتی',
      status: 'preliminary',
      equation: 'N_flow = ⌈Q_required / Q_n⌉',
      substitution: `${design.demand.demandLpm.toFixed(1)} / ${design.nozzleFlow?.flowLpm.toFixed(2) ?? '—'} = ${design.demandBasedCount.count}`,
      result: `${design.demandBasedCount.count} نازل (کران پایین)`,
      notes: [design.demandBasedCount.note],
    })
  }

  return {
    id: 'nfpa15',
    title: 'الف) NFPA 15 — آب‌پاشی مخزن/ظرف',
    status: design.status,
    equations,
    table: {
      columns: ['سطح', 'مساحت (m²)', 'وضعیت'],
      rows: [
        ...design.demand.surfaces.parts.map(p => ({ label: p.name, value: p.areaM2.toFixed(2), unit: 'm²', source: 'هندسه', status: 'محاسبه‌شده', ...(p.note ? { source: `هندسه — ${p.note}` } : {}) })),
        ...design.demand.surfaces.excluded.map(p => ({ label: `${p.name} (خارج‌شده)`, value: '0', unit: 'm²', source: p.reason, status: 'اعمال‌نشده' })),
      ],
    },
    notes: design.reportNotes,
  }
}

export function sectionFromFoam(design: FoamDesign): ReportSection {
  return {
    id: 'nfpa11',
    title: 'ب) NFPA 11 — سیستم فوم',
    status: design.status,
    equations: [
      {
        id: 'foam-volume',
        title: 'حجم محلول فوم و کنسانتره',
        standardRef: design.rate.rateReference,
        status: design.rate.status,
        equation: design.volumes.equations.join(' ; '),
        substitution: design.volumes.substitution.join(' | '),
        result: `${design.volumes.solutionVolumeL.toFixed(0)} L محلول — ${design.volumes.concentrateVolumeL.toFixed(0)} L کنسانتره`,
        notes: [
          `گروه سوخت: ${design.rate.group}`,
          `نرخ ${design.rate.rateLpmM2} L/min/m² و مدت ${design.rate.durationMin} دقیقه`,
          'محلول فوم و کنسانتره دو کمیت متفاوت‌اند و هر دو گزارش شده‌اند.',
        ],
      },
      ...(design.chambers
        ? [{
          id: 'foam-chambers',
          title: 'تعداد چمبر فوم',
          standardRef: `§3.1 سند موتور مشخصات (T3.1) — نسخه NFPA 11: ${design.chambers.edition ?? 'ثبت‌نشده'}`,
          status: design.chambers.extrapolated ? 'requires_engineering_review' : design.chambers.status,
          equation: 'N_chamber از جدول بر اساس قطر مخزن',
          substitution: `D = ${design.chambers.inputs.diameterM} m → ${design.chambers.rule}`,
          result: `${design.chambers.row} چمبر`,
          notes: [design.chambers.note, ...(design.chambers.extrapolated ? ['این نتیجه برون‌یابی است.'] : [])],
        } as ReportEquation]
        : []),
      ...(design.handHose?.row
        ? [{
          id: 'foam-handhose',
          title: 'خطوط شیلنگ دستی مکمل',
          standardRef: `§3.9 سند موتور مشخصات (T3.9) — نسخه NFPA 11: ${design.handHose.edition ?? 'ثبت‌نشده'}`,
          status: design.handHose.status,
          equation: 'تعداد خط و مدت از جدول بر اساس قطر مخزن',
          substitution: `D = ${design.handHose.inputs.diameterM} m → ${design.handHose.rule}`,
          result: `${design.handHose.row.count} خط / ${design.handHose.row.durationMin} دقیقه / ${design.handHoseTotalFlowLpm} L/min`,
          notes: [design.handHose.note, `کنسانتره مکمل: ${design.supplementaryConcentrateL?.toFixed(0) ?? 0} L`],
        } as ReportEquation]
        : []),
      ...(design.dam
        ? [{
          id: 'foam-dam',
          title: 'ارتفاع فوم‌دمپ',
          standardRef: design.dam.reference,
          status: design.dam.status,
          equation: 'قاعده پله‌ای بر اساس قطر (رویه پروژه)',
          substitution: design.dam.rule,
          result: `${design.dam.heightMm} mm`,
          notes: [design.dam.note],
        } as ReportEquation]
        : []),
    ],
    table: {
      columns: ['کمیت', 'مقدار', 'منبع'],
      rows: [
        { label: 'دبی محلول فوم', value: design.volumes.solutionFlowLpm.toFixed(1), unit: 'L/min', source: 'محاسبه‌شده', status: 'محاسبه‌شده' },
        { label: 'حجم محلول فوم', value: design.volumes.solutionVolumeL.toFixed(0), unit: 'L', source: 'محاسبه‌شده', status: 'محاسبه‌شده' },
        { label: 'حجم کنسانتره', value: design.volumes.concentrateVolumeL.toFixed(0), unit: 'L', source: `C = ${design.volumes.concentrateFraction}`, status: 'محاسبه‌شده' },
        { label: 'مجموع کنسانتره (اصلی + مکمل)', value: design.totalConcentrateL.toFixed(0), unit: 'L', source: 'محاسبه‌شده', status: 'محاسبه‌شده' },
      ],
    },
    notes: design.notes,
  }
}

export function sectionFromDemand(demand: FireWaterDemand): ReportSection {
  return {
    id: 'demand',
    title: 'پ) دبی آتش‌نشانی — مانیتور و هایدرانت',
    status: demand.status,
    equations: [{
      id: 'demand-total',
      title: 'جمع دبی طراحی',
      standardRef: 'مشخصات گره‌های نقشه',
      status: 'calculated',
      equation: demand.equation,
      substitution: demand.substitution,
      result: `${demand.totalDemandLpm.toFixed(0)} L/min`,
      notes: demand.notes,
    }],
    table: {
      columns: ['خروجی', 'نوع', 'دبی واحد (L/min)', 'تعداد', 'جمع (L/min)', 'منبع'],
      rows: demand.rows.map(r => ({
        label: r.location, value: String(r.outletCount), unit: 'عدد',
        source: `${r.flowPerOutletLpm.toFixed(0)} × ${r.outletCount} = ${r.subtotalLpm.toFixed(0)} — ${r.reference}`,
        status: r.mode === 'simultaneous' ? 'هم‌زمان' : `گروه اختصاصی «${r.exclusiveGroup ?? r.id}»`,
      })),
    },
    notes: [`سناریوی طراحی: ${demand.scenario}`],
  }
}

export function sectionFromHydraulics(network: boolean, hw: HazenWilliamsResult | null, allowance: number | null): ReportSection {
  const equations: ReportEquation[] = []
  if (hw) {
    equations.push({
      id: 'hw',
      title: 'افت اصطکاک — هیزن-ویلیامز',
      standardRef: 'فرمول سی‌آی با واحدهای اعلام‌شده',
      status: 'calculated',
      equation: hw.equation,
      substitution: hw.substitution,
      result: `${hw.headLossM.toFixed(4)} m`,
      notes: [
        `سرعت ${hw.velocityMs.toFixed(3)} m/s`,
        'افت‌های جزئی (اتصالات و متعلقات) در این عدد لحاظ نشده و باید جداگانه اضافه شود.',
      ],
    })
  }
  if (!network) {
    equations.push({
      id: 'hw-allowance',
      title: 'افت شبکه — مقدار برآوردی (نه محاسبه)',
      standardRef: 'موتور قبلی — مقدار ثابت',
      status: 'requires_engineering_review',
      equation: 'H_friction ≈ مقدار ثابت پروژه',
      substitution: `${allowance} m`,
      result: `${allowance} m (برآورد)`,
      notes: ['این عدد از محاسبه هیزن-ویلیامز روی شبکه واقعی به دست نیامده است.'],
    })
  }
  return {
    id: 'hydraulics',
    title: 'ت) هیدرولیک لوله',
    status: network ? 'calculated' : 'requires_engineering_review',
    equations,
    notes: ['محدودیت هیزن-ویلیامز: آب در دمای معمول، جریان مغشوش، مبتنی بر ضریب C؛ برای سیال دیگر یا رژیم آرام معتبر نیست.'],
  }
}

export function sectionFromPump(duty: PumpDutyCheck | null, power: { hydraulicKW: number; shaftKW: number; equation: string; substitution: string; tdhM: number; tdhSubstitution: string } | null, rated: { flowLpm: number; headM: number } | null): ReportSection {
  const equations: ReportEquation[] = []
  if (power) {
    equations.push({
      id: 'tdh',
      title: 'هد کل دینامیک (TDH)',
      standardRef: 'فرم‌بندی یکدست هد',
      status: 'calculated',
      equation: 'TDH = H_static + H_friction + H_residual',
      substitution: power.tdhSubstitution,
      result: `${power.tdhM.toFixed(2)} m`,
    })
    equations.push({
      id: 'power',
      title: 'توان پمپ',
      standardRef: 'P_hyd = ρ·g·Q·H/1000 ; P_input = P_hyd/η',
      status: 'calculated',
      equation: power.equation,
      substitution: power.substitution,
      result: `${power.hydraulicKW.toFixed(2)} kW هیدرولیک → ${power.shaftKW.toFixed(2)} kW ورودی`,
      notes: ['تبدیل دبی از L/min به m³/s یک‌بار و در مرز محاسبه انجام می‌شود.'],
    })
  }
  equations.push({
    id: 'pump-curve',
    title: 'بررسی دوره کاری روی منحنی گواهی‌شده',
    standardRef: duty?.status === 'verified' ? 'منحنی سازنده' : 'منحنی سازنده — در دسترس نیست',
    status: duty?.status ?? 'requires_engineering_review',
    equation: 'هد موجود از درون‌یابی بین نقاط منتشرشده منحنی (بدون برون‌یابی)',
    substitution: duty?.availableHeadM !== null && duty?.availableHeadM !== undefined
      ? `هد موجود ${duty.availableHeadM.toFixed(2)} m، حاشیه ${duty.headMarginM?.toFixed(2)} m`
      : (duty?.reason ?? 'منحنی موجود نیست'),
    result: duty?.covered === true ? 'پوشش داده می‌شود' : duty?.covered === false ? 'پوشش داده نمی‌شود' : 'بررسی نشده',
    notes: duty ? [duty.note] : [],
  })
  if (rated) {
    equations.push({
      id: 'pump-rated',
      title: 'ظرفیت نامی پمپ (جدا از دبی تقاضا)',
      standardRef: 'داده تجهیز',
      status: 'requires_engineering_review',
      equation: 'نقطه نامی ≠ نقطه تقاضا',
      substitution: `${rated.flowLpm} L/min @ ${rated.headM} m`,
      result: `${rated.flowLpm} L/min — ${rated.headM} m`,
      notes: ['کفایت پمپ با منحنی گواهی‌شده تأیید می‌شود، نه با TDH به‌تنهایی.'],
    })
  }
  return { id: 'nfpa20', title: 'ث) NFPA 20 — پمپ آتش‌نشانی', status: duty?.covered === true ? 'calculated' : 'requires_engineering_review', equations, notes: [] }
}

export function sectionFromBundwall(req: BundwallRequirement | null, cap: BundwallCapacity | null): ReportSection {
  const equations: ReportEquation[] = []
  if (req) {
    equations.push({
      id: 'bundwall-required',
      title: 'حجم مورد نیاز باندوال',
      standardRef: req.source,
      status: req.status,
      equation: req.governingExpression,
      substitution: `بزرگ‌ترین مخزن ${req.largestVolumeM3.toFixed(0)} m³، مجموع ${req.totalVolumeM3.toFixed(0)} m³`,
      result: `${req.requiredVolumeM3.toFixed(1)} m³`,
      notes: [
        req.note,
        `سایر گزینه‌های قاعده: ${req.candidates.map(c => `${c.ruleId} = ${c.valueM3.toFixed(1)} m³`).join(' | ')}`,
      ],
    })
  }
  if (cap) {
    equations.push({
      id: 'bundwall-capacity',
      title: 'ظرفیت ناخالص و مفید',
      standardRef: 'هندسه + کسورات مبنای طراحی',
      status: 'calculated',
      equation: 'V_net = (A − Σ footprint) × (h − freeboard − rainfall) − displacement',
      substitution: `ناخالص ${cap.grossVolumeM3.toFixed(1)} m³ − کسورات ${cap.totalDeductionsM3.toFixed(1)} m³`,
      result: `${cap.netUsableVolumeM3.toFixed(1)} m³ مفید`,
      notes: [cap.note, ...cap.deductions.map(d => `${d.label}: ${d.volumeM3.toFixed(2)} m³ (${d.source})`)],
    })
  }
  return {
    id: 'bundwall',
    title: 'ج) باندوال / حفاظت ثانویه',
    status: req?.status === 'blocked' ? 'blocked' : 'requires_engineering_review',
    equations,
    notes: ['این قاعده الزام سراسری NFPA نیست؛ باید با آیین‌نامه محلی، مشخصات پروژه و نظر مرجع آتش‌نشانی مستند شود.'],
  }
}

export function basisAsTable(basis: DesignBasis): { columns: string[]; rows: ReportTableRow[] } {
  return {
    columns: ['پارامتر', 'مقدار', 'واحد', 'منبع', 'مرجع', 'وضعیت تأیید'],
    rows: Object.values(basis.entries).map((e: BasisEntry<unknown>) => ({
      label: e.parameter,
      value: String(e.value ?? '—'),
      unit: e.unit ?? '',
      source: SOURCE_LABELS[e.source],
      status: `${STATUS_LABELS[e.status]} — ${e.reference}`,
    })),
  }
}
