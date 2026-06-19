/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // StayQualifAI brand palette (see steering/product.md)
        primary: {
          DEFAULT: '#9b5de5', // Deep Amethyst Purple — brand accent, CTAs, selected states
          50: '#f5eefc',
          100: '#e7d6f8',
          500: '#9b5de5',
          600: '#7d3fd0',
          700: '#5f2ea0',
        },
        'accent-pink': '#ffc8dd', // Soft Pastel Pink — stat cards, progress milestones, card headers
        'accent-yellow': '#fee440', // Bright Cyber Yellow — stat cards, scores, warnings, active indicators
        'accent-green': '#00f5d4', // Electric Turquoise Green — stat cards, positive metrics, success feedback
        // Surface tokens — light dashboard canvas + panels
        canvas: '#f7f7f8', // app background behind panels
        surface: '#ffffff', // white rounded panels
        ink: '#1a1a1a', // near-black primary text
      },
      borderRadius: {
        '2xl': '1rem',
      },
      boxShadow: {
        panel: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
};
