// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Shogo Technologies, Inc.
import { X, Printer, Download } from 'lucide-react'
import type { Standard } from '../lib/standards-data'

interface StandardsViewerProps {
  standard: Standard
  onClose: () => void
}

export default function StandardsViewer({ standard, onClose }: StandardsViewerProps) {
  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${standard.name} - ${standard.fullName}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.8; }
              h1 { color: #0284c7; border-bottom: 2px solid #0284c7; padding-bottom: 10px; }
              h2 { color: #334155; margin-top: 24px; }
              pre { white-space: pre-wrap; word-wrap: break-word; }
            </style>
          </head>
          <body>
            <h1>${standard.name}</h1>
            <p><strong>${standard.fullName}</strong></p>
            <pre>${standard.content}</pre>
          </body>
        </html>
      `)
      printWindow.document.close()
      printWindow.print()
    }
  }

  const handleDownload = () => {
    const blob = new Blob([standard.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${standard.name}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl border border-white/50 w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200/50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-sky-600">{standard.name}</h2>
            <p className="text-sm text-gray-500">{standard.fullName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 hover:bg-gray-100 rounded-xl transition"
              title="چاپ"
            >
              <Printer className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={handleDownload}
              className="p-2 hover:bg-gray-100 rounded-xl transition"
              title="دانلود"
            >
              <Download className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-xl transition"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          <pre className="whitespace-pre-wrap text-gray-700 leading-relaxed text-sm font-[inherit]">
            {standard.content}
          </pre>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200/50 text-center">
          <span className="text-xs text-gray-400">دسته‌بندی: {standard.category}</span>
        </div>
      </div>
    </div>
  )
}
