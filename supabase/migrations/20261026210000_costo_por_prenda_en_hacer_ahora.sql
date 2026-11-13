-- ============================================================================
-- 20261026210000_costo_por_prenda_en_hacer_ahora.sql — CAYLA V2 · ADR-0519 sobre ADR-0393 («Para después» ▸ «Hacer ahora»)
-- El costo de cada prenda también se cambia cuando se identifica en «Para después», no solo al cerrar el envío.
--
-- EL PROBLEMA PRIMERO. ADR-0519 dejó que quien cierra un envío ponga un costo propio a cada prenda que separó. Pero cuando al contar solo se
-- dijo «5 blusas» sin decir cuáles, el cierre no puede costear a nadie (no se cambia el costo de algo que no se sabe qué es): esas prendas se
-- identifican después, en «Para después» ▸ «Hacer ahora», y ahí entran al stock con el costo de su LÍNEA. Si la prenda costó otra cosa —un
-- error al comprar, un precio que cambió—, la única salida es corregirla desde Catálogo cuando ya entró. Felipe (2026-10-26/27): «se debe poder
-- cambiar tanto el precio de venta como el costo»; el precio ya se cambia ahí (20261026180000), el costo faltaba.
--
-- QUÉ CAMBIA (todo con reemplazos ANCLADOS sobre la definición viva: si el texto no es el esperado, se detiene sin cambiar nada)
--   1. `resolver_pendiente_envio` («Hacer ahora»): acepta en `p_separado -> 'costos'` el costo propio de las prendas que se identifican
--      ahora (`{"<producto_id>": 55.5}`). Lo valida con LAS MISMAS reglas del cierre (`fn_envio_costos_prendas`: solo prendas de esa hoja,
--      S/ 0 a 99 999.99 con dos decimales, vacío = no cambia) y con el mismo permiso (un envío sin aviso: el costo de una línea de fuera de la
--      guía solo lo escribe quien ve el dinero de Compras). Las variantes que entran ahora llevan ESE costo, y pasan por la revisión del costo
--      atípico de siempre (`fn_recepcion_entrar`, ADR-0519). Sin `costos`, todo es idéntico a hoy.
--   2. `despacho_conteos.costos_prendas` se queda con lo escrito (se suma a lo que ya había; lo de ahora gana; la función lo lee como
--      `v_k.costos_prendas`, el mismo nombre de ADR-0519, así su migración sigue siendo re-aplicable tal cual): lo que de esa prenda se
--      detalle después —un pendiente que entra por partes— entra con el mismo costo, y la pantalla lo muestra al volver. Sin esto, la segunda
--      mitad de una prenda entraría en silencio al costo de la línea.
--   3. `fn_despacho_conteos_fija` (el candado de lo contado), REEMPLAZO ANCLADO: con el envío CERRADO deja cambiar la columna
--      `costos_prendas` y NINGUNA otra de la fila, y solo mientras `resolver_pendiente_envio` o `ligar_prenda_a_pendiente` tienen encendida su
--      marca de transacción `retail.costo_de_prenda`. Lo contado, la línea y el envío siguen sin poder cambiar.
--   4. `ligar_prenda_a_pendiente` (20261026163000), REEMPLAZO ANCLADO: el costo que se le puso a una prenda NUEVA por su descripción
--      (`nueva:<descripción>`, ADR-0519) pasa a ser el de la prenda ya creada (su `producto_id`), porque el pendiente «crear» deja de tener
--      descripción al volverse «detalle» y ese costo se perdería.
--
-- LO QUE NO CAMBIA
--   · Con `costos` ausente o vacío, `resolver_pendiente_envio` y `ligar_prenda_a_pendiente` hacen exactamente lo de hoy.
--   · El costo de la línea, el de las demás prendas y lo ya recibido: no se tocan. El costo de una prenda solo cambia lo que entra AHORA.
--   · Quién puede: el mismo que hoy detalla un pendiente (módulo Recibir, su sede, decisión 17 de ADR-0362).
--   · El comprobante y el pago de Compras (ADR-0480, actividad 7): Compras ve el papel; la tienda, la mercadería.
--
-- LO QUE NUNCA DEBE EXISTIR (y quién lo impide)
--   · Un costo con más decimales, negativo o de más de S/ 99 999.99 → `fn_envio_costos_prendas` lo rechaza (hint `recepcion_costo`) y no se
--     escribe nada.
--   · Una fila de lo contado que cambia con el envío cerrado, salvo su costo por prenda → el candado exige la marca de la función y que
--     todo lo demás de la fila sea idéntico.
--   · El costo propio de una prenda que no es de esta hoja → se ignora (la pantalla pudo quedarse vieja).
--
-- DESCARTÉ
--   · Un parámetro nuevo en `resolver_pendiente_envio`: cambia su firma (una función sobrecargada es otra función para los permisos y para las
--     llamadas con nombre). `p_separado` ya viaja entero en la huella del doble clic, así que el costo queda cubierto por la misma idempotencia.
--   · No guardar el costo en el conteo (que solo viva en lo recibido): la segunda parte de una prenda entraría al costo de la línea sin que
--     nadie lo vea. A cambio se abre una rendija mínima en el candado del conteo, vigilada por su marca y por «todo lo demás igual».
--   · Un campo de costo para las prendas nuevas descritas en la hoja de «separar»: no tienen precio de venta aquí tampoco; su costo se
--     escribe al crearlas («Crear ahora» entra a su hoja de tallas con el costo que la línea trae).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, DESPUÉS de 20261026164000 —ya está— y de 20261026163000). UNA parte: solo funciones y
-- reemplazos anclados, sin tablas, políticas, `alter` ni `drop trigger` (ADR-0195), con `lock_timeout`. Idempotente. Sin `select … into`
-- dentro de textos entre comillas (ADR-0288). El bloque final comprueba que quedó todo.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

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

