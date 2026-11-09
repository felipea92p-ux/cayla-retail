-- ============================================================================
-- 20261106170000 — El comprobante de un gasto de un mes ya cerrado (tarea 20 de «Las 36 de Finanzas», segunda parte)
--
-- EL PROBLEMA PRIMERO. «Llegó el comprobante» exige abierto el mes del gasto: con octubre cerrado, un gasto de octubre se queda sin papel para siempre, sin sustento y sin crédito fiscal.
--
-- LA DECISIÓN (Felipe, 2026-11-06: el papel guarda su fecha real y entra en el mes abierto). El gasto cerrado no se toca: tocarlo movería la huella de su mes. Y no sirve crear una compra como en
-- un mes abierto, porque su pago volvería a sacar del banco una plata que ya salió en octubre. Por eso el papel vive en `gasto_papeles_tardios` y entra por su cuenta en el mes abierto:
--   · el crédito fiscal y el registro de compras, con su fecha real;
--   · el diario, con el asiento `gasto_papel`: 4011 al debe y la cuenta del gasto al haber. El gasto de octubre llevó el IGV como costo; noviembre lo devuelve como crédito;
--   · el gasto deja de pedir su comprobante (la lista lo lee aparte, como «no emite»), y su sustento dice qué papel tiene.
--
-- SUPUESTO PARA EL CONTADOR: el IGV de ese gasto se descuenta en el mes en que se anota, y baja el gasto de ese mes en vez de corregir el mes cerrado. Lo revisa el contador.
--
-- NO HACE: no reabre nada ni cambia el gasto. Si el gasto y su mes están abiertos, sigue el camino de siempre, y si solo está cerrado el mes del papel, la compra entra con la tarea 20.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución, DESPUÉS de 20261106165000. Crea una tabla con RLS y sin políticas: se lee solo por funciones. Las funciones se reescriben desde la definición viva; si
-- un ancla no aparece las veces esperadas, aborta entero. Pegarla dos veces no hace nada. Verificado: `pnpm pruebas:factura-mes-cerrado`.
--
-- SE ROMPE SI: una migración futura recrea una de estas funciones copiando un texto viejo del repo (la prueba lo vigila).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

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

create table if not exists retail.gasto_papeles_tardios (
  id uuid primary key default gen_random_uuid(),
  gasto_id uuid not null references retail.gastos (id),
  proveedor_id uuid not null references retail.proveedores (id),
  tipo text not null check (tipo in ('factura', 'boleta', 'recibo_por_honorarios')),
  serie text not null,
  numero text not null,
  fecha_emision date not null,
  fecha_contable date not null,
  subtotal numeric(12,2) not null,
  igv numeric(12,2) not null check (igv >= 0),
  total numeric(12,2) not null,
  registrado_por uuid,
  creado_en timestamptz not null default now(),
  -- Quitar el papel no borra la fila (tarea 21): queda con su motivo.
  anulado_en timestamptz,
  anulado_por uuid,
  motivo_anulacion text,
  check ((anulado_en is null) = (motivo_anulacion is null))
);
alter table retail.gasto_papeles_tardios enable row level security;
comment on table retail.gasto_papeles_tardios is
  'Tarea 20: el comprobante que llegó cuando el mes del gasto ya estaba cerrado. El gasto no cambia: el papel entra por su cuenta en fecha_contable.';
create unique index if not exists gasto_papeles_tardios_vigente on retail.gasto_papeles_tardios (gasto_id) where anulado_en is null;
create unique index if not exists gasto_papeles_tardios_papel on retail.gasto_papeles_tardios (proveedor_id, serie, numero) where anulado_en is null;

