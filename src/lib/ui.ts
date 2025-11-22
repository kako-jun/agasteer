import { writable } from 'svelte/store'

/**
 * トースト通知の状態
 */
export interface ToastState {
  message: string
  variant: 'success' | 'error' | ''
}

/**
 * モーダルの状態
 */
export interface ModalState {
  show: boolean
  message: string
  type: 'confirm' | 'alert'
  callback: (() => void) | null
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
export function showConfirm(message: string, onConfirm: () => void) {
  modalState.set({
    show: true,
    message,
    type: 'confirm',
    callback: onConfirm,
  })
}

/**
 * アラートダイアログを表示
 */
export function showAlert(message: string) {
  modalState.set({
    show: true,
    message,
    type: 'alert',
    callback: null,
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
  })
}
