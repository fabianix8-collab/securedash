-- ============================================================================
-- SecureDash - Esquema de Supabase
-- ============================================================================
-- Este esquema soluciona uno de los problemas detectados en la revision
-- critica del proyecto: una base de datos PUBLICA y de ESCRITURA ABIERTA
-- es inaceptable para un proyecto que se presenta como herramienta de
-- seguridad. Row Level Security (RLS) esta habilitado en todas las tablas:
--
--   - LECTURA: publica (anon key), para que el frontend pueda mostrar datos
--     sin necesitar autenticacion (modo demo).
--   - ESCRITURA: SOLO con la service_role key, que vive en el pipeline de
--     Python o en una Edge Function - NUNCA en el frontend/navegador.
--
-- Ejecutar este archivo en: Supabase Dashboard > SQL Editor > New query
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Tabla: alerts
-- Una fila por cada alerta generada por detection_engine.py
-- ----------------------------------------------------------------------------
create table if not exists alerts (
    id              bigint generated always as identity primary key,
    created_at      timestamptz not null default now(),
    detected_at     timestamptz not null,
    level           text not null check (level in ('critical', 'high', 'medium', 'low')),
    title           text not null,
    description     text,
    source_ip       text not null,
    country         text,
    country_code    text,
    mitre_id        text,
    mitre_name      text,
    evidence_count  integer not null default 1,
    resolved        boolean not null default false
);

create index if not exists idx_alerts_level on alerts (level);
create index if not exists idx_alerts_detected_at on alerts (detected_at desc);


-- ----------------------------------------------------------------------------
-- Tabla: attacker_ips
-- Vista agregada por IP, usada en el panel "Top IPs atacantes"
-- ----------------------------------------------------------------------------
create table if not exists attacker_ips (
    ip              text primary key,
    country         text,
    country_code    text,
    attempts        integer not null default 0,
    risk_score      integer not null default 0,
    attack_types    text[] not null default '{}',
    last_seen       timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- Tabla: pipeline_runs
-- Registro de cada ejecucion del pipeline (util para mostrar "ultima
-- actualizacion" en el dashboard y para debugging)
-- ----------------------------------------------------------------------------
create table if not exists pipeline_runs (
    id              bigint generated always as identity primary key,
    run_at          timestamptz not null default now(),
    total_events    integer,
    failed_logins   integer,
    active_alerts   integer,
    unique_ips      integer
);


-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table alerts enable row level security;
alter table attacker_ips enable row level security;
alter table pipeline_runs enable row level security;

-- Lectura publica (modo demo, sin login) - usa la "anon key" del frontend
create policy "Lectura publica de alertas"
    on alerts for select
    using (true);

create policy "Lectura publica de IPs atacantes"
    on attacker_ips for select
    using (true);

create policy "Lectura publica de runs del pipeline"
    on pipeline_runs for select
    using (true);

-- IMPORTANTE: NO se crean policies de INSERT/UPDATE/DELETE para el rol
-- "anon" ni "authenticated". Esto significa que la unica forma de escribir
-- en estas tablas es usando la SERVICE_ROLE KEY, que:
--   - se usa desde pipeline/load_to_supabase.py (un script que corres tu,
--     no el navegador del usuario)
--   - o desde una Supabase Edge Function (entorno de servidor)
--
-- La service_role key NUNCA debe estar en el codigo del frontend ni en
-- ningun repo publico. Se configura como variable de entorno.


-- ----------------------------------------------------------------------------
-- Realtime: permite que el frontend reciba alertas nuevas en vivo via
-- supabase.channel(...).on('postgres_changes', ...)
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table alerts;
alter publication supabase_realtime add table attacker_ips;
