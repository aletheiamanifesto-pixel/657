require('dotenv').config()
const express = require('express')
const WebSocket = require('ws')
const http = require('http')
const CallHandler = require('./callHandler')

const app = express()
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'VoiceDesk AI running', version: '1.0.0' })
})

// Twilio chiama questo endpoint quando arriva una chiamata
app.post('/incoming-call', (req, res) => {
  const host = req.headers.host
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${host}/audio-stream" />
  </Connect>
</Response>`
  res.type('text/xml').send(twiml)
})

// Server HTTP
const server = http.createServer(app)

// WebSocket server per lo stream audio Twilio
const wss = new WebSocket.Server({ noServer: true })

wss.on('connection', (ws) => {
  console.log('📞 Nuova chiamata connessa')
  const handler = new CallHandler(ws)

  ws.on('message', (data) => {
    try {
      handler.onAudio(JSON.parse(data))
    } catch (err) {
      console.error('Errore parsing messaggio:', err)
    }
  })

  ws.on('close', () => {
    console.log('📴 Chiamata terminata')
    handler.onEnd()
  })

  ws.on('error', (err) => {
    console.error('WebSocket error:', err)
  })
})

// Upgrade HTTP → WebSocket
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/audio-stream') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  } else {
    socket.destroy()
  }
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`🚀 VoiceDesk AI in ascolto su porta ${PORT}`)
})
