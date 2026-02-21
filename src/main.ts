import './App.css'
import App from './App.svelte'

// SW更新チェックは独立モジュールに分離（循環インポート防止）
// App.svelte から直接 './lib/sw-check' をインポートして使用する
import './lib/sw-check'

const app = new App({
  target: document.getElementById('app') as HTMLElement,
})

export default app
