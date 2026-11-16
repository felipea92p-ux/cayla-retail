-- ============================================================================
-- 20261116040000_pierdes_pide_confirmar.sql — CAYLA V2 · ADR-0668 (A5a, la base)
-- «Pierdes» pide confirmar en vez de prohibir. ESPERA EL OK DE FELIPE: es dinero y da vuelta su decisión del 2026-10-11.
--
-- EL PROBLEMA PRIMERO. Desde el 2026-10-11 (ADR-0370) ningún precio puede quedar bajo el costo: ni el de una tienda, ni el que se
-- cambia al recibir, ni el que deja una fusión. Felipe, 2026-11-15 (decisión 7 de ADR-0668): «Pierdes» —el precio sin IGV no cubre lo
-- que se pagó— «al guardar pide confirmar, no prohíbe»: un remate a propósito se puede dejar así, pero viendo cuánto se pierde. Y la
-- vara es otra: la de hoy compara el precio CON IGV contra el costo, así que entre el costo y el costo × 1.18 se guarda en silencio un
-- precio que pierde (medido el 2026-11-15: 19 tallas con precio general y 18 precios de tienda). La 2026-11-15 también decidió que la
-- fusión pide confirmar, como el resto.
--
-- QUÉ CAMBIA
--   · `fn_pierde_con(precio, costo)`: la regla única, la misma cuenta que «Te quedan» de la pantalla (`cuentaDelPrecio`): pierde si lo que
--     queda, redondeado al céntimo, es negativo: 200·precio < 236·costo − 118, en céntimos enteros. La web la espeja en
--     `pierdeConElPrecio` (`apps/web/lib/cuenta-de-precio.ts`) y las dos corren los casos de `scripts/pruebas/pierde-casos.json`.
--   · La confirmación viaja en el encabezado `x-confirma-perdida` de la llamada, como el responsable (`x-responsable`): NINGUNA firma
--     cambia (sin PGRST203, sin romper las suites que recargan estas funciones) y llega sola a las llamadas internas (Recibir → precio de
--     tienda), porque es la misma transacción. `fn_precio_frena(precio, costo)`:
--       · sin encabezado (la web de hoy): la regla de siempre, nunca bajo el costo. El SQL sale primero sin romper nada.
--       · `no` (la web nueva, primer intento): frena si pierde, para que la pantalla pregunte «¿Lo dejas así?».
--       · `si` (la persona dijo «Sí, dejarlo»): pasa.
--   · `fn_exigir_precio_sin_perdida(precio, costo, hint de antes)`: el rechazo. Sin encabezado, el de siempre (mismo texto y hint); con
--     encabezado, `precio_pierde` y «Con S/ 40 pierdes S/ 2.10 por prenda.», con las cifras en el detalle. La cifra revela el costo: solo
--     se dice a quien lo ve (`fn_ve_costo_de_prenda`); a los demás, sin cifra.
--   · Los cinco candados que hoy prohíben pasan a esa regla, por reemplazo anclado sobre la definición viva: `poner_precio_sede`,
--     `poner_precio_sede_variantes`, `cambiar_precio_en_recepcion`, `cambiar_precios_en_recepcion` y `fn_fusion_precios_sede_costo`.
--     Las dos `validar_*` no cambian: corren la función real, así que devuelven `precio_pierde` como respuesta y la pantalla pregunta.
--
-- LO QUE NO CAMBIA: la caja (un descuento a mano sigue sin bajar del costo, `venta_descuento_bajo_costo`; la campaña nunca lo miró),
-- el piso de 30 % de la IA (`aplicar_precio_propuesto`, A13), el «costo mayor que el precio» de la entrada al stock (A5d) y las altas
-- (`crear_producto_*`, `preparar_prenda_al_recibir`): nunca revisaron el costo en la base; su aviso es de la web (A7 y A8).
--
-- DECIDÍ: la regla única en la base y la confirmación en un encabezado, con «sin encabezado = la regla de siempre».
-- DESCARTÉ: (a) un parámetro `p_confirma_perdida` con `default`: cambia la firma de identidad, deja la versión vieja al lado (PGRST203) y
--   obliga a llevarlo a mano a cada llamada interna; (b) la regla nueva sin modo viejo: con el SQL pegado y la web de hoy, las 37 que hoy
--   guardan en silencio pasarían a un rechazo que la pantalla no sabe confirmar; (c) el bloqueo optimista «otra persona lo dejó en S/ X»
--   (corrección 16) en esta parte: con 3 tiendas y pocos cambios de precio al día no tiene casos medidos, y la regla ya se evalúa en la
--   base con el costo vigente al guardar (backlog del ADR-0668).
-- SE ROMPE SI: una pantalla manda `x-confirma-perdida: si` sin haber mostrado la pérdida (deja pasar sin que nadie la vea): el encabezado
--   solo lo pone la hoja «¿Lo dejas así?» y lo vigila su prueba. O un costo guardado dividido entre 1.18 (hasta A11) hace que una prenda con
--   factura «pierda» 18 % menos de lo que pierde.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, idempotente: funciones y comentarios, sin tablas, políticas ni
-- `drop trigger` (ADR-0195). ORDEN: este SQL primero (la web de hoy sigue igual, sin encabezado), después la web.
-- VUELTA ATRÁS: los reemplazos al revés (en el PR); las tres funciones nuevas pueden quedarse.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- 1. La regla única: ¿este precio deja pérdida con este costo? Como la pantalla: lo que queda, redondeado al céntimo, es negativo.
create or replace function retail.fn_pierde_con(p_precio numeric, p_costo numeric)
returns boolean
language sql
immutable
set search_path = retail, public, extensions
as $$
  -- te quedan = precio ÷ 1.18 − costo; redondeado al céntimo es negativo ⇔ precio < 1.18·costo − 0.59 (céntimos) ⇔ 200·p < 236·c − 118.
  select coalesce(p_precio, 0) > 0 and coalesce(p_costo, 0) > 0
     and 200 * round(p_precio * 100) < 236 * round(p_costo * 100) - 118;
