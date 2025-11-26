// グローバル型定義

// Vite で define されるビルド日時（vite.config.ts 参照）
declare const __BUILD_DATE__: string

interface Window {
  editorCallbacks?: {
    [paneId: string]: {
      onSave?: (() => void) | null
      onClose?: (() => void) | null
      onSwitchPane?: (() => void) | null
    }
  }
  vimCommandsInitialized?: boolean
}
