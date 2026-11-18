-- ============================================================================
-- 20261107174000 — La regla pareja del IGV: lo que cobras de IGV es de SUNAT, y Ganancias lo resta siempre (ADR-0624)
--
-- EL PROBLEMA PRIMERO. ADR-0620 (20261107034000) dejó que el líder dijera «cuánto IGV voy a pagar este mes» y Ganancias restaba
-- solo eso. Con saldo a favor, octubre se leía con IGV 0: ventas con IGV menos el costo. Pero ese saldo a favor ya está en el
-- Balance y subió el capital con el arranque (20261107035000): restar 0 lo volvía a contar como ganancia. El IGV se contaba dos
-- veces. Y el costo de la carga inicial trae IGV que también está en ese saldo a favor: una tercera vuelta del mismo dinero.
--
-- LA DECISIÓN (Felipe, 2026-11-07; ADR-0624, «regla pareja»). El IGV que cobras es de SUNAT: Ganancias resta SIEMPRE todo el IGV
-- de las ventas y el resultado vuelve a ser el del libro (más los sueldos estimados de ADR-0453). Mientras haya saldo a favor no sale
-- de la caja: se descuenta de ese saldo, y eso lo dice Impuestos. Lo cobrado con IGV se muestra arriba de «Lo que vendiste» como
-- presentación, no como otra cifra. Se retira entero el «IGV que dice el líder»: `decir_igv_del_mes`, `fn_igv_de_gestion` y, si
-- sigue vacía (en producción tenía 0 filas el 2026-11-07), la tabla `igv_del_mes` con su disparador y sus dos funciones internas.
-- El IGV de las compras que no se descuenta (boleta, informal) y el costo de la carga inicial con IGV se corrigen en otra entrega.
--
-- CONTRATO
--   PROMETE: (1) `fn_igv_de_las_ventas` devuelve, por mes y unidad, el IGV incluido en las ventas del rango, con la misma regla de la
--            4011 que tenía `fn_igv_de_gestion`: venta = haber, anulación = −debe, devolución y cambio = haber − debe; sin adelantos
--            (su IGV ya está fuera de las ventas netas, y su boleta es `anticipo` / `anticipo_devuelto`). (2) Solo lee: no toca el
--            diario, el Balance ni ningún saldo. (3) Los mismos permisos que el diario: quien ve toda CAYLA, todo; quien tiene
--            «Reportes financieros» en una sede, la suya (`fn_diario` filtra); sin nada, 42501. (4) Antes de `fn_finanzas_desde` no hay
--            filas. (5) Nunca borra filas de `igv_del_mes`: si tiene alguna, la deja y avisa.
--   ASUME:   que `fn_asientos` sigue escribiendo la 4011 de lo vendido solo en esas cuatro reglas. Una regla nueva que mueva la 7011 y
--            la 4011 sin entrar a la lista deja lo cobrado corto sin error: lo vigila `scripts/pruebas/igv_ventas.mjs`.
--   NO HACE: no cambia `fn_estado_resultados`, `fn_asientos`, el cierre, el Balance, la renta ni Impuestos. La web usa el resultado
--            del libro tal cual; esta función solo dibuja «Cobraste» e «IGV de tus ventas».
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA SOLA EJECUCIÓN, antes de publicar la web (la web nueva ya no llama a `fn_igv_de_gestion`; la vieja,
-- si alguien la tiene abierta, ve Ganancias como en el libro: su lectura falla y cae al libro sola). Sin políticas, sin `alter` de
-- tablas en uso y sin `drop trigger` (ADR-0195): el disparador se va con `drop table`. Sin lectura con destino de variable dentro de
-- un texto entre comillas (ADR-0288): la cuenta de filas va con una asignación.
-- SE ROMPE SI: se cambia la regla de la 4011 de una venta sin tocar `fn_igv_de_las_ventas`.
-- DOWN: `drop function retail.fn_igv_de_las_ventas(date, date)` y volver a correr 20261107034000 (crea la tabla vacía y sus funciones).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Fuera el IGV que dice el líder ----------
drop function if exists retail.decir_igv_del_mes(date, numeric, text);
drop function if exists retail.fn_igv_de_gestion(date, date);

-- La tabla, su disparador y sus funciones internas se van solo si nadie dijo nada. Con filas se quedan: nunca se borran datos.
do $$
declare
  v_filas bigint;
begin
  if to_regclass('retail.igv_del_mes') is null then
    drop function if exists retail.fn_igv_del_mes_candado();
    drop function if exists retail.fn_exigir_igv_mes_abierto(date);
    return;
  end if;
  v_filas := (select count(*) from retail.igv_del_mes);
  if v_filas > 0 then
    raise notice 'retail.igv_del_mes tiene % filas: se deja la tabla, su disparador y sus funciones (ADR-0624). Nadie la lee ya.', v_filas;
    return;
  end if;
  -- `drop table` se lleva el disparador `igv_del_mes_candado` sin un `drop trigger` (ADR-0195).
  drop table retail.igv_del_mes;
  drop function if exists retail.fn_igv_del_mes_candado();
  drop function if exists retail.fn_exigir_igv_mes_abierto(date);
end $$;

-- ---------- 2. El IGV de las ventas, por mes y unidad ----------
-- Lee `fn_diario` solo del rango: un mes cerrado sale de su foto. Una fila por mes y unidad con IGV distinto de cero.
create or replace function retail.fn_igv_de_las_ventas(p_desde date, p_hasta date)
returns table (mes date, ubicacion_id uuid, igv numeric)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_todo boolean := retail.fn_ve_diario_de_todo();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_inicio date := retail.fn_finanzas_desde();
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido.' using errcode = 'P0001';
  end if;
  if not v_todo and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver el IGV de las ventas necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  -- ADR-0332: Finanzas cuenta desde su fecha de inicio, como el Estado de resultados.
  if v_inicio is not null then
    if p_hasta < v_inicio then
      return;
    end if;
    p_desde := greatest(p_desde, v_inicio);
  end if;

  return query
  select date_trunc('month', d.fecha)::date as m,
         d.ubicacion_id as u,
         sum(case d.regla when 'venta' then d.haber
                          when 'anulacion' then -d.debe
                          else d.haber - d.debe end) as igv
    from retail.fn_diario(p_desde, p_hasta, null) d
   where d.cuenta = '4011' and d.regla in ('venta', 'anulacion', 'devolucion', 'cambio')
   group by 1, 2
  having sum(case d.regla when 'venta' then d.haber
                          when 'anulacion' then -d.debe
                          else d.haber - d.debe end) <> 0
   order by 1, 2 nulls last;
end $$;
comment on function retail.fn_igv_de_las_ventas(date, date) is
  'ADR-0624: por mes y unidad, el IGV incluido en las ventas del rango (4011: venta haber, anulación −debe, devolución y cambio haber − debe; sin adelantos). Es de SUNAT: Ganancias y pérdidas lo muestra sobre «Lo que vendiste» sin cambiar el resultado. Solo lectura.';
revoke all on function retail.fn_igv_de_las_ventas(date, date) from public, anon;
grant execute on function retail.fn_igv_de_las_ventas(date, date) to authenticated;

reset lock_timeout;
