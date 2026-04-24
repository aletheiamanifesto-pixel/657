const twilio = require('twilio')

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

async function sendSmsConfirmation(toPhone, reservation) {
  try {
    await client.messages.create({
      body:
        `✅ Prenotazione confermata!\n` +
        `📅 ${reservation.date} alle ${reservation.time}\n` +
        `👥 ${reservation.party_size} persone\n` +
        `Per cancellare rispondi CANCELLA`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: toPhone
    })
    console.log(`📱 SMS inviato a ${toPhone}`)
  } catch (err) {
    console.error('Errore SMS:', err)
  }
}

module.exports = { sendSmsConfirmation }
