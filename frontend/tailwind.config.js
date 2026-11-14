/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: { brand: '#635bdf', ink: '#25263b', muted: '#6f7385' },
    },
  },
  plugins: [],
};
