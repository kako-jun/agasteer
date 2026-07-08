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
 * カウントダウンの最低表示時間（ペーシング、#238 実機フィードバック）。
 *
 * 実ステージの所要は偏っている（3=本文アップロードが支配的、2/1 は軽い API で
 * 一瞬）ため、通知をそのまま反映すると終盤の数字が駆け抜けて読めない。
 * 表示中の数字は最低この時間保持し、次の値はキューに積んで順に表示する。
 */
export const PUSH_COUNTDOWN_MIN_HOLD_MS = 400

/** 表示待ちの残りステージ数キュー（単調減少ガード通過済みの値だけが入る） */
let countdownQueue: number[] = []
/** 表示中の数字の最低保持タイマー。非 null の間は次の値を表示しない */
let countdownHoldTimer: ReturnType<typeof setTimeout> | null = null
/** キュー消化待ちの成功トースト。drain 完了後に表示する（#238 ペーシング） */
let pendingSuccessToast: ToastState | null = null

/** カウントダウンがまだ消化中（数字を保持中、またはキューに次の値がある）か */
function isCountdownDraining(): boolean {
  return countdownHoldTimer !== null || countdownQueue.length > 0
}

/** ペーシング状態（キュー・保持タイマー・遅延中の成功トースト）を全破棄する */
function resetCountdownPacing() {
  countdownQueue = []
  if (countdownHoldTimer !== null) {
    clearTimeout(countdownHoldTimer)
    countdownHoldTimer = null
  }
  pendingSuccessToast = null
}

/**
 * キューの先頭を表示して MIN_HOLD の保持に入る。保持中なら何もしない
 * （保持タイマー満了時に再帰的に呼ばれて次を消化する）。
 * キューが掃けたら、遅延していた成功トーストを表示する。
 */
function drainCountdownQueue() {
  if (countdownHoldTimer !== null) return
  const next = countdownQueue.shift()
  if (next === undefined) {
    // キューが掃けた（最後の数字も MIN_HOLD 表示済み）
    const pending = pendingSuccessToast
    if (pending !== null) {
      pendingSuccessToast = null
      displayPushToast(pending.message, pending.variant)
    }
    return
  }
  _pushToastCountdown = next
  countdownHoldTimer = setTimeout(() => {
    countdownHoldTimer = null
    drainCountdownQueue()
  }, PUSH_COUNTDOWN_MIN_HOLD_MS)
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
 *
 * #238 ペーシング: カウントダウンの消化中（数字を保持中またはキューあり）に
 * success で呼ばれた場合は、最後の数字が MIN_HOLD 表示されるまで差し替えを
 * 遅延する（最悪ケースでも +1 秒強の安全側遅延）。error は待たせられない
 * のでキュー・タイマーを破棄して即時表示する。
 */
export function showPushToast(message: string, variant: 'success' | 'error' | '' = '') {
  if (variant === 'success' && isCountdownDraining()) {
    // drain 完了時（drainCountdownQueue）に表示される。後から別の呼び出しが
    // 来たら上書き or 破棄され、常に最新の1件だけが遅延対象（後勝ち）
    pendingSuccessToast = { message, variant }
    return
  }
  resetCountdownPacing()
  displayPushToast(message, variant)
}

/** Push トーストを実際に差し替えて2秒の自動消滅タイマーを張る（内部用） */
function displayPushToast(message: string, variant: 'success' | 'error' | '') {
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
  // 新しい Push の開始（トースト再表示）なので、カウントダウンとペーシング
  // （キュー・保持タイマー・遅延中の成功トースト）を全リセットする。
  // 単調減少ガードのリセットが許されるのはこのタイミングだけ（#238）
  resetCountdownPacing()
  _pushToastCountdown = null
}

/**
 * Push トーストのカウントダウン（残りステージ数）を更新する（#238）。
 *
 * 単調減少ガードはキュー投入時に「表示中の値とキュー末尾のうち最小」に対して
 * 適用する: 増加値・重複値は捨てる。リトライ・救済経路で内部的にステージが
 * 巻き戻っても数字は増えない。通過した値は即時反映ではなくペーシングキューに
 * 積まれ、各数字が最低 MIN_HOLD 表示されてから順に出る。
 */
export function setPushToastCountdown(remainingStages: number) {
  const floor =
    countdownQueue.length > 0 ? countdownQueue[countdownQueue.length - 1] : _pushToastCountdown
  if (clampMonotonicCountdown(floor, remainingStages) === floor) return
  countdownQueue.push(remainingStages)
  drainCountdownQueue()
}

/**
 * Pushトーストを即座に消す
 */
export function clearPushToast() {
  pushToastState.value = { message: '', variant: '' }
  resetCountdownPacing()
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
