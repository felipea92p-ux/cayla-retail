-- ============================================================================
-- 20261001140000_recibir_envio_ya_no_recibe_traslados.sql — CAYLA V2
--
-- ADR-0299. Recibir mercadería es de PROVEEDORES; lo que manda otra sede de CAYLA se recibe en TRASLADOS.
--
-- EL PROBLEMA PRIMERO. Un traslado entre sedes tenía dos puertas para recibirse: el detalle del traslado y `recibir_envio` (la pantalla
-- «Recibir mercadería», cuando la caja traía además algo de un proveedor). Las dos terminan en `confirmar_traslado`, pero no con las
-- mismas reglas: Traslados pregunta si la ropa va al piso de venta o al almacén (ADR-0239, D-131) y `recibir_envio` llamaba
-- `confirmar_traslado(id)` sin decirlo, así que la ropa caía en el lugar por defecto (el almacén) y Vender no la veía hasta que alguien
-- la bajaba al piso. Es la clase de defecto que nadie ve hasta que una clienta pide la prenda: dos puertas con reglas distintas para la
-- misma cosa. La regla de negocio es una sola (Felipe, 2026-10-01): proveedores por Recibir mercadería, entre sedes por Traslados.
--
-- QUÉ HACE (sobre `recibir_envio`, la función VIVA, con un reemplazo anclado: en producción esta función se pega a mano y ya difiere del
-- archivo original del repo —lleva candados y el costo atípico—, así que NO se recrea desde un archivo viejo):
--   1. Un guardia al principio (tras comprobar el permiso): si `p_traslados` trae algo, se rechaza con un mensaje que dice dónde recibirlo.
--      Se rechaza ANTES de escribir nada: ni el envío ni el token se consumen, así que una pantalla vieja abierta en un navegador ve el
--      mensaje y conserva su conteo (no pierde lo contado ni deja una recepción a medias).
--   2. Se corta el bloque que confirmaba traslados (tras el guardia ya no se alcanza) y la condición de «extras o traslados sin comprobante».
--   3. Los dos mensajes que hablaban de traslados dejan de hacerlo.
--
-- QUÉ NO HACE (a propósito)
--   · No cambia la firma: `p_traslados` sigue siendo un parámetro (con su default `[]`). Quitarlo cambiaría la firma de una función que
--     la web llama por nombre y ya hay envíos en cola sin conexión con ese formato; con el guardia el contrato es explícito y falla claro.
--   · No toca `envio_traslados` (0 filas hoy; es historia y nunca se borra) ni `confirmar_traslado` / `registrar_recepcion_traslado`
--     (Traslados las sigue usando tal cual).
--   · No toca permisos ni RLS.
--
-- SE ROMPE SI
--   · Alguien recrea `recibir_envio` desde un archivo viejo del repo: vuelve la puerta. `pnpm pruebas:recibir-envio` lo detecta (el
--     escenario «un traslado se rechaza»).
--   · `recibir_envio` cambia en el bloque de traslados entre que se escribe y se pega esta migración: la huella md5 del bloque no coincide
--     y ABORTA con un mensaje claro, sin tocar nada (falla cerrado).
--
-- Re-ejecutable (la segunda vez no hace nada). Producción: se pega entera en el SQL Editor de cayla-dynamic; ya trae `retail.`.
-- Es UNA sola transacción y no mezcla políticas ni `alter table` (ver «Políticas y deadlocks» en CLAUDE.md): no hay parte 2.
-- Se pega DESPUÉS de desplegar la web de ADR-0299: con la web vieja, el único camino que esto cierra es el de recibir un traslado desde
-- Recibir mercadería, que además hoy no tiene ningún traslado con prendas.
--
-- Para revertir: volver a crear `recibir_envio` con el cuerpo que tenía (la huella de producción antes de esta migración está en el
-- ADR-0299); el bloque cortado es exactamente el de `20260919121000_recibir_envio.sql`, sección «lo que vino de otra sede».
-- ============================================================================

-- Reemplaza `p_viejo` por `p_nuevo` exigiendo que aparezca UNA sola vez (si la función cambió, aborta con un mensaje claro).
create or replace function pg_temp.cambiar_una_vez_20261001(p_texto text, p_viejo text, p_nuevo text)
returns text language plpgsql as $f$
declare
  v_n integer;
