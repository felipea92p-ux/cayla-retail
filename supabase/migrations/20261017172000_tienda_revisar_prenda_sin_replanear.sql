-- ============================================================================
-- 20261017172000_tienda_revisar_prenda_sin_replanear.sql — CAYLA V2 · Tienda online (ADR-0408), optimización de carga (2026-10-17)
--
-- EL PROBLEMA PRIMERO. «¿Esta prenda se puede mostrar en la web?» se pregunta prenda por prenda: el catálogo de la tienda la pregunta
-- por cada una de las 298 publicadas (`fn_vitrina_publicable`), «Mi Club» de Mi perfil por cada fila de la Vitrina
-- (`fn_tienda_novedades` → `fn_tienda_modelo_se_ve`), y también el probador, la Vitrina del ERP, los favoritos, la bolsa y «Separar».
-- La pregunta es una cadena de funciones SQL anidadas (`fn_tienda_modelo_se_ve` → `fn_vitrina_publicable` → `fn_vitrina_por_que_no` →
-- `fn_categoria_entra_a_motores`), y Postgres 17 vuelve a planear el cuerpo de una función SQL anidada que no puede meter en la
-- consulta (una con `security definer`, `set search_path` o una subconsulta adentro) EN CADA LLAMADA. Medido en producción el 17-oct:
-- las 298 revisiones del catálogo costaban 242–271 ms y las de Mi Club 286–299 ms. Mi Club no se guarda en ninguna caché (es de cada
-- persona), así que cada visita a Mi perfil pagaba ~0,3 s solo en esto.
--
-- ANALOGÍA CAYLA. Es como si, para revisar cada prenda del perchero, la encargada volviera a leer el manual de la Vitrina desde la
-- primera página. La regla no cambia entre una prenda y la siguiente: se lee una vez y se aplica a todas.
--
-- QUÉ HACE. Pasa esas cuatro funciones de SQL a PL/pgSQL con EXACTAMENTE la misma regla adentro (mismo texto de cada condición, mismo
-- orden, mismos `security definer`, `search_path`, permisos y comentarios, que `create or replace` conserva). PL/pgSQL guarda el plan
-- de cada consulta entre llamadas de la misma conexión: la regla se planea una vez y se aplica a todas las prendas. Medido contra
-- producción con copias temporales (sin tocar las vivas): las 298 revisiones del catálogo bajan a 29–34 ms y las de Mi Club a ~35 ms,
-- con cero diferencias en las 298 publicadas y en la regla de las familias para los 363 productos.
--
-- DECIDÍ: cambiar el lenguaje y no la forma de preguntar. Una versión «para una lista de prendas» bajaba a 7,5 ms, pero obligaba a
--   mover la regla a otra función (o a tener dos que deciden lo mismo, lo que 20261015122000 descartó) y a reescribir sus mutantes;
--   con PL/pgSQL las 27 funciones que la preguntan se aceleran sin tocarlas, y los mutantes de `pruebas:vitrina-web`,
--   `pruebas:tienda-ficha`, `pruebas:tienda-club` y `pruebas:tienda-avisos` siguen encontrando su texto.
-- DECIDÍ: un reemplazo entero con candado de md5 por función (el patrón de ADR-0404): si la función viva no es la que se midió, se
--   detiene sin tocar nada; si ya es PL/pgSQL, la vuelve a escribir igual (se puede pegar dos veces).
-- DESCARTÉ: quitarle `security definer` o `search_path` para que Postgres la pudiera meter en la consulta (no alcanza: la regla lleva
--   subconsultas, y una función con subconsultas no se mete nunca) y guardar «se puede mostrar» en una columna de la Vitrina (un dato
--   derivado que hay que mantener al día con cada precio, categoría y familia: el principio 4 lo prohíbe).
--
-- SE ROMPE SI: alguien vuelve a escribir una de las cuatro en SQL (vuelve la lentitud, no un error). Lo vigila `pnpm
--   pruebas:tienda-rapida` (sección 2: el lenguaje de las cuatro y que la regla diga lo mismo que la de antes en todos los casos).
--
-- PRODUCCIÓN. Se aplica con el OK de Felipe (2026-10-17) después de 20261017171000. Una sola parte, sin políticas, disparadores ni
-- `alter` de tablas (ADR-0195); ningún texto entre comillas lleva la palabra con que se guarda una consulta en una variable (ADR-0288).
-- ============================================================================
set lock_timeout = '3s';

-- Los candados: cada función viva tiene que ser la que se midió el 17-oct (o ya estar en PL/pgSQL, si esto se pega dos veces).
do $candados$
declare
  v_firma text;
  v_md5 text;
  v_esperado text;
  v_lenguaje text;
