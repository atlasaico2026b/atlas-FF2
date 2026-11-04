// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ArrowRight, Plus, Minus, ChevronLeft, ChevronRight, SlidersHorizontal, RotateCcw, Save, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import DesignCanvas, {
  DEFAULT_NODE_STYLE, NODE_SIZE_LIMITS, NODE_SPREAD_LIMITS, clampNodeStyle,
} from './DesignCanvas'
import type { NodeStyle } from './DesignCanvas'
import TopToolbar from './TopToolbar'
import LeftToolbar from './LeftToolbar'
import ChecklistPanel from './ChecklistPanel'
import ZonePanel from './ZonePanel'
import DesignPanel from './DesignPanel'
import WorstCasePanel from './WorstCasePanel'
import ExportPanel from './ExportPanel'
import OutputPreview from './OutputPreview'
import LayerPanel from './LayerPanel'
import PropertyEditor from './PropertyEditor'
import PointEditor from './PointEditor'
import MapCalibration from './MapCalibration'

import type { PipeNode } from '@/lib/pipeNodeTypes'
import { sanitizePointItems } from '@/lib/pipePoints'
import { sanitizeNodeSpecs } from '@/lib/pipePointSpecs'
import { defaultBasis, setActiveBasis } from '@/lib/calc/basis'
import type { DesignBasis } from '@/lib/calc/provenance'
import { migrateDesignBasis } from '@/lib/calc/legacy'
import { computeWaterSpray } from '@/lib/calc/nfpa15'
import { validateDesign, type ValidationResult } from '@/lib/calc/validate'