begin
  v_n := (length(p_texto) - length(replace(p_texto, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception 'recibir_envio cambió desde que se escribió esta migración: se esperaba 1 vez «%» y hay %.', p_viejo, v_n;
  end if;
  return replace(p_texto, p_viejo, p_nuevo);
end;
$f$;

create or replace function pg_temp.cerrar_puerta_traslados_20261001()
returns void language plpgsql as $f$
declare
  v_firma constant text := 'retail.recibir_envio(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,uuid)';
  -- El bloque que confirmaba traslados, de su comentario de apertura al de «los cierres». Su huella se midió el 2026-10-01 en
  -- producción y en el Postgres local: es la misma en los dos.
  v_marca_ini constant text := '  -- ---------- lo que vino de otra sede';
  v_marca_fin constant text := '  -- ---------- los cierres';
  v_huella_bloque constant text := 'd786000d6465f97d9df0dc97db1fae40';
  v_def text;
  v_ini integer;
  v_fin integer;
  v_n integer;
begin
  v_def := pg_get_functiondef(v_firma::regprocedure);

  -- Ya aplicado: pegar dos veces es inocuo.
  if position('ADR-0299' in v_def) > 0 then
    return;
  end if;

  -- 1. El guardia, justo después de comprobar el permiso (quien no puede recibir en la sede sigue viendo ESE mensaje primero).
  v_def := pg_temp.cambiar_una_vez_20261001(v_def,
    '  v_es_lider := fn_es_lider();',
    $a$  v_es_lider := fn_es_lider();

  -- ADR-0299: lo que viene de otra sede de CAYLA se recibe en Traslados, no aquí. Recibir mercadería es de proveedores; en Traslados
  -- se cuenta a ciegas y se elige piso o almacén, y aquí no. Se rechaza ANTES de escribir nada: ni el envío ni el token se consumen,
  -- así que una pantalla vieja abierta en un navegador ve este mensaje y conserva su conteo.
  if jsonb_array_length(p_traslados) > 0 then
    raise exception 'Lo que viene de otra sede de CAYLA se recibe en Traslados, no en Recibir mercadería. Recibe aquí solo lo del proveedor y abre ese traslado en Inventario ▸ Traslados.'
      using hint = 'recibir_envio_traslado_va_por_traslados';
  end if;$a$);

  -- 2. El bloque de traslados, que tras el guardia ya no se alcanza. Se corta entre sus dos marcas, con la huella como prueba de que
  --    es el bloque que se midió.
  v_n := (length(v_def) - length(replace(v_def, v_marca_ini, ''))) / length(v_marca_ini);
  if v_n <> 1 then
    raise exception 'recibir_envio cambió desde que se escribió esta migración: se esperaba 1 vez «%» y hay %.', v_marca_ini, v_n;
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_marca_fin, ''))) / length(v_marca_fin);
  if v_n <> 1 then
    raise exception 'recibir_envio cambió desde que se escribió esta migración: se esperaba 1 vez «%» y hay %.', v_marca_fin, v_n;
  end if;
  v_ini := position(v_marca_ini in v_def);
  v_fin := position(v_marca_fin in v_def);
  if v_ini >= v_fin then
    raise exception 'recibir_envio cambió desde que se escribió esta migración: el bloque de traslados ya no va antes del de cierres.';
  end if;
  if md5(substr(v_def, v_ini, v_fin - v_ini)) <> v_huella_bloque then
    raise exception 'recibir_envio cambió desde que se escribió esta migración: el bloque de traslados no es el que se midió (huella %).', md5(substr(v_def, v_ini, v_fin - v_ini));
  end if;
  v_def := left(v_def, v_ini - 1)
    || '  -- ---------- lo de otra sede ya no se recibe aquí (ADR-0299): se cuenta y se confirma en Traslados ----------' || E'\n\n'
    || substr(v_def, v_fin);

  -- 3. La condición y los mensajes que hablaban de traslados.
  v_def := pg_temp.cambiar_una_vez_20261001(v_def,
    '-- Primero la regla específica: si trae extras o traslados sin ningún comprobante, esa es la explicación útil.',
    '-- Primero la regla específica: si trae extras sin ningún comprobante, esa es la explicación útil.');
  v_def := pg_temp.cambiar_una_vez_20261001(v_def,
    'if jsonb_array_length(p_items) = 0 and (jsonb_array_length(p_extras) > 0 or jsonb_array_length(p_traslados) > 0) then',
    'if jsonb_array_length(p_items) = 0 and jsonb_array_length(p_extras) > 0 then');
  v_def := pg_temp.cambiar_una_vez_20261001(v_def,
    'Lo que llegó fuera de comprobante o dentro de un traslado necesita al menos una línea de comprobante recibida en este envío — si no viene ningún comprobante, usa Ingreso sin comprobante o Traslados',
    'Lo que llegó fuera de comprobante necesita al menos una línea de comprobante recibida en este envío — si no viene ningún comprobante, usa Ingreso sin comprobante');
  v_def := pg_temp.cambiar_una_vez_20261001(v_def,
    'si viene de otra sede de CAYLA, confírmalo como envío interno (traslado)',
    'si viene de otra sede de CAYLA, recíbelo en Traslados');

  execute v_def;

  -- Comprobación final: lo que se quería quedó, lo que se quitaba se fue.
  v_def := pg_get_functiondef(v_firma::regprocedure);
  if position('ADR-0299' in v_def) = 0 or position('lo que vino de otra sede' in v_def) > 0 or position('confirmar_traslado' in v_def) > 0 then
    raise exception 'recibir_envio no quedó como se esperaba tras esta migración: revisa la función antes de seguir.';
  end if;
end;
$f$;

select pg_temp.cerrar_puerta_traslados_20261001();

drop function pg_temp.cerrar_puerta_traslados_20261001();
drop function pg_temp.cambiar_una_vez_20261001(text, text, text);
