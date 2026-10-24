-- Proveedores: el TIPO como campo propio — «mercaderia» (ropa y lo que se revende) o «servicios» (Entel, luz, agua, alquiler).
--
-- POR QUÉ. Hasta hoy lo único que separaba a Entel de un fabricante de polos era una costumbre: el rubro de texto libre «Gastos»
-- (ADR-0452, `esSoloDeGastos`). El módulo vive dentro de Compras y todo en él (ficha, indicadores, análisis) asume ropa. Felipe
-- 2026-10-24: «el sistema tiene que saber diferenciar los distintos tipos de proveedores».
--
-- QUÉ HACE (aditivo, «expandir»; ninguna función viva cambia de firma):
--   1. `proveedores.tipo` ('mercaderia' | 'servicios'), por defecto 'mercaderia' = lo que todo el directorio viejo ya es.
--   2. Siembra: quien hoy tiene SOLO el rubro «Gastos» pasa a 'servicios' (17 en producción al 2026-10-24). Los que no tienen rubro
--      se quedan en 'mercaderia' —como hoy los trata el sistema— y Felipe decide cuáles son de servicios desde la pantalla.
--   3. Un disparador mantiene la coherencia con el camino viejo: si alguien (el «¿No está? Súmalo» de Gastos, una función que todavía
--      no sabe de tipos) deja a un proveedor con solo el rubro «Gastos», nace/queda como 'servicios'. Nunca lo baja: un servicio que
--      además tiene rubros de ropa lo decide quien edita el tipo, no el disparador.
--
--   4. `cambiar_tipo_proveedor(id, tipo)`: lo que llama la pantalla para fijar el tipo (permiso: el módulo Proveedores).
--   5. `fn_proveedor_servicio_resumen(id)`: lo que se le paga a un proveedor de servicios (comprobantes de gasto), para su ficha.
--
-- QUÉ NO HACE. No toca `registrar_proveedor`, `actualizar_proveedor` ni `fn_proveedores`: la web lee el tipo de la tabla y lo cambia con
-- (4.). No borra nada ni mueve montos.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): una sola parte, sin políticas (ADR-0195), `lock_timeout`, re-pegable.
-- La base puede ir antes o después de la web: la web de antes no lee la columna.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.proveedores add column if not exists tipo text not null default 'mercaderia';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.proveedores'::regclass and conname = 'proveedores_tipo_valido') then
    alter table retail.proveedores
      add constraint proveedores_tipo_valido check (tipo in ('mercaderia', 'servicios'));
  end if;
end $$;

-- Proveedores no tiene `select` de tabla entera (datos bancarios solo para quien paga, 20261013161000): cada columna legible se concede aparte.
grant select (tipo) on retail.proveedores to authenticated;

comment on column retail.proveedores.tipo is
  'Qué clase de proveedor es: ''mercaderia'' (ropa y lo que se revende: aparece al comprar y recibir) o ''servicios'' (telefonía, luz, agua, alquiler: se les paga, no se les compra mercadería). Antes solo lo decía el rubro «Gastos».';

-- Coherencia con el camino viejo: solo-«Gastos» ⇒ servicios. Solo sube a 'servicios', nunca baja.
create or replace function retail.fn_proveedor_tipo_desde_rubros()
returns trigger
language plpgsql
set search_path to 'retail', 'public', 'extensions'
as $function$
begin
  if cardinality(new.rubros) > 0
     and not exists (select 1 from unnest(new.rubros) r where lower(btrim(r)) <> 'gastos') then
    new.tipo := 'servicios';
  end if;
  return new;
end;
$function$;

create or replace trigger proveedores_tipo_desde_rubros
  before insert or update of rubros on retail.proveedores
  for each row execute function retail.fn_proveedor_tipo_desde_rubros();

-- Siembra: lo que hoy es solo «Gastos».
update retail.proveedores p
   set tipo = 'servicios'
 where p.tipo <> 'servicios'
   and cardinality(p.rubros) > 0
   and not exists (select 1 from unnest(p.rubros) r where lower(btrim(r)) <> 'gastos');

-- Cambiar el tipo de UN proveedor (la ficha y el alta lo llaman). Aparte de `registrar_proveedor`/`actualizar_proveedor` a propósito:
-- esas dos son lo que el resto de Compras ya usa, y ampliar su firma obligaría a reemplazarlas enteras. Si el alta falla a medias, el
-- proveedor queda como 'mercaderia' —el valor de fábrica—, que es un estado válido. Mismo permiso que desactivar: el módulo Proveedores.
create or replace function retail.cambiar_tipo_proveedor(p_proveedor_id uuid, p_tipo text)
returns void
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
begin
  if not retail.fn_puede_gestionar_proveedores() then
    raise exception 'Cambiar el tipo de un proveedor necesita el módulo Proveedores en tu rol.' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('mercaderia', 'servicios') then
    raise exception 'El tipo de proveedor es «mercadería» o «servicios».';
  end if;
  update retail.proveedores set tipo = p_tipo where id = p_proveedor_id;
  if not found then
    raise exception 'Ese proveedor ya no existe. Recarga la pantalla.';
  end if;