/** Pixels-per-metre recorded when the plan was calibrated, or null when it was not. */
function calibrationScale(project: any): number | null {
  const raw = project?.calibration
  if (!raw) return null
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const value = Number(parsed?.pxPerMeter)
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export interface DesignElement {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  layer: number
  label?: string
  color?: string
  properties?: Record<string, unknown>
}

export interface PipeSegment {
  id: string
  points: { x: number; y: number }[]
  layer: number
  color: string
  label?: string
  length?: number
  roadWidth?: number
  pipeWidth?: number
  pipeSize?: string
  pipeType?: string
  material?: string
  flowDirection?: 'forward' | 'backward' | 'none'
  /** Fittings attached along this pipe (Points feature) */
  nodes?: PipeNode[]
}

export interface LayerConfig {
  id: number
  name: string
  visible: boolean
  color: string
}

export type DesignPhase = 'checklist' | 'roads' | 'zones' | 'worstcase' | 'design' | 'export'

interface DesignWorkspaceProps {
  projectId: string
  onBack: () => void
}

/**
 * Nodes are repaired on the way in *and* on the way out: a design saved before
 * a fitting was retired (or one that slipped two monitors onto a node) must
 * never reach the canvas or the database.
 */
function sanitizePipes(pipes: PipeSegment[]): PipeSegment[] {
  return pipes.map(p => p.nodes?.length
    ? {
        ...p,
        nodes: p.nodes.map(n => {
          const items = sanitizePointItems(n.items || [])
          return { ...n, items, specs: sanitizeNodeSpecs(items, n.specs) }
        }),
      }
    : p)
}

function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw || raw === 'null' || raw === 'undefined') return fallback
  try {
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

// The node-fitting look is a display preference, not part of the design: it is
// kept per project on the device rather than pushed into the project record.
const nodeStyleKey = (projectId: string) => `atlas.nodeStyle.${projectId}`

function loadNodeStyle(projectId: string): NodeStyle {
  try {
    return clampNodeStyle(JSON.parse(localStorage.getItem(nodeStyleKey(projectId)) || 'null'))
  } catch {
    return DEFAULT_NODE_STYLE
  }
}

const DEFAULT_LAYERS: LayerConfig[] = [
  { id: 0, name: 'نقشه / بکگراند', visible: true, color: '#94a3b8' },
  { id: -2, name: 'اطلاعات تجهیزات', visible: true, color: '#3b82f6' },
  { id: 1, name: 'مخزن آب و پمپ', visible: true, color: '#3b82f6' },
  { id: 2, name: 'مخازن نفتی', visible: true, color: '#f59e0b' },
  { id: 3, name: 'توربین و الکتروموتور', visible: true, color: '#8b5cf6' },
  { id: 4, name: 'ساختمان‌ها و سازه‌ها', visible: true, color: '#10b981' },
  { id: 5, name: 'ایستگاه‌ها', visible: true, color: '#ef4444' },
  { id: 6, name: 'تجهیزات اطفاء حریق', visible: true, color: '#06b6d4' },
  { id: 7, name: 'کولینگ و فومینگ', visible: true, color: '#ec4899' },
]

const PHASES: { id: DesignPhase; label: string; icon: string }[] = [
  { id: 'checklist', label: 'جانمایی', icon: '📍' },
  { id: 'zones', label: 'زون‌بندی', icon: '🎯' },
  { id: 'worstcase', label: 'ورست‌کیس', icon: '⚠️' },
  { id: 'design', label: 'طراحی', icon: '🔧' },
  { id: 'export', label: 'خروجی', icon: '📤' },
]

export default function DesignWorkspace({ projectId, onBack }: DesignWorkspaceProps) {
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [phase, setPhase] = useState<DesignPhase>('checklist')
  const [activeTool, setActiveTool] = useState('select')
  const [activeLayer, setActiveLayer] = useState(0)
  const [elements, setElements] = useState<DesignElement[]>([])
  const [pipes, setPipes] = useState<PipeSegment[]>([])
  const [selectedElement, setSelectedElement] = useState<string | null>(null)
  const [selectedPipe, setSelectedPipe] = useState<string | null>(null)
  const [checklist, setChecklist] = useState<Record<number, boolean>>({})
  const [zones, setZones] = useState<Record<string, string>>({})
  const [zoom, setZoom] = useState(1)
  const [nodeStyle, setNodeStyle] = useState<NodeStyle>(DEFAULT_NODE_STYLE)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [layers, setLayers] = useState<LayerConfig[]>(DEFAULT_LAYERS)
  const [showLayerPanel, setShowLayerPanel] = useState(true)
  const [designMode, setDesignMode] = useState<'auto' | 'manual' | null>(null)
  const [itemDimensions, setItemDimensions] = useState<Record<number, Record<string, number>>>({})
  const [drawShapeType, setDrawShapeType] = useState('building')
  const [drawPipeType, setDrawPipeType] = useState('fire_water')
  const [pipeSize, setPipeSize] = useState('2"')
  const [showRoadLabel, setShowRoadLabel] = useState(true)
  const [showPipeNameLabel, setShowPipeNameLabel] = useState(true)
  const [showPipeSizeLabel, setShowPipeSizeLabel] = useState(true)
  const [gridSnap, setGridSnap] = useState(false)
  const [orthogonal, setOrthogonal] = useState(false)
  const [showCalibration, setShowCalibration] = useState(false)
  const [pendingMapUrl, setPendingMapUrl] = useState<string | null>(null)
  const [activeChecklistType, setActiveChecklistType] = useState<string | null>(null)
  const [worstCaseResult, setWorstCaseResult] = useState<any>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [showOutputPreview, setShowOutputPreview] = useState(false)
  // The engine's fixed constants, materialised once so the report can carry the
  // documentation for every number. There is no screen that edits it, and a
  // project saved by an older build is migrated on load only so its stored
  // values can be ignored rather than misread.
  const [basis, setBasis] = useState<DesignBasis>(() => defaultBasis())
  const [basisMigrations, setBasisMigrations] = useState<string[]>([])

  // Property editor state
  const editingElement = elements.find(e => e.id === selectedElement)

  useEffect(() => {
    setNodeStyle(loadNodeStyle(projectId))
  }, [projectId])

  const updateNodeStyle = useCallback((next: NodeStyle) => {
    const clean = clampNodeStyle(next)
    setNodeStyle(clean)
    try {
      localStorage.setItem(nodeStyleKey(projectId), JSON.stringify(clean))
    } catch {
      // Private-mode browsers refuse writes; the setting still applies live.
    }
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${projectId}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(resp => {
        if (cancelled) return
        const proj = resp?.data || resp
        setProject(proj)
        setElements(safeParseJSON<DesignElement[]>(proj.elements, []))
        setChecklist(safeParseJSON<Record<number, boolean>>(proj.checklist, {}))
        setZones(safeParseJSON<Record<string, string>>(proj.zones, {}))
        setWorstCaseResult(safeParseJSON<any>(proj.worstCaseResult, null))
        const migration = migrateDesignBasis(safeParseJSON<any>(proj.designBasis, null))
        setBasis(migration.basis)
        setBasisMigrations(migration.migrations)
        setPipes(sanitizePipes(safeParseJSON<PipeSegment[]>(proj.ringDesign, [])))
        // Remember what the server already holds, so the autosave effect does not
        // fire a redundant write the moment the project opens.
        lastSavedRef.current = JSON.stringify({
          elements: JSON.stringify(safeParseJSON<DesignElement[]>(proj.elements, [])),
          ringDesign: JSON.stringify(sanitizePipes(safeParseJSON<PipeSegment[]>(proj.ringDesign, []))),
          zones: JSON.stringify(safeParseJSON<Record<string, string>>(proj.zones, {})),
          checklist: JSON.stringify(safeParseJSON<Record<number, boolean>>(proj.checklist, {})),
        })
        hydratedRef.current = true
      })
      .catch(err => {
        if (!cancelled) {
          console.error('Failed to load project:', err)
          setLoadError(err.message || 'خطا در بارگذاری پروژه')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [projectId])

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  // Closing the window mid-edit: nothing extra is needed, because every mutator
  // already PATCHes immediately and this debounce is only a safety net. A fetch
  // fired from `beforeunload` is aborted by the browser mid-flight, so it would
  // be a promise that never lands.
  const hydratedRef = useRef(false)
  const lastSavedRef = useRef('')

  const persist = useCallback(async (updates: Record<string, unknown>) => {
    setSaveState('saving')
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSaveState('saved')
      setLastSavedAt(new Date().toLocaleTimeString('fa-IR'))
      return true
    } catch (err) {
      console.error('Failed to save:', err)
      setSaveState('error')
      setNotice('ذخیره‌سازی ناموفق بود — تغییرات روی دیسک نوشته نشد')
      return false
    }
  }, [projectId])

  const saveProject = useCallback(async (updates: Record<string, unknown>) => {
    await persist(updates)
  }, [persist])

  // ─── Instant save ─────────────────────────────────────────────────
  // Every edit is flushed to the project file a moment after it settles, so a
  // power cut or a closed window cannot throw the work away. Quick Save runs
  // the same payload immediately.
  const autosavePayload = useMemo(() => ({
    elements: JSON.stringify(elements),
    ringDesign: JSON.stringify(pipes),
    zones: JSON.stringify(zones),
    checklist: JSON.stringify(checklist),
  }), [elements, pipes, zones, checklist])

  useEffect(() => {
    if (!hydratedRef.current) return
    const serialized = JSON.stringify(autosavePayload)
    if (serialized === lastSavedRef.current) return
    const timer = setTimeout(() => {
      lastSavedRef.current = serialized
      void persist(autosavePayload)
    }, 800)
    return () => clearTimeout(timer)
  }, [autosavePayload, persist])

  const quickSave = useCallback(async () => {
    lastSavedRef.current = JSON.stringify(autosavePayload)
    const ok = await persist(autosavePayload)
    setNotice(ok ? 'تغییرات ذخیره شد ✓' : 'ذخیره‌سازی ناموفق بود')
    setTimeout(() => setNotice(''), 2500)
  }, [autosavePayload, persist])

  // Ctrl/Cmd+S saves the project instead of opening the browser's save dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void quickSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quickSave])

  // A plan that was never calibrated opens straight into the calibration step:
  // every length the engine reports is meaningless until the map's scale is known.
  useEffect(() => {
    if (loading || loadError) return
    if (project?.mapImageUrl && calibrationScale(project) === null) {
      setPendingMapUrl(project.mapImageUrl)
      setShowCalibration(true)
    }
  }, [loading, loadError, project])

  // The compatibility facade resolves its constants from one place, so the
  // engine's basis is installed once on mount and never mutated.
  useEffect(() => {
    setActiveBasis(basis)
  }, [basis])

  // Validation compares the worst-case tank against the same fixed constants.
  const validation = useMemo<ValidationResult | null>(() => {
    if (!worstCaseResult || worstCaseResult.isBuilding) return null
    const D = Number(worstCaseResult.D) || 0
    const H = Number(worstCaseResult.H) || 0
    if (!(D > 0) || !(H > 0)) return null
    const spray = computeWaterSpray(
      { equipmentClass: 'vertical_atmospheric_tank', diameterM: D, heightM: H },
      basis,
    )
    return validateDesign({ basis, spray })
  }, [worstCaseResult, basis])

  const addElement = useCallback((element: DesignElement) => {
    setElements(prev => {
      const next = [...prev, element]
      saveProject({ elements: JSON.stringify(next) })
      return next
    })
  }, [saveProject])

  const updateElement = useCallback((id: string, updates: Partial<DesignElement>) => {
    setElements(prev => {
      const next = prev.map(e => e.id === id ? { ...e, ...updates } : e)
      saveProject({ elements: JSON.stringify(next) })
      return next
    })
  }, [saveProject])

  const deleteElement = useCallback((id: string) => {
    setElements(prev => {
      const next = prev.filter(e => e.id !== id)
      saveProject({ elements: JSON.stringify(next) })
      return next
    })
    setSelectedElement(null)
  }, [saveProject])

  const duplicateElement = useCallback((element: DesignElement) => {
    const newElement: DesignElement = {
      ...element,
      id: `${element.type}_${Date.now()}`,
      x: element.x + 30,
      y: element.y + 30,
      label: `${element.label || element.type} (کپی)`,
    }
    addElement(newElement)
  }, [addElement])

  const addPipe = useCallback((pipe: PipeSegment) => {
    setPipes(prev => {
      const next = [...prev, pipe]
      saveProject({ ringDesign: JSON.stringify(next) })
      return next
    })
  }, [saveProject])

  const removePipe = useCallback((id: string) => {
    setPipes(prev => {
      const next = prev.filter(p => p.id !== id)
      saveProject({ ringDesign: JSON.stringify(next) })
      return next
    })
    setSelectedPipe(null)
    setSelectedNodeId(null)
  }, [saveProject])

  const updatePipe = useCallback((id: string, updates: Partial<PipeSegment>) => {
    setPipes(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...updates } : p)
      saveProject({ ringDesign: JSON.stringify(next) })
      return next
    })
  }, [saveProject])

  // ─── Pipe point nodes (Points feature) ───
  const addNode = useCallback((pipeId: string, node: PipeNode) => {
    setPipes(prev => {
      const next = prev.map(p => p.id === pipeId
        ? { ...p, nodes: [...(p.nodes || []), node] }
        : p)
      saveProject({ ringDesign: JSON.stringify(next) })
      return next
    })
    setSelectedNodeId(node.id)
  }, [saveProject])

  const updateNode = useCallback((pipeId: string, nodeId: string, updates: Partial<PipeNode>) => {
    // A fitting's spec only means something while that fitting is on the node,
    // so whenever the list or the specs change they are re-derived together —
    // inside the updater, where the node's own current state is available.
    const touchesFittings = updates.items !== undefined || updates.specs !== undefined
    setPipes(prev => {
      const next = prev.map(p => p.id === pipeId
        ? {
            ...p,
            nodes: (p.nodes || []).map(n => {
              if (n.id !== nodeId) return n
              const merged = { ...n, ...updates }
              const items = sanitizePointItems(merged.items || [])
              return {
                ...merged,
                items,
                specs: touchesFittings ? sanitizeNodeSpecs(items, merged.specs) : merged.specs,
              }
            }),
          }
        : p)
      saveProject({ ringDesign: JSON.stringify(next) })
      return next
    })
  }, [saveProject])

  const removeNode = useCallback((pipeId: string, nodeId: string) => {
    setPipes(prev => {
      const next = prev.map(p => p.id === pipeId
        ? { ...p, nodes: (p.nodes || []).filter(n => n.id !== nodeId) }
        : p)
      saveProject({ ringDesign: JSON.stringify(next) })
      return next
    })
    setSelectedNodeId(null)
  }, [saveProject])

  const canAdvanceToPhase = useCallback((targetPhase: DesignPhase): boolean => {
    const phaseOrder: DesignPhase[] = ['checklist', 'roads', 'zones', 'worstcase', 'design', 'export']
    const currentIndex = phaseOrder.indexOf(phase)
    const targetIndex = phaseOrder.indexOf(targetPhase)
    if (targetIndex <= currentIndex) return true
    for (let i = currentIndex; i < targetIndex; i++) {
      if (i === 0 && Object.values(checklist).filter(Boolean).length === 0) return false
    }
    return true
  }, [phase, checklist])

  const showTools = phase === 'checklist' || phase === 'roads' || phase === 'design'

  // Auto-select tool based on phase
  useEffect(() => {
    if (phase === 'zones') {
      setActiveTool('select')
      setActiveChecklistType(null)
    } else if (phase === 'roads') {
      setActiveTool('draw')
      setDrawShapeType('road')
      setActiveChecklistType(null)
    } else if (phase === 'design' || phase === 'worstcase' || phase === 'export') {
      setActiveChecklistType(null)
    }
  }, [phase])
  const phaseIndex = PHASES.findIndex(p => p.id === phase)

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="animate-spin w-10 h-10 border-4 border-sky-200 border-t-sky-500 rounded-full" />
        <p className="text-gray-400 text-sm">در حال بارگذاری پروژه...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-500">{loadError}</p>
        <button onClick={onBack} className="px-4 py-2 bg-sky-500 text-white rounded-xl">
          بازگشت
        </button>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white/60 backdrop-blur-md border-b border-white/50 z-40 flex-shrink-0">
        {/* `flex-wrap` keeps the toolbar reachable on a phone: the row needs
            ~780px, so without it the whole zoom / upload cluster sits off the
            left edge of a 390px screen where it cannot be tapped or scrolled to. */}
        <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-y-2">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-white/50 rounded-xl transition">
              <ArrowRight className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-base font-bold text-gray-700">{project?.name || 'پروژه'}</h1>
              <span className="text-[10px] text-gray-400">
                {project?.widthMeters || 100}m × {project?.heightMeters || 100}m — ATLAS Fire Protection Design
              </span>
            </div>
            <button
              onClick={() => { void quickSave() }}
              title="ذخیره سریع (Ctrl+S)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500 text-white text-xs font-medium shadow hover:bg-sky-600 transition"
            >
              {saveState === 'saving'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Save className="w-3.5 h-3.5" />}
              ذخیره سریع
            </button>
            <span className="text-[10px] whitespace-nowrap">
              {saveState === 'saving' && <span className="text-gray-400">در حال ذخیره…</span>}
              {saveState === 'saved' && lastSavedAt && (
                <span className="text-emerald-600 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> ذخیره شد {lastSavedAt}
                </span>
              )}
              {saveState === 'error' && <span className="text-red-500">ذخیره نشد</span>}
            </span>
          </div>

          {/* Phase Navigation — Locked Headers */}
          <div className="flex gap-1 items-center">
            {PHASES.map((p, i) => {
              const isActive = phase === p.id
              const isCompleted = i < phaseIndex
              const canGo = i <= phaseIndex || canAdvanceToPhase(p.id)

              return (
                <button
                  key={p.id}
                  onClick={() => canGo && setPhase(p.id)}
                  disabled={!canGo}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                    isActive
                      ? 'bg-sky-500 text-white shadow'
                      : isCompleted
                        ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                        : canGo
                          ? 'bg-white/40 text-gray-500 hover:bg-white/60'
                          : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  }`}
                >
                  <span>{p.icon}</span>
                  <span>{p.label}</span>
                  {isCompleted && <span className="text-[10px]">✓</span>}
                </button>
              )
            })}
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-2">
            <label className="px-3 py-1.5 bg-white/50 rounded-lg text-xs text-gray-500 hover:bg-white/80 cursor-pointer transition">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  // Must be a data: URL. A blob: URL looks fine for the session
                  // but dies with the page, so the saved project would come back
                  // with a broken map and the operator had to upload it again.
                  const reader = new FileReader()
                  reader.onload = () => {
                    setPendingMapUrl(reader.result as string)
                    setShowCalibration(true)
                  }
                  reader.readAsDataURL(file)
                  e.target.value = ''
                }}
              />
              🗺️ آپلود نقشه
            </label>
            <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="p-1.5 bg-white/50 rounded-lg hover:bg-white/80">
              <Minus className="w-4 h-4 text-gray-500" />
            </button>
            <span className="text-xs text-gray-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-1.5 bg-white/50 rounded-lg hover:bg-white/80">
              <Plus className="w-4 h-4 text-gray-500" />
            </button>

            {/* Node fitting look: size and how far a cluster spreads from its node */}
            <Popover>
              <PopoverTrigger
                className="p-1.5 bg-white/50 rounded-lg hover:bg-white/80 text-gray-500"
                title="اندازه و جانمایی آیتم‌های گره"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </PopoverTrigger>
              {/* The custom popover is `absolute` with no inset, which in an RTL
                  document anchors its RIGHT edge and opens leftwards — off the
                  screen, because this trigger sits at the left end of the
                  toolbar. Pin the left edge so it opens into the free space. */}
              <PopoverContent className="w-64 sm:w-72 left-0 right-auto max-w-[calc(100vw-1rem)] space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">آیتم‌های گره</p>
                  <button
                    onClick={() => updateNodeStyle(DEFAULT_NODE_STYLE)}
                    className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800"
                  >
                    <RotateCcw className="w-3 h-3" />
                    بازنشانی
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-gray-600">اندازه آیتم‌ها</Label>
                    <span className="text-xs text-gray-500">{Math.round(nodeStyle.size * 100)}%</span>
                  </div>
                  <Slider
                    value={[nodeStyle.size]}
                    min={NODE_SIZE_LIMITS.min}
                    max={NODE_SIZE_LIMITS.max}
                    step={NODE_SIZE_LIMITS.step}
                    onValueChange={([v]) => updateNodeStyle({ ...nodeStyle, size: v })}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-gray-600">جانمایی — فاصله از گره</Label>
                    <span className="text-xs text-gray-500">{Math.round(nodeStyle.spread * 100)}%</span>
                  </div>
                  <Slider
                    value={[nodeStyle.spread]}
                    min={NODE_SPREAD_LIMITS.min}
                    max={NODE_SPREAD_LIMITS.max}
                    step={NODE_SPREAD_LIMITS.step}
                    onValueChange={([v]) => updateNodeStyle({ ...nodeStyle, spread: v })}
                  />
                </div>

                <p className="text-[11px] leading-5 text-gray-400">
                  فاصله هیچ‌وقت کمتر از دیواره لوله نمی‌شود، پس آیتم‌ها روی خط آتش‌نشانی نمی‌افتند.
                </p>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Toolbar */}
        {showTools && (
          <LeftToolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            phase={phase}
            onAddTypeChange={setDrawShapeType}
            selectedAddType={drawShapeType}
            activeChecklistType={activeChecklistType}
          />
        )}

        {/* Main Canvas Area */}
        <div className="flex-1 relative overflow-hidden min-w-0">
          {showTools && (
            <TopToolbar
              activeTool={activeTool}
              onToolChange={setActiveTool}
              onDelete={() => selectedElement && deleteElement(selectedElement)}
              selectedElement={!!selectedElement}
              drawShapeType={drawShapeType}
              onDrawShapeChange={setDrawShapeType}
              drawPipeType={drawPipeType}
              onDrawPipeTypeChange={setDrawPipeType}
              pipeSize={pipeSize}
              onPipeSizeChange={setPipeSize}
              showRoadLabel={showRoadLabel}
              onShowRoadLabelChange={setShowRoadLabel}
              showPipeNameLabel={showPipeNameLabel}
              onShowPipeNameLabelChange={setShowPipeNameLabel}
              showPipeSizeLabel={showPipeSizeLabel}
              onShowPipeSizeLabelChange={setShowPipeSizeLabel}
              gridSnap={gridSnap}
              onGridSnapChange={setGridSnap}
              orthogonal={orthogonal}
              onOrthogonalChange={setOrthogonal}
            />
          )}

          <DesignCanvas
            project={project}
            elements={elements}
            pipes={pipes}
            layers={layers}
            activeLayer={activeLayer}
            activeTool={activeTool}
            selectedElement={selectedElement}
            selectedPipe={selectedPipe}
            onSelectElement={setSelectedElement}
            onSelectPipe={setSelectedPipe}
            onDeleteElement={deleteElement}
            onDeletePipe={removePipe}
            onUpdatePipe={updatePipe}
            onUpdateElement={updateElement}
            onAddElement={addElement}
            onAddPipe={addPipe}
            onAddNode={addNode}
            onUpdateNode={updateNode}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            nodeStyle={nodeStyle}
            zoom={zoom}
            pan={pan}
            onPanChange={setPan}
            onZoomChange={setZoom}
            phase={phase}
            zones={zones}
            drawShapeType={drawShapeType}
            drawPipeType={drawPipeType}
            pipeSize={pipeSize}
            showRoadLabel={showRoadLabel}
            showPipeName={showPipeNameLabel}
            showPipeSize={showPipeSizeLabel}
            gridSnap={gridSnap}
            orthogonal={orthogonal}
          />

          {showTools && (
            <button
              onClick={() => setShowLayerPanel(v => !v)}
              className="absolute top-3 right-3 z-30 px-3 py-1.5 bg-white/70 backdrop-blur-md rounded-lg border border-white/50 text-xs text-gray-600 hover:bg-white/90 transition shadow"
            >
              {showLayerPanel ? 'پنهان کردن لایه‌ها' : 'نمایش لایه‌ها'}
            </button>
          )}

          {showTools && showLayerPanel && (
            <LayerPanel
              layers={layers}
              activeLayer={activeLayer}
              onLayerChange={setActiveLayer}
              onToggleLayer={(id) => setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l))}
            />
          )}

          {/* Phase Navigation Buttons */}
          {phaseIndex > 0 && (
            <button
              onClick={() => setPhase(PHASES[phaseIndex - 1].id)}
              className="absolute bottom-4 right-4 z-30 flex items-center gap-1 px-3 py-2 bg-white/70 backdrop-blur-md rounded-xl border border-white/50 text-xs text-gray-600 hover:bg-white/90 transition shadow"
            >
              <ChevronRight className="w-4 h-4" />
              مرحله قبل
            </button>
          )}
          {phaseIndex < PHASES.length - 1 && (
            <button
              onClick={() => {
                if (canAdvanceToPhase(PHASES[phaseIndex + 1].id)) {
                  setPhase(PHASES[phaseIndex + 1].id)
                }
              }}
              className={`absolute bottom-4 left-4 z-30 flex items-center gap-1 px-3 py-2 backdrop-blur-md rounded-xl border border-white/50 text-xs transition shadow ${
                canAdvanceToPhase(PHASES[phaseIndex + 1].id)
                  ? 'bg-sky-50/80 text-sky-600 hover:bg-sky-100/90'
                  : 'bg-gray-50/80 text-gray-400 cursor-not-allowed'
              }`}
            >
              مرحله بعد
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Right Panel — Phase-based content */}
        {phase === 'checklist' && (
          <ChecklistPanel
            checklist={checklist}
            onComplete={(step) => {
              setChecklist(prev => {
                const next = { ...prev, [step]: true }
                saveProject({ checklist: JSON.stringify(next) })
                return next
              })
            }}
            onBack={(step) => {
              setChecklist(prev => {
                const next = { ...prev, [step]: false }
                saveProject({ checklist: JSON.stringify(next) })
                return next
              })
            }}
            elements={elements}
            onAddElement={addElement}
            onUpdateElement={updateElement}
            onDeleteElement={deleteElement}
            itemDimensions={itemDimensions}
            onSetDimensions={(itemId, dims) => {
              setItemDimensions(prev => ({ ...prev, [itemId]: dims }))
            }}
            onSetActiveType={setActiveChecklistType}
          />
        )}
        {phase === 'zones' && (
          <ZonePanel
            zones={zones}
            elements={elements}
            onSetZone={(elementId, zone) => {
              setZones(prev => {
                const next = { ...prev, [elementId]: zone }
                saveProject({ zones: JSON.stringify(next) })
                return next
              })
            }}
          />
        )}
        {phase === 'design' && (
          <DesignPanel
            elements={elements}
            pipes={pipes}
            zones={zones}
            project={project}
            worstCaseResult={worstCaseResult}
            onAddPipe={addPipe}
            onAddElement={addElement}
            onDeletePipe={removePipe}
          />
        )}
        {phase === 'worstcase' && (
          <WorstCasePanel
            elements={elements}
            zones={zones}
            project={project}
            onApplyDesign={(design) => {
              setWorstCaseResult(design)
              saveProject({ worstCaseResult: JSON.stringify(design) })
            }}
            onResetDesign={() => {
              setWorstCaseResult(null)
            }}
          />
        )}
        {phase === 'export' && (
          <ExportPanel
            project={project}
            elements={elements}
            pipes={pipes}
            layers={layers}
            zones={zones}
            basis={basis}
            validation={validation}
            onShowOutput={() => setShowOutputPreview(true)}
          />
        )}
        {phase === 'export' && showOutputPreview && (
          <OutputPreview
            project={project}
            elements={elements}
            pipes={pipes}
            zones={zones}
            basis={basis}
            worstCaseResult={worstCaseResult}
            validation={validation}
            onClose={() => setShowOutputPreview(false)}
          />
        )}

        {/* Property Editor — overlays when element selected */}
        {editingElement && (
          <PropertyEditor
            element={editingElement}
            zones={zones}
            onSetZone={(elementId, zoneId) => {
              setZones(prev => {
                const next = { ...prev, [elementId]: zoneId }
                saveProject({ zones: JSON.stringify(next) })
                return next
              })
            }}
            onUpdate={updateElement}
            onDelete={deleteElement}
            onDuplicate={duplicateElement}
            onClose={() => setSelectedElement(null)}
            projectHeightM={project?.heightMeters || 100}
          />
        )}

        {/* Point Editor — overlays when a pipe node is selected */}
        {(() => {
          if (!selectedNodeId) return null
          for (const p of pipes) {
            const n = (p.nodes || []).find(x => x.id === selectedNodeId)
            if (n) {
              return (
                <PointEditor
                  node={n}
                  pipeLabel={p.label}
                  pipeSize={p.pipeSize}
                  onUpdate={updateNode}
                  onDelete={removeNode}
                  onClose={() => setSelectedNodeId(null)}
                />
              )
            }
          }
          return null
        })()}
      </div>

      {notice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-xl bg-slate-800/95 text-white text-sm shadow-xl">
          {notice}
        </div>
      )}

      {/* Map Calibration — required until the plan's scale is known */}
      {showCalibration && pendingMapUrl && (
        <MapCalibration
          mapImageUrl={pendingMapUrl}
          required={calibrationScale(project) === null}
          onComplete={(w, h, scale) => {
            const calibration = JSON.stringify({ pxPerMeter: scale, calibratedAt: new Date().toISOString() })
            saveProject({ widthMeters: w, heightMeters: h, mapImageUrl: pendingMapUrl, calibration })
            setProject((prev: any) => ({ ...prev, widthMeters: w, heightMeters: h, mapImageUrl: pendingMapUrl, calibration }))
            setShowCalibration(false)
            setPendingMapUrl(null)
          }}
          onDismiss={() => {
            setShowCalibration(false)
            setPendingMapUrl(null)
          }}
        />
      )}
    </div>
  )
}
