-- VoiceDesk AI — Schema Supabase
-- Esegui su: supabase.com → SQL Editor

CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  address TEXT,
  opening_hours JSONB DEFAULT '{}',
  system_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
  table_number INT NOT NULL,
  capacity INT NOT NULL,
  location TEXT CHECK (location IN ('interno','esterno','terrazza')),
  is_available BOOLEAN DEFAULT true
);

CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  price DECIMAL(8,2) NOT NULL DEFAULT 0,
  description TEXT,
  allergens TEXT[] DEFAULT '{}',
  extras JSONB DEFAULT '[]',
  available BOOLEAN DEFAULT true
);

CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  table_id UUID REFERENCES tables(id),
  customer_name TEXT,
  customer_phone TEXT,
  party_size INT,
  date DATE,
  time TIME,
  location_pref TEXT,
  notes TEXT,
  status TEXT DEFAULT 'confermata',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  reservation_id UUID REFERENCES reservations(id),
  table_number INT,
  items JSONB NOT NULL DEFAULT '[]',
  total DECIMAL(8,2) DEFAULT 0,
  status TEXT DEFAULT 'in_attesa',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  call_sid TEXT UNIQUE,
  transcript TEXT,
  intent TEXT,
  action_taken JSONB DEFAULT '{}',
  duration_sec INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Dati di esempio per test
INSERT INTO merchants (name, phone, opening_hours, system_prompt)
VALUES (
  'Ristorante Da Mario',
  '+390212345678',
  '{"lun":"12:00-22:00","mar":"12:00-22:00","mer":"12:00-22:00","gio":"12:00-22:00","ven":"12:00-23:00","sab":"12:00-23:00","dom":"12:00-21:00"}',
  'Siamo specializzati in cucina romana tradizionale. Il pesce fresco arriva ogni martedì e venerdì.'
);

-- Tavoli esempio
INSERT INTO tables (merchant_id, table_number, capacity, location)
SELECT id, 1, 2, 'interno' FROM merchants WHERE name = 'Ristorante Da Mario'
UNION ALL
SELECT id, 2, 4, 'interno' FROM merchants WHERE name = 'Ristorante Da Mario'
UNION ALL
SELECT id, 3, 6, 'interno' FROM merchants WHERE name = 'Ristorante Da Mario'
UNION ALL
SELECT id, 4, 2, 'esterno' FROM merchants WHERE name = 'Ristorante Da Mario'
UNION ALL
SELECT id, 5, 4, 'esterno' FROM merchants WHERE name = 'Ristorante Da Mario'
UNION ALL
SELECT id, 6, 8, 'esterno' FROM merchants WHERE name = 'Ristorante Da Mario';

-- Menu esempio
INSERT INTO menu_items (merchant_id, name, category, price, extras)
SELECT id, 'Pizza Margherita', 'pizze', 9.00,
  '[{"name":"mozzarella extra","price":1.50},{"name":"basilico fresco","price":0.50}]'
FROM merchants WHERE name = 'Ristorante Da Mario'
UNION ALL
SELECT id, 'Pizza Diavola', 'pizze', 11.00,
  '[{"name":"mozzarella extra","price":1.50},{"name":"peperoncino extra","price":0.00}]'
FROM merchants WHERE name = 'Ristorante Da Mario'
UNION ALL
SELECT id, 'Tonnarelli Cacio e Pepe', 'primi', 14.00, '[]'
FROM merchants WHERE name = 'Ristorante Da Mario'
UNION ALL
SELECT id, 'Saltimbocca alla Romana', 'secondi', 18.00, '[]'
FROM merchants WHERE name = 'Ristorante Da Mario'
UNION ALL
SELECT id, 'Tiramisù', 'dolci', 6.00, '[]'
FROM merchants WHERE name = 'Ristorante Da Mario';

-- GDPR: cancella trascrizioni dopo 90 giorni
CREATE OR REPLACE FUNCTION gdpr_cleanup()
RETURNS void LANGUAGE sql AS $$
  UPDATE call_logs
  SET transcript = '[eliminato per GDPR]'
  WHERE created_at < now() - INTERVAL '90 days'
    AND transcript != '[eliminato per GDPR]';
$$;
