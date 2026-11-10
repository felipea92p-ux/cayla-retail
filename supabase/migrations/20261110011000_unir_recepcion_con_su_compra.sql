-- ============================================================================
-- 20261110011000 — Unir una recepción «sin aviso» con la compra pagada a la que pertenece (ADR-0636, paso 2)
--
-- EL PROBLEMA PRIMERO. La compradora paga y anota el papel; la mercadería llega antes de que mande el envío (o antes de que registre el papel)
-- y la tienda la recibe «sin aviso». El stock ya entró por ahí, pero la compra sigue esperando con su envío propio: si la tienda lo cierra
-- contando, las prendas entran DOS veces; si no lo cierra, el papel nunca pasa al libro y la plata queda como «Mercadería pagada» para siempre.
-- Medido en producción el 2026-11-09: 112 prendas (S/ 3,157) recibidas sin aviso de proveedores con una compra pagada pendiente; tres parejas
-- calzan al centavo. No había forma de unirlas: tres candados lo impedían (el check de los extras, el validador de «recibido antes» y
-- `fn_papel_pasa_solo`, que exige un envío propio cerrado).
--
-- LA DECISIÓN (Felipe, 2026-11-09, camino A). Una persona dice «esta recepción es de esta compra». Desde ahí:
--   · la compra sale de su envío propio (se anula; si llevaba otras compras, nace otro envío en camino con las demás);
--   · sus prendas ya no se pueden volver a mandar ni a enviar (por mandar = 0, y el tope de `despacho_items` las rechaza);
--   · el papel pasa al libro cuando la recepción sin aviso está cerrada, con lo llegado anotado como «recibido antes» (así el comprobante no
--     queda «por recibir» y nadie lo recibe otra vez contra factura).
--
-- REGLAS (todas de Felipe): la plata la manda el papel y el costo del stock queda como entró · nunca se une sola por coincidencia de cifras ·
--   no se une con proveedor distinto (primero se corrige el proveedor de la recepción) · si el envío propio ya tiene prendas contadas o ya se
--   recibió, se rechaza y lo resuelve una persona · una unión no se deshace · si llegó menos de lo comprado, el resto queda por recibir contra
--   el comprobante (no se crea deuda del proveedor sola).
--
-- CONTRATO (Liskov)
--   PROMETE: `unir_recepcion_con_compra(despacho, papel, token)` → {unido, repetido, paso_al_libro, motivo, envios_anulados, envios_nuevos,
--            prendas_papel, prendas_recibidas}. Todo o nada. Con el mismo papel y la misma recepción devuelve `repetido`.
--   FALLA:   `union_sin_modulo`, `responsable_requerido`, `union_no_es_sin_aviso`, `union_recepcion_no_lista`, `papel_no_existe`,
--            `union_papel_no_pendiente`, `union_papel_ya_unido`, `union_otra_sede`, `union_varias_sedes`, `union_sin_prendas`,
--            `union_envio_ya_recibido`, `union_envio_con_conteo`.
--   NO HACE: no toca `movimientos`, `costo_historial` ni recalcula costos; no escribe pagos (los escribe `completar_papel_compra`, una vez);
--            no parcha `fn_recepcion_cerrar`, `fn_recepcion_entrar` ni `completar_papel_compra`.
--
-- QUÉ CAMBIA DE LO QUE YA EXISTE (reemplazos COMPLETOS: cada una tiene una sola definición viva, leída de producción el 2026-11-09)
--   `fn_compra_item_por_mandar`              → 0 si la compra de esa línea ya llegó por una recepción unida.
--   `fn_despacho_items_tope`                 → rechaza enviar una línea de una compra que ya llegó (`compra_ya_llego`).
--   `fn_papel_pasa_solo`                     → acepta, además de un envío propio cerrado, una recepción unida ya cerrada.
--   `fn_despacho_pasa_papeles_a_libros`      → al cerrar una recepción, intenta pasar también los papeles unidos a ella.
--   `fn_compra_item_recibido_antes_valida`   → acepta una fila «extra» si es de la recepción unida al papel de ese comprobante.
--   `fn_mercaderia_pagada` (ADR-0636, paso 0) → una compra unida cuenta como «ya en la tienda».
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe; mueve reglas de stock y de plata). DOS PARTES, por separado y en orden (ADR-0195):
--   PARTE 1: la tabla (sin políticas: solo la leen funciones `security definer`). PARTE 2: las funciones y los dos disparadores
--   (`create or replace trigger`, nunca `drop trigger`). Las dos son re-ejecutables. La web vieja no llama a nada de esto.
--   ANTES de pegar, comprobar que nadie cambió las cinco funciones desde el 2026-11-09 (md5 de `pg_get_functiondef`, abajo en VERIFICACIÓN).
-- VERIFICACIÓN (solo lectura): select to_regclass('retail.compra_papel_llegadas') is not null, to_regproc('retail.unir_recepcion_con_compra') is not null;
-- CÓMO SE DESHACE: volver a pegar las cinco funciones de antes (20261012225000, 20261023143000, 20261029194000), `drop trigger` de los dos
--   nuevos y `drop function unir_recepcion_con_compra`. La tabla se queda (historia): con 0 filas no cambia nada.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ════════════════════════════════════════ PARTE 1 · la tabla ════════════════════════════════════════
create table if not exists retail.compra_papel_llegadas (
  papel_id uuid primary key references retail.compra_papeles (id),
  -- La recepción «sin aviso» por la que llegó.
  despacho_id uuid not null references retail.despachos (id),
  proveedor_id uuid not null references retail.proveedores (id),
  unido_por uuid not null references public.personas (id),
  unido_en timestamptz not null default now(),
  token uuid unique,
  -- La foto del momento de unir, para que quien revise vea qué se comparó (no se recalcula).
  prendas_papel integer not null check (prendas_papel > 0),
  prendas_recibidas integer not null check (prendas_recibidas > 0),
  monto_papel numeric(12, 2) not null,
  valor_recibido numeric(12, 2),
  envios_anulados uuid[] not null default '{}',
  envios_nuevos uuid[] not null default '{}'
);
create index if not exists compra_papel_llegadas_despacho on retail.compra_papel_llegadas (despacho_id);
alter table retail.compra_papel_llegadas enable row level security;
revoke all on retail.compra_papel_llegadas from public, anon, authenticated;
comment on table retail.compra_papel_llegadas is
  'ADR-0636: una compra pagada (papel) que llegó por una recepción «sin aviso». Una fila por papel; no se cambia ni se borra. La escribe solo unir_recepcion_con_compra.';

