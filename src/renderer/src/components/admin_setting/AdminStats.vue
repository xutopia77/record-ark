<template>
    <div class="stats-page">
        <div class="stats-toolbar">
            <n-button size="small" :loading="loading" @click="btn_refresh">
                🔄 {{ t('common.refresh') }}
            </n-button>
        </div>

        <n-empty
            v-if="!loading && stats != null && !hasData"
            :description="t('util.noFiles')"
            class="stats-empty"
        />

        <template v-if="stats != null && hasData">
            <div class="stats-cards">
                <div v-for="card in cards" :key="card.label" class="stat-card">
                    <div class="stat-value">{{ card.value }}</div>
                    <div class="stat-label">{{ card.label }}</div>
                </div>
            </div>

            <div class="charts-row">
                <div class="chart-panel">
                    <div class="chart-title">{{ t('stats.statusDist') }}</div>
                    <div ref="pieRef" class="chart-box"></div>
                </div>
                <div class="chart-panel">
                    <div class="chart-title">{{ t('stats.storageUsage') }}</div>
                    <div ref="barRef" class="chart-box"></div>
                </div>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as Dty from '../../../../bridge/dataTypedef'
import util from '@renderer/utils/util'
import '@renderer/assets/common.css'

import * as echarts from 'echarts/core'
import { BarChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption, PieSeriesOption } from 'echarts/charts'
import type {
    GridComponentOption,
    LegendComponentOption,
    TooltipComponentOption
} from 'echarts/components'

echarts.use([PieChart, BarChart, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer])

type EChartsOption = ComposeOption<
    | PieSeriesOption
    | BarSeriesOption
    | TooltipComponentOption
    | LegendComponentOption
    | GridComponentOption
>

const { t } = useI18n()

const loading = ref(false)
const stats = ref<Dty.PrjStats | null>(null)

const pieRef = ref<HTMLDivElement | null>(null)
const barRef = ref<HTMLDivElement | null>(null)
let pieChart: ReturnType<typeof echarts.init> | null = null
let barChart: ReturnType<typeof echarts.init> | null = null

const formatFileSize = (bytes: number): string => {
    if (bytes <= 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const statOf = (status: Dty.Fstatus): Dty.FileStatusStat | null => {
    return stats.value?.fileStats.find((s) => s.status === status) || null
}

const totalCount = computed(
    () => stats.value?.fileStats.reduce((sum, s) => sum + s.count, 0) || 0
)
const normalCount = computed(() => statOf(Dty.Fstatus.Normal)?.count || 0)
const trashCount = computed(() => statOf(Dty.Fstatus.Deleted)?.count || 0)
const destroyCount = computed(() => statOf(Dty.Fstatus.Destroy)?.count || 0)
const nothingCount = computed(() => statOf(Dty.Fstatus.Nothing)?.count || 0)
// Only count files that still exist on disk (normal + trash)
const totalDuration = computed(
    () => (statOf(Dty.Fstatus.Normal)?.duration || 0) + (statOf(Dty.Fstatus.Deleted)?.duration || 0)
)
const videoSize = computed(
    () => (statOf(Dty.Fstatus.Normal)?.size || 0) + (statOf(Dty.Fstatus.Deleted)?.size || 0)
)
const thumbSize = computed(() => stats.value?.thumbSize || 0)
const frameSize = computed(() => stats.value?.frameSize || 0)

const hasData = computed(
    () => totalCount.value > 0 || thumbSize.value > 0 || frameSize.value > 0
)

const cards = computed(() => [
    { label: t('stats.totalFiles'), value: String(totalCount.value) },
    { label: t('stats.normalFiles'), value: String(normalCount.value) },
    { label: t('stats.trashFiles'), value: String(trashCount.value) },
    { label: t('stats.totalDuration'), value: Dty.File.makeDurationStr(totalDuration.value) },
    { label: t('stats.videoSize'), value: formatFileSize(videoSize.value) },
    {
        label: t('stats.thumbFrameSize'),
        value: formatFileSize(thumbSize.value + frameSize.value)
    }
])

const pieData = computed(() =>
    [
        {
            name: t('stats.statusNormal'),
            value: normalCount.value,
            itemStyle: { color: '#4caf50' }
        },
        {
            name: t('stats.statusTrash'),
            value: trashCount.value,
            itemStyle: { color: '#ff9800' }
        },
        {
            name: t('stats.statusDestroyed'),
            value: destroyCount.value,
            itemStyle: { color: '#f44336' }
        },
        {
            name: t('stats.statusNothing'),
            value: nothingCount.value,
            itemStyle: { color: '#9e9e9e' }
        }
    ].filter((item) => item.value > 0)
)

const pieOption = computed<EChartsOption>(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: '#ccc' } },
    series: [
        {
            type: 'pie',
            radius: ['40%', '65%'],
            center: ['50%', '45%'],
            label: { color: '#ccc' },
            data: pieData.value
        }
    ]
}))

