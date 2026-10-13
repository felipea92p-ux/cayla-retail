-- ADR-0387 · Compras: el módulo es la llave — actividad 2 de la fase 2 de ADR-0362 (Felipe 2026-10-12): qué ve cada uno y a
-- nombre de quién se paga.
--
-- EL PROBLEMA PRIMERO. Con la actividad 1 ya nadie necesita ser líder para HACER algo en Compras si tiene el módulo. Pero todavía no
-- VE todo lo que hay dentro, ni paga como paga el líder:
--   · Compras por tienda (ADR-0184, ADR-0187): quien no es líder ve solo las facturas que gestionan «sus tiendas», de las ajenas solo
--     «su parte», y paga SIEMPRE desde una de sus tiendas y solo la parte de esa tienda. Felipe, 2026-10-12: quien tiene el módulo
--     ve TODAS las tiendas y paga a nombre de la empresa, como el líder.
--   · Proveedores: quien tiene el módulo da de alta, edita y archiva proveedores, pero no ve cuánto se le compra, cuánto se le debe
--     ni su saldo a favor (ADR-0161 P3, 2026-09-23). Felipe, 2026-10-12: «Sí, que los vea». Y aunque lo viera, sus cifras salían de
--     «mis tiendas»: con solo Proveedores, todo en cero.
--
-- QUÉ HACE (PARTE 1, funciones).
--   1. `fn_ve_plata_de_proveedores()` (NUEVA): la plata de Compras (`fn_puede_ver_dinero_de_compras`) o el módulo Proveedores. Es lo
--      de ADENTRO de Proveedores, y nada más: la regla general de la plata de Compras no cambia.
--   2. Las seis funciones de Proveedores preguntan por la plata de Proveedores y cuentan las compras de TODAS las tiendas: el saldo
--      es lo que la empresa le debe a cada proveedor (ya no lo que deben «mis tiendas»).
--   3. «Mis tiendas» deja de existir en Compras: `fn_compra_es_de_mis_tiendas` (la usan una veintena de lecturas y acciones: anular,
--      adjuntar, reasignar, notas de crédito, indicadores) es verdad para quien ve la plata de Compras; `fn_puede_comprar_en` acepta
--      cualquier tienda activa; `fn_deuda_visible` da la factura entera; `fn_mis_partes_de_compras` (las «partes ajenas») queda vacía.
--   4. Pagar: quien tiene Por pagar paga a nombre de la empresa (sin tienda), sea líder o no; si la pantalla nombra una tienda, se
--      valida como siempre (activa, con parte y sin pasar de lo que le queda). El contado al registrar un comprobante, también de la
--      empresa.
--   5. Recibir: los avisos que decían «pide a un líder que la reasigne» dicen quién puede hacerlo (Facturas de proveedor). La regla no
--      cambia: cada sede recibe lo que tiene asignado (recibir en una sede algo asignado a otra se rediseña en la fase 4).
--   6. Finanzas (decisión 45, Felipe 2026-10-12): una factura se debe ENTERA en la tienda que hizo el pedido (la gestora); lo que otra
--      tienda recibió de ella no es deuda suya, y el pago de la empresa la baja. Por pagar de Finanzas mirando una tienda y el Balance
--      por tienda dejan de sumar «partes» (con un pago de la empresa, la suma por tienda daba más que la deuda real).
-- QUÉ HACE (PARTE 2, políticas). Las lecturas de facturas, líneas, pagos, notas, adjuntos (y sus escaneos), destinos, cierres y
-- reasignaciones dejan ver todo a quien ve la plata de Compras, con UNA pregunta por consulta (`(select …)`), sin armar la lista de
-- todas las facturas.
--
-- QUÉ NO HACE. No borra `compradores_de_tienda`, `fn_compras_ubicaciones`, `fn_compras_visibles` ni `fn_mi_parte_de_compra`: quedan sin
-- efecto en Compras y se retiran cuando la web ya no las llame. No cambia QUÉ ve cada uno en Finanzas (quien no es líder sigue mirando
-- su sede). No toca `fn_saldo_de_tienda` ni el candado `compra_pagos_no_supera_tienda` (cuidan los pagos viejos hechos por tienda y
-- los de Gastos y Activos, y el tope cuando la pantalla nombra una tienda).
--
-- CÓMO. Reemplazos ANCLADOS sobre la definición viva (el ayudante de 20261012120000): cada pedazo se busca tal cual está en producción
-- (huellas y anclas comparadas el 2026-10-12: banco = producción; en las cuatro funciones de pago y recibir, cuyos comentarios dicen
-- ADR-0179/0138 en producción y ADR-0184/0139 en el repo, las anclas evitan esos comentarios), la migración aborta SIN TOCAR NADA si
-- una función cambió y no hace nada si ya está aplicada. Ninguna función cambia de parámetros.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe), DESPUÉS de `20261012202000`. DOS partes, en dos pegadas, en este orden (ADR-0195:
-- las políticas van solas y al final; cada parte con su `lock_timeout` y re-pegable):
--   PARTE 1: desde el principio hasta «FIN DE LA PARTE 1».
--   PARTE 2: desde «PARTE 2» hasta el final.
-- ORDEN con la web: la base ANTES que la web (o juntas). La web nueva paga sin tienda, y la base de antes se lo rechaza a quien no es
-- líder; la web de antes sí funciona con la base nueva (manda la tienda de quien paga y se valida como siempre).

