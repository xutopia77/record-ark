<template>
    <div class="thumb-mng-container">
        <div class="thumb-nav-bar">
            <n-button quaternary size="small" @click="router.push('/')">
                ← {{ t('navigation.home') }}
            </n-button>
        </div>
        <div class="preview-area">
            <div class="preview-image xc-scrollbar">
                <ThumbView></ThumbView>
            </div>
            <div class="work-panel">
                <ThumbList v-if="rightPanel === Dty.WorkPanel.List" />
            </div>
        </div>
        <div class="control-bar">
            <ThumbInfoBar />
            <ThumbCtrlBar />
        </div>
    </div>
</template>

<script lang="ts" setup>
import ThumbList from './thumbFileList.vue'
import ThumbView from './thumbView.vue'
import ThumbCtrlBar from './thumbCtrlBar.vue'
import { onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import util, { thumbStatusGet } from '@renderer/utils/util'
import { useAppStore } from '@renderer/stores/AppStore'
const appStore = useAppStore()
const { t } = useI18n()
const router = useRouter()
import * as Dty from '../../../../bridge/dataTypedef'

let rightPanel = computed(() => appStore.rightPanel)

onMounted(() => {
    // Search with current thumb filter mode, only records with thumbnail data
    const searchReq = new Dty.FilesReq()
    searchReq.status = thumbStatusGet(appStore.thumbSearchMode)
    searchReq.bWithThumb = true
    util.thumbsGet(searchReq)

    // Reconcile orphan thumbnail files in background, then refresh list
    util
        .thumbReconcile()
        .then(() => {
            const refreshReq = new Dty.FilesReq()
            refreshReq.status = thumbStatusGet(appStore.thumbSearchMode)
            refreshReq.bWithThumb = true
            return util.thumbsGet(refreshReq)
        })
        .catch((err) => {
            console.error('thumb reconcile failed:', err)
        })
})
</script>

<style scoped>
.thumb-mng-container {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--xc-background-color);
}

.thumb-nav-bar {
    padding: 2px 8px;
    border-bottom: 1px solid #333;
}

.preview-area {
    flex: 1;
    display: flex;
    overflow: hidden;
}

.preview-image {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: #1a1a1a;
    overflow: auto;
}

.work-panel {
    width: 20%;
    max-width: 250px;
    min-width: 200px;
    background-color: #252526;
    border-left: 1px solid #333;
    overflow: hidden;
}

.control-bar {
    height: 60px;
    background-color: #252526;
    border-top: 1px solid #333;
}
</style>