-- ---------- 1. El candado de lo contado deja anotar el costo de una prenda con el envío cerrado ----------
select pg_temp.reemplazar('retail.fn_despacho_conteos_fija()',
$v$  if not exists (select 1 from retail.despachos d where d.id = new.despacho_id and d.estado = 'abierto') then$v$,
$n$  -- ADR-0519 («Hacer ahora»): con el envío CERRADO se deja cambiar el costo de una prenda (`costos_prendas`) y nada más de la fila, y solo
  -- mientras `resolver_pendiente_envio` o `ligar_prenda_a_pendiente` tienen encendida su marca de esta transacción.
  -- (El CASE protege a OLD: en un INSERT no existe.)
  if not exists (select 1 from retail.despachos d where d.id = new.despacho_id and d.estado = 'abierto')
     and not coalesce(case when tg_op = 'UPDATE'
                           then current_setting('retail.costo_de_prenda', true) = 'si'
                                and (to_jsonb(new) - 'costos_prendas') = (to_jsonb(old) - 'costos_prendas')
                                and exists (select 1 from retail.despachos d where d.id = new.despacho_id and d.estado = 'cerrado')
                      end, false) then$n$,
1);

-- ---------- 2. «Hacer ahora» recibe el costo de cada prenda que se identifica ----------
select pg_temp.reemplazar('retail.resolver_pendiente_envio(uuid,uuid,integer,uuid,jsonb,boolean,uuid)',
$v$  v_fila retail.despacho_conteos;
begin
$v$,
$n$  v_fila retail.despacho_conteos;
  v_cp jsonb := '{}'::jsonb;
begin
$n$,
1);
select pg_temp.reemplazar('retail.resolver_pendiente_envio(uuid,uuid,integer,uuid,jsonb,boolean,uuid)',
$v$  -- Lo que trae tallas y colores entra; lo demás (solo desde lo sin separar) queda pendiente.
$v$,
$n$  -- ADR-0519 («Hacer ahora»): el costo propio de las prendas que se identifican ahora, como {"<producto_id>": 55.5} en `p_separado -> 'costos'`.
  -- Las mismas reglas que al cerrar (`fn_envio_costos_prendas`: solo prendas de esta hoja, S/ 0 a 99 999.99 con dos decimales, vacío = no cambia)
  -- y el mismo permiso: en un envío sin aviso, el costo de una línea de fuera de la guía solo lo escribe quien ve el dinero de Compras.
  v_cp := retail.fn_envio_costos_prendas(jsonb_build_object('costos_prendas', p_separado -> 'costos'), v_sep, v_k.donde);
  if v_cp <> '{}'::jsonb and v_k.despacho_item_id is null and not retail.fn_puede_ver_dinero_de_compras()
     and exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id) then
    raise exception 'Tu rol no ve el dinero de Compras: recibe sin costo, llega con la factura' using hint = 'recepcion_costo_sin_permiso';
  end if;
  if v_cp <> '{}'::jsonb and coalesce(v_k.costos_prendas, '{}'::jsonb) || v_cp is distinct from v_k.costos_prendas then
    -- Lo de ahora gana sobre lo que ya había. Se asigna al propio `v_k.costos_prendas`: el resto de la función (la puerta al stock, escrita por
    -- ADR-0519 con ese nombre) lo lee tal cual, sin tocarla. Y se queda en el conteo: lo que de esa prenda se detalle después entra con el
    -- mismo costo. La marca se apaga siempre, falle o no.
    v_k.costos_prendas := coalesce(v_k.costos_prendas, '{}'::jsonb) || v_cp;
    perform set_config('retail.costo_de_prenda', 'si', true);
    begin
      update retail.despacho_conteos k set costos_prendas = v_k.costos_prendas where k.id = v_k.id;
    exception when others then
      perform set_config('retail.costo_de_prenda', '', true);
      raise;
    end;
    perform set_config('retail.costo_de_prenda', '', true);
  end if;

  -- Lo que trae tallas y colores entra; lo demás (solo desde lo sin separar) queda pendiente.
