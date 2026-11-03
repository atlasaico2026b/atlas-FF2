// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react'
import {
  Download, Upload, RefreshCw, Shield, Check, AlertTriangle,
  ExternalLink, Clock, FileCode, Lock, Unlock
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'

interface AppVersion {
  version: string
  date: string
  changes: string[]
  downloadUrl: string
  isLatest: boolean
}

const VERSION_HISTORY: AppVersion[] = [
  {
    version: '2.1.0',
    date: '1405/06/10',
    changes: [
      'افزودن ماشین حساب فوم NFPA 11',
      'پشتیبانی از 10 نوع هیدروکربن',
      'بهبود رابط کاربری زون‌بندی',
      'اضافه شدن فرمول Hazen-Williams',
    ],
    downloadUrl: '#',
    isLatest: true,
  },
  {
    version: '2.0.0',
    date: '1405/05/15',
    changes: [
      'بازنویسی کامل موتور محاسبات',
      'پشتیبانی از NFPA 15 (کولینگ)',
      'پشتیبانی از NFPA 20 (پمپ آتش‌نشانی)',
      'طراحی خودکار رینگ آب',
    ],
    downloadUrl: '#',
    isLatest: false,
  },
  {
    version: '1.5.0',
    date: '1405/04/20',
    changes: [
      'بهبود سیستم چک‌لیست',
      'قابلیت کپی و حذف آیتم‌ها',
      'ابعاد واقعی تجهیزات',
    ],
    downloadUrl: '#',
    isLatest: false,
  },
]

interface UpdateManagerProps {
  onClose?: () => void
}

export default function UpdateManager({ onClose }: UpdateManagerProps) {
  const [checkUpdate, setCheckUpdate] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installSuccess, setInstallSuccess] = useState(false)
  const [developerMode, setDeveloperMode] = useState(false)
  const [devCode, setDevCode] = useState('')

  const handleCheckUpdate = () => {
    setCheckUpdate(true)
    setTimeout(() => {
      setUpdateAvailable(true)
      setCheckUpdate(false)
    }, 1500)
  }

  const handleInstall = () => {
    setInstalling(true)
    setTimeout(() => {
      setInstalling(false)
      setInstallSuccess(true)
    }, 3000)
  }

  const handleDevUnlock = () => {
    if (devCode === 'ATLAS-DEV-2026') {
      setDeveloperMode(true)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-16 h-16 mx-auto bg-gradient-to-br from-sky-400 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
          <span className="text-3xl">🔥</span>
        </div>
        <h2 className="text-xl font-bold text-gray-700">آپدیت و مدیریت نسخه</h2>
        <p className="text-sm text-gray-400">ATLAS Fire Protection Design Software</p>
      </div>

      {/* Current Version */}
      <div className="p-4 bg-gradient-to-r from-sky-50 to-blue-50 rounded-2xl border border-sky-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-bold text-gray-700">نسخه فعلی</Label>
              <Badge className="bg-sky-500 text-white text-[10px]">v2.1.0</Badge>
            </div>
            <p className="text-xs text-gray-400 mt-1">آخرین به‌روزرسانی: 1405/06/10</p>
          </div>
          <Button
            onClick={handleCheckUpdate}
            disabled={checkUpdate}
            className="bg-gradient-to-r from-sky-500 to-blue-500 text-white"
          >
            {checkUpdate ? (
              <>
                <RefreshCw className="w-4 h-4 ml-2 animate-spin" />
                در حال بررسی...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 ml-2" />
                بررسی آپدیت
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Update Available */}
      {updateAvailable && (
        <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Label className="text-sm font-bold text-gray-700">نسخه جدید موجود است!</Label>
                <Badge className="bg-amber-500 text-white text-[10px]">v2.2.0</Badge>
              </div>
              <ul className="text-xs text-gray-500 space-y-0.5 mb-3">
                <li>• بهبود محاسبات فوم شناور</li>
                <li>• اضافه شدن حالت شبیه‌سازی</li>
                <li>• رفع باگ‌های گزارش شده</li>
              </ul>
              <div className="flex gap-2">
                <Button
                  onClick={handleInstall}
                  disabled={installing}
                  size="sm"
                  className="bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  {installing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 ml-1 animate-spin" />
                      در حال نصب...
                    </>
                  ) : installSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 ml-1" />
                      نصب شد ✓
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 ml-1" />
                      نصب آپدیت
                    </>
                  )}
                </Button>
                <Button variant="outline" size="sm">
                  <ExternalLink className="w-3.5 h-3.5 ml-1" />
                  دانلود فایل نصبی
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Separator />

      {/* Download Links */}
      <div className="space-y-3">
        <Label className="text-sm font-bold text-gray-700">دانلود فایل‌های نصبی</Label>
        <div className="grid grid-cols-2 gap-3">
          <DownloadCard
            platform="Windows"
            icon="🪟"
            version="v2.1.0"
            size="~180 MB"
            url="/api/download/win"
          />
          <DownloadCard
            platform="macOS"
            icon="🍎"
            version="v2.1.0"
            size="~190 MB"
            url="/api/download/mac"
          />
          <DownloadCard
            platform="Android"
            icon="📱"
            version="v2.1.0"
            size="~25 MB"
            url="/api/download/android"
          />
          <DownloadCard
            platform="Web App"
            icon="🌐"
            version="v2.1.0"
            size="آنلاین"
            url={window.location.href}
          />
        </div>
      </div>

      <Separator />

      {/* Version History */}
      <div className="space-y-3">
        <Label className="text-sm font-bold text-gray-700">تاریخچه نسخه‌ها</Label>
        <div className="space-y-2">
          {VERSION_HISTORY.map((ver) => (
            <div key={ver.version} className="p-3 bg-white/50 rounded-xl border border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-700">v{ver.version}</span>
                  {ver.isLatest && <Badge className="bg-emerald-500 text-white text-[9px]">آخرین</Badge>}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                  <Clock className="w-3 h-3" />
                  {ver.date}
                </div>
              </div>
              <ul className="text-[11px] text-gray-500 space-y-0.5">
                {ver.changes.map((change, i) => (
                  <li key={i}>• {change}</li>
                ))}
              </ul>
              {!ver.isLatest && (
                <Button variant="outline" size="sm" className="mt-2 h-7 text-[10px]">
                  <Download className="w-3 h-3 ml-1" />
                  دانلود
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Developer Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {developerMode ? <Unlock className="w-4 h-4 text-emerald-500" /> : <Lock className="w-4 h-4 text-gray-400" />}
            <Label className="text-sm font-bold text-gray-700">بخش توسعه‌دهنده</Label>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {developerMode ? 'فعال' : 'قفل'}
          </Badge>
        </div>

        {!developerMode ? (
          <div className="flex gap-2">
            <Input
              value={devCode}
              onChange={(e) => setDevCode(e.target.value)}
              placeholder="کد توسعه‌دهنده"
              className="h-9 text-sm"
            />
            <Button onClick={handleDevUnlock} variant="outline" size="sm" className="h-9">
              <Shield className="w-4 h-4 ml-1" />
              فعال‌سازی
            </Button>
          </div>
        ) : (
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
            <p className="text-xs text-emerald-600">
              ✅ حالت توسعه‌دهنده فعال است — فقط شما قابلیت تغییر کدهای مرجع را دارید.
            </p>
            <div className="space-y-1.5 text-[11px] text-gray-600">
              <div className="flex items-center gap-2">
                <FileCode className="w-3.5 h-3.5 text-emerald-500" />
                <span>ویرایش فرمول‌های محاسباتی</span>
              </div>
              <div className="flex items-center gap-2">
                <FileCode className="w-3.5 h-3.5 text-emerald-500" />
                <span>تغییر استانداردها و پارامترها</span>
              </div>
              <div className="flex items-center gap-2">
                <FileCode className="w-3.5 h-3.5 text-emerald-500" />
                <span>انتشار نسخه جدید</span>
              </div>
            </div>
            <Button size="sm" className="bg-emerald-500 text-white w-full h-8 text-[11px]">
              <Upload className="w-3.5 h-3.5 ml-1" />
              انتشار آپدیت جدید
            </Button>
          </div>
        )}
      </div>

      {/* Security Notice */}
      <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
        <p className="text-[10px] text-gray-500 leading-relaxed">
          🔒 فایل‌های نصبی توسط توسعه‌دهنده اصلی امضا شده‌اند. شخص ثالث فقط می‌تواند از طریق بخش آپدیت،
          تغییرات اعمال شده توسط توسعه‌دهنده را دریافت و نصب کند. کدهای مرجع قابل ویرایش توسط شخص ثالث نیستند.
        </p>
      </div>
    </div>
  )
}

function DownloadCard({ platform, icon, version, size, url }: {
  platform: string; icon: string; version: string; size: string; url: string
}) {
  return (
    <div className="p-3 bg-white/50 rounded-xl border border-gray-100 hover:border-sky-200 transition">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <div>
          <div className="text-xs font-bold text-gray-700">{platform}</div>
          <div className="text-[10px] text-gray-400">{version} • {size}</div>
        </div>
      </div>
      <Button variant="outline" size="sm" className="w-full h-7 text-[10px]">
        <Download className="w-3 h-3 ml-1" />
        دانلود
      </Button>
    </div>
  )
}
