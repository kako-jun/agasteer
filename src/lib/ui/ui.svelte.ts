import { tick } from 'svelte'
import { clampMonotonicCountdown } from '../sync/push-stages'

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
 * Push トーストのカウントダウン（残りステージ数、#238）
 *
 * sticky Push トースト表示中に FF 風カウントダウンとして 2 行目に表示する。
 * null = 非表示。setPushToastCountdown は単調減少ガード付きで、リトライ・
 * 救済経路で内部的にステージが巻き戻っても表示上の数字は絶対に増やさない。
 */
let _pushToastCountdown = $state<number | null>(null)
export const pushToastCountdown = {
  get value() {
    return _pushToastCountdown
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
  // 完了/エラートーストへの差し替え時点でカウントダウンは役目を終える
  _pushToastCountdown = null
  setTimeout(() => {
    // 自分が出したトーストがまだ表示中のときだけ消す。
    // 後から別のトースト（sticky 含む）に差し替わっていたら触らない（後勝ち）。
    if (pushToastState.value.message === message) {
      pushToastState.value = { message: '', variant: '' }
      // トーストを空にするならカウントダウンも残さない（不変条件を局所で保証）
      _pushToastCountdown = null
    }
  }, 2000)
}

/**
 * Push の sticky トーストを表示する（自動消滅しない）。
 * isPushingBackground の間だけ出し、完了トースト（showPushToast）や
 * 他操作のトースト、clearPushToast で差し替わる（後勝ち）。
 */
export function showStickyPushToast(message: string) {
  pushToastState.value = { message, variant: '' }
  // 新しい Push の開始（トースト再表示）なので、カウントダウンをリセットする。
  // 単調減少ガードのリセットが許されるのはこのタイミングだけ（#238）
  _pushToastCountdown = null
}

/**
 * Push トーストのカウントダウン（残りステージ数）を更新する（#238）。
 *
 * 単調減少ガード付き: 表示中の最小値より大きい値は無視する。
 * リトライ・救済経路で内部的にステージが巻き戻っても数字は増えない。
 */
export function setPushToastCountdown(remainingStages: number) {
  _pushToastCountdown = clampMonotonicCountdown(_pushToastCountdown, remainingStages)
}

/**
 * Pushトーストを即座に消す
 */
export function clearPushToast() {
  pushToastState.value = { message: '', variant: '' }
  _pushToastCountdown = null
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
