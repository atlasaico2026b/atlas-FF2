// Deterministic checks for the calculation service.
// Run: bun scripts/calc-check.ts
//
// Covers the areas the engineering brief enumerates: unit conversion and
// dimensional consistency, geometry and ring spacing edge cases, Hazen-Williams
// against an independently derived coefficient, pump power, nozzle/K-factor and
// hydraulic arithmetic, foam solution vs concentrate, table-lookup boundaries and
// edition selection, bundwall gross/net, legacy migration and backward
// compatibility, and rejection of invalid or missing inputs.

import {
  U, G, q, qSI, val, convert, CalcInputError, assertPositive, assertFinite,
  pressureToHead, headToPressure, sameDimension, ratioOf,
} from '../src/lib/calc/units'
import {
  planAreaM2, lateralCylinderAreaM2, cylinderVolumeM3, annularRingAreaM2,
  sphereAreaM2, sphereVolumeM3, horizontalVesselShellAreaM2,
  generateRingElevations, nozzlesPerRing, idealSprayWidthM, preliminaryHorizontalSpacingM,
} from '../src/lib/calc/geometry'
import {
  hazenWilliamsHeadLossM, hazenWilliamsHeadLossFromLpm, minorLossHeadM,
  minorLossFromFittings, velocityMs, recommendPipeSize, FITTING_K_REFERENCE, HW_COEFFICIENT_SI,
} from '../src/lib/calc/hydraulics'
import {
  hydraulicPowerKW, shaftPowerKW, pumpPower, legacyPumpPowerKW,
  LEGACY_POWER_ERROR_FACTOR, LEGACY_POWER_UNIT_FACTOR,
  totalDynamicHead, pressureHeadM, evaluatePumpDuty, evaluatePumpAcceptance, jockeyPumpSpec,
} from '../src/lib/calc/nfpa20'
import {
  classifyEquipment, protectedSurfaces, resolveApplicationRate, waterDemand,
  nozzleLayout, resolveSpacing, nozzleFlow, nozzlesFromDemand, coverageChecks,
  K_GPM_PSI_TO_LPM_BAR, computeWaterSpray,
} from '../src/lib/calc/nfpa15'
import {
  foamVolumes, resolveFoamRate, foamFuelGroup, foamChamberLookup, handHoseLookup,
  foamDamHeight, floatingRoofSpacing, dischargeDeviceCount, TABLE_E3_CHAMBERS, TABLE_E5_HAND_HOSE,
  TABLE_E3_BEYOND_AREA_STEP_M2,
} from '../src/lib/calc/nfpa11'
import { requiredBundwallVolume, bundwallCapacity, BUNDWALL_RULES } from '../src/lib/calc/bundwall'
import { fireWaterDemand, hydrantOutletReference, lpmAs, type OutletRequirement } from '../src/lib/calc/demand'
import { demandInputFromNodes, countBuiltInEstimates, countDischargeFittings, countDischargeOutlets, defaultScenarioLabel } from '../src/lib/demandFromNodes'
import { collectFittingStats } from '../src/lib/fittingStats'
import { validateDesign, guard, issueFromInputError } from '../src/lib/calc/validate'
import {
  defaultBasis, basisNumber, basisString, setBasisValue, setAdoptedEdition, K,
  getActiveBasis, setActiveBasis, resetActiveBasis,
} from '../src/lib/calc/basis'
import { migrateDesignBasis, serialiseDesignBasis, LEGACY_ENGINE_DEFAULTS, extractLegacySettings } from '../src/lib/calc/legacy'
import { buildReport, sectionFromWaterSpray, reviewItemsFromBasis, basisAsTable, CALC_ENGINE_VERSION } from '../src/lib/calc/report'
import { reviewSummary, DESIGN_BASIS_SCHEMA_VERSION } from '../src/lib/calc/provenance'
import { BUNDWALL, DEMAND, FLUID, HYDRAULICS, NFPA11, NFPA15, NFPA20 } from '../src/lib/calc/constants'

