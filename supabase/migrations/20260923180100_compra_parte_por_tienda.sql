-- ============================================================================
-- 20260923180100_compra_parte_por_tienda.sql — CAYLA V2 · ADR-0179 (F2: partir el dinero por tienda)
--
-- REEMPLAZA, sin cambios de fondo, a 20260922150000_compra_parte_por_tienda.sql (nunca pegada en producción; chocaba en número
-- con 20260922150000_venta_asesora_…). Se renumeró para ir después de ADR-0161.
--
-- PROBLEMA. Una factura puede traer mercadería para varias tiendas (ADR-0139: `compra_item_destinos`), pero el dinero
-- de la factura es uno solo: `compras.subtotal / igv / total`. Para que cada tienda pueda ver y pagar SU parte (D2, D3)
-- hace falta saber cuánto le toca a cada una. Y ese número no se puede guardar: una segunda tabla de montos por tienda
-- permitiría un estado imposible (que la suma de las partes no dé el total de la factura) — principio 2.
--
-- QUÉ HACE. Una vista, `compra_parte_por_tienda`, calculada desde lo que ya es verdad (`compra_items` ×
-- `compra_item_destinos` × `compras`): una fila por (factura, tienda) con sus unidades, subtotal, IGV y total.
-- No guarda nada. Es `security_invoker`: cada quien la lee con sus propios permisos (el líder, todas; una cuenta con módulo de
-- Compras, las facturas que gestiona su tienda). La parte de una tienda que NO gestiona la factura no se lee de aquí sino de
-- `fn_mis_partes_de_compras` (20260923180400), que devuelve solo esa fila.
--
-- QUÉ SE REPARTE: LA CABECERA, NO LAS LÍNEAS. `compras.subtotal/igv/total` es lo que se DEBE. Las líneas no siempre suman
-- la cabecera: `registrar_compra` calcula el subtotal con el costo tal como llegó (33.333), pero `compra_items.costo_unitario`
-- guarda solo 2 decimales (33.33), así que con costos de 3 decimales —el caso del costo sin IGV— la suma de las líneas puede
-- diferir de la cabecera por centavos (7 × 33.333 + 11 × 99.99 + 3 × 1.005: líneas 1,336.23; cabecera 1,336.24). Repartir las
-- líneas dejaría a las tiendas debiendo un centavo menos que la factura. Por eso se reparte la cabecera y las líneas solo
-- dicen EN QUÉ PROPORCIÓN.
--
-- CÓMO SE REPARTE (y por qué al centavo).
--   · Subtotal: la cabecera se reparte en proporción a lo que cada tienda pesa en las líneas (subtotal de la línea ×
--     unidades de la tienda ÷ unidades de la línea, sumado). Si todas las líneas valen 0, en proporción a las unidades.
--   · IGV: `compras.igv` es un MONTO guardado (puede venir del papel, con tolerancia sobre el cálculo), no un porcentaje;
--     se reparte en proporción al subtotal de cada tienda (a las unidades si el subtotal de la factura es 0).
--   · Redondeo: método del MAYOR RESTO. Cada tienda recibe primero los centavos enteros que le corresponden; los que
--     sobran (siempre menos de uno por tienda) van de uno en uno a quien tiene el mayor residuo; el empate se rompe por
--     `ubicacion_id` para que el resultado no cambie entre consultas. (El ADR decía «el resto a la tienda con la parte
--     mayor»: es lo mismo con 2 tiendas y más justo con 3 o más.)
--   · INVARIANTE: para toda factura con al menos un destino, la suma de `subtotal`, de `igv` y de `total` de sus partes es
--     EXACTAMENTE la de la cabecera (`compras_total_cuadra` garantiza subtotal + igv = total). No depende de las líneas.
--     Para verlo en cualquier base (debe devolver 0 filas):
--         select c.id, c.total, coalesce(sum(p.total), 0) as suma_de_partes
--           from retail.compras c join retail.compra_parte_por_tienda p on p.compra_id = c.id
--          group by c.id, c.total having sum(p.total) <> c.total;
--
-- QUÉ NO HACE. No cambia ninguna tabla ni función ni política. No parte pagos ni saldos (20260923180300). Una factura sin destinos (ninguna debería haber tras ADR-0139) no tiene filas aquí. No corrige el descuadre de
-- centavos entre líneas y cabecera de `registrar_compra`: queda anotado en el BACKLOG.
--
-- VOLVER ATRÁS: `drop view retail.compra_parte_por_tienda`; nada más depende de ella todavía.
--
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path`; no hace falta el prefijo `retail.`. Re-pegable.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace view retail.compra_parte_por_tienda with (security_invoker = true) as
with pesos as (
  -- Cuánto pesa cada tienda en la factura: por línea, lo que le toca del subtotal de la línea, sin redondear.
  select i.compra_id, d.ubicacion_id,
         sum(d.cantidad)::integer as unidades,
         sum(i.subtotal * d.cantidad / i.cantidad) as peso
  from retail.compra_items i
  join retail.compra_item_destinos d on d.compra_item_id = i.id
  group by i.compra_id, d.ubicacion_id
),
con_cabecera as (
  select p.*, c.subtotal as subtotal_cab, c.igv as igv_cab,
         sum(p.peso) over (partition by p.compra_id) as peso_compra,
         sum(p.unidades) over (partition by p.compra_id) as unidades_compra
  from pesos p
  join retail.compras c on c.id = p.compra_id
),
sub_exacto as (
  -- Lo que le toca del subtotal de la cabecera, exacto (se multiplica antes de dividir).
  select b.*,
         case when b.peso_compra > 0 then b.subtotal_cab * b.peso / b.peso_compra
              else b.subtotal_cab * b.unidades / b.unidades_compra end as exacto
  from con_cabecera b
),
sub_enteros as (
  -- En centavos: la parte entera de cada tienda y el residuo que quedó.
  select e.*, floor(e.exacto * 100) as centavos, e.exacto * 100 - floor(e.exacto * 100) as residuo
  from sub_exacto e
),
sub_puestos as (
  -- Los centavos que faltan para llegar al subtotal de la cabecera van a quien tiene el mayor residuo (empate: por id).
  select e.*,
         round(e.subtotal_cab * 100) - sum(e.centavos) over (partition by e.compra_id) as sobran,
         row_number() over (partition by e.compra_id order by e.residuo desc, e.ubicacion_id) as puesto
  from sub_enteros e
),
sub_final as (
  select s.compra_id, s.ubicacion_id, s.unidades, s.unidades_compra, s.subtotal_cab, s.igv_cab,
         (s.centavos + case when s.puesto <= s.sobran then 1 else 0 end) / 100 as subtotal
  from sub_puestos s
),
igv_exacto as (
  -- El IGV de la cabecera en proporción al subtotal de cada tienda (a las unidades si el subtotal de la factura es 0).
  select f.*,
         case when f.subtotal_cab > 0 then f.igv_cab * f.subtotal / f.subtotal_cab
              else f.igv_cab * f.unidades / f.unidades_compra end as exacto
  from sub_final f
),
igv_enteros as (
  select g.*, floor(g.exacto * 100) as centavos, g.exacto * 100 - floor(g.exacto * 100) as residuo
  from igv_exacto g
),
igv_puestos as (
  select g.*,
         round(g.igv_cab * 100) - sum(g.centavos) over (partition by g.compra_id) as sobran,
         row_number() over (partition by g.compra_id order by g.residuo desc, g.ubicacion_id) as puesto
  from igv_enteros g
)
select q.compra_id,
       q.ubicacion_id,
       q.unidades,
       q.subtotal::numeric(12, 2) as subtotal,
       ((q.centavos + case when q.puesto <= q.sobran then 1 else 0 end) / 100)::numeric(12, 2) as igv,
       (q.subtotal + (q.centavos + case when q.puesto <= q.sobran then 1 else 0 end) / 100)::numeric(12, 2) as total
from igv_puestos q;

comment on view retail.compra_parte_por_tienda is
  'ADR-0179 (F2). Cuánto de una factura le toca a cada tienda (una fila por factura y tienda): unidades, subtotal, IGV y total. Se CALCULA desde compra_items × compra_item_destinos × compras y no se guarda. Reparte la CABECERA (lo que se debe), no las líneas, con el método del mayor resto: la suma de los subtotal, igv y total de las partes es siempre la de compras, al centavo. security_invoker: cada quien la lee con sus permisos.';

revoke all on retail.compra_parte_por_tienda from public, anon;
grant select on retail.compra_parte_por_tienda to authenticated;
