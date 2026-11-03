// Screenshot a page over CDP and write the PNG to disk.
// usage: node scripts/shot.mjs <url> <out.png> [waitMs] [width] [height]
const PORT = process.env.CDP_PORT || '9333'
const [URL_TO_OPEN, OUT, WAIT = '2500', W = '1200', H = '2100'] = process.argv.slice(2)
import { writeFileSync } from 'node:fs'

async function main() {
  let page = null
  for (let i = 0; i < 40 && !page; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      page = list.find(t => t.type === 'page')
    } catch { /* browser still starting */ }
    if (!page) await new Promise(r => setTimeout(r, 250))
  }
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(W), height: Number(H), deviceScaleFactor: 1, mobile: false,
  })
  await send('Page.navigate', { url: URL_TO_OPEN })
  await new Promise(r => setTimeout(r, Number(WAIT)))

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log('wrote', OUT)
  ws.close()
}

main().catch(e => { console.error('ERROR', e.message); process.exit(1) })
