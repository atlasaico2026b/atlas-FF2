// Language switch. One control, always in the same corner, so the two languages
// can be flipped wherever the user is in the app.

import { Languages } from 'lucide-react'
import { useLang } from '@/lib/i18n'

export default function LanguageToggle({ floating = false }: { floating?: boolean }) {
  const { lang, setLang, t } = useLang()
  const next = lang === 'fa' ? 'en' : 'fa'

  return (
    <button
      type="button"
      data-lang-toggle
      aria-label={t('app.lang.switchTo')}
      onClick={() => setLang(next)}
      className={
        floating
          ? 'fixed top-3 z-50 rounded-xl border border-sky-200 bg-white/90 px-3 py-2 text-xs font-bold text-sky-700 shadow-sm backdrop-blur transition hover:bg-white ltr:right-3 rtl:left-3'
          : 'rounded-xl border border-sky-200 bg-white/90 px-3 py-2 text-xs font-bold text-sky-700 shadow-sm transition hover:bg-white'
      }
    >
      <span className="inline-flex items-center gap-1.5">
        <Languages size={14} />
        {t('app.lang.toggle')}
      </span>
    </button>
  )
}
