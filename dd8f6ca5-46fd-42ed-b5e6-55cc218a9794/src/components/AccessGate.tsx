// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Shogo Technologies, Inc.
import { useState, useEffect } from 'react'
import { Lock, Eye, EyeOff, Mail, User, ArrowLeft } from 'lucide-react'

type AuthMode = 'login' | 'register'
export type UserRole = 'admin' | 'user' | null

interface AccessGateProps {
  onAuthenticated: (role: UserRole) => void
}

const ADMIN_PASSWORD = 'ATLAS2026'
const STORAGE_KEY = 'atlas_user'
const USERS_KEY = 'atlas_users'

interface StoredUser {
  username: string
  name: string
  role: 'admin' | 'user'
}

interface RegisteredUser {
  username: string
  name: string
  password: string // btoa encoded
}

/** Usernames are matched case-insensitively: "Sepehr" and "sepehr" are the same account. */
function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

function generateCaptcha(): { a: number; b: number; op: string; answer: number } {
  const ops = ['+', '×', '−']
  const op = ops[Math.floor(Math.random() * ops.length)]
  const a = Math.floor(Math.random() * 12) + 2
  const b = Math.floor(Math.random() * 12) + 2
  let answer: number
  switch (op) {
    case '+': answer = a + b; break
    case '×': answer = a * b; break
    case '−': answer = a - b; break
    default: answer = a + b
  }
  return { a, b, op, answer }
}

