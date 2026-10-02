<template>
    <n-drawer v-model:show="appStore.bPageResentMsg" placement="right" :width="350">
        <n-drawer-content :title="t('recentMessages.title')" closable>
            <div class="header-actions">
                <n-button size="small" type="error" @click="btn_clear_all_msg">
                    {{ t('recentMessages.clearAll') }}
                </n-button>
                <n-button size="small" type="primary" @click="appStore.bPageResentMsg = false">
                    {{ t('recentMessages.close') }}
                </n-button>
            </div>
            <div class="message-list">
                <div
                    v-for="message in recentMessages"
                    :key="message.id"
                    class="message-item"
                    :class="message.type"
                >
                    <span class="message-icon">{{ getIcon(message.type) }}</span>
                    <div class="message-content">
                        <span class="message-text">{{ message.message }}</span>
                        <span class="message-time">{{ formatTime(message.timestamp) }}</span>
                    </div>
                </div>
                <div v-if="recentMessages.length === 0" class="no-messages">
                    {{ t('recentMessages.noMessages') }}
                </div>
            </div>
        </n-drawer-content>
    </n-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Utils from '@renderer/utils/util'
import { useAppStore } from '@renderer/stores/AppStore'
import { useI18n } from 'vue-i18n'
const appStore = useAppStore()
import * as DatType from '../../../../bridge/dataTypedef'

const { t } = useI18n()

// Get latest 5 messages (from history)
const recentMessages = computed(() => {
    if (appStore.historyToasts == null) {
        return []
    }
    return appStore.historyToasts.slice(-5).reverse()
})

// Clear all history messages
function btn_clear_all_msg(): void {
    Utils.clearHistoryToasts()
}

// Get message icon
const getIcon = (type: DatType.MessageShowType): string => {
    switch (type) {
        case 'success':
            return '✅'
        case 'error':
            return '❌'
        case 'warning':
            return '⚠️'
        case 'info':
            return 'ℹ️'
        default:
            return 'ℹ️'
    }
}

// Format time
const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)

    if (minutes < 1) return t('recentMessages.justNow')
    if (minutes < 60) return t('recentMessages.minutesAgo', { minutes })

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('recentMessages.hoursAgo', { hours })

    const days = Math.floor(hours / 24)
    return t('recentMessages.daysAgo', { days })
}
</script>

<style scoped>
.header-actions {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
}

.message-list {
    max-height: 300px;
    overflow-y: auto;
    padding: 3px 0; /* Reduce padding */
}

.message-item {
    display: flex;
    padding: 6px 12px; /* Reduce padding */
    border-bottom: 1px solid var(--border-color, #444);
    transition: background-color 0.2s ease;
    min-height: auto; /* Ensure height determined by content */
}

.message-item:hover {
    background-color: var(--hover-bg, #3a3a3a);
}

.message-item:last-child {
    border-bottom: none;
}

.message-item.success {
    border-left: 4px solid var(--success-color, #28a745);
}

.message-item.error {
    border-left: 4px solid var(--error-color, #dc3545);
}

.message-item.warning {
    border-left: 4px solid var(--warning-color, #ffc107);
    color: var(--warning-text, #e0a800);
}

.message-item.info {
    border-left: 4px solid var(--info-color, #17a2b8);
}

.message-icon {
    font-size: 14px; /* Reduce icon size */
    margin-right: 8px; /* Reduce right margin */
    flex-shrink: 0;
    display: flex;
    align-items: center;
}

.message-content {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.message-text {
    display: block;
    margin-bottom: 3px; /* Reduce bottom margin */
    color: var(--text-color, #ffffff);
    word-break: break-word;
    font-size: 12px; /* Reduce font size */
}

.message-time {
    font-size: 10px; /* Reduce time label font size */
    color: var(--muted-text-color, #aaa);
    align-self: flex-end;
}

.no-messages {
    padding: 20px 12px; /* Reduce padding */
    text-align: center;
    color: var(--muted-text-color, #aaa);
    font-style: italic;
    font-size: 12px; /* Reduce font size */
}
</style>
