-- Un nombre, un producto POR MARCA — y la carrera entre dos sedes que crean lo mismo a la vez (ADR-0294, fases 2b y 2c; D1 de Felipe).
--
-- EL PROBLEMA, DOS VECES.
--  (2c) Hoy el índice `productos_referencia_clave_unica` es único en TODA la tienda: «Wide Leg» de Jirish bloquea «Wide Leg» de otra marca.
--       Felipe decidió (D1) que la identidad de una prenda es marca + nombre: el mismo nombre en dos marcas son dos prendas.
--  (2b) Si AQP y TRU crean «Polo G44» al mismo tiempo, las dos pasan el chequeo de nombre (ninguna ve a la otra todavía) y la segunda choca
--       contra el índice único. El error que llegaba era un `23505` seco, sin pista de QUIÉN ganó: la pantalla no podía decirle a la segunda
--       sede «ya existe, ábrela». `censo_crear_variante` ya resolvía esta carrera (se cuelga del producto del ganador); `crear_producto_con_variantes` no.
--
-- LA DECISIÓN.
--   1. Índice nuevo `productos_marca_referencia_clave_unica` sobre (marca_id, clave del nombre), con NULLS NOT DISTINCT: dos productos SIN marca
--      con el mismo nombre siguen chocando (si no, «sin marca» sería una puerta trasera al duplicado). Se crea ANTES de soltar el viejo y es
--      más permisivo que él, así que no puede fallar por datos existentes; el viejo se suelta al FINAL, cuando las funciones ya hablan en marca.
--   2. `crear_producto_con_variantes`: el chequeo de «idéntico» y de «una letra» compara solo contra productos de la MISMA marca, y si aun así
--      la base rechaza el INSERT por el índice (la carrera), responde `nombre_duplicado` con el id del ganador, igual que el chequeo previo.
--      Un reintento con el mismo token a la vez (doble clic) devuelve el producto ya creado en vez de un error.
--   3. `catalogo_actualizar_producto`: renombrar compara contra los de la marca que quedará (la nueva si se manda, si no la actual).
--   4. `censo_crear_variante`: el producto del nombre se busca en la marca que llega; sin marca (el conteo a veces no la conoce) se sigue colgando
--      de cualquier producto de ese nombre, para no crear un duplicado donde hoy se reutiliza.
--
-- BUSCAR POR MARCA. `buscar_productos_parecidos` gana dos parámetros con valor de fábrica (`p_marca_id`, `p_por_marca`) para que la PANTALLA
-- frene exactamente lo que la base frena. Las funciones de alta y de edición siguen filtrando con un `join` propio (no dependen de que
-- quien las llame mande el parámetro) y, como la búsqueda devuelve solo 5 filas, si hubiera 5 homónimos de otras marcas podrían no ver al de la misma:
-- en ese caso el índice nuevo lo frena igual y la carrera responde `nombre_duplicado` con su id. Nada de esto toca `movimientos` ni `stock`.
--
-- CÓMO SE HACE (y por qué así). Las tres funciones se parchean con reemplazos ANCLADOS sobre su definición viva de producción (ADR-0283: sus
-- versiones vivas no son las de ningún archivo), exigiendo que cada ancla aparezca las veces esperadas; si la función cambió, aborta sin tocar
-- nada. Re-ejecutable: si ya está parcheada, no hace nada. Dentro de los textos entre comillas NO hay un `select … into` (CLAUDE.md, «El SQL
-- Editor agrega líneas por su cuenta»): la fila del ganador se lee con `for … in select … loop exit; end loop`.
--
-- PARA PEGAR EN PRODUCCIÓN (una sola parte; no hay políticas ni `alter table`): primero un ensayo con `begin; …; rollback;` (CLAUDE.md).
-- Tras pegar: `pnpm datos:generar:produccion` (el índice cambió de nombre).

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. El índice por marca (primero el nuevo, más permisivo; el viejo se suelta al final) ----------

create unique index if not exists productos_marca_referencia_clave_unica
  on retail.productos (marca_id, (retail.fn_clave_referencia(referencia))) nulls not distinct
  where estado_alta <> 'rechazado';

