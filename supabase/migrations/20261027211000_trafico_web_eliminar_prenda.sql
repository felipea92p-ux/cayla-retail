-- ============================================================================
-- 20261027211000_trafico_web_eliminar_prenda.sql — CAYLA V2 · Tienda web ▸ Tráfico (ADR-0495, act. 2026-10-27)
--
-- EL PROBLEMA PRIMERO. Cada paso de la tienda online (vio la prenda, eligió talla, la puso en la bolsa) apunta a su prenda y a su talla
-- (`retail.trafico_web`, 20261023230000), y esa tabla solo se agrega. Con sus llaves sin cascada, una prenda que alguien miró en la tienda
-- online ya no se podía eliminar, y Catálogo ofrecía «Eliminar» igual: la base la frenaba con «otra parte del sistema todavía lo usa».
-- Felipe (2026-10-27): que SÍ se pueda eliminar, con una confirmación que avise lo que pasa; y que las visitas NO se borren: se quedan sin
-- la prenda, así las cifras de Tráfico de días pasados no cambian.
--
-- QUÉ HACE
--   1. Las llaves a `productos` y `variantes` sueltan la prenda (`on delete set null`): al eliminarla, sus visitas se quedan con todo lo
--      demás (quién, cuándo, el paso, el camino) y sin la prenda o la talla.
--   2. Lo único que se le puede cambiar a una visita es eso: soltar la prenda o la talla cuando esa prenda o talla ya no existe. Cualquier
--      otra edición, y borrarla, siguen prohibidos (`fn_trafico_web_inmutable`).
--   3. Un paso de prenda (1 a 3) puede quedar sin ella: es una prenda que se eliminó. La única que escribe, `tienda_anotar_pasos`, sigue
--      poniendo siempre la prenda (y la talla en 2 y 3); lo comprueba antes de anotar.
--   4. La historia de la prenda (`fn_producto_historia`) suma el renglón 27, «personas que la miraron en la tienda online»: no frena (se
--      puede borrar), así que una prenda que solo tiene visitas pide «Eliminar con su historia», con su confirmación.
--   5. `fn_producto_como_eliminar` devuelve también cuántas personas la miraron (`visitas`), para que la ventana lo avise.
--
-- QUÉ NO HACE. No borra ninguna visita ni toca `eliminar_producto` ni `eliminar_producto_con_historia`: la llave suelta la prenda sola
-- cuando ellas borran la ficha y sus tallas.
--
-- SE PEGA ENTERA: `alter` de `trafico_web` (solo la escribe la tienda) y de las llaves, funciones y un reemplazo ANCLADO en
-- `fn_producto_historia` (si su texto en producción no es el esperado, aborta sin tocar nada). Sin políticas. Se puede pegar dos veces.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Las llaves sueltan la prenda ----------
alter table retail.trafico_web drop constraint if exists trafico_web_producto_id_fkey;
alter table retail.trafico_web
  add constraint trafico_web_producto_id_fkey foreign key (producto_id) references retail.productos (id) on delete set null;
alter table retail.trafico_web drop constraint if exists trafico_web_variante_id_fkey;
alter table retail.trafico_web
  add constraint trafico_web_variante_id_fkey foreign key (variante_id) references retail.variantes (id) on delete set null;

-- ---------- 3. Un paso de prenda puede quedar sin ella (se eliminó) ----------
-- Antes: «vio, eligió talla o a la bolsa ⇔ tiene prenda» y «eligió talla o a la bolsa ⇒ tiene talla». Ahora solo lo que no cambia al
-- eliminar: la prenda solo en los pasos 1 a 3 (`trafico_web_talla` ya dice que la talla solo va en 2 y 3).
alter table retail.trafico_web drop constraint if exists trafico_web_prenda;
alter table retail.trafico_web add constraint trafico_web_prenda check (producto_id is null or paso in (1, 2, 3));
alter table retail.trafico_web drop constraint if exists trafico_web_talla_obligatoria;

-- ---------- 2. Lo único que se edita: soltar la prenda o la talla que ya no existe ----------
create or replace function retail.fn_trafico_web_inmutable()
returns trigger
language plpgsql
as $fn$
begin
  -- Al eliminar una prenda o una talla, la llave (`on delete set null`) suelta la de sus visitas: es la única edición que pasa, y solo si
  -- lo demás de la fila queda igual y la prenda o la talla ya no existe (ADR-0495, act. 2026-10-27).
  if tg_op = 'UPDATE'
     and (new.id, new.ocurrio_en, new.visitante, new.paso, new.camino, new.region, new.pedido_web_id)
         is not distinct from (old.id, old.ocurrio_en, old.visitante, old.paso, old.camino, old.region, old.pedido_web_id)
     and (new.producto_id is not distinct from old.producto_id
          or (new.producto_id is null and not exists (select 1 from retail.productos p where p.id = old.producto_id)))
     and (new.variante_id is not distinct from old.variante_id
          or (new.variante_id is null and not exists (select 1 from retail.variantes v where v.id = old.variante_id)))
  then
    return new;
  end if;
  raise exception 'Los pasos del tráfico de la tienda web no se editan ni se borran: solo se agregan (ADR-0495).';
