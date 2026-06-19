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
        'accent-pink': '#ffc8dd', // Soft Pastel Pink — progress milestones, card headers
        'accent-yellow': '#fee440', // Bright Cyber Yellow — scores, warnings, active indicators
        'accent-green': '#00f5d4', // Electric Turquoise Green — positive metrics, success feedback
      },
    },
  },
  plugins: [],
};
