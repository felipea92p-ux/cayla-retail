-- ============================================================================
-- MÉTRICAS DE PROVEEDOR: PRENDA TERMINADA (compras) E INSUMOS DEL TALLER,
-- EN DOS FUNCIONES SEPARADAS — NUNCA SUMADAS EN UN SOLO NÚMERO
--
-- Decisión de Felipe (análisis de proveedores, 2026-09-17): el proveedor de
-- tela/avíos del Taller y el de prenda terminada ya comparten la misma ficha
-- (`proveedor_id`), pero sus negocios se comparan por separado — "misma
-- ficha, secciones separadas". Por eso dos funciones, no una que junte todo:
-- son piezas pequeñas y componibles (principio 3), y cada una sirve sola
-- (la pantalla de insumos del Taller, cuando exista, puede reusar la segunda
-- sin arrastrar nada de Compras).
--
-- CANDADO DE SEDE — LA PARTE QUE CASI SE ME PASA. ADR-0075 (hace unas horas,
-- mismo día) cerró que la LECTURA de `compras` queda acotada por
-- `fn_puede_operar_ubicacion`, y advierte explícito en su propia sección de
-- consecuencias: "si en el futuro alguien agrega una RPC que lea `compras`
-- directo, RLS no la protege sola — tiene que repetir el chequeo a mano,
-- como ya hace `resumen_compras`". Una función `security definer` corre con
-- los privilegios del dueño de la función, no los de quien llama — así que
-- SIEMPRE se salta cualquier política de fila de la tabla que lee, sin
-- excepción. `fn_proveedores()` (la de la lista) no tiene este candado
-- porque nunca leyó `compras` directo hasta ahora — sigue sin necesitarlo,
-- no se toca. `insumo_lotes` ya nació hoy con la política correcta
-- (`fn_puede_operar_ubicacion(ubicacion_id)`, migración de esta misma
-- tarde) — mismo motivo, mismo candado a mano acá, por la misma razón.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. compras (prenda terminada) ----------
create or replace function retail.fn_proveedor_metricas_compras(p_proveedor_id uuid)
returns table (
  facturas_vigentes bigint,
  total_facturado numeric,
  saldo numeric,
  ultima_compra date,
  facturas_vencidas bigint,
  facturas_recibidas_completas bigint,
  facturas_con_recepcion_pendiente bigint
)
language sql stable security definer set search_path = retail, public, extensions as $$
  select
    count(*) filter (where estado <> 'anulada') as facturas_vigentes,
    coalesce(sum(total) filter (where estado <> 'anulada'), 0) as total_facturado,
    coalesce(sum(saldo) filter (where estado <> 'anulada'), 0) as saldo,
    max(fecha_emision) filter (where estado <> 'anulada') as ultima_compra,
    count(*) filter (where estado = 'vigente' and saldo > 0 and fecha_vencimiento < current_date) as facturas_vencidas,
    count(*) filter (where estado <> 'anulada' and estado_recepcion = 'recibida') as facturas_recibidas_completas,
    count(*) filter (where estado <> 'anulada' and estado_recepcion in ('parcial', 'sin_recibir')) as facturas_con_recepcion_pendiente
  from retail.compras
  where proveedor_id = p_proveedor_id
    and auth.uid() is not null
    and fn_puede_operar_ubicacion(ubicacion_destino_id);
$$;

comment on function retail.fn_proveedor_metricas_compras(uuid) is
  'Prenda terminada: cuánto le facturamos a este proveedor, cuánto le debemos, y cuántas facturas llegaron completas vs. quedaron parciales/sin recibir. Acotado por sede igual que el resto de Compras (ADR-0075) — un colaborador ve solo lo de su sede, un líder ve todo.';

-- ---------- 2. insumos del Taller (tela/avíos) ----------
create or replace function retail.fn_proveedor_metricas_insumos(p_proveedor_id uuid)
returns table (
  lotes bigint,
  total_comprado numeric,
  ultima_entrega date
)
language sql stable security definer set search_path = retail, public, extensions as $$
  select
    count(*) as lotes,
    coalesce(sum(cantidad_ingresada * costo_unitario), 0) as total_comprado,
    max(fecha_ingreso) as ultima_entrega
  from retail.insumo_lotes
  where proveedor_id = p_proveedor_id
    and auth.uid() is not null
    and fn_puede_operar_ubicacion(ubicacion_id);
$$;

comment on function retail.fn_proveedor_metricas_insumos(uuid) is
  'Insumos del Taller (tela/avíos): cuántos lotes, cuánto se le compró en total y la última entrega. Sin historia real todavía (ADR-0090, insumo_lotes en 0 filas) — vuelve ceros hasta que se use de verdad.';

-- ---------- 3. permisos ----------
grant execute on function retail.fn_proveedor_metricas_compras(uuid) to authenticated;
grant execute on function retail.fn_proveedor_metricas_insumos(uuid) to authenticated;
