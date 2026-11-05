-- ============================================================================
-- 20261023203000_insignia_con_dibujo_elegido.sql — CAYLA V2 · Catálogo ▸ Insignias: elegir el dibujo de una insignia (ADR-0490)
-- Una insignia (o campaña) puede llevar el dibujo que se elija al crearla —uno de la lista o una IMAGEN PROPIA que se sube—; las que ya existen
-- y las que no eligen siguen saliendo del nombre, como siempre.
--
-- EL PROBLEMA PRIMERO. Felipe (2026-10-23), después de ver la calabaza de Halloween en la tienda: «implementa en el retail lo de poder
--   elegir el ícono de una insignia al crearla». Hoy el dibujo de una insignia sale SOLO de su nombre (`iconoDeInsignia`, en
--   `packages/shared/src/insignias-visual.ts`): hay una familia por concepto (calabaza, pastel, gato…) y todo nombre que no se reconoce
--   cae en una etiqueta genérica. Una campaña nueva («Día del Padre») se ve con la etiqueta hasta que alguien toque el código, y quien
--   la crea no tiene cómo decir «quiero el pastel».
--
-- ANALOGÍA CAYLA. Es el sello de goma de cada insignia: hasta hoy la encargada solo podía escribir el nombre y el taller le ponía el
--   sello por parecido; ahora puede decir «este sello».
--
-- QUÉ HACE.
--   1. `retail.etiquetas.icono` (texto): la clave del dibujo elegido de la lista. Solo se exige su FORMA (minúsculas, 3 a 20 letras): la lista
--      vive en el código compartido y crece ahí; el lector que no reconoce una clave la ignora y dibuja por el nombre, nunca falla.
--      `retail.etiquetas.icono_imagen` (texto): la RUTA de la imagen propia dentro del almacén público `retail-insignias` (el archivo vive allá;
--      la base solo guarda la ruta, como las imágenes de las campañas). Su CHECK la exige con la forma `insignias/<esta insignia>/<archivo>.webp`,
--      así que una insignia no puede apuntar a la imagen de otra ni a un archivo de afuera. Un dibujo de la lista y una imagen propia no
--      conviven: o el uno o la otra (CHECK). Los dos vacíos = «según el nombre».
--   2. `retail.fijar_icono_etiqueta(p_etiqueta_id, p_icono, p_imagen)`: cambiar el dibujo o la imagen (o quitar los dos con null). La llave es
--      la de cada etiqueta (`fn_puede_tocar_etiqueta`, ADR-0476): una campaña, Campañas / Campañas de la tienda web / Insignias; cualquier
--      otra, Insignias. Una sola puerta para las dos clases: una campaña se crea por `crear_campana`, que no cambia, y su dibujo se fija después.
--      Subir el archivo al almacén lo hace el navegador (la política de subida va en 20261023213000, aparte).
--   3. `retail.fn_tienda_insignias` (20261023182000, ADR-0489) entrega también el dibujo elegido, la imagen propia y trae las insignias CON
--      descuento marcadas: `[{id, nombre, icono, imagen, descuento}]` (icono e imagen null = según el nombre; descuento true = la tienda no la
--      dibuja aparte, su descuento es el chip rojo, pero de aquí toma el dibujo o la imagen de esa campaña). Es nuestra y se escribe entera;
--      `tienda_ficha` no se toca.
--
-- QUÉ NO HACE. No cambia ningún permiso ni ninguna política de la tabla (ya da INSERT y UPDATE a `authenticated` en todas sus columnas, así
--   que las columnas nuevas nacen con ellos; el almacén y su política van en 20261023213000), no cambia `crear_campana` (su firma queda), no toca el papel de la etiqueta de precio (sigue por
--   el nombre) y no cambia el dibujo de ninguna insignia que ya existe: todas nacen con `icono` vacío.
--
-- DECIDÍ: dos columnas en la fila de la insignia, vacías por defecto, que no conviven. Son la única fuente: el ERP y la tienda leen el mismo dato.
-- DESCARTÉ: una tabla aparte «insignia_dibujos» (una fila por insignia con un dibujo): sería un join en cada lectura de insignias para un
--   dato de 1 a 1 y sin historia propia.
-- DESCARTÉ: un CHECK con la lista de las 21 claves: cada dibujo nuevo exigiría una migración (un `alter` sobre una tabla en uso) y la lista
--   ya está escrita, tipada, en `shared`. Con solo la forma, lo peor que puede quedar guardado es una clave que el código ya no conoce, y
--   eso se dibuja por el nombre.
-- DESCARTÉ: guardar la imagen en la base (bytea): la tienda la pediría en cada visita y la base no es un almacén de archivos; y reusar el almacén de
--   las fotos de las prendas o el de las campañas (mezcla cosas y abre su política de subida a otro módulo). Lleva el suyo, como cada tipo de imagen.
-- DESCARTÉ: aceptar SVG: un SVG puede traer código, y una imagen subida no se adapta al tema como los dibujos de la lista. Solo imágenes (se reducen
--   a WebP en el navegador); los dibujos vectoriales nuevos los agrega quien programa.
-- DESCARTÉ: agregar `p_icono` a `crear_campana`: una sobrecarga más (la regla de una sola firma por función lo impide) o borrar la
--   función y recrearla con otra firma para que la use una sola pantalla.
-- SE ROMPE SI: se retira un dibujo de `shared` y quedan insignias con su clave (se verían por el nombre, sin error), o si alguien guarda el
--   dibujo con un UPDATE directo a la tabla sin pasar por `fijar_icono_etiqueta` (la política deja al que ya puede editar la fila; la regla
--   de la forma la sigue exigiendo el CHECK).
--
-- PRODUCCIÓN. UNA sola parte, idempotente (se pega dos veces). Un `alter table` sobre una tabla en uso (`etiquetas`, ~25 filas: agregar una
--   columna sin valor por defecto no reescribe nada) con `lock_timeout` 3 s; sin políticas ni `drop trigger` (ADR-0195), así que no hay
--   riesgo de 40P01. Sin `select … into` dentro de un texto entre comillas (ADR-0288). Va DESPUÉS de 20261023182000 y de
--   20261022203000 (ADR-0476). **Se pega ANTES de publicar la web**: la pantalla de Insignias (y Nuevo producto y Editar producto) leen
--   `etiquetas.icono` y, sin la columna, no cargan (el check «SQL pegado» exige pegarla antes de fusionar). La web vieja con la base nueva no
--   cambia nada: ni manda ni lee `icono`. La tienda tolera que la lista traiga o no `icono` y `descuento`.
-- CAÍDA EXTERNA. Nada llama a la red. Si la base no responde, guardar el dibujo falla con su mensaje y la insignia sigue como estaba.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda: lo que esta migración usa tiene que existir ----------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('retail.fn_puede_tocar_etiqueta(uuid, numeric)') is null
     or to_regprocedure('retail.fn_tienda_insignias(uuid, uuid)') is null then
    raise exception 'Faltan 20261022203000 (ADR-0476) o 20261023182000 (ADR-0489): pégalas antes. No se aplicó nada.';
  end if;
