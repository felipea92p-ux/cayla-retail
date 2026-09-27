-- ============================================================================
-- ⚠️ SOLO PARA PEGAR EN EL SQL EDITOR DE PRODUCCIÓN. NO es una migración: la CLI de Supabase no lo corre.
-- ⚠️ NADIE LO HA APLICADO. Lo decide y lo pega Felipe, cuando él quiera. Es un cambio de DATOS, no de esquema.
-- ⚠️ AVISO (2026-09-26, después de escribirlo): el texto de abajo presenta el tope vacío como «descuento sin límite». ESTÁ
--    EXAGERADO. `registrar_venta` solo evalúa el tope por persona si el mostrador manda el descuento a nivel de venta
--    (`p_descuento_pct > 0`), y hoy no lo manda (0 de 6 ventas). El descuento real lo manda ser Líder (hasta 35 %) o un
--    código. Este cambio es seguro y de una sola fila, pero HOY ES SOLO DE ORDEN. Decisión pendiente de Felipe: retirar la
--    columna, activarla o dejarla (ver docs/pantallas/colaboradores-roles.md, tarea #2).
--
-- QUÉ ARREGLA. Análisis de «Roles y accesos» del 2026-09-26, tarea #2 (segunda mitad): una persona que ya no es líder
-- de equipo pero sigue con el tope de descuento VACÍO (NULL). Vacío significa «sin tope»: `registrar_venta` la trata como
-- a una líder y no le pide la autorización de otra líder, por más descuento que dé. Pasó porque `asignar_rol` no
-- reiniciaba el tope al bajar a alguien de Líder. Hoy hay 1 caso (de 17 integrantes), y es la única bajada de líder
-- registrada.
--
--   · La CAUSA (que le pase a la próxima persona que se baje) la corrige la migración
--     `20260926230000_asignar_rol_reinicia_tope_al_bajar_de_lider.sql`. Pégala primero: así, mientras corres este
--     archivo, ninguna bajada nueva puede volver a dejar el tope vacío.
--   · Este archivo corrige la CUENTA que ya quedó así. Son independientes: si lo pegas antes, funciona igual; solo que
--     conviene repetir el PASO 1 después para confirmar que sigue en 0.
--
-- QUÉ HACE. Pone en 10 —el tope de un integrante hoy (D-67, ADR-0153; es el valor por defecto de la columna)— a toda
-- persona que NO es líder y tiene el tope vacío. No toca a las líderes (su tope vacío es a propósito: backfill de
-- 20260922150000, línea 170), ni a quien ya tiene un número, ni las terminales (no tienen tope).
--
-- SI QUIERES OTRO NÚMERO para esa persona (por ejemplo 5), cámbialo en el PASO 2 antes de correrlo; o corre el 10 y
-- después ajusta con `update retail.colaboradores set tope_descuento_pct = 5 where persona_id = '…'`.
--
-- TRES PASOS, cada uno por separado (el SQL Editor muestra solo el resultado de lo último que corre: selecciona el
-- bloque y ejecútalo). Sin nombres de nadie: solo conteos e identificadores.
--   PASO 1 — solo lectura. Cuenta cuántas hay. Esperado hoy: integrantes_sin_tope = 1 y bajadas_de_lider_registradas = 1.
--   PASO 2 — el cambio. Idempotente: si no hay ninguna, no toca nada y devuelve cero filas.
--   PASO 3 — solo lectura. Repite el PASO 1; tiene que dar integrantes_sin_tope = 0.
--
-- QUÉ NO HACE. No deja rastro en `roles_historial` (esa tabla guarda cambios de rol, no de tope): el cambio se ve solo en
-- la columna. No borra nada. Solo toca filas de `retail.colaboradores` (bloquea esas filas un instante; no toma bloqueos
-- de tabla ni toca políticas, así que no choca con el Asesor de seguridad del panel). Sin `alter`, sin `drop`.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== PASO 1 — solo lectura: ¿cuántas hay? ====================
select count(*) as integrantes_sin_tope,
       coalesce(jsonb_agg(c.persona_id order by c.persona_id), '[]'::jsonb) as personas,
       (select count(*) from retail.roles_historial h
         where h.accion = 'asignacion' and h.detalle->>'rol_antes' = 'Líder de equipo') as bajadas_de_lider_registradas
  from retail.colaboradores c
 where c.rol <> 'lider' and c.tope_descuento_pct is null;

-- ==================== PASO 2 — el cambio (idempotente) ====================
update retail.colaboradores
   set tope_descuento_pct = 10
 where rol <> 'lider' and tope_descuento_pct is null
returning persona_id, tope_descuento_pct;

-- ==================== PASO 3 — solo lectura: tiene que dar 0 ====================
select count(*) as integrantes_sin_tope
  from retail.colaboradores c
 where c.rol <> 'lider' and c.tope_descuento_pct is null;
