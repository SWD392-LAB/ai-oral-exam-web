import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The API allows CORS from this port only (see README)
  server: { port: 5173, strictPort: true },
})
