-- ============================================================================
-- 20261023221000_insignia_imagen_como_silueta.sql — Catálogo ▸ Insignias: la imagen propia puede pintarse como silueta (ADR-0490, act. b)
-- Una insignia con imagen propia puede decir «píntala con el color del sello»: la imagen se usa solo por su forma y toma el color del lugar donde
-- se dibuja (tinta en claro, crema en oscuro), como los 21 dibujos de la lista. Las imágenes que ya existen no cambian: nacen sin silueta.
--
-- EL PROBLEMA PRIMERO. Felipe (2026-10-23): una imagen propia no cambia con el modo oscuro del ERP, y un logo de trazo oscuro sobre fondo
--   transparente casi desaparece sobre el fondo oscuro. De las tres salidas que se le mostraron eligió «pintar como silueta»: para un logo de un
--   solo color, el sistema lo usa como molde y lo pinta del color que toque. El ERP deja el archivo ya convertido (blanco con la forma como
--   transparencia); falta SABER que ese archivo es un molde y no una imagen a todo color, y eso es lo único que se guarda aquí.
--
-- ANALOGÍA CAYLA. Es la diferencia entre el sello de goma —el molde, que toma la tinta que le pongas— y una foto pegada con sus propios colores. Quien
--   mira el cajón tiene que saber cuál es cuál para no pintar una foto con tinta.
--
-- QUÉ HACE.
--   1. `retail.etiquetas.icono_imagen_silueta` (boolean, falso por defecto): la imagen propia (`icono_imagen`) es un molde que se pinta con el color
--      del lugar. Solo tiene sentido con una imagen: su CHECK exige que, si es verdadera, haya imagen (nunca una silueta de nada).
--   2. `retail.fijar_icono_etiqueta(p_etiqueta_id, p_icono, p_imagen, p_silueta)`: la misma puerta de 20261023203000 con un cuarto dato. Cambia de
--      firma (3 → 4 datos, el último con valor por defecto): se borra la firma vieja y se crea la nueva, para que quede UNA sola. Una llamada de
--      antes (sin `p_silueta`) sigue valiendo: es «sin silueta». La llave no cambia (`fn_puede_tocar_etiqueta`, ADR-0476).
--   3. `retail.fn_tienda_insignias` entrega también `silueta` en cada insignia: `[{id, nombre, icono, imagen, silueta, descuento}]`. Es nuestra y se
--      escribe entera; `tienda_ficha` no se toca.
--
-- QUÉ NO HACE. No toca permisos de tablas ni políticas (la columna nace con los INSERT y UPDATE que la tabla ya da a `authenticated`), no cambia el
--   almacén ni su política (20261023213000) y no convierte ninguna imagen que ya existe: la conversión la hace el navegador al subir.
--
-- DECIDÍ: una columna booleana junto a la ruta de la imagen. Es el único dato nuevo y lo leen igual el ERP y la tienda.
-- DESCARTÉ: marcar la silueta en el nombre del archivo (`<archivo>-s.webp`): obliga a aflojar el CHECK de la forma de la ruta (20261023203000) y a que
--   cada lector parta el nombre para saberlo; un dato escondido en un texto es el que se rompe sin aviso.
-- DESCARTÉ: decidirlo al dibujar mirando la imagen (¿tiene un solo color?): el navegador de quien mira tendría que adivinar, y un logo de dos tonos se
--   pintaría a veces sí y a veces no. Lo decide quien sube, una vez, mirando la vista previa.
-- SE ROMPE SI: se sube una imagen a todo color con la silueta marcada (se vería como una mancha de un solo color: el ERP muestra la vista previa antes
--   de guardar y la persona la desmarca), o si la web nueva se publica antes de pegar esta migración (la pantalla de Insignias lee la columna y no carga).
--
-- PRODUCCIÓN. UNA sola parte, idempotente (se pega dos veces). Un `alter table` sobre una tabla en uso (`etiquetas`, ~25 filas): agregar una columna
--   booleana con valor por defecto constante no reescribe la tabla (Postgres 11 en adelante); el CHECK recorre esas ~25 filas. `lock_timeout` 3 s. Sin
--   políticas ni `drop trigger` (ADR-0195). `drop function` no toma las tablas de `auth` ni `storage`. Va DESPUÉS de 20261023203000 y 20261023213000.
--   **Se pega ANTES de publicar la web.** La web vieja con la base nueva no cambia nada: llama a `fijar_icono_etiqueta` con tres datos y vale.
-- CAÍDA EXTERNA. Nada llama a la red. Si la base no responde, guardar falla con su mensaje y la insignia sigue como estaba.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda: lo que esta migración usa tiene que existir ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'etiquetas' and column_name = 'icono_imagen')
     or to_regprocedure('retail.fn_tienda_insignias(uuid, uuid)') is null
     or to_regprocedure('retail.fn_puede_tocar_etiqueta(uuid, numeric)') is null then
    raise exception 'Falta 20261023203000 (ADR-0490): pégala antes. No se aplicó nada.';
  end if;
end;
$$;

-- 1. La columna ------------------------------------------------------------------------------------------------------------------------

alter table retail.etiquetas add column if not exists icono_imagen_silueta boolean not null default false;

do $$
begin
  -- Una silueta es siempre de una imagen: sin imagen no hay nada que pintar.
  if not exists (select 1 from pg_constraint where conname = 'etiquetas_icono_silueta_con_imagen' and conrelid = 'retail.etiquetas'::regclass) then
    alter table retail.etiquetas add constraint etiquetas_icono_silueta_con_imagen check (not icono_imagen_silueta or icono_imagen is not null);
  end if;
end;
$$;

