-- ============================================================================
-- 20261024232000_empresa_solo_mueve_stock_en_sus_sedes.sql — CAYLA V2 · ADR-0505 (sigue a ADR-0463 y ADR-0465)
--
-- EL PROBLEMA PRIMERO. CLAURE es otra empresa que solo opera en Lima (`empresa_sedes`, ADR-0463). La tienda online ya lo respeta
-- (ADR-0465), pero el ERP no: Vender, Catálogo, Existencias, Recibir y Contar le ofrecen a Trujillo y Arequipa las prendas de
-- CLAURE, y NADA en la base impide que una termine allí. Felipe (2026-10-24): las colaboradoras se confunden porque CLAURE crea en
-- Lima la misma blusa que CAYLA compra al mismo proveedor; en Trujillo aparece con otro nombre y otro precio. Y el riesgo de fondo:
-- desde Trujillo, «Pedir a otra sede» le puede pedir a Lima una prenda de CLAURE, que terminaría vendida en la caja de CAYLA en
-- Trujillo: la mercadería y el dinero de dos negocios mezclados. Felipe eligió «CLAURE solo existe en Lima, con el candado en la base».
--
-- QUÉ HACE. Un disparador BEFORE INSERT en `movimientos` rechaza todo movimiento de una prenda en una sede donde su empresa no
-- opera: el lugar del movimiento (`ubicacion_id`) y, si es un traslado, su destino (`ubicacion_destino_id`). Es el único punto por
-- el que pasa TODO cambio de stock —venta, separado, traslado, recepción, carga inicial, ajuste, conteo, devolución, cambio— hoy y
-- en cualquier función futura: el mismo patrón que la cuarentena (20260924093700, 20261014171000).
--   · «Dónde opera» lo dice `fn_empresas_de_sede`, la misma regla que decide qué empresas se ofrecen al crear un producto
--     (ADR-0463) y qué prendas muestra cada tienda online (ADR-0465): una sola fuente. CAYLA está en todas; una sede que nadie
--     sumó a `empresa_sedes` es solo-CAYLA; CLAURE, solo en Tienda LIM.
--   · El mensaje dice qué prenda, de qué empresa, por qué no y dónde sí («… solo se vende, se recibe y se traslada en Tienda LIM»).
--     Va con `hint = 'empresa_fuera_de_sede'`, el mismo de `crear_producto_con_empresa`.
--
-- Y LA OTRA MITAD: CAMBIAR LA EMPRESA DE UNA PRENDA CON STOCK. La regla une dos tablas (dónde está el stock y de quién es la prenda),
-- así que se puede romper también desde `productos`: `crear_producto_con_empresa` crea la prenda como CAYLA con su stock inicial y
-- DESPUÉS le pone la empresa, y solo valida `p_sede_id`, no `p_ubicacion_id` (donde cae el stock). La web manda las dos iguales,
-- pero por la API se podía crear una prenda de CLAURE con stock en Trujillo. Y quien edita el catálogo puede escribir
-- `productos.empresa_id` directo por la API. Un disparador de restricción, DIFERIDO al final de la transacción (como
-- `trg_actividad_movimientos`), revisa que la prenda no quede con stock ni apartados en una sede donde su nueva empresa no opera.
-- Se juzga al cerrar porque la regla cruza dos tablas: lo que cuenta es cómo quedan las dos juntas, no el orden en que se tocaron.
--
-- ANTES DE CREARLO, UNA SONDA. Si ya hubiera stock de una prenda en una sede donde su empresa no opera, el disparador la dejaría
-- sin poder moverse (ni venderla ni traerla de vuelta). La sonda lo busca y, si encuentra algo, la migración NO se aplica y dice
-- qué prenda y dónde. En producción, el 2026-10-24: las 5 prendas de CLAURE tienen stock solo en Tienda LIM (0 fuera).
--
-- QUÉ NO TOCA (y por qué):
--   · `fn_variante_permitida_en_sede` (las etiquetas con sedes permitidas, ADR-0071): la llaman seis funciones vivas (Vender,
--     separados, pedidos web, tienda online). El disparador ya cubre todas sin reescribir ninguna.
--   · `crear_producto_con_empresa`: el disparador diferido cubre su hueco sin reescribirla (ya se parchó por ancla en otras ramas).
--   · `empresa_sedes`: no tiene pantalla; cambia solo por migración. Sacar a CLAURE de Lima con stock allí dejaría ese stock quieto.
--   · Las listas del ERP: esconder la prenda donde no se puede mover es de la web (ADR-0505); esto es la red de seguridad.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES: stock (o un apartado) de una prenda de CLAURE en Trujillo, Arequipa o el Taller; una venta,
-- un traslado, una recepción, un ajuste o un conteo que la ponga allí; una prenda que pasa a CLAURE con stock fuera de Lima.
--
-- CONSECUENCIA DE NEGOCIO (dicha a Felipe): una prenda de CLAURE vendida en Lima no se puede devolver ni cambiar en Trujillo: la base
-- lo rechaza con el mensaje de arriba. Se devuelve o se cambia en Lima.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA sola parte, tal cual. Sin políticas ni `drop trigger` (ADR-0195: es `create or replace trigger`).
-- Toma un candado breve sobre `movimientos` al crear el disparador (`lock_timeout` de 3 s: si no lo consigue, falla sin daño y se
-- vuelve a pegar). Idempotente: pegada dos veces deja lo mismo. Sin `select … into` en un texto entre comillas (ADR-0288).
-- Cómo se verifica después: la última línea dice «QUEDÓ BIEN».
--
-- CÓMO SE DESHACE (solo si hiciera falta; `drop trigger` toma candados de auth y storage: se pega solo, sin nada más):
--   drop trigger if exists movimientos_solo_en_sedes_de_su_empresa on retail.movimientos;
--   drop trigger if exists productos_empresa_respeta_su_stock on retail.productos;
--
-- SE ROMPE SI:
--   · una empresa se desactiva (`empresas.activo = false`) con stock: `fn_empresas_de_sede` ya no la lista en ninguna sede y ese stock
--     queda quieto. Antes de desactivarla, vender o liquidar lo que tenga;
--   · CLAURE abre otra sede y nadie suma su fila en `empresa_sedes`: no podrá recibir allí (es seguro: el mensaje lo dice);
--   · una prueba cambia `productos.empresa_id` de una prenda con stock fuera de Lima y luego fuerza los chequeos diferidos
--     (`set constraints all immediate`) o hace commit: el disparador de `productos` la rechaza. Las que terminan en ROLLBACK
--     sin forzarlos (tienda_empresas, productos_filtro_por_empresa, campana_reglas) no lo ven, porque nunca llegan al cierre.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. La sonda: nada de stock fuera de las sedes de su empresa ----------
do $sonda$
declare
  v_fuera text;
