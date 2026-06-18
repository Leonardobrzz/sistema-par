/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cyan — cor de ação principal Jota Barros
        par: {
          50:  '#E6F8FB',
          100: '#B3EAF2',
          200: '#80DCE9',
          300: '#4DCEE0',
          400: '#26C3D8',
          500: '#00B5CC', // Cyan primary
          600: '#009CB0',
          700: '#007A8C',
          800: '#005868',
          900: '#003644',
          950: '#001A22',
        },
        // Navy — paleta de fundo e estrutura
        navy: {
          50:  '#E8EDF4',
          100: '#C5D2E3',
          200: '#9DB3CC',
          300: '#7294B5',
          400: '#3E6A95',
          500: '#1B4B82',
          600: '#163D6E',
          700: '#122D57',
          800: '#0E2748', // Deep navy — sidebar
          900: '#091A33',
          950: '#050E1A',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
