import './App.css'
import App from './App.svelte'
import { registerSW } from 'virtual:pwa-register'

// PWA更新チェック完了を待つためのPromise
// App.svelteのonMountで初回Pullより先にこのPromiseをawaitする
export const waitForSwCheck: Promise<void> = new Promise((resolve) => {
  let resolved = false
  const safeResolve = () => {
    if (!resolved) {
      resolved = true
      resolve()
    }
  }

  const updateSW = registerSW({
    immediate: true,
    onRegistered(swRegistration) {
      if (swRegistration) {
        // SW登録完了 → 更新チェック開始
        // update()はPromiseを返すので、完了を待ってから少し待機
        // この間にonNeedRefreshが呼ばれれば、リロードされる
        swRegistration
          .update()
          .then(() => {
            // 更新チェック完了後、onNeedRefreshが呼ばれる猶予を与える
            setTimeout(safeResolve, 500)
          })
          .catch((error) => {
            // オフライン時やネットワークエラー時も続行
            console.log('SW update check skipped:', error?.message || 'offline')
            safeResolve()
          })
      } else {
        // SW未対応環境
        safeResolve()
      }
    },
    onNeedRefresh() {
      // 新しいSWが検知された場合、メッセージを表示してからリロード
      console.log('New version available, reloading...')

      // 画面中央にオーバーレイを表示
      const overlay = document.createElement('div')
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
      `

      const message = document.createElement('div')
      message.style.cssText = `
        color: white;
        font-size: 0.9rem;
        text-align: center;
        padding: 1.5rem 2rem;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        backdrop-filter: blur(10px);
      `
      const isJapanese = navigator.language.startsWith('ja')
      message.textContent = isJapanese
        ? '新しいバージョンがあります。再起動します...'
        : 'New version available. Restarting...'

      overlay.appendChild(message)
      document.body.appendChild(overlay)

      // 1.5秒後にリロード
      setTimeout(() => {
        // updateSW(true)でskipWaitingを発火させてからリロード
        updateSW(true)
        // 少し待ってからリロード（SWの切り替えを待つ）
        setTimeout(() => {
          window.location.reload()
        }, 100)
      }, 1500)
      // resolveは呼ばない（リロードするので不要）
    },
  })

  // タイムアウト: SWがサポートされていない環境や登録に時間がかかる場合
  // 2秒以内に更新チェックが完了しなければ続行
  setTimeout(safeResolve, 2000)
})

const app = new App({
  target: document.getElementById('app') as HTMLElement,
})

export default app
