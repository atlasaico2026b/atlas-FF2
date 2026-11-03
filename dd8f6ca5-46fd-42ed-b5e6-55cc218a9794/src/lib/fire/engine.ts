// Fire-fighting calculation engine.
//
// Implements only what «دستورالعمل نهایی برای موتور محاسبات شوگو» defines, and
// returns exactly the seventeen outputs its §۱۲ allows. Where the instruction
// provides no value or no formula, nothing is assumed: the affected output is
// reported as «داده کافی نیست» and only the missing essential inputs are named
// (§۱۳). Each output carries the section and the substitution it came from, so
// no figure on screen is unattributable.

import {
  CONCENTRATIONS,
  COOLING_DURATION_MIN,
  COOLING_RATE_LMIN_M2,
  GRAVITY_M_S2,
  MAX_VELOCITY_M_S,
  PIPE_LIBRARY_MM,
  ROOF_TYPES,
  SAFETY_FACTOR,
  SEAL_WIDTH_DEFAULT_M,
  WATER_DENSITY_KG_M3,
  fuelByKey,
  minFoamChambers,
  scenarioById,
  scenariosForRoof,
  type FuelGroup,
  type RoofType,
  type ScenarioDef,
  type ScenarioId,
} from './spec'

import {
  SHELL_COOLING_FRACTION,
  coolingAreaM2,
  shellCoolingAreaM2,
} from '../coolingArea'

// ── ورودی ────────────────────────────────────────────────────────────────────

export interface AdjacentEquipmentInput {
  name: string
  diameterM: number | null
  heightM: number | null
  /** §۸ — «درصد کولینگ موردنیاز» for this equipment in the worst case. */
  coolingPercent: number | null
}

export interface MonitorEquipmentInput {
  /** §۳-ب — «مدل و ظرفیت تجهیزات». A constant may not be assumed for this. */
  model: string
  capacityLpm: number | null
}

export interface HydraulicInput {
  /** §۱۰ — «طول لوله از طراحی سایت دریافت شود». */
  pipeLengthM: number | null
  pipeDiameterMm: number | null
  cFactor: number | null
  staticHeadM: number | null
  residualBar: number | null
}

export interface RingSpacingInput {
  ringSpacingM: number | null
  sprinklerSpacingM: number | null
}

export interface FireCalcInput {
  fuelKey: string | null
  diameterM: number | null
  heightM: number | null
  roofType: RoofType | null
  scenario: ScenarioId | null
  sealWidthM: number | null
  /** §۱ — «مساحت باندوال؛ قابل ورود مستقیم یا محاسبه از طول و عرض». */
  bundwallAreaM2: number | null
  bundwallLengthM: number | null
  bundwallWidthM: number | null
  monitor: MonitorEquipmentInput | null
  adjacent: AdjacentEquipmentInput[]
  hydraulic: HydraulicInput | null
  directSpray: RingSpacingInput | null
  rundown: RingSpacingInput | null
}

// ── خروجی ────────────────────────────────────────────────────────────────────

export type OutputStatus = 'ok' | 'insufficient' | 'na' | 'not_defined'

/**
 * A figure that belongs to one of the seventeen outputs without being the
 * output itself — the monitor count under §۳-ب, or the solution volume the two
 * water figures are derived from.
 *
 * §۱۲ allows exactly seventeen outputs, so a subordinate quantity is reported
 * here rather than promoted to an eighteenth.
 */
export interface FireFigure {
  label: string
  value: number
  unit: string
}

export interface FireOutput {
  /** ۱..۱۷ — the position in §۱۲. No other output exists. */
  id: number
  label: string
  value: number | null
  unit: string
  status: OutputStatus
  /** Sub-figures this output owns. Never a substitute for `value`. */
  figures?: FireFigure[]
  /** The substitution chain, so the figure can be checked by hand. */
  basis: string[]
  missing: string[]
  note: string | null
}

export interface FireCalcResult {
  /** False when the instruction requires the calculation to stop. */
  ok: boolean
  group: FuelGroup | null
  groupLabel: string | null
  outputs: FireOutput[]
  missing: string[]
  notes: string[]
}

