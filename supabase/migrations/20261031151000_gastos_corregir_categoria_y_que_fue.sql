-- ============================================================================
-- 20261031151000_gastos_corregir_categoria_y_que_fue.sql — CAYLA V2 · ADR-0588 (Gastos: corregir un gasto en vez de anularlo)
-- Finanzas ▸ Gastos: corregir la categoría y el «qué fue» de un gasto sin anularlo (Felipe, 2026-10-31, punto 1 de la comparación con las apps de
-- gastos de hoy: Mercury y Kick corrigen la categoría en su lugar).
--
-- EL PROBLEMA PRIMERO. Un gasto no se podía tocar: `fn_gastos_solo_anular` solo deja anularlo. Si la colaboradora elegía «Limpieza» y eran bolsas,
-- tenía que anularlo y registrarlo otra vez: la lista se llenaba de tachados y, si salió del cajón, anular no devuelve la plata a la caja (hay que
-- corregirla aparte). Y un gasto con factura al contado ni siquiera se anula («su comprobante ya tiene pagos»): su categoría equivocada se quedaba
-- para siempre, contando en el hilo equivocado de «En qué se va», en el rubro equivocado del Presupuesto y, en Lima, en el reparto equivocado con CLAURE.
--
-- QUÉ SE CORRIGE Y QUÉ NO. Solo la categoría y el «qué fue»: no mueven plata. El monto, cómo se pagó, de dónde salió, la sede y la fecha SÍ mueven
-- (la caja, las cuentas, el comprobante, el mes): esos siguen el camino de siempre (anular y registrar de nuevo) y cambiarlos es decisión de Felipe.
-- La categoría sí cambia cuentas que no son plata: la línea del Estado de resultados (su `cuenta_pcge`), el rubro del Presupuesto y, en Lima, lo
-- que se le carga a CLAURE (su reparto va por categoría, `gasto_reparto_claure`). Por eso un mes CERRADO no se corrige: `fn_candado_gastos` ya mira
-- la categoría y pide reabrirlo con motivo. El «qué fue» no cambia ninguna cifra y se corrige también en un mes cerrado.
--
-- QUÉ HACE
--   1. `gasto_correcciones`: el rastro. Una fila por dato cambiado (categoría o qué fue: antes y ahora), con quién y cuándo, agrupadas por `lote` (un
--      guardado). Append-only (disparador): no se cambia ni se borra. Solo se lee por `fn_correcciones_de_gasto`.
--   2. `fn_gastos_solo_anular` deja cambiar la categoría y la descripción SOLO dentro de `corregir_gasto` (la marca de la transacción
--      `retail.gastos_corrigiendo` = el id de ESE gasto; la de otro no sirve). Todo lo demás sigue igual: no se borra, no se edita, solo se anula.
--   3. `corregir_gasto(gasto, lote, categoría, qué fue)`: valida con las reglas de `registrar_gasto` y escribe todo o nada. El `lote` nace al abrir
--      la hoja: dos toques con el mismo lote devuelven lo que ya quedó (`ya_estaba`); el mismo lote en otro gasto se rechaza. «No cambiaste nada» no
--      escribe.
--   4. `fn_correcciones_de_gasto(gasto)`: el rastro para leerlo, con el mismo formato que `fn_gasto_correcciones` de Mis compras (ADR-0572).
--
-- CUÁNDO NO SE PUEDE (la base lo exige, no la pantalla): sin el módulo Gastos de esa tienda (`fn_gastos_puede`, lo mismo que para anular); un gasto
-- anulado; un gasto del viaje de compra (`traer_mercaderia`, `viaje_compra`: su IGV vive sin comprobante y se corrige en Compras); la comisión de un
-- abono de tarjeta (se corrige anulando el abono); un gasto ya puesto en una rendición del fondo (lo rendido queda congelado, como al anular); y la
-- categoría de un mes cerrado.
--
-- CANDADOS. El del lote (`gasto_correccion:`), después la fila del gasto `for update`, que es también lo primero que toma `anular_gasto`: si alguien
-- lo anula a la vez, uno espera al otro; si gana anular, la corrección ve «anulado» y no escribe nada. Para el fondo, la misma clave `fondo:` que
-- toman anular y la rendición.
--
-- DESCARTÉ
--   · Corregir el monto o el pago aquí: mueven la caja, las cuentas y el comprobante; es otra decisión (ADR-0588, «Lo que no se hizo»).
--   · Reusar `compra_gasto_correcciones` (Mis compras): su `gasto_id` apunta a `compra_gastos` y su `campo` es otro conjunto; mezclarlos habría exigido
--     un `alter table` de una tabla de otra función.
--   · Una columna `corregido` en `gastos`: `alter table` de una tabla en uso y un dato que ya sale del rastro.
--   · Copiar el «qué fue» a la nota de su comprobante (`compras.nota`): el comprobante es del proveedor y Compras lo muestra por su número; Gastos lee
--     siempre `gastos.descripcion`.
--
-- LO QUE NO TOCA. Ningún gasto anterior, ningún movimiento de dinero ni de caja, `registrar_gasto`, `anular_gasto`, `fn_candado_gastos` (ya mira la
-- categoría), `fn_gastos_lista` ni `fn_gastos_panel` (leen la categoría viva: el gasto corregido se cuenta solo donde va).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA sola parte: una tabla nueva (vacía) con RLS y sin políticas (solo la leen funciones security
-- definer), una función de disparador reemplazada y funciones nuevas; sin `alter` de tablas en uso, sin políticas ni `drop trigger` (ADR-0195).
-- `create or replace` y `if not exists` en todo: idempotente. Sin `select … into` dentro de textos entre comillas (ADR-0288).
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. El rastro de lo que se corrigió ----------
create table if not exists retail.gasto_correcciones (
  id uuid primary key default gen_random_uuid(),
  -- Un guardado de la hoja = un lote: sus filas comparten este identificador (y es lo que evita corregir dos veces con dos toques).
  lote uuid not null,
  gasto_id uuid not null references retail.gastos (id),
  campo text not null check (campo in ('categoria', 'descripcion')),
  -- La categoría va por su código (`categorias_gasto.codigo`): el nombre se lee al mostrarlo, así un renombre no deja el rastro viejo.
  antes text not null,
  despues text not null,
  corregida_por uuid not null references public.personas (id),
  corregida_en timestamptz not null default now(),
  constraint gasto_correcciones_cambia check (antes is distinct from despues)
);
comment on table retail.gasto_correcciones is
  'ADR-0588: el rastro de las correcciones de un gasto de Finanzas (categoría y qué fue): antes y ahora, quién y cuándo. No se cambia ni se borra.';
