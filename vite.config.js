import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://agritour-backend.onrender.com',
        changeOrigin: true,
        secure: false,
      },
      '/get_last_irrigation_calendar': {
        target: 'https://agritour-backend.onrender.com',
        changeOrigin: true,
        secure: false,
      },
      '/get_daily_data': {
        target: 'https://agritour-backend.onrender.com',
        changeOrigin: true,
        secure: false,
      },
      '/get_irrigation_calendar': {
        target: 'https://agritour-backend.onrender.com',
        changeOrigin: true,
        secure: false,
      },
      '/get_land_cover_analysis': {
        target: 'https://agritour-backend.onrender.com',
        changeOrigin: true,
        secure: false,
      },
      '/get_gee_tile': {
        target: 'https://agritour-backend.onrender.com',
        changeOrigin: true,
        secure: false,
      },
      '/get_available_dates': {
        target: 'https://agritour-backend.onrender.com',
        changeOrigin: true,
        secure: false,
      },
      '/generate_report': {
        target: 'https://agritour-backend.onrender.com',
        changeOrigin: true,
        secure: false,
      },
      '/get_vra_map': {
        target: 'https://agritour-backend.onrender.com',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  publicDir: 'public',
}) 