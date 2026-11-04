// Measures the real bounding box of every fitting symbol, in the normalised
// space the drawers use (they are scaled by size/2 and may exceed +-1).
import { drawSchematicSymbol } from '../src/lib/schematicSymbols'
import { PIPE_POINT_ITEMS } from '../src/lib/pipePoints'

function measure(id: string) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
  const see = (x: unknown, y: unknown) => {
    if (typeof x !== 'number' || typeof y !== 'number') return
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  const ctx = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'measureText') return () => ({ width: 1 })
      if (prop === 'canvas') return { width: 100, height: 100 }
      return (...args: unknown[]) => {
        if (prop === 'moveTo' || prop === 'lineTo') see(args[0], args[1])
        if (prop === 'arc') see((args[0] as number) - (args[2] as number), (args[1] as number))
        if (prop === 'arc') see(args[0], args[1])
        if (prop === 'arcTo' || prop === 'quadraticCurveTo' || prop === 'bezierCurveTo') {
          see(args[args.length - 2], args[args.length - 1])
        }
        if (prop === 'rect') see(args[0], args[1])
        if (prop === 'roundRect') see(args[0], args[1])
        if (prop === 'fillText' || prop === 'strokeText') see(args[1], args[2])
        return undefined
      }
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D

  drawSchematicSymbol(ctx, id, 0, 0, 2, '#000')
  const w = maxX - minX, h = maxY - minY
  return { id, w, h, minX, maxX, minY, maxY }
}

console.log('symbol            width  height   (normalised; 1.0 = half the requested size)')
let worst = 0
for (const def of PIPE_POINT_ITEMS) {
  const m = measure(def.id)
  worst = Math.max(worst, m.w, m.h)
  console.log(
    def.id.padEnd(20),
    m.w.toFixed(3).padStart(5),
    m.h.toFixed(3).padStart(6),
    m.w > 2.05 || m.h > 2.05 ? '  <-- overflows the nominal box' : '',
  )
}
console.log('\nwidest extent:', worst.toFixed(3), '=> the layout must allow for', worst.toFixed(2), 'x the nominal size')
