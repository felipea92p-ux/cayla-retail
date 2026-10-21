-- ============================================================================
-- 20261015131000_clientas_anonimizar_espera_pedido_pagado.sql — CAYLA V2 · Clientes (ADR-0288) y tienda online (ADR-0408)
-- PARTE 1 de 2 de «Mi cuenta» (la PARTE 2 es 20261015132000).
--
-- EL PROBLEMA PRIMERO. Dos decisiones de Felipe (2026-10-15) pasan por la MISMA rutina de anonimizar (`fn_clienta_anonimizar`, la de
-- la conservación del Club y la de «Archivar ▸ Anonimizar» del ERP):
--   1. «Anonimizar una ficha desde el ERP con un pedido web pagado sin entregar: espera hasta que se entregue o se anule.» Hasta hoy la
--      hoja de archivar solo AVISABA (20261015123000): se podía anonimizar a quien ya pagó una prenda que todavía no recogió. Su cuenta
--      de la tienda online se cerraba en la misma escritura (`clientas_cuenta_web_al_anonimizar`) y ya no podía ver su código para
--      recoger; la tienda, sin su nombre ni su celular, no tenía a quién avisarle; y el dinero quedaba cobrado por una prenda sin dueño.
--   2. «Eliminar cuenta» en la tienda online borra la cuenta Y los datos de la ficha (ella lo pide desde «Mi cuenta», PARTE 2). Es la
--      misma anonimización de siempre, pero sin una persona del ERP que la firme y sin ser la conservación de 3 años: la rutina exigía
--      quién lo hace (`responsable_requerido`) o el modo automático, cuya nota dice «3 años sin compras» (falso en este caso).
--
-- ANALOGÍA CAYLA. El cuaderno de clientes: tachar una página es la misma tachadura la haga la encargada, la libreta de los 3 años o la
-- propia persona. Lo que cambia es la nota al margen (quién lo pidió). Y no se tacha la página de alguien que tiene un paquete pagado
-- esperando en el mostrador: primero se le entrega o se le devuelve el dinero.
--
-- QUÉ HACE
--   `fn_clienta_anonimizar` gana un cuarto parámetro, `p_pedido_por_ella text default null`. Su único valor hoy es 'tienda_web' (ella lo
--   pidió desde su cuenta de la tienda online): sin persona y sin ser automática, con su nota en `club_permisos` («a pedido suyo, desde
--   su cuenta de la tienda online»), su motivo en la ficha y su frase en la actividad. Y en los TRES caminos (la persona del ERP, la
--   conservación y ella) una ficha con un pedido web PAGADO y sin entregar no se anonimiza: P0001, hint `anonimizar_pedido_web_pagado`,
--   detail con los códigos de esos pedidos («W-0012, W-0015»). Archivar SIN anonimizar sigue igual (no pasa por aquí).
--   La firma cambia: se crea la de 4 parámetros y se BORRA la de 3. Sus dos llamadores (`archivar_clienta` y
--   `fn_club_anonimizar_inactivas`) la llaman con tres argumentos y PostgreSQL resuelve a la nueva por su valor por defecto: sus cuerpos
--   (y sus md5, que vigilan las tandas del Club) no se tocan.
--
-- DECIDÍ: la espera vive en la RUTINA, no en `archivar_clienta`. Así vale para los tres caminos y nadie puede saltársela con otra
--   función: la conservación ya no anonimizaba a quien tiene un pedido en curso (20261015055000, que filtra antes de llamar), y «Eliminar
--   cuenta» frena con MÁS (todo pedido en curso y todo apartado abierto: PARTE 2); esta es la red de abajo para todos. Y
--   `archivar_clienta` queda igual: las pruebas del Club comparan su md5 con el de la tanda 1g (`club_permisos`, `club_venta_ligada`,
--   `clientas_por_modulo_y_anonimizar`, `club_cumpleanos`).
-- DECIDÍ: solo PAGADO, como lo decidió Felipe para el ERP. Un pedido «por confirmar» o «confirmado sin pagar» la hoja lo sigue AVISANDO
--   y deja seguir: la tienda lo resuelve en Pedidos web (no lo confirma, o lo anula) y nada queda cobrado. «Eliminar cuenta» sí frena
--   con ellos: ella no los puede anular sola y dejaría un pedido sin dueño (PARTE 2).
-- DECIDÍ: el mensaje no nombra a la persona (la ficha ya está abierta en pantalla) y dice qué hacer: esperar a que lo recoja o que se
--   anule el pedido. El detail lleva los códigos para quien quiera ir a buscarlos.
-- DECIDÍ: `p_pedido_por_ella` y no reinterpretar `p_automatica`: la conservación (automática, nota de 3 años) y ella (a pedido suyo) son
--   cosas distintas en la historia del Club (Ley 29733: quién pidió la cancelación queda anotado). Un texto y no un booleano: si mañana
--   ella lo pide por otro medio (el cartel, WhatsApp), es otro valor, no otro parámetro.
-- DESCARTÉ: una anonimización nueva para «Eliminar cuenta» (Felipe: «usa la que ya existe»): dos rutinas que borran datos personales
--   terminan borrando cosas distintas.
-- DESCARTÉ: frenar también «confirmado» en el ERP: no lo decidió Felipe (queda como pregunta en el informe de esta tanda, con la nota de
--   que un pedido confirmado TODAVÍA se puede cobrar después de anonimizar: esa espera tendría que vivir también en el cobro).
--
-- SE ROMPE SI: alguien vuelve a crear la firma de 3 parámetros al lado de esta (las dos responderían a una llamada de tres argumentos:
--   «la función no es única»; el candado de versión de abajo y `pnpm pruebas:clientas-anonimizar-espera` lo marcan), o una migración
--   futura recrea esta rutina desde el archivo de la tanda 1g (perdería la espera).
--
-- PRODUCCIÓN. NO está aplicada. Va DESPUÉS de la tanda 1g del Club (la rutina de 3 parámetros) y de las migraciones de la tienda online
-- que crean `pedidos_web` (20261014235000). Una sola parte, idempotente (se puede pegar dos veces). No toca tablas: borra y crea una
-- función (`drop function` no toma las tablas de `auth` ni de `storage`; CLAUDE.md, «Políticas y deadlocks»). Sin políticas ni
-- `drop trigger`, y ningún `select … into` dentro de un texto entre comillas. Se puede pegar antes de publicar la web: el ERP de antes
-- llama `archivar_clienta` igual, y si la hoja de antes intenta anonimizar con un pedido pagado, recibe el mensaje de la base.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select p.oid::regprocedure from pg_proc p where p.proname = 'fn_clienta_anonimizar';
--     → una sola fila: retail.fn_clienta_anonimizar(uuid,uuid,boolean,text)
--   select has_function_privilege('authenticated', 'retail.fn_clienta_anonimizar(uuid,uuid,boolean,text)', 'execute');   → f
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Lo que da por hecho y el candado de versión (si algo no calza, no se toca nada) ----------
do $guarda$
declare
  r record;
  v_md5 text;
