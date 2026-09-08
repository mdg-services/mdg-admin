import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        text: 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
        'text-subtle': 'var(--color-text-subtle)',
        'text-inverse': 'var(--color-text-inverse)',
        brand: {
          DEFAULT: 'var(--color-brand)',
          hover: 'var(--color-brand-hover)',
          soft: 'var(--color-brand-soft)',
        },
        'focus-ring': 'var(--color-focus-ring)',
        /*
         * `strong` IS THE READABLE FOREGROUND FOR A `soft` BACKGROUND.
         *
         * The shipped pairing across this portal is `bg-*-soft` + `text-*`
         * (`INTENT_CLASSES`), and on the two that matter it does not carry: amber
         * #d97706 on #fef3c7 measures 3.14:1 and green #16a34a on #dcfce7
         * measures 3.00:1, where an ordinary reader needs 4.5:1. The person this
         * feature is built for is 55, standing outdoors under a forecourt canopy,
         * on a cheap screen. These three darker shades measure 6.37:1, 6.80:1 and
         * 6.49:1 against their own soft backgrounds.
         *
         * They are deliberately FIXED HEXES and not CSS variables, exactly like
         * the shades they sit beside: `*-soft` does not change between light and
         * dark, so a foreground that DID change would be unreadable in one of the
         * two. That is the trap that ruled out `text-text` here.
         *
         * `INTENT_CLASSES` is NOT changed. Switching it would restyle every badge
         * in the portal in one commit; these are used by the documents validity
         * surfaces only, and the rest of the app can adopt them deliberately.
         * `neutral` needs no `strong` — #475569 on #e2e8f0 is already 6.15:1.
         */
        success: { DEFAULT: '#16a34a', soft: '#dcfce7', strong: '#166534' },
        warning: { DEFAULT: '#d97706', soft: '#fef3c7', strong: '#92400e' },
        danger: { DEFAULT: '#dc2626', soft: '#fee2e2', strong: '#991b1b' },
        info: { DEFAULT: '#2563eb', soft: '#dbeafe' },
        neutral: { DEFAULT: '#475569', soft: '#e2e8f0' },
      },
      borderRadius: { sm: '4px', md: '8px', lg: '12px' },
      boxShadow: {
        sm: '0 1px 2px rgba(15,23,42,0.06)',
        md: '0 4px 12px rgba(15,23,42,0.08)',
        lg: '0 16px 40px rgba(15,23,42,0.16)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
