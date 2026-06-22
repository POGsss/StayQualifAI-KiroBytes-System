/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Bauhaus redesign typography — Inter for body, Manrope/IBM Plex Sans
        // for headings. "Now" + system stack remain as graceful fallbacks.
        sans: [
          'Inter',
          'Manrope',
          'IBM Plex Sans',
          'Now',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        heading: [
          'Manrope',
          'IBM Plex Sans',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        // Bauhaus dashboard palette (see docs/GLOBAL_REDESIGN.md).
        // `primary` now drives CTAs/active states in Bauhaus Blue so every
        // module that references the shared token adopts the redesign.
        primary: {
          DEFAULT: '#1E5BC6', // Bauhaus Blue — CTAs, selected/active states, focus
          50: '#eaf1fb',
          100: '#cfe0f6',
          500: '#1E5BC6',
          600: '#184ba6',
          700: '#123a80',
        },
        // Bauhaus accent colors
        'accent-blue': '#1E5BC6',
        'accent-yellow': '#F6B800',
        'accent-red': '#FF2B2B',
        // Backward-compatible accent aliases (no purple): keep existing module
        // markup working while staying on-palette.
        'accent-pink': '#FF2B2B', // legacy pink → Bauhaus red
        'accent-green': '#1E5BC6', // legacy turquoise → Bauhaus blue
        // Surface tokens — Bauhaus light workspace + white cards + dark sidebar
        canvas: '#F5F5F5', // app/workspace background behind cards
        surface: '#FFFFFF', // white rounded cards/panels
        ink: '#111111', // primary near-black text
        muted: '#6B6B6B', // secondary text
        sidebar: '#121212', // dark sidebar background
        // Explicit Bauhaus palette namespace (landing + accents)
        bauhaus: {
          blue: '#1E5BC6',
          red: '#FF2B2B',
          yellow: '#F6B800',
          ink: '#111111',
          bg: '#F5F5F5',
        },
      },
      borderRadius: {
        xl: '0.75rem', // 12px — Bauhaus card radius (lower bound)
        '2xl': '1rem', // 16px — Bauhaus card radius (upper bound)
      },
      boxShadow: {
        // Subtle Bauhaus card elevation — minimal visual noise.
        panel: '0 1px 2px rgba(17, 17, 17, 0.04), 0 4px 12px rgba(17, 17, 17, 0.06)',
        card: '0 1px 2px rgba(17, 17, 17, 0.04), 0 4px 12px rgba(17, 17, 17, 0.06)',
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
