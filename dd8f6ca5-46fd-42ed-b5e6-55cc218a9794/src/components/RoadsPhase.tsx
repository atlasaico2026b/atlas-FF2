// SPDX-License-Identifier: Apache-2.0
import { useState, useMemo } from 'react'
import { Route, GitBranch, AlertTriangle, Check, Info, Construction } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import type { DesignElement, PipeSegment } from './DesignWorkspace'

interface RoadsPhaseProps {
  elements: DesignElement[]
  pipes: PipeSegment[]
  onUpdateElement: (id: string, updates: Partial<DesignElement>) => void
  onAddElement: (element: DesignElement) => void
}

interface RoadInfo {
  id: string
  name: string
  width: number
  length: number
  hasBridge: boolean
  bridgeHeight?: number
  ringPassesUnder: boolean
}

export default function RoadsPhase({ elements, pipes, onUpdateElement, onAddElement }: RoadsPhaseProps) {
  const [selectedRoad, setSelectedRoad] = useState<string | null>(null)
  const [ringDesignMode, setRingDesignMode] = useState<'auto' | 'manual'>('auto')

  const roads = useMemo(() =>
    elements.filter(e => e.type === 'road'),
    [elements]
  )

  const bridges = useMemo(() =>
    elements.filter(e => e.type === 'bridge'),
    [elements]
  )

  const firePipes = useMemo(() =>
    elements.filter(e => e.type === 'fire_pipe'),
    [elements]
  )

  const tips = [
    { icon: '🛣️', text: 'جاده‌ها را با ابزار رسم مسیر بکشید — طول و عرض واقعی قابل تنظیم است' },
    { icon: '🌉', text: 'پل‌ها را روی جاده‌ها قرار دهید تا مسیر عبور لوله مشخص شود' },
    { icon: '🔄', text: 'ترجیح: لاین رینگ آب از زیر مقطع عرضی جاده عبور کند (حداکثر تخریب کمتر)' },
    { icon: '❌', text: 'مسیر عبور از زیر ساختمان‌ها مجاز نیست — در امتداد جاده طراحی شود' },
    { icon: '📐', text: 'متراژ لوله پس از رسم قابل ویرایش دستی است — سیستم کل را ذخیره می‌کند' },
  ]

  return (
    <div className="w-96 bg-white/60 backdrop-blur-md border-l border-white/50 overflow-y-auto flex-shrink-0">
      <div className="p-4">
        <h3 className="font-bold text-gray-700 mb-1 flex items-center gap-2">
          <Route className="w-5 h-5 text-sky-500" />
          جاده‌ها، پل‌ها و مسیر رینگ
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          مسیر عبور لاین رینگ آب آتش‌نشانی را در امتداد جاده‌ها و زیر پل‌ها مشخص کنید
        </p>

        {/* Tips */}
        <div className="space-y-1.5 mb-4">
          {tips.map((tip, i) => (
            <div key={i} className="flex items-start gap-2 px-2 py-1.5 bg-sky-50/50 rounded-lg">
              <span className="text-sm flex-shrink-0">{tip.icon}</span>
              <span className="text-[10px] text-gray-500 leading-relaxed">{tip.text}</span>
            </div>
          ))}
        </div>

        <Separator className="my-3" />

        {/* Roads Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold text-gray-600">جاده‌های ترسیم شده</Label>
            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{roads.length}</span>
          </div>

          {roads.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <Route className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">هنوز جاده‌ای ترسیم نشده</p>
              <p className="text-[10px] mt-1">از ابزار طراحی «جاده» استفاده کنید</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {roads.map(road => (
                <div
                  key={road.id}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                    selectedRoad === road.id
                      ? 'bg-sky-50 border-sky-300'
                      : 'bg-white/50 border-gray-200 hover:border-sky-200'
                  }`}
                  onClick={() => setSelectedRoad(road.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600">{road.label || 'جاده'}</span>
                    <div className="flex gap-1">
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        {road.width.toFixed(0)}×{road.height.toFixed(0)} m
                      </span>
                    </div>
                  </div>
                  {selectedRoad === road.id && (
                    <div className="mt-2 space-y-1.5">
                      <div>
                        <Label className="text-[10px] text-gray-500">نام جاده</Label>
                        <Input
                          value={road.label || ''}
                          onChange={(e) => onUpdateElement(road.id, { label: e.target.value })}
                          className="h-6 text-[11px]"
                          placeholder="نام جاده"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <Label className="text-[10px] text-gray-500">عرض (m)</Label>
                          <Input
                            type="number"
                            value={road.width}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value)
                              if (!isNaN(v)) onUpdateElement(road.id, { width: v })
                            }}
                            className="h-6 text-[11px]"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-gray-500">طول (m)</Label>
                          <Input
                            type="number"
                            value={road.height}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value)
                              if (!isNaN(v)) onUpdateElement(road.id, { height: v })
                            }}
                            className="h-6 text-[11px]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator className="my-3" />

        {/* Bridges Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold text-gray-600">پل‌ها</Label>
            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{bridges.length}</span>
          </div>
          {bridges.length === 0 ? (
            <div className="text-center py-4 text-gray-400">
              <Construction className="w-6 h-6 mx-auto mb-1 opacity-30" />
              <p className="text-[10px]">هنوز پلی ترسیم نشده</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {bridges.map(bridge => (
                <div key={bridge.id} className="p-2 bg-white/50 rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">{bridge.label || 'پل'}</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        defaultChecked
                        className="w-3 h-3"
                        title="لوله از زیر پل عبور می‌کند"
                      />
                      <span className="text-[9px] text-gray-400">عبور لوله</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator className="my-3" />

        {/* Ring Route Mode */}
        <div className="space-y-3">
          <Label className="text-xs font-bold text-gray-600">حالت طراحی رینگ</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setRingDesignMode('auto')}
              className={`p-3 rounded-xl border text-center transition-all ${
                ringDesignMode === 'auto'
                  ? 'bg-sky-50 border-sky-300 shadow-sm'
                  : 'bg-white/50 border-gray-200 hover:border-sky-200'
              }`}
            >
              <GitBranch className={`w-5 h-5 mx-auto mb-1 ${ringDesignMode === 'auto' ? 'text-sky-500' : 'text-gray-400'}`} />
              <span className={`text-[11px] font-medium ${ringDesignMode === 'auto' ? 'text-sky-600' : 'text-gray-500'}`}>
                خودکار (AI)
              </span>
            </button>
            <button
              onClick={() => setRingDesignMode('manual')}
              className={`p-3 rounded-xl border text-center transition-all ${
                ringDesignMode === 'manual'
                  ? 'bg-amber-50 border-amber-300 shadow-sm'
                  : 'bg-white/50 border-gray-200 hover:border-amber-200'
              }`}
            >
              <Route className={`w-5 h-5 mx-auto mb-1 ${ringDesignMode === 'manual' ? 'text-amber-500' : 'text-gray-400'}`} />
              <span className={`text-[11px] font-medium ${ringDesignMode === 'manual' ? 'text-amber-600' : 'text-gray-500'}`}>
                دستی
              </span>
            </button>
          </div>
        </div>

        <Separator className="my-3" />

        {/* Ring Pipes Summary */}
        <div className="space-y-2">
          <Label className="text-xs font-bold text-gray-600">لوله‌های رینگ ترسیم شده</Label>
          {firePipes.length === 0 ? (
            <div className="text-center py-3 text-gray-400">
              <p className="text-[10px]">هنوز لوله‌ای ترسیم نشده</p>
            </div>
          ) : (
            <div className="space-y-1">
              {firePipes.map(pipe => (
                <div key={pipe.id} className="flex items-center justify-between px-2 py-1.5 bg-white/50 rounded-lg border border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: pipe.color }} />
                    <span className="text-[11px] text-gray-600">{pipe.label || 'لوله رینگ'}</span>
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {(pipe.width || 0).toFixed(0)} × {(pipe.height || 0).toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="mt-4 p-3 bg-white/50 rounded-xl border border-white/50">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-medium text-gray-600">خلاصه وضعیت</span>
          </div>
          <div className="space-y-1 text-[11px] text-gray-500">
            <div className="flex justify-between">
              <span>جاده‌ها:</span>
              <span className="font-bold">{roads.length}</span>
            </div>
            <div className="flex justify-between">
              <span>پل‌ها:</span>
              <span className="font-bold">{bridges.length}</span>
            </div>
            <div className="flex justify-between">
              <span>لوله‌های رینگ:</span>
              <span className="font-bold">{firePipes.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
