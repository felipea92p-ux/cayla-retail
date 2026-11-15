-- ============================================================================
-- 20261115204000_costo_dudoso_reglas.sql — CAYLA V2 · ADR-0668 (A4, PARTE 1 de 2)
-- Las reglas del costo dudoso y la lectura de referencia. Solo crea funciones nuevas: no cambia ninguna que exista.
-- ESPERA EL OK DE FELIPE (es la parte inofensiva, pero va junto a la PARTE 2, que sí frena recepciones).
--
-- EL PROBLEMA PRIMERO. Al recibir, un costo mal escrito (440 por 44, el monto sin IGV, el de la docena) llega al stock y de ahí al
-- precio sugerido: «un 440 escrito por 44 no debe proponer un precio de S/ 998.90». Hoy la base solo frena «más del doble o menos de
-- dos tercios del anterior» (ADR-0298), y lo compara contra el costo GUARDADO, que con factura la base dividió entre 1.18
-- (`fn_costo_de_entrada`, 20261106005000): con IGV contra sin IGV. Y lo que llega sin orden (311 de 440 entradas de envíos, medido el
-- 2026-11-15) no tiene con qué compararse si la prenda es nueva.
--
-- QUÉ CREA (decisión 9 de Felipe, 2026-11-15: «un costo raro no sugiere precio ni deja guardar hasta que la persona confirma
-- «Sí, pagué S/ X»»)
--   · `fn_costo_anterior_en_papel(variante)`: el costo de hoy, en la base del papel. Si la última entrada de la prenda pasó por una
--     factura (la misma pregunta de `fn_costo_de_entrada`), es lo guardado × 1.18; si no, lo guardado. Hasta que A11 corrija los
--     costos viejos, es la única forma honesta de comparar lo que se escribe (con IGV) contra lo de antes.
--   · `fn_banda_de_costo(categoria)`: lo que suele costar una prenda de esa categoría. Cuenta MODELOS (la mediana de sus tallas), no
--     tallas: Polos tiene 747 tallas pero 74 modelos. Con 5 modelos o más, de la mitad del p10 al doble del p90; si la categoría no
--     llega, su familia; si tampoco, sin banda. Nunca la de toda CAYLA (marcaría a todos los accesorios baratos). Una familia fuera de
--     los motores (bolsas, empaque: ADR-0377) no tiene banda.
--   · `fn_motivo_de_costo_con(costo, anterior, de la orden, banda, IGV)`: la regla pura, solo con números (la que espeja la web), y
--     `fn_motivo_de_costo(costo, variante, línea de orden, motivo de siempre)`, que lee esos números de la base. El motivo por el que
--     un costo pide confirmar, o null. En este orden, el primero que salte:
--       1. «sin_costo» y «mayor_que_precio», los de siempre (`fn_costo_fuera_de_banda` con el precio). El segundo pasa a A5.
--       2. «sube» / «baja»: la MISMA banda 2× / ⅔ de `fn_costo_fuera_de_banda` (se llama, no se copia), contra el anterior en papel.
--       3. «sin_igv»: la línea tiene orden y lo escrito es su monto ÷ 1.18 (±2 %). Entre el monto y el monto ÷ 1.18 hay 15 %: el ±2 %
--          nunca toca al correcto.
--       4. «fuera_de_banda», solo si nada de lo anterior saltó.
--   · `fn_costo_confirmado(costo, motivo, sí, montos)`: ¿la persona confirmó ESTE costo? Por monto: `confirma_montos` trae los montos
--     que dijo «Sí, pagué» y uno tiene que ser este, al céntimo (confirmó 440 y después escribió 4400: no vale). El «sí» suelto de
--     siempre sigue valiendo para los cuatro motivos que ya existían, por la web publicada y por la cola sin conexión de «Llegó
--     mercadería»; los dos nuevos («sin_igv», «fuera_de_banda») solo con el monto.
--   · `fn_precio_referencia(variantes, categorías, líneas del envío)`: lo que la hoja de Recibir necesita para avisar ANTES de
--     guardar, con los mismos números que usa la base: el anterior en papel de cada prenda, la banda de cada categoría y lo que cuesta
--     cada prenda según la orden de cada línea del envío. Solo para quien ve el costo de una prenda (`fn_ve_costo_de_prenda`, A3).
--
-- DECIDÍ: una sola regla en la base, que la web espeja para avisar antes (y una prueba las cruza).
-- DESCARTÉ: (a) cambiar `fn_costo_fuera_de_banda`: la usan seis caminos (Compras, Producción, corregir costo) y su prueba fija sus
--   fronteras; (b) bajar la banda a 1.5× / 0.75×: 11 de 300 entradas legítimas en 60 días habrían pedido confirmar, y una alarma que
--   suena seguido se confirma por reflejo (ADR-0298 §2); (c) la banda p10–p90 cruda: saltaba en 27 % de las entradas.
-- SE ROMPE SI: (1) una prenda entra 15 % más barata por un descuento real que la orden no anota (hoy 0 de 142 líneas tienen
--   descuento): se toma por «sin IGV» y pide confirmar; (2) el anterior es un promedio de una entrada con factura y otra sin ella: el
--   × 1.18 lo exagera (47 de las 48 prendas con factura entraron con stock 0, así que hoy no pasa); (3) lo de fuera de la guía que
--   «Hacer ahora» toma del catálogo ya venía dividido: se compara contra sí mismo y nada lo ve (A11 lo arregla).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, idempotente: funciones, permisos y comentarios, sin tablas, políticas
-- ni `drop trigger` (ADR-0195). ORDEN: esta parte → la web → la PARTE 2 (20261115205000). Pegada sola no cambia nada de lo que
-- hace hoy la base.
-- VUELTA ATRÁS: `drop function` de las seis (nadie más las llama hasta la PARTE 2).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- 1. El costo de hoy de una prenda, en la base del papel (con IGV si su última entrada fue con factura).
create or replace function retail.fn_costo_anterior_en_papel(p_variante_id uuid)
returns numeric
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case
    when v.costo is null or v.costo <= 0 then null
    -- La última entrada que movió el costo pasó por una factura: `fn_costo_de_entrada` la dividió entre 1.18 al guardarla.
    when exists (
      select 1
        from (select ch.movimiento_id from retail.costo_historial ch
               where ch.variante_id = v.id order by ch.orden desc limit 1) ultima
        join retail.despacho_recibidos dr on dr.movimiento_id = ultima.movimiento_id
        join retail.despacho_items di on di.id = dr.despacho_item_id
       where di.orden_compra_item_id is not null
         and retail.fn_costo_de_entrada(100, di.orden_compra_item_id) < 100
    ) then round(v.costo * (1 + retail.fn_tasa_igv(retail.fn_hoy_lima())), 2)
    else v.costo
  end
  from retail.variantes v
  where v.id = p_variante_id;
