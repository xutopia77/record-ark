import * as path from 'path'
import * as fs from 'fs'
import mediaProc from './MediaProcess.js'
import logger from './Logger'
import appDb from './AppDb'
import recordsProc from './RecordsProcess.js'
import * as Dty from '../../bridge/dataTypedef'
import appCfg from './AppCfg.js'
import { taskManager } from './TaskEvent'
import { Util } from './Utils.js'
import sqlite3 from 'sqlite3'
import { open, Database } from 'sqlite'
import { dialog } from 'electron'

function logStatusRespReturn<T>(resp: Dty.Resp<T>): Dty.Resp<T> {
    if (resp.code === 0) {
        taskManager.statusSet(logger.info(resp.status))
    } else {
        taskManager.statusSet(logger.error(resp.status))
    }
    return resp
}

/**
 * Safely rename file, check source file existence and destination file conflict
 * @param srcPath Source file path
 * @param destPath Destination file path
 * @param type Rename type
 *          force : Force move, if destination file exists, delete it first then move
 *          strict : Strict mode, if destination file exists, do nothing
 */
async function fileSafeRename(
    srcPath: string,
    destPath: string,
    type: 'force' | 'strict' = 'strict'
): Promise<'destExist' | 'srcNot' | 'success' | 'err'> {
    try {
        // Check if source file exists
        if (!fs.existsSync(srcPath)) {
            logger.warn(`Source file does not exist: ${srcPath}`)
            return 'srcNot'
        }

        // If destination file exists, delete it first
        if (fs.existsSync(destPath)) {
            // logger.info(`Destination file already exists, removing: ${destPath}`)
            if (type == 'force') {
                await fs.promises.unlink(destPath)
            } else {
                return 'destExist'
            }
        }

        // Ensure destination directory exists
        const destDir = path.dirname(destPath)
        if (!fs.existsSync(destDir)) {
            await fs.promises.mkdir(destDir, { recursive: true })
        }

        // Execute rename operation
        await fs.promises.rename(srcPath, destPath)
        return 'success'
    } catch (error) {
        logger.error(`Failed to rename file from ${srcPath} to ${destPath}:`, error)
        return 'err'
    }
}

export class TraversalFolder {
    type: string | null = null // Only traverse subfolders during search
    repo: Dty.DataRepo = new Dty.DataRepo()
    bSort: boolean = false
    status: Dty.TrasStatus = new Dty.TrasStatus()

    async procOneFile(fPath: string, fName: string, stats: fs.Stats): Promise<Dty.Resp> {
        const resp: Dty.Resp = new Dty.Resp()

        this.status.fileNum++
        taskManager.statusSet(`traversal file count: ${this.status.fileNum}`)
        const fileTimeInfo = Dty.FileTools.miFilenameParse(fName)
        if (fileTimeInfo == null) {
            this.status.fileErrNum++
            return resp.err(logger.warn(`traversal skip: ${fPath}`))
        }
        // 1, check file if in db
        const searchReq: Dty.FilesReq = new Dty.FilesReq()
        searchReq.path = fPath
        const respSearch = await appDb.filesSearch(searchReq)
        if (respSearch.isSuccess()) {
            if (respSearch.data?.files.length != null && respSearch.data.files.length > 0) {
                if (respSearch.data.files.length > 1) {
                    logger.info(
                        `file already exist,but record number=${respSearch.data.files.length},${fPath}`
                    )
                }
                const fInfo = respSearch.data?.files[0]
                // check file status [todo] check other status
                if (fInfo?.status != Dty.Fstatus.Normal) {
                    const statusStr = Dty.fileStatusGet(fInfo.status)
                    const delResp = await appDb.fileDeleteById(fInfo.id)
                    logger.info(`file status=${statusStr},${delResp.status}`)
                } else {
                    return resp.success(`file already exists: ${fPath}`)
                }
            }
        }

        // 2, insert file in db
        const respMediaInfo = await mediaProc.getVideoInfo(fPath)
        const fileModel: Dty.FileModel = {
            name: fName,
            path: fPath,
            startTimeSec: fileTimeInfo.startTimeSec, // Video start time in seconds
            endTimeSec: fileTimeInfo.endTimeSec, // Video end time in seconds
            duration: fileTimeInfo.durationSec, // Video duration
            size: stats.size, // Video size in bytes
            mediaInfo: JSON.stringify(respMediaInfo),
            splitInfo: '',
            frameInfo: '',
            thumbnail: '',
            eventInfo: '',
            type: Dty.FileType.Mp4,
            status: Dty.Fstatus.Normal,
            repo: this.repo.name
        }
        const respInsert = await appDb.file_insert(fileModel)
        logger.info(
            `file insert num=${this.status.fileNum}, id:${respInsert.data?.id} ${respInsert.status} ${fPath}`
        )
        if (respInsert.code != Dty.RespCode.Success) {
            this.status.fileErrNum++
            return resp.err(`file insert err ${respInsert.status}`)
        }
        return resp
    }

    /*
        1, Traverse folder. Insert files into database, if file already exists, check file status,
        if file status is normal, skip and do not insert into database, if file status is abnormal,
        delete file record first then insert into database, although thumbnail file may still exist,
        it can be regenerated later.
    */
    async folderTraversal(): Promise<Dty.Resp> {
        const resp = new Dty.Resp()
        const folderPath = this.repo.path
        if (!folderPath || !fs.existsSync(folderPath)) {
            return resp.err('folder not exist')
        }
        try {
            const stack: string[] = [folderPath]
            while (stack.length > 0) {
                const currentPath = stack.pop()!
                try {
                    const currentFiles = await fs.promises.readdir(currentPath)
                    for (const file of currentFiles) {
                        if (bSyncPrjStop) {
                            logger.info(`prj sync stop cur in traversal folder`)
                            syncProgressNotify('scan', this.status.fileNum, 0, true)
                            return resp
                        }
                        const filePath = path.join(currentPath, file)
                        try {
                            const stats = await fs.promises.stat(filePath)
                            if (stats.isDirectory()) {
                                // todo if directory name is trash, also scan and update database status
                                if (file === '.trash') {
                                    // logger.log(`traversal skip: ${filePath}`)
                                    continue
                                }
                                stack.push(filePath)
                            } else {
                                try {
                                    await this.procOneFile(filePath, file, stats)
                                    syncProgressNotify('scan', this.status.fileNum, 0)
                                } catch (procError) {
                                    console.error(`Error processing file ${filePath}:`, procError)
                                }
                            }
                        } catch (statError) {
                            console.error(`Error getting stats for ${filePath}:`, statError)
                        }
                    }
                } catch (readdirError) {
                    console.error(`Error reading directory ${currentPath}:`, readdirError)
                }
            }
            resp.success('success')
            return resp
        } catch (error) {
            console.error('traversal folder err:', error)
            return resp.err(`traversal folder err: ${error}`)
        }
    }

    /*
        1, Database records: for Normal/Destroy records, check if video file exists,
        if not mark as Destroy, if exists again mark as Normal.
        Deleted (trash) and Nothing records are skipped, their video files are not
        expected to exist in the normal folder.
        2, Thumbnail/frame db files are never moved by sync, they stay where they are.
    */
    async checkDb(): Promise<Dty.Resp> {
        const resp = new Dty.Resp()
        if (!appDb.db) {
            return resp.err(logger.error(`db is null`))
        }

        const respCount: Dty.Resp<Dty.FilesResp> = await appDb.filesCount(null)
        if (respCount.code != 0 || respCount.data?.total == null || respCount.data?.total == 0) {
            return resp.err(
                logger.error(
                    `files count err total=${respCount.data?.total}, status=${respCount.status}`
                )
            )
        }

        const totalFiles = respCount.data?.total
        const batchSize = 100
        let processedCount = 0

        logger.info(`Starting to check database with ${totalFiles} files`)
        syncProgressNotify('check', 0, totalFiles)
        while (processedCount < totalFiles) {
            if (bSyncPrjStop) {
                logger.info(`prj sync stop cur in check db`)
                syncProgressNotify('check', processedCount, totalFiles, true)
                break
            }
            const fSearchReq = new Dty.FilesReq()
            fSearchReq.page = Math.floor(processedCount / batchSize) + 1
            fSearchReq.pageSize = batchSize

            const searchResult = await appDb.filesSearch(fSearchReq)
            if (!searchResult.isSuccess()) {
                return resp.err(logger.error(`Failed to fetch files page ${fSearchReq.page}`))
            }

            if (!searchResult.data || !searchResult.data.files) {
                logger.warn(`No data returned for page ${fSearchReq.page}`)
                break
            }
            for (const fInfo of searchResult.data.files) {
                let chkStatus = ''
                // Only check existence for Normal/Destroy records. Deleted (trash) and
                // Nothing records are skipped, their video files are not expected to
                // exist in the normal folder.
                if (fInfo.status == Dty.Fstatus.Normal || fInfo.status == Dty.Fstatus.Destroy) {
                    // file not exist,set file status destroy
                    if (!fs.existsSync(fInfo.path)) {
                        if (fInfo.status != Dty.Fstatus.Destroy) {
                            fInfo.status = Dty.Fstatus.Destroy
                            const upResp = await appDb.fileUpdate(fInfo)
                            chkStatus += `status destroy update ${upResp.status}; `
                            if (!upResp.isSuccess()) {
                                logger.info(`file check ${chkStatus}`)
                                continue
                            }
                        }
                    } else {
                        // file exist, set status normal
                        if (fInfo.status != Dty.Fstatus.Normal) {
                            fInfo.status = Dty.Fstatus.Normal
                            const upResp = await appDb.fileUpdate(fInfo)
                            chkStatus += `status normal update ${upResp.status}; `
                            if (!upResp.isSuccess()) {
                                logger.info(`file check ${chkStatus}`)
                                continue
                            }
                        }
                    }
                }
                if (processedCount % 10 == 0) {
                    logger.info(
                        `file check ${processedCount + 1}/${totalFiles}: ${chkStatus == '' ? 'success' : chkStatus}`
                    )
                }
                processedCount++
                syncProgressNotify('check', processedCount, totalFiles)
            }
        }

        logger.info(`Database check completed. Total files processed: ${processedCount}`)
        return resp.success('Database check completed')
    }

