-- ============================================================================
-- 20261106005000 — La prenda con factura guarda su costo sin IGV (tarea 9 de «Las 36 de Finanzas»; ADR-0417 d.2)
--
-- EL PROBLEMA PRIMERO. El costo de la orden lleva IGV y así entraba a `variantes.costo`. Factura de S/ 118: la venta sacaba 118 de costo, la 4011 descontaba 18 de crédito, así que el
-- IGV contaba dos veces, el margen salía bajo y la 201 quedaba −18 sin causa. ADR-0417 d.2 pide todo costo sin IGV. Hoy hay 0 compras de mercadería vigentes y
-- vienen 2 papeles factura (S/ 1,320): por eso va antes de que pasen.
--
-- LA DECISIÓN. Una regla única en `fn_recepcion_entrar`, por donde pasan los dos cierres (el del envío y la salida anticipada de un modelo): con papel factura o comprobante
-- factura, costo ÷ (1 + tasa de IGV); con boleta, nota de venta o sin papel, tal cual, porque ese IGV no se recupera y es parte del costo. Quien recibe sigue escribiendo el costo como
-- está en el papel. Lo que ya entró no se toca aquí: si hace falta, se corrige con `costo_correcciones`, con rastro (ADR-0417).
--
-- SUPUESTOS PARA EL CONTADOR: que no se corrige octubre antes de firmar (hoy no hay qué corregir), y que un papel factura siempre da crédito.
-- NO CAMBIA: lo que un proveedor debe por un faltante sigue a lo pagado, con IGV (`despacho_diferencias`).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución. Sin tablas ni políticas. Reescribe `fn_recepcion_entrar` con un ancla; si no aparece exactamente una vez, aborta. Pegarla dos veces no hace
-- nada. Verificado: `pnpm pruebas:costo-sin-igv`.
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

create or replace function retail.fn_costo_de_entrada(p_costo numeric, p_orden_compra_item_id uuid)
returns numeric
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select case
    when p_costo is null or p_orden_compra_item_id is null then p_costo
    when exists (select 1 from retail.orden_compra_items i
                   join retail.ordenes_compra o on o.id = i.orden_compra_id
                   join retail.compra_papeles p on p.id = o.papel_id
                  where i.id = p_orden_compra_item_id and p.tipo = 'factura' and p.estado <> 'anulado')
      or exists (select 1 from retail.compra_items ci join retail.compras c on c.id = ci.compra_id
                  where ci.orden_compra_item_id = p_orden_compra_item_id and c.estado = 'vigente' and c.tipo = 'factura')
    then round(p_costo / (1 + retail.fn_tasa_igv(retail.fn_hoy_lima())), 2)
    else p_costo
  end;
$$;
comment on function retail.fn_costo_de_entrada(numeric, uuid) is
  'Tarea 9: el costo con que entra una prenda. Con factura, sin IGV: se recupera como crédito. Con boleta o sin papel, tal cual. Interna de la recepción.';
revoke all on function retail.fn_costo_de_entrada(numeric, uuid) from public, anon, authenticated;

select pg_temp.reemplazar('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)',
$a$      v_costo := coalesce((v_v ->> 'costo')::numeric, (v_u ->> 'costo')::numeric);$a$,
$n$      v_costo := retail.fn_costo_de_entrada(coalesce((v_v ->> 'costo')::numeric, (v_u ->> 'costo')::numeric), (v_u ->> 'orden_compra_item_id')::uuid);$n$, 1);

reset lock_timeout;