end;
$$;

-- 1. La columna ------------------------------------------------------------------------------------------------------------------------

alter table retail.etiquetas add column if not exists icono text, add column if not exists icono_imagen text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'etiquetas_icono_forma' and conrelid = 'retail.etiquetas'::regclass) then
    alter table retail.etiquetas add constraint etiquetas_icono_forma check (icono is null or icono ~ '^[a-z]{3,20}$');
  end if;
  -- La imagen es una RUTA del almacén `retail-insignias`, con la forma que sube el ERP y de ESTA insignia: nunca una dirección, un `..` ni la
  -- imagen de otra (el nombre de la carpeta es su id).
  if not exists (select 1 from pg_constraint where conname = 'etiquetas_icono_imagen_forma' and conrelid = 'retail.etiquetas'::regclass) then
    alter table retail.etiquetas add constraint etiquetas_icono_imagen_forma
      check (icono_imagen is null or icono_imagen ~ '^insignias/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'etiquetas_icono_imagen_es_suya' and conrelid = 'retail.etiquetas'::regclass) then
    alter table retail.etiquetas add constraint etiquetas_icono_imagen_es_suya check (icono_imagen is null or icono_imagen like 'insignias/' || id::text || '/%');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'etiquetas_icono_o_imagen' and conrelid = 'retail.etiquetas'::regclass) then
    alter table retail.etiquetas add constraint etiquetas_icono_o_imagen check (icono is null or icono_imagen is null);
  end if;
