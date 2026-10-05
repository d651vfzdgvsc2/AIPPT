/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B0F0E',
        muted: '#6C756F',
        line: '#E6E6E6',
        paper: '#FBFAF7',
        accent: '#2F746C',
        accentDark: '#21564F',
        accentSoft: '#E6F1EF',
      },
      fontFamily: {
        sans: ['-apple-system', 'Segoe UI', 'Microsoft YaHei', 'Inter', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
