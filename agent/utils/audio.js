const { spawn } = require('child_process')

function mulawToWav(mulawBuffer) {
  const table = new Int16Array(256)
  for (let i = 0; i < 256; i++) {
    let u = ~i
    const sign = u & 0x80
    const exp = (u >> 4) & 0x07
    const mant = u & 0x0F
    let s = mant << (exp + 3)
    s += 0x84 << exp
    table[i] = sign ? -s : s
  }

  const pcm = new Int16Array(mulawBuffer.length)
  for (let i = 0; i < mulawBuffer.length; i++) {
    pcm[i] = table[mulawBuffer[i]]
  }

  const dataSize = pcm.length * 2
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(dataSize + 36, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(8000, 24)
  header.writeUInt32LE(16000, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  return Buffer.concat([header, Buffer.from(pcm.buffer)])
}

function convertToMulaw(mp3Buffer) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-ar', '8000',
      '-ac', '1',
      '-acodec', 'pcm_mulaw',
      '-f', 'mulaw',
      'pipe:1'
    ])

    const out = []
    ff.stdout.on('data', c => out.push(c))
    ff.stdout.on('end', () => resolve(Buffer.concat(out)))
    ff.stderr.on('data', () => {})
    ff.on('error', reject)
    ff.stdin.write(mp3Buffer)
    ff.stdin.end()
  })
}

module.exports = { mulawToWav, convertToMulaw }
