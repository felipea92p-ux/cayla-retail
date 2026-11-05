-- ============================================================================
-- 20261019202000_club_puntos_ganar.sql — CAYLA V2 · Club · puntos, actividad 2 de 12: ganar puntos al cobrar
-- Sigue a `20261019201000_club_puntos_base.sql` (las tablas y `fn_club_puntos_anotar`). Una sola parte: solo funciones y
-- disparadores sobre `ventas` y `devoluciones` (CLAUDE.md, «Políticas y deadlocks»: ningún `alter` de tablas en uso ni políticas;
-- `create or replace trigger`, nunca `drop trigger`).
--
-- EL PROBLEMA. Hasta ahora una compra no deja nada en el Club salvo el canje del cumpleaños. Felipe decidió (2026-10-19) que cada
-- compra de una MIEMBRO suma 1 punto por cada S/ 1 que paga de verdad, que en el mes de su cumpleaños la primera compra suma además
-- 100 de regalo, y que si la venta se anula o se devuelve algo, los puntos se restan (Términos, 5.5).
--
-- QUÉ HACE
--   1. `fn_club_puntos_por_venta(venta)`: suma los puntos de una venta recién hecha. Solo si la venta tiene ficha, la ficha es
--      miembro (club_desde, no anonimizada) y la venta no es de prueba. Puntos = lo que PAGA (precio − descuento de cada línea, ya
--      con cupones y rebajas, menos lo devuelto) × los puntos por sol vigentes el día de la venta, en bloques enteros. Y, si es
--      el mes de su cumpleaños, el regalo (una vez al año).
--   2. `fn_club_puntos_conciliar_venta(venta)`: pone los puntos de una venta al día con lo que hoy vale: 0 si se anuló, o lo que
--      corresponde a lo que no se devolvió. Solo resta (con una reversa enlazada a la compra) y nunca más de lo que la miembro
--      tiene: el saldo no puede quedar negativo (principio 2). Si se anula, también deshace el regalo de cumpleaños de esa venta,
--      que se podrá volver a dar con otra compra del año. Es idempotente: llamarla dos veces no quita dos veces.
--   3. Tres disparadores la llaman: al anular una venta, al aprobar una devolución y al agregar una línea a una devolución ya aprobada. No pueden tumbar la anulación ni la
--      devolución: si algo falla, se avisa (warning) y la operación sigue (principio 9).
--   4. `registrar_venta`: una llamada al final, protegida (si falla, la venta sigue y se avisa). Es un reemplazo ANCLADO sobre la
--      definición viva, no una copia: `registrar_venta` se redefinió muchas veces (ADR-0288) y copiar un cuerpo viejo pisaría lo
--      que vino después.
--
-- DECIDÍ: los puntos se calculan DESDE la venta ya guardada (fn_club_monto_neto_venta), no desde lo que manda la caja: la caja no
--   puede inflarlos. Lo que paga incluye el IGV y no resta el redondeo del efectivo (centavos).
-- DECIDÍ: una venta suma puntos aunque el cobro lo haga una cajera sin permiso sobre Clientes: no depende del módulo.
-- DECIDÍ (por confirmar con Felipe, Términos 5.5): si la miembro ya gastó los puntos que habría que restar, se resta lo que tiene
--   y el resto se pierde para CAYLA; el saldo nunca queda negativo. El regalo de cumpleaños solo se revierte al ANULAR la venta, no
--   en una devolución parcial.
-- DESCARTÉ: un `unique` para el regalo de cumpleaños (no deja volver a darlo tras anular la venta), y que la caja mande los puntos.
-- SE ROMPE SI: una venta con ficha de miembro deja de llamar a `fn_club_puntos_por_venta` (por eso la prueba (m) mira el
--   texto vivo de registrar_venta), o `fn_club_monto_neto_venta` deja de restar lo devuelto.
--
-- CÓMO SE PEGA: este archivo SOLO en el SQL Editor de producción, después de `20261019201000`. Es idempotente. `lock_timeout` 3 s.
-- Dentro de los textos entre comillas no hay ningún `select … into` (ADR-0288: el SQL Editor lo confunde con un SELECT INTO).
-- CAÍDA EXTERNA. Nada de esto llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Los puntos de una venta recién hecha ----------
create or replace function retail.fn_club_puntos_por_venta(p_venta_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta record;
  v_ficha record;
  v_fecha date;
  v_cfg retail.club_puntos_config;
  v_puntos integer;
begin
  select v.cliente_id, v.created_at, v.estado, v.es_prueba, v.usuario_id into v_venta
    from retail.ventas v where v.id = p_venta_id;
  if not found or v_venta.cliente_id is null or v_venta.estado <> 'completada' or v_venta.es_prueba then
    return;
  end if;

  -- Solo una MIEMBRO suma. Una ficha «Identificado» (solo documento) no aceptó los Términos: no suma, y no es un error.
  select c.club_desde, c.anonimizada, c.cumple_mes into v_ficha from retail.clientas c where c.id = v_venta.cliente_id;
  if not found or v_ficha.club_desde is null or v_ficha.anonimizada then
    return;
  end if;

  v_fecha := (v_venta.created_at at time zone 'America/Lima')::date;
  v_cfg := retail.fn_club_puntos_config(v_fecha);

  v_puntos := floor(retail.fn_club_monto_neto_venta(p_venta_id) * v_cfg.puntos_por_sol)::integer;
  if v_puntos > 0 then
    perform retail.fn_club_puntos_anotar(v_venta.cliente_id, 'compra', v_puntos, p_venta_id, null, null, null, v_venta.usuario_id);
  end if;

  -- El regalo: en el mes de su cumpleaños, una vez al año (el disparador de guardas lo hace imposible dos veces).
  if v_ficha.cumple_mes = extract(month from v_fecha)::smallint and v_cfg.regalo_cumple_puntos > 0 then
    begin
      perform retail.fn_club_puntos_anotar(v_venta.cliente_id, 'cumple', v_cfg.regalo_cumple_puntos, p_venta_id,
                                           extract(year from v_fecha)::smallint, null, null, v_venta.usuario_id);
    exception when unique_violation then
      null; -- ya lo recibió este año: la compra normal sigue sumando
    end;
  end if;
end;
$$;
comment on function retail.fn_club_puntos_por_venta(uuid) is
  'Suma los puntos de una venta de una miembro (1 por S/ 1 pagado, bloques enteros, con la configuración del día de la venta) y, en el mes de su cumpleaños, el regalo una vez al año. Interna: la llama registrar_venta al final y nunca tumba la venta.';
revoke all on function retail.fn_club_puntos_por_venta(uuid) from public, anon, authenticated;

-- ---------- 2. Poner los puntos de una venta al día ----------
create or replace function retail.fn_club_puntos_conciliar_venta(p_venta_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta record;
  v_compra record;
  v_regalo record;
  v_cfg retail.club_puntos_config;
  v_objetivo integer;
  v_actual integer;
  v_quita integer;
begin
  select v.cliente_id, v.created_at, v.estado, v.usuario_id into v_venta from retail.ventas v where v.id = p_venta_id;
  if not found or v_venta.cliente_id is null then
    return;
  end if;

  -- Lo comprado: lo que da hoy (0 si se anuló; si no, lo que corresponde a lo que no se devolvió) contra lo que quedó.
  select m.id, m.puntos into v_compra
    from retail.club_puntos_movimientos m where m.venta_id = p_venta_id and m.tipo = 'compra';
  if found then
    v_cfg := retail.fn_club_puntos_config((v_venta.created_at at time zone 'America/Lima')::date);
    v_objetivo := case when v_venta.estado = 'anulada' then 0
                       else floor(retail.fn_club_monto_neto_venta(p_venta_id) * v_cfg.puntos_por_sol)::integer end;
    v_actual := v_compra.puntos + coalesce((select sum(r.puntos) from retail.club_puntos_movimientos r
                                             where r.tipo = 'revierte' and r.de_movimiento_id = v_compra.id), 0);
    -- Se quita lo que sobra, pero nunca más de lo que la miembro tiene: el saldo no puede quedar negativo.
    v_quita := least(v_actual - v_objetivo, retail.fn_club_puntos_saldo(v_venta.cliente_id));
    if v_quita > 0 then
      perform retail.fn_club_puntos_anotar(v_venta.cliente_id, 'revierte', -v_quita, p_venta_id, null, null,
        case when v_venta.estado = 'anulada' then 'Venta anulada' else 'Devolución' end, v_venta.usuario_id, v_compra.id);
    end if;
  end if;

  -- El regalo de cumpleaños de esa venta solo se deshace al ANULARLA; así se podrá volver a dar con otra compra del año.
  if v_venta.estado = 'anulada' then
    select m.id, m.puntos into v_regalo
      from retail.club_puntos_movimientos m
     where m.venta_id = p_venta_id and m.tipo = 'cumple'
       and not exists (select 1 from retail.club_puntos_movimientos r where r.tipo = 'revierte' and r.de_movimiento_id = m.id);
    if found then
      v_quita := least(v_regalo.puntos, retail.fn_club_puntos_saldo(v_venta.cliente_id));
      if v_quita > 0 then
        perform retail.fn_club_puntos_anotar(v_venta.cliente_id, 'revierte', -v_quita, p_venta_id, null, null,
          'Venta anulada: regalo de cumpleaños', v_venta.usuario_id, v_regalo.id);
      end if;
    end if;
  end if;
end;
$$;
comment on function retail.fn_club_puntos_conciliar_venta(uuid) is
  'Pone los puntos de una venta al día: resta lo de una venta anulada o devuelta (reversa enlazada a la compra, nunca más de lo que la miembro tiene) y deshace el regalo de cumpleaños si se anuló. Idempotente. Interna.';
revoke all on function retail.fn_club_puntos_conciliar_venta(uuid) from public, anon, authenticated;

-- ---------- 3. Los dos disparadores: anular una venta y aprobar una devolución ----------
create or replace function retail.fn_club_puntos_al_anular_venta()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  begin
    perform retail.fn_club_puntos_conciliar_venta(new.id);
  exception when others then
    raise warning 'puntos: no se restaron los de la venta anulada % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function retail.fn_club_puntos_al_anular_venta() from public, anon, authenticated;

create or replace trigger trg_club_puntos_al_anular_venta
  after update of estado on retail.ventas
  for each row
  when (new.estado = 'anulada' and old.estado is distinct from 'anulada')
  execute function retail.fn_club_puntos_al_anular_venta();

create or replace function retail.fn_club_puntos_al_aprobar_devolucion()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  begin
    perform retail.fn_club_puntos_conciliar_venta(new.venta_id);
  exception when others then
    raise warning 'puntos: no se restaron los de la devolución % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function retail.fn_club_puntos_al_aprobar_devolucion() from public, anon, authenticated;

create or replace trigger trg_club_puntos_al_aprobar_devolucion
  after update of estado on retail.devoluciones
  for each row
  when (new.estado = 'aprobada' and old.estado is distinct from 'aprobada')
  execute function retail.fn_club_puntos_al_aprobar_devolucion();

-- Una devolución que se inserta YA aprobada (sus líneas llegan después) también cuenta: al agregar una línea a una devolución
-- aprobada se vuelve a conciliar la venta (es idempotente, así que no importa cuántas líneas lleguen).
create or replace function retail.fn_club_puntos_al_devolver_linea()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta uuid;
begin
  select d.venta_id into v_venta from retail.devoluciones d where d.id = new.devolucion_id and d.estado = 'aprobada';
  if v_venta is not null then
    begin
      perform retail.fn_club_puntos_conciliar_venta(v_venta);
    exception when others then
      raise warning 'puntos: no se restaron los de la devolución % (%)', new.devolucion_id, sqlerrm;
    end;
  end if;
  return null;
end;
$$;
revoke all on function retail.fn_club_puntos_al_devolver_linea() from public, anon, authenticated;

create or replace trigger trg_club_puntos_al_devolver_linea
  after insert on retail.devolucion_items
  for each row execute function retail.fn_club_puntos_al_devolver_linea();

-- ---------- 4. registrar_venta: la llamada, al final ----------
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$  return v_venta_id;
end;$v$,
  $v$  -- Puntos del Club: la venta de una miembro suma sus puntos (y, en el mes de su cumpleaños, el regalo). Nunca tumba la venta.
  begin
    perform retail.fn_club_puntos_por_venta(v_venta_id);
  exception when others then
    raise warning 'puntos: no se sumaron los de la venta % (%)', v_venta_id, sqlerrm;
  end;

  return v_venta_id;
end;$v$,
  1);
