-- =====================================================================
-- FIUL · Etapa 1 · Esquema de la base de datos (Supabase / Postgres)
-- Versión 1 · 07/10/2026
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar todo → Run.
-- Se puede correr una sola vez sobre un proyecto vacío.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Quién es coach
--    Tabla técnica de una sola fila (Juanba). Las reglas de seguridad
--    la usan para saber quién puede ver y editar todo.
-- ---------------------------------------------------------------------
create table public.coaches (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null,
  created_at timestamptz not null default now()
);

create or replace function public.es_coach()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.coaches where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- 1. alimentos — base única (Molifit, FitProtein, suplementos y nuevos)
-- ---------------------------------------------------------------------
create table public.alimentos (
  id                  bigint generated always as identity primary key,
  nombre              text not null,
  proveedor           text not null check (proveedor in ('Molifit','FitProtein','Suplementos','Otro')),
  categoria           text not null check (categoria in
                        ('proteina','guarnicion','grasa','desayuno_te','postre','suplemento','snack')),
  porcion_g           numeric(8,2) check (porcion_g > 0),
  porcion_descripcion text,                 -- ej. "1/4 de torta", "1 unidad"
  porcion_fija        boolean not null default false, -- true = vianda Molifit de 200 g, no se fracciona
  estado              text not null check (estado in ('cocido','crudo','listo_para_consumir')),
  kcal                numeric(8,2) not null check (kcal >= 0),
  proteina_g          numeric(8,2) not null check (proteina_g >= 0),
  carbohidratos_g     numeric(8,2) not null check (carbohidratos_g >= 0),
  grasas_g            numeric(8,2) not null check (grasas_g >= 0),
  fibra_g             numeric(8,2) check (fibra_g >= 0),
  sodio_mg            numeric(8,2) check (sodio_mg >= 0),
  calcio_mg           numeric(8,2) check (calcio_mg >= 0),
  hierro_mg           numeric(8,2) check (hierro_mg >= 0),
  vit_a_ug            numeric(8,2) check (vit_a_ug >= 0),
  vit_c_mg            numeric(8,2) check (vit_c_mg >= 0),
  vit_b6_mg           numeric(8,2) check (vit_b6_mg >= 0),
  vit_b12_ug          numeric(8,2) check (vit_b12_ug >= 0),
  precio_ars          numeric(12,2) check (precio_ars > 0),  -- null = precio todavía no definido
  grupo_ais           text check (grupo_ais in ('A','B')),   -- solo suplementos; C y D excluidos por protocolo
  -- Fuente obligatoria: una fila sin fuente no se puede guardar.
  fuente              text not null check (fuente in ('Nutrinfo','Rotulo','Open Food Facts')),
  fuente_detalle      text not null check (length(trim(fuente_detalle)) > 0), -- ej. "Rótulo Fargo, foto 05/10/2026"
  fecha_carga         date not null default current_date,
  activo              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (proveedor, nombre),
  -- los suplementos llevan grupo AIS; el resto no
  check ((categoria = 'suplemento') = (grupo_ais is not null)),
  -- la porción tiene que estar en gramos o descrita
  check (porcion_g is not null or porcion_descripcion is not null)
);

-- Control de calidad: kcal declaradas vs. 4·P + 4·C + 9·G (+ 2·fibra).
-- No bloquea la carga; muestra qué filas revisar.
create view public.alimentos_control
with (security_invoker = true) as
select id, nombre, proveedor, kcal,
       round(4*proteina_g + 4*carbohidratos_g + 9*grasas_g + 2*coalesce(fibra_g,0), 1) as kcal_calculadas,
       round(kcal - (4*proteina_g + 4*carbohidratos_g + 9*grasas_g + 2*coalesce(fibra_g,0)), 1) as diferencia,
       precio_ars is null as sin_precio
from public.alimentos
where activo;

