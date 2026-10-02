<template>
    <div class="pagination-controls" :class="{ compact: compactMode }">
        <template v-if="compactMode">
            <div class="compact-pagination">
                <n-button
                    quaternary
                    size="small"
                    :disabled="currentPage <= 1"
                    @click="goToPage(currentPage - 1)"
                >
                    ◀
                </n-button>
                <span class="xc-text page-info-compact">
                    {{ currentPage }} / {{ totalPages || 1 }}
                </span>
                <n-button
                    quaternary
                    size="small"
                    :disabled="currentPage >= totalPages"
                    @click="goToPage(currentPage + 1)"
                >
                    ▶
                </n-button>
                <n-button quaternary size="small" class="settings-btn" @click="openSettingsModal">
                    ⚙
                </n-button>
            </div>
        </template>

        <template v-else>
            <div class="pagination-info">
                <div>
                    <span class="xc-text">
                        {{
                            t('pagination.pageInfo', {
                                current: currentPage,
                                total: totalPages,
                                count: totalNum
                            })
                        }}
                    </span>
                </div>
                <div class="multi-select-dropdown">
                    <div class="dropdown-header" @click="toggleDropdown">
                        <span class="selected-text">{{ getSelectedLevelsText() }}</span>
                        <span class="dropdown-arrow">▼</span>
                    </div>
                    <div v-show="isDropdownOpen" class="dropdown-content">
                        <div class="select-all-container">
                            <n-checkbox
                                size="small"
                                :checked="selectedLevels.length === 5"
                                @update:checked="toggleSelectAll"
                            >
                                {{ t('pagination.selectAll') }}
                            </n-checkbox>
                        </div>
                        <n-checkbox-group
                            :value="selectedLevels"
                            @update:value="handleLevelsGroupChange"
                        >
                            <div v-for="index in 5" :key="index" class="level-option">
                                <n-checkbox size="small" :value="index - 1">
                                    {{ index }}☆
                                </n-checkbox>
                            </div>
                        </n-checkbox-group>
                    </div>
                </div>
            </div>

            <div class="pagination-nav">
                <n-button
                    quaternary
                    size="small"
                    :disabled="currentPage <= 1"
                    @click="goToPage(currentPage - 1)"
                >
                    ◀
                </n-button>

                <div class="page-jump">
                    <span class="xc-text">{{ t('pagination.jumpTo') }}</span>
                    <n-input-number
                        v-model:value="jumpPageNum"
                        size="tiny"
                        :min="1"
                        :max="totalPages"
                        @keyup.enter="jumpToPage"
                    />
                </div>

                <n-button
                    quaternary
                    size="small"
                    :disabled="currentPage >= totalPages"
                    @click="goToPage(currentPage + 1)"
                >
                    ▶
                </n-button>
                <span class="xc-text">{{ t('pagination.itemsPerPage') }}</span>
                <div class="page-size-selector">
                    <n-select
                        :value="pageSize"
                        size="tiny"
                        :consistent-menu-width="false"
                        :options="pageSizeOptions"
                        @update:value="handlePageSizeChange"
                    />
                </div>
            </div>
        </template>

        <div
            v-if="showSettingsModal"
            class="settings-modal-overlay"
            @click.self="closeSettingsModal"
        >
            <div class="settings-modal">
                <div class="modal-header">
                    <span class="xc-text">{{ t('pagination.settings') }}</span>
                    <n-button quaternary size="small" @click="closeSettingsModal">✕</n-button>
                </div>
                <div class="modal-body">
                    <div class="setting-item">
                        <span class="xc-text">{{ t('pagination.fileStatus') }}</span>
                        <n-select
                            v-model:value="modalFileStatus"
                            size="tiny"
                            :consistent-menu-width="false"
                            :options="fileStatusOptions"
                        />
                    </div>
                    <div class="setting-item">
                        <span class="xc-text">{{ t('pagination.levelFilter') }}</span>
                        <n-checkbox-group
                            class="level-checkboxes"
                            :value="modalSelectedLevels"
                            @update:value="handleModalLevelsGroupChange"
                        >
                            <n-checkbox size="small" :value="-2">
                                {{ t('pagination.noLevel') }}
                            </n-checkbox>
                            <n-checkbox
                                v-for="index in 5"
                                :key="index"
                                size="small"
                                :value="index - 1"
                            >
                                {{ index }}☆
                            </n-checkbox>
                        </n-checkbox-group>
                    </div>
                    <div class="setting-item">
                        <span class="xc-text">{{ t('pagination.sortBy') }}</span>
                        <n-select
                            v-model:value="modalOrderBy"
                            size="tiny"
                            :consistent-menu-width="false"
                            :options="orderByOptions"
                        />
                    </div>
                    <div class="setting-item">
                        <span class="xc-text">{{ t('pagination.sortOrder') }}</span>
                        <n-select
                            v-model:value="modalOrder"
                            size="tiny"
                            :consistent-menu-width="false"
                            :options="orderOptions"
                        />
                    </div>
                    <div class="setting-item">
                        <span class="xc-text">{{ t('pagination.itemsPerPage') }}</span>
                        <n-select
                            v-model:value="modalPageSize"
                            size="tiny"
                            :consistent-menu-width="false"
                            :options="pageSizeOptions"
                        />
                    </div>
                </div>
                <div class="modal-footer">
                    <n-button quaternary size="small" @click="applySettings">
                        {{ t('pagination.apply') }}
                    </n-button>
                    <n-button quaternary size="small" @click="closeSettingsModal">
                        {{ t('pagination.cancel') }}
                    </n-button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@renderer/stores/AppStore'
