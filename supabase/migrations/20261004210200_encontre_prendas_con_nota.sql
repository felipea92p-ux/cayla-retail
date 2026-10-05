-- ============================================================================
-- 20261004210200_encontre_prendas_con_nota.sql — CAYLA V2 · ADR-0328 (actividad 4) · PARTE 3 de 3
-- «Reposición» pasa a ser «Encontré prendas»: solo suma, siempre dice dónde o por qué, y es la salida cuando la carga
-- inicial de la sede ya se cerró.
--
-- EL PROBLEMA PRIMERO. El motivo de Ajustar que SUMA prendas sin papeles se llamaba «Reposición», y en la tienda
-- «reponer» es colgar una prenda del almacén en el piso («Reponer prenda», en Existencias): dos cosas distintas con la
-- misma palabra. Felipe lo renombró «Encontré prendas» y lo dejó abierto, con motivo: «eso sí ocurre, y más cuando
-- estamos recopilando los datos desde cero» (ADR-0328). Pero hoy entra sin una sola palabra de por qué, y puede hasta
-- restar. Y cuando la carga inicial de una sede se cierre (parte 2), la prenda que aparece y NUNCA estuvo en esa sede no
-- tendría por dónde entrar: `registrar_movimiento` rechaza el ajuste de una prenda sin historia (ADR-0235,
-- `ajuste_sin_historia`) y le dice «cárgala como stock inicial», que ya no existe para esa sede.
--
-- QUÉ HACE (todo en `registrar_movimiento`, la única puerta de los ajustes sueltos; reemplazos anclados):
--   1. «Encontré prendas» (el código interno sigue siendo `reposicion`: la historia no se reescribe) es un AJUSTE
--      (`encontre_prendas_es_ajuste`: ni entrada ni salida suelta), solo SUMA (`encontre_prendas_resta`) y exige una nota de
--      al menos 3 letras con dónde o por qué (`encontre_prendas_sin_nota`). La regla mira el MOTIVO, no el tipo: vale para
--      Ajustar, la ficha y cualquier llamada directa.
--   2. Con la carga inicial de la sede CERRADA, una prenda que nunca estuvo en ella entra con «Encontré prendas»; un ajuste
--      con cualquier otro motivo, o una ENTRADA suelta, se rechazan con la salida dicha (`carga_inicial_cerrada`). Con la
--      carga ABIERTA (o sin fecha) todo sigue como hoy: la primera carga es stock inicial (`ajuste_sin_historia`).
--   3. El mensaje de «no en el piso» (ADR-0208, `reposicion_piso_cerrada`) habla de «Encontré prendas».
--   4. Actividad (`fn_actividad_inventario`) dice «motivo: encontré prendas». Las líneas ya anotadas no se reescriben.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES (para lo que se escriba desde hoy): un «Encontré prendas» que resta, que no dice nada
-- o que se escribe como entrada suelta; una prenda que nunca estuvo en una sede con la carga cerrada que entra sin
-- «Encontré prendas» por `registrar_movimiento` (ajuste o entrada); una sede cerrada donde lo encontrado no tiene por dónde
-- entrar.
--
-- LO QUE ESTO NO CIERRA, A PROPÓSITO. Un CONTEO (`cerrar_conteo`) escribe su ajuste directo, con `conteo_item_id` y firma:
-- con la carga cerrada, el sobrante de una prenda que nunca estuvo en la sede entra como ajuste «conteo». Es una puerta
-- DOCUMENTADA (quién contó, cuándo, qué conteo), no una entrada sin papeles; puede ser una talla cruzada (ADR-0328), así que
-- bloquearla rompería ese caso. Si se cuenta aparte como «lo que apareció» lo decide Felipe con la actividad 3 (conteo de
-- arranque). Y no se agrega un CHECK sobre `movimientos`: las 16 filas `reposicion` sin nota de producción son historia
-- que se sigue leyendo, y cuatro pruebas de otros módulos (purgar_producto_de_prueba, eliminar_producto_con_historia,
-- estado_resultados, frescura_lectura) siembran a propósito filas de ese estilo para probar cómo se leen. La guardia contra
-- un escritor nuevo es la prueba `cierre_carga_inicial.mjs`: recorre `pg_proc` y falla si otra función escribe `reposicion`.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. DESPUÉS de la parte 2 (usa `fn_carga_inicial_abierta` y `fn_texto_carga_inicial_cerrada`; la guardia de orden lo exige) y
-- ANTES de publicar la web (la web ya pide la nota, pero una pantalla vieja abierta sin ella recibirá el mensaje de la
-- base). Solo funciones: sin tablas en uso, políticas ni `drop trigger` (ADR-0195). Idempotente. Si dice «cambió desde
-- que se escribió», la función viva de producción no es la del repo: NO se fuerza; se regenera el reemplazo desde
-- `pg_get_functiondef` de producción.
--
-- SE ROMPE SI: alguien vuelve a pegar 20260926000200 o 20260927153200 (recrean `registrar_movimiento` desde su archivo sin
-- estas reglas); una función nueva inserta `reposicion` en `movimientos` sin pasar por `registrar_movimiento` (la prueba la
-- nombra en CI); o una pantalla vieja manda «Encontré prendas» sin nota (la base la rechaza con su mensaje; no se pierde
-- nada, se vuelve a intentar con la nota).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- GUARDIA DE ORDEN (integración de la ola 1, 2026-10-04). Esta parte mete en `registrar_movimiento` llamadas a dos
-- funciones que crea la parte 2. Sin esta guardia, pegada ANTES que la parte 2 se aplicaba igual (los reemplazos solo
-- cambian texto y plpgsql no revisa las llamadas al crear la función) y dejaba caído TODO ajuste y toda entrada que pasa
-- por `registrar_movimiento`: `function retail.fn_carga_inicial_abierta(uuid) does not exist` (42883), hasta pegar la
-- parte 2. Con la guardia, el pegado fuera de orden aborta limpio y no cambia nada.
do $guardia$
begin
  if to_regprocedure('retail.fn_carga_inicial_abierta(uuid)') is null
     or to_regprocedure('retail.fn_texto_carga_inicial_cerrada(uuid, text)') is null then
    raise exception 'Falta la parte 2: pega antes 20261004210100_carga_inicial_cierre_por_sede_parte2_candado.sql (y antes de ella, la parte 1). No se aplicó nada.';
  end if;
