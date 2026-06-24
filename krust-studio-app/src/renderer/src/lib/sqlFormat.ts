import { format, type SqlLanguage } from 'sql-formatter'
import type { DriverType } from '../../../shared/types'

const DIALECTS: Record<DriverType, SqlLanguage> = {
  mysql: 'mysql',
  postgres: 'postgresql',
  sqlite: 'sqlite'
}

export function formatSql(value: string, driver?: DriverType): string {
  if (!value.trim()) return value
  return format(value, {
    language: driver ? DIALECTS[driver] : 'sql',
    keywordCase: 'upper',
    tabWidth: 2,
    linesBetweenQueries: 2
  })
}

export function displaySql(value: string, driver?: DriverType, pretty = false): string {
  if (!pretty) return value
  try {
    return formatSql(value, driver)
  } catch {
    return value
  }
}
