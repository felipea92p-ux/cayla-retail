-- ============================================================================
-- 20261010232000_piso_demanda_y_plan_ignoran_familias_apagadas.sql — actividad 2 de «Bolsas de despacho» (sigue a 20261010231000)
--
-- EL PROBLEMA PRIMERO. Con `familias.entra_a_motores` ya existe QUIÉN se apaga (la familia «Empaque» de las bolsas), pero ningún motor lo
-- pregunta: la bolsa de S/ 0.50 se vende varias veces al día y el motor del piso la cuenta como una prenda que rota («colgar otra igual»), el
-- de demanda como demanda de su categoría, y el plan de compra la pone entre las categorías de la campaña con su stock y su curva de tallas.
--
-- LO QUE HACE. Tres funciones empiezan a preguntar `retail.fn_categoria_entra_a_motores(categoría)` y dejan fuera TODO lo de una categoría
-- apagada: sus prendas (stock y ventas), sus ventas «sin registrar» y, en la demanda, lo que se pidió y no había.
--   · `fn_piso_plan_lectura`  — el motor del piso (Hoy, Inicio de Almacén, la señal para el Taller): `tallas`, `ventas`, `anotadas_recientes`
--     y, por ellas, `curvas`.
--   · `fn_demanda_sede`       — la cifra única de demanda: `variantes`, `grupos` (anotadas, perdidas, jornadas colgadas).
--   · `fn_plan_compra`        — la hoja del plan de campaña: las categorías que se ofrecen y su `stock`, `stock_sedes`, `curvas`, `vendido`,
--     `vendido_30` y `catalogo`.
-- Una venta de la bolsa SIGUE siendo venta: caja, comprobante, Ventas, Finanzas y el historial la cuentan (no se tocó nada de eso). Solo los
-- motores que DECIDEN qué colgar, qué pedir al Taller y qué comprar la ignoran.
--
-- CÓMO. Reemplazos ANCLADOS sobre la definición viva (el ayudante de 20261010100100): cada uno dice cuántas veces espera ver su texto y falla
-- SIN TOCAR NADA si la función cambió; si ya está aplicado, no hace nada (re-ejecutable). Los anclajes evitan a propósito las líneas del filtro
-- `p.estado` de `fn_piso_plan_lectura`: producción ya cuenta ahí las ventas cerradas sin prenda (PR #806, ADR-0334) y esta rama del repo no
-- (deriva conocida), y esta migración tiene que aplicarse igual sobre las dos.
--
-- SE ROMPE SI: una migración POSTERIOR reescribe una de estas funciones copiando un archivo anterior: pierde el filtro y la bolsa vuelve a
-- contar. La prueba `pnpm pruebas:motores-familias-apagadas` lo vigila (una venta de una familia apagada no mueve ninguna cifra), y la validación
-- de abajo cuenta cuántas veces quedó el filtro en cada función.
--
-- PARA PRODUCCIÓN: una sola parte, sin tablas ni políticas ni `drop trigger` (ADR-0195). Se pega DESPUÉS de 20261010231000. Todas las
-- piezas llevan el prefijo `retail.`; los anclajes se verificaron contra las huellas md5 de producción del 2026-10-10 (fn_demanda_sede
-- 41e0b68e…, fn_plan_compra 2af4abee…; fn_piso_plan_lectura 33dfc4b1…, que solo difiere en el filtro `p.estado`).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Guarda: la pregunta tiene que existir. Si falta, se detiene sin tocar nada.
do $g$
begin
  if not exists (select 1 from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_categoria_entra_a_motores') then
    raise exception 'Falta retail.fn_categoria_entra_a_motores: pega primero 20261010231000_familias_entran_a_motores.sql.';
  end if;
end
$g$;

-- Reemplazo anclado (el mismo de 20261010100100): falla si la función viva cambió, y es re-ejecutable.
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

-- ---------- 1. fn_piso_plan_lectura: lo que se cuelga y se pide al Taller ----------
-- Las prendas de la sede con su stock y lo vendido: una prenda de una familia apagada no es de piso.
select pg_temp.reemplazar(
  'retail.fn_piso_plan_lectura(uuid)',
  $v$      left join escaneadas s on s.variante_id = e.variante_id
    ),
    categorias_vistas as ($v$,
  $v$      left join escaneadas s on s.variante_id = e.variante_id
      where retail.fn_categoria_entra_a_motores(pr.categoria_id)
    ),
    categorias_vistas as ($v$,
  1);
-- Lo escaneado por prenda.
select pg_temp.reemplazar(
  'retail.fn_piso_plan_lectura(uuid)',
  $v$      where l.variante_id <> c_centinela
        and not pr.es_prueba
      group by l.variante_id$v$,
  $v$      where l.variante_id <> c_centinela
        and not pr.es_prueba
        and retail.fn_categoria_entra_a_motores(pr.categoria_id)
      group by l.variante_id$v$,
  1);
-- La señal para el Taller: lo escaneado...
select pg_temp.reemplazar(
  'retail.fn_piso_plan_lectura(uuid)',
  $v$      where l.variante_id <> c_centinela
        and not pr.es_prueba
      union all$v$,
  $v$      where l.variante_id <> c_centinela
        and not pr.es_prueba
        and retail.fn_categoria_entra_a_motores(pr.categoria_id)
      union all$v$,
  1);
-- ...y lo anotado a mano (por lo que anotó caja). No toca el filtro de `p.estado`: producción y el repo difieren ahí.
select pg_temp.reemplazar(
  'retail.fn_piso_plan_lectura(uuid)',
  $v$      left join retail.colores co on co.codigo = p.color_codigo
      where l.variante_id = c_centinela$v$,
  $v$      left join retail.colores co on co.codigo = p.color_codigo
      where l.variante_id = c_centinela
        and retail.fn_categoria_entra_a_motores(p.categoria_id)$v$,
  1);
-- El reloj rápido de lo anotado de hoy y ayer.
select pg_temp.reemplazar(
  'retail.fn_piso_plan_lectura(uuid)',
  $v$        and l.dia >= v_hoy - 1
      group by p.categoria_id, p.talla_id, p.color_codigo$v$,
  $v$        and l.dia >= v_hoy - 1
        and retail.fn_categoria_entra_a_motores(p.categoria_id)
      group by p.categoria_id, p.talla_id, p.color_codigo$v$,
  1);

-- ---------- 2. fn_demanda_sede: la cifra única de demanda ----------
-- Las prendas (de ellas salen `variantes` y las jornadas colgadas de cada grupo).
select pg_temp.reemplazar(
  'retail.fn_demanda_sede(uuid, integer)',
  $v$       where ids.variante_id <> c_centinela and not pr.es_prueba
    ),$v$,
  $v$       where ids.variante_id <> c_centinela and not pr.es_prueba
         and retail.fn_categoria_entra_a_motores(pr.categoria_id)
    ),$v$,
  1);