$$;
comment on function retail.fn_pierde_con(numeric, numeric) is
  'ADR-0668 (A5): ¿el precio deja pérdida con este costo? Lo que queda (precio ÷ 1.18 − costo), redondeado al céntimo como en la pantalla, es negativo. La web la espeja en pierdeConElPrecio (apps/web/lib/cuenta-de-precio.ts) y las dos corren scripts/pruebas/pierde-casos.json.';

-- 2. Lo que dijo la pantalla: 'si' (dejarlo), 'no' (preguntar si pierde) o null (la web de antes, sin el encabezado).
create or replace function retail.fn_confirma_perdida()
returns text
language sql
stable
set search_path = retail, public, extensions
as $$
  select case lower(btrim(coalesce((nullif(current_setting('request.headers', true), '')::json) ->> 'x-confirma-perdida', '')))
           when 'si' then 'si' when 'no' then 'no' end;
$$;
comment on function retail.fn_confirma_perdida() is
  'ADR-0668 (A5): el encabezado x-confirma-perdida de la llamada: si (la persona dijo «Sí, dejarlo»), no (que pregunte si pierde) o null (la web de antes: rige la regla de siempre, nunca bajo el costo).';

-- 3. ¿Este precio se frena AHORA? Sin encabezado, la regla de siempre; con «no», si pierde; con «si», nunca.
create or replace function retail.fn_precio_frena(p_precio numeric, p_costo numeric)
returns boolean
language sql
stable
set search_path = retail, public, extensions
as $$
  select case retail.fn_confirma_perdida()
           when 'si' then false
           when 'no' then retail.fn_pierde_con(p_precio, p_costo)
           else p_costo is not null and p_precio < p_costo
         end;
