<template>
    <div class="page-container xc-scrollbar">
        <ul>
            <li
                v-for="(video, index) in videoList"
                :key="index"
                :class="{
                    selected: video === appStore.curSltVideo,
                    trash: appStore.fileSearchStatus === Dty.Fstatus.Deleted
                }"
            >
                <n-checkbox
                    size="small"
                    class="video-checkbox"
                    :checked="appStore.curCheckedVideo.has(video)"
                    @update:checked="
                        (checked: boolean) => toggleVideoSelection(video, checked, index)
                    "
                />
                <div class="item-info" @click="btn_playVideo(video)">
                    <div class="item-line1">
                        <span class="item-index">{{ index + 1 }}</span>
                        <span class="item-time">{{ Dty.File.makeRecordTime(video) }}</span>
                        <span class="item-duration">{{
                            Dty.File.makeDurationStr(video.duration)
                        }}</span>
                    </div>
                    <div class="item-line2">
                        <span
                            v-if="levelShowNameGet(video) !== ''"
                            class="item-level"
                            :style="getVideoLevelColorStyle(video)"
                            >{{ levelShowNameGet(video) }}</span
                        >
                        <span
                            v-for="tag in userTagsGet(video)"
                            :key="tag.name"
                            class="item-tag"
                            :style="getTagColorStyle(tag)"
                            >{{ Dty.Utils.makeTagShowName(tag.name) }}</span
                        >
                    </div>
                </div>
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

// Level tag show name ('' if no level tag)
const levelShowNameGet = (video: Dty.File): string => {
    const levelTag = video.tags.find((tag) => tag.name.startsWith('sys_score'))
    return levelTag ? Dty.Utils.makeTagShowName(levelTag.name) : ''
}

// Tags except the level tag
const userTagsGet = (video: Dty.File): Dty.Tag[] => {
    return video.tags.filter((tag) => !tag.name.startsWith('sys_score'))
}

const getTagColorStyle = (tag: Dty.Tag): string => {
    if (appStore.fileSearchStatus === Dty.Fstatus.Deleted) {
        return 'color: #888888;'
    }
    return tag.color ? `color: ${tag.color};` : 'color: #cccccc;'
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

/* Two-line item info: line1 index/time/duration, line2 level/tags */
.item-info {
    flex: 1;
    min-width: 0;
    overflow: hidden;
}

.item-line1 {
    display: flex;
    align-items: baseline;
    gap: 6px;
}

.item-index {
    flex-shrink: 0;
    min-width: 18px;
    text-align: right;
    color: #888888;
    font-size: 12px;
}

.item-time {
    overflow: hidden;
    text-overflow: ellipsis;
}

.item-duration {
    flex-shrink: 0;
    color: #999999;
    font-size: 12px;
}

.item-line2 {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin-top: 1px;
    white-space: normal;
}

.item-level {
    flex-shrink: 0;
    font-size: 12px;
}

.item-tag {
    font-size: 11px;
    line-height: 14px;
    padding: 0 4px;
    border: 1px solid #444;
    border-radius: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
}

.page-container li.trash {
    color: #888888;
}
</style>
