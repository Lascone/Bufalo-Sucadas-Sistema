/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f4f7f4',
          100: '#e4ebe3',
          500: '#3d6b45',
          700: '#2a4a30',
          900: '#1a2e1e',
        },
        steel: {
          100: '#e8ecef',
          400: '#7a8a96',
          700: '#3a4650',
          900: '#1c242b',
        },
      },
      fontFamily: {
        sans: ['"Source Sans 3"', 'Segoe UI', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