-- ════════════════════════════════════════ PARTE 2 · funciones y disparadores ════════════════════════════════════════
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_compra_papel_llegadas_fija()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'Una compra unida a su recepción no se cambia ni se borra.' using errcode = 'P0001', hint = 'union_no_se_deshace';
end $$;
create or replace trigger compra_papel_llegadas_fija before update or delete on retail.compra_papel_llegadas
  for each row execute function retail.fn_compra_papel_llegadas_fija();

-- ---------- 1. Por mandar: lo que ya llegó no se manda ----------
create or replace function retail.fn_compra_item_por_mandar(p_item_id uuid)
returns integer
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case
           -- ADR-0636: la compra de esta línea ya llegó por una recepción «sin aviso» unida a ella.
           when exists (select 1 from retail.ordenes_compra o join retail.compra_papel_llegadas l on l.papel_id = o.papel_id
                         where o.id = i.orden_compra_id) then 0
           else greatest(
             greatest(i.cantidad,
                      (select coalesce(sum(ci.cantidad), 0)::integer from retail.compra_items ci join retail.compras c on c.id = ci.compra_id
                        where ci.orden_compra_item_id = i.id and c.estado = 'vigente'))
             - (select coalesce(sum(di.cantidad), 0)::integer from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id
                 where di.orden_compra_item_id = i.id and d.estado in ('en_camino', 'abierto', 'cerrado')),
             0)
         end
    from retail.orden_compra_items i where i.id = p_item_id
$$;

-- ---------- 2. El tope de un envío: el candado real contra volver a enviar ----------
create or replace function retail.fn_despacho_items_tope()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_linea record;
  v_enviado integer;
  v_facturado integer;
