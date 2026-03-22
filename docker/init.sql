-- Schema
CREATE TABLE IF NOT EXISTS scratched (
  id         SERIAL PRIMARY KEY,
  map_type   VARCHAR(50)   NOT NULL,
  code       VARCHAR(10)   NOT NULL,
  year       VARCHAR(10)   NOT NULL DEFAULT '',
  url        VARCHAR(1024) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_map_code UNIQUE (map_type, code)
);

-- Sample world data
INSERT INTO scratched (map_type, code, year, url) VALUES
  ('world', 'DE', '2019', 'https://photos.example.com/germany'),
  ('world', 'FR', '2021', 'https://photos.example.com/france'),
  ('world', 'JP', '2022', 'https://photos.example.com/japan'),
  ('world', 'US', '2018', ''),
  ('world', 'CA', '2020', ''),
  ('world', 'AU', '2023', 'https://photos.example.com/australia'),
  ('world', 'IT', '2021', ''),
  ('world', 'ES', '2022', 'https://photos.example.com/spain'),
  ('world', 'PT', '2023', ''),
  ('world', 'NL', '2019', ''),

-- Sample US states data
  ('united-states-of-america', 'CA', '2018', ''),
  ('united-states-of-america', 'NY', '2017', 'https://photos.example.com/new-york'),
  ('united-states-of-america', 'TX', '2019', ''),
  ('united-states-of-america', 'FL', '2020', ''),
  ('united-states-of-america', 'WA', '2021', ''),

-- Sample France regions
  ('france', 'IDF', '2021', 'https://photos.example.com/paris'),
  ('france', 'PAC', '2022', ''),
  ('france', 'OCC', '2021', ''),

-- Sample Germany states
  ('germany', 'BY', '2019', ''),
  ('germany', 'BE', '2019', 'https://photos.example.com/berlin'),
  ('germany', 'HH', '2020', '');