comment on index retail.productos_marca_referencia_clave_unica is
  'Un nombre, un producto POR MARCA (ADR-0294, D1). NULLS NOT DISTINCT: dos productos sin marca con el mismo nombre también chocan. Reemplaza a productos_referencia_clave_unica (único en toda la tienda).';

-- ---------- 2. Ayudante: reemplazo anclado y re-ejecutable ----------

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Re-ejecutable: el texto nuevo contiene al viejo, así que si ya está puesto no se vuelve a parchear.
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

-- Varios reemplazos sobre la MISMA definición, aplicados juntos con un solo `create or replace`: cuando dos cambios solo valen
-- como par (abrir un `begin` y cerrarlo con su `exception … end;`), aplicarlos de a uno dejaría una función que no compila.
create or replace function pg_temp.reemplazar_juntos(p_firma text, p_viejos text[], p_nuevos text[], p_veces integer[])
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
  i integer;
  v_todos_puestos boolean := true;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  for i in 1 .. array_length(p_viejos, 1) loop
    if position(p_nuevos[i] in v_def) = 0 then
      v_todos_puestos := false;
    end if;
  end loop;
  if v_todos_puestos then
    return;
  end if;
  for i in 1 .. array_length(p_viejos, 1) loop
    v_n := (length(v_def) - length(replace(v_def, p_viejos[i], ''))) / length(p_viejos[i]);
    if v_n <> p_veces[i] then
      raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
        p_firma, p_veces[i], p_viejos[i], v_n;
    end if;
    v_def := replace(v_def, p_viejos[i], p_nuevos[i]);
  end loop;
  execute v_def;
end;
$f$;

-- ---------- 2b. buscar_productos_parecidos: poder preguntar «dentro de esta marca» ----------
-- La pantalla de Nuevo/Editar producto frena con lo que esta función responde: si ella sigue mirando todas las marcas, la pantalla frenaría un
-- nombre que la base ya deja pasar. Dos parámetros NUEVOS con valor de fábrica (el comportamiento de antes si no se mandan):
--   p_por_marca = true  → solo cuenta los productos cuya marca es `p_marca_id` (null = sin marca, también cuenta: `is not distinct from`);
--   p_por_marca = false → todas las marcas, como hasta hoy.
-- Cambiar los parámetros de una función obliga a soltar la vieja (si no queda una SOBRECARGA y una llamada con dos argumentos sería ambigua) y
-- a repetir sus permisos: `drop function` borra el `grant`. Nada depende de ella en la base (las funciones plpgsql la llaman por nombre).
drop function if exists retail.buscar_productos_parecidos(text, uuid);

create function retail.buscar_productos_parecidos(
  p_referencia text,
  p_excluir_id uuid default null,
  p_marca_id uuid default null,
  p_por_marca boolean default false
)
 returns table(id uuid, referencia text, categoria_id uuid, categoria text, nivel text, similitud real)
 language sql
 stable
 set search_path to 'retail', 'public', 'extensions'
as $function$
  with q as (
    select retail.fn_clave_referencia(p_referencia) as k, retail.fn_clave_texto(p_referencia) as t
  ),
  cand as (
    select
      p.id,
      p.referencia,
      p.categoria_id,
      c.nombre as categoria,
      case
        when retail.fn_clave_referencia(p.referencia) = q.k then 'identico'
        when retail.fn_dentro_de_una_edicion(retail.fn_clave_referencia(p.referencia), q.k) then 'una_letra'
        else 'parecido'
      end as nivel,
      similarity(retail.fn_clave_texto(p.referencia), q.t) as similitud
    from retail.productos p
      join retail.categorias c on c.id = p.categoria_id
      cross join q
    where q.k is not null
      and p.estado_alta <> 'rechazado'
      and (p_excluir_id is null or p.id <> p_excluir_id)
      and (not p_por_marca or p.marca_id is not distinct from p_marca_id)
  )
  select id, referencia, categoria_id, categoria, nivel, similitud
  from cand
  where nivel <> 'parecido' or similitud >= 0.5
  order by case nivel when 'identico' then 0 when 'una_letra' then 1 else 2 end, similitud desc, referencia
  limit 5;
$function$;

revoke all on function retail.buscar_productos_parecidos(text, uuid, uuid, boolean) from public, anon;
grant execute on function retail.buscar_productos_parecidos(text, uuid, uuid, boolean) to authenticated;

