-- ============================================================================
-- 20260922160000_cotizaciones_maquila.sql — CAYLA V2
--
-- QUÉ DECIDE. D-82, `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`: «la otra mitad de
-- D-31, hoy sin dónde guardarse» → una cotización de maquila externa por tipo de prenda, con
-- fecha, que se renueva cada ~6 meses y el sistema avisa cuando vence. D-31 (Felipe,
-- `docs/datos/DECISIONES-2026-09-12.md`) fue tajante desde el principio: el Taller se mide
-- comparando su costo real contra lo que cobraría un taller externo — **nunca contra un
-- precio que Felipe invente**. Hoy no existe tabla ni pantalla para guardar esa cotización.
--
-- ⚠️ CONTRADICCIÓN VISTA EN EL REPO, SIN RESOLVER — se la dejo a Felipe, no la toco yo: el
-- mismo día (2026-09-21), DOS documentos dicen cosas opuestas y ninguno quedó marcado como
-- el vigente:
--   · `docs/datos/DECISIONES-2026-09-12.md` (commit 44ee0b30, 11:28) agrega una «Enmienda
--     (2026-09-22, Felipe)» a D-31: «se descarta: no se registra ninguna cotización».
--   · `docs/PLAN-PRODUCCION.md` (mismo commit 44ee0b30) marca D-E «⛔ Descartada por Felipe
--     (2026-09-22): "no sería necesario registrar cuánto cobraría un taller externo"».
--   · `docs/datos/DECISIONES-2026-09-21-menu-comercial.md` (commit 42c736f7, 21:26 — DIEZ
--     HORAS DESPUÉS del mismo día, y ancestro-descendiente directo del anterior en git log)
--     vuelve a decidir D-82 en sentido contrario, nombrando explícitamente que D-31 «hoy» (a
--     esa hora) sigue sin dónde guardar esa cotización — es decir, ya sabía de la enmienda y
--     la revirtió.
-- La fecha más reciente en git (D-82) es la que ejecuta esta migración, tal como me la dio
-- la tarea. Pero `DECISIONES-2026-09-12.md` y `PLAN-PRODUCCION.md` (D-E) siguen diciendo
-- «descartada» sin apuntar a D-82 — quien los lea sin cruzar los tres archivos se confunde.
-- No edito esos dos archivos calientes (otras sesiones los tocan hoy mismo, CLAUDE.md regla
-- de «revisa git log antes de tocar un archivo caliente»); lo dejo para que Felipe lo cierre.
--
-- QUIÉN Y CUÁNDO. Escrita 2026-09-22 (D-82, ronda de 60 preguntas, decisiones D-53 a D-91).
--
-- QUÉ CAMBIA.
--   1. Tabla `retail.cotizaciones_maquila`: una fila = una cotización real que un taller
--      externo dio para maquilar un tipo de prenda, con vigencia. NUNCA se edita para
--      "renovar" — renovar es insertar una fila nueva con fecha más reciente; así queda el
--      historial completo de cómo se movió el precio de mercado (mismo principio que
--      `movimientos`: append-only, el snapshot vigente se calcula al leer, nunca se
--      sobrescribe un hecho pasado).
--   2. RPC `retail.fn_cotizacion_maquila_vigente(p_categoria_id uuid)`: la cotización vigente
--      (la más reciente que no venció) para una categoría, o null si no hay ninguna — nunca
--      inventa un valor. La usará D-80 («ingreso simulado» del Taller = prendas despachadas
--      × esta cotización) cuando esa pieza se construya; hoy no la llama nadie todavía.
--   3. Pantalla `/produccion/cotizaciones-maquila` (líder, F3 de esta tarea): cargar/renovar
--      cotizaciones y ver un aviso cuando la vigente está por vencer o ya venció. Sin
--      enganchar al árbol de `lib/menu.ts` a propósito — otra rama de esta misma tanda lo
--      está tocando (D-84); se abre por URL directa mientras tanto.
--
-- DECISIÓN DE MODELO — `categoria_id`, NO `tipo_prenda text` libre. La tarea pedía texto
-- libre "por ahora", pero pidiendo antes preguntarle al catálogo si ya existe una taxonomía
-- de tipo de prenda que reusar. Sí existe: `retail.categorias` (verificado contra el seed:
-- Blusas/BLU, Vestidos/VES, Faldas/FAL... con `familia = 'indumentaria'`) es exactamente esa
-- taxonomía — el desplegable de "tipo de prenda" en Alta de producto ya la usa.
--   DECIDÍ: `categoria_id uuid not null references retail.categorias(id)`.
--   DESCARTÉ: `tipo_prenda text` libre — dos fuentes de verdad para "qué tipos de prenda
--     existen" (principio 4 del repo) y una captura libre nueva («Blusa» vs «Blusas», con o
--     sin tilde) que el catálogo ya resolvió hace semanas con prefijo único de 3 letras.
--   SE ROMPE SI: el día que el Taller maquile algo que HOY no es una categoría de
--     `indumentaria` (ej. un accesorio cosido) — ahí no falta una columna, falta esa
--     categoría en el catálogo, que es donde ya se dan de alta (no se duplica aquí).
--   Mismo criterio se aplicó al RPC: `p_categoria_id uuid`, no `p_tipo_prenda text` — un
--   texto suelto contra `categorias.nombre` podía fallar en silencio por un typo o un
--   plural distinto y devolver "sin cotización vigente" aunque sí exista una. Ver ADR-0156.
--
-- QUÉ SE CONSERVA. El resto del catálogo (`productos`, `variantes`) no se toca. `fn_es_lider`
-- y `fn_puede_operar_ubicacion` ya existen (0006/0009); esta migración no los redefine.
--
-- ESTADOS IMPOSIBLES QUE EL ESQUEMA CIERRA (principio 4 de CLAUDE.md).
--   · Precio negativo — check `precio_maquila >= 0`.
--   · Una cotización que "vence antes de empezar" — check `vigente_hasta >= fecha_cotizacion`.
--   · Una cotización sin categoría real — FK a `retail.categorias`, sin `on delete cascade`
--     (una categoría no se borra con historial de cotizaciones colgando; ver 0002_esquema.sql,
--     ninguna FK de catálogo en este repo cascadea).
--   · Alguien sin sesión de líder creándose su propia cotización favorable — RLS
--     `with check (retail.fn_es_lider())` en insert y update; sin policy de delete, una
--     cotización mal cargada se corrige con un update (líder) o se dejan las dos filas para
--     que el RPC (ordena por fecha) elija la correcta, nunca se borra.
--
-- QUIÉN DEJA DE PODER HACER QUÉ. Nadie pierde nada (tabla nueva). Un integrante sigue sin
-- poder crear ni editar una cotización (RLS insert/update exige `fn_es_lider()`, igual que
-- `codigos_descuento`); sí puede LEERLAS (select solo pide sesión autenticada) porque D-80
-- dice que la tienda ve esa misma cifra como su costo de referencia — no es dinero del
-- Taller únicamente.
--
-- NÚMEROS (principio 10 CLAUDE.md, sin esto no hay decisión de performance, hay
-- superstición). ~12-15 categorías de indumentaria activas, cotización renovada cada ~6
-- meses → 24-30 filas/año, unas 100 filas en 3 años. No lleva índice: un `where categoria_id
-- = X` sobre unos cientos de filas es instantáneo (mismo criterio que
-- `20260918160000_etiquetas_descuento_y_categorias.sql` con `etiqueta_categorias`); se agrega
-- el día que el volumen real lo pida, no antes (principio 7 CLAUDE.md: no se agrega lo que
-- no se demostró necesario).
--
-- ESTADO: escrita el 2026-09-22, probada contra un Postgres 17 desechable de Homebrew (Docker
-- caído en esta sesión — ver scripts/pruebas/cotizaciones_maquila.mjs). NO en producción — la
-- pega Felipe con el prefijo `retail.` (este archivo, sin él, corre limpio en local).
-- SE ROMPE SI: se pega en producción sin el prefijo `retail.` en el SQL Editor (busca en
-- `public`, que ahí es el schema de Dynamic — ver CLAUDE.md, "Cómo aplicar SQL a producción").
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. la tabla ----------
create table retail.cotizaciones_maquila (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references retail.categorias (id),
  precio_maquila numeric(12, 2) not null check (precio_maquila >= 0),
  fecha_cotizacion date not null,
  vigente_hasta date not null,
  -- Quién la dio, para poder volver a pedirla — no es un directorio de proveedores (D-H es
  -- otra cosa: proveedores de INSUMOS del Taller); esto es solo el contacto de referencia.
  proveedor_referencia text,
  creado_por uuid references public.personas (id),
  created_at timestamptz not null default now(),
  constraint cotizaciones_maquila_vigencia_coherente check (vigente_hasta >= fecha_cotizacion)
);

