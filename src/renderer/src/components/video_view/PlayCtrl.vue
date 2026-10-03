<template>
    <div class="play-ctrl">
        <!-- Play/Pause button -->
        <n-button quaternary size="small" title="Play/Pause" @click="btnclk_toggle_play">
            {{ iconPlayPause }}
        </n-button>
        <!-- File switch -->
        <n-button quaternary size="small" title="Previous file" @click="changeFile('previous')">
            ⏮
        </n-button>
        <n-button quaternary size="small" title="Stop" @click="btnclk_stop_play()">⏹</n-button>
        <n-button quaternary size="small" title="Next file" @click="changeFile('next')">⏭</n-button>
        <!-- Speed selection -->
        <n-select
            v-model:value="appStore.videoPlayCtrl.playbackRate"
            size="tiny"
            class="speed-select"
            :options="speedOptions"
            :consistent-menu-width="false"
        />
        <!-- Volume control -->
        <n-button quaternary size="small" :title="t('playCtrl.volume')" @click="toggleMute">
            {{ volumeIcon }}
        </n-button>
        <n-slider
            v-model:value="appStore.videoPlayCtrl.volume"
            class="volume-slider"
            :min="0"
            :max="1"
            :step="0.01"
            :tooltip="false"
            @update:value="changeVolume"
        />
        <!-- Playback time -->
        <span class="xc-text">{{ curTime }}/{{ videoDuration }}</span>
        <!-- Frame control playback -->
        <n-button quaternary size="small" title="Previous frame" @click="previousFrame">◀️</n-button>
        <n-button quaternary size="small" title="Next frame" @click="nextFrame">▶️</n-button>
        <span class="xc-text" style="color: darkcyan">{{ frameInfo }}</span>
        <span class="xc-text" style="color: chocolate">{{ frameRate }}</span>
        <div v-if="appStore.isProjectMode" class="right-area-ctrl">
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
                :consistent-menu-width="false"
            />
            <n-button
                quaternary
                size="small"
                title="Delete selected files"
                @click="btnclk_delSltVideos"
            >
                🗑
            </n-button>
            <n-tooltip v-if="appStore.fileSearchStatus == Dty.Fstatus.Deleted" trigger="hover">
                <template #trigger>
                    <n-select
                        v-model:value="delType"
                        size="tiny"
                        class="mini-select"
                        :options="delTypeOptions"
                        :consistent-menu-width="false"
                    />
                </template>
                {{ delTypeTip }}
            </n-tooltip>
            <n-button quaternary size="small" title="Edit file tags" @click="bShowTagModal = true">
                🏷️
            </n-button>
        </div>
        <TagModal :visible="bShowTagModal" @close="bShowTagModal = false" />
    </div>
</template>

<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { NTooltip } from 'naive-ui'
import { useAppStore } from '../../stores/AppStore'
import { useI18n } from 'vue-i18n'
import '@renderer/assets/common.css'
import util from '../../utils/util'
import TagModal from './TagModal.vue'
const appStore = useAppStore()

const bShowTagModal = ref(false)
import * as Dty from '../../../../bridge/dataTypedef'

const { t } = useI18n()

// Playback speed options
const speedOptions = [
    { label: '0.5x', value: 0.5 },
    { label: '1x', value: 1 },
    { label: '1.5x', value: 1.5 },
    { label: '2x', value: 2 },
    { label: '4x', value: 4 },
    { label: '6x', value: 6 }
]

// File level options (0-5), each option shows its tag description on hover
const levelOptions = Array.from({ length: 6 }, (_, i) => ({
    label: `${i}☆`,
    value: i,
    render: (): ReturnType<typeof h> => {
        const label = `${i}☆`
        const tag = appStore.tags.find((item) => item.name === `sys_score${i}`)
        const desc = tag?.description ?? ''
        if (desc === '') {
            return h('span', null, label)
        }
        return h(NTooltip, null, {
            trigger: () => h('span', null, label),
            default: () => desc
        })
    }
}))

