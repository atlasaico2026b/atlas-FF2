// Evaluate a snippet in the debug browser after navigating, and print the result.
// usage: node scripts/probe.mjs <url> <js-expression> [waitMs]
const PORT = process.env.CDP_PORT || '9333'
const [URL_TO_OPEN, EXPR, WAIT = '4000'] = process.argv.slice(2)

async function main() {
  let target
  for (let i = 0; i < 40 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find(t => t.type === 'page')
    } catch { /* booting */ }
    if (!target) await new Promise(r => setTimeout(r, 250))
  }
  if (!target) throw new Error('no page target')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
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
    }
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: URL_TO_OPEN })
  await new Promise(r => setTimeout(r, Number(WAIT)))
  const r = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: true })
  console.log(JSON.stringify(r.result?.value, null, 2))
  if (r.exceptionDetails) console.log('EXC', r.exceptionDetails.exception?.description)
  ws.close()
}

main().catch(e => { console.error('ERROR', e.message); process.exit(1) })