begin
  if tg_op = 'UPDATE' and new.cantidad <= old.cantidad then
    return null;
  end if;
  select i.id, i.cantidad, i.posicion, o.numero, o.papel_id
    into v_linea
    from retail.orden_compra_items i
    join retail.ordenes_compra o on o.id = i.orden_compra_id
   where i.id = new.orden_compra_item_id
     for update of i;
  -- ADR-0636: una compra que ya llegó por una recepción unida no viaja en ningún envío vivo.
  if v_linea.papel_id is not null
     and exists (select 1 from retail.compra_papel_llegadas l where l.papel_id = v_linea.papel_id)
     and exists (select 1 from retail.despachos d where d.id = new.despacho_id and d.estado in ('en_camino', 'abierto', 'cerrado')) then
    raise exception 'La línea % de la % ya llegó a la tienda por otra recepción: no se envía otra vez',
      v_linea.posicion, retail.fn_orden_compra_numero_texto(v_linea.numero)
      using errcode = '23514', hint = 'compra_ya_llego';
  end if;
  v_enviado := (select coalesce(sum(di.cantidad), 0)::integer
                  from retail.despacho_items di
                  join retail.despachos d on d.id = di.despacho_id
                 where di.orden_compra_item_id = new.orden_compra_item_id
                   and d.estado in ('en_camino', 'abierto', 'cerrado'));
  v_facturado := (select coalesce(sum(ci.cantidad), 0)::integer
                    from retail.compra_items ci
                    join retail.compras c on c.id = ci.compra_id
                   where ci.orden_compra_item_id = new.orden_compra_item_id
                     and c.estado = 'vigente');
  if v_enviado > greatest(v_linea.cantidad, v_facturado) then
    raise exception 'De la línea % de la % se enviarían % y el tope es % (lo pedido o lo facturado, lo que sea mayor)',
      v_linea.posicion, retail.fn_orden_compra_numero_texto(v_linea.numero), v_enviado, greatest(v_linea.cantidad, v_facturado)
      using errcode = '23514', hint = 'envio_de_mas';
  end if;
  return null;
end;
$$;

-- ---------- 3. El papel pasa solo: también con su recepción unida ya cerrada ----------
create or replace function retail.fn_papel_pasa_solo(p_papel_id uuid)
returns boolean
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_p retail.compra_papeles%rowtype;
  v_motivo text;
begin
  for v_p in select * from retail.compra_papeles c where c.id = p_papel_id and c.estado = 'por_completar' for update loop
    exit;
  end loop;
  if v_p.id is null then
    return false;
  end if;
  -- Una factura o boleta de antes de la actividad 3 no trae serie ni número: la completa Compras como siempre.
  if v_p.tipo in ('factura', 'boleta') and (v_p.serie is null or v_p.numero is null) then
    return false;
  end if;
  -- ¿Ya llegó todo a la tienda? Todo mandado y todos sus envíos cerrados (lo mismo que pide completar; aquí no es un error, es «todavía no»).
  -- ADR-0636: o llegó por una recepción «sin aviso» unida a esta compra, y esa recepción ya está cerrada.
  if exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
              where o.papel_id = v_p.id and o.estado <> 'anulada' and retail.fn_compra_item_por_mandar(i.id) > 0)
     or exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                  join retail.despacho_items di on di.orden_compra_item_id = i.id join retail.despachos d on d.id = di.despacho_id
                 where o.papel_id = v_p.id and o.estado <> 'anulada' and d.estado in ('en_camino', 'abierto'))
     or exists (select 1 from retail.compra_papel_llegadas l join retail.despachos d on d.id = l.despacho_id
                 where l.papel_id = v_p.id and d.estado <> 'cerrado')
     or (not exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                       join retail.despacho_items di on di.orden_compra_item_id = i.id join retail.despachos d on d.id = di.despacho_id
                      where o.papel_id = v_p.id and o.estado <> 'anulada' and d.estado = 'cerrado')
         and not exists (select 1 from retail.compra_papel_llegadas l where l.papel_id = v_p.id)) then
    return false;
  end if;

  perform set_config('retail.papel_pasa_sola', v_p.id::text, true);
  begin
    perform retail.completar_papel_compra(v_p.id, null, v_p.serie, v_p.numero, null);
  exception when others then
    v_motivo := left(sqlerrm, 300);
  end;
  perform set_config('retail.papel_pasa_sola', '', true);

  if v_motivo is not null then
    -- No pasó: el cierre del conteo sigue, y Compras ve la compra con su motivo.
    update retail.compra_papeles set pasa_sola_error = v_motivo where id = v_p.id;
    return false;
  end if;
  return true;
