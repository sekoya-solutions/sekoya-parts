// Tailwind CSS 4 through its PostCSS plugin (docs/adr/0012-front-end-assets.md).
// It only transforms stylesheets that use Tailwind; Payload's admin styles
// pass through unchanged.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