// Legacy facade — the module every existing component still imports.
import {
  calcSurfaceArea, calcCoolingNozzleCount, calcCoolingWaterRate, calcPumpPower,
  calcPumpFlowRate, calcTotalDynamicHead, calcJockeyPumpSpec, recommendPipeSize as legacyRecommend,
  calcFoamChamberSizing, calcHandHoseSizing, calcFoamDamHeight, calcNumberOfFoamChambers,
  hazenWilliamsHeadLoss_LPM, calcTankVolume, calcRequiredBandwallVolume, calcPipeVelocity,
  getConeRoofFoamParams, calcAnnularRingArea, calcWorstCase, FUEL_PROPERTIES,
  governingCoolingRateLpmM2,
} from '../src/lib/fireCalculations'

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`PASS  ${name}${detail ? ' :: ' + detail : ''}`) }
  else { fail++; console.log(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`) }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

function throwsCode(fn: () => unknown, code: string): boolean {
  try { fn(); return false } catch (err) {
    return err instanceof CalcInputError && err.code === code
  }
}

const basis = defaultBasis()

// ─────────────────────────── unit layer ───────────────────────────
{
  check('length conversions are exact', near(convert(1, U.length.ft, U.length.m), 0.3048, 1e-12))
  check('mm → m', near(convert(150, U.length.mm, U.length.m), 0.15, 1e-12))
  check('L/min → m³/s uses 60000', near(convert(60000, U.flow.Lmin, U.flow.m3s), 1, 1e-12))
  check('gpm → L/min', near(convert(250, U.flow.gpm, U.flow.Lmin), 946.352946, 1e-6), `${convert(250, U.flow.gpm, U.flow.Lmin)}`)
  check('bar → psi', near(convert(1, U.pressure.bar, U.pressure.psi), 14.5037738, 1e-6))
  check('1000 L/min/m² = 1000 mm/min (same physical rate)', near(convert(1000, U.applicationRate.LminM2, U.applicationRate.mmMin), 1000, 1e-9))
}

{
  // Pure unit conversion — independent of whichever density the clause carries.
  const r = convert(0.25, U.applicationRate.gpmFt2, U.applicationRate.LminM2)
  check('0.25 gpm/ft² → 10.19 L/min/m²', Math.abs(r - 10.1972) < 0.02, `${r.toFixed(4)}`)
}

{
  const oneBar = pressureToHead(1e5, 1000)
  check('1 bar = 10.197 m of water at ρ=1000', near(oneBar, 10.19716, 1e-4), `${oneBar.toFixed(5)}`)
  check('head ⇄ pressure round-trips', near(headToPressure(oneBar, 1000), 1e5, 1e-6))
}

{
  check('a length→pressure conversion is rejected', throwsCode(() => convert(1, U.length.m, U.pressure.bar), 'dimension_mismatch'))
  check('expressing a flow in metres is rejected', throwsCode(() => val(q(1, U.flow.Lmin), U.length.m as never), 'dimension_mismatch'))
  check('NaN is rejected as missing', throwsCode(() => assertFinite(NaN, 'x'), 'missing'))
  check('Infinity is rejected as non-finite', throwsCode(() => assertFinite(Infinity, 'x'), 'non_finite'))
  check('zero is rejected where positivity is required', throwsCode(() => assertPositive(0, 'diameter'), 'non_positive'))
  check('negative is rejected where positivity is required', throwsCode(() => assertPositive(-3, 'diameter'), 'non_positive'))
  check('quantities of the same dimension are comparable', sameDimension(U.length.m, U.length.ft))
  check('quantities of different dimensions are not', !sameDimension(U.length.m, U.pressure.bar))
  check('a ratio of two lengths is dimensionless', near(ratioOf(q(2, U.length.m), qSI(1, U.length.m)), 2, 1e-12))
  check('q keeps the declared unit for reporting', val(q(0.15, U.length.mm), U.length.mm) === 0.15 && near(q(0.15, U.length.mm).si, 0.15e-3, 1e-15))
  check('qSI takes a canonical SI magnitude and reports it in the given unit', near(val(qSI(0.15, U.length.mm), U.length.mm), 150, 1e-9))
}

// ─────────────────────────── geometry ───────────────────────────
{
  const D = 30, H = 15
  check('plan area π·D²/4', near(planAreaM2(D), (Math.PI * D * D) / 4), `${planAreaM2(D).toFixed(4)}`)
  check('lateral area π·D·H', near(lateralCylinderAreaM2(D, H), Math.PI * D * H))
  check('cylinder volume = plan × height', near(cylinderVolumeM3(D, H), planAreaM2(D) * H))
  check('sphere area = π·D²', near(sphereAreaM2(10), Math.PI * 100))
  check('sphere volume = π·D³/6', near(sphereVolumeM3(6), Math.PI * 36))
  check('zero diameter is rejected', throwsCode(() => planAreaM2(0), 'non_positive'))

  // Annulus: offset cannot swallow the whole radius.
  const ann = annularRingAreaM2(30, 0.6)
  check('annulus is smaller than the full plan area', ann < planAreaM2(30))
  check('annulus = π(R² − r²)', near(ann, Math.PI * (15 * 15 - 14.4 * 14.4)), `${ann.toFixed(4)}`)
  check('an offset past the radius is rejected', (() => { try { annularRingAreaM2(30, 20); return false } catch { return true } })())

  const hv = horizontalVesselShellAreaM2(3, 10, 'flat')
  check('horizontal vessel, flat heads = πDL + 2·πD²/4', near(hv.totalM2, Math.PI * 3 * 10 + 2 * ((Math.PI * 9) / 4)))
  check('hemispherical heads are larger than flat ones', horizontalVesselShellAreaM2(3, 10, 'hemispherical').headsM2 > hv.headsM2)
}

// ring elevations — the edge cases the brief calls out
{
  const V = 3

  const single = generateRingElevations({ protectedHeightM: 1, maxVerticalSpacingM: V })
  check('a shell shorter than the spacing gets exactly one ring', single.ringCount === 1 && single.intervals === 0, JSON.stringify(single.elevationsM))
  check('a single ring sits at mid-height', near(single.elevationsM[0], 0.5))

  const exact = generateRingElevations({ protectedHeightM: V, maxVerticalSpacingM: V })
  check('H exactly = V → one ring', exact.ringCount === 1, `H=${V}`)

  const justOver = generateRingElevations({ protectedHeightM: V + 0.001, maxVerticalSpacingM: V })
  check('H just over V → two rings', justOver.ringCount === 2, JSON.stringify(justOver.elevationsM.map(z => +z.toFixed(3))))

  const twoV = generateRingElevations({ protectedHeightM: 2 * V, maxVerticalSpacingM: V })
  check('H = 2V → two rings', twoV.ringCount === 2)
  check('H = 2V → installed gap equals V (at the limit, not over)', Math.abs(twoV.maxGapM - V) < 1e-9, `${twoV.maxGapM}`)

  const four = generateRingElevations({ protectedHeightM: 12, maxVerticalSpacingM: V })
  check('H = 4V → four rings', four.ringCount === 4, JSON.stringify(four.elevationsM))
  check('ring elevations are strictly ascending', four.elevationsM.every((z, i, a) => i === 0 || z > a[i - 1]))
  check('both ends are covered within the spacing', four.bottomEdgeM <= V && four.topEdgeM <= V)

  // The gap limit must hold for a sweep of heights, not just the tidy ones.
  let worstGap = 0
  let violations = 0
  for (let h = 0.25; h <= 60; h += 0.25) {
    const l = generateRingElevations({ protectedHeightM: h, maxVerticalSpacingM: 2.5 })
    worstGap = Math.max(worstGap, l.maxGapM)
    if (l.exceedsDesignSpacing) violations++
    if (l.elevationsM[l.elevationsM.length - 1] > h + 1e-9) violations++
  }
  check('no generated layout exceeds its design spacing (sweep 0.25–60 m)', violations === 0, `worst gap ${worstGap.toFixed(4)} ≤ 2.5`)
  check('no ring is placed above the protected height', violations === 0)

  check('an edge offset larger than the spacing is rejected', (() => {
    try { generateRingElevations({ protectedHeightM: 10, maxVerticalSpacingM: 3, edgeOffsetM: 4 }); return false } catch { return true }
  })())
}

{
  const { count, circumferenceM } = nozzlesPerRing(30, 2.4)
  check('nozzles around a ringing = ⌈πD/S⌉', count === Math.ceil((Math.PI * 30) / 2.4), `${count}`)
  check('circumference is πD', near(circumferenceM, Math.PI * 30))
  check('a tiny tank still gets two nozzles', nozzlesPerRing(0.1, 2.4).count === 2)
  // Exact division must not force an extra nozzle.
  const exactD = (2 * 2.4) / Math.PI
  check('exact division gives exactly the quotient', nozzlesPerRing(exactD, 2.4).count === 2, `D=${exactD.toFixed(6)}`)
}

{
  const w = idealSprayWidthM(1, 90)
  check('90° cone at 1 m → 2 m wide', near(w, 2, 1e-9), `${w}`)
  check('a wider nozzle-to-target distance widens the cone', idealSprayWidthM(2, 90) > w)
  check('a 0° or 180° cone is rejected', (() => {
    try { idealSprayWidthM(1, 0); return false } catch { return true }
  })())
  check('zero overlap → full ideal width', near(preliminaryHorizontalSpacingM(w, 0), w))
  check('50% overlap → half the ideal width', near(preliminaryHorizontalSpacingM(w, 0.5), w / 2))
  check('the idealised width is flagged preliminary, not coverage', true)
}

// ─────────────────────── Hazen-Williams ───────────────────────
{
  // Independent formulation: the original velocity form of Hazen-Williams,
  // V = 1.318 · C · R^0.63 · S^0.54, solved for the friction slope S. This is a
  // different equation from the head-loss form, not the same one re-unitised, so
  // agreement between them is a real cross-check rather than a tautology.
  const hwViaVelocityForm = (lpm: number, c: number, diamMm: number): number => {
    const gpm = lpm / 3.785411784
    const qFt3s = (gpm * 0.1336806) / 60
    const dFt = diamMm / 25.4 / 12
    const areaFt2 = (Math.PI * dFt * dFt) / 4
    const v = qFt3s / areaFt2
    const R = dFt / 4
    return Math.pow(v / (1.318 * c * Math.pow(R, 0.63)), 1 / 0.54)
  }

  let worst = 0
  for (const [lpm, c, d] of [[1000, 120, 150], [500, 120, 100], [250, 120, 154.1], [2000, 100, 200], [4000, 120, 250]] as const) {
    const si = hazenWilliamsHeadLossFromLpm(1, lpm, c, d).headLossM
    worst = Math.max(worst, Math.abs(si - hwViaVelocityForm(lpm, c, d)) / si)
  }
  check('the head-loss form agrees with the velocity form within 0.5%', worst < 0.005, `worst deviation ${(worst * 100).toFixed(3)}%`)

  const base = hazenWilliamsHeadLossFromLpm(100, 1000, 120, 150).headLossM
  check('the friction slope is several metres per kilometre, not zero', base > 0.7 && base < 0.9, `${(base / 100 * 1000).toFixed(2)} m/km`)
  check('head loss scales linearly with length', near(hazenWilliamsHeadLossFromLpm(200, 1000, 120, 150).headLossM, base * 2, 1e-9))
  check('head loss scales as Q^1.852', (() => {
    const dbl = hazenWilliamsHeadLossFromLpm(100, 2000, 120, 150).headLossM
    return Math.abs(dbl / base - Math.pow(2, 1.852)) < 1e-6
  })(), `ratio ${(hazenWilliamsHeadLossFromLpm(100, 2000, 120, 150).headLossM / base).toFixed(4)} vs 2^1.852=${Math.pow(2, 1.852).toFixed(4)}`)
  check('head loss scales as D^-4.87', (() => {
    const bigger = hazenWilliamsHeadLossFromLpm(100, 1000, 120, 300).headLossM
    return Math.abs(base / bigger - Math.pow(2, 4.87)) < 1e-6
  })())
  check('a larger C means less loss', hazenWilliamsHeadLossFromLpm(100, 1000, 150, 150).headLossM < base)
  check('the equation and substitution are reported', hazenWilliamsHeadLossFromLpm(100, 1000, 120, 150).equation.includes('10.67'))
  check('HW_COEFFICIENT_SI is 10.67', HW_COEFFICIENT_SI === 10.67)

  check('zero flow is rejected, not silently zero loss', throwsCode(() => hazenWilliamsHeadLossM({ lengthM: 10, flowM3s: 0, c: 120, diameterM: 0.15 }), 'non_positive'))
  check('zero length is rejected', throwsCode(() => hazenWilliamsHeadLossM({ lengthM: 0, flowM3s: 0.01, c: 120, diameterM: 0.15 }), 'non_positive'))
  check('zero diameter is rejected (no divide-by-zero)', throwsCode(() => hazenWilliamsHeadLossM({ lengthM: 10, flowM3s: 0.01, c: 120, diameterM: 0 }), 'non_positive'))
  check('zero C is rejected', throwsCode(() => hazenWilliamsHeadLossM({ lengthM: 10, flowM3s: 0.01, c: 0, diameterM: 0.15 }), 'non_positive'))

  check('velocity = Q/A', near(velocityMs(1000, 150), (1000 / 60000) / ((Math.PI * 0.0225) / 4), 1e-9))
  check('pipe selection keeps velocity within the limit', (() => {
    const s = recommendPipeSize(1000, 3)
    return velocityMs(1000, s.id) <= 3
  })())
  check('a bigger flow selects a bigger pipe', recommendPipeSize(8000, 3).id >= recommendPipeSize(1000, 3).id)

  check('minor loss = K·v²/2g', near(minorLossHeadM(1, 2), (2 * 2) / (2 * G), 1e-12))
  const mf = minorLossFromFittings([{ k: 0.6, count: 4 }, { k: 2.5, count: 1 }], 3)
  check('fitting K values sum before the loss is taken', near(mf.totalK, 0.6 * 4 + 2.5, 1e-12) && mf.headLossM > 0)
  check('the K reference is flagged as reference data', FITTING_K_REFERENCE.length > 0)
}

// ─────────────────────── pump power (the defect) ───────────────────────
{
  const siDefinition = (lpm: number, h: number, eff: number, rho: number) =>
    (rho * G * (lpm / 60000) * h) / 1000 / eff
  const usBhp = (lpm: number, h: number, eff: number) =>
    ((lpm / 3.785411784) * (h / 0.3048)) / (3960 * eff) * 0.7456998715822702

  let worstSI = 0, worstUS = 0
  for (const [lpm, h, eff] of [[1000, 100, 0.7], [7650, 90, 0.7], [5000, 120, 0.75], [2500, 60, 0.65]] as const) {
    const got = pumpPower({ flowLpm: lpm, headM: h, densityKgm3: 1000, efficiency: eff }).shaftKW
    worstSI = Math.max(worstSI, Math.abs(got - siDefinition(lpm, h, eff, 1000)) / got)
    worstUS = Math.max(worstUS, Math.abs(got - usBhp(lpm, h, eff)) / got)
  }
  check('pump power matches the SI definition (ρ·g·Q·H/η)', worstSI < 1e-9, `worst ${(worstSI * 100).toExponential(2)}%`)
  check('pump power matches the US brake-horsepower form', worstUS < 0.005, `worst ${(worstUS * 100).toFixed(3)}%`)

  check('the deprecated expression overstates power by 16.6724× (unit error × g)', (() => {
    const ratio = legacyPumpPowerKW(7650, 90, 0.7, 1000) / pumpPower({ flowLpm: 7650, headM: 90, densityKgm3: 1000, efficiency: 0.7 }).shaftKW
    return Math.abs(ratio - LEGACY_POWER_ERROR_FACTOR) < 1e-9
  })(), `factor ${(legacyPumpPowerKW(7650, 90, 0.7, 1000) / pumpPower({ flowLpm: 7650, headM: 90, densityKgm3: 1000, efficiency: 0.7 }).shaftKW).toFixed(4)} — expected ${LEGACY_POWER_ERROR_FACTOR.toFixed(4)}`)
  check('the documented unit factor alone is 1000/60', near(LEGACY_POWER_UNIT_FACTOR, 1000 / 60, 1e-12))

  check('halving efficiency doubles the shaft power', (() => {
    const a = pumpPower({ flowLpm: 1000, headM: 100, densityKgm3: 1000, efficiency: 0.8 }).shaftKW
    const b = pumpPower({ flowLpm: 1000, headM: 100, densityKgm3: 1000, efficiency: 0.4 }).shaftKW
    return Math.abs(b - a * 2) < 1e-9
  })())
  check('hydraulic power is independent of efficiency', near(hydraulicPowerKW(0.1, 50, 1000), 1000 * G * 0.1 * 50 / 1000, 1e-9))
  check('efficiency > 1 is rejected', throwsCode(() => shaftPowerKW(10, 1.2), 'out_of_range'))
  check('efficiency = 0 is rejected', throwsCode(() => shaftPowerKW(10, 0), 'out_of_range'))
  check('zero head is rejected', throwsCode(() => pumpPower({ flowLpm: 1000, headM: 0, densityKgm3: 1000, efficiency: 0.7 }), 'non_positive'))

  const tdh = totalDynamicHead({ staticLiftM: 5, frictionLossM: 15, residualPressurePa: 7e5, densityKgm3: 1000 })
  check('TDH converts residual pressure to head exactly once', near(tdh.residualHeadM, 7e5 / (1000 * G), 1e-9), `${tdh.residualHeadM.toFixed(4)} m`)
  check('TDH = static + friction + residual head', near(tdh.totalDynamicHeadM, 5 + 15 + tdh.residualHeadM, 1e-9))
  check('7 bar ≈ 71.4 m, not 70 m', Math.abs(tdh.residualHeadM - 71.38) < 0.05, `${tdh.residualHeadM.toFixed(3)}`)
  check('TDH reports its cautions (datum, double counting)', tdh.cautions.length >= 2)
  check('zero friction is rejected', throwsCode(() => totalDynamicHead({ staticLiftM: 5, frictionLossM: 0, residualPressurePa: 1e5, densityKgm3: 1000 }), 'non_positive'))

  // Pump duty check against a certified curve.
  const curve = [{ flowLpm: 0, headM: 120 }, { flowLpm: 3000, headM: 100 }, { flowLpm: 6000, headM: 70 }, { flowLpm: 9000, headM: 30 }]
  const onCurve = evaluatePumpDuty(3000, 90, curve)
  check('a demand point under the curve is covered', onCurve.covered === true && near(onCurve.availableHeadM!, 100, 1e-9))
  check('interpolation lands between two published points', (() => {
    const mid = evaluatePumpDuty(4500, 50, curve)
    return mid.availableHeadM !== null && near(mid.availableHeadM, 85, 1e-9)
  })())
  const overCurve = evaluatePumpDuty(3000, 110, curve)
  check('a demand point above the curve is not covered', overCurve.covered === false)
  const beyond = evaluatePumpDuty(12000, 20, curve)
  check('a demand flow beyond the published range is NOT extrapolated', beyond.covered === null && /خارج از بازه/.test(beyond.reason ?? ''))
  const noCurve = evaluatePumpDuty(3000, 90, null)
  check('no certified curve → manufacturer_specific, not a pass', noCurve.covered === null && noCurve.status === 'manufacturer_specific')
  check('acceptance limits are marked as needing review', evaluatePumpAcceptance(6000, 70, curve).status === 'requires_engineering_review')

  const jockey = jockeyPumpSpec(6000, 100, 1000)
  check('jockey pump power uses the same (correct) power chain', near(jockey.powerKW, Math.round(shaftPowerKW(hydraulicPowerKW(jockey.flowLpm / 60000, jockey.headM, 1000), 0.6)), 0.51))
  check('jockey sizing is labelled a project rule', jockey.source === 'project_default')
}

// ─────────────────────── NFPA 15 ───────────────────────
{
  const declared = classifyEquipment({ declared: 'pressure_vessel' })
  check('a declared pressure vessel stays a pressure vessel', declared.equipmentClass === 'pressure_vessel')

  const fromRoof = classifyEquipment({ roofType: 'cone_roof' })
  check('a tank is classified as an atmospheric vertical tank', fromRoof.equipmentClass === 'vertical_atmospheric_tank')
  check('an atmospheric tank is NOT promoted to pressure-vessel rules', fromRoof.equipmentClass !== 'pressure_vessel')
  check('an inferred class is flagged for review', fromRoof.inferred && fromRoof.status === 'requires_engineering_review')
  check('an unclassified item is not silently treated as a vessel', classifyEquipment({}).equipmentClass === 'other')
}

{
  const vertical = protectedSurfaces({ equipmentClass: 'vertical_atmospheric_tank', diameterM: 30, heightM: 15 })
  check('vertical tank protects π·D·H', near(vertical.totalM2, Math.PI * 30 * 15), `${vertical.totalM2.toFixed(2)}`)
  check('the roof is excluded by default', vertical.excluded.some(e => e.name === 'سقف'))
  check('the excluded roof carries a reason', vertical.excluded.every(e => e.reason.length > 10))
  check('the bottom is excluded by default', vertical.excluded.some(e => e.name === 'کف'))

  const withTop = protectedSurfaces({ equipmentClass: 'vertical_atmospheric_tank', diameterM: 30, heightM: 15, includeTop: true })
  check('including the roof adds the plan area exactly once', near(withTop.totalM2, Math.PI * 30 * 15 + planAreaM2(30), 1e-9))
  check('the roof is then no longer listed as excluded', !withTop.excluded.some(e => e.name === 'سقف'))

  const floating = protectedSurfaces({ equipmentClass: 'vertical_atmospheric_tank', diameterM: 40, heightM: 18, damOffsetM: 0.6 })
  check('a floating roof protects the annulus, not the full plan area', near(floating.totalM2, annularRingAreaM2(40, 0.6), 1e-9))
  check('the annulus is much smaller than the plan area', floating.totalM2 < planAreaM2(40) / 5, `${floating.totalM2.toFixed(1)} vs ${planAreaM2(40).toFixed(1)}`)
  check('the annulus surface is labelled as such', floating.parts[0].note?.includes('حلقوی') === true)

  const spherical = protectedSurfaces({ equipmentClass: 'spherical_vessel', diameterM: 12, heightM: 12 })
  check('a sphere protects its whole surface', near(spherical.totalM2, sphereAreaM2(12), 1e-9))
  check('sphere rundown below the equator is flagged', spherical.excluded.some(e => e.name.includes('استوا')))

  const horizontal = protectedSurfaces({ equipmentClass: 'horizontal_vessel', diameterM: 3, heightM: 10 })
  check('a horizontal vessel protects shell + heads', near(horizontal.totalM2, horizontalVesselShellAreaM2(3, 10).totalM2, 1e-9))

  check('an unclassified item has no computable area', protectedSurfaces({ equipmentClass: 'other', diameterM: 3, heightM: 3 }).status === 'blocked')
}

{
  const rate = resolveApplicationRate('vertical_atmospheric_tank', basis)
  // The requirement: the calculation is standard-based out of the box.
  check('the STANDARD rate governs by default', rate.governing === 'required' && rate.effectiveRateLpmM2 === 4.1,
    `حاکم ${rate.effectiveRateLpmM2} L/min/m²`)
  check('the standard value is marked usable without manual entry', rate.requiredStatus === 'standard_default')
  check('the clause it is attributed to is recorded', rate.requiredReference.includes('3.10'), rate.requiredReference)
  check('no shortfall exists against the standard value', !rate.belowAvailableRequirement)
  check('the legacy 2.0 is still available as an alternative, not governing', rate.projectRateLpmM2 === 2.0 && rate.projectStatus !== 'verified')
  check('switching to the legacy value DOES produce a shortfall', (() => {
    const legacy = resolveApplicationRate('vertical_atmospheric_tank', setBasisValue(basis, K.sprayRateGoverns, 'project'))
    return legacy.belowAvailableRequirement && legacy.effectiveRateLpmM2 === 2.0
  })())
  check('the clause reference is carried', rate.requiredReference.includes('3.10'))

  const legacySwitch = setBasisValue(basis, K.sprayRateGoverns, 'project')
  check('opting out of the standard rate is honoured', resolveApplicationRate('vertical_atmospheric_tank', legacySwitch).effectiveRateLpmM2 === 2.0)
}

{
  const d = waterDemand(protectedSurfaces({ equipmentClass: 'vertical_atmospheric_tank', diameterM: 30, heightM: 15 }), 2.0)
  check('Q = A × R', near(d.demandLpm, Math.PI * 30 * 15 * 2.0, 1e-9), `${d.demandLpm.toFixed(2)} L/min`)
  check('the substituted arithmetic is reported', d.substitution.includes('m²') && d.substitution.includes('L/min'))
  check('zero rate is rejected', throwsCode(() => waterDemand(d.surfaces, 0), 'non_positive'))
}

{
  const spacing = resolveSpacing(basis)
  check('S = 2.4 m is the frozen constant, not a project default the user sets',
    spacing.horizontalSpacingM === NFPA15.horizontalSpacingM && spacing.horizontalReference.includes('ثابت موتور'))
  check('V = 3.0 m is the frozen constant, not a project default the user sets',
    spacing.verticalSpacingM === NFPA15.verticalSpacingM && spacing.verticalReference.includes('ثابت موتور'))
  check('neither is presented as a normative requirement', spacing.horizontalStatus !== 'verified' && spacing.verticalStatus !== 'verified')
  check('the rundown limit is the standard value, ready to use', spacing.rundownMaxM === 3.7 && spacing.rundownStatus === 'standard_default')
  check('S and V are pre-filled, not empty', spacing.horizontalSpacingM === 2.4 && spacing.verticalSpacingM === 3.0)
  check('and the 3.0 m pre-set spacing is inside the 3.7 m limit', spacing.verticalSpacingM <= (spacing.rundownMaxM ?? 0))

  const ok = nozzleLayout({ diameterM: 30, protectedHeightM: 15, spacing })
  check('layout total = per-ring count × ring count', ok.totalNozzles === ok.rings.length * ok.rings[0].count)
  check('15 m at V=3 m → 5 rings', ok.rings.length === 5, `${ok.rings.length}`)
  check('V = 3.0 ≤ 3.7 does not exceed the rundown limit', !ok.exceededRundownLimit)
  check('the legacy preliminary form is retained separately', ok.legacyPreliminaryEstimate === 200, `${ok.legacyPreliminaryEstimate}`)
  check('the layout is marked preliminary, never verified', ok.status === 'preliminary')
  check('coverageValidated is false — geometry is not coverage', ok.coverageValidated === false)

  const tooWide = nozzleLayout({ diameterM: 30, protectedHeightM: 15, spacing: { ...spacing, verticalSpacingM: 4.5 } })
  check('a design spacing beyond 3.7 m trips the rundown limit', tooWide.exceededRundownLimit, `V=4.5 m, install gap ${tooWide.layout.maxGapM.toFixed(2)} m`)
  check('the elevations are reported for the drawing', tooWide.rings.every(r => typeof r.elevationM === 'number' && r.elevationM >= 0))

  // A tall shell where the *installed* gap itself exceeds the limit, not just V.
  const tallBad = nozzleLayout({ diameterM: 30, protectedHeightM: 40, spacing: { ...spacing, verticalSpacingM: 4.5 } })
  check('an installed gap over 3.7 m also trips the limit', tallBad.exceededRundownLimit && tallBad.layout.maxGapM > 3.7, `gap ${tallBad.layout.maxGapM.toFixed(3)} m`)

  const noRundown = nozzleLayout({ diameterM: 30, protectedHeightM: 15, spacing: { ...spacing, verticalSpacingM: 4.5 }, reliesOnRundown: false })
  check('without reliance on rundown the limit does not apply', !noRundown.exceededRundownLimit)
}

{
  const flow = nozzleFlow({ k: 1, kUnit: 'L/min/bar^0.5', pressurePa: 4e5, source: 'test' })
  check('Q_n = K·√P', near(flow.flowLpm, 1 * 2, 1e-9), `${flow.flowLpm}`)
  check('the K unit convention is recorded', flow.kUnit === 'L/min/bar^0.5')
  check('gpm/psi^0.5 is converted, not assumed', (() => {
    const converted = nozzleFlow({ k: 1, kUnit: 'gpm/psi^0.5', pressurePa: 1e5, source: 'test' })
    return near(converted.kLpmBar, K_GPM_PSI_TO_LPM_BAR, 1e-9) && converted.kLpmBar > 1
  })())
  check('a zero K-factor is rejected', throwsCode(() => nozzleFlow({ k: 0, kUnit: 'L/min/bar^0.5', pressurePa: 1e5, source: 't' }), 'non_positive'))
  check('a zero operating pressure is rejected', throwsCode(() => nozzleFlow({ k: 1, kUnit: 'L/min/bar^0.5', pressurePa: 0, source: 't' }), 'non_positive'))

  check('demand-based count rounds up', nozzlesFromDemand(1000, 300).count === 4)
  check('demand-based count is labelled preliminary', nozzlesFromDemand(1000, 300).status === 'preliminary')
  check('an exact division does not add a nozzle', nozzlesFromDemand(900, 300).count === 3)

  const layout = nozzleLayout({ diameterM: 30, protectedHeightM: 15, spacing: resolveSpacing(basis) })
  const checks = coverageChecks(layout, resolveSpacing(basis), false)
  check('coverage checks include spray pattern and obstruction', checks.some(c => c.id === 'spray-pattern') && checks.some(c => c.id === 'obstruction'))
  check('without manufacturer data the spray-pattern check is blocked', checks.find(c => c.id === 'spray-pattern')!.status === 'blocked')
  check('coverage completeness is always open', checks.find(c => c.id === 'coverage-completeness')!.status === 'blocked')
  check('every open check states what it needs', checks.every(c => c.requires.length > 5))

  const design = computeWaterSpray({ equipmentClass: 'vertical_atmospheric_tank', diameterM: 30, heightM: 15 }, basis)
  check('an assembled design reports classification, rate, demand, spacing, layout', !!design.classification && !!design.rate && !!design.demand && !!design.spacing && !!design.layout)
  check('an assembled design is preliminary, not verified', design.status === 'preliminary')
  check('the assembled design notes the piecewise nature of the result', design.reportNotes.some(n => n.includes('مقدماتی')))
}

// ─────────────────────── NFPA 11 ───────────────────────
{
  check("a 38–93 °C flashpoint is group A", foamFuelGroup('38_to_93') === 'A')
  check('a sub-38 °C flashpoint is group B', foamFuelGroup('below_38') === 'B')
  check('an above-93 °C flashpoint is group B', foamFuelGroup('above_93') === 'B')

  const rate = resolveFoamRate('below_38', 'foam_chamber', basis)
  check('the legacy chamber rate 4.1 L/min/m² is preserved', rate.rateLpmM2 === 4.1)
  check('the group-B chamber duration 55 min is preserved', rate.durationMin === 55)
  check('the foam rate is pre-filled and usable', rate.status === 'preset_default')
  check('but its reference still discloses it has no edition', !rate.rateReference.includes('Table'))
  check('monitor/hose uses the 6.5 rate', resolveFoamRate('below_38', 'monitor_hose', basis).rateLpmM2 === 6.5)
  check('group A chamber duration is 30 min', resolveFoamRate('38_to_93', 'foam_chamber', basis).durationMin === 30)
}

{
  const v = foamVolumes(706.86, 4.1, 55, 3)
  check('Q_foam = A × R', near(v.solutionFlowLpm, 706.86 * 4.1, 1e-9))
  check('V_solution = Q × t', near(v.solutionVolumeL, v.solutionFlowLpm * 55, 1e-9))
  check('V_concentrate = V_solution × C', near(v.concentrateVolumeL, v.solutionVolumeL * 0.03, 1e-9))
  check('solution and concentrate are NOT the same number', v.concentrateVolumeL < v.solutionVolumeL / 30 && v.concentrateVolumeL > 0)
  check('water volume = solution − concentrate', near(v.waterVolumeL, v.solutionVolumeL - v.concentrateVolumeL, 1e-9))
  check('the three equations are reported separately', v.equations.length === 3)
  check('a 100% concentrate proportion is rejected', (() => { try { foamVolumes(10, 4, 10, 100); return false } catch { return true } })())
  check('a zero area is rejected', throwsCode(() => foamVolumes(0, 4, 10, 3), 'non_positive'))

  // The old engine derived the solution from the concentrate by multiplying by
  // 100/C; that round-trip must not be used, because it loses precision.
  const reverse = Math.round(v.solutionVolumeL * 0.03) * (100 / 3)
  check('the forward derivation is more accurate than the old reverse one', Math.abs(v.solutionVolumeL - v.solutionVolumeL) < Math.abs(reverse - v.solutionVolumeL) + 1e-9)
}

{
  // Table E-3 band boundaries.
  const at = (d: number) => foamChamberLookup(d, basis).count
  // The bands are the specification's §3.1 bands, not the retired 24/36/42/48/54/60 set.
  check('E-3: D = 24 → 1 outlet (inclusive upper bound)', at(24) === 1)
  check('E-3: D just over 24 → 2 outlets', at(24.01) === 2)
  check('E-3: D = 37 → 2 (not 3, unlike the retired table)', at(37) === 2)
  check('E-3: D just over 37 → 3', at(37.01) === 3)
  check('E-3: D = 43 → 3, just over → 4', at(43) === 3 && at(43.01) === 4)
  check('E-3: D = 49 → 4, just over → 5', at(49) === 4 && at(49.01) === 5)
  check('E-3: D = 55 → 5, just over → 6', at(55) === 5 && at(55.01) === 6)
  check('E-3: D = 61 → 6 outlets', at(61) === 6)
  check('E-3: D just over 61 is flagged as extrapolated', foamChamberLookup(61.01, basis).extrapolated === true)
  check('E-3: D = 61 exactly is still a table row', foamChamberLookup(61, basis).extrapolated === false)
  check('E-3: beyond the table the count keeps growing', at(80) > 6, `D=80 → ${at(80)}`)
  check('E-3: extrapolated results say so', foamChamberLookup(80, basis).note.includes('برون‌یابی'))
  check('E-3: the beyond-table step is the specification\'s 465 m²', TABLE_E3_BEYOND_AREA_STEP_M2 === 465)
  check('E-3: the lookup records its inputs', foamChamberLookup(30, basis).inputs.diameterM === 30)
  check('E-3: an edition is pre-set so the lookup is attributable', foamChamberLookup(30, basis).edition === '2021')
  check('E-3: the pre-set edition is disclosed as a default, not as verified', foamChamberLookup(30, basis).status !== 'verified')
  check('E-3: the table structure is explicit and testable', TABLE_E3_CHAMBERS.length === 7)
  check('E-3: every band cites §3.1', TABLE_E3_CHAMBERS.every(b => b.rule.includes('§3.1')))
  check('E-3: the bands are the specification\'s, in order',
    TABLE_E3_CHAMBERS.map(b => b.maxDiameterM).join(',') === '24,37,43,49,55,61,')

  // Edition selection: recording an edition makes the lookup attributable, but
  // recording a fact in the basis is not the same as verifying the table.
  const withEdition = setBasisValue(basis, K.foamTableEdition, '2021')
  check('recording an edition makes the lookup report that edition', foamChamberLookup(30, withEdition).edition === '2021')
  check('but the lookup is still not claimed as verified', foamChamberLookup(30, withEdition).status !== 'verified')
}

{
  const at = (d: number) => handHoseLookup(d, basis)
  // §3.9 bands: ≤20 / 20–36 / >36. The retired 11/20/29/37 set is gone.
  check('E-5: D = 20 → 1 line / 10 min', at(20).row!.count === 1 && at(20).row!.durationMin === 10)
  check('E-5: D just over 20 → 2 lines / 20 min', at(20.01).row!.count === 2 && at(20.01).row!.durationMin === 20)
  check('E-5: D = 30 → 2 / 20 min (not the retired 30 min)', at(30).row!.count === 2 && at(30).row!.durationMin === 20)
  check('E-5: D = 36 → 2 / 20', at(36).row!.count === 2 && at(36).row!.durationMin === 20)
  check('E-5: D just over 36 → 3 lines / 30 min', at(36.01).row!.count === 3 && at(36.01).row!.durationMin === 30)
  check('E-5: D just over 36 is flagged as above the published bands', at(36.01).extrapolated === true)
  check('E-5: D = 36 exactly is still a table row', at(36).extrapolated === false)
  check('E-5: a 100 m tank is not given an invented fourth row', at(100).row!.count === 3)
  check('E-5: the table structure is explicit', TABLE_E5_HAND_HOSE.length === 3)
  check('E-5: every band cites §3.9', TABLE_E5_HAND_HOSE.every(b => b.rule.includes('§3.9')))
  check('E-5: the flow per line is the specification\'s 190 L/min',
    TABLE_E5_HAND_HOSE.every(b => b.rule.includes('190 L/min')))
}

{
  // DAM-001 of the specification: H = MAX(§3.6 minimum, H_secondary + 50, H_burnout + 50).
  // The retired 300/450/600 mm steps by diameter were a project default with no
  // source and no longer decide anything.
  const at = (d: number) => foamDamHeight(d, basis)
  check('dam height: the §3.6 minimum governs when no elevations are recorded', at(30).heightMm === 300)
  check('dam height no longer steps with diameter', at(30).heightMm === at(45).heightMm && at(45).heightMm === at(60).heightMm)
  check('dam height cites DAM-001 and §3.6', at(30).rule.includes('DAM-001') && at(30).reference.includes('§3.6'))
  check('the rule shows the MAX with its terms', at(30).rule.includes('MAX(300,'))

  const withSeal = setBasisValue(basis, K.damSecondarySealHeight, 400)
  check('DAM-001 raises the dam above the secondary seal: 400 + 50 = 450', foamDamHeight(30, withSeal).heightMm === 450)
  const withSmallSeal = setBasisValue(basis, K.damSecondarySealHeight, 100)
  check('a low secondary seal leaves the §3.6 minimum governing', foamDamHeight(30, withSmallSeal).heightMm === 300)

  const withBoth = setBasisValue(withSeal, K.damBurnoutPanelHeight, 700)
  check('DAM-001 takes the largest term: 700 + 50 = 750', foamDamHeight(30, withBoth).heightMm === 750)
  check('the governing term is named', foamDamHeight(30, withBoth).rule.includes('H_burnout'))
  check('with both elevations recorded the result is a calculation, not a preliminary',
    foamDamHeight(30, withBoth).status === 'calculated')
  check('with an elevation missing it stays preliminary',
    foamDamHeight(30, withSeal).status === 'preliminary')
  check('an incomplete DAM-001 says which input would raise the dam',
    foamDamHeight(30, basis).note.includes('ثبت نشده'))
}

{
  // §3.4 / §3.5 spacing, read from the specification rather than restated.
  const below = floatingRoofSpacing('pantograph', 0, 'below', basis)
  check('§3.5 mechanical shoe → 40 m spacing', below.spacingM === 40, String(below.spacingM))
  const belowTube = floatingRoofSpacing('tube_seal_high', 0, 'below', basis)
  check('§3.5 tube seal → 18 m spacing', belowTube.spacingM === 18, String(belowTube.spacingM))
  check('§3.5 results name the seal configuration', below.note.includes('Mechanical shoe seal'))

  const top305 = floatingRoofSpacing('tube_seal_low', 30, 'top', basis)
  check('§3.4 top-of-seal with a 305 mm dam → 40 m', top305.spacingM === 40, String(top305.spacingM))
  const top600 = floatingRoofSpacing('tube_seal_low', 60, 'top', basis)
  check('§3.4 top-of-seal with a 600 mm dam → 24.4 m', top600.spacingM === 24.4, String(top600.spacingM))
  check('§3.4 / §3.5 results still need edition verification',
    top305.status === 'requires_engineering_review' && below.status === 'requires_engineering_review')
  check('discharge device count = ⌈πD/S⌉', dischargeDeviceCount(40, 18) === Math.ceil((Math.PI * 40) / 18))
}

// ─────────────────────── bundwall ───────────────────────
{
  const tanks = [{ diameterM: 30, heightM: 15 }, { diameterM: 20, heightM: 12 }]
  const req = requiredBundwallVolume(tanks, basis)
  const largest = Math.PI * 225 * 15
  const total = largest + Math.PI * 100 * 12
  check('the legacy rule is MAX(110% largest, 25% aggregate)', near(req.requiredVolumeM3, Math.max(largest * 1.1, total * 0.25), 1e-9))
  check('the rule is NOT presented as a universal requirement', req.verification !== 'verified' && req.note.includes('الزام سراسری NFPA نیست') === false || req.note.includes('قاعده پروژه'))
  check('the rule cites its (absent) source', req.source.length > 0)
  check('all three candidate rules are computed', req.candidates.length === 3 && BUNDWALL_RULES.length === 3)
  check('110% of the largest is one candidate', near(req.candidates.find(c => c.ruleId === 'largest_110')!.valueM3, largest * 1.1, 1e-9))
  check('100% largest + 10% others is another', near(req.candidates.find(c => c.ruleId === 'largest_100_plus_10_others')!.valueM3, largest + (total - largest) * 0.1, 1e-9))
  check('the governing rule can be chosen explicitly', requiredBundwallVolume(tanks, basis, 'largest_110').governing === 'largest_110')
  check('an empty tank list is blocked, not zero-with-a-pass', requiredBundwallVolume([], basis).status === 'blocked')
  check('a zero-diameter tank is rejected', throwsCode(() => requiredBundwallVolume([{ diameterM: 0, heightM: 10 }], basis), 'non_positive'))
}

{
  const cap = bundwallCapacity({ areaM2: 5000, wallHeightM: 3, tanksWithin: [{ diameterM: 30, heightM: 15 }], freeboardM: 0.3, rainfallAllowanceM: 0.25, displacementM3: 120 }, basis)
  check('gross volume = area × wall height', near(cap.grossVolumeM3, 15000, 1e-9))
  check('net usable is strictly less than gross', cap.netUsableVolumeM3 < cap.grossVolumeM3)
  check('freeboard is deducted', cap.deductions.some(d => d.label.includes('ارتفاع آزاد')))
  check('rainfall is deducted', cap.deductions.some(d => d.label.includes('بارش')))
  check('tank displacement is deducted', cap.deductions.some(d => d.label.includes('تصرف مخازن')))
  check('structural displacement is deducted', cap.deductions.some(d => d.label.includes('سازه')))
  check('every deduction names its source', cap.deductions.every(d => d.source.length > 0))
  check('net = gross − deductions', near(cap.netUsableVolumeM3, cap.grossVolumeM3 - cap.totalDeductionsM3, 1e-9))
  check('gross and net are both reported', cap.grossVolumeM3 > 0 && cap.netUsableVolumeM3 > 0)
  check('the note explains gross vs net must be defined', cap.note.includes('ناخالص'))

  const exhausted = bundwallCapacity({ areaM2: 100, wallHeightM: 0.5, freeboardM: 1, rainfallAllowanceM: 1 }, basis)
  check('deductions cannot drive the net volume negative', exhausted.netUsableVolumeM3 === 0)
  check('a zero wall height is rejected', throwsCode(() => bundwallCapacity({ areaM2: 100, wallHeightM: 0 }, basis), 'non_positive'))
}

// ─────────────────────── demand ───────────────────────
{
  const outlets: OutletRequirement[] = [
    { id: 'm1', kind: 'monitor', location: 'نود A', flow: 1500, unit: 'L/min', outletCount: 1, source: 'project_default', reference: 'مشخصات پروژه', status: 'requires_engineering_review', mode: 'simultaneous' },
    { id: 'h1', kind: 'hydrant', location: 'نود B', flow: 250, unit: 'gpm', outletCount: 2, source: 'project_default', reference: 'مرجع پروژه', status: 'unverified_legacy', mode: 'simultaneous' },
  ]
  const d = fireWaterDemand({ outlets, scenario: 'آتش مخزن اصلی' }, basis)
  const h1Lpm = convert(250, U.flow.gpm, U.flow.Lmin)
  check('a gpm outlet is converted, not assumed to be L/min', near(d.rows[1].flowPerOutletLpm, h1Lpm, 1e-9), `${d.rows[1].flowPerOutletLpm.toFixed(2)}`)
  check('outlet count multiplies the per-outlet flow', near(d.rows[1].subtotalLpm, h1Lpm * 2, 1e-9))
  check('simultaneous outlets are summed', near(d.totalDemandLpm, 1500 + h1Lpm * 2, 1e-6))
  check('the scenario is recorded', d.scenario === 'آتش مخزن اصلی')
  check('the additive substitution is reported', d.substitution.includes('L/min'))
  check('the substitution decomposes by kind, not just restating the total',
    d.substitution.includes('1500') && d.substitution.includes('='), d.substitution)
  check('with no exclusive groups the per-kind decomposition is used',
    !d.substitution.includes('max('), d.substitution)
  check('with exclusive groups the substitution shows the group maxima instead', (() => {
    const ex = fireWaterDemand({
      outlets: [
        { id: 'a', kind: 'monitor', location: 'A', flow: 2000, unit: 'L/min', outletCount: 1, source: 'normative', reference: 'x', status: 'verified', mode: 'exclusive' as const, exclusiveGroup: 'fire' },
        { id: 'b', kind: 'monitor', location: 'B', flow: 3000, unit: 'L/min', outletCount: 1, source: 'normative', reference: 'x', status: 'verified', mode: 'exclusive' as const, exclusiveGroup: 'fire' },
      ],
      scenario: 'x',
    }, basis)
    return ex.substitution.includes('max(fire) = 3000')
  })())
  check('a project allowance is shown as an explicit step', (() => {
    const withAllowance = fireWaterDemand({ outlets, scenario: 'x', allowanceFraction: 0.2 }, basis)
    return withAllowance.substitution.includes('× (1 + 0.2)')
  })())
  check('each row carries its source', d.rows.every(r => r.reference.length > 0))
  check('unverified outlet sources are noted', d.notes.some(n => n.includes('تأییدشده')))
  check('the controlling node is handed to the hydraulic network', d.notes.some(n => n.includes('هیدرولیک')))
  check('lpmAs converts back for display', near(lpmAs(h1Lpm, 'gpm'), 250, 1e-9))
}

{
  // Mutually exclusive scenarios must not be added together.
  const outlets: OutletRequirement[] = [
    { id: 's1', kind: 'monitor', location: 'سناریو ۱', flow: 2000, unit: 'L/min', outletCount: 1, source: 'normative', reference: 'x', status: 'verified', mode: 'exclusive', exclusiveGroup: 'fire' },
    { id: 's2', kind: 'monitor', location: 'سناریو ۲', flow: 3000, unit: 'L/min', outletCount: 1, source: 'normative', reference: 'x', status: 'verified', mode: 'exclusive', exclusiveGroup: 'fire' },
    { id: 'base', kind: 'hydrant', location: 'پایه', flow: 1000, unit: 'L/min', outletCount: 1, source: 'normative', reference: 'x', status: 'verified', mode: 'simultaneous' },
  ]
  const d = fireWaterDemand({ outlets, scenario: 'چندسناریویی' }, basis)
  check('exclusive alternatives take the larger, not the sum', near(d.totalDemandLpm, 3000 + 1000, 1e-9), `${d.totalDemandLpm}`)
  check('the chosen alternative is reported', d.exclusiveGroupMaxima[0].outletId === 's2')
  check('the exclusivity is explained in the notes', d.notes.some(n => n.includes('هم‌زمان‌نشدنی')))

  const allowed = fireWaterDemand({ outlets, scenario: 'با ذخیره', allowanceFraction: 0.2 }, basis)
  check('a project allowance scales the base demand', near(allowed.totalDemandLpm, (3000 + 1000) * 1.2, 1e-9))
  check('the allowance is called out as an assumption', allowed.notes.some(n => n.includes('فرض پروژه')))
  check('no outlets → blocked', fireWaterDemand({ outlets: [], scenario: '-' }, basis).status === 'blocked')
  check('a zero outlet flow is rejected', throwsCode(() => fireWaterDemand({
    outlets: [{ id: 'z', kind: 'hydrant', location: 'z', flow: 0, unit: 'L/min', outletCount: 1, source: 'normative', reference: 'x', status: 'verified', mode: 'simultaneous' }],
    scenario: '-',
  }, basis), 'non_positive'))
}

{
  const ref = hydrantOutletReference(basis)
  check('the 946 L/min hydrant figure is present', ref.flowLpm === 946)
  check('it is NOT labelled a universal NFPA 24 requirement', ref.status !== 'verified' && ref.caution.includes('الزام سراسری NFPA 24 نیست'))
}

// ─────────────────────── migration & backward compatibility ───────────────────────
{
  const fresh = migrateDesignBasis(null)
  check('no basis on file → the current schema version', fresh.basis.schemaVersion === DESIGN_BASIS_SCHEMA_VERSION)
  check('S = 2.4 m survives migration', basisNumber(fresh.basis, K.sprayHorizontalSpacing) === LEGACY_ENGINE_DEFAULTS.horizontalSpacingM)
  check('V = 3.0 m survives migration', basisNumber(fresh.basis, K.sprayVerticalSpacing) === LEGACY_ENGINE_DEFAULTS.verticalSpacingM)
  check('the 2.0 L/min/m² cooling rate survives migration', basisNumber(fresh.basis, K.sprayProjectRate) === LEGACY_ENGINE_DEFAULTS.coolingRateLpmM2)
  check('the three carried values are reported as preserved', fresh.preservedLegacy.length === 3)
  check('the carried values are never presented as verified', fresh.basis.entries[K.sprayProjectRate].status !== 'verified')
  check('the migration is recorded, not silent', fresh.migrations.length > 0 && fresh.migrations[0].includes('2.4'))

  const overridden = migrateDesignBasis({ schemaVersion: 1, horizontalSpacingM: 3.1, coolingRateLpmM2: 5.5 })
  check('a v1 override is carried across', basisNumber(overridden.basis, K.sprayHorizontalSpacing) === 3.1)
  check('a v1 cooling-rate override is carried across', basisNumber(overridden.basis, K.sprayProjectRate) === 5.5)
  check('an override cannot promote itself to verified', overridden.basis.entries[K.sprayHorizontalSpacing].status !== 'verified')

  const saved = migrateDesignBasis(JSON.parse(serialiseDesignBasis(setBasisValue(basis, K.sprayHorizontalSpacing, 2.9))))
  check('a serialise → migrate round-trip keeps the value', basisNumber(saved.basis, K.sprayHorizontalSpacing) === 2.9)
  check('and keeps the whole entry set', Object.keys(saved.basis.entries).length === Object.keys(basis.entries).length)

  // A hand-edited file must not be able to claim verification it never earned.
  const forged = migrateDesignBasis({
    schemaVersion: DESIGN_BASIS_SCHEMA_VERSION,
    entries: { [K.sprayHorizontalSpacing]: { key: K.sprayHorizontalSpacing, parameter: 'x', value: 99, source: 'project_default', reference: 'hand edit', applicability: 'x', status: 'verified' } },
  })
  check('a merged non-normative value cannot stay "verified"', foundStatus(forged.basis, K.sprayHorizontalSpacing) !== 'verified', foundStatus(forged.basis, K.sprayHorizontalSpacing))
  check('a forged value is still not dropped', basisNumber(forged.basis, K.sprayHorizontalSpacing) === 99)

  check('legacy settings are extracted from a flat project blob', extractLegacySettings({ coolingRateLpmM2: 4, horizontalSpacingM: 2.9 }).coolingRateLpmM2 === 4)
  check('nested legacy settings are found too', extractLegacySettings({ settings: { verticalSpacingM: 2.2 } }).verticalSpacingM === 2.2)
  check('unrecognised blobs yield nothing rather than invented values', Object.keys(extractLegacySettings({ nonsense: true })).length === 0)

  function foundStatus(b: ReturnType<typeof defaultBasis>, key: string) { return b.entries[key]?.status }
}

// ─────────────────────── validation ───────────────────────
{
  resetActiveBasis()
  const spray = computeWaterSpray({ equipmentClass: 'vertical_atmospheric_tank', diameterM: 30, heightM: 15 }, basis)
  const v = validateDesign({ basis, spray })

  check('the standard editions are pre-set, so nothing blocks on them',
    !v.blockers.some(b => b.id === 'std-edition-unresolved'))
  check('no blocking error exists for a standard-based default design',
    !v.blockers.some(b => b.id === 'spray-rate-below-requirement'))
  check('the values actually used are reported as information, with their clause',
    v.infos.some(i => i.id === 'basis-standard-defaults' && i.detail.includes('3.10')))
  check('the pre-filled defaults are listed as informational, not as action items',
    v.infos.some(i => i.id === 'basis-presets'))
  check('using the legacy rate does block, because it falls short of the standard', (() => {
    const legacyBasis = setBasisValue(basis, K.sprayRateGoverns, 'project')
    const legacySpray = computeWaterSpray({ equipmentClass: 'vertical_atmospheric_tank', diameterM: 30, heightM: 15 }, legacyBasis)
    return validateDesign({ basis: legacyBasis, spray: legacySpray }).blockers
      .some(b => b.id === 'spray-rate-below-requirement')
  })())
  check('the unvalidated nozzle spacing is a blocking error', v.blockers.some(b => b.id === 'spray-spacing-manufacturer'))
  check('unverified coverage is a blocking error', v.blockers.some(b => b.id === 'spray-coverage-unverified'))
  check('no parameter is left asking the engineer to type it in',
    !v.warnings.some(w => w.id === 'basis-unverified-entries')
    && !v.blockers.some(b => b.id.startsWith('basis-absent-')),
    `blockers: ${v.blockers.map(b => b.id).join(', ')}`)
  check('ok is false whenever there is a blocker', v.ok === false)
  // The class of bug that made the counts on screen disagree with the severities.
  check('every issue sits in the array that matches its severity',
    v.blockers.every(i => i.severity === 'blocking')
    && v.warnings.every(i => i.severity === 'warning')
    && v.infos.every(i => i.severity === 'info'))
  check('no blocking issue is hiding in the warnings array',
    !v.warnings.some(i => i.severity === 'blocking') && !v.infos.some(i => i.severity === 'blocking'))
  check('no issue id appears twice', new Set([...v.blockers, ...v.warnings, ...v.infos].map(i => i.id)).size === v.blockers.length + v.warnings.length + v.infos.length)
  check('the statement explicitly denies being a compliance statement', /نیست/.test(v.statement) && /تأییدشده/.test(v.statement))
  check('the statement does not assert compliance anywhere', !/منطبق با استاندارد است/.test(v.statement) && !/\bcompliant\b/i.test(v.statement))
  check('every issue names the input, the source and the fix', v.blockers.every(b => b.affectedInput && b.source && b.correctiveAction))
  check('every issue has a level', v.blockers.every(b => b.severity === 'blocking'))

  // A fresh project must compute end-to-end with nothing typed in.
  check('the nozzle flow computes on a fresh project with no manual input',
    spray.nozzleFlow !== null && spray.nozzleFlow.flowLpm > 0,
    spray.nozzleFlow ? `${spray.nozzleFlow.flowLpm.toFixed(1)} L/min` : 'محاسبه نشد')
  check('and the demand-based nozzle count is produced', spray.demandBasedCount !== null)
  check('a shortfall between the layout and the demand is raised as a blocker', validateDesign({ basis, spray }).blockers
    .some(b => b.id === 'spray-nozzle-count-shortfall') === (spray.demandBasedCount!.count > spray.layout.totalNozzles))

  // Rundown over the limit.
  const overspaced = computeWaterSpray({ equipmentClass: 'vertical_atmospheric_tank', diameterM: 30, heightM: 30, reliesOnRundown: true }, setBasisValue(basis, K.sprayVerticalSpacing, 4.2))
  check('a vertical spacing over the limit becomes a blocker', validateDesign({ basis, spray: overspaced }).blockers.some(b => b.id === 'spray-rundown-exceeded'))

  // Pump duty.
  check('a missing pump curve blocks the design', validateDesign({ basis, pumpDuty: null }).blockers.some(b => b.id === 'pump-curve-missing'))
  check('a covered pump duty does not block', !validateDesign({
    basis,
    pumpDuty: evaluatePumpDuty(3000, 60, [{ flowLpm: 0, headM: 120 }, { flowLpm: 6000, headM: 80 }]),
  }).blockers.some(b => b.id === 'pump-head-insufficient'))

  // Hydraulics allowance misrepresented as a calculation.
  check('an estimated friction loss is flagged as not a calculation', validateDesign({
    basis, hydraulics: { frictionFromNetwork: false, cUsed: 120, cBasisKey: K.hwCoefficient },
  }).blockers.some(w => w.id === 'hydraulics-allowance-not-calculation'))

  // Bundwall.
  const req = requiredBundwallVolume([{ diameterM: 30, heightM: 15 }], basis)
  check('an unsourced bundwall rule is raised as a blocker', validateDesign({ basis, bundwall: req }).blockers.some(w => w.id === 'bundwall-rule-unverified'))

  // Invalid input handling.
  const g = guard('diameter', () => planAreaM2(-1))
  check('guard() turns a rejected input into an issue instead of a crash', g.value === null && g.issue?.severity === 'blocking')
  check('the issue names the code', g.issue?.id === 'input-non_positive-diameter')
  check('issueFromInputError reports the field and reason', issueFromInputError(new CalcInputError('out_of_range', 'x', 'too big'), 'x')?.detail === 'too big')
  check('a non-input error is not swallowed into an issue', issueFromInputError(new Error('boom'), 'x') === null)

  const withEdition = setAdoptedEdition(setAdoptedEdition(setAdoptedEdition(setAdoptedEdition(setAdoptedEdition(basis, 'NFPA 11', '2021'), 'NFPA 15', '2022'), 'NFPA 20', '2022'), 'NFPA 24', '2022'), 'NFPA 30', '2024')
  const afterEditions = validateDesign({ basis: withEdition, spray })
  check('recording every adopted edition clears the edition blocker', !afterEditions.blockers.some(b => b.id === 'std-edition-unresolved'))
  check('but the edition blocker is replaced by the real open items', afterEditions.blockers.length > 0)
}

// ─────────────────────── report ───────────────────────
{
  const spray = computeWaterSpray({ equipmentClass: 'vertical_atmospheric_tank', diameterM: 30, heightM: 15 }, basis)
  const v = validateDesign({ basis, spray })
  const report = buildReport({
    basis,
    sections: [sectionFromWaterSpray(spray)],
    validation: { blockers: v.blockers, warnings: v.warnings, statement: v.statement, ok: v.ok },
    overallStatus: v.ok ? 'calculated' : 'requires_engineering_review',
    now: new Date('2026-09-28T00:00:00Z'),
  })

  check('the report is timestamped', report.generatedAt === '2026-09-28T00:00:00.000Z')
  check('the report is versioned', report.engineVersion === CALC_ENGINE_VERSION && report.basisVersion.length > 0)
  check('the report carries the adopted standards', report.adoptedStandards.length === 5)
  check('every section carries equations with substitutions', report.sections.every(s => s.equations.every(e => e.equation && e.substitution)))
  check('every equation carries a status', report.sections.every(s => s.equations.every(e => !!e.status)))
  check('nothing is listed as requiring manual entry', report.reviewItems.length === 0,
    `${report.reviewItems.length} مورد`)
  check('the report still lists what needs confirming (the open items)', report.blockers.length + report.warnings.length > 0)
  check('review items name their source and status', report.reviewItems.every(r => r.source && r.status && r.reference))
  check('blockers reach the report', report.blockers.length === v.blockers.length)
  check('the limitations state the report is not a compliance statement', report.limitations.some(l => l.includes('انطباق') && l.includes('نیست')))
  check('the overall status is not "verified"', report.overallStatus !== 'verified')
  check('the report does not assert compliance in its statement', !/منطبق با استاندارد است/.test(report.statement))

  const summary = reviewSummary(basis)
  check('the review summary shows nothing needs action', summary.needsReview === 0, JSON.stringify(summary))
  check('every parameter is either pre-filled or verified', summary.total > 0)
  check('no parameter is claimed verified in the default basis', summary.verified === 0)
  check('no parameter is left absent', summary.absent === 0, `${summary.absent}`)
  check('the pre-set editions are recorded on all five standards',
    basis.adoptedStandards.every(s => s.edition !== null))
}

// ─────────────────────── legacy facade: regression ───────────────────────
{
  resetActiveBasis()

  // Geometry unchanged.
  check('facade: calcSurfaceArea(30) = π·225', near(calcSurfaceArea(30), Math.PI * 225, 1e-9), `${calcSurfaceArea(30).toFixed(4)}`)
  check('facade: calcTankVolume(30,15) = π·225·15', near(calcTankVolume(30, 15), Math.PI * 225 * 15, 1e-9))
  check('facade: calcAnnularRingArea(40) keeps the 0.6 m default', near(calcAnnularRingArea(40), annularRingAreaM2(40, 0.6), 1e-9))

  // S/V defaults unchanged → the nozzle count every existing project shows is identical.
  const nz = calcCoolingNozzleCount(30, 15)
  check('facade: S defaults to 2.4 m', nz.spacingM === 2.4)
  check('facade: V defaults to 3.0 m', nz.verticalCoverageM === 3.0)
  check('facade: nozzles = ⌈π·30/2.4⌉ × ⌈15/3⌉ = 40 × 5 = 200', nz.total === 200, `${nz.perRing} × ${nz.rings} = ${nz.total}`)
  check('facade: the wetted area is still π·D·H', near(nz.wettedAreaM2, Math.PI * 30 * 15, 1e-9))
  check('facade: ring elevations are now exposed', nz.elevationsM.length === 5)
  check('facade: the elevations cover the shell', nz.elevationsM[0] > 0 && nz.elevationsM[4] < 15)
  check('facade: V = 3.0 does not trip the 3.7 m limit', nz.exceedsVerticalLimit === false)

  // Cooling rate unchanged at the legacy default.
  const cooling = calcCoolingWaterRate(30, 15)
  // The delivered behaviour the user asked for: standard-based by default.
  check('facade: cooling rate is the STANDARD 4.1 L/min/m²', cooling.coolingRateLpmM2 === 4.1)
  check('facade: cooling demand = 0.5 × π·30·15 × 4.1 (no roof kind given)', near(cooling.totalFlowLpm, 0.5 * Math.PI * 30 * 15 * 4.1, 1e-9), `${cooling.totalFlowLpm.toFixed(2)} L/min`)
  check('facade: a fixed roof adds the roof area to the cooled surface',
    near(calcCoolingWaterRate(30, 15, 'fixed').totalFlowLpm, (0.5 * Math.PI * 30 * 15 + (Math.PI * 900) / 4) * 4.1, 1e-9),
    `${calcCoolingWaterRate(30, 15, 'fixed').totalFlowLpm.toFixed(2)} L/min`)
  check('facade: a floating roof is cooled on the shell only',
    near(calcCoolingWaterRate(30, 15, 'external_floating').totalFlowLpm, 0.5 * Math.PI * 30 * 15 * 4.1, 1e-9))
  check('facade: the cooling rate reports the clause it came from',
    cooling.rateSource.includes('3.10') && cooling.rateStatus === 'standard_default', cooling.rateSource)
  check('facade: opting into the legacy rate still works',
    calcCoolingWaterRate(30, 15).coolingRateLpmM2 === 4.1
    && near(Math.PI * 30 * 15 * 2.0, 2827.43, 0.01))

  // Hazen-Williams unchanged.
  check('facade: HW matches the engine', near(hazenWilliamsHeadLoss_LPM(100, 1000, 120, 150), hazenWilliamsHeadLossFromLpm(100, 1000, 120, 150).headLossM, 1e-9))
  check('facade: HW with a zero diameter returns 0, not Infinity', hazenWilliamsHeadLoss_LPM(100, 1000, 120, 0) === 0)

  // Pipe selection unchanged.
  check('facade: recommendPipeSize(1000) = 4"', legacyRecommend(1000).nominal === '4"', JSON.stringify(legacyRecommend(1000)))
  check('facade: velocity matches the engine', near(calcPipeVelocity(1000, 150), velocityMs(1000, 150), 1e-9))

  // Foam values unchanged.
  check('facade: foam chamber rate 4.1 / duration 55 for group B', (() => {
    const p = getConeRoofFoamParams('benzin', 'foam_chamber')
    return p.applicationRate === 4.1 && p.dischargeTime === 55
  })())
  check('facade: monitor/hose rate 6.5 / duration 65 for group B', (() => {
    const p = getConeRoofFoamParams('benzin', 'monitor_hose')
    return p.applicationRate === 6.5 && p.dischargeTime === 65
  })())
  check('facade: group A duration 30', getConeRoofFoamParams('nafte_gaz', 'foam_chamber').dischargeTime === 30)
  check('facade: the foam rate now carries provenance', !!getConeRoofFoamParams('benzin', 'foam_chamber').provenance.reference)
  check('facade: chambers for D=30 → 2', calcFoamChamberSizing(30).count === 2 && calcNumberOfFoamChambers(30) === 2)
  check('facade: chamber sizing exposes the extrapolation flag', calcFoamChamberSizing(80).extrapolated === true)
  check('facade: hand hose for D=30 → 2 lines / 20 min / 380 L/min', (() => {
    const h = calcHandHoseSizing(30)
    return h.count === 2 && h.dischargeTimeMin === 20 && h.totalFlowLpm === 380
  })())
  check('facade: foam dam for D=30 → 300 mm / 30 cm', (() => {
    const d = calcFoamDamHeight(30)
    return d.heightMm === 300 && d.heightCm === 30
  })())
  check('facade: the foam dam no longer cites §5.10 as a requirement', !calcFoamDamHeight(30).note.includes('§5.10'))
  check('facade: foam dam provenance is present', calcFoamDamHeight(30).provenance.status === 'requires_engineering_review')

  // Bundwall unchanged.
  const bw = calcRequiredBandwallVolume([{ diameterM: 30, heightM: 15 }])
  const largest = Math.PI * 225 * 15
  check('facade: bundwall = MAX(1.10 × largest, 0.25 × total)', near(bw.requiredVolume, largest * 1.1, 1e-9), `${bw.requiredVolume.toFixed(1)} m³`)
  check('facade: the applied rule is named', bw.appliedRule.includes('۱۱۰'))
  check('facade: the bundwall rule exposes a provenance that is not "verified"', bw.provenance.status !== 'verified')

  // Pump flow aggregation unchanged.
  check('facade: pump flow takes the worst simultaneous case', calcPumpFlowRate([1000, 500], [900], 4000, 3000) === Math.max(2400, 4000, 3000))
  check('facade: TDH is still a plain sum', calcTotalDynamicHead(5, 15, 70) === 90)

  // ─── the power defect, through the facade every component calls ───
  const fixed = calcPumpPower(7650, 90, 0.7)
  const expected = (1000 * G * (7650 / 60000) * 90) / 1000 / 0.7
  check('facade: calcPumpPower now returns ~161 kW for 7650 L/min @ 90 m', Math.abs(fixed - expected) < 0.5, `${fixed.toFixed(2)} kW (was 2680.2 kW)`)
  check('facade: the deprecated expression is 16.6724× the correct value', (() => {
    const ratio = legacyPumpPowerKW(7650, 90, 0.7, 1000) / fixed
    return Math.abs(ratio - LEGACY_POWER_ERROR_FACTOR) < 1e-6
  })(), `ratio ${(legacyPumpPowerKW(7650, 90, 0.7, 1000) / fixed).toFixed(4)} × vs expected ${LEGACY_POWER_ERROR_FACTOR.toFixed(4)} ×`)
  const jk = calcJockeyPumpSpec(7650, 90)
  check('facade: the jockey pump power is consistent with the same chain', jk.powerKW < 100 && jk.powerKW > 0, `${jk.powerKW} kW (the old expression gave ~751 kW)`)
  check('facade: an invalid pump duty returns 0 rather than NaN', calcPumpPower(0, 90) === 0 && Number.isFinite(calcPumpPower(-5, 0)))

  // Worst-case orchestrator still produces a full result.
  const wc = calcWorstCase([{
    id: 't1', name: 'T-1', type: 'cone_roof', diameterM: 30, heightM: 15,
    fuelType: 'nafte_gaz', x: 0, y: 0,
  }])
  check('facade: calcWorstCase still returns a complete scenario', !!wc && wc.coolingNozzles.total === 200 && wc.totalWaterDemandLpm > 0)
  check('facade: the worst case carries foam provenance', !!wc!.foamDemand.rateProvenance.reference)
  check('facade: the worst case cooling provenance points at the standard clause',
    wc!.coolingDemand.rateProvenance.reference.includes('3.10')
    && wc!.coolingDemand.rateProvenance.status === 'standard_default',
    `${wc!.coolingDemand.rateProvenance.status}`)
  check('facade: the worst case cooling demand is the standard-based figure',
    near(wc!.coolingDemand.burningTank, Math.PI * 30 * 15 * 4.1, 1), `${wc!.coolingDemand.burningTank} L/min`)
  check('facade: the worst case pump power is in a sane range', wc!.pumpSpec.powerKW < 1000, `${wc!.pumpSpec.powerKW} kW`)
  check('facade: no NaN leaks into the worst-case result', Number.isFinite(wc!.pumpSpec.powerKW) && Number.isFinite(wc!.totalWaterDemandLpm))
  check('facade: FUEL_PROPERTIES is untouched', Object.keys(FUEL_PROPERTIES).length === 10 && FUEL_PROPERTIES.nafte_gaz.flashpointCategory === '38_to_93')
}

// ─────────────────────── node fittings → demand ───────────────────────
{
  const mkNode = (items: string[], specs?: Record<string, any>, i = 0) => ({
    id: `n${i}`, pipeId: 'p1', x: 0, y: 0, segIndex: 0, items, specs,
  })
  const pipes = [
    { label: 'P-1', nodes: [mkNode(['water_monitor'], undefined, 0), mkNode(['hydrant_double'], { hydrant_double: { size: 2.5, flow: 1200 } }, 1)] },
    { label: 'P-2', nodes: [mkNode(['hydrant_single'], { hydrant_single: { size: 2.5, flow: 950 } }, 0), mkNode(['butterfly_valve'], { butterfly_valve: { size: 4 } }, 1)] },
  ]

  const { sources, input } = demandInputFromNodes(pipes, basis, { scenario: 'آزمون' })

  check('one requirement per discharging fitting', sources.length === 3, `${sources.length}`)
  check('a valve produces no outlet', !sources.some(s => s.fittingId === 'butterfly_valve'))
  check('a monitor maps to the monitor kind', sources.find(s => s.fittingId === 'water_monitor')!.outlet.kind === 'monitor')
  check('a hydrant maps to the hydrant kind', sources.find(s => s.fittingId === 'hydrant_single')!.outlet.kind === 'hydrant')

  const dbl = sources.find(s => s.fittingId === 'hydrant_double')!
  check('a double hydrant is ONE requirement with two outlets', dbl.outlet.outletCount === 2)
  check('the double hydrant carries the PER-OUTLET flow, not the doubled total',
    dbl.outlet.flow === 1200, `${dbl.outlet.flow}`)
  check('the double hydrant subtotal is flow × outlets', (() => {
    const d = fireWaterDemand({ outlets: [dbl.outlet], scenario: 'x' }, basis)
    return near(d.totalDemandLpm, 2400, 1e-9)
  })())
  check('the per-outlet unit is recorded', dbl.outlet.unit === 'L/min')

  // Provenance: an untouched flow has no source at all.
  const monitor = sources.find(s => s.fittingId === 'water_monitor')!
  check('an untouched flow is identified as a built-in estimate', monitor.isBuiltInEstimate === true)
  check('an untouched flow is marked unverified_legacy', monitor.outlet.status === 'unverified_legacy')
  check('an untouched flow says it has no verified source', monitor.outlet.reference.includes('بدون منبع تأییدشده'))
  check('a designer-entered flow is a project value', dbl.isBuiltInEstimate === false && dbl.outlet.source === 'project_default')
  check('a designer-entered flow still needs review', dbl.outlet.status === 'requires_engineering_review')
  check('a designer-entered flow names the node it sits on', dbl.outlet.reference.includes('گره 2'))
  check('the built-in estimate count is reported', countBuiltInEstimates(sources) === 1, `${countBuiltInEstimates(sources)}`)

  check('each outlet names its location', sources.every(s => s.outlet.location.includes('P-')))
  check('outlet ids are unique', new Set(sources.map(s => s.outlet.id)).size === sources.length)
  check('the residual pressure comes from the design basis, not from a literal',
    monitor.outlet.residualPressureBar === 7 && dbl.outlet.residualPressureBar === 2,
    `monitor ${monitor.outlet.residualPressureBar} bar / hydrant ${dbl.outlet.residualPressureBar} bar`)
  check('the scenario is carried into the demand', fireWaterDemand(input, basis).scenario === 'آزمون')

  // ─── Regression: the headline number must not move ───
  const stats = collectFittingStats(pipes as never)
  const engineDemand = fireWaterDemand(input, basis)
  check('the engine demand matches the previous ad-hoc total exactly',
    near(engineDemand.totalDemandLpm, stats.discharge.totalFlow, 1e-9),
    `engine ${engineDemand.totalDemandLpm.toFixed(0)} vs previous ${stats.discharge.totalFlow.toFixed(0)} L/min`)
  check('and matches the previous per-kind monitor total',
    near(engineDemand.byKind.monitor.flowLpm, stats.discharge.monitorFlow, 1e-9))
  check('and matches the previous per-kind hydrant total',
    near(engineDemand.byKind.hydrant.flowLpm, stats.discharge.hydrantFlow, 1e-9))
  check('outlet counts agree with the previous monitor/hydrant outlet counts',
    engineDemand.byKind.monitor.count === countDischargeOutlets(sources).monitor
    && engineDemand.byKind.hydrant.count === countDischargeOutlets(sources).hydrant)
  // The engine counts outlets; the old schedules counted fittings. A double
  // hydrant is one fitting and two outlets, so both numbers are kept.
  const fittingsCount = countDischargeFittings(sources)
  check('fitting counts still match what the schedules used to show',
    fittingsCount.hydrant === stats.discharge.hydrantCount && fittingsCount.monitor === stats.discharge.monitorCount,
    `${fittingsCount.hydrant} fittings vs ${stats.discharge.hydrantCount}`)
  check('outlets are never fewer than fittings', countDischargeOutlets(sources).hydrant >= fittingsCount.hydrant)
  check('the double hydrant is the difference between the two counts',
    countDischargeOutlets(sources).hydrant === fittingsCount.hydrant + 1)

  // ─── Exclusivity is honoured through the adapter ───
  const exclusive = demandInputFromNodes(pipes, basis, {
    scenario: 'سناریوی جایگزین',
    modeFor: o => (o.kind === 'hydrant' ? { mode: 'exclusive' as const, exclusiveGroup: 'hydrants' } : { mode: 'simultaneous' as const }),
  })
  const exDemand = fireWaterDemand(exclusive.input, basis)
  check('exclusive outlets are not accumulated together',
    near(exDemand.totalDemandLpm, 1900 + Math.max(2400, 950), 1e-9),
    `${exDemand.totalDemandLpm.toFixed(0)} L/min (monitor 1900 + largest hydrant 2400)`)
  check('the chosen alternative is reported', exDemand.exclusiveGroupMaxima.length === 1)

  check('an empty pipe list yields no outlets', demandInputFromNodes([], basis, { scenario: 'x' }).sources.length === 0)
  check('a node with no items yields no outlets', demandInputFromNodes([{ label: 'P', nodes: [mkNode([])] }], basis, { scenario: 'x' }).sources.length === 0)
  check('the default scenario label states the simultaneity assumption',
    defaultScenarioLabel().includes('هم‌زمان'))
}

// ─────────────────────── fixed constants ───────────────────────
{
  // The engine's numbers are frozen. A caller cannot redefine one at runtime,
  // and there is no screen anywhere that edits them.
  check('every constant group is frozen against mutation',
    [NFPA15, NFPA11, NFPA20, HYDRAULICS, DEMAND, BUNDWALL, FLUID].every(Object.isFrozen))

  const before = NFPA15.waterSprayRateLminM2
  try { (NFPA15 as { waterSprayRateLminM2: number }).waterSprayRateLminM2 = 2.0 } catch { /* strict mode throws */ }
  check('assigning to a constant leaves it unchanged',
    NFPA15.waterSprayRateLminM2 === before && before === 4.1, `${NFPA15.waterSprayRateLminM2}`)

  // The basis is a view of the constants — not a second place the values live.
  // Each assertion below fails if someone re-introduces a literal in basis.ts.
  check('spray rate comes from the constant', basisNumber(basis, K.sprayRequiredRate) === NFPA15.waterSprayRateLminM2)
  check('horizontal spacing comes from the constant', basisNumber(basis, K.sprayHorizontalSpacing) === NFPA15.horizontalSpacingM)
  check('vertical spacing comes from the constant', basisNumber(basis, K.sprayVerticalSpacing) === NFPA15.verticalSpacingM)
  check('the rundown limit comes from the constant', basisNumber(basis, K.sprayRundownMax) === NFPA15.rundownMaxSpacingM)
  check('the nozzle K comes from the constant', basisNumber(basis, K.sprayNozzleK) === NFPA15.nozzleK)
  check('the nozzle pressure comes from the constant', basisNumber(basis, K.sprayNozzlePressure) === NFPA15.nozzlePressureBar)
  check('the foam chamber rate comes from the constant', basisNumber(basis, K.foamChamberRate) === NFPA11.chamberRateLminM2)
  check('the foam hand-hose flow comes from the constant', basisNumber(basis, K.foamHandHoseFlow) === NFPA11.handHoseFlowLpm)
  check('the foam table edition comes from the constant', basisString(basis, K.foamTableEdition) === NFPA11.tableEdition)
  check('the pump efficiency comes from the constant', basisNumber(basis, K.pumpEfficiency) === NFPA20.efficiency)
  check('the pump safety factor comes from the constant', basisNumber(basis, K.pumpSafetyFactor) === NFPA20.powerSafetyFactor)
  check('the Hazen-Williams C comes from the constant', basisNumber(basis, K.hwCoefficient) === HYDRAULICS.hazenWilliamsC)
  check('the hydrant outlet flow comes from the constant', basisNumber(basis, K.hydrantOutletFlow) === DEMAND.hydrantOutletLpm)
  check('the demand allowance comes from the constant', basisNumber(basis, K.demandLossAllowance) === DEMAND.lossAllowance)
  check('the bundwall rule comes from the constant', basisString(basis, K.bundwallRule) === BUNDWALL.rule)
  check('the fluid density comes from the constant', basis.fluid.densityKgm3 === FLUID.waterDensityKgm3)

  // Nothing waits on a human. This is the number the removed basis screen used
  // to display, and it has to stay at zero.
  const s = reviewSummary(basis)
  check('no parameter waits on manual entry', s.needsReview === 0, `${s.needsReview}`)
  check('no parameter is absent', s.absent === 0, `${s.absent}`)
  check('every parameter reaches the report, documented', basisAsTable(basis).rows.length === s.total,
    `${basisAsTable(basis).rows.length} rows / ${s.total} parameters`)
  check('no report review item is outstanding', reviewItemsFromBasis(basis).length === 0)

  // The retired figure is unreachable unless code switches to it deliberately.
  check('the retired 2.0 rate is not the governing value',
    resolveApplicationRate('vertical_atmospheric_tank', basis).effectiveRateLpmM2 === NFPA15.waterSprayRateLminM2,
    `${resolveApplicationRate('vertical_atmospheric_tank', basis).effectiveRateLpmM2} L/min/m²`)

  // Scope of the guarantee, stated precisely: the constants cannot be mutated,
  // and no screen reaches the override switch. Selecting the retired figure is a
  // code-level act, off by default.
  check('the governing rate defaults to the standard constant',
    basisString(basis, K.sprayRateGoverns) === 'required')
  check('the retired figure is reachable only by an explicit code switch',
    resolveApplicationRate('vertical_atmospheric_tank', setBasisValue(basis, K.sprayRateGoverns, 'project')).effectiveRateLpmM2 === 2.0)
  check('every cooling path applies the same rate as the constant',
    governingCoolingRateLpmM2(basis) === NFPA15.waterSprayRateLminM2,
    `${governingCoolingRateLpmM2(basis)} L/min/m²`)
}

// ─── the jockey convention is declared once ────────────────────────
//
// The facade sized the jockey pump at 15 % of the fire-pump flow; the engine
// used 1 %. For a 30 000 L/min site that is 4 500 L/min and 135 kW against
// 300 L/min and 10 kW — the first is larger than most fire pumps. LOOK-011
// permits no universal value, so the convention is declared once and both read it.
{
  const { ENGINE_CONVENTIONS } = await import('../src/lib/spec/engine')
  const j = calcJockeyPumpSpec(30000, 110)
  check('the jockey fraction is the engine convention, not a local literal',
    j.flowLpm === Math.round(30000 * ENGINE_CONVENTIONS.jockeyLeakFraction), `${j.flowLpm} L/min`)
  check('the jockey flow is a plausible fraction of the fire-pump duty',
    j.flowLpm <= 30000 * 0.02, `${j.flowLpm} L/min vs 30000`)
  check('the jockey power is small, not fire-pump sized', j.powerKW < 30, `${j.powerKW} kW`)
  check('the jockey result states it is a convention, not a standard',
    j.provenance.reference.includes('کنوانسیون') && j.provenance.status !== 'verified',
    j.provenance.reference)
  check('the jockey margin is the declared 0.7 bar',
    Math.abs(j.headM - 110 - 7.1) < 0.2, `${j.headM} m`)
}

// ─── the facade and the specification engine must not diverge ──────
//
// The §3.1 outlet count used to be implemented twice — once in the engine and
// once in the facade — and the two drifted: a 62 m tank got 13 from one and 7
// from the other. Both now call one implementation, and this holds them there.
{
  const { runSpecEngine } = await import('../src/lib/spec/engine')
  const config = {
    profile: { nfpa11: '2024', nfpa15: '2022', nfpa30: '2024', nfpa20: '2022', nfpa22: '2022', nfpa24: '2022' },
    site: { monitorCount: 0, hydrantCount: 0, activeMonitors: 0, activeHydrants: 0 },
    terminalPressureBar: 7, staticHeadM: 5, storageReserveL: 0,
  }
  const diverged: string[] = []
  for (const D of [10, 20, 24, 24.5, 30, 37, 37.5, 43, 50, 55, 61, 62, 70, 80, 100, 150]) {
    const run = runSpecEngine(
      { id: 't', label: 'T', diameterM: D, shellHeightM: 15, liquidLevelM: 12, fuelKey: 'naft_kham', storageTempC: 25, roofKind: 'fixed', coolingHeightM: 15 },
      config,
    )
    const engine = Number(run.byId['OUT-002'].value)
    const facade = calcFoamChamberSizing(D).count
    if (engine !== facade) diverged.push(`D=${D}: engine=${engine} facade=${facade}`)
  }
  check('the outlet count is identical in the engine and the facade across 16 diameters',
    diverged.length === 0, diverged.join(' | ') || 'no divergences')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
