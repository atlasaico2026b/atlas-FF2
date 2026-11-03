// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// VALIDATION
//
// Every message says what is wrong, which input it concerns, where the
// requirement came from, and what to do about it. A warning is never a silent
// log line: it travels into the on-screen output and the printed report.
//
// Blocking errors mean the design cannot be presented as verified. They do not
// stop the numbers being computed — an engineer still needs to see the
// arithmetic — but they do stop it being called compliant.
// ═══════════════════════════════════════════════════════════════════

import { isAbsent, needsReview, reviewSummary, STATUS_LABELS, type DesignBasis, type ResultStatus } from './provenance'
import { CalcInputError } from './units'
import type { WaterSprayDesign } from './nfpa15'
import type { FoamDesign } from './nfpa11'
import type { PumpDutyCheck } from './nfpa20'
import type { FireWaterDemand } from './demand'
import type { BundwallRequirement } from './bundwall'

export type IssueSeverity = 'blocking' | 'warning' | 'info'

export interface ValidationIssue {
  id: string
  severity: IssueSeverity
  /** Short statement of the problem. */
  title: string
  /** What happened and why it matters. */
  detail: string
  /** The specific input the issue concerns. */
  affectedInput: string
  /** Where the applicable requirement/value came from. */
  source: string
  /** What to do about it. */
  correctiveAction: string
  standardRef?: string
}

export interface ValidationResult {
  blockers: ValidationIssue[]
  warnings: ValidationIssue[]
  infos: ValidationIssue[]
  /** True only when there are no blocking errors. */
  ok: boolean
  /** A sentence that is true about this design — never "compliant". */
  statement: string
}

export interface ValidationInput {
  basis: DesignBasis
  spray?: WaterSprayDesign
  foam?: FoamDesign
  pumpDuty?: PumpDutyCheck | null
  pumpRated?: { flowLpm: number; headM: number } | null
  hydraulics?: { frictionFromNetwork: boolean; cUsed: number; cBasisKey: string } | null
  bundwall?: BundwallRequirement
  demand?: FireWaterDemand
  /** Extra geometry guards (tank diameters etc.) already captured as issues. */
  extra?: ValidationIssue[]
}

const issue = (
  id: string,
  severity: IssueSeverity,
  title: string,
  detail: string,
  affectedInput: string,
  source: string,
  correctiveAction: string,
  standardRef?: string,
): ValidationIssue => ({ id, severity, title, detail, affectedInput, source, correctiveAction, standardRef })

