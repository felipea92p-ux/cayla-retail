-- ============================================================================
-- 20260922140000_ficha_de_clienta_v1_backend.sql — CAYLA V2
--
-- «LA FICHA DE CLIENTA, VERSIÓN 1» — SOLO BACKEND.
--
-- QUÉ DECIDE. D-76/D-77 de la ronda de 60 preguntas (referencia:
-- docs/datos/DECISIONES-2026-09-21-menu-comercial.md, aún en PR #265 sin
-- fusionar). Decisión de Felipe: no ser invasivos ni poner trabas — DNI
-- opcional en un solo campo (sin el tipo_doc/num_doc de la tabla vieja),
-- WhatsApp con permiso APARTE del teléfono (Ley 29733: el consentimiento de
-- contacto para marketing es un dato distinto del dato transaccional, nunca
-- se asume por dar el número), y meta modesta de identificación (30-40% de
-- las ventas) que NUNCA se paga ni se rankea — pagar por identificar induce
-- DNI inventados. Esta migración es SOLO la base y las RPC; la pantalla de
-- captura en el mostrador (Punto de Venta) la construye otra tanda de
-- agentes después — la de acá es una pantalla mínima en `/clientas` solo
-- para poder probar esto a mano, sin engancharse al menú.
--
-- ----------------------------------------------------------------------------
-- HALLAZGO QUE CAMBIÓ EL PLAN — LEE ESTO ANTES DE APLICAR EN PRODUCCIÓN.
-- ----------------------------------------------------------------------------
-- El encargo decía «hoy NO existe ninguna tabla de clientas en el repo» y
-- «ventas.cliente_id ya existe pero sin tabla a la que apuntar». Verificado
-- contra un Postgres que corrió las 194 migraciones del repo en orden
-- (`docs/datos/generado/DICCIONARIO-RETAIL.md` lo confirma también desde el
-- volcado de producción, 2026-09-12): eso es FALSO. Existe `retail.clientes`
-- (0002_esquema.sql — 7 columnas: id, tipo_doc, num_doc, nombre, telefono,
-- email, created_at) con una FK real y viva `ventas_cliente_id_fkey` desde
-- 2026-09 (benja-migracion.sql), ~0 filas en producción, y DOS lectores
-- activos: `retail.fn_ventas_del_dia()` (`left join clientes cli on cli.id =
-- v.cliente_id`, Caja/Vender/Facturación) y `apps/web/lib/ventas-historial.ts`
-- (embed PostgREST `cliente:clientes ( nombre )`, Ventas ▸ Historial,
-- ADR-0147). Ningún código ESCRIBE en `clientes` fuera del seed local — de
-- ahí sus ~0 filas reales: la única manera de que hoy tenga cero filas en
-- producción es que ventas.cliente_id sea NULL en las ~15 filas que existen
-- (una FK no deja insertar un id que no está en la tabla referenciada).
--
-- Con esto, «reutiliza cliente_id, no crees clienta_id nueva» seguía siendo
-- la orden correcta (la columna es la misma), pero «agrega la FK nueva»
-- tenía un paso que el encargo no anticipó: cliente_id NO estaba suelto,
-- apuntaba a otra tabla — el caso que el propio encargo pide verificar antes
-- de agregar la constraint.
--
-- DECIDÍ: jubilar `retail.clientes` en la MISMA migración — repunto la FK de
--   `ventas.cliente_id` de `clientes` a `clientas`, actualizo las dos
--   lecturas reales (`fn_ventas_del_dia`, `ventas-historial.ts`) y elimino
--   la tabla vieja.
-- DESCARTÉ: dejar `clientes` viva al lado de `clientas` (agregar la FK nueva
--   sin tocar la vieja) porque dos tablas de «cliente» en el mismo esquema
--   es exactamente el caso que INTEGRIDAD CONCEPTUAL prohíbe (dos partes del
--   sistema resolviendo el mismo problema de dos formas) — la próxima
--   persona que toque Ventas no tendría cómo saber cuál de las dos es la
--   real, y `clientes` ya tiene menos campos y ningún RLS de UPDATE.
-- SE ROMPE SI: producción tiene la FK con OTRO nombre que `ventas_cliente_id_
--   fkey` (no debería — es el nombre que Postgres genera solo y el que trae
--   benja-migracion.sql) — por eso el DROP de abajo no asume el nombre, lo
--   busca por catálogo (`confrelid = 'retail.clientes'`) antes de borrarlo;
--   o si producción tiene filas reales en `clientes` (no las tiene: ~0 según
--   el diccionario del 2026-09-12) — si algún día las tuviera, esta
--   migración se detiene sola (`raise exception`, ver abajo) en vez de
--   perderlas en silencio.
--
-- QUIÉN Y CUÁNDO. Escrito por la sesión que resolvió D-76/D-77, 2026-09-22.
-- Aplicación a producción la hace Felipe o el arquitecto con el protocolo de
-- ensayo aparte (nunca esta sesión) — ver CLAUDE.md, «Cómo aplicar SQL a
-- producción».
--
-- QUÉ CAMBIA.
--   1. Tabla nueva `retail.clientas` (id, dni, nombre, telefono_whatsapp,
--      whatsapp_consentimiento_en, cumple_dia, cumple_mes, tallas,
--      created_at, created_por) con RLS: cualquier colaborador con sesión
--      activa lee/inserta/actualiza (retail no tiene noción de «mi
--      clienta» — es de la marca, no de la asesora), nunca `anon`. Sin
--      política de DELETE: no se borra una clienta (mismo criterio que
--      `movimientos` y los catálogos con historial).
--   2. RPC `retail.buscar_clienta(p_termino text)`: por DNI o WhatsApp
--      exactos, o nombre con ILIKE.
--   3. RPC `retail.registrar_clienta(...)`: alta o upsert por DNI. El
--      consentimiento de WhatsApp SOLO se pone en `now()` cuando
--      `p_acepta_whatsapp = true` en ESA llamada — nunca se infiere de que
--      venga el teléfono. Un upsert con `p_acepta_whatsapp = false` NO
--      revoca un consentimiento ya dado (ver «LA OBJECIÓN» más abajo).
--   4. `ventas.cliente_id` pasa a apuntar a `clientas` (constraint
--      `ventas_clienta_fk`, el nombre que pide D-76/D-77).
--   5. `retail.clientes` se elimina. `retail.fn_ventas_del_dia()` y
--      `apps/web/lib/ventas-historial.ts` se actualizan para leer de
--      `clientas` en vez de `clientes` — mismo comportamiento, misma
--      firma, ninguna pantalla nueva.
--
-- QUÉ SE CONSERVA. `ventas.cliente_id` (la columna, tal cual — es la que
-- pide reutilizar D-76/D-77). El resto de `ventas` intacto. La firma de
-- `fn_ventas_del_dia(uuid)` idéntica (columnas y tipos), así que Caja/Vender/
-- Facturación no notan el cambio.
--
-- QUIÉN DEJA DE PODER HACER QUÉ. Nadie pierde una capacidad que usara: la
-- única tabla que se retira tenía ~0 filas y ningún flujo la escribía. Lo
-- que SÍ es nuevo es que ahora SE PUEDE identificar a una clienta desde el
-- backend (antes no había cómo, con o sin `clientes`, porque no existía la
-- RPC de alta) — eso es exactamente D-76/D-77.
--
-- LA OBJECIÓN (sobre `registrar_clienta`, no sobre Postgres/RLS — la parte
-- que a mí me toca decidir con la razón en 3 líneas, protocolo global). El
-- encargo dice «si p_acepta_whatsapp es false deja NULL aunque venga el
-- teléfono» — lo implementé así SOLO para el alta (fila nueva). Para el
-- upsert (misma clienta, DNI repetido) NO lo tomé literal: si ya había
-- `whatsapp_consentimiento_en` puesto y una llamada nueva trae
-- `p_acepta_whatsapp = false` (el default del parámetro), la RPC lo
-- CONSERVA en vez de ponerlo en NULL. Por qué: un formulario futuro que
-- reabra la ficha para corregir solo el nombre, sin volver a preguntar por
-- WhatsApp, llamaría a esta misma RPC con el default `false` — tomado
-- literal, ESO borraría un consentimiento real ya dado, que es exactamente
-- lo que la Ley 29733 exige no hacer sin que la clienta lo pida. Se rompe
-- si algún día se necesita que «false» SÍ revoque expresamente: ese caso
-- necesita su propio parámetro (`p_revoca_whatsapp`), no compartir el
-- default de «no me preguntaron».
--
-- IDEMPOTENTE donde se pudo: `create table if not exists`, `create or
-- replace` en las funciones, `drop constraint if exists`/`drop table if
-- exists` en la limpieza. El único paso no reversible con una sola
-- sentencia es el DROP TABLE de `clientes` — motivo documentado arriba.
--
-- PRODUCCIÓN. Este archivo se pega en el SQL Editor con el prefijo
-- `retail.` agregado a cada tabla (o `set search_path to retail, public,
-- extensions;` al principio) — NUNCA con el prefijo ya en el archivo del
-- repo (rompería `npx supabase db reset` local). Ver CLAUDE.md.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. tabla clientas ----------

