// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react'
import { X, Save, Copy, Trash2, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import type { DesignElement } from './DesignWorkspace'
import type { HydrocarbonType } from '@/lib/fireCalculations'
import {
  calcCoolingNozzleCount,
} from '@/lib/fireCalculations'
import { runSpecEngine } from '@/lib/spec/engine'
import { roofKindFromTankType, specConfigFromProject } from '@/lib/specProject'
import {
  FIRE_SYSTEM_APPLIES_TO,
  TANK_ROOF_TYPES,
  roofBlockedReason,
  sanitizeFireSystems,
  statedRoofOf,
  type FireSystemId,
} from '@/lib/fireSystemRules'

/**
 * Foam outlet counts are read from the specification engine, which needs a site
 * configuration it does not use for this question (the outlet table depends on
 * the tank alone). One default config is built once for the whole module.
 */
const PROPERTY_EDITOR_SPEC_CONFIG = specConfigFromProject(null, [], [])

/**
 * The specification engine's run for a tank of this geometry and roof kind.
 *
 * `null` when the roof type is not recorded — the caller shows that as a missing
 * input rather than falling back to a fixed-roof figure. One helper, so the foam
 * fields cannot drift apart: they did, each carrying its own hard-coded rate.
 */
function specRunFor(
  d: number,
  h: number,
  ctx?: { tankType?: string | null; fuelType?: string | null },
) {
  const roofKind = roofKindFromTankType(ctx?.tankType)
  if (roofKind === null) return null
  const shellH = h > 0 ? h : 15
  return runSpecEngine(
    {
      id: 'property-editor',
      label: 'tank',
      diameterM: d,
      shellHeightM: shellH,
      liquidLevelM: shellH * 0.85,
      fuelKey: (ctx?.fuelType as string) || 'nafte_gaz',
      roofKind,
      coolingHeightM: shellH,
    },
    PROPERTY_EDITOR_SPEC_CONFIG,
  )
}

interface PropertyEditorProps {
  element: DesignElement
  zones: Record<string, string>
  onSetZone: (elementId: string, zoneId: string) => void
  onUpdate: (id: string, updates: Partial<DesignElement>) => void
  onDelete: (id: string) => void
  onDuplicate: (element: DesignElement) => void
  onClose: () => void
  /** Site height in metres — needed to display project coordinates from the SW corner */
  projectHeightM?: number
}

const ZONE_OPTIONS = [
  { id: 'A', label: 'A - فوق حساس', color: '#ef4444' },
  { id: 'B', label: 'B - حساس', color: '#f97316' },
  { id: 'C', label: 'C - متوسط', color: '#eab308' },
  { id: 'D', label: 'D - کم', color: '#22c55e' },
  { id: 'E', label: 'E - حداقل', color: '#10b981' },
]

const HYDROCARBON_TYPES: { value: HydrocarbonType; label: string }[] = [
  { value: 'benzin', label: 'بنزین' },
  { value: 'benzin_super', label: 'بنزین سوپر' },
  { value: 'nafte_gaz', label: 'نفت گاز' },
  { value: 'nafte_safid', label: 'نفت سفید' },
  { value: 'nafta', label: 'نفتا' },
  { value: 'naft_kham', label: 'نفت خام سبک' },
  { value: 'naft_kham_torsh', label: 'نفت خام ترش' },
  { value: 'naft_kham_sangin', label: 'نفت خام سنگین' },
  { value: 'naft_koreh', label: 'نفت کوره' },
  { value: 'aloodeh', label: 'مواد آلوده' },
]

/**
 * IN-008 — tank roof type. Placeholder only: the field starts empty and the
 * calculation refuses to pick a roof on the user's behalf. The list itself
 * lives in `@/lib/fireSystemRules` because the map badges, the BOM and the
 * report must agree with it about which roof permits which system.
 */

/**
 * Equipment catalogue — keys MUST match the actual element `type` values
 * produced by the left toolbar (see equipmentSvgData / LeftToolbar).
 */
const EQUIPMENT_CATEGORIES: Record<string, { label: string; realFields: string[] }> = {
  water_tank: { label: 'مخزن آب آتش‌نشانی', realFields: ['diameter', 'height', 'volume'] },
  pump: { label: 'پمپ آب آتش‌نشانی', realFields: ['flowRate', 'head', 'power'] },
  jockey_pump: { label: 'جوکی پمپ', realFields: ['flowRate', 'head', 'power'] },
  foam_tank: { label: 'مخزن فوم آتش‌نشانی', realFields: ['diameter', 'height', 'volume'] },
  oil_tank: { label: 'مخزن ذخیره مواد نفتی', realFields: ['diameter', 'height', 'fuelType', 'tankType'] },
  contamination_tank: { label: 'مخزن زیرزمینی مواد آلوده', realFields: ['diameter', 'height', 'fuelType', 'tankType'] },
  underground_tank: { label: 'مخزن زیرزمینی', realFields: ['diameter', 'height', 'volume'] },
  manifold: { label: 'منیفولد تراپ‌های صنعتی', realFields: ['flowRate', 'pressure'] },
  turbine: { label: 'سوله توربین و الکتروموتورها', realFields: ['length', 'width', 'height'] },
  control_building: { label: 'ساختمان کنترل سایت', realFields: ['length', 'width', 'height'] },
  office_building: { label: 'ساختمان‌های اداری', realFields: ['length', 'width', 'height'] },
  hse_building: { label: 'ساختمان HSE', realFields: ['length', 'width', 'height'] },
  workshop: { label: 'ساختمان‌های کارگاهی', realFields: ['length', 'width', 'height'] },
  warehouse: { label: 'ساختمان انبار', realFields: ['length', 'width', 'height'] },
  equipment_store: { label: 'انبار تجهیزات', realFields: ['length', 'width', 'height'] },
  electrical_station: { label: 'ایستگاه برق', realFields: ['length', 'width'] },
  telecom_station: { label: 'ایستگاه مخابرات', realFields: ['length', 'width'] },
  parking: { label: 'پارکینگ خودروها', realFields: ['length', 'width'] },
  gas_station: { label: 'ایستگاه گاز', realFields: ['length', 'width'] },
  hydrant: { label: 'هایدرانت آب آتش‌نشانی', realFields: ['size', 'flowRate'] },
  monitor: { label: 'مانیتورهای آب آتش‌نشانی', realFields: ['flowRate', 'throw'] },
  valve: { label: 'ولو مسیر لوله', realFields: ['diameter'] },
  butterfly_valve: { label: 'ولو پروانه‌ای', realFields: ['diameter'] },
  co2: { label: 'CO₂ دستی', realFields: ['weight', 'coverage'] },
  auto_co2: { label: 'سیستم اتوماتیک CO₂', realFields: ['weight', 'coverage'] },
  tank_cooling: { label: 'کولینگ مخازن', realFields: ['flowRate', 'coverage'] },
  tank_foaming: { label: 'فومینگ مخازن', realFields: ['flowRate', 'coverage'] },
  shed_cooling: { label: 'کولینگ و اطفا سوله‌ها', realFields: ['flowRate', 'coverage'] },
}

function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    diameter: 'قطر (m)',
    height: 'ارتفاع (m)',
    volume: 'حجم (m³)',
    length: 'طول (m)',
    width: 'عرض (m)',
    flowRate: 'دبی (L/min)',
    head: 'هد (m)',
    power: 'توان (kW)',
    pressure: 'فشار (bar)',
    size: 'سایز (اینچ)',
    throw: 'برد پرتاب (m)',
    coverage: 'سطح پوشش (m²)',
    fuelType: 'نوع مواد',
    tankType: 'نوع سقف',
    weight: 'وزن (kg)',
  }
  return labels[field] || field
}

