// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// DEFAULT DESIGN BASIS
//
// Every parameter the engine reads lives here with its provenance. The
// values that came out of the previous engine are preserved exactly (so no
// existing design changes underneath the user) but they are labelled
// `unverified_legacy` and cited as having no traceable source — because they
// do not have one. Values the client brief supplies with a clause reference
// are carried as `requires_engineering_review`: the value is known, the
// applicability to a specific equipment class still has to be confirmed
// against the adopted edition.
// ═══════════════════════════════════════════════════════════════════

import type { BasisEntry, DesignBasis } from './provenance'
import { BASIS_VERSION, DESIGN_BASIS_SCHEMA_VERSION, defaultAdoptedStandards } from './provenance'
import { U } from './units'
// The values live in one frozen module. Nothing here invents a number; this
// table only attaches the documentation the report needs to each one.
import { BUNDWALL, DEMAND, FLUID, HYDRAULICS, NFPA11, NFPA15, NFPA20 } from './constants'

export const K = {
  // NFPA 15 — water spray
  sprayRequiredRate: 'nfpa15.rate.required',
  sprayProjectRate: 'nfpa15.rate.project',
  sprayRateGoverns: 'nfpa15.rate.governing',
  sprayHorizontalSpacing: 'nfpa15.spacing.horizontal',
  sprayVerticalSpacing: 'nfpa15.spacing.vertical',
  sprayRundownMax: 'nfpa15.spacing.rundownMax',
  sprayOverlapFraction: 'nfpa15.spacing.overlapFraction',
  sprayNozzleK: 'nfpa15.nozzle.kFactor',
  sprayNozzlePressure: 'nfpa15.nozzle.pressure',
  // NFPA 11 — foam
  foamConcentratePercent: 'nfpa11.concentratePercent',
  foamChamberRate: 'nfpa11.rate.chamber',
  foamMonitorHoseRate: 'nfpa11.rate.monitorHose',
  foamChamberDurationGroupA: 'nfpa11.duration.chamber.groupA',
  foamChamberDurationGroupB: 'nfpa11.duration.chamber.groupB',
  foamMonitorDurationGroupA: 'nfpa11.duration.monitor.groupA',
  foamMonitorDurationGroupB: 'nfpa11.duration.monitor.groupB',
  foamDamHeight: 'nfpa11.dam.height',
  /** DAM-001 — elevation of the secondary seal above the seal-to-roof connection, mm. */
  damSecondarySealHeight: 'nfpa11.dam.secondarySealHeightMm',
  /** DAM-001 — elevation of the burn-out panels above the seal-to-roof connection, mm. */
  damBurnoutPanelHeight: 'nfpa11.dam.burnoutPanelHeightMm',
  foamHandHoseFlow: 'nfpa11.handHose.flowPerLine',
  foamTableEdition: 'nfpa11.tableEdition',
  // NFPA 20 — pump
  pumpMonitorResidual: 'nfpa20.residualPressure.monitor',
  pumpHydrantResidual: 'nfpa20.residualPressure.hydrant',
  pumpEfficiency: 'nfpa20.efficiency',
  pumpStaticLift: 'nfpa20.staticLift',
  pumpFrictionAllowance: 'nfpa20.frictionLoss.allowance',
  pumpSafetyFactor: 'nfpa20.safetyFactor',
  // Hydraulics
  hwCoefficient: 'hydraulics.hazenWilliams.c',
  hwMaxVelocity: 'hydraulics.maxVelocity',
  // Demand
  hydrantOutletFlow: 'demand.hydrantOutlet.flow',
  monitorOutletFlow: 'demand.monitorOutlet.flow',
  demandLossAllowance: 'demand.allowance',
  // Bundwall
  bundwallRule: 'bundwall.rule',
  bundwallFreeboard: 'bundwall.freeboard',
  bundwallRainfallAllowance: 'bundwall.rainfallAllowance',
  bundwallDisplacement: 'bundwall.displacement',
} as const

const legacy = (key: string, parameter: string, value: number, unit: string, reference: string, applicability: string, note: string): BasisEntry<number> => ({
  key, parameter, value, unit, source: 'legacy_value', reference, applicability,
  // pre-filled and selectable, so it is not an action item — but `source` and
  // `reference` still disclose that it has no traceable standard basis.
  status: 'preset_default', note,
})