/** The seventeen outputs of §۱۲, in the order the instruction lists them. */
export const OUTPUT_LABELS: readonly { id: number; label: string; unit: string }[] = Object.freeze([
  { id: 1, label: 'دبی موردنیاز اطفای فوم', unit: 'L/min' },
  { id: 2, label: 'دبی موردنیاز کولینگ', unit: 'L/min' },
  { id: 3, label: 'دبی موردنیاز هر فوم‌چمبر', unit: 'L/min' },
  { id: 4, label: 'دبی مانیتور یا هوزدستی', unit: 'L/min' },
  { id: 5, label: 'حجم آب موردنیاز فوم ۳٪', unit: 'm³' },
  { id: 6, label: 'حجم آب موردنیاز فوم ۶٪', unit: 'm³' },
  { id: 7, label: 'حجم آب کولینگ مخزن تحت حریق', unit: 'm³' },
  { id: 8, label: 'حجم آب کولینگ تجهیزات مجاور', unit: 'm³' },
  { id: 9, label: 'حجم آب موردنیاز مانیتور یا هوزدستی', unit: 'm³' },
  { id: 10, label: 'حجم کل آب موردنیاز عملیات با ضریب اطمینان ۲۰٪', unit: 'm³' },
  { id: 11, label: 'دبی کل موردنیاز عملیات با ضریب اطمینان ۲۰٪', unit: 'L/min' },
  { id: 12, label: 'دبی و فشار موردنیاز پمپ آتش‌نشانی', unit: '' },
  { id: 13, label: 'مشخصات جوکی‌پمپ موردنیاز', unit: '' },
  { id: 14, label: 'مدت‌زمان اطفای حریق', unit: 'min' },
  { id: 15, label: 'مدت‌زمان کولینگ', unit: 'min' },
  { id: 16, label: 'حجم نهایی مخزن ذخیره آب عملیاتی', unit: 'm³' },
  { id: 17, label: 'نوع سیستم کولینگ، تعداد رینگ‌ها و تعداد اسپرینکلرها', unit: '' },
])

const n = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

const round = (v: number, dp = 2): number => {
  const f = 10 ** dp
  return Math.round(v * f) / f
}

const fmt = (v: number, dp = 2): string =>
  round(v, dp).toLocaleString('en-US', { maximumFractionDigits: dp })

// ── محاسبه ───────────────────────────────────────────────────────────────────

