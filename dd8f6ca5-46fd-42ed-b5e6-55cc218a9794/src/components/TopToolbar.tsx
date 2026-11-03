// SPDX-License-Identifier: Apache-2.0
import { useState, useRef, useEffect } from 'react'
import {
  MousePointer2, Move, Trash2, Plus, Maximize2, Pencil, Hand,
  PenTool, ChevronDown, MapPin,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

interface TopToolbarProps {
  activeTool: string
  onToolChange: (tool: string) => void
  onDelete: () => void
  selectedElement: boolean
  drawShapeType?: string
  onDrawShapeChange?: (type: string) => void
  drawPipeType?: string
  onDrawPipeTypeChange?: (type: string) => void
  pipeSize?: string
  onPipeSizeChange?: (size: string) => void
  gridSnap?: boolean
  onGridSnapChange?: (v: boolean) => void
  orthogonal?: boolean
  onOrthogonalChange?: (v: boolean) => void

  showRoadLabel?: boolean
  onShowRoadLabelChange?: (v: boolean) => void
  showPipeNameLabel?: boolean
  onShowPipeNameLabelChange?: (v: boolean) => void
  showPipeSizeLabel?: boolean
  onShowPipeSizeLabelChange?: (v: boolean) => void
}

const DRAW_PIPE_TYPES = [
  { id: 'fire_water', label: 'لوله آب آتش‌نشانی', color: '#dc2626', icon: '🔴' },
  { id: 'underground', label: 'لوله زیرسطحی آب', color: '#16a34a', icon: '🟢' },
  { id: 'foam', label: 'لوله فوم', color: '#eab308', icon: '🟡' },
  { id: 'co2', label: 'لوله CO₂', color: '#6b7280', icon: '⚪' },
]

const PIPE_SIZE_OPTIONS = ['1"', '1.5"', '2"', '2.5"', '3"', '4"', '6"', '8"', '10"', '12"']

export default function TopToolbar({
  activeTool, onToolChange, onDelete, selectedElement,
  drawShapeType = '', onDrawShapeChange,
  drawPipeType = 'fire_water', onDrawPipeTypeChange,
  pipeSize = '2"', onPipeSizeChange,
  gridSnap = false, onGridSnapChange,
  orthogonal = false, onOrthogonalChange,

  showRoadLabel = true,
  onShowRoadLabelChange,
  showPipeNameLabel = true,
  onShowPipeNameLabelChange,
  showPipeSizeLabel = true,
  onShowPipeSizeLabelChange,
}: TopToolbarProps) {
  const [showDrawMenu, setShowDrawMenu] = useState(false)
  const [showPipeMenu, setShowPipeMenu] = useState(false)
  const drawMenuRef = useRef<HTMLDivElement>(null)
  const pipeMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (drawMenuRef.current && !drawMenuRef.current.contains(e.target as Node)) {
        setShowDrawMenu(false)
        setShowPipeMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleDrawClick = () => {
    if (activeTool === 'draw') {
      setShowDrawMenu(!showDrawMenu)
    } else {
      onToolChange('draw')
      setShowDrawMenu(true)
    }
  }

  const handleDrawShapeSelect = (shape: string) => {
    if (shape === 'pipe') {
      setShowPipeMenu(true)
    } else {
      if (onDrawShapeChange) onDrawShapeChange(shape)
      setShowDrawMenu(false)
      setShowPipeMenu(false)
    }
  }

  const handlePipeSelect = (pipeType: string) => {
    if (onDrawShapeChange) onDrawShapeChange('pipe')
    if (onDrawPipeTypeChange) onDrawPipeTypeChange(pipeType)
    setShowDrawMenu(false)
    setShowPipeMenu(false)
  }

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-white/50 px-2 py-1.5 flex items-center gap-1">
      {/* SELECT */}
      <button
        onClick={() => { onToolChange('select'); setShowDrawMenu(false) }}
        className={`p-2.5 rounded-xl transition-all ${
          activeTool === 'select'
            ? 'bg-sky-500 text-white shadow'
            : 'text-gray-500 hover:bg-white/60 hover:text-gray-700'
        }`}
        title="انتخاب — فقط انتخاب آیتم‌ها"
      >
        <MousePointer2 className="w-5 h-5" />
      </button>

      {/* ADD */}
      <button
        onClick={() => { onToolChange('add'); setShowDrawMenu(false) }}
        className={`p-2.5 rounded-xl transition-all ${
          activeTool === 'add'
            ? 'bg-emerald-500 text-white shadow'
            : 'text-gray-500 hover:bg-white/60 hover:text-gray-700'
        }`}
        title="افزودن — کلیک کنید تا تجهیز اضافه شود"
      >
        <Plus className="w-5 h-5" />
      </button>

      {/* MOVE */}
      <button
        onClick={() => { onToolChange('move'); setShowDrawMenu(false) }}
        className={`p-2.5 rounded-xl transition-all ${
          activeTool === 'move'
            ? 'bg-violet-500 text-white shadow'
            : 'text-gray-500 hover:bg-white/60 hover:text-gray-700'
        }`}
        title="جابجایی — کلیک و درگ کنید"
      >
        <Move className="w-5 h-5" />
      </button>

      {/* EDIT */}
      <button
        onClick={() => { onToolChange('edit'); setShowDrawMenu(false) }}
        className={`p-2.5 rounded-xl transition-all ${
          activeTool === 'edit'
            ? 'bg-amber-500 text-white shadow'
            : 'text-gray-500 hover:bg-white/60 hover:text-gray-700'
        }`}
        title="ویرایش — آیتم انتخابی را ویرایش کنید"
      >
        <PenTool className="w-5 h-5" />
      </button>

      {/* RESIZE */}
      <button
        onClick={() => { onToolChange('resize'); setShowDrawMenu(false) }}
        className={`p-2.5 rounded-xl transition-all ${
          activeTool === 'resize'
            ? 'bg-blue-500 text-white shadow'
            : 'text-gray-500 hover:bg-white/60 hover:text-gray-700'
        }`}
        title="تغییر اندازه"
      >
        <Maximize2 className="w-5 h-5" />
      </button>

      {/* DELETE */}
      <button
        onClick={() => { if (selectedElement) onDelete(); setShowDrawMenu(false) }}
        disabled={!selectedElement}
        className={`p-2.5 rounded-xl transition-all ${
          selectedElement
            ? 'text-red-500 hover:bg-red-50 hover:text-red-600'
            : 'text-gray-300 cursor-not-allowed'
        }`}
        title="حذف"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* DRAW with sub-menu */}
      <div className="relative" ref={drawMenuRef}>
        <button
          onClick={handleDrawClick}
          className={`p-2.5 rounded-xl transition-all flex items-center gap-1 ${
            activeTool === 'draw'
              ? 'bg-sky-600 text-white shadow'
              : 'text-gray-500 hover:bg-white/60 hover:text-gray-700'
          }`}
          title="رسم — لوله، جاده، باندوال"
        >
          <Pencil className="w-5 h-5" />
          <ChevronDown className="w-3 h-3" />
        </button>

        {showDrawMenu && (
          <div className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 p-2 min-w-[200px] z-50">
            <div className="text-[10px] text-gray-400 font-bold px-2 py-1 uppercase">نوع رسم</div>

            {/* Pipe */}
            <div className="relative" ref={pipeMenuRef}>
              <button
                onClick={() => handleDrawShapeSelect('pipe')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition ${
                  drawShapeType === 'pipe' ? 'bg-sky-50 text-sky-700' : 'text-gray-700'
                }`}
              >
                <img src="/equipment-icons/pipe.png" alt="لوله" className="w-6 h-6 object-contain" />
                رسم لوله
                <ChevronDown className="w-3 h-3 mr-auto" />
              </button>
              {showPipeMenu && (
                <div className="absolute right-full top-0 mr-2 bg-white rounded-xl shadow-xl border border-gray-200 p-2 min-w-[220px]">
                  <div className="text-[10px] text-gray-400 font-bold px-2 py-1 uppercase">نوع لوله</div>
                  {DRAW_PIPE_TYPES.map(pt => (
                    <button
                      key={pt.id}
                      onClick={() => handlePipeSelect(pt.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition ${
                        drawPipeType === pt.id ? 'bg-sky-50 text-sky-700 font-medium' : 'text-gray-700'
                      }`}
                    >
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: pt.color }} />
                      <span>{pt.icon}</span>
                      <span>{pt.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Road */}
            <button
              onClick={() => handleDrawShapeSelect('road')}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition ${
                drawShapeType === 'road' ? 'bg-gray-200 text-gray-800' : 'text-gray-700'
              }`}
            >
              <img src="/equipment-icons/road.png" alt="جاده" className="w-6 h-6 object-contain" />
              رسم جاده
            </button>
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* POINT — add fittings onto an existing pipe */}
      <button
        onClick={() => { onToolChange('point'); setShowDrawMenu(false) }}
        className={`p-2.5 rounded-xl transition-all ${
          activeTool === 'point'
            ? 'bg-orange-500 text-white shadow'
            : 'text-gray-500 hover:bg-white/60 hover:text-gray-700'
        }`}
        title="نقطه (Point) — روی لوله کلیک کنید تا گره ایجاد شود"
      >
        <MapPin className="w-5 h-5" />
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* PAN */}
      <button
        onClick={() => { onToolChange('pan'); setShowDrawMenu(false) }}
        className={`p-2.5 rounded-xl transition-all ${
          activeTool === 'pan'
            ? 'bg-gray-500 text-white shadow'
            : 'text-gray-500 hover:bg-white/60 hover:text-gray-700'
        }`}
        title="حرکت صفحه"
      >
        <Hand className="w-5 h-5" />
      </button>

      {/* Pipe Size — visible when draw mode + pipe */}
      {activeTool === 'draw' && (drawShapeType === 'pipe' || drawShapeType === '') && (
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
          <span className="text-[10px] text-gray-500 font-medium">سایز:</span>
          <select
            value={pipeSize}
            onChange={(e) => onPipeSizeChange?.(e.target.value)}
            className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-sky-400"
          >
            {PIPE_SIZE_OPTIONS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {/* نمایش نام/سایز لوله و جاده */}
      {activeTool === 'draw' && (
        <div className="flex flex-col gap-1 bg-gray-100 rounded-lg px-2 py-1">
          <label className="flex items-center gap-2 text-[10px] text-gray-600">
            <Checkbox
              checked={showRoadLabel}
              onCheckedChange={(v) => onShowRoadLabelChange?.(Boolean(v))}
            />
            نمایش نام جاده
          </label>
          <label className="flex items-center gap-2 text-[10px] text-gray-600">
            <Checkbox
              checked={showPipeNameLabel}
              onCheckedChange={(v) => onShowPipeNameLabelChange?.(Boolean(v))}
            />
            نمایش نام لوله
          </label>
          <label className="flex items-center gap-2 text-[10px] text-gray-600">
            <Checkbox
              checked={showPipeSizeLabel}
              onCheckedChange={(v) => onShowPipeSizeLabelChange?.(Boolean(v))}
            />
            نمایش سایز لوله
          </label>
        </div>
      )}

      {/* Grid Snap + Orthogonal — visible in draw mode */}
      {activeTool === 'draw' && (
        <>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <button
            onClick={() => onGridSnapChange?.(!gridSnap)}
            className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              gridSnap
                ? 'bg-emerald-500 text-white shadow'
                : 'text-gray-500 hover:bg-white/60'
            }`}
            title="Snap به شبکه"
          >
            🔲 شبکه
          </button>
          <button
            onClick={() => onOrthogonalChange?.(!orthogonal)}
            className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              orthogonal
                ? 'bg-sky-500 text-white shadow'
                : 'text-gray-500 hover:bg-white/60'
            }`}
            title="قفل ۹۰ درجه"
          >
            ⊥ ۹۰°
          </button>
        </>
      )}
    </div>
  )
}
