// Roof-aware fire-system eligibility.
//
// A foam dam holds foam in the annular space of a *floating* roof. A fixed-roof
// tank has none. A dike/pond («حوضچه») is not a tank at all — it is a spill
// area, and it is fought with monitors and hand hose, not with a dam, a
// chamber, a cooling ring or an in-tank foaming system.
//
// The equipment panel used to offer every system on every tank, so a fixed-roof
// tank could be given a foam dam and a pond could be given all four. This module
// is the one place that decides. The panel, the map badges, the BOM and the
// report all read it, so a flag left over in a saved design cannot be counted
// either.

export type TankRoofValue =
  | 'cone_roof'
  | 'floating_external'
  | 'floating_internal'
  | 'contaminated'

export const POND_ROOF: TankRoofValue = 'contaminated'

export const TANK_ROOF_TYPES: readonly { value: TankRoofValue; label: string; short: string }[] =
  Object.freeze([
    { value: 'cone_roof', label: 'سقف ثابت (Cone / Fixed Roof)', short: 'سقف ثابت' },
    { value: 'floating_external', label: 'سقف شناور خارجی (External Floating Roof)', short: 'شناور خارجی' },
    { value: 'floating_internal', label: 'سقف شناور داخلی (Internal Floating Roof)', short: 'شناور داخلی' },
    { value: 'contaminated', label: 'مواد آلوده / حوضچه (ORD — Dike & Spill)', short: 'حوضچه' },
  ])

const FLOATING_ROOFS: readonly TankRoofValue[] = ['floating_external', 'floating_internal']

/** Every fire system the equipment panel can attach. */
export const FIRE_SYSTEM_IDS = [
  'cooling',
  'foam_chamber',
  'co2_system',
  'sprinkler',
] as const

export type FireSystemId = (typeof FIRE_SYSTEM_IDS)[number]

/**
 * Which element types each system may be attached to at all. This is the
 * panel's own `appliesTo`: kept here so a test can assert the set the operator
 * actually sees, not just the roof rule in isolation.
 */
export const FIRE_SYSTEM_APPLIES_TO: Record<FireSystemId, readonly string[]> = {
  cooling: ['oil_tank', 'contamination_tank', 'underground_tank', 'water_tank', 'foam_tank'],
  foam_chamber: ['oil_tank', 'contamination_tank'],
  co2_system: ['turbine', 'control_building', 'telecom_station', 'electrical_station', 'warehouse', 'equipment_store'],
  sprinkler: ['turbine', 'control_building', 'office_building', 'workshop', 'warehouse', 'hse_building', 'equipment_store'],
}

/** Every system this element type can carry, before the roof is considered. */
export function systemsForElement(elementType: string): FireSystemId[] {
  return FIRE_SYSTEM_IDS.filter((id) => FIRE_SYSTEM_APPLIES_TO[id].includes(elementType))
}

/** The systems the panel should leave selectable for this element. */
export function selectableSystemsForElement(elementType: string, statedRoof: unknown): FireSystemId[] {
  return systemsForElement(elementType).filter(
    (id) => roofBlockedReason(id, elementType, statedRoof) === null,
  )
}

/** Element types that represent a tank with a roof. */
const TANK_WITH_ROOF_TYPES: readonly string[] = ['oil_tank', 'contamination_tank']

/** Tokens a saved project may carry for a roof type (IN-008). */
export function normalizeRoof(value: unknown): TankRoofValue | null {
  const t = String(value ?? '').trim()
  if (!t) return null
  if (/floating_external|external_floating/i.test(t)) return 'floating_external'
  if (/floating_internal|internal_floating/i.test(t)) return 'floating_internal'
  if (/(?:^|[_\-\s])ord(?:$|[_\-\s])/i.test(t) || /contaminat|pond|dike|spill/i.test(t)) return 'contaminated'
  if (/cone|fixed/i.test(t)) return 'cone_roof'
  return null
}

