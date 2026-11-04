// Checks for the fire-fighting calculation engine.
//
// Asserts the engine against «دستورالعمل نهایی برای موتور محاسبات شوگو» section by
// section — including the things it must REFUSE to do: assume a value the
// instruction does not give, emit an output outside §۱۲, or continue when the
// design data is missing.

import {
  CHAMBER_AREA_STEP_M2,
  COOLING_DURATION_MIN,
  COOLING_RATE_LMIN_M2,
  FIRE_FUELS,
  OUTPUT_LABELS,
  SAFETY_FACTOR,
  SCENARIOS,
  calculate,
  scenariosForRoof,
  type FireCalcInput,
} from '../src/lib/fire'

import { SHELL_COOLING_FRACTION } from '../src/lib/coolingArea'

let passed = 0
let failed = 0

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++
    console.log(`  PASS  ${name}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ''}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ''}`)
  }
}

const near = (a: number | null, b: number, tol = 0.01) =>
  a !== null && Math.abs(a - b) <= Math.max(tol, Math.abs(b) * 1e-6)

const out = (r: ReturnType<typeof calculate>, id: number) => {
  const o = r.outputs.find((x) => x.id === id)
  if (!o) throw new Error(`output ${id} missing`)
  return o
}

/** A sub-figure owned by an output — e.g. the monitor count under §۳-ب. */
const figure = (r: ReturnType<typeof calculate>, id: number, label: string) =>
  out(r, id).figures?.find((f) => f.label === label)?.value ?? null

function base(over: Partial<FireCalcInput> = {}): FireCalcInput {
  return {
    fuelKey: 'naft_kham',
    diameterM: 30,
    heightM: 15,
    roofType: 'fixed',
    scenario: 'foam_chamber',
    sealWidthM: null,
    bundwallAreaM2: null,
    bundwallLengthM: null,
    bundwallWidthM: null,
    monitor: null,
    adjacent: [],
    hydraulic: null,
    directSpray: null,
    rundown: null,
    ...over,
  }
}

const PI = Math.PI
const fullArea = (d: number) => (PI / 4) * d * d
const shellArea = (d: number, h: number) => PI * d * h
// مساحت ریم سیل = اختلاف مساحت سطح با قطر D و سطح با قطر D − W
const annular = (d: number, w: number) => (PI / 4) * (d * d - (d - w) ** 2)

console.log('\n§۲ — دسته‌بندی مواد نفتی')
check('eight products are offered', FIRE_FUELS.length === 8, FIRE_FUELS.length)
check('Alpha holds exactly the five listed products',
  FIRE_FUELS.filter((f) => f.group === 'alpha').map((f) => f.key).join(',') ===
    'benzin,nafte_safid,naft_kham_torsh,naft_kham,aloodeh')
check('Beta holds exactly the three listed products',
  FIRE_FUELS.filter((f) => f.group === 'beta').map((f) => f.key).join(',') ===
    'naft_koreh,naft_kham_sangin,nafte_gaz')
check('the group follows the product, never a manual choice',
  calculate(base({ fuelKey: 'naft_koreh' })).group === 'beta' &&
  calculate(base({ fuelKey: 'benzin' })).group === 'alpha')

console.log('\n§۳-الف — جدول فوم‌چمبر و دبی هر چمبر')
const chamberCount = (d: number) => out(calculate(base({ diameterM: d })), 3)
const chamberN = (d: number) => {
  const line = chamberCount(d).basis.find((b) => b.includes('→ N =')) ?? ''
  const m = line.match(/N = (\d+)/)
  return m ? Number(m[1]) : null
}
check('24 m → 1', chamberN(24) === 1, chamberN(24))
check('24.01 m → 2', chamberN(24.01) === 2, chamberN(24.01))
check('37 m → 2', chamberN(37) === 2, chamberN(37))
check('37.01 m → 3', chamberN(37.01) === 3, chamberN(37.01))
check('43 m → 3', chamberN(43) === 3, chamberN(43))
check('49 m → 4', chamberN(49) === 4, chamberN(49))
check('55 m → 5', chamberN(55) === 5, chamberN(55))
check('61 m → 6', chamberN(61) === 6, chamberN(61))
check('61.01 m → 6 + 1 (first step of excess area)', chamberN(61.01) === 7, chamberN(61.01))
const d100 = 100
const expected100 =
  6 + Math.ceil(Math.max(0, fullArea(d100) - fullArea(61)) / CHAMBER_AREA_STEP_M2)
