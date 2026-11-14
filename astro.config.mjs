import { defineConfig } from 'astro/config';

// Served at https://latenightatl.com (custom domain on GitHub Pages; see public/CNAME).
export default defineConfig({
  site: 'https://latenightatl.com',
  // Tests build fixture data into a separate folder (see playwright.config.ts).
  outDir: process.env.ASTRO_OUT_DIR ?? './dist',
});
