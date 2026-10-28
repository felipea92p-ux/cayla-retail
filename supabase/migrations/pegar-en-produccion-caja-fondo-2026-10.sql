-- ============================================================================
-- ⚠️ SOLO PARA PEGAR EN EL SQL EDITOR DE PRODUCCIÓN, CON EL OK DE FELIPE. NO es la migración local.
-- No sigue `<timestamp>_nombre.sql` a propósito: `supabase db reset` local la ignora (mismo motivo que los demás
-- `pegar-en-produccion-*`).
--
-- QUÉ HACE (auditoría de Finanzas 2026-10-16, causa raíz G01; ADR-0433, actividad 1). Corrige cuatro cajas cerradas de producción
-- cuyos números congelados no cuadran, y deja la huella en `cajas.nota`. NO BORRA NADA y no toca ventas ni cobros; agrega UN traslado:
--
--   1. Trujillo, caja 2c1a9005 (cerrada el 8-oct): contó 977.20 y el 16-oct se regularizó a mano un traslado de 700.00 a la caja fuerte
--      sin ajustar lo que dejó en el cajón. `monto_fondo` 977.20 → 277.20 (contado − trasladado, ADR-0186).
--   2. Trujillo, caja 9b9c2094 (abrió el 9-oct con 277.20): congeló como esperado 977.20 (el fondo de la caja anterior ANTES de la
--      regularización). Con el fondo corregido, lo esperado es 277.20 → desaparece el «faltó al abrir 700» del Diario.
--   3. Arequipa, caja 0f07bbe4 (abrió el 1-oct con 118.90): congeló como esperado 0.00 porque la caja anterior (483fd18e) todavía no
--      estaba archivada como de prueba; la caja real anterior (285b6d7c) cerró dejando 300.00 en el cajón. Felipe confirmó el 2026-10-16
--      («todo está cuadrado al día de hoy, registra el traslado») que los 181.10 que faltaban fueron a la caja fuerte sin registrarse:
--      se registra ese traslado en 285b6d7c (destino caja fuerte, fechado un minuto antes de que abriera la siguiente), su fondo pasa de
--      300.00 a 118.90 (506.70 contados − 206.70 − 181.10) y lo esperado por 0f07bbe4 pasa de 0.00 a 118.90, que es con lo que abrió.
--      Resultado: el Diario deja de anotar un SOBRANTE de 118.90 y el Flujo deja de anotar un FALTANTE de 181.10; la caja fuerte de
--      Arequipa sube 181.10 (de 2065.84 a 2246.94). Queda pendiente, sin inventar cifras: Felipe mencionó también «el depósito a cuenta»;
--      falta el monto, la fecha y la cuenta para registrarlo.
--
-- REQUISITO. Idempotente: cada UPDATE lleva su valor de partida en el WHERE; si ya se aplicó, no toca nada y el bloque final lo dice.
-- Funciona antes o después de la migración `20261016211000_caja_cerrada_cuadra_su_fondo.sql` (con ella, el candado diferido comprueba
-- al confirmar que 277.20 + 700.00 = 977.20).
--
-- CÓMO USARLO, EN DOS PASOS.
--   PASO 1: correr el PREVIEW y mirar las tres filas (valores de partida y traslados).
--   PASO 2: correr el bloque de abajo (una sola transacción). Termina con las comprobaciones; si alguna no da lo esperado, aborta y no
--   queda nada aplicado.
-- ============================================================================

-- ── PASO 1 · PREVIEW (solo lectura) ─────────────────────────────────────────────────────────────────────────────────
select left(c.id::text, 8) as caja, u.nombre as sede, c.monto_apertura, c.monto_apertura_esperado, c.monto_cierre_real, c.monto_fondo,
       (select coalesce(sum(t.monto), 0) from retail.caja_traslados t where t.caja_id = c.id) as trasladado
  from retail.cajas c join retail.ubicaciones u on u.id = c.ubicacion_id
 where c.id in ('2c1a9005-9f0c-437a-9be7-454363af2c5f', '9b9c2094-c9eb-426c-a0b9-ac79c6f2bfa2', '0f07bbe4-43d4-4dec-9171-496e99d68078', '285b6d7c-0819-4e00-8a01-ef8be752195c')
 order by u.nombre, c.abierta_en;
-- Esperado, antes de aplicar:
--   2c1a9005  TRU  apertura 283.00  esperada 282.50  contado 977.20  fondo 977.20  trasladado 700.00
--   9b9c2094  TRU  apertura 277.20  esperada 977.20  contado 969.60  fondo 269.60  trasladado 700.00
--   0f07bbe4  AQP  apertura 118.90  esperada 0.00    contado 603.44  fondo 300.00  trasladado 303.44
--   285b6d7c  AQP  (la real anterior)             contado 506.70  fondo 300.00  trasladado 206.70

-- ── PASO 2 · CORRECCIÓN ─────────────────────────────────────────────────────────────────────────────────────────────
set search_path = retail, public, extensions;

