export enum CmdType {
    heartBeat = 'heart_beat',
    app_start = 'app_start',
    appConfigSave = 'app_config_save',
    tags_get = 'tags_get',
    tagUpdate = 'tag_update',
    tagDelete = 'tag_delete',
    fileTagDelete = 'file_tag_delete',
    filesGet = 'files_get',
    fileTagsSet = 'file_tags_set',
    tagsSearch = 'search_tag',
    search_file = 'search_file',
    sltVideo = 'slt_video',
    thumbGet = 'thumbGet',
    thumbImgGet = 'thumb_img_get',
    thumbDel = 'thumbDel',
    prjOpen = 'open_prj',
    prjOpenByPath = 'open_prj_by_path',
    prjClose = 'close_prj',

    prjSync = 'sync_prj',
    SyncStop = 'syncStop',

    videoDel = 'delete_video',
    thumbReconcile = 'thumb_reconcile',
    statsGet = 'stats_get',

    tinyFileDbStart = 'tinyFileDbStart',
    tinyFileDbStop = 'tinyFileDbStop',
    selectFolder = 'select_folder',
    createPrjWithPath = 'create_prj_with_path',
    prjSave = 'prj_save'
}

export class RecentItem {
    name: string = ''
    path: string = ''
    lastOpened: number = 0
}

export class AppInfo {
    prjFile: string = ''
    recentProjects: RecentItem[] = []
    language: LangType = 'en-US'
}

export class AppStartResp {
    appInfo: AppInfo = new AppInfo()
    prj: Prj | null = null
}

export class Req_OpenPrj {
    prjFile: string = ''
}

export type MessageShowType = 'success' | 'error' | 'warning' | 'info'
export class MessageReq {
    content: string = ''
    duration?: number = 0
    type: MessageShowType = 'success' //success, error, info, warning
}

export class ThumbnailInfo {
    path: string[] = []
}

export class ThumbImgGetReq {
    videoName: string = ''
    thumbName: string = ''
}

export class ThumbImgGetResp {
    data: string = '' // base64 encoded image data
    mimeType: string = 'image/jpeg'
}

// Define an enum, numeric type, representing file status
export enum Fstatus {
    Normal = 0, // Normal
    Deleted = 1, // Deleted, in trash
    Error = 2, // Error
    /**
     * Exists in database but not in folder
     * Record is incorrect, e.g. deleted file record but file still exists in folder
     */
    Destroy = 3, // Destroy
    Nothing = 4 // File not exists, and thumbnail not exists
}

// Fstatus enum value description mapping
const FileStatusMap: { [key: number]: string } = {
    [Fstatus.Normal]: 'Normal',
    [Fstatus.Deleted]: 'Trash',
    [Fstatus.Error]: 'Error',
    [Fstatus.Destroy]: 'Destroy'
}

// Get file status description text
export function fileStatusGet(status: Fstatus): string {
    return FileStatusMap[status] || 'Unknown'
}

export enum FileType {
    Mp4 = 0,
    Image = 1,
    Txt = 2
}

export class File {
    id: number = 0 // Video ID, can be omitted when adding
    name: string = '' // Video name 00_20250301124348_20250301124906.mp4
    path: string = '' // Video file path
    startTimeSec: number = 0 // Video start time in seconds
    endTimeSec: number = 0 // Video end time in seconds
    duration: number = 0 // Video duration
    size: number = 0 // Video size in bytes
    mediaInfo: MediaInfo | null = null // Stored as JSON string in database
    thumbnail: ThumbnailInfo = new ThumbnailInfo() // Stored as JSON string in database
    eventInfo: FileEventInfo | null = null // Stored as JSON string in database
    type: FileType = FileType.Mp4 // Data type
    status: Fstatus = Fstatus.Normal // Data status
    repo: string = '' // Data repository name
    description?: string = '' // file description
    tags: Tag[] = []
    static makePlayUrl(finfo: File): string {
        return `file://${finfo.path}`
    }
    // Recording start time string parsed from file name: 20250301-10:52:00
    static makeRecordTime(f: File): string {
        // 10_20250301105200_20250301105306.mp4
        const fileNameInfo = FileTools.miFilenameParse(f.name)
        if (fileNameInfo === null) {
            return f.name
        }
        const startTime = fileNameInfo.startTime
        return `${startTime.slice(0, 8)}-${startTime.slice(8, 10)}:${startTime.slice(10, 12)}:${startTime.slice(12, 14)}`
    }

