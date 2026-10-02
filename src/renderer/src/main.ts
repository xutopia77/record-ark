import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
const pinia = createPinia()
import naive from 'naive-ui'
import App from './App.vue'
import i18n from './i18n'

import router from './router/router'
const app = createApp(App)
app.use(router)
app.use(pinia)
// Use internationalization
app.use(i18n)
// Register Naive UI components globally
app.use(naive)
app.mount('#app')