end;
$fn$;
revoke all on function retail.fn_trafico_web_inmutable() from public, anon, authenticated;

-- ---------- 4. La historia de la prenda: quién la miró en la tienda online ----------
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

-- El ancla es el renglón 19 (Frescura) y no el final de la consulta: el texto que 20261015011000 y 20261023005000 buscan para saber
-- que ya están aplicadas (sus renglones 25 y 26, pegados a «) h») queda entero, y las dos se pueden volver a pegar.
select pg_temp.reemplazar('retail.fn_producto_historia(uuid)',
$v$        from retail.frescura_decisiones x where x.producto_id = p_producto_id$v$,
$n$        from retail.frescura_decisiones x where x.producto_id = p_producto_id
      -- ADR-0495 (act. 2026-10-27): las personas que la miraron en la tienda online. No frena: al eliminar la prenda, sus visitas se
      -- quedan en Tráfico sin ella (la llave la suelta); se cuenta para que la confirmación lo avise.
      union all select 27, 'personas que la miraron en la tienda online', count(distinct x.visitante), true
        from retail.trafico_web x where x.producto_id = p_producto_id$n$,
1);

-- ---------- 5. Lo que pregunta la ventana: también cuántas personas la miraron ----------
-- Cambiar lo que devuelve pide borrarla antes (`create or replace` no cambia las columnas). `drop function` no toma las tablas de auth
-- ni de storage. Lo demás es el cuerpo de 20261003232000, igual.
drop function if exists retail.fn_producto_como_eliminar(uuid);
create or replace function retail.fn_producto_como_eliminar(p_producto_id uuid)
returns table (nivel text, puedes boolean, razon text, prendas bigint, movimientos bigint, cargado_por text, cargado_el timestamptz, visitas bigint)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_todo text;
  v_docs text;
  v_prendas bigint;
  v_movs bigint;
  v_visitas bigint;
  v_quien text;
  v_cuando timestamptz;
begin
  if not retail.fn_puede_editar_catalogo() then
    raise exception 'No puedes eliminar productos: tu rol no edita el catálogo (módulo «Productos»). Pídele al líder que lo active.' using errcode = '42501';
  end if;

  if retail.fn_producto_es_pieza_del_sistema(p_producto_id) then
    return query select 'sistema'::text, false,
      'es una pieza del sistema: el cobro de «Monto manual» del punto de venta la necesita'::text, 0::bigint, 0::bigint, null::text, null::timestamptz, 0::bigint;
    return;
  end if;

  select string_agg(h.concepto || ' (' || h.n || ')', ', ' order by h.orden),
         string_agg(h.concepto || ' (' || h.n || ')', ', ' order by h.orden) filter (where not h.borrable),
         coalesce(max(h.n) filter (where h.orden = 3), 0),
         coalesce(max(h.n) filter (where h.orden = 2), 0),
         coalesce(max(h.n) filter (where h.orden = 27), 0)
    into v_todo, v_docs, v_prendas, v_movs, v_visitas
    from retail.fn_producto_historia(p_producto_id) h;

  select nullif(btrim(split_part(pe.nombres, ' ', 1) || ' ' || split_part(coalesce(pe.apellidos, ''), ' ', 1)), ''), m.created_at
    into v_quien, v_cuando
    from retail.movimientos m
    join retail.variantes v on v.id = m.variante_id
    left join public.personas pe on pe.id = m.usuario_id
   where v.producto_id = p_producto_id
   order by m.created_at, m.id
   limit 1;

  if v_todo is null then
    return query select 'libre'::text, true, null::text, 0::bigint, 0::bigint, v_quien, v_cuando, 0::bigint;
  elsif v_docs is not null then
    return query select 'con_documentos'::text, false, 'tiene ' || v_docs, v_prendas, v_movs, v_quien, v_cuando, v_visitas;
  else
    return query select 'con_historia'::text, true, 'tiene ' || v_todo, v_prendas, v_movs, v_quien, v_cuando, v_visitas;
  end if;
end;
$fn$;
revoke all on function retail.fn_producto_como_eliminar(uuid) from public, anon;
grant execute on function retail.fn_producto_como_eliminar(uuid) to authenticated;

reset lock_timeout;
