import { EdgeTTSService } from "@/service/edge-tts-service"
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
        const authResponse = checkAuth(request)
        if (authResponse) return authResponse

        // 同时支持 JSON 和 form-urlencoded 格式
        const contentType = request.headers.get('content-type') || ''
        let text = '', voice = ''
        let pitch: string | null | undefined, rate: string | null | undefined, volume: string | null | undefined, personality: string | null | undefined
        if (contentType.includes('application/json')) {
            const body = await request.json()
            text = body.text
            voice = body.voice
            pitch = body.pitch
            rate = body.rate
            volume = body.volume
            personality = body.personality
        } else {
            const bodyText = await request.text()
            const params = new URLSearchParams(bodyText)
            text = params.get('text') ?? ''
            voice = params.get('voice') ?? ''
            pitch = params.get('pitch')
            rate = params.get('rate')
            volume = params.get('volume')
            personality = params.get('personality')
        }
        text = String(text ?? '')
        if (!text) {
            return new Response(JSON.stringify({ error: 'Text is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
        }
        voice = String(voice ?? '')
        if (!voice) {
            return new Response(JSON.stringify({ error: 'Voice is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
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