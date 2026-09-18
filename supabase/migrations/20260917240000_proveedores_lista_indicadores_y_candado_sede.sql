-- ============================================================================
-- LA LISTA DE PROVEEDORES TRAE LOS INDICADORES SIN ENTRAR AL DETALLE —
-- Y CORRIGE D-27: LO FINANCIERO PASA A SER SOLO DE LÍDER
--
-- Felipe: los indicadores que arma `fn_proveedor_metricas_compras` (de esta
-- misma tarde) para la pantalla de detalle también deberían verse en la fila
-- de la lista, sin tener que clickear cada proveedor uno por uno para
-- comparar. Se agregan a la MISMA consulta que ya arma `fn_proveedores()`
-- (no una función nueva) — es el mismo `left join` con `compras`, solo con
-- más columnas agregadas:
--   · total_facturado (monto real, no el conteo de facturas — responde la
--     pregunta original: "cuánto nos factura cada proveedor")
--   · facturas_vencidas (para pintar el saldo en rojo cuando corresponde)
--   · facturas_recibidas_completas / facturas_con_recepcion_pendiente (la
--     señal de confiabilidad, misma idea que ya tiene el detalle)
--
-- CORRECCIÓN DE D-27, NO UNA LECTURA NUEVA. `docs/datos/DECISIONES-2026-09-12.md`
-- tiene registrado, como "decisión consciente de Felipe": "costos, márgenes...
-- visibles para cualquiera con cuenta, transparencia". Al pedir estos
-- indicadores, Felipe pidió explícito lo contrario para ellos: solo un líder
-- los ve, y solo un líder entra al detalle de un proveedor. Se le mostró la
-- contradicción con la cita exacta antes de tocar nada — no se asumió. El
-- directorio en sí (nombre/RUC/contacto/rubro/plazo/forma de pago) SIGUE
-- visible para cualquiera con cuenta: sigue sirviendo para buscar a quién
-- comprarle. Lo que cambia es solo el bloque que sale de `compras`
-- (facturas, montos, vencidas, recepción) — eso es lo financiero, y ahora
-- es solo de líder. D-27 se corrige en su propio documento, no solo acá.
--
-- CÓMO SE CIERRA: la base no manda el dato a quien no debe verlo, no solo la
-- pantalla lo esconde — mismo criterio que ya usa D-27 al revés (banco/
-- cuenta_bancaria SÍ viajan a propósito). `fn_proveedores()` devuelve NULL en
-- las columnas financieras cuando quien pregunta no es líder, en vez de
-- calcular el valor real y confiar en que `ProveedoresPanel.tsx` no lo
-- pinte — un curioso con las herramientas de desarrollador del navegador no
-- debe poder verlo igual. `fn_proveedor_metricas_compras`/
-- `fn_proveedor_metricas_insumos` (la pantalla de detalle) directamente
-- rechazan la llamada si quien pregunta no es líder — no hay "detalle
-- parcial", la pantalla entera es de líder.
--
-- CANDADO DE SEDE QUE FALTABA — ENCONTRADO AL VOLVER A TOCAR ESTA FUNCIÓN,
-- NO INTRODUCIDO POR ESTE CAMBIO. `fn_proveedores()` existe desde
-- 20260914150000_proveedores_administrables.sql y desde entonces suma
-- `saldo`/`facturas` de TODAS las compras del proveedor sin mirar sede —
-- exactamente el hueco que ADR-0075 (esta misma tarde) cerró para
-- `compras`/`compra_items`/`compra_pagos`/`compra_adjuntos`/
-- `resumen_compras()`, pero esa auditoría nunca llegó a esta función: vive
-- en el dominio de Proveedores, no en el de Compras, y nadie la recorrió.
-- Con el candado de líder de arriba esto queda doblemente cerrado (un
-- colaborador ya no ve el dato en absoluto), pero el candado de sede se dejó
-- igual — un líder de otra sede seguía sin motivo real para verlo cruzado,
-- y es la misma pieza ya probada en
-- `20260917230000_proveedor_metricas_compras_e_insumos.sql`.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. fn_proveedores(): directorio para todos, financiero solo líder ----------
drop function retail.fn_proveedores();
create function retail.fn_proveedores()
returns table (
  id uuid,
  nombre text,
  ruc text,
  contacto text,
  activo boolean,
  facturas bigint,
  total_facturado numeric,
  saldo numeric,
  ultima_compra date,
  facturas_vencidas bigint,
  facturas_recibidas_completas bigint,
  facturas_con_recepcion_pendiente bigint,
  rubro text,
  plazo_credito_dias integer,
  forma_pago_preferida text
)
language sql stable security definer set search_path = retail, public, extensions as $$
  select p.id, p.nombre, p.ruc, p.contacto, p.activo,
         case when fn_es_lider() then count(c.id) filter (where c.estado <> 'anulada') end as facturas,
         case when fn_es_lider() then coalesce(sum(c.total) filter (where c.estado <> 'anulada'), 0) end as total_facturado,
         case when fn_es_lider() then coalesce(sum(c.saldo) filter (where c.estado <> 'anulada'), 0) end as saldo,
         case when fn_es_lider() then max(c.fecha_emision) filter (where c.estado <> 'anulada') end as ultima_compra,
         case when fn_es_lider() then count(c.id) filter (where c.estado = 'vigente' and c.saldo > 0 and c.fecha_vencimiento < current_date) end as facturas_vencidas,
         case when fn_es_lider() then count(c.id) filter (where c.estado <> 'anulada' and c.estado_recepcion = 'recibida') end as facturas_recibidas_completas,
         case when fn_es_lider() then count(c.id) filter (where c.estado <> 'anulada' and c.estado_recepcion in ('parcial', 'sin_recibir')) end as facturas_con_recepcion_pendiente,
         p.rubro, p.plazo_credito_dias, p.forma_pago_preferida
  from retail.proveedores p
  left join retail.compras c
    on c.proveedor_id = p.id
    and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
  where retail.fn_tiene_acceso_retail()
  group by p.id, p.nombre, p.ruc, p.contacto, p.activo, p.rubro, p.plazo_credito_dias, p.forma_pago_preferida
  order by p.activo desc, p.nombre;