    // Duration string: 5s / 1m 6s / 2h 3m 4s / 1d 2h 3m 4s
    static makeDurationStr(duration: number): string {
        if (duration < 60) {
            return `${duration}s`
        } else if (duration < 60 * 60) {
            const minutes = Math.floor(duration / 60)
            const seconds = Math.floor(duration % 60)
            return `${minutes}m ${seconds}s`
        } else if (duration < 60 * 60 * 24) {
            const hours = Math.floor(duration / (60 * 60))
            const minutes = Math.floor((duration % (60 * 60)) / 60)
            const seconds = Math.floor(duration % 60)
            return `${hours}h ${minutes}m ${seconds}s`
        }
        const days = Math.floor(duration / (60 * 60 * 24))
        const hours = Math.floor((duration % (60 * 60 * 24)) / (60 * 60))
        const minutes = Math.floor((duration % (60 * 60)) / 60)
        const seconds = Math.floor(duration % 60)
        return `${days}d ${hours}h ${minutes}m ${seconds}s`
    }

    static makeDisplayName(f: File): string {
        let displayName = `${this.makeRecordTime(f)}_${this.makeDurationStr(f.duration)}`
        for (const tInfo of f.tags) {
            displayName += ` ${Utils.makeTagShowName(tInfo.name)}`
        }
        return displayName
    }
}

export class FileModel {
    id?: number // Video ID, can be omitted when adding
    name: string = '' // Video name
    path: string = '' // Video file path
    startTimeSec: number = 0 // Video start time in seconds
    endTimeSec: number = 0 // Video end time in seconds
    duration: number = 0 // Video duration
    size: number = 0 // Video size in bytes
    mediaInfo: string = '' // Stored as JSON string in database
    splitInfo: string = '' // Kept for database schema compatibility, no longer used
    frameInfo: string = '' // Kept for database schema compatibility, no longer used
    thumbnail: string = '' // Stored as JSON string in database
    eventInfo: string = '' // Stored as JSON string in database
    type: FileType = FileType.Mp4 // Data type
    status: Fstatus = Fstatus.Normal // Data status
    repo: string = '' // Data repository name
    infoHash?: string = '' // data info hash value, calculate way: repo+path
    description?: string = '' // file description
    created_at?: string = '' // create time, add when insert
    updated_at?: string = '' // update time, add when update
    deleted_at?: string = '' // delete time, add when delete
    static makeInfoHash(repo: string, fPath: string, fStatus: Fstatus): string {
        switch (fStatus) {
            case Fstatus.Normal:
                return `${repo}+${fPath}`
            case Fstatus.Deleted:
            case Fstatus.Destroy:
            case Fstatus.Error:
            case Fstatus.Nothing: {
                const currentTime = Date.now()
                return `${repo}+${fPath}+${fStatus}+${currentTime}`
            }
            default:
                return `${repo}+${fPath}`
        }
    }
}

export class FileViewModel {
    id?: number // Video ID, can be omitted when adding
    name: string = '' // Video name
    path: string = '' // Video file path
    startTimeSec: number = 0 // Video start time in seconds
    endTimeSec: number = 0 // Video end time in seconds
    duration: number = 0 // Video duration
    size: number = 0 // Video size in bytes
    mediaInfo: string = '' // Stored as JSON string in database
    splitInfo: string = '' // Kept for database schema compatibility, no longer used
    frameInfo: string = '' // Kept for database schema compatibility, no longer used
    thumbnail: string = '' // Stored as JSON string in database
    eventInfo: string = '' // Stored as JSON string in database
    type: FileType = FileType.Mp4 // Data type
    status: Fstatus = Fstatus.Normal // Data status
    repo: string = '' // Data repository name
    infoHash?: string = '' // data info hash value, calculate way: repo+path
    description?: string = '' // file description
    created_at?: string = '' // create time, add when insert
    updated_at?: string = '' // update time, add when update
    deleted_at?: string = '' // delete time, add when delete
    tagName: string = ''
    tagColor: string = ''
}

export const tagDefColor = '#4A6FA5'
export const tagNoneDefName = 'sys_score0'

