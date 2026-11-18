-- ============================================================================
-- 20261114064000 — Finanzas ▸ Campañas cuenta lo que regalaron las ofertas de grupo y los montos (ADR-0655, auditoría final)
--
-- EL PROBLEMA. `fn_campanas_reporte` dice cuánto se dejó de cobrar por cada campaña sumando las líneas de venta con
--   `descuento_etiqueta_id` (el descuento de siempre y el «% menos»). Una línea de un 3x2, de «N por S/ X», de «la N.ª al X %» o de un
--   monto no lleva `descuento_etiqueta_id`: su parte va en `descuento_grupo_unitario`, con su oferta en `oferta_grupo_id` (su línea no tiene
--   motivo «campaña», 20261114011000). Resultado: una campaña de puro 3x2 salía en Finanzas con «Descuento S/ 0», aunque regaló prendas.
--
-- LO QUE HACE. Un reemplazo anclado del bloque `dsc` de `fn_campanas_reporte`: suma, además, `descuento_grupo_unitario` × cantidad de cada
--   línea, a la campaña de su oferta (`campana_reglas.etiqueta_id`). Lo de antes resta su parte de grupo, por si una línea llevara las dos
--   (la regla «una prenda, una oferta por tienda y por día» no lo deja, pero así no se cuenta dos veces). Sin IGV, como el resto del informe.
--
-- QUÉ NO HACE. No toca lo vendido, lo normal ni el margen; no cambia ningún cobro. El resto de la función (su puerta, ADR-0195; su alcance,
--   20260928220000 y 20261030235000) queda igual: esos reemplazos anclan en `v_lider`, no en `dsc`.
--
-- SE ROMPE SI: alguien cambia el bloque `dsc` antes de pegar esto: el ancla no aparece y se detiene sin aplicar nada.
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s; solo funciones.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:caja-ofertas-de-grupo` («Finanzas ▸ Campañas»).
-- ============================================================================

set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_dsc_campanas(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
  v_n integer;
begin
  if position(p_nuevo in v_def) > 0 then
    return; -- ya aplicado
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). No se aplicó nada.', p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_dsc_campanas(
  'retail.fn_campanas_reporte(uuid)',
  $v$  dsc as (
    select vi.descuento_etiqueta_id as cid, sum(vi.descuento_unitario * vi.cantidad / (1 + retail.fn_tasa_igv((v.created_at at time zone 'America/Lima')::date))) as monto
      from retail.ventas v join retail.venta_items vi on vi.venta_id = v.id
     where v.estado = 'completada' and not coalesce(v.es_prueba, false) and v.created_at >= v_ini and v.created_at < v_fin
       and vi.descuento_etiqueta_id is not null and v.ubicacion_id in (select t.id from tiendas t)
     group by 1
  ),
$v$,
  $n$  dsc as (
    -- ADR-0655: también lo que regalaron sus ofertas de grupo y sus montos (`descuento_grupo_unitario`, de la oferta `oferta_grupo_id`),
    -- que no llevan `descuento_etiqueta_id`.
    select x.cid, sum(x.monto) as monto
      from (
        select vi.descuento_etiqueta_id as cid,
               (vi.descuento_unitario - vi.descuento_grupo_unitario) * vi.cantidad / (1 + retail.fn_tasa_igv((v.created_at at time zone 'America/Lima')::date)) as monto
          from retail.ventas v join retail.venta_items vi on vi.venta_id = v.id
         where v.estado = 'completada' and not coalesce(v.es_prueba, false) and v.created_at >= v_ini and v.created_at < v_fin
           and vi.descuento_etiqueta_id is not null and v.ubicacion_id in (select t.id from tiendas t)
        union all
        select r.etiqueta_id,
               vi.descuento_grupo_unitario * vi.cantidad / (1 + retail.fn_tasa_igv((v.created_at at time zone 'America/Lima')::date))
          from retail.ventas v join retail.venta_items vi on vi.venta_id = v.id
          join retail.campana_reglas r on r.id = vi.oferta_grupo_id
         where v.estado = 'completada' and not coalesce(v.es_prueba, false) and v.created_at >= v_ini and v.created_at < v_fin
           and vi.descuento_grupo_unitario > 0 and v.ubicacion_id in (select t.id from tiendas t)
      ) x
     group by 1
  ),
$n$
);
