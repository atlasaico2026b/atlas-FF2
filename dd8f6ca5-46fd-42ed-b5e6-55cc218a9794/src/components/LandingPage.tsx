// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Shogo Technologies, Inc.
import { Flame, Shield, Droplets, Wind } from 'lucide-react'
import { useLang } from '@/lib/i18n'

interface LandingPageProps {
  onEnter: () => void
}

export default function LandingPage({ onEnter }: LandingPageProps) {
  const { t } = useLang()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background bubbles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-20 left-20 w-32 h-32 bg-sky-200/30 rounded-full blur-xl animate-pulse" />
        <div className="absolute top-40 right-32 w-48 h-48 bg-pink-200/25 rounded-full blur-2xl animate-pulse delay-1000" />
        <div className="absolute bottom-32 left-1/3 w-40 h-40 bg-rose-200/20 rounded-full blur-xl animate-pulse delay-500" />
        <div className="absolute bottom-20 right-20 w-36 h-36 bg-amber-200/25 rounded-full blur-xl animate-pulse delay-700" />
        <div className="absolute top-1/2 left-1/4 w-28 h-28 bg-emerald-200/20 rounded-full blur-lg animate-pulse delay-300" />
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center px-6 max-w-3xl mx-auto">
        {/* Logo / Icon */}
        <div className="mb-8 flex justify-center gap-4">
          <div className="p-4 bg-white/60 backdrop-blur-md rounded-2xl shadow-lg border border-white/50">
            <Flame className="w-10 h-10 text-rose-500" />
          </div>
          <div className="p-4 bg-white/60 backdrop-blur-md rounded-2xl shadow-lg border border-white/50">
            <Shield className="w-10 h-10 text-sky-500" />
          </div>
          <div className="p-4 bg-white/60 backdrop-blur-md rounded-2xl shadow-lg border border-white/50">
            <Droplets className="w-10 h-10 text-blue-500" />
          </div>
          <div className="p-4 bg-white/60 backdrop-blur-md rounded-2xl shadow-lg border border-white/50">
            <Wind className="w-10 h-10 text-emerald-500" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-sky-600 via-rose-500 to-amber-500 bg-clip-text text-transparent">
          {t('app.name')}
        </h1>
        <h2 className="text-2xl font-semibold text-gray-700 mb-6">
          {t('landing.title')}
        </h2>

        {/* Glass card description */}
        <div className="bg-white/40 backdrop-blur-md rounded-3xl p-8 shadow-xl border border-white/50 mb-10">
          <p className="text-gray-600 leading-relaxed text-lg">
            {t('landing.desc')}
          </p>
          <div className="grid grid-cols-3 gap-4 mt-6 text-sm">
            <div className="bg-white/50 rounded-xl p-3">
              <div className="font-bold text-sky-600">NFPA</div>
              <div className="text-gray-500">{t('landing.standards')}</div>
            </div>
            <div className="bg-white/50 rounded-xl p-3">
              <div className="font-bold text-rose-500">{t('landing.ai')}</div>
              <div className="text-gray-500">{t('landing.auto')}</div>
            </div>
            <div className="bg-white/50 rounded-xl p-3">
              <div className="font-bold text-amber-500">{t('landing.opt')}</div>
              <div className="text-gray-500">{t('landing.precise')}</div>
            </div>
          </div>
        </div>

        {/* Enter button */}
        <button
          onClick={onEnter}
          className="px-10 py-4 bg-gradient-to-r from-sky-500 to-blue-500 text-white rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 backdrop-blur-sm"
        >
          {t('landing.enter')}
        </button>

        {/* Designer credit */}
        <p className="mt-8 text-xs text-gray-400">
          {t('landing.credit')}
        </p>
      </div>
    </div>
  )
}