check(`100 m → 6 + CEIL(excess / ${CHAMBER_AREA_STEP_M2}) = ${expected100}`,
  chamberN(d100) === expected100, chamberN(d100))

const r30 = calculate(base())
check('§۳-الف Qfoam = A × 4.1 = 2898.12 L/min',
  near(out(r30, 1).value, fullArea(30) * 4.1), out(r30, 1).value)
check('§۳-الف Qchamber = Qfoam / N = 1449.06 L/min',
  near(out(r30, 3).value, (fullArea(30) * 4.1) / 2), out(r30, 3).value)
check('§۳-الف duration follows the group: Alpha → 55 min',
  out(calculate(base({ fuelKey: 'benzin' })), 14).value === 55)
check('§۳-الف duration follows the group: Beta → 30 min',
  out(calculate(base({ fuelKey: 'naft_koreh' })), 14).value === 30)

console.log('\n§۳-ب — مانیتور یا هوزدستی')
const rMon = calculate(base({
  scenario: 'monitor_handhose',
  monitor: { model: 'M-2000', capacityLpm: 1900 },
}))
check('§۳-ب rate is 6.5 L/min/m² → 4594.58 L/min',
  near(out(rMon, 4).value, fullArea(30) * 6.5), out(rMon, 4).value)
check('equipment count = CEIL(required / capacity) = 3',
  figure(rMon, 4, 'تعداد تجهیز لازم') === 3, out(rMon, 4).figures)
check('the installed flow is reported, not left to be inferred',
  near(figure(rMon, 4, 'دبی نصب‌شده (تعداد × ظرفیت)'), 3 * 1900), out(rMon, 4).figures)
check('the count never leaves the installed flow below the requirement',
  (figure(rMon, 4, 'دبی نصب‌شده (تعداد × ظرفیت)') ?? 0) >= fullArea(30) * 6.5)
check('Beta duration is 50 min for the monitor scenario',
  out(calculate(base({ scenario: 'monitor_handhose', fuelKey: 'naft_koreh' })), 14).value === 50)
const rNoCap = calculate(base({ scenario: 'monitor_handhose' }))
check('a fixed capacity is never invented when the model is absent',
  out(rNoCap, 4).missing.length > 0 && out(rNoCap, 4).note !== null)

// The worked example for a fixed-roof tank on monitor / hand-hose, figure by
// figure: D = 30 m, H = 12 m, gasoline (Alpha), one 900 L/min unit.
const ex = calculate(base({
  fuelKey: 'benzin',
  heightM: 12,
  scenario: 'monitor_handhose',
  monitor: { model: 'مدل نمونه', capacityLpm: 900 },
}))
check('worked example — A = π × 30² / 4 = 706.86 m²',
  near(fullArea(30), 706.86), fullArea(30))
check('worked example — Q = A × 6.5 = 4594.58 L/min',
  near(out(ex, 1).value, fullArea(30) * 6.5), out(ex, 1).value)
check('worked example — N = CEIL(4594.6 / 900) = 6',
  figure(ex, 4, 'تعداد تجهیز لازم') === 6, figure(ex, 4, 'تعداد تجهیز لازم'))
check('worked example — installed flow = 6 × 900 = 5400 L/min',
  near(figure(ex, 4, 'دبی نصب‌شده (تعداد × ظرفیت)'), 5400),
  figure(ex, 4, 'دبی نصب‌شده (تعداد × ظرفیت)'))
check('worked example — 5400 ≥ 4594.6, so the capacity is adequate',
  (figure(ex, 4, 'دبی نصب‌شده (تعداد × ظرفیت)') ?? 0) >= 4594.6)
check('worked example — V solution = 4594.6 × 65 / 1000 = 298.65 m³',
  near(figure(ex, 5, 'حجم محلول فوم'), 298.65), figure(ex, 5, 'حجم محلول فوم'))
check('worked example — water at 3% = 298.65 − 8.96 = 289.69 m³',
  near(out(ex, 5).value, 289.69), out(ex, 5).value)
check('worked example — water at 6% = 298.65 − 17.92 = 280.73 m³',
  near(out(ex, 6).value, 280.73), out(ex, 6).value)