    async get_folder_files(): Promise<Dty.Resp<Dty.FilesResp>> {
        const resp = new Dty.Resp<Dty.FilesResp>()
        resp.data = new Dty.FilesResp()
        const folderPath = this.repo.path
        if (!folderPath) {
            return resp.err('folder is null')
        }
        try {
            const fileInfos: Dty.File[] = []
            const traverseRecursive = async (currentPath: string): Promise<void> => {
                const currentFiles = await fs.promises.readdir(currentPath)
                for (const fName of currentFiles) {
                    const fPath = path.join(currentPath, fName)
                    const stats = await fs.promises.stat(fPath)
                    if (stats.isDirectory()) {
                        // Check directory name, if directory name is trash, skip
                        if (fName === '.trash') {
                            // logger.log(`traversal skip: ${filePath}`)
                            continue
                        }
                        await traverseRecursive(fPath)
                    } else {
                        const fileInfo: Dty.File = new Dty.File()
                        fileInfo.name = fName
                        fileInfo.path = fPath
                        resp.data?.files.push(fileInfo)
                    }
                }
            }
            await traverseRecursive(folderPath)
            if (this.bSort) {
                fileInfos.sort((a, b) => {
                    return a.name.localeCompare(b.name)
                })
            }
            resp.success('success')
            return resp
        } catch (error) {
            console.error('traversal folder err:', error)
            return resp.err(`traversal folder err: ${error}`)
        }
    }
}

let bTiny2DbStop = false
let bSyncPrjStop = false
let lastProgressTime = 0

// Throttled sync progress push to renderer (at most once per 500ms).
// bStopped bypasses the throttle and marks the progress as stopped by user.
function syncProgressNotify(
    stage: Dty.SyncStage,
    cur: number,
    total: number,
    bStopped: boolean = false
): void {
    const now = Date.now()
    if (!bStopped && now - lastProgressTime < 500) {
        return
    }
    lastProgressTime = now
    const progress = new Dty.SyncProgress()
    progress.stage = stage
    progress.cur = cur
    progress.total = total
    progress.stopped = bStopped
    const notify: Dty.TaskNotify<Dty.SyncProgress> = {
        taskId: taskManager.getCurrentTask()?.id ?? '',
        cmd: Dty.CmdType.prjSync,
        status: Dty.TaskStatus.Running,
        result: progress
    }
    Util.sendTaskNotify(notify)
}

class AppProc {
    // constructor() {}
    saveAppCfg(): void {
        const cfgPath = path.join(appCfg.appData, 'prj.json')
        const data = JSON.stringify(appCfg.appInfo, null, 2)
        try {
            fs.writeFileSync(cfgPath, data)
        } catch (error) {
            logger.error('write file err:', error)
        }
    }

    addRecentProject(prjFile: string): void {
        if (!appCfg.appInfo.recentProjects) {
            appCfg.appInfo.recentProjects = []
        }
        const prjName = path.basename(prjFile, '.sspj')
        const existingIndex = appCfg.appInfo.recentProjects.findIndex((p) => p.path === prjFile)

        if (existingIndex >= 0) {
            appCfg.appInfo.recentProjects.splice(existingIndex, 1)
        }

        const item: Dty.RecentItem = {
            name: prjName,
            path: prjFile,
            lastOpened: Date.now()
        }
        appCfg.appInfo.recentProjects.unshift(item)

        if (appCfg.appInfo.recentProjects.length > 10) {
            appCfg.appInfo.recentProjects = appCfg.appInfo.recentProjects.slice(0, 10)
        }
        this.saveAppCfg()
    }

    async initApp(): Promise<void> {
        await appCfg.initCfg()
    }
    mainWinSet(mainWin: Electron.BrowserWindow | null): void {
        Util.mainWinSet(mainWin)
    }
    async quiteApp(): Promise<void> {
        this.saveAppCfg()
    }

    async handle_heartbeat(): Promise<Dty.Resp<Dty.HeartBeat>> {
        const resp = new Dty.Resp<Dty.HeartBeat>()
        const respData: Dty.HeartBeat = new Dty.HeartBeat()
        respData.time = Util.getCurTime()
        respData.appStatus = taskManager.getStatus()
        respData.processing = taskManager.isBusy()
        resp.data = respData
        return resp
    }

    async handle_file_tags_set(req: Dty.Req<Dty.FileTagsReq>): Promise<Dty.Resp> {
        const resp = new Dty.Resp()
        resp.success('success')
        let tagResp = await appDb.tag_search(null)
        if (!tagResp.isSuccess()) {
            return logStatusRespReturn(resp.err(`tag search err: ${tagResp.status}`))
        }
        taskManager.statusSet(`start set file tags len= ${req.data?.fileTags.length}`)
        let tags = tagResp.data?.tags ?? []
        for (const item of req.data?.fileTags ?? []) {
            // find tag is in db
            let tagInfo = tags.find((tag) => tag.name === item.tagName)
            if (tagInfo == null && item.tagName != Dty.tagNoneDefName) {
                const tag: Dty.Tag = {
                    id: 0,
                    name: item.tagName,
                    color: Dty.tagDefColor,
                    description: ''
                }
                const respInsert = await appDb.tag_insert(tag)
                if (!respInsert.isSuccess()) {
                    logger.error(`insert tag err: ${respInsert.status}`)
                } else {
                    logger.info(`tag insert success: ${item.tagName}`)
                }
                tagResp = await appDb.tag_search(null)
                if (!tagResp.isSuccess()) {
                    return resp.err(`tag search err: ${tagResp.status}`)
                }
                tags = tagResp.data?.tags ?? []
                tagInfo = tags.find((tag) => tag.name === item.tagName)
                if (tagInfo == null) {
                    logger.error(
                        `tag search err, iteam tag name: ${item.tagName}, tagInfo: ${tagInfo}`
                    )
                    return logStatusRespReturn(resp.err(`tag search err: ${tagResp.status}`))
                }
            }
            // insert file tag, delete firstly, then insert
            const fileTag: Dty.FileTag = {
                id: 0,
                fileId: item.fileId,
                tagId: tagInfo?.id ?? 0
            }
            const respDel = await appDb.file_tag_delete_all(fileTag.fileId)
            if (!respDel.isSuccess()) {
                taskManager.statusSet(logger.error(`delete file tag err: ${respDel.status}`))
                resp.err('delete file tags error')
            }
            if (item.tagName == Dty.tagNoneDefName) {
                taskManager.statusSet(
                    logger.info(
                        `file tag delete success: fId:${item.fileId},tagId:${fileTag.tagId},tagName:${item.tagName}`
                    )
                )
            } else {
                const respUpdate = await appDb.file_tag_insert(fileTag)
                if (!respUpdate.isSuccess()) {
                    taskManager.statusSet(logger.error(`insert file tag err: ${respUpdate.status}`))
                    resp.err('insert file tags error')
                } else {
                    taskManager.statusSet(
                        logger.info(
                            `insert file tag success: fId:${item.fileId},tagId:${fileTag.tagId},tagName:${item.tagName}`
                        )
                    )
                }
            }
        }
        taskManager.statusSet(
            logger.info(
                `set file tags success:  ${req.data?.fileTags != null && req.data?.fileTags?.length > 0 ? 'tag name : ' + req.data?.fileTags[0].tagName : 'no tag'}`
            )
        )
        return resp
    }
    async handle_tags_get(req: Dty.Req<Dty.TagsReq>): Promise<Dty.Resp<Dty.TagsResp>> {
        return await appDb.tag_search(req.data == null ? null : req.data)
    }
    async handle_tag_update(req: Dty.Req<Dty.TagUpdateReq>): Promise<Dty.Resp> {
        const tag = new Dty.Tag()
        tag.id = req.data?.id || 0
        tag.name = req.data?.name || ''
        tag.color = req.data?.color || ''
        tag.description = req.data?.description || ''
        return await appDb.tag_update(tag)
    }
    async handle_tag_delete(req: Dty.Req<Dty.TagDeleteReq>): Promise<Dty.Resp> {
        const tag = new Dty.Tag()
        tag.id = req.data?.id || 0
        return await appDb.tag_delete(tag)
    }

    async handle_file_tag_delete(req: Dty.Req<Dty.FileTagDeleteReq>): Promise<Dty.Resp> {
        const resp = new Dty.Resp()
        if (req.data == null) {
            return resp.err('req.data is null')
        }
        return await appDb.file_tag_delete(req.data.fileId, req.data.tagId)
    }
    async handle_files_get(req: Dty.Req<Dty.FilesReq>): Promise<Dty.Resp<Dty.FilesResp>> {
        return await appDb.fileViewSearch(req.data == null ? null : req.data)
    }

    async prjInfoSave(prjInfo: Dty.Prj): Promise<Dty.Resp> {
        const resp = new Dty.Resp()
        if (prjInfo == null) {
            return resp.err('prj is null')
        }
        if (prjInfo.path == '') {
            return resp.err('prj path is empty')
        }

        for (const repo of prjInfo.dataRepo) {
            repo.thumbnailPath = path.posix.normalize(repo.thumbnailPath)
            if (!fs.existsSync(repo.thumbnailPath)) {
                fs.mkdirSync(repo.thumbnailPath, { recursive: true })
                logger.info(`create thumbnail path: ${repo.thumbnailPath}`)
            }
        }
        const prjName = prjInfo.name || 'project'
        const projectFilePath = path.join(prjInfo.path, `${prjName}.sspj`)
        const jsonContent = JSON.stringify(prjInfo, null, 2)
        await fs.promises.writeFile(projectFilePath, jsonContent, 'utf-8')
        logger.info(`Project info: ${JSON.stringify(prjInfo, null)}`)
        resp.success('Project file created successfully')
        appCfg.appInfo.prjFile = projectFilePath
        appCfg.prj = prjInfo
        this.saveAppCfg()
        return resp
    }

