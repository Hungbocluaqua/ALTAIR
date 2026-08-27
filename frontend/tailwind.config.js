/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'Cambria', 'serif'],
        sans: ['"Plus Jakarta Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        editorial: {
          bg: '#F9F8F6',
          surface: '#FFFFFF',
          border: '#E5E3DF',
          darkBg: '#121316',
          darkSurface: '#17181C',
          darkBorder: '#26282E',
          amber: '#D97706',
          amberDark: '#F59E0B',
        },
      },
    },
  },
  plugins: [],
}
