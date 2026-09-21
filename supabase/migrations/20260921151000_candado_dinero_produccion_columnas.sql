-- ============================================================================
-- 20260921151000_candado_dinero_produccion_columnas.sql — CAYLA V2 (ADR-0133, F4e; D-G) — PARTE B de 2
--
-- QUÉ HACE. Cierra EN LA BASE la lectura directa (por la API, sin pasar por ninguna pantalla) de los costos de
-- Producción para todo el que entra con una sesión, colaborador del Taller o no:
--   · `insumo_lotes.costo_unitario`
--   · `movimientos_insumo.costo_unitario`
--   · `producciones.costo_tela`, `costo_avios`, `costo_maquila` y `costo_unitario`
--   · la vista `v_insumo_saldos` completa (trae `valor` = cantidad × costo y, al no ser `security_invoker`, mostraba el
--     saldo de TODAS las ubicaciones; ninguna pantalla la lee).
-- Se hace con PRIVILEGIOS POR COLUMNA: `authenticated` conserva el SELECT de todas las columnas MENOS las de dinero. Así
-- el colaborador del Taller sigue leyendo cantidades, lotes, fechas, códigos y estados (todo lo que necesita para recibir,
-- descontar y cerrar órdenes) y pedir una columna de dinero —o un `select *`— responde «permission denied». Las RLS de fila no
-- cambian. El líder tampoco puede ya leer esas columnas DIRECTO: las lee por `fn_costos_insumos_taller` y
-- `fn_costos_producciones` (parte A), que responden solo a él.
--
-- LO QUE NO SE TOCA. Toda función `security definer` (`registrar_consumo_insumo`, `recibir_comprobante_produccion`,
-- `abrir_produccion`, `cerrar_produccion`…) sigue leyendo y escribiendo esos costos con los permisos de su dueño: recibir,
-- descontar y cerrar funcionan igual para quien trabaja en el Taller. Los privilegios de escritura no se tocan (las RLS ya los
-- niegan).
--
-- CUIDADO PARA EL FUTURO. Una columna NUEVA en `insumo_lotes`, `movimientos_insumo` o `producciones` NO será legible por
-- `authenticated` hasta que se le dé SELECT (a propósito: el default es cerrado). Al agregar una columna que no sea de dinero,
-- hay que volver a correr este bloque o hacer `grant select (nueva) on ...`. La prueba
-- `pnpm pruebas:candado-dinero-produccion` lo vigila (caso «toda columna que no es de dinero es legible»).
--
-- ORDEN — IMPORTANTE. Se pega DESPUÉS de `20260921150000_candado_dinero_produccion_lectura_operativa.sql` y DESPUÉS de
-- desplegar la app que lee costos con `fn_costos_*`. Si se pega antes, las pantallas de Órdenes e Insumos fallarían con
-- «permission denied» hasta que se despliegue. Por eso esta parte se niega a correr sin la A.
--
-- ESTADO: solo local hasta que Felipe la pegue en producción (prefijo `retail.` ya incluido). Idempotente (se puede pegar dos veces).
-- ============================================================================

set search_path = retail, public, extensions;

do $$
declare
  v_tabla text;
  v_cols text;
begin
  -- 0. Sin la parte A, el líder se quedaría sin ver los costos.
  if to_regprocedure('retail.fn_costos_insumos_taller(uuid)') is null or to_regprocedure('retail.fn_costos_producciones(uuid)') is null then
    raise exception 'Pega primero 20260921150000_candado_dinero_produccion_lectura_operativa.sql y despliega la app: sin las funciones fn_costos_*, el líder no vería los costos.';
  end if;

  -- 1. SELECT por columna: todas menos las de dinero.
  for v_tabla, v_cols in
    select t.tabla,
           string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
    from (values ('insumo_lotes', array['costo_unitario']),
                 ('movimientos_insumo', array['costo_unitario']),
                 ('producciones', array['costo_tela', 'costo_avios', 'costo_maquila', 'costo_unitario'])) as t(tabla, dinero)
    join information_schema.columns c on c.table_schema = 'retail' and c.table_name = t.tabla and c.column_name <> all (t.dinero)
    group by t.tabla
  loop
    execute format('revoke select on retail.%I from authenticated', v_tabla);
    execute format('grant select (%s) on retail.%I to authenticated', v_cols, v_tabla);
  end loop;
end $$;

-- 2. La vista de saldos: ninguna pantalla la lee y trae dinero de todas las ubicaciones. Queda solo para el dueño de la base.
revoke all on retail.v_insumo_saldos from public, anon, authenticated;
comment on view retail.v_insumo_saldos is
  'Saldo físico y valor por insumo y ubicación. CERRADA a authenticated (F4e, D-G): trae dinero y, sin security_invoker, mostraba todas las ubicaciones. Las pantallas derivan el saldo del ledger `movimientos_insumo` con sus propias reglas.';