const barOption = computed<EChartsOption>(() => ({
    backgroundColor: 'transparent',
    tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (value: unknown): string => formatFileSize(Number(value))
    },
    grid: { left: 70, right: 20, top: 30, bottom: 30 },
    xAxis: {
        type: 'category',
        data: [t('stats.videoFiles'), t('stats.thumbnails'), t('stats.frames')],
        axisLabel: { color: '#ccc' },
        axisLine: { lineStyle: { color: '#555' } }
    },
    yAxis: {
        type: 'value',
        axisLabel: { color: '#ccc', formatter: (value: number): string => formatFileSize(value) },
        splitLine: { lineStyle: { color: '#333' } }
    },
    series: [
        {
            type: 'bar',
            barWidth: '40%',
            data: [
                { value: videoSize.value, itemStyle: { color: '#2196f3' } },
                { value: thumbSize.value, itemStyle: { color: '#4caf50' } },
                { value: frameSize.value, itemStyle: { color: '#ff9800' } }
            ],
            label: {
                show: true,
                position: 'top',
                color: '#ccc',
                formatter: (params: { value: unknown }): string =>
                    formatFileSize(Number(params.value))
            }
        }
    ]
}))

const renderCharts = (): void => {
    pieChart?.setOption(pieOption.value)
    barChart?.setOption(barOption.value)
}

// Init charts after containers are rendered (v-if becomes true once data arrives)
const initCharts = (): void => {
    if (pieChart == null && pieRef.value) {
        pieChart = echarts.init(pieRef.value)
    }
    if (barChart == null && barRef.value) {
        barChart = echarts.init(barRef.value)
    }
}

const handleResize = (): void => {
    pieChart?.resize()
    barChart?.resize()
}

const loadStats = async (): Promise<void> => {
    loading.value = true
    try {
        const resp = await util.statsGet()
        if (resp.code != 0 || resp.data == null) {
            util.addToastErr(`${t('stats.loadFailed')}: ${resp.status}`)
            return
        }
        stats.value = resp.data
        await nextTick() // wait for chart containers to be rendered by v-if
        initCharts()
        renderCharts()
    } finally {
        loading.value = false
    }
}

const btn_refresh = (): void => {
    loadStats()
}

// Re-render charts when language or data changes
watch([pieOption, barOption], renderCharts)

onMounted(async (): Promise<void> => {
    window.addEventListener('resize', handleResize)
    await loadStats()
})

onBeforeUnmount((): void => {
    window.removeEventListener('resize', handleResize)
    pieChart?.dispose()
    pieChart = null
    barChart?.dispose()
    barChart = null
})
</script>

<style scoped>
.stats-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background-color: var(--xc-background-color);
    color: var(--xc-text-color);
}

.stats-toolbar {
    display: flex;
    justify-content: flex-end;
}

.stats-empty {
    margin-top: 80px;
}

.stats-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
}

.stat-card {
    background-color: #252526;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 14px 16px;
    text-align: center;
}

.stat-value {
    font-size: 22px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 6px;
}

.stat-label {
    font-size: 12px;
    color: #999;
}

.charts-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
}

.chart-panel {
    flex: 1;
    min-width: 360px;
    background-color: #252526;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 12px 16px;
}

.chart-title {
    font-size: 14px;
    font-weight: 500;
    color: #ccc;
    margin-bottom: 4px;
}

.chart-box {
    width: 100%;
    height: 320px;
}
</style>
