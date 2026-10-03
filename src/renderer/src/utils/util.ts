import type { AppStore } from '../stores/AppStore'
let appStore: AppStore

import * as Dty from '../../../bridge/dataTypedef'
import { IpcApi } from './ipcApi'

// Create an internationalization function that can be used in Vue components
let t: (key: string, values?: Record<string, unknown>) => string = (key: string) => key

// Set internationalization function, called by Vue component
export function setI18nFunction(
    i18nFunction: (key: string, values?: Record<string, unknown>) => string
): void {
    t = i18nFunction
}

function stop_play(bClearCurSltVideo: boolean = true): void {
    if (appStore.videoPlayCtrl.isPlay == false && appStore.videoPlayCtrl.isStop == true) {
        return
    }
    if (bClearCurSltVideo) {
        util.clear_cur_slt_video_info(null)
    } else {
        const clearReq = new Dty.ClearSltInfoReq()
        clearReq.bNotClear_curSltVideo = true
        util.clear_cur_slt_video_info(clearReq)
    }
}

export class PlayReq {
    src: string
    playStartTimeSec?: number
    onPlayCbk?: () => void
    beforePlayCbk?: () => void
    constructor(src: string) {
        this.src = src
    }
}

// Wrap video event listener function
function setupVideoEventListeners(videoRef: HTMLVideoElement, bRemoveEvent: boolean = false): void {
    // Listen for video loaded metadata event, get video total duration
    const onLoadedMetadata = (): void => {
        appStore.videoPlayCtrl.videoStartTime = 0
    }
    videoRef.addEventListener('loadedmetadata', onLoadedMetadata)

    // Listen for video time update event, update current playback time
    const onTimeUpdate = (): void => {
        if (videoRef != null) {
            // Subtract start time to get playback time from video start point
            appStore.videoPlayCtrl.curTime =
                videoRef.currentTime - appStore.videoPlayCtrl.videoStartTime
        }
    }
    videoRef.addEventListener('timeupdate', onTimeUpdate)

    // Listen for video play events and update the playback status
    const onPlay = (): void => {
        appStore.videoPlayCtrl.isPlay = true
    }
    videoRef.addEventListener('play', onPlay)

    // Listen for video pause events and update the playback status
    const onPause = (): void => {
        appStore.videoPlayCtrl.isPlay = false
    }
    videoRef.addEventListener('pause', onPause)

    if (bRemoveEvent) {
        videoRef.removeEventListener('loadedmetadata', onLoadedMetadata)
        videoRef.removeEventListener('timeupdate', onTimeUpdate)
        videoRef.removeEventListener('play', onPlay)
        videoRef.removeEventListener('pause', onPause)
    }
}

function set_video_cur_time(videoRef: HTMLVideoElement, curTime: number): void {
    if (videoRef == null) {
        console.log('video ref null')
        return
    }
    videoRef.currentTime = curTime + appStore.videoPlayCtrl.videoStartTime
}

function play_video(videoRef: HTMLVideoElement, req: PlayReq): void {
    if (videoRef == null) {
        console.log('video ref null')
        return
    }
    if (appStore.curViewModel != 'video') {
        return
    }
    videoRef.pause()
    appStore.videoPlayCtrl.curSrc = req.src
    videoRef.load()

    setupVideoEventListeners(videoRef, true)
    // Listen for canplay event
    const onCanPlay = (): void => {
        if (videoRef == null) {
            util.addToastErr('video ref null')
            return
        }
        appStore.videoPlayCtrl.curTime = 0
        if (req.beforePlayCbk != null) {
            req.beforePlayCbk()
        }
        videoRef.play()
        setupVideoEventListeners(videoRef)
        // Remove listener to avoid repeated triggering
        videoRef.removeEventListener('canplay', onCanPlay)
        if (req.playStartTimeSec != null) {
            appStore.barSeekTime = req.playStartTimeSec
        }
    }
    videoRef.addEventListener('canplay', onCanPlay)

    videoRef.addEventListener('error', () => {
        console.log(`video err: ${videoRef.error?.message}`)
    })
}

