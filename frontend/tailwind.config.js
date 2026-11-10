/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        palette: {
          coral: '#FFA69E',
          'coral-hover': '#F09289',
          'coral-light': '#FFF1EF',
          cream: '#FAF3DD',
          'cream-card': '#FFFDF7',
          'cream-dark': '#EFE5C7',
          mint: '#B8F2E6',
          'mint-dark': '#83D9C7',
          'mint-light': '#E9FCF8',
          ice: '#AED9E0',
          'ice-dark': '#8BC4CE',
          'ice-light': '#F0F8FA',
          slate: '#5E6472',
          'slate-dark': '#343841',
          'slate-light': '#7E8696',
          'slate-subtle': '#E5E8EE',
        }
      },
      fontFamily: {
        serif: ['Newsreader', 'Fraunces', 'Georgia', 'serif'],
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        'tactile': '0 3px 0 0 #5E6472',
        'tactile-sm': '0 2px 0 0 #5E6472',
        'tactile-lg': '0 5px 0 0 #5E6472',
        'subtle-float': '0 12px 32px -8px rgba(94, 100, 114, 0.12)',
        'glow-coral': '0 0 25px -4px rgba(255, 166, 158, 0.5)',
        'glow-mint': '0 0 25px -4px rgba(184, 242, 230, 0.5)',
      }
    },
  },
  plugins: [],
}