end;
$$;

comment on column retail.etiquetas.icono_imagen is
  'ADR-0490. La ruta de la imagen propia de la insignia en el almacén público retail-insignias (insignias/<id de la insignia>/<archivo>.webp). El archivo lo sube el ERP; aquí solo la ruta. No convive con icono (CHECK). Se cambia con fijar_icono_etiqueta.';

comment on column retail.etiquetas.icono is
  'ADR-0490. La clave del dibujo de la insignia (halloween, aniversario, gato, generico…), elegida al crearla. Vacío = según el nombre (iconoDeInsignia, packages/shared). Solo se exige su forma; una clave que el código ya no conoce se dibuja por el nombre. Se cambia con fijar_icono_etiqueta.';

-- 2. Fijar (o quitar) el dibujo o la imagen ---------------------------------------------------------------------------------------------

create or replace function retail.fijar_icono_etiqueta(p_etiqueta_id uuid, p_icono text, p_imagen text default null)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_icono text := nullif(btrim(p_icono), '');
  v_imagen text := nullif(btrim(p_imagen), '');
begin
  -- ADR-0476: la llave es la de ESA etiqueta (una campaña, la de las campañas; otra insignia, Insignias).
  if not retail.fn_puede_tocar_etiqueta(p_etiqueta_id) then
    raise exception 'Cambiar el dibujo de una insignia necesita el módulo «Insignias» (o «Campañas», si es una campaña) en tu rol.' using errcode = '42501';
  end if;
  if v_icono is not null and v_imagen is not null then
    raise exception 'Elige un dibujo de la lista o una imagen propia, no los dos.' using errcode = 'P0001', hint = 'icono_o_imagen';
  end if;
  if v_icono is not null and v_icono !~ '^[a-z]{3,20}$' then
    raise exception 'Ese dibujo no es válido.' using errcode = 'P0001', hint = 'icono_no_valido';
  end if;
  -- La imagen tiene que ser de ESTA insignia (su carpeta lleva su id) y con la forma que sube el ERP; el candado de la tabla lo vuelve a exigir.
  if v_imagen is not null and (v_imagen not like 'insignias/' || p_etiqueta_id::text || '/%' or v_imagen !~ '\.webp$') then
    raise exception 'Esa imagen no es válida para esta insignia.' using errcode = 'P0001', hint = 'imagen_no_valida';
  end if;
  -- La fila se toma primero: dos personas cambiando la misma insignia a la vez se turnan.
  perform 1 from retail.etiquetas e where e.id = p_etiqueta_id and e.estado <> 'rechazado' for update;
  if not found then
    raise exception 'Esa insignia ya no existe. Recarga la pantalla.' using errcode = 'P0001', hint = 'etiqueta_no_existe';
  end if;
  update retail.etiquetas set icono = v_icono, icono_imagen = v_imagen
   where id = p_etiqueta_id and (icono is distinct from v_icono or icono_imagen is distinct from v_imagen);
end;
$$;

comment on function retail.fijar_icono_etiqueta(uuid, text, text) is
  'ADR-0490. Fija (o con null quita) el dibujo de la lista (p_icono) o la imagen propia (p_imagen, su ruta en retail-insignias) de una insignia o campaña; uno u otra, nunca los dos. Pide fn_puede_tocar_etiqueta (ADR-0476). Solo valida la forma de la clave; la lista de dibujos vive en packages/shared.';

