// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Shogo Technologies, Inc.
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { PrismaClient } from '../generated/prisma/client'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Where the SQLite file lives when DATABASE_URL is not set.
 *
 * Resolving `prisma/dev.db` from *this file* rather than from the process cwd
 * means the server finds the database whichever directory it was started from.
 * The old `file:./dev.db` default pointed at the cwd, so starting the app from
 * anywhere but `prisma/` silently created an empty database and every /api
 * route failed with "no such table: main.projects".
 */
function defaultDatabaseUrl(): string {
  try {
    const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const candidates = [resolve(projectRoot, 'prisma', 'dev.db'), resolve(process.cwd(), 'prisma', 'dev.db')]
    for (const path of candidates) {
      if (existsSync(path)) return `file:${path}`
    }
    return `file:${candidates[0]}`
  } catch {
    return 'file:./prisma/dev.db'
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || defaultDatabaseUrl(),
})

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
