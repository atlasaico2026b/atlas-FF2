// SPDX-License-Identifier: Apache-2.0
/**
 * Proves the roof-aware foam basis agrees with the legacy cone-roof facade for
 * a fixed roof, and disagrees (correctly) for the roof kinds the legacy facade
 * never knew about.
 *
 * The UI used to call `calcSurfaceArea` + `getConeRoofFoamParams` +
 * `calcFoamChamberSizing(D)` for every roof type. Routing through the engine is
 * only safe if it is bit-identical for a fixed roof.
 *
 * Run: bun scripts/roof-basis-check.ts
 */
import { calcSurfaceArea, getConeRoofFoamParams, calcFoamChamberSizing, type HydrocarbonType } from '../src/lib/fireCalculations'
import { runSpecEngine, type SpecTank, type RoofKind } from '../src/lib/spec/engine'
import { specConfigFromProject } from '../src/lib/specProject'

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`PASS  ${name}${detail ? ' :: ' + detail : ''}`) }
  else { fail++; console.log(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`) }
}

const CONFIG = specConfigFromProject(null, [], [])
const FUEL: HydrocarbonType = 'nafte_gaz'

function specTank(D: number, roofKind: RoofKind | null): SpecTank {
  return {
    id: 't', label: 'T', diameterM: D, shellHeightM: 15, liquidLevelM: 12.75,
    fuelKey: FUEL, roofKind, coolingHeightM: 15,
  }
}

const DIAMETERS = [10, 20, 24, 24.5, 30, 37, 37.5, 43, 49, 50, 55, 61, 62, 70, 80, 100]

console.log('— fixed roof: engine vs legacy facade —')
for (const D of DIAMETERS) {
  const legacyArea = calcSurfaceArea(D)
  const legacyParams = getConeRoofFoamParams(FUEL, 'foam_chamber')
  const legacyCount = calcFoamChamberSizing(D).count

  const run = runSpecEngine(specTank(D, 'fixed'), CONFIG)
  const f = run.foam!
  check(
    `D=${D} m — area/rate/time/outlets identical`,
    f.areaM2 === legacyArea &&
      f.rateLminM2 === legacyParams.applicationRate &&
      f.timeMin === legacyParams.dischargeTime &&
      f.outletCount === legacyCount,
    `engine(${f.areaM2}, ${f.rateLminM2}, ${f.timeMin}, ${f.outletCount}) legacy(${legacyArea}, ${legacyParams.applicationRate}, ${legacyParams.dischargeTime}, ${legacyCount})`,
  )
}

console.log('\n— unstated roof kind must stop, not assume —')
{
  const run = runSpecEngine(specTank(30, null), CONFIG)
  check('IN-008 unstated → OUT-001 is INPUT_REQUIRED', run.byId['OUT-001'].status === 'INPUT_REQUIRED')
  check('IN-008 unstated → OUT-002 is INPUT_REQUIRED', run.byId['OUT-002'].status === 'INPUT_REQUIRED')
  check('IN-008 unstated → OUT-003 is INPUT_REQUIRED', run.byId['OUT-003'].status === 'INPUT_REQUIRED')
  check('IN-008 unstated → no fabricated count', run.foam === null)
  check('IN-008 unstated → explanation names the input',
    (run.byId['OUT-002'].note ?? '').includes('IN-008'))
  check('IN-008 unstated → the note is not the cone-roof figure',
    run.byId['OUT-002'].value === null)
}

console.log('\n— each roof kind selects its own table (§3.1 vs §3.4/§3.5) —')
{
  const fixed = runSpecEngine(specTank(30, 'fixed'), CONFIG)
  const ext = runSpecEngine(specTank(30, 'external_floating'), CONFIG)
  const extBelow = runSpecEngine({ ...specTank(30, 'external_floating'), belowSealMethod: true }, CONFIG)

  check('fixed roof uses the §3.2 surface rate 4.1', fixed.foam!.rateLminM2 === 4.1)
  check('external floating uses the §3.4 seal rate 12.2', ext.foam!.rateLminM2 === 12.2)
  check('external floating protects the annulus, not the plan area',
    ext.foam!.areaM2! < fixed.foam!.areaM2!, `annulus ${ext.foam!.areaM2} < plan ${fixed.foam!.areaM2}`)
  check('the three cases do NOT share one outlet count',
    new Set([fixed.foam!.outletCount, ext.foam!.outletCount, extBelow.foam!.outletCount]).size > 1,
    `fixed=${fixed.foam!.outletCount} ext=${ext.foam!.outletCount} below=${extBelow.foam!.outletCount}`)
  check('below-seal reads the §3.5 table, not §3.4',
    (extBelow.byId['OUT-003'].note ?? '').includes('§3.5') ||
      (extBelow.byId['OUT-003'].referenceIds ?? []).includes('T3.5'),
    String(extBelow.byId['OUT-003'].referenceIds))
}

console.log(`\n==== ${pass}/${pass + fail} passed ====`)
process.exit(fail ? 1 : 0)
