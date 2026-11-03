import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.VITE_BACKEND_URL || env.VITE_API_URL || ''

  return {
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
  }
})
