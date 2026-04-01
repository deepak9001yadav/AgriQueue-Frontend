import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Yeh logic local ke liye 5500 aur live/build ke liye Render ka URL set karega
const backendUrl = process.env.NODE_ENV === 'production' 
  ? 'https://agritour-backend.onrender.com' 
  : 'http://localhost:5000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      '/get_last_irrigation_calendar': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      '/get_daily_data': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      '/get_irrigation_calendar': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      '/get_land_cover_analysis': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      '/get_gee_tile': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      '/get_available_dates': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      '/generate_report': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      '/get_vra_map': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  publicDir: 'public',
})