begin
  if to_regclass('retail.pedidos_web') is null then
    raise exception 'Falta el pedido web de la tienda online: pega antes 20261014235000_pedidos_web_modelo.sql.';
  end if;
  if to_regprocedure('retail.fn_clienta_anonimizar(uuid,uuid,boolean)') is null
     and to_regprocedure('retail.fn_clienta_anonimizar(uuid,uuid,boolean,text)') is null then
    raise exception 'fn_clienta_anonimizar no existe en esta base: pega antes la tanda 1g del Club (20261001210700).';
  end if;
  for r in
    select * from (values
      -- firma                                                antes (la de la 1g, en producción)   despues (este archivo)
      ('retail.fn_clienta_anonimizar(uuid,uuid,boolean)',      'f6a34ec2c9175faf4224999a3e89dde6',  null),
      ('retail.fn_clienta_anonimizar(uuid,uuid,boolean,text)', null,                                '0ce8521c0bc3f542e29e6c9152e3b4ae')
    ) as t(firma, antes, despues)
  loop
    v_md5 := (select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
                from pg_proc p where p.oid = to_regprocedure(r.firma));
    if v_md5 is not null and v_md5 is distinct from r.antes and v_md5 is distinct from r.despues then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.',
        r.firma, v_md5, coalesce(r.antes, 'que no exista'), coalesce(r.despues, 'que ya no exista');
    end if;
  end loop;
