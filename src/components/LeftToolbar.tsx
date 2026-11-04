// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react'
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react'

interface LeftToolbarProps {
  activeTool: string
  onToolChange: (tool: string) => void
  phase: string
  onAddTypeChange?: (type: string) => void
  selectedAddType?: string
  activeChecklistType?: string | null
}

interface EquipmentItem {
  id: string
  iconPath: string
  label: string
  phases?: string[]
}

const equipmentGroups = [
  {
    label: 'مخازن و پمپ',
    phases: ['checklist'],
    items: [
      { id: 'add:water_tank', iconPath: '/equipment-icons/water_tank.png', label: 'مخزن آب آتش‌نشانی' },
      { id: 'add:pump', iconPath: '/equipment-icons/pump.png', label: 'پمپ آب آتش‌نشانی' },
      { id: 'add:jockey_pump', iconPath: '/equipment-icons/jockey_pump.png', label: 'جوکی پمپ آتش‌نشانی' },
      { id: 'add:foam_tank', iconPath: '/equipment-icons/foam_tank.png', label: 'مخزن فوم آتش‌نشانی' },
    ] as EquipmentItem[],
  },
  {
    label: 'مخازن نفتی',
    phases: ['checklist'],
    items: [
      { id: 'add:oil_tank', iconPath: '/equipment-icons/oil_tank.png', label: 'مخازن ذخیره مواد نفتی' },
      { id: 'add:underground_tank', iconPath: '/equipment-icons/underground_tank.svg', label: 'مخازن زیرزمینی' },
      { id: 'add:contamination_tank', iconPath: '/equipment-icons/contamination_tank.png', label: 'مخزن زیرزمینی مواد آلوده' },
    ] as EquipmentItem[],
  },
  {
    label: 'توربین و الکتروموتور',
    phases: ['checklist'],
    items: [
      { id: 'add:manifold', iconPath: '/equipment-icons/manifold.png', label: 'منیفولد تراپ‌های صنعتی' },
      { id: 'add:turbine', iconPath: '/equipment-icons/turbine.png', label: 'سوله توربین‌ها و الکتروموتورها' },
    ] as EquipmentItem[],
  },
  {
    label: 'ساختمان‌ها و سازه‌ها',
    phases: ['checklist'],
    items: [
      { id: 'add:control_building', iconPath: '/equipment-icons/control_building.png', label: 'ساختمان کنترل سایت' },
      { id: 'add:office_building', iconPath: '/equipment-icons/office_building.png', label: 'ساختمان‌های اداری' },
      { id: 'add:hse_building', iconPath: '/equipment-icons/hse_building.png', label: 'ساختمان HSE' },
      { id: 'add:workshop', iconPath: '/equipment-icons/workshop.png', label: 'ساختمان کارگاهی' },
      { id: 'add:equipment_store', iconPath: '/equipment-icons/salvage_store.png', label: 'انبار تجهیزات' },
      { id: 'add:warehouse', iconPath: '/equipment-icons/warehouse.png', label: 'ساختمان انبار' },
      { id: 'add:electrical_station', iconPath: '/equipment-icons/electrical_station.png', label: 'ایستگاه برق' },
      { id: 'add:telecom_station', iconPath: '/equipment-icons/telecom_station.png', label: 'ایستگاه مخابرات' },
      { id: 'add:parking', iconPath: '/equipment-icons/parking.png', label: 'پارکینگ خودروها' },
      { id: 'add:gas_station', iconPath: '/equipment-icons/gas_station.svg', label: 'ایستگاه گاز' },
    ] as EquipmentItem[],
  },
  {
    label: 'تجهیزات اطفاء حریق',
    phases: ['checklist', 'design'],
    items: [
      { id: 'add:monitor', iconPath: '/equipment-icons/monitor.png', label: 'مانیتورهای آب آتش‌نشانی' },
      { id: 'add:hydrant', iconPath: '/equipment-icons/hydrant.png', label: 'هایدرانت آب آتش‌نشانی' },
      { id: 'add:valve', iconPath: '/equipment-icons/valve.png', label: 'ولو مسیر لوله' },
      { id: 'add:butterfly_valve', iconPath: '/equipment-icons/butterfly_valve.png', label: 'ولو پروانه‌ای' },
      { id: 'add:co2', iconPath: '/equipment-icons/auto_co2.png', label: 'CO₂ دستی' },
      { id: 'add:auto_co2', iconPath: '/equipment-icons/auto_co2.png', label: 'اتوماتیک CO₂' },
    ] as EquipmentItem[],
  },
]

export default function LeftToolbar({ activeTool, onToolChange, phase, onAddTypeChange, selectedAddType, activeChecklistType }: LeftToolbarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [showAll, setShowAll] = useState(false)

  const visibleGroups = equipmentGroups
    .filter(group => showAll || group.phases.includes(phase))

  return (
    <div className="w-44 bg-white/60 backdrop-blur-md border-l border-white/50 overflow-y-auto flex-shrink-0">
      <div className="p-1.5">
        {/* Phase indicator */}
        <div className="px-2 py-1.5 mb-1.5 bg-sky-50/50 rounded-lg">
          <span className="text-[10px] text-sky-600 font-medium">
            ابزارهای فعال: {
              phase === 'checklist' ? 'جانمایی' :
              phase === 'roads' ? 'جاده و لوله' :
              phase === 'design' ? 'طراحی' :
              'عمومی'
            }
          </span>
        </div>

        {/* Show all toggle */}
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mb-1.5 px-2 py-1 flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition"
        >
          {showAll ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {showAll ? 'فقط ابزارهای این مرحله' : 'نمایش همه ابزارها'}
        </button>

        <div className="space-y-1.5">
          {visibleGroups.map(group => {
            const isCollapsed = collapsed[group.label]
            return (
              <div key={group.label} className="bg-white/30 rounded-xl overflow-hidden">
                <button
                  onClick={() => setCollapsed(prev => ({ ...prev, [group.label]: !isCollapsed }))}
                  className="w-full px-2 py-1.5 flex items-center justify-between text-[11px] font-medium text-gray-500 hover:bg-white/40 transition"
                >
                  <span>{group.label}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-gray-300">{group.items.length}</span>
                    {isCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                  </div>
                </button>
                {!isCollapsed && (
                  <div className="p-1 pt-0 space-y-0.5">
                    {group.items.map(item => {
                      const itemTypeId = item.id.replace('add:', '')
                      const isActive = activeTool === 'add' && selectedAddType === itemTypeId
                      const isLocked = !!activeChecklistType && itemTypeId !== activeChecklistType
                      return (
                        <button
                          key={item.id}
                          disabled={isLocked}
                          onClick={() => {
                            if (isLocked) return
                            const type = item.id.replace('add:', '')
                            if (onAddTypeChange) onAddTypeChange(type)
                            onToolChange('add')
                          }}
                          className={`w-full py-1 px-1 rounded-lg transition-all flex items-center gap-1.5 text-right ${
                            isLocked
                              ? 'opacity-30 cursor-not-allowed'
                              : isActive
                                ? 'bg-sky-100 border border-sky-400 shadow-sm'
                                : 'bg-white/40 border border-transparent hover:bg-white/70'
                          }`}
                          title={item.label}
                        >
                          <div
                            className="w-8 h-8 flex-shrink-0 rounded-md overflow-hidden bg-white/50"
                          >
                            <img
                              src={item.iconPath}
                              alt={item.label}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                              }}
                            />
                          </div>
                          <span className={`text-[11px] leading-tight truncate flex-1 ${isActive ? 'text-sky-700 font-medium' : 'text-gray-600'}`}>
                            {item.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
