-- ============================================================================
-- 20261021195000_campanas_web_endurecer.sql — Tienda web ▸ Campañas: lo que dejó el /chaos del 2026-10-21 (semilla 2110)
--
-- EL PROBLEMA PRIMERO. Atacando la pantalla a propósito aparecieron tres cosas, ninguna con un estado imposible en la base:
--   1. (gravedad 4) Si la respuesta de «Programar» o «Pasar a borrador» se pierde (se cortó el internet justo después de que la base guardó),
--      la persona reintenta con la versión que tenía y la base le dice «Alguien cambió esta campaña»: culpa a otra persona de algo que hizo ella.
--   2. (gravedad 2, leve) El CHECK de la ruta de la imagen solo pedía «campanas/%»: aceptaba `campanas/../x.webp` o `campanas/x`, que la tienda rechaza
--      (solo deja pasar la forma que sube el ERP). El diseño quedaba «programado» pero sin imagen, en silencio.
--   3. (gravedad 4) El tope de 20 enlaces de vista previa por campaña se contaba sin bloquear: con 25 pedidos a la vez quedaron 24.
--
-- LO QUE HACE
--   1. `fn_campana_web_cambiar_estado`: si el diseño YA está en el estado pedido, responde bien (sin escribir ni anotar), aunque la versión sea la
--      de antes. Con la versión vieja y el estado distinto sigue frenando: ahí sí otra persona cambió algo. Pedir lo que ya quedó hecho no pisa a nadie.
--   2. Los CHECK de `imagen_ruta` y `imagen_vertical_ruta` piden la MISMA forma que la tienda deja pasar
--      (`packages/shared/src/campana-imagen.ts`: `campanas/<uuid>/<uuid>.webp|jpg`, minúsculas).
--   3. `crear_campana_vista_previa` bloquea la fila del diseño antes de contar: dos pedidos a la vez se ponen en fila y el último cupo es de uno solo.
--
-- DESCARTÉ
--   · Quitar la comprobación de la versión en programar: dos personas que programan y pasan a borrador a la vez se pisarían.
--   · Dejar el regex solo en la web: la base es la que hace cumplir la forma (principio 2).
--
-- PRODUCCIÓN. NO está aplicada. Pide antes 20261021161000 y 20261021194000. Una parte: `alter` de una tabla que todavía no existe en producción y funciones;
-- sin `create policy` (ADR-0195). Se puede volver a correr.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 2. La ruta de la imagen, con la forma que sube el ERP ----------
alter table retail.campana_web_disenos drop constraint if exists campana_web_disenos_imagen_ruta;
alter table retail.campana_web_disenos drop constraint if exists campana_web_disenos_imagen_vertical;
alter table retail.campana_web_disenos drop constraint if exists campana_web_disenos_imagen_ruta_forma;
alter table retail.campana_web_disenos drop constraint if exists campana_web_disenos_imagen_vertical_forma;

alter table retail.campana_web_disenos
  add constraint campana_web_disenos_imagen_ruta_forma check (
    imagen_ruta is null
    or imagen_ruta ~ '^campanas/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'),
  add constraint campana_web_disenos_imagen_vertical_forma check (
    imagen_vertical_ruta is null
    or (imagen_ruta is not null
        and imagen_vertical_ruta ~ '^campanas/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'));

-- ---------- 1. Pedir lo que ya quedó hecho no es «otra persona cambió algo» ----------
create or replace function retail.fn_campana_web_cambiar_estado(p_etiqueta_id uuid, p_version integer, p_programar boolean)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_nombre text;
  v_hasta date;
  v_fila retail.campana_web_disenos%rowtype;
  v_llega text := case when p_programar then 'programado' else 'borrador' end;
