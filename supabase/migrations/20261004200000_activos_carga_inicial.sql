-- ============================================================================
-- 20261004200000 — Activos: lo que CAYLA ya tenía antes del sistema entra como CARGA INICIAL (ADR-0335)
--
-- EL PROBLEMA PRIMERO
--   Un activo nacía de una compra: `registrar_activo` exige el comprobante o cómo se pagó (el candado
--   `activos_fijos_pago_coherente`), y de ese pago salen una resta en la cuenta que pagó, un asiento al diario y, en
--   efectivo, un egreso del cajón. Eso es verdad para una compra de hoy. No lo es para una remalladora comprada en agosto
--   de 2025, antes de que existiera el sistema: nadie sabe con qué se pagó, y obligar a decirlo es inventar un pago que
--   ensucia las cuentas. Por esa puerta no cabía nada de lo anterior al sistema: las 39 máquinas del Taller se perdieron
--   en el corte V1→V2 del 2026-09-12 y hoy `activos_fijos` tiene 0 filas, así que el Balance diría «S/ 0 en activos».
--
-- EL CONTRATO (3 líneas)
--   PROMETE: dejar un activo con su costo histórico y su fecha real de compra, que se deprecia desde esa fecha y entra a los
--            saldos de arranque del Balance, SIN tocar caja, cuentas, deudas ni IGV.
--   ASUME:   que quien lo carga es líder; que la fecha es de antes del arranque del Balance (si ya hay uno) y no futura;
--            que el costo es el que CAYLA decidió guardar (hoy: el total pagado, con IGV; el costo sin IGV lo trae la factura).
--   NO HACE: ningún pago, comprobante ni IGV. Una compra de hoy, con su pago, sigue entrando por `registrar_activo`.
--
-- LOS ESTADOS QUE NO PUEDEN EXISTIR (y quién los impide)
--   · «ya lo teníamos» con comprobante, medio de pago, egreso o cuenta        → el CHECK (contradice «sin pago»).
--   · un activo sin pago que NO sea «ya lo teníamos»                          → el mismo CHECK (como hasta hoy).
--   · pasar de «ya lo teníamos» a «lo compramos» (o al revés) después         → el disparador (se anula y se registra de nuevo).
--   · una carga inicial con fecha de después del arranque del Balance         → el disparador (esa es una compra: lleva su pago).
--
-- DECIDÍ: una marca explícita `carga_inicial` en la fila + una función propia (`cargar_activo_inicial`, solo del líder).
-- DESCARTÉ: (a) un «medio de pago» falso (`transferencia`, `apertura`…): `fn_dinero_libro`, `fn_asientos`, la cuenta sellada
--           y los saldos lo leen en seis sitios y los seis tendrían que aprender a ignorarlo; con la marca, un `medio_pago`
--           nulo ya queda fuera del libro de dinero por su propio filtro (`a.medio_pago is not null`) y `fn_activos_sellar`
--           ya deja pasar un activo sin medio. (b) Reescribir `fn_activos_validar`: en producción NO es la del repo (la
--           parcharon 20260925110000 y 20260925150000), y recrearla borraría esos parches sin avisar; la regla nueva vive en
--           su propio disparador, pequeño y aparte (Hickey: no entrelazarla con la del pago).
-- SE ROMPE SI: alguien lee `medio_pago is null` como «efectivo» (`fn_asiento_cuenta_de_medio(null)` devuelve '101') para un
--           activo con fecha de DESPUÉS del arranque: acreditaría la caja con plata que nunca salió. Por eso el disparador
--           exige fecha anterior al arranque; y mientras `parametros_finanzas.inicio_finanzas` (ADR-0332) no se fije, el
--           diario de meses anteriores al arranque puede mostrar ese crédito a la caja (no entra al Balance: este parte
--           de los saldos de arranque).
--
-- LO QUE NO TOCA: `registrar_activo`, `fn_activos_validar`, `fn_activos_sellar`, `fn_candado_activos_fijos`, el diario, el
--   libro de dinero ni el Balance. Un activo cargado así aparece en la lista, se deprecia con la fórmula de siempre
--   (`fn_meses_depreciados`: desde el mes siguiente a la fecha) y la propuesta de saldos de arranque lo toma por la tabla.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — DOS EJECUCIONES SEPARADAS, EN ORDEN (CLAUDE.md «Políticas y deadlocks»):
--   PARTE 1 la tabla (un `alter` sobre `activos_fijos`, vacía y sin uso) · PARTE 2 las funciones y el disparador. Cada una
--   espera 3 s un candado: si dice «lock timeout», se repite ESA parte. Idempotentes. Sin políticas y sin `drop trigger`
--   (el disparador usa `create or replace trigger`). Pegar solo la parte 2 antes que la 1 falla (no existe la columna).
-- ============================================================================

