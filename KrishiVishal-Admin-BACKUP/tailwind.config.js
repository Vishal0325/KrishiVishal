/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2E7D32', // Matches Android app green
          light: '#4CAF50',
          dark: '#1B5E20',
        }
      }
    },
  },
  plugins: [],
}
