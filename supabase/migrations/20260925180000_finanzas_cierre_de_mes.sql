-- ============================================================================
-- 20260925180000 — Cierre de mes: por unidad y consolidado, el diario congelado con su huella y el candado por fecha
-- (ADR-0195 F9; retoma ADR-0198 «los estados salen de un diario derivado y se congelan al cerrar el mes»)
--
-- EL PROBLEMA PRIMERO
--   El diario de F5 (`fn_asientos`) se CALCULA cada vez que se mira. Es lo correcto mientras el mes está vivo, pero un
--   mes que ya se le entregó al contador no puede seguir cambiando: si alguien anula en octubre un gasto de agosto (un
--   gasto anulado «nunca existió», decisión 1 de F5), registra una factura con fecha de agosto o da de baja un activo con
--   fecha de julio, el Estado de resultados de agosto cambia solo, sin que nadie lo note. Un estado que cambia después
--   de enviarlo no es un estado: es una opinión.
--
-- LAS REGLAS (ADR-0198; Felipe confirmó las dos suposiciones el 2026-09-18)
--   1. UNIDADES. Un mes se cierra por UNIDAD: cada tienda, el Taller y «de la empresa» (lo que no es de ninguna tienda:
--      los bancos, los gastos sin tienda; en el diario es la ubicación nula, la misma columna «De la empresa» de F5). Y
--      además el CONSOLIDADO («CAYLA entera»), que solo se cierra cuando TODAS las unidades del mes están cerradas.
--   2. ESTADOS. `periodos` guarda una fila por unidad y mes desde la primera vez que se cierra: «cerrado» o «reabierto».
--      Sin fila = «abierto». Solo se cierra un mes que ya terminó: el mes en curso nunca está cerrado, así que las ventas,
--      las devoluciones, las mermas y los cierres de caja de HOY jamás chocan con este candado.
--   3. EL DIARIO SE CONGELA. Al cerrar, las líneas de `fn_asientos` de esa unidad y ese mes se copian a `diario_cerrado`
--      (solo se agregan filas; no se editan ni se borran) y se calcula su HUELLA: SHA-256 de las líneas en un orden
--      canónico (`fn_diario_linea_texto`). La huella del consolidado es la de las huellas de sus unidades. Reabrir no borra
--      nada: el cierre queda en la historia con quién, cuándo y por qué se reabrió, y volver a cerrar crea una versión nueva.
--   4. CHEQUEOS ANTES DE CERRAR (`fn_cierre_mes_estado`), como el spike, solo los que se miden con datos reales:
--        bloquean — cajas del mes cerradas · egresos de caja clasificados · prendas vendidas regularizadas · el diario de la
--                   unidad cuadra · (con Dynamic) que quien cierra vea la planilla;
--        avisan   — gastos fijos del mes registrados · bancos conciliados al fin de mes · planilla del mes pagada en Dynamic
--                   · prendas vendidas sin costo.
--      Un aviso no impide cerrar (un fijo puede no corresponder ese mes; el banco se concilia cuando se puede): la
--      pantalla lo muestra y el cierre lo guarda en `periodo_cierres.avisos`. `cerrar_periodo` vuelve a medir los que
--      bloquean: la pantalla no decide.
--   5. EL CANDADO POR FECHA, EN LA BASE. Con un mes cerrado para una unidad, NO se puede registrar, cambiar ni anular nada
--      con fecha dentro de ese mes para esa unidad. Disparadores (uno por tabla, cada uno en su PARTE):
--        gastos · compras (facturas de mercadería, gasto y activo) · compra_pagos · compra_notas_credito ·
--        proveedor_creditos (reembolsos) · activos_fijos (alta, anulación y baja, en todos los meses que deprecia) ·
--        movimientos_dinero (las dos puntas) · ventas (marcar «de prueba») · venta_items (el costo de una prenda regularizada).
--      El mensaje dice qué hacer: «Agosto de Tienda TRU está cerrado: reábrelo con motivo o registra con fecha de
--      septiembre.»
--   6. HOY SIEMPRE ESTÁ LIBRE. Las ventas, anulaciones de venta, devoluciones, cambios, separaciones y mermas llevan la
--      fecha de HOY (`now()`, nadie la escribe a mano) y el diario las asienta el día en que pasan (F5). Por eso:
--        · una DEVOLUCIÓN de hoy sobre una venta de un mes cerrado va al mes de HOY (se aprueba hoy, se asienta hoy);
--        · lo mismo una anulación o un cambio: el mes cerrado no se toca y nada se bloquea en el mostrador.
--   7. REABRIR pide motivo (5 letras como mínimo) y queda en la historia; reabrir una unidad reabre también el consolidado
--      de ese mes. Cerrar y reabrir son SOLO del líder (el módulo `cierre_mes` no es delegable: `fn_es_lider()`), y firman
--      con el responsable (`fn_actor_persona_id(true)`).
--   8. LEER LO CONGELADO: `fn_diario(desde, hasta, ubicación)` devuelve lo mismo que `fn_asientos`, pero para cada unidad y
--      mes cerrados trae las líneas congeladas. El Estado de resultados (F5) y el Balance (F7) lo usan cambiando una sola
--      línea (docs/finanzas/fases/F9.md). La planilla congelada solo la ve quien la ve en Dynamic.
--   9. Tablas con RLS y SIN políticas (se leen por funciones `security definer`). Nada se borra.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — DIEZ EJECUCIONES SEPARADAS, EN ORDEN (CLAUDE.md «Políticas y deadlocks»)
--   PARTE 1  lo nuevo: tres tablas propias, las reglas, las lecturas y las RPC. Sobre tablas existentes solo toma el
--            candado de sus llaves (`ubicaciones`, `cuentas`, `personas`: deja leer y frena escribir en ellas un instante;
--            casi nunca se escriben). Sin políticas.
--   PARTE 2  gastos (sola)              PARTE 3  compras (sola)             PARTE 4  compra_pagos (sola)
--   PARTE 5  compra_notas_credito (sola) PARTE 6  proveedor_creditos (sola) PARTE 7  activos_fijos (sola)
--   PARTE 8  movimientos_dinero (sola)  PARTE 9  ventas (sola)              PARTE 10 venta_items (sola)
--   Cada una con `lock_timeout = 3s`: si dice «lock timeout», la tienda estaba escribiendo en esa tabla; se repite ESA
--   parte. Todas son idempotentes (`create or replace trigger` toma un candado que deja leer, no uno exclusivo). Mientras
--   no haya ningún mes cerrado, los disparadores no bloquean nada: se pueden pegar en cualquier momento del día.
--   SIN NINGÚN `drop`: medido en local (2026-09-25), `drop trigger if exists` toma en exclusiva las 21 tablas de `auth` y
--   `storage`, igual que `drop policy` (ADR-0195, «Políticas y deadlocks»). Por eso todo disparador de aquí es
--   `create or replace trigger`. Cada parte, medida: toma en exclusiva solo sus tablas nuevas o la tabla de su disparador.
--   Antes: F2a y F2b (20260924235000, 20260924235100, 20260925000000), el módulo (20260925100000), F3 (20260925110000) y
--   F5 (20260925130000, el diario). En local y en el CI corre entero.
-- SE ROMPE SI
--   · La web nueva se publica antes (Finanzas ▸ Cierre de mes llama funciones que no existirían). Si esto se pega primero,
--     la web de hoy no se rompe: nada de lo que ya existe cambia de forma.
--   · Aparece una tabla nueva con fecha escrita a mano que alimenta el diario y no recibe su disparador: ese dato podría
--     cambiar un mes cerrado. El chequeo «El diario de hoy da la misma huella» lo delataría (lo congelado no cambia).
--   · Dynamic cambia una planilla de un mes cerrado: lo congelado no cambia y el chequeo de la huella lo avisa.
-- ============================================================================

-- ============================== PARTE 1 · lo nuevo ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Las tablas ----------

