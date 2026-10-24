-- Mis compras: el historial por ronda (ADR-0480; Felipe 2026-10-23, revisando Mis compras en el celular).
--
-- Bajo «Ver rondas anteriores», Mis compras mostraba todo suelto (cada compra, cada gasto, cada plata). Felipe pidió que ahí se vea solo la
-- plata que anotó, si devolvió lo que le quedó, y las rondas; y que dentro de cada ronda esté su detalle (las compras y «Gasté en otra
-- cosa»). Para agrupar y decir cómo cerró CADA ronda, la lectura tiene que traer las rondas cerradas con su cierre: hasta hoy solo traía
-- la última (`ultima_cerrada`).
--
-- Lo único que cambia: `retail.fn_ronda_compras_de` suma la llave `cerradas` (las 30 últimas, con su decisión, monto y si Compras ya
-- lo recibió). `abierta` y `ultima_cerrada` quedan igual, letra por letra: se partió de su definición en producción
-- (md5 4074c223f1fdd46aa725713be4948203 el 2026-10-23, la misma de 20261023183000). Solo lectura: no escribe nada, no toca permisos.
-- La web vieja ignora la llave nueva; la nueva, sin ella (la base antes de esta migración), muestra las rondas sin su cierre.
--
-- Se pega en producción tal cual (sin políticas ni `alter`: no toma candados de auth/storage). Idempotente.

set lock_timeout = '3s';

create or replace function retail.fn_ronda_compras_de(p_persona uuid)
returns jsonb
language sql stable security definer set search_path = retail, public, extensions as $$
  select jsonb_build_object(
    'abierta', (
      select jsonb_build_object(
               'id', r.id, 'numero', r.numero, 'texto', retail.fn_ronda_compras_numero_texto(r.numero), 'abierta_en', r.abierta_en,
               'compras', (select count(*) from retail.compra_papeles c where c.ronda_id = r.id and c.estado <> 'anulado'),
               'compraste', coalesce((select sum(c.pagado) from retail.compra_papeles c where c.ronda_id = r.id and c.estado <> 'anulado'), 0),
               'gastaste', coalesce((select sum(g.monto) from retail.compra_gastos g where g.ronda_id = r.id and g.estado <> 'anulado'), 0),
               'dieron', coalesce((select sum(a.monto) from retail.fondo_plata_anotada a where a.ronda_id = r.id), 0),
               'prendas', coalesce((select sum(i.cantidad) from retail.compra_papeles c join retail.ordenes_compra o on o.papel_id = c.id
                                     join retail.orden_compra_items i on i.orden_compra_id = o.id
                                    where c.ronda_id = r.id and c.estado <> 'anulado'), 0))
        from retail.compra_rondas r where r.persona_id = p_persona and r.cerrada_en is null),
    'ultima_cerrada', (
      select jsonb_build_object(
               'texto', retail.fn_ronda_compras_numero_texto(r.numero), 'cerrada_en', r.cerrada_en,
               'decision', k.decision, 'monto', k.monto, 'resuelto', k.resuelto_en is not null)
        from retail.compra_rondas r join retail.compra_cierres k on k.id = r.cierre_id
       where r.persona_id = p_persona and r.cerrada_en is not null
       order by r.cerrada_en desc limit 1),
    -- Las rondas cerradas, de la más nueva a la más vieja (20261023225000): Mis compras agrupa en cada una lo que compró y gastó, y dice
    -- aparte si devolvió lo que le quedó. Las 30 últimas, como las listas de compras, gastos y plata de `fn_mi_plata_compras`.
    'cerradas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'texto', retail.fn_ronda_compras_numero_texto(x.numero), 'abierta_en', x.abierta_en, 'cerrada_en', x.cerrada_en,
               'decision', x.decision, 'monto', x.monto, 'resuelto', x.resuelto_en is not null)
             order by x.cerrada_en desc)
        from (select r.id, r.numero, r.abierta_en, r.cerrada_en, k.decision, k.monto, k.resuelto_en
                from retail.compra_rondas r join retail.compra_cierres k on k.id = r.cierre_id
               where r.persona_id = p_persona and r.cerrada_en is not null
               order by r.cerrada_en desc limit 30) x), '[]'::jsonb));
$$;
revoke all on function retail.fn_ronda_compras_de(uuid) from public, anon;
