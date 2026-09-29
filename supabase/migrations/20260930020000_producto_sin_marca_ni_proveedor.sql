-- ============================================================================
-- 20260930020000 — Un producto puede crearse SIN marca y/o SIN proveedor (ADR-0283)
--
-- EL PROBLEMA. La mercadería llega a almacén antes de que alguien registre de qué marca es o
-- quién la trajo, y hoy el sistema no la deja entrar: `productos.marca_id` y `proveedor_id` eran
-- NOT NULL (20260918231000) y las cuatro puertas de alta (`crear_producto_con_variantes`,
-- `crear_producto_con_stock_inicial`, `censo_crear_variante`, `catalogo_actualizar_producto`)
-- las exigían por `fn_validar_marca_proveedor`. Resultado: o no se registra la prenda, o se
-- inventa una marca para salir del paso («CAYLA» como comodín) y se ensucian las cifras.
--
-- LA DECISIÓN (Felipe, 2026-09-29): vacío REAL, no marca comodín — «no sabemos» no es una marca.
-- Marca y proveedor son independientes: se puede tener solo uno, y se completan después
-- editando el producto. Lo que NO cambia: cuando hay LOS DOS, tienen que ser una pareja
-- registrada (`marca_proveedores`); eso lo sigue haciendo la llave compuesta.
--
-- POR QUÉ NO HACE FALTA UN CANDADO NUEVO. La llave `productos_marca_proveedor_fk` es MATCH
-- SIMPLE (verificado en producción, `confmatchtype = 's'`): con un NULL en cualquiera de las dos
-- columnas la llave no se comprueba, con las dos llenas sí. Es justo la regla que queremos: los
-- estados «marca sola» y «proveedor solo» son válidos; el estado imposible —una pareja que
-- nadie registró— sigue siéndolo, y lo impide la base, no la pantalla. Las llaves simples
-- (`productos_marca_fk`, `productos_proveedor_fk`) siguen exigiendo que lo que se ponga exista.
--
-- QUÉ TOCA (todo re-ejecutable):
--   1. `productos.marca_id` y `productos.proveedor_id` dejan de ser NOT NULL.
--   2. `fn_validar_marca_proveedor`: ya no exige que estén; si vienen, deben estar activos, y si
--      vienen los dos, ser pareja. Las cuatro puertas la llaman igual que antes: no se reescribe
--      ninguna (su versión viva no es la de ningún archivo; no se toca lo que no hace falta).
--   3. `fn_productos` y `fn_productos_resumen`: el filtro de Marca/Proveedor entiende el uuid nulo
--      (00000000-…) como «los que no tienen». Sin cambiar la firma: otras sesiones tocan estas
--      funciones (ADR-0270) y una firma nueva obliga a `drop` + `create`. Parches con ancla: cada
--      una debe aparecer exactamente una vez o se aborta todo.
--
-- LO QUE NO SE HACE. Vaciar una marca o un proveedor YA guardado: `catalogo_actualizar_producto`
-- conserva `coalesce(p_marca_id, marca_id)` (mandar nada = no tocar). Es la regla «no empeora»
-- que ya rige para tejido y patrón: cambiar es libre, borrar lo que se sabía no. Y todo cambio deja
-- rastro (`fn_registrar_cambio_producto` ya audita `marca_id` y `proveedor_id`; `valor_anterior`
-- admite NULL).
--
-- SE ROMPE SI: alguien pasa el uuid nulo como un id de verdad (imposible: `gen_random_uuid()`
-- nunca lo genera; las llaves simples lo rechazarían igual).
--
-- PRODUCCIÓN: pegar con OK de Felipe, en el SQL Editor, tal cual (lleva `retail.`). Una sola
-- parte: no crea políticas ni dispara `drop trigger`, así que no choca con el Asesor de seguridad
-- (ADR-0195). El `alter table` toma un candado breve sobre `productos` (decenas de filas).
-- ============================================================================

set lock_timeout = '3s';

-- ---------- 1. las dos columnas admiten vacío ----------
alter table retail.productos alter column marca_id drop not null;
alter table retail.productos alter column proveedor_id drop not null;

comment on column retail.productos.marca_id is
  'De qué marca es el producto. Puede estar vacío (mercadería que llegó antes de registrar su marca, ADR-0283); se completa editando. Con proveedor_id, si están los dos, forma una pareja registrada en marca_proveedores (llave compuesta MATCH SIMPLE).';