end $$;

-- ---------- 4. Al cerrar una recepción, también los papeles unidos a ella ----------
create or replace function retail.fn_despacho_pasa_papeles_a_libros()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_papel uuid;
begin
  for v_papel in
    select distinct o.papel_id
      from retail.despacho_items di
      join retail.orden_compra_items i on i.id = di.orden_compra_item_id
      join retail.ordenes_compra o on o.id = i.orden_compra_id
     where di.despacho_id = new.id and o.papel_id is not null
    union
    -- ADR-0636: las compras que llegaron por esta recepción «sin aviso».
    select l.papel_id from retail.compra_papel_llegadas l where l.despacho_id = new.id
  loop
    -- Pasar un papel nunca frena el cierre del conteo (principio 9): lo que falle queda por completar para Compras.
    begin
      perform retail.fn_papel_pasa_solo(v_papel);
    exception when others then
      raise warning 'papel: no pasó solo a los libros % (%)', v_papel, sqlerrm;
    end;
  end loop;
  return new;
end $$;

-- ---------- 5. «Recibido antes»: una fila extra vale si es de la recepción unida al papel de ese comprobante ----------
create or replace function retail.fn_compra_item_recibido_antes_valida()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_r retail.despacho_recibidos%rowtype;
  v_ci retail.compra_items%rowtype;
  v_oci uuid;
  v_unida boolean := false;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Lo recibido antes del comprobante no cambia ni se borra.' using errcode = 'P0001';
  end if;
  for v_r in select * from retail.despacho_recibidos r where r.id = new.despacho_recibido_id for update loop exit; end loop;
  for v_ci in select * from retail.compra_items ci where ci.id = new.compra_item_id for update loop exit; end loop;
  v_oci := (select di.orden_compra_item_id from retail.despacho_items di where di.id = v_r.despacho_item_id);
  -- ADR-0636: la fila es un «extra» de la recepción sin aviso que se unió al papel de este comprobante, del mismo proveedor.
  if v_r.id is not null and v_ci.id is not null and v_r.despacho_item_id is null then
    v_unida := exists (select 1 from retail.compra_papel_llegadas l
                         join retail.compras c on c.token_cliente::text = l.papel_id::text
                        where c.id = v_ci.compra_id and l.despacho_id = v_r.despacho_id and l.proveedor_id = v_r.proveedor_id);
  end if;
  if v_r.id is null or v_ci.id is null or v_r.compra_item_id is not null
     or (not v_unida and (v_oci is null or v_oci is distinct from v_ci.orden_compra_item_id)) then
    raise exception 'Esa fila de lo recibido no es de esta línea del comprobante.' using errcode = 'P0001';
  end if;
  if coalesce((select sum(a.cantidad) from retail.compra_item_recibido_antes a where a.despacho_recibido_id = v_r.id), 0) + new.cantidad > v_r.cantidad then
    raise exception 'Se repartió más de lo que llegó en esa fila.' using errcode = 'P0001';
  end if;
  if coalesce((select sum(a.cantidad) from retail.compra_item_recibido_antes a where a.compra_item_id = v_ci.id), 0) + new.cantidad > v_ci.cantidad then
    raise exception 'La línea del comprobante recibiría más de lo facturado.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- 6. Al completarse el papel, lo llegado por la recepción unida queda como «recibido antes» ----------
-- Cubre el pase solo y el manual de Compras sin tocar `completar_papel_compra`: corre en su misma transacción, cuando el comprobante y sus
-- líneas ya existen. Sin esto el comprobante nacería con 0 recibidas y alguien podría recibirlo otra vez contra la factura.
create or replace function retail.fn_papel_llegada_reparte()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_l retail.compra_papel_llegadas%rowtype;
  v_compra uuid;
  v_ci record;
  v_r record;
  v_falta integer;
  v_toma integer;
