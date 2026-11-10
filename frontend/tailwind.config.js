/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tomas: {
          bg: '#FCF9F5',          // Grey BG (light)
          'bg-dark': '#FAF4F0',   // Grey BG (warm tint)
          black: '#2E2A14',       // Olive-dark primary text
          'black-dark': '#2D301E',// Dark surface
          grey: '#777972',        // Grey text
          'grey-dark': '#63694B',
          white: '#FFFFFF',       // Clean card surface
          accent: '#F6440E',      // Vivid orange accent
          'accent-hover': '#DF3B09',
          'accent-tint': 'rgba(246, 68, 14, 0.08)',
          'accent-soft': 'rgba(255, 173, 148, 0.3)',
          border: 'rgba(46, 42, 20, 0.12)',
          'border-strong': 'rgba(46, 42, 20, 0.22)',
          'border-dark': 'rgba(45, 48, 30, 0.2)',
          surface: '#FFFFFF',
          rail: '#F4ECE4',
        }
      },
      fontFamily: {
        sans: ['"General Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      letterSpacing: {
        tighter: '-0.04em',
        tight: '-0.03em',
        snug: '-0.015em',
        wide: '0.02em',
        wider: '0.04em',
      },
      boxShadow: {
        'tomas-card': '0 1px 3px 0 rgba(46, 42, 20, 0.04), 0 1px 2px -1px rgba(46, 42, 20, 0.03)',
        'tomas-hover': '0 8px 24px -4px rgba(46, 42, 20, 0.08), 0 2px 6px -1px rgba(46, 42, 20, 0.04)',
        'tomas-modal': '0 25px 50px -12px rgba(46, 42, 20, 0.25)',
      }
    },
  },
  plugins: [],
}
