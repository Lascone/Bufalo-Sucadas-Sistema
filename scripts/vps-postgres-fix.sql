-- Rode NO VPS como superusuário postgres (psql -U postgres)
-- Corrige usuário/senha e permissões para conexão remota do app

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bufalo_app') THEN
    CREATE USER bufalo_app WITH PASSWORD 'BFSucata!2026';
  ELSE
    ALTER USER bufalo_app WITH PASSWORD 'BFSucata!2026';
  END IF;
END
$$;

SELECT 'CREATE DATABASE bufalo_gestor OWNER bufalo_app ENCODING UTF8'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'bufalo_gestor')\gexec

GRANT CONNECT ON DATABASE bufalo_gestor TO bufalo_app;

\c bufalo_gestor

GRANT USAGE, CREATE ON SCHEMA public TO bufalo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO bufalo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bufalo_app;

-- pg_hba.conf precisa permitir senha de IPs externos, ex.:
-- host  bufalo_gestor  bufalo_app  0.0.0.0/0  scram-sha-256
-- Depois: SELECT pg_reload_conf();