begin
  for v_l in select * from retail.compra_papel_llegadas l where l.papel_id = new.id loop exit; end loop;
  if v_l.papel_id is null then
    return new;
  end if;
  -- Con la recepción todavía abierta lo llegado puede cambiar: el papel espera a que se cierre.
  if (select d.estado from retail.despachos d where d.id = v_l.despacho_id) is distinct from 'cerrado' then
    raise exception 'La recepción por la que llegó esta compra todavía no se cierra: ciérrala primero.' using errcode = 'P0001', hint = 'papel_sin_recibir';
  end if;
  v_compra := (select c.id from retail.compras c where c.token_cliente::text = new.id::text and c.estado = 'vigente');
  if v_compra is null then
    return new;
  end if;
  for v_ci in
    select ci.id, ci.cantidad, ci.categoria_id, ci.marca_id
      from retail.compra_items ci where ci.compra_id = v_compra order by ci.id
  loop
    v_falta := v_ci.cantidad - coalesce((select sum(a.cantidad) from retail.compra_item_recibido_antes a where a.compra_item_id = v_ci.id), 0)::integer;
    for v_r in
      select r.id, (r.cantidad - coalesce((select sum(a.cantidad) from retail.compra_item_recibido_antes a where a.despacho_recibido_id = r.id), 0))::integer as queda
        from retail.despacho_recibidos r
       where r.despacho_id = v_l.despacho_id and r.despacho_item_id is null and r.proveedor_id = v_l.proveedor_id
         and r.movimiento_id is not null and r.compra_item_id is null
       -- Primero lo que calza en categoría y marca, después en categoría, después lo demás de ese proveedor: es la misma compra.
       order by (r.categoria_id is not distinct from v_ci.categoria_id and r.marca_id is not distinct from v_ci.marca_id) desc,
                (r.categoria_id is not distinct from v_ci.categoria_id) desc, r.creado_en, r.id
    loop
      exit when v_falta <= 0;
      if v_r.queda > 0 then
        v_toma := least(v_falta, v_r.queda);
        insert into retail.compra_item_recibido_antes (compra_item_id, despacho_recibido_id, cantidad, creado_por)
        values (v_ci.id, v_r.id, v_toma, v_l.unido_por);
        v_falta := v_falta - v_toma;
      end if;
    end loop;
  end loop;
  return new;
end $$;
create or replace trigger compra_papeles_llegada_reparte after update of estado on retail.compra_papeles
  for each row when (new.estado = 'completado' and old.estado is distinct from 'completado')
  execute function retail.fn_papel_llegada_reparte();