begin
  v_fuera := (
    select string_agg(distinct p.referencia || ' (' || e.nombre || ') en ' || u.nombre, '; ')
      from retail.stock s
      join retail.variantes v on v.id = s.variante_id
      join retail.productos p on p.id = v.producto_id
      join retail.empresas e on e.id = p.empresa_id
      join retail.ubicaciones u on u.id = s.ubicacion_id
     where (s.cantidad <> 0 or s.cantidad_apartada <> 0)
       and not exists (select 1 from retail.fn_empresas_de_sede(s.ubicacion_id) x where x.id = p.empresa_id));
  if v_fuera is not null then
    raise exception 'No se aplicó nada: ya hay prendas con stock en una sede donde su empresa no opera: %. Llévalas a una sede de su empresa (o corrige su empresa) y vuelve a pegar esta migración.', v_fuera;
  end if;
end
$sonda$;

-- ---------- 2. El candado ----------
create or replace function retail.fn_movimiento_respeta_empresa_de_sede()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_empresa uuid;
  v_ubicacion uuid;
begin
  v_empresa := (select p.empresa_id from retail.variantes v join retail.productos p on p.id = v.producto_id where v.id = new.variante_id);
  if v_empresa is null then
    return new;
  end if;
  foreach v_ubicacion in array array_remove(array[new.ubicacion_id, new.ubicacion_destino_id], null) loop
    if not exists (select 1 from retail.fn_empresas_de_sede(v_ubicacion) e where e.id = v_empresa) then
      raise exception '% es de %, y % no está en %: esta prenda solo se vende, se recibe y se traslada en %.',
        (select p.referencia from retail.variantes v join retail.productos p on p.id = v.producto_id where v.id = new.variante_id),
        (select nombre from retail.empresas where id = v_empresa),
        (select nombre from retail.empresas where id = v_empresa),
        (select nombre from retail.ubicaciones where id = v_ubicacion),
        coalesce((select string_agg(u.nombre, ', ' order by u.nombre)
                    from retail.empresa_sedes es join retail.ubicaciones u on u.id = es.ubicacion_id
                   where es.empresa_id = v_empresa), 'ninguna sede todavía')
        using hint = 'empresa_fuera_de_sede';
    end if;
  end loop;
  return new;