-- ============================================================================================================================
-- PARTE 1 · funciones
-- ============================================================================================================================

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261012120000 y 20261012202000): falla si la función viva cambió, y es re-ejecutable.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. La plata de Proveedores: la de Compras, o el módulo Proveedores (Felipe 2026-10-12; revierte ADR-0161 P3).
create or replace function retail.fn_ve_plata_de_proveedores()
 returns boolean
 language sql
 stable
 set search_path to 'retail', 'public', 'extensions'
as $function$ select retail.fn_puede_ver_dinero_de_compras() or retail.fn_capacidad_por_modulos(array['proveedores']); $function$;
revoke all on function retail.fn_ve_plata_de_proveedores() from public, anon;
grant execute on function retail.fn_ve_plata_de_proveedores() to authenticated;
comment on function retail.fn_ve_plata_de_proveedores() is
  'ADR-0387 (Felipe 2026-10-12, «el módulo es la llave»; revierte ADR-0161 P3): quien ve la plata de Compras (fn_puede_ver_dinero_de_compras) o tiene el módulo Proveedores. Solo para lo de ADENTRO de Proveedores (montos, saldo a favor, costo): la regla general del dinero de Compras no cambia.';

-- 2. Proveedores pregunta por su plata, y cuenta las compras de todas las tiendas.

select pg_temp.reemplazar(
  'retail.fn_proveedores()',
  $v$retail.fn_puede_ver_dinero_de_compras()$v$,
  $v$retail.fn_ve_plata_de_proveedores()$v$,
  13);
select pg_temp.reemplazar(
  'retail.fn_proveedores_resumen()',
  $v$retail.fn_puede_ver_dinero_de_compras()$v$,
  $v$retail.fn_ve_plata_de_proveedores()$v$,
  10);
select pg_temp.reemplazar(
  'retail.fn_proveedores_serie_12m()',
  $v$retail.fn_puede_ver_dinero_de_compras()$v$,
  $v$retail.fn_ve_plata_de_proveedores()$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_proveedor_metricas_compras(uuid)',
  $v$retail.fn_puede_ver_dinero_de_compras()$v$,
  $v$retail.fn_ve_plata_de_proveedores()$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_proveedor_costo_evolucion(uuid,integer)',
  $v$retail.fn_puede_ver_dinero_de_compras()$v$,
  $v$retail.fn_ve_plata_de_proveedores()$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_proveedor_metricas_compras(uuid)',
  $v$'Los montos de compras de un proveedor necesitan Facturas de compra, Por pagar o Notas de crédito en tu rol.'$v$,
  $v$'Los montos de compras de un proveedor necesitan Proveedores, Facturas de compra, Por pagar o Notas de crédito en tu rol.'$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_proveedor_costo_evolucion(uuid,integer)',
  $v$'La evolución del costo de un proveedor necesita Facturas de compra, Por pagar o Notas de crédito en tu rol.'$v$,
  $v$'La evolución del costo de un proveedor necesita Proveedores, Facturas de compra, Por pagar o Notas de crédito en tu rol.'$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_proveedor_creditos(uuid,integer)',
  $v$    and retail.fn_puede_registrar_compras()
$v$,
  $v$    and retail.fn_ve_plata_de_proveedores()
$v$,
  1);

