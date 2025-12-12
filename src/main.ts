import './App.css'
import App from './App.svelte'
import { registerSW } from 'virtual:pwa-register'

// PWA更新を初回Pullより先にチェック
// 新しいSWがあれば即座にリロード（API制限の節約）
const updateSW = registerSW({
  immediate: true,
  onRegistered(swRegistration) {
    swRegistration?.update()
  },
  onNeedRefresh() {
    // 新しいSWが検知された場合、即座にリロード
    // これにより、App.svelteのonMountでの初回Pullより先に更新が適用される
    console.log('New version available, reloading...')
    updateSW(true) // true = immediate reload
  },
})

const app = new App({
  target: document.getElementById('app') as HTMLElement,
})

export default app
