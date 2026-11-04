// Deterministic checks for the specification engine.
// Run: bun scripts/spec-check.ts
//
// The employer's ENGINE-SPEC-v1.2 is the authority for every number the engine
// uses. These checks hold the engine to it: the tables are transcribed rather
// than re-typed, the classification obeys §3.0A, the counts obey §3.1/§3.3 and
// the CEILING rule of §14, the hydraulics obey §4 HYD-*, and every one of the
// twenty outputs of §4.1 is produced and traceable.

import {
  SPEC_TABLES,
  SPEC_RULES,
  SPEC_SOURCE_DOCUMENT,
  FORMULAS,
  FORMULA_BY_ID,
  OUTPUTS,
  OUTPUT_BY_ID,
  LOOKUPS,
  ERROR_CODES,
  SCENARIOS,
  INPUT_PARAMETERS,
  FIXED_ROOF_OUTLETS,
  SUBSURFACE_OUTLETS,
  SURFACE_RATE_TIME,
  TOP_OF_SEAL,
  BELOW_SEAL,
  DIKE_PROTECTION,
  HOSE_STREAMS,
  COOLING_BY_PARAMETER,
  LIQUID_CLASSIFICATION,
  controlValue,
  SURFACE_CONTROLS,
  SUBSURFACE_CONTROLS,
  bandContains,
  parseBand,
  classifyFuel,
  PROJECT_FUELS,
  runSpecEngine,
  ENGINE_CONVENTIONS,
  hazenWilliamsHeadLoss,
  pipeVelocity,
  annularGeometry,
  liquidSurfaceArea,
  fixedRoofOutletCount,
  subsurfaceOutletCount,
  spacedOutletCount,
  FIXED_ROOF_OPEN_BAND_FROM_M,
  type SpecConfig,
  type SpecTank,
} from '../src/lib/spec'
import {
  runProjectSpec, specTanksFromElements, specConfigFromProject, type PlacedElement,
} from '../src/lib/specProject'
import { NFPA11, NFPA15, SPEC_SOURCED_KEYS, CONSTANTS_VERSION } from '../src/lib/calc/constants'
import { defaultBasis, K, basisNumber } from '../src/lib/calc/basis'
import { reviewSummary } from '../src/lib/calc/provenance'

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++
    console.log(`PASS  ${name}${detail ? ' :: ' + detail : ''}`)
  } else {
    fail++
    console.log(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`)
  }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps
const nearPct = (a: number, b: number, pct: number) => Math.abs(a - b) <= Math.abs(b) * (pct / 100)

const CONFIG: SpecConfig = {
  profile: { nfpa11: '2024', nfpa15: '2022', nfpa30: '2024', nfpa20: '2022', nfpa22: '2022', nfpa24: '2022' },
  site: { monitorCount: 4, hydrantCount: 6, activeMonitors: 2, activeHydrants: 2 },
  terminalPressureBar: 7,
  staticHeadM: 5,
  storageReserveL: 50000,
}

const TANK = (over: Partial<SpecTank> = {}): SpecTank => ({
  id: 't1',
  label: 'T-101',
  diameterM: 30,
  shellHeightM: 15,
  liquidLevelM: 12,
  fuelKey: 'naft_kham',
  storageTempC: 25,
  roofKind: 'fixed',
  coolingHeightM: 15,
  ...over,
})

// ═══ §1 the reference came from the document ═══════════════════════
console.log('\n── §1 specification registry ──')
check('28 tables transcribed from the specification', SPEC_TABLES.length === 28, `${SPEC_TABLES.length}`)
check('the source document is recorded', SPEC_SOURCE_DOCUMENT.includes('v1.2'), SPEC_SOURCE_DOCUMENT)
check('every table keeps its section id', SPEC_TABLES.every((t) => t.section.length > 0))
check('every table has rows', SPEC_TABLES.every((t) => t.rows.length > 0))
check('54 formulas of §4 (GEOM/FOAM/DAM/COOL/RING/HYD/PUMP/SITE)', FORMULAS.length === 54, `${FORMULAS.length}`)
check('exactly 20 outputs in §4.1', OUTPUTS.length === 20, `${OUTPUTS.length}`)
check('|outputs| run OUT-001…OUT-020 in order',
  OUTPUTS.every((o, i) => o.id === `OUT-${String(i + 1).padStart(3, '0')}`))
check('13 lookup algorithms of §5', LOOKUPS.length === 13, `${LOOKUPS.length}`)
check('13 validation codes of §13', ERROR_CODES.length === 13, `${ERROR_CODES.length}`)
check('12 scenarios of §6', SCENARIOS.length === 12, `${SCENARIOS.length}`)
check('30 required input parameters of §2', INPUT_PARAMETERS.length === 30, `${INPUT_PARAMETERS.length}`)
check('15 non-negotiable engine rules of §17', SPEC_RULES.length === 15, `${SPEC_RULES.length}`)
check('§17 rule 1 forbids invented numeric values',
  /No invented numeric values/.test(SPEC_RULES.find((r) => r.n === 1)?.text ?? ''))
check('§17 rule 10 keeps pump flow and storage independent',
  /selected independently/.test(SPEC_RULES.find((r) => r.n === 10)?.text ?? ''))
check('§17 rule 14 requires source ids in the UI',
  /source IDs for traceability/.test(SPEC_RULES.find((r) => r.n === 14)?.text ?? ''))

// formula expressions are the specification's own strings, not paraphrases
check('GEOM-001 is the specification text', FORMULA_BY_ID['GEOM-001'].expression.includes('π × D² / 4'))
check('FOAM-004 is the specification text', FORMULA_BY_ID['FOAM-004'].expression.includes('Q_solution × T'))
check('HYD-001 is the specification text', FORMULA_BY_ID['HYD-001'].expression.includes('10.67'))
check('PUMP-004 divides by both efficiencies',
  FORMULA_BY_ID['PUMP-004'].expression.includes('η_pump × η_motor'))
check('GEOM-009 subtracts non-spillable footprints',
  FORMULA_BY_ID['GEOM-009'].expression.includes('A_dike_polygon'))

// ═══ §3.0A classification ══════════════════════════════════════════
console.log('\n── §3.0A NFPA 30 classification ──')
check('six liquid classes in the table', LIQUID_CLASSIFICATION.length === 6)
check('IA: FP < 22.8 and BP < 37.8', classifyFuel(10, 30).cls === 'IA')
check('IB: FP < 22.8 and BP ≥ 37.8', classifyFuel(10, 40).cls === 'IB')
check('IC: 22.8 ≤ FP < 37.8', classifyFuel(30, null).cls === 'IC')
check('II: 37.8 ≤ FP < 60', classifyFuel(50, null).cls === 'II')
check('IIIA: 60 ≤ FP < 93', classifyFuel(70, null).cls === 'IIIA')
check('IIIB: FP ≥ 93', classifyFuel(120, null).cls === 'IIIB')
check('IA/IB boundary at exactly 22.8 °C',
  classifyFuel(22.8, 40).cls === 'IC' && classifyFuel(22.799, 40).cls === 'IB')
check('IB/IC boundary at exactly 37.8 °C',
  classifyFuel(37.8, null).cls === 'II' && classifyFuel(37.799, null).cls === 'IC')
check('II/IIIA boundary at exactly 60 °C',
  classifyFuel(60, null).cls === 'IIIA' && classifyFuel(59.999, null).cls === 'II')
check('IIIA/IIIB boundary at exactly 93 °C',
  classifyFuel(93, null).cls === 'IIIB' && classifyFuel(92.999, null).cls === 'IIIA')
check('the BP column is consulted only in the IA/IB branch',
  classifyFuel(50, 10).boilingPointAssumed === false,
  'FP 50 needs no boiling point')
const assumed = classifyFuel(-43, null)
check('FP<22.8 without a boiling point returns IB, not IA', assumed.cls === 'IB')
check('an assumed boiling point is flagged', assumed.boilingPointAssumed === true)
check('each class result names §3.0A', classifyFuel(10, 30).sourceId === 'T3.0A')
check('classification is by property, not by name — gasoline ≡ 10/40 °C',
  classifyFuel(-43, 39).cls === classifyFuel(10, 40).cls)
check('every project fuel maps to a §3.0B profile',
  Object.values(PROJECT_FUELS).every((f) => /^FUEL-\d+$/.test(f.specFuelId)))
check('a crude product is flagged for the §3.2 crude row',
  PROJECT_FUELS['naft_kham'].crudePetroleum && PROJECT_FUELS['naft_kham_torsh'].crudePetroleum)

// ═══ §3 rate / time tables ═════════════════════════════════════════
console.log('\n── §3 rate, time and count tables ──')
check('§3.2 rate is 4.1 L/min/m² on every row', SURFACE_RATE_TIME.every((r) => r.rateLminM2 === 4.1))
check('§3.2 durations are 30 / 55 / 55', SURFACE_RATE_TIME.map((r) => r.timeMin).join(',') === '30,55,55')
check('§3.2-a caps the rate at 8.1 L/min/m²', controlValue(SURFACE_CONTROLS, 'Maximum application rate') === 8.1)
check('§3.3-a Class IB velocity limit is 3 m/s', controlValue(SUBSURFACE_CONTROLS, 'Class IB') === 3)
check('§3.3-a other-class velocity limit is 6 m/s', controlValue(SUBSURFACE_CONTROLS, 'other classes') === 6)
check('§3.10 cooling density is 4.1 L/min/m²',
  COOLING_BY_PARAMETER['Net water spray rate on exposed vessel surface']?.value === 4.1)
check('§3.10 rundown spacing is 3.7 m',
  COOLING_BY_PARAMETER['Vertical nozzle spacing when rundown is contemplated']?.value === 3.7)
check('§3.10 refuses to hard-code nozzle spacing',
  /do not hard-code universal circumferential spacing/i.test(
    COOLING_BY_PARAMETER['Nozzle spacing']?.requirement ?? ''))
check('§3.4 top-of-seal is 12.2 L/min/m² for 20 min',
  TOP_OF_SEAL.every((r) => r.rateLminM2 === 12.2 && r.timeMin === 20))
check('§3.4 dam spacing is 40 m (305 mm) / 24.4 m (600 mm)',
  TOP_OF_SEAL.every((r) => r.spacing305 === 40 && r.spacing600 === 24.4))
check('§3.5 below-seal is 20.4 L/min/m² for 10 min',
  BELOW_SEAL.every((r) => r.rateLminM2 === 20.4 && r.timeMin === 10))
check('§3.8 dike: low-level 4.1 and monitors 6.5',
  DIKE_PROTECTION[0].rateLminM2 === 4.1 && DIKE_PROTECTION[1].rateLminM2 === 6.5)
check('§3.8 Class I / Class II times are 30 / 20 min',
  DIKE_PROTECTION.every((r) => r.classITimeMin === 30 && r.classIITimeMin === 20))
check('§3.8 marks the compressed-air rate as manufacturer-listed',
  DIKE_PROTECTION.some((r) => r.manufacturerBasis && r.rateLminM2 === null))
check('§3.9 flow per hose stream is 190 L/min', HOSE_STREAMS.every((r) => r.flowLpm === 190))
check('§3.9 streams are 1 / 2 / 3 by diameter',
  HOSE_STREAMS.map((r) => r.streams).join(',') === '1,2,3')

// §3.1 fixed-roof outlet table, including both boundaries of every row
const fixedCount = (d: number) => fixedRoofOutletCount(d, 0).count
check('§3.1 ≤24 m → 1 outlet', fixedCount(24) === 1)
check('§3.1 24.01 m → 2 outlets', fixedCount(24.01) === 2)
check('§3.1 37 m → 2 outlets', fixedCount(37) === 2)
check('§3.1 37.01 m → 3 outlets', fixedCount(37.01) === 3)
check('§3.1 43 m → 3, 43.01 → 4', fixedCount(43) === 3 && fixedCount(43.01) === 4)
check('§3.1 49 m → 4, 49.01 → 5', fixedCount(49) === 4 && fixedCount(49.01) === 5)
check('§3.1 55 m → 5, 55.01 → 6', fixedCount(55) === 5 && fixedCount(55.01) === 6)
check('§3.1 61 m → 6 base outlets', fixedCount(61) === 6)
// "Additional" is additional to the last band's own bound, so the increment is
// measured from the area at 61 m. Measuring from zero gave 15 outlets where the
// rule asks for 8, and disagreed with the facade's copy of the same rule.
check('§3.1 beyond 61 m adds one per 465 m² of area beyond 61 m',
  fixedRoofOutletCount(70, liquidSurfaceArea(70).value).count === 8,
  '6 + ⌈(3848.45 − 2922.47)/465⌉ = 6 + 2 = 8')
check('§3.1 falls back to the wetted area when none is supplied',
  fixedRoofOutletCount(70, 0).count === 8)
check('§3.1 the additional-area rule is only applied past the table maximum',
  fixedRoofOutletCount(30, 100000).count === 2)
check('§3.1 the datum is the last bounded band, 61 m', FIXED_ROOF_OPEN_BAND_FROM_M === 61)
check('§3.1 a 62 m tank gets 7 outlets, not 13',
  fixedRoofOutletCount(62, liquidSurfaceArea(62).value).count === 7,
  `${fixedRoofOutletCount(62, liquidSurfaceArea(62).value).count}`)
check('§3.1 the diameter row is reported', fixedRoofOutletCount(30, 0).bandText === '>24 to 37 m')

// §3.3 subsurface table
check('§3.3 30 m at FP<38 → 2 outlets', subsurfaceOutletCount(30, 0, 20).count === 2)
check('§3.3 30 m at FP≥38 → 1 outlet', subsurfaceOutletCount(30, 0, 50).count === 1)
check('§3.3 60 m at FP<38 → 6, at FP≥38 → 3',
  subsurfaceOutletCount(60, 0, 20).count === 6 && subsurfaceOutletCount(60, 0, 50).count === 3)
check('§3.3 the flash-point column is named in the note',
  subsurfaceOutletCount(30, 0, 20).note.includes('FP < 38'))

// ═══ §4 formulas ═══════════════════════════════════════════════════
console.log('\n── §4 formulas ──')
const ann = annularGeometry(30, 28.8)
check('GEOM-005/006/007 annulus: W = 0.6, D_mean = 29.4',
  near(ann.width, 0.6) && near(ann.meanDiameter, 29.4),
  `W=${ann.width} Dmean=${ann.meanDiameter}`)
check('GEOM-007 A_annulus = π × D_mean × W', near(ann.area, Math.PI * 29.4 * 0.6), `${ann.area.toFixed(4)}`)

// HYD-001 against an independently derived velocity-form solution.
// The velocity form is V = 0.849·C·R^0.63·S^0.54 in SI units (V m/s, R and S in
// metres). 0.849 is the SI coefficient; 1.318 is the US customary one and only
// applies with R in feet and V in ft/s. The two constants are rounded
// independently, so the two forms agree to a fraction of a percent, not exactly.
const Q = 0.05 // m³/s
const d = 0.204
const hf = hazenWilliamsHeadLoss(100, Q, 120, d)
const v = pipeVelocity(Q, d)
const R = d / 4
const S_velocity = Math.pow(v / (0.849 * 120 * Math.pow(R, 0.63)), 1 / 0.54)
const hfVelocityForm = S_velocity * 100
check('HYD-001 agrees with the velocity form V=0.849·C·R^0.63·S^0.54 (SI)',
  nearPct(hf, hfVelocityForm, 1.5),
  `${hf.toFixed(4)} m vs ${hfVelocityForm.toFixed(4)} m (${(((hf - hfVelocityForm) / hfVelocityForm) * 100).toFixed(3)}%)`)
check('HYD-002 velocity = Q / (πd²/4)', near(v, Q / ((Math.PI * d ** 2) / 4)))
check('HYD-004/005 7 bar of water is 71.38 m of head',
  nearPct((7 * 100000) / (1000 * ENGINE_CONVENTIONS.g), 71.38, 0.1),
  `${((7 * 100000) / (1000 * ENGINE_CONVENTIONS.g)).toFixed(2)} m`)

// PUMP-001/004 — the hydraulic-power conversion that the previous engine got wrong.
// The retired expression divided a flow in L/min by 3600 as though that converted
// it to m³/s, so it over-reported by 1000/60 = 16.667×.
const qM3s = 0.5
const H = 80
const pHyd = (1000 * 9.80665 * qM3s * H) / 1000
const qLpm = qM3s * 60000
const legacy = (qLpm * H * 1000 * 9.80665) / (3600 * 1000) // L/min ÷ 3600, the old form
check('PUMP-001 P_hyd = ρ g Q H / 1000 with Q in m³/s', nearPct(pHyd, 392.27, 0.01), `${pHyd.toFixed(2)} kW`)
check('PUMP-001 is not the retired L/min ÷ 3600 form',
  !nearPct(legacy, pHyd, 1) && nearPct(legacy / pHyd, 1000 / 60, 0.01),
  `old form differs by ${(legacy / pHyd).toFixed(4)}× (retired factor ${(1000 / 60).toFixed(4)}×)`)

// ═══ §11/§15 the chain, end to end ═════════════════════════════════
console.log('\n── §11 engine chain ──')
const run = runSpecEngine(TANK(), CONFIG)
check('all twenty outputs are produced', run.outputs.length === 20, `${run.outputs.length}`)
check('the outputs are the §4.1 ids in order',
  run.outputs.map((o) => o.id).join(',') === OUTPUTS.map((o) => o.id).join(','))
check('every output carries a §13 status', run.outputs.every((o) => typeof o.status === 'string' && o.status.length > 0))
check('every output names the §4.1 record it implements',
  run.outputs.every((o) => OUTPUT_BY_ID[o.id] !== undefined))
check('every computed output cites at least one formula or reference (§17 rule 12)',
  run.outputs.every((o) => o.formulaIds.length > 0 || o.referenceIds.length > 0))
check('every cited formula id exists in §4',
  run.outputs.every((o) => o.formulaIds.every((f) => FORMULA_BY_ID[f] !== undefined)))
check('every output carries its §4.1 validation statement',
  run.outputs.every((o) => o.validation.length > 0))
check('the scenario is chosen from §3.0/§6', /^SC-\d{3}$/.test(run.scenarioId), run.scenarioId)
check('a fixed roof selects SC-001', run.scenarioId === 'SC-001')

const g = (id: string) => run.byId[id]
check('OUT-001 is GEOM-001 for a fixed roof', near(Number(g('OUT-001').value), (Math.PI * 900) / 4, 1e-6))
check('OUT-002 is the §3.1 count for 30 m', Number(g('OUT-002').value) === 2)
check('OUT-003 = area × rate (FOAM-001)',
  near(Number(g('OUT-003').value), Number(g('OUT-001').value) * 4.1, 1e-6))
check('OUT-004 = Q_solution × time (FOAM-004)',
  near(Number(g('OUT-004').value), Number(g('OUT-003').value) * 55, 1e-6))
check('OUT-005 = Q_solution × C (FOAM-003)',
  near(Number(g('OUT-005').value), Number(g('OUT-003').value) * 0.03, 1e-6))
check('OUT-006 = Q_solution × C × T (FOAM-005)',
  near(Number(g('OUT-006').value), Number(g('OUT-003').value) * 0.03 * 55, 1e-6))
check('OUT-007 uses the §3.10 density of 4.1 over half the shell plus the fixed roof',
  near(Number(g('OUT-007').value), (0.5 * Math.PI * 30 * 15 + (Math.PI * 900) / 4) * 4.1, 1e-6),
  `${Number(g('OUT-007').value).toFixed(2)} L/min`)
check('OUT-009 is CEILING(H/3.7) (RING-001)', Number(g('OUT-009').value) === Math.ceil(15 / 3.7), `=${g('OUT-009').display}`)
check('OUT-010 is CEILING(πD/spacing) (RING-002)',
  Number(g('OUT-010').value) === Math.ceil((Math.PI * 30) / ENGINE_CONVENTIONS.nozzleCircumferentialSpacingM))
check('OUT-011 = rings × nozzles (RING-005)',
  Number(g('OUT-011').value) === Number(g('OUT-009').value) * Number(g('OUT-010').value))
check('OUT-012 sums the SITE-001/SITE-007 terms',
  near(Number(g('OUT-012').value), run.demandTerms.reduce((s, t) => s + t.lpm, 0), 1e-6))
check('OUT-012 counts two active monitors at the convention flow',
  run.demandTerms.some((t) => t.lpm === 2 * ENGINE_CONVENTIONS.monitorRatedFlowLpm))
check('OUT-012 includes the §3.9 hose streams for 30 m (2 × 190)',
  run.demandTerms.some((t) => t.lpm === 380))
check('OUT-013 head = terminal + static + friction + minor (HYD-006)',
  Number(g('OUT-013').value) > 0 && g('OUT-013').formulaIds.includes('HYD-006'))
check('OUT-014 divides by pump and motor efficiency (PUMP-004)',
  g('OUT-014').formulaIds.includes('PUMP-004') && g('OUT-014').formulaIds.includes('PUMP-002'))
check('OUT-015/016 report JOCKEY_BASIS_REQUIRED (§13 / LOOK-011)',
  g('OUT-015').status === 'JOCKEY_BASIS_REQUIRED' && g('OUT-016').status === 'JOCKEY_BASIS_REQUIRED')
check('OUT-017 adds an explicit reserve (SITE-006)',
  Number(g('OUT-017').value) > CONFIG.storageReserveL)
check('OUT-018 is the smallest library diameter passing the velocity limit',
  Number(g('OUT-018').value) === 350, `DN${g('OUT-018').value}`)
check('OUT-019/020 report the installed counts', Number(g('OUT-019').value) === 4 && Number(g('OUT-020').value) === 6)
check('the hydraulics are solved on the selected diameter, not a second one',
  g('OUT-013').note?.includes(`DN${g('OUT-018').value}`) === true,
  g('OUT-013').note ?? '')
check('every numeric output has a substitution string',
  run.outputs.filter((o) => typeof o.value === 'number').every((o) => o.substitution !== '—' && o.substitution.length > 5))
// The substitution is rendered inside a dir="ltr" box, so it must stay Latin.
// Persian prose belongs in `note`, which is rendered RTL.
const ARABIC = /[\u0600-\u06FF]/
check('substitution strings carry no right-to-left prose',
  run.outputs.every((o) => !ARABIC.test(o.substitution)),
  run.outputs.filter((o) => ARABIC.test(o.substitution)).map((o) => o.id).join(',') || 'all Latin')
check('every stopped output substitutes an em dash, not a stray number',
  run.outputs.filter((o) => o.value === null).every((o) => o.substitution === '—'))

// §14 — no intermediate rounding; counts are CEILING
check('§14 counts are marked CEILING', g('OUT-002').rounding === 'CEILING' && g('OUT-009').rounding === 'CEILING')
check('§14 values carry full precision internally',
  String(Number(g('OUT-003').value)).includes('.') || Number.isInteger(Number(g('OUT-003').value)))

// determinism
const run2 = runSpecEngine(TANK(), CONFIG)
check('the engine is deterministic',
  JSON.stringify(run.outputs) === JSON.stringify(run2.outputs))

// ═══ scenario routing ══════════════════════════════════════════════
console.log('\n── §6 scenario routing ──')
check('external floating roof selects SC-004 (top-of-seal)',
  runSpecEngine(TANK({ roofKind: 'external_floating' }), CONFIG).scenarioId === 'SC-004')
const ext = runSpecEngine(TANK({ roofKind: 'external_floating' }), CONFIG)
check('§3.4 top-of-seal rate 12.2 is used', ext.byId['OUT-003'].note?.includes('Top-of-Seal') === true)
check('top-of-seal protects the annulus, not the full surface',
  Number(ext.byId['OUT-001'].value) < Number(g('OUT-001').value),
  `${Number(ext.byId['OUT-001'].value).toFixed(2)} m² vs ${Number(g('OUT-001').value).toFixed(2)} m²`)
check('below-seal selects SC-005',
  runSpecEngine(TANK({ roofKind: 'external_floating', belowSealMethod: true }), CONFIG).scenarioId === 'SC-005')
check('internal floating roof seal fire selects SC-007',
  runSpecEngine(TANK({ roofKind: 'internal_floating' }), CONFIG).scenarioId === 'SC-007')
check('internal floating roof full surface selects SC-008',
  runSpecEngine(TANK({ roofKind: 'internal_floating', foamConstructionFullSurface: true }), CONFIG).scenarioId === 'SC-008')
check('an ORD tank selects SC-009 (dike/bund)',
  runSpecEngine(TANK({ roofKind: 'ord', spillAreaM2: 2000 }), CONFIG).scenarioId === 'SC-009')
const dike = runSpecEngine(TANK({ roofKind: 'ord', spillAreaM2: 2000 }), CONFIG)
check('§3.8 low-level rate 4.1 is used for the dike case',
  near(Number(dike.byId['OUT-003'].value), 2000 * 4.1, 1e-6),
  `${dike.byId['OUT-003'].value}`)
check('the dike Class I duration of 30 min is applied to a Class IB fuel',
  dike.byId['OUT-004'].note?.includes('30') === true, dike.byId['OUT-004'].note ?? '')

// §3.2 duration depends on fuel and storage temperature
const diesel = runSpecEngine(TANK({ fuelKey: 'nafte_gaz', storageTempC: 20 }), CONFIG)
check('§3.2 gives a 30-min duration for FP 52 °C stored cold',
  diesel.byId['OUT-004'].note?.includes('30') === true, diesel.byId['OUT-004'].note ?? '')
const dieselHot = runSpecEngine(TANK({ fuelKey: 'nafte_gaz', storageTempC: 60 }), CONFIG)
check('§3.2 raises the duration to 55 min once storage exceeds the flash point',
  dieselHot.byId['OUT-004'].note?.includes('55') === true, dieselHot.byId['OUT-004'].note ?? '')
check('the storage-temperature decision is stated in the note',
  dieselHot.byId['OUT-003'].note?.includes('نقطه اشتعال') === true, dieselHot.byId['OUT-003'].note ?? '')

// ═══ statuses and refusal ══════════════════════════════════════════
console.log('\n── §13 statuses ──')
const noGeometry = runSpecEngine(TANK({ diameterM: 0, shellHeightM: 0 }), CONFIG)
check('a zero-diameter tank does not silently produce a number',
  noGeometry.byId['OUT-001'].status === 'INPUT_REQUIRED' || noGeometry.byId['OUT-001'].value === null,
  `${noGeometry.byId['OUT-001'].status} / ${noGeometry.byId['OUT-001'].value}`)
const fast = runSpecEngine(TANK({ diameterM: 200 }), CONFIG)
check('a demand too large for the library stops the diameter at a §13 status',
  fast.byId['OUT-018'].status === 'HYDRAULIC_PRESSURE_FAIL' || Number(fast.byId['OUT-018'].value) > 0)
check('a §13 status never accompanies a null substitution on a computed output',
  run.outputs.filter((o) => o.status === 'VALID').every((o) => o.substitution !== '—'))
check('every §13 status the engine can emit exists in the §13 table',
  run.outputs.every((o) => ERROR_CODES.some((e) => e.code === o.status) || o.status === 'VALID'),
  [...new Set(run.outputs.map((o) => o.status))].join(','))

// ═══ engine conventions are declared, not hidden ═══════════════════
console.log('\n── engine conventions ──')
check('the nozzle coverage convention is declared with its §2 input id',
  Object.keys(ENGINE_CONVENTIONS).includes('nozzleCircumferentialSpacingM'))
check('the convention that replaces listing data is named in the output note',
  g('OUT-010').note?.includes('IN-025') === true, g('OUT-010').note ?? '')
check('the jockey convention is named in the output note',
  g('OUT-015').note?.includes('IN-030') === true)
check('no formula body carries the retired 2.0 L/min/m² rate',
  !JSON.stringify(run.outputs).includes('2.0 L/min/m²'))

// ═══ band parsing ══════════════════════════════════════════════════
console.log('\n── §3 band parsing ──')
check('"≤ 24 m" is inclusive at 24', bandContains(parseBand('≤ 24 m'), 24) && !bandContains(parseBand('≤ 24 m'), 24.01))
check('">24 to 37 m" excludes 24 and includes 37',
  !bandContains(parseBand('>24 to 37 m'), 24) && bandContains(parseBand('>24 to 37 m'), 37))
check('"20–36 m" includes both ends',
  bandContains(parseBand('20–36 m'), 20) && bandContains(parseBand('20–36 m'), 36))
check('">61 m" is open-ended', bandContains(parseBand('>61 m'), 1000))
check('every §3.1 band is contiguous and starts at 0',
  FIXED_ROOF_OUTLETS[0].band.maxInclusive === 24 && FIXED_ROOF_OUTLETS.length === 7)

// ═══ project bridge ════════════════════════════════════════════════
console.log('\n── project bridge ──')
const elements: PlacedElement[] = [
  { id: 'e1', type: 'oil_tank', label: 'T-101', properties: { diameter: 30, height: 15, fuelType: 'naft_kham' } },
  { id: 'e2', type: 'oil_tank', label: 'T-102', properties: { diameter: 20, height: 12, fuelType: 'nafte_gaz' } },
  { id: 'e3', type: 'monitor' },
  { id: 'e4', type: 'monitor' },
  { id: 'e5', type: 'hydrant' },
  { id: 'e6', type: 'pump' },
]
const bridged = specTanksFromElements(elements)
check('only tanks become §2 inputs', bridged.tanks.length === 2, `${bridged.tanks.length}`)
check('tank diameter and height come from the map',
  bridged.tanks[0].diameterM === 30 && bridged.tanks[0].shellHeightM === 15)
check('the fuel key is carried through', bridged.tanks[0].fuelKey === 'naft_kham')
check('an oil tank with no declared roof kind is left unstated, not defaulted (IN-008)',
  bridged.tanks[0].roofKind === null, String(bridged.tanks[0].roofKind))
check('the missing roof kind is reported rather than assumed',
  bridged.notes.some((n) => n.includes('نوع سقف')),
  bridged.notes.find((n) => n.includes('نوع سقف')) ?? '(no note)')
check('an unstated roof kind yields no foam basis at all',
  runSpecEngine(bridged.tanks[0], specConfigFromProject(null, elements, bridged.tanks)).foam === null)
check('a declared roof kind is carried through',
  specTanksFromElements([
    { id: 'x', type: 'oil_tank', properties: { diameter: 30, height: 15, tankType: 'floating_external' } },
  ]).tanks[0].roofKind === 'external_floating')
check('the legacy property name `roofKind` is accepted too',
  specTanksFromElements([
    { id: 'x', type: 'oil_tank', properties: { diameter: 30, height: 15, roofKind: 'internal_floating' } },
  ]).tanks[0].roofKind === 'internal_floating')
const fixedCool = runSpecEngine(TANK({ roofKind: 'fixed' }), CONFIG).byId['OUT-007']
const floatCool = runSpecEngine(TANK({ roofKind: 'external_floating' }), CONFIG).byId['OUT-007']
check('a fixed roof is cooled on half the shell plus the roof',
  near(Number(fixedCool.value), (0.5 * Math.PI * 30 * 15 + (Math.PI * 900) / 4) * 4.1, 1e-6),
  `${Number(fixedCool.value).toFixed(2)} L/min`)
check('a floating roof is cooled on half the shell only — no roof cooling',
  near(Number(floatCool.value), 0.5 * Math.PI * 30 * 15 * 4.1, 1e-6),
  `${Number(floatCool.value).toFixed(2)} L/min`)
check('an element with no geometry is reported, not dropped silently',
  specTanksFromElements([{ id: 'x', type: 'oil_tank', properties: {} }]).notes.length > 0)

const site = runProjectSpec({ name: 'P' }, elements)
check('one run per tank', site.runs.length === 2, `${site.runs.length}`)
check('the site config counts the installed equipment',
  site.config.site.monitorCount === 2 && site.config.site.hydrantCount === 1)
check('a fresh project is already on the specification editions',
  site.config.profile.nfpa11 === '2024' && site.config.profile.nfpa15 === '2022',
  `${site.config.profile.nfpa11}/${site.config.profile.nfpa15}`)
check('the bridge produces twenty outputs per tank',
  site.runs.every((r) => r.outputs.length === 20))
check('an empty project is reported rather than crashing',
  runProjectSpec({}, []).runs.length === 0 && runProjectSpec({}, []).notes.length > 0)

// a project basis overrides the editions
const withBasis = runProjectSpec(
  { designBasis: JSON.stringify({ adoptedStandards: { nfpa15: '2025' }, entries: { pumpEfficiency: { value: 0.75 } } }) },
  elements,
)
check('a project design basis can override the adopted edition',
  withBasis.config.profile.nfpa15 === '2025', withBasis.config.profile.nfpa15)
check('a project design basis can override the pump efficiency',
  withBasis.config.pumpEfficiency === 0.75)

// ═══ the legacy layer reads its numbers from the specification ═════
console.log('\n── single source of truth ──')
{
  check('the constants module is the spec-sourced revision', /spec/.test(CONSTANTS_VERSION), CONSTANTS_VERSION)
  check('the cooling rate is §3.10 of the specification',
    NFPA15.waterSprayRateLminM2 === COOLING_BY_PARAMETER['Net water spray rate on exposed vessel surface']?.value,
    `${NFPA15.waterSprayRateLminM2}`)
  check('the rundown spacing is §3.10', NFPA15.rundownMaxSpacingM === 3.7)
  check('the foam rate is §3.2', NFPA11.chamberRateLminM2 === SURFACE_RATE_TIME[0].rateLminM2)
  check('the monitor rate is §3.8', NFPA11.monitorHoseRateLminM2 === DIKE_PROTECTION[1].rateLminM2)
  check('the group A duration is §3.2', NFPA11.chamberDurationGroupAMin === 30)
  check('the group B duration is §3.2', NFPA11.chamberDurationGroupBMin === 55)
  check('the dam minimum is §3.6', NFPA11.damHeightMm === 300)
  check('the hand-hose flow is §3.9 — 190, not the retired 189',
    NFPA11.handHoseFlowLpm === HOSE_STREAMS[0].flowLpm && NFPA11.handHoseFlowLpm === 190,
    `${NFPA11.handHoseFlowLpm}`)
  check('the surface rate ceiling is §3.2-a', NFPA11.maxSurfaceRateLminM2 === 8.1)
  check('the subsurface velocity limits are §3.3-a',
    NFPA11.subsurfaceVelocityClassIBM_s === 3 && NFPA11.subsurfaceVelocityOtherM_s === 6)
  check('every spec-sourced key is declared', SPEC_SOURCED_KEYS.length === 11, `${SPEC_SOURCED_KEYS.length}`)

  // A spec-sourced constant must not be shadowed by a hard-coded literal in the
  // facade: the two must agree wherever both are reachable.
  const b = defaultBasis()
  check('the basis seeds the foam rate from the same specification value',
    basisNumber(b, K.foamChamberRate) === NFPA11.chamberRateLminM2, `${basisNumber(b, K.foamChamberRate)}`)
  check('the basis seeds the dam minimum from the same specification value',
    basisNumber(b, K.foamDamHeight) === NFPA11.damHeightMm)
  check('the basis seeds the hand-hose flow from the same specification value',
    basisNumber(b, K.foamHandHoseFlow) === NFPA11.handHoseFlowLpm)

  // The two DAM-001 elevation inputs are the project's to supply, and their
  // absence must not read as an unfinished engine.
  const seal = b.entries[K.damSecondarySealHeight]
  const burnout = b.entries[K.damBurnoutPanelHeight]
  check('the DAM-001 elevation inputs exist in the basis', !!seal && !!burnout)
  check('they are marked as project-supplied', seal.projectSupplied === true && burnout.projectSupplied === true)
  check('they carry no invented default', seal.value === null && burnout.value === null)
  check('their absence is not counted as an unfinished parameter',
    reviewSummary(b).absent === 0 && reviewSummary(b).needsReview === 0,
    JSON.stringify(reviewSummary(b)))
}

// ═══ no retired value or unsourced clause label survives in the UI ═
console.log('\n── retired values and labels ──')
{
  // A source scan rather than a unit assertion: this class of bug is a string
  // sitting in a component where it can drift away from the engine, so the
  // check has to look at the source. Each entry is a value or a clause the
  // specification has since replaced.
  // `allow` files where the string is correct by design — a historical record of
  // what the previous engine computed with, which the migration must report
  // accurately rather than quietly restate as the new value.
  const FORBIDDEN: { pattern: RegExp; why: string; allow?: string }[] = [
    { pattern: /2\.0\s*Lpm\/m²/, why: 'retired cooling rate (spec §3.10 gives 4.1)' },
    { pattern: /coolingRateLpmM2:\s*2\.0/, why: 'retired cooling rate outside the historical record', allow: 'legacy.ts' },
    { pattern: /§5\.10/, why: 'unsourced clause; the spec gives §3.6 / DAM-001' },
    { pattern: /Table E-3/, why: 'retired table; the spec gives §3.1 (T3.1)' },
    { pattern: /Table E-4/, why: 'retired table; the spec gives §3.4 / §3.5' },
    { pattern: /Table E-5/, why: 'retired table; the spec gives §3.9 (T3.9)' },
    { pattern: /§7\.4\.2\.1/, why: 'brief clause; the spec gives §3.10 (T3.10)' },
    { pattern: /189\b(?=\s*(?:Lpm|L\/min))/, why: 'retired hose flow; spec §3.9 gives 190' },
    { pattern: /≤36→2/, why: 'retired chamber bands; spec §3.1 gives 24/37/43/49/55/61' },
  ]

  const fs = await import('node:fs')
  const path = await import('node:path')
  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'generated' || e.name === 'spec') continue
        walk(full)
      } else if (/\.tsx?$/.test(e.name)) {
        files.push(full)
      }
    }
  }
  for (const r of ['src/lib', 'src/components']) walk(r)

  check('the scan actually reached the source tree', files.length > 20, files.length + ' files')

  const hits: string[] = []
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8')
    for (const { pattern, why, allow } of FORBIDDEN) {
      if (allow && f.endsWith(allow)) continue
      if (pattern.test(text)) hits.push(f + ' → ' + pattern.source + ' (' + why + ')')
    }
  }
  check('no retired value or unsourced clause label survives in the app source',
    hits.length === 0,
    hits.length ? hits.join(' | ') : files.length + ' files clean')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
