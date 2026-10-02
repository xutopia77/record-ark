<template>
    <div class="page-container xc-scrollbar">
        <ul>
            <li
                v-for="(video, index) in videoList"
                :key="index"
                :class="{ selected: video === appStore.curSltVideo }"
            >
                <n-checkbox
                    size="small"
                    class="video-checkbox"
                    :checked="appStore.curCheckedVideo.has(video)"
                    @update:checked="
                        (checked: boolean) => toggleVideoSelection(video, checked, index)
                    "
                />
                <span
                    class="xc-text"
                    :style="getVideoLevelColorStyle(video)"
                    @click="btn_playVideo(video)"
                    >{{ `${index + 1}:${Dty.File.makeDisplayName(video)}` }}</span
                >
            </li>
        </ul>
        <PaginationCtrl page-type="video" :compact="true" />
    </div>
</template>

<script setup lang="ts">
import PaginationCtrl from '@renderer/components/common/paginationCtrl.vue'
import { computed, onBeforeMount, ref, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@renderer/stores/AppStore'
const appStore = useAppStore()
import '@renderer/assets/common.css'
import * as Dty from '../../../../../bridge/dataTypedef'

const videoList = computed<Dty.File[]>(() => appStore.videoList)

// Record last selected index
const lastSelectedIndex = ref(-1)
// Record whether Shift key is pressed
const isShiftPressed = ref(false)

// Listen to keyboard events
const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.shiftKey) {
        isShiftPressed.value = true
    }
}

const handleKeyUp = (): void => {
    isShiftPressed.value = false
}

onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
})

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
})

// Toggle video selection status
const toggleVideoSelection = (video: Dty.File, isChecked: boolean, currentIndex: number): void => {
    if (isShiftPressed.value && lastSelectedIndex.value !== -1) {
        const start = Math.min(lastSelectedIndex.value, currentIndex)
        const end = Math.max(lastSelectedIndex.value, currentIndex)
        for (let i = start; i <= end; i++) {
            const item = videoList.value[i]
            if (isChecked) {
                appStore.curCheckedVideo.add(item)
            } else {
                appStore.curCheckedVideo.delete(item)
            }
        }
    } else {
        if (isChecked) {
            appStore.curCheckedVideo.add(video)
        } else {
            appStore.curCheckedVideo.delete(video)
        }
    }
    lastSelectedIndex.value = currentIndex
}

onBeforeMount(() => {})

const btn_playVideo = (video: Dty.File): void => {
    appStore.curSltVideo = video
}

/**
 * Get font color style under dark theme based on video level
 * @param {Object} video - Video object containing tags array
 * @returns {string} Inline style string with color
 */
const getVideoLevelColorStyle = (video): string => {
    if (appStore.fileSearchStatus === Dty.Fstatus.Deleted) {
        return 'color: #888888;'
    }

    if (!video?.tags || video.tags.length === 0) {
        return 'color: #cccccc;'
    }

    const levelName = video.tags[0].name.toLowerCase()

    const levelColorMap = {
        sys_score1: '#00c6ff',
        sys_score2: '#76ff03',
        sys_score3: '#ffea00',
        sys_score4: '#ff9100',
        sys_score5: '#ff3d00'
    }

    const targetColor = levelColorMap[levelName] || '#cccccc'
    return `color: ${targetColor};`
}
</script>

<style scoped>
.page-container {
    height: 100%;
    width: calc(100% - 1px);
    padding: 0;
    margin: 0;
    background-color: var(--xc-background-color);
    color: var(--xc-text-color);
    white-space: nowrap;
    overflow-x: auto;
    border-right: 1px solid #333;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}

/* Firefox compatibility */
.page-container {
    scrollbar-width: thin;
    scrollbar-color: #555 #333;
}

.page-container ul {
    list-style-type: none;
    padding: 0;
    margin: 0;
    flex: 1;
    overflow-y: auto;
}

.page-container li {
    cursor: pointer;
    padding: 2px 4px;
    border-bottom: 1px solid #333;
    display: flex;
    align-items: center;
    gap: 4px;
}

.page-container li:hover {
    background-color: #37373d;
}

.page-container li:active {
    background-color: #094771;
}

.page-container li.selected {
    background-color: #094771;
    color: white;
}

.video-checkbox {
    flex-shrink: 0;
}
</style>
