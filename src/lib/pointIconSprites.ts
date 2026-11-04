// SPDX-License-Identifier: Apache-2.0
// ═══════════════════════════════════════════════════════════════════
// POINT ICON SPRITES — the photographic renders of the fittings that
// can be attached to a pipe node.
//
// The files are cut out of the supplied catalogue sheet by
// scripts/extract-point-icons.py: the checkerboard ground becomes a real
// alpha channel and each render is tight-cropped so its longest side is
// 200 px. Only the aspect ratio is needed here — the caller decides how
// big the fitting ends up.
//
// /point-icons is served with a one-year immutable cache, so changing a
// drawing MUST land on a NEW filename. That is what POINT_ICON_VERSION
// is for: bump it and the sheets stop handing back the stale artwork.
// ═══════════════════════════════════════════════════════════════════

export const POINT_ICON_VERSION = 'v3'
export const POINT_ICON_DIR = '/point-icons'
/** Longest side of every source sprite, in px. */
export const POINT_ICON_SOURCE = 200

interface Sprite {
  file: string
  /** width / height of the tight-cropped render. */
  aspect: number
}

const SPRITES: Record<string, Sprite> = {
  water_monitor:      { file: `water_monitor_${POINT_ICON_VERSION}.png`,      aspect: 200 / 169 },
  foam_monitor:       { file: `foam_monitor_${POINT_ICON_VERSION}.png`,       aspect: 200 / 199 },
  water_foam_monitor: { file: `water_foam_monitor_${POINT_ICON_VERSION}.png`, aspect: 200 / 165 },
  inline_inductor:    { file: `inline_inductor_${POINT_ICON_VERSION}.png`,    aspect: 200 / 130 },
  hydrant_single:     { file: `hydrant_single_${POINT_ICON_VERSION}.png`,     aspect: 107 / 200 },
  hydrant_double:     { file: `hydrant_double_${POINT_ICON_VERSION}.png`,     aspect: 158 / 200 },
  butterfly_valve:    { file: `butterfly_valve_${POINT_ICON_VERSION}.png`,    aspect: 200 / 188 },
  inline_valve:       { file: `inline_valve_${POINT_ICON_VERSION}.png`,       aspect: 150 / 200 },
  blind_flange:       { file: `blind_flange_${POINT_ICON_VERSION}.png`,       aspect: 198 / 200 },
}

/** Every fitting that has a render, in catalogue order. */
export function pointIconIds(): string[] {
  return Object.keys(SPRITES)
}

/** URL of one fitting's render, or null when none exists. */
export function pointIconUrl(id: string): string | null {
  const sprite = SPRITES[id]
  return sprite ? `${POINT_ICON_DIR}/${sprite.file}` : null
}

/**
 * Destination box for a render whose longest side is `box`, preserving the
 * artwork's own proportions so nothing is squashed.
 */
export function pointIconRect(id: string, box: number): { w: number; h: number } {
  const aspect = SPRITES[id]?.aspect ?? 1
  return aspect >= 1 ? { w: box, h: box / aspect } : { w: box * aspect, h: box }
}

const cache: Record<string, HTMLImageElement> = {}

/**
 * The render's image element, created on first use. Unlike getPointIcon this
 * returns the element while it is still decoding, so a caller can subscribe to
 * its load event rather than poll.
 */
export function pointIconElement(id: string): HTMLImageElement | undefined {
  const url = pointIconUrl(id)
  // Guarded: the drawing code also runs under Bun in the render tests.
  if (!url || typeof Image === 'undefined') return undefined
  let img = cache[id]
  if (!img) {
    img = new Image()
    img.src = url
    cache[id] = img
  }
  return img
}

/** The decoded render, or undefined while it is still loading. */
export function getPointIcon(id: string): HTMLImageElement | undefined {
  const img = pointIconElement(id)
  if (!img) return undefined
  return img.complete && img.naturalWidth > 0 ? img : undefined
}

/** Kick off decoding of every render, reporting each arrival. */
export function preloadPointIcons(onReady?: () => void): void {
  if (typeof Image === 'undefined') return
  for (const id of pointIconIds()) {
    const img = pointIconElement(id)
    if (!img || img.complete) continue
    img.addEventListener('load', () => onReady?.(), { once: true })
    img.addEventListener('error', () => onReady?.(), { once: true })
  }
}
