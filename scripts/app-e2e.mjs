// Drives the deployed app the way a user does — landing → login → a project →
// the design canvas — and measures the zoom controls with real browser input.
// usage: node scripts/app-e2e.mjs <baseUrl>
const PORT = process.env.CDP_PORT || '9333'
const BASE = process.argv[2]

const results = []
let pass = 0, fail = 0
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`
  results.push(line)
  ok ? pass++ : fail++
  console.log(line)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  let target
  for (let i = 0; i < 40 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find(t => t.type === 'page')
    } catch { /* browser booting */ }
    if (!target) await sleep(250)
  }
  if (!target) throw new Error('no page target')

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const errors = []
  const iconResponses = []
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id
    pending.set(msgId, { resolve, reject })
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
  await new Promise(r => ws.addEventListener('open', r))
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      return
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text)
    }
    if (msg.method === 'Network.responseReceived') {
      const { url, status } = msg.params.response
      if (url.includes('/point-icons/')) iconResponses.push({ url, status })
    }
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

  const evalJs = async expression =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value

  const clickText = async needle => evalJs(`(() => {
    const els = [...document.querySelectorAll('button, a, [role=button]')]
    const el = els.find(e => (e.textContent || '').includes(${JSON.stringify(needle)}))
    if (!el) return 'not-found'
    el.click(); return 'clicked'
  })()`)

  // Read the zoom percentage next to the «زوم» label, not any other "%" on the
  // page (the map-opacity slider also shows one).
  const zoomPct = () => evalJs(`(() => {
    const els = [...document.querySelectorAll('span')].filter(e => /زوم/.test(e.textContent || ''))
    for (const el of els) {
      const val = el.parentElement && el.parentElement.querySelector('span.text-sky-600')
      if (val && /^\\d+%$/.test(val.textContent.trim())) return parseInt(val.textContent)
    }
    return null
  })()`)

  await send('Page.navigate', { url: BASE + '/?guest=1' })
  await sleep(4000)

  // landing → app
  let clicked = await clickText('ورود به برنامه')
  check('the landing page offers a way in', clicked === 'clicked', clicked)
  await sleep(4000)

  // dashboard → open the first project card with a real mouse click
  const card = await evalJs(`(() => {
    const el = document.querySelector('div.group.cursor-pointer')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  if (card) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: card.x, y: card.y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card.x, y: card.y, button: 'left', clickCount: 1 })
  }
  check('a project can be opened from the dashboard', !!card, JSON.stringify(card))
  await sleep(4000)

  const canvasAt = async () => evalJs(`(() => {
    const c = document.querySelector('canvas')
    if (!c) return null
    const r = c.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) }
  })()`)

  await sleep(1500)
  let rect = await canvasAt()
  if (!rect) {
    // the workspace may still be fetching the project — give it longer
    await sleep(4000)
    rect = await canvasAt()
  }
  if (!rect) {
    const sample = await evalJs(`(document.body.innerText || '').slice(0, 260).replace(/\\n+/g, ' | ')`)
    console.log('  page was: ' + sample)
  }
  check('the design canvas is on screen', !!rect && rect.w > 100, JSON.stringify(rect))

  if (rect) {
    const before = await zoomPct()
    check('the canvas reports a zoom level', before !== null, String(before))

    // a real, browser-native wheel event over the canvas centre
    for (let i = 0; i < 3; i++) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseWheel', x: rect.x, y: rect.y, deltaX: 0, deltaY: -240, modifiers: 0,
      })
      await sleep(250)
    }
    const afterIn = await zoomPct()
    check('scrolling the wheel zooms the drawing in',
      afterIn !== null && before !== null && afterIn > before,
      `${before}% -> ${afterIn}%`)

    for (let i = 0; i < 5; i++) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseWheel', x: rect.x, y: rect.y, deltaX: 0, deltaY: 240, modifiers: 0,
      })
      await sleep(250)
    }
    const afterOut = await zoomPct()
    check('scrolling the other way zooms back out',
      afterOut !== null && afterIn !== null && afterOut < afterIn,
      `${afterIn}% -> ${afterOut}%`)

    // the on-canvas slider must move the scale, not just slide the drawing
    const slider = await evalJs(`(() => {
      const inputs = [...document.querySelectorAll('input[type=range]')]
      const el = inputs.find(i => /زوم/.test((i.parentElement || {}).textContent || ''))
      if (!el) return null
      window.__sl = el
      return { min: el.min, max: el.max, value: el.value }
    })()`)
    check('the zoom slider is present and bounded', !!slider, JSON.stringify(slider))

    if (slider) {
      await evalJs(`(() => {
        const el = window.__sl
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(el, String(Math.min(Number(el.max), Number(el.value) + 22)))
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        return el.value
      })()`)
      await sleep(600)
      const afterSlider = await zoomPct()
      check('dragging the slider changes the zoom level',
        afterSlider !== null && afterOut !== null && afterSlider > afterOut,
        `${afterOut}% -> ${afterSlider}%`)
    }

    // the picture itself must differ, not just the numbers
    const shot = async () => (await send('Page.captureScreenshot', { format: 'png' })).data
    const a = await shot()
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: rect.x, y: rect.y, deltaX: 0, deltaY: -240, modifiers: 0 })
    await sleep(500)
    const b = await shot()
    check('the rendered drawing actually changes', a !== b && a.length > 1000 && b.length > 1000,
      `png ${a.length} -> ${b.length} bytes`)
  }

  // ── the جاده‌ها tab is gone from the phase navigation ──
  // Scoped to the header, while the design workspace is still open.
  {
    const labels = ['جانمایی', 'جاده‌ها', 'زون‌بندی', 'ورست‌کیس', 'طراحی', 'مبانی و اعتبارسنجی', 'خروجی']
    const nav = await evalJs(`(() => {
      const header = document.querySelector('header')
      const buttons = [...(header ? header.querySelectorAll('button') : [])]
      const texts = buttons.map(b => (b.textContent || '').replace(/\\\\s+/g, ''))
      const labels = ${JSON.stringify(labels)}
      const tabs = texts.filter(t => labels.some(l => t.endsWith(l)))
      return {
        onDesign: !!header,
        tabs,
        hasRoads: tabs.some(t => t.endsWith('جاده‌ها')),
        hasBasis: tabs.some(t => t.endsWith('مبانی و اعتبارسنجی')),
        // The old icon is gone too, so nothing renders a roads tab at all.
        roadsIcon: texts.filter(t => t.includes('🛣️')).length,
      }
    })()`)
    check('the design workspace header is on screen for the tab check',
      nav.onDesign === true, JSON.stringify(nav))
    check('the جاده‌ها tab is gone from the phase navigation',
      nav.hasRoads === false && nav.roadsIcon === 0, JSON.stringify(nav))
    check('the design basis & validation phase has been removed', nav.hasBasis === false, JSON.stringify(nav.tabs))
    check('the five phases are all present', nav.tabs.length === 5, JSON.stringify(nav.tabs))
  }

  // ── the §4.1 output matrix must reach the live output screen ────
  // The phase tabs live inside the workspace header; the label carries an emoji,
  // so match the way the tab check above does — strip whitespace, compare the tail.
  {
    const clicked = await evalJs(`(() => {
      const header = document.querySelector('header')
      const btns = [...(header ? header.querySelectorAll('button') : [])]
      const out = btns.find(b => (b.textContent || '').replace(/\\s+/g, '').endsWith('خروجی'))
      if (out) out.click()
      return !!out
    })()`)
    await sleep(2000)
    // The خروجی phase renders the export panel; the full design report — which
    // carries the §4.1 matrix — opens from the button inside it.
    const opened = await evalJs(`(() => {
      const b = [...document.querySelectorAll('button')].find(
        x => (x.textContent || '').includes('نمایش خروجی طراحی'))
      if (b) b.click()
      return !!b
    })()`)
    await sleep(2500)

    const specSection = await evalJs(`(() => {
      const t = document.body.innerText || ''
      const ids = ['OUT-001','OUT-003','OUT-007','OUT-012','OUT-014','OUT-017','OUT-018','OUT-020']
      return {
        clicked: ${(clicked && opened) ? 'true' : 'false'},
        section: t.includes('خروجی موتور محاسبات استاندارد'),
        profile: /پروفایل/.test(t) && /NFPA 11/.test(t) && /NFPA 30/.test(t),
        outputsFound: ids.filter(i => t.includes(i)),
        hasFormulas: /GEOM-001|FOAM-001|PUMP-004/.test(t),
        // IN-008 unstated on the project's tank: the engine stops rather than
        // printing a §3.1 chamber count nobody asked for, so the report must name
        // the blocking input. Either state is a pass; silently inventing one is not.
        namesMissingInput: /IN-008/.test(t) && /نوع سقف/.test(t),
        hasRefs: /T3\\.1|T3\\.10/.test(t),
        hasDocRef: t.includes('ENGINE-SPEC-v1.2.docx'),
        rules: t.includes('§17'),
      }
    })()`)

    check('the output phase opens from the live workspace',
      !!specSection && specSection.clicked === true, JSON.stringify(specSection))
    check('the live report carries the specification output section',
      !!specSection && specSection.section === true)
    check('the live report names the source document',
      !!specSection && specSection.hasDocRef === true)
    check('the live report shows the locked standards profile',
      !!specSection && specSection.profile === true)
    check('the live report shows numbered §4.1 outputs',
      !!specSection && specSection.outputsFound.length >= 5,
      JSON.stringify(specSection && specSection.outputsFound))
    check('the live report shows formula ids, or names the input blocking them (§17 rule 14)',
      !!specSection && (specSection.hasFormulas === true || specSection.namesMissingInput === true),
      `formulas=${specSection && specSection.hasFormulas} missingInput=${specSection && specSection.namesMissingInput}`)
    check('the live report shows reference table ids',
      !!specSection && specSection.hasRefs === true)
    check('the live report carries the §17 rules',
      !!specSection && specSection.rules === true)

    // Close the report so the workspace is back where the next block expects it.
    const closed = await evalJs(`(() => {
      const x = document.querySelector('button[aria-label="بستن گزارش"]')
      if (!x) return false
      x.click()
      return true
    })()`)
    await sleep(1200)
    // Return to the design phase, where the next block expects the toolbar.
    const back = await evalJs(`(() => {
      const d = [...document.querySelectorAll('button')].find(
        b => (b.textContent || '').replace(/\\s+/g, '').endsWith('طراحی') && b.getBoundingClientRect().height > 0)
      if (d) d.click()
      return !!d
    })()`)
    await sleep(1800)
    const usable = await evalJs(`!!document.querySelector('button[title="اندازه و جانمایی آیتم‌های گره"]')`)
    check('the report closes and the design phase is usable again',
      closed === true && back === true && usable === true,
      JSON.stringify({ closed, back, usable }))
  }

  // ── the node-fitting look: size + placement must be adjustable ──
  {
    const opened = await evalJs(`(() => {
      const b = document.querySelector('button[title="اندازه و جانمایی آیتم‌های گره"]')
      if (!b) return null
      b.click()
      return true
    })()`)
    check('the fitting-settings button is on the toolbar', opened === true)

    await sleep(600)
    const panel = await evalJs(`(() => {
      const t = document.body.innerText || ''
      const box = [...document.querySelectorAll('div')].find(
        d => (d.textContent || '').includes('اندازه آیتم‌ها') && getComputedStyle(d).position === 'absolute')
      const inputs = box ? [...box.querySelectorAll('input[type=range]')] : []
      window.__panel = box
      return {
        hasSize: t.includes('اندازه آیتم‌ها'),
        hasSpread: t.includes('جانمایی'),
        thumbs: inputs.map(i => Number(i.value)),
        stepped: inputs.map(i => Number(i.step)),
        bounded: inputs.map(i => [Number(i.min), Number(i.max)]),
      }
    })()`)
    check('the panel offers both settings', !!panel && panel.hasSize && panel.hasSpread,
      JSON.stringify(panel))
    check('both settings have a slider', !!panel && panel.thumbs.length === 2,
      JSON.stringify(panel && panel.thumbs))
    check('the sliders are bounded and stepped',
      !!panel && panel.bounded.every(b => b[1] > b[0]) && panel.stepped.every(s => s > 0),
      JSON.stringify({ bounded: panel && panel.bounded, stepped: panel && panel.stepped }))

    const atDesktop = await evalJs(`(() => {
      const vw = window.innerWidth
      const box = window.__panel
      const r = box && box.getBoundingClientRect()
      return r ? { vw, left: Math.round(r.left), right: Math.round(r.right), inside: r.left >= 0 && r.right <= vw } : null
    })()`)
    check('the settings panel is fully on screen on the desktop too',
      !!atDesktop && atDesktop.inside, JSON.stringify(atDesktop))

    if (panel && panel.thumbs.length === 2) {
      const shot = async () => (await send('Page.captureScreenshot', { format: 'png' })).data
      const before = await shot()

      // Real key events on the focused size slider, whatever way RTL maps the
      // arrow, then a plain value set to a known extreme for the drawing check.
      const setValue = (index, v) => evalJs(`(() => {
        const el = window.__panel.querySelectorAll('input[type=range]')[${index}]
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        set.call(el, String(${v}))
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        return Number(el.value)
      })()`)

      await evalJs(`window.__panel.querySelectorAll('input[type=range]')[0].focus()`)
      for (let i = 0; i < 3; i++) {
        for (const type of ['rawKeyDown', 'keyUp']) {
          await send('Input.dispatchKeyEvent', {
            type, key: 'ArrowRight', code: 'ArrowRight',
            windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39,
          })
        }
        await sleep(200)
      }
      await sleep(500)
      const typed = await evalJs(`Number(window.__panel.querySelectorAll('input[type=range]')[0].value)`)
      const step = Number(panel.stepped[0])
      check('arrow keys move the size slider by its step',
        Math.abs(Math.abs(typed - panel.thumbs[0]) - 3 * step) < 1e-9,
        `${panel.thumbs[0]} -> ${typed}, step ${step}`)

      const storedAfterKeys = await evalJs(`(() => {
        const k = Object.keys(localStorage).find(k => k.startsWith('atlas.nodeStyle.'))
        return k ? JSON.parse(localStorage.getItem(k)) : null
      })()`)
      check('a keyboard change is remembered for the project',
        !!storedAfterKeys && Math.abs(storedAfterKeys.size - typed) < 1e-9,
        JSON.stringify(storedAfterKeys))

      await setValue(0, 1.5)
      await setValue(1, 2)
      await sleep(700)
      const stored = await evalJs(`(() => {
        const k = Object.keys(localStorage).find(k => k.startsWith('atlas.nodeStyle.'))
        return k ? { key: k, value: localStorage.getItem(k) } : null
      })()`)
      check('both settings are saved for the project',
        !!stored && /"size":1\.5/.test(stored.value) && /"spread":2/.test(stored.value),
        JSON.stringify(stored))

      const after = await shot()
      check('changing the settings actually redraws the drawing',
        before !== after && before.length > 1000 && after.length > 1000,
        `png ${before.length} -> ${after.length} bytes`)

      // The canvas opens on phones, so the new controls have to fit at 390 px.
      // Emulate first and *reload*, because that is the path a phone actually
      // takes — resizing a desktop-load page leaves the header wrapped in a
      // different (and unrepresentative) configuration.
      await send('Emulation.setDeviceMetricsOverride', {
        width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
      })
      await send('Page.navigate', { url: BASE + '/?guest=1' })
      await sleep(4500)
      await clickText('ورود به برنامه')
      await sleep(4500)
      const phoneCard = await evalJs(`(() => {
        const el = document.querySelector('div.group.cursor-pointer')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })()`)
      if (phoneCard) {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: phoneCard.x, y: phoneCard.y, button: 'left', clickCount: 1 })
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: phoneCard.x, y: phoneCard.y, button: 'left', clickCount: 1 })
      }
      await sleep(6000)
      await evalJs(`document.querySelector('button[title="اندازه و جانمایی آیتم‌های گره"]')?.click()`)
      await sleep(900)

      const mobile = await evalJs(`(() => {
        const vw = window.innerWidth
        const btn = document.querySelector('button[title="اندازه و جانمایی آیتم‌های گره"]')
        const panel = [...document.querySelectorAll('div')].find(
          d => (d.textContent || '').includes('اندازه آیتم‌ها') && getComputedStyle(d).position === 'absolute')
        const r = panel && panel.getBoundingClientRect()
        const b = btn && btn.getBoundingClientRect()
        return {
          vw,
          buttonVisible: !!b && b.left >= 0 && b.right <= vw && b.width > 0,
          panelLeft: r ? Math.round(r.left) : null,
          panelRight: r ? Math.round(r.right) : null,
          inside: !!r && r.left >= 0 && r.right <= vw,
          thumbs: panel ? panel.querySelectorAll('input[type=range]').length : 0,
        }
      })()`)
      check('the settings button stays reachable on a 390 px phone',
        !!mobile && mobile.buttonVisible, JSON.stringify(mobile))
      check('the settings panel fits inside a phone screen',
        !!mobile && mobile.inside && mobile.thumbs === 2, JSON.stringify(mobile))
      await send('Emulation.clearDeviceMetricsOverride')
      await sleep(300)
      await send('Page.navigate', { url: BASE + '/?guest=1' })
      await sleep(4000)
    }
  }

  // A reload must not fall back to the login form. The stored record is
  // { username, name, role }; requiring a `verified` flag that is never written
  // made `role` stay null, so every reload showed the sign-in screen again.
  await send('Page.navigate', { url: BASE + '/' })
  await sleep(4500)
  const restored = await evalJs(`(() => {
    const t = document.body.innerText || ''
    return {
      loginForm: !!document.querySelector('input[type=password]'),
      hasEnterButton: t.includes('ورود به برنامه'),
    }
  })()`)
  check('reloading the app does not drop back to the login form',
    !!restored && !restored.loginForm, JSON.stringify(restored))
  check('the restored session lands on the app, not the gate',
    !!restored && restored.hasEnterButton, JSON.stringify(restored))

  // The design canvas must fetch the fitting renders from the same build it is
  // running — a versioned name means a stale CDN entry cannot satisfy them.
  const iconUrls = [...new Set(iconResponses.map(r => r.url))]
  check('the live app requests the node-fitting renders', iconUrls.length >= 9,
    `n=${iconUrls.length}`)
  check('every fitting render comes back 200',
    iconResponses.length > 0 && iconResponses.every(r => r.status === 200),
    JSON.stringify(iconResponses.filter(r => r.status !== 200).slice(0, 3)))
  check('the renders are versioned, so an immutable cached entry cannot masquerade',
    iconUrls.every(u => /_v\d+\.png/.test(u)), iconUrls[0] || 'none')

  check('the app ran without uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '))

  console.log(`\n==== ${pass}/${pass + fail} passed ====`)
  if (fail) process.exitCode = 1
  ws.close()
}

main().catch(e => { console.error('ERROR', e && e.stack); process.exit(1) })
