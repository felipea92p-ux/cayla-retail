-- ============================================================================
-- 20261028211000 — «Ver el valor a costo» de Existencias: cuánto vale lo que hay en cada sede (ADR-0557)
--
-- EL PROBLEMA PRIMERO
--   Felipe pregunta «¿cuánto vale mi inventario?» y la única respuesta está en Finanzas ▸ Reportes ▸ Balance (la fila
--   «Mercadería»), que se calcula con `fn_bal_stock` y NO lo puede leer quien trabaja en Existencias: la puerta del Balance es
--   Finanzas, y calcularlo entero (caja, activos, estado de resultados) en cada visita a Existencias sería caro. Además, esa
--   cifra cuenta una prenda sin costo como S/ 0 SIN avisar, suma las prendas dañadas al costo completo y cuenta las
--   unidades de CLAURE como mercadería de CAYLA.
--
-- QUÉ PROMETE (el contrato, en tres líneas)
--   · Una fila por sede (todas, si quien llama es líder; solo la suya, si pasa la puerta del dinero de Compras sin ser líder),
--     con lo que hay de CAYLA a costo, lo que no tiene costo, lo dañado aparte y lo de CLAURE aparte.
--   · La puerta está AQUÍ, en la base: sin permiso devuelve CERO filas (nunca una fila con 0, que parecería «no vale nada»).
--     La regla de quién ve el costo sigue viviendo solo en `fn_puede_ver_dinero_de_compras()` (ADR-0126 D1 / ADR-0161).
--   · El costo de cada prenda NO sale de aquí: solo salen las sumas. El navegador nunca recibe los ~1.000 costos (ADR-0183).
--
-- LAS REGLAS (qué cuenta y qué no; lo que cambia respecto del Balance está escrito, no escondido)
--   1. Cuenta lo que Existencias cuenta: stock de variantes ACTIVAS de productos que no son de prueba. Deja fuera la variante
--      centinela del «Monto manual» / «Prenda sin registrar» (`2222…`, 999.999 unidades por sede): el Balance también la deja fuera.
--   2. Lo DAÑADO (sububicación de tipo 'cuarentena') va aparte, a costo completo como dato, y NO entra al valor: es lo que
--      Existencias muestra en su propia columna `danado` (fn_existencias_base).
--   3. Lo de CLAURE (`stock_dueno`, ADR-0542; hoy solo en Tienda Lima) va aparte y NO entra al valor de CAYLA: es otro negocio y se
--      valoriza con lo que CLAURE cobra, no con lo que le costó a CAYLA. Las dañadas de CLAURE cuentan en «dañadas».
--   4. Una prenda con costo 0 NO suma al valor y se cuenta aparte (`unidades_sin_costo`, `prendas_sin_costo`): la pantalla dice
--      cuántas no cuentan en vez de presentar un total más bajo como si fuera todo. `variantes.costo` es NOT NULL default 0.
--   5. Cuánto de ese valor viene de una compra o de Producción (la prenda tiene una fila en `costo_historial`) y cuánto es el
--      costo que se escribió al dar de alta la prenda (`valor_con_costo_de_compra`): hoy casi todo es lo segundo, y un total que
--      parece firme sin serlo es peor que no tenerlo (ADR-0121 D9 / ADR-0243).
--   No incluye lo que va en camino entre sedes ni lo facturado por recibir (el Balance sí, en la cuenta 201), ni descuenta lo vendido
--   por la web que todavía no se entrega (el Balance sí: ADR-0408): la prenda sigue en el estante y Existencias la cuenta.
--
-- QUÉ SE ROMPE SI (y cómo se ve)
--   · Si alguien copia esta lógica de `fn_bal_stock` desde su archivo original, pierde los dos parches de pedidos web
--     (20261015053000, 20261015115000): por eso AQUÍ se parte del stock físico, no de esa función.
--   · Si una sede llega a 1.000+ filas de stock y esto se leyera desde el navegador, PostgREST corta sin avisar: por eso la
--     suma se hace aquí y viajan cuatro o cinco filas.
--
-- Una sola parte: crea una función y su permiso, sin políticas ni `alter` de tablas en uso (nada de lo que pide «Políticas y
-- deadlocks» de CLAUDE.md). Idempotente: `create or replace`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_valor_inventario_existencias()
returns table (
  ubicacion_id uuid,
  sede text,
  tipo text,
  unidades bigint,
  valor numeric,
  unidades_sin_costo bigint,
  prendas_sin_costo bigint,
  valor_con_costo_de_compra numeric,
  unidades_danadas bigint,
  valor_danadas numeric,
  unidades_claure bigint,
  valor_claure numeric
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with
  -- Cada lugar de cada prenda en cada sede, con lo que Existencias cuenta (activas, no de prueba, sin la centinela).
  lugares as (
    select s.ubicacion_id, s.variante_id, v.costo,
           coalesce(sb.tipo, '') = 'cuarentena' as danada,
           s.cantidad
      from retail.stock s
      join retail.variantes v on v.id = s.variante_id and v.activo
      join retail.productos p on p.id = v.producto_id and not coalesce(p.es_prueba, false)
      left join retail.sububicaciones sb on sb.id = s.sububicacion_id
     where s.variante_id <> '22222222-2222-4222-8222-222222222222'
  ),
  -- Lo que no es de la casa fuera de cuarentena, por prenda y sede (hoy, lo de CLAURE en Tienda Lima).
  ajeno as (
    select d.ubicacion_id, d.variante_id, sum(d.cantidad)::bigint as q
      from retail.stock_dueno d
      left join retail.sububicaciones sb on sb.id = d.sububicacion_id
     where coalesce(sb.tipo, '') <> 'cuarentena'
     group by 1, 2
  ),
  por_prenda as (
    select l.ubicacion_id, l.variante_id, l.costo,
           coalesce(sum(l.cantidad) filter (where l.danada), 0)::bigint as danadas,
           coalesce(sum(l.cantidad) filter (where not l.danada), 0)::bigint - coalesce(a.q, 0) as de_cayla,
           coalesce(a.q, 0) as de_claure
      from lugares l
      left join ajeno a on a.ubicacion_id = l.ubicacion_id and a.variante_id = l.variante_id
     group by l.ubicacion_id, l.variante_id, l.costo, a.q
  ),
  -- Una prenda con una fila aquí tiene un costo que salió de una compra o de Producción, no solo del alta.
  con_historia as (select distinct ch.variante_id from retail.costo_historial ch),
  sumas as (
    select pp.ubicacion_id,
           sum(pp.de_cayla)::bigint                                                         as unidades,
           round(sum(pp.de_cayla * pp.costo), 2)                                            as valor,
           coalesce(sum(pp.de_cayla) filter (where pp.costo = 0), 0)::bigint                as unidades_sin_costo,
           count(*) filter (where pp.costo = 0 and pp.de_cayla > 0)::bigint                 as prendas_sin_costo,
           round(coalesce(sum(pp.de_cayla * pp.costo) filter (where h.variante_id is not null), 0), 2) as valor_con_costo_de_compra,
           sum(pp.danadas)::bigint                                                          as unidades_danadas,
           round(sum(pp.danadas * pp.costo), 2)                                             as valor_danadas,
           sum(pp.de_claure)::bigint                                                        as unidades_claure,
           round(sum(pp.de_claure * pp.costo), 2)                                           as valor_claure
      from por_prenda pp
      left join con_historia h on h.variante_id = pp.variante_id
     group by pp.ubicacion_id
  )
  -- UNA fila por sede aunque no tenga nada: «sin filas» tiene que querer decir SIEMPRE «no tienes permiso».
  select u.id, u.nombre, u.tipo,
         coalesce(s.unidades, 0), coalesce(s.valor, 0),
         coalesce(s.unidades_sin_costo, 0), coalesce(s.prendas_sin_costo, 0), coalesce(s.valor_con_costo_de_compra, 0),
         coalesce(s.unidades_danadas, 0), coalesce(s.valor_danadas, 0),
         coalesce(s.unidades_claure, 0), coalesce(s.valor_claure, 0)
    from retail.ubicaciones u
    left join sumas s on s.ubicacion_id = u.id
   where u.activo
     and retail.fn_puede_ver_dinero_de_compras()
     -- El líder ve todas las sedes; quien solo ve el dinero de Compras, la suya (como Existencias: una colaboradora no cambia de sede).
     and (retail.fn_es_lider() or u.id = retail.fn_ubicacion_actual_persona())
   order by u.nombre;
$$;

revoke all on function retail.fn_valor_inventario_existencias() from public, anon;
grant execute on function retail.fn_valor_inventario_existencias() to authenticated;

comment on function retail.fn_valor_inventario_existencias() is
  'ADR-0557: lo que vale lo que hay en cada sede, a costo, para «Ver el valor a costo» de Existencias. Una fila por sede (todas si es líder, la suya si solo ve el dinero de Compras); sin permiso, CERO filas. Cuenta lo de CAYLA sin dañadas ni CLAURE (van aparte), no suma las prendas con costo 0 (las cuenta) y dice cuánto del valor viene de una compra. No incluye en camino ni por recibir ni descuenta lo vendido por la web sin entregar: el Balance (fn_bal_stock) sí. Solo salen sumas, nunca el costo de una prenda.';

reset lock_timeout;
notify pgrst, 'reload schema';
