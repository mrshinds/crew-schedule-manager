import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Ensure relative paths for assets on GitHub Pages
  build: {
    outDir: 'docs', // Build to docs folder for easy GH Pages deploy
    emptyOutDir: true
  }
})