export function validateDesign(input: ValidationInput): ValidationResult {
  // Issues are collected in one place and partitioned by their own severity, so a
  // "blocking" item can never end up sitting in the warnings list — which is what
  // made the counts on screen disagree with the severities.
  const collected: ValidationIssue[] = []
  const add = (i: ValidationIssue) => { collected.push(i); return i }
  const { basis } = input

  // ─── Standard editions ───
  const unresolved = basis.adoptedStandards.filter(s => s.edition === null)
  if (unresolved.length) {
    add(issue(
      'std-edition-unresolved',
      'blocking',
      'نسخه استاندارد مصوب ثبت نشده است / Standard edition applicability is unresolved',
      `برای ${unresolved.map(s => s.standard).join('، ')} نسخه مصوب ثبت نشده است. تا زمانی که نسخه مشخص نشود، تعلق هیچ بند و جدولی به این طرح قابل تأیید نیست.`,
      'adoptedStandards',
      'پروژه — نسخه‌ای ثبت نشده است',
      'نسخه مصوب هر استاندارد (و منبع آن: مشخصات پروژه، قرارداد، یا ابلاغ کارفرما) را در پایه طراحی ثبت کنید.',
      unresolved.map(s => s.standard).join(', '),
    ))
  }

  // ─── Basis entries needing review ───
  const summary = reviewSummary(basis)
  const unverifiedEntries = Object.values(basis.entries).filter(needsReview)
  if (unverifiedEntries.length) {
    add(issue(
      'basis-unverified-entries',
      'warning',
      `${unverifiedEntries.length} پارامتر پایه طراحی تأییدنشده است / Basis parameters require review`,
      unverifiedEntries
        .map(e => `«${e.parameter}» = ${String(e.value)}${e.unit ? ' ' + e.unit : ''} (${STATUS_LABELS[e.status]}) — ${e.reference}`)
        .join('\n'),
      Object.keys(basis.entries).filter(k => needsReview(basis.entries[k])).join(', '),
      'پایه طراحی',
      'هر پارامتر را با منبع تأییدشده (متن نسخه مصوب، مشخصات پروژه، یا داده سازنده) جایگزین یا تأیید کنید.',
    ))
  }
  const absentRequired = Object.values(basis.entries).filter(e => isAbsent(e) && e.status === 'manufacturer_specific')
  for (const e of absentRequired) {
    add(issue(
      `basis-absent-${e.key}`,
      'blocking',
      `پارامتر الزامی وارد نشده است: ${e.parameter}`,
      `مقدار این پارامتر خالی است و بدون آن نتیجه کامل نیست.`,
      e.key,
      e.reference,
      e.note || 'مقدار را از داده تأییدشده وارد کنید.',
    ))
  }

  // ─── What the calculation actually ran on ───
  // The pre-filled standard values are reported as information, with the clause
  // each one is attributed to — not as a list of things to type in.
  const standardDefaults = Object.values(basis.entries).filter(e => e.status === 'standard_default')
  if (standardDefaults.length) {
    add(issue(
      'basis-standard-defaults',
      'info',
      `${standardDefaults.length} مقدار استاندارد به‌صورت پیش‌فرض در محاسبات اعمال شده است`,
      standardDefaults.map(e => `«${e.parameter}» = ${String(e.value)}${e.unit ? ' ' + e.unit : ''} — ${e.reference}`).join('\n'),
      'basis.standardDefaults',
      'NFPA 15:2022 / NFPA 11',
      'مقداری برای ورود لازم نیست. تنها کاری که باقی می‌ماند تأیید تعلق بند به کلاس تجهیز و سناریوی حریق این پروژه است.',
    ))
  }
  const presets = Object.values(basis.entries).filter(e => e.status === 'preset_default')
  if (presets.length) {
    add(issue(
      'basis-presets',
      'info',
      `${presets.length} پیش‌فرض آماده در محاسبات استفاده شده است`,
      presets.map(e => `«${e.parameter}» = ${String(e.value)}${e.unit ? ' ' + e.unit : ''} — ${e.reference}`).join('\n'),
      'basis.presets',
      'پیش‌فرض‌های برنامه',
      'این مقادیر قابل استفاده‌اند و ورودی دستی لازم ندارند. اگر مبنای طراحی پروژه مقدار دیگری تعیین کرده، همان را وارد کنید.',
    ))
  }

  // ─── NFPA 15 — water spray ───
  if (input.spray) {
    const s = input.spray
    if (s.rate.belowAvailableRequirement) {
      add(issue(
        'spray-rate-below-requirement',
        'blocking',
        'میزان آب‌پاشی از مقدار بند مربوط کمتر است / Cooling rate is below the requirement available for this application',
        `میزان مؤثر ${s.rate.effectiveRateLpmM2} L/min/m² است در حالی که بند موجود ${s.rate.requiredRateLpmM2} L/min/m² را ذکر می‌کند.`,
        'nfpa15.rate.governing',
        s.rate.requiredReference,
        `یا مبنا را روی «الزام» بگذارید، یا با تحلیل مهندسی مستند (سناریوی حریق، کلاس تجهیز، الزام AHJ) مقدار کمتر را توجیه و ثبت کنید.`,
        s.rate.requiredReference,
      ))
    }
    if (s.rate.applicabilityUnconfirmed) {
      add(issue(
        'spray-rate-applicability',
        'warning',
        'تعلق بند میزان آب‌پاشی به این تجهیز تأیید نشده است',
        `کلاس تجهیز: ${s.classification.equipmentClass}. ${s.classification.reason}`,
        'nfpa15.rate.required',
        s.rate.requiredReference,
        'کلاس تجهیز و سناریوی حریق را مستند کنید و تعلق بند را با نسخه مصوب تطبیق دهید. بندهای ظرف تحت فشار به مخزن اتمسفریک اعمال نشود.',
      ))
    }
    add(issue(
      'spray-spacing-manufacturer',
      'blocking',
      'فاصله افقی نازل با داده الگوی پاشش سازنده اعتبارسنجی نشده است / Horizontal spacing not validated against manufacturer spray-pattern data',
      `فاصله ${s.spacing.horizontalSpacingM} m مقدار ${s.spacing.horizontalReference} است و فاصله مجاز واقعی باید از عرض پاشش سازنده در فشار کارکرد، جهت‌گیری و فاصله نازل تا سطح استخراج شود.`,
      'nfpa15.spacing.horizontal',
      s.spacing.horizontalReference,
      'نمودار پاشش سازنده را وارد کنید یا فاصله را با تحلیل مهندسی مستند توجیه کنید.',
      s.spacing.horizontalReference,
    ))
    if (s.layout.exceededRundownLimit) {
      add(issue(
        'spray-rundown-exceeded',
        'blocking',
        'فاصله عمودی از حد مجاز بیشتر است / Vertical spacing exceeds the applicable maximum',
        `حداکثر فاصله عمودی نصب‌شده ${s.layout.layout.maxGapM.toFixed(2)} m و حد مجاز ${s.layout.rundownLimitM} m است.`,
        'nfpa15.spacing.vertical',
        s.spacing.rundownReference,
        'تعداد رینگ‌ها را افزایش دهید یا اتکا به سرریز را با تحلیل مهندسی جایگزین کنید.',
        s.spacing.rundownReference,
      ))
    }
    add(issue(
      'spray-coverage-unverified',
      'blocking',
      'پوشش سطح حفاظت‌شده کامل/تأییدشده نیست / Protected surface coverage is incomplete or unverified',
      `${s.layout.totalNozzles} نازل روی ${s.layout.rings.length} رینگ چیده شده است. چیدمان هندسی به‌تنهایی پوشش مؤثر را اثبات نمی‌کند.`,
      'nfpa15.coverage',
      'هندسه چیدمان',
      'پوشش کامل سطح (شامل موانع و نواحی سایه) را بر اساس داده سازنده و هندسه واقعی نصب تأیید کنید.',
    ))

    // The demand side and the layout side can disagree. With the standard rate
    // governing it usually needs more nozzles than even spacing provides, and that
    // must be surfaced rather than silently averaged away.
    if (s.demandBasedCount && s.demandBasedCount.count > s.layout.totalNozzles) {
      add(issue(
        'spray-nozzle-count-shortfall',
        'blocking',
        'تعداد نازل چیده‌شده از تعداد لازم بر اساس دبی کمتر است / Nozzle layout does not meet the demand',
        `با دبی ${s.nozzleFlow ? s.nozzleFlow.flowLpm.toFixed(1) : '—'} L/min برای هر نازل، برای تأمین ${s.demand.demandLpm.toFixed(0)} L/min به ${s.demandBasedCount.count} نازل نیاز است، در حالی که چیدمان فعلی ${s.layout.totalNozzles} نازل روی ${s.layout.rings.length} رینگ دارد.`,
        'nfpa15.nozzle.count',
        s.rate.governing === 'required' ? s.rate.requiredReference : s.rate.projectReference,
        'تعداد نازل یا فاصله‌ها را افزایش دهید، فشار کارکرد را با داده سازنده بالا ببرید، یا مبنای طراحی را بازنگری کنید — تا تعداد نازل با دبی طراحی و پوشش سطح هم‌خوان شود.',
      ))
    }
    for (const check of s.checks.filter(c => c.status === 'blocked')) {
      add(issue(
        `spray-check-${check.id}`,
        check.id === 'rundown' ? 'blocking' : 'warning',
        `بررسی باز: ${check.label}`,
        `${check.detail} — برای بستن این مورد لازم است: ${check.requires}`,
        check.id,
        check.reference,
        check.requires,
      ))
    }
    if (s.demand.surfaces.excluded.length) {
      for (const n of s.demand.surfaces.excluded) add(issue(`spray-excluded-${n.name}`, 'info', `سطح خارج‌شده: ${n.name}`, n.reason, 'protectedSurfaces', 'مبنای طراحی', 'در صورت نیاز مبنای طراحی را به‌روز کنید.'))
    }
  }

  // ─── NFPA 11 — foam ───
  if (input.foam) {
    const f = input.foam
    if (f.rate.status !== 'verified') {
      add(issue(
        'foam-rate-unverified',
        'warning',
        'نرخ و مدت اعمال فوم از منبع تأییدشده نیامده است',
        `نرخ ${f.rate.rateLpmM2} L/min/m² و مدت ${f.rate.durationMin} دقیقه از «${f.rate.rateReference}» خوانده شده است.`,
        f.rate.rateKey,
        f.rate.rateReference,
        'نرخ و مدت را با جدول نسخه مصوب NFPA 11 برای سوخت، نوع کنسانتره و روش اعمال تطبیق دهید.',
      ))
    }
    if (f.chambers?.extrapolated) {
      add(issue(
        'foam-chambers-extrapolated',
        'warning',
        'تعداد چمبر فوم خارج از بازه جدول منتشرشده است',
        `${f.chambers.rule} — این نتیجه برون‌یابی است، نه یک ردیف جدول.`,
        'foam chamber count',
        'جدول E-3 (نسخه ثبت‌نشده)',
        'برای قطر خارج از جدول، تصمیم مهندسی مستند و تأیید مرجع لازم است.',
      ))
    }
    if (f.handHose?.extrapolated) {
      add(issue('foam-hose-extrapolated', 'warning', 'ردیف جدول E-5 برای این قطر در بازه منتشرشده نیست', f.handHose.rule, 'hand hose lines', 'جدول E-5 (نسخه ثبت‌نشده)', 'ردیف جدول را با نسخه مصوب تأیید کنید.'))
    }
    if (f.dam && f.dam.status !== 'verified') {
      add(issue(
        'foam-dam-rule-unverified',
        'warning',
        'قاعده ارتفاع فوم‌دمپ به بند استاندارد نسبت داده نمی‌شود',
        f.dam.note,
        'nfpa11.dam.height',
        f.dam.reference,
        'در صورت اتکا به یک الزام، بند و نسخه آن را تأیید و مستند کنید؛ در غیر این صورت آن را به‌عنوان رویه پروژه علامت بزنید.',
      ))
    }
  }

  // ─── NFPA 20 — pump ───
  if (input.pumpDuty !== undefined) {
    if (!input.pumpDuty || input.pumpDuty.status === 'manufacturer_specific') {
      add(issue(
        'pump-curve-missing',
        'blocking',
        'دوره کاری پمپ با منحنی گواهی‌شده بررسی نشده است / Pump duty has not been checked against the certified pump curve',
        input.pumpDuty?.reason || 'منحنی تأییدشده پمپ در دسترس نیست. TDH و توان محاسبه‌شده به‌تنهایی دلیل کفایت پمپ نیستند.',
        'pump.curve',
        'داده سازنده پمپ — در دسترس نیست',
        'منحنی گواهی‌شده پمپ (و داده درایور، کنترلر و شرایط مکش) را وارد و نقطه تقاضا را روی منحنی بررسی کنید.',
      ))
    } else if (input.pumpDuty && input.pumpDuty.covered === false) {
      add(issue(
        'pump-head-insufficient',
        'blocking',
        'هد پمپ در دبی تقاضا کافی نیست',
        `کمبود هد: ${input.pumpDuty.headMarginM?.toFixed(2)} m (هد موجود ${input.pumpDuty.availableHeadM?.toFixed(2)} m).`,
        'pump.duty',
        'منحنی سازنده',
        'پمپ بزرگ‌تر، کاهش افت شبکه، یا بازنگری نقطه کنترل.',
      ))
    }
  }
  if (input.pumpRated) {
    add(issue(
      'pump-most-restrictive',
      'info',
      'ظرفیت نامی پمپ باید با دبی تقاضا مقایسه شود',
      'دبی تقاضای سیستم و ظرفیت نامی پمپ دو عدد متفاوت‌اند و هر دو باید در گزارش بیایند؛ کفایت با منحنی گواهی‌شده تأیید می‌شود.',
      'pump.rated',
      'NFPA 20 — نسخه ثبت‌نشده',
      'نقطه تقاضا و نقطه نامی را روی منحنی تأییدشده بررسی کنید.',
    ))
  }

  // ─── Hydraulics ───
  if (input.hydraulics && !input.hydraulics.frictionFromNetwork) {
    add(issue(
      'hydraulics-allowance-not-calculation',
      'blocking',
      'افت شبکه با محاسبه هیدرولیک به دست نیامده است',
      'TDH در این طرح از یک افت اصطکاک برآوردی (مقدار ثابت) استفاده می‌کند، نه از محاسبه هیزن-ویلیامز روی شبکه واقعی. تلفات جزئی و اتصالات نیز در آن لحاظ نشده است.',
      'nfpa20.frictionLoss.allowance',
      'موتور قبلی — مقدار ثابت بدون محاسبه',
      'شبکه لوله را با قطر و طول واقعی هر بازه محاسبه کنید و در صورت نیاز افت‌های جزئی را با روش ضریب K اضافه کنید.',
    ))
    add(issue(
      'hydraulics-c-assumption',
      'warning',
      `ضریب C هیزن-ویلیامز (${input.hydraulics.cUsed}) یک فرض است`,
      `ضریب C از «${input.hydraulics.cBasisKey}» خوانده شده و باید با جنس و شرایط واقعی لوله تطبیق داده شود.`,
      'hydraulics.hazenWilliams.c',
      'فرض مهندسی',
      'ضریب C را بر اساس جنس و وضعیت لوله تأیید و ثبت کنید.',
    ))
  }

  // ─── Bundwall ───
  if (input.bundwall) {
    if (input.bundwall.verification !== 'verified') {
      add(issue(
        'bundwall-rule-unverified',
        'blocking',
        'قاعده ظرفیت باندوال منبع تأییدشده مقرراتی/پروژه‌ای ندارد / Bundwall criterion has no verified regulatory or project source',
        `${input.bundwall.governingExpression} — منبع فعلی: «${input.bundwall.source}». این قاعده الزام سراسری NFPA نیست.`,
        'bundwall.rule',
        input.bundwall.source,
        'آیین‌نامه محلی، مشخصات پروژه و نظر مرجع آتش‌نشانی را مستند کنید و قاعده حاکم را تأیید نمایید.',
      ))
    }
    add(issue(
      'bundwall-gross-vs-net',
      'info',
      'تعریف ظرفیت باندوال باید تعیین شود',
      'حجم ناخالص هندسی و حجم مفید (پس از کسر تصرف مخازن، ارتفاع آزاد، بارش و جابه‌جایی سازه) هر دو گزارش می‌شوند. اینکه معیار پذیرش کدام است باید در مبنای طراحی تعیین شود.',
      'bundwall.capacity', 'مبنای طراحی', 'تعریف ناخالص/مفید را در مبنای طراحی ثبت کنید.',
    ))
  }

  // ─── Demand ───
  if (input.demand) {
    const legacyOutlets = input.demand.rows.filter(r => r.status !== 'verified')
    if (legacyOutlets.length) {
      add(issue(
        'demand-outlet-sources',
        'warning',
        `${legacyOutlets.length} دبی خروجی منبع تأییدشده ندارد`,
        legacyOutlets.map(r => `${r.location} (${r.kind}): ${r.flowPerOutletLpm.toFixed(0)} L/min × ${r.outletCount} — منبع: ${r.reference}`).join('\n'),
        'demand.outlets',
        'مشخصات پروژه / داده تجهیز',
        'دبی هر خروجی را با مشخصات تأییدشده پروژه، استاندارد مصوب یا داده تجهیز تطبیق دهید.',
      ))
    }
    add(issue(
      'demand-controlling-node',
      'info',
      'نقطه کنترل باید از نتایج هیدرولیک تعیین شود',
      `کاندیدهای فعلی: ${input.demand.controllingCandidates.map(c => c.location).join('، ') || '—'}`,
      'demand.controllingNode',
      'محاسبه هیدرولیک شبکه',
      'شبکه را در شرایط دبی طراحی حل کنید و نقطه کنترل واقعی را تعیین نمایید.',
    ))
  }

  for (const e of input.extra ?? []) collected.push(e)

  const blockers = collected.filter(i => i.severity === 'blocking')
  const warnings = collected.filter(i => i.severity === 'warning')
  const infos = collected.filter(i => i.severity === 'info')

  const ok = blockers.length === 0
  return {
    blockers,
    warnings,
    infos,
    ok,
    statement: ok
      ? 'همه ورودی‌های الزامی حاضرند و هیچ خطای بازدارنده‌ای ثبت نشده است. با این حال این خروجی «تأییدشده» یا «منطبق با استاندارد» نیست مگر آنکه موارد نیازمند بازبینی بسته شوند.'
      : `${blockers.length} خطای بازدارنده و ${warnings.length} هشدار باز است. این طرح «تأییدشده» یا «منطبق با استاندارد» نیست و تا بسته شدن موارد باز نباید چنین معرفی شود.`,
  }
}

/** Turn a thrown input error into a user-facing blocking issue. */
export function issueFromInputError(err: unknown, field: string, source = 'ورودی کاربر', correctiveAction = 'مقدار را بررسی و اصلاح کنید.'): ValidationIssue | null {
  if (err instanceof CalcInputError) {
    return issue(
      `input-${err.code}-${err.field}`,
      'blocking',
      'ورودی نامعتبر یا ناموجود',
      err.message,
      field,
      source,
      correctiveAction,
    )
  }
  return null
}

/** Run a calculation, converting a rejected input into an issue instead of a crash. */
export function guard<T>(field: string, fn: () => T): { value: T | null; issue: ValidationIssue | null } {
  try {
    return { value: fn(), issue: null }
  } catch (err) {
    return { value: null, issue: issueFromInputError(err, field) }
  }
}

export function overallStatus(result: ValidationResult): ResultStatus {
  if (result.blockers.length) return 'requires_engineering_review'
  return 'calculated'
}
