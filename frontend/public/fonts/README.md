# Fonts — "Now"

The **Now** typeface (OTF) lives here and is wired up globally via `@font-face`
in `src/styles/index.css`, then set as the default app font family in
`tailwind.config.js`. Files are served at `/fonts/<filename>`.

## Files in use

| Weight        | File              | CSS `font-weight` |
| ------------- | ----------------- | ----------------- |
| Thin          | `Now-Thin.otf`    | 100               |
| Light         | `Now-Light.otf`   | 300               |
| Regular       | `Now-Regular.otf` | 400               |
| Medium        | `Now-Medium.otf`  | 500               |
| Bold          | `Now-Bold.otf`    | 700               |
| Black         | `Now-Black.otf`   | 900               |

Tailwind weight utilities map to these: `font-thin` (100), `font-light` (300),
`font-normal` (400), `font-medium` (500), `font-bold` (700), `font-black` (900).

To swap or add a weight, drop the `.otf` here and update the matching
`@font-face` block in `src/styles/index.css`. (`.woff2` is smaller/faster for
the web if you ever convert them — just change the `url(...)` and `format`.)
