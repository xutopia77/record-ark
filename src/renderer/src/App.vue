<script lang="ts" setup>
import { darkTheme } from 'naive-ui'
import AppEntry from './components/AppEntry.vue'
</script>

<template>
    <n-config-provider :theme="darkTheme" style="height: 100vh">
        <n-message-provider>
            <n-dialog-provider>
                <AppEntry />
            </n-dialog-provider>
        </n-message-provider>
    </n-config-provider>
</template>

<style scoped></style>
