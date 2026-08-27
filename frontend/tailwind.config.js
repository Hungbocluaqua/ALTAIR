/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0b0f19',
          800: '#111827',
          700: '#1f293d',
          600: '#2d3748',
        },
        audiophile: {
          cyan: '#06b6d4',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
          indigo: '#6366f1',
        }
      },
      fontFamily: {
        serif: ['"Newsreader"', '"Instrument Serif"', '"Playfair Display"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'monospace'],
        sans: ['"Plus Jakarta Sans"', '"SF Pro Display"', '"Helvetica Neue"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