/**
 * Fire protection systems that can be attached to an equipment item.
 * These are NOT separate map items — they are properties of the equipment.
 *
 * `compute` derives the required quantity from the equipment geometry using the
 * referenced standard formula, so the number shown on screen is always the
 * calculated value (and it is re-computed whenever diameter/height change).
 *
 * It also receives the item's own declared facts (`ctx`) because some standards
 * values are selected by them — the foam outlet table, for one, is chosen by the
 * tank's roof type, not by its diameter alone.
 */
interface FireSystemDef {
  id: string
  label: string
  icon: string
  desc: string
  /** @deprecated زنجیرهٔ فرمول فقط در بخش «خروجی» نمایش داده می‌شود. */
  formulaRef?: string
  compute?: (
    diameterM: number,
    heightM: number,
    ctx?: { tankType?: string | null; fuelType?: string | null },
  ) => { value: string; formula?: string }
}

const FIRE_SYSTEM_TYPES: FireSystemDef[] = [
  {
    id: 'cooling',
    label: 'کولینگ مخزن (آبپاش)',
    icon: '💧',
    desc: 'رینگ آبپاش خنک‌کننده دور مخزن',
    formulaRef: 'NFPA 15 — N = ⌈πD/S⌉ × ⌈H/V⌉',
    compute: (d, h) => {
      const s = 2.4, v = 3.0
      const perRing = Math.max(2, Math.ceil((Math.PI * d) / s))
      const rings = Math.max(1, Math.ceil(h / v))
      const total = perRing * rings
      return {
        value: `${total} نازل`,
        formula: `N = ⌈π·${d}/2.4⌉ × ⌈${h}/3⌉ = ${perRing} × ${rings} = ${total}   (${rings} ring)`,
      }
    },
  },
  {
    id: 'foam_chamber',
    label: 'فوم چمبر',
    icon: '🧯',
    desc: 'تزریق فوم به داخل مخزن',
    formulaRef: '§3.1 / §3.3 / §3.4 / §3.5 سند موتور مشخصات — خروجی OUT-002',
    compute: (d, h, ctx) => {
      // The outlet table is selected by IN-008 first: §3.1 for a fixed roof,
      // spacing rules over the annulus for a floating one. Reading §3.1 by
      // diameter alone gave every tank a fixed-roof chamber count.
      const run = specRunFor(d, h, ctx)
      if (run === null) {
        return {
          value: '—',
          formula: 'نوع سقف مخزن (IN-008) ثبت نشده — جدول §3.1/§3.3/§3.4/§3.5 انتخاب نمی‌شود. آن را از فیلد «نوع سقف» بالا ثبت کنید.',
        }
      }
      const out = run.byId['OUT-002']
      const count = run.foam?.outletCount
      return count === null || count === undefined
        ? { value: '—', formula: String(out.note ?? '') }
        : { value: `${count} عدد`, formula: `${out.referenceIds.join(', ')} — ${out.note ?? ''}` }
    },
  },
  {
    id: 'co2_system',
    label: 'سیستم اطفا اتوماتیک CO₂',
    icon: '⚪',
    desc: 'اطفا با گاز CO₂',
    formulaRef: 'NFPA 12 — CO₂ total flooding',
    compute: (_d, h) => {
      const cylinders = Math.max(2, Math.ceil(h / 2))
      return { value: `${cylinders} سیلندر`, formula: `بر اساس حجم فضا — ارتفاع ${h}m` }
    },
  },
  {
    id: 'sprinkler',
    label: 'اسپرینکلر اتوماتیک',
    icon: '🚿',
    desc: 'آبپاش اتوماتیک سقفی',
    formulaRef: 'NFPA 13 — Density/area method',
    compute: (_d, h) => {
      const count = Math.max(6, Math.ceil(h * 4))
      return { value: `${count} اسپرینکلر`, formula: `بر اساس مساحت پوشش سقف` }
    },
  },
]

