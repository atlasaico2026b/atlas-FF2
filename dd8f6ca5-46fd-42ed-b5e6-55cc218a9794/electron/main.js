// SPDX-License-Identifier: Apache-2.0
// ATLAS — Electron main process.
//
// The API + static file server runs *inside this process* (no spawned
// runtime, no bundled `bun.exe`), so the desktop build has no external
// executable to locate and cannot fail with ENOENT.

const { app, BrowserWindow, Menu, dialog, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { startServer } = require('./server.cjs')

const isDev = process.env.NODE_ENV === 'development'

const PROD_FALLBACK = '<html><head><meta charset="utf-8"><title>ATLAS</title></head>' +
  '<body style="font-family:Tahoma,Arial,sans-serif;padding:40px;direction:rtl">' +
  '<h2>فایل‌های برنامه یافت نشد</h2>' +
  '<p>پوشه‌ی <code>dist</code> همراه نصب موجود نیست. نصب را دوباره انجام دهید.</p>' +
  '</body></html>'

function resolveDistDir() {
  const candidates = [
    path.join(process.resourcesPath || '', 'dist'),
    path.join(process.resourcesPath || '', 'app', 'dist'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'dist'),
    path.join(__dirname, 'dist'),
    path.join(__dirname, '..', 'dist'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(path.join(candidate, 'index.html'))) return candidate
    } catch {
      /* keep looking */
    }
  }
  return null
}

async function boot() {
  if (isDev) {
    createWindow('http://localhost:5173', true)
    return
  }

  const distDir = resolveDistDir()
  if (!distDir) {
    dialog.showErrorBox('ATLAS', 'فایل‌های رابط کاربری (dist) پیدا نشد. لطفاً برنامه را دوباره نصب کنید.')
    createWindow(null, false, PROD_FALLBACK)
    return
  }

  let started
  try {
    started = await startServer({
      distDir,
      dataDir: path.join(app.getPath('userData'), 'data'),
      port: 0,
    })
  } catch (err) {
    dialog.showErrorBox('ATLAS', `راه‌اندازی سرور داخلی ناموفق بود:\n${err && err.message ? err.message : err}`)
    createWindow(null, false, PROD_FALLBACK)
    return
  }

  createWindow(`http://127.0.0.1:${started.port}/`, false)
}

function createWindow(targetUrl, devTools, fallbackHtml) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'اطلس — طراحی سیستم‌های ایمنی و آتش‌نشانی',
    icon: path.join(__dirname, '..', 'public', 'icons', 'icon-192.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    backgroundColor: '#f0f9ff',
    show: false,
  })

  win.setMenu(null)
  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (fallbackHtml) win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fallbackHtml)}`)
  else win.loadURL(targetUrl)

  if (devTools) win.webContents.openDevTools()
  return win
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  boot().catch((err) => {
    dialog.showErrorBox('ATLAS', `خطای غیرمنتظره در راه‌اندازی:\n${err && err.message ? err.message : err}`)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) boot()
})
