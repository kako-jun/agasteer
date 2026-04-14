import { tick } from 'svelte'

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
 * 選択肢ダイアログのオプション
 */
export interface ChoiceOption {
  label: string
  value: string
  variant?: 'primary' | 'secondary' | 'cancel'
  icon?: string
}

/**
 * モーダルの状態
 */
export interface ModalState {
  show: boolean
  message: string
  type: 'confirm' | 'alert' | 'prompt' | 'choice'
  callback: (() => void) | null
  cancelCallback?: (() => void) | null
  promptCallback?: ((value: string) => void) | null
  choiceCallback?: ((value: string) => void) | null
  choiceOptions?: ChoiceOption[]
  placeholder?: string
  position: ModalPosition
}

/**
 * Pushトーストの状態
 */
let _pushToastState = $state<ToastState>({
  message: '',
  variant: '',
})
export const pushToastState = {
  get value() {
    return _pushToastState
  },
  set value(v: ToastState) {
    _pushToastState = v
  },
}

/**
 * Pullトーストの状態
 */
let _pullToastState = $state<ToastState>({
  message: '',
  variant: '',
})
export const pullToastState = {
  get value() {
    return _pullToastState
  },
  set value(v: ToastState) {
    _pullToastState = v
  },
}

/**
 * モーダルの状態
 */
let _modalState = $state<ModalState>({
  show: false,
  message: '',
  type: 'confirm',
  callback: null,
  position: 'center',
})
export const modalState = {
  get value() {
    return _modalState
  },
  set value(v: ModalState) {
    _modalState = v
  },
}

/**
 * Pushトーストを表示
 */
export function showPushToast(message: string, variant: 'success' | 'error' | '' = '') {
  pushToastState.value = { message, variant }
  setTimeout(() => {
    pushToastState.value = { message: '', variant: '' }
  }, 2000)
}

/**
 * Pullトーストを表示
 */
export function showPullToast(message: string, variant: 'success' | 'error' | '' = '') {
  pullToastState.value = { message, variant }
  setTimeout(() => {
    pullToastState.value = { message: '', variant: '' }
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

  modalState.value = {
    show: true,
    message,
    type: 'confirm',
    callback: onConfirm,
    cancelCallback: onCancel,
    position: actualPosition,
  }
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
    modalState.value = {
      show: true,
      message,
      type: 'confirm',
      callback: () => resolve(true),
      cancelCallback: () => resolve(false),
      position,
    }
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
  modalState.value = {
    show: true,
    message,
    type: 'alert',
    callback: onClose || null,
    position,
  }
}

/**
 * アラートダイアログを表示（Promise版）
 * モーダルが閉じられるまで待機
 */
export async function alertAsync(
  message: string,
  position: ModalPosition = 'center'
): Promise<void> {
  // 一度必ずモーダルを閉じる
  modalState.value = {
    show: false,
    message: '',
    type: 'alert',
    callback: null,
    position: 'center',
  }

  // DOM更新を待つ
  await tick()

  return new Promise((resolve) => {
    modalState.value = {
      show: true,
      message,
      type: 'alert',
      callback: () => resolve(),
      position,
    }
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
  modalState.value = {
    show: true,
    message,
    type: 'prompt',
    callback: null,
    promptCallback: onSubmit,
    placeholder,
    position,
  }
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
    modalState.value = {
      show: true,
      message,
      type: 'prompt',
      callback: null,
      promptCallback: (value) => resolve(value),
      cancelCallback: () => resolve(null),
      placeholder,
      position,
    }
  })
}

/**
 * 選択肢ダイアログを表示（Promise版）
 * @returns 選択された値、背景クリックなどで閉じた場合はnull
 */
export function choiceAsync(
  message: string,
  options: ChoiceOption[],
  position: ModalPosition = 'center'
): Promise<string | null> {
  return new Promise((resolve) => {
    modalState.value = {
      show: true,
      message,
      type: 'choice',
      callback: null,
      choiceCallback: (value) => resolve(value),
      cancelCallback: () => resolve(null),
      choiceOptions: options,
      position,
    }
  })
}

/**
 * モーダルを閉じる
 */
export function closeModal() {
  modalState.value = {
    show: false,
    message: '',
    type: 'confirm',
    callback: null,
    promptCallback: null,
    choiceCallback: null,
    choiceOptions: undefined,
    placeholder: '',
    position: 'center',
  }
}