-- Una fila por unidad y mes, desde la primera vez que se cierra. Sin fila = abierto.
create table if not exists retail.periodos (
  id uuid primary key default gen_random_uuid(),
  mes date not null,
  -- 'ubicacion' (una tienda o el Taller) · 'empresa' (lo que no es de ninguna tienda) · 'consolidado' (CAYLA entera)
  alcance text not null,
  ubicacion_id uuid references retail.ubicaciones (id),
  estado text not null,
  -- El cierre vigente (el diario congelado que manda). Nulo si se reabrió.
  cierre_id uuid,
  actualizado_en timestamptz not null default now(),
  constraint periodos_mes_primer_dia check (mes = date_trunc('month', mes)::date),
  constraint periodos_alcance_check check (alcance in ('ubicacion', 'empresa', 'consolidado')),
  constraint periodos_unidad_coherente check ((alcance = 'ubicacion') = (ubicacion_id is not null)),
  constraint periodos_estado_check check (estado in ('cerrado', 'reabierto')),
  constraint periodos_cerrado_con_cierre check ((estado = 'cerrado') = (cierre_id is not null))
);
comment on table retail.periodos is
  'Cierre de mes (ADR-0198, ADR-0195 F9): una fila por unidad (tienda, Taller, «de la empresa») y mes, y el consolidado. Sin fila = abierto. Se escribe solo con cerrar_periodo y reabrir_periodo.';
-- Dos cierres de la misma unidad en el mismo mes son imposibles (ADR-0198, «estados imposibles»).
create unique index if not exists periodos_unidad_mes_uq
  on retail.periodos (mes, alcance, coalesce(ubicacion_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Cada vez que se cierra (y, si se reabrió, cuándo, quién y por qué). Solo se agregan filas; lo único que cambia de una
-- fila es su reapertura, una vez.
create table if not exists retail.periodo_cierres (
  id uuid primary key,
  periodo_id uuid not null references retail.periodos (id),
  mes date not null,
  alcance text not null,
  ubicacion_id uuid references retail.ubicaciones (id),
  version integer not null check (version >= 1),
  cerrado_en timestamptz not null default now(),
  cerrado_por uuid not null references public.personas (id),
  -- SHA-256 del diario congelado (en el consolidado, de las huellas de sus unidades).
  huella text not null check (huella ~ '^[0-9a-f]{64}$'),
  lineas integer not null check (lineas >= 0),
  total_debe numeric not null,
  total_haber numeric not null,
  -- Consolidado: [{alcance, ubicacion_id, cierre_id, huella}] de las unidades que lo forman.
  unidades jsonb,
  -- Los chequeos que avisaban (no bloquean) y seguían pendientes al cerrar: quedan en la historia.
  avisos jsonb not null default '[]'::jsonb,
  reabierto_en timestamptz,
  reabierto_por uuid references public.personas (id),
  motivo_reapertura text,
  unique (periodo_id, version),
  constraint periodo_cierres_cuadra check (round(total_debe, 2) = round(total_haber, 2)),
  constraint periodo_cierres_reapertura check (
    (reabierto_en is null and reabierto_por is null and motivo_reapertura is null)
    or (reabierto_en is not null and reabierto_por is not null and char_length(trim(motivo_reapertura)) >= 5)
  )
);
comment on table retail.periodo_cierres is
  'Historia del cierre de mes (ADR-0195 F9): cada cierre con su huella y quién lo hizo; si se reabrió, quién, cuándo y por qué. No se borra.';

-- El diario congelado: las líneas de `fn_asientos` de esa unidad y ese mes, tal como estaban al cerrar.
create table if not exists retail.diario_cerrado (
  cierre_id uuid not null,
  n integer not null,
  fecha date not null,
  ubicacion_id uuid references retail.ubicaciones (id),
  asiento text not null,
  regla text not null,
  cuenta text not null references retail.cuentas (codigo),
  debe numeric not null default 0,
  haber numeric not null default 0,
  origen_tabla text,
  origen_id uuid,
  glosa text,
  primary key (cierre_id, n),
  -- Una línea es debe O haber, nunca negativa (ADR-0198, «estados imposibles»).
  constraint diario_cerrado_linea check (debe >= 0 and haber >= 0 and not (debe > 0 and haber > 0))
);
comment on table retail.diario_cerrado is
  'El diario de un mes cerrado (ADR-0198): las líneas de fn_asientos al cerrar. Inmutable: para corregirlo se reabre el mes y se vuelve a cerrar (versión nueva).';

-- Llaves que se cumplen al terminar la transacción: el cierre escribe primero sus líneas y su período, y después la fila
-- del cierre con la huella de esas líneas.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'periodos_cierre_id_fkey') then
    alter table retail.periodos add constraint periodos_cierre_id_fkey
      foreign key (cierre_id) references retail.periodo_cierres (id) deferrable initially deferred;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'diario_cerrado_cierre_id_fkey') then
    alter table retail.diario_cerrado add constraint diario_cerrado_cierre_id_fkey
      foreign key (cierre_id) references retail.periodo_cierres (id) deferrable initially deferred;
  end if;
end $$;

create or replace function retail.fn_periodos_no_se_borran() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'Un período no se borra: se reabre con motivo.' using errcode = 'P0001';
end $$;
create or replace trigger periodos_no_se_borran before delete on retail.periodos
  for each row execute function retail.fn_periodos_no_se_borran();

create or replace function retail.fn_periodo_cierres_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un cierre de mes no se borra: queda en la historia.' using errcode = 'P0001';
  end if;
  if old.reabierto_en is not null or new.reabierto_en is null
     or (new.id, new.periodo_id, new.mes, new.alcance, new.ubicacion_id, new.version, new.cerrado_en, new.cerrado_por, new.huella,
         new.lineas, new.total_debe, new.total_haber, new.unidades, new.avisos)
        is distinct from
        (old.id, old.periodo_id, old.mes, old.alcance, old.ubicacion_id, old.version, old.cerrado_en, old.cerrado_por, old.huella,
         old.lineas, old.total_debe, old.total_haber, old.unidades, old.avisos) then
    raise exception 'Un cierre de mes no se edita: solo se anota su reapertura, una vez.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create or replace trigger periodo_cierres_inmutable before update or delete on retail.periodo_cierres
  for each row execute function retail.fn_periodo_cierres_inmutable();

create or replace function retail.fn_diario_cerrado_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'El diario de un mes cerrado no se modifica: se reabre el mes con motivo y se vuelve a cerrar.' using errcode = 'P0001';
end $$;
create or replace trigger diario_cerrado_inmutable before update or delete on retail.diario_cerrado
  for each row execute function retail.fn_diario_cerrado_inmutable();
create or replace trigger diario_cerrado_sin_truncate before truncate on retail.diario_cerrado
  for each statement execute function retail.fn_diario_cerrado_inmutable();

alter table retail.periodos enable row level security;
alter table retail.periodo_cierres enable row level security;
alter table retail.diario_cerrado enable row level security;
revoke all on retail.periodos, retail.periodo_cierres, retail.diario_cerrado from public, anon, authenticated;

-- ---------- 2. Textos y la huella (una sola definición de cada cosa) ----------

-- «agosto», «septiembre»…
create or replace function retail.fn_mes_nombre(p_mes date) returns text
language sql immutable as $$
  select (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])
         [extract(month from p_mes)::int];
$$;

-- «Tienda TRU», «Taller», «la empresa», «CAYLA entera».
create or replace function retail.fn_unidad_nombre(p_alcance text, p_ubicacion_id uuid) returns text
language sql stable security definer set search_path = retail, public, extensions as $$
  select case p_alcance
    when 'consolidado' then 'CAYLA entera'
    when 'empresa' then 'la empresa'
    else coalesce((select u.nombre from retail.ubicaciones u where u.id = p_ubicacion_id), 'esa ubicación')
  end;
$$;

-- «Agosto de Tienda TRU» (con el año si no es el de hoy: «Diciembre 2025 de la empresa»).
create or replace function retail.fn_texto_periodo(p_mes date, p_alcance text, p_ubicacion_id uuid) returns text
language sql stable security definer set search_path = retail, public, extensions as $$
  select initcap(retail.fn_mes_nombre(p_mes))
      || case when extract(year from p_mes) <> extract(year from retail.fn_hoy_lima()) then ' ' || extract(year from p_mes)::int else '' end
      || ' de ' || retail.fn_unidad_nombre(p_alcance, p_ubicacion_id);
$$;