update retail.cajas
   set monto_fondo = 277.20,
       nota = case when nullif(btrim(coalesce(nota, '')), '') is null then '' else nota || ' — ' end
              || 'Fondo corregido de 977.20 a 277.20 (auditoría de Finanzas 2026-10-16): el traslado de 700.00 se regularizó el 16-oct sin ajustar lo que dejó en el cajón.'
 where id = '2c1a9005-9f0c-437a-9be7-454363af2c5f' and monto_fondo = 977.20 and monto_cierre_real = 977.20;

update retail.cajas
   set monto_apertura_esperado = 277.20,
       nota = case when nullif(btrim(coalesce(nota, '')), '') is null then '' else nota || ' — ' end
              || 'Esperado corregido de 977.20 a 277.20 (auditoría de Finanzas 2026-10-16): la caja anterior dejó 277.20 una vez regularizado su traslado.'
 where id = '9b9c2094-c9eb-426c-a0b9-ac79c6f2bfa2' and monto_apertura_esperado = 977.20 and monto_apertura = 277.20;

-- Arequipa: el traslado que faltaba (una sola vez: la marca está en la referencia), el fondo que deja la caja real anterior y lo esperado
-- por la siguiente. Se hace en este orden, y todo en la misma transacción (el candado diferido lo comprueba al confirmar).
insert into retail.caja_traslados (caja_id, destino, monto, referencia, creado_en)
select '285b6d7c-0819-4e00-8a01-ef8be752195c', 'caja_fuerte', 181.10,
       'Regularización 2026-10-16 (auditoría de Finanzas): efectivo que salió del cajón antes de la apertura del 1-oct, confirmado por Felipe',
       timestamptz '2026-10-01 19:41:00+00'
 where not exists (select 1 from retail.caja_traslados t where t.caja_id = '285b6d7c-0819-4e00-8a01-ef8be752195c' and t.monto = 181.10 and t.referencia like 'Regularización 2026-10-16%')
   and exists (select 1 from retail.cajas k where k.id = '285b6d7c-0819-4e00-8a01-ef8be752195c' and k.monto_fondo = 300.00);

update retail.cajas
   set monto_fondo = 118.90,
       nota = case when nullif(btrim(coalesce(nota, '')), '') is null then '' else nota || ' — ' end
              || 'Fondo corregido de 300.00 a 118.90 (auditoría de Finanzas 2026-10-16): 181.10 fueron a la caja fuerte sin registrarse; se registró el traslado.'
 where id = '285b6d7c-0819-4e00-8a01-ef8be752195c' and monto_fondo = 300.00 and monto_cierre_real = 506.70;

update retail.cajas
   set monto_apertura_esperado = 118.90,
       nota = case when nullif(btrim(coalesce(nota, '')), '') is null then '' else nota || ' — ' end
              || 'Esperado corregido de 0.00 a 118.90 (auditoría de Finanzas 2026-10-16): la caja de prueba anterior no cuenta y la real anterior dejó 118.90 una vez registrado su traslado.'
 where id = '0f07bbe4-43d4-4dec-9171-496e99d68078' and monto_apertura_esperado = 0.00 and monto_apertura = 118.90;

-- ── COMPROBACIONES (aborta todo si algo no quedó como debe) ────────────────────────────────────────────────────────
do $c$
declare
  v_incoherentes integer;
  v_a numeric; v_b numeric; v_c numeric; v_d numeric; v_n integer;
begin
  select count(*) into v_incoherentes
    from retail.cajas k
   where k.estado = 'cerrada' and not k.es_prueba and k.monto_fondo is not null and k.monto_cierre_real is not null
     and abs(k.monto_fondo + coalesce((select sum(t.monto) from retail.caja_traslados t where t.caja_id = k.id), 0) - k.monto_cierre_real) >= 0.005;
  if v_incoherentes <> 0 then
    raise exception 'Quedan % cajas cerradas con contado distinto de fondo + trasladado: no se aplica nada', v_incoherentes;
  end if;

  select monto_fondo into v_a from retail.cajas where id = '2c1a9005-9f0c-437a-9be7-454363af2c5f';
  select monto_apertura_esperado into v_b from retail.cajas where id = '9b9c2094-c9eb-426c-a0b9-ac79c6f2bfa2';
  select monto_apertura_esperado into v_c from retail.cajas where id = '0f07bbe4-43d4-4dec-9171-496e99d68078';
  select monto_fondo into v_d from retail.cajas where id = '285b6d7c-0819-4e00-8a01-ef8be752195c';
  select count(*) into v_n from retail.caja_traslados where caja_id = '285b6d7c-0819-4e00-8a01-ef8be752195c' and monto = 181.10 and referencia like 'Regularización 2026-10-16%';
  if v_a <> 277.20 or v_b <> 277.20 or v_c <> 118.90 or v_d <> 118.90 or v_n <> 1 then
    raise exception 'Las cajas no quedaron como se esperaba (fondo TRU %, esperado TRU %, esperado AQP %, fondo AQP anterior %, traslados de 181.10: %): no se aplica nada', v_a, v_b, v_c, v_d, v_n;
  end if;
end;
$c$;

-- Después de pegar: refrescar la pantalla de Finanzas ▸ Reportes ▸ Resultados de octubre. Esperado: el resultado sube S/ 700.00 (se va el
-- «faltó al abrir» de Trujillo) y la línea «Aperturas de caja» de Arequipa pasa de +118.90 a 0; la caja fuerte de Arequipa sube 181.10.
