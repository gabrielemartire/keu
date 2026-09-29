import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One chunk per heavy package: keeps each upload small (large single-file
// uploads to Cloudflare fail on some networks) without splitting a library
// mid-module, which breaks its init order.
const vendorGroups: [string, RegExp][] = [
  ['react', /node_modules[\\/](react|react-dom|scheduler)[\\/]/],
  ['xyflow', /node_modules[\\/]@xyflow[\\/]/],
  ['d3', /node_modules[\\/]d3-/],
  ['pdf-fonts', /node_modules[\\/]@pdf-lib[\\/]standard-fonts[\\/]/],
  ['pako', /node_modules[\\/]pako[\\/]/],
  ['pdf-lib', /node_modules[\\/](pdf-lib|@pdf-lib)[\\/]/],
  ['vendor', /node_modules[\\/]/],
]

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        advancedChunks: { groups: vendorGroups.map(([name, test], i) => ({ name, test, priority: vendorGroups.length - i })) },
      },
    },
  },
})
