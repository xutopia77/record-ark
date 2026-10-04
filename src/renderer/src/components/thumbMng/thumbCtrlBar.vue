<template>
    <div class="play-ctrl">
        <span class="xc-text" style="padding-right: 3px">
            {{ t('thumbCtrlBar.totalFiles') }}: {{ appStore.thumbTotalNum }}
        </span>
        <PaginationCtrl page-type="thumb" style="flex: 1" />
        <div class="right-area-ctrl">
            <n-button
                quaternary
                size="small"
                title="Set file level"
                @click="btnclk_set_file_level"
            >
                ⭐
            </n-button>
            <n-select
                v-model:value="fileLevel"
                size="tiny"
                class="mini-select"
                :options="levelOptions"
                :render-label="renderLevelLabel"
                :consistent-menu-width="false"
            />
            <n-button
                size="small"
                type="error"
                :title="t('thumbCtrlBar.deleteFile')"
                @click="btn_thumbDel()"
            >
                {{ t('thumbCtrlBar.delete') }}
            </n-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { h, ref } from 'vue'
import { useAppStore } from '../../stores/AppStore'
import { useI18n } from 'vue-i18n'
const appStore = useAppStore()
import '@renderer/assets/common.css'
import util from '@renderer/utils/util'
import PaginationCtrl from '@renderer/components/common/paginationCtrl.vue'
import * as Dty from '../../../../bridge/dataTypedef'

const { t } = useI18n()

// ==================================== File level setting (same as PlayCtrl)
const fileLevel = ref(0)
// File level options (0-5)
const levelOptions = Array.from({ length: 6 }, (_, i) => ({ label: `${i}☆`, value: i }))

// Render level option label with its tag description as native hover tooltip
const renderLevelLabel = (option: { value?: number | string }): ReturnType<typeof h> => {
    const levelVal = Number(option.value)
    const label = `${levelVal}☆`
    const tag = appStore.tags.find((item) => item.name === `sys_score${levelVal}`)
    const desc = tag?.description ?? ''
    if (desc === '') {
        return h('span', null, label)
    }
    return h('span', { title: desc }, label)
}

async function btnclk_set_file_level(): Promise<void> {
    const req = new Dty.FileTagsReq()
    const levelVal = fileLevel.value
    if (levelVal < 0 || levelVal > 5) {
        util.addToastErr(t('playCtrl.levelRangeError'))
        return
    }
    const tagName = `sys_score${levelVal}`
    for (const item of appStore.curChkThumb) {
        const fileTag: Dty.FileTagsReqItem = {
            fileId: item.id,
            tagName: tagName
        }
        req.fileTags.push(fileTag)
    }
    if (req.fileTags.length === 0) {
        util.addToastErr(t('playCtrl.selectFileFirst'))
        return
    }
    await util.file_tags_set(req, { bNeedUpdate: true, bThumbList: true })
    appStore.curChkThumb.clear()
}

function btn_thumbDel(): void {
    const curChkThumb = appStore.curChkThumb
    if (curChkThumb == null) {
        util.addToastInfo(t('thumbCtrlBar.noSelectedFile'))
        return
    }

    const req: Dty.DeleteFileReq = new Dty.DeleteFileReq()
    for (const item of curChkThumb) {
        const fInfo = new Dty.File()
        fInfo.name = item.name
        fInfo.path = item.path
        fInfo.repo = item.repo
        req.files.push(fInfo)
    }
    if (req.files.length == 0) {
        util.addToastInfo(t('thumbCtrlBar.noSelectedFile'))
        return
    }
    req.type = 'destroy'
    console.log('delete file req', req)
    util.thumbsDel(req)
    appStore.curChkThumb.clear()
}
</script>

<style scoped>
.play-ctrl {
    height: 60px;
    width: 100%;
    margin: 0;
    padding: 0;
    display: flex;
    align-items: center;
    background-color: #252526;
    /* VSCode sidebar background color */
}

.right-area-ctrl {
    margin-left: auto;
    display: flex;
    align-items: center;
}

.mini-select {
    width: 64px;
}

.play-ctrl :deep(.pagination-controls) {
    background-color: transparent;
    border-top: none;
    padding: 0 4px;
}
</style>