export default function AccessGate({ onAuthenticated }: AccessGateProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [regName, setRegName] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const user: StoredUser = JSON.parse(stored)
        if (user.username) onAuthenticated(user.role)
      } catch { /* invalid */ }
    }
  }, [onAuthenticated])

  const getUsers = (): RegisteredUser[] => {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]') } catch { return [] }
  }

  const handleLogin = () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setError('نام کاربری و رمز عبور را وارد کنید')
      return
    }
    if (normalizeUsername(loginUsername) === 'admin' && loginPassword === ADMIN_PASSWORD) {
      const user: StoredUser = { username: 'admin', name: 'مدیر سیستم', role: 'admin' }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
      onAuthenticated('admin')
      return
    }
    const users = getUsers()
    const found = users.find(u => normalizeUsername(u.username) === normalizeUsername(loginUsername))
    if (!found) {
      setError('نام کاربری یافت نشد')
      return
    }
    if (atob(found.password) !== loginPassword) {
      setError('رمز عبور اشتباه است')
      return
    }
    const user: StoredUser = { username: found.username, name: found.name, role: 'user' }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    onAuthenticated('user')
  }

  const handleRegister = () => {
    if (!regName.trim() || !regUsername.trim() || !regPassword.trim()) {
      setError('تمام فیلدها را پر کنید')
      return
    }
    if (regUsername.trim().length < 3) {
      setError('نام کاربری حداقل ۳ کاراکتر باشد')
      return
    }
    if (regPassword.trim().length < 4) {
      setError('رمز عبور حداقل ۴ کاراکتر باشد')
      return
    }
    if (normalizeUsername(regUsername) === 'admin') {
      setError('این نام کاربری محفوظ است')
      return
    }
    const users = getUsers()
    if (users.find(u => normalizeUsername(u.username) === normalizeUsername(regUsername))) {
      setError('نام کاربری قبلاً استفاده شده')
      return
    }
    const newUser: RegisteredUser = { username: regUsername.trim(), name: regName.trim(), password: btoa(regPassword) }
    users.push(newUser)
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
    setSuccess('ثبت‌نام موفق! حالا وارد شوید')
    setError('')
    setMode('login')
    setLoginUsername(regUsername.trim())
    setLoginPassword('')
    setRegName('')
    setRegUsername('')
    setRegPassword('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background bubbles */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-20 w-40 h-40 bg-sky-200/30 rounded-full blur-2xl animate-pulse" />
        <div className="absolute bottom-32 right-32 w-56 h-56 bg-pink-200/25 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/3 w-32 h-32 bg-amber-200/20 rounded-full blur-xl animate-pulse delay-500" />
        <div className="absolute top-1/4 right-1/4 w-24 h-24 bg-emerald-200/20 rounded-full blur-xl animate-pulse delay-700" />
      </div>

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="bg-white/50 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/60 p-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-sky-400 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-white text-2xl font-bold font-btitr">اطلس</span>
            </div>
          </div>

          <h2 className="text-xl font-bold text-center text-gray-700 mb-1 font-btitr">
            اطلس — طراحی سیستم‌های ایمنی
          </h2>
          <p className="text-sm text-center text-gray-400 mb-6 font-bnazanin">
            ورود به برنامه
          </p>

          {/* Mode: Login */}
          {mode === 'login' && (
            <div className="space-y-4">
              {/* Tab switch: Admin / User */}
              <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl">
                <button
                  onClick={() => { setError(''); setSuccess('') }}
                  className="flex-1 py-2 rounded-xl text-sm font-medium bg-white shadow text-gray-700 flex items-center justify-center gap-1.5"
                >
                  <User className="w-4 h-4" />
                  ورود کاربر
                </button>
                <button
                  onClick={() => { setMode('register'); setError(''); setSuccess('') }}
                  className="flex-1 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1.5"
                >
                  <Mail className="w-4 h-4" />
                  ثبت‌نام
                </button>
              </div>

              {/* Username */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">نام کاربری</label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => { setLoginUsername(e.target.value); setError('') }}
                  placeholder="نام کاربری خود را وارد کنید"
                  className="w-full px-4 py-3 bg-white/60 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>

              {/* Password */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">رمز عبور</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => { setLoginPassword(e.target.value); setError('') }}
                    placeholder="رمز عبور"
                    className="w-full px-4 py-3 bg-white/60 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-300 pl-10"
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && <p className="text-red-400 text-sm text-center">{error}</p>}
              {success && <p className="text-emerald-500 text-sm text-center">{success}</p>}

              <button onClick={handleLogin}
                disabled={!loginUsername.trim() || !loginPassword.trim()}
                className="w-full py-3.5 bg-gradient-to-r from-sky-500 to-blue-500 text-white rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                ورود
              </button>

              <p className="text-[10px] text-gray-400 text-center">
                مدیر سیستم: نام کاربری <span className="font-mono font-bold">admin</span>
              </p>
            </div>
          )}

          {/* Mode: Register */}
          {mode === 'register' && (
            <div className="space-y-4">
              <button onClick={() => { setMode('login'); setError(''); setSuccess('') }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
                <ArrowLeft className="w-4 h-4" /> بازگشت به ورود
              </button>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">نام و نام خانوادگی</label>
                <input type="text" value={regName}
                  onChange={(e) => { setRegName(e.target.value); setError('') }}
                  placeholder="نام خود را وارد کنید"
                  className="w-full px-4 py-3 bg-white/60 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">نام کاربری</label>
                <input type="text" value={regUsername}
                  onChange={(e) => { setRegUsername(e.target.value.replace(/\s/g, '')); setError('') }}
                  placeholder="نام کاربری انتخاب کنید"
                  className="w-full px-4 py-3 bg-white/60 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">رمز عبور</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={regPassword}
                    onChange={(e) => { setRegPassword(e.target.value); setError('') }}
                    placeholder="رمز عبور انتخاب کنید"
                    className="w-full px-4 py-3 bg-white/60 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-300 pl-10"
                    onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && <p className="text-red-400 text-sm text-center">{error}</p>}

              <button onClick={handleRegister}
                disabled={!regName.trim() || !regUsername.trim() || !regPassword.trim()}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ثبت‌نام و ورود
              </button>
            </div>
          )}

          <p className="mt-6 text-[10px] text-gray-400 text-center font-bnazanin">
            طراحی و برنامه‌نویسی: سپهر ممبینی
          </p>
        </div>
      </div>
    </div>
  )
}
