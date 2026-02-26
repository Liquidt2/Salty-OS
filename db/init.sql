-- ═══════════════════════════════════════════
-- PostgreSQL Init — Create all databases
-- Runs automatically on first container start
-- ═══════════════════════════════════════════

-- Salty OS database
CREATE DATABASE saltyos;
CREATE USER salty WITH ENCRYPTED PASSWORD 'saltyos_secret';
GRANT ALL PRIVILEGES ON DATABASE saltyos TO salty;
ALTER DATABASE saltyos OWNER TO salty;

-- n8n database
CREATE DATABASE n8n;
CREATE USER n8n_user WITH ENCRYPTED PASSWORD 'n8n_secret';
GRANT ALL PRIVILEGES ON DATABASE n8n TO n8n_user;
ALTER DATABASE n8n OWNER TO n8n_user;

-- Postiz database
CREATE DATABASE postiz;
CREATE USER postiz_user WITH ENCRYPTED PASSWORD 'postiz_secret';
GRANT ALL PRIVILEGES ON DATABASE postiz TO postiz_user;
ALTER DATABASE postiz OWNER TO postiz_user;

-- Agent Zero database (available if needed)
CREATE DATABASE agent_zero;
CREATE USER agent_zero_user WITH ENCRYPTED PASSWORD 'agentzero_secret';
GRANT ALL PRIVILEGES ON DATABASE agent_zero TO agent_zero_user;
ALTER DATABASE agent_zero OWNER TO agent_zero_user;

-- Grant schema permissions (PostgreSQL 15+ requires this)
\c saltyos
GRANT ALL ON SCHEMA public TO salty;

\c n8n
GRANT ALL ON SCHEMA public TO n8n_user;

\c postiz
GRANT ALL ON SCHEMA public TO postiz_user;

\c agent_zero
GRANT ALL ON SCHEMA public TO agent_zero_user;