-- ---------------------------------------------------------------------
-- 2. clientes
-- ---------------------------------------------------------------------
create table public.clientes (
  id                      bigint generated always as identity primary key,
  user_id                 uuid unique references auth.users(id) on delete set null, -- se completa cuando crea su cuenta
  nombre                  text not null,
  email                   text not null unique,
  fecha_alta              date not null default current_date,
  objetivo                text,
  fase_actual             text,
  servicio                text check (servicio in ('Progressive Plan','Energy Masterplan','Piloto')),
  consentimiento_version  text,          -- versión del texto aceptado
  consentimiento_at       timestamptz,   -- cuándo lo aceptó (Ley 25.326, art. 5)
  activo                  boolean not null default true,
  created_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. mediciones — una fila por antropometría ISAK
-- ---------------------------------------------------------------------
create table public.mediciones (
  id               bigint generated always as identity primary key,
  cliente_id       bigint not null references public.clientes(id) on delete cascade,
  fecha            date not null,
  numero           int not null check (numero > 0),   -- 1ª, 2ª, 3ª medición...
  peso_kg          numeric(5,2) not null,
  talla_cm         numeric(5,1),
  pliegues_mm      jsonb not null default '{}',  -- {"triceps": 12.5, "subescapular": 14, ...}
  perimetros_cm    jsonb not null default '{}',
  diametros_cm     jsonb not null default '{}',
  -- Fraccionamiento en 5 masas (Kerr), en kg
  masa_adiposa_kg  numeric(5,2),
  masa_muscular_kg numeric(5,2),
  masa_osea_kg     numeric(5,2),
  masa_piel_kg     numeric(5,2),
  masa_residual_kg numeric(5,2),
  notas            text,
  created_at       timestamptz not null default now(),
  unique (cliente_id, numero)
);

-- ---------------------------------------------------------------------
-- 4. planes — plan vigente de cada cliente
-- ---------------------------------------------------------------------
create table public.planes (
  id                    bigint generated always as identity primary key,
  cliente_id            bigint not null references public.clientes(id) on delete cascade,
  nombre                text not null,               -- ej. "Plan Hiperproteico Oct 2026"
  kcal_objetivo         int not null,
  proteina_objetivo_g   int not null,
  carbohidratos_objetivo_g int,
  grasas_objetivo_g     int,
  fibra_objetivo_g      int,
  tipos_dia             jsonb not null default '[]', -- [{"tipo":"entreno","dias":["lun","mie","vie"]}, ...]
  bloques               jsonb not null default '{}', -- bloques por comida y por tipo de día
  vigente_desde         date not null default current_date,
  vigente_hasta         date,
  activo                boolean not null default true,
  created_at            timestamptz not null default now()
);
-- un solo plan activo por cliente
create unique index planes_un_activo_por_cliente on public.planes (cliente_id) where activo;

-- ---------------------------------------------------------------------
-- 5. intercambios — qué alimento cuenta como bloque y cuántos gramos
--    plan_id vacío = intercambio general; con plan_id = solo para ese plan
-- ---------------------------------------------------------------------
create table public.intercambios (
  id                bigint generated always as identity primary key,
  alimento_id       bigint not null references public.alimentos(id) on delete restrict,
  plan_id           bigint references public.planes(id) on delete cascade,
  tipo_bloque       text not null check (tipo_bloque in ('proteina','hidrato','grasa','fruta','lacteo')),
  gramos_por_bloque numeric(7,2) not null check (gramos_por_bloque > 0),
  uso               text not null default 'base' check (uso in ('base','ocasional','finde')),
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. registros_diarios — lo que el cliente marca cada día
-- ---------------------------------------------------------------------
create table public.registros_diarios (
  id                 bigint generated always as identity primary key,
  cliente_id         bigint not null references public.clientes(id) on delete cascade,
  plan_id            bigint references public.planes(id) on delete set null,
  fecha              date not null,
  bloques            jsonb not null default '{}',  -- {"proteina": 5, "hidrato": 4, ...} consumidos
  porciones_hidratos numeric(4,1),
  aceite_cdas        numeric(4,1),
  detalle            text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (cliente_id, fecha)
);

-- ---------------------------------------------------------------------
-- 7. archivos — informes PDF y análisis (el archivo vive en Storage)
-- ---------------------------------------------------------------------
create table public.archivos (
  id           bigint generated always as identity primary key,
  cliente_id   bigint not null references public.clientes(id) on delete cascade,
  tipo         text not null check (tipo in ('informe_antropometria','analisis_sangre','plan','otro')),
  fecha        date not null default current_date,
  storage_path text not null,   -- "<cliente_id>/<nombre>.pdf" dentro del bucket "archivos"
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.tocar_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger alimentos_updated before update on public.alimentos
  for each row execute function public.tocar_updated_at();
create trigger registros_updated before update on public.registros_diarios
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------
-- Ayudante: id del cliente que está logueado
-- ---------------------------------------------------------------------
create or replace function public.mi_cliente_id()
returns bigint
language sql stable security definer set search_path = public
as $$
  select id from public.clientes where user_id = auth.uid();
$$;

-- El cliente acepta el consentimiento solo a través de esta función
-- (no puede editar el resto de su ficha).
create or replace function public.aceptar_consentimiento(version text)
returns void
language sql security definer set search_path = public
as $$
  update public.clientes
     set consentimiento_version = version, consentimiento_at = now()
   where user_id = auth.uid();
$$;

-- Al crear la cuenta, se vincula con la ficha que Juanba cargó con ese email.
create or replace function public.vincular_cliente()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.clientes set user_id = new.id
   where lower(email) = lower(new.email) and user_id is null;
  return new;
end; $$;

create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.vincular_cliente();

-- =====================================================================
-- REGLAS DE SEGURIDAD (Row Level Security)
-- Cada cliente ve solo lo suyo; el coach ve y edita todo.
-- =====================================================================
alter table public.coaches            enable row level security;
alter table public.alimentos          enable row level security;
alter table public.clientes           enable row level security;
alter table public.mediciones         enable row level security;
alter table public.planes             enable row level security;
alter table public.intercambios       enable row level security;
alter table public.registros_diarios  enable row level security;
alter table public.archivos           enable row level security;

-- coaches: solo el coach la ve; nadie la edita desde la app
create policy coaches_select on public.coaches for select to authenticated
  using (public.es_coach());

-- alimentos e intercambios: cualquier usuario logueado los lee; solo el coach edita
create policy alimentos_select on public.alimentos for select to authenticated using (true);
create policy alimentos_coach  on public.alimentos for all    to authenticated
  using (public.es_coach()) with check (public.es_coach());

create policy intercambios_select on public.intercambios for select to authenticated using (true);
create policy intercambios_coach  on public.intercambios for all    to authenticated
  using (public.es_coach()) with check (public.es_coach());

-- clientes: cada uno ve su ficha; solo el coach la crea o edita
create policy clientes_select on public.clientes for select to authenticated
  using (user_id = auth.uid() or public.es_coach());
create policy clientes_coach  on public.clientes for all to authenticated
  using (public.es_coach()) with check (public.es_coach());

-- mediciones, planes, archivos: el cliente lee lo suyo; solo el coach escribe
create policy mediciones_select on public.mediciones for select to authenticated
  using (cliente_id = public.mi_cliente_id() or public.es_coach());
create policy mediciones_coach  on public.mediciones for all to authenticated
  using (public.es_coach()) with check (public.es_coach());

create policy planes_select on public.planes for select to authenticated
  using (cliente_id = public.mi_cliente_id() or public.es_coach());
create policy planes_coach  on public.planes for all to authenticated
  using (public.es_coach()) with check (public.es_coach());

create policy archivos_select on public.archivos for select to authenticated
  using (cliente_id = public.mi_cliente_id() or public.es_coach());
create policy archivos_coach  on public.archivos for all to authenticated
  using (public.es_coach()) with check (public.es_coach());

-- registros_diarios: el cliente lee y escribe solo los suyos; el coach todo
create policy registros_select on public.registros_diarios for select to authenticated
  using (cliente_id = public.mi_cliente_id() or public.es_coach());
create policy registros_insert on public.registros_diarios for insert to authenticated
  with check (cliente_id = public.mi_cliente_id() or public.es_coach());
create policy registros_update on public.registros_diarios for update to authenticated
  using (cliente_id = public.mi_cliente_id() or public.es_coach())
  with check (cliente_id = public.mi_cliente_id() or public.es_coach());
create policy registros_delete on public.registros_diarios for delete to authenticated
  using (public.es_coach());

-- Permisos de tablas (el proyecto se creó con "Automatically expose new tables"
-- desactivado: cada tabla se habilita a mano y solo para usuarios logueados;
-- las reglas de arriba deciden qué filas ve cada uno). Nada para "anon".
grant select, insert, update, delete on
  public.alimentos, public.clientes, public.mediciones, public.planes,
  public.intercambios, public.registros_diarios, public.archivos
  to authenticated;
grant select on public.coaches, public.alimentos_control to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Las funciones ayudantes solo para usuarios logueados
revoke execute on function public.es_coach(), public.mi_cliente_id(),
  public.aceptar_consentimiento(text) from public, anon;
grant  execute on function public.es_coach(), public.mi_cliente_id(),
  public.aceptar_consentimiento(text) to authenticated;
revoke execute on function public.vincular_cliente() from public, anon, authenticated;

-- =====================================================================
-- STORAGE: bucket privado "archivos"
-- Ruta de cada archivo: "<cliente_id>/<nombre>.pdf"
-- =====================================================================
insert into storage.buckets (id, name, public) values ('archivos', 'archivos', false);

create policy archivos_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'archivos'
         and ((storage.foldername(name))[1] = public.mi_cliente_id()::text or public.es_coach()));
create policy archivos_storage_coach on storage.objects for all to authenticated
  using (bucket_id = 'archivos' and public.es_coach())
  with check (bucket_id = 'archivos' and public.es_coach());
