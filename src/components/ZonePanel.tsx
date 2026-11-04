// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react'
import { Target, Filter, ChevronDown } from 'lucide-react'
import { Label } from '@/components/ui/label'
import type { DesignElement } from './DesignWorkspace'

interface ZonePanelProps {
  zones: Record<string, string>
  elements: DesignElement[]
  onSetZone: (elementId: string, zone: string) => void
}

const ZONE_DEFINITIONS = [
  { id: 'A', label: 'A - فوق حساس', color: '#ef4444', bg: '#fef2f2', desc: 'بالاترین سطح حفاظت — مخزن اصلی، پمپ خانه', icon: '🔴' },
  { id: 'B', label: 'B - حساس', color: '#f97316', bg: '#fff7ed', desc: 'حفاظت بالا — مخازن نفتی، توربین‌ها', icon: '🟠' },
  { id: 'C', label: 'C - متوسط', color: '#eab308', bg: '#fefce8', desc: 'حفاظت متوسط — منیفولدها، ایستگاه‌ها', icon: '🟡' },
  { id: 'D', label: 'D - کم', color: '#22c55e', bg: '#f0fdf4', desc: 'حفاظت پایین — ساختمان‌های اداری', icon: '🟢' },
  { id: 'E', label: 'E - حداقل', color: '#10b981', bg: '#ecfdf5', desc: 'کپسول اطفا — انبارها، پارکینگ', icon: '💚' },
]

// Only these types can be zone-assigned — NOT water tanks, foam tanks, CO2, rings, roads, bund walls, sprinklers, monitors, hydrants
const ZONEABLE_TYPES = [
  'oil_tank', 'underground_tank', 'contamination_tank',
  'turbine', 'control_building', 'office_building', 'hse_building',
  'workshop', 'equipment_store', 'warehouse', 'manifold',
  'electrical_station', 'telecom_station', 'parking', 'gas_station',
]

const TYPE_LABELS: Record<string, string> = {
  oil_tank: 'مخزن نفتی',
  underground_tank: 'مخزن زیرزمینی',
  contamination_tank: 'مخزن آلوده',
  turbine: 'سوله توربین',
  control_building: 'ساختمان کنترل',
  office_building: 'ساختمان اداری',
  hse_building: 'ساختمان HSE',
  workshop: 'ساختمان کارگاهی',
  equipment_store: 'انبار تجهیزات',
  warehouse: 'ساختمان انبار',
  manifold: 'منیفولد',
  electrical_station: 'ایستگاه برق',
  telecom_station: 'ایستگاه مخابرات',
  parking: 'پارکینگ',
  gas_station: 'ایستگاه گاز',
}

