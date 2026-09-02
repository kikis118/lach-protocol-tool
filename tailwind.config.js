/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Same token names as lach-hockey-app's tailwind.config.js, so the
      // preview can reuse the exact same class strings as the real
      // GameDetail page and stay visually identical - values copied from
      // that project's src/index.css, not redefined independently.
      colors: {
        base: 'var(--color-base)',
        surface: 'var(--color-surface)',
        card: 'var(--color-card)',
        inset: 'var(--color-inset)',
        'surface-hover': 'var(--color-surface-hover)',
        accent: 'var(--color-accent)',

        ink: 'var(--color-ink)',
        'ink-100': 'var(--color-ink-100)',
        'ink-secondary': 'var(--color-ink-secondary)',
        'ink-muted': 'var(--color-ink-muted)',
        'ink-faint': 'var(--color-ink-faint)',
        'ink-faintest': 'var(--color-ink-faintest)',
        'ink-dim': 'var(--color-ink-dim)',

        line: 'var(--color-line)',
        'line-strong': 'var(--color-line-strong)',
        'line-hover': 'var(--color-line-hover)',
      },
    },
  },
  plugins: [],
}
