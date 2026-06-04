import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { WorkspaceData } from '../../shared/types'

const EMPTY: WorkspaceData = { lastConnectionId: null, connections: {} }

function workspacePath(): string {
  return join(app.getPath('userData'), 'workspace.json')
}

export function loadWorkspace(): WorkspaceData {
  try {
    const p = workspacePath()
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, 'utf-8'))
      // basic shape validation — reject malformed files
      if (raw && typeof raw === 'object' && 'connections' in raw) return raw as WorkspaceData
    }
  } catch {
    // corrupt / missing — return empty
  }
  return { ...EMPTY, connections: {} }
}

export function saveWorkspace(data: WorkspaceData): void {
  try {
    writeFileSync(workspacePath(), JSON.stringify(data), 'utf-8')
  } catch {
    // best-effort: disk full, permissions, etc.
  }
}