create table if not exists retail.clientas (
  id uuid primary key default gen_random_uuid(),
  -- Un solo campo, sin tipo_doc/num_doc (decisión de Felipe: no ser
  -- invasivos). Único cuando no es nulo — dos clientas sin DNI no chocan.
  dni text,
  nombre text,
  telefono_whatsapp text,
  -- NULL = sin permiso. Se llena SOLO cuando la clienta acepta el contacto
  -- de marketing explícitamente — nunca por dar el teléfono (Ley 29733: el
  -- consentimiento de contacto es un dato distinto del dato transaccional).
  whatsapp_consentimiento_en timestamptz,
  cumple_dia smallint,
  cumple_mes smallint,
  -- Ej. {"superior": "M", "inferior": "30"} — sin forma fija todavía (v1).
  tallas jsonb,
  created_at timestamptz not null default now(),
  created_por uuid references public.personas (id),
  constraint clientas_dni_no_vacio check (dni is null or btrim(dni) <> ''),
  constraint clientas_cumple_dia_valido check (cumple_dia is null or cumple_dia between 1 and 31),
  constraint clientas_cumple_mes_valido check (cumple_mes is null or cumple_mes between 1 and 12)
);

create unique index if not exists clientas_dni_unico on retail.clientas (dni) where dni is not null;
create index if not exists clientas_telefono_whatsapp_idx on retail.clientas (telefono_whatsapp) where telefono_whatsapp is not null;

