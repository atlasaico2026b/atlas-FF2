// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// GEOMETRY
//
// Pure geometry. No standard requirements, no project defaults, no
// manufacturer data. Every function validates its inputs and every result
// says which surfaces it did and did not include, so a protected area is
// never silently reported as "the" protected area.
// ═══════════════════════════════════════════════════════════════════

import type { ResultStatus } from './provenance'
import { assertNonNegative, assertPositive, assertRange } from './units'

export interface SurfaceBreakdown {
  /** sum of the included surfaces, m² */
  totalM2: number
  /** name → area of each surface that contributed */
  parts: { name: string; areaM2: number; note?: string }[]
  /** surfaces deliberately excluded, with the reason */
  excluded: { name: string; reason: string }[]
  status: ResultStatus
}

/** Plan (circular) area of a vertical cylinder: A = π·D²/4. */
export function planAreaM2(diameterM: number): number {
  assertPositive(diameterM, 'diameter')
  return Math.PI * Math.pow(diameterM, 2) / 4
}

/** Lateral surface area of a vertical cylinder: A = π·D·H. */
export function lateralCylinderAreaM2(diameterM: number, heightM: number): number {
  assertPositive(diameterM, 'diameter')
  assertPositive(heightM, 'protected height')
  return Math.PI * diameterM * heightM
}

/** Volume of a vertical cylinder: V = π·(D/2)²·H. */
export function cylinderVolumeM3(diameterM: number, heightM: number): number {
  assertPositive(diameterM, 'diameter')
  assertPositive(heightM, 'height')
  return planAreaM2(diameterM) * heightM
}

/**
 * Annular ring area between the tank wall and the foam dam / secondary seal:
 * A = π·(D/2)² − π·((D/2) − offset)².
 *
 * This is the protected area of a floating-roof tank, not the full plan area.
 */
export function annularRingAreaM2(diameterM: number, damOffsetM: number): number {
  assertPositive(diameterM, 'tank diameter')
  assertNonNegative(damOffsetM, 'foam dam offset')
  const outerRadius = diameterM / 2
  if (damOffsetM >= outerRadius) {
    throw new RangeError(`foam dam offset ${damOffsetM} m leaves no annulus on a ${diameterM} m tank`)
  }
  const innerRadius = outerRadius - damOffsetM
  return Math.PI * Math.pow(outerRadius, 2) - Math.PI * Math.pow(innerRadius, 2)
}

export function sphereAreaM2(diameterM: number): number {
  assertPositive(diameterM, 'diameter')
  return Math.PI * Math.pow(diameterM, 2)
}

export function sphereVolumeM3(diameterM: number): number {
  assertPositive(diameterM, 'diameter')
  return (Math.PI / 6) * Math.pow(diameterM, 3)
}

export type HeadType = 'flat' | 'ellipsoidal' | 'hemispherical'

/**
 * Wetted/protected outside surface of a horizontal vessel:
 * shell = π·D·L, plus two heads.
 *
 * Head areas are plain geometry (flat = πD²/4 each, hemispherical = πD²/2 for
 * the pair, 2:1 ellipsoidal ≈ 1.084·πD²/4 each). They are geometry only — which
 * of these surfaces the design basis actually requires is a separate decision.
 */
export function horizontalVesselShellAreaM2(
  diameterM: number,
  lengthM: number,
  headType: HeadType = 'ellipsoidal',
): { shellM2: number; headsM2: number; totalM2: number } {
  assertPositive(diameterM, 'vessel diameter')
  assertPositive(lengthM, 'vessel length')
  const shellM2 = Math.PI * diameterM * lengthM
  const endArea = planAreaM2(diameterM)
  const headFactor = headType === 'flat' ? 1 : headType === 'hemispherical' ? 2 : 1.084
  const headsM2 = 2 * endArea * headFactor
  return { shellM2, headsM2, totalM2: shellM2 + headsM2 }
}

/** Footprint occupied by a vertical tank on the bund floor. */
export function footprintAreaM2(diameterM: number): number {
  return planAreaM2(diameterM)
}

