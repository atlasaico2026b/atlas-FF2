// Drives the deployed app along the path a user actually takes to reach the
// calculator: dashboard → «محاسبات اطفا» → fill → محاسبه, then reads the result
// off the live page.
const PORT = process.env.CDP_PORT || '9333'
const BASE = process.argv[2]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pass = 0, fail = 0
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' :: ' + d : ''}`); ok ? pass++ : fail++ }

async function main() {
  let target
  for (let i = 0; i < 40 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page') } catch {}
    if (!target) await sleep(250)
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m) } }
  await new Promise((r) => { ws.onopen = r })
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text)
    return r.result?.result?.value
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await evalJs(`location.href = ${JSON.stringify(BASE + '/?guest=1')}`)
  await sleep(3500)

  // The guest link authenticates but still lands on the landing page.
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('ورود به برنامه'))?.click()`)
  await sleep(1500)

  const onDashboard = await evalJs(`document.body.innerText.includes('پروژه‌ها')`)
  check('the deployed app reaches the dashboard', onDashboard === true)

  const hasEntry = await evalJs(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('محاسبات اطفا'))`)
  check('the dashboard exposes the «محاسبات اطفا» entry', hasEntry === true)

  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('محاسبات اطفا'))?.click()`)
  await sleep(1200)
  const calcOpen = await evalJs(`document.body.innerText.includes('محاسبات اطفا و کولینگ')`)
  check('clicking it opens the calculator', calcOpen === true)

  const beforeCalc = await evalJs(`!document.body.innerText.includes('خروجی‌های محاسبه')`)
  check('no result is shown before محاسبه', beforeCalc === true)

  // Fill the real form the way a user would.
  const openPick = async (trigger, option) => {
    await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(trigger)}))?.click()`)
    await sleep(350)
    await evalJs(`[...document.querySelectorAll('div.cursor-pointer')].find(d => d.textContent.includes(${JSON.stringify(option)}))?.click()`)
    await sleep(350)
  }
  await openPick('نوع ماده نفتی', 'نفت خام سبک')
  await openPick('انتخاب نوع سقف', 'سقف ثابت')
  await openPick('انتخاب سناریو', 'فوم‌چمبر')

  await evalJs(`(() => {
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el, v); el.dispatchEvent(new Event('input', {bubbles:true})) }
    set(document.querySelector('input[placeholder="30"]'), '30')
    set(document.querySelector('input[placeholder="15"]'), '15')
  })()`)
  await sleep(300)
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'محاسبه')?.click()`)
  await sleep(1500)

  const text = await evalJs(`document.body.innerText`)
  check('the deployed app renders the results', text.includes('خروجی‌های محاسبه'))
  check('with exactly seventeen outputs', text.includes('17 خروجی'), (text.match(/\d+ خروجی/) ?? [])[0])
  check('the group badge follows the product', text.includes('گروه Alpha'))
  check('the foam flow is computed on the live app', text.includes('2,898.12'))
  check('the flow per chamber is computed on the live app', text.includes('1,449.06'))
  check('the design flow carries the 1.2 factor', text.includes('20,781.64'))
  check('missing inputs are named instead of guessed', text.includes('ورودی‌های لازم برای شروع محاسبه'))
  check('the jockey pump is reported as undefined, not invented', text.includes('در مرجع تعریف نشده'))

  // §۳-ب worked example, switched through the deployed form: a 900 L/min unit on
  // the same tank → 6 units and 5400 L/min installed.
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('فوم‌چمبر'))?.click()`)
  await sleep(350)
  await evalJs(`[...document.querySelectorAll('div.cursor-pointer')].find(d => d.textContent.includes('مانیتور یا هوزدستی'))?.click()`)
  await sleep(350)
  await evalJs(`(() => {
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el, v); el.dispatchEvent(new Event('input', {bubbles:true})) }
    const model = document.querySelector('input[placeholder="Monitor-2000"]')
    set(model.closest('.grid').querySelectorAll('input')[1], '900')
  })()`)
  await sleep(300)
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'محاسبه')?.click()`)
  await sleep(1500)

  const ex = await evalJs(`document.body.innerText`)
  check('the live app computes the monitor requirement', ex.includes('4,594.58'))
  check('the equipment count reaches the live app as a figure',
    ex.includes('تعداد تجهیز لازم') && ex.includes('5,400'))
  check('the installed flow reaches the live app as a figure', ex.includes('دبی نصب‌شده'))
  check('the solution volume reaches the live app as a figure',
    ex.includes('حجم محلول فوم') && ex.includes('298.65'))
  check('the adequacy of the selected capacity is stated on the live app',
    ex.includes('ظرفیت کافی است'))
  check('the monitor scenario duration is 65 min on the live app', /\b65\s*min/.test(ex))

  // دوزبانه روی اپ منتشرشده: کلید زبان جهت سند را عوض می‌کند و متن انگلیسی می‌آید.
  const hasToggle = await evalJs(`!!document.querySelector('[data-lang-toggle]')`)
  check('the language toggle is on the live app', hasToggle === true)
  await evalJs(`document.querySelector('[data-lang-toggle]')?.click()`)
  await sleep(600)
  const enDir = await evalJs(`document.documentElement.getAttribute('dir')`)
  const enText = await evalJs(`document.body.innerText`)
  check('switching flips the document to ltr on the live app', enDir === 'ltr', String(enDir))
  check('the live app renders English labels', enText.includes('Fire-fighting'))
  check('and the results block is English too', enText.includes('Required foam-fighting flow'))
  await evalJs(`document.querySelector('[data-lang-toggle]')?.click()`)
  await sleep(600)
  const faDir = await evalJs(`document.documentElement.getAttribute('dir')`)
  check('and switching back restores rtl', faDir === 'rtl', String(faDir))

  const errors = await evalJs(`window.__errs ? window.__errs.length : 0`)
  check('no uncaught errors during the run', !errors, String(errors))

  console.log(`\n==== ${pass}/${pass + fail} passed ====`)
  ws.close()
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error('ERROR', e.message); process.exit(1) })
