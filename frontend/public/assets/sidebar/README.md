# Sidebar logos & icons

Drop your logo/icon image files here. They are served at `/assets/sidebar/<filename>`.

The sidebar (`frontend/src/App.tsx`) looks for the following optional files. If a
file is **present**, it is rendered; if it is **absent**, the component falls back
to a built-in inline SVG so the UI never shows a broken image.

| Purpose | Expected filename | Notes |
|---------|-------------------|-------|
| Default user avatar | `avatar.svg` | Used in the profile card when the signed-in user has no avatar URL. Square, ~100×100px. |
| Resume nav icon | `resume.svg` | 30×30px. Monochrome (white) recommended. |
| Interview nav icon | `interview.svg` | 30×30px. |
| Job Search nav icon | `jobsearch.svg` | 30×30px. |
| Upskilling nav icon | `upskilling.svg` | 30×30px. |
| Logout icon | `logout.svg` | 30×30px. Shown on the right of the logout card. |

## How swapping works

Icon `<img>` elements use an `onError` handler that hides the image and reveals
the inline SVG fallback, so you can add files incrementally. SVGs are preferred
(crisp at any size); PNG/JPG/WebP also work.