    async create_prj(
        req: Dty.Req<Dty.CreatePrjWithPathReq>,
        prjPath: string
    ): Promise<Dty.Resp<Dty.CreatePrjResp>> {
        const resp = new Dty.Resp<Dty.CreatePrjResp>()
        resp.data = new Dty.CreatePrjResp()
        if (req.data == null) {
            return resp.err('req.data is null')
        }
        if (req.data?.dataRepo == null || req.data.dataRepo.length === 0) {
            return resp.err('dataBase is empty')
        }
        // Check if all names in req.data.dataRepo array are the same
        const dataBaseNames = req.data.dataRepo.map((repo) => repo.name)
        const isSameName = dataBaseNames.every((name) => name === dataBaseNames[0])
        if (!isSameName) {
            return resp.err('data repo name is not same')
        }

        // 1, make prj info
        const prjInfo: Dty.Prj = new Dty.Prj()
        prjInfo.name = path.basename(prjPath)
        prjInfo.version = Util.defaultVersionGet()
        prjInfo.path = prjPath
        prjInfo.dataRepo = req.data.dataRepo
        {
            // 2, create db folder and init db
            logger.log('create project prj path:', prjPath)
            const dbFolderPath = path.join(prjPath, 'db')
            if (!fs.existsSync(dbFolderPath)) {
                fs.mkdirSync(dbFolderPath)
            }
            const respDb = await appDb.initDb(dbFolderPath)
            if (!respDb.isSuccess()) {
                return resp.err('init db error')
            }

            for (const repo of prjInfo.dataRepo) {
                repo.thumbnailPath = path.join(prjPath, 'thumbnail', repo.name)
                if (!fs.existsSync(repo.thumbnailPath)) {
                    fs.mkdirSync(repo.thumbnailPath, { recursive: true })
                    fs.mkdirSync(Util.thumbTrashPathGet(repo.thumbnailPath))
                }
                repo.framePath = path.join(prjPath, 'frame', repo.name)
                if (!fs.existsSync(repo.framePath)) {
                    fs.mkdirSync(repo.framePath, { recursive: true })
                    fs.mkdirSync(Util.thumbTrashPathGet(repo.framePath))
                }
            }
        }
        // 5, write prj info to file
        const saveResp = await this.prjInfoSave(prjInfo)
        if (saveResp.code != 0) {
            return resp.err('save prj info error ' + saveResp.status)
        }
        resp.data.prj = prjInfo
        resp.data.prjFile = path.join(prjPath, `${prjInfo.name}.sspj`)
        appCfg.appInfo.prjFile = resp.data.prjFile
        this.addRecentProject(resp.data.prjFile)
        resp.success('Project file created successfully')
        logger.info('create project success')
        return resp
    }

    async handle_app_start(): Promise<Dty.Resp<Dty.AppStartResp>> {
        const resp = new Dty.Resp<Dty.AppStartResp>()
        resp.data = new Dty.AppStartResp()
        const cfgPath = path.join(appCfg.appData, 'prj.json')
        if (!fs.existsSync(cfgPath)) {
            resp.data.appInfo = appCfg.appInfo
            return resp.success('no config file')
        }
        let data = ''
        try {
            data = fs.readFileSync(cfgPath, { encoding: 'utf-8' })
        } catch (error: unknown) {
            logger.error('read file err :', error)
            return resp.err('read file err ')
        }
        try {
            const jsonData = JSON.parse(data)
            appCfg.appInfo = jsonData
            resp.data.appInfo = appCfg.appInfo
        } catch (error: unknown) {
            logger.info('app cfg err parse json:', error)
            return resp.err('app cfg err parse json')
        }
        return resp.success('app start success')
    }

    async handle_app_config_save(req: Dty.Req): Promise<Dty.Resp> {
        const resp = new Dty.Resp()
        try {
            if (req.data) {
                const configData = JSON.parse(req.data)
                if (configData.language) {
                    appCfg.appInfo.language = configData.language
                    this.saveAppCfg()
                    logger.info(`App config saved, language: ${configData.language}`)
                }
            }
            return resp.success('App config saved successfully')
        } catch (error: unknown) {
            logger.error('Failed to save app config:', error)
            return resp.err('Failed to save app config')
        }
    }
    async handle_search_file(req: Dty.Req<Dty.FilesReq>): Promise<Dty.Resp<Dty.FilesResp>> {
        return appDb.fileViewSearch(req.data == null ? null : req.data)
    }

    async handle_thumb_img_get(
        req: Dty.Req<Dty.ThumbImgGetReq>
    ): Promise<Dty.Resp<Dty.ThumbImgGetResp>> {
        const resp = new Dty.Resp<Dty.ThumbImgGetResp>()
        const reqData = req.data

        if (reqData == null || reqData.videoName == '' || reqData.thumbName == '') {
            return resp.err('Invalid request: missing videoName or thumbName')
        }

        if (appCfg.prj.dataRepo.length == 0 || appCfg.prj.dataRepo[0].thumbnailPath == '') {
            return resp.err('Invalid request: missing thumbnailPath')
        }

        const thumbDbFilePath = Util.thumbDbPathGet(reqData.videoName, Dty.ThumbType.Thumb)
        const trashThumbDbPath = Util.thumbTrashDbPathGet(reqData.videoName, Dty.ThumbType.Thumb)

        let thumbDbPath = thumbDbFilePath
        if (!fs.existsSync(thumbDbFilePath)) {
            if (!trashThumbDbPath || !fs.existsSync(trashThumbDbPath)) {
                return resp.err(`Database not found: ${thumbDbFilePath}`)
            }
            thumbDbPath = trashThumbDbPath
        }

        try {
            const thumbDb: Database = await open({
                filename: thumbDbPath,
                driver: sqlite3.Database
            })

            const row = await thumbDb.get('SELECT raw FROM files WHERE filename =?', [
                reqData.thumbName
            ])
            await thumbDb.close()

            if (row == null) {
                return resp.err('Thumbnail not found')
            }

            const imageData = row.raw
            const base64Data = imageData.toString('base64')
            resp.data = new Dty.ThumbImgGetResp()
            resp.data.data = base64Data
            resp.data.mimeType = 'image/jpeg'
            return resp.success('success')
        } catch (error) {
            logger.error(`Error handling thumb_img_get: ${error}`)
            return resp.err('Internal server error')
        }
    }

    async start_gen_thumbnail(): Promise<Dty.Resp> {
        const resp = new Dty.Resp()
        const searchRe = await appDb.filesSearch(Dty.FilesReq.makeReqStatusNormal(null, null))
        if (!searchRe.isSuccess()) {
            return resp.err('search file error')
        }
        logger.log('start gen thumbnail total=', searchRe.data?.total)
        const thumbTotal = searchRe.data?.total ?? 0
        syncProgressNotify('thumb', 0, thumbTotal)
        let count = 0
        for (const fileInfo of searchRe.data?.files ?? []) {
            if (bSyncPrjStop) {
                logger.log(`prj sync stop cur in gen thumbnail`)
                syncProgressNotify('thumb', count, thumbTotal, true)
                break
            }
            count++
            syncProgressNotify('thumb', count, thumbTotal)
            // get thumbnail
            {
                const startTime = Date.now()
                const respThumb = await recordsProc.gen_thumbnail(fileInfo, Dty.ThumbType.Thumb)
                const endTime = Date.now()
                const duration = ((endTime - startTime) / 1000).toFixed(3)
                if (!respThumb.isSuccess()) {
                    if (respThumb.code == Dty.RespCode.FileExist) {
                        continue
                    }
                    taskManager.statusSet(
                        logger.error('gen thumbnail error:', fileInfo.path, respThumb.status)
                    )
                    continue
                } else {
                    taskManager.statusSet(
                        logger.info(
                            `${count}/${searchRe.data?.total} gen thumbnail ${respThumb.status} num=${respThumb.data?.length},rate=${fileInfo.mediaInfo?.bit_rate},duration=${fileInfo.duration} s,coast ${duration} s, ${fileInfo.path}`
                        )
                    )
                }
                if (respThumb.data != null && respThumb.data.length > 0) {
                    fileInfo.thumbnail = new Dty.ThumbnailInfo()
                    fileInfo.thumbnail.path = respThumb.data
                    await appDb.fileUpdate(fileInfo)
                }
            }
            // get frame
            {
                const startTime = Date.now()
                const respThumb = await recordsProc.gen_thumbnail(fileInfo, Dty.ThumbType.Frame)
                const endTime = Date.now()
                const duration = ((endTime - startTime) / 1000).toFixed(3)
                if (!respThumb.isSuccess()) {
                    if (respThumb.code == Dty.RespCode.FileExist) {
                        continue
                    }
                    taskManager.statusSet(
                        logger.error('gen thumbnail error:', fileInfo.path, respThumb.status)
                    )
                    continue
                } else {
                    taskManager.statusSet(
                        logger.info(
                            `${count}/${searchRe.data?.total} gen thumbnail ${respThumb.status} num=${respThumb.data?.length},rate=${fileInfo.mediaInfo?.bit_rate},duration=${fileInfo.duration} s,coast ${duration} s, ${fileInfo.path}`
                        )
                    )
                }
                if (respThumb.data != null && respThumb.data.length > 0) {
                    fileInfo.thumbnail = new Dty.ThumbnailInfo()
                    fileInfo.thumbnail.path = respThumb.data
                    await appDb.fileUpdate(fileInfo)
                }
            }
        }
        return resp
    }

