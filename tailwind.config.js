/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,ts,svg}"],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [
    require('flowbite/plugin')
  ],
}

