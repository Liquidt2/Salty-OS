-- ═══════════════════════════════════════════
-- PostgreSQL Init — Create Salty OS database
-- Runs automatically on first container start
-- ═══════════════════════════════════════════

-- Salty OS database
CREATE DATABASE saltyos;
CREATE USER salty WITH ENCRYPTED PASSWORD 'saltyos_secret';
GRANT ALL PRIVILEGES ON DATABASE saltyos TO salty;
ALTER DATABASE saltyos OWNER TO salty;

-- Grant schema permissions
\c saltyos
GRANT ALL ON SCHEMA public TO salty;
