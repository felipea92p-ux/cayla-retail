-- ============================================================================
-- 20260921150000_candado_dinero_produccion_lectura_operativa.sql — CAYLA V2 (ADR-0133, F4e; D-G) — PARTE A de 2
--
-- PROBLEMA. Los costos de la tela, los avíos y las órdenes del Taller —`insumo_lotes.costo_unitario`,
-- `movimientos_insumo.costo_unitario` y `producciones.costo_tela / costo_avios / costo_maquila / costo_unitario`—
-- se esconden en la pantalla de quien no es líder, pero la BASE los deja leer: cualquier colaborador con sesión
-- puede pedirlos por la API pública sin pasar por ninguna pantalla. Esconder un número es cortesía, no seguridad
-- (mismo razonamiento que ADR-0126 para el dinero de Compras).
--
-- QUÉ HACE ESTA PARTE. Nada se cierra todavía: solo agrega las dos únicas puertas por las que el LÍDER seguirá
-- leyendo esos costos cuando la parte B los quite de la lectura directa:
--   · `fn_costos_insumos_taller(ubicación)`   → el costo unitario de cada lote del Taller.
--   · `fn_costos_producciones(ubicación)`     → los cuatro costos de cada orden del Taller.
-- Las dos son `security definer`, responden SOLO al líder (cero filas para cualquier otra persona) y no escriben
-- nada. El costo de cada movimiento del ledger NO necesita puerta propia: por construcción es el costo de su lote
-- (`registrar_consumo_insumo`, `devolver_insumo_de_produccion` y `recibir_*` lo copian del lote), así que la app lo
-- toma del lote.
--
-- ORDEN. Se pega PRIMERO esta parte A, luego se despliega la app que lee costos con estas funciones (y ya no pide
-- las columnas de dinero), y RECIÉN ENTONCES la parte B (`20260921151000_...`), que se niega a correr sin esta.
-- Con A sola no cambia nada visible: las tablas siguen leyéndose igual.
--
-- ESTADO: solo local hasta que Felipe la pegue en producción (prefijo `retail.` ya incluido). Idempotente.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_costos_insumos_taller(p_ubicacion_id uuid)
returns table (lote_id uuid, costo_unitario numeric)
language sql stable security definer set search_path = retail, public, extensions as $$
  select l.id, l.costo_unitario
  from retail.insumo_lotes l
  where retail.fn_es_lider() and l.ubicacion_id = p_ubicacion_id;
$$;

comment on function retail.fn_costos_insumos_taller(uuid) is
  'F4e (D-G): el costo unitario de cada lote de insumos de una ubicación. SOLO líder (cero filas para quien no lo es): es la única puerta a esa columna cuando la parte B cierra la lectura directa.';

create or replace function retail.fn_costos_producciones(p_ubicacion_id uuid)
returns table (produccion_id uuid, costo_tela numeric, costo_avios numeric, costo_maquila numeric, costo_unitario numeric)
language sql stable security definer set search_path = retail, public, extensions as $$
  select p.id, p.costo_tela, p.costo_avios, p.costo_maquila, p.costo_unitario
  from retail.producciones p
  where retail.fn_es_lider() and p.ubicacion_id = p_ubicacion_id;
$$;

comment on function retail.fn_costos_producciones(uuid) is
  'F4e (D-G): los cuatro costos (tela, avíos, maquila y unitario) de cada orden de una ubicación. SOLO líder (cero filas para quien no lo es): es la única puerta a esas columnas cuando la parte B cierra la lectura directa.';

revoke all on function retail.fn_costos_insumos_taller(uuid) from public, anon;
grant execute on function retail.fn_costos_insumos_taller(uuid) to authenticated;
revoke all on function retail.fn_costos_producciones(uuid) from public, anon;
grant execute on function retail.fn_costos_producciones(uuid) to authenticated;
