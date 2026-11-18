-- ============================================================================
-- 20261108002000_recibir_costo_de_lo_que_ya_entro.sql — CAYLA V2 · ADR-0519 (act. 2026-11-08)
-- «Revisa y cierra» de Recibir sabe a qué costo entró lo que ya está en el stock.
--
-- EL PROBLEMA PRIMERO. Felipe, 2026-11-08, en el envío n.º 7 (abierto): las 113 prendas ya habían entrado al stock con «llevar al stock ahora»,
-- todas con su costo (S/ 40.68, S/ 60, …, en `despacho_recibidos`), pero al volver a «Revisa y cierra» decía «Sin costo: 98 · llega con la
-- factura» y «Hay 15 prendas sin identificar». Lo que entra al stock sale de `separado` (así queda también un envío reabierto), y la pantalla
-- arma el costo solo con `separado` y el costo de la línea: lo ya entrado quedaba como «sin identificar» y «sin costo». El stock y su costo
-- estaban bien; lo que mentía era el resumen.
--
-- QUÉ CAMBIA (reemplazo ANCLADO sobre la definición viva: si el texto no es el esperado, se detiene sin cambiar nada)
--   `fn_envio_conteo_json`: cada conteo trae `en_stock_costo` = { con_costo, sin_costo, monto, minimo, maximo }: cuántas prendas de esa línea
--   ya entraron con costo y sin él, cuánto suman y entre qué costos, leído de `despacho_recibidos` (la misma fila que dice `en_stock`).
--
-- LO QUE NO CAMBIA
--   · Nada se escribe: es una lectura más dentro del JSON del conteo. Ningún costo, stock ni movimiento cambia.
--   · `en_stock` sigue igual; `con_costo + sin_costo` es lo mismo que `en_stock` (medido en el envío n.º 7, línea por línea).
--
-- DESCARTÉ
--   · Volver a poner lo ya entrado en `separado`: rompería «lo contado nunca baja de lo que ya entró» y el cierre lo volvería a entrar.
--   · Leer `despacho_recibidos` desde la web: la tabla solo se lee por funciones (ADR-0393), y el conteo ya es la respuesta de la pantalla.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una parte, sin políticas ni `drop trigger` (ADR-0195), con `lock_timeout`. Idempotente. Sin `select … into`
-- dentro de textos entre comillas (ADR-0288). El bloque final comprueba que quedó.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

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

select pg_temp.reemplazar('retail.fn_envio_conteo_json(retail.despacho_conteos)',
$v$    'costos_prendas', p_fila.costos_prendas,
$v$,
$n$    'costos_prendas', p_fila.costos_prendas,
    -- 2026-11-08: lo de esta línea que YA entró al stock y a qué costo (la pantalla lo cuenta con su costo, no como «sin costo»).
    'en_stock_costo', (select jsonb_build_object(
                                'con_costo', coalesce(sum(r.cantidad) filter (where r.costo_unitario is not null), 0),
                                'sin_costo', coalesce(sum(r.cantidad) filter (where r.costo_unitario is null), 0),
                                'monto', coalesce(sum(r.cantidad * r.costo_unitario) filter (where r.costo_unitario is not null), 0),
                                'minimo', min(r.costo_unitario),
                                'maximo', max(r.costo_unitario))
                         from retail.despacho_recibidos r
                        where r.despacho_id = p_fila.despacho_id
                          and r.despacho_item_id is not distinct from p_fila.despacho_item_id
                          and r.extra_posicion is not distinct from p_fila.extra_posicion),
$n$,
1);

do $$
begin
  if position('en_stock_costo' in pg_get_functiondef('retail.fn_envio_conteo_json(retail.despacho_conteos)'::regprocedure)) = 0 then
    raise exception 'fn_envio_conteo_json no trae en_stock_costo';
  end if;
end;
$$;

reset lock_timeout;
