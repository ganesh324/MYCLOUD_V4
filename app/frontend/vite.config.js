import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.VITE_MYCLOUD_BACKEND_URL || env.MYCLOUD_BACKEND_URL || 'http://localhost:8000'
  const devHost = env.VITE_MYCLOUD_DEV_HOST || env.MYCLOUD_DEV_HOST || true
  const devPort = Number(env.VITE_MYCLOUD_DEV_PORT || env.MYCLOUD_DEV_PORT || 3000)

  return {
    plugins: [react()],
    server: {
      host: devHost,
      port: devPort,
      strictPort: true,
      proxy: {
        '/api': backendUrl
      }
    },
    preview: {
      host: devHost,
      port: devPort,
      strictPort: true
    }
  }
})