comment on table retail.clientas is 'La ficha de clienta (D-76/D-77): identificación mínima y no invasiva desde el mostrador. Sin noción de "mi clienta" — es de la marca, cualquier colaborador con sesión la lee y la edita.';
comment on column retail.clientas.dni is 'Un solo campo de documento, opcional, sin distinguir tipo (decisión de Felipe: no ser invasivos). Único cuando no es nulo.';
comment on column retail.clientas.whatsapp_consentimiento_en is 'Cuándo aceptó contacto de marketing por WhatsApp. NULL = sin permiso, aunque telefono_whatsapp esté lleno (Ley 29733: el consentimiento de contacto es aparte del dato transaccional).';
comment on column retail.clientas.tallas is 'Tallas habituales en JSON libre (ej. superior/inferior) — sin forma fija en v1.';
comment on column retail.clientas.created_por is 'Colaborador que registró la ficha — nunca viaja desde el navegador, lo resuelve la RPC desde la sesión.';

alter table retail.clientas enable row level security;

drop policy if exists clientas_select on retail.clientas;
create policy clientas_select on retail.clientas
  for select using (auth.role() = 'authenticated');

-- CORREGIDO (revisión del PR, 2026-09-21): la primera versión traía policies de INSERT/UPDATE
-- con el mismo criterio que SELECT ('authenticated'), lo que dejaba escribir la tabla directo
-- por PostgREST sin pasar por registrar_clienta() — exactamente lo que esa RPC existe para
-- evitar: el candado de "un upsert con p_acepta_whatsapp=false nunca revoca un consentimiento
-- ya dado" (Ley 29733) vive SOLO dentro de la función, y una escritura directa a la tabla lo
-- rodea por completo. Mismo patrón que ya usa el repo para tablas donde la RPC debe ser la
-- única puerta: retail.colaboradores (0013_colaboradores_autorizados.sql), conteo_items
-- (0004_rls.sql) y cambios (0007_cambios.sql) tampoco tienen policy de INSERT/UPDATE. clientas
-- sigue ese mismo patrón: solo SELECT por RLS, escritura exclusiva vía registrar_clienta()
-- (que es SECURITY DEFINER y por lo tanto no necesita su propia policy de escritura).
drop policy if exists clientas_insert on retail.clientas;
drop policy if exists clientas_update on retail.clientas;

-- Sin política de DELETE a propósito: una clienta no se borra (mismo
-- criterio que movimientos y los catálogos con historial, CLAUDE.md).

-- ---------- 2. buscar_clienta ----------