    async classifyFileStart(repos: Dty.DataRepo[]): Promise<Dty.Resp> {
        const resp = new Dty.Resp()
        for (const repo of repos) {
            if (repo.name == '' || repo.path == '') {
                logger.error(`repo name or path is empty: ${repo.name}, ${repo.path}`)
                continue
            }
            const traversalFolder = new TraversalFolder()
            traversalFolder.type = null
            traversalFolder.repo = repo

            // 1, start traversal folder, Automatically insert the files in the
            // folder into the database
            {
                const respTras = await traversalFolder.folderTraversal()
                if (!respTras.isSuccess()) {
                    return respTras
                }
                logger.info(`traversal ${repo.path} ${respTras.status}`)
            }

            // 2, start classify file (stable grouping: grouped files never move,
            // only root/un-grouped files are placed into the first group with free space)
            {
                const searchReq = Dty.FilesReq.makeReqStatusNormal(null, repo.name)
                searchReq.order = 'asc'
                searchReq.orderBy = 'startTimeSec'
                const searchResp = await appDb.filesSearch(searchReq)
                if (!searchResp.isSuccess()) {
                    logger.error(`search file error: ${searchResp.status}`)
                    continue
                }
                const allFiles = searchResp.data?.files ?? []
                // Count files per numeric group folder, collect files still in repo root
                const grpCountMap = new Map<number, number>()
                const rootFiles: Dty.File[] = []
                for (const fInfo of allFiles) {
                    const parent = path.dirname(fInfo.path)
                    if (parent === repo.path) {
                        rootFiles.push(fInfo)
                        continue
                    }
                    const grpNum = parseInt(path.basename(parent))
                    if (!isNaN(grpNum)) {
                        grpCountMap.set(grpNum, (grpCountMap.get(grpNum) ?? 0) + 1)
                    }
                }
                let batchSize = appCfg.prj.numEachFolder
                if (batchSize > 10000 || batchSize < 1) {
                    logger.error(
                        `batchSize err ${appCfg.prj.numEachFolder}, set to default value: ${batchSize}, repo: ${repo.name}`
                    )
                    batchSize = 10
                }
                // First group whose file count is below batchSize
                const freeGroupGet = (): number => {
                    let grp = 1
                    while ((grpCountMap.get(grp) ?? 0) >= batchSize) {
                        grp++
                    }
                    return grp
                }
                syncProgressNotify('classify', 0, rootFiles.length)
                let fileCnt = 0
                for (const fileInfo of rootFiles) {
                    if (bSyncPrjStop) {
                        logger.info(`prj sync stop cur in classify files`)
                        syncProgressNotify('classify', fileCnt, rootFiles.length, true)
                        return resp
                    }
                    fileCnt++
                    syncProgressNotify('classify', fileCnt, rootFiles.length)
                    const grpIdx = freeGroupGet()
                    const grpPath = path.join(repo.path, `${grpIdx}`)
                    if (!fs.existsSync(grpPath)) {
                        fs.mkdirSync(grpPath)
                    }
                    const fileName = path.basename(fileInfo.path)
                    const dstPath = path.join(grpPath, fileName)
                    if (fileInfo.path == dstPath) {
                        continue
                    }
                    fs.renameSync(fileInfo.path, dstPath)
                    fileInfo.path = dstPath
                    const updateResp = await appDb.fileUpdate(fileInfo)
                    if (!updateResp.isSuccess()) {
                        logger.error(`update file error: ${updateResp.status}`)
                        continue
                    }
                    grpCountMap.set(grpIdx, (grpCountMap.get(grpIdx) ?? 0) + 1)
                    taskManager.statusSet(
                        logger.info(
                            `${fileCnt}/${rootFiles.length} group file success: ${fileInfo.path}`
                        )
                    )
                }
            }
            // 3, start classify thumbnail trash folder
            const bClassifyTrash = false
            if (bClassifyTrash) {
                logger.info(`start classify thumbnail trash folder: ${repo.thumbnailPath}`)
                // 1, search deleted file
                const searchReq = Dty.FilesReq.makeReqStatusDel(repo.name)
                const searchResp = await appDb.filesSearch(searchReq)
                if (!searchResp.isSuccess()) {
                    logger.error(`search del file error: ${searchResp.status}`)
                    continue
                }
                const fileList = searchResp.data?.files ?? []
                let fCnt = 0
                for (const fInfo of fileList) {
                    if (bSyncPrjStop) {
                        logger.info(`prj sync stop cur in classify trash files`)
                        return resp
                    }
                    fCnt++
                    // logger.info(`file : ${fInfo.path}`)
                    const searchReq = Dty.FilesReq.makeReqStatusNormal(fInfo.path, fInfo.repo)
                    const searchResp = await appDb.fileViewSearch(searchReq)
                    if (searchResp.code == 0) {
                        if (
                            searchResp.data?.files.length != null &&
                            searchResp.data?.files.length > 0
                        ) {
                            // logger.info(`file not del, but exist: ${fInfo.path}`)
                            continue
                        }
                    }
                    // 2, get file thumbnail full path
                    const file_thubmbnail_dir = recordsProc.thumbnail_path_get_mp4(
                        fInfo.repo,
                        fInfo.path
                    )
                    // 3, check thumb folder exist
                    if (fs.existsSync(file_thubmbnail_dir)) {
                        const repo = Dty.DataRepo.getRepoByPath(fInfo.repo, appCfg.prj.dataRepo)
                        if (repo == null) {
                            continue
                        }
                        if (repo.thumbnailPath == '') {
                            continue
                        }
                        // 4, make thumb trash directory
                        const thumbTrash = path.join(repo.thumbnailPath, '.trash')
                        if (!fs.existsSync(thumbTrash)) {
                            fs.mkdirSync(thumbTrash)
                        }
                        // 5, move thumbnail to trash directory
                        const targetDir = path.join(thumbTrash, path.basename(file_thubmbnail_dir))
                        fs.renameSync(file_thubmbnail_dir, targetDir)
                        logger.info(
                            `${fCnt}/${fileList.length} move thumb ${file_thubmbnail_dir} to ${targetDir}`
                        )
                    }
                }
            }

            // 4，check db
            {
                const respDb = await traversalFolder.checkDb()
                if (!respDb.isSuccess()) {
                    return respDb
                }
            }
        }
        return resp
    }

    /*
    Sync Project

    Save project info:
        Create thumbnail folder.
        Create project JSON file.
        Save project JSON file path to appdata folder.

    File categorization:
        1. First traverse repository folder, parse file info, save to database. Also fix database records.
        2. Categorize files by searching database and distributing files 
    into subfolders by creation time. Database will update file path info.
        3. Move deleted files' thumbnails to thumbnail recycle bin.

    Generate thumbnails
    */
    async handle_prjSync(req: Dty.Req<Dty.SyncPrjReq>): Promise<Dty.Resp<Dty.SyncPrjResp>> {
        const resp = new Dty.Resp<Dty.SyncPrjResp>()
        if (req.data == null) {
            return resp.err('req.data is null')
        }
        resp.data = new Dty.SyncPrjResp()
        bSyncPrjStop = false
        {
            let bNeedSavePrjInfo = false
            let bNeedGenThumb = false
            let bNeedClassifyFile = false
            for (const type of req.data.type) {
                if (type == Dty.SyncType.all) {
                    bNeedSavePrjInfo = true
                    bNeedGenThumb = true
                    bNeedClassifyFile = true
                    break
                }
                if (type == Dty.SyncType.prjInfo) {
                    bNeedSavePrjInfo = true
                }
                if (type == Dty.SyncType.thumbnail) {
                    bNeedGenThumb = true
                }
                if (type == Dty.SyncType.classify) {
                    bNeedClassifyFile = true
                }
            }

            //  save prj info
            if (bNeedSavePrjInfo) {
                taskManager.statusSet(logger.info(`save prj info start`))
                const prjInfo = req.data.prj
                if (prjInfo == null) {
                    return logStatusRespReturn(resp.err('prjInfo is null,err'))
                }
                const saveResp = await this.prjInfoSave(prjInfo)
                if (!saveResp.isSuccess()) {
                    return logStatusRespReturn(resp.err(`save prj info error ${saveResp.status}`))
                }
                resp.data.prj = prjInfo
                taskManager.statusSet(logger.info(`save prj info ${saveResp.status} ${prjInfo.path}`))
            }

            // traversal folder , check db
            if (bNeedClassifyFile) {
                taskManager.statusSet(logger.log('classify file start'))
                const classifyResp = await this.classifyFileStart(req.data.prj.dataRepo)
                if (!classifyResp.isSuccess()) {
                    return logStatusRespReturn(
                        resp.err(`classify file error ${classifyResp.status}`)
                    )
                }
                taskManager.statusSet(logger.log('classify file ', classifyResp.status))
            }

            // gen thumbnail
            if (bNeedGenThumb) {
                for (const repo of req.data.prj.dataRepo) {
                    if (repo.name == '' || repo.path == '') {
                        return logStatusRespReturn(resp.err('repo name or path is empty'))
                    }
                    await this.start_gen_thumbnail()
                }
            }
        }

        taskManager.statusSet('sync work success')
        const workResp: Dty.WorkResp<Dty.Resp<Dty.SyncPrjResp>> = { cmd: req.cmd, data: resp }
        Util.notifyRender(JSON.stringify(workResp))
        return resp
    }

    async query_images(fPath: string): Promise<Dty.Resp<Dty.TraversalFolder>> {
        const resp = new Dty.Resp<Dty.TraversalFolder>()

        let file_thubmbnail_dir = ''
        {
            const respThumb = await recordsProc.thumbnail_get_mp4_path(fPath)
            if (respThumb.code !== 0 || respThumb.data == null || respThumb.data == '') {
                return resp.err('get mp4 thumbnail path error')
            }
            file_thubmbnail_dir = respThumb.data
        }

        let bExist = true
        // Thumbnails for the file are stored in a folder named after the file. Return error if folder doesn't exist
        try {
            await fs.promises.access(file_thubmbnail_dir)
        } catch (error) {
            if (!error) {
                logger.error('access error:', error)
            }
            bExist = false
        }
        if (!bExist) {
            return resp.err(`folder not exist ${file_thubmbnail_dir}`)
        }
        // Start traversing the thumbnail folder
        const traversalFolder = new TraversalFolder()
        traversalFolder.type = 'search'
        traversalFolder.repo.path = file_thubmbnail_dir
        const response = await traversalFolder.get_folder_files()
        if (!response.isSuccess()) {
            return resp.err(`traversal folder error ${response.status}`)
        }
        // Sort thumbnails by time
        response.data?.files.sort((a, b) => {
            const timeA = Dty.FileTools.miFilenameParse(a.name)?.startTime
            const timeB = Dty.FileTools.miFilenameParse(b.name)?.startTime
            if (timeA === undefined) {
                return 0
            }
            if (timeB === undefined) {
                return 0
            }
            return timeA.localeCompare(timeB)
        })
        return response
    }

