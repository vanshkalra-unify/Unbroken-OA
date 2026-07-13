/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0f172a", // slate-900
        foreground: "#f8fafc", // slate-50
        primary: "#3b82f6", // blue-500
        secondary: "#1e293b", // slate-800
        accent: "#10b981", // emerald-500
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
