// Boots a URL in the debug browser and reports console errors / page errors.
const PORT = process.env.CDP_PORT || '9333'
const URL_TO_OPEN = process.argv[2]

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = list.find(t => t.type === 'page')
  if (!page) throw new Error('no page target')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const problems = []
  const logs = []
  const reqs = new Map()

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
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      problems.push('console.error: ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' '))
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      problems.push('pageerror: ' + (d.exception?.description || d.text))
    }
    if (msg.method === 'Network.requestWillBeSent') {
      reqs.set(msg.params.requestId, msg.params.request.url)
    }
    if (msg.method === 'Network.loadingFailed') {
      const u = reqs.get(msg.params.requestId) || '(unknown)'
      logs.push('failed: ' + (msg.params.errorText || '') + '  <- ' + u)
    }
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Page.navigate', { url: URL_TO_OPEN })
  await new Promise(r => setTimeout(r, 9000))

  const probe = await send('Runtime.evaluate', {
    expression: `(() => {
      const root = document.getElementById('root')
      const text = (document.body.innerText || '').slice(0, 400)
      return {
        mounted: !!(root && root.children.length),
        bodyChars: (document.body.innerText || '').length,
        title: document.title,
        sample: text.replace(/\\n+/g, ' | '),
        canvases: document.querySelectorAll('canvas').length,
      }
    })()`,
    returnByValue: true,
  })

  console.log('--- page ---')
  console.log(JSON.stringify(probe.result.value, null, 2))
  console.log('--- problems (' + problems.length + ') ---')
  for (const p of problems) console.log(p)
  console.log('--- failed requests (' + logs.length + ') ---')
  for (const l of logs.slice(0, 10)) console.log(l)
  ws.close()
}

main().catch(e => { console.error('ERROR', e.message); process.exit(1) })