export function calculate(input: FireCalcInput): FireCalcResult {
  const missing: string[] = []
  const notes: string[] = []

  const fuel = fuelByKey(input.fuelKey)
  if (!fuel) missing.push('نوع ماده نفتی')

  const D = n(input.diameterM)
  const H = n(input.heightM)
  if (D === null || D <= 0) missing.push('قطر مخزن (D)')
  if (H === null || H <= 0) missing.push('ارتفاع مخزن (H)')

  const roof = input.roofType
  if (!roof || !ROOF_TYPES.some((r) => r.id === roof)) missing.push('نوع سقف')

  let scenario: ScenarioDef | null = null
  if (!input.scenario) missing.push('سناریوی اطفا')
  if (roof) {
    const allowed = scenariosForRoof(roof)
    scenario = scenarioById(input.scenario)
    if (scenario && scenario.roofType !== roof) {
      // §۱۳ / §۹ — an impossible roof+scenario pair is refused, never bent into
      // the nearest permitted one.
      missing.push('سناریوی سازگار با نوع سقف انتخاب‌شده')
      scenario = null
    }
    if (!scenario && allowed.length > 0) {
      notes.push(`سناریوهای مجاز این سقف: ${allowed.map((s) => s.label).join(' · ')}`)
    }
  }

  // §۵/§۱۳ — without the design data the calculation stops here.
  if (!scenario || D === null || H === null || !fuel || D <= 0 || H <= 0) {
    return {
      ok: false,
      group: fuel?.group ?? null,
      groupLabel: fuel ? groupLabelFor(fuel.group) : null,
      outputs: stopOutputs(missing),
      missing,
      notes,
    }
  }

  const group = fuel.group
  const fullAreaM2 = (Math.PI / 4) * D * D
  const circumferenceM = Math.PI * D

  const sealWidthM =
    scenario.area === 'annular'
      ? (n(input.sealWidthM) ?? SEAL_WIDTH_DEFAULT_M)
      : null
  if (scenario.area === 'annular' && sealWidthM !== null && sealWidthM >= D) {
    missing.push('عرض ناحیه سیل (باید کمتر از قطر مخزن باشد)')
  }

  // عرض ناحیه سیل W: قطر ناحیه داخلی D − W است، پس مساحت ریم سیل اختلاف
  // مساحت سطح با قطر D و سطح با قطر D − W است. پیش‌فرض W = 0.6 m و در مخازن
  // سقف متحرک به‌صورت دستی قابل ورود است.
  const innerDiameterM = sealWidthM === null ? null : D - sealWidthM
  const annularAreaM2 =
    innerDiameterM === null
      ? null
      : (Math.PI / 4) * (D * D - innerDiameterM * innerDiameterM)

  const areaM2 = scenario.area === 'annular' ? annularAreaM2 : fullAreaM2

  const durationMin =
    group === 'alpha' ? scenario.durationAlphaMin : scenario.durationBetaMin

  // §۶ + §۹ — the rate and the duration give the flow; the volumes follow.
  const foamFlowLpm = areaM2 === null ? null : areaM2 * scenario.rateLminM2

  const solutionM3 =
    foamFlowLpm === null || durationMin === null
      ? null
      : (foamFlowLpm * durationMin) / 1000

  const waterByConcentration: Record<number, number | null> = {}
  const concentrateByConcentration: Record<number, number | null> = {}
  for (const c of CONCENTRATIONS) {
    waterByConcentration[c.percent] =
      solutionM3 === null ? null : solutionM3 * (1 - c.fraction)
    concentrateByConcentration[c.percent] =
      solutionM3 === null ? null : solutionM3 * c.fraction
  }

  // §۳-الف — chamber count, and the flow each chamber must deliver.
  //
  // فوم‌چمبر روی سقف ثابت (§۳-الف) به کار می‌رود و روی سقف شناور برای تزریق فوم
  // به ناحیه سیل (§۴/§۵). سقف ثابت می‌تواند با مانیتور/هوزدستی هم اطفا شود، ولی
  // سقف شناور فقط با فوم‌چمبر اطفا می‌شود — به همین دلیل چمبر روی این سقف‌ها
  // هم محاسبه می‌شود.
  const chamberInScope = scenario.id === 'foam_chamber' || roof !== 'fixed'
  const chamberCount = chamberInScope ? minFoamChambers(D, fullAreaM2) : null
  const flowPerChamberLpm =
    chamberCount && chamberCount > 0 && foamFlowLpm !== null ? foamFlowLpm / chamberCount : null

  // §۳-ب — the monitor / hand-hose requirement over the same protected area,
  // with the equipment count taken from the selected model's capacity.
  //
  // §۳-ب sits under §۳, which is the fixed-roof section, so it is in scope only
  // there. It is a *consumer* in the §۸ total only when the design actually has
  // a monitor system — i.e. a model and capacity were entered, or the monitor
  // scenario is the one being designed.
  const monitorInScope = roof === 'fixed'
  const monitorIsScenario = scenario.id === 'monitor_handhose'
  const monitorRequiredLpm = fullAreaM2 * 6.5
  const monitorDurationMin = group === 'alpha' ? 65 : 50
  const monitorCapacity = n(input.monitor?.capacityLpm ?? null)
  const monitorCount =
    monitorCapacity !== null && monitorCapacity > 0
      ? Math.ceil(monitorRequiredLpm / monitorCapacity)
      : null
  // §۳-ب — the flow the units actually selected deliver. The count is rounded
  // up, so it is never below the requirement; that is what makes the capacity
  // adequate, and it is reported rather than left to be inferred.
  const installedMonitorFlowLpm =
    monitorCount !== null && monitorCapacity !== null ? monitorCount * monitorCapacity : null
  const monitorConsumerActive = monitorInScope && !monitorIsScenario && input.monitor !== null
  if (monitorInScope && !input.monitor) {
    notes.push('مدل و ظرفیت تجهیزات مانیتور/هوزدستی ثبت نشده — تعداد تجهیزات محاسبه نشد.')
  } else if (input.monitor && (monitorCapacity === null || monitorCapacity <= 0)) {
    notes.push('ظرفیت تجهیز انتخابی ثبت نشده — §۳-ب اجازه فرض مقدار ثابت را نمی‌دهد.')
  }

  // §۷ — cooling of the tank on fire. Half the shell is the cooled surface, and
  // a fixed roof is cooled on the roof as well; a floating roof is not.
  const coolingArea = coolingAreaM2(D, H, roof)
  const coolingFlowLpm = coolingArea.totalM2 * COOLING_RATE_LMIN_M2
  const coolingVolumeM3 = (coolingFlowLpm * COOLING_DURATION_MIN) / 1000

  // §۸ — cooling of adjacent equipment at the percentage the user sets.
  const adjacentRows = input.adjacent
    .map((a) => {
      const ad = n(a.diameterM)
      const ah = n(a.heightM)
      const pct = n(a.coolingPercent)
      if (ad === null || ad <= 0 || ah === null || ah <= 0 || pct === null) return null
      const area = shellCoolingAreaM2(ad, ah)
      const flow = area * COOLING_RATE_LMIN_M2 * (pct / 100)
      const volume = (flow * COOLING_DURATION_MIN) / 1000
      return { name: a.name || 'تجهیز مجاور', area, flow, volume, pct }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  const adjacentFlowLpm = adjacentRows.reduce((s, r) => s + r.flow, 0)
  const adjacentVolumeM3 = adjacentRows.reduce((s, r) => s + r.volume, 0)
  if (input.adjacent.length === 0) {
    notes.push('تجهیز مجاوری ثبت نشده — کولینگ تجهیزات مجاور صفر در نظر گرفته شد.')
  } else if (adjacentRows.length < input.adjacent.length) {
    notes.push('برخی تجهیزات مجاور ناقص‌اند و در جمع کولینگ وارد نشدند.')
  }

  // §۸ lists pool firefighting water «در صورت وجود داده‌های لازم». The
  // instruction defines no rate or duration for it, so nothing may be computed.
  const bundwallArea =
    n(input.bundwallAreaM2) ??
    (n(input.bundwallLengthM) !== null && n(input.bundwallWidthM) !== null
      ? (n(input.bundwallLengthM) as number) * (n(input.bundwallWidthM) as number)
      : null)
  if (bundwallArea !== null) {
    notes.push(
      'آب اطفای حوضچه محاسبه نشد: دستورالعمل نرخ یا مدتی برای آن تعریف نکرده است.',
    )
  }

  // §۸ — the monitor is its own consumer only when it is a separate system.
  // Pump sizing must use the installed monitor flow (rounded up by capacity),
  // not the required-only flow.
  const monitorFlowForTotals = monitorConsumerActive
    ? installedMonitorFlowLpm ?? monitorRequiredLpm
    : 0
  const separateMonitorFlow = monitorFlowForTotals
  const separateMonitorVolume =
    monitorFlowForTotals > 0 ? (monitorFlowForTotals * monitorDurationMin) / 1000 : 0
  if (monitorIsScenario) {
    notes.push('سناریوی انتخابی خودِ مانیتور/هوزدستی است؛ مصرف آن یک‌بار در جمع لحاظ شد.')
  } else if (monitorInScope && !input.monitor) {
    notes.push('مانیتور/هوزدستی در جمع وارد نشد: تجهیزی ثبت نشده بود.')
  }

  // §۸ + §۹ — the water total. Of the two concentrations the 3% case leaves the
  // larger water volume, so it governs the storage figure.
  const governingWater = waterByConcentration[3]
  const waterTerms: { label: string; value: number }[] = []
  if (governingWater !== null) waterTerms.push({ label: 'آب محلول فوم (۳٪)', value: governingWater })
  waterTerms.push({ label: 'کولینگ مخزن تحت حریق', value: coolingVolumeM3 })
  if (adjacentRows.length > 0) waterTerms.push({ label: 'کولینگ تجهیزات مجاور', value: adjacentVolumeM3 })
  if (separateMonitorVolume > 0) waterTerms.push({ label: 'مانیتور/هوزدستی', value: separateMonitorVolume })

  const baseWaterM3 = waterTerms.reduce((s, t) => s + t.value, 0)
  const designWaterM3 = baseWaterM3 * SAFETY_FACTOR

  const flowTerms: { label: string; value: number }[] = []
  if (foamFlowLpm !== null) flowTerms.push({ label: 'اطفای فوم', value: foamFlowLpm })
  flowTerms.push({ label: 'کولینگ مخزن', value: coolingFlowLpm })
  if (adjacentRows.length > 0) flowTerms.push({ label: 'کولینگ تجهیزات مجاور', value: adjacentFlowLpm })
  if (separateMonitorFlow > 0) flowTerms.push({ label: 'مانیتور/هوزدستی', value: separateMonitorFlow })

  const baseFlowLpm = flowTerms.reduce((s, t) => s + t.value, 0)
  const designFlowLpm = baseFlowLpm * SAFETY_FACTOR

  // §۱۰ — pump duty by Hazen-Williams, only from the site data the user gave.
  const pump = pumpDuty(input.hydraulic, designFlowLpm, missing)

  // §۱۱ — ring and sprinkler counts per mode, from the spacing the user gives.
  const directSpray = coolingSystem('Direct Spray', input.directSpray, H, circumferenceM, missing)
  const rundown = coolingSystem('Rundown', input.rundown, H, circumferenceM, missing)

  const outputs: FireOutput[] = []

  outputs.push({
    id: 1,
    label: label(1),
    value: foamFlowLpm === null ? null : round(foamFlowLpm),
    unit: 'L/min',
    status: foamFlowLpm === null ? 'insufficient' : 'ok',
    basis: [
      `${scenario.section} ${scenario.label}`,
      areaM2 === null
        ? ''
        : scenario.area === 'annular'
          ? `Aریم‌سیل = π/4 × (D² − (D−W)²) = π/4 × (${fmt(D)}² − ${fmt(innerDiameterM as number)}²) = ${fmt(areaM2)} m²`
          : `A = π × D² / 4 = π × ${fmt(D)}² / 4 = ${fmt(areaM2)} m²`,
      `Q = A × R = ${areaM2 === null ? '—' : fmt(areaM2)} × ${scenario.rateLminM2} = ${foamFlowLpm === null ? '—' : fmt(foamFlowLpm)} L/min`,
    ].filter(Boolean),
    missing: [],
    note:
      scenario.area === 'annular'
        ? `سطح حلقوی ناحیه سیل — عرض W = ${fmt(sealWidthM as number)} m، قطر داخلی D−W = ${fmt(innerDiameterM as number)} m`
        : null,
  })

  outputs.push({
    id: 2,
    label: label(2),
    value: round(coolingFlowLpm),
    unit: 'L/min',
    status: 'ok',
    basis: [
      '§۷ کولینگ',
      `Aجانبی = ${SHELL_COOLING_FRACTION} × π × D × H = ${SHELL_COOLING_FRACTION} × π × ${fmt(D)} × ${fmt(H)} = ${fmt(coolingArea.shellM2)} m²`,
      ...(coolingArea.roofM2 > 0
        ? [`Aسقف = π × D² / 4 = π × ${fmt(D)}² / 4 = ${fmt(coolingArea.roofM2)} m² (سقف ثابت)`]
        : ['کولینگ سقف اعمال نشد — سقف شناور است']),
      `Aکل = ${fmt(coolingArea.totalM2)} m²`,
      `Q = A × ${COOLING_RATE_LMIN_M2} = ${fmt(coolingFlowLpm)} L/min`,
    ],
    missing: [],
    note: null,
  })

  outputs.push({
    id: 3,
    label: label(3),
    value: flowPerChamberLpm === null ? null : round(flowPerChamberLpm),
    unit: 'L/min',
    status: !chamberInScope ? 'na' : flowPerChamberLpm === null ? 'insufficient' : 'ok',
    basis:
      chamberInScope
        ? [
            '§۳-الف جدول حداقل تعداد فوم‌چمبر',
            `قطر ${fmt(D)} m → N = ${chamberCount}`,
            roof === 'fixed'
              ? 'سقف ثابت — تزریق فوم به داخل مخزن'
              : `سقف ${roof === 'external_floating' ? 'شناور خارجی' : 'شناور داخلی'} — تزریق فوم به ناحیه سیل`,
            `Qچمبر = Qfoam / N = ${foamFlowLpm === null ? '—' : fmt(foamFlowLpm)} / ${chamberCount} = ${flowPerChamberLpm === null ? '—' : fmt(flowPerChamberLpm)} L/min`,
          ]
        : [`سناریوی انتخابی فوم‌چمبر ندارد (${scenario.label})`],
    missing: [],
    note: chamberInScope
      ? roof === 'fixed'
        ? null
        : 'سقف شناور فقط با فوم‌چمبر اطفا می‌شود؛ مانیتور و شیلنگ دستی برای آن به کار نمی‌رود'
      : 'این سناریو فوم‌چمبر ندارد',
  })

  outputs.push({
    id: 4,
    label: label(4),
    value: monitorInScope ? round(monitorRequiredLpm) : null,
    unit: 'L/min',
    status: monitorInScope ? 'ok' : 'na',
    basis: monitorInScope
      ? [
          '§۳-ب مانیتور یا هوزدستی',
          `A = π × D² / 4 = ${fmt(fullAreaM2)} m²`,
          `Q = A × 6.5 = ${fmt(monitorRequiredLpm)} L/min`,
          monitorCount === null
            ? 'تعداد تجهیز: ظرفیت مدل انتخابی ثبت نشده'
            : `تعداد تجهیز = CEIL(${fmt(monitorRequiredLpm)} / ${fmt(monitorCapacity as number)}) = ${monitorCount} × ${fmt(monitorCapacity as number)} = ${fmt(installedMonitorFlowLpm as number)} L/min (${input.monitor?.model || 'مدل ثبت‌نشده'})`,
        ]
      : ['§۳-ب زیر بخش سقف ثابت تعریف شده است'],
    figures:
      monitorCount === null || installedMonitorFlowLpm === null
        ? []
        : [
            { label: 'تعداد تجهیز لازم', value: monitorCount, unit: 'عدد' },
            {
              label: 'دبی نصب‌شده (تعداد × ظرفیت)',
              value: round(installedMonitorFlowLpm),
              unit: 'L/min',
            },
          ],
    missing: monitorIsScenario && monitorCount === null ? ['ظرفیت تجهیز مانیتور/هوزدستی'] : [],
    note: !monitorInScope
      ? '§۳-ب مخصوص سقف ثابت است'
      : installedMonitorFlowLpm === null
        ? 'ظرفیت ثابت فرض نشد'
        : `ظرفیت کافی است: دبی نصب‌شده ${fmt(installedMonitorFlowLpm)} ≥ دبی موردنیاز ${fmt(monitorRequiredLpm)} L/min`,
  })

  outputs.push(
    concentrationOutput(5, 3, waterByConcentration[3], solutionM3, concentrateByConcentration[3], durationMin),
  )
  outputs.push(
    concentrationOutput(6, 6, waterByConcentration[6], solutionM3, concentrateByConcentration[6], durationMin),
  )

  outputs.push({
    id: 7,
    label: label(7),
    value: round(coolingVolumeM3),
    unit: 'm³',
    status: 'ok',
    basis: [
      '§۷ کولینگ',
      `V = Q × ${COOLING_DURATION_MIN} / 1000 = ${fmt(coolingFlowLpm)} × ${COOLING_DURATION_MIN} / 1000 = ${fmt(coolingVolumeM3)} m³`,
    ],
    missing: [],
    note: null,
  })

  outputs.push({
    id: 8,
    label: label(8),
    value: round(adjacentVolumeM3),
    unit: 'm³',
    status: 'ok',
    basis:
      adjacentRows.length === 0
        ? ['§۸ — تجهیز مجاوری ثبت نشده']
        : [
            '§۸ تجهیزات مجاور',
            ...adjacentRows.map(
              (r) =>
                `${r.name}: π × ${fmt(r.area / (Math.PI * 1))} × … → Q = ${fmt(r.flow)} L/min @ ${r.pct}٪ → V = ${fmt(r.volume)} m³`,
            ),
            `Σ = ${fmt(adjacentVolumeM3)} m³`,
          ],
    missing: [],
    note: adjacentRows.length === 0 ? 'مقدار صفر' : null,
  })

  outputs.push({
    id: 9,
    label: label(9),
    value: monitorInScope ? round(separateMonitorVolume) : null,
    unit: 'm³',
    status: monitorInScope ? 'ok' : 'na',
    basis: monitorInScope
      ? [
          '§۳-ب',
          `V = ${fmt(monitorFlowForTotals)} × ${monitorDurationMin} / 1000 = ${fmt(separateMonitorVolume)} m³`,
        ]
      : ['§۳-ب زیر بخش سقف ثابت تعریف شده است'],
    missing: [],
    note: monitorInScope && !monitorConsumerActive
      ? 'تجهیزی ثبت نشده، پس در جمع §۸ وارد نشد'
      : null,
  })

  // §۸/§۹ — one application of the 1.2 factor, on the design totals only.
  outputs.push({
    id: 10,
    label: label(10),
    value: round(designWaterM3),
    unit: 'm³',
    status: 'ok',
    basis: [
      '§۸ جمع مصرف‌کننده‌های انتخابی',
      ...waterTerms.map((t) => `${t.label} = ${fmt(t.value)}`),
      `Vپایه = ${fmt(baseWaterM3)} m³`,
      `§۹ Vطراحی = ${fmt(baseWaterM3)} × ${SAFETY_FACTOR} = ${fmt(designWaterM3)} m³`,
    ],
    missing: [],
    note:
      durationMin === null
        ? 'مدت تخلیه این سناریو در دستورالعمل تعریف نشده، پس حجم محلول فوم در جمع نیامد.'
        : null,
  })

  outputs.push({
    id: 11,
    label: label(11),
    value: round(designFlowLpm),
    unit: 'L/min',
    status: 'ok',
    basis: [
      '§۸ جمع دبی مصرف‌کننده‌های انتخابی',
      ...flowTerms.map((t) => `${t.label} = ${fmt(t.value)} L/min`),
      `Qپایه = ${fmt(baseFlowLpm)} L/min`,
      `§۹ Qطراحی = ${fmt(baseFlowLpm)} × ${SAFETY_FACTOR} = ${fmt(designFlowLpm)} L/min`,
    ],
    missing: [],
    note: null,
  })

  outputs.push(pump.output)

  // §۱۰/§۱۳ — the instruction defines no jockey-pump sizing rule, and naming a
  // figure anyway would be guessing. It is reported as not defined rather than
  // as data the user could supply.
  outputs.push({
    id: 13,
    label: label(13),
    value: null,
    unit: '',
    status: 'not_defined',
    basis: ['§۱۰ — مشخصات جوکی‌پمپ «در صورت کفایت داده‌ها»'],
    missing: [],
    note: 'قاعده تعیین مشخصات جوکی‌پمپ در دستورالعمل تعریف نشده؛ مقدار حدس زده نشد',
  })

  outputs.push({
    id: 14,
    label: label(14),
    value: durationMin,
    unit: 'min',
    status: durationMin === null ? 'insufficient' : 'ok',
    basis: [
      `${scenario.section} ${scenario.label}`,
      durationMin === null
        ? 'برای این سناریو مدتی تعریف نشده است'
        : `${groupLabelFor(group)} → t = ${durationMin} min`,
    ],
    missing: durationMin === null ? ['مدت‌زمان تخلیه سناریوی «غرق‌شدن سقف و حریق سطح کامل»'] : [],
    note: null,
  })

  outputs.push({
    id: 15,
    label: label(15),
    value: COOLING_DURATION_MIN,
    unit: 'min',
    status: 'ok',
    basis: [`§۷ کولینگ → t = ${COOLING_DURATION_MIN} min`],
    missing: [],
    note: null,
  })

  outputs.push({
    id: 16,
    label: label(16),
    value: round(designWaterM3),
    unit: 'm³',
    status: 'ok',
    basis: [`§۹ حجم عملیاتی طراحی = ${fmt(designWaterM3)} m³`],
    missing: [],
    note: 'همان حجم کل §۱۲-۱۰؛ مبنای سایز مخزن ذخیره',
  })

  // §۱۱ — هر دو حالت جداگانه گزارش می‌شوند تا طراح بتواند انتخاب کند کدام
  // سیستم کولینگ را به کار ببرد؛ هیچ‌کدام جایگزین دیگری نمی‌شود.
  const coolingFigures: FireFigure[] = []
  if (directSpray.rings !== null) {
    coolingFigures.push(
      { label: 'Direct Spray — تعداد رینگ', value: directSpray.rings, unit: 'عدد' },
      { label: 'Direct Spray — تعداد آب‌پاش (نازل)', value: directSpray.sprinklers as number, unit: 'عدد' },
    )
  }
  if (rundown.rings !== null) {
    coolingFigures.push(
      { label: 'Rundown — تعداد رینگ', value: rundown.rings, unit: 'عدد' },
      { label: 'Rundown — تعداد آب‌پاش (نازل)', value: rundown.sprinklers as number, unit: 'عدد' },
    )
  }
  const bothCoolingKnown = directSpray.rings !== null && rundown.rings !== null

  outputs.push({
    id: 17,
    label: label(17),
    value: bothCoolingKnown ? (directSpray.sprinklers as number) : null,
    unit: bothCoolingKnown ? 'عدد (Direct Spray)' : '',
    status: bothCoolingKnown ? 'ok' : 'insufficient',
    figures: coolingFigures,
    basis: [
      '§۱۱ — دو حالت کولینگ مخزن، جداگانه محاسبه شدند',
      directSpray.line,
      rundown.line,
      bothCoolingKnown
        ? 'طراح باید یکی از دو سیستم را برای اجرا انتخاب کند'
        : 'برای نمایش هر دو حالت، فاصله رینگ و آب‌پاش هر دو حالت لازم است',
    ],
    missing: [
      ...(directSpray.rings === null ? ['فاصله رینگ/اسپرینکلر حالت Direct Spray'] : []),
      ...(rundown.rings === null ? ['فاصله رینگ/اسپرینکلر حالت Rundown'] : []),
    ],
    note:
      bundwallArea === null
        ? null
        : `مساحت باندوال ثبت‌شده: ${fmt(bundwallArea)} m²`,
  })

  return {
    ok: outputs.every((o) => o.status !== 'insufficient'),
    group,
    groupLabel: groupLabelFor(group),
    outputs,
    missing: Array.from(new Set(missing)),
    notes,
  }
}

function label(id: number): string {
  return OUTPUT_LABELS.find((o) => o.id === id)?.label ?? ''
}

function groupLabelFor(group: FuelGroup): string {
  return group === 'alpha' ? 'گروه Alpha' : 'گروه Beta'
}

function concentrationOutput(
  id: number,
  percent: number,
  waterM3: number | null,
  solutionM3: number | null,
  concentrateM3: number | null,
  durationMin: number | null,
): FireOutput {
  const incomplete = waterM3 === null
  return {
    id,
    label: label(id),
    value: waterM3 === null ? null : round(waterM3),
    unit: 'm³',
    status: incomplete ? 'insufficient' : 'ok',
    basis: incomplete
      ? [
          '§۶ حجم محلول فوم',
          durationMin === null
            ? 'مدت تخلیه این سناریو تعریف نشده، پس حجم محلول محاسبه نشد'
            : 'داده کافی نیست',
        ]
      : [
          '§۶ محلول و کنسانتره',
          `Vمحلول = Q × t / 1000 = ${fmt(solutionM3 ?? 0)} m³`,
          `Vکنسانتره = ${fmt(solutionM3 ?? 0)} × ${percent / 100} = ${fmt(concentrateM3 ?? 0)} m³`,
          `Vآب = ${fmt(solutionM3 ?? 0)} − ${fmt(concentrateM3 ?? 0)} = ${fmt(waterM3)} m³`,
        ],
    figures: incomplete
      ? []
      : [
          { label: 'حجم محلول فوم', value: round(solutionM3 ?? 0), unit: 'm³' },
          { label: `حجم کنسانتره ${percent}٪`, value: round(concentrateM3 ?? 0), unit: 'm³' },
        ],
    missing: incomplete ? ['مدت‌زمان تخلیه سناریوی انتخابی'] : [],
    note: `کنسانتره ${percent}٪ جداگانه در جمع آب نیامده است`,
  }
}

function stopOutputs(missing: string[]): FireOutput[] {
  return OUTPUT_LABELS.map((o) => ({
    id: o.id,
    label: o.label,
    value: null,
    unit: o.unit,
    status: 'insufficient' as OutputStatus,
    basis: [],
    missing,
    note: null,
  }))
}

/**
 * §۱۰ — دبی پمپ از جمع تمام دبی‌های فومینگ، کولینگ و نازل‌ها با ضریب اطمینان
 * به دست می‌آید، و سایز لوله بر همان دبی و با هیزن–ویلیامز انتخاب می‌شود.
 *
 * اگر قطر لوله وارد نشده باشد، کوچک‌ترین قطر کتابخانه‌ای که سرعت جریان در آن از
 * حد مجاز بیشتر نشود انتخاب می‌شود. اگر قطر وارد شده باشد همان استفاده می‌شود و
 * سرعتش گزارش می‌شود تا قابل بازبینی باشد.
 */
function pumpDuty(
  hydraulic: HydraulicInput | null,
  designFlowLpm: number,
  _missing: string[],
): { output: FireOutput } {
  const needs: string[] = []
  const L = n(hydraulic?.pipeLengthM ?? null)
  const C = n(hydraulic?.cFactor ?? null)
  const Hs = n(hydraulic?.staticHeadM ?? null)
  const residual = n(hydraulic?.residualBar ?? null)
  const enteredDia = n(hydraulic?.pipeDiameterMm ?? null)

  if (L === null || L <= 0) needs.push('طول لوله')
  if (C === null || C <= 0) needs.push('ضریب C هیزن–ویلیامز')
  if (Hs === null) needs.push('ارتفاع استاتیک')
  if (residual === null) needs.push('فشار باقی‌مانده در دورترین خروجی')

  if (needs.length > 0) {
    return {
      output: {
        id: 12,
        label: label(12),
        value: null,
        unit: '',
        status: 'insufficient',
        basis: ['§۱۰ — محاسبه هیزن–ویلیامز با داده‌های طراحی سایت'],
        missing: needs,
        note: 'مقدار فرضی ساخته نشد',
      },
    }
  }

  const qM3s = designFlowLpm / 60000
  const velocityOf = (dMm: number) => qM3s / ((Math.PI / 4) * (dMm / 1000) ** 2)
  const frictionOf = (dMm: number, c: number) => {
    const dM = dMm / 1000
    const S = (qM3s / (0.278 * c * dM ** 2.63)) ** (1 / 0.54)
    return S * (L as number)
  }

  const candidates =
    enteredDia !== null && enteredDia > 0
      ? [enteredDia]
      : PIPE_LIBRARY_MM.filter((dn) => velocityOf(dn) <= MAX_VELOCITY_M_S)

  if (candidates.length === 0) {
    return {
      output: {
        id: 12,
        label: label(12),
        value: null,
        unit: '',
        status: 'insufficient',
        basis: [
          '§۱۰ هیزن–ویلیامز',
          `Q = ${fmt(designFlowLpm)} L/min`,
          `هیچ قطری در کتابخانه سرعت مجاز ${MAX_VELOCITY_M_S} m/s را رعایت نمی‌کند`,
        ],
        missing: ['قطر لوله بزرگ‌تر از کتابخانه — ورود دستی قطر'],
        note: 'قطر نامناسب انتخاب نشد',
      },
    }
  }

  const dMm = candidates[0]
  const velocity = velocityOf(dMm)
  const hf = frictionOf(dMm, C as number)
  const totalHeadM = (Hs as number) + hf
  const pressureBar =
    (WATER_DENSITY_KG_M3 * GRAVITY_M_S2 * totalHeadM) / 1e5 + (residual as number)
  const autoSelected = enteredDia === null || enteredDia <= 0

  return {
    output: {
      id: 12,
      label: label(12),
      value: round(pressureBar),
      unit: 'bar',
      status: 'ok',
      figures: [
        { label: 'دبی پمپ (جمع کل با ضریب اطمینان)', value: round(designFlowLpm), unit: 'L/min' },
        { label: autoSelected ? 'سایز لوله انتخاب‌شده' : 'سایز لوله ورودی', value: dMm, unit: 'mm' },
        { label: 'سرعت جریان در لوله', value: round(velocity, 3), unit: 'm/s' },
        { label: 'افت اصطکاکی hf', value: round(hf), unit: 'm' },
        { label: 'هد کل پمپ', value: round(totalHeadM), unit: 'm' },
      ],
      basis: [
        '§۱۰ هیزن–ویلیامز',
        `دبی پمپ = دبی کل با ضریب اطمینان = ${fmt(designFlowLpm)} L/min`,
        autoSelected
          ? `انتخاب سایز: کوچک‌ترین قطر با سرعت ≤ ${MAX_VELOCITY_M_S} m/s → DN${dMm} mm`
          : `قطر ورودی: ${dMm} mm (سرعت ${fmt(velocity, 3)} m/s، حد مجاز ${MAX_VELOCITY_M_S} m/s)`,
        `v = Q / A = ${qM3s.toExponential(3)} / ${((Math.PI / 4) * (dMm / 1000) ** 2).toExponential(3)} = ${fmt(velocity, 3)} m/s`,
        `S = (Q / (0.278 · C · d^2.63))^(1/0.54) = ${(frictionOf(dMm, C as number) / (L as number)).toExponential(3)}`,
        `hf = S × L = ${fmt(hf)} m`,
        `H = ${fmt(Hs as number)} + ${fmt(hf)} = ${fmt(totalHeadM)} m`,
        `P = ρ·g·H / 1e5 + ${residual} bar = ${fmt(pressureBar)} bar`,
      ],
      missing: [],
      note: `طول لوله ${fmt(L as number)} m · C = ${C}${autoSelected ? ' · سایز لوله خودکار انتخاب شد' : ''}`,
    },
  }
}

function coolingSystem(
  name: string,
  spacing: RingSpacingInput | null,
  H: number,
  circumferenceM: number,
  _missing: string[],
): { rings: number | null; sprinklers: number | null; perRing: number | null; line: string } {
  const ring = n(spacing?.ringSpacingM ?? null)
  const spk = n(spacing?.sprinklerSpacingM ?? null)
  if (ring === null || ring <= 0 || spk === null || spk <= 0) {
    return {
      rings: null,
      sprinklers: null,
      perRing: null,
      line: `${name}: فاصله رینگ/اسپرینکلر ثبت نشده`,
    }
  }
  const rings = Math.ceil(H / ring)
  const perRing = Math.ceil(circumferenceM / spk)
  return {
    rings,
    sprinklers: rings * perRing,
    perRing,
    line: `${name}: رینگ = CEIL(${H} / ${ring}) = ${rings} · نازل هر رینگ = CEIL(${circumferenceM.toFixed(2)} / ${spk}) = ${perRing} · کل نازل = ${rings} × ${perRing} = ${rings * perRing}`,
  }
}