comment on column retail.etiquetas.icono_imagen_silueta is
  'ADR-0490 (act. b). La imagen propia (icono_imagen) es un molde —blanco con la forma como transparencia— que se pinta con el color del lugar donde se dibuja, como los dibujos de la lista; falso = una imagen a todo color. Solo con imagen (CHECK). Se cambia con fijar_icono_etiqueta.';

-- 2. Fijar (o quitar) el dibujo, la imagen y si es silueta ------------------------------------------------------------------------------

-- La firma de tres datos se borra: con la de cuatro (el último con valor por defecto) la llamada de antes seguiría resolviéndose, pero habría DOS
-- funciones con el mismo nombre y la regla es una sola firma por función.
drop function if exists retail.fijar_icono_etiqueta(uuid, text, text);

create or replace function retail.fijar_icono_etiqueta(p_etiqueta_id uuid, p_icono text, p_imagen text default null, p_silueta boolean default false)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_icono text := nullif(btrim(p_icono), '');
  v_imagen text := nullif(btrim(p_imagen), '');
  v_silueta boolean := coalesce(p_silueta, false);
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
  -- Una silueta es de una imagen propia: sin imagen no hay nada que pintar.
  if v_silueta and v_imagen is null then
    raise exception 'La silueta es de una imagen propia: sube una imagen o quita la silueta.' using errcode = 'P0001', hint = 'silueta_sin_imagen';
  end if;
  -- La fila se toma primero: dos personas cambiando la misma insignia a la vez se turnan.
  perform 1 from retail.etiquetas e where e.id = p_etiqueta_id and e.estado <> 'rechazado' for update;
  if not found then
    raise exception 'Esa insignia ya no existe. Recarga la pantalla.' using errcode = 'P0001', hint = 'etiqueta_no_existe';
  end if;
  update retail.etiquetas set icono = v_icono, icono_imagen = v_imagen, icono_imagen_silueta = v_silueta
   where id = p_etiqueta_id
     and (icono is distinct from v_icono or icono_imagen is distinct from v_imagen or icono_imagen_silueta is distinct from v_silueta);
end;
$$;

comment on function retail.fijar_icono_etiqueta(uuid, text, text, boolean) is
  'ADR-0490. Fija (o con null quita) el dibujo de la lista (p_icono) o la imagen propia (p_imagen, su ruta en retail-insignias) de una insignia o campaña; uno u otra, nunca los dos. p_silueta (falso por defecto): la imagen es un molde que se pinta con el color del lugar; solo con imagen. Pide fn_puede_tocar_etiqueta (ADR-0476). Solo valida la forma de la clave; la lista de dibujos vive en packages/shared.';

revoke all on function retail.fijar_icono_etiqueta(uuid, text, text, boolean) from public, anon;
grant execute on function retail.fijar_icono_etiqueta(uuid, text, text, boolean) to authenticated, service_role;

-- 3. La tienda recibe si la imagen es silueta ---------------------------------------------------------------------------------------------
-- Es la función de 20261023203000 con un dato más por insignia: `silueta` (la imagen se pinta con el color del chip). Nada más cambia.

create or replace function retail.fn_tienda_insignias(p_producto_id uuid, p_sede uuid)
returns jsonb
language sql
stable
set search_path to 'retail', 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'icono', i.icono, 'imagen', i.imagen, 'silueta', i.silueta, 'descuento', i.descuento) order by i.orden, i.nombre, i.id), '[]'::jsonb)
    from (
      select e.id, e.nombre, e.icono, e.icono_imagen as imagen, e.icono_imagen_silueta as silueta, (e.descuento_pct is not null) as descuento,
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
  'ADR-0489 y ADR-0490. Las insignias de Catálogo ▸ Insignias de un modelo para su ficha: aprobadas, activas, vigentes hoy (Lima), que lo alcanzan por una variante que se ofrece o por su categoría, y que rigen en esa tienda (null = alguna de la web). [{id, nombre, icono, imagen, silueta, descuento}] por grupo y nombre: icono e imagen null = el dibujo sale del nombre; silueta true = la imagen es un molde que se pinta con el color del chip; descuento true = la tienda no la dibuja aparte (es el chip de la campaña, la de mayor %) y solo toma de aquí su dibujo o su imagen. Interna: la llama tienda_ficha.';

revoke all on function retail.fn_tienda_insignias(uuid, uuid) from public, anon, authenticated;

-- 4. Comprobación: la columna, la puerta (una sola firma, cerrada a anon y a tienda_web) y la función interna ------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'etiquetas' and column_name = 'icono_imagen_silueta') then
    raise exception 'imagen como silueta: la columna no quedó. No se aplicó nada.';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fijar_icono_etiqueta') <> 1
     or to_regprocedure('retail.fijar_icono_etiqueta(uuid, text, text, boolean)') is null then
    raise exception 'imagen como silueta: fijar_icono_etiqueta tiene que tener UNA sola firma, la de cuatro datos. No se aplicó nada.';
  end if;
  if has_function_privilege('anon', 'retail.fijar_icono_etiqueta(uuid, text, text, boolean)', 'EXECUTE')
     or has_function_privilege('tienda_web', 'retail.fijar_icono_etiqueta(uuid, text, text, boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'retail.fijar_icono_etiqueta(uuid, text, text, boolean)', 'EXECUTE') then
    raise exception 'imagen como silueta: fijar_icono_etiqueta es de authenticated y de nadie más. No se aplicó nada.';
  end if;
  if has_function_privilege('anon', 'retail.fn_tienda_insignias(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.fn_tienda_insignias(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('tienda_web', 'retail.fn_tienda_insignias(uuid, uuid)', 'EXECUTE') then
    raise exception 'imagen como silueta: fn_tienda_insignias es interna y nadie de afuera la llama. No se aplicó nada.';
  end if;
end;
$$;

reset lock_timeout;