export class Tag {
    id: number = 0
    name: string = ''
    color: string = ''
    description: string = ''
}

export class TagModel {
    id?: number
    name: string = ''
    color: string = ''
    description: string = ''
    created_at?: string = '' // create time, add when insert
    updated_at?: string = '' // update time, add when update
    deleted_at?: string = '' // delete time, add when delete
}

export class FileTag {
    id: number = 0
    fileId: number = 0
    tagId: number = 0
}

export class FileTagModel {
    id?: number
    fileId: number = 0
    tagId: number = 0
    uniqueHash: string = '' // fileId + tagId
    created_at?: string = '' // create time, add when insert
    updated_at?: string = '' // update time, add when update
    deleted_at?: string = '' // delete time, add when delete
}

export class CreatePrjWithPathReq {
    dataRepo: DataRepo[] = []
    projectPath: string = ''
}

export class CreatePrjResp {
    prj: Prj = new Prj()
    prjFile: string = ''
}

export interface FileEventInfo {
    time: number
    area: number
    x: number
    y: number
    width: number
    height: number
    center_x: number
    center_y: number
    distance: number
    object_id: number
}

export interface MediaInfo {
    nb_streams: number
    duration: number
    size: number
    start_time: number
    bit_rate: number
    video: {
        codec_name: string
        codec_type: string
        width: number
        height: number
        pix_fmt: string
        bit_rate: number
        frame_rate: number
        nb_frames: number
    }
    audio: {
        codec_name: string
        codec_type: string
        sample_rate: number
        channels: number
        bit_rate: number
        channel_layout: string
    }
}

export enum RepoType {
    Normal = 'normal',
    Trash = 'trash'
}

export class DataRepo {
    path: string = ''
    name: string = '' // Must be unique
    thumbnailPath: string = ''
    framePath: string = ''
    static getRepoByPath(name: string, repos: DataRepo[]): DataRepo | null {
        for (const repo of repos) {
            if (repo.name == name) {
                return repo
            }
        }
        return null
    }
}

export class TrasStatus {
    folderNum: number = 0
    fileNum: number = 0
    fileErrNum: number = 0
}

export enum ThumbStrategy {
    ByTime = 'time',
    BySize = 'size'
}

export enum ThumbType {
    Thumb = 'thumb',
    Frame = 'frame',
    FnameThumb = 'fNameThumb'
}

export type LangType = 'zh-CN' | 'en-US'

export class Prj {
    name: string = ''
    version: string = '3.0.0'
    path: string = ''
    thumbStrategy: ThumbStrategy = ThumbStrategy.BySize
    thumbEachSec: number = 0.1
    thumbEachSize: number = 1024 * 1024 * 10
    numEachFolder: number = 10
    dataRepo: DataRepo[] = []
    repoType: RepoType = RepoType.Normal
    language: LangType = 'en-US'
}

export class Tiny2DbReq {
    tinyFilePath: string = ''
    tinyFileDbPath: string = ''
}

// Per-status file statistics
export class FileStatusStat {
    status: Fstatus = Fstatus.Normal
    count: number = 0
    duration: number = 0 // Total duration in seconds
    size: number = 0 // Total size in bytes
}

// Project statistics info
export class PrjStats {
    fileStats: FileStatusStat[] = []
    thumbSize: number = 0 // Total size of thumbnail folder (including .trash)
    frameSize: number = 0 // Total size of frame folder (including .trash)
}

export interface WorkResp<T = string> {
    cmd: CmdType
    data: T
}

export class HeartBeat {
    time: string = ''
    appStatus: string = ''
    processing: boolean = false
    workRespose: WorkResp[] = []
}

export enum TaskStatus {
    Pending = 'pending',
    Running = 'running',
    Completed = 'completed',
    Failed = 'failed'
}

export interface TaskNotify<T = unknown> {
    taskId: string
    cmd: CmdType
    status: TaskStatus
    progress?: number
    result?: T
    error?: string
}

// Sync progress stage
export type SyncStage = 'scan' | 'classify' | 'check' | 'thumb'

// Sync progress info pushed via task-notify during prj sync
export class SyncProgress {
    stage: SyncStage = 'scan'
    cur: number = 0
    total: number = 0 // 0 means total unknown (e.g. scan stage)
    stopped: boolean = false // true: sync stopped by user
}

