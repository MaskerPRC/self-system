/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Lora', 'serif'],
        mono: ['ui-monospace', 'monospace']
      },
      colors: {
        brand: { 50: '#fdf4f1', 100: '#fae6df', 500: '#e05d34', 600: '#c54924', 700: '#a83d1e' },
        surface: '#fcfbf9',
        paper: '#ffffff',
        ink: { 300: '#d6d3d1', 400: '#a8a29e', 500: '#78716c', 700: '#44403c', 800: '#292524', 900: '#1c1917' },
        stone: { 50: '#fafaf9', 100: '#f5f5f4', 200: '#e7e5e4', 300: '#d6d3d1' }
      },
      boxShadow: {
        'subtle': '0 2px 10px -4px rgba(28, 25, 23, 0.05)',
        'float': '0 10px 40px -10px rgba(28, 25, 23, 0.08)',
        'pill': '0 8px 30px -5px rgba(28, 25, 23, 0.12)',
      }
    }
  },
  plugins: []
}
