import { ElectronAPI } from '@electron-toolkit/preload'
import type { KrustApi } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: KrustApi
  }
}