end;
$guardia$;

-- Ya aplicado = el texto NUEVO está (el nuevo contiene al viejo). Si no está, el viejo tiene que aparecer UNA sola vez.
create or replace function pg_temp.encontre_prendas_reemplazar(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. El mensaje de «no en el piso» (ADR-0208) habla de «Encontré prendas». El hint no cambia (la marca de 20260926000400).
select pg_temp.encontre_prendas_reemplazar(
  'retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)',
  $v$raise exception '«Reposición» no se usa en el piso: las prendas que suben del almacén se registran con «Bajar al piso» o con «Reponer», en Existencias, para que salgan del almacén (si ninguno te aparece, pídele al líder que active «Bajada al piso» en tu rol). Si al contar encontraste prendas de más, elige «Conteo físico».'$v$,
  $n$raise exception '«Encontré prendas» se registra en el almacén, no en el piso: anótalas en el almacén y, si ya están colgadas, bájalas con «Reponer» en Existencias. Si al contar el piso te sobran prendas, elige «Conteo físico».'$n$
);

-- 2. «Encontré prendas» es un AJUSTE que solo suma y dice dónde o por qué. Se mira el MOTIVO, no el tipo: una «entrada» o
--    «salida» suelta con ese motivo se rechaza (revisión adversarial: por `p_tipo = 'entrada'` entraba sin nota).
--    Va después del candado del piso y antes de elegir la sububicación.
select pg_temp.encontre_prendas_reemplazar(
  'retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)',
  $v$  v_sub := coalesce(p_sububicacion_id,$v$,
  $n$  -- ADR-0328 (act. 4): «Encontré prendas» (código interno `reposicion`) es un AJUSTE que solo SUMA y dice dónde o por qué
  -- aparecieron. Se mira el motivo, no el tipo: escrito como entrada o salida suelta, no entra (encontre_prendas_es_ajuste).
  if lower(btrim(coalesce(p_motivo, ''))) in ('reposicion', 'reposición') then
    if p_tipo <> 'ajuste' then
      raise exception '«Encontré prendas» se registra como ajuste (Existencias ▸ Ajustar), no como una entrada o salida suelta.'
        using hint = 'encontre_prendas_es_ajuste';
    end if;
    if p_cantidad <= 0 then
      raise exception '«Encontré prendas» solo suma prendas. Para quitar, elige otro motivo (Merma, Conteo físico u Otro).'
        using hint = 'encontre_prendas_resta';
    end if;
    if char_length(btrim(coalesce(p_nota, ''))) < 3 then
      raise exception 'Con «Encontré prendas» cuenta dónde estaban o por qué aparecieron (por ejemplo: «en una caja del almacén»).'
        using hint = 'encontre_prendas_sin_nota';
    end if;
  end if;
  v_sub := coalesce(p_sububicacion_id,$n$
);

-- 3. Con la carga inicial CERRADA, la prenda que nunca estuvo en la sede entra con «Encontré prendas»; con otro motivo, no.
--    Cubre el ajuste Y la entrada suelta (revisión adversarial: `registrar_movimiento(…, 'entrada', …)` la metía sin papeles
--    después del cierre). Con la carga abierta sigue la regla de ADR-0235 tal cual (la primera carga es stock inicial).
select pg_temp.encontre_prendas_reemplazar(
  'retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)',
  $v$  -- ADR-0235: un ajuste corrige lo que ya estaba; la primera carga de una prenda es stock inicial (ajuste_sin_historia).
  if p_tipo = 'ajuste' and not exists ($v$,
  $n$  -- ADR-0328 (act. 4): con la carga inicial de la sede CERRADA, la prenda que nunca estuvo aquí ya no es stock inicial: entra
  -- con «Encontré prendas» (un ajuste que pide nota y solo suma). Un ajuste con otro motivo o una ENTRADA suelta se rechazan,
  -- diciendo esa salida. (La salida suelta no hace falta: sobre una prenda sin stock, el motor no la deja bajar de cero.)
  if p_tipo in ('ajuste', 'entrada') and not retail.fn_carga_inicial_abierta(p_ubicacion_id) and not exists (
    select 1 from movimientos where variante_id = p_variante_id and ubicacion_id = p_ubicacion_id
  ) then
    if lower(btrim(coalesce(p_motivo, ''))) not in ('reposicion', 'reposición') then
      raise exception '%', retail.fn_texto_carga_inicial_cerrada(p_ubicacion_id, 'ajuste')
        using hint = 'carga_inicial_cerrada';
    end if;
  -- ADR-0235: un ajuste corrige lo que ya estaba; la primera carga de una prenda es stock inicial (ajuste_sin_historia).
  elsif p_tipo = 'ajuste' and not exists ($n$
);

-- 4. Actividad: «motivo: encontré prendas» (las líneas ya anotadas quedan como se escribieron).
select pg_temp.encontre_prendas_reemplazar(
  'retail.fn_actividad_inventario(uuid, text)',
  $v$when 'reposicion' then 'reposición'$v$,
  $n$when 'reposicion' then 'encontré prendas'$n$
);

reset lock_timeout;

notify pgrst, 'reload schema';