// volume control
const toggleMute = (): void => {
    appStore.videoPlayCtrl.muted = !appStore.videoPlayCtrl.muted
    util.set_volume_muted(appStore.videoPlayCtrl.muted)
}

const changeVolume = (): void => {
    util.set_volume(appStore.videoPlayCtrl.volume)
    if (appStore.videoPlayCtrl.volume > 0 && appStore.videoPlayCtrl.muted) {
        appStore.videoPlayCtrl.muted = false
    }
}

const volumeIcon = computed(() => {
    if (appStore.videoPlayCtrl.muted || appStore.videoPlayCtrl.volume === 0) {
        return '🔇'
    } else if (appStore.videoPlayCtrl.volume < 0.3) {
        return '🔈'
    } else if (appStore.videoPlayCtrl.volume < 0.7) {
        return '🔉'
    } else {
        return '🔊'
    }
})

const curTime = computed(() => {
    return Dty.Utils.time_2_msec_str(appStore.videoPlayCtrl.curTime)
})

const videoDuration = computed(() => {
    let str = '00:00:00.000'
    if (appStore.curSltVideo?.mediaInfo != null) {
        str = Dty.Utils.time_2_msec_str(appStore.curSltVideo.mediaInfo.duration)
    }
    return str
})

const frameInfo = computed(() => genFrame())

const frameRate = computed(() => {
    if (appStore.curSltVideo == null) return ''
    if (appStore.curSltVideo.mediaInfo == null) return ''
    const frameRateStr = appStore.curSltVideo.mediaInfo.video.frame_rate.toFixed(3)
    return `${frameRateStr}fps`
})

function genFrame(): string {
    if (appStore.curSltVideo == null) return ''
    if (appStore.curSltVideo.mediaInfo == null) return ''
    const curTime = appStore.videoPlayCtrl.curTime
    const frameRate = appStore.curSltVideo.mediaInfo.video.frame_rate
    const frameCount = Math.floor(appStore.curSltVideo.mediaInfo.video.nb_frames)
    const frame = Math.floor(curTime * frameRate)
    return `${frame}/${frameCount}f`
}

function nextFrame(): void {
    if (appStore.curSltVideo == null) {
        util.addToastInfo(t('playCtrl.selectVideoFirst'))
        return
    }
    if (appStore.func_nextFrame) {
        appStore.func_nextFrame()
    }
}

function previousFrame(): void {
    if (appStore.curSltVideo == null) {
        util.addToastInfo(t('playCtrl.selectVideoFirst'))
        return
    }
    if (appStore.func_prevFrame) {
        appStore.func_prevFrame()
    }
}

function btnclk_stop_play(): void {
    if (appStore.curSltVideo == null) {
        util.addToastInfo(t('playCtrl.selectVideoFirst'))
        return
    }
    util.stop_play()
}

// Toggle play/pause status
const btnclk_toggle_play = (): void => {
    if (appStore.curSltVideo == null) {
        util.addToastInfo(t('playCtrl.selectVideoFirst'))
        return
    }
    appStore.videoPlayCtrl.isPlay = !appStore.videoPlayCtrl.isPlay
}

const iconPlayPause = ref('▶')
watch(
    () => appStore.videoPlayCtrl.isPlay,
    (isPlay: boolean) => {
        iconPlayPause.value = isPlay ? '⏸' : '▶'
    }
)

