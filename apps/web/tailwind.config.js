/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#081014",
        panel: "#101b21",
        line: "#1a2a33",
        mint: "#4ade80",
        amber: "#fbbf24",
        coral: "#fb7185"
      },
      boxShadow: {
        glow: "0 20px 60px rgba(8, 16, 20, 0.35)"
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
}