function toggle_play(videoRef: HTMLVideoElement): void {
    // First check if a video is selected
    if (appStore.curSltVideo == null) {
        return
    }
    if (!appStore.videoPlayCtrl.isPlay) {
        videoRef.pause()
        return
    }

    function convert_filepath_to_linux_style(filepath: string | null): string | null {
        if (filepath == null) {
            return null
        }
        return filepath.replace(/\\/g, '/')
    }
    let p1 = convert_filepath_to_linux_style(videoRef.src)
    let p2 = convert_filepath_to_linux_style(Dty.File.makePlayUrl(appStore.curSltVideo))
    // Then remove prefix file:// or file:/// from p1, p2
    if (p1?.startsWith('file:///')) {
        p1 = p1.substring(8)
    } else if (p1?.startsWith('file://')) {
        p1 = p1.substring(7)
    }
    if (p2?.startsWith('file:///')) {
        p2 = p2.substring(8)
    } else if (p2?.startsWith('file://')) {
        p2 = p2.substring(7)
    }
    if (p1 !== p2) {
        const playReq = new PlayReq(Dty.File.makePlayUrl(appStore.curSltVideo))
        util.play_video(videoRef, playReq)
    } else {
        videoRef.play()
    }
}

function set_volume(volume: number): void {
    const videoRef = appStore.func_get_ele_video?.()
    if (videoRef) {
        videoRef.volume = volume
    }
}

function set_volume_muted(muted: boolean): void {
    const videoRef = appStore.func_get_ele_video?.()
    if (videoRef) {
        videoRef.muted = muted
    }
}

let heartbeatCnt = 0
const runFlgArray: string[] = ['🏃🏼', '🚶🏼']

async function saveFileManagementProject(): Promise<Dty.Resp<string>> {
    const resp = new Dty.Resp<string>()
    if (!appStore.prj) {
        return resp.err('no project opened')
    }
    const req: Dty.Req<Dty.Prj> = {
        cmd: Dty.CmdType.prjSave,
        data: appStore.prj
    }
    return await IpcApi.trigger_event(req)
}

class Util {
    saveFileManagementProject = saveFileManagementProject
    set_video_cur_time = set_video_cur_time

    static addToast(message: string, type: Dty.MessageShowType = 'info'): void {
        const id = Date.now()
        const timestamp = Date.now()
        const toast = { id, message, type, timestamp }

        // Show via Naive UI message
        const nMsg = window.$message
        if (nMsg) {
            if (type === 'error') {
                nMsg.error(message)
            } else {
                nMsg.info(message)
            }
        }

        // Add to history messages
        appStore.historyToasts.push(toast)

        // Limit history message count, keep max 100
        if (appStore.historyToasts.length > 100) {
            appStore.historyToasts.shift()
        }
    }
    addToast = Util.addToast
    addToastInfo = (message: string): void => {
        Util.addToast(message, 'info')
    }
    addToastErr = (message: string): void => {
        Util.addToast(message, 'error')
    }
    // Clear all history messages
    clearHistoryToasts(): void {
        appStore.historyToasts = []
    }

    private updateAppInfo(appStartResp: Dty.AppStartResp): void {
        appStore.appInfo = appStartResp.appInfo
        appStore.recentProjects = appStartResp.appInfo.recentProjects || []
    }

    async start_app(): Promise<Dty.Resp> {
        const resp = new Dty.Resp()
        const req: Dty.Req = { cmd: Dty.CmdType.app_start }
        const response: Dty.Resp<Dty.AppStartResp> = await IpcApi.trigger_event(req)
        if (response.code != Dty.RespCode.Success) {
            return resp.err(response.status)
        }
        if (response.data == null) {
            return resp.err('app start resp data is null')
        }
        this.updateAppInfo(response.data)
        return resp
    }

    process_heartbeat(resp: Dty.Resp<Dty.HeartBeat>): void {
        if (resp.code != Dty.RespCode.Success || resp.data === undefined) {
            console.log('process heartbeat failed', resp)
            return
        }
        const respData: Dty.HeartBeat = resp.data
        const curTime = respData.time
        let titleStr = curTime + ' '
        titleStr += respData.processing ? runFlgArray[heartbeatCnt++ % runFlgArray.length] : '🧍‍♂️'
        titleStr += respData.appStatus
        if (appStore) {
            appStore.documentTitle = titleStr
        }
    }

    processTaskNotify(data: string): void {
        try {
            const notify: Dty.TaskNotify = JSON.parse(data)
            console.log(`Task [${notify.taskId}] ${notify.cmd} - ${notify.status}`)

            if (notify.status === Dty.TaskStatus.Completed && notify.result) {
                const workResp: Dty.WorkResp = {
                    cmd: notify.cmd,
                    data: JSON.stringify(notify.result)
                }
                util.process_work_response(JSON.stringify(workResp))
            } else if (notify.status === Dty.TaskStatus.Failed) {
                util.addToastErr(`${t('util.taskFailed')}: ${notify.error || 'Unknown error'}`)
            }
        } catch (error) {
            console.error('processTaskNotify error:', error)
        }
    }