$$;
comment on function retail.fn_precio_frena(numeric, numeric) is
  'ADR-0668 (A5): ¿se frena este precio? Sin x-confirma-perdida, la regla del 2026-10-11 (precio < costo); con «no», si pierde (fn_pierde_con); con «si», nunca.';

-- 4. El rechazo, igual en las cinco puertas. Sin encabezado, el de siempre (la web de antes lo entiende); con él, `precio_pierde`.
create or replace function retail.fn_exigir_precio_sin_perdida(p_precio numeric, p_costo numeric, p_hint_de_antes text)
returns void
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_pierdes numeric;
begin
  if p_precio is null or p_costo is null or not retail.fn_precio_frena(p_precio, p_costo) then
    return;
  end if;
  if retail.fn_confirma_perdida() is null then
    raise exception 'Ese precio queda por debajo de lo que cuesta la prenda. Para liquidar usa una campaña (Catálogo ▸ Atributos ▸ Etiquetas).'
      using hint = p_hint_de_antes;
  end if;
  -- Lo que se pierde por prenda: costo − precio ÷ 1.18, al céntimo. Revela el costo: solo a quien lo ve.
  v_pierdes := round(p_costo - p_precio / 1.18, 2);
  if coalesce(retail.fn_ve_costo_de_prenda(), false) then
    raise exception 'Con S/ % pierdes S/ % por prenda.', to_char(p_precio, 'FM999990.00'), to_char(v_pierdes, 'FM999990.00')
      using hint = 'precio_pierde', detail = jsonb_build_object('precio', p_precio, 'pierdes', v_pierdes)::text;
  end if;
  raise exception 'Con ese precio se pierde en cada prenda.' using hint = 'precio_pierde', detail = jsonb_build_object('precio', p_precio)::text;
end;
$$;
comment on function retail.fn_exigir_precio_sin_perdida(numeric, numeric, text) is
  'ADR-0668 (A5): el rechazo de un precio que se frena (fn_precio_frena). Sin x-confirma-perdida, el de siempre con su hint; con él, hint precio_pierde y «Con S/ p pierdes S/ q por prenda.» (la cifra solo a quien ve el costo de una prenda).';

revoke all on function retail.fn_pierde_con(numeric, numeric) from public, anon;
grant execute on function retail.fn_pierde_con(numeric, numeric) to authenticated, service_role;
revoke all on function retail.fn_confirma_perdida() from public, anon;
grant execute on function retail.fn_confirma_perdida() to authenticated, service_role;
revoke all on function retail.fn_precio_frena(numeric, numeric) from public, anon;
grant execute on function retail.fn_precio_frena(numeric, numeric) to authenticated, service_role;
revoke all on function retail.fn_exigir_precio_sin_perdida(numeric, numeric, text) from public, anon, authenticated;
grant execute on function retail.fn_exigir_precio_sin_perdida(numeric, numeric, text) to service_role;

-- 5. Los cinco candados, por reemplazo anclado sobre la definición viva (medido el 2026-11-16: idénticas en producción y en una base con
--    todas las migraciones del repo, por su md5). Si el texto nuevo ya está, no hace nada; si el viejo no está exactamente una vez, aborta
--    sin tocar nada.
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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición viva.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar(
  'retail.poner_precio_sede(uuid,uuid,numeric,text)',
  $v$  if v_costo_max is not null and v_precio < v_costo_max then
    raise exception 'Ese precio queda por debajo de lo que cuesta la prenda. Para liquidar usa una campaña (Catálogo ▸ Atributos ▸ Etiquetas).'
      using hint = 'precio_sede_bajo_costo';
  end if;$v$,
  $v$  -- ADR-0668 (A5): «Pierdes» pide confirmar (encabezado x-confirma-perdida); sin él, la regla de siempre.
  perform retail.fn_exigir_precio_sin_perdida(v_precio, v_costo_max, 'precio_sede_bajo_costo');$v$,
  1);