create index if not exists gasto_correcciones_gasto on retail.gasto_correcciones (gasto_id, corregida_en);
create unique index if not exists gasto_correcciones_lote_dato on retail.gasto_correcciones (lote, gasto_id, campo);

alter table retail.gasto_correcciones enable row level security;
revoke all on retail.gasto_correcciones from anon, authenticated;

create or replace function retail.fn_gasto_correcciones_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'El rastro de una corrección no se cambia ni se borra.' using errcode = 'P0001';
end $$;
revoke all on function retail.fn_gasto_correcciones_inmutable() from public, anon, authenticated;
create or replace trigger gasto_correcciones_inmutable
  before update or delete on retail.gasto_correcciones
  for each row execute function retail.fn_gasto_correcciones_inmutable();

-- ---------- 2. Un gasto solo se anula, salvo al corregir su categoría y su «qué fue» ----------
-- Se reescribe entera (la anterior es de 20260924235100): queda igual salvo la excepción de la marca.
create or replace function retail.fn_gastos_solo_anular()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un gasto no se borra: se anula con un motivo.' using errcode = 'P0001';
  end if;
  if old.estado = 'anulado' then
    raise exception 'Un gasto anulado no se modifica.' using errcode = 'P0001';
  end if;
  -- ADR-0588: dentro de `corregir_gasto` (la marca es el id de ESTE gasto) cambian la categoría y el «qué fue», y nada más.
  if new.estado = 'vigente' and coalesce(current_setting('retail.gastos_corrigiendo', true), '') = old.id::text then
    if (new.id, new.ubicacion_id, new.fecha, new.monto_total, new.igv, new.compra_id, new.medio_pago, new.caja_movimiento_id,
        new.registrado_por, new.token_cliente, new.created_at, new.cuenta_dinero_id, new.gasto_fijo_id)
       is distinct from
       (old.id, old.ubicacion_id, old.fecha, old.monto_total, old.igv, old.compra_id, old.medio_pago, old.caja_movimiento_id,
        old.registrado_por, old.token_cliente, old.created_at, old.cuenta_dinero_id, old.gasto_fijo_id) then
      raise exception 'Al corregir un gasto solo cambian su categoría y qué fue.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.estado <> 'anulado' then
    raise exception 'Un gasto solo cambia para anularse.' using errcode = 'P0001';
  end if;
  if (new.id, new.ubicacion_id, new.categoria, new.descripcion, new.fecha, new.monto_total, new.igv, new.compra_id,
      new.medio_pago, new.caja_movimiento_id, new.registrado_por, new.token_cliente, new.created_at)
     is distinct from
     (old.id, old.ubicacion_id, old.categoria, old.descripcion, old.fecha, old.monto_total, old.igv, old.compra_id,
      old.medio_pago, old.caja_movimiento_id, old.registrado_por, old.token_cliente, old.created_at) then
    raise exception 'Un gasto no se edita: se anula y se registra uno nuevo.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- 3. Corregir la categoría y el «qué fue» ----------