-- El saldo de cada proveedor es lo que le debe la EMPRESA (antes, ADR-0187, lo que debían «mis tiendas»: con solo Proveedores, cero).
-- Es la rama del líder de `fn_deuda_visible` (vigentes con saldo), sin pasar por ella: así Proveedores no abre la deuda de los tableros
-- de Facturas y Por pagar, que siguen siendo de la plata de Compras.
select pg_temp.reemplazar(
  'retail.fn_proveedores()',
  $v$  -- ADR-0187: el saldo es lo que deben MIS tiendas (`fn_deuda_visible`); el líder, la empresa.
  left join (
    select x.proveedor_id, sum(v.saldo) as saldo, sum(v.saldo) filter (where x.fecha_vencimiento < fn_hoy_lima()) as vencido
      from retail.fn_deuda_visible() v
      join retail.compras x on x.id = v.compra_id
     group by x.proveedor_id
  ) dv on dv.proveedor_id = p.id
$v$,
  $v$  -- ADR-0387 (Felipe 2026-10-12): el saldo es lo que la EMPRESA le debe a cada proveedor, para quien ve la plata de Proveedores (el
  -- líder, un módulo de plata de Compras o el módulo Proveedores). Antes (ADR-0187) era lo que debían «mis tiendas».
  left join (
    select x.proveedor_id, sum(x.saldo) as saldo, sum(x.saldo) filter (where x.fecha_vencimiento < fn_hoy_lima()) as vencido
      from retail.compras x
     where x.estado = 'vigente' and x.saldo > 0 and (select retail.fn_ve_plata_de_proveedores())
     group by x.proveedor_id
  ) dv on dv.proveedor_id = p.id
$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_proveedores()',
  $v$    and fn_compra_es_de_mis_tiendas(c.id)
$v$,
  $v$    and (select retail.fn_ve_plata_de_proveedores()) -- ADR-0387: las compras de todas las tiendas
$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_proveedores_serie_12m()',
  $v$ and retail.fn_compra_es_de_mis_tiendas(c.id)$v$,
  $v$ /* ADR-0387: todas las tiendas */$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_proveedor_metricas_compras(uuid)',
  $v$ and fn_compra_es_de_mis_tiendas(c2.id)$v$,
  $v$ /* ADR-0387: todas las tiendas */$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_proveedor_costo_evolucion(uuid,integer)',
  $v$and fn_compra_es_de_mis_tiendas(c.id)$v$,
  $v$/* ADR-0387: todas las tiendas */$v$,
  2);

-- 3. «Mis tiendas» deja de existir en Compras.

-- Una factura es «de mis tiendas» para quien ve la plata de Compras: todas. Sus lectores (anular, adjuntar, reasignar, notas de
-- crédito, faltantes sin nota, indicadores, `fn_puede_ver_compra`) siguen pidiendo además el módulo de cada acción.
select pg_temp.reemplazar(
  'retail.fn_compra_es_de_mis_tiendas(uuid)',
  $v$  select coalesce(
    retail.fn_es_lider()
    or exists (
      select 1 from retail.compras c
      where c.id = p_compra_id and c.ubicacion_gestion_id = any(retail.fn_compras_ubicaciones())
    ),
    false);
$v$,
  $v$  -- ADR-0387 (Felipe 2026-10-12): quien tiene un módulo de plata de Compras ve y maneja las facturas de TODAS las tiendas, como el
  -- líder (deshace ADR-0184). El nombre se queda para no tocar a sus lectores.
  select retail.fn_puede_ver_dinero_de_compras();
$v$,
  1);