check('worked example — Alpha → t = 65 min', out(ex, 14).value === 65)
check('worked example — the monitor is its own scenario, so it is counted once',
  near(out(ex, 9).value, 298.65) &&
    !out(ex, 10).basis.some((b) => b.startsWith('مانیتور/هوزدستی')),
  out(ex, 10).basis)
check('worked example — the larger water figure governs the storage volume',
  near(out(ex, 16).value, 1850.01), out(ex, 16).value)
const exBeta = calculate(base({
  fuelKey: 'naft_koreh',
  heightM: 12,
  scenario: 'monitor_handhose',
  monitor: { model: 'مدل نمونه', capacityLpm: 900 },
}))
check('worked example — Beta → t = 50 min with the same rate',
  out(exBeta, 14).value === 50 && near(out(exBeta, 1).value, fullArea(30) * 6.5),
  out(exBeta, 14).value)

console.log('\n§۴-الف — غرق‌شدن سقف و حریق سطح کامل')
const rSunk = calculate(base({ roofType: 'external_floating', scenario: 'sunk_full_surface' }))
check('the area is the whole tank', near(out(rSunk, 1).value, fullArea(30) * 4.1), out(rSunk, 1).value)
check('the rate is 4.1 L/min/m²', out(rSunk, 1).basis.some((b) => b.includes('× 4.1')))
check('no duration is invented for this scenario', out(rSunk, 14).status === 'insufficient')
check('and therefore no solution volume is invented',
  out(rSunk, 5).status === 'insufficient' && out(rSunk, 5).value === null)

console.log('\n§۴-ب و §۴-ج — ناحیه سیل شناور خارجی')
const rTop = calculate(base({ roofType: 'external_floating', scenario: 'top_of_seal' }))
check('seal area uses Di = D − W with W = 0.6 → 27.99 m²',
  near(out(rTop, 1).value, annular(30, 0.6) * 12.2), out(rTop, 1).value)
check('top-of-seal rate is 12.2 L/min/m²', out(rTop, 1).basis.some((b) => b.includes('12.2')), out(rTop, 1).value)
check('top-of-seal duration is 20 min', out(rTop, 14).value === 20)
check('the rim-seal substitution shows D and D−W',
  out(rTop, 1).basis.some((b) => b.includes('D−W')))
check('solution at 20 min = A × 12.2 × 20 / 1000', near(out(rTop, 5).value, (annular(30, 0.6) * 12.2 * 20) / 1000 * 0.97), out(rTop, 5).value)

const rBelow = calculate(base({ roofType: 'external_floating', scenario: 'below_the_seal' }))
check('below-the-seal rate is 20.4 L/min/m²', out(rBelow, 1).basis.some((b) => b.includes('20.4')))
check('below-the-seal duration is 10 min', out(rBelow, 14).value === 10)

const rW = calculate(base({ roofType: 'external_floating', scenario: 'top_of_seal', sealWidthM: 2 }))
check('a user-supplied W replaces the 0.6 default',
  near(out(rW, 1).value, annular(30, 2) * 12.2), out(rW, 1).value)

// رابطهٔ سقف ↔ تجهیز: سقف شناور با فوم‌چمبر اطفا می‌شود و مانیتور/شوزدستی ندارد.
check('a floating roof is fought with foam chambers, not monitors (output 4 is out of scope)',
  out(rTop, 4).status === 'na' && out(rTop, 4).value === null)
check('and the chamber flow is computed for the floating roof', out(rTop, 3).status === 'ok',
  out(rTop, 3).value)
check('the chamber count splits the rim-seal foam flow',
  out(rTop, 3).value !== null && Math.abs((out(rTop, 3).value as number) - (out(rTop, 1).value as number) / 2) < 0.02,
  out(rTop, 3).value)
check('the floating-roof chamber note says monitors are not used there',
  (out(rTop, 3).note ?? '').includes('فوم‌چمبر'), out(rTop, 3).note)

console.log('\n§۵ — سقف شناور داخلی')
const rInt = calculate(base({ roofType: 'internal_floating', scenario: 'internal_seal' }))
check('seal fire uses the annular area, 12.2 L/min/m² and 20 min',
  near(out(rInt, 1).value, annular(30, 0.6) * 12.2) && out(rInt, 14).value === 20)
check('only the seal scenario is offered for an internal floating roof',
  scenariosForRoof('internal_floating').length === 1)

