// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from 'react'
import { drawSchematicSymbol } from '@/lib/schematicSymbols'
import { getPointIcon, pointIconElement, pointIconRect } from '@/lib/pointIconSprites'

interface SchematicIconProps {
  id: string
  color: string
  size?: number
  className?: string
}

/** Share of the box the artwork's longest side takes, leaving a small margin. */
const ART_RATIO = 0.92

/**
 * One fitting drawn to a canvas, so lists and the node editor show the exact
 * artwork that ends up on the map. The photographic render is preferred; the
 * vector glyph covers the frame or two before it decodes.
 */
export default function SchematicIcon({ id, color, size = 28, className }: SchematicIconProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const cvs = ref.current
    if (!cvs) return
    const dpr = window.devicePixelRatio || 1
    cvs.width = Math.round(size * dpr)
    cvs.height = Math.round(size * dpr)
    const ctx = cvs.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)

    const img = getPointIcon(id)
    if (img) {
      const { w, h } = pointIconRect(id, size * ART_RATIO)
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
      return
    }

    drawSchematicSymbol(ctx, id, size / 2, size / 2, size * 0.8, color)

    // Repaint this icon once its own artwork arrives.
    const pending = pointIconElement(id)
    if (!pending) return
    const onSettled = () => setTick(n => n + 1)
    pending.addEventListener('load', onSettled, { once: true })
    pending.addEventListener('error', onSettled, { once: true })
    return () => {
      pending.removeEventListener('load', onSettled)
      pending.removeEventListener('error', onSettled)
    }
  }, [id, color, size, tick])

  return <canvas ref={ref} style={{ width: size, height: size }} className={className} />
}
