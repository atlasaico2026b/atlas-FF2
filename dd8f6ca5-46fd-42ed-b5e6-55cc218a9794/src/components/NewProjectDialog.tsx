// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Shogo Technologies, Inc.
import { useState, useRef } from 'react'
import { X, FileText, Upload, Loader2 } from 'lucide-react'

interface NewProjectDialogProps {
  onCreate: (name: string, type: 'blank' | 'upload', dimensions?: { width: number; height: number }, mapImageBase64?: string) => void
  onClose: () => void
}

export default function NewProjectDialog({ onCreate, onClose }: NewProjectDialogProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'blank' | 'upload'>('blank')
  const [width, setWidth] = useState('100')
  const [height, setHeight] = useState('100')
  const [mapPreview, setMapPreview] = useState<string | null>(null)
  const [mapBase64, setMapBase64] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setMapBase64(result)
      setMapPreview(result)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async () => {
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      await onCreate(
        name.trim(),
        type,
        { width: parseFloat(width) || 100, height: parseFloat(height) || 100 },
        type === 'upload' ? (mapBase64 || undefined) : undefined,
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl border border-white/50 w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200/50 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-700">پروژه جدید</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">نام پروژه</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="نام پروژه را وارد کنید..."
              className="w-full px-4 py-3 bg-white/50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-300 text-gray-700"
            />
          </div>

          {/* Type selection */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">نوع پروژه</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setType('blank')}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  type === 'blank'
                    ? 'border-sky-400 bg-sky-50/50 text-sky-600'
                    : 'border-gray-200 bg-white/30 text-gray-500 hover:border-gray-300'
                }`}
              >
                <FileText className="w-8 h-8" />
                <span className="text-sm font-medium">فضای خالی</span>
                <span className="text-xs text-gray-400">Blank Space</span>
              </button>
              <button
                onClick={() => setType('upload')}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  type === 'upload'
                    ? 'border-sky-400 bg-sky-50/50 text-sky-600'
                    : 'border-gray-200 bg-white/30 text-gray-500 hover:border-gray-300'
                }`}
              >
                <Upload className="w-8 h-8" />
                <span className="text-sm font-medium">آپلود فایل نقشه</span>
                <span className="text-xs text-gray-400">Upload Map</span>
              </button>
            </div>
          </div>

          {/* File upload for map */}
          {type === 'upload' && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">فایل نقشه</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-sky-400 hover:text-sky-500 transition-all flex flex-col items-center gap-2"
              >
                {mapPreview ? (
                  <div className="w-full">
                    <img src={mapPreview} alt="پیش‌نمایش نقشه" className="max-h-40 mx-auto rounded-lg object-contain" />
                    <p className="text-xs text-sky-500 mt-2">نقشه بارگذاری شد ✓</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8" />
                    <span className="text-sm">کلیک کنید یا فایل را بکشید</span>
                    <span className="text-xs text-gray-400">PNG, JPG, PDF</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Dimensions for blank space */}
          {type === 'blank' && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">ابعاد صفحه (متر)</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">طول</label>
                  <input
                    type="number"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    className="w-full px-4 py-3 bg-white/50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-300 text-gray-700"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">عرض</label>
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    className="w-full px-4 py-3 bg-white/50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-300 text-gray-700"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={creating}
            className="px-5 py-2.5 text-gray-500 hover:bg-gray-100 rounded-xl transition"
          >
            انصراف
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || creating}
            className="px-6 py-2.5 bg-gradient-to-r from-sky-500 to-blue-500 text-white rounded-xl font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                در حال ایجاد...
              </>
            ) : (
              'ایجاد پروژه'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
