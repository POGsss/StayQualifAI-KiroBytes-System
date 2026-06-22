/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // "Now" brand typeface (see public/fonts/) with a system fallback.
        sans: [
          'Now',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
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
        // Bauhaus landing palette (see Figma redesign)
        bauhaus: {
          blue: '#0e4cb0',
          red: '#ee1b24',
          yellow: '#febe00',
          ink: '#1d1d1d',
          bg: '#f0f0f0',
        },
      },
      borderRadius: {
        '2xl': '1rem',
      },
      boxShadow: {
        panel: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
      },
      keyframes: {
        'dialog-pop': {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'dialog-pop': 'dialog-pop 180ms ease-out',
      },
    },
  },
  plugins: [],
};
