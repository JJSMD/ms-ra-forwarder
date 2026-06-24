import { EdgeTTSService } from "@/service/edge-tts-service"
import { EdgeTTSClient } from "@/service/edge-tts-service/client"
import { TTSOptions } from "@/service/tts-service"
Error.stackTraceLimit = Infinity;

async function handleTTSRequest(text: string, voice: string, volume: number, rate: number, pitch: number, personality?: string) {
    const service = new EdgeTTSService()
    const options: TTSOptions = {
        voice,
        volume,
        rate,
        pitch,
        personality,
    }
    const speech = await service.convert(text, options)
    const audioBlob = new Blob([speech.audio], { type: 'audio/mpeg' });
    return new Response(audioBlob, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
}

async function handleRawSSMLRequest(ssml: string) {
    console.log('[handleRawSSML] converting raw SSML, length:', ssml.length)
    const result = await EdgeTTSClient.convert(ssml, {
        format: "audio-24khz-96kbitrate-mono-mp3",
        sentenceBoundaryEnabled: false,
        wordBoundaryEnabled: false,
    })
    const audioBlob = new Blob([result.audio], { type: 'audio/mpeg' });
    return new Response(audioBlob, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
}

function checkAuth(request: Request): Response | null {
    const authorization = request.headers.get('authorization')
    const requiredToken = process.env.MS_RA_FORWARDER_TOKEN || process.env.TOKEN
    if (requiredToken) {
        if (!authorization || authorization !== 'Bearer ' + requiredToken) {
            return new Response('Unauthorized', { status: 401 })
        }
    }
    return null
}

function parseNumberParam(value: string | null | undefined, defaultValue: number, min: number, max: number) {
    if (value === null || value === undefined) {
        return defaultValue;
    }
    try {
        const num = Number(value)
        if (Number.isNaN(num)) throw new Error('NaN')
        if (num < min || num > max) throw new Error('out of range')
        return num
    } catch {
        throw new Error(`Invalid param value: ${value}`);
    }
}

export async function GET(request: Request) {
    try {
        const authResponse = checkAuth(request)
        if (authResponse) return authResponse

        const { searchParams } = new URL(request.url)
        const text = String(searchParams.get('text') ?? '')
        if (!text) {
            return new Response(JSON.stringify({ error: 'Text is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
        }
        const voice = String(searchParams.get('voice') ?? '')
        if (!voice) {
            return new Response(JSON.stringify({ error: 'Voice is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
        }
        const pitch = parseNumberParam(searchParams.get('pitch'), 0, -100, 100);
        const rate = parseNumberParam(searchParams.get('rate'), 0, -100, 100);
        const volume = parseNumberParam(searchParams.get('volume'), 100, -100, 100);
        const personality = searchParams.get('personality') ?? undefined;

        return await handleTTSRequest(text, voice, volume, rate, pitch, personality)
    } catch (error) {
        console.log('textToSpeach error', error)
        console.log("Full stack", (error as Error).stack)
        return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
}

export async function POST(request: Request) {
    try {
        console.log('[POST] method:', request.method)
        console.log('[POST] url:', request.url)
        console.log('[POST] content-type:', request.headers.get('content-type'))
        console.log('[POST] content-length:', request.headers.get('content-length'))
        console.log('[POST] authorization:', request.headers.get('authorization') ? 'present' : 'none')

        const authResponse = checkAuth(request)
        if (authResponse) return authResponse

        const bodyText = await request.text()
        console.log('[POST] raw body length:', bodyText.length)
        console.log('[POST] raw body preview:', bodyText.substring(0, 200))

        // 如果 body 是原始 SSML（以 <speak 开头），直接转发
        if (bodyText.trim().startsWith('<speak')) {
            console.log('[POST] detected raw SSML, passing directly')
            return await handleRawSSMLRequest(bodyText)
        }

        // 否则按 JSON 或 form-urlencoded 格式解析
        const contentType = request.headers.get('content-type') || ''
        let text = '', voice = ''
        let pitch: string | null | undefined, rate: string | null | undefined, volume: string | null | undefined, personality: string | null | undefined
        if (contentType.includes('application/json')) {
            const body = JSON.parse(bodyText)
            console.log('[POST] JSON body:', JSON.stringify(body))
            text = body.text
            voice = body.voice
            pitch = body.pitch
            rate = body.rate
            volume = body.volume
            personality = body.personality
        } else {
            const params = new URLSearchParams(bodyText)
            text = params.get('text') ?? ''
            voice = params.get('voice') ?? ''
            pitch = params.get('pitch')
            rate = params.get('rate')
            volume = params.get('volume')
            personality = params.get('personality')
        }
        console.log('[POST] parsed - text:', text ? text.substring(0, 50) + (text.length > 50 ? '...' : '') : '(empty)')
        console.log('[POST] parsed - voice:', voice || '(empty, will use default)')
        console.log('[POST] parsed - pitch:', pitch, 'rate:', rate, 'volume:', volume, 'personality:', personality)
        text = String(text ?? '')
        if (!text) {
            console.log('[POST] text is empty, returning 400')
            return new Response(JSON.stringify({ error: 'Text is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
        }
        voice = String(voice ?? '')
        if (!voice) {
            // 默认使用晓晓
            voice = 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoxiaoNeural)'
        }
        const finalPitch = parseNumberParam(pitch, 0, -100, 100);
        const finalRate = parseNumberParam(rate, 0, -100, 100);
        const finalVolume = parseNumberParam(volume, 100, -100, 100);
        const finalPersonality = personality ?? undefined;

        return await handleTTSRequest(text, voice, finalVolume, finalRate, finalPitch, finalPersonality)
    } catch (error) {
        console.log('textToSpeach error', error)
        return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
}