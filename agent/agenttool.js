const TOOLS = [
  {
    name: 'check_table_availability',
    description: 'Verifica disponibilità tavoli per data, ora, numero persone e preferenza posto',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Data YYYY-MM-DD' },
        time: { type: 'string', description: 'Ora HH:MM' },
        party_size: { type: 'integer', description: 'Numero persone' },
        location: {
          type: 'string',
          enum: ['interno', 'esterno', 'terrazza', 'indifferente'],
          description: 'Preferenza posto'
        }
      },
      required: ['date', 'time', 'party_size']
    }
  },
  {
    name: 'create_reservation',
    description: 'Crea prenotazione confermata nel sistema',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string' },
        customer_phone: { type: 'string' },
        party_size: { type: 'integer' },
        date: { type: 'string' },
        time: { type: 'string' },
        location: { type: 'string' },
        notes: { type: 'string' }
      },
      required: ['customer_name', 'party_size', 'date', 'time']
    }
  },
  {
    name: 'get_menu',
    description: 'Recupera menu del ristorante, opzionalmente per categoria',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Es: pizze, antipasti, dolci, bevande'
        }
      }
    }
  },
  {
    name: 'create_order',
    description: 'Crea ordine con piatti richiesti e invia in cucina',
    input_schema: {
      type: 'object',
      properties: {
        table_number: { type: 'integer' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              quantity: { type: 'integer' },
              extras: {
                type: 'array',
                items: { type: 'string' }
              },
              notes: { type: 'string' }
            },
            required: ['name']
          }
        }
      },
      required: ['items']
    }
  },
  {
    name: 'get_opening_hours',
    description: 'Restituisce gli orari di apertura del ristorante',
    input_schema: {
      type: 'object',
      properties: {}
    }
  }
]

async function executeTool(name, input, merchantId, supabase, sendSms) {
  switch (name) {

    case 'check_table_availability': {
      const { date, time, party_size, location } = input
      let query = supabase
        .from('tables')
        .select('*')
        .eq('merchant_id', merchantId)
        .gte('capacity', party_size)
        .eq('is_available', true)

      if (location && location !== 'indifferente') {
        query = query.eq('location', location)
      }

      const { data: tables } = await query
      const { data: existing } = await supabase
        .from('reservations')
        .select('table_id')
        .eq('merchant_id', merchantId)
        .eq('date', date)
        .eq('time', time)
        .eq('status', 'confermata')

      const busyIds = (existing || []).map(r => r.table_id)
      const available = (tables || []).filter(t => !busyIds.includes(t.id))

      return {
        available: available.length > 0,
        count: available.length,
        locations: [...new Set(available.map(t => t.location))],
        message: available.length > 0
          ? `Disponibili ${available.length} tavoli`
          : 'Nessun tavolo disponibile per questo orario'
      }
    }

    case 'create_reservation': {
      let tableId = null
      if (input.location && input.location !== 'indifferente') {
        const { data: tables } = await supabase
          .from('tables')
          .select('id')
          .eq('merchant_id', merchantId)
          .gte('capacity', input.party_size)
          .eq('location', input.location)
          .limit(1)
        tableId = tables?.[0]?.id
      }

      const { data, error } = await supabase
        .from('reservations')
        .insert({
          merchant_id: merchantId,
          table_id: tableId,
          customer_name: input.customer_name,
          customer_phone: input.customer_phone,
          party_size: input.party_size,
          date: input.date,
          time: input.time,
          location_pref: input.location,
          notes: input.notes
        })
        .select()
        .single()

      if (error) return { success: false, error: error.message }

      if (input.customer_phone) {
        await sendSms(input.customer_phone, input)
      }

      return {
        success: true,
        reservation_id: data.id,
        message: `Prenotazione confermata: ${input.party_size} persone il ${input.date} alle ${input.time}`
      }
    }

    case 'get_menu': {
      let query = supabase
        .from('menu_items')
        .select('name, category, price, description, extras, allergens')
        .eq('merchant_id', merchantId)
        .eq('available', true)

      if (input.category) {
        query = query.eq('category', input.category)
      }

      const { data } = await query
      return { items: data || [] }
    }

    case 'create_order': {
      const { data: menuItems } = await supabase
        .from('menu_items')
        .select('name, price, extras')
        .eq('merchant_id', merchantId)

      let total = 0
      const enriched = (input.items || []).map(item => {
        const found = menuItems?.find(m =>
          m.name.toLowerCase().includes(item.name.toLowerCase())
        )
        let price = found?.price || 0

        if (item.extras && found?.extras) {
          item.extras.forEach(extraName => {
            const extra = found.extras.find(e =>
              e.name?.toLowerCase().includes(extraName.toLowerCase())
            )
            if (extra) price += extra.price || 0
          })
        }

        total += price * (item.quantity || 1)
        return { ...item, unit_price: price }
      })

      const { data, error } = await supabase
        .from('orders')
        .insert({
          merchant_id: merchantId,
          table_number: input.table_number,
          items: enriched,
          total: parseFloat(total.toFixed(2)),
          status: 'in_attesa'
        })
        .select()
        .single()

      if (error) return { success: false, error: error.message }

      return {
        success: true,
        order_id: data.id,
        total: total.toFixed(2),
        message: `Ordine inviato in cucina. Totale: €${total.toFixed(2)}`
      }
    }

    case 'get_opening_hours': {
      const { data } = await supabase
        .from('merchants')
        .select('opening_hours, name')
        .eq('id', merchantId)
        .single()

      return { hours: data?.opening_hours || {}, name: data?.name }
    }

    default:
      return { error: `Tool sconosciuto: ${name}` }
  }
}

module.exports = { TOOLS, executeTool }