export interface Req_TraversalFolder {
    type?: string
    startTime?: string //2025-03-25 12:00:00
    endTime?: string //2025-03-25 12:59:59
}

export interface TraversalFolder {
    folder?: string
    files?: File[]
}

export class DeleteFileReq {
    // del: move video to trash (thumb files untouched)
    // destroy: delete video from trash; bDelThumb=false only delete video,
    //          bDelThumb=true also delete thumb and frame db files
    // restore: move video from trash back to repo root folder
    type: 'del' | 'destroy' | 'restore' = 'del'
    bDelThumb: boolean = false
    // Valid fields: path, repo, name, ignore other fields
    files: File[] = []
}

export class DeleteFileResp {}

export interface Req_SltFile {
    filepath: string
}

export enum SyncType {
    all = 'all',
    prjInfo = 'prjInfo',
    classify = 'classify',
    thumbnail = 'thumbnail'
}
export class SyncPrjReq {
    type: SyncType[] = [SyncType.all]
    prj: Prj = new Prj()
}
export class SyncPrjResp {
    prj: Prj | null = null
}

export class FileTagsReqItem {
    fileId: number = 0
    tagName: string = ''
}

export class FileTagsReq {
    fileTags: FileTagsReqItem[] = []
}

export class FilesReq {
    page?: number | null = null // Page number, starting from 1
    pageSize: number | null = null
    name: string | null = null // File name, exact match
    path: string | null = null
    repo: string | null = null
    bWithThumb?: boolean | null = null // true: only records with thumbnail data (thumbnail json not empty)
    status: Fstatus[] = []
    startTimeSecMin: number | null = null
    startTimeSecMax: number | null = null
    endTimeSecMin: number | null = null
    endTimeSecMax: number | null = null
    durationMin: number | null = null
    durationMax: number | null = null
    sizeMin: number | null = null
    sizeMax: number | null = null
    tags: string[] = []
    type: FileType[] = []
    // Ascending, descending
    order: 'asc' | 'desc' = 'asc' // Enum value passed directly to database
    orderBy: 'name' | 'startTimeSec' | 'endTimeSec' | 'size' | 'duration' = 'startTimeSec' // Enum value passed directly to database

    static makeReqStatusNormal(path: string | null, repo: string | null): FilesReq {
        const req = new FilesReq()
        req.path = path
        req.repo = repo
        req.status = [Fstatus.Normal]
        return req
    }
    static makeReqStatusDel(repo: string | null): FilesReq {
        const req = new FilesReq()
        req.repo = repo
        req.status = [Fstatus.Deleted]
        return req
    }
}

export class FilesResp {
    total: number = 0
    files: File[] = []
}

export class TagsReq {
    page?: number | null = null // Page number, starting from 1
    pageSize: number | null = null
    name: string | null = null
    color: string | null = null
    order: 'asc' | 'desc' = 'asc' // Enum value passed directly to database
    orderBy: 'id' | 'name' | 'created_at' | 'updated_at' = 'created_at' // Enum value passed directly to database
    static makeReq(page: number, pageSize: number): TagsReq {
        const req = new TagsReq()
        req.page = page
        req.pageSize = pageSize
        return req
    }
}
export class TagsResp {
    total: number = 0
    tags: Tag[] = []
}

export class TagUpdateReq {
    id: number = 0
    name?: string = ''
    color?: string = ''
    description?: string = ''
}

export class TagDeleteReq {
    id: number = 0
}

export class FileTagDeleteReq {
    fileId: number = 0
    tagId: number = 0
}

// ======================== main

export class DbInsertResp {
    id: number = 0
}

// ======================== render

export interface FileTagsSetParam {
    bNeedUpdate?: boolean
    bNeedSltCurVideo?: boolean
    bThumbList?: boolean // true: refresh thumb list instead of video list after set
}

export enum WorkPanel {
    List = 'list',
    VideoInfo = 'videoInfo'
}

export class ClearSltInfoReq {
    clearModel?: string
    bNotClear_curSltVideo?: boolean
}

// ========================
export enum RespCode {
    Success = 0,
    Error = 1,
    FileExist = 1001
}

export class Resp<T = string> {
    code: RespCode
    status: string
    bOver?: boolean // Whether execution is completed
    data?: T

