// SPDX-License-Identifier: Apache-2.0
import { Eye, EyeOff, Lock, Info, Map } from 'lucide-react'
import type { LayerConfig } from './DesignWorkspace'

interface LayerPanelProps {
  layers: LayerConfig[]
  activeLayer: number
  onLayerChange: (id: number) => void
  onToggleLayer: (id: number) => void
}

export default function LayerPanel({ layers, activeLayer, onLayerChange, onToggleLayer }: LayerPanelProps) {
  const baseLayer = layers.find(l => l.id === 0)
  const infoLayer = layers.find(l => l.id === -2)
  const otherLayers = layers.filter(l => l.id !== 0 && l.id !== -2)

  return (
    <div className="absolute top-16 right-3 z-20 w-56 bg-white/90 backdrop-blur-md rounded-xl shadow-lg border border-gray-200/60 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200/50 bg-gray-50/50 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-sky-400" />
        <span className="text-xs font-bold text-gray-600">لایه‌ها</span>
      </div>

      <div className="p-1.5 space-y-0.5 max-h-80 overflow-y-auto">
        {/* Base Layer — Map / Background — Always visible, locked */}
        {baseLayer && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200 cursor-not-allowed">
            <Map className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <div
              className="w-3 h-3 rounded flex-shrink-0 border border-gray-300"
              style={{ backgroundColor: baseLayer.color }}
            />
            <span className="flex-1 truncate text-xs text-gray-500 font-medium">
              نقشه / بکگراند
            </span>
            <Lock className="w-3 h-3 text-gray-300 flex-shrink-0" />
          </div>
        )}

        {/* Information Layer */}
        {infoLayer && (
          <div
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
              activeLayer === -2
                ? 'bg-blue-50 border border-blue-300'
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            onClick={() => onLayerChange(-2)}
          >
            <Info className="w-3 h-3 text-blue-400 flex-shrink-0" />
            <div
              className="w-3 h-3 rounded flex-shrink-0 border"
              style={{
                backgroundColor: infoLayer.visible ? infoLayer.color : 'transparent',
                borderColor: infoLayer.color,
                opacity: infoLayer.visible ? 1 : 0.3,
              }}
            />
            <span className={`flex-1 truncate text-xs ${
              activeLayer === -2 ? 'text-blue-600 font-medium' : 'text-gray-600'
            }`}>
              اطلاعات تجهیزات
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleLayer(-2) }}
              className="p-0.5 hover:bg-white/50 rounded"
              title={infoLayer.visible ? 'مخفی کردن' : 'نمایش'}
            >
              {infoLayer.visible ? (
                <Eye className="w-3.5 h-3.5 text-gray-400" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-gray-300" />
              )}
            </button>
          </div>
        )}

        <div className="w-full h-px bg-gray-200 my-1" />

        {/* Equipment Layers */}
        {otherLayers.map(layer => (
          <div
            key={layer.id}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
              activeLayer === layer.id
                ? 'bg-sky-100 border border-sky-300'
                : 'hover:bg-gray-50 border border-transparent'
            }`}
            onClick={() => onLayerChange(layer.id)}
          >
            <div
              className="w-3 h-3 rounded-full flex-shrink-0 border"
              style={{
                backgroundColor: layer.visible ? layer.color : 'transparent',
                borderColor: layer.color,
                opacity: layer.visible ? 1 : 0.3,
              }}
            />
            <span className={`flex-1 truncate text-xs ${
              activeLayer === layer.id ? 'text-sky-700 font-medium' : 'text-gray-600'
            }`}>
              {layer.name}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleLayer(layer.id) }}
              className="p-0.5 hover:bg-white/50 rounded"
              title={layer.visible ? 'مخفی کردن' : 'نمایش'}
            >
              {layer.visible ? (
                <Eye className="w-3.5 h-3.5 text-gray-400" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-gray-300" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
