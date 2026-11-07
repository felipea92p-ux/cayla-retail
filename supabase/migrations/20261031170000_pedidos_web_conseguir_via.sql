-- ============================================================================
-- 20261031170000_pedidos_web_conseguir_via.sql — CAYLA V2 (ADR-0590, rediseño de Tienda web ▸ Pedidos · 2026-10-31)
--
-- EL PROBLEMA PRIMERO.
--   Al confirmar un pedido web, una prenda que la tienda no tiene se dejaba «por conseguir» con una fecha. Pero conseguirla se hace de tres
--   maneras: pedirla a otra sede (eso ya sale como reserva en esa sede y su traslado), comprarla a un proveedor o pedirla al taller. La
--   tienda no podía decir cuál de las dos últimas había elegido: la hoja del pedido decía solo «Por conseguir», y Compras y Producción no
--   tenían de dónde leerlo.
--
-- QUÉ HACE (Felipe, 2026-10-31: «pedir a otra sede, comprarla o indicarle a taller»).
--   · `pedido_web_lineas.conseguir_via`: `compra` o `taller` (o null: lo de antes, y lo que no es «por conseguir»). Solo informa: no mueve
--     stock, dinero ni estados.
--   · `confirmar_pedido_web`: cada decisión `por_conseguir` puede traer `via` (`compra` | `taller`); lo guarda. Sin `via` sigue valiendo (null).
--   · `fn_pedido_web` (y con ella `fn_pedido_web_detalle`): cada prenda dice su `conseguir_via`.
--
-- CONTRATO (Liskov)
--   PROMETE: lo de antes sigue igual: una decisión sin `via` se guarda como siempre. Un `via` que no sea `compra` ni `taller` se rechaza antes de
--            tocar nada (`pedido_web_decisiones`, 22023). Ninguna otra regla de la confirmación cambia (todo o nada, fecha de hoy a 60 días).
--   ASUME:   las funciones vivas con el texto de 20261014235000 y de las migraciones que las parchan hasta 20261015115000: los cuatro anclas
--            se verificaron contra ese texto (la prueba `lib/pedidos-web-conseguir-via.test.ts` lo vuelve a comprobar).
--   NO HACE: no obliga a elegir `via` (la web siempre lo manda; una llamada vieja no se rompe) ni crea el traslado o la orden de compra: dónde se
--            pide y quién lo hace lo coordina la tienda, como hoy.
--
-- DECIDÍ: una columna con un CHECK y no una tabla aparte. Es un dato de la prenda, de dos valores, que se lee junto a su fecha prometida.
-- DESCARTÉ: reescribir `confirmar_pedido_web` completa. Los reemplazos anclados abortan si el texto vivo no es el esperado; una copia entera
--   pisaría cualquier parche que producción tenga y esta migración no conozca.
-- SE ROMPE SI: alguien reescribe `confirmar_pedido_web` o `fn_pedido_web` sin pasar por aquí: el ancla no aparece y la migración aborta, sin
--   aplicar nada (todo va en una transacción).
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: un `alter table` y reemplazos anclados. Sin políticas, sin
-- `drop trigger`, sin `select … into` dentro de un texto de reemplazo (ADR-0195, ADR-0288). Va DESPUÉS de 20261015115000.
-- ============================================================================
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. La columna.
alter table retail.pedido_web_lineas add column if not exists conseguir_via text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedido_web_lineas_conseguir_via_valida' and conrelid = 'retail.pedido_web_lineas'::regclass) then
    alter table retail.pedido_web_lineas
      add constraint pedido_web_lineas_conseguir_via_valida check (conseguir_via is null or conseguir_via in ('compra', 'taller'));
  end if;
end $$;

comment on column retail.pedido_web_lineas.conseguir_via is
  'Cómo se consigue una prenda «por conseguir»: compra (a un proveedor) o taller (se pide que la hagan). Solo informa; null = no se dijo (lo de antes). Pedirla a otra sede no usa esto: sale como reserva en esa sede.';

-- 2. `confirmar_pedido_web`: la decisión `por_conseguir` puede traer `via`.
select pg_temp.reemplazar_anclado('retail.confirmar_pedido_web(uuid, jsonb, integer)',
  $v$  v_fecha date;
  r record;$v$,
  $v$  v_fecha date;
  v_via text;
  r record;$v$);

select pg_temp.reemplazar_anclado('retail.confirmar_pedido_web(uuid, jsonb, integer)',
  $v$      d := jsonb_build_object('decision', v_decision, 'fecha', v_fecha);$v$,
  $v$      -- ADR-0590: cómo se consigue (compra | taller); opcional, y solo informa.
      v_via := nullif(btrim(coalesce(d ->> 'via', '')), '');
      if v_via is not null and v_via not in ('compra', 'taller') then
        raise exception 'Una prenda por conseguir se compra o se pide al taller.' using errcode = '22023', hint = 'pedido_web_decisiones', detail = v_linea::text;
      end if;
      d := jsonb_build_object('decision', v_decision, 'fecha', v_fecha, 'via', v_via);$v$);

select pg_temp.reemplazar_anclado('retail.confirmar_pedido_web(uuid, jsonb, integer)',
  $v$         set estado = 'por_conseguir', fecha_compromiso = (d ->> 'fecha')::date, resuelta_en = now(), resuelta_por = v_persona$v$,
  $v$         set estado = 'por_conseguir', fecha_compromiso = (d ->> 'fecha')::date, conseguir_via = d ->> 'via', resuelta_en = now(), resuelta_por = v_persona$v$);

-- 3. `fn_pedido_web`: cada prenda dice cómo se consigue.
select pg_temp.reemplazar_anclado('retail.fn_pedido_web(uuid, integer, integer, integer)',
  $v$               'fecha_compromiso', l.fecha_compromiso,
               -- Lo que hay HOY de esa prenda$v$,
  $v$               'fecha_compromiso', l.fecha_compromiso,
               -- ADR-0590: cómo se consigue una prenda por conseguir (compra | taller | null).
               'conseguir_via', l.conseguir_via,
               -- Lo que hay HOY de esa prenda$v$);

-- 4. Comprobación: si algo no quedó, la migración no se da por aplicada.
do $$
begin
  if position('v_via' in pg_get_functiondef('retail.confirmar_pedido_web(uuid, jsonb, integer)'::regprocedure)) = 0
     or position('conseguir_via = d ->> ''via''' in pg_get_functiondef('retail.confirmar_pedido_web(uuid, jsonb, integer)'::regprocedure)) = 0 then
    raise exception 'confirmar_pedido_web no quedó guardando cómo se consigue la prenda';
  end if;
  if position('''conseguir_via''' in pg_get_functiondef('retail.fn_pedido_web(uuid, integer, integer, integer)'::regprocedure)) = 0 then
    raise exception 'fn_pedido_web no quedó diciendo cómo se consigue cada prenda';
  end if;
end $$;
