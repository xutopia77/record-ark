<template>
    <div class="home-navigation">
        <div class="btn-container">
            <n-dropdown
                trigger="click"
                :options="fileMenuOptions"
                @select="onFileMenuSelect"
            >
                <span class="menu-item">{{ t('navigation.file') }}</span>
            </n-dropdown>
            <n-dropdown
                trigger="click"
                :options="toolsMenuOptions"
                @select="onToolsMenuSelect"
            >
                <span class="menu-item">{{ t('navigation.tools') }}</span>
            </n-dropdown>
            <span class="menu-item" @click="showAboutModal">
                {{ t('navigation.menuItems.about') }}
            </span>
            <span class="menu-item" @click="btn_settings">🌐</span>
        </div>

        <div>
            <n-button quaternary size="small" @click="appStore.bPageResentMsg = true">
                🔔
            </n-button>
        </div>
    </div>

    <CreateProjectModal
        :visible="showCreateModal"
        @close="showCreateModal = false"
        @created="onProjectCreated"
    />

    <n-modal
        v-model:show="isAboutModalVisible"
        preset="dialog"
        :title="`${t('navigation.menuItems.about')} ${t('common.info')}`"
        :positive-text="t('common.cancel')"
        @positive-click="hideAboutModal"
    >
        {{ t('common.currentVersion') }}：{{ appStore.prj?.version || '1.0.0' }}
    </n-modal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/AppStore'
import '../assets/common.css'
import util from '../utils/util'
import { useRouter } from 'vue-router'
const router = useRouter()

import { IpcApi } from '../utils/ipcApi'
import * as Dty from '../../../bridge/dataTypedef'

import { useI18n } from 'vue-i18n'
import CreateProjectModal from './CreateProjectModal.vue'

import type { DropdownOption } from 'naive-ui'

const appStore = useAppStore()
const { t } = useI18n()

const showCreateModal = ref(false)
const isAboutModalVisible = ref<boolean>(false)

const closePrjState = async (): Promise<void> => {
    if (appStore.isProjectMode) {
        const closeReq: Dty.Req = {
            cmd: Dty.CmdType.prjClose
        }
        await IpcApi.trigger_event(closeReq)
        appStore.prj = null
        appStore.appInfo.prjFile = ''
    }
    if (appStore.curSltVideo) {
        appStore.curSltVideo = null
        appStore.curSltVideoName4Play = ''
        util.clear_cur_slt_video_info(null)
    }
    appStore.videoList = []
    appStore.videoTotalNum = 0
}

const fileMenuOptions = computed((): DropdownOption[] => {
    const options: DropdownOption[] = [
        { label: t('navigation.menuItems.createProject'), key: 'createProject' },
        { label: t('navigation.menuItems.openProject'), key: 'openProject' }
    ]
    if (appStore.isProjectMode) {
        options.push(
            { label: t('navigation.menuItems.closeProject'), key: 'closeProject' },
            { label: t('navigation.menuItems.saveProject'), key: 'saveProject' }
        )
    }
    options.push(
        { type: 'divider', key: 'divider' },
        { label: t('navigation.menuItems.exit'), key: 'exit' }
    )
    return options
})

const toolsMenuOptions = computed((): DropdownOption[] => {
    const options: DropdownOption[] = []
    if (appStore.isProjectMode) {
        options.push({ label: t('navigation.menuItems.projectSettings'), key: 'projectSettings' })
    }
    options.push({ label: t('navigation.menuItems.settings'), key: 'settings' })
    return options
})

const onProjectCreated = async (): Promise<void> => {
    await closePrjState()

    const req = await util.start_app()
    if (req.code != 0) {
        util.addToastErr(`${t('navigation.startupFailed')} ${req.status}`)
        return
    }
    util.addToastInfo(t('navigation.openProjectSuccess'))
    router.push('/')
}

const btn_openProject = async (): Promise<void> => {
    const req: Dty.Req = {
        cmd: Dty.CmdType.prjOpen
    }
    const response: Dty.Resp<Dty.Prj> = await IpcApi.trigger_event(req)
    if (response.code != 0) {
        if (response.status !== 'user canceled') {
            util.addToastErr(`${t('navigation.openProjectFailed')}: ${response.status}`)
        }
        return
    }
    if (!response.data) return

    await closePrjState()

    const prj = response.data
    appStore.prj = prj

    const startReq = await util.start_app()
    if (startReq.code != 0) {
        util.addToastErr(`${t('navigation.startupFailed')} ${startReq.status}`)
        return
    }

    appStore.appInfo.prjFile = prj.path || ''

    const searchReq = new Dty.FilesReq()
    searchReq.status = [appStore.fileSearchStatus]
    await util.files_get(searchReq)

    util.addToastInfo(t('navigation.openProjectSuccess'))
    router.push('/')
}

const btn_closeProject = async (): Promise<void> => {
    await closePrjState()
    router.push('/welcome')
    util.addToastInfo(t('navigation.menuItems.closeProject'))
}

const btn_saveProject = async (): Promise<void> => {
    const response = await util.saveFileManagementProject()
    if (response.code === 0) {
        util.addToastInfo(`${t('navigation.menuItems.saveProject')} ${t('common.success')}`)
    } else if (response.status !== 'user canceled') {
        util.addToastErr(
            `${t('navigation.menuItems.saveProject')} ${t('common.failed')}: ${response.status}`
        )
    }
}

const exitApp = (): void => {
    window.close()
}

const onFileMenuSelect = (key: string): void => {
    switch (key) {
        case 'createProject':
            showCreateModal.value = true
            break
        case 'openProject':
            btn_openProject()
            break
        case 'closeProject':
            btn_closeProject()
            break
        case 'saveProject':
            btn_saveProject()
            break
        case 'exit':
            exitApp()
            break
    }
}

const showAboutModal = (): void => {
    isAboutModalVisible.value = true
}

const hideAboutModal = (): void => {
    isAboutModalVisible.value = false
}

const btn_settings = (): void => {
    router.push('/app_setting')
}

const onToolsMenuSelect = (key: string): void => {
    switch (key) {
        case 'projectSettings':
            router.push('/project_settings')
            break
        case 'settings':
            btn_settings()
            break
    }
}
</script>

<style scoped>
.home-navigation {
    height: var(--xc-home-nac-height);
    width: 100%;
    display: flex;
    background-color: #252526;
    color: #ccc;
    align-items: center;
    justify-content: space-between;
}

.btn-container {
    display: flex;
    flex-shrink: 0;
}

.menu-item {
    padding: 0 10px;
    cursor: pointer;
    height: 100%;
    display: flex;
    align-items: center;
}

.menu-item:hover {
    background-color: #37373d;
}
</style>
