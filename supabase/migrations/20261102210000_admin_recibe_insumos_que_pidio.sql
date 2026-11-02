-- ============================================================================
-- 20261102210000_admin_recibe_insumos_que_pidio.sql — CAYLA V2 · P05 del «Análisis del Taller» (2-nov-2026)
-- Un Admin puede recibir en el Taller la tela y los avíos que él mismo pidió. Igual que en Compras (ADR-0517).
--
-- EL PROBLEMA PRIMERO. En Compras, un Admin recibe lo que compró (20261026161000); en el Taller no: `recibir_orden_insumo` frena a quien hizo la
-- orden con «Hiciste esta orden: la tiene que recibir otra persona del Taller», aunque sea Admin. Dos módulos resolvían lo mismo de dos formas
-- (CLAUDE.md, Brooks: una sola mente) y, si en el Taller pide y recibe la misma persona, la tela queda «por recibir» para siempre. Felipe eligió
-- el 2026-11-02 igualar el Taller a Compras.
--
-- QUÉ CAMBIA. UNA sola cosa: la comprobación «quien hizo la orden no la recibe» de `recibir_orden_insumo` (recibir y cerrar lo que no llega van por esta
-- misma función) deja pasar a la cuenta de un Admin, preguntándole a `retail.fn_recepcion_puede_recibir_lo_propio()` —el ÚNICO lugar donde se dice quién
-- tiene la excepción (20261026161000)—. Se pregunta a la CUENTA, no al responsable del combo: una terminal nunca la tiene. Si Dynamic no responde,
-- la función da `false` sin error y la regla vuelve a ser la de siempre (principio 9).
--
-- EL RASTRO. No hace falta un dato nuevo: la orden ya guarda `creada_por` y cada lote y su movimiento guardan quién los registró; que el Admin recibió
-- lo suyo se lee comparando esos dos (no puede quedar distinto de la realidad). La pantalla de Recibir se lo dice antes de contar.
--
-- LO QUE NO CAMBIA. La persona que no es Admin sigue frenada, líder o no, con el mismo error de siempre (`recibir_quien_compro`). La plata sigue
-- pasando por otra persona: pagar un comprobante no depende de esta regla.
--
-- DESCARTÉ levantar la regla para todo líder (deja sin control a las encargadas que sí piden y reciben en el Taller) y una columna nueva «recibida
-- por quien la pidió» (duplica `creada_por` y quien registró el lote, y puede discrepar de ellos).
--
-- SE ROMPE SI la excepción de Compras se retira o se renombra (esta función la nombra): por eso el pegado se niega con un mensaje claro si no existe.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, DESPUÉS de 20261026161000). UNA parte: una sola función, sin tablas ni políticas, con `lock_timeout`.
-- Idempotente: un reemplazo ya hecho se salta. Sin `select … into` dentro de textos entre comillas (ADR-0288). Reemplazo anclado: se detiene si la
-- definición viva no es la esperada.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_recepcion_puede_recibir_lo_propio()') is null then
    raise exception 'Falta retail.fn_recepcion_puede_recibir_lo_propio(): pega antes 20261026161000_admin_recibe_lo_que_compro.sql (ADR-0517).';
  end if;
end;
$$;

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

select pg_temp.reemplazar('retail.recibir_orden_insumo(uuid,uuid,jsonb,text,uuid)',
$v$  if v_orden.creada_por = v_actor then
$v$,
$n$  -- P05 del análisis del Taller: un Admin sí recibe lo que él mismo pidió (igual que en Compras, ADR-0517).
  if v_orden.creada_por = v_actor and not retail.fn_recepcion_puede_recibir_lo_propio() then
$n$,
1);

-- Comprobación final: la excepción quedó en la función y el bloqueo para los demás sigue.
do $$
declare
  v_def text := pg_get_functiondef('retail.recibir_orden_insumo(uuid,uuid,jsonb,text,uuid)'::regprocedure);
begin
  if position('not retail.fn_recepcion_puede_recibir_lo_propio()' in v_def) = 0 then
    raise exception 'recibir_orden_insumo no quedó con la excepción del Admin';
  end if;
  if position('recibir_quien_compro' in v_def) = 0 then
    raise exception 'recibir_orden_insumo perdió el bloqueo para quien no es Admin';
  end if;
end;
$$;

reset lock_timeout;