-- Una línea del diario como texto canónico. La huella es el SHA-256 de estas líneas ordenadas por el propio texto
-- (collate "C": no depende del idioma del servidor), así que dos diarios con las mismas líneas dan la misma huella.
-- `trim_scale`: 100.00 y 100.0 son el mismo monto.
create or replace function retail.fn_diario_linea_texto(
  p_fecha date, p_ubicacion_id uuid, p_asiento text, p_regla text, p_cuenta text,
  p_debe numeric, p_haber numeric, p_origen_tabla text, p_origen_id uuid, p_glosa text
) returns text
language sql immutable as $$
  select concat_ws('|', to_char(p_fecha, 'YYYY-MM-DD'), coalesce(p_ubicacion_id::text, '-'), p_asiento, p_regla, p_cuenta,
                   trim_scale(p_debe)::text, trim_scale(p_haber)::text, coalesce(p_origen_tabla, ''), coalesce(p_origen_id::text, ''),
                   coalesce(p_glosa, ''));
$$;

create or replace function retail.fn_huella_de_textos(p_textos text[]) returns text
language sql immutable as $$
  select encode(sha256(convert_to(coalesce((select string_agg(t, E'\n' order by t collate "C") from unnest(p_textos) t), ''), 'UTF8')), 'hex');
$$;

-- La huella de un cierre, recalculada desde sus líneas guardadas (para verificar que nada se tocó).
create or replace function retail.fn_huella_congelada(p_cierre_id uuid) returns text
language sql stable security definer set search_path = retail, public, extensions as $$
  select retail.fn_huella_de_textos(array(
    select retail.fn_diario_linea_texto(d.fecha, d.ubicacion_id, d.asiento, d.regla, d.cuenta, d.debe, d.haber, d.origen_tabla, d.origen_id, d.glosa)
      from retail.diario_cerrado d where d.cierre_id = p_cierre_id));
$$;

-- ---------- 3. ¿Está cerrado? El candado que usan los disparadores ----------

-- El primer mes cerrado de la unidad entre dos fechas (nulo si ninguno). Ubicación nula = «de la empresa». El mes en
-- curso y los que vienen nunca están cerrados: ni se consultan.
create or replace function retail.fn_primer_mes_cerrado(p_ubicacion_id uuid, p_desde date, p_hasta date default null)
returns date
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_desde date := date_trunc('month', p_desde)::date;
  v_hasta date := least(date_trunc('month', coalesce(p_hasta, p_desde))::date,
                        (date_trunc('month', retail.fn_hoy_lima()) - interval '1 month')::date);
begin
  if p_desde is null or v_desde > v_hasta then
    return null;
  end if;
  return (select min(p.mes) from retail.periodos p
           where p.estado = 'cerrado' and p.mes between v_desde and v_hasta
             and ((p_ubicacion_id is null and p.alcance = 'empresa')
                  or (p.alcance = 'ubicacion' and p.ubicacion_id = p_ubicacion_id)));
end $$;

create or replace function retail.fn_mes_cerrado(p_ubicacion_id uuid, p_fecha date) returns boolean
language sql stable security definer set search_path = retail, public, extensions as $$
  select retail.fn_primer_mes_cerrado(p_ubicacion_id, p_fecha) is not null;
$$;
comment on function retail.fn_mes_cerrado(uuid, date) is
  '¿El mes de esa fecha está cerrado para esa unidad? Ubicación nula = «de la empresa». El mes en curso nunca lo está.';

-- Levanta el error con el mensaje que dice qué hacer. `p_para`: la acción sobre algo ya registrado («anular este
-- gasto»); sin ella, es un registro nuevo y se ofrece registrarlo con fecha de este mes. `p_por`: por qué un mes POSTERIOR
-- a la fecha también cuenta (un activo se deprecia en los meses que siguen a su compra).
create or replace function retail.fn_exigir_mes_abierto(p_ubicacion_id uuid, p_desde date, p_hasta date default null,
                                                        p_para text default null, p_por text default null)
returns void
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare v_mes date := retail.fn_primer_mes_cerrado(p_ubicacion_id, p_desde, p_hasta);
begin
  if v_mes is null then
    return;
  end if;
  raise exception '% está cerrado%: reábrelo con motivo%.',
    retail.fn_texto_periodo(v_mes, case when p_ubicacion_id is null then 'empresa' else 'ubicacion' end, p_ubicacion_id),
    case when p_por is not null and v_mes > date_trunc('month', p_desde)::date then ' y ' || p_por else '' end,
    case when p_para is not null then ' para ' || p_para
         when p_por is not null and v_mes > date_trunc('month', p_desde)::date then ' para registrarlo'
         else ' o registra con fecha de ' || retail.fn_mes_nombre(retail.fn_hoy_lima()) end
    using errcode = 'P0001', hint = 'periodo_cerrado', detail = to_char(v_mes, 'YYYY-MM');
end $$;

-- Una venta toca los meses en que pasó, se anuló, se devolvió o se cambió algo de ella: si se marca «de prueba» o
-- cambia el costo de una prenda (regularizar), todos esos meses tienen que estar abiertos.
create or replace function retail.fn_exigir_venta_abierta(p_venta_id uuid, p_para text) returns void
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare v_ubic uuid; r record;
begin
  select v.ubicacion_id into v_ubic from retail.ventas v where v.id = p_venta_id;
  for r in
    select distinct x.f from (
      select (v.created_at at time zone 'America/Lima')::date as f from retail.ventas v where v.id = p_venta_id
      union all select (v.anulado_en at time zone 'America/Lima')::date from retail.ventas v where v.id = p_venta_id and v.anulado_en is not null
      union all select (d.aprobado_en at time zone 'America/Lima')::date from retail.devoluciones d
                 where d.venta_id = p_venta_id and d.estado = 'aprobada' and d.aprobado_en is not null
      union all select (c.created_at at time zone 'America/Lima')::date from retail.cambios c
                 join retail.venta_items vi on vi.id = c.venta_item_id where vi.venta_id = p_venta_id
    ) x order by x.f
  loop
    perform retail.fn_exigir_mes_abierto(v_ubic, r.f, null, p_para);
  end loop;
end $$;

-- ---------- 4. Quién ve qué ----------

-- Las unidades y meses cerrados de un mes, para que otras pantallas (Estado de resultados, Balance) digan «cerrado». El
-- líder ve todas; con «Reportes financieros», la suya.
create or replace function retail.fn_periodos_mes(p_mes date)
returns table (alcance text, ubicacion_id uuid, estado text, huella text, cerrado_en timestamptz)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_lider boolean := retail.fn_es_lider(); v_ubics uuid[] := retail.fn_diario_ubicaciones();
begin
  return query
  select p.alcance, p.ubicacion_id, p.estado, c.huella, c.cerrado_en
    from retail.periodos p
    left join retail.periodo_cierres c on c.id = p.cierre_id
   where p.mes = date_trunc('month', p_mes)::date
     and (v_lider or (p.alcance = 'ubicacion' and p.ubicacion_id = any (v_ubics)));
end $$;

-- ---------- 5. El estado del mes: unidades, chequeos y huellas (solo el líder) ----------