// ==================================== File level setting
const fileLevel = ref(0)
async function btnclk_set_file_level(): Promise<void> {
    const req = new Dty.FileTagsReq()
    const levelVal = fileLevel.value
    if (levelVal < 0 || levelVal > 5) {
        util.addToastErr(t('playCtrl.levelRangeError'))
        return
    }
    const tagName = `sys_score${levelVal}`
    for (const item of appStore.curCheckedVideo) {
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
    await util.file_tags_set(req, { bNeedSltCurVideo: true, bNeedUpdate: true })
    appStore.curCheckedVideo.clear()
}

// ==================================== File switch
function changeFile(flag: string): void {
    // Find current video index from appStore's videoList based on curSltVideo
    if (appStore.videoList.length == 0) {
        util.addToastInfo(t('playCtrl.noVideoFiles'))
        return
    }
    if (appStore.curSltVideo == null) {
        appStore.curSltVideo = appStore.videoList[0]
        return
    }
    let curVideoIdx = -1
    for (let i = 0; i < appStore.videoList.length; i++) {
        if (appStore.videoList[i].path == appStore.curSltVideo.path) {
            curVideoIdx = i
            break
        }
    }
    if (curVideoIdx == -1) {
        appStore.curSltVideo = appStore.videoList[0]
        return
    }

    if (flag == 'previous') {
        if (curVideoIdx == 0) {
            util.addToastInfo(t('playCtrl.alreadyFirstFile'))
            appStore.curSltVideo = appStore.videoList[curVideoIdx]
            return
        }
        appStore.curSltVideo = appStore.videoList[curVideoIdx - 1]
    } else {
        if (curVideoIdx == appStore.videoList.length - 1) {
            util.addToastInfo(t('playCtrl.alreadyLastFile'))
            appStore.curSltVideo = appStore.videoList[curVideoIdx]
            return
        }
        appStore.curSltVideo = appStore.videoList[curVideoIdx + 1]
    }
}

type DelType = 'delVideo' | 'delVideoAndThumb' | 'restore'

const delType = ref<DelType>('delVideo')

const delTypeOptions = computed(() => [
    { label: t('playCtrl.delVideoOnly'), value: 'delVideo' },
    { label: t('playCtrl.delAll'), value: 'delVideoAndThumb' },
    { label: t('playCtrl.restore'), value: 'restore' }
])

// Tooltip text describes the logic of the currently selected delete type
const delTypeTipMap: Record<DelType, () => string> = {
    delVideo: () => t('playCtrl.delVideoOnlyTip'),
    delVideoAndThumb: () => t('playCtrl.delAllTip'),
    restore: () => t('playCtrl.restoreTip')
}
const delTypeTip = computed(() => delTypeTipMap[delType.value]())

// Reset delete type when search mode changes
watch(
    () => appStore.fileSearchStatus,
    () => {
        delType.value = 'delVideo'
    }
)

function btnclk_delSltVideos(): void {
    const curCheckedVideo = appStore.curCheckedVideo
    if (curCheckedVideo == null) {
        util.addToastInfo(t('playCtrl.noSelectedFile'))
        return
    }

    const req: Dty.DeleteFileReq = new Dty.DeleteFileReq()
    for (const item of curCheckedVideo) {
        const fInfo = new Dty.File()
        fInfo.path = item.path
        fInfo.repo = item.repo
        req.files.push(fInfo)
    }
    if (req.files.length == 0) {
        util.addToastInfo(t('playCtrl.noSelectedFile'))
        return
    }
    if (appStore.fileSearchStatus == Dty.Fstatus.Normal) {
        // Normal mode: move video to trash, thumbnails untouched
        req.type = 'del'
    } else if (delType.value == 'restore') {
        // Trash mode: restore video to repo root folder
        req.type = 'restore'
    } else {
        // Trash mode: delete video, optionally also delete thumbnails
        req.type = 'destroy'
        req.bDelThumb = delType.value == 'delVideoAndThumb'
    }
    util.filesDel(req)
    appStore.curCheckedVideo.clear()
}
</script>

<style scoped>
.play-ctrl {
    height: 50px;
    width: 100%;
    margin: 0;
    padding: 0 4px;
    display: flex;
    align-items: center;
    gap: 2px;
    background-color: #252526;
}

.right-area-ctrl {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 2px;
}

.speed-select {
    width: 70px;
}

.mini-select {
    width: 64px;
}

.volume-slider {
    width: 60px;
    margin: 0 8px;
}

.xc-text {
    padding-right: 3px;
    white-space: nowrap;
}
</style>
