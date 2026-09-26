/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        krishi: {
          canvas: '#F8FAF6',   // Warm off-white background for the main page
          surface: '#FFFFFF',  // Pure white for elevated cards
          primary: '#1B5E20',  // Deep ICAR forest green for primary actions
          accent: '#16A34A',   // Emerald green for active states/charts
          warning: '#F59E0B',  // Warm amber for alerts/badges
          textMain: '#0F172A', // High-contrast Slate-900 for primary typography
          textMuted: '#475569',// Slate-600 for secondary text
          border: '#A7F3D0',   // Emerald-200 for subtle card borders
        }
      }
    },
  },
  plugins: [],
}
