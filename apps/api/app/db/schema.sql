CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS stations (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(120),
    brand VARCHAR(120),
    address VARCHAR(255) NOT NULL,
    city VARCHAR(120) NOT NULL,
    postal_code VARCHAR(10) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    services TEXT,
    geom GEOGRAPHY(POINT, 4326) NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stations_city ON stations (city);
CREATE INDEX IF NOT EXISTS idx_stations_postal_code ON stations (postal_code);
CREATE INDEX IF NOT EXISTS idx_stations_geom ON stations USING GIST (geom);

CREATE TABLE IF NOT EXISTS fuel_prices (
    id BIGSERIAL PRIMARY KEY,
    station_id VARCHAR(32) NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    fuel_type VARCHAR(16) NOT NULL,
    price NUMERIC(6, 3) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    UNIQUE (station_id, fuel_type)
);

CREATE INDEX IF NOT EXISTS idx_fuel_prices_type ON fuel_prices (fuel_type);
CREATE INDEX IF NOT EXISTS idx_fuel_prices_station ON fuel_prices (station_id);

CREATE OR REPLACE VIEW station_prices AS
SELECT
    s.id AS station_id,
    s.brand,
    s.name,
    s.address,
    s.city,
    s.postal_code,
    s.latitude,
    s.longitude,
    fp.fuel_type,
    fp.price,
    fp.updated_at
FROM stations s
JOIN fuel_prices fp ON fp.station_id = s.id;
