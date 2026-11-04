// SPDX-License-Identifier: Apache-2.0
import { useState, useMemo } from 'react'
import {
  FileDown, Printer, FileText, Table, Layers, Package,
  Download, ChevronDown, ChevronUp
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import type { DesignElement, PipeSegment, LayerConfig } from './DesignWorkspace'
import type { DesignBasis } from '@/lib/calc/provenance'
import { STATUS_LABELS, SOURCE_LABELS } from '@/lib/calc/provenance'
import { basisAsTable } from '@/lib/calc/report'
import { CONSTANTS_VERSION } from '@/lib/calc/constants'
import type { ValidationResult } from '@/lib/calc/validate'
import { calcCoolingNozzleCount } from '@/lib/fireCalculations'
import { isFireSystemActive, type FireSystemId } from '@/lib/fireSystemRules'
import { defaultSpecConfig, specRunForElement } from '@/lib/specProject'
import { ELEMENT_LABELS } from '@/lib/equipmentSvgData'

interface ExportPanelProps {
  project: any
  elements: DesignElement[]
  pipes: PipeSegment[]
  layers: LayerConfig[]
  zones: Record<string, string>
  /** The design basis the numbers rest on — carried into the printed report. */
  basis?: DesignBasis
  validation?: ValidationResult | null
  /** Opens the "نمایش خروجی" full design report */
  onShowOutput?: () => void
}

interface BOMItem {
  category: string
  type: string
  name: string
  quantity: number
  unit: string
  specs?: string
}

export default function ExportPanel({ project, elements, pipes, layers, zones, basis, validation, onShowOutput }: ExportPanelProps) {
  const [selectedLayers, setSelectedLayers] = useState<number[]>(layers.map(l => l.id))
  const [showBOM, setShowBOM] = useState(false)
  const [printMode, setPrintMode] = useState<'all' | 'layered'>('all')

  const toggleLayer = (id: number) => {
    setSelectedLayers(prev =>
      prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
    )
  }

  // Generate Bill of Materials
  const bom = useMemo((): BOMItem[] => {
    const items: BOMItem[] = []

    // Water Tanks
    const waterTanks = elements.filter(e => e.type === 'water_tank')
    if (waterTanks.length > 0) {
      const vol = waterTanks[0].properties?.volume || 1767
      items.push({
        category: 'مخزن آب', type: 'water_tank',
        name: `مخزن آب آتش‌نشانی ${vol} m³`,
        quantity: waterTanks.length, unit: 'عدد',
        specs: `حجم: ${vol} m³`
      })
    }

    // Pumps
    const pumps = elements.filter(e => e.type === 'pump')
    if (pumps.length > 0) {
      items.push({
        category: 'پمپ', type: 'pump',
        name: 'پمپ آب آتش‌نشانی',
        quantity: pumps.length, unit: 'عدد',
        specs: 'بر اساس محاسبات NFPA 20'
      })
    }

    const jockeyPumps = elements.filter(e => e.type === 'jockey_pump')
    if (jockeyPumps.length > 0) {
      items.push({
        category: 'پمپ', type: 'jockey_pump',
        name: 'جوکی پمپ',
        quantity: jockeyPumps.length, unit: 'عدد'
      })
    }

    // Foam Tanks
    const foamTanks = elements.filter(e => e.type === 'foam_tank')
    if (foamTanks.length > 0) {
      items.push({
        category: 'فوم', type: 'foam_tank',
        name: 'مخزن فوم آتش‌نشانی',
        quantity: foamTanks.length, unit: 'عدد',
        specs: `${foamTanks[0].properties?.volume || 3100} لیتر`
      })
    }

    // Monitors
    const monitors = elements.filter(e => e.type === 'monitor')
    if (monitors.length > 0) {
      const flow = monitors[0].properties?.flowRate || 900
      items.push({
        category: 'مانیتور', type: 'monitor',
        name: `مانیتور آب ${flow} L/min`,
        quantity: monitors.length, unit: 'عدد',
        specs: `دبی: ${flow} L/min`
      })
    }

    // Hydrants
    const hydrants = elements.filter(e => e.type === 'hydrant')
    if (hydrants.length > 0) {
      items.push({
        category: 'هایدرانت', type: 'hydrant',
        name: 'هایدرانت 2.5 اینچ',
        quantity: hydrants.length, unit: 'عدد',
        specs: 'سایز: 2.5 اینچ'
      })
    }

    // Pipes
    if (pipes.length > 0) {
      const totalLength = pipes.reduce((sum, p) => sum + (p.length || 0), 0)
      items.push({
        category: 'لوله', type: 'fire_pipe',
        name: 'لوله آب آتش‌نشانی',
        quantity: Math.round(totalLength), unit: 'متر',
        specs: 'بر اساس محاسبات Hazen-Williams'
      })
    }

    // Foam Chambers
    const foamChambers = elements.filter(e => e.type === 'foam_chamber')
    if (foamChambers.length > 0) {
      items.push({
        category: 'فوم', type: 'foam_chamber',
        name: 'فوم چمبر',
        quantity: foamChambers.length, unit: 'عدد'
      })
    }

    // Cooling Systems
    const cooling = elements.filter(e => e.type === 'cooling_system')
    if (cooling.length > 0) {
      items.push({
        category: 'کولینگ', type: 'cooling_system',
        name: 'سیستم آبپاش کولینگ',
        quantity: cooling.length, unit: 'عدد'
      })
    }

    // CO2 Systems
    const co2 = elements.filter(e => e.type === 'co2_system')
    if (co2.length > 0) {
      items.push({
        category: 'اتوماتیک', type: 'co2_system',
        name: 'سیستم اطفا CO2',
        quantity: co2.length, unit: 'سیستم'
      })
    }

    // Butterfly Valves
    const bValves = elements.filter(e => e.type === 'butterfly_valve')
    if (bValves.length > 0) {
      items.push({
        category: 'شیرآلات', type: 'butterfly_valve',
        name: 'ولو پروانه‌ای',
        quantity: bValves.length, unit: 'عدد'
      })
    }

    // Gate Valves
    const gValves = elements.filter(e => e.type === 'gate_valve')
    if (gValves.length > 0) {
      items.push({
        category: 'شیرآلات', type: 'gate_valve',
        name: 'ولو دروازه‌ای',
        quantity: gValves.length, unit: 'عدد'
      })
    }

    // Pipe Valves
    const pValves = elements.filter(e => e.type === 'pipe_valve')
    if (pValves.length > 0) {
      items.push({
        category: 'شیرآلات', type: 'pipe_valve',
        name: 'شیر فلک (پروانه‌ای)',
        quantity: pValves.length, unit: 'عدد'
      })
    }

    // Fittings estimate (elbows, tees)
    if (pipes.length > 0) {
      const fittingsCount = Math.round(pipes.length * 3)
      items.push({
        category: 'اتصالات', type: 'fittings',
        name: 'زانویی و سه‌راهی',
        quantity: fittingsCount, unit: 'عدد',
        specs: 'تخمینی بر اساس تعداد لوله‌ها'
      })
    }

    // Sprinklers
    const sprinklers = elements.filter(e => e.type === 'sprinkler')
    if (sprinklers.length > 0) {
      items.push({
        category: 'آبپاش', type: 'sprinkler',
        name: 'آبپاش اطفای حریق',
        quantity: sprinklers.length, unit: 'عدد'
      })
    }

    // Oil Tanks (for reference)
    const oilTanks = elements.filter(e => e.type === 'oil_tank')
    if (oilTanks.length > 0) {
      items.push({
        category: 'مخازن', type: 'oil_tank',
        name: 'مخزن ذخیره مواد نفتی',
        quantity: oilTanks.length, unit: 'عدد',
        specs: 'بر اساس مشخصات وارد شده'
      })
    }

    return items
  }, [elements, pipes])

  const handlePrint = () => {
    const visibleElements = elements.filter(e => selectedLayers.includes(e.layer))

    // The printed report carries the same verification state as the screen: it
    // must never read as a compliance statement, and the basis travels with it.
    const verified = !!validation?.ok && !!basis && basis.adoptedStandards.every(s => s.edition !== null)
    const basisTable = basis ? basisAsTable(basis) : null
    const reviewRowCount = validation
      ? validation.blockers.length + validation.warnings.length
      : 0
    const openItemsHtml = validation && (validation.blockers.length || validation.warnings.length)
      ? `<table><tr><th>سطح</th><th>موضوع</th><th>ورودی</th><th>منبع</th><th>اقدام اصلاحی</th></tr>${
        [...validation.blockers, ...validation.warnings].map(i => `
          <tr>
            <td>${i.severity === 'blocking' ? 'بازدارنده' : 'هشدار'}</td>
            <td>${i.title}<br/><small>${i.detail.replace(/\n/g, '<br/>')}</small></td>
            <td dir="ltr">${i.affectedInput}</td>
            <td>${i.source}</td>
            <td>${i.correctiveAction}</td>
          </tr>`).join('')
      }</table>`
      : ''
    // ─── Fire & cooling calculations (printable) ───
    const SPEC_CONFIG = defaultSpecConfig()
    const tanks = visibleElements.filter(e => (e.type === 'oil_tank' || e.type === 'contamination_tank'))
    let totalCoolingNozzles = 0
    let totalFoamChambers = 0
    const coolingRows: string[] = []
    const foamRows: string[] = []

    for (const t of tanks) {
      const d = parseFloat(String(t.properties?.diameter ?? '')) || 0
      const h = parseFloat(String(t.properties?.height ?? '')) || 0
      if (d <= 0 || h <= 0) continue

      const p = t.properties || {}
      const tankName = t.label || ELEMENT_LABELS[t.type] || t.type
      const on = (id: FireSystemId) => isFireSystemActive(t.type, p, id)

      if (on('cooling')) {
        const n = calcCoolingNozzleCount(d, h)
        totalCoolingNozzles += n.total
        coolingRows.push(
          `<tr><td>${tankName}</td><td>${n.total}</td><td dir="ltr">${n.perRing}×${n.rings}</td><td dir="ltr">N = ⌈π×${d}/2.4⌉ × ⌈${h}/3⌉</td></tr>`,
        )
      }

      if (on('foam_chamber')) {
        const run = specRunForElement(t, SPEC_CONFIG)
        const count = run?.foam?.outletCount ?? null

        if (run === null || count === null) {
          foamRows.push(
            `<tr><td>${tankName}</td><td colspan="3">نوع سقف مخزن (IN-008) ثبت نشده — جدول §3.1/§3.3/§3.4/§3.5 انتخاب نمی‌شود</td></tr>`,
          )
        } else {
          const row = run.byId['OUT-002']
          totalFoamChambers += count
          foamRows.push(
            `<tr><td>${tankName}</td><td>${count}</td><td>${row.referenceIds.join(', ')}</td><td>${row.note ?? ''}</td></tr>`,
          )
        }
      }
    }

    const fireCoolingHtml = (coolingRows.length > 0 || foamRows.length > 0)
      ? `
        <div class="summary" style="background:#f8fafc;">
          <h2>محاسبات اطفا و کولینگ</h2>
          <div style="margin-top:10px;">
            ${coolingRows.length > 0
              ? `
                <h2 style="margin-top:16px;">کولینگ</h2>
                <table>
                  <tr><th>مخزن</th><th>تعداد نازل</th><th>تعداد در هر رینگ</th><th>فرمول</th></tr>
                  ${coolingRows.join('')}
                  <tr><td><b>جمع</b></td><td><b>${totalCoolingNozzles}</b></td><td colspan="2"></td></tr>
                </table>
              `
              : ''}

            ${foamRows.length > 0
              ? `
                <h2 style="margin-top:16px;">فوم چمبر</h2>
                <table>
                  <tr><th>مخزن</th><th>تعداد خروجی/چمبر</th><th>مرجع جدول</th><th>یادداشت</th></tr>
                  ${foamRows.join('')}
                  <tr><td><b>جمع</b></td><td><b>${totalFoamChambers}</b></td><td colspan="2"></td></tr>
                </table>
              `
              : ''}
          </div>
        </div>
      `
      : ''

    const basisAppendixHtml = basisTable
      ? `<h2>پیوست الف — پایه طراحی و وضعیت تأیید</h2>
        <p>هیچ مقدار «الزام استاندارد» در این گزارش با متن مجاز نسخه مصوب تطبیق داده نشده است. وضعیت هر پارامتر در ستون آخر آمده است.</p>
        <table>
          <tr><th>پارامتر</th><th>مقدار</th><th>واحد</th><th>منبع</th><th>مرجع / وضعیت تأیید</th></tr>
          ${basisTable.rows.map(r => `<tr>
            <td>${r.label}</td>
            <td dir="ltr">${r.value}</td>
            <td dir="ltr">${r.unit || '—'}</td>
            <td>${r.source}</td>
            <td>${r.status}</td>
          </tr>`).join('')}
        </table>
        <h2>نسخه استانداردهای مصوب</h2>
        <table>
          <tr><th>استاندارد</th><th>نسخه</th><th>منبع</th><th>وضعیت</th></tr>
          ${(basis?.adoptedStandards || []).map(s => `<tr>
            <td>${s.standard}</td>
            <td>${s.edition ?? 'ثبت‌نشده'}</td>
            <td>${s.source}</td>
            <td>${STATUS_LABELS[s.status]}</td>
          </tr>`).join('')}
        </table>`
      : ''

    const bomHtml = bom.map(item => `
      <tr>
        <td>${item.category}</td>
        <td>${item.name}</td>
        <td style="text-align:center;font-weight:bold">${item.quantity}</td>
        <td>${item.unit}</td>
        <td>${item.specs || '-'}</td>
      </tr>
    `).join('')

    const layerSections = printMode === 'layered'
      ? layers.filter(l => selectedLayers.includes(l.id)).map(layer => {
          const layerElements = visibleElements.filter(e => e.layer === layer.id)
          return `
            <div class="layer-section">
              <div class="layer-header" style="background:${layer.color}20;border-right:4px solid ${layer.color}">
                <h3 style="color:${layer.color}">${layer.name}</h3>
                <p>${layerElements.length} تجهیز</p>
              </div>
              <table>
                <tr><th>#</th><th>نوع</th><th>نام</th><th>موقعیت</th><th>ابعاد</th></tr>
                ${layerElements.map((el, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${el.type}</td>
                    <td>${el.label || '-'}</td>
                    <td>(${Math.round(el.x)}, ${Math.round(el.y)})</td>
                    <td>${Math.round(el.width)}×${Math.round(el.height)}</td>
                  </tr>
                `).join('')}
              </table>
            </div>
          `
        }).join('')
      : ''

    const printHtml = `
      <html>
        <head>
          <title>${project?.name || 'Project'} - ATLAS Export</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; direction: rtl; }
            h1 { color: #0284c7; border-bottom: 2px solid #0284c7; padding-bottom: 10px; }
            h2 { color: #334155; margin-top: 24px; }
            table { width: 100%; border-collapse: collapse; margin: 12px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
            th { background: #f1f5f9; }
            .layer-section { page-break-before: always; }
            .layer-header { padding: 12px; border-radius: 8px; margin-bottom: 12px; }
            .summary { background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .bom { background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; }
            @media print { .layer-section { page-break-before: always; } }
          </style>
        </head>
        <body>
          <h1>🔥 ${project?.name || 'ATLAS Project'}</h1>
          <p>ATLAS Fire Protection Design Software</p>
          <p>ابعاد سایت: ${project?.widthMeters || 100}m × ${project?.heightMeters || 100}m</p>

          <div style="border:2px solid ${verified ? '#16a34a' : '#dc2626'};background:${verified ? '#f0fdf4' : '#fef2f2'};padding:14px;border-radius:8px;margin:18px 0;">
            <h2 style="margin-top:0;color:${verified ? '#166534' : '#991b1b'};">
              ${verified ? 'وضعیت: تأییدشده' : 'این گزارش «منطبق با استاندارد» نیست — نیازمند بازبینی مهندسی است'}
            </h2>
            <p style="margin:6px 0;">${validation?.statement || 'برای نمایش وضعیت اعتبارسنجی، طرح را در مرحله ورست‌کیس محاسبه کنید.'}</p>
            <table>
              <tr><th>خطای بازدارنده</th><th>هشدار</th><th>موارد باز</th><th>ثابت‌های محاسبه</th></tr>
              <tr><td>${(validation?.blockers || []).length}</td><td>${(validation?.warnings || []).length}</td><td>${reviewRowCount}</td><td>${CONSTANTS_VERSION}</td></tr>
            </table>
            ${openItemsHtml}
          </div>

          <div class="summary">
            <h2>خلاصه پروژه</h2>
            <table>
              <tr><th>آیتم</th><th>مقدار</th></tr>
              <tr><td>تعداد کل تجهیزات</td><td>${elements.length}</td></tr>
              <tr><td>تعداد لوله‌ها</td><td>${pipes.length}</td></tr>
              <tr><td>مخازن آب</td><td>${elements.filter(e => e.type === 'water_tank').length}</td></tr>
              <tr><td>پمپ‌ها</td><td>${elements.filter(e => e.type === 'pump').length}</td></tr>
              <tr><td>مانیتورها</td><td>${elements.filter(e => e.type === 'monitor').length}</td></tr>
              <tr><td>هایدرانت‌ها</td><td>${elements.filter(e => e.type === 'hydrant').length}</td></tr>
              <tr><td>مخازن نفتی</td><td>${elements.filter(e => e.type === 'oil_tank').length}</td></tr>
            </table>
          </div>

          ${fireCoolingHtml}
          <div class="bom">
            <h2>لیست تجهیزات مورد نیاز (BOM)</h2>
            <table>
              <tr><th>دسته</th><th>نام</th><th>تعداد</th><th>واحد</th><th>مشخصات</th></tr>
              ${bomHtml}
            </table>
          </div>

          <h2>لیست تجهیزات جانمایی شده</h2>
          <table>
            <tr><th>#</th><th>نوع</th><th>نام</th><th>لایه</th><th>موقعیت</th><th>ابعاد</th></tr>
            ${visibleElements.map((el, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${el.type}</td>
                <td>${el.label || '-'}</td>
                <td>${layers.find(l => l.id === el.layer)?.name || el.layer}</td>
                <td>(${Math.round(el.x)}, ${Math.round(el.y)})</td>
                <td>${Math.round(el.width)}×${Math.round(el.height)}</td>
              </tr>
            `).join('')}
          </table>

          ${layerSections}

          ${basisAppendixHtml}

          <div style="margin-top:24px;border:1px solid #f59e0b;background:#fffbeb;padding:12px;border-radius:8px;">
            <h2 style="margin-top:0;color:#92400e;">محدودیت‌ها و آنچه این گزارش پوشش نمی‌دهد</h2>
            <ul style="margin:0;padding-right:18px;">
              <li>هیچ‌یک از مقادیر «الزام استاندارد» در این ساخت از متن مجاز/رسمی استخراج نشده است و همه با وضعیت تأیید خود گزارش می‌شوند.</li>
              <li>محاسبات هیدرولیک در این نسخه روی افت برآوردی شبکه انجام می‌شود، نه حل کامل شبکه لوله.</li>
              <li>پوشش مؤثر نازل‌ها بدون داده الگوی پاشش سازنده اثبات نمی‌شود.</li>
              <li>اجرای فرمول‌ها به‌معنای انطباق با استاندارد نیست؛ انطباق نیازمند تأیید همه معیارها، محاسبه هیدرولیک، داده تجهیزات و بازبینی مهندسی است.</li>
              <li>BOM فقط تجهیزات جانمایی‌شده روی نقشه را می‌شمارد و تجهیزات گره‌های لوله و احجام محاسبه‌شده فوم/آب را در بر نمی‌گیرد.</li>
            </ul>
          </div>

          <div style="margin-top: 30px; text-align: center; color: #999; font-size: 12px;">
            خروجی ATLAS Fire Protection Design Software · موتور محاسبات {basis?.basisVersion || '—'}
          </div>
        </body>
      </html>
    `

    try {
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.top = '0'
      iframe.style.left = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = 'none'
      document.body.appendChild(iframe)
      const iframeDoc = iframe.contentWindow?.document
      if (iframeDoc) {
        iframeDoc.open()
        iframeDoc.write(printHtml)
        iframeDoc.close()
        setTimeout(() => {
          iframe.contentWindow?.print()
          setTimeout(() => document.body.removeChild(iframe), 1000)
        }, 500)
      } else {
        document.body.removeChild(iframe)
        throw new Error('iframe blocked')
      }
    } catch {
      const blob = new Blob([printHtml], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project?.name || 'project'}-report.html`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const handleExportJSON = () => {
    try {
      const data = {
        project: { name: project?.name, dimensions: { width: project?.widthMeters, height: project?.heightMeters } },
        elements: elements.map(el => ({
          type: el.type, label: el.label,
          position: { x: Math.round(el.x), y: Math.round(el.y) },
          dimensions: { width: Math.round(el.width), height: Math.round(el.height) },
          layer: layers.find(l => l.id === el.layer)?.name || el.layer,
          zone: zones[el.id] || '-',
          properties: el.properties,
        })),
        pipes: pipes.map(p => ({
          layer: layers.find(l => l.id === p.layer)?.name || p.layer,
          length: p.length, points: p.points.length,
        })),
        billOfMaterials: bom,
      }
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project?.name || 'project'}-report.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (err) {
      console.error('Export JSON failed:', err)
    }
  }

  const handleExportAtlas = () => {
    try {
      const data = {
        ...project,
        elements: JSON.stringify(elements),
        layers: JSON.stringify(layers),
        zones: JSON.stringify(zones),
        bom: JSON.stringify(bom),
      }
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project?.name || 'project'}.atlas`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (err) {
      console.error('Export .atlas failed:', err)
    }
  }

  return (
    <div className="w-96 bg-white/60 backdrop-blur-md border-l border-white/50 overflow-y-auto flex-shrink-0">
      <div className="p-4">
        <h3 className="font-bold text-gray-700 mb-1 flex items-center gap-2">
          <FileDown className="w-5 h-5 text-sky-500" />
          خروجی، چاپ و BOM
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          خروجی نقشه، لیست تجهیزات و گزارش پروژه
        </p>

        {/* Show output */}
        <Button
          onClick={() => onShowOutput?.()}
          className="w-full mb-4 h-9 bg-emerald-500 hover:bg-emerald-600 text-white text-xs"
        >
          <Package className="w-4 h-4 ml-2" />
          نمایش خروجی طراحی
        </Button>

        {/* Print Mode */}
        <div className="space-y-2 mb-4">
          <Label className="text-xs font-bold text-gray-600">حالت چاپ</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPrintMode('all')}
              className={`p-2 rounded-xl border text-center text-[11px] font-medium transition ${
                printMode === 'all' ? 'bg-sky-50 border-sky-300 text-sky-600' : 'bg-white/50 border-gray-200 text-gray-500'
              }`}
            >
              <FileText className="w-4 h-4 mx-auto mb-1" />
              همه در یک صفحه
            </button>
            <button
              onClick={() => setPrintMode('layered')}
              className={`p-2 rounded-xl border text-center text-[11px] font-medium transition ${
                printMode === 'layered' ? 'bg-sky-50 border-sky-300 text-sky-600' : 'bg-white/50 border-gray-200 text-gray-500'
              }`}
            >
              <Layers className="w-4 h-4 mx-auto mb-1" />
              جداگانه در هر لایه
            </button>
          </div>
        </div>

        {/* Layer Selection */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold text-gray-600">لایه‌های قابل چاپ</Label>
            <button
              onClick={() => setSelectedLayers(prev =>
                prev.length === layers.length ? [] : layers.map(l => l.id)
              )}
              className="text-[10px] text-sky-500 hover:text-sky-600"
            >
              {selectedLayers.length === layers.length ? 'حذف همه' : 'انتخاب همه'}
            </button>
          </div>
          <div className="space-y-1">
            {layers.map(layer => {
              const count = elements.filter(e => e.layer === layer.id).length
              return (
                <label key={layer.id} className="flex items-center gap-2 px-2 py-1.5 bg-white/50 rounded-lg border border-gray-100 cursor-pointer hover:border-sky-200 transition">
                  <input
                    type="checkbox"
                    checked={selectedLayers.includes(layer.id)}
                    onChange={() => toggleLayer(layer.id)}
                    className="rounded w-3.5 h-3.5"
                  />
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: layer.color }} />
                  <span className="text-[11px] text-gray-600 flex-1">{layer.name}</span>
                  {count > 0 && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">{count}</Badge>
                  )}
                </label>
              )
            })}
          </div>
        </div>

        <Separator className="my-3" />

        {/* BOM Preview */}
        <div className="space-y-2 mb-4">
          <button
            onClick={() => setShowBOM(!showBOM)}
            className="flex items-center justify-between w-full px-3 py-2 bg-white/50 rounded-xl border border-gray-100 hover:border-sky-200 transition"
          >
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-sky-500" />
              <span className="text-xs font-bold text-gray-600">لیست تجهیزات (BOM)</span>
              <Badge variant="outline" className="text-[9px]">{bom.length} آیتم</Badge>
            </div>
            {showBOM ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {showBOM && (
            <div className="bg-white/50 rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-1.5 text-right font-bold text-gray-600">دسته</th>
                    <th className="px-2 py-1.5 text-right font-bold text-gray-600">نام</th>
                    <th className="px-2 py-1.5 text-center font-bold text-gray-600">تعداد</th>
                    <th className="px-2 py-1.5 text-right font-bold text-gray-600">واحد</th>
                  </tr>
                </thead>
                <tbody>
                  {bom.map((item, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1 text-gray-500">{item.category}</td>
                      <td className="px-2 py-1 text-gray-600 font-medium">{item.name}</td>
                      <td className="px-2 py-1 text-center font-bold text-sky-600">{item.quantity}</td>
                      <td className="px-2 py-1 text-gray-500">{item.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Separator className="my-3" />

        {/* Export Buttons */}
        <div className="space-y-2">
          <Button
            onClick={handlePrint}
            className="w-full bg-gradient-to-r from-sky-500 to-blue-500 text-white h-10"
          >
            <Printer className="w-4 h-4 ml-2" />
            چاپ / PDF
          </Button>

          <Button
            onClick={handleExportJSON}
            variant="outline"
            className="w-full h-9"
          >
            <Table className="w-4 h-4 ml-2" />
            گزارش JSON + BOM
          </Button>

          <Button
            onClick={handleExportAtlas}
            variant="outline"
            className="w-full h-9"
          >
            <FileText className="w-4 h-4 ml-2" />
            ذخیره فایل .atlas
          </Button>
        </div>

        {/* Summary */}
        <div className="mt-4 p-3 bg-white/50 rounded-xl border border-white/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-600">خلاصه خروجی</span>
          </div>
          <div className="space-y-1 text-[10px] text-gray-500">
            <div className="flex justify-between">
              <span>تجهیزات قابل چاپ:</span>
              <span className="font-bold">{elements.filter(e => selectedLayers.includes(e.layer)).length} / {elements.length}</span>
            </div>
            <div className="flex justify-between">
              <span>لوله‌ها:</span>
              <span className="font-bold">{pipes.length}</span>
            </div>
            <div className="flex justify-between">
              <span>آیتم‌های BOM:</span>
              <span className="font-bold">{bom.length}</span>
            </div>
            <div className="flex justify-between">
              <span>لایه‌های انتخاب:</span>
              <span className="font-bold">{selectedLayers.length} / {layers.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