-- ── 1. Registrarlo ───────────────────────────────────────────────────────────
select pg_temp.reemplazar('retail.agregar_comprobante_a_gasto(uuid,jsonb)',
$a$    raise exception 'Ese gasto ya tiene su comprobante.' using errcode = 'P0001';
  end if;
  if v_g.categoria in$a$,
$n$    raise exception 'Ese gasto ya tiene su comprobante.' using errcode = 'P0001';
  end if;
  -- Lo mismo con el papel de un mes cerrado.
  if exists (select 1 from retail.gasto_papeles_tardios t where t.gasto_id = p_gasto_id and t.anulado_en is null) then
    if exists (select 1 from retail.gasto_papeles_tardios t where t.gasto_id = p_gasto_id and t.anulado_en is null and t.proveedor_id = v_prov and t.serie = v_serie and t.numero = v_numero) then
      return jsonb_build_object('ya_estaba', true, 'compra_id', null, 'igv', (select t.igv from retail.gasto_papeles_tardios t where t.gasto_id = p_gasto_id and t.anulado_en is null));
    end if;
    raise exception 'Ese gasto ya tiene su comprobante.' using errcode = 'P0001';
  end if;
  if v_g.categoria in$n$, 1);
select pg_temp.reemplazar('retail.agregar_comprobante_a_gasto(uuid,jsonb)',
$a$  if exists (select 1 from retail.compras where proveedor_id = v_prov and serie = v_serie and numero = v_numero) then$a$,
$n$  if exists (select 1 from retail.compras where proveedor_id = v_prov and serie = v_serie and numero = v_numero)
     or exists (select 1 from retail.gasto_papeles_tardios t where t.proveedor_id = v_prov and t.serie = v_serie and t.numero = v_numero and t.anulado_en is null) then$n$, 1);
select pg_temp.reemplazar('retail.agregar_comprobante_a_gasto(uuid,jsonb)',
$a$  perform retail.fn_exigir_mes_abierto(v_g.ubicacion_id, v_g.fecha, null, 'agregarle su comprobante');
  perform retail.fn_exigir_mes_abierto(v_g.ubicacion_id, v_fecha, null, 'agregarle su comprobante');

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Sin sesión no se cambia un gasto.' using errcode = '42501';
  end if;
$a$,
$n$  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Sin sesión no se cambia un gasto.' using errcode = '42501';
  end if;

  -- Tarea 20: con el mes del gasto cerrado, el gasto no se toca y el papel entra por su cuenta en el mes abierto.
  if retail.fn_primer_mes_cerrado(v_g.ubicacion_id, v_g.fecha) is not null then
    insert into retail.gasto_papeles_tardios (gasto_id, proveedor_id, tipo, serie, numero, fecha_emision, fecha_contable, subtotal, igv, total, registrado_por)
    values (p_gasto_id, v_prov, v_tipo, v_serie, v_numero, v_fecha, retail.fn_hoy_lima(), v_g.monto_total - v_igv, v_igv, v_g.monto_total, v_actor);
    v_texto := case v_tipo when 'factura' then 'Factura' when 'boleta' then 'Boleta' else 'Recibo por honorarios' end || ' ' || v_serie || '-' || v_numero;
    insert into retail.gasto_correcciones (lote, gasto_id, campo, antes, despues, corregida_por)
    values (gen_random_uuid(), p_gasto_id, 'comprobante', 'Sin comprobante', v_texto || ' (entra en ' || retail.fn_mes_nombre(retail.fn_hoy_lima()) || ': el mes del gasto está cerrado)', v_actor);
    return jsonb_build_object('ya_estaba', false, 'compra_id', null, 'igv', v_igv, 'entra_en', retail.fn_hoy_lima());
  end if;

  -- El mes del gasto y de su pago, abierto, con un mensaje que dice para qué. La fecha del papel ya no: si su mes está cerrado, la compra entra en el abierto.
  perform retail.fn_exigir_mes_abierto(v_g.ubicacion_id, v_g.fecha, null, 'agregarle su comprobante');
$n$, 1);

