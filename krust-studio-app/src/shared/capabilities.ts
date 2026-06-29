import type { DriverType, DriverCapabilities } from './types'

/**
 * Structural capability map per engine (ADR-0020). Compile-time and known
 * before connect, so the renderer mounts the right UI (sidebar body, tabs)
 * without connecting. A runtime probe refines Redis-only facts (logical-db
 * count, ACL-denied commands) but never these structural flags.
 */
const CAPABILITIES: Record<DriverType, DriverCapabilities> = {
  mysql: {
    sql: true,
    tabular: true,
    schemaMut: true,
    tabularMut: true,
    routines: false, // 1.7 routines land later
    plan: true,
    keys: false,
    switchDatabase: true
  },
  postgres: {
    sql: true,
    tabular: true,
    schemaMut: true,
    tabularMut: true,
    routines: false,
    plan: true,
    keys: false,
    switchDatabase: true
  },
  sqlite: {
    sql: true,
    tabular: true,
    schemaMut: true,
    tabularMut: true,
    routines: false,
    plan: true,
    keys: false,
    switchDatabase: false // single file
  },
  redis: {
    sql: false,
    tabular: false,
    schemaMut: false,
    tabularMut: false,
    routines: false,
    plan: false,
    keys: true,
    switchDatabase: true // logical databases
  }
}

export function capabilitiesFor(driver: DriverType): DriverCapabilities {
  return CAPABILITIES[driver]
}
