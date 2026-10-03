<template>
    <div class="home-editor-container">
        <div class="editor-main">
            <div class="video-area">
                <div class="video-wrapper">
                    <video
                        v-show="viewModel === 'video'"
                        ref="videoRef"
                        :src="appStore.videoPlayCtrl.curSrc"
                    ></video>
                    <ThumbnailView v-show="viewModel === 'thumbnail'"></ThumbnailView>
                </div>
            </div>
            <div class="edit-panel">
                <div class="view-switch">
                    <n-button-group size="small" style="width: 100%">
                        <n-tooltip trigger="hover" placement="bottom">
                            <template #trigger>
                                <n-button
                                    style="width: 50%"
                                    :type="viewModel === 'video' ? 'primary' : 'default'"
                                    secondary
                                    @click="btn_viewChange('video')"
                                >
                                    🎞️
                                </n-button>
                            </template>
                            {{ t('navigation.menuItems.videoView') }}
                        </n-tooltip>
                        <n-tooltip trigger="hover" placement="bottom">
                            <template #trigger>
                                <n-button
                                    style="width: 50%"
                                    :type="viewModel === 'thumbnail' ? 'primary' : 'default'"
                                    secondary
                                    @click="btn_viewChange('thumbnail')"
                                >
                                    🖼️
                                </n-button>
                            </template>
                            {{ t('navigation.menuItems.thumbnailView') }}
                        </n-tooltip>
                    </n-button-group>
                </div>
                <VideList v-if="appStore.isProjectMode" />
            </div>
        </div>
        <div class="control-area">
            <PlayProgressBar />
            <PlayCtrl />
        </div>
    </div>
</template>

<script lang="ts" setup>
import VideList from './video_view/work_panel/VideList.vue'
import ThumbnailView from './video_view/ThumbnailView.vue'
import PlayProgressBar from './video_view/PlayProgressBar.vue'
import PlayCtrl from './video_view/PlayCtrl.vue'
import { PlayReq } from '../utils/util'
import { ref, onMounted, watch, onBeforeMount, computed, onUnmounted, onBeforeUnmount } from 'vue'
import util from '@renderer/utils/util'
import { useAppStore } from '@renderer/stores/AppStore'
import { useI18n } from 'vue-i18n'
const appStore = useAppStore()
import * as Dty from '../../../bridge/dataTypedef'

const { t } = useI18n()

const viewModel = computed(() => {
    return appStore.curViewModel
})

const videoRef = ref<HTMLVideoElement | null>(null)

const btn_viewChange = (mode: 'video' | 'thumbnail'): void => {
    util.viewModelChange(mode)
}

watch(
    () => appStore.curSltVideoName4Play,
    () => {
        if (
            appStore.curSltVideoName4Play == null ||
            appStore.curSltVideoName4Play == '' ||
            appStore.curSltVideo == null
        ) {
            if (videoRef.value) {
                videoRef.value.src = ''
            }
            return
        }
        const clearReq = new Dty.ClearSltInfoReq()
        clearReq.bNotClear_curSltVideo = true
        util.clear_cur_slt_video_info(clearReq)

        const playReq = new PlayReq(Dty.File.makePlayUrl(appStore.curSltVideo))
        if (videoRef.value == null) {
            return
        }
        util.play_video(videoRef.value, playReq)
    }
)

watch(
    () => appStore.videoPlayCtrl.isPlay,
    () => {
        if (videoRef.value == null) {
            return
        }
        util.toggle_play(videoRef.value)
    }
)

function nextFrame(): void {
    if (videoRef.value != null) {
        const frameRate = appStore.curSltVideo?.mediaInfo?.video.frame_rate
        if (frameRate == null) {
            return
        }
        const video = videoRef.value
        if (!video.paused) video.pause()
        const frameInterval = 1 / frameRate
        util.set_video_cur_time(video, video.currentTime + frameInterval)
    }
}

function previousFrame(): void {
    if (videoRef.value != null) {
        const frameRate = appStore.curSltVideo?.mediaInfo?.video.frame_rate
        if (frameRate == null) {
            return
        }
        const video = videoRef.value
        if (!video.paused) video.pause()
        const frameInterval = 1 / frameRate
        util.set_video_cur_time(video, Math.max(0, video.currentTime - frameInterval))
    }
}