export function roofShortLabel(value: unknown): string | null {
  const r = normalizeRoof(value)
  return TANK_ROOF_TYPES.find((o) => o.value === r)?.short ?? null
}

export function isTankWithRoof(elementType: string): boolean {
  return TANK_WITH_ROOF_TYPES.includes(elementType)
}

export function isFloatingRoof(roof: TankRoofValue): boolean {
  return FLOATING_ROOFS.includes(roof)
}

/**
 * The roof in force for an element. A contamination tank *is* the dike/spill
 * case — a fact about the element type, not a guessed roof. `roofKindFor` in
 * specProject.ts makes the same call; keeping both in step is why this lives
 * here and is imported there.
 */
export function effectiveRoof(elementType: string, stated: unknown): TankRoofValue | null {
  const r = normalizeRoof(stated)
  if (r !== null) return r
  return elementType === 'contamination_tank' ? POND_ROOF : null
}

/** The roof token stored on an element's properties, in either field name. */
export function statedRoofOf(props: Record<string, unknown> | null | undefined): unknown {
  if (!props) return null
  return props.roofKind ?? props.tankType ?? null
}

const POND_NOTE = 'حوضچه با مانیتور یا هوزدستی اطفا میشود'

const POND_REASONS: Partial<Record<FireSystemId, string>> = {
  foam_chamber: `حوضچه چمبر ندارد — ${POND_NOTE}`,
  cooling: `حوضچه کولینگ ندارد — ${POND_NOTE}`,
}

const FIXED_REASONS: Partial<Record<FireSystemId, string>> = {
}

const FLOATING_REASONS: Partial<Record<FireSystemId, string>> = {}


/** A system needs a declared roof before it can be judged at all. */
const NEEDS_ROOF: Partial<Record<FireSystemId, string>> = {
}

/**
 * Why this system may not be attached to this element — `null` when it may.
 *
 * Only a tank with a roof is gated; a building's CO₂ system or sprinkler, or a
 * water tank's cooling ring, carries no roof and is left alone.
 */
export function roofBlockedReason(
  systemId: string,
  elementType: string,
  statedRoof: unknown,
): string | null {
  if (!isTankWithRoof(elementType)) return null
  const roof = effectiveRoof(elementType, statedRoof)

  if (roof === null) return NEEDS_ROOF[systemId as FireSystemId] ?? null
  if (roof === POND_ROOF) return POND_REASONS[systemId as FireSystemId] ?? null
  if (isFloatingRoof(roof)) return FLOATING_REASONS[systemId as FireSystemId] ?? null
  return FIXED_REASONS[systemId as FireSystemId] ?? null
}

/** Systems that may never be attached to this element whatever the roof. */
export function forbiddenFireSystems(elementType: string, statedRoof: unknown): FireSystemId[] {
  return FIRE_SYSTEM_IDS.filter((id) => roofBlockedReason(id, elementType, statedRoof) !== null)
}

/**
 * Drop flags the element's roof forbids. Used when the roof changes, so a
 * design can never keep a dam it just lost the right to have.
 */
export function sanitizeFireSystems(
  elementType: string,
  statedRoof: unknown,
  props: Record<string, unknown>,
): { props: Record<string, unknown>; removed: FireSystemId[] } {
  const removed: FireSystemId[] = []
  const next: Record<string, unknown> = { ...props }
  for (const id of FIRE_SYSTEM_IDS) {
    if (next[id] && roofBlockedReason(id, elementType, statedRoof) !== null) {
      delete next[id]
      removed.push(id)
    }
  }
  return { props: next, removed }
}

/**
 * Read-side gate for anything that counts or draws a system — the map, the BOM
 * and the report. A saved flag alone is not enough: the element's own roof must
 * still permit it.
 */
export function isFireSystemActive(
  elementType: string,
  props: Record<string, unknown> | null | undefined,
  systemId: FireSystemId,
): boolean {
  if (!props?.[systemId]) return false
  return roofBlockedReason(systemId, elementType, statedRoofOf(props)) === null
}
