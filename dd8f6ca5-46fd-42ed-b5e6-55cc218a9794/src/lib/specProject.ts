// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// PROJECT → SPECIFICATION ENGINE BRIDGE
//
// Turns what a project already holds — the tanks placed on the map, the
// equipment counts, and the design basis — into the inputs of §2, then runs the
// §11 chain once per tank.
//
// Nothing here asks the user for a standard value. Tank diameter, shell height,
// fuel and roof kind are project facts and come from the map. Every rate, time,
// outlet count, ring count and limit is read from the specification. Where the
// project has genuinely not stated something — a reserve volume, the jockey
// basis — the engine returns its own figure and the output carries the status
// that says so.
// ═══════════════════════════════════════════════════════════════════

import { runSpecEngine, ENGINE_CONVENTIONS, type SpecConfig, type SpecRun, type SpecTank, type RoofKind } from './spec/engine'
import { DEFAULT_FUEL_KEY, PROJECT_FUELS } from './spec/fuel'
import { normalizeRoof } from './fireSystemRules'

/** The subset of a placed map element this module needs. */
export interface PlacedElement {
  id: string
  type: string
  label?: string
  properties?: Record<string, unknown>
}

export interface ProjectSpecResult {
  runs: SpecRun[]
  config: SpecConfig
  tanks: SpecTank[]
  /** Sanity notes about the mapping, shown in the report. */
  notes: string[]
}

const numOr = (v: unknown, fallback: number): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : fallback
}

function tankElements(elements: PlacedElement[]): PlacedElement[] {
  return elements.filter((e) => e.type === 'oil_tank' || e.type === 'contamination_tank')
}

/**
 * Map a project's roof-type token onto the specification's IN-008 value.
 *
 * The token parser itself lives in `fireSystemRules` so the equipment panel,
 * the map and this projection cannot disagree about what a saved token means.
 *
 * Returns `null` when the project has not stated one. There is deliberately no
 * default: the roof kind selects the scenario, the rate, the outlet table and
 * the pump duty, so only the project can choose it.
 */
export function roofKindFromTankType(tankType: unknown): RoofKind | null {
  const roof = normalizeRoof(tankType)
  if (roof === 'cone_roof') return 'fixed'
  if (roof === 'floating_external') return 'external_floating'
  if (roof === 'floating_internal') return 'internal_floating'
  if (roof === 'contaminated') return 'ord'
  return null
}

function roofKindFor(el: PlacedElement): RoofKind | null {
  const stated = roofKindFromTankType(el.properties?.roofKind ?? el.properties?.tankType)
  if (stated !== null) return stated
  // A contamination tank is the ORD/spill case — that is a fact about the
  // element type, not a guessed roof. An oil tank must declare its roof: this
  // used to fall back to 'fixed', which fed the §3.1/§3.2 fixed-roof tables for
  // a tank nobody had described.
  return el.type === 'contamination_tank' ? 'ord' : null
}

function fuelKeyFor(el: PlacedElement): string {
  const stated = String(el.properties?.fuelType ?? '')
  if (stated && PROJECT_FUELS[stated]) return stated
  return DEFAULT_FUEL_KEY
}

/** §2 inputs, read from the project. */
export function specTanksFromElements(elements: PlacedElement[]): { tanks: SpecTank[]; notes: string[] } {
  const notes: string[] = []
  const tanks: SpecTank[] = tankElements(elements).map((el, i) => {
    const diameter = numOr(el.properties?.diameter, 0)
    const height = numOr(el.properties?.height, 0)
    if (!(diameter > 0) || !(height > 0)) {
      notes.push(`«${el.label || el.id}» قطر یا ارتفاع ثبت نشده — نتیجه آن مخزن ناقص میماند`)
    }
    const roofKind = roofKindFor(el)
    if (roofKind === null) {
      notes.push(
        `«${el.label || el.id}» نوع سقف ثبت نشده — سناریوی §3.0A، نرخ فوم، تعداد خروجی و در نتیجه دبی پمپ تا اعلام نوع سقف محاسبه نمیشود`,
      )
    }
    if (el.type === 'contamination_tank' && roofKind !== 'ord') {
      notes.push(`«${el.label || el.id}» مخزن آلوده است ولی نوع سقف آن «${roofKind}» ثبت شده`)
    }
    const hasSpill = Number.isFinite(Number(el.properties?.spillAreaM2))
    return {
      id: el.id,
      label: el.label || `مخزن ${i + 1}`,
      diameterM: diameter,
      shellHeightM: height,
      liquidLevelM: numOr(el.properties?.liquidLevel, height * 0.85),
      fuelKey: fuelKeyFor(el),
      flashPointC: Number.isFinite(Number(el.properties?.flashPointC)) ? Number(el.properties?.flashPointC) : null,
      boilingPointC: Number.isFinite(Number(el.properties?.boilingPointC)) ? Number(el.properties?.boilingPointC) : null,
      storageTempC: Number.isFinite(Number(el.properties?.storageTempC)) ? Number(el.properties?.storageTempC) : null,
      roofKind,
      roofConstruction: (el.properties?.roofConstruction as string) ?? null,
      belowSealMethod: el.properties?.belowSealMethod === true,
      damInnerDiameterM: Number.isFinite(Number(el.properties?.damInnerDiameterM))
        ? Number(el.properties?.damInnerDiameterM)
        : null,
      sealToRoofElevationMm: Number.isFinite(Number(el.properties?.sealToRoofElevationMm))
        ? Number(el.properties?.sealToRoofElevationMm)
        : null,
      secondarySealElevationMm: Number.isFinite(Number(el.properties?.secondarySealElevationMm))
        ? Number(el.properties?.secondarySealElevationMm)
        : null,
      burnoutPanelElevationMm: Number.isFinite(Number(el.properties?.burnoutPanelElevationMm))
        ? Number(el.properties?.burnoutPanelElevationMm)
        : null,
      foamConcentration: null,
      coolingHeightM: height,
      // Roof cooling is not a project switch: a fixed roof is cooled on the roof
      // as well, a floating roof is shell-only (src/lib/coolingArea.ts).
      foamConstructionFullSurface: el.properties?.foamConstructionFullSurface === true,
      spillAreaM2: hasSpill ? Number(el.properties?.spillAreaM2) : null,
    }
  })
  if (!tanks.length) notes.push('هیچ مخزن نفتی یا آلودهای روی نقشه ثبت نشده است')
  return { tanks, notes }
}