-- La tienda que gestiona un comprobante, o desde la que se paga si la pantalla la nombra: cualquier tienda activa.
select pg_temp.reemplazar(
  'retail.fn_puede_comprar_en(uuid)',
  $v$ select coalesce(p_ubicacion_id = any(retail.fn_compras_ubicaciones()), false); $v$,
  $v$ /* ADR-0387: cualquier tienda activa, para quien ve la plata de Compras */ select coalesce(retail.fn_puede_ver_dinero_de_compras() and exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.activo), false); $v$,
  1);

-- La deuda de una factura: entera para quien ve la plata de Compras (antes, solo el líder; el resto, la suma de sus partes).
select pg_temp.reemplazar(
  'retail.fn_deuda_visible(uuid[])',
  $v$  -- El líder: la factura entera, como siempre.
  if retail.fn_es_lider() then
$v$,
  $v$  -- ADR-0387 (Felipe 2026-10-12): el líder y quien tiene un módulo de plata de Compras ven la factura entera, de todas las tiendas.
  -- Lo de abajo (la suma de las partes de «mis tiendas», ADR-0187) ya no lo alcanza nadie con módulo; se retira con `fn_compras_ubicaciones`.
  if retail.fn_puede_ver_dinero_de_compras() then
$v$,
  1);

-- Las «partes ajenas» (facturas de otra tienda en las que mi tienda tiene parte): ya no hay ajenas.
select pg_temp.reemplazar(
  'retail.fn_mis_partes_de_compras()',
  $v$   where not retail.fn_es_lider()
$v$,
  $v$   where not retail.fn_puede_ver_dinero_de_compras() -- ADR-0387: con el módulo se ve la factura entera; ya no hay partes ajenas
$v$,
  1);

-- 4. Pagar a nombre de la empresa.

-- Al registrar: la gestora puede ser cualquier tienda activa, y el pago al contado es de la empresa.
select pg_temp.reemplazar(
  'retail.registrar_compra(uuid,text,text,text,uuid,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid,date)',
  $v$'La tienda que gestiona el comprobante tiene que ser una de las tuyas'$v$,
  $v$'La tienda que gestiona el comprobante no existe o no está activa'$v$,
  1);
select pg_temp.reemplazar(
  'retail.registrar_compra(uuid,text,text,text,uuid,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid,date)',
  $v$case when retail.fn_es_lider() then null else p_ubicacion_destino_id end, nullif(v_pago ->> 'cuenta_id', '')::uuid -- ADR-0184: la gestora$v$,
  $v$null, nullif(v_pago ->> 'cuenta_id', '')::uuid -- ADR-0387: el contado es de la EMPRESA, sea líder o no (antes, ADR-0184, de la gestora)$v$,
  1);

-- Por pagar: sin tienda (la empresa), sea líder o no. Primero el módulo, después la tienda si la pantalla nombra una.
select pg_temp.reemplazar(
  'retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric,uuid)',
  $v$  if p_ubicacion_id is not null and not retail.fn_puede_comprar_en(p_ubicacion_id) then
    raise exception 'Solo puedes pagar desde una de tus tiendas' using errcode = '42501';
  end if;
  if p_ubicacion_id is null and not retail.fn_es_lider() and retail.fn_puede_pagar_compras() then
    raise exception 'Elige desde qué tienda pagas: cada tienda paga su parte' using errcode = '42501';
  end if;
  if not retail.fn_puede_pagar_compras() then
    raise exception 'Registrar pagos a proveedores necesita el módulo Por pagar en tu rol' using errcode = '42501';
  end if;
$v$,
  $v$  -- ADR-0387 (Felipe 2026-10-12, «el módulo es la llave»): quien tiene Por pagar paga a nombre de la EMPRESA, sea líder o no; ya no
  -- se exige elegir una tienda. Si la pantalla nombra una, tiene que estar activa, tener parte y el monto no pasa de lo que le queda.
  if not retail.fn_puede_pagar_compras() then
    raise exception 'Registrar pagos a proveedores necesita el módulo Por pagar en tu rol' using errcode = '42501';
  end if;
  if p_ubicacion_id is not null and not retail.fn_puede_comprar_en(p_ubicacion_id) then
    raise exception 'Esa tienda no existe o no está activa' using errcode = '42501';
  end if;
$v$,
  1);