select pg_temp.reemplazar(
  'retail.poner_precio_sede_variantes(uuid,uuid,jsonb,text)',
  $v$    if v_precio < v_var_costo then
      raise exception 'Ese precio queda por debajo de lo que cuesta la prenda. Para liquidar usa una campaña (Catálogo ▸ Atributos ▸ Etiquetas).'
        using hint = 'precio_sede_bajo_costo';
    end if;$v$,
  $v$    -- ADR-0668 (A5): «Pierdes» pide confirmar (encabezado x-confirma-perdida); sin él, la regla de siempre.
    perform retail.fn_exigir_precio_sin_perdida(v_precio, v_var_costo, 'precio_sede_bajo_costo');$v$,
  1);

select pg_temp.reemplazar(
  'retail.cambiar_precio_en_recepcion(uuid,uuid,numeric,text)',
  $v$  if v_costo_max is not null and v_precio < v_costo_max then
    raise exception 'Ese precio queda por debajo de lo que cuesta la prenda. Para liquidar usa una campaña (Catálogo ▸ Atributos ▸ Etiquetas).'
      using hint = 'precio_bajo_costo';
  end if;$v$,
  $v$  -- ADR-0668 (A5): «Pierdes» pide confirmar (encabezado x-confirma-perdida); sin él, la regla de siempre.
  perform retail.fn_exigir_precio_sin_perdida(v_precio, v_costo_max, 'precio_bajo_costo');$v$,
  1);

select pg_temp.reemplazar(
  'retail.cambiar_precios_en_recepcion(uuid,uuid,jsonb,text)',
  $v$    if v_precio < v_var_costo then
      raise exception 'Ese precio queda por debajo de lo que cuesta la prenda. Para liquidar usa una campaña (Catálogo ▸ Atributos ▸ Etiquetas).'
        using hint = case when p_alcance = 'sede' then 'precio_sede_bajo_costo' else 'precio_bajo_costo' end;
    end if;$v$,
  $v$    -- ADR-0668 (A5): «Pierdes» pide confirmar (encabezado x-confirma-perdida); sin él, la regla de siempre.
    perform retail.fn_exigir_precio_sin_perdida(v_precio, v_var_costo,
                                                case when p_alcance = 'sede' then 'precio_sede_bajo_costo' else 'precio_bajo_costo' end);$v$,
  1);

-- La fusión (Felipe 2026-11-15: «pide confirmar, como el resto»): frena con la misma regla y, con el encabezado, dice que pierde.
select pg_temp.reemplazar(
  'retail.fn_fusion_precios_sede_costo(uuid)',
  $v$       and w.costo is not null and x.precio < w.costo
$v$,
  $v$       and w.costo is not null and retail.fn_precio_frena(x.precio, w.costo) -- ADR-0668 (A5)
$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_fusion_precios_sede_costo(uuid)',
  $v$    raise exception 'En % el precio que quedaría está por debajo de lo que cuesta la prenda. No se fusionó nada: elige el precio de otra ficha para esa sede, otro costo o «Un solo precio».', v_sede
      using errcode = 'P0001', hint = 'precio_sede_bajo_costo';$v$,
  $v$    if retail.fn_confirma_perdida() is not null then
      raise exception 'En % el precio que quedaría deja pérdida en cada prenda. No se fusionó nada: confírmalo o elige otro precio para esa sede.', v_sede
        using errcode = 'P0001', hint = 'precio_pierde', detail = jsonb_build_object('sede', v_sede)::text;
    end if;
    raise exception 'En % el precio que quedaría está por debajo de lo que cuesta la prenda. No se fusionó nada: elige el precio de otra ficha para esa sede, otro costo o «Un solo precio».', v_sede
      using errcode = 'P0001', hint = 'precio_sede_bajo_costo';$v$,
  1);

reset search_path;
reset lock_timeout;
