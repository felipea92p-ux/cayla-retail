-- ============================================================================
-- 20260928140000_clientas_version_y_archivo.sql — CAYLA V2 · Clientas, paso 2 del acta (parte 1/5)
--
-- «LA FICHA DE CLIENTA SE PUEDE EDITAR, ARCHIVAR, ANONIMIZAR Y UNIR» — hasta hoy `retail.clientas`
-- (20260922140000, D-76/D-77) solo tenía alta (`registrar_clienta`, upsert por DNI) y búsqueda
-- (`buscar_clienta`). No existía ninguna función para EDITAR una ficha ya creada — lo que el
-- BACKLOG («Ficha de clienta: no hay candado que agregar todavía», 2026-09-25) señaló al revisar
-- el pedido de Felipe de blindar la ficha contra dos ediciones a la vez: no había nada que candar
-- porque la edición ni existía.
--
-- QUÉ DECIDE. `docs/datos/DECISIONES-2026-09-26-clientas.md`, sección H, paso 2: «Ficha y lista:
-- buscar, talla deducida, cumpleaños, compras, cambios y devoluciones, "te falta N para
-- frecuente", editar, unir fichas, anonimizar». D-99 (misma acta): puede haber dos fichas de la
-- misma clienta —primero con celular, después con DNI— y hace falta poder unirlas.
--
-- LA OBJECIÓN (parte que decide el arquitecto, con la razón en 3 líneas — protocolo global). El
-- encargo pedía candado optimista con «columna `updated_at` + trigger». Este archivo usa
-- `version integer` en su lugar, reusando el trigger `fn_subir_version()` que YA existe
-- (20260924160000_edicion_simultanea_con_version.sql, ADR-0193 — `productos.version` y
-- `roles.version`), no uno nuevo con `updated_at`.
-- DECIDÍ: reusar `version` + `fn_subir_version()` + el errcode `PT409` que la web YA traduce
--   (`apps/web/lib/error-escritura.ts`: `esVersionCambiada`, `CODIGO_VERSION_CAMBIADA`) y que
--   `ProductoForm.tsx`/`roles-acciones.ts` ya saben mostrar («Otra persona cambió esto mientras lo
--   editabas. Recarga para ver sus cambios» + botón Recargar).
-- DESCARTÉ: un segundo mecanismo con `updated_at` — mismo problema, misma garantía (rechaza si
--   cambió), resuelto DOS VECES de dos formas distintas en el mismo sistema. Es exactamente lo que
--   la integridad conceptual (Brooks, CLAUDE.md) prohíbe: la próxima persona que edite una ficha
--   con candado optimista no sabría cuál de los dos patrones copiar.
-- SE ROMPE SI: alguna vez `fn_subir_version()` deja de ser genérica (hoy vive sin prefijo de tabla
--   a propósito, para cualquier tabla que la necesite) — hoy no hay indicio de eso.
--
-- QUÉ CAMBIA.
--   1. `retail.clientas.version integer not null default 1` + disparador `clientas_version_bu`
--      (reusa `fn_subir_version()`, sin crear una función nueva — antes de agregar, se mira qué ya
--      resuelve esto, CLAUDE.md principio 7).
--   2. Archivar/anonimizar, NUNCA `delete` (CLAUDE.md, «nunca borres datos»): mismo patrón ya
--      usado por `retail.series_comprobantes` (20260922234100) y `retail.cuentas_dinero`
--      (20260925110000) — `archivada_en` + `archivada_por` + `motivo_archivo`, con el motivo
--      exigido por un CHECK, no por la pantalla (Lamport: el estado imposible lo impide el
--      esquema). `anonimizada boolean`: además de archivada, sin ningún dato personal — Ley
--      29733, `docs/datos/06-DATOS-PERSONALES.md` §7 («se anonimiza el dato, se conserva el
--      documento»). `fusionada_en_id`: cuando esta ficha se unió a otra (D-99).
--   3. Tabla `retail.clientas_fusiones` (append-only, sin política de UPDATE/DELETE): el rastro de
--      cada fusión — la ficha perdedora completa ANTES de anonimizarla, y cuántas ventas,
--      separaciones y pedidos se movieron. No hay «deshacer» automático (unir es irreversible por
--      diseño: dos fichas fusionadas vuelven a ser una sola persona), pero con este snapshot se
--      puede reconstruir a mano si una fusión fue un error — es la respuesta a «¿qué pasa si se
--      unen mal?» que pide el encargo.
--
-- ESTADOS IMPOSIBLES QUE EL ESQUEMA DEJA DE PERMITIR (no el código, Lamport):
--   - Una ficha `anonimizada` sin estar `archivada` (`clientas_anonimizada_implica_archivada`).
--   - Una ficha `anonimizada` que todavía muestre DNI, nombre, WhatsApp, cumpleaños o tallas
--     (`clientas_anonimizada_sin_datos_personales`) — anonimizar a medias no es anonimizar.
--   - Una ficha `archivada_en` sin motivo (`clientas_archivada_tiene_motivo`) — «se archivó sola»
--     no es una respuesta que se le pueda dar a nadie que pregunte por qué.
--   - Una ficha que se fusiona consigo misma (`clientas_fusionada_no_a_si_misma`).
--
-- CONCURRENCIA. Ver LA OBJECIÓN arriba: `version` + `fn_subir_version()` (ya reusado por
-- `productos`/`roles`) hacen exactamente lo que pide el encargo — la función de editar (parte 3
-- de esta ronda) recibe `p_version_esperada` y rechaza con PT409 si cambió entre medio.
--
-- CAÍDA EXTERNA. Esta migración no toca ninguna integración externa (SUNAT/Lucode, padrón,
-- WhatsApp): es solo esquema de `retail.clientas`.
--
-- IDEMPOTENTE: `add column if not exists`, `create table if not exists`, `drop constraint if
-- exists` + `add constraint`, `create or replace trigger` (nunca `drop trigger`, CLAUDE.md —
-- deadlock con el Asesor de seguridad, ADR-0195).
--
-- PRODUCCIÓN: pegar con el prefijo `retail.` en cada tabla o `set search_path` (ya lo trae). Sin
-- políticas nuevas en esta parte — no hace falta partir en más piezas por el candado de
-- ADR-0195 (esa regla es solo para NO mezclar `alter table` de una tabla EN USO con `create
-- policy` en la misma transacción; acá no hay `create policy`, se agrega en la parte 5).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. version (ADR-0193, reusando fn_subir_version()) ----------