create or replace function retail.corregir_gasto(p_gasto_id uuid, p_lote uuid, p_categoria text, p_descripcion text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_g retail.gastos%rowtype;
  v_cat retail.categorias_gasto%rowtype;
  v_desc text := btrim(coalesce(p_descripcion, ''));
  v_actor uuid;
  v_de_otro uuid;
  v_persona_fondo uuid;
  v_cambios int := 0;
begin
  if p_gasto_id is null or p_lote is null then
    raise exception 'Falta el gasto o el guardado.' using errcode = 'P0001';
  end if;
  -- Dos toques con el mismo lote: el segundo espera al primero y devuelve lo que ya quedó.
  perform pg_advisory_xact_lock(hashtextextended('gasto_correccion:' || p_lote::text, 0));
  v_de_otro := (select c.gasto_id from retail.gasto_correcciones c where c.lote = p_lote limit 1);
  if v_de_otro is not null then
    if v_de_otro <> p_gasto_id then
      raise exception 'Ese guardado ya se usó en otro gasto: vuelve a abrir la hoja.' using errcode = 'P0001';
    end if;
    return jsonb_build_object('ya_estaba', true, 'cambios', (select count(*) from retail.gasto_correcciones c where c.lote = p_lote));
  end if;

  select * into v_g from retail.gastos where id = p_gasto_id for update;
  if not found then
    raise exception 'Ese gasto no existe.' using errcode = 'P0001';
  end if;
  if not retail.fn_gastos_puede(v_g.ubicacion_id) then
    raise exception 'No puedes corregir gastos de esa tienda.' using errcode = '42501';
  end if;
  if v_g.estado = 'anulado' then
    raise exception 'Ese gasto está anulado: ya no se corrige.' using errcode = 'P0001';
  end if;
  if v_g.categoria in ('traer_mercaderia', 'viaje_compra') then
    raise exception 'Es un gasto del viaje de compra: se corrige en Compras.' using errcode = 'P0001';
  end if;
  if exists (select 1 from retail.movimientos_dinero d where d.gasto_comision_id = p_gasto_id and d.estado = 'vigente') then
    raise exception 'Es la comisión de un abono de tarjeta: se corrige anulando el abono, en Cuentas y dinero.' using errcode = 'P0001';
  end if;
  -- Lo rendido queda congelado (ADR-0362 fase 6, como al anular): con la misma clave del fondo que toman anular y la rendición.
  v_persona_fondo := (select f.persona_id from retail.cuentas_dinero f where f.id = v_g.cuenta_dinero_id and f.tipo = 'fondo');
  if v_persona_fondo is not null then
    perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_persona_fondo::text, 0));
    if exists (select 1 from retail.rendicion_fondo_items i where i.clave = 'gasto:' || p_gasto_id::text and i.vigente) then
      raise exception 'Ese gasto ya está en una rendición del fondo: ya no se corrige. Si la rendición está por aprobar, que la devuelvan para corregirla.'
        using errcode = 'P0001', hint = 'en_rendicion';
    end if;
  end if;

  select * into v_cat from retail.categorias_gasto where codigo = p_categoria;
  if not found or not v_cat.activo or p_categoria in ('traer_mercaderia', 'viaje_compra') then
    raise exception 'Elige una categoría de la lista.' using errcode = 'P0001';
  end if;
  if v_desc = '' then
    raise exception 'Escribe qué se pagó.' using errcode = 'P0001';
  end if;
  if char_length(v_desc) > 200 then
    raise exception 'Qué se pagó cabe en 200 letras.' using errcode = 'P0001';
  end if;
  if p_categoria = v_g.categoria and v_desc = v_g.descripcion then
    return jsonb_build_object('ya_estaba', false, 'cambios', 0);
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Sin sesión no se corrige un gasto.' using errcode = '42501';
  end if;

  -- `fn_candado_gastos` corre en este update: con el mes cerrado, la categoría no cambia («reábrelo con motivo para cambiar este gasto»).
  perform set_config('retail.gastos_corrigiendo', p_gasto_id::text, true);
  update retail.gastos set categoria = p_categoria, descripcion = v_desc where id = p_gasto_id;
  perform set_config('retail.gastos_corrigiendo', '', true);

  if p_categoria <> v_g.categoria then
    insert into retail.gasto_correcciones (lote, gasto_id, campo, antes, despues, corregida_por)
    values (p_lote, p_gasto_id, 'categoria', v_g.categoria, p_categoria, v_actor);
    v_cambios := v_cambios + 1;
  end if;
  if v_desc <> v_g.descripcion then
    insert into retail.gasto_correcciones (lote, gasto_id, campo, antes, despues, corregida_por)
    values (p_lote, p_gasto_id, 'descripcion', v_g.descripcion, v_desc, v_actor);
    v_cambios := v_cambios + 1;
  end if;
  return jsonb_build_object('ya_estaba', false, 'cambios', v_cambios);
