-- ============================================================================
-- 20261023182000_tienda_ficha_trae_las_insignias.sql — CAYLA V2 · Tienda online: la ficha de la prenda muestra sus insignias (ADR-0489)
-- Las insignias que se asignan en Catálogo ▸ Insignias (Halloween, Top ventas, Reedición, Últimas unidades…) llegan a la ficha de la tienda.
--
-- EL PROBLEMA PRIMERO. Felipe (2026-10-23): «si le asigno una insignia a una prenda, en la web de tienda no se muestra». Era cierto: la
--   tienda solo dibuja tres cosas sobre el nombre —«Nuevo» (lo calcula por las llegadas al piso, no por la insignia «Nuevo» del ERP), «N.º 3 en
--   más vendidos» y el chip rojo del descuento— y `tienda_ficha` no le entregaba las insignias de la prenda. La tienda solo habla con la
--   base por funciones `retail.tienda_*`, así que sin esta función no había forma de que las viera. Datos de producción (2026-10-23): Halloween
--   rige hoy (15-sep al 31-oct) y no la veía ningún cliente.
--
-- ANALOGÍA CAYLA. Es el cartelito que la encargada le cuelga a la percha en la tienda (Reedición, Top ventas): la tienda online tenía la percha
--   pero no el cartel.
--
-- QUÉ HACE.
--   1. `retail.fn_tienda_insignias(p_producto_id, p_sede)`: las insignias que ve el cliente en la ficha de ese modelo, como
--      `[{id, nombre}]`, ordenadas por grupo (Rotación, Artesanal, Campaña, General) y por nombre. Interna: la llama `tienda_ficha`.
--   2. Un reemplazo ANCLADO de una línea en `tienda_ficha`: la prenda trae `'insignias'`. Si el texto de la función no es el revisado, aborta
--      sin tocar nada (todo va en una transacción).
--
-- LA REGLA (una sola vez, aquí). Una insignia se ve en la ficha si:
--   · está aprobada y activa, y hoy (Lima) cae dentro de su vigencia (sin fechas = siempre);
--   · alcanza al modelo como la pantalla de Insignias dice que alcanza (`SellosPantalla`, `lib/sellos-pases.ts`): la marcaron a mano en
--     alguna de sus variantes que se ofrecen (`variante_etiquetas`) o es de TODA su categoría (`etiqueta_categorias`);
--   · si es de ciertas tiendas (`sedes_permitidas`), en la tienda elegida está (con «Todas», si es de alguna tienda de la web);
--   · NO lleva descuento. Una insignia con descuento (`descuento_pct`) no se dibuja aparte: su descuento ya sale en el chip rojo de la
--     ficha, y ese chip es el de la campaña que mejor le conviene al cliente (`fn_tienda_precio_talla`: el mayor % por talla). Así, con
--     varias insignias con descuento, se ve UNA —la mejor— y es exactamente la que baja el precio; y una campaña cuyo descuento no rige en esa
--     tienda (`campana_sedes`) no se muestra sin descuento.
--
-- QUÉ NO HACE. No toca `tienda_catalogo` ni las tarjetas (Felipe pidió solo el detalle de la prenda), no cambia ningún precio ni
--   ninguna campaña, y no escribe nada. La tienda decide cómo se dibuja (`apps/tienda`).
--
-- DECIDÍ: por MODELO, no por talla. La ficha muestra una insignia si CUALQUIERA de las variantes que se ofrecen la lleva. En el ERP se marca
--   por modelo (con excepciones por variante, `lib/etiquetar-prendas.ts`) y un chip que aparece y desaparece al elegir talla movería el nombre
--   de lugar. Costo: «Últimas unidades» marcada solo en una talla se lee en todo el modelo.
-- DESCARTÉ: devolver las insignias por variante y que la ficha las filtre por la talla elegida: más bytes por ficha y un chip que salta de
--   lugar al elegir; Felipe pidió «la prenda», no la talla. Se puede sumar después sin romper este contrato (otro campo, no este).
-- DESCARTÉ: reescribir `tienda_ficha` entera: ya la parcharon otras migraciones con reemplazos anclados (20261015230000,
--   20261021000000) y producción puede tener una versión más nueva; un reemplazo anclado solo toca su línea y se detiene si no la encuentra.
-- DESCARTÉ: sumar las insignias al catálogo (`tienda_catalogo`): serían N insignias por tarjeta en cada lista, para un dato que solo se
--   lee en la ficha.
--
-- SE ROMPE SI: alguien reescribe `tienda_ficha` con el texto de antes de esta migración: la ficha vuelve a no traer insignias, sin error
--   (la tienda tolera que falten; `pnpm pruebas:tienda-insignias` lo vigila). O si una insignia con descuento deja de ser la que cobra la
--   tienda web: el chip rojo y la insignia dirían cosas distintas.
--
-- PRODUCCIÓN. Una sola parte, idempotente (se pega dos veces). Sin políticas, sin `drop trigger` y sin `alter` de tablas en uso (sin riesgo de
--   40P01, ADR-0195); `lock_timeout` 3 s. Sin `select … into` dentro de un texto entre comillas (ADR-0288). Va DESPUÉS de las migraciones
--   de la tienda (20261015012000) y de la de empresa (20261021000000). El orden con la publicación de la web no importa: la web vieja ignora
--   el campo nuevo y la nueva tolera que falte.
-- CAÍDA EXTERNA. Nada llama a la red. Si la base no responde, la ficha ya dice «no pudimos cargar esta prenda»; esto no agrega una dependencia.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda: lo que esta migración usa tiene que existir ----------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('retail.tienda_ficha(uuid, uuid)') is null
     or to_regprocedure('retail.fn_tienda_sedes_web()') is null
     or to_regprocedure('retail.fn_hoy_lima()') is null then
    raise exception 'Faltan las migraciones de la tienda (20261015012000): pégalas antes. No se aplicó nada.';
  end if;