    constructor() {
        this.code = RespCode.Success
        this.status = 'success'
        this.bOver = undefined
        this.data = undefined
    }
    err(desc: string): Resp<T> {
        this.code = RespCode.Error
        this.status = desc
        return this
    }
    success(desc: string = 'success'): Resp<T> {
        this.code = RespCode.Success
        this.status = desc
        return this
    }
    isSuccess(): boolean {
        return this.code === RespCode.Success
    }
}

export interface Req<T = string> {
    cmd: CmdType
    data?: T
    cseq?: number
}

// ======================== tools

// Define return type after parsing filename 10_20250301104336_20250301104500.mp4
interface ParsedFilename {
    sequence: string // 10
    startTime: string // 20250301104336
    endTime: string // 20250301104500
    startTimeSec: number // Start time in seconds
    endTimeSec: number // End time in seconds
    durationSec: number // Video duration in seconds
}

export class FileTools {
    // Convert seconds to time string in specific format 20250323140336
    static parsetimeToTimeStr(time: number): string {
        // Convert seconds to Date object
        const date = new Date(time * 1000)

        // Extract year, month, day, hour, minute, second and format as two digits
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hour = String(date.getHours()).padStart(2, '0')
        const minute = String(date.getMinutes()).padStart(2, '0')
        const second = String(date.getSeconds()).padStart(2, '0')

        // Combine into 20250323140336 format string
        const picTimeStr = `${year}${month}${day}${hour}${minute}${second}`
        return picTimeStr
    }
    // Parse filename, extract sequence, start time and end time 10_20250301104336_20250301104500.mp4
    static miFilenameParse(title: string | null): ParsedFilename | null {
        if (title == null) {
            return null
        }
        const [sequence, startTime, endTimeWithExtension] = title.split('_')
        if (endTimeWithExtension === undefined) {
            return null
        }
        const endTime = endTimeWithExtension.replace('.mp4', '')
        const fileNameInfo: ParsedFilename = {
            sequence,
            startTime,
            endTime,
            startTimeSec: FileTools.parse_timestr_2_seconds(startTime),
            endTimeSec: FileTools.parse_timestr_2_seconds(endTime),
            durationSec:
                FileTools.parse_timestr_2_seconds(endTime) -
                FileTools.parse_timestr_2_seconds(startTime)
        }
        return fileNameInfo
    }
    // Convert time string to seconds 20250301104336 => 1682831816
    static parse_timestr_2_seconds(timeStr: string): number {
        const year = parseInt(timeStr.slice(0, 4), 10)
        const month = parseInt(timeStr.slice(4, 6), 10) - 1 // Month starts from 0
        const day = parseInt(timeStr.slice(6, 8), 10)
        const hour = parseInt(timeStr.slice(8, 10), 10)
        const minute = parseInt(timeStr.slice(10, 12), 10)
        const second = parseInt(timeStr.slice(12, 14), 10)
        return new Date(year, month, day, hour, minute, second).getTime() / 1000
    }
    // Convert seconds to time string 1682831816 => 20250301104336
    static parse_seconds_2_timestr(seconds: number): string {
        const date = new Date(seconds * 1000) // Convert seconds to milliseconds
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        const secs = String(date.getSeconds()).padStart(2, '0')
        return `${year}${month}${day}${hours}${minutes}${secs}`
    }
}

export class Utils {
    // Convert seconds to HH:MM:SS.mmm format
    static time_2_msec_str(time: number): string {
        const hours = Math.floor(time / 3600)
        const minutes = Math.floor((time % 3600) / 60)
        const seconds = Math.floor(time % 60)
        const milliseconds = Math.floor((time - Math.floor(time)) * 1000)
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`
    }

    static makeTagShowName(tagName: string): string {
        switch (tagName) {
            case 'sys_score0':
                return ''
            case 'sys_score1':
                return '1☆'
            case 'sys_score2':
                return '2☆'
            case 'sys_score3':
                return '3☆'
            case 'sys_score4':
                return '4☆'
            case 'sys_score5':
                return '5☆'
            case 'sys_score6':
                return '6☆'
            case 'sys_score7':
                return '7☆'
            case 'sys_score8':
                return '8☆'
            case 'sys_score9':
                return '9☆'
            case 'sys_score10':
                return '10☆'
            default:
                return tagName
        }
    }
}
