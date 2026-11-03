// SPDX-License-Identifier: Apache-2.0
import { useState, useRef, useEffect } from 'react'
import { Ruler, CheckCircle, X, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface CalibrationPoint {
  x: number
  y: number
  label: string
}

interface MapCalibrationProps {
  mapImageUrl: string
  onComplete: (widthMeters: number, heightMeters: number, scale: number) => void
  onDismiss: () => void
  /** When true the plan has no usable scale yet, so it cannot be skipped. */
  required?: boolean
}

export default function MapCalibration({ mapImageUrl, onComplete, onDismiss, required = false }: MapCalibrationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'direct' | 'points'>('direct')
  const [directWidth, setDirectWidth] = useState('')
  const [directHeight, setDirectHeight] = useState('')
  const [points, setPoints] = useState<CalibrationPoint[]>([])
  const [distances, setDistances] = useState<Record<string, string>>({})
  const [mapSize, setMapSize] = useState({ w: 800, h: 600 })
  const [mapImg, setMapImg] = useState<HTMLImageElement | null>(null)

  const POINT_LABELS = ['A', 'B', 'C', 'D']

  useEffect(() => {
    const img = new Image()
    img.src = mapImageUrl
    img.onload = () => {
      setMapImg(img)
      setMapSize({ w: img.naturalWidth, h: img.naturalHeight })
    }
  }, [mapImageUrl])

  useEffect(() => {
    if (mode !== 'points') return
    const cvs = canvasRef.current
    if (!cvs || !mapImg) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const container = containerRef.current
    if (!container) return

    const maxW = container.clientWidth - 32
    const maxH = container.clientHeight - 32
    const scale = Math.min(maxW / mapImg.naturalWidth, maxH / mapImg.naturalHeight, 1)
    const displayW = mapImg.naturalWidth * scale
    const displayH = mapImg.naturalHeight * scale

    cvs.width = displayW * dpr
    cvs.height = displayH * dpr
    cvs.style.width = displayW + 'px'
    cvs.style.height = displayH + 'px'
    ctx.scale(dpr, dpr)

    ctx.drawImage(mapImg, 0, 0, displayW, displayH)

    for (const pt of points) {
      const px = pt.x * scale
      const py = pt.y * scale

      ctx.beginPath()
      ctx.arc(px, py, 8, 0, Math.PI * 2)
      ctx.fillStyle = '#ef4444'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(pt.label, px, py)
      ctx.textBaseline = 'alphabetic'
    }

    if (points.length >= 2) {
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 3])
      ctx.beginPath()
      for (let i = 0; i < points.length; i++) {
        const px = points[i].x * scale
        const py = points[i].y * scale
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      if (points.length === 4) {
        ctx.lineTo(points[0].x * scale, points[0].y * scale)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [mapImg, points, mapSize, mode])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (points.length >= 4) return

    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect || !mapImg) return

    const displayScale = rect.width / mapImg.naturalWidth
    const canvasX = (e.clientX - rect.left) / displayScale
    const canvasY = (e.clientY - rect.top) / displayScale

    const newPoints = [...points, { x: canvasX, y: canvasY, label: POINT_LABELS[points.length] }]
    setPoints(newPoints)
  }

  const getDistanceLabel = (i: number, j: number) => {
    return `${POINT_LABELS[i]}-${POINT_LABELS[j]}`
  }

  const handleCalibratePoints = () => {
    if (points.length < 2) return

    const dx = points[1].x - points[0].x
    const dy = points[1].y - points[0].y
    const pixelDist = Math.sqrt(dx * dx + dy * dy)

    const realDist = parseFloat(distances[getDistanceLabel(0, 1)] || '0')
    if (realDist <= 0) return

    const pxPerMeter = pixelDist / realDist
    const widthMeters = mapImg ? Math.round(mapImg.naturalWidth / pxPerMeter) : 100
    const heightMeters = mapImg ? Math.round(mapImg.naturalHeight / pxPerMeter) : 100

    onComplete(widthMeters, heightMeters, pxPerMeter)
  }

  const handleDirectApply = () => {
    const w = parseFloat(directWidth)
    const h = parseFloat(directHeight)
    if (w <= 0 || h <= 0 || !mapImg) return
    const pxPerMeter = mapImg.naturalWidth / w
    onComplete(w, h, pxPerMeter)
  }

  const handleReset = () => {
    setPoints([])
    setDistances({})
  }

  const canCalibratePoints = points.length >= 2 && distances[getDistanceLabel(0, 1)]
  const canDirectApply = parseFloat(directWidth) > 0 && parseFloat(directHeight) > 0

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl w-[90vw] h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-sky-500" />
            <div>
              <h2 className="font-bold text-gray-700">کالیبراسیون نقشه</h2>
              <p className="text-xs text-gray-400">
                ابعاد واقعی نقشه را به متر وارد کنید یا با نقاط مرجع کالیبره کنید
              </p>
            </div>
          </div>
          {!required && (
            <button onClick={onDismiss} className="p-2 hover:bg-gray-100 rounded-xl">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          )}
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b px-6">
          <button
            onClick={() => setMode('direct')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              mode === 'direct'
                ? 'border-sky-500 text-sky-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5 inline ml-1.5" />
            وارد کردن ابعاد
          </button>
          <button
            onClick={() => setMode('points')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              mode === 'points'
                ? 'border-sky-500 text-sky-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <Ruler className="w-3.5 h-3.5 inline ml-1.5" />
            کالیبراسیون با نقاط
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {mode === 'direct' ? (
            <>
              <div ref={containerRef} className="flex-1 overflow-auto flex items-center justify-center bg-gray-50 p-4">
                {mapImg ? (
                  <img
                    src={mapImageUrl}
                    alt="نقشه"
                    className="max-w-full max-h-full object-contain rounded-lg shadow border"
                  />
                ) : (
                  <div className="animate-spin w-8 h-8 border-4 border-sky-200 border-t-sky-500 rounded-full" />
                )}
              </div>
              <div className="w-72 border-r p-4 space-y-4 overflow-y-auto">
                <div className="bg-sky-50 rounded-xl p-3 border border-sky-100">
                  <p className="text-xs text-sky-700 font-medium mb-1">ابعاد تصویر آپلود شده</p>
                  <p className="text-[10px] text-sky-500">
                    {mapImg ? `${mapImg.naturalWidth} × ${mapImg.naturalHeight} پیکسل` : 'در حال بارگذاری...'}
                  </p>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-bold text-gray-600 block">
                    ابعاد واقعی نقشه (متر)
                  </Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-20">عرض (متر):</span>
                      <Input
                        type="number"
                        step="0.1"
                        value={directWidth}
                        onChange={(e) => setDirectWidth(e.target.value)}
                        placeholder="مثلاً 200"
                        className="h-8 text-xs flex-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-20">ارتفاع (متر):</span>
                      <Input
                        type="number"
                        step="0.1"
                        value={directHeight}
                        onChange={(e) => setDirectHeight(e.target.value)}
                        placeholder="مثلاً 150"
                        className="h-8 text-xs flex-1"
                      />
                    </div>
                  </div>

                  {canDirectApply && (
                    <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-100">
                      <p className="text-[10px] text-emerald-600">
                        مقیاس: {parseFloat(directWidth) > 0 ? (mapImg ? (mapImg.naturalWidth / parseFloat(directWidth)).toFixed(1) : '—') : '—'} پیکسل/متر
                      </p>
                      <p className="text-[10px] text-emerald-600">
                        هر متر روی نقشه ≈ {parseFloat(directWidth) > 0 && mapImg ? (mapImg.naturalWidth / parseFloat(directWidth)).toFixed(1) : '—'} پیکسل
                      </p>
                    </div>
                  )}
                </div>

                <div className="w-full h-px bg-gray-200" />

                <div className="space-y-2">
                  <Button
                    onClick={handleDirectApply}
                    disabled={!canDirectApply}
                    className="w-full bg-sky-500 hover:bg-sky-600 text-white h-9"
                  >
                    <CheckCircle className="w-4 h-4 ml-2" />
                    اعمال ابعاد
                  </Button>
                  {!required && (
                    <Button
                      onClick={() => onComplete(100, 100, 1)}
                      variant="outline"
                      className="w-full h-9 text-xs text-gray-400"
                    >
                      رد شدن (ابعاد پیش‌فرض 100×100m)
                    </Button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div ref={containerRef} className="flex-1 overflow-auto flex items-center justify-center bg-gray-50 p-4">
                {mapImg ? (
                  <canvas
                    ref={canvasRef}
                    className="cursor-crosshair rounded-lg shadow border"
                    onClick={handleCanvasClick}
                  />
                ) : (
                  <div className="animate-spin w-8 h-8 border-4 border-sky-200 border-t-sky-500 rounded-full" />
                )}
              </div>
              <div className="w-72 border-r p-4 space-y-4 overflow-y-auto">
                <div>
                  <Label className="text-xs font-bold text-gray-600 mb-2 block">
                    نقاط انتخاب شده ({points.length}/4)
                  </Label>
                  <div className="space-y-1">
                    {points.map(pt => (
                      <div key={pt.label} className="flex items-center gap-2 text-xs">
                        <div className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold">
                          {pt.label}
                        </div>
                        <span className="text-gray-500">
                          ({Math.round(pt.x)}, {Math.round(pt.y)})
                        </span>
                      </div>
                    ))}
                    {points.length < 4 && (
                      <p className="text-[10px] text-gray-400">
                        روی نقشه کلیک کنید تا نقطه {POINT_LABELS[points.length]} اضافه شود
                      </p>
                    )}
                  </div>
                </div>

                <div className="w-full h-px bg-gray-200" />

                {points.length >= 2 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-gray-600 block">
                      فاصله واقعی بین نقاط (متر)
                    </Label>
                    {points.map((pt, i) => {
                      if (i === 0) return null
                      const label = getDistanceLabel(i - 1, i)
                      return (
                        <div key={label} className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-12">{label}:</span>
                          <Input
                            type="number"
                            step="1"
                            value={distances[label] || ''}
                            onChange={(e) => setDistances(prev => ({ ...prev, [label]: e.target.value }))}
                            placeholder="متر"
                            className="h-7 text-xs flex-1"
                          />
                          <span className="text-[10px] text-gray-400">m</span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {points.length === 4 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-12">{getDistanceLabel(3, 0)}:</span>
                      <Input
                        type="number"
                        step="1"
                        value={distances[getDistanceLabel(3, 0)] || ''}
                        onChange={(e) => setDistances(prev => ({ ...prev, [getDistanceLabel(3, 0)]: e.target.value }))}
                        placeholder="متر"
                        className="h-7 text-xs flex-1"
                      />
                      <span className="text-[10px] text-gray-400">m</span>
                    </div>
                  </div>
                )}

                <div className="w-full h-px bg-gray-200" />

                <div className="space-y-2">
                  <Button
                    onClick={handleCalibratePoints}
                    disabled={!canCalibratePoints}
                    className="w-full bg-sky-500 hover:bg-sky-600 text-white h-9"
                  >
                    <CheckCircle className="w-4 h-4 ml-2" />
                    تایید و اعمال کالیبراسیون
                  </Button>
                  <Button
                    onClick={handleReset}
                    variant="outline"
                    className="w-full h-9"
                  >
                    شروع مجدد
                  </Button>
                  {!required && (
                    <Button
                      onClick={() => onComplete(100, 100, 1)}
                      variant="outline"
                      className="w-full h-9 text-xs text-gray-400"
                    >
                      رد شدن (ابعاد پیش‌فرض 100×100m)
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
