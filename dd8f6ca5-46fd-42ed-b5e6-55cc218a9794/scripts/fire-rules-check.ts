// Roof-aware fire-system eligibility — the two rules the equipment panel was
// breaking:
//   • a fixed-roof tank has no foam dam, so the dam must not be selectable
//   • a pond («حوضچه») has no dam, chamber, cooling or foaming; only monitor /
//     hand hose
// Plus the read-side gate, so a flag left over in a saved design is not counted
// by the map, the BOM or the report either.

import {
  FIRE_SYSTEM_APPLIES_TO,
  FIRE_SYSTEM_IDS,
  TANK_ROOF_TYPES,
  effectiveRoof,
  forbiddenFireSystems,
  isFireSystemActive,
  normalizeRoof,
  roofBlockedReason,
  roofShortLabel,
  sanitizeFireSystems,
  selectableSystemsForElement,
  systemsForElement,
  type FireSystemId,
} from '../src/lib/fireSystemRules.ts'
import { roofKindFromTankType } from '../src/lib/specProject.ts'

let pass = 0
let fail = 0

function ok(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++
    console.log(`  PASS  ${name}${detail ? ` :: ${detail}` : ''}`)
  } else {
    fail++
    console.log(`  FAIL  ${name}${detail ? ` :: ${detail}` : ''}`)
  }
}

function eq<T>(name: string, got: T, want: T) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}

console.log('\n── roof token parsing ──')
eq('the four panel tokens parse back to themselves',
  TANK_ROOF_TYPES.map((o) => normalizeRoof(o.value)),
  ['cone_roof', 'floating_external', 'floating_internal', 'contaminated'])
eq('legacy spec tokens still parse',
  ['fixed', 'external_floating', 'internal_floating', 'ord'].map(normalizeRoof),
  ['cone_roof', 'floating_external', 'floating_internal', 'contaminated'])
ok('an unstated roof stays unstated — no silent default', normalizeRoof('') === null && normalizeRoof(null) === null)
ok('"record" is not read as a pond token', normalizeRoof('record_keeping') === null)
eq('the spec projection agrees with the panel parser', [
  roofKindFromTankType('cone_roof'),
  roofKindFromTankType('floating_external'),
  roofKindFromTankType('floating_internal'),
  roofKindFromTankType('contaminated'),
], ['fixed', 'external_floating', 'internal_floating', 'ord'])
ok('roof labels come from the shared list', roofShortLabel('contaminated') === 'حوضچه')

console.log('\n── rule 1: fixed roof has no foam dam ──')
{
  const reason = roofBlockedReason('foam_dam', 'oil_tank', 'cone_roof')
  ok('a fixed-roof tank cannot take a foam dam', reason !== null, String(reason))
  ok('and the reason names the roof', /سقف ثابت/.test(String(reason)), String(reason))
  ok('the dam IS allowed on an external floating roof',
    roofBlockedReason('foam_dam', 'oil_tank', 'floating_external') === null)
  ok('the dam IS allowed on an internal floating roof',
    roofBlockedReason('foam_dam', 'oil_tank', 'floating_internal') === null)
  ok('an unstated roof does not silently permit a dam',
    roofBlockedReason('foam_dam', 'oil_tank', null) !== null)
  ok('in-tank foaming is a fixed-roof method',
    roofBlockedReason('internal_foam', 'oil_tank', 'cone_roof') === null
    && roofBlockedReason('internal_foam', 'oil_tank', 'floating_external') !== null)
  ok('a fixed roof keeps chamber, cooling and hand hose',
    ['foam_chamber', 'cooling', 'external_foam'].every(
      (id) => roofBlockedReason(id, 'oil_tank', 'cone_roof') === null))
}

console.log('\n── rule 2: a pond has none of the four ──')
{
  const pond = 'contaminated'
  for (const id of ['foam_dam', 'foam_chamber', 'cooling', 'internal_foam'] as FireSystemId[]) {
    const reason = roofBlockedReason(id, 'oil_tank', pond)
    ok(`a pond cannot take ${id}`, reason !== null)
    ok(`  …and is told hand hose is the method (${id})`, /هوزدستی/.test(String(reason)))
  }
  ok('hand hose IS allowed on a pond', roofBlockedReason('external_foam', 'oil_tank', pond) === null)
  eq('the panel leaves exactly one system selectable on a pond',
    selectableSystemsForElement('oil_tank', pond), ['external_foam'])
  eq('and the same for the contamination-tank element type',
    selectableSystemsForElement('contamination_tank', null), ['external_foam'])
  eq('a fixed-roof tank panel has no selectable dam',
    selectableSystemsForElement('oil_tank', 'cone_roof').includes('foam_dam'), false)
  eq('the contamination-tank element type IS the pond',
    effectiveRoof('contamination_tank', null), 'contaminated')
  ok('a contamination tank needs no roof field to be read as a pond',
    roofBlockedReason('foam_chamber', 'contamination_tank', null) !== null)
  eq('and the forbidden set for it is those four',
    forbiddenFireSystems('contamination_tank', null).sort(),
    ['cooling', 'foam_chamber', 'foam_dam', 'internal_foam'])
}

