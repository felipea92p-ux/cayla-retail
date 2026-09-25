-- ============================================================================
-- 20260925120000 — Por pagar consolidado (ADR-0195 F4, PLAN-FINANZAS §3 pieza 6 y §8)
--
-- EL PROBLEMA PRIMERO
--   «¿Cuánto debe CAYLA esta semana?» hoy se contesta sumando a mano dos pantallas: Compras ▸ Por pagar (facturas de
--   mercadería, y desde F2 también las de gastos y activos, que comparten la cabecera `compras`) y Producción ▸ Por pagar
--   (los insumos del Taller, que por decisión de Felipe viven en su propio libro, ADR-0133). La lectura que las juntaba
--   (`fn_deuda_consolidada`, D-I) da un total por proveedor, sin fechas ni tiendas: no sirve de calendario.
--
-- LO QUE HACE
--   Una sola lectura, `fn_por_pagar_consolidado(p_ubicacion_id, p_hasta, p_solo_empresa)`: cada comprobante que todavía
--   se debe, de los dos libros, con su naturaleza (mercadería, gasto, activo, insumo del Taller), su vencimiento, la
--   unidad a la que pertenece y su saldo. La pantalla la agrupa en el calendario (vencido, esta semana, la próxima, más
--   adelante). Es de SOLO LECTURA: no agrega tablas, no guarda ningún saldo (se suma) y no toca ninguna función de pago.
--
-- LAS REGLAS
--   · Lo anulado no cuenta y lo pagado no aparece (saldo > 0). El saldo de `compras` ya descuenta las notas de crédito.
--   · «Vence» es la fecha de vencimiento. Todo lo que queda con saldo es a crédito y trae fecha (al contado, Compras y
--     Producción exigen el pago entero al registrar); si algún día uno quedara sin fecha, vence el día de su emisión: se
--     debía al recibirlo, no «más adelante».
--   · «Ver» (la cabecera dice DÓNDE trabajas; «Ver», QUÉ miras, ADR-0195 C):
--       - todas (`p_ubicacion_id` nulo) → cada comprobante ENTERO, una fila por comprobante: la suma es lo que CAYLA debe.
--       - una unidad → la PARTE de esa unidad en cada comprobante (reparto por tienda de ADR-0139, con el saldo de la
--         tienda de ADR-0187, `fn_saldo_de_tienda`). Una factura de gasto o de activo es entera de su unidad.
--       - la empresa (`p_solo_empresa`) → los gastos y activos que no son de ninguna tienda (D-32).
--   · Quién lo ve: el líder, todo. Con el módulo `cuentas_dinero` (ADR-0161), solo la parte de SU tienda (la sede de la
--     sesión, `fn_ubicacion_actual_persona`, como `fn_gastos_ubicaciones`): ni todas, ni la empresa, ni otra tienda.
--     El módulo `por_pagar` (Compras) NO abre esta lectura: quien lo tiene ya ve y paga esas mismas facturas en Compras;
--     cada módulo abre su pantalla (ADR-0161) y el calendario de Finanzas se da con Cuentas y dinero.
--   · Los insumos del Taller los ve SOLO el líder (D-G de ADR-0133: el dinero de Producción es del líder), en «todas» o
--     mirando el Taller. Una cuenta con Cuentas y dinero parada en el Taller ve los gastos y activos del Taller, no la tela.
--   · `p_hasta`: solo lo que vence hasta esa fecha (el flujo de caja de F6 pregunta «¿qué sale hasta el viernes?»).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN
--   Solo crea una función y le da permisos: no toca tablas en uso ni políticas, así que no puede trabarse con la tienda
--   ni con el Asesor de seguridad (CLAUDE.md «Políticas y deadlocks»). Con `lock_timeout = 3s` e idempotente: si dice
--   «lock timeout», se repite. Depende de F2a (`compras.naturaleza`, `gastos`) y de F2b (`activos_fijos.compra_id`): las
--   dos columnas ya están en producción (verificado el 2026-09-24, y la misma consulta corrió en producción, solo lectura).
--   En local y en el CI el archivo corre entero.
-- SE ROMPE SI: `compras.saldo` deja de ser `total − pagado − notas_credito`; `compra_parte_por_tienda` deja de tener una
-- fila por factura de gasto o activo con tienda (la rama de F2a), o `comprobantes_produccion` pasa a tener unidad propia
-- (hoy es del Taller por definición). Se publica la web ANTES de pegarla: la pestaña Por pagar dice que no pudo leer.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_por_pagar_consolidado(
  p_ubicacion_id uuid default null,
  p_hasta date default null,
  p_solo_empresa boolean default false
)
returns table (
  origen text,              -- 'compras' (cabecera `compras`) | 'produccion' (comprobantes del Taller)
  id uuid,
  naturaleza text,          -- mercaderia | gasto | activo | insumo
  proveedor_id uuid,
  proveedor text,
  documento text,
  tipo text,
  concepto text,            -- qué fue: la descripción del gasto o el nombre del activo (mercadería e insumos: nulo)
  fecha_emision date,
  condicion text,
  fecha_vencimiento date,
  vence date,               -- el vencimiento (sin fecha, la emisión)
  ubicacion_id uuid,        -- la unidad de la fila: la mirada, o la gestora del comprobante entero (nulo = de la empresa)
  unidades text,            -- el nombre de esa unidad, o de todas las que tienen parte en el comprobante entero
  parte boolean,            -- true = la fila es la parte de una unidad; false = el comprobante entero
  total numeric,
  pagado numeric,           -- lo que ya no se debe de esa fila: pagos y notas de crédito (total − saldo)
  saldo numeric
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_lider boolean := retail.fn_es_lider();
  v_empresa boolean := coalesce(p_solo_empresa, false);
  v_propia uuid;
  v_ubic uuid;
  v_taller uuid := (select u.id from retail.ubicaciones u where u.tipo = 'taller' and u.activo order by u.created_at limit 1);
begin
  if v_lider then
    v_ubic := case when v_empresa then null else p_ubicacion_id end;
  else
    if retail.fn_capacidad_por_modulos(array['cuentas_dinero']) then
      v_propia := retail.fn_ubicacion_actual_persona();
    end if;
    if v_propia is null then
      raise exception 'Ver lo que se debe necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
    end if;
    -- Quien no es líder mira solo su tienda: pedir todas, la empresa u otra tienda no devuelve nada.
    if v_empresa or (p_ubicacion_id is not null and p_ubicacion_id <> v_propia) then
      return;
    end if;
    v_ubic := v_propia;
  end if;

  return query
  with deuda as (
    -- A. Comprobantes de proveedor: mercadería, gasto y activo (decisión A de ADR-0195).
    select 'compras'::text as origen, c.id, c.naturaleza, c.proveedor_id, p.nombre as proveedor, c.documento, c.tipo,
           case c.naturaleza
             when 'gasto' then (select string_agg(g.descripcion, ' · ' order by g.created_at) from retail.gastos g
                                 where g.compra_id = c.id and g.estado = 'vigente')
             when 'activo' then (select string_agg(a.nombre, ' · ' order by a.created_at) from retail.activos_fijos a
                                  where a.compra_id = c.id and a.estado <> 'anulado')
           end as concepto,
           c.fecha_emision, c.condicion, c.fecha_vencimiento,
           coalesce(c.fecha_vencimiento, c.fecha_emision) as vence,
           coalesce(v_ubic, c.ubicacion_gestion_id) as ubicacion_id,
           case when v_ubic is not null then (select u.nombre from retail.ubicaciones u where u.id = v_ubic)
                else coalesce(
                  (select string_agg(u.nombre, ' · ' order by u.nombre)
                     from retail.compra_parte_por_tienda x join retail.ubicaciones u on u.id = x.ubicacion_id
                    where x.compra_id = c.id),
                  (select u.nombre from retail.ubicaciones u where u.id = c.ubicacion_gestion_id))
           end as unidades,
           v_ubic is not null as parte,
           case when v_ubic is not null then pt.total else c.total end as total,
           case when v_ubic is not null then retail.fn_saldo_de_tienda(c.id, v_ubic) else c.saldo end as saldo
      from retail.compras c
      join retail.proveedores p on p.id = c.proveedor_id
      -- La parte se lee por factura (como `fn_deuda_visible`): el reparto se calcula solo de lo que tiene saldo.
      left join lateral (
        select x.total from retail.compra_parte_por_tienda x where x.compra_id = c.id and x.ubicacion_id = v_ubic
      ) pt on true
     where c.estado = 'vigente' and c.saldo > 0
       and (v_ubic is null or pt.total is not null)
       and (not v_empresa or (c.naturaleza <> 'mercaderia' and c.ubicacion_gestion_id is null))
    union all
    -- B. Insumos del Taller (ADR-0133): su propio libro, solo del líder (D-G), en «todas» o mirando el Taller.
    select 'produccion'::text, k.id, 'insumo'::text, k.proveedor_id, pp.nombre, k.serie || '-' || k.numero, k.tipo, null::text,
           k.fecha_emision, k.condicion, k.fecha_vencimiento,
           coalesce(k.fecha_vencimiento, k.fecha_emision),
           v_taller,
           (select u.nombre from retail.ubicaciones u where u.id = v_taller),
           false,
           k.total,
           k.total - pg.pagado
      from retail.comprobantes_produccion k
      join retail.proveedores_produccion pp on pp.id = k.proveedor_id
      cross join lateral (
        select coalesce(sum(g.monto), 0) as pagado from retail.comprobantes_produccion_pagos g where g.comprobante_id = k.id
      ) pg
     where v_lider and not v_empresa and (v_ubic is null or v_ubic = v_taller)
       and k.estado = 'vigente' and k.total - pg.pagado > 0
  )
  select d.origen, d.id, d.naturaleza, d.proveedor_id, d.proveedor, d.documento, d.tipo, d.concepto,
         d.fecha_emision, d.condicion, d.fecha_vencimiento, d.vence, d.ubicacion_id, d.unidades, d.parte,
         d.total::numeric(12, 2), (d.total - d.saldo)::numeric(12, 2), d.saldo::numeric(12, 2)
    from deuda d
   where d.saldo > 0
     and (p_hasta is null or d.vence <= p_hasta)
   order by d.vence, d.proveedor, d.documento, d.id;
end;
$$;

comment on function retail.fn_por_pagar_consolidado(uuid, date, boolean) is
  'ADR-0195 F4: lo que CAYLA debe, de Compras (mercadería, gasto, activo) y de Producción (insumos del Taller), un comprobante por fila con su vencimiento (sin fecha, la emisión), unidad y saldo. Todas = comprobantes enteros; una unidad = su parte (ADR-0139/0187); p_solo_empresa = gastos y activos sin tienda. Líder: todo; con el módulo cuentas_dinero, solo su tienda y sin insumos del Taller. Solo lectura.';

revoke all on function retail.fn_por_pagar_consolidado(uuid, date, boolean) from public, anon;
grant execute on function retail.fn_por_pagar_consolidado(uuid, date, boolean) to authenticated;