-- Las ventas «sin registrar» que siguen sin prenda.
select pg_temp.reemplazar(
  'retail.fn_demanda_sede(uuid, integer)',
  $v$         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
       group by p.categoria_id, p.talla_id, co.familia_color$v$,
  $v$         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
         and retail.fn_categoria_entra_a_motores(p.categoria_id)
       group by p.categoria_id, p.talla_id, co.familia_color$v$,
  1);
-- Lo que se pidió y no había.
select pg_temp.reemplazar(
  'retail.fn_demanda_sede(uuid, integer)',
  $v$         and not pr.es_prueba
       group by pr.categoria_id, va.talla_id, co.familia_color$v$,
  $v$         and not pr.es_prueba
         and retail.fn_categoria_entra_a_motores(pr.categoria_id)
       group by pr.categoria_id, va.talla_id, co.familia_color$v$,
  1);

-- ---------- 3. fn_plan_compra: la hoja del plan de campaña ----------
-- Las categorías que se ofrecen para planear.
select pg_temp.reemplazar(
  'retail.fn_plan_compra(uuid)',
  $v$from retail.categorias c where c.activo), '[]'::jsonb)$v$,
  $v$from retail.categorias c where c.activo and retail.fn_categoria_entra_a_motores(c.id)), '[]'::jsonb)$v$,
  1);
-- El stock de la red y el stock por sede (el mismo `where` dos veces).
select pg_temp.reemplazar(
  'retail.fn_plan_compra(uuid)',
  $v$where st.variante_id <> c_centinela and not pr.es_prueba
                 and sb.tipo is distinct from 'cuarentena'$v$,
  $v$where st.variante_id <> c_centinela and not pr.es_prueba
                 and retail.fn_categoria_entra_a_motores(pr.categoria_id)
                 and sb.tipo is distinct from 'cuarentena'$v$,
  2);
-- Lo vendido con prenda (curva de 90 días, lo de la campaña y lo de 30 días: el mismo `where` tres veces).
select pg_temp.reemplazar(
  'retail.fn_plan_compra(uuid)',
  $v$where v.estado = 'completada' and not v.es_prueba and not pr.es_prueba$v$,
  $v$where v.estado = 'completada' and not v.es_prueba and not pr.es_prueba and retail.fn_categoria_entra_a_motores(pr.categoria_id)$v$,
  3);
-- Lo vendido «sin registrar» sin prenda (las mismas tres lecturas).
select pg_temp.reemplazar(
  'retail.fn_plan_compra(uuid)',
  $v$where p.estado in ('pendiente', 'cerrada_sin_prenda')$v$,
  $v$where p.estado in ('pendiente', 'cerrada_sin_prenda') and retail.fn_categoria_entra_a_motores(p.categoria_id)$v$,
  3);
-- El precio y el costo promedio del catálogo.
select pg_temp.reemplazar(
  'retail.fn_plan_compra(uuid)',
  $v$and va.id <> c_centinela and pr.categoria_id is not null$v$,
  $v$and va.id <> c_centinela and pr.categoria_id is not null and retail.fn_categoria_entra_a_motores(pr.categoria_id)$v$,
  1);

-- ---------- 4. Validación final: si algo no quedó, se deshace todo ----------
do $v$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('retail.fn_piso_plan_lectura(uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, 'fn_categoria_entra_a_motores', ''))) / length('fn_categoria_entra_a_motores') <> 5 then
    raise exception 'fn_piso_plan_lectura debe preguntar por la familia en 5 lugares';
  end if;
  v_def := pg_get_functiondef('retail.fn_demanda_sede(uuid, integer)'::regprocedure);
  if (length(v_def) - length(replace(v_def, 'fn_categoria_entra_a_motores', ''))) / length('fn_categoria_entra_a_motores') <> 3 then
    raise exception 'fn_demanda_sede debe preguntar por la familia en 3 lugares';
  end if;
  v_def := pg_get_functiondef('retail.fn_plan_compra(uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, 'fn_categoria_entra_a_motores', ''))) / length('fn_categoria_entra_a_motores') <> 10 then
    raise exception 'fn_plan_compra debe preguntar por la familia en 10 lugares';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace
       and proname in ('fn_piso_plan_lectura', 'fn_demanda_sede', 'fn_plan_compra')) <> 3 then
    raise exception 'debe haber una sola firma de cada función del motor';
  end if;
end
$v$;

reset lock_timeout;
notify pgrst, 'reload schema';