-- Un comprobante que ya está como papel tardío no se registra otra vez como compra. Va en el disparador: los cuatro caminos de registro pasan por ahí.
select pg_temp.reemplazar('retail.fn_compras_fecha_contable()',
$a$begin
  if tg_op = 'UPDATE' and new.fecha_emision is not distinct from old.fecha_emision then$a$,
$n$begin
  if tg_op = 'INSERT' and exists (select 1 from retail.gasto_papeles_tardios t where t.proveedor_id = new.proveedor_id and t.serie = new.serie and t.numero = new.numero and t.anulado_en is null) then
    raise exception 'Ese comprobante (% %-%) ya está registrado, en un gasto de un mes cerrado.', new.tipo, new.serie, new.numero using errcode = '23505';
  end if;
  if tg_op = 'UPDATE' and new.fecha_emision is not distinct from old.fecha_emision then$n$, 1);

-- ── 2. El diario ─────────────────────────────────────────────────────────────
select pg_temp.reemplazar('retail.fn_asientos(date,date,uuid)',
$a$                else 'Pagado (' || gg.medio_pago || ')' end
      from gg
  ),$a$,
$n$                else 'Pagado (' || gg.medio_pago || ')' end
      from gg
    union all
    -- Tarea 20: el comprobante de un gasto de un mes cerrado. El IGV que ese mes llevó como costo se descuenta y baja el gasto en el mes en que se anota.
    select t.fecha_contable, g.ubicacion_id, 'gasto_papel:' || t.id, 'gasto_papel', '4011', t.igv, 0, 'gastos', g.id, 'IGV del comprobante que llegó con el mes cerrado'
      from retail.gasto_papeles_tardios t join retail.gastos g on g.id = t.gasto_id
     where t.anulado_en is null and t.igv > 0 and g.estado = 'vigente' and t.fecha_contable between p_desde and p_hasta and (v_todo or g.ubicacion_id = any (v_ubics))
    union all
    select t.fecha_contable, g.ubicacion_id, 'gasto_papel:' || t.id, 'gasto_papel', k.cuenta_pcge::text, 0, t.igv, 'gastos', g.id, 'El IGV ya no es costo: ' || t.serie || '-' || t.numero
      from retail.gasto_papeles_tardios t join retail.gastos g on g.id = t.gasto_id join retail.categorias_gasto k on k.codigo = g.categoria
     where t.anulado_en is null and t.igv > 0 and g.estado = 'vigente' and t.fecha_contable between p_desde and p_hasta and (v_todo or g.ubicacion_id = any (v_ubics))
  ),$n$, 1);

-- ── 3. El IGV y el registro ──────────────────────────────────────────────────
-- Con origen 'compra' y naturaleza 'gasto': cuenta como el comprobante de un gasto, igual que si hubiera llegado a tiempo, y el IGV del mes lo suma sin tocar
-- `fn_impuestos_igv_meses`. Va justo después del Taller: así no toca los textos que dejaron migraciones anteriores.
select pg_temp.reemplazar('retail.fn_impuestos_compras(date,date)',
$a$     and coalesce(p.fecha_contable, p.fecha_emision) between p_desde and p_hasta
  union all
  -- ADR-0362 fase 5b, actividad 3$a$,
$n$     and coalesce(p.fecha_contable, p.fecha_emision) between p_desde and p_hasta
  union all
  -- Tarea 20: el comprobante de un gasto de un mes cerrado, en el mes en que se anota.
  select 'compra', t.id, 'gasto', t.fecha_contable, t.tipo, t.subtotal, t.igv, t.total, t.tipo = 'factura' and t.igv > 0
    from retail.gasto_papeles_tardios t join retail.gastos g on g.id = t.gasto_id
   where t.anulado_en is null and g.estado = 'vigente' and t.fecha_contable between p_desde and p_hasta
  union all
  -- ADR-0362 fase 5b, actividad 3$n$, 1);