revoke all on function retail.fijar_icono_etiqueta(uuid, text, text) from public, anon;
grant execute on function retail.fijar_icono_etiqueta(uuid, text, text) to authenticated, service_role;

-- 3. La tienda recibe el dibujo elegido -------------------------------------------------------------------------------------------------
-- Es la función de ADR-0489 (20261023182000) con dos diferencias: cada insignia trae también `icono` y `imagen` (null = según el nombre) y las que
-- llevan descuento ya no se dejan fuera: vienen con `descuento: true`. La ficha del cliente NO las dibuja aparte (su descuento es el chip
-- rojo de la campaña, la de mayor %), pero el chip toma de aquí el dibujo que se eligió para ESA campaña. Sin esto, una campaña con
-- descuento se vería con el dibujo de su nombre en la tienda y con el elegido en el ERP.

create or replace function retail.fn_tienda_insignias(p_producto_id uuid, p_sede uuid)
returns jsonb
language sql
stable
set search_path to 'retail', 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'icono', i.icono, 'imagen', i.imagen, 'descuento', i.descuento) order by i.orden, i.nombre, i.id), '[]'::jsonb)
    from (
      select e.id, e.nombre, e.icono, e.icono_imagen as imagen, (e.descuento_pct is not null) as descuento,
             case e.estilo when 'urgencia' then 0 when 'positivo' then 1 when 'campana' then 2 else 3 end as orden
        from retail.etiquetas e
       where e.estado = 'aprobado'
         and e.activo
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
  'ADR-0489 y ADR-0490. Las insignias de Catálogo ▸ Insignias de un modelo para su ficha: aprobadas, activas, vigentes hoy (Lima), que lo alcanzan por una variante que se ofrece o por su categoría, y que rigen en esa tienda (null = alguna de la web). [{id, nombre, icono, imagen, descuento}] por grupo y nombre: icono e imagen null = el dibujo sale del nombre; descuento true = la tienda no la dibuja aparte (es el chip de la campaña, la de mayor %) y solo toma de aquí su dibujo o su imagen. Interna: la llama tienda_ficha.';

revoke all on function retail.fn_tienda_insignias(uuid, uuid) from public, anon, authenticated;

-- 4. Comprobación: la columna, la puerta y que la función interna siga cerrada ----------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'etiquetas' and column_name = 'icono_imagen') then
    raise exception 'insignia con dibujo: la columna icono no quedó. No se aplicó nada.';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fijar_icono_etiqueta') <> 1 then
    raise exception 'insignia con dibujo: fijar_icono_etiqueta quedó con más de una firma. No se aplicó nada.';
  end if;
  if has_function_privilege('anon', 'retail.fijar_icono_etiqueta(uuid, text, text)', 'EXECUTE')
     or has_function_privilege('tienda_web', 'retail.fijar_icono_etiqueta(uuid, text, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'retail.fijar_icono_etiqueta(uuid, text, text)', 'EXECUTE') then
    raise exception 'insignia con dibujo: fijar_icono_etiqueta es de authenticated y de nadie más. No se aplicó nada.';
  end if;
  if has_function_privilege('anon', 'retail.fn_tienda_insignias(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.fn_tienda_insignias(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('tienda_web', 'retail.fn_tienda_insignias(uuid, uuid)', 'EXECUTE') then
    raise exception 'insignia con dibujo: fn_tienda_insignias es interna y nadie de afuera la llama. No se aplicó nada.';
  end if;
  if position('retail.fn_tienda_insignias(p.id, v_sede)' in pg_get_functiondef('retail.tienda_ficha(uuid, uuid)'::regprocedure)) = 0 then
    raise exception 'insignia con dibujo: tienda_ficha ya no llama a fn_tienda_insignias (20261023182000 falta o se perdió). No se aplicó nada.';
  end if;
end;
$$;

reset lock_timeout;