begin
  perform retail.fn_exigir_modulo('campanas_web');
  v_actor := retail.fn_actor_persona_id(true);

  if p_etiqueta_id is null or not retail.fn_campana_web_valida(p_etiqueta_id) then
    raise exception 'campana_no_existe' using hint = 'Esa campaña ya no existe o dejó de ser una campaña. Vuelve a la lista.';
  end if;
  select e.nombre, e.vigente_hasta into v_nombre, v_hasta from retail.etiquetas e where e.id = p_etiqueta_id;
  if v_hasta is not null and v_hasta < v_hoy then
    raise exception 'campana_terminada' using hint = format('«%s» ya terminó: su diseño no se cambia.', v_nombre);
  end if;

  select * into v_fila from retail.campana_web_disenos where etiqueta_id = p_etiqueta_id for update;
  if not found then
    raise exception 'campana_sin_diseno' using hint = 'Esta campaña todavía no tiene diseño: guárdalo primero como borrador.';
  end if;

  -- Ya está como se pide (típicamente: se perdió la respuesta de la vez anterior y se reintenta con la versión de antes): ni se escribe ni se anota.
  if v_fila.estado = v_llega then
    return retail.fn_campana_diseno_json(p_etiqueta_id);
  end if;

  if p_version is null or p_version <> v_fila.version then
    raise exception 'campana_cambio_otro' using hint = 'Esta campaña cambió mientras la tenías abierta. Vuelve a abrirla.';
  end if;

  if p_programar and not (v_fila.donde_franja or v_fila.donde_portada or v_fila.donde_catalogo or v_fila.donde_sello or v_fila.donde_bolsa) then
    raise exception 'campana_diseno_incompleto' using hint = 'Enciende al menos una pieza de la tienda en «Dónde se ve»: si no, programarlo no cambiaría nada.';
  end if;

  update retail.campana_web_disenos
     set estado = v_llega, version = version + 1, actualizado_en = now(), actualizado_por = v_actor
   where etiqueta_id = p_etiqueta_id;

  perform retail.fn_campana_web_anotar(
    case when p_programar then 'campana_diseno_programado' else 'campana_diseno_a_borrador' end,
    '«' || v_nombre || '»: ' || case when p_programar then 'programó su diseño (la tienda lo muestra mientras dure la campaña)' else 'volvió su diseño a borrador (la tienda lo deja de mostrar)' end,
    v_actor, p_etiqueta_id::text,
    jsonb_build_object('etiqueta_id', p_etiqueta_id, 'estado', v_llega));

  return retail.fn_campana_diseno_json(p_etiqueta_id);
end;
$fn$;
revoke all on function retail.fn_campana_web_cambiar_estado(uuid, integer, boolean) from public, anon, authenticated;

-- ---------- 3. El tope de enlaces, en fila ----------
create or replace function retail.crear_campana_vista_previa(p_etiqueta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_nombre text;
  v_hasta date;
  v_llave text;
  v_expira timestamptz := now() + interval '7 days';
begin
  perform retail.fn_exigir_modulo('campanas_web');
  v_actor := retail.fn_actor_persona_id(true);

  if p_etiqueta_id is null or not retail.fn_campana_web_valida(p_etiqueta_id) then
    raise exception 'campana_no_existe' using hint = 'Esa campaña ya no existe o dejó de ser una campaña. Vuelve a la lista.';
  end if;
  select e.nombre, e.vigente_hasta into v_nombre, v_hasta from retail.etiquetas e where e.id = p_etiqueta_id;
  if v_hasta is not null and v_hasta < v_hoy then
    raise exception 'campana_terminada' using hint = format('«%s» ya terminó: su diseño no se cambia.', v_nombre);
  end if;
  -- Bloquear la fila del diseño: dos pedidos a la vez se ponen en fila y cada uno cuenta lo que dejó el anterior (el tope de 20 se cumple).
  perform 1 from retail.campana_web_disenos where etiqueta_id = p_etiqueta_id for update;
  if not found then
    raise exception 'campana_sin_diseno' using hint = 'Esta campaña todavía no tiene diseño: guárdalo primero como borrador.';
  end if;

  delete from retail.campana_web_previas where etiqueta_id = p_etiqueta_id and expira_en < now();
  if (select count(*) from retail.campana_web_previas where etiqueta_id = p_etiqueta_id) >= 20 then
    raise exception 'campana_previa_demasiadas' using hint = 'Esta campaña ya tiene 20 enlaces de vista previa vivos. Espera a que venzan los anteriores.';
  end if;

  v_llave := encode(gen_random_bytes(24), 'hex');
  insert into retail.campana_web_previas (etiqueta_id, huella, expira_en, creado_por)
  values (p_etiqueta_id, encode(digest(v_llave, 'sha256'), 'hex'), v_expira, v_actor);

  perform retail.fn_campana_web_anotar(
    'campana_vista_previa_creada',
    '«' || v_nombre || '»: creó un enlace de vista previa privada (dura 7 días)',
    v_actor, p_etiqueta_id::text, jsonb_build_object('etiqueta_id', p_etiqueta_id));

  return jsonb_build_object('llave', v_llave, 'expira_en', v_expira);
end;
$fn$;

reset lock_timeout;