end;
$function$;
revoke all on function retail.cambiar_tipo_proveedor(uuid, text) from public, anon;
grant execute on function retail.cambiar_tipo_proveedor(uuid, text) to authenticated;
comment on function retail.cambiar_tipo_proveedor(uuid, text) is
  'Pone el tipo de un proveedor (mercaderia | servicios). Necesita el módulo Proveedores (fn_puede_gestionar_proveedores). Solo cambia esa columna.';

-- La ficha de un proveedor de SERVICIOS: lo que se le paga. Las lecturas de mercadería (`fn_proveedor_metricas_compras`) cuentan solo
-- `naturaleza = 'mercaderia'`; la factura de la luz o de Entel es 'gasto'. Una sola fila en jsonb: totales, promedio mensual, saldo, los
-- 12 meses y los últimos comprobantes. Solo lectura, con la llave de la plata de Proveedores.
create or replace function retail.fn_proveedor_servicio_resumen(p_proveedor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_res jsonb;
begin
  if not retail.fn_ve_plata_de_proveedores() then
    raise exception 'Lo que se le paga a un proveedor necesita Proveedores, Facturas de compra, Por pagar o Notas de crédito en tu rol.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'comprobantes', count(*) filter (where c.estado <> 'anulada'),
    'total', coalesce(sum(c.total) filter (where c.estado <> 'anulada'), 0),
    'total_12m', coalesce(sum(c.total) filter (where c.estado <> 'anulada' and c.fecha_emision > v_hoy - 365), 0),
    'meses_con_pago_12m', count(distinct date_trunc('month', c.fecha_emision)) filter (where c.estado <> 'anulada' and c.fecha_emision > v_hoy - 365),
    'saldo', coalesce(sum(c.saldo) filter (where c.estado = 'vigente' and c.saldo > 0), 0),
    'vencido', coalesce(sum(c.saldo) filter (where c.estado = 'vigente' and c.saldo > 0 and c.fecha_vencimiento < v_hoy), 0),
    'ultima_fecha', max(c.fecha_emision) filter (where c.estado <> 'anulada'),
    'meses', (
      select coalesce(jsonb_agg(jsonb_build_object('mes', to_char(m.mes, 'YYYY-MM'), 'monto', coalesce(x.monto, 0)) order by m.mes), '[]'::jsonb)
        from generate_series(date_trunc('month', v_hoy) - interval '11 months', date_trunc('month', v_hoy), interval '1 month') as m(mes)
        left join (
          select date_trunc('month', c2.fecha_emision) as mes, sum(c2.total) as monto
            from retail.compras c2
           where c2.proveedor_id = p_proveedor_id and c2.naturaleza = 'gasto' and c2.estado <> 'anulada'
           group by 1
        ) x on x.mes = m.mes
    ),
    'ultimos', (
      select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'documento', u.documento, 'fecha', u.fecha_emision, 'total', u.total, 'saldo', u.saldo, 'estado', u.estado) order by u.fecha_emision desc, u.created_at desc), '[]'::jsonb)
        from (
          select c3.id, c3.documento, c3.fecha_emision, c3.total, c3.saldo, c3.estado, c3.created_at
            from retail.compras c3
           where c3.proveedor_id = p_proveedor_id and c3.naturaleza = 'gasto' and c3.estado <> 'anulada'
           order by c3.fecha_emision desc, c3.created_at desc
           limit 6
        ) u
    )
  ) into v_res
  from retail.compras c
  where c.proveedor_id = p_proveedor_id and c.naturaleza = 'gasto';
  return v_res;
end;
$function$;
revoke all on function retail.fn_proveedor_servicio_resumen(uuid) from public, anon;
grant execute on function retail.fn_proveedor_servicio_resumen(uuid) to authenticated;
comment on function retail.fn_proveedor_servicio_resumen(uuid) is
  'Ficha de un proveedor de servicios: comprobantes de gasto (naturaleza ''gasto'') totales, de 12 meses, promedio, saldo, vencido, los 12 meses y los últimos 6. Solo lectura; llave fn_ve_plata_de_proveedores().';

select 'QUEDÓ BIEN: ' || count(*) filter (where tipo = 'servicios') || ' de servicios y '
       || count(*) filter (where tipo = 'mercaderia') || ' de mercadería' as resultado
  from retail.proveedores;