-- ---------- 3. crear_producto_con_variantes: misma marca + la carrera ----------

-- Tres cambios que solo valen juntos (abrir el `begin` y cerrarlo con su `exception … end;`):
--  · «idéntico» y «una letra» solo cuentan dentro de la misma marca;
--  · el INSERT va en su propio bloque: si pierde la carrera contra el índice, responde con el id del ganador.
do $$ begin perform pg_temp.reemplazar_juntos(
  'retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid)',
  array[
    $r$from buscar_productos_parecidos(v_ref) b$r$,
    $r$insert into productos (categoria_id, referencia, descripcion, token_cliente, tejido_id, patron_id, marca_id, proveedor_id)$r$,
    $r$returning id into v_producto_id;$r$],
  array[
    $r$from buscar_productos_parecidos(v_ref) b join productos pm on pm.id = b.id and pm.marca_id is not distinct from p_marca_id$r$,
    $r$begin
  insert into productos (categoria_id, referencia, descripcion, token_cliente, tejido_id, patron_id, marca_id, proveedor_id)$r$,
    $r$returning id into v_producto_id;
  exception when unique_violation then
    -- Otra sede creó el mismo nombre en la misma marca un instante antes (ADR-0294, carrera entre sedes). No es un error de quien
    -- guarda: primero, un reintento con su propio token devuelve el producto ya creado; si no, se le dice cuál es el que ganó.
    if p_token is not null then
      v_par_id := (select pr.id from productos pr where pr.token_cliente = p_token);
      if v_par_id is not null then
        return v_par_id;
      end if;
    end if;
    v_par_id := null;
    for v_par_id, v_par_ref in
      select pr.id, pr.referencia from productos pr
      where fn_clave_referencia(pr.referencia) = fn_clave_referencia(v_ref)
        and pr.marca_id is not distinct from p_marca_id
        and pr.estado_alta <> 'rechazado'
    loop
      exit;
    end loop;
    if v_par_id is null then
      raise;
    end if;
    raise exception 'Ya existe un producto llamado "%". Búscalo en Productos en vez de crearlo otra vez.', v_par_ref
      using hint = 'nombre_duplicado', detail = v_par_id::text;
  end;$r$],
  array[1, 1, 1]); end $$;

-- ---------- 4. catalogo_actualizar_producto: renombrar compara dentro de la marca que quedará ----------

do $$ begin perform pg_temp.reemplazar(
  'retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb, uuid, uuid, uuid, uuid, boolean, integer)',
  $r$from buscar_productos_parecidos(v_ref_nueva, p_producto_id) b$r$,
  $r$from buscar_productos_parecidos(v_ref_nueva, p_producto_id) b join productos pm on pm.id = b.id and pm.marca_id is not distinct from coalesce(p_marca_id, (select x.marca_id from productos x where x.id = p_producto_id))$r$,
  1); end $$;

-- ---------- 5. censo_crear_variante: el producto del nombre se busca en la marca que llega ----------
-- Dos búsquedas idénticas (la normal y la de la carrera). Con marca: solo esa marca. Sin marca: cualquiera, prefiriendo la que no tiene marca,
-- y siempre la misma (`order by … limit 1`), para que el resultado no dependa del azar.

do $$ begin perform pg_temp.reemplazar(
  'retail.censo_crear_variante(text, uuid, text, uuid, text, numeric, numeric, uuid, uuid)',
  $r$where retail.fn_clave_referencia(pr.referencia) = retail.fn_clave_referencia(p_referencia)$r$,
  $r$where retail.fn_clave_referencia(pr.referencia) = retail.fn_clave_referencia(p_referencia)
      and (p_marca_id is null or pr.marca_id is not distinct from p_marca_id)$r$,
  2); end $$;

do $$ begin perform pg_temp.reemplazar(
  'retail.censo_crear_variante(text, uuid, text, uuid, text, numeric, numeric, uuid, uuid)',
  $r$and pr.estado_alta <> 'rechazado';$r$,
  $r$and pr.estado_alta <> 'rechazado'
    order by (pr.marca_id is not null), pr.id
    limit 1;$r$,
  2); end $$;

-- ---------- 6. Soltar el índice viejo (el más estricto) ----------

drop index if exists retail.productos_referencia_clave_unica;