-- ============================== PARTE 1 · la tabla ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.activos_fijos add column if not exists carga_inicial boolean not null default false;
comment on column retail.activos_fijos.carga_inicial is
  'true = «ya lo teníamos»: CAYLA lo tenía antes del sistema y no se sabe (ni importa) con qué se pagó. Sin comprobante, sin medio de pago, sin egreso y sin cuenta; no mueve plata. Lo carga solo el líder (`cargar_activo_inicial`), con fecha de antes del arranque del Balance.';

alter table retail.activos_fijos drop constraint if exists activos_fijos_pago_coherente;
alter table retail.activos_fijos add constraint activos_fijos_pago_coherente check (
  -- «ya lo teníamos»: ningún rastro de pago
  (carga_inicial
     and compra_id is null and medio_pago is null and caja_movimiento_id is null and cuenta_dinero_id is null)
  -- una compra: la regla de siempre (con factura, la cuenta va en su pago; sin ella, di cómo se pagó)
  or (not carga_inicial and (
        (compra_id is null and medio_pago is not null
           and (caja_movimiento_id is null or medio_pago = 'efectivo')
           and (medio_pago <> 'efectivo' or caja_movimiento_id is not null or cuenta_dinero_id is not null))
        or (compra_id is not null and medio_pago is null and cuenta_dinero_id is null)))
);

-- ============================== PARTE 2 · funciones y disparador ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- El disparador: las reglas de fecha y que la marca no cambie ----------
-- CONTRATO. Promete: ninguna carga inicial es futura ni cae en o después del arranque del Balance; la marca no se cambia.
-- Asume: `saldos_iniciales` guarda el arranque (se cuenta como arranque su fecha más antigua); se evalúa al insertar.
create or replace function retail.fn_activos_carga_inicial_validar() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_arranque date;
begin
  if tg_op = 'UPDATE' then
    if new.carga_inicial is distinct from old.carga_inicial then
      raise exception 'Un activo no pasa de «ya lo teníamos» a «lo compramos» (ni al revés): se anula y se registra de nuevo.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.carga_inicial then
    if new.fecha_adquisicion > retail.fn_hoy_lima() then
      raise exception 'La fecha de compra no puede ser futura.' using errcode = 'P0001';
    end if;
    select min(s.fecha) into v_arranque from retail.saldos_iniciales s;
    if v_arranque is not null and new.fecha_adquisicion >= v_arranque then
      raise exception 'Lo que ya se tenía tiene que ser de antes del arranque del Balance (%): una compra de esa fecha en adelante se registra con su pago.',
        to_char(v_arranque, 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function retail.fn_activos_carga_inicial_validar() from public, anon, authenticated;

create or replace trigger activos_fijos_carga_inicial before insert or update on retail.activos_fijos
  for each row execute function retail.fn_activos_carga_inicial_validar();

-- ---------- Cargar lo que ya se tenía ----------
-- CONTRATO. Promete: UN activo «ya lo teníamos» (costo = lo que se pasa, fecha real, vida útil y cuenta del tipo), idempotente
-- por `p_token`; sin tocar caja, cuentas, compras ni diario. Asume: el llamador es líder (Admin o Líder activo); la fecha es
-- de antes del arranque del Balance (lo cierra el disparador). El responsable firma (`fn_actor_persona_id`, ADR-0162).
create or replace function retail.cargar_activo_inicial(
  p_ubicacion_id uuid,
  p_tipo text,
  p_nombre text,
  p_fecha date,
  p_costo numeric,
  p_vida_util_meses integer default null,
  p_serie text default null,
  p_nota text default null,
  p_token uuid default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_tipo retail.tipos_activo%rowtype;
  v_vida integer;
  v_id uuid;
  v_costo numeric := round(p_costo, 2);
begin
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('activos:' || p_token::text, 0));
    select id into v_id from retail.activos_fijos where token_cliente = p_token;
    if found then return v_id; end if;
  end if;
  if not retail.fn_es_lider() then
    raise exception 'Cargar lo que CAYLA ya tenía es solo del líder.' using errcode = '42501';
  end if;
  if p_ubicacion_id is null or not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id) then
    raise exception 'Un activo está en una tienda, el Taller o el almacén: elige dónde.' using errcode = 'P0001';
  end if;
  select * into v_tipo from retail.tipos_activo where codigo = p_tipo;
  if not found or not v_tipo.activo then
    raise exception 'Elige qué tipo de activo es.' using errcode = 'P0001';
  end if;
  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'Escribe qué es.' using errcode = 'P0001';
  end if;
  if v_costo is null or v_costo <= 0 then
    raise exception 'El costo tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if p_fecha is null or p_fecha > retail.fn_hoy_lima() then
    raise exception 'La fecha de compra no puede ser futura.' using errcode = 'P0001';
  end if;
  v_vida := coalesce(p_vida_util_meses, v_tipo.vida_util_meses);
  if v_vida < 12 or v_vida > 600 then
    raise exception 'La vida útil va de 1 a 50 años.' using errcode = 'P0001';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  insert into retail.activos_fijos (ubicacion_id, tipo, nombre, serie, nota, cuenta_codigo, costo, valor_residual, vida_util_meses,
                                    tasa_anual, fecha_adquisicion, estado, carga_inicial, registrado_por, token_cliente)
  values (p_ubicacion_id, p_tipo, trim(p_nombre), nullif(trim(coalesce(p_serie, '')), ''), nullif(trim(coalesce(p_nota, '')), ''),
          v_tipo.cuenta_pcge, v_costo, 0, v_vida, round(12.0 / v_vida, 4), p_fecha, 'activo', true, v_actor, p_token)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  if p_token is not null and exists (select 1 from retail.activos_fijos where token_cliente = p_token) then
    return (select id from retail.activos_fijos where token_cliente = p_token);
  end if;
  raise;
