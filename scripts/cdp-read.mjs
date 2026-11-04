// Reads the in-page check output over CDP. Avoids --dump-dom, which never
// settles because the canvas keeps repainting.
const PORT = process.env.CDP_PORT || '9333'
const URL_TO_OPEN = process.argv[2]

async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  return res.json()
}

async function main() {
  if (!URL_TO_OPEN) throw new Error('usage: node cdp-read.mjs <url>')
  let list = []
  for (let i = 0; i < 40; i++) {
    try { list = await targets(); if (list.some(t => t.type === 'page')) break } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  const page = list.find(t => t.type === 'page')
  if (!page) throw new Error('no page target')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
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
  await send('Page.navigate', { url: URL_TO_OPEN })

  // the page writes its verdict into #results and the title when it finishes
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 250))
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.getElementById('results')
        const title = document.title
        return { text: el ? el.textContent : null, title }
      })()`,
      returnByValue: true,
    })
    const val = r.result?.value
    if (val && val.text) { console.log(val.text); ws.close(); return }
    if (val && val.title === 'FAIL') { console.log(val.text || '(no output)'); ws.close(); return }
  }
  console.log('TIMEOUT: the page never produced results')
  ws.close()
  process.exit(1)
}

main().catch(e => { console.error('ERROR', e.message); process.exit(1) })