comment on column retail.productos.proveedor_id is
  'Quién trae el producto. Puede estar vacío (ADR-0283); se completa editando. Con marca_id, si están los dos, forma una pareja registrada en marca_proveedores.';

-- ---------- 2. la regla única: lo que venga, válido; los dos, pareja ----------
create or replace function retail.fn_validar_marca_proveedor(p_marca_id uuid, p_proveedor_id uuid)
returns void
language plpgsql
stable
set search_path = retail, public
as $$
begin
  if p_marca_id is not null and not exists (select 1 from marcas where id = p_marca_id and activo) then
    raise exception 'Esa marca ya no está activa. Recarga la pantalla.' using hint = 'marca_invalida';
  end if;
  if p_proveedor_id is not null and not exists (select 1 from proveedores where id = p_proveedor_id and activo) then
    raise exception 'Ese proveedor ya no está activo. Recarga la pantalla.' using hint = 'proveedor_invalido';
  end if;
  if p_marca_id is not null and p_proveedor_id is not null
     and not exists (select 1 from marca_proveedores where marca_id = p_marca_id and proveedor_id = p_proveedor_id) then
    raise exception 'Ese proveedor no trae esa marca. Agrégalo a la marca en Catálogo → Marcas.' using hint = 'marca_proveedor_invalido';
  end if;
end;
$$;

revoke execute on function retail.fn_validar_marca_proveedor(uuid, uuid) from public, anon;

comment on function retail.fn_validar_marca_proveedor(uuid, uuid) is
  'La regla única de "marca y proveedor" (ADR-0283): cada uno puede faltar; el que venga debe estar activo; si vienen los dos, deben ser una pareja registrada en marca_proveedores. La usan el alta, el censo y la edición. Hints estables: marca_invalida, proveedor_invalido, marca_proveedor_invalido (ya no existen marca_obligatoria ni proveedor_obligatorio).';

-- ---------- 3. el filtro «sin marca» / «sin proveedor» ----------
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void language plpgsql as $f$
declare v_def text; v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception 'sin marca ni proveedor: en % se esperaban % apariciones de «%» y hay %', p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

do $$
declare
  v_fn_productos text := 'retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text, uuid, uuid)';
  v_fn_resumen   text := 'retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric, uuid, uuid)';
  v_marca_viejo  text := 'and (p_marca_id is null or p.marca_id = p_marca_id)';
  v_marca_nuevo  text := 'and (p_marca_id is null or p.marca_id is not distinct from nullif(p_marca_id, ''00000000-0000-0000-0000-000000000000''::uuid))';
  v_prov_viejo   text := 'and (p_proveedor_id is null or p.proveedor_id = p_proveedor_id)';
  v_prov_nuevo   text := 'and (p_proveedor_id is null or p.proveedor_id is not distinct from nullif(p_proveedor_id, ''00000000-0000-0000-0000-000000000000''::uuid))';
begin
  perform pg_temp.reemplazar(v_fn_productos, v_marca_viejo, v_marca_nuevo, 1);
  perform pg_temp.reemplazar(v_fn_productos, v_prov_viejo, v_prov_nuevo, 1);
  perform pg_temp.reemplazar(v_fn_resumen, v_marca_viejo, v_marca_nuevo, 1);
  perform pg_temp.reemplazar(v_fn_resumen, v_prov_viejo, v_prov_nuevo, 1);
end
$$;

-- ---------- validación final: las dos funciones quedaron con el filtro nuevo, las columnas admiten vacío ----------
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'retail' and table_name = 'productos'
                and column_name in ('marca_id', 'proveedor_id') and is_nullable = 'NO') then
    raise exception 'sin marca ni proveedor: productos.marca_id / proveedor_id siguen siendo NOT NULL';
  end if;
  if position('nullif(p_marca_id' in pg_get_functiondef('retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text, uuid, uuid)'::regprocedure)) = 0
     or position('nullif(p_proveedor_id' in pg_get_functiondef('retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric, uuid, uuid)'::regprocedure)) = 0 then
    raise exception 'sin marca ni proveedor: el filtro del uuid nulo no quedó en fn_productos / fn_productos_resumen';
  end if;
end
$$;
