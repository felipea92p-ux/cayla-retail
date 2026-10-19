-- ============================================================================
-- 20261019214000_vitrina_producto_nuevo_nace_visible.sql — Tienda web · un producto nuevo nace con «Se ve en la web» encendido
--
-- EL PROBLEMA PRIMERO. Hoy un producto nuevo no tiene fila en `retail.vitrina_productos`, y «sin fila» se lee como «no se ve»: alguien
-- tiene que entrar a Tienda web ▸ Vitrina y encender cada modelo a mano. Felipe (2026-10-19): lo normal es que una prenda que se
-- da de alta salga en la web; lo excepcional es esconderla. Se invierte el punto de partida SOLO para lo que nazca de aquí en
-- adelante: los modelos que ya existen no se tocan (nada que mostrar de golpe en la web, ni siquiera por error).
--
-- LO QUE HACE
--   Un disparador AFTER sobre `retail.productos` crea la fila de la vitrina con `publicado = true` en dos momentos:
--     · al NACER un producto ya aprobado (lo da de alta un líder: `productos_estado_alta_biut`);
--     · al APROBARSE uno que nació pendiente (la prenda que alguien propuso al contar o al recibir, ADR-0371): sin esto, «Nuevo
--       producto» se vería encendido y «Es nueva» (al recibir) quedaría apagado, y la regla tendría una excepción escondida.
--   Se registra en la Actividad (módulo `vitrina_web`) como cualquier otro cambio de la vitrina.
--
-- LO QUE NO CAMBIA (y por qué no hace falta tocarlo)
--   · Encender no es publicar a ciegas: la tienda y la pantalla siguen preguntando `fn_vitrina_publicable` en cada lectura. Un modelo
--     recién creado sin tallas activas con precio, descontinuado o de prueba no sale en la web aunque su fila diga `publicado`; sale
--     solo cuando se puede vender. Por eso crear el producto ANTES de sus tallas (el orden real de las altas) no deja nada a medias.
--   · Empaque (bolsas, cajas: familia con «Cuenta en Análisis, Frescura y el plan del piso» apagado, ADR-0377) NO se muestra en la
--     web nunca: no se le crea fila.
--   · Quien quiera esconder un modelo lo apaga en la Vitrina, como siempre (`vitrina_guardar_modelo` / `vitrina_mostrar`): ocultar
--     marca `publicado = false` y ninguno de los dos disparadores lo vuelve a encender (solo corren al nacer y al aprobarse).
--   · Una prenda RECHAZADA no pasa por aquí (solo se aprueba o nace aprobada).
--
-- DECIDÍ: un disparador en `productos` y no tocar `crear_producto_con_variantes`. Esa función ya tiene cinco capas de reemplazos
--   anclados y la alta nace por varios caminos (Nuevo producto, «Es nueva» al recibir, el conteo, el modelo nuevo del Taller): con el
--   disparador la regla vive en UN lugar y un camino nuevo la hereda sin enterarse. El disparador solo escribe en una tabla de la
--   vitrina (nada del núcleo de producto/variante/stock) y la fila se va con su producto (`on delete cascade`).
-- DESCARTÉ: (1) leer «sin fila» como «se ve» en `fn_vitrina_modelos` / `tienda_catalogo`: mostraría de golpe los ~256 modelos
--   que hoy no están en la vitrina, incluidos los que Felipe nunca decidió mostrar. (2) Una columna `visible_por_defecto`: otra
--   fuente de verdad para lo mismo que ya dice `vitrina_productos.publicado`. (3) Rellenar los que ya existen: no se pidió y es
--   publicar en nombre de nadie.
-- SE ROMPE SI: alguien da de alta un modelo para probar y NO quiere que salga en la web (se esconde con un toque en la Vitrina, pero
--   mientras tanto la tienda lo ve si ya tiene tallas con precio: el modelo de prueba se marca «de prueba», que la regla ya excluye);
--   o si la familia de un modelo pasa a «fuera de los motores» DESPUÉS de nacer (su fila queda `publicado`, pero `fn_vitrina_por_que_no`
--   dice «empaque» y la tienda no lo muestra).
--
-- PRODUCCIÓN. NO está aplicada. Va DESPUÉS de la Vitrina (20261014225000) y de «solo ropa» (20261015122000). Una sola parte,
-- re-ejecutable, `lock_timeout = 3s`: una función y dos `create or replace trigger` (nunca `drop trigger`, ADR-0195); sin políticas
-- ni `alter` de tablas en uso. Dentro de los textos no hay ningún `select … into` (ADR-0288). Prueba: `pnpm pruebas:vitrina-web`
-- (sección «Un producto nuevo nace visible»).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regclass('retail.vitrina_productos') is null or to_regprocedure('retail.fn_vitrina_anotar(text, text, uuid, text, jsonb)') is null then
    raise exception 'Falta la Vitrina web: pega antes 20261014225000_vitrina_web.sql.';
  end if;
  if to_regprocedure('retail.fn_categoria_entra_a_motores(uuid)') is null then
    raise exception 'Falta retail.fn_categoria_entra_a_motores: pega antes 20261010231000_familias_entran_a_motores.sql.';
  end if;
end
$$;

create or replace function retail.fn_vitrina_producto_nuevo_visible()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_persona uuid;
  v_filas integer;
begin
  -- Un producto de prueba no entra a la vitrina (`fn_vitrina_publicable` tampoco lo dejaría ver) y el empaque se vende en la caja:
  -- a ninguno se le crea fila.
  if new.es_prueba or not retail.fn_categoria_entra_a_motores(new.categoria_id) then
    return new;
  end if;

  -- Quién lo da de alta: el líder que lo creó, o quien lo aprobó si nació pendiente. Sin persona (una carga por script) la fila nace igual.
  v_persona := case when tg_op = 'INSERT' then new.propuesto_por else coalesce(new.aprobado_por, new.propuesto_por) end;

  -- Si la fila ya existe (alguien lo mostró u ocultó antes de que esto corra), no se pisa: lo que decidió una persona manda.
  insert into retail.vitrina_productos (producto_id, publicado, publicado_en, creado_por, actualizado_por)
  values (new.id, true, now(), v_persona, v_persona)
  on conflict (producto_id) do nothing;
  get diagnostics v_filas = row_count;

  if v_filas = 1 and v_persona is not null then
    perform retail.fn_vitrina_anotar(
      'vitrina_mostrada',
      'se muestra en la web «' || new.referencia || '» (producto nuevo)',
      v_persona,
      new.id::text,
      jsonb_build_object('producto_ids', jsonb_build_array(new.id), 'publicado', true, 'origen', 'producto_nuevo'));
  end if;

  return new;
end;
$fn$;

revoke all on function retail.fn_vitrina_producto_nuevo_visible() from public, anon, authenticated;

comment on function retail.fn_vitrina_producto_nuevo_visible() is
  'Tienda web: un producto que nace aprobado, o que se aprueba, entra a la vitrina con «Se ve en la web» encendido (2026-10-19). No es ropa o es de prueba: sin fila. Lo que se puede vender lo sigue decidiendo fn_vitrina_publicable en cada lectura. Interna.';

create or replace trigger productos_vitrina_nace_visible_ai
  after insert on retail.productos
  for each row
  when (new.estado_alta = 'aprobado')
  execute function retail.fn_vitrina_producto_nuevo_visible();

create or replace trigger productos_vitrina_se_aprueba_au
  after update of estado_alta on retail.productos
  for each row
  when (new.estado_alta = 'aprobado' and old.estado_alta is distinct from 'aprobado')
  execute function retail.fn_vitrina_producto_nuevo_visible();
