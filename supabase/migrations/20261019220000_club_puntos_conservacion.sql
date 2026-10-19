-- ============================================================================
-- 20261019220000_club_puntos_conservacion.sql — CAYLA V2 · Club · puntos, actividad 9 de 12: a los 3 años sin compras se eliminan los datos Y los puntos
-- Sigue a `20261019215000_club_puntos_modulo_beneficios.sql`. Cambia dos funciones del Club (la anonimización y el cron de conservación).
--
-- EL PROBLEMA. Felipe decidió (2026-10-19) que, pasados 3 años sin compras, se eliminen los datos del cliente Y sus puntos, y que conste en
-- los Términos (5.7) y en la Política. La anonimización que ya existe (ADR-0288 G-15, Ley 29733) borra los datos de la ficha pero deja el
-- saldo de puntos tal cual: una ficha anónima con puntos que nadie puede gastar, y un libro de puntos que ya no cuadra con la realidad.
--
-- QUÉ HACE
--   1. `fn_club_puntos_perder(clienta, nota)`: anota el movimiento «pierde» por todo el saldo (queda escrito que se fueron, sin ningún dato
--      de la persona) y el saldo baja a 0.
--   2. `fn_clienta_anonimizar` llama a esa función ANTES de vaciar la ficha (la misma rutina que usan los tres caminos: archivar desde el
--      ERP, la conservación de 3 años y «Eliminar mi cuenta» de la tienda). Así los puntos se eliminan con los datos, vengan de donde
--      vengan: nadie queda con puntos y sin ficha. Es un reemplazo anclado: si la función cambió, aborta sin tocar nada.
--   3. `fn_club_anonimizar_inactivas` (el cron diario) usa `fn_club_conservacion_hasta` (la misma fecha que «Mi Club» le muestra a la
--      persona: 3 años desde su última compra, y se elimina al día siguiente) y procesa cada ficha aparte: una que no se pueda
--      anonimizar (un pedido pagado sin entregar, una llave tomada) se avisa en el registro y NO frena a las demás.
--
-- DECIDÍ: los cupones vivos NO se tocan. Un cupón es al portador y ya no son puntos: sigue valiendo hasta su fecha (máximo 7 días) y, si
--   vence, no devuelve nada a una ficha anónima (`fn_club_cupones_vencer`, actividad 3).
-- DECIDÍ: el movimiento «pierde» se queda. El libro de puntos es de solo agregar (principio 4): la historia de que esos puntos existieron y
--   se eliminaron es lo que permite auditar. No lleva ningún dato de la persona (la ficha ya es anónima).
-- DESCARTÉ: eliminar el aviso de los 30 días de esta actividad. Lo pide el texto legal («Te avisamos 30 días antes por WhatsApp si lo
--   autorizaste»): es un tipo nuevo de aviso de Clientes ▸ Avisos y se hace junto con el resto de los textos de Avisos (actividad 10).
-- SE ROMPE SI: alguien llama `fn_clienta_anonimizar` y le quita la llamada de puntos al reemplazarla de nuevo (la prueba «la ficha anonimizada
--   no deja puntos» lo detecta) o suma puntos a una ficha anonimizada (`fn_club_puntos_anotar` lo rechaza: clienta_anonimizada).
--
-- CÓMO SE PEGA: este archivo SOLO en el SQL Editor de producción, después de `20261019215000`. Idempotente. `lock_timeout` 3 s. Sin políticas
--   ni `drop trigger`. Los reemplazos anclados van entre `$v$` y no llevan `select … into` dentro de un texto entre comillas.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Eliminar los puntos de una ficha ----------
create or replace function retail.fn_club_puntos_perder(p_clienta_id uuid, p_nota text default null)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_saldo integer;
begin
  -- Sin saldo no hay nada que eliminar (y una ficha que nunca fue miembro no tiene fila de saldo).
  select s.saldo into v_saldo from retail.club_puntos_saldos s where s.clienta_id = p_clienta_id;
  if coalesce(v_saldo, 0) <= 0 then
    return 0;
  end if;
  perform retail.fn_club_puntos_anotar(p_clienta_id, 'pierde', -v_saldo, null, null, null,
                                       coalesce(nullif(btrim(p_nota), ''), 'Eliminados con los datos de la ficha'), null);
  return v_saldo;
end;
$$;
comment on function retail.fn_club_puntos_perder(uuid, text) is
  'Elimina los puntos de una ficha que se anonimiza (Términos 5.7): anota «pierde» por todo su saldo y el saldo queda en 0. Devuelve cuántos eliminó. Interna: la llama fn_clienta_anonimizar antes de vaciar la ficha.';
revoke all on function retail.fn_club_puntos_perder(uuid, text) from public, anon, authenticated;

-- ---------- 2. La anonimización elimina también los puntos ----------
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

select pg_temp.reemplazar(
  'retail.fn_clienta_anonimizar(uuid, uuid, boolean, text)',
  $v$  update retail.clientas set
    archivada_por = case when archivada_en is null then p_persona else archivada_por end,$v$,
  $v$  -- Sus puntos se eliminan con sus datos (Términos 5.7): «pierde» deja escrito que se fueron, sin datos suyos, y el saldo baja a 0.
  -- Va ANTES de vaciar la ficha: solo una miembro tiene puntos. Si falla, falla la anonimización entera (nadie queda con puntos sin ficha).
  if v_club_desde is not null then
    perform retail.fn_club_puntos_perder(p_id, v_nota);
  end if;

  update retail.clientas set
    archivada_por = case when archivada_en is null then p_persona else archivada_por end,$v$,
  1);

-- ---------- 3. El cron de la conservación: la misma fecha que ve la persona, una ficha a la vez ----------
create or replace function retail.fn_club_anonimizar_inactivas()
returns integer
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select c.id
      from retail.clientas c
     where not c.anonimizada
       and c.fusionada_en_id is null
       -- La fecha que «Mi Club» le muestra a la persona (3 años desde su última compra): se elimina al DÍA SIGUIENTE.
       and retail.fn_club_conservacion_hasta(c.id) < retail.fn_hoy_lima()
       and not exists (select 1 from retail.separaciones s where s.clienta_id = c.id and s.estado = 'abierta')
     order by c.id
       for update of c skip locked
  loop
    -- Cada ficha aparte: una que no se puede anonimizar (un pedido pagado sin entregar, un fallo de la base) se avisa y no frena a las demás.
    begin
      perform retail.fn_clienta_anonimizar(r.id, null, true);
      v_n := v_n + 1;
    exception when others then
      raise warning 'conservación: no se pudo anonimizar la ficha % (%)', r.id, sqlerrm;
    end;
  end loop;

  update retail.club_intentos_registro i set celular = null
   where i.celular is not null and i.creado_en < now() - interval '1 day';

  return v_n;
end;
$$;
comment on function retail.fn_club_anonimizar_inactivas() is
  'La conservación del club (ADR-0288 G-15; puntos, actividad 9): anonimiza las fichas que pasaron su fecha de conservación (3 años desde su última compra, o desde que se registró o se unió: fn_club_conservacion_hasta, la misma que ve la persona en «Mi Club») con la rutina de archivar_clienta, sin persona y con su nota, y sus puntos se eliminan con ella (movimiento pierde). No toca una con apartado abierto. Cada ficha en su propio bloque: una que falle no frena a las demás. Vacía el celular de los intentos del cartel de más de un día. Devuelve cuántas anonimizó. Solo el servidor (cron diario con CRON_SECRET).';

reset lock_timeout;