alter table retail.clientas add column if not exists version integer not null default 1;

comment on column retail.clientas.version is
  'ADR-0193 reusado: sube en cada escritura de la fila (disparador clientas_version_bu, misma función que productos/roles). editar_clienta/unir_clientas la reciben como p_version_esperada y rechazan (PT409) si cambió — «alguien más editó esta ficha, vuelve a cargarla».';

create or replace trigger clientas_version_bu before update on retail.clientas
  for each row execute function retail.fn_subir_version();

-- ---------- 2. archivar / anonimizar / fusionar (nunca delete) ----------

alter table retail.clientas add column if not exists archivada_en timestamptz;
alter table retail.clientas add column if not exists archivada_por uuid references public.personas (id);
alter table retail.clientas add column if not exists motivo_archivo text;
alter table retail.clientas add column if not exists anonimizada boolean not null default false;
alter table retail.clientas add column if not exists fusionada_en_id uuid references retail.clientas (id);

comment on column retail.clientas.archivada_en is 'Cuándo se archivó (o se anonimizó, o se fusionó en otra: las tres formas de "ya no está activa" comparten esta columna). NULL = ficha activa. Nunca se borra una fila (CLAUDE.md).';
comment on column retail.clientas.motivo_archivo is 'Por qué se archivó — exigido por clientas_archivada_tiene_motivo si archivada_en no es NULL.';
comment on column retail.clientas.anonimizada is 'true = además de archivada, sin ningún dato personal (Ley 29733 o fusión). clientas_anonimizada_sin_datos_personales exige que en ese caso dni/nombre/telefono/consentimiento/cumpleaños/tallas estén todos NULL.';
comment on column retail.clientas.fusionada_en_id is 'Si esta ficha perdió una fusión (unir_clientas), la ficha que quedó. Ver retail.clientas_fusiones para el snapshot completo de antes de fusionar.';

alter table retail.clientas drop constraint if exists clientas_archivada_tiene_motivo;
alter table retail.clientas add constraint clientas_archivada_tiene_motivo
  check (archivada_en is null or nullif(btrim(motivo_archivo), '') is not null);

