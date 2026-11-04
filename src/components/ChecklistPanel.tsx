// SPDX-License-Identifier: Apache-2.0
import { useState, useCallback } from 'react'
import {
  Check, ChevronLeft, ChevronDown, SkipForward, RotateCcw,
  Trash2, Edit3, Copy, Plus, GripVertical, Settings2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import type { DesignElement } from './DesignWorkspace'
import type { HydrocarbonType } from '@/lib/fireCalculations'

export interface ChecklistItem {
  id: number
  label: string
  required: boolean
  type: string
  category: 'infrastructure' | 'storage' | 'process' | 'building' | 'fire_protection'
  realDimensions?: Record<string, { label: string; unit: string; default?: number }>
  editable?: boolean
}

interface ChecklistPanelProps {
  checklist: Record<number, boolean>
  onComplete: (step: number) => void
  onBack: (step: number) => void
  elements: DesignElement[]
  onAddElement: (element: DesignElement) => void
  onUpdateElement: (id: string, updates: Partial<DesignElement>) => void
  onDeleteElement: (id: string) => void
  itemDimensions?: Record<number, Record<string, number>>
  onSetDimensions?: (itemId: number, dims: Record<string, number>) => void
  onSetActiveType?: (type: string | null) => void
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  {
    id: 1, label: 'جانمایی مخزن آب آتش‌نشانی', required: true, type: 'water_tank', category: 'fire_protection',
  },
  {
    id: 2, label: 'جانمایی محل پمپ آب آتش‌نشانی', required: true, type: 'pump', category: 'fire_protection',
  },
  {
    id: 3, label: 'جانمایی محل جوکی پمپ', required: false, type: 'jockey_pump', category: 'fire_protection',
  },
  {
    id: 4, label: 'جانمایی محل مخزن فوم اتوماتیک', required: false, type: 'foam_tank', category: 'fire_protection',
  },
  {
    id: 5, label: 'جانمایی مخازن ذخیره مواد نفتی', required: false, type: 'oil_tank', category: 'storage',
  },
  {
    id: 6, label: 'جانمایی مخزن زیرزمینی مواد آلوده', required: false, type: 'contamination_tank', category: 'storage',
  },
  {
    id: 7, label: 'جانمایی منیفولدها', required: false, type: 'manifold', category: 'process',
  },
  {
    id: 8, label: 'جانمایی ایستگاه گاز', required: false, type: 'gas_station', category: 'process',
  },
  {
    id: 9, label: 'جانمایی ایستگاه برق', required: false, type: 'electrical_station', category: 'process',
  },
  {
    id: 10, label: 'جانمایی ایستگاه مخابرات', required: false, type: 'telecom_station', category: 'process',
  },
  {
    id: 11, label: 'جانمایی سوله پمپ‌ها یا توربین‌ها', required: false, type: 'turbine', category: 'building',
  },
  {
    id: 12, label: 'جانمایی ساختمان کنترل', required: false, type: 'control_building', category: 'building',
  },
  {
    id: 13, label: 'ساختمان‌های اداری', required: false, type: 'office_building', category: 'building',
  },
  {
    id: 14, label: 'ساختمان HSE', required: false, type: 'hse_building', category: 'building',
  },
  {
    id: 15, label: 'ساختمان‌های کارگاهی', required: false, type: 'workshop', category: 'building',
  },
  {
    id: 16, label: 'تجهیزات انبار', required: false, type: 'equipment_store', category: 'building',
  },
  {
    id: 17, label: 'ساختمان انبار', required: false, type: 'warehouse', category: 'building',
  },
  {
    id: 18, label: 'پارکینگ خودروها', required: false, type: 'parking', category: 'building',
  },
]

const CATEGORIES = [
  { id: 'fire_protection', label: '🔗 تجهیزات اطفاء و آب آتش‌نشانی', color: '#3b82f6' },
  { id: 'storage', label: '🛢️ مخازن و باندوال', color: '#f59e0b' },
  { id: 'process', label: '⚙️ تاسیسات فرآیندی', color: '#8b5cf6' },
  { id: 'building', label: '🏢 ساختمان‌ها', color: '#10b981' },
]

export default function ChecklistPanel({
  checklist, onComplete, onBack, elements, onDeleteElement,
  itemDimensions = {}, onSetDimensions, onSetActiveType
}: ChecklistPanelProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [localDimensions, setLocalDimensions] = useState<Record<number, Record<string, number>>>({})
  const [showDimEditor, setShowDimEditor] = useState<number | null>(null)
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST)

  const firstIncomplete = checklistItems.findIndex(item => !checklist[item.id])

  const startRename = useCallback((item: ChecklistItem) => {
    setEditingId(item.id)
    setEditLabel(item.label)
  }, [])

  const confirmRename = useCallback(() => {
    if (editingId !== null && editLabel.trim()) {
      setChecklistItems(prev => prev.map(item =>
        item.id === editingId ? { ...item, label: editLabel.trim() } : item
      ))
    }
    setEditingId(null)
  }, [editingId, editLabel])

  const duplicateItem = useCallback((item: ChecklistItem) => {
    const maxId = Math.max(...checklistItems.map(i => i.id))
    const newItem: ChecklistItem = {
      ...item,
      id: maxId + 1,
      label: `${item.label} (کپی)`,
      editable: true,
    }
    setChecklistItems(prev => [...prev, newItem])
  }, [checklistItems])

  const deleteItem = useCallback((itemId: number) => {
    setChecklistItems(prev => prev.filter(i => i.id !== itemId))
    const next = { ...checklist }
    delete next[itemId]
  }, [checklist])

  const saveDimensions = useCallback((itemId: number) => {
    const dims = localDimensions[itemId] || {}
    if (onSetDimensions) onSetDimensions(itemId, dims)
    setShowDimEditor(null)
  }, [localDimensions, onSetDimensions])

  const groupedItems = CATEGORIES.map(cat => ({
    ...cat,
    items: checklistItems.filter(i => i.category === cat.id)
  }))

  return (
    <div className="w-96 bg-white/60 backdrop-blur-md border-l border-white/50 overflow-y-auto flex-shrink-0">
      <div className="p-4">
        <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
          <Check className="w-5 h-5 text-sky-500" />
          چک‌لیست جانمایی
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          آیتم‌ها را به ترتیب تکمیل کنید — امکان حذف، تغییر نام و کپی وجود دارد
        </p>

        <div className="space-y-4">
          {groupedItems.map(category => (
            <div key={category.id}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: category.color }} />
                <span className="text-xs font-bold text-gray-600">{category.label}</span>
              </div>

              <div className="space-y-1">
                {category.items.map((item, index) => {
                  const globalIndex = checklistItems.indexOf(item)
                  const isCompleted = checklist[item.id]
                  const isExpanded = expandedStep === item.id
                  const isCurrent = globalIndex === firstIncomplete
                  const isAccessible = globalIndex === 0 || checklist[checklistItems[globalIndex - 1]?.id] || isCurrent
                  const placedCount = elements.filter(e => e.type === item.type && e.layer >= 0).length
                  const isEditing = editingId === item.id
                  const dims = itemDimensions[item.id] || localDimensions[item.id] || {}

                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border transition-all ${
                        isCompleted
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : isCurrent
                            ? 'bg-sky-50/50 border-sky-200 shadow-sm'
                            : isAccessible
                              ? 'bg-white/50 border-gray-200 hover:border-sky-200'
                              : 'bg-gray-50/30 border-gray-100 opacity-50'
                      }`}
                    >
                      <div className="flex items-center px-2 py-1">
                        {/* Gripper */}
                        <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />

                        {/* Status */}
                        <button
                          onClick={() => {
                            if (!isAccessible && !isCompleted) return
                            const newExpanded = isExpanded ? null : item.id
                            setExpandedStep(newExpanded)
                            if (onSetActiveType) onSetActiveType(newExpanded ? item.type : null)
                          }}
                          className="flex-1 flex items-center justify-between text-right py-1.5 px-1"
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              isCompleted
                                ? 'bg-emerald-500 text-white'
                                : isCurrent
                                  ? 'bg-sky-500 text-white'
                                  : 'bg-gray-200 text-gray-500'
                            }`}>
                              {isCompleted ? '✓' : item.id}
                            </div>
                            {isEditing ? (
                              <Input
                                value={editLabel}
                                onChange={(e) => setEditLabel(e.target.value)}
                                onBlur={confirmRename}
                                onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
                                className="h-6 text-xs w-40"
                                autoFocus
                              />
                            ) : (
                              <span className={`text-xs ${isCompleted ? 'text-emerald-600 line-through' : 'text-gray-600'}`}>
                                {item.label}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {placedCount > 0 && (
                              <span className="text-[10px] bg-sky-100 text-sky-600 px-1.5 py-0.5 rounded-full font-bold">
                                {placedCount}
                              </span>
                            )}
                            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                        </button>

                        {/* Quick Actions */}
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            onClick={() => startRename(item)}
                            className="p-1 hover:bg-gray-100 rounded transition"
                            title="تغییر نام"
                          >
                            <Edit3 className="w-3 h-3 text-gray-400" />
                          </button>
                          <button
                            onClick={() => duplicateItem(item)}
                            className="p-1 hover:bg-gray-100 rounded transition"
                            title="کپی"
                          >
                            <Copy className="w-3 h-3 text-gray-400" />
                          </button>
                          {item.editable && (
                            <button
                              onClick={() => deleteItem(item.id)}
                              className="p-1 hover:bg-red-50 rounded transition"
                              title="حذف"
                            >
                              <Trash2 className="w-3 h-3 text-red-400" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-2">
                          <div className="text-[11px] text-gray-500">
                            {item.required ? '⚠️ اجباری' : 'اختیاری'} — {placedCount} تجهیز جانمایی شده
                          </div>

                          {/* Real Dimensions */}
                          {item.realDimensions && Object.keys(item.realDimensions).length > 0 && (
                            <div className="bg-white/70 rounded-lg p-2 space-y-1.5 border border-gray-100">
                              <div className="flex items-center justify-between">
                                <Label className="text-[10px] font-bold text-gray-500 uppercase">ابعاد واقعی</Label>
                                <button
                                  onClick={() => setShowDimEditor(showDimEditor === item.id ? null : item.id)}
                                  className="p-0.5 hover:bg-gray-100 rounded"
                                >
                                  <Settings2 className="w-3 h-3 text-gray-400" />
                                </button>
                              </div>
                              {showDimEditor === item.id ? (
                                <div className="space-y-1.5">
                                  {Object.entries(item.realDimensions).map(([field, meta]) => (
                                    <div key={field} className="flex items-center gap-1.5">
                                      <Label className="text-[10px] text-gray-500 w-16 text-right">{meta.label}</Label>
                                      <Input
                                        type="number"
                                        step="0.1"
                                        value={dims[field] || meta.default || ''}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value)
                                          if (!isNaN(val)) {
                                            setLocalDimensions(prev => ({
                                              ...prev,
                                              [item.id]: { ...(prev[item.id] || {}), [field]: val }
                                            }))
                                          }
                                        }}
                                        className="h-6 text-[11px] flex-1"
                                      />
                                      <span className="text-[9px] text-gray-400 w-10">{meta.unit}</span>
                                    </div>
                                  ))}
                                  <Button
                                    size="sm"
                                    onClick={() => saveDimensions(item.id)}
                                    className="w-full h-6 text-[10px] bg-sky-500"
                                  >
                                    ذخیره ابعاد
                                  </Button>
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  {Object.entries(item.realDimensions).map(([field, meta]) => (
                                    <div key={field} className="flex items-center justify-between">
                                      <span className="text-[10px] text-gray-500">{meta.label}</span>
                                      <span className="text-[10px] font-bold text-gray-700">
                                        {dims[field] || meta.default || '—'} {meta.unit}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="text-[10px] text-gray-400">
                            ابزار مخصوص: {item.label.replace('جانمایی ', '')}
                          </div>

                          <div className="flex gap-1.5">
                            {!isCompleted && (
                              <Button
                                size="sm"
                                onClick={() => onComplete(item.id)}
                                className="flex-1 h-7 text-[11px] bg-emerald-500 hover:bg-emerald-600"
                              >
                                <Check className="w-3 h-3 ml-1" />
                                تکمیل
                              </Button>
                            )}
                            {!item.required && !isCompleted && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onComplete(item.id)}
                                className="h-7 text-[11px] text-amber-600 border-amber-200"
                              >
                                <SkipForward className="w-3 h-3 ml-1" />
                                رد شدن
                              </Button>
                            )}
                            {isCompleted && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onBack(item.id)}
                                className="h-7 text-[11px] text-red-500 border-red-200"
                              >
                                <RotateCcw className="w-3 h-3 ml-1" />
                                برگشت
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Progress */}
        <div className="mt-4 p-3 bg-white/50 rounded-xl border border-white/50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">پیشرفت چک‌لیست</span>
            <span className="text-xs font-bold text-sky-500">
              {Object.values(checklist).filter(Boolean).length}/{checklistItems.length}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-sky-400 to-emerald-400 h-2 rounded-full transition-all"
              style={{ width: `${(Object.values(checklist).filter(Boolean).length / checklistItems.length) * 100}%` }}
            />
          </div>
          {firstIncomplete >= 0 && (
            <div className="text-[10px] text-gray-400 mt-1.5">
              مرحله بعد: {checklistItems[firstIncomplete]?.label}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