-- ---------- 7. La unión ----------
create or replace function retail.unir_recepcion_con_compra(p_despacho_id uuid, p_papel_id uuid, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_d retail.despachos%rowtype;
  v_p retail.compra_papeles%rowtype;
  v_l retail.compra_papel_llegadas%rowtype;
  v_envio text;
  v_prov uuid;
  v_sedes integer;
  v_sede uuid;
  v_prendas_papel integer;
  v_recibidas integer;
  v_valor numeric;
  v_ya_unidas integer;
  v_propio record;
  v_nuevo uuid;
  v_anulados uuid[] := '{}';
  v_nuevos uuid[] := '{}';
  v_paso boolean := false;
  v_motivo text;
begin
  if retail.fn_ve_modulo('recibir') is not true and retail.fn_ve_modulo('fondos') is not true then
    raise exception 'Unir una recepción con su compra necesita el módulo «Recibir mercadería» o «Fondos por rendir» en tu rol'
      using errcode = '42501', hint = 'union_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_despacho_id is null or p_papel_id is null then
    raise exception 'Falta decir qué recepción y qué compra se unen' using errcode = 'P0001', hint = 'union_sin_datos';
  end if;

  -- Primero la recepción (el mismo orden que el cierre del conteo), después el papel, después sus envíos propios.
  for v_d in select * from retail.despachos d where d.id = p_despacho_id for update loop exit; end loop;
  if v_d.id is null or not exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id) then
    raise exception 'Esa recepción no es una llegada sin aviso' using errcode = 'P0001', hint = 'union_no_es_sin_aviso';
  end if;
  v_envio := retail.fn_envio_numero_texto(v_d.numero);
  -- Quien recibe, solo en su sede; quien revisa las compras (Fondos por rendir), en cualquiera.
  if retail.fn_ve_modulo('fondos') is not true then
    perform retail.fn_recepcion_exigir(v_d.id, v_d.ubicacion_destino_id, v_actor);
  end if;

  for v_p in select * from retail.compra_papeles c where c.id = p_papel_id for update loop exit; end loop;
  if v_p.id is null then
    raise exception 'Esa compra no existe' using errcode = 'P0001', hint = 'papel_no_existe';
  end if;
  for v_l in select * from retail.compra_papel_llegadas l where l.papel_id = p_papel_id loop exit; end loop;
  if v_l.papel_id is not null then
    if v_l.despacho_id = p_despacho_id then
      return jsonb_build_object('unido', true, 'repetido', true, 'papel_id', p_papel_id, 'despacho_id', p_despacho_id,
                                'paso_al_libro', v_p.estado = 'completado', 'motivo', v_p.pasa_sola_error,
                                'envios_anulados', to_jsonb(v_l.envios_anulados), 'envios_nuevos', to_jsonb(v_l.envios_nuevos),
                                'prendas_papel', v_l.prendas_papel, 'prendas_recibidas', v_l.prendas_recibidas);
    end if;
    raise exception 'Esa compra ya se unió a otra recepción' using errcode = 'P0001', hint = 'union_papel_ya_unido';
  end if;
  if v_p.estado <> 'por_completar' then
    raise exception 'Esa compra ya no está pendiente: no se une' using errcode = 'P0001', hint = 'union_papel_no_pendiente';
  end if;
  if v_d.estado not in ('abierto', 'cerrado') then
    raise exception 'Esa recepción está anulada o todavía no se abrió' using errcode = 'P0001', hint = 'union_recepcion_no_lista';
  end if;

  -- La compra: de una sola tienda (la de la recepción) y de un solo proveedor.
  select count(distinct o.ubicacion_destino_id), min(o.ubicacion_destino_id::text)::uuid, min(o.proveedor_id::text)::uuid,
         coalesce(sum((select sum(i.cantidad) from retail.orden_compra_items i where i.orden_compra_id = o.id)), 0)::integer
    into v_sedes, v_sede, v_prov, v_prendas_papel
    from retail.ordenes_compra o where o.papel_id = p_papel_id and o.estado <> 'anulada';
  if v_prendas_papel = 0 or v_prov is null then
    raise exception 'Esa compra no tiene prendas anotadas' using errcode = 'P0001', hint = 'papel_sin_prendas';
  end if;
  if v_sedes > 1 then
    raise exception 'Esa compra va a más de una tienda: se une a mano, tienda por tienda' using errcode = 'P0001', hint = 'union_varias_sedes';
  end if;
  if v_sede is distinct from v_d.ubicacion_destino_id then
    raise exception 'Esa compra es para otra tienda' using errcode = 'P0001', hint = 'union_otra_sede';
  end if;

  -- Lo que llegó de ESE proveedor en esta recepción y ya está en el stock, sin lo que otra compra unida ya tomó.
  select coalesce(sum(r.cantidad), 0)::integer, round(sum(r.cantidad * r.costo_unitario), 2)
    into v_recibidas, v_valor
    from retail.despacho_recibidos r
   where r.despacho_id = p_despacho_id and r.despacho_item_id is null and r.proveedor_id = v_prov and r.movimiento_id is not null;
  v_ya_unidas := (select coalesce(sum(least(l.prendas_papel, l.prendas_recibidas)), 0)::integer from retail.compra_papel_llegadas l
                   where l.despacho_id = p_despacho_id and l.proveedor_id = v_prov);
  v_recibidas := v_recibidas - v_ya_unidas;
  if v_recibidas <= 0 then
    raise exception 'En esa recepción no hay prendas de ese proveedor que ya estén en el stock (o ya son de otra compra). Si el proveedor quedó mal elegido al recibir, corrígelo primero'
      using errcode = 'P0001', hint = 'union_sin_prendas';
  end if;

  -- Los envíos propios de la compra: ninguno recibido ni con prendas contadas.
  for v_propio in
    select d.id, d.estado, d.numero, d.numero_guia, d.nota, d.despachado_por, d.bultos, d.ubicacion_destino_id
      from retail.despachos d
     where d.estado in ('en_camino', 'abierto', 'cerrado')
       and exists (select 1 from retail.despacho_items di join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                     join retail.ordenes_compra o on o.id = i.orden_compra_id
                    where di.despacho_id = d.id and o.papel_id = p_papel_id)
     order by d.id
       for update of d
  loop
    if v_propio.estado = 'cerrado' or exists (select 1 from retail.despacho_recibidos r where r.despacho_id = v_propio.id) then
      raise exception 'El envío de esa compra (%) ya se recibió: no se une; revísalo con Compras', retail.fn_envio_numero_texto(v_propio.numero)
        using errcode = 'P0001', hint = 'union_envio_ya_recibido';
    end if;
    if exists (select 1 from retail.despacho_conteos k where k.despacho_id = v_propio.id and k.contadas > 0) then
      raise exception 'El envío de esa compra (%) ya tiene prendas contadas: no se une sola; revísalo con Compras', retail.fn_envio_numero_texto(v_propio.numero)
        using errcode = 'P0001', hint = 'union_envio_con_conteo';
    end if;
  end loop;

  -- La compra sale de su envío propio: se anula y, si llevaba otras compras, nace otro en camino con las demás.
  for v_propio in
    select d.id, d.estado, d.numero, d.numero_guia, d.nota, d.despachado_por, d.bultos, d.ubicacion_destino_id
      from retail.despachos d
     where d.estado in ('en_camino', 'abierto')
       and exists (select 1 from retail.despacho_items di join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                     join retail.ordenes_compra o on o.id = i.orden_compra_id
                    where di.despacho_id = d.id and o.papel_id = p_papel_id)
     order by d.id
  loop
    if v_propio.estado = 'abierto' then
      perform set_config('retail.cancelando', 'si', true);
    end if;
    begin
      update retail.despachos d
         set estado = 'anulado', anulado_por = v_actor, anulado_en = now(),
             motivo_anulacion = left('Una de sus compras llegó por la recepción ' || v_envio || ' y se unió a ella', 300)
       where d.id = v_propio.id;
    exception when others then
      perform set_config('retail.cancelando', '', true);
      raise;
    end;
    perform set_config('retail.cancelando', '', true);
    v_anulados := v_anulados || v_propio.id;

    if exists (select 1 from retail.despacho_items di join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                 join retail.ordenes_compra o on o.id = i.orden_compra_id
                where di.despacho_id = v_propio.id and o.papel_id is distinct from p_papel_id) then
      insert into retail.despachos (ubicacion_destino_id, numero_guia, nota, despachado_por, bultos)
      values (v_propio.ubicacion_destino_id, v_propio.numero_guia,
              left(concat_ws(' · ', v_propio.nota, 'Reemplaza a la ' || retail.fn_envio_numero_texto(v_propio.numero)), 500),
              v_propio.despachado_por, v_propio.bultos)
      returning id into v_nuevo;
      insert into retail.despacho_items (despacho_id, orden_compra_item_id, compra_item_id, cantidad, categoria_id, marca_id, descripcion, precio_unitario)
      select v_nuevo, di.orden_compra_item_id, di.compra_item_id, di.cantidad, di.categoria_id, di.marca_id, di.descripcion, di.precio_unitario
        from retail.despacho_items di join retail.orden_compra_items i on i.id = di.orden_compra_item_id
        join retail.ordenes_compra o on o.id = i.orden_compra_id
       where di.despacho_id = v_propio.id and o.papel_id is distinct from p_papel_id
       order by di.id;
      v_nuevos := v_nuevos || v_nuevo;
    end if;
  end loop;
  -- La unión, con la foto de qué envíos se movieron. Desde aquí «por mandar» de esta compra es 0 y el tope (que se evalúa al final de la
  -- transacción) la rechaza en cualquier envío vivo: el envío nuevo de arriba no lleva ninguna línea suya.
  begin
    insert into retail.compra_papel_llegadas (papel_id, despacho_id, proveedor_id, unido_por, token, prendas_papel, prendas_recibidas, monto_papel,
                                              valor_recibido, envios_anulados, envios_nuevos)
    values (p_papel_id, p_despacho_id, v_prov, v_actor, p_token, v_prendas_papel, v_recibidas, v_p.monto, v_valor, v_anulados, v_nuevos);
  exception when unique_violation then
    raise exception 'Esa unión ya se guardó con otros datos: recarga la pantalla' using errcode = 'P0001', hint = 'union_papel_ya_unido';
  end;

  -- Con la recepción ya cerrada, el papel intenta pasar al libro ahora; abierta, pasará al cerrarla.
  if v_d.estado = 'cerrado' then
    v_paso := retail.fn_papel_pasa_solo(p_papel_id);
    v_motivo := (select c.pasa_sola_error from retail.compra_papeles c where c.id = p_papel_id);
  end if;

  begin
    perform retail.fn_actividad_anotar(
      'recibir', 'recepcion_unida_a_compra',
      'unió la recepción ' || v_envio || ' con una compra de '
        || coalesce((select pr.nombre from retail.proveedores pr where pr.id = v_prov), 'un proveedor')
        || ' (' || v_prendas_papel || ' prendas compradas, ' || v_recibidas || ' llegadas)',
      v_actor, retail.fn_actividad_terminal_ahora(), v_d.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'envio', v_envio, 'papel_id', p_papel_id, 'prendas_papel', v_prendas_papel,
                         'prendas_recibidas', v_recibidas, 'envios_anulados', to_jsonb(v_anulados), 'envios_nuevos', to_jsonb(v_nuevos)),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la unión de % (%)', v_envio, sqlerrm;
  end;

  return jsonb_build_object('unido', true, 'repetido', false, 'papel_id', p_papel_id, 'despacho_id', p_despacho_id,
                            'paso_al_libro', v_paso, 'motivo', v_motivo,
                            'envios_anulados', to_jsonb(v_anulados), 'envios_nuevos', to_jsonb(v_nuevos),
                            'prendas_papel', v_prendas_papel, 'prendas_recibidas', v_recibidas);