end;
$$;

-- 1. Qué insignias ve el cliente en la ficha de un modelo -----------------------------------------------------------------------------

create or replace function retail.fn_tienda_insignias(p_producto_id uuid, p_sede uuid)
returns jsonb
language sql
stable
set search_path to 'retail', 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre) order by i.orden, i.nombre, i.id), '[]'::jsonb)
    from (
      select e.id, e.nombre,
             case e.estilo when 'urgencia' then 0 when 'positivo' then 1 when 'campana' then 2 else 3 end as orden
        from retail.etiquetas e
       where e.estado = 'aprobado'
         and e.activo
         -- Con descuento no se dibuja aparte: lo dice el chip de la campaña, que es la mejor para el cliente (ver la cabecera).
         and e.descuento_pct is null
         and (e.vigente_desde is null or e.vigente_desde <= retail.fn_hoy_lima())
         and (e.vigente_hasta is null or e.vigente_hasta >= retail.fn_hoy_lima())
         -- Sin tiendas = en todas. Con tiendas: la elegida está o, con «Todas» (p_sede null), alguna de la web.
         and (coalesce(cardinality(e.sedes_permitidas), 0) = 0
              or (p_sede is not null and p_sede = any (e.sedes_permitidas))
              or (p_sede is null and e.sedes_permitidas && retail.fn_tienda_sedes_web()))
         and exists (
           select 1
             from retail.variantes v
             join retail.productos p on p.id = v.producto_id
            where v.producto_id = p_producto_id
              and v.activo
              and (exists (select 1 from retail.variante_etiquetas ve where ve.variante_id = v.id and ve.etiqueta_id = e.id)
                   or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id and ec.categoria_id = p.categoria_id)))
    ) i
$function$;

comment on function retail.fn_tienda_insignias(uuid, uuid) is
  'ADR-0489. Las insignias de Catálogo ▸ Insignias que ve el cliente en la ficha de un modelo: aprobadas, activas, vigentes hoy (Lima), que lo alcanzan por una variante que se ofrece o por su categoría, y que rigen en esa tienda (null = alguna de la web). SIN descuento: la que lo tiene sale como el chip de la campaña. [{id, nombre}] por grupo y nombre. Interna: la llama tienda_ficha.';

revoke all on function retail.fn_tienda_insignias(uuid, uuid) from public, anon, authenticated;

-- 2. `tienda_ficha` trae las insignias de la prenda (reemplazo anclado de una línea) --------------------------------------------------

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text, p_ya_aplicado text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: se mira primero porque, una vez aplicado, el ancla sigue ahí y el conteo la vería repetida.
  if position(p_ya_aplicado in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.tienda_ficha(uuid, uuid)',
  $v$'campana', r.resumen_campana,$v$,
  $v$'campana', r.resumen_campana,
          'insignias', retail.fn_tienda_insignias(p.id, v_sede),$v$,
  $v$retail.fn_tienda_insignias(p.id, v_sede)$v$
);

-- 3. Comprobación: la función es interna, la ficha sigue siendo solo de la tienda y trae el campo ------------------------------------

do $$
begin
  if has_function_privilege('anon', 'retail.fn_tienda_insignias(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.fn_tienda_insignias(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('tienda_web', 'retail.fn_tienda_insignias(uuid, uuid)', 'EXECUTE') then
    raise exception 'tienda insignias: fn_tienda_insignias es interna y nadie de afuera la llama. No se aplicó nada.';
  end if;
  if has_function_privilege('anon', 'retail.tienda_ficha(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.tienda_ficha(uuid, uuid)', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_ficha(uuid, uuid)', 'EXECUTE') then
    raise exception 'tienda insignias: tienda_ficha tiene que seguir siendo solo de tienda_web. No se aplicó nada.';
  end if;
  if position('retail.fn_tienda_insignias(p.id, v_sede)' in pg_get_functiondef('retail.tienda_ficha(uuid, uuid)'::regprocedure)) = 0 then
    raise exception 'tienda insignias: tienda_ficha no quedó con las insignias. No se aplicó nada.';
  end if;
end;
$$;

reset lock_timeout;
