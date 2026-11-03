import { useMemo, useState } from 'react'
import { ArrowRight, Calculator, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import {
  FIRE_FUELS,
  ROOF_TYPES,
  SAFETY_FACTOR,
  calculate,
  scenariosForRoof,
  type AdjacentEquipmentInput,
  type FireCalcInput,
  type FireCalcResult,
  type FireOutput,
  type RoofType,
  type ScenarioId,
} from '@/lib/fire'
import { useLang } from '@/lib/i18n'

interface FireCalcScreenProps {
  onBack: () => void
}

interface AdjacentRow {
  name: string
  diameterM: string
  heightM: string
  coolingPercent: string
}

const EMPTY_ADJACENT: AdjacentRow = { name: '', diameterM: '', heightM: '', coolingPercent: '' }

const num = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

export default function FireCalcScreen({ onBack }: FireCalcScreenProps) {
  const { t, term, out: outLabel, sec } = useLang()
  const [fuelKey, setFuelKey] = useState('')
  const [diameterM, setDiameterM] = useState('')
  const [heightM, setHeightM] = useState('')
  const [roofType, setRoofType] = useState<RoofType | ''>('')
  const [scenario, setScenario] = useState<ScenarioId | ''>('')
  const [sealWidthM, setSealWidthM] = useState('')

  const [bundwallMode, setBundwallMode] = useState<'area' | 'lw'>('area')
  const [bundwallAreaM2, setBundwallAreaM2] = useState('')
  const [bundwallLengthM, setBundwallLengthM] = useState('')
  const [bundwallWidthM, setBundwallWidthM] = useState('')

  const [monitorModel, setMonitorModel] = useState('')
  const [monitorCapacityLpm, setMonitorCapacityLpm] = useState('')

  const [adjacent, setAdjacent] = useState<AdjacentRow[]>([])

  const [pipeLengthM, setPipeLengthM] = useState('')
  const [pipeDiameterMm, setPipeDiameterMm] = useState('')
  const [cFactor, setCFactor] = useState('')
  const [staticHeadM, setStaticHeadM] = useState('')
  const [residualBar, setResidualBar] = useState('')

  const [sprayRing, setSprayRing] = useState('')
  const [spraySprinkler, setSpraySprinkler] = useState('')
  const [rundownRing, setRundownRing] = useState('')
  const [rundownSprinkler, setRundownSprinkler] = useState('')

  const [result, setResult] = useState<FireCalcResult | null>(null)

  const fuel = FIRE_FUELS.find((f) => f.key === fuelKey) ?? null
  const scenarioOptions = useMemo(() => scenariosForRoof(roofType || null), [roofType])
  const activeScenario = scenarioOptions.find((s) => s.id === scenario) ?? null

  function runCalculation() {
    const adjacentInput: AdjacentEquipmentInput[] = adjacent.map((a) => ({
      name: a.name,
      diameterM: num(a.diameterM),
      heightM: num(a.heightM),
      coolingPercent: num(a.coolingPercent),
    }))

    const input: FireCalcInput = {
      fuelKey: fuelKey || null,
      diameterM: num(diameterM),
      heightM: num(heightM),
      roofType: roofType || null,
      scenario: scenario || null,
      sealWidthM: num(sealWidthM),
      bundwallAreaM2: num(bundwallAreaM2),
      bundwallLengthM: num(bundwallLengthM),
      bundwallWidthM: num(bundwallWidthM),
      monitor:
        monitorModel.trim() || num(monitorCapacityLpm) !== null
          ? { model: monitorModel, capacityLpm: num(monitorCapacityLpm) }
          : null,
      adjacent: adjacentInput,
      hydraulic:
        num(pipeLengthM) !== null ||
        num(pipeDiameterMm) !== null ||
        num(cFactor) !== null ||
        num(staticHeadM) !== null ||
        num(residualBar) !== null
          ? {
              pipeLengthM: num(pipeLengthM),
              pipeDiameterMm: num(pipeDiameterMm),
              cFactor: num(cFactor),
              staticHeadM: num(staticHeadM),
              residualBar: num(residualBar),
            }
          : null,
      directSpray: { ringSpacingM: num(sprayRing), sprinklerSpacingM: num(spraySprinkler) },
      rundown: { ringSpacingM: num(rundownRing), sprinklerSpacingM: num(rundownSprinkler) },
    }

    setResult(calculate(input))
    requestAnimationFrame(() => {
      document.getElementById('fire-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-pink-50 to-rose-50">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 p-4 sm:p-5">
          <button onClick={onBack} className="rounded-xl p-2 transition hover:bg-white/60" aria-label={t('app.back')}>
            <ArrowRight size={20} className="rtl:rotate-0 ltr:rotate-180" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-bold sm:text-lg">{t('calc.title')}</h1>
            <p className="text-[11px] text-gray-500">{t('app.tagline')}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        {/* ۱ — مشخصات مخزن */}
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('calc.step1')}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('f.fuel')} hint={t('f.fuel.hint')}>
              <Select
                value={fuelKey}
                onValueChange={(v) => {
                  setFuelKey(v)
                  setResult(null)
                }}
              >
                <SelectTrigger>
                  <span className={fuel ? '' : 'text-muted-foreground'}>
                    {fuel
                      ? `${term(`fuel.${fuel.key}`)} — ${term(`group.${fuel.group}`)}`
                      : t('f.fuel')}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {FIRE_FUELS.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      {term(`fuel.${f.key}`)}
                      <span className="mx-2 text-[11px] text-gray-400">{term(`group.${f.group}`)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={t('f.roof')} hint={t('f.roof.hint')}>
              <Select
                value={roofType}
                onValueChange={(v) => {
                  setRoofType(v as RoofType)
                  setScenario('')
                  setResult(null)
                }}
              >
                <SelectTrigger>
                  <span className={roofType ? '' : 'text-muted-foreground'}>
                    {roofType ? term(`roof.${roofType}`) : t('f.roof.placeholder')}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {ROOF_TYPES.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{term(`roof.${r.id}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={t('f.diameter')} hint={t('f.diameter.hint')}>
              <Input
                type="number" inputMode="decimal" value={diameterM} placeholder="30"
                onChange={(e) => { setDiameterM(e.target.value); setResult(null) }}
              />
            </Field>

            <Field label={t('f.height')} hint={t('f.height.hint')}>
              <Input
                type="number" inputMode="decimal" value={heightM} placeholder="15"
                onChange={(e) => { setHeightM(e.target.value); setResult(null) }}
              />
            </Field>

            <Field label={t('f.scenario')} hint={activeScenario ? sec(activeScenario.section) : t('f.scenario.hint')}>
              <Select
                value={scenario}
                onValueChange={(v) => { setScenario(v as ScenarioId); setResult(null) }}
              >
                <SelectTrigger>
                  <span className={activeScenario ? '' : 'text-muted-foreground'}>
                    {activeScenario
                      ? term(`scenario.${activeScenario.id}`)
                      : roofType
                        ? t('f.scenario.placeholder')
                        : t('f.scenario.needRoof')}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {scenarioOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {term(`scenario.${s.id}`)}
                      <span className="mx-2 text-[11px] text-gray-400" dir="ltr">{s.rateLminM2} L/min/m²</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {activeScenario?.area === 'annular' && (
              <Field label={t('f.sealWidth')} hint={t('f.sealWidth.hint')}>
                <Input
                  type="number" inputMode="decimal" value={sealWidthM} placeholder="0.6"
                  onChange={(e) => { setSealWidthM(e.target.value); setResult(null) }}
                />
              </Field>
            )}
          </CardContent>
        </Card>

        {/* ۲ — باندوال */}
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('calc.step2')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Segmented
              value={bundwallMode}
              onChange={(v) => { setBundwallMode(v); setResult(null) }}
              options={[
                { id: 'area', label: t('f.bundwall.area') },
                { id: 'lw', label: t('f.bundwall.lw') },
              ]}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {bundwallMode === 'area' ? (
                <Field label={t('f.bundwall.areaM2')} hint="m²">
                  <Input type="number" inputMode="decimal" value={bundwallAreaM2} onChange={(e) => { setBundwallAreaM2(e.target.value); setResult(null) }} />
                </Field>
              ) : (
                <>
                  <Field label={t('f.length')} hint={t('f.diameter.hint')}>
                    <Input type="number" inputMode="decimal" value={bundwallLengthM} onChange={(e) => { setBundwallLengthM(e.target.value); setResult(null) }} />
                  </Field>
                  <Field label={t('f.width')} hint={t('f.diameter.hint')}>
                    <Input type="number" inputMode="decimal" value={bundwallWidthM} onChange={(e) => { setBundwallWidthM(e.target.value); setResult(null) }} />
                  </Field>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ۳ — مانیتور */}
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('calc.step3')}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('f.model')} hint={t('f.model.hint')}>
              <Input value={monitorModel} placeholder="Monitor-2000" onChange={(e) => { setMonitorModel(e.target.value); setResult(null) }} />
            </Field>
            <Field label={t('f.capacity')} hint="L/min">
              <Input type="number" inputMode="decimal" value={monitorCapacityLpm} onChange={(e) => { setMonitorCapacityLpm(e.target.value); setResult(null) }} />
            </Field>
          </CardContent>
        </Card>

        {/* ۴ — تجهیزات مجاور */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm">{t('calc.step4')}</CardTitle>
              <Button variant="outline" size="sm"
                onClick={() => { setAdjacent((a) => [...a, { ...EMPTY_ADJACENT }]); setResult(null) }}>
                <Plus size={14} /> {t('f.adjacent.add')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {adjacent.length === 0 && (
              <p className="text-xs text-gray-500">{t('dash.empty')}</p>
            )}
            {adjacent.map((row, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 rounded-xl border border-gray-100 p-3 sm:grid-cols-5">
                <Field label={t('f.name')} className="col-span-2 sm:col-span-1">
                  <Input value={row.name} onChange={(e) => updateAdjacent(i, 'name', e.target.value, setAdjacent, setResult)} />
                </Field>
                <Field label={t('f.diameter')} hint="m">
                  <Input type="number" inputMode="decimal" value={row.diameterM} onChange={(e) => updateAdjacent(i, 'diameterM', e.target.value, setAdjacent, setResult)} />
                </Field>
                <Field label={t('f.height')} hint="m">
                  <Input type="number" inputMode="decimal" value={row.heightM} onChange={(e) => updateAdjacent(i, 'heightM', e.target.value, setAdjacent, setResult)} />
                </Field>
                <Field label={t('f.coolingPercent')} hint="%">
                  <Input type="number" inputMode="decimal" value={row.coolingPercent} onChange={(e) => updateAdjacent(i, 'coolingPercent', e.target.value, setAdjacent, setResult)} />
                </Field>
                <div className="flex items-end">
                  <Button variant="ghost" size="sm"
                    onClick={() => { setAdjacent((a) => a.filter((_, j) => j !== i)); setResult(null) }}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ۵ — هیدرولیک */}
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('calc.step5')}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={t('f.pipeLength')} hint={t('f.diameter.hint')}><Input type="number" inputMode="decimal" value={pipeLengthM} onChange={(e) => { setPipeLengthM(e.target.value); setResult(null) }} /></Field>
            <Field label={t('f.pipeDiameter')} hint={t('f.pipeDiameter.hint')}>
              <Input type="number" inputMode="decimal" placeholder={t('f.pipeDiameter.placeholder')} value={pipeDiameterMm} onChange={(e) => { setPipeDiameterMm(e.target.value); setResult(null) }} />
            </Field>
            <Field label={t('f.cFactor')} hint={t('f.cFactor.hint')}><Input type="number" inputMode="decimal" value={cFactor} onChange={(e) => { setCFactor(e.target.value); setResult(null) }} /></Field>
            <Field label={t('f.staticHead')} hint={t('f.diameter.hint')}><Input type="number" inputMode="decimal" value={staticHeadM} onChange={(e) => { setStaticHeadM(e.target.value); setResult(null) }} /></Field>
            <Field label={t('f.residual')} hint="bar"><Input type="number" inputMode="decimal" value={residualBar} onChange={(e) => { setResidualBar(e.target.value); setResult(null) }} /></Field>
          </CardContent>
        </Card>

        {/* ۶ — کولینگ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('calc.step6')}</CardTitle>
            <p className="pt-1 text-[11px] text-gray-500">
              {t('calc.coolingBothModes')}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('f.sprayRing')} hint={t('f.diameter.hint')}><Input type="number" inputMode="decimal" value={sprayRing} onChange={(e) => { setSprayRing(e.target.value); setResult(null) }} /></Field>
              <Field label={t('f.spraySprinkler')} hint={t('f.diameter.hint')}><Input type="number" inputMode="decimal" value={spraySprinkler} onChange={(e) => { setSpraySprinkler(e.target.value); setResult(null) }} /></Field>
              <Field label={t('f.rundownRing')} hint={t('f.diameter.hint')}><Input type="number" inputMode="decimal" value={rundownRing} onChange={(e) => { setRundownRing(e.target.value); setResult(null) }} /></Field>
              <Field label={t('f.rundownSprinkler')} hint={t('f.diameter.hint')}><Input type="number" inputMode="decimal" value={rundownSprinkler} onChange={(e) => { setRundownSprinkler(e.target.value); setResult(null) }} /></Field>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" size="lg" onClick={runCalculation}>
          <Calculator size={18} /> {t('calc.run')}
        </Button>

        {result && <Results result={result} />}
      </main>
    </div>
  )
}

// ── قطعات کوچک ───────────────────────────────────────────────────────────────

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-lg px-3 py-1.5 text-xs transition ${
            value === o.id ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function updateAdjacent(
  index: number,
  key: keyof AdjacentRow,
  value: string,
  setAdjacent: React.Dispatch<React.SetStateAction<AdjacentRow[]>>,
  setResult: React.Dispatch<React.SetStateAction<FireCalcResult | null>>,
) {
  setAdjacent((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)))
  setResult(null)
}

const STATUS_STYLE: Record<FireOutput['status'], { key: string; className: string }> = {
  ok: { key: 'status.ok', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  insufficient: { key: 'status.insufficient', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  na: { key: 'status.na', className: 'bg-gray-50 text-gray-500 border-gray-200' },
  not_defined: { key: 'status.not_defined', className: 'bg-slate-50 text-slate-500 border-slate-200' },
}

function Results({ result }: { result: FireCalcResult }) {
  const { t, term, out: outLabel, text, sec } = useLang()
  const incomplete = result.outputs.filter((o) => o.status === 'insufficient')

  return (
    <section id="fire-results" className="space-y-3 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold">{t('calc.results')}</h2>
        {result.group && <Badge variant="outline">{term(`group.${result.group}`)}</Badge>}
        <Badge variant="outline" dir="ltr">SF {SAFETY_FACTOR}</Badge>
      </div>

      {!result.ok && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">{t('calc.missingAll')}</p>
            <ul className="list-inside list-disc space-y-0.5">
              {result.missing.map((m) => <li key={m}>{text(m)}</li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {result.outputs.map((o) => (
          <OutputRow key={o.id} output={o} label={outLabel(o.id, o.label)} />
        ))}
      </div>

      <p className="pt-1 text-[11px] text-gray-500">
        {result.outputs.length} {t('calc.outputsCount')} · {incomplete.length} {t('calc.missing')}
      </p>

      {result.notes.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white/70 p-3 text-[11px] text-gray-600">
          <p className="mb-1 font-semibold text-gray-700">{t('calc.notes')}</p>
          <ul className="list-inside list-disc space-y-0.5">
            {result.notes.map((nt, i) => <li key={i}>{text(nt)}</li>)}
          </ul>
        </div>
      )}
    </section>
  )
}

function OutputRow({ output, label }: { output: FireOutput; label: string }) {
  const { t, text, sec } = useLang()
  const [open, setOpen] = useState(false)
  const style = STATUS_STYLE[output.status]
  return (
    <div className="rounded-xl border border-gray-200 bg-white/80 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold sm:text-[13px]">
            <span className="mx-1 text-gray-400">{output.id}.</span>
            {label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold">
            {output.value === null ? '—' : output.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            {output.value !== null && output.unit && <span className="mx-1 text-[10px] font-normal text-gray-500">{output.unit}</span>}
          </span>
          <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${style.className}`}>{t(style.key)}</span>
        </div>
      </div>

      {output.figures && output.figures.length > 0 && (
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {output.figures.map((f) => (
            <div
              key={f.label}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-2 py-1"
            >
              <span className="text-[11px] text-gray-600">{text(f.label)}</span>
              <span className="font-mono text-xs font-semibold">
                {f.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                {f.unit && (
                  <span className="mx-1 text-[10px] font-normal text-gray-500">{f.unit}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {output.note && <p className="mt-1 text-[11px] text-gray-500">{text(output.note)}</p>}

      {output.missing.length > 0 && (
        <ul className="mt-1.5 list-inside list-disc text-[11px] text-amber-700">
          {output.missing.map((m) => <li key={m}>{text(m)}</li>)}
        </ul>
      )}

      {output.basis.length > 0 && (
        <>
          <button onClick={() => setOpen(!open)} className="mt-1.5 text-[11px] text-sky-600 hover:underline">
            {open ? `▾ ${t('calc.basis')}` : `▸ ${t('calc.basis')}`}
          </button>
          {open && (
            <ul className="mt-1 space-y-0.5 rounded-lg bg-gray-50 p-2 font-mono text-[10px] text-gray-600" dir="ltr">
              {output.basis.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