/**
 * Site and standards configuration.
 *
 * The adopted editions default to the profile the specification itself states in
 * its header — NFPA 11-2024, NFPA 15-2022, NFPA 30-2024 — so a fresh project is
 * already on the correct editions without anyone choosing them. A project's own
 * design basis overrides them when it names different ones.
 */
export function specConfigFromProject(
  project: any,
  elements: PlacedElement[],
  tanks: SpecTank[],
): SpecConfig {
  const monitors = elements.filter((e) => e.type === 'monitor').length
  const hydrants = elements.filter((e) => e.type === 'hydrant').length

  let basis: any = null
  try {
    basis = typeof project?.designBasis === 'string' ? JSON.parse(project.designBasis) : project?.designBasis ?? null
  } catch {
    basis = null
  }
  const entryValue = (...keys: string[]): number | null => {
    for (const k of keys) {
      const v = basis?.entries?.[k]?.value
      if (typeof v === 'number' && Number.isFinite(v)) return v
    }
    return null
  }
  const adopted = basis?.adoptedStandards ?? {}

  return {
    profile: {
      nfpa11: adopted.nfpa11 ?? adopted.nfpa11Edition ?? '2024',
      nfpa15: adopted.nfpa15 ?? adopted.nfpa15Edition ?? '2022',
      nfpa30: adopted.nfpa30 ?? adopted.nfpa30Edition ?? '2024',
      nfpa20: adopted.nfpa20 ?? adopted.nfpa20Edition ?? '2022',
      nfpa22: adopted.nfpa22 ?? adopted.nfpa22Edition ?? '2022',
      nfpa24: adopted.nfpa24 ?? adopted.nfpa24Edition ?? '2022',
    },
    site: {
      monitorCount: monitors,
      hydrantCount: hydrants,
      // LOOK-012/013: the simultaneous-operation rule decides how many flow at
      // once. Until the project states one, the engine assumes two of each —
      // recorded in the output note so it is never mistaken for a site fact.
      activeMonitors: monitors > 0 ? Math.min(2, monitors) : 0,
      activeHydrants: hydrants > 0 ? Math.min(2, hydrants) : 0,
    },
    terminalPressureBar: entryValue('pumpMonitorResidual') ?? 7,
    staticHeadM: entryValue('pumpStaticLift') ?? 5,
    pipeRunM: ENGINE_CONVENTIONS.assumedPipeRunM,
    storageReserveL: entryValue('storageReserveL') ?? 0,
    coolingDurationMin: null,
    pumpEfficiency: entryValue('pumpEfficiency') ?? ENGINE_CONVENTIONS.pumpEfficiency,
    foamConcentration:
      (entryValue('foamConcentratePercent') !== null ? (entryValue('foamConcentratePercent') as number) / 100 : null) ??
      ENGINE_CONVENTIONS.foamConcentration,
  }
}

/** Run the whole site: one §11 chain per tank, against one configuration. */
export function runProjectSpec(project: any, elements: PlacedElement[]): ProjectSpecResult {
  const { tanks, notes } = specTanksFromElements(elements)
  const config = specConfigFromProject(project, elements, tanks)
  const runs = tanks
    .filter((t) => t.diameterM > 0 && t.shellHeightM > 0)
    .map((t) => {
      try {
        return runSpecEngine(t, config)
      } catch (err) {
        notes.push(`اجرای محاسبات برای «${t.label}» ناموفق بود: ${(err as Error).message}`)
        return null
      }
    })
    .filter((r): r is SpecRun => r !== null)
  return { runs, config, tanks, notes }
}

/**
 * The engine's default configuration.
 *
 * For callers that read a tank-level output only — the foam outlet table, say —
 * the site terms (monitor and hydrant counts, terminal pressure) do not enter
 * the answer. Callers that size a pump must pass the project's own config
 * instead.
 */
export function defaultSpecConfig(): SpecConfig {
  return specConfigFromProject(null, [], [])
}

/**
 * Run the §11 chain for one placed element.
 *
 * Returns `null` when the element is not a tank, or when its diameter/height are
 * not recorded. The run's `foam` block is `null` when the roof type (IN-008) is
 * not declared — the caller must show that as a missing input, never substitute
 * a fixed-roof figure.
 */
export function specRunForElement(
  el: PlacedElement,
  config: SpecConfig = defaultSpecConfig(),
): SpecRun | null {
  const { tanks } = specTanksFromElements([el])
  const tank = tanks[0]
  if (!tank || !(tank.diameterM > 0) || !(tank.shellHeightM > 0)) return null
  try {
    return runSpecEngine(tank, config)
  } catch {
    return null
  }
}