/**
 * A pre-filled working default.
 *
 * The calculation runs on this value without anyone typing it in. The source and
 * reference still disclose exactly where the number came from, so the report can
 * be audited — but it is not an action item for the engineer.
 */
const preset = (key: string, parameter: string, value: number, unit: string, reference: string, applicability: string, note?: string): BasisEntry<number> => ({
  key, parameter, value, unit, source: 'legacy_value', reference, applicability,
  status: 'preset_default', note,
})

/** A value only the project can supply. It has no default and no formula invents one. */
const projectInput = <V,>(key: string, parameter: string, value: V, unit: string, reference: string, applicability: string, note?: string): BasisEntry<V> => ({
  key, parameter, value, unit, source: 'project_default', reference, applicability,
  status: 'requires_engineering_review', note, projectSupplied: true,
})

/** A pre-filled value taken from the standard, ready to use. */
const fromStandard = (key: string, parameter: string, value: number, unit: string, reference: string, applicability: string, note?: string): BasisEntry<number> => ({
  key, parameter, value, unit, source: 'normative', reference, applicability,
  status: 'standard_default', note,
})

export function defaultBasis(): DesignBasis {
  const entries: Record<string, BasisEntry> = {}

  const add = <V>(e: BasisEntry<V>) => { entries[e.key] = e as unknown as BasisEntry }

  // ─── NFPA 15 — fixed water spray for vessel/tank cooling ───
  // Every value here is read from constants.ts. None of them is an input.
  add<number>(fromStandard(
    K.sprayRequiredRate,
    'میزان آب‌پاشی (ثابت موتور)',
    NFPA15.waterSprayRateLminM2,
    U.applicationRate.LminM2.symbol,
    '§3.10 سند موتور مشخصات (T3.10) — «Net water spray rate on exposed vessel surface» = 4.1 L/min/m²',
    'حفاظت تجهیز در معرض حریق — برای مخزن اتمسفریک عمودی، ظرف افقی و کروی؛ نوع سطح حفاظت‌شده باید در گزارش مشخص باشد',
    'ثابت موتور است (constants.ts → NFPA15.waterSprayRateLminM2) و از هیچ صفحه‌ای ویرایش نمی‌شود. تنها نکته باز، تعلق بند به کلاس تجهیز است که در گزارش هشدار داده می‌شود.',
  ))
  add<number>(legacy(
    K.sprayProjectRate,
    'میزان آب‌پاشی جایگزین (مقدار بازنشسته موتور قبلی)',
    2.0,
    U.applicationRate.LminM2.symbol,
    'موتور قبلی: مقدار ثابت داخل calcCoolingWaterRate (بدون منبع استنادی)',
    'فقط اگر مبنای طراحی مصوب پروژه صریحاً مقدار دیگری تعیین کرده باشد',
    'این عدد در نسخه قبلی به‌اجبار حاکم بود. اکنون فقط با تغییر صریح سوئیچ در کد قابل انتخاب است، نه از روی هیچ صفحه‌ای، و به‌عنوان الزام استاندارد قابل استناد نیست.',
  ))
  add<string>({
    key: K.sprayRateGoverns,
    parameter: 'مبنای حاکم برای میزان آب‌پاشی',
    value: 'required',
    source: 'normative',
    reference: '§3.10 سند موتور مشخصات (T3.10)',
    applicability: 'مقدار استاندارد حاکم است',
    status: 'standard_default',
    note: 'required = مقدار ثابت استاندارد. project = مقدار بازنشسته 2.0 L/min/m² — فقط با مصوبه مبنای طراحی و تغییر کد.',
  })
  add<number>(preset(
    K.sprayHorizontalSpacing,
    'فاصله افقی نازل‌ها روی رینگ (S)',
    NFPA15.horizontalSpacingM,
    U.length.m.symbol,
    'ثابت موتور (الزام سراسری NFPA نیست)',
    'برای چیدمان مقدماتی؛ فاصله نهایی از داده الگوی پاشش سازنده تعیین می‌شود',
    'ثابت موتور؛ جای داده پوشش سازنده را نمی‌گیرد.',
  ))
  add<number>(preset(
    K.sprayVerticalSpacing,
    'فاصله عمودی رینگ‌ها (V)',
    NFPA15.verticalSpacingM,
    U.length.m.symbol,
    'ثابت موتور — در محدوده مجاز 3.7 m بند rundown',
    'برای چیدمان مقدماتی',
    'ثابت موتور و از حد مجاز استاندارد (3.7 m) کمتر است.',
  ))
  add<number>(fromStandard(
    K.sprayRundownMax,
    'حداکثر فاصله عمودی مجاز در حالت اتکا به سرریز (rundown)',
    NFPA15.rundownMaxSpacingM,
    U.length.m.symbol,
    'NFPA 15:2022 §7.4.2.2 — 12 ft ≈ 3.658 m',
    'فقط زمانی که پوشش از طریق سرریز آب روی سطح تأمین شود',
    'حد مجاز ثابت؛ فاصله عمودی نصب‌شده به‌صورت خودکار با آن مقایسه می‌شود.',
  ))
  add<number>({
    key: K.sprayOverlapFraction,
    parameter: 'کسر هم‌پوشانی برای برآورد مقدماتی فاصله افقی',
    value: 0,
    source: 'engineering_assumption',
    reference: 'برآورد هندسی مقدماتی',
    applicability: 'فقط برای برآورد عرض پاشش آرمانی',
    status: 'preset_default',
    note: 'هیچ درصد هم‌پوشانی الزامی اختراع نشده است؛ این عدد صرفاً برای برآورد مقدماتی است.',
  })
  // Nozzle data is the one genuinely device-specific pair. The fixed values keep
  // the demand-based nozzle count computable; the report flags that they must be
  // replaced with the selected nozzle's datasheet figures.
  add<number>({
    key: K.sprayNozzleK,
    parameter: 'ضریب K نازل (ثابت موتور — با کاتالوگ سازنده جایگزین شود)',
    value: NFPA15.nozzleK,
    unit: 'L/min/bar^0.5',
    source: 'engineering_assumption',
    reference: 'ثابت موتور — الزام استاندارد نیست و باید با کاتالوگ سازنده جایگزین شود',
    applicability: 'برای محاسبه تعداد نازل از روی دبی؛ با داده واقعی سازنده جایگزین شود',
    status: 'preset_default',
    note: 'این عدد یک مقدار مرجع برای اجرای محاسبه است، نه داده منتشرشده هیچ سازنده‌ای.',
  })
  add<number>({
    key: K.sprayNozzlePressure,
    parameter: 'فشار کارکرد نازل (ثابت موتور — با کاتالوگ سازنده جایگزین شود)',
    value: NFPA15.nozzlePressureBar,
    unit: U.pressure.bar.symbol,
    source: 'engineering_assumption',
    reference: 'ثابت موتور — باید با داده سازنده جایگزین شود',
    applicability: 'برای محاسبه دبی نازل Q_n = K√P',
    status: 'preset_default',
    note: 'مقدار مرجع، نه داده سازنده.',
  })

  // ─── NFPA 11 — foam ───
  add<number>({
    key: K.foamConcentratePercent,
    parameter: 'درصد محلول‌ساز فوم (ثابت موتور)',
    value: NFPA11.concentratePercent,
    unit: U.ratio.pct.symbol,
    source: 'project_default',
    reference: 'ثابت موتور — با نوع کنسانتره سازنده تأیید شود',
    applicability: 'وابسته به نوع کنسانتره و تأیید سازنده',
    status: 'preset_default',
    note: 'گزینه‌های متعارف ۱٪ / ۳٪ / ۶٪ — مقدار ثابت باید با کنسانتره انتخاب‌شده هم‌خوان باشد.',
  })
  add(preset(K.foamChamberRate, 'نرخ اعمال فوم — چمبر فوم', NFPA11.chamberRateLminM2, U.applicationRate.LminM2.symbol,
    'ثابت موتور (منبع بدون شماره نسخه)',
    'سطوح سقف ثابت با حفاظت اولیه چمبر فوم',
    'بدون شماره نسخه/جدول. باید با جدول نسخه مصوب تطبیق داده شود.'))
  add(preset(K.foamMonitorHoseRate, 'نرخ اعمال فوم — مانیتور/شیلنگ دستی', NFPA11.monitorHoseRateLminM2, U.applicationRate.LminM2.symbol,
    'ثابت موتور (منبع بدون شماره نسخه)',
    'سهول حفاظت اولیه با مانیتور یا شیلنگ دستی',
    'بدون شماره نسخه/جدول.'))
  add(preset(K.foamChamberDurationGroupA, 'مدت تخلیه فوم — چمبر / گروه A (نقطه اشتعال ۳۸–۹۳°C)', NFPA11.chamberDurationGroupAMin, U.time.min.symbol, 'ثابت موتور', 'گروه A', 'بدون شماره نسخه.'))
  add(preset(K.foamChamberDurationGroupB, 'مدت تخلیه فوم — چمبر / گروه B (نقطه اشتعال <۳۸°C)', NFPA11.chamberDurationGroupBMin, U.time.min.symbol, 'ثابت موتور', 'گروه B', 'بدون شماره نسخه.'))
  add(preset(K.foamMonitorDurationGroupA, 'مدت تخلیه فوم — مانیتور/شیلنگ / گروه A', NFPA11.monitorDurationGroupAMin, U.time.min.symbol, 'ثابت موتور', 'گروه A', 'بدون شماره نسخه.'))
  add(preset(K.foamMonitorDurationGroupB, 'مدت تخلیه فوم — مانیتور/شیلنگ / گروه B', NFPA11.monitorDurationGroupBMin, U.time.min.symbol, 'ثابت موتور', 'گروه B', 'بدون شماره نسخه.'))
  add<number>(preset(
    K.foamDamHeight,
    'حداقل ارتفاع فوم‌دمپ',
    NFPA11.damHeightMm,
    U.length.mm.symbol,
    '§3.6 (T3.6) — «≥300 mm از اتصال سیل به سقف» · DAM-001',
    'مخازن سقف شناور — حداقل؛ DAM-001 آن را با ارتفاع سیل ثانویه و پنل سوختگی بالا می‌برد',
    'پله‌های ۳۰۰/۴۵۰/۶۰۰ mm بر اساس قطر بازنشسته شدند: مبنایی نداشتند. سند مشخصات فرمول صریح DAM-001 را می‌دهد.',
  ))
  add<number | null>(projectInput(
    K.damSecondarySealHeight,
    'ارتفاع سیل ثانویه از اتصال سیل به سقف',
    null,
    U.length.mm.symbol,
    '§3.6 (T3.6) · DAM-001',
    'مخازن سقف شناور — جمله دوم DAM-001',
    'بدون این مقدار، DAM-001 روی حداقل §3.6 (۳۰۰ mm) می‌ماند. با ثبت آن، ارتفاع دام به H_secondary + ۵۰ می‌رسد.',
  ))
  add<number | null>(projectInput(
    K.damBurnoutPanelHeight,
    'ارتفاع پنل‌های سوختگی از اتصال سیل به سقف',
    null,
    U.length.mm.symbol,
    '§3.6 (T3.6) · DAM-001',
    'مخازن سقف شناور دارای پنل سوختگی — جمله سوم DAM-001',
    'بدون این مقدار، DAM-001 روی حداقل §3.6 (۳۰۰ mm) می‌ماند. با ثبت آن، ارتفاع دام به H_burnout + ۵۰ می‌رسد.',
  ))
  add(preset(K.foamHandHoseFlow, 'دبی هر خط شیلنگ دستی فوم', NFPA11.handHoseFlowLpm, U.flow.Lmin.symbol,
    'ثابت موتور (معادل 50 gpm)', 'فوم خارجی مکمل', 'بدون شماره نسخه/جدول.'))
  add<string>({
    key: K.foamTableEdition,
    parameter: 'نسخه جدول‌های NFPA 11 (E-3 / E-4 / E-5)',
    value: NFPA11.tableEdition,
    source: 'normative',
    reference: 'NFPA 11 (ویرایش ۲۰۲۱) — ثابت موتور',
    applicability: 'تعیین می‌کند جدول‌های جست‌وجو به کدام نسخه نسبت داده شوند',
    status: 'preset_default',
    note: 'ثابت موتور است تا جست‌وجوی جدول بدون ورود دستی کار کند. اگر پروژه نسخه دیگری را مصوب کرده، تغییر آن یک تغییر در constants.ts است.',
  })

  // ─── NFPA 20 — fire pump ───
  add(preset(K.pumpMonitorResidual, 'فشار باقی‌مانده لازم در مانیتور', NFPA20.monitorResidualBar, U.pressure.bar.symbol, 'ثابت موتور: معادل 70 m ستون آب', 'نقطه کنترل = مانیتور', 'در کد به‌صورت «70 متر» داخل محاسبه hard-code شده بود.'))
  add(preset(K.pumpHydrantResidual, 'فشار باقی‌مانده لازم در هایدرانت', NFPA20.hydrantResidualBar, U.pressure.bar.symbol, 'ثابت موتور: معادل 20 m ستون آب', 'نقطه کنترل = هایدرانت', 'در کد hard-code شده بود.'))
  add<number>({
    key: K.pumpEfficiency,
    parameter: 'راندمان پمپ',
    value: NFPA20.efficiency,
    source: 'engineering_assumption',
    reference: 'ثابت موتور',
    applicability: 'برای برآورد توان ورودی؛ راندمان واقعی باید از منحنی پمپ خوانده شود',
    status: 'preset_default',
  })
  add(preset(K.pumpStaticLift, 'هد استاتیک فرضی', NFPA20.staticLiftM, U.head.m.symbol, 'ثابت موتور: hard-code', 'برآورد مقدماتی', 'عدد ثابت داخل کد بود.'))
  add(preset(K.pumpFrictionAllowance, 'هد افت اصطکاک فرضی شبکه', NFPA20.frictionAllowanceM, U.head.m.symbol, 'ثابت موتور: «15 m estimated friction loss»', 'برآورد مقدماتی — جای محاسبه هیدرولیک شبکه را نمی‌گیرد', 'این عدد بدون هیچ محاسبه‌ای در TDH وارد می‌شد.'))
  add(preset(K.pumpSafetyFactor, 'ضریب اطمینان توان پمپ', NFPA20.powerSafetyFactor, '—', 'ثابت موتور: +10%', 'برآورد مقدماتی', 'ضریب 10% در کد اعمال می‌شد.'))

  // ─── Hydraulics ───
  add<number>({
    key: K.hwCoefficient,
    parameter: 'ضریب C هیزن-ویلیامز',
    value: HYDRAULICS.hazenWilliamsC,
    source: 'engineering_assumption',
    reference: 'ثابت موتور (فولاد متوسط)',
    applicability: 'فولاد گالوانیزه/سیاه با شرایط متوسط؛ برای لوله پلاستیکی 150',
    status: 'preset_default',
    note: 'کد قبلی در دو نقطه دو مقدار متفاوت (100 و 120) بدون توضیح استفاده می‌کرد؛ اکنون یک مقدار ثابت واحد است.',
  })
  add<number>({
    key: K.hwMaxVelocity,
    parameter: 'حداکثر سرعت مجاز در لوله',
    value: HYDRAULICS.maxVelocityMs,
    unit: U.velocity.ms.symbol,
    source: 'project_default',
    reference: 'ثابت موتور',
    applicability: 'انتخاب قطر لوله',
    status: 'preset_default',
  })

  // ─── Demand (monitors / hydrants) ───
  add<number>({
    key: K.hydrantOutletFlow,
    parameter: 'دبی هر خروجی هایدرانت ۲.۵ اینچ',
    value: DEMAND.hydrantOutletLpm,
    unit: U.flow.Lmin.symbol,
    source: 'project_default',
    reference: 'ثابت موتور (≈250 gpm)',
    applicability: 'مقدار مرجع؛ الزام سراسری NFPA 24 نیست',
    status: 'preset_default',
    note: 'NFPA 24 عمدتاً به شبکه آتش‌نشانی خصوصی و متعلقات آن می‌پردازد؛ انتساب این عدد به آن به‌عنوان الزام پشتیبانی نشده است.',
  })
  add<number>({
    key: K.monitorOutletFlow,
    parameter: 'دبی مرجع هر خروجی مانیتور (مقدار آغازین ویرایشگر گره)',
    value: DEMAND.monitorOutletLpm,
    unit: U.flow.Lmin.symbol,
    source: 'project_default',
    reference: 'ثابت موتور؛ مقدار واقعی از مشخصات ثبت‌شده روی هر گره خوانده می‌شود',
    applicability: 'فقط به‌عنوان مقدار آغازین ویرایشگر گره',
    status: 'preset_default',
    note: 'محاسبه دبی طراحی از مشخصات هر گره روی نقشه خوانده می‌شود، نه از این عدد سراسری.',
  })
  add(preset(K.demandLossAllowance, 'ضریب ذخیره دبی طراحی', DEMAND.lossAllowance, '—', 'ثابت موتور: +20% allowance', 'برآورد مقدماتی', 'در کد قبلی به‌صورت hard-code 20% روی دبی اضافه می‌شد.'))

  // ─── Bundwall ───
  add<string>({
    key: K.bundwallRule,
    parameter: 'قاعده ظرفیت باندوال',
    value: BUNDWALL.rule,
    source: 'legacy_value',
    reference: 'ثابت موتور: calcRequiredBandwallVolume — بدون منبع مقرراتی',
    applicability: 'قاعده پروژه/مقرراتی — باید با آیین‌نامه محلی و مشخصات پروژه تأیید شود',
    status: 'preset_default',
    note: 'گزینه‌ها: legacy_110_or_25 | largest_110 | largest_100_plus_10_others. هیچ‌یک الزام سراسری NFPA نیست.',
  })
  add<number>({ key: K.bundwallFreeboard, parameter: 'فرش‌بورد (ارتفاع آزاد) باندوال', value: BUNDWALL.freeboardM, unit: U.length.m.symbol, source: 'project_default', reference: 'ثابت موتور — صفر تا زمانی که مبنای طراحی مقدار دیگری تعیین کند', applicability: 'برای تفکیک حجم ناخالص و مفید', status: 'preset_default' })
  add<number>({ key: K.bundwallRainfallAllowance, parameter: 'ذخیره بارش باران', value: BUNDWALL.rainfallAllowanceM, unit: U.length.m.symbol, source: 'project_default', reference: 'ثابت موتور — صفر تا زمانی که مبنای طراحی الزام کند', applicability: 'کسر از حجم مفید در صورت الزام مبنای طراحی', status: 'preset_default' })
  add<number>({ key: K.bundwallDisplacement, parameter: 'حجم جابه‌جاشده توسط سازه‌ها/فونداسیون', value: BUNDWALL.displacementM3, unit: U.volume.m3.symbol, source: 'project_default', reference: 'ثابت موتور — صفر؛ در صورت وجود فونداسیون وارد شود', applicability: 'کسر از حجم مفید', status: 'preset_default' })

  return {
    schemaVersion: DESIGN_BASIS_SCHEMA_VERSION,
    basisVersion: BASIS_VERSION,
    adoptedStandards: defaultAdoptedStandards(),
    entries,
    fluid: {
      name: FLUID.name,
      densityKgm3: FLUID.waterDensityKgm3,
      densitySource: 'project_default',
      densityReference: 'ثابت موتور؛ آب در ۲۰°C برابر 998.2 kg/m³ است',
    },
    notes: [
      'تمام مقادیر این جدول ثابت‌های موتور هستند (constants.ts) و از هیچ صفحه‌ای قابل ویرایش نیستند. این جدول فقط مستندات هر عدد را برای گزارش حمل می‌کند.',
    ],
    migrations: [],
  }
}

