import './App.css'
import App from './App.svelte'
import { registerSW } from 'virtual:pwa-register'

const app = new App({
  target: document.getElementById('app') as HTMLElement,
})

// Ensure installed PWA picks up new versions quickly
registerSW({
  immediate: true,
  onRegistered(swRegistration) {
    swRegistration?.update()
  },
})

export default app