select pg_temp.reemplazar(
  'retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric,uuid)',
  $v$quien no es líder paga SIEMPRE desde una de sus tiendas, y solo la parte de esa tienda.$v$,
  $v$quien no es líder pagaba SIEMPRE desde una de sus tiendas; ADR-0387 lo deshizo (abajo).$v$,
  1);
select pg_temp.reemplazar(
  'retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric,uuid)',
  $v$  if p_ubicacion_id is not null and not retail.fn_puede_comprar_en(p_ubicacion_id) then
    raise exception 'Solo puedes pagar desde una de tus tiendas' using errcode = '42501';
  end if;
  if p_ubicacion_id is null and not retail.fn_es_lider() and retail.fn_puede_pagar_compras() then
    raise exception 'Elige desde qué tienda pagas: cada tienda paga su parte' using errcode = '42501';
  end if;
  if not retail.fn_puede_pagar_compras() then
    raise exception 'Registrar pagos a proveedores necesita el módulo Por pagar en tu rol' using errcode = '42501';
  end if;
$v$,
  $v$  -- ADR-0387 (Felipe 2026-10-12, «el módulo es la llave»): quien tiene Por pagar paga a nombre de la EMPRESA, sea líder o no; ya no
  -- se exige elegir una tienda. Si la pantalla nombra una, tiene que estar activa, tener parte y el monto no pasa de lo que le queda.
  if not retail.fn_puede_pagar_compras() then
    raise exception 'Registrar pagos a proveedores necesita el módulo Por pagar en tu rol' using errcode = '42501';
  end if;
  if p_ubicacion_id is not null and not retail.fn_puede_comprar_en(p_ubicacion_id) then
    raise exception 'Esa tienda no existe o no está activa' using errcode = '42501';
  end if;
$v$,
  1);
select pg_temp.reemplazar(
  'retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric,uuid)',
  $v$quien no es líder paga SIEMPRE desde una de sus tiendas, y solo la parte de esa tienda.$v$,
  $v$quien no es líder pagaba SIEMPRE desde una de sus tiendas; ADR-0387 lo deshizo (abajo).$v$,
  1);
select pg_temp.reemplazar(
  'retail.registrar_pagos_compra(uuid,jsonb,date,uuid,uuid)',
  $v$  if p_ubicacion_id is not null and not retail.fn_puede_comprar_en(p_ubicacion_id) then
    raise exception 'Solo puedes pagar desde una de tus tiendas' using errcode = '42501';
  end if;
  if p_ubicacion_id is null and not retail.fn_es_lider() and retail.fn_puede_pagar_compras() then
    raise exception 'Elige desde qué tienda pagas: cada tienda paga su parte' using errcode = '42501';
  end if;
  if not retail.fn_puede_pagar_compras() then
    raise exception 'Registrar pagos a proveedores necesita el módulo Por pagar en tu rol' using errcode = '42501';
  end if;
$v$,
  $v$  -- ADR-0387 (Felipe 2026-10-12, «el módulo es la llave»): quien tiene Por pagar paga a nombre de la EMPRESA, sea líder o no; ya no
  -- se exige elegir una tienda. Si la pantalla nombra una, tiene que estar activa, tener parte y el monto no pasa de lo que le queda.
  if not retail.fn_puede_pagar_compras() then
    raise exception 'Registrar pagos a proveedores necesita el módulo Por pagar en tu rol' using errcode = '42501';
  end if;
  if p_ubicacion_id is not null and not retail.fn_puede_comprar_en(p_ubicacion_id) then
    raise exception 'Esa tienda no existe o no está activa' using errcode = '42501';
  end if;
$v$,
  1);
select pg_temp.reemplazar(
  'retail.registrar_pagos_compra(uuid,jsonb,date,uuid,uuid)',
  $v$quien no es líder paga SIEMPRE desde una de sus tiendas, y solo la parte de esa tienda.$v$,
  $v$quien no es líder pagaba SIEMPRE desde una de sus tiendas; ADR-0387 lo deshizo (abajo).$v$,
  1);

