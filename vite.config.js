import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Core React — load first, always needed
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/')) {
            return 'vendor';
          }
          // Firebase — separate large chunk
          if (id.includes('node_modules/firebase/')) {
            return 'firebase';
          }
          // Recharts — only needed on Dashboard/Reports pages
          if (id.includes('node_modules/recharts/') || id.includes('node_modules/d3-')) {
            return 'charts';
          }
          // ExcelJS — VERY LARGE, only needed for Excel export
          if (id.includes('node_modules/exceljs/')) {
            return 'excel';
          }
          // jsPDF — only needed for PDF export
          if (id.includes('node_modules/jspdf')) {
            return 'pdf';
          }
          // html2canvas — only needed for PDF/screenshot
          if (id.includes('node_modules/html2canvas/')) {
            return 'html2canvas';
          }
          // UI utilities — smaller, needed early
          if (
            id.includes('node_modules/lucide-react/') ||
            id.includes('node_modules/react-hot-toast/') ||
            id.includes('node_modules/clsx/') ||
            id.includes('node_modules/tailwind-merge/')
          ) {
            return 'ui';
          }
          // Data utilities — date-fns, papaparse
          if (id.includes('node_modules/date-fns/') || id.includes('node_modules/papaparse/')) {
            return 'utils';
          }
        }
      }
    }
  }
})

