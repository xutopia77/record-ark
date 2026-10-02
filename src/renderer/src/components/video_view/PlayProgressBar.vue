<template>
    <div class="progress-bar">
        <!-- Seek progress bar -->
        <div
            ref="progressBar"
            class="seek-progress-bar"
            tabindex="0"
            @mousedown="onProgressBarMouseDown"
            @keydown="onProgressBarKeyDown"
        >
            <div class="played" :style="{ width: playBarPercent }"></div>
            <div class="thumb" :style="{ left: playBarPercent }"></div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '../../stores/AppStore'

const appStore = useAppStore()

const progressBar = ref<HTMLElement | null>(null)
const isDragging = ref<boolean>(false)

const playBarPercent = computed(() => {
    const duration = appStore.curSltVideo?.mediaInfo?.duration
    if (duration == null || duration == 0) {
        return '0%'
    }
    return `${(appStore.videoPlayCtrl.curTime / duration) * 100}%`
})

// Drag progress bar to change playback position
const seekVideo = (time: number): void => {
    appStore.barSeekTime = time
}

// Handle progress bar mouse down event
const onProgressBarMouseDown = (event: MouseEvent): void => {
    const duration = appStore.curSltVideo?.mediaInfo?.duration
    if (duration == null) {
        return
    }
    isDragging.value = true
    const rect = progressBar.value?.getBoundingClientRect()
    if (rect) {
        const clickX = event.clientX - rect.left
        const progress = (clickX / rect.width) * duration
        seekVideo(progress)
    }
}

// Handle progress bar key down event
const onProgressBarKeyDown = (event: KeyboardEvent): void => {
    const duration = appStore.curSltVideo?.mediaInfo?.duration
    if (duration == null) {
        return
    }
    const step = 1 // Seconds to move each time
    let newTime = appStore.videoPlayCtrl.curTime
    if (event.key === 'ArrowLeft') {
        newTime = Math.max(0, newTime - step)
    } else if (event.key === 'ArrowRight') {
        newTime = Math.min(duration, newTime + step)
    }
    if (newTime !== appStore.videoPlayCtrl.curTime) {
        seekVideo(newTime)
    }
}
</script>

<style scoped>
.progress-bar {
    height: 10px;
    width: 100%;
    padding: 0;
    margin: 0;
    background-color: #333;
    position: relative;
    overflow: hidden;
}

.seek-progress-bar {
    height: 100%;
    position: relative;
    cursor: pointer;
}

.played {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    background: #0e639c;
}

.thumb {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #eaeef1;
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
    cursor: pointer;
}
</style>
