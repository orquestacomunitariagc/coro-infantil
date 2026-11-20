-- Esquema de la base de datos para las inscripciones al Coro Infantil OCGC.
-- Ejecutar en el SQL Editor del proyecto de Supabase.
--
-- Resumen de permisos:
--   * anon (formulario público): solo INSERT.
--   * authenticated (panel de administración): SELECT.
--   * No hay UPDATE ni DELETE desde el cliente.

create table if not exists public.inscripciones_coro_infantil (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Bloque 1: adulto responsable
  guardian_name text not null,
  guardian_relationship text not null,
  guardian_phone text not null,
  guardian_email text not null,
  emergency_phone text,

  -- Segundo progenitor o tutor/a legal (solo si la familia es de dos progenitores)
  guardian2_name text,
  guardian2_relationship text,
  guardian2_phone text,
  guardian2_email text,

  -- Bloque 2: aspirante
  child_name text not null,
  birth_date date not null,
  child_age int not null check (child_age between 1 and 18),
  choir_experience boolean not null,
  musical_background text not null,
  medical_notes text,

  -- Bloque 3: disponibilidad
  audition_slot text not null,
  rehearsal_availability text not null,

  -- Bloque 4: autorizaciones
  authorization_accepted boolean not null,
  data_protection_accepted boolean not null
);

comment on table public.inscripciones_coro_infantil is
  'Inscripciones a las pruebas de acceso del Coro Infantil OCGC (El Señor de los Anillos).';

-- Columnas del segundo progenitor o tutor legal (se añadieron después de la
-- creación inicial de la tabla). Es seguro ejecutar esta sentencia siempre.
alter table public.inscripciones_coro_infantil
  add column if not exists guardian2_name text,
  add column if not exists guardian2_relationship text,
  add column if not exists guardian2_phone text,
  add column if not exists guardian2_email text;

create index if not exists inscripciones_coro_infantil_created_at_idx
  on public.inscripciones_coro_infantil (created_at desc);

alter table public.inscripciones_coro_infantil enable row level security;

-- El formulario público solo puede insertar.
drop policy if exists "anon inserta inscripciones" on public.inscripciones_coro_infantil;
create policy "anon inserta inscripciones"
  on public.inscripciones_coro_infantil
  for insert
  to anon
  with check (true);

-- Red de seguridad: si alguien envía el formulario con una sesión de
-- administración abierta en el mismo navegador, la inserción también se
-- permite. El formulario público, además, se crea sin persistir sesión.
drop policy if exists "usuarios autenticados insertan inscripciones" on public.inscripciones_coro_infantil;
create policy "usuarios autenticados insertan inscripciones"
  on public.inscripciones_coro_infantil
  for insert
  to authenticated
  with check (true);

-- El panel, una vez autenticado, puede leer.
drop policy if exists "usuarios autenticados leen inscripciones" on public.inscripciones_coro_infantil;
create policy "usuarios autenticados leen inscripciones"
  on public.inscripciones_coro_infantil
  for select
  to authenticated
  using (true);