    async handle_select_video(req: Dty.Req<Dty.Req_SltFile>): Promise<Dty.Resp<Dty.File>> {
        const resp = new Dty.Resp<Dty.File>()
        resp.data = new Dty.File()
        if (req.data == null) {
            return resp.err('req.data is null')
        }
        if (resp.data == undefined) {
            return resp.err('resp.data is null')
        }
        const video_path = req.data?.filepath
        if (video_path == null) {
            return resp.err('filepath is null')
        }
        const searchReq = new Dty.FilesReq()
        searchReq.path = video_path
        const searchRe = await appDb.fileViewSearch(searchReq)
        if (!searchRe.isSuccess()) {
            return resp.err('search file error')
        }
        if (searchRe.data?.files.length === 0) {
            return resp.err('file not exist')
        }
        const fInfo = searchRe.data?.files[0]
        if (fInfo == null) {
            return resp.err('file info is null')
        }
        if (appCfg.prj.repoType == Dty.RepoType.Normal) {
            if (fInfo.status != Dty.Fstatus.Normal) {
                return resp.err('file status is not normal')
            }
        }
        if (appCfg.prj.repoType == Dty.RepoType.Trash) {
            if (fInfo.status != Dty.Fstatus.Deleted) {
                return resp.err('file status is not delete')
            }
        }

        resp.success('success').data = fInfo
        if (resp.data.thumbnail?.path == null) {
            let bThumbExist = true
            const tra = new TraversalFolder()
            tra.repo.path = recordsProc.thumbnail_path_get_mp4(fInfo?.repo, fInfo?.path)
            if (!fs.existsSync(tra.repo.path)) {
                if (appCfg.prj.repoType == Dty.RepoType.Normal) {
                    logger.warn(`thumbnail not exist in repo path ${tra.repo.path}`)
                    bThumbExist = false
                } else {
                    tra.repo.path = recordsProc.thumTrashPathGetByMp4(fInfo?.repo, fInfo?.path)
                    if (!fs.existsSync(tra.repo.path)) {
                        logger.warn(`thumbnail not exist in repo trash path ${tra.repo.path}`)
                        bThumbExist = false
                    }
                }
            }
            if (bThumbExist) {
                const fRe = await tra.get_folder_files()
                if (fRe.code != 0) {
                    logger.warn(`thumbnail not exist ${fInfo.path}`)
                } else {
                    resp.data.thumbnail = new Dty.ThumbnailInfo()
                    for (const item of fRe.data?.files ?? []) {
                        resp.data.thumbnail.path.push(item.path)
                    }
                }
            }
        }
        return resp
    }

