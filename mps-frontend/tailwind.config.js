export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        arabic: ['Cairo', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dbe4ff',
          200: '#bac8ff',
          400: '#748ffc',
          500: '#4361ee',
          600: '#3451d1',
          700: '#2c44b8',
          800: '#1e3a8a',
          900: '#1a2a7a',
        }
      }
    },
  },
  plugins: [],
}
