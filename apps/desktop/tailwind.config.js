/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF4E5',
          100: '#FFE0B8',
          200: '#FFC078',
          400: '#FF9800',
          500: '#F57C00',
          600: '#E65100',
          700: '#BF360C',
        },
        moss: {
          400: '#66BB6A',
          500: '#2E7D32',
          600: '#1B5E20',
          700: '#0F3D14',
        },
        ink: {
          50: '#F5F5F5',
          100: '#E8E8E8',
          200: '#BDBDBD',
          300: '#9E9E9E',
          500: '#616161',
          700: '#2A2A2A',
          800: '#1A1A1A',
          900: '#0B0B0B',
          950: '#050505',
        },
        gold: {
          400: '#FFD600',
          500: '#FFC107',
        },
      },
      fontFamily: {
        sans: ['"Source Sans 3"', 'Segoe UI', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 8px 28px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
};
