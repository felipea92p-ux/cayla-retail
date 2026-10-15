-- ============================================================================
-- 20261015154000_personas_montos_y_clientas_parte1.sql — CAYLA V2 (/chaos de Clientes, Colaboradores y Configuración, ADR-0416,
-- 2026-10-15) · PARTE 1 de 2
--
-- EL PROBLEMA PRIMERO. /chaos (2026-10-13, repetido el 2026-10-15) encontró, solo por la API:
--   1. Una meta diaria y un fondo de caja en `NaN` (`guardar_metas_tienda`). El fondo de caja es con lo que abre la caja de la tienda: en
--      `NaN`, la apertura y el cierre heredan la cifra rota. Y quedaban otras tablas fuera de Compras que aceptaban `NaN` (el club, los
--      descuentos, la planilla del piso, lo histórico): Ventas, Inventario, Catálogo, Producción y Finanzas ya las cerraron en las suyas.
--   2. Una ficha de cliente completamente vacía (sin documento, ni nombre, ni celular): nadie puede encontrarla ni saber quién es.
--   3. Un cumpleaños el 31 de febrero: la tabla mira el día y el mes por separado. La pantalla ya lo frena; la base no.
--   4. Un nombre de cliente de 5000 letras.
--
-- LA DECISIÓN (Felipe 2026-10-15: «aplica tus recomendaciones»). Candados en las tablas, el último guardián:
--   · `<tabla>_montos_finitos` en las tablas de Configuración, Clientes y el resto de fuera de Compras que todavía no lo tenían.
--   · `clientas_con_algun_dato`: documento, nombre o celular (lo mismo que ya pide la pantalla de Nuevo cliente: «basta uno de tres»).
--   · `clientas_cumple_fecha_real`: el día cabe en su mes (el 29 de febrero solo en un año bisiesto, si se escribió el año).
--   · `clientas_textos_con_tope`: el nombre hasta 120 letras y el motivo de archivo hasta 300. En producción, 39 y 23 (2026-10-15).
--   El año de nacimiento futuro va en la parte 2 (un disparador: un CHECK no debe depender de la fecha de hoy).
--
-- CONTRATO (Liskov)
--   PROMETE: ninguna fila nueva o editada viola esos candados. Cada uno nace `not valid` y se valida si ninguna fila vieja lo viola (en
--            producción, ninguna, el 2026-10-15); si alguna lo viola, avisa y vale para lo nuevo.
--   ASUME:   las columnas de esas tablas a la fecha.
--   NO HACE: no toca funciones, datos ni políticas. Compras queda fuera: se está reconstruyendo (#1040, #1088).
--
-- CÓMO SE PEGA. Una sola parte con SOLO `alter table` (ADR-0195), fuera de horario: `ubicaciones` y `colaboradores` las lee todo el ERP y
-- cada alter toma un candado breve (con `lock_timeout` de 3 s: si alguien la tiene tomada, se detiene sin aplicar nada y se vuelve a
-- pegar). Idempotente. Antes de la parte 2 (20261015155000), que no depende de esta.
-- ============================================================================
set lock_timeout = '3s';

-- Agrega un CHECK `not valid` si no existe y lo valida si ninguna fila lo viola.
create or replace function pg_temp.candado(p_tabla text, p_nombre text, p_expresion text)
returns void
language plpgsql
as $f$
begin
  if not exists (select 1 from pg_constraint where conname = p_nombre and conrelid = ('retail.' || p_tabla)::regclass) then
    execute format('alter table retail.%I add constraint %I check (%s) not valid', p_tabla, p_nombre, p_expresion);
  end if;
  begin
    execute format('alter table retail.%I validate constraint %I', p_tabla, p_nombre);
  exception when check_violation then
    raise notice 'retail.%: hay filas viejas que no cumplen % — el candado vale para lo nuevo; corrígelas y luego valida a mano.', p_tabla, p_nombre;
  end;
end;
$f$;

-- 1. Ningún monto es NaN ni infinito. `abs(x) < 'Infinity'` es falso para NaN, +∞ y −∞; NULL sigue valiendo.
--    Configuración y Colaboradores.
select pg_temp.candado('ubicaciones', 'ubicaciones_montos_finitos', $c$abs(meta_venta_diaria) < 'Infinity' and abs(fondo_caja) < 'Infinity'$c$);
select pg_temp.candado('ubicacion_metas_dia', 'ubicacion_metas_dia_montos_finitos', $c$abs(meta) < 'Infinity'$c$);
select pg_temp.candado('campana_efecto_caja', 'campana_efecto_caja_montos_finitos', $c$abs(meta_pct) < 'Infinity' and abs(fondo) < 'Infinity'$c$);
select pg_temp.candado('metas_persona_ajustes', 'metas_persona_ajustes_montos_finitos', $c$abs(meta) < 'Infinity' and abs(meta_antes) < 'Infinity'$c$);
select pg_temp.candado('colaboradores', 'colaboradores_montos_finitos', $c$abs(tope_descuento_pct) < 'Infinity'$c$);
select pg_temp.candado('capacidad_piso', 'capacidad_piso_montos_finitos', $c$abs(m2_sala) < 'Infinity' and abs(densidad) < 'Infinity'$c$);
--    Clientes y el club.
select pg_temp.candado('configuracion_empresa', 'configuracion_empresa_montos_finitos',
  $c$abs(club_cumple_pct) < 'Infinity' and abs(club_aniversario_monto) < 'Infinity'$c$);
select pg_temp.candado('club_aniversario_escala', 'club_aniversario_escala_montos_finitos', $c$abs(monto) < 'Infinity'$c$);
select pg_temp.candado('club_canjes', 'club_canjes_montos_finitos', $c$abs(pct) < 'Infinity' and abs(monto) < 'Infinity'$c$);
select pg_temp.candado('codigos_descuento', 'codigos_descuento_montos_finitos', $c$abs(porcentaje) < 'Infinity'$c$);
--    Lo que quedaba fuera de Compras en Ventas, Inventario, Catálogo y Gestión.
select pg_temp.candado('apartados', 'apartados_montos_finitos', $c$abs(adelanto_monto) < 'Infinity'$c$);
select pg_temp.candado('comprobante_anticipos', 'comprobante_anticipos_montos_finitos', $c$abs(monto) < 'Infinity'$c$);
select pg_temp.candado('separacion_items_retirados', 'separacion_items_retirados_montos_finitos',
  $c$abs(precio_unitario) < 'Infinity' and abs(descuento_unitario) < 'Infinity'$c$);
select pg_temp.candado('prendas_por_regularizar', 'prendas_por_regularizar_montos_finitos',
  $c$abs(precio_cobrado) < 'Infinity' and abs(precio_oficial) < 'Infinity' and abs(diferencia) < 'Infinity'$c$);
select pg_temp.candado('etiquetas', 'etiquetas_montos_finitos', $c$abs(descuento_pct) < 'Infinity'$c$);
select pg_temp.candado('costo_historial', 'costo_historial_montos_finitos',
  $c$abs(costo_anterior) < 'Infinity' and abs(costo_unitario_nuevo) < 'Infinity' and abs(costo_resultante) < 'Infinity'$c$);
select pg_temp.candado('cierres_cola_arranque', 'cierres_cola_arranque_montos_finitos', $c$abs(soles) < 'Infinity'$c$);
select pg_temp.candado('frescura_vara_cayla', 'frescura_vara_cayla_montos_finitos', $c$abs(vendidas) < 'Infinity' and abs(unidades) < 'Infinity'$c$);
select pg_temp.candado('ventas_historicas', 'ventas_historicas_montos_finitos', $c$abs(soles) < 'Infinity'$c$);

-- 2. La ficha de un cliente.
select pg_temp.candado('clientas', 'clientas_con_algun_dato',
  $c$anonimizada or documento_numero is not null or nullif(btrim(nombre), '') is not null or telefono_whatsapp is not null$c$);
select pg_temp.candado('clientas', 'clientas_cumple_fecha_real',
  $c$cumple_dia is null or cumple_mes is null
     or (cumple_dia <= case cumple_mes when 2 then 29 when 4 then 30 when 6 then 30 when 9 then 30 when 11 then 30 else 31 end
         and (cumple_anio is null or not (cumple_mes = 2 and cumple_dia = 29)
              or (cumple_anio % 4 = 0 and (cumple_anio % 100 <> 0 or cumple_anio % 400 = 0))))$c$);
select pg_temp.candado('clientas', 'clientas_textos_con_tope', $c$char_length(nombre) <= 120 and char_length(motivo_archivo) <= 300$c$);