select pg_temp.reemplazar('retail.fn_igv_credito_fiscal(date)',
$a$  select m.ini, c.v, pr.v, nc.v, c.v + pr.v - nc.v from m, c, pr, nc where retail.fn_es_lider();$a$,
$n$  select m.ini, c.v + gt.v, pr.v, nc.v, c.v + gt.v + pr.v - nc.v
    from m, c, pr, nc, lateral (select coalesce(sum(t.igv), 0) as v from retail.gasto_papeles_tardios t where t.anulado_en is null and t.fecha_contable >= m.ini and t.fecha_contable < m.ini + interval '1 month') gt
   where retail.fn_es_lider();$n$, 1);
select pg_temp.reemplazar('retail.fn_impuestos_registro_compras(date)',
$a$       and coalesce(p.fecha_contable, p.fecha_emision) between v_ini and v_fin
    union all
    -- ADR-0362 fase 5b, actividad 3$a$,
$n$       and coalesce(p.fecha_contable, p.fecha_emision) between v_ini and v_fin
    union all
    -- Tarea 20: el comprobante de un gasto de un mes cerrado: en el mes en que se anota, con su fecha real.
    select 'gasto_tardio', 'gasto', t.fecha_emision, null, t.tipo, t.serie, t.numero, pr.ruc, pr.nombre,
           case when t.tipo = 'factura' then t.subtotal else 0 end, t.igv,
           t.total - case when t.tipo = 'factura' then t.subtotal + t.igv else 0 end,
           t.total, t.tipo = 'factura' and t.igv > 0,
           null, null, null, null, coalesce(u.nombre, 'De la empresa')
      from retail.gasto_papeles_tardios t
      join retail.gastos g on g.id = t.gasto_id
      join retail.proveedores pr on pr.id = t.proveedor_id
      left join retail.ubicaciones u on u.id = g.ubicacion_id
     where t.anulado_en is null and g.estado = 'vigente' and t.fecha_contable between v_ini and v_fin
    union all
    -- ADR-0362 fase 5b, actividad 3$n$, 1);

-- ── 4. El gasto ya no pide su comprobante ────────────────────────────────────
select pg_temp.reemplazar('retail.fn_sustento_costos(date,date)',
$a$else coalesce(gv.papel, 'sin_comprobante') end,$a$,
$n$else coalesce(gv.papel, (select t.tipo from retail.gasto_papeles_tardios t where t.gasto_id = g.id and t.anulado_en is null), 'sin_comprobante') end,$n$, 1);
-- La lista de gastos lo lee aparte, como «no emite comprobante» (`fn_gastos_no_emiten`): cambiar `fn_gastos_lista` tocaría el texto que dejó 20261014164000.
create or replace function retail.fn_gastos_papeles_tardios(p_desde date, p_hasta date, p_ubicacion_id uuid default null, p_solo_empresa boolean default false)
returns table (gasto_id uuid, tipo text, documento text, fecha_contable date)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $f$
#variable_conflict use_column
declare v_ubics uuid[] := retail.fn_gastos_ubicaciones(); v_lider boolean := retail.fn_ve_finanzas_de_todo();
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    return;
  end if;
  return query
  select t.gasto_id, t.tipo, t.serie || '-' || t.numero, t.fecha_contable
    from retail.gasto_papeles_tardios t
    join retail.gastos g on g.id = t.gasto_id
   where t.anulado_en is null and g.fecha between p_desde and p_hasta
     and ((g.ubicacion_id is null and v_lider) or g.ubicacion_id = any (v_ubics))
     and (p_ubicacion_id is null or g.ubicacion_id = p_ubicacion_id)
     and (not coalesce(p_solo_empresa, false) or g.ubicacion_id is null);
end $f$;
revoke all on function retail.fn_gastos_papeles_tardios(date, date, uuid, boolean) from public, anon;
grant execute on function retail.fn_gastos_papeles_tardios(date, date, uuid, boolean) to authenticated;

reset lock_timeout;
