// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// COOLING SURFACE RULE
//
// The surface a cooling system has to cover is not the whole shell:
//
//   * Side cooling — half of the lateral area, A = 0.5 × π × D × H.
//   * Roof cooling — only a fixed roof is cooled. A floating roof sits on the
//     liquid, so it is not an exposed surface and gets side cooling only.
//
// This is a project rule, not a clause of NFPA 15: the standard gives the
// density (L/min/m²), the project decides which surface that density is
// applied to. It lives here, once, so the three engines cannot disagree.
// ═══════════════════════════════════════════════════════════════════

/** Share of the lateral shell taken as the cooled surface. */
export const SHELL_COOLING_FRACTION = 0.5

export type CoolingRoofKind =
  | 'fixed'
  | 'external_floating'
  | 'internal_floating'
  | 'ord'
  | null
  | undefined

/** A = 0.5 × π × D × H */
export function shellCoolingAreaM2(diameterM: number, heightM: number): number {
  return Math.PI * diameterM * heightM * SHELL_COOLING_FRACTION
}

/** A = π × D² / 4 */
export function roofCoolingAreaM2(diameterM: number): number {
  return (Math.PI * diameterM ** 2) / 4
}

/** Only a fixed roof is an exposed surface that has to be cooled. */
export function roofIsCooled(roofKind: CoolingRoofKind): boolean {
  return roofKind === 'fixed'
}

export function coolingAreaM2(
  diameterM: number,
  heightM: number,
  roofKind: CoolingRoofKind,
): { shellM2: number; roofM2: number; totalM2: number } {
  const shellM2 = shellCoolingAreaM2(diameterM, heightM)
  const roofM2 = roofIsCooled(roofKind) ? roofCoolingAreaM2(diameterM) : 0
  return { shellM2, roofM2, totalM2: shellM2 + roofM2 }
}
