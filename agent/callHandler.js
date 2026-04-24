const OpenAI = require('openai')
const Anthropic = require('@anthropic-ai/sdk')
const { ElevenLabsClient } = require('elevenlabs')
const { createClient } = require('@supabase/supabase-js')
const { mulawToWav, convertToMulaw } = require('./utils/audio')
const { sendSmsConfirmation } = require('./utils/sms')
const { TOOLS, executeTool } = require('./agent/tools')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

class CallHandler {
  constructor(ws) {
    this.ws = ws
    this.audioBuffer = []
    this.silenceTimer = null
    this.streamSid = null
    this.callSid = null
    this.merchantId = null
    this.merchant = null
    this.conversationHistory = []
    this.isProcessing = false
  }

  async onAudio(message) {
    if (message.event === 'start') {
      this.streamSid = message.start.streamSid
      this.callSid = message.start.callSid

      // Identifica merchant dal numero chiamato
      await this.loadMerchant(message.start.customParameters?.to)

      // Saluta il cliente
      await this.speakResponse(
        'Grazie per aver chiamato. Come posso aiutarla?'
      )
    }

    if (message.event === 'media' && !this.isProcessing) {
      const chunk = Buffer.from(message.media.payload, 'base64')
      this.audioBuffer.push(chunk)

      // VAD: 600ms di silenzio = fine enunciato
      clearTimeout(this.silenceTimer)
      this.silenceTimer = setTimeout(async () => {
        if (this.audioBuffer.length > 10) { // minimo ~125ms di audio
          await this.processAudio()
        }
      }, 600)
    }
  }

  async loadMerchant(phoneNumber) {
    // In produzione: cerca merchant dal numero Twilio
    // Per ora carica il primo merchant disponibile
    const { data } = await supabase
      .from('merchants')
      .select('*')
      .limit(1)
      .single()

    this.merchant = data
    this.merchantId = data?.id
  }

  async processAudio() {
    if (this.isProcessing || this.audioBuffer.length === 0) return
    this.isProcessing = true

    const chunks = [...this.audioBuffer]
    this.audioBuffer = []

    try {
      // Converti mulaw → WAV per Whisper
      const wavBuffer = mulawToWav(Buffer.concat(chunks))

      // Trascrivi con Whisper in italiano
      const transcript = await openai.audio.transcriptions.create({
        file: new File([wavBuffer], 'audio.wav', { type: 'audio/wav' }),
        model: 'whisper-1',
        language: 'it',
        temperature: 0,
        response_format: 'json'
      })

      const text = transcript.text?.trim()
      if (!text || text.length < 2) {
        this.isProcessing = false
        return
      }

      console.log(`👤 Cliente: "${text}"`)
      await this.generateResponse(text)

    } catch (err) {
      console.error('Errore processAudio:', err)
    } finally {
      this.isProcessing = false
    }
  }

  async generateResponse(userText) {
    const systemPrompt = this.merchant
      ? `Sei il receptionist vocale di ${this.merchant.name}.
Rispondi sempre in italiano, in modo naturale e cordiale.
Orari di apertura: ${JSON.stringify(this.merchant.opening_hours || {})}.
Sii conciso — massimo 2-3 frasi per risposta vocale.
Usa il formato "le venti" invece di "20:00".
Se non capisci, chiedi gentilmente di ripetere.
${this.merchant.system_prompt || ''}`
      : `Sei un receptionist vocale AI. Rispondi in italiano in modo cordiale e conciso.`

    this.conversationHistory.push({
      role: 'user',
      content: userText
    })

    try {
      let response = await claude.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 500,
        system: systemPrompt,
        tools: TOOLS,
        messages: this.conversationHistory
      })

      // Loop tool use
      while (response.stop_reason === 'tool_use') {
        const toolBlock = response.content.find(b => b.type === 'tool_use')
        console.log(`🔧 Tool: ${toolBlock.name}`, toolBlock.input)

        const result = await executeTool(
          toolBlock.name,
          toolBlock.input,
          this.merchantId,
          supabase,
          sendSmsConfirmation
        )

        console.log(`✅ Risultato:`, result)

        this.conversationHistory.push({
          role: 'assistant',
          content: response.content
        })
        this.conversationHistory.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result)
          }]
        })

        response = await claude.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 500,
          system: systemPrompt,
          tools: TOOLS,
          messages: this.conversationHistory
        })
      }

      const textResponse = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('')

      this.conversationHistory.push({
        role: 'assistant',
        content: textResponse
      })

      console.log(`🤖 VoiceDesk: "${textResponse}"`)
      await this.speakResponse(textResponse)

      // Log chiamata su Supabase
      await supabase.from('call_logs').upsert({
        call_sid: this.callSid,
        merchant_id: this.merchantId,
        transcript: userText,
        action_taken: { response: textResponse }
      }, { onConflict: 'call_sid' })

    } catch (err) {
      console.error('Errore Claude:', err)
      await this.speakResponse('Mi scuso, c\'è stato un problema tecnico. Può ripetere?')
    }
  }

  async speakResponse(text) {
    try {
      const audioStream = await elevenlabs.generate({
        voice: process.env.ELEVENLABS_VOICE_ID,
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3
        }
      })

      const chunks = []
      for await (const chunk of audioStream) {
        chunks.push(chunk)
      }
      const audioBuffer = Buffer.concat(chunks)
      const mulawAudio = await convertToMulaw(audioBuffer)

      if (this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({
          event: 'media',
          streamSid: this.streamSid,
          media: { payload: mulawAudio.toString('base64') }
        }))
      }
    } catch (err) {
      console.error('Errore ElevenLabs:', err)
    }
  }

  onEnd() {
    clearTimeout(this.silenceTimer)
    this.audioBuffer = []
    this.conversationHistory = []
  }
}

module.exports = CallHandler