import { useI18n } from 'vue-i18n'
const appStore = useAppStore()
import '@renderer/assets/common.css'
import * as Dty from '../../../../bridge/dataTypedef'
import util from '@renderer/utils/util'

const { t } = useI18n()

const props = defineProps({
    pageType: {
        type: String,
        default: 'video',
        validator: (value: string) => ['video', 'thumb'].includes(value)
    },
    compact: {
        type: Boolean,
        default: false
    }
})

const compactMode = computed(() => props.compact)

const currentPage = computed({
    get: () => appStore.fileSearchPage,
    set: (value: number) => {
        appStore.fileSearchPage = value
    }
})

const pageSize = computed({
    get: () => appStore.fileSearchPageSize,
    set: (value: number) => {
        appStore.fileSearchPageSize = value
    }
})

const totalPages = computed(() => {
    let total = appStore.videoTotalNum
    if (props.pageType === 'thumb') {
        total = appStore.thumbTotalNum
    }
    if (total == 0) return 0
    return Math.ceil(total / appStore.fileSearchPageSize)
})

const totalNum = computed(() => {
    return props.pageType === 'thumb' ? appStore.thumbTotalNum : appStore.videoTotalNum
})
const jumpPageNum = ref(1)

const pageSizeOptions = [10, 50, 100, 200, 500, 1000].map((size) => ({
    label: String(size),
    value: size
}))

const selectedLevels = ref<number[]>([])
const isDropdownOpen = ref(false)

const showSettingsModal = ref(false)
const modalSelectedLevels = ref<number[]>([])
const modalPageSize = ref(50)
const modalFileStatus = ref<Dty.Fstatus>(Dty.Fstatus.Normal)
const modalOrderBy = ref<'name' | 'startTimeSec' | 'endTimeSec' | 'size' | 'duration'>(
    'startTimeSec'
)
const modalOrder = ref<'asc' | 'desc'>('desc')

const fileStatusOptions = [
    { label: `🗄️ ${t('pagination.normalFiles')}`, value: Dty.Fstatus.Normal },
    { label: `🗑️ ${t('pagination.trashFiles')}`, value: Dty.Fstatus.Deleted }
]
const orderByOptions = [
    { label: t('pagination.sortOptions.name'), value: 'name' },
    { label: t('pagination.sortOptions.startTimeSec'), value: 'startTimeSec' },
    { label: t('pagination.sortOptions.endTimeSec'), value: 'endTimeSec' },
    { label: t('pagination.sortOptions.size'), value: 'size' },
    { label: t('pagination.sortOptions.duration'), value: 'duration' }
]
const orderOptions = [
    { label: t('pagination.sortOrderOptions.desc'), value: 'desc' },
    { label: t('pagination.sortOrderOptions.asc'), value: 'asc' }
]

const toggleDropdown = (): void => {
    isDropdownOpen.value = !isDropdownOpen.value
}

const getSelectedLevelsText = (): string => {
    if (selectedLevels.value.length === 0) {
        return t('pagination.noLevelSelected')
    } else if (selectedLevels.value.length === 5) {
        return t('pagination.allLevels')
    } else {
        return selectedLevels.value.map((level) => `${level + 1}☆`).join(', ')
    }
}

const toggleSelectAll = (): void => {
    if (selectedLevels.value.length === 5) {
        selectedLevels.value = []
    } else {
        selectedLevels.value = [0, 1, 2, 3, 4]
    }
    handleLevelChange()
}

const handleLevelChange = (): void => {
    handleSearch()
}

const handleLevelsGroupChange = (value: Array<number | string>): void => {
    selectedLevels.value = value.map((v) => Number(v))
    handleLevelChange()
}

const handleModalLevelsGroupChange = (value: Array<number | string>): void => {
    modalSelectedLevels.value = value.map((v) => Number(v))
}

const handleClickOutside = (event: Event): void => {
    const target = event.target as Element
    if (!target.closest('.multi-select-dropdown')) {
        isDropdownOpen.value = false
    }
}

onMounted(() => {
    document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
})