console.log('\n§۶ — محلول و کنسانتره')
check('both 3% and 6% are computed',
  out(r30, 5).value !== null && out(r30, 6).value !== null)
const sol30 = (fullArea(30) * 4.1 * 55) / 1000
check('3% water = Vsolution × 0.97', near(out(r30, 5).value, sol30 * 0.97), out(r30, 5).value)
check('6% water = Vsolution × 0.94', near(out(r30, 6).value, sol30 * 0.94), out(r30, 6).value)
check('the concentrate is reported separately from the water',
  out(r30, 5).basis.some((b) => b.includes('Vکنسانتره')))

console.log('\n§۷ — کولینگ')
check('rate is 4.1 L/min/m² over π·D·H = 5796.24 L/min',
  near(out(r30, 2).value, shellArea(30, 15) * COOLING_RATE_LMIN_M2), out(r30, 2).value)
check('cooling duration is 240 min', out(r30, 15).value === COOLING_DURATION_MIN)
check('cooling volume = Q × 240 / 1000 = 1391.10 m³',
  near(out(r30, 7).value, (shellArea(30, 15) * COOLING_RATE_LMIN_M2 * 240) / 1000), out(r30, 7).value)

console.log('\n§۸ — تجهیزات مجاور و Worst Case')
const rAdj = calculate(base({
  adjacent: [
    { name: 'T-2', diameterM: 20, heightM: 12, coolingPercent: 100 },
    { name: 'T-3', diameterM: 10, heightM: 8, coolingPercent: 50 },
  ],
}))
const expAdj =
  (shellArea(20, 12) * SHELL_COOLING_FRACTION * COOLING_RATE_LMIN_M2 * 1.0 * 240) / 1000 +
  (shellArea(10, 8) * SHELL_COOLING_FRACTION * COOLING_RATE_LMIN_M2 * 0.5 * 240) / 1000
check('each adjacent tank is cooled at the percentage the user sets',
  near(out(rAdj, 8).value, expAdj), { got: out(rAdj, 8).value, expected: expAdj })
check('50% halves that tank\'s cooling', near(
  out(calculate(base({ adjacent: [{ name: 'x', diameterM: 10, heightM: 8, coolingPercent: 50 }] })), 8).value,
  (shellArea(10, 8) * SHELL_COOLING_FRACTION * COOLING_RATE_LMIN_M2 * 0.5 * 240) / 1000))

check('the monitor is counted once when it is the selected scenario',
  !calculate(base({
    scenario: 'monitor_handhose',
    monitor: { model: 'M', capacityLpm: 2000 },
  })).outputs.find((o) => o.id === 10)!.basis.some((b) => b.includes('مانیتور/هوزدستی')),
)
check('it is counted as its own consumer otherwise',
  calculate(base({ monitor: { model: 'M', capacityLpm: 2000 } }))
    .outputs.find((o) => o.id === 10)!.basis.some((b) => b.includes('مانیتور/هوزدستی')))
check('concentrate is never added into the water total',
  !out(r30, 10).basis.some((b) => b.includes('کنسانتره = ')))

console.log('\n§۹ — ضریب اطمینان ۱.۲ یک‌بار')
check('the factor is 1.2', SAFETY_FACTOR === 1.2)
const baseWater =
  sol30 * 0.97 + (shellArea(30, 15) * COOLING_RATE_LMIN_M2 * 240) / 1000
check('Vdesign = Vbase × 1.2 = 4338.49 m³', near(out(r30, 10).value, baseWater * 1.2), out(r30, 10).value)
const baseFlow = fullArea(30) * 4.1 + shellArea(30, 15) * COOLING_RATE_LMIN_M2
check('Qdesign = Qbase × 1.2 = 20781.64 L/min', near(out(r30, 11).value, baseFlow * 1.2), out(r30, 11).value)
check('the factor is applied once, not to each component',
  near(out(r30, 10).value, baseWater * SAFETY_FACTOR) &&
  !near(out(r30, 10).value, baseWater * SAFETY_FACTOR ** 2))
check('the storage tank volume equals the design water volume',
  out(r30, 16).value === out(r30, 10).value)