-- 5. Recibir: quién reasigna. La regla no cambia (cada sede recibe lo que tiene asignado, también el líder); solo el aviso.
select pg_temp.reemplazar(
  'retail.recibir_compras(uuid,jsonb,text,text)',
  $v$: pide a un líder que la reasigne antes de recibirla ahí'$v$,
  $v$: pide a quien tiene Facturas de proveedor que la reasigne antes de recibirla ahí'$v$,
  1);
select pg_temp.reemplazar(
  'retail.recibir_envio(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,uuid)',
  $v$'Esa línea no tiene mercadería asignada a esta sede: solo un líder puede recibirla aquí (o pide que la reasignen)'$v$,
  $v$'Esa línea no tiene mercadería asignada a esta sede: pide a quien tiene Facturas de proveedor que la reasigne antes de recibirla aquí'$v$,
  1);

-- 6. Finanzas: la deuda es de la tienda que hizo el pedido (decisión 45 de ADR-0362, Felipe 2026-10-12). «Trujillo y Lima, si no
-- hicieron el pedido, no tienen nada que pagar, sino quien realizó el pedido»: una factura se debe ENTERA en la tienda que la gestiona
-- (la que guarda el papel; así ya la asienta el Diario). La mercadería que otra tienda recibió no le crea deuda (si se compensan, es
-- entre ellas, fuera de esta cuenta) y el pago de la empresa baja la deuda de la factura. Antes, cada tienda debía «su parte» menos
-- lo que pagó ELLA: un pago de la empresa no bajaba ninguna parte y la suma por tienda daba más que la deuda real.

-- Por pagar de Finanzas, mirando una tienda: las facturas que gestiona esa tienda, enteras (ya no hay «partes»).
select pg_temp.reemplazar(
  'retail.fn_por_pagar_consolidado(uuid,date,boolean)',
  $v$           v_ubic is not null as parte,
           case when v_ubic is not null then pt.total else c.total end as total,
           case when v_ubic is not null then retail.fn_saldo_de_tienda(c.id, v_ubic) else c.saldo end as saldo
$v$,
  $v$           false as parte, -- ADR-0387 (decisión 45): una tienda debe sus facturas enteras; ya no hay «partes»
           c.total as total,
           c.saldo as saldo
$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_por_pagar_consolidado(uuid,date,boolean)',
  $v$      -- La parte se lee por factura (como `fn_deuda_visible`): el reparto se calcula solo de lo que tiene saldo.
      left join lateral (
        select x.total from retail.compra_parte_por_tienda x where x.compra_id = c.id and x.ubicacion_id = v_ubic
      ) pt on true
     where c.estado = 'vigente' and c.saldo > 0
       and (v_ubic is null or pt.total is not null)
$v$,
  $v$     where c.estado = 'vigente' and c.saldo > 0
       -- ADR-0387 (decisión 45): mirando una tienda, las facturas que ELLA gestiona; lo que recibió de una factura ajena no es deuda suya.
       and (v_ubic is null or c.ubicacion_gestion_id = v_ubic)
$v$,
  1);

-- Balance por tienda: lo que debe cada tienda son sus facturas (las que gestiona), con su saldo al corte.
select pg_temp.reemplazar(
  'retail.fn_bal_facturas_de_tienda(date)',
  $v$  select pt.ubicacion_id,
         sum(greatest(0, least(
           pt.total - coalesce((select sum(g.monto) from retail.compra_pagos g
                                 where g.compra_id = pt.compra_id and g.ubicacion_id = pt.ubicacion_id and g.fecha <= p_corte), 0),
           f.saldo)))
    from retail.compra_parte_por_tienda pt join f on f.compra_id = pt.compra_id
   group by pt.ubicacion_id;
$v$,
  $v$  -- ADR-0387 (Felipe 2026-10-12, decisión 45): cada factura se debe entera en la tienda que la gestiona (la que hizo el pedido), y el
  -- pago de la empresa la baja; lo que otra tienda recibió de ella no es deuda suya. Antes se sumaban «partes» y daba de más.
  select f.ubicacion_gestion_id, sum(f.saldo)
    from f
   where f.ubicacion_gestion_id is not null
   group by f.ubicacion_gestion_id;
$v$,
  1);

