import appCfg from './AppCfg'
import { execSync } from 'child_process'
import * as Dty from '../../bridge/dataTypedef'

class MediaProcess {
    // Get video media info via ffprobe (used when record files are added to project)
    async getVideoInfo(filePath: string): Promise<Dty.MediaInfo> {
        const video_path = filePath
        const cmd = `${appCfg.ffprobeExe} -v error -of json -show_format -show_streams ${video_path}`
        const output = execSync(cmd).toString()
        const jsonData = JSON.parse(output)

        const mediaInfo: Dty.MediaInfo = {
            nb_streams: 0,
            duration: 0,
            size: 0,
            start_time: 0,
            bit_rate: 0,
            video: {
                codec_name: '',
                codec_type: '',
                width: 0,
                height: 0,
                pix_fmt: '',
                bit_rate: 0,
                frame_rate: 0,
                nb_frames: 0
            },
            audio: {
                codec_name: '',
                codec_type: '',
                sample_rate: 0,
                channels: 0,
                bit_rate: 0,
                channel_layout: ''
            }
        }

        interface StreamInfo {
            codec_type: string
            codec_name: string
            width?: number
            height?: number
            pix_fmt?: string
            bit_rate?: string
            r_frame_rate?: string
            duration?: string
            sample_rate?: string
            channels?: number
            channel_layout?: string
        }
        const videoStream = jsonData.streams.find(
            (stream: StreamInfo) => stream.codec_type === 'video'
        )
        if (!videoStream) {
            console.error('video stream not found')
        } else {
            mediaInfo.video.codec_name = videoStream.codec_name
            mediaInfo.video.codec_type = videoStream.codec_type
            mediaInfo.video.width = Number(videoStream.width)
            mediaInfo.video.height = Number(videoStream.height)
            mediaInfo.video.pix_fmt = videoStream.pix_fmt
            mediaInfo.video.bit_rate = Number(videoStream.bit_rate)

            const [numerator, denominator] = videoStream.r_frame_rate.split('/').map(Number)
            const frameRate = numerator / denominator
            mediaInfo.video.frame_rate = Number(frameRate)
            const duration = parseFloat(videoStream.duration)
            mediaInfo.video.nb_frames = duration * frameRate
        }
        const audioStream = jsonData.streams.find(
            (stream: StreamInfo) => stream.codec_type === 'audio'
        )
        if (!audioStream) {
            console.error('audio stream not found')
        } else {
            mediaInfo.audio.codec_name = audioStream.codec_name
            mediaInfo.audio.codec_type = audioStream.codec_type
            mediaInfo.audio.sample_rate = Number(audioStream.sample_rate)
            mediaInfo.audio.channels = Number(audioStream.channels)
            mediaInfo.audio.channel_layout = audioStream.channel_layout
            mediaInfo.audio.bit_rate = Number(audioStream.bit_rate)
        }
        mediaInfo.nb_streams = Number(jsonData.streams.length)
        mediaInfo.duration = Number(jsonData.format.duration)
        mediaInfo.size = Number(jsonData.format.size)
        mediaInfo.start_time = Number(jsonData.format.start_time)
        mediaInfo.bit_rate = Number(jsonData.format.bit_rate)
        return mediaInfo
    }
}

const mediaProc = new MediaProcess()
export default mediaProc
