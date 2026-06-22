# Image assets

Static images served at the site root. Reference them in code as
`/assets/<filename>` (no import needed — Vite serves `public/` verbatim).

## Files used by the landing page & login dialog

| Filename               | Used by                                   | Notes                                              |
| ---------------------- | ----------------------------------------- | -------------------------------------------------- |
| `logo.png`             | Navbar + login dialog brand lockup        | **Your custom logo.** A Figma export is provided — replace it with your own. Transparent PNG/SVG recommended. |
| `hero-shape-1.png`     | Landing hero — top-left decorative shape  | Bauhaus shape (transparent PNG).                   |
| `hero-shape-2.png`     | Landing hero — right decorative shape      | Bauhaus shape (transparent PNG).                   |
| `login-shape.png`      | Login dialog — right decorative panel      | Bauhaus shape (transparent PNG).                   |

To swap any image, just drop a file with the same name here. To use a
different name or format (e.g. `logo.svg`), update the path constants in
`src/components/Bauhaus/BauhausGraphics.tsx`.
