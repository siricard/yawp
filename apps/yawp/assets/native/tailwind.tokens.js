// AUTO-GENERATED from apps/yawp/assets/css/tokens.css by scripts/gen-tokens.mjs.
// Do not edit by hand. Run `node apps/yawp/assets/native/scripts/gen-tokens.mjs`.
// Consumed by apps/yawp/assets/native/tailwind.config.js.
module.exports = {
  "colors": {
    "bg": {
      "2": "#1a2128",
      "DEFAULT": "#202831"
    },
    "surface": {
      "2": "#485363",
      "3": "#5a6776",
      "DEFAULT": "#353E4B"
    },
    "text": {
      "DEFAULT": "#f0efea",
      "secondary": "#b5b9bf",
      "tertiary": "#7a8290"
    },
    "border": {
      "DEFAULT": "#2a323d",
      "soft": "#4a5464"
    },
    "primary": {
      "DEFAULT": "#d8ee4d",
      "hover": "#c3d740",
      "soft": "color-mix(in oklch, var(--color-primary) 22%, var(--color-surface))"
    },
    "on": {
      "primary": "#202831"
    },
    "success": {
      "DEFAULT": "#74cf86",
      "soft": "color-mix(in oklch, var(--color-success) 22%, var(--color-surface))"
    },
    "warning": {
      "DEFAULT": "#e8a06b",
      "soft": "color-mix(in oklch, var(--color-warning) 22%, var(--color-surface))"
    },
    "danger": {
      "DEFAULT": "#e8615a",
      "soft": "color-mix(in oklch, var(--color-danger) 22%, var(--color-surface))"
    }
  },
  "borderRadius": {
    "sm": "8px",
    "md": "12px",
    "lg": "18px",
    "xl": "22px",
    "pill": "999px"
  },
  "fontSize": {
    "xs": "0.75rem",
    "sm": "0.875rem",
    "base": "1rem",
    "lg": "1.25rem",
    "xl": "1.5rem",
    "2xl": "2rem",
    "3xl": "2.75rem"
  },
  "fontFamily": {
    "sans": [
      "Geist",
      "ui-sans-serif",
      "system-ui",
      "-apple-system",
      "Segoe UI",
      "sans-serif"
    ],
    "mono": [
      "Geist Mono",
      "ui-monospace",
      "SF Mono",
      "Menlo",
      "Consolas",
      "monospace"
    ],
    "display": [
      "Geist",
      "ui-sans-serif",
      "system-ui",
      "sans-serif"
    ]
  },
  "boxShadow": {
    "tint": "8 12 18",
    "card": "0 1px 0 0 rgba(255,255,255,.02) inset, 0 6px 22px rgba(8,12,18,.28), 0 1px 2px rgba(8,12,18,.18)",
    "elev": "0 14px 40px rgba(8,12,18,.42), 0 4px 12px rgba(8,12,18,.22)"
  },
  "transitionTimingFunction": {
    "spring": "cubic-bezier(0.32, 0.72, 0, 1)",
    "out-quint": "cubic-bezier(0.22, 1, 0.36, 1)"
  },
  "transitionDuration": {
    "fast": "180",
    "base": "280",
    "slow": "520"
  }
};
