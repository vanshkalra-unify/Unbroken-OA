import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false
      },
      manifest: {
        name: 'HackOff OA',
        short_name: 'HackOff',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone'
      }
    })
  ],
})
