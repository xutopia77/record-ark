/// <reference types="vite/client" />

// Makes this file a module so `declare global` below takes effect
export {}

// Naive UI discrete API message instance, set in AppEntry.vue
declare global {
    interface Window {
        $message: import('naive-ui').MessageApi
        $dialog: import('naive-ui').DialogApi
    }
}

// Internationalization type definition
declare module '@intlify/core-base' {
    // Used for type inference
    interface VueI18n {
        t(key: string, ...args: unknown[]): string
    }
}