console.log('\n§۱۰ — پمپ و جوکی‌پمپ')
const rPump = calculate(base({
  hydraulic: { pipeLengthM: 200, pipeDiameterMm: 200, cFactor: 120, staticHeadM: 10, residualBar: 7 },
}))
check('the pump pressure is solved with Hazen-Williams once the site data is there',
  out(rPump, 12).status === 'ok' && (out(rPump, 12).value ?? 0) > 7, out(rPump, 12).value)
check('the pump flow is the design flow (sum of all demands + safety factor)',
  (() => {
    const f = out(rPump, 12).figures?.find((x) => x.label.includes('دبی پمپ'))
    const expected = (out(rPump, 11).value ?? 0)
    return f !== undefined && Math.abs(f.value - expected) < 0.01
  })(),
  out(rPump, 12).figures)
check('pressure rises with pipe length', (() => {
  const a = calculate(base({ hydraulic: { pipeLengthM: 100, pipeDiameterMm: 200, cFactor: 120, staticHeadM: 10, residualBar: 7 } }))
  return (out(a, 12).value ?? 0) < (out(rPump, 12).value ?? 0)
})())
check('a missing term stops the pump output instead of a guessed figure',
  out(r30, 12).status === 'insufficient' && out(r30, 12).value === null)
check('and the missing terms are named',
  out(r30, 12).missing.includes('طول لوله') && out(r30, 12).missing.includes('ضریب C هیزن–ویلیامز'))
check('jockey pump specs are not guessed',
  out(r30, 13).value === null && out(r30, 13).status !== 'ok')

console.log('\n§۱۱ — رینگ‌ها و اسپرینکلرها')
const rRings = calculate(base({
  directSpray: { ringSpacingM: 3.7, sprinklerSpacingM: 5 },
  rundown: { ringSpacingM: 5, sprinklerSpacingM: 7.5 },
}))
check('both modes are reported', out(rRings, 17).status === 'ok' &&
  out(rRings, 17).basis.some((b) => b.startsWith('Direct Spray')) &&
  out(rRings, 17).basis.some((b) => b.startsWith('Rundown')))
check('rings = CEIL(H / spacing) = 5 for Direct Spray',
  out(rRings, 17).basis.some((b) => b.startsWith('Direct Spray') && b.includes('= 5 ')))
check('sprinklers = rings × CEIL(circumference / spacing) = 5 × 19 = 95',
  out(rRings, 17).basis.some((b) => b.startsWith('Direct Spray') && b.includes('= 95')),
  out(rRings, 17).basis)
check('both nozzle counts are shown as figures so the designer can choose', (() => {
  const f = out(rRings, 17).figures ?? []
  const labels = f.map((x) => x.label).join(' | ')
  return (
    labels.includes('Direct Spray — تعداد رینگ') &&
    labels.includes('Direct Spray — تعداد آب‌پاش (نازل)') &&
    labels.includes('Rundown — تعداد رینگ') &&
    labels.includes('Rundown — تعداد آب‌پاش (نازل)')
  )
})())
check('Direct Spray count is 5 rings × 19 = 95 nozzles',
  (out(rRings, 17).figures ?? []).some((x) => x.label.includes('Direct Spray — تعداد آب‌پاش') && x.value === 95))
check('Rundown count is 3 rings × 13 = 39 nozzles',
  (out(rRings, 17).figures ?? []).some((x) => x.label.includes('Rundown — تعداد آب‌پاش') && x.value === 39),
  out(rRings, 17).figures)
check('spacing the reference does not define is never invented',
  out(r30, 17).status === 'insufficient' && out(r30, 17).missing.length === 2)

console.log('\n§۱۰ — انتخاب خودکار سایز لوله')
const rAuto = calculate(base({
  hydraulic: { pipeLengthM: 200, pipeDiameterMm: null, cFactor: 120, staticHeadM: 10, residualBar: 7 },
}))
check('with no diameter the engine selects a pipe size itself', out(rAuto, 12).status === 'ok',
  out(rAuto, 12).figures)
check('the selected size is reported as a figure', (() => {
  const f = out(rAuto, 12).figures?.find((x) => x.label.includes('سایز لوله انتخاب‌شده'))
  return f !== undefined && Number.isFinite(f.value) && f.unit === 'mm'
})())
check('the velocity in the selected pipe respects the engine limit',
  (() => {
    const f = out(rAuto, 12).figures?.find((x) => x.label.includes('سرعت جریان'))
    return f !== undefined && f.value <= 5
  })(),
  out(rAuto, 12).figures)
