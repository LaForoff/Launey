import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { iconApiPlugin } from './vite.plugins/iconApi'
import { lastEditBuildInfoPlugin } from './vite.plugins/lastEditBuildInfo'

export default defineConfig({
  plugins: [react(), iconApiPlugin(), lastEditBuildInfoPlugin()],
  server: {
    port: 4242,
    strictPort: true,
  },
})