end;
$$;

-- Solo la usa el disparador (que no necesita EXECUTE para dispararse): nadie la llama por la API.
revoke all on function retail.fn_movimiento_respeta_empresa_de_sede() from public, anon, authenticated;

comment on function retail.fn_movimiento_respeta_empresa_de_sede() is
  'ADR-0505: ningún movimiento pone, saca ni vende una prenda en una sede donde su empresa no opera (fn_empresas_de_sede). CLAURE solo se mueve en sus sedes (hoy Tienda LIM).';

create or replace trigger movimientos_solo_en_sedes_de_su_empresa
  before insert on retail.movimientos
  for each row execute function retail.fn_movimiento_respeta_empresa_de_sede();

-- ---------- 3. La otra mitad: la empresa de una prenda no se cambia dejando su stock fuera ----------
create or replace function retail.fn_producto_empresa_respeta_su_stock()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_empresa uuid;
  v_fuera text;
begin
  -- Diferido: se mira la empresa con la que la prenda TERMINA la transacción, no la de esta fila (pudo cambiar otra vez después).
  v_empresa := (select empresa_id from retail.productos where id = new.id);
  if v_empresa is null then
    return null;
  end if;
  v_fuera := (
    select string_agg(distinct u.nombre, ', ')
      from retail.stock s
      join retail.variantes v on v.id = s.variante_id
      join retail.ubicaciones u on u.id = s.ubicacion_id
     where v.producto_id = new.id
       and (s.cantidad <> 0 or s.cantidad_apartada <> 0)
       and not exists (select 1 from retail.fn_empresas_de_sede(s.ubicacion_id) e where e.id = v_empresa));
  if v_fuera is not null then
    raise exception '% no puede ser de %: tiene prendas en %, donde % no está. Primero llévalas a una sede de % o véndelas allí.',
      new.referencia,
      (select nombre from retail.empresas where id = v_empresa),
      v_fuera,
      (select nombre from retail.empresas where id = v_empresa),
      (select nombre from retail.empresas where id = v_empresa)
      using hint = 'empresa_fuera_de_sede';
  end if;
  return null;
end;
$$;

revoke all on function retail.fn_producto_empresa_respeta_su_stock() from public, anon, authenticated;

comment on function retail.fn_producto_empresa_respeta_su_stock() is
  'ADR-0505: al cerrar la transacción, una prenda no queda con stock ni apartados en una sede donde su empresa no opera (fn_empresas_de_sede).';

-- `create or replace` no sirve para un disparador de restricción: se crea solo si falta (crear un disparador no toma candados de auth).
do $disparador$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.productos'::regclass and tgname = 'productos_empresa_respeta_su_stock' and not tgisinternal) then
    create constraint trigger productos_empresa_respeta_su_stock
      after update of empresa_id on retail.productos
      deferrable initially deferred
      for each row when (old.empresa_id is distinct from new.empresa_id)
      execute function retail.fn_producto_empresa_respeta_su_stock();
  end if;
end
$disparador$;

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», el texto se pegó cortado o falta algo:
-- es seguro volver a pegarlo completo.
select '20261024232000 · CLAURE solo mueve stock en sus sedes' as parte,
       case when exists (select 1 from pg_trigger where tgrelid = 'retail.movimientos'::regclass and tgname = 'movimientos_solo_en_sedes_de_su_empresa' and not tgisinternal)
             and exists (select 1 from pg_trigger where tgrelid = 'retail.productos'::regclass and tgname = 'productos_empresa_respeta_su_stock' and not tgisinternal)
             and not has_function_privilege('authenticated', 'retail.fn_movimiento_respeta_empresa_de_sede()', 'execute')
             and not has_function_privilege('anon', 'retail.fn_movimiento_respeta_empresa_de_sede()', 'execute')
             and not has_function_privilege('authenticated', 'retail.fn_producto_empresa_respeta_su_stock()', 'execute')
             and not has_function_privilege('anon', 'retail.fn_producto_empresa_respeta_su_stock()', 'execute')
            then 'QUEDÓ BIEN' else 'REVISAR: falta un disparador o una función quedó a la vista de la API' end as resultado;