comment on function retail.fn_compra_es_de_mis_tiendas(uuid) is
  'ADR-0387 (Felipe 2026-10-12): verdad para quien ve la plata de Compras (líder, Facturas de proveedor, Por pagar o Notas de crédito): ve y maneja las facturas de TODAS las tiendas. Antes (ADR-0184), solo las que gestionaban sus tiendas.';
comment on function retail.fn_puede_comprar_en(uuid) is
  'ADR-0387 (Felipe 2026-10-12): cualquier tienda activa, para quien ve la plata de Compras: la que gestiona un comprobante o desde la que se paga, si la pantalla la nombra. Antes (ADR-0184), solo «mis tiendas».';

-- Validación: cada función quedó con la regla nueva y sin la vieja (si no, aborta todo).
do $g$
declare
  v_firma text;
  v_def text;
begin
  foreach v_firma in array array['retail.fn_proveedor_costo_evolucion(uuid,integer)', 'retail.fn_proveedor_creditos(uuid,integer)', 'retail.fn_proveedor_metricas_compras(uuid)', 'retail.fn_proveedores()', 'retail.fn_proveedores_resumen()', 'retail.fn_proveedores_serie_12m()'] loop
    v_def := pg_get_functiondef(v_firma::regprocedure);
    if position('fn_ve_plata_de_proveedores()' in v_def) = 0
       or position('fn_puede_ver_dinero_de_compras()' in v_def) > 0
       or position('fn_puede_registrar_compras()' in v_def) > 0
       or position('fn_compra_es_de_mis_tiendas(' in v_def) > 0
       or position('fn_deuda_visible(' in v_def) > 0 then
      raise exception 'ADR-0387: % no quedó con la plata de Proveedores de todas las tiendas', v_firma;
    end if;
  end loop;
  foreach v_firma in array array['retail.fn_compra_es_de_mis_tiendas(uuid)', 'retail.fn_puede_comprar_en(uuid)'] loop
    v_def := pg_get_functiondef(v_firma::regprocedure);
    if position('fn_puede_ver_dinero_de_compras()' in v_def) = 0 or position('fn_compras_ubicaciones' in v_def) > 0 then
      raise exception 'ADR-0387: % sigue preguntando por «mis tiendas»', v_firma;
    end if;
  end loop;
  if position('if retail.fn_puede_ver_dinero_de_compras() then' in pg_get_functiondef('retail.fn_deuda_visible(uuid[])'::regprocedure)) = 0 then
    raise exception 'ADR-0387: fn_deuda_visible no da la factura entera a quien tiene el módulo';
  end if;
  if position('where not retail.fn_puede_ver_dinero_de_compras()' in pg_get_functiondef('retail.fn_mis_partes_de_compras()'::regprocedure)) = 0 then
    raise exception 'ADR-0387: fn_mis_partes_de_compras sigue dando partes ajenas';
  end if;
  foreach v_firma in array array['retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric,uuid)', 'retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric,uuid)', 'retail.registrar_pagos_compra(uuid,jsonb,date,uuid,uuid)'] loop
    v_def := pg_get_functiondef(v_firma::regprocedure);
    if position('Elige desde qué tienda pagas' in v_def) > 0 or position('una de tus tiendas' in v_def) > 0 then
      raise exception 'ADR-0387: % sigue exigiendo pagar desde una tienda', v_firma;
    end if;
  end loop;
  v_def := pg_get_functiondef('retail.registrar_compra(uuid,text,text,text,uuid,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid,date)'::regprocedure);
  if position('else p_ubicacion_destino_id end' in v_def) > 0 or position('una de las tuyas' in v_def) > 0 then
    raise exception 'ADR-0387: registrar_compra sigue limitando la gestora o el contado a «mis tiendas»';
  end if;
  v_def := pg_get_functiondef('retail.fn_por_pagar_consolidado(uuid,date,boolean)'::regprocedure);
  if position('fn_saldo_de_tienda(' in v_def) > 0 or position('c.ubicacion_gestion_id = v_ubic' in v_def) = 0 then
    raise exception 'ADR-0387: Por pagar de Finanzas sigue sumando «partes» por tienda';
  end if;
  if position('compra_parte_por_tienda' in pg_get_functiondef('retail.fn_bal_facturas_de_tienda(date)'::regprocedure)) > 0 then
    raise exception 'ADR-0387: el Balance por tienda sigue sumando «partes»';
  end if;
  if position('pide a un líder' in pg_get_functiondef('retail.recibir_compras(uuid,jsonb,text,text)'::regprocedure)) > 0
     or position('solo un líder puede recibirla' in pg_get_functiondef('retail.recibir_envio(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,uuid)'::regprocedure)) > 0 then
    raise exception 'ADR-0387: un aviso de Recibir sigue mandando a pedirle al líder';
  end if;