alter table retail.clientas drop constraint if exists clientas_anonimizada_implica_archivada;
alter table retail.clientas add constraint clientas_anonimizada_implica_archivada
  check (not anonimizada or archivada_en is not null);

-- El nombre entra en el CHECK como el placeholder EXACTO, no "no nulo": una fila anonimizada con
-- cualquier otro texto en `nombre` (un `update` suelto que se cuele, o un futuro editar_clienta
-- con un candado más flojo) es exactamente el estado imposible que esto existe para impedir — se
-- encontró probando esta migración de verdad (un UPDATE directo a `nombre` en una fila
-- `anonimizada` pasaba sin error hasta que este CHECK incluyó la comparación exacta).
--
-- `coalesce(nombre, '')`, NUNCA `nombre = '...'` a secas — SEGUNDO hallazgo probando esto de
-- verdad, en el navegador con sesión real: un CHECK con `nombre is null` deja la expresión
-- `nombre = 'Clienta anonimizada'` en NULL (ni true ni false, lógica de tres valores de SQL), y
-- Postgres considera SATISFECHO un CHECK que da NULL — no solo el que da true. `unir_clientas`
-- ponía `nombre = null` al anonimizar a la ficha perdedora y este CHECK lo dejaba pasar en
-- silencio: exactamente el estado imposible que se creyó cerrado la primera vez.
alter table retail.clientas drop constraint if exists clientas_anonimizada_sin_datos_personales;
alter table retail.clientas add constraint clientas_anonimizada_sin_datos_personales
  check (
    not anonimizada
    or (dni is null and telefono_whatsapp is null and whatsapp_consentimiento_en is null
        and cumple_dia is null and cumple_mes is null and tallas is null
        and coalesce(nombre, '') = 'Clienta anonimizada')
  );

alter table retail.clientas drop constraint if exists clientas_fusionada_no_a_si_misma;
alter table retail.clientas add constraint clientas_fusionada_no_a_si_misma
  check (fusionada_en_id is null or fusionada_en_id <> id);

-- Las fichas activas primero, y las archivadas después: `getClientas`/la pantalla listan
-- `where archivada_en is null` por defecto.
create index if not exists clientas_archivada_en_idx on retail.clientas (archivada_en);

-- ---------- 3. el rastro de cada fusión (append-only, D-99) ----------

create table if not exists retail.clientas_fusiones (
  id uuid primary key default gen_random_uuid(),
  clienta_mantiene_id uuid not null references retail.clientas (id),
  clienta_fusionada_id uuid not null references retail.clientas (id),
  -- La ficha perdedora COMPLETA, tal como estaba justo antes de anonimizarla (to_jsonb de la fila
  -- entera): sin esto, "unir mal" no tendría con qué reconstruirse a mano — deshacer no existe.
  ficha_fusionada jsonb not null,
  ventas_movidas integer not null default 0,
  separaciones_movidas integer not null default 0,
  pedidos_movidos integer not null default 0,
  fusionada_por uuid references public.personas (id),
  fusionada_en timestamptz not null default now(),
  constraint clientas_fusiones_no_a_si_misma check (clienta_mantiene_id <> clienta_fusionada_id)
);

comment on table retail.clientas_fusiones is 'D-99: rastro append-only de cada "unir fichas". Nunca se edita ni se borra — igual que movimientos. ficha_fusionada guarda la fila perdedora completa antes de anonimizarla, para poder reconstruir a mano si la fusión fue un error (no hay deshacer automático).';

create index if not exists clientas_fusiones_mantiene_idx on retail.clientas_fusiones (clienta_mantiene_id);
create index if not exists clientas_fusiones_fusionada_idx on retail.clientas_fusiones (clienta_fusionada_id);

alter table retail.clientas_fusiones enable row level security;

drop policy if exists clientas_fusiones_select on retail.clientas_fusiones;
create policy clientas_fusiones_select on retail.clientas_fusiones
  for select using (auth.role() = 'authenticated');

-- Sin política de INSERT/UPDATE/DELETE: solo `unir_clientas` (security definer, parte 4) escribe
-- acá — mismo patrón que `clientas` mismo (solo SELECT por RLS, escritura exclusiva por RPC).