// ─── Nozzle rings ──────────────────────────────────────────────────
export interface RingLayout {
  /** Ring elevations measured from the bottom of the protected zone, ascending. */
  elevationsM: number[]
  ringCount: number
  /** Gaps between consecutive rings (= ringCount − 1, or 0 for a single ring). */
  intervals: number
  /** Largest installed gap between two consecutive rings. */
  maxGapM: number
  /** Distance from the lowest ring down to the bottom edge of the protected zone. */
  bottomEdgeM: number
  /** Distance from the highest ring up to the top edge of the protected zone. */
  topEdgeM: number
  /** True when an installed gap exceeds the design vertical spacing. */
  exceedsDesignSpacing: boolean
  /** Preliminary geometry only — coverage still needs manufacturer data. */
  status: ResultStatus
}

export interface RingLayoutInput {
  protectedHeightM: number
  /** Design vertical spacing (V). */
  maxVerticalSpacingM: number
  /** Distance held from each end to the adjacent ring. Defaults to V/2. */
  edgeOffsetM?: number
}

/**
 * Generate actual ring elevations that cover a protected height, then report
 * what was generated **and** whether it satisfies the spacing.
 *
 * The count is derived from the elevations that were generated, not assumed to
 * be ceil(H/V): for a single-ring layout there is one elevation and zero
 * intervals, and the end distances are reported separately so the caller can
 * see that the shell ends are covered by a half-interval, not by a full one.
 */
export function generateRingElevations({
  protectedHeightM,
  maxVerticalSpacingM,
  edgeOffsetM,
}: RingLayoutInput): RingLayout {
  const H = assertPositive(protectedHeightM, 'protected height')
  const V = assertPositive(maxVerticalSpacingM, 'design vertical spacing')
  const edge = edgeOffsetM === undefined ? V / 2 : assertNonNegative(edgeOffsetM, 'edge offset')
  if (edge > V) {
    throw new RangeError(`edge offset ${edge} m exceeds the design vertical spacing ${V} m`)
  }

  let elevationsM: number[]
  if (H <= 2 * edge) {
    elevationsM = [H / 2]
  } else {
    const n = Math.max(2, Math.ceil(H / V))
    const span = H - 2 * edge
    elevationsM = Array.from({ length: n }, (_, i) => edge + (span * i) / (n - 1))
  }

  const gaps = elevationsM.slice(1).map((z, i) => z - elevationsM[i])
  const maxGapM = gaps.length ? Math.max(...gaps) : 0
  const topEdgeM = H - elevationsM[elevationsM.length - 1]

  return {
    elevationsM,
    ringCount: elevationsM.length,
    intervals: Math.max(0, elevationsM.length - 1),
    maxGapM,
    bottomEdgeM: elevationsM[0],
    topEdgeM,
    exceedsDesignSpacing: maxGapM > V + 1e-9 || elevationsM[0] > V + 1e-9 || topEdgeM > V + 1e-9,
    status: 'preliminary',
  }
}

/** Nozzles needed around one ring: N = ⌈π·D / S⌉, never fewer than two. */
export function nozzlesPerRing(diameterM: number, spacingM: number): { count: number; circumferenceM: number } {
  assertPositive(diameterM, 'diameter')
  assertPositive(spacingM, 'horizontal spacing')
  const circumferenceM = Math.PI * diameterM
  return { count: Math.max(2, Math.ceil(circumferenceM / spacingM)), circumferenceM }
}

// ─── Idealised spray geometry ──────────────────────────────────────
/**
 * Idealised full-cone spray width at a target plane: W = 2·L·tan(θ/2).
 *
 * This is geometry, not coverage. It ignores droplet trajectory, wind, surface
 * curvature and the nozzle's actual pattern; it exists to bound a preliminary
 * spacing and must never be presented as proof of coverage.
 */
export function idealSprayWidthM(nozzleToTargetM: number, fullAngleDeg: number): number {
  const L = assertPositive(nozzleToTargetM, 'nozzle-to-target distance')
  assertRange(fullAngleDeg, 'spray angle', 1, 179)
  return 2 * L * Math.tan((fullAngleDeg * Math.PI) / 360)
}

/** Preliminary spacing from an explicitly selected overlap fraction. */
export function preliminaryHorizontalSpacingM(idealWidthM: number, overlapFraction: number): number {
  assertPositive(idealWidthM, 'ideal spray width')
  assertRange(overlapFraction, 'overlap fraction', 0, 0.95)
  return idealWidthM * (1 - overlapFraction)
}