end;
$g$;

reset lock_timeout;

-- ============================================================================================================================
-- FIN DE LA PARTE 1
-- ============================================================================================================================

-- ============================================================================================================================
-- PARTE 2 · políticas (se pega SOLA y al final, ADR-0195). Quien ve la plata de Compras lee todo; quien opera una sede, como siempre,
-- los destinos, cierres y reasignaciones de su sede. Una sola pregunta por consulta (`(select …)`).
-- ============================================================================================================================

set lock_timeout = '3s';

alter policy compras_select on retail.compras
  using ((select retail.fn_puede_ver_dinero_de_compras()));
alter policy compra_items_select on retail.compra_items
  using ((select retail.fn_puede_ver_dinero_de_compras()));
alter policy compra_pagos_select on retail.compra_pagos
  using ((select retail.fn_puede_ver_dinero_de_compras()));
alter policy compra_notas_credito_select on retail.compra_notas_credito
  using ((select retail.fn_puede_ver_dinero_de_compras()));
alter policy compra_adjuntos_select on retail.compra_adjuntos
  using ((select retail.fn_puede_ver_dinero_de_compras()));
alter policy compra_item_destinos_select on retail.compra_item_destinos
  using ((select retail.fn_puede_ver_dinero_de_compras()) or coalesce(ubicacion_id = (select retail.fn_ubicacion_actual_persona()), false));
alter policy compra_item_cierres_select on retail.compra_item_cierres
  using ((select retail.fn_puede_ver_dinero_de_compras()) or coalesce(ubicacion_id = (select retail.fn_ubicacion_actual_persona()), false));
alter policy compra_reasignaciones_select on retail.compra_reasignaciones
  using ((select retail.fn_puede_ver_dinero_de_compras())
         or coalesce(desde_ubicacion_id = (select retail.fn_ubicacion_actual_persona()), false)
         or coalesce(hacia_ubicacion_id = (select retail.fn_ubicacion_actual_persona()), false));
alter policy retail_compras_adjuntos_select on storage.objects
  using (bucket_id = 'retail-compras-adjuntos' and (select retail.fn_puede_ver_dinero_de_compras()));

-- Validación: ninguna lectura de Compras sigue armando la lista de «mis» facturas.
do $g$
begin
  if exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
     where ((n.nspname = 'retail' and c.relname in ('compras', 'compra_items', 'compra_pagos', 'compra_notas_credito', 'compra_adjuntos',
                                                    'compra_item_destinos', 'compra_item_cierres', 'compra_reasignaciones'))
            or (n.nspname = 'storage' and p.polname = 'retail_compras_adjuntos_select'))
       and p.polcmd = 'r'
       and (position('fn_compras_visibles' in pg_get_expr(p.polqual, p.polrelid)) > 0
            or position('fn_puede_ver_dinero_de_compras' in pg_get_expr(p.polqual, p.polrelid)) = 0)
  ) then
    raise exception 'ADR-0387: una política de lectura de Compras no quedó con la regla nueva';
  end if;
end;
$g$;

reset lock_timeout;
