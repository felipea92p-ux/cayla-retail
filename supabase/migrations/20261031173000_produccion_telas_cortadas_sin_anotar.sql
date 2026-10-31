-- ============================================================================
-- 20261031173000_produccion_telas_cortadas_sin_anotar.sql — CAYLA V2 (ADR-0570, actividad 4 · 2026-10-31)
--
-- EL PROBLEMA PRIMERO.
--   La OP-3 (Blusa Hanna, 54 prendas) anotó su Corte el 30-oct, cuando el estante del Taller no tenía esa tela. Los seis lotes de Satín Singapur se cargaron al día siguiente como
--   «saldo inicial». Nadie le avisó a quien los cargaba que una orden ya había cortado con ellos: la orden quedó con la tela «por anotar», su «Costo hasta hoy» sin la tela
--   (S/ 79.50 de S/ 406.74) y «Pasar al stock» trabado por el candado de `cerrar_produccion`. Los dos sistemas hicieron lo correcto por separado; el hueco está entre los dos.
--
-- QUÉ HACE. UNA función de solo lectura: `fn_telas_cortadas_sin_anotar(taller)` → las telas de órdenes abiertas de ese Taller que ya cortaron y no tienen nada descontado del
--   libro, con lo que hay hoy en el estante. La pantalla de Insumos la usa para decir, junto a la tela, «la OP-3 ya cortó con esta tela: anota cuánto quedó». No mueve stock, no
--   descuenta nada, no calcula costos: anotar sigue siendo medir lo que quedó (ADR-0570, decisión de Felipe 2026-10-29).
--
-- CONTRATO (Liskov)
--   PROMETE: devuelve una fila por (orden, tela) y solo si (a) la orden está en proceso y no es una muestra, (b) la tela es de la orden (principal o complemento), con plan > 0,
--            (c) su libro no tiene NADA descontado de esa tela en esa orden (consumo − devolución = 0) y (d) el Corte de la orden tiene prendas terminadas (avances netos > 0, un
--            Deshacer resta). `saldo` es lo que hay HOY en el estante de ese Taller (la misma cuenta del libro que usa `fn_orden_produccion`). Quien no puede leer Producción en ese
--            Taller recibe `[]`, nunca un error ni las órdenes de otro.
--   ASUME:   `produccion_insumos`, `produccion_avances` y `produccion_fases` siguen cerradas al navegador (`revoke all`): esta función es la única puerta de esta lectura.
--   NO HACE: no decide si la tela «debería» estar anotada, no mira costos (no devuelve dinero), no mira avíos, y no avisa de una orden que todavía no cortó.
--
-- DECIDÍ: una función de lectura por Taller y no un aviso colgado de cada puerta de ingreso (saldo inicial, compra, «Encontré tela», Recibir). El estado «la orden cortó y no
--   tiene tela anotada» es un hecho de la base, no un evento: sirve igual si la tela entró ayer o por una puerta que mañana no exista.
-- DESCARTÉ: descontar sola la tela al entrar un lote (ADR-0570 descartó descontar por plan: un número que nadie midió; y si el corte salió de otro rollo, el estante queda mal en
--   silencio), y avisar solo en el momento del ingreso (se pierde si la persona cierra la hoja o carga otra cosa después).
-- SE ROMPE SI: una orden corta de DOS telas a la vez y solo una está sin anotar: devuelve solo esa (correcto). O si «Corte» deja de ser la clave `corte` de `produccion_fases`:
--   la función no devolvería nada y el aviso callaría; lo vigila la prueba `pruebas:produccion-telas-cortadas-sin-anotar` (caso F).
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`, solo `create or replace function` + permisos: sin `alter table`, sin políticas, sin `drop trigger`.
-- Prueba: `pnpm pruebas:produccion-telas-cortadas-sin-anotar`.
-- ============================================================================
set lock_timeout = '3s';

create or replace function retail.fn_telas_cortadas_sin_anotar(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  -- Sin permiso de leer Producción en ese Taller, no hay nada que mostrar (no es un error: la pantalla de Insumos la ven más roles que Producción).
  if p_ubicacion_id is null or retail.fn_produccion_puede_leer(p_ubicacion_id) is not true then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'produccion_id', x.produccion_id,
             'numero', x.numero,
             'insumo_id', x.insumo_id,
             'nombre', x.nombre,
             'unidad', x.unidad_medida,
             'plan', x.plan,
             'saldo', x.saldo)
           order by x.numero, x.nombre)
      from (
        select p.id as produccion_id, p.numero, i.id as insumo_id, i.nombre, i.unidad_medida,
               sum(pi.cantidad_plan) as plan,
               -- Lo que hay hoy en el estante de ese Taller: la misma cuenta del libro que usa la página de la orden.
               coalesce((select sum(case when mi.tipo in ('compra', 'devolucion') then mi.cantidad
                                         when mi.tipo in ('consumo', 'merma') then -mi.cantidad else mi.cantidad end)
                           from retail.movimientos_insumo mi
                          where mi.insumo_id = i.id and mi.ubicacion_id = p.ubicacion_id), 0) as saldo
          from retail.producciones p
          join retail.produccion_insumos pi on pi.produccion_id = p.id
          join retail.insumos i on i.id = pi.insumo_id and i.tipo = 'tela'
         where p.ubicacion_id = p_ubicacion_id
           and p.estado = 'en_proceso'
           and p.es_muestra is not true
           -- El Corte ya tiene prendas terminadas (un Deshacer resta).
           and coalesce((select sum(a.cantidad)
                           from retail.produccion_avances a
                           join retail.produccion_fases f on f.id = a.fase_id
                          where f.produccion_id = p.id and f.clave = 'corte'), 0) > 0
           -- Y el libro no tiene nada descontado de esta tela en esta orden.
           and coalesce((select sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end)
                           from retail.movimientos_insumo mi
                          where mi.produccion_id = p.id and mi.insumo_id = i.id and mi.tipo in ('consumo', 'devolucion')), 0) <= 0
         group by p.id, p.numero, p.ubicacion_id, i.id, i.nombre, i.unidad_medida
        having sum(pi.cantidad_plan) > 0
      ) x
  ), '[]'::jsonb);
end;
$$;

comment on function retail.fn_telas_cortadas_sin_anotar(uuid) is
  'Las telas de órdenes abiertas de ese Taller que ya cortaron y no tienen nada descontado del libro, con lo que hay hoy en el estante. Solo lectura; quien no lee Producción en el Taller recibe []. ADR-0570, actividad 4.';

revoke all on function retail.fn_telas_cortadas_sin_anotar(uuid) from public, anon;
grant execute on function retail.fn_telas_cortadas_sin_anotar(uuid) to authenticated, service_role;

reset lock_timeout;
