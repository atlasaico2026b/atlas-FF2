// SPDX-License-Identifier: Apache-2.0
import type { ChangeEvent } from 'react'
import { cn } from '@/lib/cn'

interface SliderProps {
  /** Single value in a one-entry array, so call sites read `value={[x]}`. */
  value: number[]
  min?: number
  max?: number
  step?: number
  onValueChange?: (value: number[]) => void
  className?: string
  'aria-label'?: string
}

/**
 * The project's sliders are plain range inputs — the zoom control, the map
 * opacity and the label scale are all written that way — so this wrapper keeps
 * that shape rather than adding a slider library to the bundle. Keyboard, touch
 * and screen-reader behaviour come from the native control.
 */
export function Slider({ value, min = 0, max = 100, step = 1, onValueChange, className, ...rest }: SliderProps) {
  const current = value?.[0] ?? min
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={current}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onValueChange?.([Number(e.target.value)])}
      className={cn('w-full h-1 accent-sky-500 cursor-pointer', className)}
      {...rest}
    />
  )
}

export default Slider
