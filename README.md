# VoiceDesk AI 🎙️

Receptionist vocale AI per piccole imprese europee.
Risponde alle chiamate 24/7, prende prenotazioni e ordini in italiano.

## Stack

- **Twilio** — gestione chiamate e SMS
- **Whisper** — trascrizione vocale italiano
- **Claude Sonnet** — comprensione e risposta
- **ElevenLabs** — sintesi vocale naturale
- **Supabase** — database e autenticazione
- **Node.js** — backend WebSocket

## Setup rapido

```bash
cp .env.example .env
# Compila le API key nel .env

npm install
node server.js
```

## Configurazione Twilio

1. Crea account su [twilio.com](https://twilio.com)
2. Compra un numero italiano (+39)
3. Webhook → `https://tuo-dominio.com/incoming-call`

## Schema database

Esegui `db/schema.sql` su Supabase SQL Editor.

## Variabili d'ambiente

Vedi `.env.example` per la lista completa.