watch(
    () => videoRef.value,
    (newVal) => {
        if (newVal == null) {
            return
        }
        if (appStore.curSltVideo != null) {
            if (videoRef.value == null) {
                return
            }
            const playReq = new PlayReq(Dty.File.makePlayUrl(appStore.curSltVideo))
            util.play_video(videoRef.value, playReq)
        }
    }
)

watch(
    () => appStore.curViewModel,
    (newVal) => {
        if (newVal === 'video') {
            if (appStore.curSltVideo == null) {
                return
            }

            if (videoRef.value == null) {
                return
            }
            const playReq = new PlayReq(Dty.File.makePlayUrl(appStore.curSltVideo))
            if (appStore.thumbSeekTime != 0) {
                playReq.playStartTimeSec = appStore.thumbSeekTime
            }
            util.play_video(videoRef.value, playReq)
        } else if (newVal === 'thumbnail') {
            util.clear_cur_slt_video_info({ clearModel: 'changeToThumbnail' })
        }
    }
)

watch(
    () => appStore.videoPlayCtrl.playbackRate,
    () => {
        if (videoRef.value != null) {
            videoRef.value.playbackRate = appStore.videoPlayCtrl.playbackRate
        }
    }
)

watch(
    () => appStore.barSeekTime,
    (newValue) => {
        if (videoRef.value != null && appStore.videoPlayCtrl.curSrc) {
            const targetTime = newValue + appStore.videoPlayCtrl.videoStartTime

            const wasPlaying = !videoRef.value.paused
            if (wasPlaying) {
                videoRef.value.pause()
            }

            videoRef.value.currentTime = targetTime

            const waitForSeek = new Promise<void>((resolve) => {
                const onSeeked = (): void => {
                    videoRef.value?.removeEventListener('seeked', onSeeked)
                    videoRef.value?.removeEventListener('error', onError)
                    resolve()
                }

                const onError = (): void => {
                    videoRef.value?.removeEventListener('seeked', onSeeked)
                    videoRef.value?.removeEventListener('error', onError)
                    resolve()
                }

                videoRef.value?.addEventListener('seeked', onSeeked, { once: true })
                videoRef.value?.addEventListener('error', onError, { once: true })
            })

            waitForSeek.then(() => {
                if (wasPlaying && videoRef.value) {
                    videoRef.value.play()
                }
            })
        }
    }
)

watch(
    () => appStore.videoPlayCtrl.isStop,
    (newValue) => {
        if (videoRef.value != null) {
            if (newValue == true) {
                videoRef.value.pause()
            }
        }
    }
)

onBeforeMount(() => {
    appStore.func_nextFrame = nextFrame
    appStore.func_prevFrame = previousFrame
    appStore.func_get_ele_video = (): HTMLVideoElement | null => {
        return videoRef.value
    }
    appStore.rightPanel = Dty.WorkPanel.List
})
onMounted(() => {
    if (videoRef.value == null) {
        return
    }
    util.setupVideoEventListeners(videoRef.value)
})

onBeforeUnmount(() => {
    if (videoRef.value == null) {
        return
    }
    util.stop_play(false)
    util.toggle_play(videoRef.value)
    videoRef.value.src = ''
})

onUnmounted(() => {
    if (videoRef.value == null) {
        return
    }
    util.setupVideoEventListeners(videoRef.value, true)
    const clearReq = new Dty.ClearSltInfoReq()
    clearReq.bNotClear_curSltVideo = true
    util.clear_cur_slt_video_info(clearReq)
})
</script>

<style scoped>
.home-editor-container {
    height: calc(100% - var(--xc-home-nac-height));
    width: 100%;
    padding: 0;
    margin: 0;
    background-color: #1e1e1e;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
}

.editor-main {
    width: 100%;
    height: calc(100% - 60px);
    padding: 0;
    margin: 0;
    display: flex;
}

.video-area {
    height: 100%;
    flex: 1;
    padding: 0;
    margin: 0;
    display: flex;
    justify-content: center;
    align-items: center;
}

.video-wrapper {
    height: 100%;
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: black;
    position: relative;
    overflow: hidden;
}

.video-wrapper video {
    max-height: 100%;
    width: 100%;
    padding: 0;
    margin: 0;
    object-fit: contain;
    display: block;
}

.edit-panel {
    height: 100%;
    width: 20%;
    max-width: 250px;
    padding: 0;
    margin: 0;
    border-left: 1px solid #333;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.view-switch {
    padding: 6px;
    border-bottom: 1px solid #333;
}

.control-area {
    height: 60px;
    width: 100%;
    padding: 0;
    margin: 0;
    background-color: #252526;
}
</style>
