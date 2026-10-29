-- ============================================================================
-- Mis compras · el papel de una compra pasa SOLO a los libros cuando la tienda cierra el conteo (ADR-0574, actividad 4 de 7).
--
-- EL PROBLEMA PRIMERO. Cuando la tienda terminaba de contar lo que llegó, la compra quedaba «por completar» hasta que una persona de Compras abría
-- el papel, copiaba la serie y el número de la foto y apretaba «Completar» (`completar_papel_compra`): recién ahí nacía el comprobante en el libro
-- de compras, pagado desde el fondo de quien compró. Felipe, 2026-10-29: «Compras no tiene que revisar y confirmar estos movimientos, solo lo
-- puede ver como historial». Desde la actividad 3 la compradora escribe la serie y el número al comprar, así que ya no falta ningún dato.
--
-- QUÉ HACE.
--   1. Un disparador en `despachos`: cuando un envío pasa a «cerrado» (la tienda terminó de contar), cada compra que tenía prendas en ese envío
--      intenta pasar sola a los libros (`fn_papel_pasa_solo`). Si a la compra todavía le falta mandar prendas o tiene otro envío abierto o en
--      camino, no hace nada: lo intentará el último envío que se cierre. Si es factura o boleta de antes de la actividad 3 (sin serie ni número),
--      tampoco: la completa Compras como siempre.
--   2. `fn_papel_pasa_solo` llama a la MISMA `completar_papel_compra` de siempre (mismo comprobante, mismo pago desde el fondo, misma recepción
--      «recibido antes»), con la serie y el número que escribió la compradora. Dos reemplazos anclados en esa función (el modo se avisa con la
--      configuración `retail.papel_pasa_sola`, solo dentro de esta función interna): no pide el módulo «Revisar compras» y el actor es la propia
--      compradora, sin la regla «nadie completa el papel de su propia compra» (decisión de Felipe: nadie revisa lo de nadie, es historial).
--   3. Si al pasar sola algo falla (un comprobante repetido que otro registró en el libro, un proveedor que ya no existe…), el cierre del conteo
--      NO se cae (principio 9): la compra queda «por completar» con el motivo en `compra_papeles.pasa_sola_error`, y Compras la corrige como hoy.
--
-- Con esto, cerrar el conteo es definitivo para la compra: un envío cuya compra ya pasó a los libros no se reabre (`reabrir_papel_completado`, regla
-- de siempre de 20261023143000), como cuando Compras la completaba, solo que ahora ocurre al cerrar.
--
-- Solo una columna, dos funciones y un disparador (`create or replace trigger`, sin `drop trigger`: ADR-0195). Idempotente.
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

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

-- ---------- 1. Por qué no pasó sola ----------
alter table retail.compra_papeles add column if not exists pasa_sola_error text;
comment on column retail.compra_papeles.pasa_sola_error is
  'ADR-0574: por qué el papel no pasó solo a los libros cuando la tienda cerró el conteo (lo que respondió la base). Nulo si pasó o si todavía no le tocaba.';

-- ---------- 2. Completar, en modo «pasa solo» ----------
select pg_temp.reemplazar('retail.completar_papel_compra(uuid,uuid,text,text,numeric)',
$v$  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Completar el papel de una compra necesita el módulo Revisar compras en tu rol.' using errcode = '42501';$v$,
$v$  -- Pasa solo (ADR-0574): `fn_papel_pasa_solo` avisa con esta configuración, solo dentro de su propia transacción, que es ESTE papel.
  if not retail.fn_ve_modulo('fondos') and coalesce(current_setting('retail.papel_pasa_sola', true), '') <> p_papel_id::text then
    raise exception 'Completar el papel de una compra necesita el módulo Revisar compras en tu rol.' using errcode = '42501';$v$, 1);

select pg_temp.reemplazar('retail.completar_papel_compra(uuid,uuid,text,text,numeric)',
$v$  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién completa el papel.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_fondo_exigir_otra_persona(v_p.persona_id, v_actor, 'Nadie completa el papel de su propia compra');$v$,
$v$  if coalesce(current_setting('retail.papel_pasa_sola', true), '') = v_p.id::text then
    -- Pasa solo (ADR-0574): firma la propia compradora y no hay quien «revise» lo suyo.
    v_actor := v_p.persona_id;
  else
    v_actor := retail.fn_actor_persona_id(true);
    if v_actor is null then
      raise exception 'Elige quién completa el papel.' using errcode = '42501', hint = 'responsable_requerido';
    end if;
    perform retail.fn_fondo_exigir_otra_persona(v_p.persona_id, v_actor, 'Nadie completa el papel de su propia compra');
  end if;$v$, 1);

select pg_temp.reemplazar('retail.completar_papel_compra(uuid,uuid,text,text,numeric)',
$v$  update retail.compra_papeles set estado = 'completado' where id = v_p.id;$v$,
$v$  update retail.compra_papeles set estado = 'completado', pasa_sola_error = null where id = v_p.id;$v$, 1);

select pg_temp.reemplazar('retail.completar_papel_compra(uuid,uuid,text,text,numeric)',
$v$      'completó el papel ' || v_documento || ' de la compra de '$v$,
$v$      case when coalesce(current_setting('retail.papel_pasa_sola', true), '') = v_p.id::text then 'pasó solo a los libros el papel ' else 'completó el papel ' end
        || v_documento || ' de la compra de '$v$, 1);

-- ---------- 3. Pasar un papel solo ----------
-- Interna: la llama el disparador de abajo (y las pruebas). Devuelve verdadero si el papel quedó en los libros.
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
  if exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
              where o.papel_id = v_p.id and o.estado <> 'anulada' and retail.fn_compra_item_por_mandar(i.id) > 0)
     or exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                  join retail.despacho_items di on di.orden_compra_item_id = i.id join retail.despachos d on d.id = di.despacho_id
                 where o.papel_id = v_p.id and o.estado <> 'anulada' and d.estado in ('en_camino', 'abierto'))
     or not exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                      join retail.despacho_items di on di.orden_compra_item_id = i.id join retail.despachos d on d.id = di.despacho_id
                     where o.papel_id = v_p.id and o.estado <> 'anulada' and d.estado = 'cerrado') then
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
revoke all on function retail.fn_papel_pasa_solo(uuid) from public, anon, authenticated;

-- ---------- 4. El disparador: la tienda cerró el conteo ----------
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
revoke all on function retail.fn_despacho_pasa_papeles_a_libros() from public, anon, authenticated;

-- Va DESPUÉS de `trg_despacho_recibido_por_quien_compro` (los disparadores del mismo evento corren por orden de nombre).
create or replace trigger trg_despacho_recibido_z_papel_a_libros
  after update of estado on retail.despachos
  for each row
  when (new.estado = 'cerrado' and old.estado is distinct from 'cerrado')
  execute function retail.fn_despacho_pasa_papeles_a_libros();