export default function ZonePanel({ zones, elements, onSetZone }: ZonePanelProps) {
  const [filter, setFilter] = useState<string>('all')
  const [selectedZone, setSelectedZone] = useState<string>('A')
  const [expandedElement, setExpandedElement] = useState<string | null>(null)

  const zoneableElements = elements.filter(e => ZONEABLE_TYPES.includes(e.type))

  const filteredElements = filter === 'all'
    ? zoneableElements
    : zoneableElements.filter(e => e.type === filter)

  const usedTypes = [...new Set(zoneableElements.map(e => e.type))]

  const zoneStats = ZONE_DEFINITIONS.map(z => ({
    ...z,
    count: zoneableElements.filter(e => zones[e.id] === z.id).length,
  }))

  const unassignedCount = zoneableElements.filter(e => !zones[e.id]).length

  return (
    <div className="w-96 bg-white/60 backdrop-blur-md border-l border-white/50 overflow-y-auto flex-shrink-0">
      <div className="p-4">
        <h3 className="font-bold text-gray-700 mb-1 flex items-center gap-2">
          <Target className="w-5 h-5 text-sky-500" />
          زون‌بندی ایمنی
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          سطح حفاظتی هر تجهیز را مشخص کنید — فقط مخازن، ساختمان‌ها، منیفولدها و ایستگاه‌ها
        </p>

        {/* Zone Legend */}
        <div className="space-y-1.5 mb-4">
          {zoneStats.map(zone => (
            <button
              key={zone.id}
              onClick={() => setSelectedZone(zone.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition-all ${
                selectedZone === zone.id
                  ? 'shadow-sm scale-[1.01]'
                  : 'hover:scale-[1.005]'
              }`}
              style={{
                backgroundColor: selectedZone === zone.id ? zone.bg : 'transparent',
                borderColor: selectedZone === zone.id ? zone.color + '40' : '#e5e7eb',
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ backgroundColor: zone.color }}
              >
                {zone.id}
              </div>
              <div className="flex-1 text-right">
                <div className="text-xs font-medium" style={{ color: zone.color }}>{zone.label}</div>
                <div className="text-[10px] text-gray-400">{zone.desc}</div>
              </div>
              <Badge count={zone.count} color={zone.color} />
            </button>
          ))}
        </div>

        {unassignedCount > 0 && (
          <div className="px-3 py-2 bg-amber-50 rounded-xl border border-amber-200 mb-4">
            <span className="text-[10px] text-amber-600">
              ⚠️ {unassignedCount} تجهیز هنوز زون‌بندی نشده
            </span>
          </div>
        )}

        {/* Filter */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <Label className="text-xs font-bold text-gray-600">فیلتر بر اساس نوع</Label>
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-1 rounded-lg text-[10px] font-medium transition ${
                filter === 'all' ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              همه ({zoneableElements.length})
            </button>
            {usedTypes.map(type => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-2 py-1 rounded-lg text-[10px] font-medium transition ${
                  filter === type ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {TYPE_LABELS[type] || type}
              </button>
            ))}
          </div>
        </div>

        {/* Elements List */}
        <div className="space-y-1.5">
          {filteredElements.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">
                {elements.length === 0
                  ? 'هنوز تجهیزی جانمایی نشده'
                  : 'تجهیزی با این فیلتر یافت نشد'}
              </p>
            </div>
          ) : (
            filteredElements.map(el => {
              const currentZone = zones[el.id]
              const zoneDef = ZONE_DEFINITIONS.find(z => z.id === currentZone)
              const isExpanded = expandedElement === el.id

              return (
                <div
                  key={el.id}
                  className="bg-white/50 rounded-xl border border-gray-100 overflow-hidden"
                >
                  {/* Element Header */}
                  <button
                    onClick={() => setExpandedElement(isExpanded ? null : el.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/80 transition"
                  >
                    <div className="flex-1 flex items-center gap-2 text-right">
                      <span className="text-[10px] text-gray-400">{TYPE_LABELS[el.type] || el.type}</span>
                      <span className="text-xs font-medium text-gray-600">{el.label || el.type}</span>
                    </div>
                    {currentZone && (
                      <div
                        className="px-2 py-0.5 rounded-full text-white text-[10px] font-bold"
                        style={{ backgroundColor: zoneDef?.color || '#94a3b8' }}
                      >
                        {currentZone}
                      </div>
                    )}
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Zone Buttons */}
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <div className="grid grid-cols-5 gap-1.5">
                        {ZONE_DEFINITIONS.map(zone => (
                          <button
                            key={zone.id}
                            onClick={() => onSetZone(el.id, zone.id)}
                            className={`py-2.5 rounded-lg text-xs font-bold transition-all ${
                              currentZone === zone.id
                                ? 'text-white shadow scale-105'
                                : 'hover:scale-105'
                            }`}
                            style={{
                              backgroundColor: currentZone === zone.id ? zone.color : zone.color + '15',
                              color: currentZone === zone.id ? '#fff' : zone.color,
                            }}
                          >
                            {zone.icon} {zone.id}
                          </button>
                        ))}
                      </div>
                      <div className="mt-1.5 text-[10px] text-gray-400 text-center">
                        موقعیت: ({Math.round(el.x)}, {Math.round(el.y)})
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Summary */}
        <div className="mt-4 p-3 bg-white/50 rounded-xl border border-white/50">
          <div className="space-y-1 text-[10px] text-gray-500">
            <div className="flex justify-between">
              <span>کل تجهیزات قابل زون‌بندی:</span>
              <span className="font-bold">{zoneableElements.length}</span>
            </div>
            <div className="flex justify-between">
              <span>زون‌بندی شده:</span>
              <span className="font-bold text-emerald-500">{zoneableElements.length - unassignedCount}</span>
            </div>
            {unassignedCount > 0 && (
              <div className="flex justify-between">
                <span>بدون زون:</span>
                <span className="font-bold text-amber-500">{unassignedCount}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Badge({ count, color }: { count: number; color: string }) {
  return (
    <span
      className="min-w-[20px] h-5 flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1.5"
      style={{ backgroundColor: count > 0 ? color : '#d1d5db' }}
    >
      {count}
    </span>
  )
}
