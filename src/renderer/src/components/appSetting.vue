<template>
    <div class="app-setting-container">
        <div class="setting-header">
            <n-button quaternary size="small" @click="goBack">← {{ t('common.back') }}</n-button>
            <h2>{{ t('appSetting.title') }}</h2>
        </div>

        <div class="setting-content xc-scrollbar">
            <div class="setting-card">
                <h3 class="setting-title">{{ t('appSetting.language') }}</h3>
                <n-select
                    v-model:value="selectedLanguage"
                    size="small"
                    style="width: 200px"
                    :options="languageOptions"
                />
            </div>

            <div class="setting-card">
                <h3 class="setting-title">{{ t('common.operations') }}</h3>
                <div class="action-buttons">
                    <n-button size="small" type="primary" @click="btnclk_saveSettings">
                        {{ t('appSetting.operations.save') }}
                    </n-button>
                    <n-button size="small" @click="btnclk_resetSettings">
                        {{ t('appSetting.operations.reset') }}
                    </n-button>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import '@renderer/assets/common.css'
import * as Dty from '../../../bridge/dataTypedef'
import { useAppStore } from '@renderer/stores/AppStore'
import { IpcApi } from '../utils/ipcApi'
import util from '../utils/util'

const { t, locale } = useI18n()
const router = useRouter()
const appStore = useAppStore()

const selectedLanguage = ref<Dty.LangType>('en-US')

const languageOptions = [
    { label: t('appSetting.languageOptions.chinese'), value: 'zh-CN' },
    { label: t('appSetting.languageOptions.english'), value: 'en-US' }
]

const goBack = (): void => {
    router.push('/')
}

async function btnclk_saveSettings(): Promise<void> {
    try {
        if (appStore.prj) {
            appStore.prj.language = selectedLanguage.value
        }

        localStorage.setItem('locale', selectedLanguage.value)
        locale.value = selectedLanguage.value

        const req: Dty.Req = {
            cmd: Dty.CmdType.appConfigSave,
            data: JSON.stringify({ language: selectedLanguage.value })
        }

        const resp = await IpcApi.trigger_event<string, string>(req)
        if (resp.code === Dty.RespCode.Success) {
            util.addToastInfo(t('common.success'))
        } else {
            console.error('[appSetting] Failed to save app config:', resp.status)
        }
    } catch (error) {
        console.error('Failed to save language setting:', error)
    }
    return
}

async function btnclk_resetSettings(): Promise<void> {
    selectedLanguage.value = 'en-US'
    if (appStore.prj) {
        appStore.prj.language = 'en-US'
    }

    localStorage.setItem('locale', 'en-US')
    locale.value = 'en-US'
}

onMounted(() => {
    const storedLanguage = localStorage.getItem('locale') as Dty.LangType | null

    if (storedLanguage) {
        selectedLanguage.value = storedLanguage
        if (appStore.prj) {
            appStore.prj.language = storedLanguage
        }
    } else if (appStore.appInfo && appStore.appInfo.language) {
        selectedLanguage.value = appStore.appInfo.language
        if (appStore.prj) {
            appStore.prj.language = appStore.appInfo.language
        }
    } else if (appStore.prj && appStore.prj.language) {
        selectedLanguage.value = appStore.prj.language
    } else {
        selectedLanguage.value = 'en-US'
        if (appStore.prj) {
            appStore.prj.language = 'en-US'
        }
    }
})
</script>

<style scoped>
.app-setting-container {
    height: calc(100% - var(--xc-home-nac-height));
    width: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--xc-background-color);
    color: var(--xc-text-color);
    border-top: 1px solid #333;
    box-sizing: border-box;
}

.setting-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 24px;
    background-color: #252526;
    border-bottom: 1px solid #333;
}

.setting-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
    color: #fff;
}

.setting-content {
    flex: 1;
    padding: 16px 24px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.setting-card {
    background-color: #2d2d30;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 16px;
}

.setting-title {
    margin: 0 0 12px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid #444;
    color: #ddd;
    font-size: 14px;
    font-weight: 600;
}

.action-buttons {
    display: flex;
    gap: 12px;
}
</style>