    async thumbsDel(reqInfo: Dty.DeleteFileReq): Promise<void> {
        const req: Dty.Req<Dty.DeleteFileReq> = {
            cmd: Dty.CmdType.thumbDel,
            data: reqInfo
        }
        const response = await IpcApi.trigger_event(req)
        if (response.code === 1001) {
            return
        }
        const delStr =
            reqInfo.type == 'destroy' ? t('util.permanentlyDelete') : t('util.moveToTrash')
        if (response.code !== 0) {
            util.addToastErr(`${delStr} ${t('util.failed')}: ${response.status}`)
        } else {
            if (response.bOver === false) {
                util.addToastInfo(`${delStr} ${t('util.processing')}`)
            } else {
                const searchReq = new Dty.FilesReq()
                searchReq.status.push(appStore.fileSearchStatus)
                await this.thumbsGet(searchReq)
                util.addToastInfo(`${delStr} ${t('util.success')}`)
            }
        }
    }

    async filesDel(reqInfo: Dty.DeleteFileReq): Promise<void> {
        util.stop_play()
        const req: Dty.Req<Dty.DeleteFileReq> = {
            cmd: Dty.CmdType.videoDel,
            data: reqInfo
        }
        const response = await IpcApi.trigger_event(req)
        if (response.code === 1001) {
            return
        }
        const delStr =
            reqInfo.type == 'destroy' ? t('util.permanentlyDelete') : t('util.moveToTrash')
        if (response.code !== 0) {
            util.addToastErr(`${delStr} ${t('util.failed')}: ${response.status}`)
        } else {
            if (response.bOver === false) {
                util.addToastInfo(`${delStr} ${t('util.processing')}`)
            } else {
                appStore.curCheckedVideo.clear()
                const searchReq = new Dty.FilesReq()
                searchReq.status.push(appStore.fileSearchStatus)
                await this.files_get(searchReq)
                util.addToastInfo(`${delStr} ${t('util.success')}`)
            }
        }
    }

    async get_slt_video(video: Dty.File | null): Promise<void> {
        if (video == null) {
            return
        }
        const req: Dty.Req<Dty.Req_SltFile> = {
            cmd: Dty.CmdType.sltVideo,
            data: {
                filepath: video.path
            }
        }
        const response: Dty.Resp<Dty.File> = await IpcApi.trigger_event(req)
        if (response.code !== 0) {
            console.log('select video failed', response)
        } else {
            if (response.bOver == false) {
                util.addToastInfo(t('util.processing'))
                return
            }
            const respData: Dty.File | undefined = response.data
            if (respData == undefined) {
                util.addToastErr(`${t('util.getVideoInfoFailed')}: ${response.status}`)
                console.log('select video failed', response)
                return
            }
            appStore.curSltVideo = respData
        }
    }

    async create_prj_with_path(
        dataRepo: Dty.DataRepo[],
        projectPath: string
    ): Promise<Dty.Resp<Dty.CreatePrjResp>> {
        const req: Dty.Req<Dty.CreatePrjWithPathReq> = {
            cmd: Dty.CmdType.createPrjWithPath,
            data: {
                dataRepo: dataRepo,
                projectPath: projectPath
            }
        }
        const response: Dty.Resp<Dty.CreatePrjResp> = await IpcApi.trigger_event(req)
        if (response.code == 0) {
            if (response.data?.prj != null) {
                appStore.prj = response.data.prj
                appStore.appInfo.prjFile = response.data.prjFile
            }
        }
        return response
    }

    async sync_prj(types: Dty.SyncType[]): Promise<Dty.Resp<Dty.SyncPrjResp>> {
        util.addToastInfo(t('util.syncStarted'))
        const req: Dty.Req<Dty.SyncPrjReq> = {
            cmd: Dty.CmdType.prjSync,
            data: {
                type: types,
                prj: appStore.prj!
            }
        }
        const response: Dty.Resp<Dty.SyncPrjResp> = await IpcApi.trigger_event(req)
        if (response.code == 0) {
            if (response.data?.prj != null) {
                appStore.prj = response.data?.prj
            }
        }
        return response
    }

