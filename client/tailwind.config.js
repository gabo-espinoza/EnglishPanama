/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
        display: ['Fredoka One', 'cursive'],
      },
      colors: {
        // Fondo de viento (no cambia)
        brand: {
          100: '#C8E6E2',
          200: '#9ED5D1',
          300: '#63C1BB',
          400: '#3A9295',
          500: '#105F68',
          600: '#0B454C',
        },
        // Turquesa de login y registro. Ojo: sustituye al "blue" de Tailwind, así que
        // bg-blue-* es turquesa (los componentes usan estas clases a través de .auth-input y .auth-button).
        blue: {
          50: '#EAFFFF',
          100: '#B5FFFF',
          200: '#8AE0DB',
          300: '#5DC1B9',
          400: '#5DC1B9',
          500: '#3FA9A1',
          600: '#26807A',
          700: '#1D6B66',
          800: '#175651',
          900: '#10403C',
        },
      },
      // Entrada suave para paneles y tarjetas. Se desactiva con prefers-reduced-motion (ver index.css).
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 300ms ease-out',
      },
    },
  },
  plugins: [],
}
