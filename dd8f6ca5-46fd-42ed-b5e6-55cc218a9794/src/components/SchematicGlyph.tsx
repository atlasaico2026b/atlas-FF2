// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef } from 'react'
import { drawSchematicSymbol } from '@/lib/schematicSymbols'

interface SchematicGlyphProps {
  id: string
  size?: number
  color?: string
  className?: string
}

/**
 * Crisp canvas rendering of a single node fitting symbol. Shares the exact
 * draw routine used on the design canvas, so the editor is always WYSIWYG.
 */
export default function SchematicGlyph({ id, size = 28, color = '#0ea5e9', className }: SchematicGlyphProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cvs = ref.current
    if (!cvs) return
    const dpr = window.devicePixelRatio || 1
    cvs.width = Math.round(size * dpr)
    cvs.height = Math.round(size * dpr)
    const ctx = cvs.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, size, size)
    drawSchematicSymbol(ctx, id, size / 2, size / 2, size * 0.86, color)
  }, [id, size, color])

  return <canvas ref={ref} style={{ width: size, height: size }} className={className} />
}