end
$guarda$;

-- ---------- 1. La rutina de anonimizar: espera un pedido web pagado, y «a pedido suyo» ----------
-- Sobre su definición viva (la de la 1g, md5 f6a34ec2…). Cambia SOLO: el parámetro `p_pedido_por_ella` (al final, con su revisión), la
-- espera del pedido web pagado, la excepción del responsable cuando lo pidió ella, y la nota, el motivo y la frase de la actividad.
--
-- PROMETE (G-15 y Ley 29733): anonimiza una ficha que quien llama YA tomó (`for update`): primero la historia registra que se fue (un
--   `revoca` por cada permiso vigente, medio `anonimizar`, con quien lo hace o, si no hay persona, con su nota: la conservación o ella),
--   después vacía todo dato personal y el club, vence sus invitaciones sin usar, limpia las fotos de sus fusiones y anota la actividad sin
--   datos suyos. Los disparadores de `clientas` vacían su correo, su tienda del club, sus preferencias y el teléfono y el texto de sus
--   avisos, y cierran su cuenta de la tienda online. NUNCA anonimiza a quien tiene un pedido web pagado sin entregar. La usan
--   archivar_clienta (una persona), fn_club_anonimizar_inactivas (el cron, `p_automatica`) y tienda_eliminar_mi_cuenta (ella,
--   `p_pedido_por_ella = 'tienda_web'`). Devuelve cuántos permisos revocó.
create or replace function retail.fn_clienta_anonimizar(p_id uuid, p_persona uuid, p_automatica boolean, p_pedido_por_ella text default null)
returns integer
language plpgsql
volatile
set search_path = retail, public, extensions
as $$
declare
  v_club_desde timestamptz;
  v_publicidad_desde timestamptz;
  -- Ella lo pidió (hoy, solo desde su cuenta de la tienda online): sin persona del ERP y sin ser la conservación.
  v_ella boolean := p_pedido_por_ella is not null;
  v_nota text := case when p_automatica then 'conservación: 3 años sin compras (ADR-0288 G-15)'
                      when p_pedido_por_ella is not null then 'a pedido suyo, desde su cuenta de la tienda online' end;
  v_revocados integer := 0;
  v_fusiones integer := 0;
  v_pagados text;
