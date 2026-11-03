// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Shogo Technologies, Inc.
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  base: './',
  server: {
    port: 3000,
    host: '0.0.0.0',
    cors: true,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_SERVER_PORT ?? 3101}`,
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/.shogo/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    react(),
  ],
  build: {
    target: 'esnext',
    minify: false,
    // `vite build --watch` uses Rollup's watcher, NOT server.watch — so the
    // runtime's `server.watch.ignored` never applies. Without this the build
    // re-triggers itself: it writes .shogo/build-output.json + build.log, those
    // are watched, and the result is an endless rebuild loop (6000+ builds,
    // each one firing an "Update available" toast at the user).
    watch: {
      exclude: ['**/node_modules/**', '**/.shogo/**', '**/dist/**'],
      chokidar: {
        ignored: [/[/\\]\.shogo[/\\]/, /[/\\]dist[/\\]/, /[/\\]node_modules[/\\]/],
      },
    },
  },
})