    async thumbsGet(reqParam: Dty.FilesReq | null): Promise<Dty.Resp<Dty.FilesResp>> {
        const req: Dty.Req<Dty.FilesReq> = {
            cmd: Dty.CmdType.thumbGet,
            data: reqParam == null ? new Dty.FilesReq() : reqParam
        }
        if (!req.data) {
            const resp = new Dty.Resp<Dty.FilesResp>()
            resp.code = Dty.RespCode.Error
            return resp
        }
        req.data.page = appStore.fileSearchPage
        req.data.pageSize = appStore.fileSearchPageSize
        const response: Dty.Resp<Dty.FilesResp> = await IpcApi.trigger_event(req)
        if (response.code != 0) {
            util.addToastErr(`search file failed: ${response.status}`)
            console.log(`search file failed: ${response.status}`)
            return response
        }
        appStore.thumbList = response.data?.files || []
        appStore.thumbTotalNum = response.data?.total || 0
        if (appStore.thumbList.length == 0) {
            util.addToastInfo(
                `${t('util.noFiles')}，${t('util.currentMode')}:${appStore.fileSearchStatus == Dty.Fstatus.Deleted ? t('util.trashMode') : t('util.normalMode')}`
            )
        }
        return response
    }

    async thumb_img_get(videoName: string, thumbName: string): Promise<string | null> {
        const req: Dty.Req<Dty.ThumbImgGetReq> = {
            cmd: Dty.CmdType.thumbImgGet,
            data: { videoName, thumbName }
        }
        const response: Dty.Resp<Dty.ThumbImgGetResp> = await IpcApi.trigger_event(req)
        if (response.code !== 0 || !response.data) {
            console.error(`get thumb image failed: ${response.status}`)
            return null
        }
        return `data:${response.data.mimeType};base64,${response.data.data}`
    }

    async files_get(reqParam: Dty.FilesReq | null): Promise<Dty.Resp<Dty.FilesResp>> {
        const req: Dty.Req<Dty.FilesReq> = {
            cmd: Dty.CmdType.filesGet,
            data: reqParam == null ? new Dty.FilesReq() : reqParam
        }
        if (!req.data) {
            const resp = new Dty.Resp<Dty.FilesResp>()
            resp.code = Dty.RespCode.Error
            return resp
        }
        req.data.page = appStore.fileSearchPage
        req.data.pageSize = appStore.fileSearchPageSize
        const response: Dty.Resp<Dty.FilesResp> = await IpcApi.trigger_event(req)
        if (response.code !== 0) {
            util.addToastErr(`${t('util.getFileListFailed')}: ${response.status}`)
            return response
        } else {
            if (response.bOver == false) {
                util.addToastInfo(t('util.processing'))
                return response
            }
        }
        appStore.videoList = response.data?.files || []
        appStore.videoTotalNum = response.data?.total || 0
        console.info('search file success', response.data)
        return response
    }

    async tags_get(reqParam: Dty.TagsReq | null): Promise<Dty.Resp<Dty.TagsResp>> {
        const req: Dty.Req<Dty.TagsReq> = {
            cmd: Dty.CmdType.tags_get,
            data: reqParam == null ? new Dty.TagsReq() : reqParam
        }
        const response: Dty.Resp<Dty.TagsResp> = await IpcApi.trigger_event(req)
        if (response.code !== 0) {
            util.addToastErr(`${t('util.getTagListFailed')}: ${response.status}`)
            return response
        } else {
            if (response.bOver == false) {
                util.addToastInfo(t('util.processing'))
                return response
            }
        }
        appStore.tags = response.data?.tags || []
        return response
    }

    async tag_update(reqParam: Dty.TagUpdateReq): Promise<Dty.Resp> {
        const req: Dty.Req<Dty.TagUpdateReq> = {
            cmd: Dty.CmdType.tagUpdate,
            data: reqParam
        }
        const response: Dty.Resp = await IpcApi.trigger_event(req)
        if (response.code !== 0) {
            util.addToastErr(`${t('adminTagMng.updateFailed')}: ${response.status}`)
        } else {
            util.addToastInfo(t('adminTagMng.updateSuccess'))
            await this.tags_get(null)
        }
        return response
    }

    async tag_delete(tagId: number): Promise<Dty.Resp> {
        const req: Dty.Req<Dty.TagDeleteReq> = {
            cmd: Dty.CmdType.tagDelete,
            data: { id: tagId } as Dty.TagDeleteReq
        }
        const response: Dty.Resp = await IpcApi.trigger_event(req)
        if (response.code !== 0) {
            util.addToastErr(`${t('adminTagMng.deleteFailed')}: ${response.status}`)
        } else {
            util.addToastInfo(t('adminTagMng.deleteSuccess'))
            await this.tags_get(null)
        }
        return response
    }