begin
  if v_ella and p_pedido_por_ella is distinct from 'tienda_web' then
    raise exception 'No se sabe por dónde pidió borrar sus datos.' using errcode = '22023', hint = 'anonimizar_pedido_invalido';
  end if;
  if v_ella and (p_persona is not null or coalesce(p_automatica, false)) then
    raise exception 'Una anonimización a pedido suyo no la firma nadie más ni es la de 3 años.' using errcode = '22023', hint = 'anonimizar_pedido_invalido';
  end if;

  select c.club_desde, c.publicidad_desde into v_club_desde, v_publicidad_desde from retail.clientas c where c.id = p_id;
  if not found then
    raise exception 'Esa clienta ya no existe — actualiza la pantalla.';
  end if;

  -- Un pedido de la tienda online PAGADO y sin entregar: se le debe una prenda que ya pagó. Sus datos se borran cuando lo recoja o se
  -- anule el pedido (Felipe 2026-10-15). Vale para los tres caminos.
  v_pagados := (select string_agg(w.codigo, ', ' order by w.creado_en, w.numero)
                  from retail.pedidos_web w
                 where w.clienta_id = p_id and w.estado = 'pagado');
  if v_pagados is not null then
    raise exception 'Tiene un pedido de la tienda online pagado y sin entregar (%). Sus datos se pueden borrar cuando lo recoja o cuando se anule el pedido.', v_pagados
      using errcode = 'P0001', hint = 'anonimizar_pedido_web_pagado', detail = v_pagados;
  end if;

  if (v_club_desde is not null or v_publicidad_desde is not null) and p_persona is null and not p_automatica and not v_ella then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;

  if v_publicidad_desde is not null then
    insert into retail.club_permisos (clienta_id, finalidad, accion, medio, registrado_por, nota)
    values (p_id, 'publicidad_whatsapp', 'revoca', 'anonimizar', p_persona, v_nota);
    v_revocados := v_revocados + 1;
  end if;
  if v_club_desde is not null then
    insert into retail.club_permisos (clienta_id, finalidad, accion, medio, registrado_por, nota)
    values (p_id, 'club', 'revoca', 'anonimizar', p_persona, v_nota);
    v_revocados := v_revocados + 1;
  end if;

  update retail.clientas set
    archivada_por = case when archivada_en is null then p_persona else archivada_por end,
    archivada_en = coalesce(archivada_en, now()),
    -- El motivo escrito no se guarda: puede nombrar a la clienta (Ley 29733, Felipe 2026-09-27).
    motivo_archivo = case when p_automatica then 'Anonimizada: 3 años sin compras (Ley 29733)'
                          when v_ella then 'Anonimizada a pedido suyo, desde la tienda online (Ley 29733)'
                          else 'Anonimizada (Ley 29733)' end,
    anonimizada = true,
    documento_numero = null,
    nombre = 'Clienta anonimizada',
    telefono_whatsapp = null,
    whatsapp_consentimiento_en = null,
    cumple_dia = null,
    cumple_mes = null,
    cumple_anio = null,
    tallas = null,
    club_desde = null,
    publicidad_desde = null,
    codigo_club = null
  where id = p_id;

  -- Sus invitaciones sin usar (camino B, retirado) vencen ahora: el enlace muere. Nada se borra.
  update retail.club_invitaciones i set vence_en = now()
   where i.clienta_id = p_id and i.usada_en is null and i.vence_en > now();

  -- La foto que unir_clientas guardó de cada ficha que se le unió a ésta, o a una que se le unió (son la misma persona),
  -- pierde todo dato personal: queda solo cuándo se anonimizó. Se mira el lado que sea de cada fusión.
  with recursive arbol (id) as (
    select p_id
    union
    select c.id from retail.clientas c join arbol a on c.fusionada_en_id = a.id
  )
  update retail.clientas_fusiones f
     set ficha_fusionada = jsonb_build_object('anonimizada_en', now())
   where f.clienta_mantiene_id in (select id from arbol)
      or f.clienta_fusionada_id in (select id from arbol);
  get diagnostics v_fusiones = row_count;

  -- Sin nombre, DNI ni el motivo escrito: quién es queda en registro_id (ADR-0249, 2026-09-28).
  perform retail.fn_actividad_anotar(
    'clientas', 'anonimizar',
    case when p_automatica then 'anonimizó la ficha de una clienta: 3 años sin compras (conservación, Ley 29733)'
         when v_ella then 'un cliente eliminó su cuenta de la tienda online: se borraron sus datos de la ficha (Ley 29733)'
         else 'anonimizó la ficha de una clienta (Ley 29733)' end,
    p_persona, null, null, null, 'clientas', p_id::text, now(),
    jsonb_build_object('anonimizada', true, 'fusiones_limpiadas', v_fusiones, 'permisos_revocados', v_revocados,
                       'automatica', case when p_automatica then true end,
                       'a_pedido_suyo', p_pedido_por_ella),
    'vivo'
  );
  return v_revocados;
end;
$$;

-- La firma de 3 parámetros se va: con las dos vivas, una llamada de tres argumentos no sabría cuál elegir.
drop function if exists retail.fn_clienta_anonimizar(uuid, uuid, boolean);

comment on function retail.fn_clienta_anonimizar(uuid, uuid, boolean, text) is
  'La rutina de anonimizar (ADR-0288 G-15, Ley 29733), la de los tres caminos: archivar_clienta (una persona del ERP), fn_club_anonimizar_inactivas (la conservación de 3 años, p_automatica) y tienda_eliminar_mi_cuenta (ella, desde su cuenta de la tienda online: p_pedido_por_ella = tienda_web, sin persona). Quien llama ya tomó la ficha. Nunca anonimiza a quien tiene un pedido web pagado sin entregar (P0001 anonimizar_pedido_web_pagado, detail con los códigos; Felipe 2026-10-15). Devuelve cuántos permisos del Club revocó. Nadie de la API la ejecuta.';
revoke all on function retail.fn_clienta_anonimizar(uuid, uuid, boolean, text) from public, anon, authenticated;

reset lock_timeout;

notify pgrst, 'reload schema';