export default function PropertyEditor({ element, zones, onSetZone, onUpdate, onDelete, onDuplicate, onClose, projectHeightM = 100 }: PropertyEditorProps) {

  const [collapsed, setCollapsed] = useState(false)
  const [localProps, setLocalProps] = useState<Record<string, unknown>>({
    ...element.properties,
    label: element.label || '',
    name: element.properties?.name || '',
    number: element.properties?.number || '',
  })

  const category = EQUIPMENT_CATEGORIES[element.type]
  const isZoneable = ['oil_tank', 'underground_tank', 'contamination_tank',
    'turbine', 'warehouse', 'manifold', 'building',
    'electrical_station', 'telecom_station', 'parking', 'gas_station'].includes(element.type)

  const isTankEquipment = ['water_tank', 'foam_tank', 'oil_tank', 'underground_tank', 'contamination_tank'].includes(element.type)

  // Real (engineering) geometry used by the fire-system formulas
  const readNum = (key: string) =>
    parseFloat(String(localProps[key] ?? element.properties?.[key] ?? '')) || 0
  const tankDiameter = readNum('diameter')
  const tankHeight = readNum('height') || readNum('length')

  // Equipment name label placement (customisable on the map)
  const labelOffsetX = Number(element.properties?.labelOffsetX ?? 0)
  const labelOffsetY = Number(element.properties?.labelOffsetY ?? 14)
  const labelHidden = !!element.properties?.labelHidden
  const labelScale = Number(element.properties?.labelScale ?? 1)
  const setLabelProp = (key: string, value: unknown) => {
    onUpdate(element.id, { properties: { ...element.properties, [key]: value } })
  }

  // The systems this element type can carry at all. Which of them are
  // *selectable* is then decided by the roof (fireSystemRules).
  const applicableSystems = FIRE_SYSTEM_TYPES.filter(
    sys => FIRE_SYSTEM_APPLIES_TO[sys.id as FireSystemId]?.includes(element.type),
  )
  const statedRoof = statedRoofOf({
    ...element.properties,
    tankType: (localProps.tankType as string) ?? element.properties?.tankType,
  })

  const CALC_AFTER_DESIGN_TYPES = ['water_tank', 'pump', 'jockey_pump', 'foam_tank']
  const showCalcAfterDesign = CALC_AFTER_DESIGN_TYPES.includes(element.type)

  const handleSave = () => {
    const { label, name, ...rest } = localProps
    onUpdate(element.id, {
      label: (label as string) || element.type,
      properties: { ...element.properties, ...rest },
    })
    onClose()
  }

  const handleChange = (field: string, value: string) => {
    setLocalProps(prev => ({ ...prev, [field]: value }))
  }

  const handleSizeChange = (field: 'width' | 'height', value: string) => {
    const num = parseFloat(value)
    if (!isNaN(num) && num > 0) {
      onUpdate(element.id, { [field]: num })
    }
  }

  return (
    <div className={`fixed inset-y-0 left-0 z-50 flex flex-col shadow-2xl transition-all duration-200 ${
      collapsed ? 'w-10' : 'w-80'
    } bg-white/95 backdrop-blur-xl border-r border-gray-200`}>
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-gray-100">
        {!collapsed && <h3 className="font-bold text-gray-700 text-sm">ویژگی‌های تجهیز</h3>}
        <div className="flex items-center gap-1">
          <button onClick={() => setCollapsed(!collapsed)} className="p-1 hover:bg-gray-100 rounded-lg">
            {collapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronLeft className="w-4 h-4 text-gray-400" />}
          </button>
          {!collapsed && (
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {collapsed ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[10px] text-gray-400 -rotate-90 whitespace-nowrap">ویژگی‌ها</span>
        </div>
      ) : (

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Equipment Category Badge */}
        {category && (
          <div className="px-3 py-2 bg-sky-50 rounded-xl border border-sky-100">
            <span className="text-xs font-medium text-sky-600">{category.label}</span>
          </div>
        )}

        {/* Identity Fields */}
        <div className="space-y-3">
          <Label className="text-xs font-bold text-gray-500 uppercase tracking-wide">شناسنامه</Label>
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">نام / عنوان</Label>
              <Input
                value={(localProps.label as string) || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                placeholder="نام تجهیز"
                className="h-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">شماره</Label>
                <Input
                  value={(localProps.number as string) || ''}
                  onChange={(e) => handleChange('number', e.target.value)}
                  placeholder="شماره"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">کد</Label>
                <Input
                  value={(localProps.name as string) || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="کد تجهیز"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Visual Size */}
        <div className="space-y-3">
          <Label className="text-xs font-bold text-gray-500 uppercase tracking-wide">ابعاد ظاهری (نقشه)</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">عرض (px)</Label>
              <Input
                type="number"
                value={Math.round(element.width)}
                onChange={(e) => handleSizeChange('width', e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">ارتفاع (px)</Label>
              <Input
                type="number"
                value={Math.round(element.height)}
                onChange={(e) => handleSizeChange('height', e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Name Label Placement — customisable on the map */}
        <div className="space-y-3">
          <Label className="text-xs font-bold text-gray-500 uppercase tracking-wide">برچسب نام روی نقشه</Label>
          <label className="flex items-center gap-2 cursor-pointer p-2 bg-gray-50 rounded-xl border border-gray-200">
            <input
              type="checkbox"
              checked={labelHidden}
              onChange={(e) => setLabelProp('labelHidden', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
            />
            <span className="text-xs text-gray-700">مخفی کردن نام تجهیز</span>
          </label>
          {!labelHidden && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">جابجایی افقی (px)</Label>
                  <Input
                    type="number"
                    value={Math.round(labelOffsetX)}
                    onChange={(e) => setLabelProp('labelOffsetX', parseFloat(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">جابجایی عمودی (px)</Label>
                  <Input
                    type="number"
                    value={Math.round(labelOffsetY)}
                    onChange={(e) => setLabelProp('labelOffsetY', parseFloat(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">
                  بزرگنمایی متن: {labelScale.toFixed(1)}×
                </Label>
                <input
                  type="range"
                  min={50}
                  max={300}
                  step={10}
                  value={Math.round(labelScale * 100)}
                  onChange={(e) => setLabelProp('labelScale', parseInt(e.target.value) / 100)}
                  className="w-full h-1 accent-sky-500 cursor-pointer"
                />
              </div>
              <button
                onClick={() => {
                  onUpdate(element.id, {
                    properties: { ...element.properties, labelOffsetX: 0, labelOffsetY: 14, labelScale: 1 },
                  })
                }}
                className="w-full text-[10px] text-gray-400 hover:text-gray-600 transition"
              >
                بازگشت به حالت پیش‌فرض
              </button>
            </>
          )}
        </div>

        {isTankEquipment && (
          <div className="space-y-3">
            <Label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              تنظیمات اطلاعات مخزن روی نقشه
            </Label>

            <div className="space-y-2">
              <Label className="text-xs text-gray-500 mb-1 block">
                شفافیت اطلاعات مخزن: {Number(element.properties?.tankInfoOpacity ?? 80)}%
              </Label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(Number(element.properties?.tankInfoOpacity ?? 80))}
                onChange={(e) =>
                  onUpdate(element.id, {
                    properties: { ...element.properties, tankInfoOpacity: parseInt(e.target.value) },
                  })
                }
                className="w-full h-1 accent-sky-500 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">جابجایی X اطلاعات (px)</Label>
                <Input
                  type="number"
                  value={Number(element.properties?.tankInfoOffsetX ?? 0)}
                  onChange={(e) =>
                    onUpdate(element.id, {
                      properties: { ...element.properties, tankInfoOffsetX: parseFloat(e.target.value) || 0 },
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">جابجایی Y اطلاعات (px)</Label>
                <Input
                  type="number"
                  value={Number(element.properties?.tankInfoOffsetY ?? 0)}
                  onChange={(e) =>
                    onUpdate(element.id, {
                      properties: { ...element.properties, tankInfoOffsetY: parseFloat(e.target.value) || 0 },
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wide">کولینگ (آبپاش)</Label>

              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(element.properties?.coolingInfoVisible ?? true)}
                  onCheckedChange={(checked) =>
                    onUpdate(element.id, {
                      properties: { ...element.properties, coolingInfoVisible: checked },
                    })
                  }
                />
                <Label className="text-xs text-gray-500">نمایش خط کولینگ</Label>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-gray-500 mb-1 block">تعداد نازل (دستی / اختیاری)</Label>
                <Input
                  type="number"
                  value={((element.properties?.coolingNozzleOverride as any) ?? '')}
                  onChange={(e) => {
                    const v = e.target.value
                    onUpdate(element.id, {
                      properties: { ...element.properties, coolingNozzleOverride: v === '' ? '' : parseInt(v) },
                    })
                  }}
                  placeholder="اتوماتیک"
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-gray-500 mb-1 block">
                  شفافیت خط کولینگ: {Number(element.properties?.coolingInfoOpacity ?? element.properties?.tankInfoOpacity ?? 80)}%
                </Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(Number(element.properties?.coolingInfoOpacity ?? element.properties?.tankInfoOpacity ?? 80))}
                  onChange={(e) =>
                    onUpdate(element.id, {
                      properties: { ...element.properties, coolingInfoOpacity: parseInt(e.target.value) },
                    })
                  }
                  className="w-full h-1 accent-sky-500 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">OffsetX کولینگ (px)</Label>
                  <Input
                    type="number"
                    value={Number(element.properties?.coolingInfoOffsetX ?? 0)}
                    onChange={(e) =>
                      onUpdate(element.id, {
                        properties: { ...element.properties, coolingInfoOffsetX: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">OffsetY کولینگ (px)</Label>
                  <Input
                    type="number"
                    value={Number(element.properties?.coolingInfoOffsetY ?? 0)}
                    onChange={(e) =>
                      onUpdate(element.id, {
                        properties: { ...element.properties, coolingInfoOffsetY: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wide">فومینگ</Label>

              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(element.properties?.foamInfoVisible ?? true)}
                  onCheckedChange={(checked) =>
                    onUpdate(element.id, {
                      properties: { ...element.properties, foamInfoVisible: checked },
                    })
                  }
                />
                <Label className="text-xs text-gray-500">نمایش خط فومینگ</Label>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-gray-500 mb-1 block">تعداد خروجی (دستی / اختیاری)</Label>
                <Input
                  type="number"
                  value={((element.properties?.foamOutletOverride as any) ?? '')}
                  onChange={(e) => {
                    const v = e.target.value
                    onUpdate(element.id, {
                      properties: { ...element.properties, foamOutletOverride: v === '' ? '' : parseInt(v) },
                    })
                  }}
                  placeholder="اتوماتیک"
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-gray-500 mb-1 block">
                  شفافیت خط فومینگ: {Number(element.properties?.foamInfoOpacity ?? element.properties?.tankInfoOpacity ?? 80)}%
                </Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(Number(element.properties?.foamInfoOpacity ?? element.properties?.tankInfoOpacity ?? 80))}
                  onChange={(e) =>
                    onUpdate(element.id, {
                      properties: { ...element.properties, foamInfoOpacity: parseInt(e.target.value) },
                    })
                  }
                  className="w-full h-1 accent-sky-500 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">OffsetX فومینگ (px)</Label>
                  <Input
                    type="number"
                    value={Number(element.properties?.foamInfoOffsetX ?? 0)}
                    onChange={(e) =>
                      onUpdate(element.id, {
                        properties: { ...element.properties, foamInfoOffsetX: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">OffsetY فومینگ (px)</Label>
                  <Input
                    type="number"
                    value={Number(element.properties?.foamInfoOffsetY ?? 0)}
                    onChange={(e) =>
                      onUpdate(element.id, {
                        properties: { ...element.properties, foamInfoOffsetY: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* Real Dimensions */}
        {category && category.realFields.length > 0 && (
          <div className="space-y-3">
            <Label className="text-xs font-bold text-gray-500 uppercase tracking-wide">ابعاد واقعی و مشخصات فنی</Label>
            <div className="space-y-2">
              {category.realFields.map(field => (
                <div key={field}>
                  <Label className="text-xs text-gray-500 mb-1 block">{getFieldLabel(field)}</Label>
                  {field === 'fuelType' || field === 'tankType' ? (
                    <Select
                      value={(localProps[field] as string) || ''}
                      onValueChange={(v) => {
                        setLocalProps(prev => ({ ...prev, [field]: v }))
                        // A roof change can withdraw the right to a system the
                        // tank already carries — a fixed roof has no foam dam,
                        // a pond has none of the four. Drop them here so the
                        // design never keeps a flag its roof forbids.
                        const scrub = (raw: Record<string, unknown>) =>
                          field === 'tankType'
                            ? sanitizeFireSystems(element.type, v, raw).props
                            : raw
                        onUpdate(element.id, {
                          properties: scrub({ ...element.properties, [field]: v }),
                        })
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder={field === 'fuelType' ? 'انتخاب نوع مواد' : 'انتخاب نوع سقف'} />
                      </SelectTrigger>
                      <SelectContent>
                        {(field === 'fuelType' ? HYDROCARBON_TYPES : TANK_ROOF_TYPES).map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type="number"
                      step="0.1"
                      value={(localProps[field] as string) ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value
                        setLocalProps(prev => ({ ...prev, [field]: raw }))
                        // Write through immediately so the cooling ring, foam and
                        // nozzle calculations reflect the new geometry at once.
                        onUpdate(element.id, {
                          properties: { ...element.properties, [field]: raw },
                        })
                      }}
                      placeholder={getFieldLabel(field)}
                      className="h-8 text-sm"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Zone Assignment (only for zoneable items) */}
        {/* Calculate After Design Checkbox — only for water_tank, pump, jockey_pump, foam_tank */}
        {showCalcAfterDesign && (
          <>
            <Separator />
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer p-3 bg-amber-50 rounded-xl border border-amber-200">
                <input
                  type="checkbox"
                  checked={!!element.properties?.calcAfterDesign}
                  onChange={(e) => {
                    onUpdate(element.id, {
                      properties: { ...element.properties, calcAfterDesign: e.target.checked },
                    })
                  }}
                  className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-xs font-medium text-amber-700 block">محاسبه پس از طراحی نهایی</span>
                  <span className="text-[10px] text-amber-500 block">
                    مشخصات فنی پس از تکمیل طراحی پروژه محاسبه خواهد گردید
                  </span>
                </div>
              </label>
            </div>
          </>
        )}

        {/* Fire Protection Systems — attached to this equipment (not separate items) */}
        <Separator />
        <div className="space-y-3">
          <Label className="text-xs font-bold text-gray-500 uppercase tracking-wide">سیستم‌های اطفا حریق این تجهیز</Label>
          {applicableSystems.length === 0 && (
            <p className="text-[10px] text-gray-400">برای این نوع تجهیز سیستم اطفا حریقی تعریف نشده است.</p>
          )}
          {(tankDiameter <= 0 || tankHeight <= 0) &&
            applicableSystems.length > 0 && (
            <p className="text-[10px] text-amber-600 bg-amber-50 rounded-lg p-2 border border-amber-200">
              ⚠️ برای محاسبه دقیق، ابتدا «قطر» و «ارتفاع» واقعی تجهیز را وارد کنید.
            </p>
          )}
          <div className="space-y-2">
            {applicableSystems.map(sys => {
              const isActive = !!element.properties?.[sys.id]
              const blocked = roofBlockedReason(sys.id, element.type, statedRoof)
              const computed = sys.compute && tankDiameter > 0 && tankHeight > 0
                ? sys.compute(tankDiameter, tankHeight, {
                    tankType: (localProps.tankType as string) ?? (element.properties?.tankType as string) ?? null,
                    fuelType: (localProps.fuelType as string) ?? (element.properties?.fuelType as string) ?? null,
                  })
                : null
              return (
                <div key={sys.id} data-fire-system={sys.id} data-blocked={blocked ? 'true' : 'false'}
                  className={`rounded-xl border transition-all ${
                  blocked ? 'border-gray-200 bg-gray-100/70 opacity-60'
                    : isActive ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
                }`}>
                  <label className={`flex items-center gap-2 p-2.5 ${blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={!blocked && isActive}
                      disabled={blocked !== null}
                      onChange={(e) => {
                        if (blocked) return
                        const newProps = { ...element.properties, [sys.id]: e.target.checked }
                        onUpdate(element.id, { properties: newProps })
                      }}
                      className="w-4 h-4 rounded border-red-300 text-red-600 focus:ring-red-500 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm">{sys.icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-medium block ${blocked ? 'text-gray-500' : 'text-gray-700'}`}>{sys.label}</span>
                      <span className="text-[10px] text-gray-400 block">{sys.desc}</span>
                    </div>
                  </label>
                  {blocked && (
                    <p className="px-2.5 pb-2.5 text-[10px] text-amber-700" data-blocked-reason={sys.id}>
                      🚫 {blocked}
                    </p>
                  )}
                  {/* A blocked system shows its reason and nothing else — no
                      calculated value, no size picker. Printing a dam height
                      under a roof that has no dam presents it as in force. */}
                  {/* مقدار محاسبه‌شده اینجا فقط به‌صورت «نتیجه» دیده می‌شود.
                      فرمول و زنجیرهٔ جانشینی به بخش «خروجی» منتقل شده تا پنل
                      ساده بماند. */}
                  {!blocked && isActive && computed && (
                    <div className="px-2.5 pb-2.5 pt-0">
                      <div className="flex items-center justify-between bg-white rounded-lg px-2 py-1.5 border border-red-200">
                        <span className="text-[10px] text-gray-500">مقدار محاسبه‌شده</span>
                        <span className="text-[11px] font-bold text-red-600">{computed.value}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {isZoneable && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wide">سطح حفاظتی (زون)</Label>
              <div className="grid grid-cols-5 gap-1">
                {ZONE_OPTIONS.map(zone => (
                  <button
                    key={zone.id}
                    onClick={() => {
                      onSetZone(element.id, zone.id)
                      onUpdate(element.id, {
                        properties: { ...element.properties, zone: zone.id },
                      })
                    }}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${
                      zones[element.id] === zone.id
                        ? 'text-white shadow scale-105'
                        : 'hover:scale-105'
                    }`}
                    style={{
                      backgroundColor: zones[element.id] === zone.id ? zone.color : zone.color + '20',
                      color: zones[element.id] === zone.id ? '#fff' : zone.color,
                    }}
                  >
                    {zone.id}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Position — project coordinates, origin (0,0) at the SOUTH-WEST corner */}
        <Separator />
        <div className="space-y-3">
          <Label className="text-xs font-bold text-gray-500 uppercase tracking-wide">موقعیت (متر — مبدأ جنوب‌غربی)</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">X (شرق →)</Label>
              <Input
                type="number"
                value={Math.round((element.x / 10) * 10) / 10}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  if (!isNaN(v)) onUpdate(element.id, { x: v * 10 })
                }}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Y (شمال ↑)</Label>
              <Input
                type="number"
                value={Math.round(((projectHeightM * 10 - element.y) / 10) * 10) / 10}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  if (!isNaN(v)) onUpdate(element.id, { y: projectHeightM * 10 - v * 10 })
                }}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <p className="text-[9px] text-gray-400">
            نقطه (0,0) در ضلع جنوب‌غربی سایت قرار دارد؛ محور X به سمت شرق و محور Y به سمت شمال افزایش می‌یابد.
          </p>
        </div>

        {/* Rotation */}
        <div className="space-y-2">
          <Label className="text-xs text-gray-500 mb-1 block">چرخش (درجه)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={element.rotation}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v)) onUpdate(element.id, { rotation: v })
              }}
              className="h-8 text-sm flex-1"
            />
            <button
              onClick={() => onUpdate(element.id, { rotation: (element.rotation + 90) % 360 })}
              className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              <RotateCw className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Action Buttons */}
      {!collapsed && (
        <div className="p-4 border-t border-gray-100 space-y-2">
        <Button
          onClick={handleSave}
          className="w-full bg-sky-500 hover:bg-sky-600 text-white h-9"
        >
          <Save className="w-4 h-4 ml-2" />
          ذخیره تغییرات
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onDuplicate(element)}
            className="flex-1 h-9 text-xs"
          >
            <Copy className="w-3.5 h-3.5 ml-1" />
            کپی
          </Button>
          <Button
            variant="outline"
            onClick={() => onDelete(element.id)}
            className="flex-1 h-9 text-xs text-red-500 border-red-200 hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5 ml-1" />
            حذف
          </Button>
        </div>
      </div>
      )}
    </div>
  )
}