console.log('\n── nothing outside a tank with a roof is gated ──')
{
  ok('a water tank keeps its cooling ring (no roof)',
    roofBlockedReason('cooling', 'water_tank', null) === null)
  ok('a building keeps its CO₂ system',
    roofBlockedReason('co2_system', 'turbine', null) === null)
  ok('a building keeps its sprinkler',
    roofBlockedReason('sprinkler', 'warehouse', null) === null)
  eq('no building system is filtered, whatever the roof token',
    forbiddenFireSystems('warehouse', 'contaminated'), [])
}

console.log('\n── write side: a roof change drops what it forbids ──')
{
  const floating = { cooling: true, foam_chamber: true, foam_dam: true, internal_foam: false, external_foam: true }
  const toFixed = sanitizeFireSystems('oil_tank', 'cone_roof', floating)
  ok('switching to a fixed roof removes the dam', toFixed.props.foam_dam === undefined)
  eq('and reports exactly what it removed', toFixed.removed, ['foam_dam'])
  ok('the roof-independent systems survive the change',
    toFixed.props.cooling === true && toFixed.props.foam_chamber === true && toFixed.props.external_foam === true)

  const toPond = sanitizeFireSystems('oil_tank', 'contaminated', floating)
  eq('switching to a pond removes exactly the four', toPond.removed, ['cooling', 'foam_chamber', 'foam_dam'])
  ok('and leaves hand hose in place', toPond.props.external_foam === true)

  const fixed = { foam_dam: false, internal_foam: true }
  const toFloating = sanitizeFireSystems('oil_tank', 'floating_external', fixed)
  eq('switching to a floating roof removes in-tank foaming', toFloating.removed, ['internal_foam'])
  ok('a false flag is not reported as removed', !toFloating.removed.includes('foam_dam'))
  ok('the sanitizer never mutates the caller’s object', floating.foam_dam === true)
  eq('a clean element is left completely alone',
    sanitizeFireSystems('oil_tank', 'cone_roof', { cooling: true, internal_foam: true }).removed, [])
}

console.log('\n── read side: a stale saved flag is not counted ──')
{
  ok('a dam on a fixed-roof tank counts as nothing',
    !isFireSystemActive('oil_tank', { tankType: 'cone_roof', foam_dam: true }, 'foam_dam'))
  ok('a chamber on a pond counts as nothing',
    !isFireSystemActive('oil_tank', { tankType: 'contaminated', foam_chamber: true }, 'foam_chamber'))
  ok('a cooling ring on a pond counts as nothing',
    !isFireSystemActive('contamination_tank', { cooling: true }, 'cooling'))
  ok('the same flag counts again once the roof allows it',
    isFireSystemActive('oil_tank', { tankType: 'floating_external', foam_dam: true }, 'foam_dam'))
  ok('the roof is read from either field name',
    !isFireSystemActive('oil_tank', { roofKind: 'cone_roof', foam_dam: true }, 'foam_dam'))
  ok('an absent flag is never active',
    !isFireSystemActive('oil_tank', { tankType: 'floating_external' }, 'foam_dam'))
  ok('a null props object is tolerated',
    !isFireSystemActive('oil_tank', null, 'foam_dam'))
  ok('hand hose stays counted on a pond',
    isFireSystemActive('contamination_tank', { external_foam: true }, 'external_foam'))
}

console.log('\n── the full matrix, pinned ──')
{
  const matrix: Record<string, Record<string, boolean>> = {}
  for (const roof of TANK_ROOF_TYPES.map((o) => o.value)) {
    matrix[roof] = {}
    for (const id of systemsForElement('oil_tank')) {
      matrix[roof][id] = roofBlockedReason(id, 'oil_tank', roof) === null
    }
  }
  eq('fixed roof permits cooling/chamber/foaming/hand hose', matrix.cone_roof,
    { cooling: true, foam_chamber: true, foam_dam: false, internal_foam: true, external_foam: true })
  eq('external floating adds the dam and the chamber, but not hand hose or in-tank foaming',
    matrix.floating_external,
    { cooling: true, foam_chamber: true, foam_dam: true, internal_foam: false, external_foam: false })
  eq('internal floating is the same shape', matrix.floating_internal,
    { cooling: true, foam_chamber: true, foam_dam: true, internal_foam: false, external_foam: false })
  eq('a pond keeps only hand hose', matrix.contaminated,
    { cooling: false, foam_chamber: false, foam_dam: false, internal_foam: false, external_foam: true })
}

console.log('\n── applicability itself is shared, not copied into the panel ──')
{
  eq('a building offers its two systems', systemsForElement('turbine'), ['co2_system', 'sprinkler'])
  eq('a water tank offers only the cooling ring', systemsForElement('water_tank'), ['cooling'])
  eq('an oil tank offers the five tank systems', systemsForElement('oil_tank'),
    ['cooling', 'foam_chamber', 'foam_dam', 'internal_foam', 'external_foam'])
  ok('every system id has an applicability row',
    FIRE_SYSTEM_IDS.every((id) => Array.isArray(FIRE_SYSTEM_APPLIES_TO[id])))
  ok('a pond is not offered the four it cannot have',
    !selectableSystemsForElement('oil_tank', 'contaminated')
      .some((id) => ['foam_dam', 'foam_chamber', 'cooling', 'internal_foam'].includes(id)))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1