comment on table retail.cotizaciones_maquila is
  'Cotización real de un taller externo para maquilar un tipo de prenda (D-82/D-31). Append-only: renovar es insertar una fila nueva, nunca editar la vigencia de una pasada. Alimenta fn_cotizacion_maquila_vigente(), que D-80 usará para el "ingreso simulado" del Taller — nunca un precio que alguien de CAYLA invente.';
comment on column retail.cotizaciones_maquila.categoria_id is
  'Reusa la taxonomía de tipo de prenda que ya existe (retail.categorias: Blusas, Vestidos, Faldas…) — no un texto libre nuevo.';
comment on column retail.cotizaciones_maquila.vigente_hasta is
  'Sugerido en la pantalla: fecha_cotizacion + 6 meses, editable — la cotización real de un taller puede durar otro plazo.';
comment on column retail.cotizaciones_maquila.proveedor_referencia is
  'Quién dio la cotización (taller externo, contacto), para volver a pedirla al vencer. Texto libre: no es un proveedor dado de alta en el sistema.';

-- ---------- 2. RLS ----------
alter table retail.cotizaciones_maquila enable row level security;

-- Cualquier sesión activa lee: D-80 dice que la tienda ve esta misma cifra como su costo de
-- referencia, no es un número que el Taller se guarda para sí.
create policy cotizaciones_maquila_select on retail.cotizaciones_maquila
  for select using (auth.role() = 'authenticated');

