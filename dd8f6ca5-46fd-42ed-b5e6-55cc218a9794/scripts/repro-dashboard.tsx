import { renderToString } from 'react-dom/server'
import Dashboard from '../src/components/Dashboard'
import App from '../src/App'

function attempt(label: string, fn: () => string) {
  try {
    const html = fn()
    console.log(`PASS  ${label}  (${html.length} chars)`)
  } catch (err: any) {
    console.log(`FAIL  ${label}`)
    console.log('      ', err?.message)
    console.log('      ', String(err?.stack || '').split('\n').slice(0, 6).join('\n       '))
  }
}

attempt('Dashboard role=user', () =>
  renderToString(<Dashboard onOpenProject={() => {}} onBack={() => {}} role="user" onLogout={() => {}} />),
)

attempt('Dashboard role=admin', () =>
  renderToString(<Dashboard onOpenProject={() => {}} onBack={() => {}} role="admin" onLogout={() => {}} />),
)

attempt('Dashboard no role/onLogout', () =>
  renderToString(<Dashboard onOpenProject={() => {}} onBack={() => {}} />),
)

attempt('App', () => renderToString(<App />))