    async file_tag_delete(
        fileId: number,
        tagId: number,
        param: Dty.FileTagsSetParam | null = null
    ): Promise<void> {
        const req: Dty.Req<Dty.FileTagDeleteReq> = {
            cmd: Dty.CmdType.fileTagDelete,
            data: { fileId, tagId }
        }
        const response: Dty.Resp = await IpcApi.trigger_event(req)
        if (response.code !== 0) {
            util.addToastErr(`${t('util.deleteTagFailed')}: ${response.status}`)
        } else {
            if (param != null && param.bNeedUpdate) {
                const searchReq = new Dty.FilesReq()
                searchReq.status.push(appStore.fileSearchStatus)
                await this.files_get(searchReq)
                await this.tags_get(null)
                if (param.bNeedSltCurVideo && appStore.curSltVideo) {
                    await this.get_slt_video(appStore.curSltVideo)
                }
            }
            util.addToastInfo(t('util.deleteTagSuccess'))
        }
    }

    async file_tags_set(
        fileTags: Dty.FileTagsReq,
        param: Dty.FileTagsSetParam | null = null
    ): Promise<void> {
        const req: Dty.Req<Dty.FileTagsReq> = {
            cmd: Dty.CmdType.fileTagsSet,
            data: fileTags
        }
        const response: Dty.Resp = await IpcApi.trigger_event(req)
        if (response.code !== 0) {
            util.addToastErr(`${t('util.setTagFailed')}: ${response.status}`)
        } else {
            if (response.bOver == false) {
                util.addToastInfo(t('util.processing'))
                return
            }
            if (param != null) {
                if (param.bNeedUpdate) {
                    const searchReq = new Dty.FilesReq()
                    searchReq.status.push(appStore.fileSearchStatus)
                    await this.files_get(searchReq)
                    await this.tags_get(null)
                }
                if (param.bNeedSltCurVideo) {
                    await this.get_slt_video(appStore.curSltVideo)
                }
            }
            util.addToastInfo(t('util.setTagSuccess'))
        }
    }

    clear_cur_slt_video_info(req: Dty.ClearSltInfoReq | null): void {
        const clear_videoPlayCtrl = (): void => {
            if (appStore) {
                appStore.videoPlayCtrl.curSrc = ''
                appStore.videoPlayCtrl.curTime = 0
                appStore.videoPlayCtrl.videoStartTime = 0
                appStore.videoPlayCtrl.isPlay = false
                appStore.videoPlayCtrl.playbackRate = 1.0
            }
        }

        // Conditional clear
        if (req != null) {
            if (req.clearModel === 'changeToThumbnail') {
                const tmpDuration = appStore?.curSltVideo?.mediaInfo?.duration
                clear_videoPlayCtrl()
                if (appStore?.curSltVideo?.mediaInfo?.duration !== undefined) {
                    appStore.curSltVideo.mediaInfo.duration = tmpDuration || 0
                }
                if (appStore) {
                    appStore.barSeekTime = 0
                }
                return
            }
        }

        // Clear all
        clear_videoPlayCtrl()
        appStore.barSeekTime = 0
        if (!(req?.bNotClear_curSltVideo == true)) {
            appStore.curSltVideo = null
            appStore.curSltVideoName4Play = ''
        }
    }

    stop_play = stop_play
    play_video = play_video
    toggle_play = toggle_play
    set_volume = set_volume
    set_volume_muted = set_volume_muted
    setupVideoEventListeners = setupVideoEventListeners
    setAppStore(store): void {
        appStore = store
    }

    process_work_response(data: string): void {
        const datCmd: Dty.WorkResp = JSON.parse(data)
        const cmd = datCmd.cmd
        switch (cmd) {
            case Dty.CmdType.videoDel:
                {
                    const workRespose: Dty.WorkResp<Dty.Resp> = JSON.parse(data)
                    const response = workRespose.data
                    if (response.code !== 0) {
                        util.addToastErr(`${t('util.deleteFailed')}: ${response.status}`)
                        console.log('delete video failed', response)
                    } else {
                        util.addToastInfo(`${t('util.deleteCompleted')}:${response.status}`)
                        const searchReq = new Dty.FilesReq()
                        searchReq.status.push(appStore.fileSearchStatus)
                        this.files_get(searchReq)
                    }
                }
                break
        }
    }

    getFilenameFromPath(filePath: string | null | undefined): string {
        if (filePath == null || filePath === '') return ''
        const parts = filePath.split(/[\\/]/)
        const fileName = parts[parts.length - 1]
        return fileName
    }

    viewModelChange(viewModel: 'video' | 'thumbnail'): void {
        if (viewModel === 'video') {
            appStore.curViewModel = 'video'
        } else if (viewModel === 'thumbnail') {
            appStore.curViewModel = 'thumbnail'
        }
    }
}

const util = new Util()
export default util