// ─── Accessors ─────────────────────────────────────────────────────
export function basisNumber(basis: DesignBasis, key: string): number | null {
  const e = basis.entries[key]
  if (!e) return null
  return typeof e.value === 'number' ? e.value : null
}

export function basisString(basis: DesignBasis, key: string): string | null {
  const e = basis.entries[key]
  if (!e) return null
  return typeof e.value === 'string' ? e.value : null
}

export function setBasisValue(basis: DesignBasis, key: string, value: number | string | null): DesignBasis {
  const existing = basis.entries[key]
  if (!existing) return basis
  return {
    ...basis,
    entries: {
      ...basis.entries,
      [key]: {
        ...existing,
        value: value as never,
        // Once an engineer types a value in, it is a project decision, not a
        // carried-over legacy number — but it is still not a verified standard.
        source: existing.source === 'legacy_value' ? 'project_default' : existing.source,
        status: existing.status === 'unverified_legacy' ? 'requires_engineering_review' : existing.status,
      },
    },
  }
}

export function setAdoptedEdition(basis: DesignBasis, standard: string, edition: string | null): DesignBasis {
  return {
    ...basis,
    adoptedStandards: basis.adoptedStandards.map(s =>
      s.standard === standard
        ? { ...s, edition, source: edition ? 'project record' : 'not recorded', status: edition ? 'verified' : 'requires_engineering_review' }
        : s),
  }
}

// ─── Active basis ──────────────────────────────────────────────────
// The new calculation service takes the basis explicitly. The compatibility
// facade in `fireCalculations.ts` cannot — its signatures were fixed years ago
// and are called from a dozen components — so the workspace's current basis is
// held here and installed once, on project load.
let activeBasis: DesignBasis = defaultBasis()

export function getActiveBasis(): DesignBasis {
  return activeBasis
}

export function setActiveBasis(basis: DesignBasis): void {
  activeBasis = basis
}

export function resetActiveBasis(): void {
  activeBasis = defaultBasis()
}