$$;

comment on function retail.fn_proveedores() is
  'Directorio de proveedores para cualquiera con cuenta (nombre/RUC/contacto/rubro/plazo/forma de pago). Lo financiero (facturas, total facturado, saldo, vencidas, recepción) sale NULL si quien pregunta no es líder — corrección de D-27, 2026-09-17.';

-- ---------- 2. las dos métricas del detalle: la pantalla entera es de líder ----------
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
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver las métricas de un proveedor.';
  end if;
  -- `c.` en cada columna es obligatorio, no estilo: RETURNS TABLE declara
  -- `saldo` como parámetro de salida, y sin calificar choca con
  -- `compras.saldo` ("column reference is ambiguous") — encontrado recién
  -- probando en el navegador, `create or replace` no lo avisa al aplicar.
  return query
    select
      count(*) filter (where c.estado <> 'anulada'),
      coalesce(sum(c.total) filter (where c.estado <> 'anulada'), 0),
      coalesce(sum(c.saldo) filter (where c.estado <> 'anulada'), 0),
      max(c.fecha_emision) filter (where c.estado <> 'anulada'),
      count(*) filter (where c.estado = 'vigente' and c.saldo > 0 and c.fecha_vencimiento < current_date),
      count(*) filter (where c.estado <> 'anulada' and c.estado_recepcion = 'recibida'),
      count(*) filter (where c.estado <> 'anulada' and c.estado_recepcion in ('parcial', 'sin_recibir'))
    from retail.compras c
    where c.proveedor_id = p_proveedor_id
      and fn_puede_operar_ubicacion(c.ubicacion_destino_id);
end;
$$;

comment on function retail.fn_proveedor_metricas_compras(uuid) is
  'Solo líder (corrección de D-27, 2026-09-17). Prenda terminada: cuánto le facturamos a este proveedor, cuánto le debemos, y cuántas facturas llegaron completas vs. quedaron parciales/sin recibir. Acotado por sede igual que el resto de Compras (ADR-0075).';

create or replace function retail.fn_proveedor_metricas_insumos(p_proveedor_id uuid)
returns table (
  lotes bigint,
  total_comprado numeric,
  ultima_entrega date
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver las métricas de un proveedor.';
  end if;
  -- Sin choque real hoy (ningún nombre de columna de insumo_lotes coincide
  -- con un parámetro de salida), pero se califica igual: es plpgsql con
  -- RETURNS TABLE, mismo mecanismo que rompió a la función de arriba.
  return query
    select
      count(*),
      coalesce(sum(il.cantidad_ingresada * il.costo_unitario), 0),
      max(il.fecha_ingreso)
    from retail.insumo_lotes il
    where il.proveedor_id = p_proveedor_id
      and fn_puede_operar_ubicacion(il.ubicacion_id);
end;
$$;

comment on function retail.fn_proveedor_metricas_insumos(uuid) is
  'Solo líder (corrección de D-27, 2026-09-17). Insumos del Taller: cuántos lotes, cuánto se le compró en total y la última entrega.';