check('and the selection is labelled automatic', out(rAuto, 12).note?.includes('خودکار') ?? false,
  out(rAuto, 12).note)

console.log('\n§۱۲ — فقط همین ۱۷ خروجی')
check('exactly seventeen outputs', r30.outputs.length === 17, r30.outputs.length)
check('their ids run 1..17', r30.outputs.map((o) => o.id).join(',') ===
  Array.from({ length: 17 }, (_, i) => i + 1).join(','))
check('and the labels match §۱۲ verbatim',
  r30.outputs.every((o, i) => o.label === OUTPUT_LABELS[i].label))
check('no output appears that §۱۲ does not list',
  r30.outputs.every((o) => OUTPUT_LABELS.some((l) => l.id === o.id)))

console.log('\n§۱۳ — محدودیت‌های پیاده‌سازی')
const stopper = calculate(base({ roofType: null, scenario: null }))
check('a missing roof stops the calculation', !stopper.ok)
check('...and every output is reported as missing data, not zero',
  stopper.outputs.every((o) => o.status === 'insufficient' && o.value === null) &&
  stopper.outputs.length === 17)
check('the missing essential inputs are named',
  stopper.missing.includes('نوع سقف') && stopper.missing.includes('سناریوی اطفا'))
check('a roof without a scenario stops too', !calculate(base({ scenario: null })).ok)
check('an impossible roof+scenario pair is refused, not bent to the nearest',
  !calculate(base({ roofType: 'internal_floating', scenario: 'foam_chamber' })).ok)
const noFuel = calculate(base({ fuelKey: null }))
check('a missing product stops the calculation', !noFuel.ok && noFuel.missing.includes('نوع ماده نفتی'))
check('a zero diameter is refused rather than dividing by it',
  !calculate(base({ diameterM: 0 })).ok)
check('an absurd seal width is refused rather than producing a negative ring',
  (() => {
    const r = calculate(base({ roofType: 'external_floating', scenario: 'top_of_seal', sealWidthM: 35 }))
    return !r.ok && r.missing.includes('عرض ناحیه سیل (باید کمتر از قطر مخزن باشد)')
  })())
check('a seal width just under the diameter is accepted, not refused',
  (() => {
    const r = calculate(base({ roofType: 'external_floating', scenario: 'top_of_seal', sealWidthM: 25 }))
    return r.ok || !r.missing.includes('عرض ناحیه سیل (باید کمتر از قطر مخزن باشد)')
  })())

console.log('\nکامل — مسیر سالم')
check('a fully-specified fixed-roof tank computes end to end',
  calculate(base({ monitor: { model: 'M', capacityLpm: 2000 },
    hydraulic: { pipeLengthM: 150, pipeDiameterMm: 250, cFactor: 120, staticHeadM: 8, residualBar: 7 },
    directSpray: { ringSpacingM: 3.7, sprinklerSpacingM: 5 },
    rundown: { ringSpacingM: 5, sprinklerSpacingM: 7.5 },
  })).outputs.filter((o) => o.id !== 13).every((o) => o.status === 'ok'))
check('every computed output carries its basis',
  calculate(base()).outputs.filter((o) => o.status === 'ok').every((o) => o.basis.length > 0))
check('a fully-specified external floating tank computes end to end',
  calculate(base({ roofType: 'external_floating', scenario: 'below_the_seal', sealWidthM: 0.6,
    hydraulic: { pipeLengthM: 150, pipeDiameterMm: 250, cFactor: 120, staticHeadM: 8, residualBar: 7 },
    directSpray: { ringSpacingM: 3.7, sprinklerSpacingM: 5 },
    rundown: { ringSpacingM: 5, sprinklerSpacingM: 7.5 },
  })).outputs.filter((o) => ![3, 4, 9, 13].includes(o.id)).every((o) => o.status === 'ok'))
check('§۳-ب is reported out of scope on a floating roof, not silently applied',
  out(calculate(base({ roofType: 'external_floating', scenario: 'below_the_seal' })), 4).status === 'na')
check('the jockey-pump gap is reported as undefined by the reference, not as user data',
  out(r30, 13).status === 'not_defined')

console.log('\n§۳–§۵ — ثابت‌های نرخ و زمان')
check('the scenario table holds exactly the six scenarios the instruction defines',
  SCENARIOS.length === 6, SCENARIOS.map((s) => s.id))

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
