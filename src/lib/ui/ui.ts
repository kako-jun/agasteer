import { writable } from 'svelte/store'

/**
 * トースト通知の状態
 */
export interface ToastState {
  message: string
  variant: 'success' | 'error' | ''
}

/**
 * モーダルの位置
 */
export type ModalPosition = 'center' | 'bottom-left' | 'bottom-right'

/**
 * モーダルの状態
 */
export interface ModalState {
  show: boolean
  message: string
  type: 'confirm' | 'alert' | 'prompt'
  callback: (() => void) | null
  cancelCallback?: (() => void) | null
  promptCallback?: ((value: string) => void) | null
  placeholder?: string
  position: ModalPosition
}

/**
 * Pushトーストの状態
 */
export const pushToastState = writable<ToastState>({
  message: '',
  variant: '',
})

/**
 * Pullトーストの状態
 */
export const pullToastState = writable<ToastState>({
  message: '',
  variant: '',
})

/**
 * モーダルの状態
 */
export const modalState = writable<ModalState>({
  show: false,
  message: '',
  type: 'confirm',
  callback: null,
  position: 'center',
})

/**
 * Pushトーストを表示
 */
export function showPushToast(message: string, variant: 'success' | 'error' | '' = '') {
  pushToastState.set({ message, variant })
  setTimeout(() => {
    pushToastState.set({ message: '', variant: '' })
  }, 2000)
}

/**
 * Pullトーストを表示
 */
export function showPullToast(message: string, variant: 'success' | 'error' | '' = '') {
  pullToastState.set({ message, variant })
  setTimeout(() => {
    pullToastState.set({ message: '', variant: '' })
  }, 2000)
}

/**
 * 確認ダイアログを表示
 */
export function showConfirm(
  message: string,
  onConfirm: () => void,
  positionOrOnCancel: ModalPosition | (() => void) = 'center',
  position: ModalPosition = 'center'
) {
  // 第3引数がModalPositionか関数かで分岐
  const onCancel = typeof positionOrOnCancel === 'function' ? positionOrOnCancel : undefined
  const actualPosition = typeof positionOrOnCancel === 'string' ? positionOrOnCancel : position

  modalState.set({
    show: true,
    message,
    type: 'confirm',
    callback: onConfirm,
    cancelCallback: onCancel,
    position: actualPosition,
  })
}

/**
 * 確認ダイアログを表示（Promise版）
 * @returns true: 確認, false: キャンセル
 */
export function confirmAsync(
  message: string,
  position: ModalPosition = 'center'
): Promise<boolean> {
  return new Promise((resolve) => {
    modalState.set({
      show: true,
      message,
      type: 'confirm',
      callback: () => resolve(true),
      cancelCallback: () => resolve(false),
      position,
    })
  })
}

/**
 * アラートダイアログを表示
 * @param onClose 閉じた時に実行するコールバック（オプション）
 */
export function showAlert(
  message: string,
  position: ModalPosition = 'center',
  onClose?: () => void
) {
  modalState.set({
    show: true,
    message,
    type: 'alert',
    callback: onClose || null,
    position,
  })
}

/**
 * 入力ダイアログを表示
 */
export function showPrompt(
  message: string,
  onSubmit: (value: string) => void,
  placeholder: string = '',
  position: ModalPosition = 'center'
) {
  modalState.set({
    show: true,
    message,
    type: 'prompt',
    callback: null,
    promptCallback: onSubmit,
    placeholder,
    position,
  })
}

/**
 * 入力ダイアログを表示（Promise版）
 * @returns 入力された値、キャンセル時はnull
 */
export function promptAsync(
  message: string,
  placeholder: string = '',
  position: ModalPosition = 'center'
): Promise<string | null> {
  return new Promise((resolve) => {
    modalState.set({
      show: true,
      message,
      type: 'prompt',
      callback: null,
      promptCallback: (value) => resolve(value),
      cancelCallback: () => resolve(null),
      placeholder,
      position,
    })
  })
}

/**
 * モーダルを閉じる
 */
export function closeModal() {
  modalState.set({
    show: false,
    message: '',
    type: 'confirm',
    callback: null,
    promptCallback: null,
    placeholder: '',
    position: 'center',
  })
}
