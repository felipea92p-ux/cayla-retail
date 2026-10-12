-- ============================================================================
-- 20261012220000_preparacion_motor_ignora_familias_apagadas.sql — CAYLA V2 (Inventario · motor de demanda)
--
-- EL PROBLEMA PRIMERO. Antes de que Análisis, el plan del piso y las recomendaciones «hablen» en una tienda, el motor de
-- demanda exige que el 90 % de lo vendido esté registrado con su prenda, sostenido 14 días (ADR-0346). Esa cifra la da
-- `fn_motor_demanda_preparacion`: unidades vendidas por día y cuántas apuntan a una prenda real (no a la centinela de
-- «Prenda sin registrar»). Contaba TODO, también las bolsas. Una tienda que registra con su prenda 8 de cada 10
-- prendas, pero vende una bolsa por ticket (registrada como producto), salía con 90 % en vez de 80 %: el sistema
-- empezaba a recomendar con datos que todavía no son confiables. Es la sexta lectura que tenía que preguntar por las
-- familias apagadas (ADR-0377) y no lo hacía: las cinco de 20261010232000 y 20261010233000 ya lo hacen.
--
-- QUÉ HACE. En `lineas` (cada línea cobrada de la ventana) deja fuera las de una prenda cuya categoría no entra a los
-- motores (`retail.fn_categoria_entra_a_motores`), en las unidades Y en las identificadas. La centinela no tiene
-- categoría, así que sigue contando (como no identificada): es justo lo que la cifra mide. La venta de la bolsa no se
-- toca: caja, comprobante y Ventas la siguen contando; solo esta cifra de preparación la ignora.
--
-- CÓMO. Reemplazo ANCLADO sobre la definición viva (el mismo ayudante de 20261012190000): si el trozo no está
-- exactamente una vez, se detiene sin tocar nada; si ya está aplicado, no hace nada (re-ejecutable). El ancla no lleva
-- comentarios ni un `select … into` entre comillas simples (ADR-0288).
--
-- SE ROMPE SI una migración posterior redefine `fn_motor_demanda_preparacion` copiando 20261006213000: pierde el filtro.
-- `pnpm pruebas:motores-familias-apagadas` (caso P0) lo vigila.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: solo una función (sin tablas, políticas ni
-- disparadores, ADR-0195). Después de 20261010231000 (la pregunta) y 20261006213000. Se puede pegar dos veces.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $g$
begin
  if not exists (select 1 from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_categoria_entra_a_motores') then
    raise exception 'Falta retail.fn_categoria_entra_a_motores: pega primero 20261010231000_familias_entran_a_motores.sql.';
  end if;
end
$g$;

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
  'retail.fn_motor_demanda_preparacion(uuid)',
  $v$                        where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
  ),$v$,
  $v$                        where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
       and retail.fn_categoria_entra_a_motores(
             (select pr.categoria_id from retail.variantes va join retail.productos pr on pr.id = va.producto_id
               where va.id = vi.variante_id))
  ),$v$,
  1);

reset lock_timeout;