-- Una fila por unidad del mes (y el consolidado). Unidades: las ubicaciones activas, las inactivas que tienen líneas en
-- el diario del mes o un período (su historia cuenta, como en F5), y «de la empresa». Los chequeos van como datos (`clave`, `ok`,
-- `bloquea`, `datos`); la pantalla los pone en palabras (lib/cierre-reglas.ts).
create or replace function retail.fn_cierre_mes_estado(p_mes date)
returns table (
  alcance text, ubicacion_id uuid, nombre text, tipo text, orden integer,
  estado text, cierre jsonb, chequeos jsonb, bloqueantes integer, avisos integer, huella_viva text
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_fin date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_ini_ts timestamptz := (date_trunc('month', p_mes)::timestamp at time zone 'America/Lima');
  v_fin_ts timestamptz := ((date_trunc('month', p_mes) + interval '1 month')::timestamp at time zone 'America/Lima');
  v_dynamic boolean := to_regclass('retail.planilla_por_sede') is not null and to_regprocedure('public.fn_es_admin_o_lider()') is not null;
  v_planilla boolean := retail.fn_planilla_visible();
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
begin
  if not retail.fn_es_lider() then
    raise exception 'El cierre de mes es solo del líder.' using errcode = '42501';
  end if;
  if p_mes is null then
    raise exception 'Falta el mes.' using errcode = 'P0001';
  end if;

  return query
  with
  a as materialized (select * from retail.fn_asientos(v_mes, v_fin, null)),
  -- La planilla de Dynamic de los últimos meses (vacía si quien mira no la ve o si no hay Dynamic).
  pl as materialized (select * from retail.fn_planilla_periodos((v_mes - interval '3 months')::date, v_fin)),
  uni as (
    select 'ubicacion'::text as alc, u.id as uid, u.nombre::text as nom, u.tipo::text as tip,
           case u.tipo when 'taller' then 2 else 1 end as ord
      from retail.ubicaciones u
     where u.activo
        or exists (select 1 from a where a.ubicacion_id = u.id)
        or exists (select 1 from retail.periodos p where p.mes = v_mes and p.ubicacion_id = u.id)
    union all
    select 'empresa', null::uuid, 'De la empresa', 'empresa', 3
  ),
  -- El cierre de cada unidad: el vigente si está cerrado; si se reabrió, el último (con su reapertura).
  per as (
    select p.alcance as alc, p.ubicacion_id as uid, p.estado as est,
           (select jsonb_build_object('id', c.id, 'version', c.version, 'cerrado_en', c.cerrado_en,
                     'cerrado_por', trim(concat_ws(' ', pe.nombres, pe.apellidos)), 'huella', c.huella, 'lineas', c.lineas,
                     'reabierto_en', c.reabierto_en, 'reabierto_por', nullif(trim(concat_ws(' ', pr.nombres, pr.apellidos)), ''),
                     'motivo_reapertura', c.motivo_reapertura, 'avisos', c.avisos)
              from retail.periodo_cierres c
              left join public.personas pe on pe.id = c.cerrado_por
              left join public.personas pr on pr.id = c.reabierto_por
             where c.periodo_id = p.id
             order by c.version desc limit 1) as cie
      from retail.periodos p
     where p.mes = v_mes
  ),
  -- Huella de HOY de cada unidad (lo que se congelaría ahora; en una cerrada, para ver si algo cambió).
  hv as (
    select uni.alc, uni.uid,
           retail.fn_huella_de_textos(array_agg(retail.fn_diario_linea_texto(a.fecha, a.ubicacion_id, a.asiento, a.regla, a.cuenta,
             a.debe, a.haber, a.origen_tabla, a.origen_id, a.glosa)) filter (where a.asiento is not null)) as h,
           count(a.asiento) as lineas, count(distinct a.asiento) as asientos
      from uni
      left join a on (uni.alc = 'ubicacion' and a.ubicacion_id = uni.uid) or (uni.alc = 'empresa' and a.ubicacion_id is null)
     group by uni.alc, uni.uid
  ),
  dz as (
    select x.uid, count(*) as n, min(x.asiento) as ejemplo
      from (select (array_agg(a.ubicacion_id))[1] as uid, a.asiento from a group by a.asiento
             having round(sum(a.debe), 2) <> round(sum(a.haber), 2)) x
     group by x.uid
  ),
  cj as (
    select k.ubicacion_id as uid,
           count(*) filter (where k.estado = 'abierta') as abiertas,
           min((k.abierta_en at time zone 'America/Lima')::date) filter (where k.estado = 'abierta') as desde,
           count(*) filter (where k.estado = 'cerrada' and k.abierta_en >= v_ini_ts) as cerradas
      from retail.cajas k
     where not k.es_prueba and k.abierta_en < v_fin_ts and (k.estado = 'abierta' or k.abierta_en >= v_ini_ts)
     group by k.ubicacion_id
  ),
  con_caja as (select distinct k.ubicacion_id as uid from retail.cajas k where k.abierta_en < v_fin_ts),
  -- Los mismos egresos que Gastos ▸ Egresos de caja muestra por clasificar, del mes.
  eg as (
    select k.ubicacion_id as uid, count(*) as n, sum(m.monto) as monto,
           (array_agg(m.motivo order by m.created_at desc))[1] as motivo,
           (array_agg((m.created_at at time zone 'America/Lima')::date order by m.created_at desc))[1] as fecha,
           (array_agg(m.monto order by m.created_at desc))[1] as monto1
      from retail.caja_movimientos m
      join retail.cajas k on k.id = m.caja_id
     where m.tipo = 'egreso' and m.created_at >= v_ini_ts and m.created_at < v_fin_ts
       and retail.fn_egreso_ya_usado(m.id) is null
     group by k.ubicacion_id
  ),
  rg as (
    select r.ubicacion_id as uid, count(*) as n
      from retail.prendas_por_regularizar r
     where r.estado = 'pendiente' and r.vendido_en >= v_ini_ts and r.vendido_en < v_fin_ts
     group by r.ubicacion_id
  ),
  fj as (
    select f.ubicacion_id as uid, count(*) as total, count(*) filter (where g.id is null) as faltan,
           coalesce(jsonb_agg(f.descripcion order by f.dia_del_mes, f.descripcion) filter (where g.id is null), '[]'::jsonb) as cuales
      from retail.gastos_fijos f
      left join lateral (
        select x.id from retail.gastos x
         where x.gasto_fijo_id = f.id and x.estado = 'vigente' and x.fecha between v_mes and v_fin limit 1
      ) g on true
     where f.activo and f.creado_en < v_fin_ts
     group by f.ubicacion_id
  ),
  sc as (
    select v.ubicacion_id as uid, sum(vi.cantidad) as n
      from retail.ventas v join retail.venta_items vi on vi.venta_id = v.id
     where v.estado = 'completada' and not coalesce(v.es_prueba, false) and v.created_at >= v_ini_ts and v.created_at < v_fin_ts
       and vi.costo_unitario = 0 and vi.variante_id <> c_cargo_especial
     group by v.ubicacion_id
  ),
  pm as (
    select p.ubicacion_id as uid,
           count(*) filter (where p.fecha_fin between v_mes and v_fin) as este_mes,
           min(p.fecha_ini) filter (where p.fecha_fin between v_mes and v_fin) as ini,
           max(p.fecha_fin) filter (where p.fecha_fin between v_mes and v_fin) as fin,
           sum(p.personas) filter (where p.fecha_fin between v_mes and v_fin) as personas
      from pl p group by p.ubicacion_id
  ),
  -- Bancos que ya contaban al terminar el mes (su saldo inicial rige desde `saldo_desde`) y no estaban archivados: cada uno
  -- conciliado en el último día del mes o después.
  bc as (
    select cd.nombre, (select max(k.fecha) from retail.conciliaciones k where k.cuenta_id = cd.id and k.estado = 'vigente') as ultima
      from retail.cuentas_dinero cd
     where cd.tipo = 'banco' and coalesce(cd.saldo_desde, (cd.created_at at time zone 'America/Lima')::date) <= v_fin
       and (cd.archivada_en is null or cd.archivada_en >= v_fin_ts)
  ),
  ch as (
    -- Cajas del mes cerradas (tiendas, y el Taller si tiene caja).
    select uni.alc, uni.uid, 1 as ord, 'cajas'::text as clave, coalesce(cj.abiertas, 0) = 0 as ok, true as bloquea,
           jsonb_build_object('abiertas', coalesce(cj.abiertas, 0), 'desde', cj.desde, 'cerradas', coalesce(cj.cerradas, 0)) as datos
      from uni left join cj on cj.uid = uni.uid
     where uni.alc = 'ubicacion' and (uni.tip = 'tienda' or exists (select 1 from con_caja x where x.uid = uni.uid))
    union all
    select uni.alc, uni.uid, 2, 'egresos', coalesce(eg.n, 0) = 0, true,
           jsonb_build_object('n', coalesce(eg.n, 0), 'monto', coalesce(eg.monto, 0), 'motivo', eg.motivo, 'fecha', eg.fecha, 'monto1', eg.monto1)
      from uni left join eg on eg.uid = uni.uid
     where uni.alc = 'ubicacion' and (uni.tip = 'tienda' or exists (select 1 from con_caja x where x.uid = uni.uid))
    union all
    select uni.alc, uni.uid, 3, 'regularizar', false, true, jsonb_build_object('n', rg.n)
      from uni join rg on rg.uid = uni.uid
     where uni.alc = 'ubicacion'
    union all
    select uni.alc, uni.uid, 4, 'fijos', fj.faltan = 0, false,
           jsonb_build_object('total', fj.total, 'faltan', fj.faltan, 'cuales', fj.cuales)
      from uni join fj on fj.uid is not distinct from uni.uid
    union all
    select uni.alc, uni.uid, 5, 'conciliacion',
           not exists (select 1 from bc where bc.ultima is null or bc.ultima < v_fin), false,
           jsonb_build_object('bancos', (select count(*) from bc),
             'faltan', coalesce((select jsonb_agg(jsonb_build_object('nombre', bc.nombre, 'ultima', bc.ultima) order by bc.nombre)
                                   from bc where bc.ultima is null or bc.ultima < v_fin), '[]'::jsonb))
      from uni where uni.alc = 'empresa'
    union all
    -- Con Dynamic: si quien cierra no ve la planilla, el mes se congelaría sin sueldos (bloquea); si la ve, avisa cuando
    -- el mes todavía no tiene su planilla pagada. Solo en las unidades que tuvieron planilla en los últimos meses.
    select uni.alc, uni.uid, 6, 'planilla',
           v_planilla and coalesce(pm.este_mes, 0) > 0, not v_planilla,
           jsonb_build_object('visible', v_planilla, 'ini', pm.ini, 'fin', pm.fin, 'personas', pm.personas)
      from uni left join pm on pm.uid is not distinct from uni.uid
     where v_dynamic and (not v_planilla or pm.uid is not null or (uni.alc = 'empresa' and exists (select 1 from pm x where x.uid is null)))
    union all
    select uni.alc, uni.uid, 7, 'sin_costo', false, false, jsonb_build_object('n', sc.n)
      from uni join sc on sc.uid = uni.uid
     where uni.alc = 'ubicacion'
    union all
    select uni.alc, uni.uid, 8, 'diario', coalesce(dz.n, 0) = 0, true,
           jsonb_build_object('asientos', hv.asientos, 'lineas', hv.lineas, 'descuadrados', coalesce(dz.n, 0), 'ejemplo', dz.ejemplo)
      from uni
      join hv on hv.alc = uni.alc and hv.uid is not distinct from uni.uid
      left join dz on dz.uid is not distinct from uni.uid
    union all
    -- En una unidad cerrada: ¿el diario de hoy sigue dando la huella congelada? (sin sentido si quien mira no ve la planilla)
    select uni.alc, uni.uid, 9, 'huella', hv.h = (per.cie ->> 'huella'), false, jsonb_build_object('viva', hv.h, 'congelada', per.cie ->> 'huella')
      from uni
      join per on per.alc = uni.alc and per.uid is not distinct from uni.uid and per.est = 'cerrado'
      join hv on hv.alc = uni.alc and hv.uid is not distinct from uni.uid
     where not v_dynamic or v_planilla
  ),
  filas as (
    select uni.alc, uni.uid, uni.nom, uni.tip, uni.ord,
           coalesce(per.est, 'abierto') as est, per.cie,
           coalesce((select jsonb_agg(jsonb_build_object('clave', ch.clave, 'ok', ch.ok, 'bloquea', ch.bloquea, 'datos', ch.datos) order by ch.ord)
                       from ch where ch.alc = uni.alc and ch.uid is not distinct from uni.uid), '[]'::jsonb) as chq,
           (select count(*) from ch where ch.alc = uni.alc and ch.uid is not distinct from uni.uid and ch.bloquea and not ch.ok)::int as bloq,
           (select count(*) from ch where ch.alc = uni.alc and ch.uid is not distinct from uni.uid and not ch.bloquea and not ch.ok)::int as avis,
           hv.h
      from uni
      left join per on per.alc = uni.alc and per.uid is not distinct from uni.uid
      left join hv on hv.alc = uni.alc and hv.uid is not distinct from uni.uid
  )
  select f.alc, f.uid, f.nom, f.tip, f.ord, f.est, f.cie, f.chq, f.bloq, f.avis, f.h from filas f
  union all
  -- El consolidado: sin chequeos propios; lo que falta es cada unidad sin cerrar.
  select 'consolidado', null::uuid, 'CAYLA entera', 'consolidado', 4,
         coalesce((select per.est from per where per.alc = 'consolidado'), 'abierto'),
         (select per.cie from per where per.alc = 'consolidado'),
         '[]'::jsonb,
         (select count(*) from filas f where f.est <> 'cerrado')::int, 0, null::text
  order by 5, 3;
end $$;
comment on function retail.fn_cierre_mes_estado(date) is
  'Cierre de mes (ADR-0195 F9): cada unidad del mes con su estado, su último cierre, sus chequeos (clave, ok, bloquea, datos) y la huella de su diario de hoy; y el consolidado. Solo el líder.';

-- ---------- 6. La pantalla en una lectura ----------
create or replace function retail.fn_cierre_panel(p_mes date default null)
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_actual date := date_trunc('month', retail.fn_hoy_lima())::date;
  v_mes date := date_trunc('month', coalesce(p_mes, v_actual - interval '1 month'))::date;
begin
  if not retail.fn_es_lider() then
    raise exception 'El cierre de mes es solo del líder.' using errcode = '42501';
  end if;
  -- Solo se cierra un mes que ya terminó: el mes en curso o uno futuro se lee como el anterior.
  if v_mes >= v_actual then
    v_mes := (v_actual - interval '1 month')::date;
  end if;
  return jsonb_build_object(
    'mes', to_char(v_mes, 'YYYY-MM'),
    'mes_actual', to_char(v_actual, 'YYYY-MM'),
    'unidades', coalesce((select jsonb_agg(jsonb_build_object(
        'alcance', e.alcance, 'ubicacion_id', e.ubicacion_id, 'nombre', e.nombre, 'tipo', e.tipo, 'estado', e.estado,
        'cierre', e.cierre, 'chequeos', e.chequeos, 'bloqueantes', e.bloqueantes, 'avisos', e.avisos) order by e.orden, e.nombre)
      from retail.fn_cierre_mes_estado(v_mes) e), '[]'::jsonb),
    'historia', coalesce((select jsonb_agg(jsonb_build_object(
        'alcance', c.alcance, 'ubicacion_id', c.ubicacion_id, 'version', c.version, 'cerrado_en', c.cerrado_en,
        'cerrado_por', trim(concat_ws(' ', pe.nombres, pe.apellidos)), 'huella', c.huella, 'lineas', c.lineas,
        'reabierto_en', c.reabierto_en, 'reabierto_por', nullif(trim(concat_ws(' ', pr.nombres, pr.apellidos)), ''),
        'motivo_reapertura', c.motivo_reapertura, 'avisos', c.avisos) order by c.cerrado_en)
      from retail.periodo_cierres c
      left join public.personas pe on pe.id = c.cerrado_por
      left join public.personas pr on pr.id = c.reabierto_por
     where c.mes = v_mes), '[]'::jsonb),
    -- Los 12 meses que se pueden mirar, con cuántas unidades cerradas tiene cada uno y si CAYLA entera está cerrada.
    'meses', (select jsonb_agg(jsonb_build_object(
        'mes', to_char(m, 'YYYY-MM'),
        'cerradas', (select count(*) from retail.periodos p where p.mes = m::date and p.alcance <> 'consolidado' and p.estado = 'cerrado'),
        'consolidado', exists (select 1 from retail.periodos p where p.mes = m::date and p.alcance = 'consolidado' and p.estado = 'cerrado'))
        order by m desc)
      from generate_series(v_actual - interval '12 months', v_actual - interval '1 month', interval '1 month') m)
  );
end $$;

-- ---------- 7. Cerrar ----------
-- Todo o nada: o el mes de la unidad queda congelado, con su huella y bloqueado, o no cambia nada. Los cierres y
-- reaperturas de un mismo mes van en fila (candado por mes): dos líderes a la vez no dejan un estado a medias.
create or replace function retail.cerrar_periodo(p_mes date, p_alcance text, p_ubicacion_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_fin date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_actor uuid;
  v_est record;
  v_per retail.periodos%rowtype;
  v_cierre uuid := gen_random_uuid();
  v_version integer;
  v_huella text;
  v_lineas integer;
  v_debe numeric;
  v_haber numeric;
  v_unidades jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_faltan text;
  v_nombre text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Cerrar el mes es solo del líder.' using errcode = '42501';
  end if;
  if p_mes is null or p_alcance is null or p_alcance not in ('ubicacion', 'empresa', 'consolidado')
     or (p_alcance = 'ubicacion') <> (p_ubicacion_id is not null) then
    raise exception 'Falta decir qué mes y qué unidad se cierra.' using errcode = 'P0001';
  end if;
  if v_mes >= date_trunc('month', retail.fn_hoy_lima())::date then
    raise exception 'Solo se cierra un mes que ya terminó.' using errcode = 'P0001';
  end if;
  if p_alcance = 'ubicacion' and not exists (select 1 from retail.ubicaciones where id = p_ubicacion_id) then
    raise exception 'Esa ubicación no existe.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  v_nombre := retail.fn_texto_periodo(v_mes, p_alcance, p_ubicacion_id);

  perform pg_advisory_xact_lock(hashtextextended('cierre_mes:' || v_mes::text, 0));

  select * into v_per from retail.periodos p
   where p.mes = v_mes and p.alcance = p_alcance and p.ubicacion_id is not distinct from p_ubicacion_id
   for update;
  if found and v_per.estado = 'cerrado' then
    raise exception '% ya está cerrado.', v_nombre using errcode = 'P0001';
  end if;

  if p_alcance = 'consolidado' then
    -- Todas las unidades del mes cerradas; si no, cuáles faltan.
    select string_agg(e.nombre, ', ' order by e.orden, e.nombre) into v_faltan
      from retail.fn_cierre_mes_estado(v_mes) e where e.alcance <> 'consolidado' and e.estado <> 'cerrado';
    if v_faltan is not null then
      raise exception 'CAYLA entera se cierra cuando cerraron todas: falta %.', v_faltan using errcode = 'P0001';
    end if;
    select jsonb_agg(jsonb_build_object('alcance', p.alcance, 'ubicacion_id', p.ubicacion_id, 'cierre_id', c.id, 'huella', c.huella)
                     order by p.alcance, p.ubicacion_id),
           retail.fn_huella_de_textos(array_agg(concat_ws('|', p.alcance, coalesce(p.ubicacion_id::text, '-'), c.huella))),
           coalesce(sum(c.lineas), 0), coalesce(sum(c.total_debe), 0), coalesce(sum(c.total_haber), 0)
      into v_unidades, v_huella, v_lineas, v_debe, v_haber
      from retail.periodos p join retail.periodo_cierres c on c.id = p.cierre_id
     where p.mes = v_mes and p.alcance <> 'consolidado' and p.estado = 'cerrado';
    if v_unidades is null then
      raise exception 'No hay unidades cerradas en ese mes.' using errcode = 'P0001';
    end if;
  else
    -- Los chequeos que bloquean, medidos otra vez aquí (la pantalla no decide).
    select * into v_est from retail.fn_cierre_mes_estado(v_mes) e
     where e.alcance = p_alcance and e.ubicacion_id is not distinct from p_ubicacion_id;
    if not found then
      raise exception '% no es una unidad de ese mes.', v_nombre using errcode = 'P0001';
    end if;
    if v_est.bloqueantes > 0 then
      select string_agg(case x ->> 'clave'
               when 'cajas' then 'cerrar las cajas del mes'
               when 'egresos' then 'clasificar los egresos de caja'
               when 'regularizar' then 'regularizar las prendas vendidas'
               when 'diario' then 'que el diario cuadre'
               when 'planilla' then 'cerrarlo con una cuenta que vea la planilla en Dynamic'
               else x ->> 'clave' end, ', '
               order by i)
        into v_faltan
        from jsonb_array_elements(v_est.chequeos) with ordinality c(x, i)
       where (x ->> 'bloquea')::boolean and not (x ->> 'ok')::boolean;
      raise exception 'Todavía no se puede cerrar %: falta %.', v_nombre, v_faltan using errcode = 'P0001';
    end if;
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_avisos
      from jsonb_array_elements(v_est.chequeos) x
     where not (x ->> 'bloquea')::boolean and not (x ->> 'ok')::boolean and x ->> 'clave' <> 'huella';

    -- Se congela el diario de la unidad: las líneas de HOY de `fn_asientos`, numeradas en orden de lectura.
    insert into retail.diario_cerrado (cierre_id, n, fecha, ubicacion_id, asiento, regla, cuenta, debe, haber, origen_tabla, origen_id, glosa)
    select v_cierre, row_number() over (order by a.fecha, a.asiento collate "C", a.debe desc, a.cuenta collate "C", a.haber,
                                                 a.origen_id, a.glosa collate "C"),
           a.fecha, a.ubicacion_id, a.asiento, a.regla, a.cuenta, a.debe, a.haber, a.origen_tabla, a.origen_id, a.glosa
      from retail.fn_asientos(v_mes, v_fin, p_ubicacion_id) a
     where p_alcance = 'ubicacion' or a.ubicacion_id is null;

    select count(*), coalesce(sum(d.debe), 0), coalesce(sum(d.haber), 0) into v_lineas, v_debe, v_haber
      from retail.diario_cerrado d where d.cierre_id = v_cierre;
    -- El candado de ADR-0198: cada asiento congelado cuadra.
    if exists (select 1 from retail.diario_cerrado d where d.cierre_id = v_cierre
                group by d.asiento having round(sum(d.debe), 2) <> round(sum(d.haber), 2)) then
      raise exception 'El diario de % no cuadra: no se congela.', v_nombre using errcode = 'P0001';
    end if;
    -- La huella sale de las líneas GUARDADAS: es la que cualquiera puede recalcular después (`fn_huella_congelada`).
    v_huella := retail.fn_huella_congelada(v_cierre);
  end if;

  if v_per.id is null then
    insert into retail.periodos (mes, alcance, ubicacion_id, estado, cierre_id)
    values (v_mes, p_alcance, p_ubicacion_id, 'cerrado', v_cierre)
    returning * into v_per;
  else
    update retail.periodos set estado = 'cerrado', cierre_id = v_cierre, actualizado_en = now() where id = v_per.id;
  end if;
  select coalesce(max(c.version), 0) + 1 into v_version from retail.periodo_cierres c where c.periodo_id = v_per.id;

  insert into retail.periodo_cierres (id, periodo_id, mes, alcance, ubicacion_id, version, cerrado_por, huella, lineas,
                                      total_debe, total_haber, unidades, avisos)
  values (v_cierre, v_per.id, v_mes, p_alcance, p_ubicacion_id, v_version, v_actor, v_huella, v_lineas,
          v_debe, v_haber, v_unidades, v_avisos);

  return jsonb_build_object('cierre_id', v_cierre, 'huella', v_huella, 'lineas', v_lineas, 'version', v_version);
end $$;
comment on function retail.cerrar_periodo(date, text, uuid) is
  'Cierra el mes de una unidad (ubicacion | empresa) o el consolidado (ADR-0198, ADR-0195 F9): congela el diario con su huella y bloquea las fechas de ese mes. Solo el líder; firma con el responsable.';

-- ---------- 8. Reabrir ----------
create or replace function retail.reabrir_periodo(p_mes date, p_alcance text, p_ubicacion_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_actor uuid;
  v_per retail.periodos%rowtype;
  v_cons retail.periodos%rowtype;
  v_nombre text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Reabrir el mes es solo del líder.' using errcode = '42501';
  end if;
  if p_mes is null or p_alcance is null or p_alcance not in ('ubicacion', 'empresa')
     or (p_alcance = 'ubicacion') <> (p_ubicacion_id is not null) then
    raise exception 'Se reabre una tienda, el Taller o lo de la empresa (CAYLA entera se reabre sola con ellas).' using errcode = 'P0001';
  end if;
  if p_motivo is null or char_length(trim(p_motivo)) < 5 then
    raise exception 'Di por qué se reabre (queda en la historia).' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  v_nombre := retail.fn_texto_periodo(v_mes, p_alcance, p_ubicacion_id);

  perform pg_advisory_xact_lock(hashtextextended('cierre_mes:' || v_mes::text, 0));

  select * into v_per from retail.periodos p
   where p.mes = v_mes and p.alcance = p_alcance and p.ubicacion_id is not distinct from p_ubicacion_id
   for update;
  if not found or v_per.estado <> 'cerrado' then
    raise exception '% no está cerrado.', v_nombre using errcode = 'P0001';
  end if;

  update retail.periodo_cierres set reabierto_en = now(), reabierto_por = v_actor, motivo_reapertura = trim(p_motivo)
   where id = v_per.cierre_id;
  update retail.periodos set estado = 'reabierto', cierre_id = null, actualizado_en = now() where id = v_per.id;

  -- Reabrir una unidad reabre CAYLA entera de ese mes (ADR-0198): su huella incluía la de esta unidad.
  select * into v_cons from retail.periodos p where p.mes = v_mes and p.alcance = 'consolidado' for update;
  if found and v_cons.estado = 'cerrado' then
    update retail.periodo_cierres
       set reabierto_en = now(), reabierto_por = v_actor,
           motivo_reapertura = 'Se reabrió ' || retail.fn_unidad_nombre(p_alcance, p_ubicacion_id) || ': ' || trim(p_motivo)
     where id = v_cons.cierre_id;
    update retail.periodos set estado = 'reabierto', cierre_id = null, actualizado_en = now() where id = v_cons.id;
  end if;
end $$;
comment on function retail.reabrir_periodo(date, text, uuid, text) is
  'Reabre el mes de una unidad con motivo (ADR-0198): queda en la historia quién, cuándo y por qué; reabre también CAYLA entera de ese mes. Solo el líder.';

-- ---------- 9. El diario OFICIAL: lo congelado de los meses cerrados y lo vivo del resto ----------
-- Mismas columnas que `fn_asientos` más `congelado`. Para cada unidad y mes cerrados trae las líneas de `diario_cerrado`;
-- para lo demás, las de `fn_asientos`. Mismo permiso que `fn_asientos` (el líder, todo; con «Reportes financieros», su
-- tienda) y la planilla congelada solo para quien la ve en Dynamic. Así lo usan F5 y F7: cambiar
-- `retail.fn_asientos(desde, hasta, ubicación)` por `retail.fn_diario(desde, hasta, ubicación)` en su CTE del diario.
create or replace function retail.fn_diario(p_desde date, p_hasta date, p_ubicacion_id uuid default null)
returns table (
  fecha date, ubicacion_id uuid, asiento text, regla text, cuenta text,
  debe numeric, haber numeric, origen_tabla text, origen_id uuid, glosa text, congelado boolean
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_lider boolean := retail.fn_es_lider();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_todo boolean;
  v_planilla boolean := retail.fn_planilla_visible();
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido.' using errcode = 'P0001';
  end if;
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver los números financieros necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  if p_ubicacion_id is not null then
    if not (p_ubicacion_id = any (v_ubics)) then
      raise exception 'No puedes ver los números de esa ubicación.' using errcode = '42501';
    end if;
    v_ubics := array[p_ubicacion_id];
  end if;
  v_todo := v_lider and p_ubicacion_id is null;

  return query
  with cerr as materialized (
    select p.mes, p.alcance, p.ubicacion_id, p.cierre_id
      from retail.periodos p
     where p.estado = 'cerrado' and p.alcance <> 'consolidado'
       and p.mes between date_trunc('month', p_desde)::date and p_hasta
  )
  select d.fecha, d.ubicacion_id, d.asiento, d.regla, d.cuenta, d.debe, d.haber, d.origen_tabla, d.origen_id, d.glosa, true
    from cerr c join retail.diario_cerrado d on d.cierre_id = c.cierre_id
   where d.fecha between p_desde and p_hasta
     and (v_todo or d.ubicacion_id = any (v_ubics))
     and (v_planilla or d.regla <> 'planilla')
  union all
  select a.fecha, a.ubicacion_id, a.asiento, a.regla, a.cuenta, a.debe, a.haber, a.origen_tabla, a.origen_id, a.glosa, false
    from retail.fn_asientos(p_desde, p_hasta, p_ubicacion_id) a
   where not exists (
     select 1 from cerr c
      where c.mes = date_trunc('month', a.fecha)::date
        and ((a.ubicacion_id is null and c.alcance = 'empresa') or (c.alcance = 'ubicacion' and c.ubicacion_id = a.ubicacion_id)))
   order by 1, 3, 6 desc, 5;
end $$;
comment on function retail.fn_diario(date, date, uuid) is
  'El diario oficial (ADR-0198): las líneas congeladas de cada unidad y mes cerrados, y las de fn_asientos para lo abierto. Mismas columnas que fn_asientos más «congelado».';

-- ---------- 10. Permisos ----------
do $$
declare f text;
begin
  foreach f in array array[
    'retail.fn_periodos_mes(date)',
    'retail.fn_mes_cerrado(uuid, date)',
    'retail.fn_cierre_mes_estado(date)',
    'retail.fn_cierre_panel(date)',
    'retail.cerrar_periodo(date, text, uuid)',
    'retail.reabrir_periodo(date, text, uuid, text)',
    'retail.fn_diario(date, date, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function retail.fn_mes_nombre(date) from public, anon;
revoke all on function retail.fn_diario_linea_texto(date, uuid, text, text, text, numeric, numeric, text, uuid, text) from public, anon;
revoke all on function retail.fn_huella_de_textos(text[]) from public, anon;
revoke all on function retail.fn_primer_mes_cerrado(uuid, date, date) from public, anon, authenticated;
revoke all on function retail.fn_exigir_mes_abierto(uuid, date, date, text, text) from public, anon, authenticated;
revoke all on function retail.fn_exigir_venta_abierta(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_huella_congelada(uuid) from public, anon, authenticated;
revoke all on function retail.fn_unidad_nombre(text, uuid) from public, anon, authenticated;
revoke all on function retail.fn_texto_periodo(date, text, uuid) from public, anon, authenticated;
revoke all on function retail.fn_periodos_no_se_borran() from public, anon, authenticated;
revoke all on function retail.fn_periodo_cierres_inmutable() from public, anon, authenticated;
revoke all on function retail.fn_diario_cerrado_inmutable() from public, anon, authenticated;

-- ---------- 11. Los disparadores del candado (las funciones; cada disparador se crea en su PARTE) ----------
-- `security definer`: miran `periodos` aunque quien escribe no pueda leerla. Solo levantan un error: no cambian nada.

create or replace function retail.fn_candado_gastos() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  if tg_op = 'INSERT' then
    perform retail.fn_exigir_mes_abierto(new.ubicacion_id, new.fecha);
  elsif (new.estado, new.fecha, new.ubicacion_id, new.monto_total, new.igv, new.categoria, new.compra_id, new.medio_pago)
        is distinct from (old.estado, old.fecha, old.ubicacion_id, old.monto_total, old.igv, old.categoria, old.compra_id, old.medio_pago) then
    perform retail.fn_exigir_mes_abierto(old.ubicacion_id, old.fecha, null, case when new.estado = 'anulado' and old.estado <> 'anulado' then 'anular este gasto' else 'cambiar este gasto' end);
    perform retail.fn_exigir_mes_abierto(new.ubicacion_id, new.fecha, null, 'cambiar este gasto');
  end if;
  return new;
end $$;

-- Facturas de proveedor (mercadería, gasto y activo). Solo miran las columnas que llegan al diario: un pago (que suma a
-- `pagado`) o una recepción no disparan esto.
create or replace function retail.fn_candado_compras() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare r record;
begin
  if tg_op = 'INSERT' then
    perform retail.fn_exigir_mes_abierto(new.ubicacion_gestion_id, new.fecha_emision);
    return new;
  end if;
  if (new.estado, new.fecha_emision, new.subtotal, new.igv, new.total, new.ubicacion_gestion_id, new.naturaleza)
     is distinct from (old.estado, old.fecha_emision, old.subtotal, old.igv, old.total, old.ubicacion_gestion_id, old.naturaleza) then
    perform retail.fn_exigir_mes_abierto(old.ubicacion_gestion_id, old.fecha_emision, null,
      case when new.estado = 'anulada' and old.estado <> 'anulada' then 'anular esta factura' else 'cambiar esta factura' end);
    perform retail.fn_exigir_mes_abierto(new.ubicacion_gestion_id, new.fecha_emision, null, 'cambiar esta factura');
    -- Anulada, sus pagos, notas y reembolsos salen del diario: sus meses también tienen que estar abiertos.
    if new.estado is distinct from old.estado then
      for r in
        select coalesce(p.ubicacion_id, old.ubicacion_gestion_id) as u, p.fecha as f from retail.compra_pagos p where p.compra_id = old.id
        union all select old.ubicacion_gestion_id, n.fecha from retail.compra_notas_credito n where n.compra_id = old.id
        union all select old.ubicacion_gestion_id, k.fecha from retail.proveedor_creditos k where k.compra_id = old.id and k.tipo = 'reembolso'
      loop
        perform retail.fn_exigir_mes_abierto(r.u, r.f, null, 'anular esta factura (tiene pagos o notas en ese mes)');
      end loop;
    end if;
  end if;
  return new;
end $$;

-- Pagos a proveedores: la unidad es la del pago (su tienda) o la de la factura, como en el diario (F5).
create or replace function retail.fn_candado_compra_pagos() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_gestora_new uuid; v_gestora_old uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select c.ubicacion_gestion_id into v_gestora_old from retail.compras c where c.id = old.compra_id;
    perform retail.fn_exigir_mes_abierto(coalesce(old.ubicacion_id, v_gestora_old), old.fecha, null, 'cambiar este pago');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  select c.ubicacion_gestion_id into v_gestora_new from retail.compras c where c.id = new.compra_id;
  if tg_op = 'INSERT' then
    perform retail.fn_exigir_mes_abierto(coalesce(new.ubicacion_id, v_gestora_new), new.fecha);
  else
    perform retail.fn_exigir_mes_abierto(coalesce(new.ubicacion_id, v_gestora_new), new.fecha, null, 'cambiar este pago');
  end if;
  return new;
end $$;

create or replace function retail.fn_candado_compra_notas_credito() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  perform retail.fn_exigir_mes_abierto((select c.ubicacion_gestion_id from retail.compras c where c.id = new.compra_id), new.fecha);
  return new;
end $$;

-- Solo el reembolso asienta (la nota y la aplicación del saldo ya pasan por sus propias tablas).
create or replace function retail.fn_candado_proveedor_creditos() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  if new.tipo = 'reembolso' then
    perform retail.fn_exigir_mes_abierto((select c.ubicacion_gestion_id from retail.compras c where c.id = new.compra_id), new.fecha);
  end if;
  return new;
end $$;

-- Un activo toca el mes de su compra y TODOS los meses en que se deprecia (hasta su vida útil); la baja, desde su fecha.
create or replace function retail.fn_candado_activos_fijos() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_fin_vida date;
begin
  if tg_op = 'INSERT' then
    v_fin_vida := (date_trunc('month', new.fecha_adquisicion) + make_interval(months => new.vida_util_meses))::date;
    perform retail.fn_exigir_mes_abierto(new.ubicacion_id, new.fecha_adquisicion, v_fin_vida, null, 'este activo se deprecia en ese mes');
    return new;
  end if;
  v_fin_vida := (date_trunc('month', old.fecha_adquisicion) + make_interval(months => old.vida_util_meses))::date;
  if new.estado = 'anulado' and old.estado <> 'anulado' then
    -- Anulado, «nunca existió»: desaparecen su alta y todas sus depreciaciones.
    perform retail.fn_exigir_mes_abierto(old.ubicacion_id, old.fecha_adquisicion, v_fin_vida, 'anular este activo');
  elsif new.estado = 'baja' and old.estado <> 'baja' then
    -- Desde el mes de la baja deja de depreciarse y sale de la cuenta.
    perform retail.fn_exigir_mes_abierto(old.ubicacion_id, new.fecha_baja, greatest(new.fecha_baja, v_fin_vida),
      'darlo de baja con esa fecha');
  elsif (new.fecha_adquisicion, new.costo, new.valor_residual, new.vida_util_meses, new.ubicacion_id, new.fecha_baja, new.estado)
        is distinct from (old.fecha_adquisicion, old.costo, old.valor_residual, old.vida_util_meses, old.ubicacion_id, old.fecha_baja, old.estado) then
    perform retail.fn_exigir_mes_abierto(old.ubicacion_id, old.fecha_adquisicion, v_fin_vida, 'cambiar este activo');
  end if;
  return new;
end $$;

-- Movimientos de dinero: las DOS puntas. La unidad de una cuenta es su tienda (cajón, caja fuerte) o la empresa (banco,
-- POS, tarjeta, lo que tiene el líder).
create or replace function retail.fn_candado_movimientos_dinero() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare r record; v_para text;
begin
  if tg_op = 'INSERT' then
    for r in select cd.ubicacion_id as u from retail.cuentas_dinero cd where cd.id in (new.cuenta_origen_id, new.cuenta_destino_id) loop
      perform retail.fn_exigir_mes_abierto(r.u, new.fecha);
    end loop;
  elsif (new.estado, new.fecha, new.monto, new.cuenta_origen_id, new.cuenta_destino_id)
        is distinct from (old.estado, old.fecha, old.monto, old.cuenta_origen_id, old.cuenta_destino_id) then
    v_para := case when new.estado = 'anulado' and old.estado <> 'anulado' then 'anular este movimiento' else 'cambiar este movimiento' end;
    for r in select cd.ubicacion_id as u from retail.cuentas_dinero cd where cd.id in (old.cuenta_origen_id, old.cuenta_destino_id) loop
      perform retail.fn_exigir_mes_abierto(r.u, old.fecha, null, v_para);
    end loop;
  end if;
  return new;
end $$;

-- Marcar una venta «de prueba» la saca del diario de todos los meses en que tocó algo.
create or replace function retail.fn_candado_ventas() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  if new.es_prueba is distinct from old.es_prueba then
    perform retail.fn_exigir_venta_abierta(old.id, 'marcar esta venta como de prueba');
  end if;
  return new;
end $$;

-- Cambiar el costo o el monto de una prenda vendida (regularizar una prenda sin variante) cambia el costo de lo vendido.
create or replace function retail.fn_candado_venta_items() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  if (new.costo_unitario, new.cantidad, new.precio_unitario, new.descuento_unitario)
     is distinct from (old.costo_unitario, old.cantidad, old.precio_unitario, old.descuento_unitario) then
    perform retail.fn_exigir_venta_abierta(old.venta_id, 'cambiar esta prenda vendida (regularizarla)');
  end if;
  return new;
end $$;

revoke all on function retail.fn_candado_gastos() from public, anon, authenticated;
revoke all on function retail.fn_candado_compras() from public, anon, authenticated;
revoke all on function retail.fn_candado_compra_pagos() from public, anon, authenticated;
revoke all on function retail.fn_candado_compra_notas_credito() from public, anon, authenticated;
revoke all on function retail.fn_candado_proveedor_creditos() from public, anon, authenticated;
revoke all on function retail.fn_candado_activos_fijos() from public, anon, authenticated;
revoke all on function retail.fn_candado_movimientos_dinero() from public, anon, authenticated;
revoke all on function retail.fn_candado_ventas() from public, anon, authenticated;
revoke all on function retail.fn_candado_venta_items() from public, anon, authenticated;

-- ============================== PARTE 2 · gastos (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';
create or replace trigger gastos_mes_abierto before insert or update on retail.gastos
  for each row execute function retail.fn_candado_gastos();

-- ============================== PARTE 3 · compras (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';
create or replace trigger compras_mes_abierto
  before insert or update of estado, fecha_emision, subtotal, igv, total, ubicacion_gestion_id, naturaleza on retail.compras
  for each row execute function retail.fn_candado_compras();

-- ============================== PARTE 4 · compra_pagos (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';
create or replace trigger compra_pagos_mes_abierto before insert or update or delete on retail.compra_pagos
  for each row execute function retail.fn_candado_compra_pagos();

-- ============================== PARTE 5 · compra_notas_credito (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';
create or replace trigger compra_notas_credito_mes_abierto before insert on retail.compra_notas_credito
  for each row execute function retail.fn_candado_compra_notas_credito();

-- ============================== PARTE 6 · proveedor_creditos (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';
create or replace trigger proveedor_creditos_mes_abierto before insert on retail.proveedor_creditos
  for each row execute function retail.fn_candado_proveedor_creditos();

-- ============================== PARTE 7 · activos_fijos (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';
create or replace trigger activos_fijos_mes_abierto before insert or update on retail.activos_fijos
  for each row execute function retail.fn_candado_activos_fijos();

-- ============================== PARTE 8 · movimientos_dinero (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';
create or replace trigger movimientos_dinero_mes_abierto before insert or update on retail.movimientos_dinero
  for each row execute function retail.fn_candado_movimientos_dinero();

-- ============================== PARTE 9 · ventas (sola) ==============================
-- Solo al cambiar `es_prueba` (archivar una venta de prueba). Vender, anular y devolver NO lo disparan.
set search_path = retail, public, extensions;
set lock_timeout = '3s';
create or replace trigger ventas_mes_abierto before update of es_prueba on retail.ventas
  for each row execute function retail.fn_candado_ventas();

-- ============================== PARTE 10 · venta_items (sola) ==============================
-- Solo al cambiar el costo o el monto de una prenda ya vendida (regularizar). Vender (INSERT) NO lo dispara.
set search_path = retail, public, extensions;
set lock_timeout = '3s';
create or replace trigger venta_items_mes_abierto
  before update of costo_unitario, cantidad, precio_unitario, descuento_unitario on retail.venta_items
  for each row execute function retail.fn_candado_venta_items();
