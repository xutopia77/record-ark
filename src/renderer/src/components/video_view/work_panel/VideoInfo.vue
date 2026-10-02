<template>
    <div class="page-container">
        <div class="tag-info">
            <n-input
                v-model:value="newTag"
                size="small"
                :placeholder="t('videoInfo.tagPlaceholder')"
                @keyup.enter="btn_addTag"
            />
            <div class="tags-container">
                <n-tag
                    v-for="(tag, index) in fileTags"
                    :key="index"
                    size="small"
                    closable
                    :color="{ color: tag.color, textColor: '#fff' }"
                    @close="btn_removeTag(tag)"
                >
                    {{ tag.name }}
                </n-tag>
            </div>
        </div>
    </div>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '@renderer/stores/AppStore'
import { useI18n } from 'vue-i18n'
import * as Dty from '../../../../../bridge/dataTypedef'
import util from '@renderer/utils/util'

const appStore = useAppStore()
const { t } = useI18n()

const fileTags = computed(() => {
    if (appStore.curSltVideo == null) return []
    return appStore.curSltVideo.tags
})

function btn_removeTag(tag: Dty.Tag): void {
    if (appStore.curSltVideo == null) {
        util.addToastErr(t('videoInfo.selectFileFirst'))
        return
    }

    util.file_tag_delete(appStore.curSltVideo.id, tag.id, {
        bNeedUpdate: true,
        bNeedSltCurVideo: true
    })
}

const newTag = ref('')
const btn_addTag = async (): Promise<void> => {
    const req = new Dty.FileTagsReq()
    let tagName = ''
    if (newTag.value.trim()) {
        tagName = newTag.value.trim()
    }
    if (tagName == '') {
        util.addToastErr(t('videoInfo.tagNameEmpty'))
        return
    }

    if (appStore.curCheckedVideo.size === 0) {
        util.addToastErr(t('videoInfo.selectFileFirst'))
        return
    }

    for (const item of appStore.curCheckedVideo) {
        const fileTag: Dty.FileTagsReqItem = {
            fileId: item.id,
            tagName: tagName
        }
        req.fileTags.push(fileTag)
    }

    await util.file_tags_set(req, { bNeedUpdate: true, bNeedSltCurVideo: true })
    newTag.value = ''
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
    overflow-x: hidden;
    overflow-y: auto;
    border-right: 1px solid #333;
}

.tag-info {
    width: 100%;
    padding: 8px;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.tags-container {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: flex-start;
}
</style>
