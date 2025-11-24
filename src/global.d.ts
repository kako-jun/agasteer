// グローバル型定義

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
