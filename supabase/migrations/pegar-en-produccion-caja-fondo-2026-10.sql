-- ============================================================================
-- ⚠️ SOLO PARA PEGAR EN EL SQL EDITOR DE PRODUCCIÓN, CON EL OK DE FELIPE. NO es la migración local.
-- No sigue `<timestamp>_nombre.sql` a propósito: `supabase db reset` local la ignora (mismo motivo que los demás
-- `pegar-en-produccion-*`).
--
-- QUÉ HACE (auditoría de Finanzas 2026-10-16, causa raíz G01; ADR-0433, actividad 1). Corrige tres cajas cerradas de producción
-- cuyos números congelados no cuadran, y deja la huella en `cajas.nota`. NO BORRA NADA y no toca ventas, cobros ni traslados:
--
--   1. Trujillo, caja 2c1a9005 (cerrada el 8-oct): contó 977.20 y el 16-oct se regularizó a mano un traslado de 700.00 a la caja fuerte
--      sin ajustar lo que dejó en el cajón. `monto_fondo` 977.20 → 277.20 (contado − trasladado, ADR-0186).
--   2. Trujillo, caja 9b9c2094 (abrió el 9-oct con 277.20): congeló como esperado 977.20 (el fondo de la caja anterior ANTES de la
--      regularización). Con el fondo corregido, lo esperado es 277.20 → desaparece el «faltó al abrir 700» del Diario.
--   3. Arequipa, caja 0f07bbe4 (abrió el 1-oct con 118.90): congeló como esperado 0.00 porque la caja anterior (483fd18e) todavía no
--      estaba archivada como de prueba; la caja real anterior (285b6d7c) dejó 300.00. `monto_apertura_esperado` 0.00 → 300.00. Con esto
--      el Diario deja de anotar un SOBRANTE de 118.90 y anota el FALTANTE de 181.10 que el Flujo ya anotaba.
--
-- LO QUE ESTE SCRIPT NO DECIDE. De los 181.10 de Arequipa: si ese efectivo se llevó a la caja fuerte sin registrarlo (el motivo de esa
-- apertura dice «en total hay 740 en caja fuerte»), lo correcto es registrar un traslado de 181.10 y no dejar un faltante. Eso lo confirma
-- quien lo hizo; sin esa confirmación se queda como faltante, que es lo que el sistema ve hoy en el Flujo.
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
 where c.id in ('2c1a9005-9f0c-437a-9be7-454363af2c5f', '9b9c2094-c9eb-426c-a0b9-ac79c6f2bfa2', '0f07bbe4-43d4-4dec-9171-496e99d68078')
 order by u.nombre, c.abierta_en;
-- Esperado, antes de aplicar:
--   2c1a9005  TRU  apertura 283.00  esperada 282.50  contado 977.20  fondo 977.20  trasladado 700.00
--   9b9c2094  TRU  apertura 277.20  esperada 977.20  contado 969.60  fondo 269.60  trasladado 700.00
--   0f07bbe4  AQP  apertura 118.90  esperada 0.00    contado 603.44  fondo 300.00  trasladado 303.44

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

update retail.cajas
   set monto_apertura_esperado = 300.00,
       nota = case when nullif(btrim(coalesce(nota, '')), '') is null then '' else nota || ' — ' end
              || 'Esperado corregido de 0.00 a 300.00 (auditoría de Finanzas 2026-10-16): la caja anterior de la sede era de prueba; la real anterior dejó 300.00.'
 where id = '0f07bbe4-43d4-4dec-9171-496e99d68078' and monto_apertura_esperado = 0.00 and monto_apertura = 118.90;

-- ── COMPROBACIONES (aborta todo si algo no quedó como debe) ────────────────────────────────────────────────────────
do $c$
declare
  v_incoherentes integer;
  v_a numeric; v_b numeric; v_c numeric;
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
  if v_a <> 277.20 or v_b <> 277.20 or v_c <> 300.00 then
    raise exception 'Una de las tres cajas no quedó como se esperaba (fondo TRU %, esperado TRU %, esperado AQP %): no se aplica nada', v_a, v_b, v_c;
  end if;
end;
$c$;

-- Después de pegar: refrescar la pantalla de Finanzas ▸ Reportes ▸ Resultados de octubre. Esperado: el resultado sube S/ 700.00 (se va el
-- «faltó al abrir» de Trujillo) y la línea «Aperturas de caja» de Arequipa pasa de +118.90 a −181.10.