end $$;
revoke all on function retail.cargar_activo_inicial(uuid, text, text, date, numeric, integer, text, text, uuid) from public, anon;
grant execute on function retail.cargar_activo_inicial(uuid, text, text, date, numeric, integer, text, text, uuid) to authenticated;

-- ---------- La lista dice cuáles son «ya lo teníamos» ----------
-- Misma función que ADR-0195 F2b (su cuerpo en producción es idéntico al del repo: huella 0e3d3e3e…), con UNA columna más al
-- final. Cambia el tipo de lo que devuelve, por eso `drop function` (que no toma candados sobre las tablas) y se vuelven a dar
-- los permisos.
drop function if exists retail.fn_activos_lista(date, uuid);
create function retail.fn_activos_lista(p_corte date default null, p_ubicacion_id uuid default null)
returns table (
  id uuid, ubicacion_id uuid, ubicacion_nombre text, tipo text, tipo_nombre text, cuenta text, nombre text, serie text,
  fecha_adquisicion date, costo numeric, vida_util_meses integer, depreciacion_mensual numeric, meses_depreciados integer,
  depreciacion_acumulada numeric, valor_hoy numeric, estado text, fecha_baja date, motivo_baja text, compra_id uuid,
  comprobante text, comprobante_tipo text, proveedor_nombre text, condicion text, saldo numeric, tiene_pagos boolean,
  medio_pago text, caja_movimiento_id uuid, motivo_anulacion text, registrado_por_nombre text, creado_en timestamptz,
  carga_inicial boolean
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_ubics uuid[] := retail.fn_gastos_ubicaciones(); v_corte date := coalesce(p_corte, retail.fn_hoy_lima());
begin
  if not retail.fn_es_lider() and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver los activos necesita el módulo Gastos en tu rol.' using errcode = '42501';
  end if;
  return query
  select a.id, a.ubicacion_id, u.nombre, a.tipo, t.nombre, a.cuenta_codigo, a.nombre, a.serie, a.fecha_adquisicion, a.costo,
         a.vida_util_meses,
         round((a.costo - a.valor_residual) / a.vida_util_meses, 2),
         m.meses,
         least(a.costo - a.valor_residual, round((a.costo - a.valor_residual) / a.vida_util_meses * m.meses, 2) + a.depreciacion_apertura),
         a.costo - least(a.costo - a.valor_residual, round((a.costo - a.valor_residual) / a.vida_util_meses * m.meses, 2) + a.depreciacion_apertura),
         a.estado, a.fecha_baja, a.motivo_baja, a.compra_id, c.documento, c.tipo, p.nombre, c.condicion, c.saldo,
         exists (select 1 from retail.compra_pagos x where x.compra_id = a.compra_id), a.medio_pago, a.caja_movimiento_id,
         a.motivo_anulacion, trim(concat_ws(' ', pe.nombres, pe.apellidos)), a.created_at,
         a.carga_inicial
    from retail.activos_fijos a
    cross join lateral (select retail.fn_meses_depreciados(a.fecha_adquisicion, a.vida_util_meses, v_corte, a.fecha_baja) as meses) m
    left join retail.tipos_activo t on t.codigo = a.tipo
    left join retail.ubicaciones u on u.id = a.ubicacion_id
    left join retail.compras c on c.id = a.compra_id
    left join retail.proveedores p on p.id = c.proveedor_id
    left join public.personas pe on pe.id = a.registrado_por
   where a.ubicacion_id = any (v_ubics)
     and (p_ubicacion_id is null or a.ubicacion_id = p_ubicacion_id)
   order by (a.estado = 'activo') desc, a.fecha_adquisicion desc, a.created_at desc;
end $$;
revoke all on function retail.fn_activos_lista(date, uuid) from public, anon;
grant execute on function retail.fn_activos_lista(date, uuid) to authenticated;
