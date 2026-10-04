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
                <span class="xc-text page-count-compact">
                    {{ t('pagination.totalCount', { count: totalNum }) }}
                </span>
                <n-button quaternary size="small" class="settings-btn" @click="openSettingsModal">
                    ⚙
                </n-button>
            </div>
        </template>

        <template v-else>
            <span class="xc-text page-total">
                {{
                    t('pagination.pageInfo', {
                        current: currentPage,
                        total: totalPages,
                        count: totalNum
                    })
                }}
            </span>

            <n-pagination
                size="small"
                :page="currentPage"
                :page-count="totalPages || 1"
                :page-size="pageSize"
                show-quick-jumper
                show-size-picker
                :page-sizes="[10, 50, 100, 200, 500, 1000]"
                @update:page="onPageChange"
                @update:page-size="handlePageSizeChange"
            />

            <n-button
                quaternary
                size="small"
                class="settings-btn"
                style="margin-left: auto"
                @click="openSettingsModal"
            >
                ⚙
            </n-button>
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
                    <div class="setting-item" v-if="pageType !== 'thumb'">
                        <span class="xc-text">{{ t('pagination.fileStatus') }}</span>
                        <n-select
                            v-model:value="modalFileStatus"
                            size="tiny"
                            :consistent-menu-width="false"
                            :options="fileStatusOptions"
                        />
                    </div>
                    <div class="setting-item" v-else>
                        <span class="xc-text">{{ t('pagination.thumbFilter') }}</span>
                        <n-tooltip trigger="hover">
                            <template #trigger>
                                <n-select
                                    v-model:value="modalThumbMode"
                                    size="tiny"
                                    :consistent-menu-width="false"
                                    :options="thumbFilterOptions"
                                />
                            </template>
                            {{ thumbModeTip }}
                        </n-tooltip>
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
import { computed, ref } from 'vue'
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

const pageSizeOptions = [10, 50, 100, 200, 500, 1000].map((size) => ({
    label: String(size),
    value: size
}))

// Level filter is persisted in app store, shared by all search/refresh paths
const selectedLevels = computed({
    get: (): number[] => appStore.fileSearchLevels,
    set: (value: number[]): void => {
        appStore.fileSearchLevels = value
    }
})

const showSettingsModal = ref(false)
const modalSelectedLevels = ref<number[]>([])
const modalPageSize = ref(50)
const modalFileStatus = ref<Dty.Fstatus>(Dty.Fstatus.Normal)
const modalThumbMode = ref<'all' | 'normal' | 'noVideo'>('all')
const modalOrderBy = ref<'name' | 'startTimeSec' | 'endTimeSec' | 'size' | 'duration'>(
    'startTimeSec'
)
const modalOrder = ref<'asc' | 'desc'>('desc')

const fileStatusOptions = [
    { label: `🗄️ ${t('pagination.normalFiles')}`, value: Dty.Fstatus.Normal },
    { label: `🗑️ ${t('pagination.trashFiles')}`, value: Dty.Fstatus.Deleted }
]
const thumbFilterOptions = [
    { label: t('pagination.thumbFilterAll'), value: 'all' },
    { label: t('pagination.thumbFilterNormal'), value: 'normal' },
    { label: t('pagination.thumbFilterNoVideo'), value: 'noVideo' }
]

// Tooltip text describes the logic of the currently selected filter
const thumbModeTipMap: Record<'all' | 'normal' | 'noVideo', () => string> = {
    all: () => t('pagination.thumbFilterAllTip'),
    normal: () => t('pagination.thumbFilterNormalTip'),
    noVideo: () => t('pagination.thumbFilterNoVideoTip')
}
const thumbModeTip = computed(() => thumbModeTipMap[modalThumbMode.value]())
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

const handleModalLevelsGroupChange = (value: Array<number | string>): void => {
    modalSelectedLevels.value = value.map((v) => Number(v))
}

const handleSearch = (): void => {
    const searchReq = util.makeSearchReq(props.pageType as 'video' | 'thumb')
    if (props.pageType === 'thumb') {
        util.thumbsGet(searchReq)
    } else {
        util.files_get(searchReq)
    }
}

const handlePageSizeChange = (value: number): void => {
    pageSize.value = value
    currentPage.value = 1
    handleSearch()
}

const goToPage = (pageNum: number): void => {
    if (pageNum < 1 || pageNum > totalPages.value) return

    currentPage.value = pageNum
    handleSearch()
}

const onPageChange = (pageNum: number): void => {
    currentPage.value = pageNum
    handleSearch()
}

const openSettingsModal = (): void => {
    modalSelectedLevels.value = [...selectedLevels.value]
    modalPageSize.value = pageSize.value
    if (props.pageType === 'thumb') {
        modalThumbMode.value = appStore.thumbSearchMode
    } else {
        modalFileStatus.value = appStore.fileSearchStatus
    }
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

    if (props.pageType === 'thumb') {
        if (appStore.thumbSearchMode !== modalThumbMode.value) {
            appStore.thumbSearchMode = modalThumbMode.value
            currentPage.value = 1
            needSearch = true
        }
    } else if (appStore.fileSearchStatus !== modalFileStatus.value) {
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
    justify-content: flex-start;
    padding: 4px;
    background-color: var(--xc-background-color);
    border-top: 1px solid #333;
    flex-wrap: nowrap;
    gap: 12px;
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

.page-count-compact {
    font-size: 12px;
    color: #999999;
    white-space: nowrap;
}

.settings-btn {
    margin-left: 8px;
}

.pagination-info {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    white-space: nowrap;
}

.page-total {
    white-space: nowrap;
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