create policy cotizaciones_maquila_insert on retail.cotizaciones_maquila
  for insert with check (retail.fn_es_lider());

-- Update, no para "renovar" (eso es insert) sino para corregir una fila recién cargada con un
-- dato mal tecleado — mismo criterio que codigos_descuento_update.
create policy cotizaciones_maquila_update on retail.cotizaciones_maquila
  for update using (retail.fn_es_lider()) with check (retail.fn_es_lider());

-- Sin policy de delete: una cotización, aunque quedó vieja, es historia de precio de mercado
-- (regla del repo: nunca DELETE en catálogos con historial).

grant select on retail.cotizaciones_maquila to authenticated;
grant insert, update on retail.cotizaciones_maquila to authenticated;

-- ---------- 3. RPC: la cotización vigente, o null ----------
-- Sin candado de líder ni de ubicación a propósito: es una lectura que D-80 dice que
-- comparten Taller y tiendas por igual (la referencia de costo), igual que la RLS de select
-- de arriba — no depende de rol ni de dónde está parada la persona, solo de tener sesión
-- (lo exige el grant de ejecución, no un `if` dentro de la función).
create or replace function retail.fn_cotizacion_maquila_vigente(p_categoria_id uuid)
returns retail.cotizaciones_maquila
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select *
  from retail.cotizaciones_maquila
  where categoria_id = p_categoria_id
    and vigente_hasta >= current_date
  order by fecha_cotizacion desc, created_at desc
  limit 1
$$;

comment on function retail.fn_cotizacion_maquila_vigente(uuid) is
  'La cotización de maquila externa más reciente y no vencida para una categoría (tipo de prenda). Sin ninguna vigente, devuelve null — nunca inventa un precio (D-31).';

-- `security definer` corre como el dueño de la función y por lo tanto NO pasa por la RLS de
-- la tabla (esa protección es solo para el acceso directo por PostgREST) — el candado real
-- de "solo con sesión" es este grant/revoke, no la política de la tabla. Postgres además
-- otorga EXECUTE a PUBLIC por defecto a toda función nueva: sin el revoke, cualquiera sin
-- sesión (rol `anon`) igual podría llamarla y leer el precio de referencia del Taller.
revoke execute on function retail.fn_cotizacion_maquila_vigente(uuid) from public;
grant execute on function retail.fn_cotizacion_maquila_vigente(uuid) to authenticated;
