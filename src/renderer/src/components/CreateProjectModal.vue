<template>
    <n-modal
        :show="visible"
        preset="card"
        style="width: 480px"
        :title="t('createProject.title')"
        @update:show="close"
    >
        <div class="form-group">
            <label>{{ t('createProject.repoPath') }}</label>
            <div class="path-input-group">
                <n-input
                    v-model:value="repoPath"
                    size="small"
                    :placeholder="t('createProject.repoPathPlaceholder')"
                    readonly
                />
                <n-button size="small" @click="selectFolder">
                    {{ t('createProject.browse') }}
                </n-button>
            </div>
        </div>
        <div class="form-group">
            <label>{{ t('createProject.projectLocation') }}</label>
            <div class="path-input-group">
                <n-input
                    v-model:value="projectPath"
                    size="small"
                    :placeholder="t('createProject.projectLocationPlaceholder')"
                    readonly
                />
                <n-button size="small" @click="selectProjectFolder">
                    {{ t('createProject.browse') }}
                </n-button>
            </div>
            <span class="hint-text">{{ t('createProject.projectLocationHint') }}</span>
        </div>
        <template #footer>
            <div class="modal-footer">
                <n-button size="small" @click="close">{{ t('common.cancel') }}</n-button>
                <n-button size="small" type="primary" :disabled="!canCreate" @click="createProject">
                    {{ t('createProject.create') }}
                </n-button>
            </div>
        </template>
    </n-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { IpcApi } from '../utils/ipcApi'
import * as Dty from '../../../bridge/dataTypedef'
import util from '../utils/util'

defineProps<{
    visible: boolean
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'created'): void
}>()

const { t } = useI18n()

const repoPath = ref('')
const projectPath = ref('')

const canCreate = computed(() => {
    return repoPath.value.trim() !== '' && projectPath.value.trim() !== ''
})

const selectFolder = async (): Promise<void> => {
    const response = await IpcApi.trigger_event({
        cmd: Dty.CmdType.selectFolder
    })
    if (response.code === 0 && response.data) {
        repoPath.value = response.data
    }
}

const selectProjectFolder = async (): Promise<void> => {
    const response = await IpcApi.trigger_event({
        cmd: Dty.CmdType.selectFolder
    })
    if (response.code === 0 && response.data) {
        projectPath.value = response.data
    }
}

const getBasename = (filePath: string): string => {
    const normalized = filePath.replace(/\\/g, '/')
    const parts = normalized.split('/')
    return parts[parts.length - 1] || 'default'
}

const createProject = async (): Promise<void> => {
    if (!canCreate.value) return

    const repoName = getBasename(projectPath.value.trim()) || 'default'

    const dataRepo: Dty.DataRepo[] = [
        {
            name: repoName,
            path: repoPath.value.trim(),
            thumbnailPath: '',
            framePath: ''
        }
    ]

    const response = await util.create_prj_with_path(dataRepo, projectPath.value.trim())

    if (response.code === 0) {
        util.addToastInfo(t('createProject.createSuccess'))
        emit('created')
        close()
    } else {
        util.addToastErr(`${t('createProject.createFailed')}: ${response.status}`)
    }
}

const close = (): void => {
    repoPath.value = ''
    projectPath.value = ''
    emit('close')
}
</script>

<style scoped>
.form-group {
    margin-bottom: 16px;
}

.form-group:last-child {
    margin-bottom: 0;
}

.form-group label {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    color: #cccccc;
}

.path-input-group {
    display: flex;
    gap: 8px;
}

.hint-text {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    color: #858585;
}

.modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
</style>