end $$;
comment on function retail.corregir_gasto(uuid, uuid, text, text) is
  'ADR-0588: corrige la categoría y el «qué fue» de un gasto de Finanzas, con rastro (gasto_correcciones). El monto y el pago no se corrigen aquí.';
revoke all on function retail.corregir_gasto(uuid, uuid, text, text) from public, anon;
grant execute on function retail.corregir_gasto(uuid, uuid, text, text) to authenticated;

-- ---------- 4. El rastro de un gasto, para leerlo ----------
-- Lo ve quien ve los gastos de esa tienda (`fn_gastos_puede`). Cada corrección (un lote = un guardado) con quién, cuándo y qué cambió, de la más
-- nueva a la más vieja; la categoría, con su nombre de hoy. Mismo formato que `fn_gasto_correcciones` (Mis compras). No escribe nada.
create or replace function retail.fn_correcciones_de_gasto(p_gasto_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not exists (select 1 from retail.gastos g where g.id = p_gasto_id and retail.fn_gastos_puede(g.ubicacion_id)) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(l.fila order by l.cuando desc)
      from (
        select max(c.corregida_en) as cuando,
               jsonb_build_object(
                 'lote', c.lote,
                 'cuando', max(c.corregida_en),
                 'quien', (select nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), '') from public.personas pe where pe.id = min(c.corregida_por::text)::uuid),
                 'cambios', jsonb_agg(jsonb_build_object(
                              'campo', c.campo,
                              'antes', case when c.campo = 'categoria' then coalesce((select k.nombre from retail.categorias_gasto k where k.codigo = c.antes), c.antes) else c.antes end,
                              'despues', case when c.campo = 'categoria' then coalesce((select k.nombre from retail.categorias_gasto k where k.codigo = c.despues), c.despues) else c.despues end,
                              'prenda', null)
                            order by c.campo)) as fila
          from retail.gasto_correcciones c
         where c.gasto_id = p_gasto_id
         group by c.lote
      ) l), '[]'::jsonb);
end $$;
revoke all on function retail.fn_correcciones_de_gasto(uuid) from public, anon;
grant execute on function retail.fn_correcciones_de_gasto(uuid) to authenticated;
