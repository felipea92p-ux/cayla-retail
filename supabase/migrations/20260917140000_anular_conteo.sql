-- Conteo físico: cancelar un conteo abierto por error, sin tocar stock
-- (Felipe, 2026-09-17)
--
-- Problema real: abrir_conteo no tenía reversa. Si alguien lo abría con el
-- alcance equivocado (categoría, piso/almacén) o por error, no había forma
-- de salir — "Revisar y cerrar conteo" queda deshabilitado hasta contar al
-- menos una prenda, y cerrar_conteo ajusta el stock según lo contado, así
-- que tampoco sirve como "deshacer". El esquema ya reservaba el estado
-- 'anulado' para esto desde el diseño original (0002_esquema.sql) — nunca
-- se conectó a ninguna RPC.
--
-- anular_conteo() nunca toca stock/movimientos: cerrar_conteo() es la única
-- función que los toca, y solo al cerrar. Contar (conteo_contar) únicamente
-- escribe en conteo_items, así que cancelar después de haber contado
-- algunas prendas es igual de seguro que cancelar sin haber contado
-- ninguna — no hay nada que revertir en el inventario. Los conteo_items ya
-- escritos se quedan como están (nunca se borran, mismo principio que el
-- resto del repo) — quedan huérfanos bajo un conteo anulado, no
-- confundibles con uno cerrado de verdad.
--
-- Permiso: el mismo que abrir_conteo/conteo_contar (fn_puede_operar_ubicacion,
-- no exige líder) — a diferencia de cerrar_conteo, que sí ajusta stock y por
-- eso exige fn_es_lider(). Cancelar es reversible y sin consecuencia en el
-- inventario, así que no tiene sentido pedir más permiso del que ya hizo
-- falta para abrir el conteo en primer lugar.
create function retail.anular_conteo(p_conteo_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c conteos%rowtype;
  v_persona uuid;
begin
  select * into c from conteos where id = p_conteo_id for update;
  if not found then
    raise exception 'El conteo % no existe', p_conteo_id;
  end if;
  if c.estado <> 'abierto' then
    raise exception 'Ese conteo ya está %', c.estado;
  end if;
  if not fn_puede_operar_ubicacion(c.ubicacion_id) then
    raise exception 'No tienes permiso sobre esa ubicación';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  update conteos set estado = 'anulado', cerrado_en = now(), cerrado_por = v_persona
  where id = p_conteo_id;
end;
$$;

revoke all on function retail.anular_conteo(uuid) from public;
grant execute on function retail.anular_conteo(uuid) to authenticated;
