import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifestFilename: 'manifest.webmanifest', // <-- ADD THIS LINE,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
      manifest: {
        short_name: "tinypos",
        name: "tinypos",
        start_url: "/",
        display: "fullscreen",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        icons: [
          // 1. Standard 192x192 (Required by Chrome)
          {
            src: 'icon-192x192.png', 
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          // 2. Standard 512x512 (Required by Chrome)
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          // 3. Maskable version for Android home screens
          {
            src: 'icon-512.png', // You can reuse the 512 image here
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  server: {
    host: true // Allows network access
  }
})
