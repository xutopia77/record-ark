<template>
    <div class="project-settings-container">
        <div class="settings-sidebar">
            <div class="sidebar-header">
                <n-button quaternary size="small" @click="goBack">
                    ← {{ t('common.back') }}
                </n-button>
            </div>

            <n-menu :value="activeTab" :options="menuOptions" @update:value="onMenuSelect" />
        </div>

        <div class="settings-content">
            <div class="content-header">
                <h2>{{ currentTitle }}</h2>
            </div>

            <div class="content-body xc-scrollbar">
                <AdminSetting v-if="activeTab === 'basic'" />
                <AdminFileList v-else-if="activeTab === 'files'" />
                <AdminTagMng v-else-if="activeTab === 'tags'" />
                <thumbMng v-else-if="activeTab === 'thumbnails'" />
                <tinyFileDb v-else-if="activeTab === 'tinyfiles'" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AdminSetting from './admin_setting/AdminSetting.vue'
import AdminFileList from './admin_setting/AdminFileList.vue'
import AdminTagMng from './admin_setting/AdminTagMng.vue'
import thumbMng from './thumbMng/thumbMng.vue'
import tinyFileDb from './tinyFileDb/tinyFileDb.vue'

import type { MenuOption } from 'naive-ui'

const { t } = useI18n()
const router = useRouter()

const activeTab = ref('basic')

const menuOptions = computed((): MenuOption[] => [
    { label: `⚙️ ${t('projectSettings.basicInfo')}`, key: 'basic' },
    { label: `📁 ${t('projectSettings.fileList')}`, key: 'files' },
    { label: `🏷️ ${t('projectSettings.tagManagement')}`, key: 'tags' },
    { label: `🖼️ ${t('projectSettings.thumbnailManagement')}`, key: 'thumbnails' },
    { label: `📦 ${t('projectSettings.smallFileOrganization')}`, key: 'tinyfiles' }
])

const currentTitle = computed(() => {
    const item = menuOptions.value.find((i) => i.key === activeTab.value)
    return item ? String(item.label) : ''
})

const onMenuSelect = (key: string): void => {
    activeTab.value = key
}

const goBack = (): void => {
    router.push('/')
}
</script>

<style scoped>
.project-settings-container {
    height: calc(100% - var(--xc-home-nac-height));
    display: flex;
    background-color: var(--xc-background-color);
    border-top: 1px solid #333;
    box-sizing: border-box;
}

.settings-sidebar {
    width: 200px;
    min-width: 200px;
    background-color: #252526;
    border-right: 1px solid #333;
    display: flex;
    flex-direction: column;
}

.sidebar-header {
    padding: 12px;
    border-bottom: 1px solid #333;
}

.settings-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.content-header {
    padding: 16px 24px;
    border-bottom: 1px solid #333;
    background-color: #252526;
}

.content-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
    color: #fff;
}

.content-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 24px;
}
</style>
