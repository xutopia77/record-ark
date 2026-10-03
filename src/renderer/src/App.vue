<script lang="ts" setup>
import { computed } from 'vue'
import { darkTheme, zhCN, enUS } from 'naive-ui'
import type { Composer } from 'vue-i18n'
import i18n from './i18n'
import AppEntry from './components/AppEntry.vue'

const naiveLocale = computed(() =>
    (i18n.global as unknown as Composer).locale.value === 'zh-CN' ? zhCN : enUS
)
</script>

<template>
    <n-config-provider :theme="darkTheme" :locale="naiveLocale" style="height: 100vh">
        <n-message-provider>
            <n-dialog-provider>
                <AppEntry />
            </n-dialog-provider>
        </n-message-provider>
    </n-config-provider>
</template>

<style scoped></style>
