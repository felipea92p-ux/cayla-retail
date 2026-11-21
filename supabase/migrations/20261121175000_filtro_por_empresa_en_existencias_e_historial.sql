-- ============================================================================
-- 20261121175000 — El filtro «Empresa» en Existencias e Historial, para cualquier tienda con dos empresas o más (ADR-0683, actividad 7)
--
-- EL PROBLEMA PRIMERO. Productos y Reportes ya filtran por empresa donde conviven dos (hoy, Lima). Existencias e Historial no: en Lima se ve todo
-- junto, y con una aliada nueva en otra tienda pasaría lo mismo. Felipe (2026-11-21) eligió: en Existencias se ven las UNIDADES de esa dueña (no las
-- fichas de su marca: una blusa puede tener unidades de las dos), y el filtro va ahora en Existencias e Historial.
--
-- QUÉ PROMETE.
--   · `fn_stock_de_empresa(sede, empresa)`: las unidades de UNA empresa en una sede, por talla y por lugar (piso, almacén, cuarentena), con lo apartado.
--     Para una aliada, sus filas de `stock_dueno`; para CAYLA, el stock menos lo de todas las aliadas en ese mismo lugar. La web las suma con la regla de
--     siempre (`sumarCantidades`), así piso, almacén y disponible salen de la misma cuenta que sin filtro. Solo en una sede con dos empresas o más.
--   · `empresas_de_la_venta(ventas)`: de qué empresas son las prendas de una venta (la regla de cada línea, `fn_dueno_de_la_linea`; sin dueña, CAYLA).
--     Es una «columna calculada»: Historial filtra con ella en la misma consulta de la lista (`?empresas_de_la_venta=cs.{id}`), sin mandar ids.
--   · `fn_empresas_de_sede` deja de tener escrito el id de CAYLA: pregunta a `fn_empresa_casa_id()`, como el resto del ERP.
--
-- QUÉ NO PROMETE. En Historial, una venta con prendas de dos empresas sale con las dos y cuenta entera en el total de arriba (la barra «De quién es lo
-- vendido» sigue partiéndola exacto). Las unidades de cada dueña en camino (traslados) no se separan: el filtro deja fuera lo que solo viene en camino.
--
-- DECIDÍ una columna calculada para Historial. DESCARTÉ pedir primero los ids de las ventas de esa empresa y pasarlos a la lista: en Lima, un mes de
-- CAYLA son cientos de ventas, y cientos de ids no caben en la URL de la consulta.
-- SE ROMPE SI Historial filtra por empresa en un período muy largo de una tienda con mucho movimiento: la columna se calcula venta por venta (medido:
-- un mes de Lima son unas 500 ventas; cada una, dos o tres búsquedas por índice).
--
-- CÓMO VERIFICAR. pnpm pruebas:aliadas-filtros
-- CÓMO SE PEGA. Después de 20261121173000. Una sola parte, sin políticas. Se puede pegar dos veces.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Las empresas de una sede, sin el id de CAYLA escrito a mano ----------
create or replace function retail.fn_empresas_de_sede(p_sede_id uuid)
returns table (id uuid, clave text, nombre text, orden integer)
language sql
stable
security definer
set search_path = retail, public, extensions
as $function$
  -- Las empresas que operan en la sede. Una sede sin filas (nueva, sin sumar a `empresa_sedes`) es solo de la casa: nunca queda sin empresa.
  select t.id, t.clave, t.nombre, t.orden
    from retail.empresas t
   where t.activo
     and (exists (select 1 from retail.empresa_sedes ts where ts.empresa_id = t.id and ts.ubicacion_id = p_sede_id)
          or (t.id = retail.fn_empresa_casa_id()
              and not exists (select 1 from retail.empresa_sedes ts where ts.ubicacion_id = p_sede_id)))
   order by t.orden, t.nombre;
$function$;

-- ---------- 2. Las unidades de una empresa en una sede, por talla y lugar ----------
create or replace function retail.fn_stock_de_empresa(p_ubicacion_id uuid, p_empresa_id uuid)
returns table (variante_id uuid, cantidad integer, cantidad_apartada integer, tipo text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with ajenas as (
    select d.variante_id, d.sububicacion_id, sum(d.cantidad)::integer as cant, sum(d.cantidad_apartada)::integer as apart
      from retail.stock_dueno d
     where d.ubicacion_id = p_ubicacion_id and d.empresa_id <> retail.fn_empresa_casa_id()
     group by d.variante_id, d.sububicacion_id
  ),
  filas as (
    -- Una aliada: lo suyo, lugar por lugar.
    select d.variante_id, d.sububicacion_id, sum(d.cantidad)::integer as cant, sum(d.cantidad_apartada)::integer as apart
      from retail.stock_dueno d
     where d.ubicacion_id = p_ubicacion_id and d.empresa_id = p_empresa_id and p_empresa_id <> retail.fn_empresa_casa_id()
     group by d.variante_id, d.sububicacion_id
    union all
    -- CAYLA: lo que hay en ese lugar menos lo de todas las aliadas en ese mismo lugar.
    select s.variante_id, s.sububicacion_id, (s.cantidad - coalesce(a.cant, 0))::integer, (s.cantidad_apartada - coalesce(a.apart, 0))::integer
      from retail.stock s
      left join ajenas a on a.variante_id = s.variante_id and a.sububicacion_id is not distinct from s.sububicacion_id
     where s.ubicacion_id = p_ubicacion_id and p_empresa_id = retail.fn_empresa_casa_id()
  )
  select f.variante_id, f.cant, f.apart, sb.tipo
    from filas f
    left join retail.sububicaciones sb on sb.id = f.sububicacion_id
   where retail.fn_sede_con_dos_empresas(p_ubicacion_id)
     and retail.fn_tiene_acceso_retail()
     and (f.cant <> 0 or f.apart <> 0);
$$;
revoke all on function retail.fn_stock_de_empresa(uuid, uuid) from public, anon;
grant execute on function retail.fn_stock_de_empresa(uuid, uuid) to authenticated;

-- ---------- 3. De qué empresas son las prendas de una venta (columna calculada de Historial) ----------
create or replace function retail.empresas_de_la_venta(v retail.ventas)
returns uuid[]
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(array_agg(distinct coalesce(retail.fn_dueno_de_la_linea(vi.id), retail.fn_empresa_casa_id())), array[]::uuid[])
    from retail.venta_items vi
   where vi.venta_id = v.id;
$$;
revoke all on function retail.empresas_de_la_venta(retail.ventas) from public, anon;
grant execute on function retail.empresas_de_la_venta(retail.ventas) to authenticated;
comment on function retail.empresas_de_la_venta(retail.ventas) is
  'ADR-0683: de qué empresas son las prendas de esta venta (la dueña de cada línea; sin dueña, la casa). Columna calculada: Historial filtra con ella por empresa.';

do $comprueba$
begin
  if position('ca71a000-' in pg_get_functiondef('retail.fn_empresas_de_sede(uuid)'::regprocedure)) > 0 then
    raise exception 'fn_empresas_de_sede sigue con el id de CAYLA escrito a mano.';
  end if;
end
$comprueba$;

select 'QUEDÓ BIEN' as resultado;