    async handle_select_folder(mainWindow: Electron.BrowserWindow): Promise<Dty.Resp<string>> {
        const resp = new Dty.Resp<string>()
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Folder',
            properties: ['openDirectory']
        })
        if (result.canceled || result.filePaths.length === 0) {
            return resp.err('user canceled')
        }
        resp.data = result.filePaths[0]
        return resp.success('success')
    }

    async handle_create_prj_with_path(
        req: Dty.Req<Dty.CreatePrjWithPathReq>
    ): Promise<Dty.Resp<Dty.CreatePrjResp>> {
        const resp = new Dty.Resp<Dty.CreatePrjResp>()
        if (req.data == null) {
            return resp.err('req.data is null')
        }
        const { dataRepo, projectPath } = req.data

        if (!projectPath || !fs.existsSync(projectPath)) {
            return resp.err('project path is invalid')
        }

        const folderContent = fs.readdirSync(projectPath)
        if (folderContent.length > 0) {
            return resp.err('The selected folder is not empty')
        }

        return await this.create_prj(
            { cmd: Dty.CmdType.createPrjWithPath, data: { dataRepo, projectPath } },
            Util.pathToLinuxStyle(projectPath)
        )
    }

    /**
     *  Delete thumbnail and frame db files of the given files (both normal and
     *  trash folders) and clear the record's thumbnail data, so the record
     *  disappears from thumb management page. Status: Destroy -> Nothing,
     *  others unchanged. Thumbnails will be regenerated when the video is used.
     */
    async thumbsDel(req: Dty.Req<Dty.DeleteFileReq>): Promise<Dty.Resp<Dty.DeleteFileResp>> {
        const resp = new Dty.Resp<Dty.DeleteFileResp>()
        if (!req.data?.files || req.data.files.length === 0) {
            return logStatusRespReturn(resp.err('file is null'))
        }

        taskManager.statusSet(logger.info(`delete thumb start`))

        if (req.data.type == 'destroy') {
            for (const item of req.data.files) {
                // Search by name, orphan records (status Nothing) have no valid path
                const searchReq = new Dty.FilesReq()
                searchReq.name = item.name
                searchReq.repo = item.repo
                const searchResp = await appDb.fileViewSearch(searchReq)
                if (searchResp.code !== 0 || searchResp.data?.files.length === 0) {
                    taskManager.statusSet(
                        logger.error(
                            `thumb del err: ${item.repo} ${item.name}, ${searchResp.status}`
                        )
                    )
                    continue
                }

                for (const fInfo of searchResp.data?.files || []) {
                    const filepath = fInfo.path
                    const fName = fInfo.name
                    let attempts = 0
                    const maxAttempts = 3 // Maximum retry attempts
                    async function attemptRename(): Promise<void> {
                        try {
                            // Delete thumbnail and frame db files (both normal and trash folders)
                            {
                                const thumbTrashDbPath = Util.thumbTrashDbPathGet(
                                    fName,
                                    Dty.ThumbType.Thumb
                                )
                                const thumbDbPath = Util.thumbDbPathGet(fName, Dty.ThumbType.Thumb)
                                if (fs.existsSync(thumbTrashDbPath)) {
                                    fs.unlinkSync(thumbTrashDbPath)
                                    logger.info(`thumb file rm ${thumbTrashDbPath}`)
                                }
                                if (fs.existsSync(thumbDbPath)) {
                                    fs.unlinkSync(thumbDbPath)
                                    logger.info(`thumb file rm ${thumbDbPath}`)
                                }
                            }
                            {
                                const thumbTrashDbPath = Util.thumbTrashDbPathGet(
                                    fName,
                                    Dty.ThumbType.Frame
                                )
                                const thumbDbPath = Util.thumbDbPathGet(fName, Dty.ThumbType.Frame)
                                if (fs.existsSync(thumbTrashDbPath)) {
                                    fs.unlinkSync(thumbTrashDbPath)
                                    logger.info(`frame file rm ${thumbTrashDbPath}`)
                                }
                                if (fs.existsSync(thumbDbPath)) {
                                    fs.unlinkSync(thumbDbPath)
                                    logger.info(`frame file rm ${thumbDbPath}`)
                                }
                            }
                            // Update record: clear thumbnail data so the record
                            // disappears from thumb management page (which only
                            // lists records with thumbnail data).
                            // Destroy -> Nothing (video gone, thumbnails deleted)
                            // Normal/Deleted/Nothing -> status unchanged
                            fInfo.thumbnail = null as unknown as Dty.ThumbnailInfo
                            if (fInfo.status == Dty.Fstatus.Destroy) {
                                fInfo.status = Dty.Fstatus.Nothing
                            }
                            const respUp = await appDb.fileUpdate(fInfo)
                            if (respUp.code != 0) {
                                taskManager.statusSet(
                                    logger.error(`file update error: ${respUp.status} ${filepath}`)
                                )
                                throw respUp.status
                            }
                        } catch (err) {
                            attempts++
                            if (attempts < maxAttempts) {
                                taskManager.statusSet(
                                    logger.error(
                                        `thumb rm attempt ${attempts} failed, retrying in 1 second...`,
                                        err
                                    )
                                )
                                await new Promise((resolve) => setTimeout(resolve, 1000))
                                await attemptRename()
                            } else {
                                taskManager.statusSet(
                                    logger.error('thumb rm err after multiple attempts:', err)
                                )
                                throw err
                            }
                        }
                    }
                    try {
                        await attemptRename()
                    } catch (err) {
                        return resp.err(`rm original video err ${err}`)
                    }
                }
            }
        } else {
            resp.err(logger.error(`thumb rm not support type ${req.data.type}`))
        }

        taskManager.statusSet(logger.info(`thumb rm over`))
        resp.data = {}
        return resp
    }

    /*
        Reconcile thumbnail/frame db files with database records:
        1, Collect video names from database records (all statuses).
        2, Scan thumbnail and frame folders (including .trash) to collect video
           names from db file names (strip '_thumbnail.db' / '.db' suffix).
        3, For names that exist on disk but have no database record (orphan
           thumbnail files), insert a record with status Nothing and empty path.
    */
    async thumbReconcile(): Promise<Dty.Resp> {
        const resp = new Dty.Resp()
        if (appCfg.prj.dataRepo.length == 0) {
            return resp.err('dataRepo is empty')
        }
        const repo = appCfg.prj.dataRepo[0]

        // 1, collect video names from database
        const dbNames = new Set<string>()
        {
            const pageSize = 500
            let page = 1
            for (;;) {
                const searchReq = new Dty.FilesReq()
                searchReq.page = page
                searchReq.pageSize = pageSize
                const searchResp = await appDb.filesSearch(searchReq)
                if (searchResp.code != 0 || searchResp.data == null) {
                    return resp.err(`thumb reconcile search err: ${searchResp.status}`)
                }
                for (const fInfo of searchResp.data.files) {
                    dbNames.add(fInfo.name)
                }
                if (page * pageSize >= searchResp.data.total) {
                    break
                }
                page++
            }
        }

        // 2, collect video names from thumbnail/frame folders (including .trash)
        const diskNames = new Set<string>()
        const thumbPath = Util.thumbPathGet(Dty.ThumbType.Thumb)
        const framePath = Util.thumbPathGet(Dty.ThumbType.Frame)
        const scanDirs = [
            thumbPath,
            framePath,
            Util.thumbTrashPathGet(thumbPath),
            Util.thumbTrashPathGet(framePath)
        ]
        for (const dirPath of scanDirs) {
            if (dirPath == '' || !fs.existsSync(dirPath)) {
                continue
            }
            try {
                const fNames = await fs.promises.readdir(dirPath)
                for (const fName of fNames) {
                    let videoName: string | null = null
                    if (fName.endsWith('_thumbnail.db')) {
                        videoName = fName.slice(0, -'_thumbnail.db'.length)
                    } else if (fName.endsWith('.db')) {
                        videoName = fName.slice(0, -'.db'.length)
                    }
                    if (videoName != null && videoName != '') {
                        diskNames.add(videoName)
                    }
                }
            } catch (err) {
                logger.error(`thumb reconcile readdir err: ${dirPath}`, err)
            }
        }

        // 3, insert orphan records
        let insertCnt = 0
        for (const videoName of diskNames) {
            if (dbNames.has(videoName)) {
                continue
            }
            const fileTimeInfo = Dty.FileTools.miFilenameParse(videoName)
            if (fileTimeInfo == null) {
                continue
            }
            // Read thumb db filenames to fill thumbnail info, so the orphan
            // record can show its thumbnail images in thumb management page
            const thumbnailInfo = new Dty.ThumbnailInfo()
            {
                let thumbDbPath = Util.thumbDbPathGet(videoName, Dty.ThumbType.Thumb)
                if (!fs.existsSync(thumbDbPath)) {
                    thumbDbPath = Util.thumbTrashDbPathGet(videoName, Dty.ThumbType.Thumb)
                }
                if (fs.existsSync(thumbDbPath)) {
                    try {
                        const thumbDb: Database = await open({
                            filename: thumbDbPath,
                            driver: sqlite3.Database
                        })
                        const rows = await thumbDb.all<{ filename: string }[]>(
                            'SELECT filename FROM files'
                        )
                        await thumbDb.close()
                        for (const row of rows) {
                            thumbnailInfo.path.push(row.filename)
                        }
                    } catch (err) {
                        logger.warn(`thumb reconcile read thumb db err: ${videoName}`, err)
                    }
                }
            }
            const fileModel: Dty.FileModel = {
                name: videoName,
                path: '',
                startTimeSec: fileTimeInfo.startTimeSec,
                endTimeSec: fileTimeInfo.endTimeSec,
                duration: fileTimeInfo.durationSec,
                size: 0,
                mediaInfo: '',
                splitInfo: '',
                frameInfo: '',
                thumbnail: JSON.stringify(thumbnailInfo),
                eventInfo: '',
                type: Dty.FileType.Mp4,
                status: Dty.Fstatus.Nothing,
                repo: repo.name
            }
            const insertResp = await appDb.file_insert(fileModel)
            if (insertResp.code == 0) {
                insertCnt++
            }
        }
        logger.info(`thumb reconcile over, orphan insert ${insertCnt}`)
        return resp.success(`thumb reconcile over, orphan insert ${insertCnt}`)
    }

    /**
     *  type 'del': move video file to trash folder (same name overwritten),
     *      thumbnail and frame db files are untouched, record status set to Deleted.
     *  type 'destroy': delete video file (normally the video is in trash folder).
     *      bDelThumb=false: only delete video file, record status set to Destroy.
     *      bDelThumb=true: also delete thumbnail and frame db files, record status set to Nothing.
     *  type 'restore': move video file back to repo root folder (same name overwritten),
     *      record status set to Normal. The video will be moved to the classify
     *      group folder on next project sync.
     */
    async filesDel(req: Dty.Req<Dty.DeleteFileReq>): Promise<Dty.Resp<Dty.DeleteFileResp>> {
        const resp = new Dty.Resp<Dty.DeleteFileResp>()
        if (!req.data?.files || req.data.files.length === 0) {
            return logStatusRespReturn(resp.err('file is null'))
        }

        taskManager.statusSet(logger.info(`delete file start`))

        if (req.data.type == 'destroy') {
            for (const item of req.data.files) {
                const fRepo = Dty.DataRepo.getRepoByPath(item.repo, appCfg.prj.dataRepo)
                if (fRepo == null || fRepo.path == '') {
                    return resp.err(`repo not exist ${item.repo},${item.path}`)
                }
                const trashFolderPath = path.join(fRepo.path, '.trash')

                const searchReq = Dty.FilesReq.makeReqStatusNormal(item.path, item.repo)
                searchReq.status = []
                const searchResp = await appDb.fileViewSearch(searchReq)
                if (searchResp.code !== 0 || searchResp.data?.files.length === 0) {
                    taskManager.statusSet(
                        logger.error(`file rm err: ${item.repo} ${item.path} ${searchResp.status}`)
                    )
                    continue
                }

                for (const fInfo of searchResp.data?.files || []) {
                    const filepath = fInfo.path
                    const fName = fInfo.name
                    // Recycle bin filename
                    const distFilename = path.join(trashFolderPath, fName)
                    let attempts = 0
                    const maxAttempts = 3 // Maximum retry attempts
                    async function attemptRename(): Promise<void> {
                        try {
                            if (fs.existsSync(distFilename)) {
                                fs.unlinkSync(distFilename)
                                logger.info(`file rm ${distFilename}`)
                            }
                            if (fs.existsSync(filepath)) {
                                fs.unlinkSync(filepath)
                                logger.info(`file rm ${filepath}`)
                            }
                            fInfo.status = Dty.Fstatus.Destroy
                            if (req.data?.bDelThumb) {
                                fInfo.status = Dty.Fstatus.Nothing
                                // Thumbnail/frame db files are deleted, clear
                                // thumbnail data so the record disappears from
                                // thumb management page
                                fInfo.thumbnail = null as unknown as Dty.ThumbnailInfo
                            }
                            const respUp = await appDb.fileUpdate(fInfo)
                            if (respUp.code != 0) {
                                taskManager.statusSet(
                                    logger.error(`file rm update err: ${respUp.status} ${filepath}`)
                                )
                            } else {
                                taskManager.statusSet(`file rm success: ${distFilename}`)
                                if (req.data?.bDelThumb) {
                                    {
                                        const thumbTrashDbPath = Util.thumbTrashDbPathGet(
                                            fName,
                                            Dty.ThumbType.Thumb
                                        )
                                        const thumbDbPath = Util.thumbDbPathGet(
                                            fName,
                                            Dty.ThumbType.Thumb
                                        )
                                        if (fs.existsSync(thumbTrashDbPath)) {
                                            fs.unlinkSync(thumbTrashDbPath)
                                            logger.info(`thumb rm ${thumbTrashDbPath}`)
                                        }
                                        if (fs.existsSync(thumbDbPath)) {
                                            fs.unlinkSync(thumbDbPath)
                                            logger.info(`thumb rm ${thumbDbPath}`)
                                        }
                                    }
                                    {
                                        const thumbTrashDbPath = Util.thumbTrashDbPathGet(
                                            fName,
                                            Dty.ThumbType.Frame
                                        )
                                        const thumbDbPath = Util.thumbDbPathGet(
                                            fName,
                                            Dty.ThumbType.Frame
                                        )
                                        if (fs.existsSync(thumbTrashDbPath)) {
                                            fs.unlinkSync(thumbTrashDbPath)
                                            logger.info(`frame rm ${thumbTrashDbPath}`)
                                        }
                                        if (fs.existsSync(thumbDbPath)) {
                                            fs.unlinkSync(thumbDbPath)
                                            logger.info(`frame rm ${thumbDbPath}`)
                                        }
                                    }
                                }
                            }
                        } catch (err) {
                            attempts++
                            if (attempts < maxAttempts) {
                                taskManager.statusSet(
                                    logger.error(
                                        `file rm err attempt ${attempts} failed, retrying in 1 second...`,
                                        err
                                    )
                                )
                                await new Promise((resolve) => setTimeout(resolve, 1000))
                                await attemptRename()
                            } else {
                                taskManager.statusSet(
                                    logger.error('file rm err after multiple attempts:', err)
                                )
                                throw err
                            }
                        }
                    }
                    try {
                        await attemptRename()
                    } catch (err) {
                        return resp.err(`file rm err ${err}`)
                    }
                }
            }
        } else if (req.data.type == 'restore') {
            for (const item of req.data.files) {
                const fRepo = Dty.DataRepo.getRepoByPath(item.repo, appCfg.prj.dataRepo)
                if (fRepo == null || fRepo.path == '') {
                    return resp.err(`repo not exist ${item.repo},${item.path}`)
                }
                const searchReq = Dty.FilesReq.makeReqStatusNormal(item.path, item.repo)
                searchReq.status = []
                const searchResp = await appDb.fileViewSearch(searchReq)
                if (searchResp.code !== 0 || searchResp.data?.files.length === 0) {
                    taskManager.statusSet(
                        logger.error(
                            `file search err: ${item.repo} ${item.path} ${searchResp.status}`
                        )
                    )
                    continue
                }
                for (const fInfo of searchResp.data?.files || []) {
                    // Restore video to repo root folder, same name overwrite.
                    // The video will be moved to classify group folder on next sync.
                    const restorePath = path.join(fRepo.path, fInfo.name)
                    const mvResp = await fileSafeRename(fInfo.path, restorePath, 'force')
                    if (mvResp != 'success') {
                        taskManager.statusSet(
                            logger.error(`file restore err: ${mvResp} ${fInfo.path}`)
                        )
                        continue
                    }
                    fInfo.status = Dty.Fstatus.Normal
                    fInfo.path = restorePath
                    const respUp = await appDb.fileUpdate(fInfo)
                    if (respUp.code != 0) {
                        taskManager.statusSet(
                            logger.error(`file restore update err: ${respUp.status} ${restorePath}`)
                        )
                    } else {
                        taskManager.statusSet(logger.info(`file restore: ${restorePath}`))
                    }
                }
            }
        } else {
            for (const item of req.data.files) {
                const fRepo = Dty.DataRepo.getRepoByPath(item.repo, appCfg.prj.dataRepo)
                if (fRepo == null || fRepo.path == '') {
                    return resp.err(`repo not exist ${item.repo},${item.path}`)
                }
                const trashFolderPath = path.join(fRepo.path, '.trash')
                if (!fs.existsSync(trashFolderPath)) {
                    fs.mkdirSync(trashFolderPath)
                }
                const searchReq = Dty.FilesReq.makeReqStatusNormal(item.path, item.repo)
                const searchResp = await appDb.fileViewSearch(searchReq)
                if (searchResp.code !== 0 || searchResp.data?.files.length === 0) {
                    taskManager.statusSet(
                        logger.error(
                            `search file ${item.repo} ${item.path} err: ${searchResp.status}`
                        )
                    )
                    continue
                }

                for (const fInfo of searchResp.data?.files || []) {
                    const filepath = fInfo.path
                    const filename = fInfo.name
                    const distFilename = path.join(trashFolderPath, filename)
                    let attempts = 0
                    const maxAttempts = 3 // Maximum retry attempts
                    async function attemptRename(): Promise<void> {
                        try {
                            // Move video file to trash folder, same name overwrite
                            const mvResp = await fileSafeRename(filepath, distFilename, 'force')
                            if (mvResp == 'err') {
                                throw new Error(`rename ${filepath} to ${distFilename} err`)
                            }
                            // Update database
                            fInfo.status = Dty.Fstatus.Deleted
                            fInfo.path = distFilename
                            const respUp = await appDb.fileUpdate(fInfo)
                            if (respUp.code != 0) {
                                taskManager.statusSet(
                                    logger.error(`file update error: ${respUp.status} ${filepath}`)
                                )
                            } else {
                                taskManager.statusSet(
                                    logger.info(`file move: ${filepath} to ${distFilename}`)
                                )
                            }
                        } catch (err) {
                            attempts++
                            if (attempts < maxAttempts) {
                                taskManager.statusSet(
                                    logger.error(
                                        `file move attempt ${attempts} failed, retrying in 1 second...`,
                                        err
                                    )
                                )
                                await new Promise((resolve) => setTimeout(resolve, 1000))
                                await attemptRename()
                            } else {
                                taskManager.statusSet(
                                    logger.error('file move err after multiple attempts:', err)
                                )
                                throw err
                            }
                        }
                    }
                    try {
                        await attemptRename()
                    } catch (err) {
                        return resp.err(`file move err ${err}`)
                    }
                }
            }
        }

        taskManager.statusSet(logger.info(`delete file over`))
        resp.data = {}
        return resp
    }

    async handle_delete_file(
        req: Dty.Req<Dty.DeleteFileReq>
    ): Promise<Dty.Resp<Dty.DeleteFileResp>> {
        const respDel = await this.filesDel(req)
        return respDel
    }

    // Get directory total size recursively (bytes). Returns 0 if dir not exists.
    static async dirSizeGet(dirPath: string): Promise<number> {
        let totalSize = 0
        if (dirPath == '' || !fs.existsSync(dirPath)) {
            return 0
        }
        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
            for (const entry of entries) {
                const entryPath = path.join(dirPath, entry.name)
                if (entry.isDirectory()) {
                    totalSize += await AppProc.dirSizeGet(entryPath)
                } else if (entry.isFile()) {
                    const stat = await fs.promises.stat(entryPath)
                    totalSize += stat.size
                }
            }
        } catch (err) {
            logger.error(`dirSizeGet err: ${dirPath}`, err)
        }
        return totalSize
    }

    // Project statistics: file records grouped by status + thumbnail/frame folder sizes
    async handle_stats_get(): Promise<Dty.Resp<Dty.PrjStats>> {
        const resp = await appDb.fileStatsGet()
        if (resp.code != 0 || resp.data == null) {
            return resp
        }
        if (appCfg.prj.dataRepo.length == 0) {
            return resp
        }
        const repo = appCfg.prj.dataRepo[0]
        resp.data.thumbSize = await AppProc.dirSizeGet(repo.thumbnailPath)
        resp.data.frameSize = await AppProc.dirSizeGet(repo.framePath)
        return resp
    }

    cmdRespMake<T>(cmdResp: Dty.Resp<T>, bDoClear: boolean = true): Dty.Resp<string> {
        const resp = new Dty.Resp<string>()
        for (const key in cmdResp) {
            if (key == 'data') {
                continue
            }
            resp[key] = cmdResp[key]
        }
        resp.data = JSON.stringify(cmdResp.data)
        if (appCfg.bPrtWorkQueue) {
            logger.info(`cmd response: ${cmdResp.bOver}, cur cmd ${taskManager.curReq?.cmd}`)
        }
        if (bDoClear) {
            if (!(cmdResp.bOver == false)) {
                taskManager.addTask(null)
            }
        }
        return resp
    }

    handle_tiny2DbStop(): void {
        bTiny2DbStop = true
    }

    async handle_tiny2Db(req: Dty.Req<Dty.Tiny2DbReq>): Promise<Dty.Resp> {
        bTiny2DbStop = false
        let totalNum = 0
        let curIdx = 0
        async function procOneDir(thumbDir, thumbDbFilePath: string): Promise<void> {
            let bExist = true
            try {
                await fs.promises.access(thumbDbFilePath, fs.constants.F_OK)
            } catch (error) {
                if (!error) logger.error(error)
                bExist = false
            }
            if (bExist) {
                logger.info(`proc:${++curIdx}/${totalNum} thumb db exist ${thumbDbFilePath}`)
                return
            }

            const thumbDb: Database = await open({
                filename: thumbDbFilePath,
                driver: sqlite3.Database
            })
            await thumbDb.exec(Util.thumbDbCreateSqlGet())
            await thumbDb.exec(Util.thumbDbCreateSqlInfoGet())
            // Start transaction to improve batch insert performance
            await thumbDb.run('BEGIN TRANSACTION')

            try {
                // Traverse all files in tmpThumbDir and batch insert thumbnail files into thumbDb
                const files = await fs.promises.readdir(thumbDir)

                // Use prepared statement to improve insert efficiency
                const stmt = await thumbDb.prepare(
                    'INSERT INTO files (filename, raw, type, desc) VALUES (?, ?, ?, ?)'
                )

                // Control concurrency to avoid high memory usage and improve sequential read efficiency on HDD
                const batchSize = 10
                for (let i = 0; i < files.length; i += batchSize) {
                    const batch = files.slice(i, i + batchSize)

                    // Read batch of files in parallel
                    const filePromises = batch.map(async (file) => {
                        const filePath = path.join(thumbDir, file)
                        const fileStat = await fs.promises.stat(filePath)
                        if (fileStat.isFile()) {
                            const imageData = await fs.promises.readFile(filePath)
                            return [file, imageData]
                        }
                        return null
                    })

                    const results = await Promise.all(filePromises)

                    // Batch insert into database
                    for (const result of results) {
                        if (result !== null) {
                            const [filename, imageData] = result
                            await stmt.run(filename, imageData, 1, '')
                        }
                    }
                }

                await stmt.finalize()
                await thumbDb.run('COMMIT')
                logger.info(`proc:${++curIdx}/${totalNum} thumb db success ${thumbDbFilePath}`)
            } catch (error) {
                await thumbDb.run('ROLLBACK')
                throw error
            } finally {
                await thumbDb.close()
            }
        }

        const resp: Dty.Resp = new Dty.Resp()
        const tinyFileDbPath = req.data?.tinyFileDbPath || ''
        const tinyFilePath = req.data?.tinyFilePath || ''

        // Check if path parameters are empty
        if (!tinyFileDbPath || !tinyFilePath) {
            return resp.err('err param is null')
        }

        // Check if source folder exists
        if (!fs.existsSync(tinyFilePath)) {
            return resp.err(`err thumb path not exist: ${tinyFilePath}`)
        }

        // Check if source path is a folder
        const stats = fs.statSync(tinyFilePath)
        if (!stats.isDirectory()) {
            return resp.err(`err thumb not path: ${tinyFilePath}`)
        }

        logger.info(`start ${tinyFilePath} to ${tinyFileDbPath}`)

        try {
            // Traverse first-level directory of tinyFilePath
            const items = fs.readdirSync(tinyFilePath)
            totalNum = items.length
            for (const item of items) {
                if (bTiny2DbStop) {
                    logger.info('process tiny 2 db stop')
                    break
                }
                const itemPath = path.join(tinyFilePath, item)
                const itemStat = fs.statSync(itemPath)

                if (itemStat.isFile()) {
                    // logger.info(`Found file: ${itemPath}`)
                    // File processing can be done here
                } else if (itemStat.isDirectory()) {
                    let thumbDbFilePath = Util.thumbDbPathGet(
                        `${item}.mp4`,
                        Dty.ThumbType.FnameThumb
                    )
                    thumbDbFilePath = path.join(tinyFileDbPath, thumbDbFilePath)
                    // logger.info(`Found dir: ${itemPath} thumbPath: ${thumbDbFilePath}`)
                    // Subfolder processing can be done here
                    await procOneDir(itemPath, thumbDbFilePath)
                }
            }

            logger.info(`process over ${tinyFilePath} total ${items.length}`)
        } catch (error) {
            logger.error(`process err: ${error}`)
            return resp.err(`err: ${error}`)
        }

        return resp.success('tiny process over')
    }

    async handle_open_prj(
        mainWindow: Electron.BrowserWindow
    ): Promise<Dty.Resp<Dty.Prj>> {
        const resp = new Dty.Resp<Dty.Prj>()
        try {
            const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
                properties: ['openFile'],
                filters: [
                    { name: 'Project Files', extensions: ['sspj'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            })

            if (canceled) {
                return resp.err('user canceled')
            }

            const filePath = filePaths[0]
            return await this.openProjectByPath(filePath)
        } catch (error) {
            logger.error('Error opening project file:', error)
            return resp.err(
                `Error opening project file: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    async openProjectByPath(prjFile: string): Promise<Dty.Resp<Dty.Prj>> {
        const resp = new Dty.Resp<Dty.Prj>()
        try {
            if (!fs.existsSync(prjFile)) {
                return resp.err('Project file not found')
            }

            const fileContent = await fs.promises.readFile(prjFile, 'utf-8')
            const prjInfo = JSON.parse(fileContent) as Dty.Prj
            const prjFilePath = path.dirname(prjFile)
            prjInfo.path = prjFilePath
            appCfg.prj = prjInfo
            appCfg.appInfo.prjFile = prjFile
            this.addRecentProject(prjFile)
            this.saveAppCfg()

            const respDb = await appDb.initDb(path.join(prjFilePath, 'db'))
            if (!respDb.isSuccess()) {
                return resp.err('init db error')
            }

            for (let i = 1; i < 11; i++) {
                const tag: Dty.Tag = {
                    id: 0,
                    name: `sys_score${i}`,
                    color: '#4A6FA5',
                    description: ''
                }
                await appDb.tag_insert(tag)
            }

            resp.success('File opened successfully').data = prjInfo
            return resp
        } catch (error) {
            logger.error('Error opening project file:', error)
            return resp.err(
                `Error opening project file: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    async handle_close_prj(): Promise<Dty.Resp> {
        const resp = new Dty.Resp()
        appCfg.appInfo.prjFile = ''
        this.saveAppCfg()
        await appDb.close()
        logger.info('Project closed successfully')
        return resp.success('Project closed successfully')
    }

    async handle_prj_save(
        mainWindow: Electron.BrowserWindow,
        req: Dty.Req<Dty.Prj>
    ): Promise<Dty.Resp<string>> {
        const resp = new Dty.Resp<string>()
        if (!req.data) {
            return resp.err('project data is null')
        }

        const prj = req.data
        let savePath = prj.path

        if (!savePath) {
            const result = await dialog.showSaveDialog(mainWindow, {
                title: 'Save project',
                defaultPath: prj.name || 'untitled',
                filters: [
                    { name: 'Project Files', extensions: ['sspj'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            })

            if (result.canceled || !result.filePath) {
                return resp.err('user canceled')
            }
            savePath = result.filePath
        }

        try {
            prj.path = savePath
            await fs.promises.writeFile(savePath, JSON.stringify(prj, null, 2), 'utf-8')
            appCfg.prj = prj
            appCfg.appInfo.prjFile = savePath
            this.addRecentProject(savePath)
            this.saveAppCfg()
            resp.data = savePath
            return resp.success('success')
        } catch (err) {
            logger.error('save project failed:', err)
            return resp.err(`save failed: ${err}`)
        }
    }

    async handle_cmd(req: Dty.Req, mainWin: Electron.BrowserWindow | null): Promise<Dty.Resp> {
        const cmd = req.cmd
        const cseq = req.cseq
        if (req.cmd == Dty.CmdType.heartBeat) {
            return this.cmdRespMake(await this.handle_heartbeat(), false)
        }
        if (req.cmd == Dty.CmdType.tinyFileDbStop) {
            this.handle_tiny2DbStop()
            return this.cmdRespMake(new Dty.Resp())
        }
        if (req.cmd == Dty.CmdType.SyncStop) {
            bSyncPrjStop = true
            logger.info(`cmd:${req.cmd}:${cseq}`)
            return this.cmdRespMake(new Dty.Resp())
        }
        if (req.cmd == Dty.CmdType.thumbImgGet) {
            const cmdReq: Dty.Req<Dty.ThumbImgGetReq> = {
                cmd: req.cmd,
                cseq: req.cseq,
                data: JSON.parse(req.data ? req.data : '{}') as Dty.ThumbImgGetReq
            }
            logger.info(
                `cmd:${cmd}:${cseq}, video=${cmdReq.data?.videoName}, thumb=${cmdReq.data?.thumbName}`
            )
            return this.cmdRespMake(await this.handle_thumb_img_get(cmdReq))
        }
        if (taskManager.isBusy()) {
            logger.warn(`work queue is busy, cmd: ${req.cmd}, curReq: ${taskManager.curReq?.cmd}`)
            return taskManager.makeBusyResponse()
        }
        taskManager.addTask(req)
        function convertCmdRequest<T>(req: Dty.Req): Dty.Req<T> {
            const cmdReq: Dty.Req<T> = {
                cmd: req.cmd,
                cseq: req.cseq,
                data: JSON.parse(req.data ? req.data : '{}') as T
            }
            return cmdReq
        }

        switch (cmd) {
            case Dty.CmdType.app_start:
                logger.info(`cmd:${cmd}:${cseq}`)
                return this.cmdRespMake(await this.handle_app_start())
            case Dty.CmdType.appConfigSave:
                logger.info(`cmd:${cmd}:${cseq}`)
                return this.cmdRespMake(await this.handle_app_config_save(req))
            case Dty.CmdType.prjOpen: {
                logger.info(`cmd:${cmd}:${cseq}, ${req}`)
                return this.cmdRespMake(await this.handle_open_prj(mainWin!))
            }
            case Dty.CmdType.prjOpenByPath: {
                const cmdReq = convertCmdRequest<Dty.Req_OpenPrj>(req)
                logger.info(`cmd:${cmd}:${cseq}, ${cmdReq.data?.prjFile}`)
                return this.cmdRespMake(await this.openProjectByPath(cmdReq.data?.prjFile || ''))
            }
            case Dty.CmdType.prjClose: {
                logger.info(`cmd:${cmd}:${cseq}`)
                return this.cmdRespMake(await this.handle_close_prj())
            }
            case Dty.CmdType.prjSave: {
                const cmdReq = convertCmdRequest<Dty.Prj>(req)
                logger.info(`cmd:${cmd}:${cseq}`)
                return this.cmdRespMake(await this.handle_prj_save(mainWin!, cmdReq))
            }
            case Dty.CmdType.search_file: {
                logger.info(`cmd:${cmd}:${cseq}`)
                const cmdReq = convertCmdRequest<Dty.FilesReq>(req)
                return this.cmdRespMake(await this.handle_search_file(cmdReq))
            }
            case Dty.CmdType.tinyFileDbStart: {
                logger.info(`cmd:${cmd}:${cseq}`)
                const cmdReq = convertCmdRequest<Dty.Tiny2DbReq>(req)
                return this.cmdRespMake(await this.handle_tiny2Db(cmdReq))
            }
            case Dty.CmdType.thumbGet: {
                logger.info(`cmd:${cmd}:${cseq}`)
                const cmdReq = convertCmdRequest<Dty.FilesReq>(req)
                return this.cmdRespMake(await this.handle_search_file(cmdReq))
            }
            // case 'slt_video_event': {
            //     logger.info(`cmd:${cmd}:${cseq}, ${req}`)
            //     return cmdRespMake(await handle_video_event_detect())
            // }
            case Dty.CmdType.videoDel: {
                const cmdReq = convertCmdRequest<Dty.DeleteFileReq>(req)
                logger.info(`cmd:${cmd}:${cseq}, length=${cmdReq.data?.files.length}`)
                return this.cmdRespMake(await this.handle_delete_file(cmdReq))
            }
            case Dty.CmdType.thumbReconcile: {
                logger.info(`cmd:${cmd}:${cseq}`)
                return this.cmdRespMake(await this.thumbReconcile())
            }
            case Dty.CmdType.statsGet: {
                logger.info(`cmd:${cmd}:${cseq}`)
                return this.cmdRespMake(await this.handle_stats_get())
            }
            case Dty.CmdType.thumbDel: {
                const cmdReq = convertCmdRequest<Dty.DeleteFileReq>(req)
                logger.info(`cmd:${cmd}:${cseq}, length=${cmdReq.data?.files.length}`)
                return this.cmdRespMake(await this.thumbsDel(cmdReq))
            }
            case Dty.CmdType.sltVideo: {
                const cmdReq = convertCmdRequest<Dty.Req_SltFile>(req)
                logger.info(`cmd:${cmd}:${cseq}, ${cmdReq.data?.filepath}`)
                return this.cmdRespMake(await this.handle_select_video(cmdReq))
            }
            case Dty.CmdType.prjSync: {
                const cmdReq = convertCmdRequest<Dty.SyncPrjReq>(req)
                logger.info(`cmd:${cmd}:${cseq}, ${cmdReq.data?.type}`)
                return this.cmdRespMake(await this.handle_prjSync(cmdReq))
            }
            // case 'sync_trash': {
            //     const cmdReq = convertCmdRequest<Dty.Req_SyncTrash>(req)
            //     logger.info(`cmd:${cmd}:${cseq}, ${cmdReq.data?.folder}`)
            //     return cmdRespMake(await recordsProc.start_sync_trash(cmdReq))
            // }
            case Dty.CmdType.fileTagsSet: {
                const cmdReq = convertCmdRequest<Dty.FileTagsReq>(req)
                logger.info(`cmd:${cmd}:${cseq}, fileTags len:${cmdReq.data?.fileTags.length}`)
                return this.cmdRespMake(await this.handle_file_tags_set(cmdReq))
            }
            case Dty.CmdType.tags_get: {
                const cmdReq = convertCmdRequest<Dty.TagsReq>(req)
                logger.info(`cmd:${cmd}:${cseq}`)
                return this.cmdRespMake(await this.handle_tags_get(cmdReq))
            }
            case Dty.CmdType.tagUpdate: {
                const cmdReq = convertCmdRequest<Dty.TagUpdateReq>(req)
                logger.info(`cmd:${cmd}:${cseq}, id:${cmdReq.data?.id}`)
                return this.cmdRespMake(await this.handle_tag_update(cmdReq))
            }
            case Dty.CmdType.tagDelete: {
                const cmdReq = convertCmdRequest<Dty.TagDeleteReq>(req)
                logger.info(`cmd:${cmd}:${cseq}, id:${cmdReq.data?.id}`)
                return this.cmdRespMake(await this.handle_tag_delete(cmdReq))
            }
            case Dty.CmdType.fileTagDelete: {
                const cmdReq = convertCmdRequest<Dty.FileTagDeleteReq>(req)
                logger.info(`cmd:${cmd}:${cseq}, fileId:${cmdReq.data?.fileId}, tagId:${cmdReq.data?.tagId}`)
                return this.cmdRespMake(await this.handle_file_tag_delete(cmdReq))
            }
            case Dty.CmdType.filesGet: {
                const cmdReq = convertCmdRequest<Dty.FilesReq>(req)
                logger.info(`cmd:${cmd}:${cseq}`)
                return this.cmdRespMake(await this.handle_files_get(cmdReq))
            }
            case Dty.CmdType.selectFolder: {
                logger.info(`cmd:${cmd}:${cseq}`)
                return this.cmdRespMake(await this.handle_select_folder(mainWin!))
            }
            case Dty.CmdType.createPrjWithPath: {
                const cmdReq = convertCmdRequest<Dty.CreatePrjWithPathReq>(req)
                logger.info(`cmd:${cmd}:${cseq}`)
                return this.cmdRespMake(await this.handle_create_prj_with_path(cmdReq))
            }
            default: {
                console.log(`Unknown event: ${cmd}:${cseq}`)
                const resp = new Dty.Resp()
                return resp.err(`Unknown event: ${cmd}`)
            }
        }
    }
}

const appProc = new AppProc()
export default appProc