end $$;

comment on function retail.unir_recepcion_con_compra(uuid, uuid, uuid) is
  'ADR-0636: une una recepción «sin aviso» con la compra pagada (papel) a la que pertenece. Saca la compra de su envío propio (lo anula y, si llevaba otras, crea otro con las demás), impide reenviarla y deja que el papel pase al libro cuando la recepción está cerrada. No se deshace.';
revoke all on function retail.unir_recepcion_con_compra(uuid, uuid, uuid) from public, anon;
grant execute on function retail.unir_recepcion_con_compra(uuid, uuid, uuid) to authenticated;
revoke all on function retail.fn_papel_llegada_reparte() from public, anon, authenticated;
revoke all on function retail.fn_compra_papel_llegadas_fija() from public, anon, authenticated;

-- ---------- 8. El Balance: una compra unida ya está en la tienda ----------
create or replace function retail.fn_mercaderia_pagada(p_corte date)
returns table(papel_id uuid, fecha date, pagado numeric, base numeric, igv numeric, en_tienda boolean)
language sql
stable
set search_path = retail, public, extensions
as $$
  with x as (
    -- El MISMO conjunto que ya se resta del fondo en Cuentas y dinero y en el Flujo (ADR-0621): no hay segunda definición de «pagado».
    select p.id, p.fecha, p.tipo, -f.monto as pagado
      from retail.fn_fondo_por_completar(p_corte) f
      join retail.compra_papeles p on f.clave = 'papel:' || p.id::text
     where f.origen = 'papel'
  )
  select x.id, x.fecha, x.pagado,
         case when x.tipo = 'factura' then round(x.pagado / (1 + retail.fn_tasa_igv(x.fecha)), 2) else x.pagado end,
         case when x.tipo = 'factura' then x.pagado - round(x.pagado / (1 + retail.fn_tasa_igv(x.fecha)), 2) else 0 end,
         -- «En la tienda»: llegó por una recepción unida (ADR-0636, paso 2), o todo mandado y todos sus envíos cerrados
         -- (lo mismo que mira `fn_papel_pasa_solo`); lo que falta es el papel.
         exists (select 1 from retail.compra_papel_llegadas l where l.papel_id = x.id)
         or (not exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                          where o.papel_id = x.id and o.estado <> 'anulada' and retail.fn_compra_item_por_mandar(i.id) > 0)
             and not exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                               join retail.despacho_items di on di.orden_compra_item_id = i.id join retail.despachos d on d.id = di.despacho_id
                              where o.papel_id = x.id and o.estado <> 'anulada' and d.estado in ('en_camino', 'abierto'))
             and exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                           join retail.despacho_items di on di.orden_compra_item_id = i.id join retail.despachos d on d.id = di.despacho_id
                          where o.papel_id = x.id and o.estado <> 'anulada' and d.estado = 'cerrado'))
    from x;
$$;
revoke all on function retail.fn_mercaderia_pagada(date) from public, anon, authenticated;