$n$,
1);
-- ---------- 3. Ligar la prenda creada no pierde el costo que se le puso por su descripción ----------
select pg_temp.reemplazar('retail.ligar_prenda_a_pendiente(uuid,uuid,uuid)',
$v$  return jsonb_build_object('despacho_id', p_despacho_id, 'pendiente_id', p_pendiente_id, 'producto_id', p_producto_id, 'ligado', true);$v$,
$n$  -- ADR-0519: si a esta prenda NUEVA se le puso un costo por su descripción («nueva:<descripción>»), pasa a ser el de la prenda ya creada: el
  -- pendiente deja de tener descripción y esa clave ya no se encontraría. Lo que la prenda ya tuviera como costo propio gana. La clave de la
  -- descripción se quita solo si no queda otro «crear» de la misma línea con esa descripción.
  if v_pend.descripcion is not null then
    perform set_config('retail.costo_de_prenda', 'si', true);
    begin
      update retail.despacho_conteos k
         set costos_prendas = jsonb_build_object(lower(p_producto_id::text), k.costos_prendas -> ('nueva:' || v_pend.descripcion))
                              || case when exists (select 1 from retail.despacho_pendientes y
                                                    where y.despacho_id = p_despacho_id and y.id <> p_pendiente_id
                                                      and y.despacho_item_id is not distinct from v_pend.despacho_item_id
                                                      and y.extra_posicion is not distinct from v_pend.extra_posicion
                                                      and y.tipo = 'crear' and y.estado = 'pendiente' and y.descripcion = v_pend.descripcion)
                                      then k.costos_prendas else k.costos_prendas - ('nueva:' || v_pend.descripcion) end
       where k.despacho_id = p_despacho_id
         and k.despacho_item_id is not distinct from v_pend.despacho_item_id
         and k.extra_posicion is not distinct from v_pend.extra_posicion
         and k.costos_prendas ? ('nueva:' || v_pend.descripcion);
    exception when others then
      perform set_config('retail.costo_de_prenda', '', true);
      raise;
    end;
    perform set_config('retail.costo_de_prenda', '', true);
  end if;

  return jsonb_build_object('despacho_id', p_despacho_id, 'pendiente_id', p_pendiente_id, 'producto_id', p_producto_id, 'ligado', true);$n$,
1);

-- ---------- 4. Comprobación ----------
do $$
begin
  if position('retail.costo_de_prenda' in pg_get_functiondef('retail.fn_despacho_conteos_fija()'::regprocedure)) = 0 then
    raise exception 'el candado de lo contado no deja anotar el costo de una prenda con el envío cerrado';
  end if;
  if position('retail.costo_de_prenda' in pg_get_functiondef('retail.resolver_pendiente_envio(uuid,uuid,integer,uuid,jsonb,boolean,uuid)'::regprocedure)) = 0
     or position('fn_envio_costos_prendas' in pg_get_functiondef('retail.resolver_pendiente_envio(uuid,uuid,integer,uuid,jsonb,boolean,uuid)'::regprocedure)) = 0 then
    raise exception 'resolver_pendiente_envio no quedó con el costo por prenda';
  end if;
  if position('retail.costo_de_prenda' in pg_get_functiondef('retail.ligar_prenda_a_pendiente(uuid,uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'ligar_prenda_a_pendiente no pasa el costo de la prenda nueva a la prenda creada';
  end if;
end;
$$;

reset lock_timeout;