$$;
comment on function retail.fn_costo_anterior_en_papel(uuid) is
  'ADR-0668 (A4): el costo de hoy de la prenda en la base del papel: × (1 + IGV) si su última entrada pasó por una factura (la misma pregunta de fn_costo_de_entrada), si no el guardado. Hasta A11, la única forma de comparar lo escrito (con IGV) contra lo de antes.';

-- 2. Lo que suele costar una prenda de una categoría: [p10 / 2, p90 × 2] sobre los modelos, con 5 o más; si no, su familia.
create or replace function retail.fn_banda_de_costo(p_categoria_id uuid)
returns table (lo numeric, hi numeric, modelos integer, de text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with mia as (
    select c.id, c.familia from retail.categorias c
     where c.id = p_categoria_id and retail.fn_categoria_entra_a_motores(c.id)
  ),
  modelos as (
    -- Un modelo entra con la mediana de sus tallas activas con costo: las tallas de un modelo comparten costo y no son muestra.
    select p.categoria_id, c.familia,
           percentile_cont(0.5) within group (order by v.costo) as costo
      from retail.productos p
      join retail.categorias c on c.id = p.categoria_id
      join retail.variantes v on v.producto_id = p.id
     where p.estado = 'activo' and p.fusionado_en_id is null and v.activo and v.costo > 0
       and c.familia = (select familia from mia)
     group by p.id, p.categoria_id, c.familia
  ),
  bandas as (
    select 1 as prioridad, 'categoria'::text as de, count(*)::integer as n,
           percentile_cont(0.1) within group (order by m.costo) as p10,
           percentile_cont(0.9) within group (order by m.costo) as p90
      from modelos m where m.categoria_id = p_categoria_id
    union all
    select 2, 'familia', count(*)::integer,
           percentile_cont(0.1) within group (order by m.costo),
           percentile_cont(0.9) within group (order by m.costo)
      from modelos m
  )
  select round((b.p10 / 2)::numeric, 2), round((b.p90 * 2)::numeric, 2), b.n, b.de
    from bandas b
   where b.n >= 5 and exists (select 1 from mia)
   order by b.prioridad
   limit 1;
$$;
comment on function retail.fn_banda_de_costo(uuid) is
  'ADR-0668 (A4): lo que suele costar una prenda de la categoría, [p10/2, p90×2] sobre la mediana de cada MODELO, con 5 modelos o más; si no llega, su familia; si tampoco, ninguna fila. Una familia fuera de los motores (ADR-0377) no tiene banda.';

-- 3. El motivo por el que un costo pide confirmar, o null. La regla pura (solo números: la misma que espeja la web) y la que lee la base.
create or replace function retail.fn_motivo_de_costo_con(p_costo numeric, p_anterior numeric, p_de_la_orden numeric, p_lo numeric, p_hi numeric, p_tasa_igv numeric)
returns text
language sql
immutable
set search_path = retail, public, extensions
as $$
  select case
    when p_costo is null or p_costo <= 0 then null
    -- Muy distinto al anterior: la banda de siempre (se llama, no se copia), sin precio: eso se mira aparte.
    when retail.fn_costo_fuera_de_banda(p_costo, p_anterior, null) in ('sube', 'baja') then retail.fn_costo_fuera_de_banda(p_costo, p_anterior, null)
    -- Escrito sin IGV: lo de la orden ÷ (1 + IGV), ±2 %.
    when coalesce(p_de_la_orden, 0) > 0 and round(p_costo, 2) <> round(p_de_la_orden, 2)
         and abs(round(p_costo, 2) - round(p_de_la_orden / (1 + p_tasa_igv), 2)) * 50 <= round(p_de_la_orden / (1 + p_tasa_igv), 2)
      then 'sin_igv'
    -- Fuera de lo que suele costar su categoría (o su familia).
    when p_lo is not null and p_hi is not null and (round(p_costo, 2) < p_lo or round(p_costo, 2) > p_hi) then 'fuera_de_banda'
  end;
$$;
comment on function retail.fn_motivo_de_costo_con(numeric, numeric, numeric, numeric, numeric, numeric) is
  'ADR-0668 (A4): la regla pura del costo dudoso, solo con números: sube / baja (fn_costo_fuera_de_banda contra el anterior), sin_igv (lo de la orden ÷ (1 + IGV), ±2 %) y fuera_de_banda. La web la espeja en motivoDeCosto (lib/cuenta-de-precio.ts) y las dos corren los casos de lib/costo-dudoso-casos.json.';

create or replace function retail.fn_motivo_de_costo(p_costo numeric, p_variante_id uuid, p_orden_compra_item_id uuid, p_motivo_de_siempre text)
returns text
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case
    -- Los de siempre que no dependen de lo anterior: sin costo y, hasta A5, el costo que llega al precio.
    when p_motivo_de_siempre in ('sin_costo', 'mayor_que_precio') then p_motivo_de_siempre
    else retail.fn_motivo_de_costo_con(
      p_costo,
      retail.fn_costo_anterior_en_papel(p_variante_id),
      (select round(i.subtotal / nullif(i.cantidad, 0), 2) from retail.orden_compra_items i where i.id = p_orden_compra_item_id),
      b.lo, b.hi,
      retail.fn_tasa_igv(retail.fn_hoy_lima()))
  end
  from (select 1) uno
  left join lateral (select bc.lo, bc.hi from retail.variantes vr join retail.productos p on p.id = vr.producto_id
                      cross join lateral retail.fn_banda_de_costo(p.categoria_id) bc where vr.id = p_variante_id) b on true;
$$;
comment on function retail.fn_motivo_de_costo(numeric, uuid, uuid, text) is
  'ADR-0668 (A4): por qué este costo pide confirmar, o null. Primero sin_costo / mayor_que_precio (los de siempre); si no, la regla pura fn_motivo_de_costo_con con el anterior en papel, el monto por prenda de la línea de orden y la banda de su categoría.';

-- 4. ¿La persona confirmó ESTE costo? Por monto; el «sí» suelto, solo para los motivos que ya existían.
create or replace function retail.fn_costo_confirmado(p_costo numeric, p_motivo text, p_si boolean, p_montos jsonb)
returns boolean
language sql
immutable
set search_path = retail, public, extensions
as $$
  select coalesce(jsonb_typeof(p_montos) = 'array' and exists (
           select 1 from jsonb_array_elements(p_montos) m
            where jsonb_typeof(m) = 'number' and round((m #>> '{}')::numeric, 2) = round(p_costo, 2)), false)
      or (coalesce(p_si, false) and p_motivo in ('sin_costo', 'mayor_que_precio', 'sube', 'baja'));
$$;
comment on function retail.fn_costo_confirmado(numeric, text, boolean, jsonb) is
  'ADR-0668 (A4): ¿se confirmó este costo? Si confirma_montos trae este monto al céntimo, sí. El «sí» suelto (confirma_costo) sigue valiendo para sin_costo, mayor_que_precio, sube y baja (web publicada y cola sin conexión); sin_igv y fuera_de_banda solo con el monto.';

-- 5. Lo que la hoja de Recibir necesita para avisar antes de guardar, con los números de la base.
create or replace function retail.fn_precio_referencia(p_variantes uuid[] default '{}', p_categorias uuid[] default '{}', p_despacho_items uuid[] default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if auth.uid() is null or not retail.fn_ve_costo_de_prenda() then
    raise exception 'Tu rol no ve el costo de las prendas' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'anterior', coalesce((select jsonb_object_agg(v.id, retail.fn_costo_anterior_en_papel(v.id))
                            from retail.variantes v where v.id = any (coalesce(p_variantes, '{}'))
                             and retail.fn_costo_anterior_en_papel(v.id) is not null), '{}'::jsonb),
    'bandas', coalesce((select jsonb_object_agg(c.id, jsonb_build_object('lo', b.lo, 'hi', b.hi, 'de', b.de, 'modelos', b.modelos))
                          from retail.categorias c cross join lateral retail.fn_banda_de_costo(c.id) b
                         where c.id = any (coalesce(p_categorias, '{}'))), '{}'::jsonb),
    -- Por línea del ENVÍO (lo que la pantalla conoce): lo que su línea de orden dice que cuesta cada prenda, igual que el candado.
    'lineas', coalesce((select jsonb_object_agg(di.id, round(i.subtotal / nullif(i.cantidad, 0), 2))
                          from retail.despacho_items di join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                         where di.id = any (coalesce(p_despacho_items, '{}')) and i.cantidad > 0), '{}'::jsonb),
    'tasa_igv', retail.fn_tasa_igv(retail.fn_hoy_lima())
  );
end;
$$;
comment on function retail.fn_precio_referencia(uuid[], uuid[], uuid[]) is
  'ADR-0668 (A4): para avisar antes de guardar, con los mismos números del candado: el costo anterior en papel de cada prenda, la banda de cada categoría y, por línea del envío, el monto por prenda de su línea de orden. Solo quien ve el costo de una prenda (fn_ve_costo_de_prenda).';

revoke all on function retail.fn_costo_anterior_en_papel(uuid) from public, anon, authenticated;
revoke all on function retail.fn_banda_de_costo(uuid) from public, anon, authenticated;
revoke all on function retail.fn_motivo_de_costo(numeric, uuid, uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_motivo_de_costo_con(numeric, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function retail.fn_motivo_de_costo_con(numeric, numeric, numeric, numeric, numeric, numeric) to authenticated, service_role;
revoke all on function retail.fn_costo_confirmado(numeric, text, boolean, jsonb) from public, anon;
grant execute on function retail.fn_costo_confirmado(numeric, text, boolean, jsonb) to authenticated, service_role;
grant execute on function retail.fn_costo_anterior_en_papel(uuid) to service_role;
grant execute on function retail.fn_banda_de_costo(uuid) to service_role;
grant execute on function retail.fn_motivo_de_costo(numeric, uuid, uuid, text) to service_role;
revoke all on function retail.fn_precio_referencia(uuid[], uuid[], uuid[]) from public, anon;
grant execute on function retail.fn_precio_referencia(uuid[], uuid[], uuid[]) to authenticated, service_role;

reset search_path;
reset lock_timeout;