const handleSearch = (): void => {
    if (props.pageType === 'thumb') {
        let searchReq = new Dty.FilesReq()
        searchReq.status.push(Dty.Fstatus.Destroy)
        for (const lvl of selectedLevels.value) {
            if (lvl === -2) {
                searchReq.tags.push('sys_no_score')
            } else {
                searchReq.tags.push(`sys_score${lvl + 1}`)
            }
        }
        searchReq.orderBy = appStore.fileSearchOrderBy
        searchReq.order = appStore.fileSearchOrder
        util.thumbsGet(searchReq)
    } else {
        let searchReq = new Dty.FilesReq()
        searchReq.status.push(appStore.fileSearchStatus)
        for (const lvl of selectedLevels.value) {
            if (lvl === -2) {
                searchReq.tags.push('sys_no_score')
            } else {
                searchReq.tags.push(`sys_score${lvl + 1}`)
            }
        }
        searchReq.orderBy = appStore.fileSearchOrderBy
        searchReq.order = appStore.fileSearchOrder
        util.files_get(searchReq)
    }
}

const handlePageSizeChange = (value: number): void => {
    pageSize.value = value
    handleSearch()
    currentPage.value = 1
}

const goToPage = (pageNum: number): void => {
    if (pageNum < 1 || pageNum > totalPages.value) return

    currentPage.value = pageNum
    handleSearch()
}

const jumpToPage = (): void => {
    if (jumpPageNum.value < 1) {
        jumpPageNum.value = 1
    } else if (jumpPageNum.value > totalPages.value) {
        jumpPageNum.value = totalPages.value
    }
    currentPage.value = jumpPageNum.value
    handleSearch()
}

const openSettingsModal = (): void => {
    modalSelectedLevels.value = [...selectedLevels.value]
    modalPageSize.value = pageSize.value
    modalFileStatus.value = appStore.fileSearchStatus
    modalOrderBy.value = appStore.fileSearchOrderBy
    modalOrder.value = appStore.fileSearchOrder
    showSettingsModal.value = true
}

const closeSettingsModal = (): void => {
    showSettingsModal.value = false
}

const applySettings = (): void => {
    const oldLevels = [...selectedLevels.value]

    selectedLevels.value = [...modalSelectedLevels.value]

    let needSearch = false

    const levelsChanged =
        oldLevels.length !== selectedLevels.value.length ||
        !oldLevels.every((level) => selectedLevels.value.includes(level))

    if (levelsChanged) {
        needSearch = true
    }

    if (appStore.fileSearchStatus !== modalFileStatus.value) {
        appStore.fileSearchStatus = modalFileStatus.value
        currentPage.value = 1
        needSearch = true
    }

    if (pageSize.value !== modalPageSize.value) {
        pageSize.value = modalPageSize.value
        currentPage.value = 1
        needSearch = true
    }

    if (appStore.fileSearchOrderBy !== modalOrderBy.value) {
        appStore.fileSearchOrderBy = modalOrderBy.value
        needSearch = true
    }

    if (appStore.fileSearchOrder !== modalOrder.value) {
        appStore.fileSearchOrder = modalOrder.value
        needSearch = true
    }

    if (needSearch) {
        handleSearch()
    }

    closeSettingsModal()
}
</script>

<style scoped>
.pagination-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px;
    background-color: var(--xc-background-color);
    border-top: 1px solid #333;
    flex-wrap: wrap;
    gap: 2px;
}

.pagination-controls.compact {
    justify-content: center;
    padding: 4px 8px;
}

.compact-pagination {
    display: flex;
    align-items: center;
    gap: 8px;
}

.page-info-compact {
    font-size: 13px;
    min-width: 60px;
    text-align: center;
}

.settings-btn {
    margin-left: 8px;
}

.pagination-info {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-width: 150px;
}

.pagination-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 2;
    min-width: 200px;
}

.page-size-selector {
    text-align: right;
}

.multi-select-dropdown {
    position: relative;
    min-width: 120px;
}

.dropdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    background-color: #2d2d30;
    border: 1px solid #3c3c41;
    border-radius: 3px;
    color: var(--xc-text-color);
    cursor: pointer;
    user-select: none;
}

.dropdown-header:hover {
    border-color: #007fd4;
}

.selected-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100px;
    font-size: small;
}

.dropdown-arrow {
    font-size: 10px;
    margin-left: 5px;
}

.dropdown-content {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    background-color: #2d2d30;
    border: 1px solid #3c3c41;
    border-radius: 3px;
    z-index: 10;
    max-height: 200px;
    overflow-y: auto;
    margin-bottom: 2px;
}

.select-all-container {
    padding: 0px;
    font-size: small;
    border-bottom: 1px solid #3c3c41;
}

.level-option {
    padding: 0px;
}

.level-option:hover {
    background-color: #3c3c41;
}

.settings-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.settings-modal {
    background-color: #2d2d30;
    border: 1px solid #3c3c41;
    border-radius: 6px;
    min-width: 300px;
    max-width: 400px;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #3c3c41;
}

.modal-header span {
    font-weight: 500;
}

.modal-body {
    padding: 16px;
}

.setting-item {
    margin-bottom: 16px;
}

.setting-item:last-child {
    margin-bottom: 0;
}

.setting-item > span {
    display: block;
    margin-bottom: 8px;
}

.level-checkboxes {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}

.modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #3c3c41;
}
</style>