begin
  for v_firma, v_esperado in
    select * from (values
      ('retail.fn_categoria_entra_a_motores(uuid)', '3b325fe3db962315eddfd890aa5622d7'),
      ('retail.fn_vitrina_por_que_no(uuid)',        '804e9490792dd820a3d2234454c431ee'),
      ('retail.fn_vitrina_publicable(uuid)',        '32b8e1a2d38269eee0d71aac1f6486ff'),
      ('retail.fn_tienda_modelo_se_ve(uuid)',       'a9bfad10e8010a65a3c53c3f0d0067e3')) as c (firma, md5)
  loop
    v_md5 := md5(pg_get_functiondef(v_firma::regprocedure));
    v_lenguaje := (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = v_firma::regprocedure);
    if v_lenguaje = 'plpgsql' then
      raise notice '% ya está en PL/pgSQL: se vuelve a escribir igual.', v_firma;
    elsif v_md5 <> v_esperado then
      raise exception '% cambió desde que se midió (md5 %, se esperaba %). No se tocó nada.', v_firma, v_md5, v_esperado;
    end if;
  end loop;
end
$candados$;

-- La regla de los motores (ADR-0377), igual que antes: sin dato, sí cuenta.
create or replace function retail.fn_categoria_entra_a_motores(p_categoria_id uuid)
 returns boolean
 language plpgsql
 stable
as $function$
begin
  -- PL/pgSQL y no SQL (20261017172000): guarda su plan entre llamadas; la regla es la misma.
  return coalesce(
    (select f.entra_a_motores
       from retail.categorias c
       join retail.familias f on f.codigo = c.familia
      where c.id = p_categoria_id),
    true);
end
$function$;

-- LA regla de la Vitrina, con su porqué (20261015122000): el mismo texto, condición por condición.
create or replace function retail.fn_vitrina_por_que_no(p_producto_id uuid)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'retail', 'public'
as $function$
begin
  -- PL/pgSQL y no SQL (20261017172000): guarda su plan entre llamadas; la regla es la misma.
  return (
  select case
    when p.id is null then 'no_existe'
    when p.estado <> 'activo' or p.estado_alta = 'rechazado' or p.es_prueba or p.id = '11111111-1111-4111-8111-111111111111'
         or not exists (select 1 from retail.variantes v where v.producto_id = p.id and v.activo) then 'no_se_vende'
    -- Solo ropa en la web (Felipe 2026-10-15): lo de una familia fuera de los motores (bolsas, cajas, empaque) se vende desde el
    -- ticket, en la caja (ADR-0377).
    when not retail.fn_categoria_entra_a_motores(p.categoria_id) then 'empaque'
    -- Sin precio: NINGUNA talla activa se ofrece a más de S/ 0 en NINGUNA tienda de la web. Lo dice la regla del precio de la tienda
    -- (fn_tienda_precio_talla con «Todas»: el mayor entre las tiendas de la web; sin ninguna, la grilla), la misma de la ficha, el
    -- catálogo, la bolsa y «Separar»: la ropa en S/ 0 en su ficha se muestra si una tienda de la web le puso precio propio (Felipe
    -- 2026-10-15: «el precio de la prenda siempre es el de la tienda»). Primero lo barato: una talla activa con precio en su ficha se
    -- ofrece en toda tienda (el precio propio de una tienda es > 0), así que con una de esas el modelo tiene precio sin preguntar más.
    when exists (select 1 from retail.variantes v where v.producto_id = p.id and v.activo and v.precio > 0) then null
    when not exists (select 1
                       from retail.fn_tienda_precio_talla(
                              array(select v.id from retail.variantes v where v.producto_id = p.id and v.activo), null) t
                      where t.se_ofrece) then 'sin_precio'
  end
  from (select p_producto_id as id) k
  left join retail.productos p on p.id = k.id);
end
$function$;

create or replace function retail.fn_vitrina_publicable(p_producto_id uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'retail', 'public'
as $function$
begin
  -- Se puede mostrar en la web si no hay un porqué (fn_vitrina_por_que_no, 20261015122000): la regla vive en un solo lugar.
  -- PL/pgSQL y no SQL (20261017172000): guarda su plan entre llamadas.
  return retail.fn_vitrina_por_que_no(p_producto_id) is null;
end
$function$;

create or replace function retail.fn_tienda_modelo_se_ve(p_producto_id uuid)
 returns boolean
 language plpgsql
 stable
 set search_path to 'retail', 'public'
as $function$
begin
  -- PL/pgSQL y no SQL (20261017172000): guarda su plan entre llamadas; la regla es la misma.
  return exists (select 1 from retail.vitrina_productos vp where vp.producto_id = p_producto_id and vp.publicado)
     and retail.fn_vitrina_publicable(p_producto_id);
end
$function$;

reset lock_timeout;
