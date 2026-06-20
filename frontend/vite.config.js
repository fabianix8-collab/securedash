import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// 'base' es el subdirectorio donde queda publicado el sitio en GitHub Pages:
// https://<usuario>.github.io/securedash/  ->  base: '/securedash/'
// Si despliegas en Vercel/Netlify (dominio propio en la raiz), usa base: '/'.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/securedash/',
})