create or replace function retail.buscar_clienta(p_termino text)
returns setof retail.clientas
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select *
  from retail.clientas
  where nullif(btrim(p_termino), '') is not null
    and (
      dni = btrim(p_termino)
      or telefono_whatsapp = btrim(p_termino)
      or nombre ilike '%' || btrim(p_termino) || '%'
    )
  order by nombre nulls last, created_at desc
  limit 20;
$$;

comment on function retail.buscar_clienta(text) is 'Busca una clienta por DNI o WhatsApp exactos, o por nombre (ILIKE). Término vacío no devuelve filas — no es un listado.';

-- ---------- 3. registrar_clienta ----------

create or replace function retail.registrar_clienta(
  p_dni text default null,
  p_nombre text default null,
  p_telefono_whatsapp text default null,
  p_acepta_whatsapp boolean default false,
  p_cumple_dia smallint default null,
  p_cumple_mes smallint default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid;
  v_persona uuid;
  v_dni text := nullif(btrim(p_dni), '');
  v_nombre text := nullif(btrim(p_nombre), '');
  v_telefono text := nullif(btrim(p_telefono_whatsapp), '');
begin
  select id into v_persona from public.personas where auth_user_id = auth.uid();

  if v_dni is not null then
    -- Upsert por DNI: una clienta que ya existe no se duplica, se completa.
    insert into retail.clientas (dni, nombre, telefono_whatsapp, whatsapp_consentimiento_en, cumple_dia, cumple_mes, created_por)
    values (
      v_dni, v_nombre, v_telefono,
      case when p_acepta_whatsapp then now() else null end,
      p_cumple_dia, p_cumple_mes, v_persona
    )
    -- El índice de abajo (clientas_dni_unico) es parcial — `on conflict`
    -- necesita repetir el mismo `where` para poder inferirlo, si no
    -- Postgres no lo encuentra ("no unique or exclusion constraint
    -- matching"), aunque el índice exista. Verificado con una prueba real.
    on conflict (dni) where dni is not null do update set
      nombre = coalesce(excluded.nombre, retail.clientas.nombre),
      telefono_whatsapp = coalesce(excluded.telefono_whatsapp, retail.clientas.telefono_whatsapp),
      -- Explícita a true: (re)confirma consentimiento con fecha nueva.
      -- Sin marcar (false, el default): NUNCA revoca uno ya dado — ver «LA
      -- OBJECIÓN» en la cabecera de este archivo.
      whatsapp_consentimiento_en = case
        when p_acepta_whatsapp then now()
        else retail.clientas.whatsapp_consentimiento_en
      end,
      cumple_dia = coalesce(excluded.cumple_dia, retail.clientas.cumple_dia),
      cumple_mes = coalesce(excluded.cumple_mes, retail.clientas.cumple_mes)
    returning id into v_id;
  else
    insert into retail.clientas (nombre, telefono_whatsapp, whatsapp_consentimiento_en, cumple_dia, cumple_mes, created_por)
    values (
      v_nombre, v_telefono,
      case when p_acepta_whatsapp then now() else null end,
      p_cumple_dia, p_cumple_mes, v_persona
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

comment on function retail.registrar_clienta(text, text, text, boolean, smallint, smallint) is 'Alta de clienta, o upsert por DNI si se repite. El consentimiento de WhatsApp solo se marca cuando p_acepta_whatsapp=true en ESA llamada; false nunca revoca uno ya dado (protege contra un formulario futuro que reabra la ficha sin volver a preguntar).';

-- Postgres le da EXECUTE a PUBLIC por defecto a toda función nueva — sin este
-- revoke, `anon` podría llamar las dos de arriba igual que `authenticated`
-- (verificado con una prueba real: `has_function_privilege('anon', ...)`
-- daba `true` antes de este bloque). Mismo patrón que
-- 20260922110000_colaboradores_suspender_y_actividad.sql.
revoke execute on function
  retail.buscar_clienta(text),
  retail.registrar_clienta(text, text, text, boolean, smallint, smallint)
from public, anon;

grant execute on function
  retail.buscar_clienta(text),
  retail.registrar_clienta(text, text, text, boolean, smallint, smallint)
to authenticated;

-- ---------- 4. repuntar ventas.cliente_id de clientes a clientas ----------

do $$
declare
  v_con text;
  v_filas bigint;
begin
  -- Defensivo: si producción tuviera filas reales en `clientes` (no las
  -- tiene: ~0 según docs/datos/generado/DICCIONARIO-RETAIL.md, 2026-09-12),
  -- esta migración se detiene en vez de perderlas en silencio.
  -- Todo el bloque es un no-op si `clientes` ya no existe (migración
  -- aplicada dos veces, o Postgres local que nunca tuvo esa tabla) —
  -- probado corriendo esta migración dos veces seguidas.
  if to_regclass('retail.clientes') is not null then
    execute 'select count(*) from retail.clientes' into v_filas;
    if v_filas > 0 then
      raise exception 'retail.clientes tiene % fila(s) — no se elimina a ciegas. Revisar a mano antes de aplicar esta migración.', v_filas;
    end if;

    -- Busca la FK por catálogo, no por nombre asumido: se rompe menos si
    -- producción la tiene con otro nombre que ventas_cliente_id_fkey.
    select conname into v_con
      from pg_constraint
      where conrelid = 'retail.ventas'::regclass
        and confrelid = 'retail.clientes'::regclass
        and contype = 'f';
    if v_con is not null then
      execute format('alter table retail.ventas drop constraint %I', v_con);
    end if;

    drop table retail.clientes;
  end if;
end $$;

alter table retail.ventas drop constraint if exists ventas_clienta_fk;
alter table retail.ventas add constraint ventas_clienta_fk foreign key (cliente_id) references retail.clientas (id);

-- ---------- 5. fn_ventas_del_dia: lee clientas en vez de clientes ----------
-- Cuerpo idéntico a 20260921103000_ventas_del_dia_una_fila_por_venta_y_sin_anuladas.sql,
-- el único cambio es la tabla del left join (clientes → clientas). Misma
-- firma, mismas columnas — Caja/Vender/Facturación no notan el cambio.

create or replace function retail.fn_ventas_del_dia(p_ubicacion_id uuid default null::uuid)
 returns table(venta_id uuid, hora text, ubicacion_nombre text, vendedor text, cliente_nombre text, items jsonb, total numeric, metodos_pago text, comprobante_tipo text, comprobante_texto text, comprobante_estado text, nota text)
 language sql
 stable security definer
 set search_path to 'retail', 'public', 'extensions'
as $function$
  select
    v.id,
    to_char(v.created_at at time zone 'America/Lima', 'HH24:MI'),
    u.nombre,
    coalesce(per.nombres || ' ' || per.apellidos, '—'),
    coalesce(cli.nombre, 'Cliente varios'),
    (select jsonb_agg(jsonb_build_object(
        'referencia', pr.referencia, 'talla', ta.valor, 'color', co.nombre,
        'cantidad', vi.cantidad, 'precio_unitario', vi.precio_unitario
      ) order by vi.id)
      from venta_items vi
      join variantes va on va.id = vi.variante_id
      join productos pr on pr.id = va.producto_id
      left join tallas ta on ta.id = va.talla_id
      left join colores co on co.codigo = va.color_codigo
      where vi.venta_id = v.id),
    (select coalesce(sum(vi.subtotal), 0) from venta_items vi where vi.venta_id = v.id),
    (select string_agg(distinct vp.metodo, ' + ') from venta_pagos vp where vp.venta_id = v.id),
    cmp.tipo,
    case when cmp.id is not null then cmp.serie || '-' || lpad(cmp.numero::text, 6, '0') else null end,
    cmp.estado,
    v.nota
  from ventas v
  join ubicaciones u on u.id = v.ubicacion_id
  left join public.personas per on per.id = v.usuario_id
  left join clientas cli on cli.id = v.cliente_id
  -- Un comprobante por venta: el vigente y, entre iguales, el más nuevo.
  left join lateral (
    select c.id, c.tipo, c.serie, c.numero, c.estado
    from comprobantes c
    where c.venta_id = v.id
    order by (c.estado in ('anulado', 'no_emitido')), c.created_at desc, c.id
    limit 1
  ) cmp on true
  where v.estado = 'completada'
    and (v.created_at at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
    and (
      (fn_es_lider() and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id))
      or (not fn_es_lider() and v.ubicacion_id = fn_ubicacion_actual_persona())
    )
  order by v.created_at desc;
$function$;

comment on function retail.fn_ventas_del_dia(uuid) is
  'Lo vendido hoy (hora de Lima): UNA fila por venta completada, con su comprobante vigente (o el más nuevo si solo hay anulados/no emitidos). Un líder ve todas las sedes o la que pida; el resto, la suya. Sin ventas anuladas (ADR-0110). Desde 20260922140000: el nombre de la clienta sale de `clientas`, no de `clientes` (retirada).';
