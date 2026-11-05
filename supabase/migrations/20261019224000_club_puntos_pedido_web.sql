-- ============================================================================
-- 20261019224000_club_puntos_pedido_web.sql — CAYLA V2 · Club · puntos: el cupón y los puntos en el PEDIDO WEB (recoger en tienda)
-- Sigue a `20261019222000_club_puntos_textos_y_avisos.sql` y al motor de pedidos web (20261014235000 y siguientes, EN PRODUCCIÓN).
--
-- EL PROBLEMA. El cupón del Club (100 puntos = S/ 5, al portador, 7 días, un solo uso) hasta hoy solo se cobra en caja. En la tienda
-- web el cliente separa un pedido para recoger, la tienda lo confirma y se paga después: entre separar y pagar pasan horas o días.
-- Felipe decidió (2026-10-19): el código se escribe en la bolsa, el pedido NACE con el total rebajado y el cupón queda RESERVADO para
-- ese pedido (nadie más lo usa, ni en caja); se CONSUME cuando el pedido se vende (fn_pedido_web_vender) y se LIBERA si el pedido se
-- anula, vence o no se confirma. Y una compra web también gana puntos y el regalo de cumpleaños. Sin esto, o el cupón se gasta dos
-- veces (una en la web, otra en caja), o el cliente paga un precio distinto del que vio, o el total del pedido deja de cuadrar con su
-- boleta.
--
-- QUÉ HACE
--   PARTE 1 (tablas, sin políticas): `club_cupones` gana el estado `reservado` y la columna `pedido_web_id`; `pedidos_web` gana
--     `cupon_id`, `descuento_cupon` (0 por defecto) y `cupon_liberado_en` / `cupon_liberado_motivo` (la constancia de que el cupón
--     volvió). Los CHECK hacen imposible un reservado sin pedido, un descuento sin cupón o un liberado sin motivo.
--   PARTE 2 (funciones y disparadores):
--     1. `fn_club_cupones_guardas` (entera; es de esta rama, no está en producción): las transiciones del cupón con el reservado.
--     2. `fn_club_cupon_reservar(pedido, código)` y `fn_club_cupon_liberar(cupón, pedido)`: el núcleo. Reservar valida como la caja
--        (existe, no usado, no reservado, vigente, compra mínima, no cubre todo) con candado de fila, y rebaja el total.
--     3. Disparador `pedidos_web_cupon` (antes de cada cambio del pedido): mantiene `total = suma de líneas − descuento_cupon`, impide
--        reescribir el cupón y, al CERRAR el pedido (anulado o vencido), libera su cupón reservado.
--     4. Disparador `pedido_web_lineas_cupon`: si al confirmar se QUITA una prenda y lo que queda ya no llega a la compra mínima (o el
--        cupón la cubriría toda), el cupón se libera solo y el total vuelve a ser la suma de las prendas.
--     5. `fn_pedido_web_verificar` (anclado): el total es la suma menos el cupón, y la venta lleva la parte del cupón por línea.
--     6. `fn_pedido_web_vender` (anclado): reparte el descuento del cupón entre las líneas con `fn_club_repartir_vale` (sumado a la
--        campaña), marca el cupón usado con su venta y suma los puntos del pedido (`fn_club_puntos_por_venta`).
--     7. `validar_cupon` y `registrar_venta` (anclados) rechazan un cupón reservado: «Ese cupón está reservado para un pedido web».
--        `fn_club_cupon_al_anular_venta` (anclado) limpia `pedido_web_id` al devolver el cupón.
--     8. Puertas de la tienda (rol tienda_web): `tienda_validar_cupon` (con el bloqueo por intentos, por usuario web) y
--        `tienda_separar_con_cupon` (separa y reserva en una transacción). Lecturas: `fn_pedido_web_cupon` y su `cupon` en
--        `fn_pedido_web_detalle` (ERP) y `tienda_mis_pedidos` (tienda), y los reservados en `tienda_mis_puntos` y en Beneficios.
--
-- DECIDÍ: un pedido NACE sin cupón y el cupón se le pone en la misma transacción de «Separar» (tienda_separar_con_cupon envuelve a
--   tienda_separar, que no se toca: su firma la usan seis suites de pruebas y la tienda en producción). Si el cupón no sirve, se deshace
--   todo y el pedido no existe.
-- DECIDÍ: el total lo mantiene la base: el disparador de líneas suma y resta prendas (como siempre) y el del pedido resta o devuelve el
--   descuento del cupón cuando cambia `descuento_cupon`. Así `total = Σ precio de prendas vivas − descuento_cupon` vale en todo momento.
-- DECIDÍ: un cupón reservado NO vence mientras su pedido siga abierto (el precio quedó fijo al separar): `fn_club_cupones_vencer` solo
--   mira los activos. Al liberarse, si su fecha ya pasó, vence ahí mismo y devuelve sus puntos (una vez, como el vencimiento normal).
-- DECIDÍ: al cerrar el pedido (anulado o vencido) el pedido CONSERVA `descuento_cupon` y su total (es su historia); solo se anota
--   `cupon_liberado_en`. Al liberarse por quitar prendas, en cambio, `descuento_cupon` vuelve a 0: el pedido sigue vivo y se paga
--   completo.
-- DECIDÍ: un pedido pagado que se anula devuelve el cupón por el camino de la venta (`trg_club_cupon_al_anular_venta`): queda activo
--   (o vencido con sus puntos devueltos), nunca «reservado».
-- DECIDÍ: el bloqueo por intentos de la tienda usa la misma tabla que la caja (`club_cupon_intentos`) con el id del usuario web como
--   clave: 5 códigos que no existen en 5 minutos bloquean a ese usuario. La tienda valida antes de separar; `tienda_separar_con_cupon`
--   no puede anotar el fallo (su error lo deshace) pero sí respeta el bloqueo.
-- DECIDÍ: la tienda nunca dice de quién es un cupón ajeno (la caja dice el nombre de pila; en internet sería dárselo a un extraño):
--   solo `tuyo` si es de la misma cuenta.
-- DECIDÍ: la caja no ofrece un cupón reservado (`resumen_puntos_caja` sigue mostrando solo los activos), pero Beneficios del club
--   cuenta los reservados como vivos (siguen siendo plata que se debe).
-- DECIDÍ: «no con prendas de liquidación» se cumple solo en la web: una pieza de liquidación se vende con la variante especial de caja
--   y nunca llega a la Vitrina. Reservar igual la rechaza si apareciera (candado de atrás).
-- DESCARTÉ: cambiar la firma de `tienda_separar` (rompe pruebas y la tienda publicada) y liberar el cupón dentro de cada función que
--   cierra un pedido (cinco funciones vivas; el disparador cubre todas, también las que vengan).
-- SE ROMPE SI: alguien redefine `fn_pedido_web_verificar`, `fn_pedido_web_vender`, `registrar_venta` o `validar_cupon` y pierde estos
--   trozos (la prueba `pruebas:club-puntos-pedido-web` mira el comportamiento), o actualiza `pedidos_web.total` a mano junto con
--   `descuento_cupon` en el mismo UPDATE (el disparador restaría dos veces: el total lo mantienen los disparadores). Y si hay que volver
--   a pegar `20261015051000` (recrea `fn_pedido_web_vender` sin el cupón) o `20261015114000` DESPUÉS de esta: PRIMERO se deshacen los
--   reemplazos de esta en `fn_pedido_web_verificar` y `fn_pedido_web_vender`, después se pegan esas y al final se vuelve a pegar esta.
--   Pegarlas encima no se arregla volviendo a pegar esta: esta cambia texto dentro de los bloques que ellas insertaron, ellas ya no
--   reconocen su cambio como aplicado y lo meten otra vez (medido: un bloque queda dos veces). Así lo hace el escenario F de
--   `scripts/pruebas/pedidos_web_anular.mjs`.
--
-- CÓMO SE PEGA (producción): en DOS pegados separados, en orden, después de `20261019222000`: primero la PARTE 1 (hasta su «fin»),
-- después la PARTE 2. Cada parte es idempotente y lleva `lock_timeout` 3 s. Sin políticas, sin `drop trigger`. Los reemplazos
-- anclados abortan sin tocar nada si la función viva cambió. Dentro de los textos de reemplazo no hay ningún `select … into`.
-- CAÍDA EXTERNA. Nada de esto llama a la red.
-- ============================================================================

-- ============================== PARTE 1: tablas ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.club_cupones add column if not exists pedido_web_id uuid references retail.pedidos_web (id);
comment on column retail.club_cupones.pedido_web_id is
  'El pedido web para el que está reservado (estado reservado) o en el que se usó (estado usado). Se limpia cuando el cupón vuelve a activo o vence.';

alter table retail.club_cupones drop constraint if exists club_cupones_estado_valido;
alter table retail.club_cupones add constraint club_cupones_estado_valido check (estado in ('activo', 'reservado', 'usado', 'vencido'));
alter table retail.club_cupones drop constraint if exists club_cupones_estado_coherente;
alter table retail.club_cupones add constraint club_cupones_estado_coherente check (
  ((estado = 'usado') = (usado_en is not null and venta_id is not null))
  and ((estado = 'vencido') = (vencido_en is not null))
  and (usado_por_clienta_id is null or estado = 'usado')
  and (estado <> 'reservado' or pedido_web_id is not null)
  and (pedido_web_id is null or estado in ('reservado', 'usado')));
-- Un pedido, a lo más un cupón vivo en él.
create unique index if not exists club_cupones_un_cupon_por_pedido on retail.club_cupones (pedido_web_id) where pedido_web_id is not null;

alter table retail.pedidos_web add column if not exists cupon_id uuid references retail.club_cupones (id);
alter table retail.pedidos_web add column if not exists descuento_cupon numeric(12,2) not null default 0;
alter table retail.pedidos_web add column if not exists cupon_liberado_en timestamptz;
alter table retail.pedidos_web add column if not exists cupon_liberado_motivo text;
comment on column retail.pedidos_web.cupon_id is 'El cupón del Club que el cliente escribió al separar. No cambia: si se libera, queda la constancia en cupon_liberado_*.';
comment on column retail.pedidos_web.descuento_cupon is 'Lo que el cupón descuenta del pedido: total = Σ prendas vivas − descuento_cupon. Vuelve a 0 si el cupón se libera al quitar prendas.';
comment on column retail.pedidos_web.cupon_liberado_en is 'Cuándo el cupón dejó de estar en este pedido (se quitaron prendas y ya no alcanzó, o el pedido se cerró).';

alter table retail.pedidos_web drop constraint if exists pedidos_web_cupon_coherente;
alter table retail.pedidos_web add constraint pedidos_web_cupon_coherente check (
  descuento_cupon >= 0 and abs(descuento_cupon) < 'Infinity'
  and (descuento_cupon = 0 or cupon_id is not null)
  and ((cupon_liberado_en is null) = (cupon_liberado_motivo is null))
  and (cupon_liberado_en is null or cupon_id is not null)
  and (cupon_liberado_motivo is null
       or cupon_liberado_motivo in ('compra_minima', 'cubre_todo', 'pedido_anulado', 'pedido_vencido')));
create index if not exists pedidos_web_cupon_idx on retail.pedidos_web (cupon_id) where cupon_id is not null;

reset lock_timeout;
-- ============================== fin de la PARTE 1 ==============================


-- ============================== PARTE 2: funciones y disparadores ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Las transiciones del cupón, con el reservado ----------
-- activo → reservado | usado | vencido; reservado → usado | activo | vencido; usado → activo | vencido (se anuló la venta); vencido es
-- final. `pedido_web_id` se pone al reservar, se queda al usarse desde el pedido y se limpia cuando el cupón vuelve o vence.
create or replace function retail.fn_club_cupones_guardas()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un cupón del Club no se borra: si ya no sirve, vence.' using errcode = 'P0001', hint = 'cupon_no_se_borra';
  end if;
  if new.id <> old.id or new.codigo <> old.codigo or new.clienta_id <> old.clienta_id or new.puntos <> old.puntos
     or new.valor <> old.valor or new.compra_minima <> old.compra_minima or new.vence_el <> old.vence_el
     or new.origen <> old.origen or new.token is distinct from old.token
     or new.canje_movimiento_id <> old.canje_movimiento_id or new.creado_en <> old.creado_en
     or new.creado_por is distinct from old.creado_por then
    raise exception 'Un cupón del Club no se edita: solo cambia de estado.' using errcode = 'P0001', hint = 'cupon_no_se_edita';
  end if;
  if old.estado = 'vencido' and new.estado <> 'vencido' then
    raise exception 'Un cupón vencido ya devolvió sus puntos: no vuelve a vivir.' using errcode = 'P0001', hint = 'cupon_vencido_es_final';
  end if;
  if new.estado is distinct from old.estado and not (
       (old.estado = 'activo' and new.estado in ('reservado', 'usado', 'vencido'))
    or (old.estado = 'reservado' and new.estado in ('usado', 'activo', 'vencido'))
    or (old.estado = 'usado' and new.estado in ('activo', 'vencido'))) then
    raise exception 'Un cupón del Club no pasa de «%» a «%».', old.estado, new.estado using errcode = 'P0001', hint = 'cupon_transicion';
  end if;
  -- El pedido del cupón: se pone al reservar y solo se va cuando el cupón vuelve o vence. Usarlo desde su pedido lo conserva.
  if new.pedido_web_id is distinct from old.pedido_web_id and not (
       (old.estado = 'activo' and new.estado = 'reservado' and old.pedido_web_id is null)
    or (old.estado in ('reservado', 'usado') and new.estado in ('activo', 'vencido') and new.pedido_web_id is null)) then
    raise exception 'El pedido de un cupón solo cambia al reservarlo o al liberarlo.' using errcode = 'P0001', hint = 'cupon_no_se_edita';
  end if;
  if old.estado = 'reservado' and new.estado = 'usado' and new.pedido_web_id is distinct from old.pedido_web_id then
    raise exception 'Un cupón reservado solo se usa en su pedido.' using errcode = 'P0001', hint = 'cupon_reservado';
  end if;
  return new;
end;
$$;
comment on function retail.fn_club_cupones_guardas() is
  'Disparador de club_cupones: solo cambia de estado (activo/reservado/usado/vencido, con sus transiciones) y su pedido web al reservarlo o liberarlo; nada se edita ni se borra.';
revoke all on function retail.fn_club_cupones_guardas() from public, anon, authenticated;

-- ---------- 2. Liberar y reservar ----------
-- Libera el cupón reservado para ESE pedido: vuelve a activo si su fecha no pasó; si pasó, vence ahora y devuelve sus puntos (una sola
-- vez: el candado de fn_club_puntos_guardas). Devuelve el estado en que quedó, o null si no estaba reservado para ese pedido.
create or replace function retail.fn_club_cupon_liberar(p_cupon_id uuid, p_pedido_id uuid)
returns text
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_k retail.club_cupones;
begin
  select k.* into v_k from retail.club_cupones k
   where k.id = p_cupon_id and k.estado = 'reservado' and k.pedido_web_id = p_pedido_id
     for update;
  if v_k.id is null then
    return null;
  end if;
  if v_k.vence_el >= v_hoy then
    update retail.club_cupones set estado = 'activo', pedido_web_id = null where id = v_k.id;
    return 'activo';
  end if;
  update retail.club_cupones set estado = 'vencido', vencido_en = now(), pedido_web_id = null where id = v_k.id;
  begin
    perform retail.fn_club_puntos_anotar(v_k.clienta_id, 'devuelve', v_k.puntos, null, null, v_k.codigo,
                                         'Cupón vencido', null, v_k.canje_movimiento_id);
  exception when others then
    raise warning 'puntos: no se devolvieron los del cupón vencido % (%)', v_k.codigo, sqlerrm;
  end;
  return 'vencido';
end;
$$;
comment on function retail.fn_club_cupon_liberar(uuid, uuid) is
  'Libera el cupón reservado para un pedido web: activo si su fecha no pasó; si pasó, vencido con sus puntos devueltos. Interna: la llaman los disparadores del pedido.';
revoke all on function retail.fn_club_cupon_liberar(uuid, uuid) from public, anon, authenticated;

-- Reserva un cupón para un pedido que todavía espera confirmación, con las MISMAS reglas que la caja: existe, no se usó, no está
-- reservado, sigue vigente, la compra llega a su mínimo y el cupón no cubre toda la compra. El candado de fila turna a dos
-- «Separar» con el mismo código (y a la caja): el segundo lo ve reservado.
create or replace function retail.fn_club_cupon_reservar(p_pedido_id uuid, p_codigo text)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  p retail.pedidos_web;
  v_k retail.club_cupones;
  v_items jsonb;
  v_neto bigint;
begin
  select w.* into p from retail.pedidos_web w where w.id = p_pedido_id for update;
  if p.id is null then
    raise exception 'Ese pedido web no existe.' using errcode = '22023', hint = 'pedido_web_no_existe';
  end if;
  if p.estado <> 'por_confirmar' or p.pagado <> 0 then
    raise exception 'El cupón se pone al separar, antes de que la tienda confirme el pedido.' using errcode = '22023', hint = 'cupon_pedido_avanzado';
  end if;
  if p.cupon_id is not null then
    raise exception 'Un pedido lleva un solo cupón.' using errcode = '22023', hint = 'club_un_cupon_por_compra';
  end if;

  select k.* into v_k from retail.club_cupones k where k.codigo = v_codigo for update;
  if v_k.id is null then
    raise exception 'Ese cupón no existe: revisa el código.' using errcode = '22023', hint = 'cupon_no_existe';
  end if;
  if v_k.estado = 'usado' then
    raise exception 'Ese cupón ya se usó.' using errcode = '22023', hint = 'cupon_ya_usado';
  end if;
  if v_k.estado = 'reservado' then
    raise exception 'Ese cupón está reservado para un pedido web.' using errcode = '22023', hint = 'cupon_reservado';
  end if;
  if v_k.estado = 'vencido' or v_k.vence_el < v_hoy then
    raise exception 'Ese cupón venció el %.', to_char(v_k.vence_el, 'DD/MM/YYYY') using errcode = '22023', hint = 'cupon_vencido';
  end if;
  if exists (select 1 from retail.pedido_web_lineas l where l.pedido_id = p.id and l.estado <> 'quitada' and l.variante_id = c_cargo_especial) then
    raise exception 'Una pieza de liquidación tiene precio final: no se usa con cupón.' using errcode = '22023', hint = 'liquidacion_sin_descuentos';
  end if;

  -- Lo que cuesta la compra con su campaña (la misma cuenta que la caja: fn_club_neto_items), en céntimos.
  v_items := (select jsonb_agg(jsonb_build_object('precio_unitario', l.precio_lista, 'descuento_unitario', l.descuento, 'cantidad', 1)
                               order by l.posicion)
                from retail.pedido_web_lineas l where l.pedido_id = p.id and l.estado <> 'quitada');
  v_neto := retail.fn_club_neto_items(coalesce(v_items, '[]'::jsonb));
  if v_neto < round(v_k.compra_minima * 100) then
    raise exception 'Este cupón pide una compra de S/ % o más.', v_k.compra_minima
      using errcode = '22023', hint = 'cupon_compra_minima', detail = v_k.compra_minima::text;
  end if;
  if round(v_k.valor * 100) >= v_neto then
    raise exception 'El cupón cubre toda la compra: suma otra prenda o úsalo en una compra mayor.' using errcode = '22023', hint = 'cupon_cubre_todo';
  end if;

  update retail.club_cupones set estado = 'reservado', pedido_web_id = p.id where id = v_k.id;
  -- El disparador del pedido resta el descuento del total.
  update retail.pedidos_web w set cupon_id = v_k.id, descuento_cupon = v_k.valor where w.id = p.id;
  return v_k.id;
end;
$$;
comment on function retail.fn_club_cupon_reservar(uuid, text) is
  'Reserva un cupón del Club para un pedido web por confirmar (mismas reglas que la caja, con candado de fila) y rebaja su total. Interna: la llama tienda_separar_con_cupon.';
revoke all on function retail.fn_club_cupon_reservar(uuid, text) from public, anon, authenticated;

-- ---------- 3. El pedido y su cupón (disparador antes de cada cambio) ----------
create or replace function retail.fn_pedido_web_cupon_reglas()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'INSERT' then
    if new.cupon_id is not null or new.descuento_cupon <> 0 or new.cupon_liberado_en is not null or new.cupon_liberado_motivo is not null then
      raise exception 'Un pedido web nace sin cupón: el cupón se le pone al separar.' using errcode = '23514', hint = 'pedido_web_inmutable';
    end if;
    return new;
  end if;

  -- El cupón se pone una vez, mientras el pedido espera confirmación, y no cambia.
  if new.cupon_id is distinct from old.cupon_id
     and (old.cupon_id is not null or new.cupon_id is null or old.estado <> 'por_confirmar' or old.cupon_liberado_en is not null) then
    raise exception 'El cupón de un pedido web no se cambia.' using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;
  -- Lo liberado no se reescribe.
  if old.cupon_liberado_en is not null
     and (new.cupon_liberado_en, new.cupon_liberado_motivo) is distinct from (old.cupon_liberado_en, old.cupon_liberado_motivo) then
    raise exception 'Cuándo y por qué se liberó el cupón de un pedido web no se reescribe.' using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;
  -- El descuento nace con el cupón (0 → su valor) y solo vuelve a 0 al liberarse mientras el pedido espera confirmación. El total lo
  -- sigue: total = Σ prendas vivas − descuento_cupon (el otro disparador suma y resta las prendas).
  if new.descuento_cupon is distinct from old.descuento_cupon then
    if old.estado <> 'por_confirmar'
       or not ((old.descuento_cupon = 0 and old.cupon_id is null and new.cupon_id is not null)
               or (new.descuento_cupon = 0 and old.cupon_liberado_en is null and new.cupon_liberado_en is not null)) then
      raise exception 'El descuento del cupón de un pedido web solo se pone al separar o se quita al liberarlo.'
        using errcode = '23514', hint = 'pedido_web_inmutable';
    end if;
    new.total := new.total - (new.descuento_cupon - old.descuento_cupon);
  end if;

  -- Al CERRARSE el pedido (anulado, vencido o no confirmado), su cupón reservado vuelve. El de un pedido pagado ya está usado: vuelve
  -- por el camino de su venta anulada (trg_club_cupon_al_anular_venta).
  if new.estado in ('anulado', 'vencido') and new.estado is distinct from old.estado
     and new.cupon_id is not null and new.cupon_liberado_en is null then
    perform retail.fn_club_cupon_liberar(new.cupon_id, new.id);
    new.cupon_liberado_en := now();
    new.cupon_liberado_motivo := case when new.estado = 'vencido' then 'pedido_vencido' else 'pedido_anulado' end;
  end if;
  return new;
end;
$$;
comment on function retail.fn_pedido_web_cupon_reglas() is
  'Disparador de pedidos_web: el cupón se pone una vez al separar, su descuento mantiene total = Σ prendas − descuento_cupon, y al cerrarse el pedido su cupón reservado vuelve.';
revoke all on function retail.fn_pedido_web_cupon_reglas() from public, anon, authenticated;

create or replace trigger pedidos_web_cupon
  before insert or update on retail.pedidos_web
  for each row execute function retail.fn_pedido_web_cupon_reglas();

-- ---------- 4. Quitar una prenda al confirmar puede liberar el cupón ----------
create or replace function retail.fn_pedido_web_cupon_al_quitar()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  p retail.pedidos_web;
  v_k retail.club_cupones;
  v_neto bigint;
  v_motivo text;
begin
  select w.* into p from retail.pedidos_web w where w.id = new.pedido_id;
  if p.cupon_id is null or p.descuento_cupon = 0 or p.cupon_liberado_en is not null then
    return null;
  end if;
  select k.* into v_k from retail.club_cupones k where k.id = p.cupon_id;
  -- Lo que queda (las prendas vivas, con su campaña), en céntimos: la misma cuenta que al reservar.
  v_neto := coalesce((select sum(round(l.precio * 100))::bigint from retail.pedido_web_lineas l
                       where l.pedido_id = p.id and l.estado <> 'quitada'), 0);
  if v_neto < round(v_k.compra_minima * 100) then
    v_motivo := 'compra_minima';
  elsif round(p.descuento_cupon * 100) >= v_neto then
    v_motivo := 'cubre_todo';
  else
    return null;
  end if;
  update retail.pedidos_web w set descuento_cupon = 0, cupon_liberado_en = now(), cupon_liberado_motivo = v_motivo where w.id = p.id;
  perform retail.fn_club_cupon_liberar(p.cupon_id, p.id);
  return null;
end;
$$;
comment on function retail.fn_pedido_web_cupon_al_quitar() is
  'Disparador de pedido_web_lineas: al quitar una prenda, si lo que queda no llega a la compra mínima del cupón (o el cupón la cubriría toda), el cupón se libera y el total vuelve a ser la suma de las prendas.';
revoke all on function retail.fn_pedido_web_cupon_al_quitar() from public, anon, authenticated;

create or replace trigger pedido_web_lineas_cupon
  after update of estado on retail.pedido_web_lineas
  for each row
  when (new.estado = 'quitada' and old.estado is distinct from 'quitada')
  execute function retail.fn_pedido_web_cupon_al_quitar();

-- ---------- 5. Los reemplazos anclados ----------
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

-- 5a. fn_pedido_web_verificar: el total es la suma de las prendas MENOS el cupón, y el cupón cuadra con su estado y su venta.
select pg_temp.reemplazar('retail.fn_pedido_web_verificar(uuid)',
  $v$  if p.total <> v_total then
    raise exception 'El total del pedido web % (S/ %) no es la suma de sus prendas (S/ %).', p.codigo, p.total, v_total
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;$v$,
  $v$  -- Club (20261019224000): el total es la suma de sus prendas menos el cupón.
  if p.total <> v_total - p.descuento_cupon then
    raise exception 'El total del pedido web % (S/ %) no es la suma de sus prendas (S/ %) menos su cupón (S/ %).', p.codigo, p.total, v_total, p.descuento_cupon
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;
  -- Club: con descuento vivo, el cupón está reservado para este pedido mientras no se paga, y usado en su venta cuando se pagó. Y la
  -- venta (viva o anulada) lleva, en la parte del club de sus líneas, exactamente el descuento del cupón.
  if p.descuento_cupon > 0 and p.cupon_liberado_en is null then
    if p.estado in ('por_confirmar', 'confirmado')
       and not exists (select 1 from retail.club_cupones k where k.id = p.cupon_id and k.estado = 'reservado' and k.pedido_web_id = p.id) then
      raise exception 'El pedido web % lleva el descuento de un cupón que no está reservado para él.', p.codigo
        using errcode = '23514', hint = 'pedido_web_incoherente';
    end if;
    if p.estado in ('pagado', 'entregado')
       and not exists (select 1 from retail.club_cupones k where k.id = p.cupon_id and k.estado = 'usado' and k.venta_id = p.venta_id) then
      raise exception 'El pedido web % se pagó con un cupón que no quedó usado en su venta.', p.codigo
        using errcode = '23514', hint = 'pedido_web_incoherente';
    end if;
  end if;
  if (select w.venta_id from retail.pedidos_web w where w.id = p.id) is not null
     and (select coalesce(sum(vi.descuento_club_unitario * vi.cantidad), 0) from retail.venta_items vi
           where vi.venta_id = (select w.venta_id from retail.pedidos_web w where w.id = p.id)) <> p.descuento_cupon then
    raise exception 'En el pedido web %, la venta no lleva el descuento de su cupón (S/ %).', p.codigo, p.descuento_cupon
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;$v$,
  1);
-- La línea de la venta lleva la campaña de la prenda MÁS su parte del cupón (descuento_club_unitario): en los dos bloques que comparan la
-- venta con sus prendas (el de 20261015051000 y el de 20261015114000) se compara la campaña SIN la parte del club. Se cambian TODAS las
-- apariciones que queden: si alguien vuelve a pegar 051000 o 114000 después de esta (y su bloque vuelve a entrar), volver a pegar esta lo
-- deja bien otra vez.
create or replace function pg_temp.reemplazar_todas(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
begin
  if position(p_viejo in v_def) = 0 then
    if position(p_nuevo in v_def) = 0 then
      raise exception '% cambió desde que se escribió esta migración: no aparece «%» ni su reemplazo. Regenera el reemplazo desde su definición real.', p_firma, p_viejo;
    end if;
    return;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;
select pg_temp.reemplazar_todas('retail.fn_pedido_web_verificar(uuid)',
  $v$vi.descuento_unitario = l.descuento))$v$,
  $v$vi.descuento_unitario - vi.descuento_club_unitario = l.descuento))$v$);

-- 5b. fn_pedido_web_vender: el cupón repartido en las líneas, el cupón usado y los puntos.
select pg_temp.reemplazar('retail.fn_pedido_web_vender(uuid, uuid)',
  $v$  v_items jsonb;
begin$v$,
  $v$  v_items jsonb;
  v_cupon_partes numeric[];          -- Club: la parte del cupón por línea (en el orden de las prendas)
  v_cupon_idx integer := 0;
  v_cupon_parte numeric;
begin$v$,
  1);
select pg_temp.reemplazar('retail.fn_pedido_web_vender(uuid, uuid)',
  $v$  -- Una línea de venta por prenda no quitada, de una unidad, con el precio y la campaña que el pedido ya tenía.$v$,
  $v$  -- Club (20261019224000): el descuento del cupón reservado al separar se reparte entre las prendas con la MISMA regla que la caja
  -- (fn_club_repartir_vale: céntimos enteros, proporcional a lo que cuesta cada una con su campaña). Suma exactamente descuento_cupon.
  if p.descuento_cupon > 0 then
    v_cupon_partes := retail.fn_club_repartir_vale(
      (select jsonb_agg(jsonb_build_object('precio_unitario', x.precio_lista, 'descuento_unitario', x.descuento, 'cantidad', 1) order by x.posicion)
         from retail.pedido_web_lineas x where x.pedido_id = p.id and x.estado <> 'quitada'),
      p.descuento_cupon);
  end if;

  -- Una línea de venta por prenda no quitada, de una unidad, con el precio y la campaña que el pedido ya tenía.$v$,
  1);
select pg_temp.reemplazar('retail.fn_pedido_web_vender(uuid, uuid)',
  $v$    insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
                                    motivo_descuento, descuento_etiqueta_id)
      values (v_venta, l.variante_id, 1, l.precio_lista, l.descuento, l.costo,
              case when l.descuento > 0 then 'campana' end, l.descuento_etiqueta_id)$v$,
  $v$    v_cupon_idx := v_cupon_idx + 1;
    v_cupon_parte := coalesce(v_cupon_partes[v_cupon_idx], 0);
    -- Como en caja: descuento_unitario es el TOTAL (campaña + cupón) y descuento_club_unitario la parte del cupón.
    insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
                                    motivo_descuento, descuento_etiqueta_id, descuento_club_unitario)
      values (v_venta, l.variante_id, 1, l.precio_lista, l.descuento + v_cupon_parte, l.costo,
              case when l.descuento > 0 then 'campana' end, l.descuento_etiqueta_id, v_cupon_parte)$v$,
  1);
select pg_temp.reemplazar('retail.fn_pedido_web_vender(uuid, uuid)',
  $v$  update retail.pedidos_web w set venta_id = v_venta where w.id = p.id;
  return v_venta;$v$,
  $v$  update retail.pedidos_web w set venta_id = v_venta where w.id = p.id;

  -- Club: el cupón reservado para este pedido queda USADO con su venta (lo usó la ficha del pedido). Ya está tomado: nadie más lo usa.
  if p.descuento_cupon > 0 then
    update retail.club_cupones k
       set estado = 'usado', usado_en = now(), venta_id = v_venta, usado_por_clienta_id = p.clienta_id
     where k.id = p.cupon_id and k.estado = 'reservado' and k.pedido_web_id = p.id;
    if not found then
      raise exception 'El cupón del pedido web % ya no está reservado para él: revisa el pedido.', p.codigo
        using errcode = 'P0001', hint = 'cupon_no_reservado';
    end if;
  end if;
  -- Club: la compra web también suma puntos (y el regalo de cumpleaños de su mes) a la ficha del pedido. Nunca tumba la venta.
  begin
    perform retail.fn_club_puntos_por_venta(v_venta);
  exception when others then
    raise warning 'puntos: no se sumaron los de la venta % del pedido web % (%)', v_venta, p.codigo, sqlerrm;
  end;
  return v_venta;$v$,
  1);

-- 5c. validar_cupon (caja): un cupón reservado no sirve en caja.
select pg_temp.reemplazar('retail.validar_cupon(text, numeric)',
  $v$  if v_k.estado = 'usado' then
    return jsonb_build_object('ok', false, 'motivo', 'usado');
  end if;$v$,
  $v$  if v_k.estado = 'usado' then
    return jsonb_build_object('ok', false, 'motivo', 'usado');
  end if;
  -- Club (20261019224000): reservado para un pedido web, nadie más lo usa.
  if v_k.estado = 'reservado' then
    return jsonb_build_object('ok', false, 'motivo', 'reservado');
  end if;$v$,
  1);

-- 5d. registrar_venta: un cupón reservado no se cobra en caja.
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$    if v_cup.estado = 'usado' then
      raise exception 'Ese cupón ya se usó.' using hint = 'cupon_ya_usado';
    end if;
    if v_cup.estado = 'vencido' or v_cup.vence_el < v_hoy then$v$,
  $v$    if v_cup.estado = 'usado' then
      raise exception 'Ese cupón ya se usó.' using hint = 'cupon_ya_usado';
    end if;
    if v_cup.estado = 'reservado' then
      raise exception 'Ese cupón está reservado para un pedido web.' using hint = 'cupon_reservado';
    end if;
    if v_cup.estado = 'vencido' or v_cup.vence_el < v_hoy then$v$,
  1);

-- 5e. Anular la venta devuelve el cupón: también suelta su pedido web.
select pg_temp.reemplazar('retail.fn_club_cupon_al_anular_venta()',
  $v$usado_por_clienta_id = null where id = v_c.id;$v$,
  $v$usado_por_clienta_id = null, pedido_web_id = null where id = v_c.id;$v$,
  2);

-- 5f. «Mi Club»: el cupón reservado se ve, con su pedido (si es de la misma cuenta), y el que volvió de un pedido lo dice.
select pg_temp.reemplazar('retail.tienda_mis_puntos(uuid)',
  $v$    'cupones', coalesce((select jsonb_agg(jsonb_build_object('codigo', k.codigo, 'puntos', k.puntos, 'valor', k.valor,
                                                             'compra_minima', k.compra_minima, 'vence_el', k.vence_el)
                                          order by k.vence_el, k.creado_en)
                           from retail.club_cupones k
                          where k.clienta_id = v_clienta and k.estado = 'activo' and k.vence_el >= v_hoy), '[]'::jsonb),$v$,
  $v$    'cupones', coalesce((select jsonb_agg(jsonb_build_object('codigo', k.codigo, 'puntos', k.puntos, 'valor', k.valor,
                                                             'compra_minima', k.compra_minima, 'vence_el', k.vence_el,
                                                             -- Club (20261019224000): reservado para un pedido web, o vuelto de uno.
                                                             'estado', k.estado,
                                                             'pedido', (select w.codigo from retail.pedidos_web w
                                                                         where w.id = k.pedido_web_id and w.clienta_id = v_clienta),
                                                             'volvio_de', case when k.estado = 'activo' then
                                                                            (select w.codigo from retail.pedidos_web w
                                                                              where w.cupon_id = k.id and w.clienta_id = v_clienta
                                                                                and w.cupon_liberado_en is not null
                                                                              order by w.cupon_liberado_en desc limit 1) end)
                                          order by (k.estado = 'reservado'), k.vence_el, k.creado_en)
                           from retail.club_cupones k
                          where k.clienta_id = v_clienta and (k.estado = 'reservado' or (k.estado = 'activo' and k.vence_el >= v_hoy))), '[]'::jsonb),$v$,
  1);

-- 5g. Beneficios del club: un cupón reservado sigue siendo un cupón vivo (plata que se debe).
select pg_temp.reemplazar('retail.resumen_beneficios_puntos()',
  $v$k.estado = 'activo' and k.vence_el >= v_hoy)$v$,
  $v$(k.estado = 'reservado' or (k.estado = 'activo' and k.vence_el >= v_hoy)))$v$,
  2);

-- ---------- 6. Lo que se ve del cupón de un pedido ----------
create or replace function retail.fn_pedido_web_cupon(p_pedido_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case when w.cupon_id is null then null else jsonb_build_object(
           'codigo', k.codigo, 'valor', k.valor, 'compra_minima', k.compra_minima, 'descuento', w.descuento_cupon,
           -- reservado: espera la venta; usado: ya se gastó en la venta del pedido; liberado: volvió (y por qué).
           'estado', case when w.cupon_liberado_en is not null then 'liberado'
                          when k.estado = 'usado' and k.venta_id = w.venta_id then 'usado'
                          else 'reservado' end,
           'liberado_motivo', w.cupon_liberado_motivo,
           'liberado_en', w.cupon_liberado_en) end
    from retail.pedidos_web w
    left join retail.club_cupones k on k.id = w.cupon_id
   where w.id = p_pedido_id;
$$;
comment on function retail.fn_pedido_web_cupon(uuid) is
  'El cupón del Club de un pedido web (código, valor, descuento y si está reservado, usado o liberado con su motivo), o null. Interna: la usan fn_pedido_web_detalle y tienda_mis_pedidos.';
revoke all on function retail.fn_pedido_web_cupon(uuid) from public, anon, authenticated;

-- Al final del objeto (texto de 20261015010000 que ningún otro reemplazo toca: así 041000, 052000 y 115000 se pueden volver a pegar).
select pg_temp.reemplazar('retail.fn_pedido_web_detalle(uuid)',
  $v$        from jsonb_array_elements(v -> 'lineas') e), '[]'::jsonb)
  );$v$,
  $v$        from jsonb_array_elements(v -> 'lineas') e), '[]'::jsonb),
    -- Club (20261019224000): el cupón que el cliente puso al separar y en qué quedó.
    'cupon', retail.fn_pedido_web_cupon(p_pedido_id)
  );$v$,
  1);

select pg_temp.reemplazar('retail.tienda_mis_pedidos(uuid)',
  $v$                    -- Cada prenda: lo del pedido$v$,
  $v$                    -- Club (20261019224000): el cupón que puso al separar y en qué quedó.
                    'cupon', retail.fn_pedido_web_cupon((p.x ->> 'pedido_id')::uuid),
                    -- Cada prenda: lo del pedido$v$,
  1);

-- ---------- 7. Las puertas de la tienda web ----------
-- «¿Sirve este código?» desde la bolsa. Cuenta los códigos que no existen por usuario web (5 en 5 minutos bloquean) y nunca dice de
-- quién es un cupón ajeno.
create or replace function retail.tienda_validar_cupon(p_usuario_web_id uuid, p_codigo text, p_total numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_clienta uuid;
  v_k retail.club_cupones;
  v_fallos integer;
begin
  if p_usuario_web_id is null then
    raise exception 'Entra con tu cuenta para usar un cupón.' using errcode = '42501', hint = 'sin_cuenta';
  end if;
  select w.clienta_id into v_clienta from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id and w.cerrada_en is null;
  if v_clienta is null then
    raise exception 'No encontramos tu cuenta.' using errcode = '42501', hint = 'sin_cuenta';
  end if;
  delete from retail.club_cupon_intentos where creado_en < now() - interval '24 hours';

  select count(*) into v_fallos from retail.club_cupon_intentos i
   where i.clave = p_usuario_web_id and i.creado_en > now() - interval '5 minutes';
  if v_fallos >= 5 then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado');
  end if;

  select k.* into v_k from retail.club_cupones k where k.codigo = v_codigo;
  if v_k.id is null then
    insert into retail.club_cupon_intentos (clave) values (p_usuario_web_id);
    return jsonb_build_object('ok', false, 'motivo', 'no_existe', 'intentos', v_fallos + 1);
  end if;
  if v_k.estado = 'usado' then
    return jsonb_build_object('ok', false, 'motivo', 'usado');
  end if;
  if v_k.estado = 'reservado' then
    return jsonb_build_object('ok', false, 'motivo', 'reservado');
  end if;
  if v_k.estado = 'vencido' or v_k.vence_el < v_hoy then
    return jsonb_build_object('ok', false, 'motivo', 'vencido', 'vence_el', v_k.vence_el);
  end if;
  if p_total is not null and p_total < v_k.compra_minima then
    return jsonb_build_object('ok', false, 'motivo', 'minimo', 'compra_minima', v_k.compra_minima, 'faltan', v_k.compra_minima - p_total);
  end if;
  if p_total is not null and v_k.valor >= p_total then
    return jsonb_build_object('ok', false, 'motivo', 'cubre_todo', 'valor', v_k.valor);
  end if;
  return jsonb_build_object('ok', true, 'codigo', v_k.codigo, 'valor', v_k.valor, 'compra_minima', v_k.compra_minima,
                            'vence_el', v_k.vence_el, 'tuyo', v_k.clienta_id = v_clienta);
end;
$$;
comment on function retail.tienda_validar_cupon(uuid, text, numeric) is
  'La bolsa de la tienda web pregunta si un código de cupón sirve: ok con su valor, o el motivo (no_existe, usado, reservado, vencido, minimo, cubre_todo, bloqueado). 5 códigos que no existen en 5 minutos bloquean a ese usuario. No revela de quién es. La llama el rol tienda_web con el usuario ya verificado.';
revoke all on function retail.tienda_validar_cupon(uuid, text, numeric) from public, anon, authenticated;

-- «Separar» con cupón: el pedido y la reserva del cupón en UNA transacción. Sin código, es tienda_separar tal cual. El mismo toque dos
-- veces (la marca) devuelve el mismo pedido si lleva el mismo cupón.
create or replace function retail.tienda_separar_con_cupon(p_usuario_web_id uuid, p_ubicacion_id uuid, p_lineas jsonb, p_token uuid,
                                                          p_codigo_cupon text default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_codigo text := nullif(upper(btrim(coalesce(p_codigo_cupon, ''))), '');
  v_r jsonb;
  p retail.pedidos_web;
  v_cupon_de_antes text;
begin
  if v_codigo is not null and p_usuario_web_id is not null
     and (select count(*) from retail.club_cupon_intentos i
           where i.clave = p_usuario_web_id and i.creado_en > now() - interval '5 minutes') >= 5 then
    raise exception 'Probaste muchos códigos que no existen. Espera unos minutos y vuelve a intentarlo.'
      using errcode = '22023', hint = 'cupon_bloqueado';
  end if;

  v_r := retail.tienda_separar(p_usuario_web_id, p_ubicacion_id, p_lineas, p_token);
  select w.* into p from retail.pedidos_web w where w.token_cliente = p_token;

  if coalesce((v_r ->> 'ya_estaba')::boolean, false) then
    -- Un reintento: el mismo pedido, con el mismo cupón (o sin cupón, como la primera vez).
    v_cupon_de_antes := (select k.codigo from retail.club_cupones k where k.id = p.cupon_id);
    if v_cupon_de_antes is distinct from v_codigo then
      raise exception 'Ese pedido ya se separó con otro cupón (o sin cupón). Revisa tus pedidos.'
        using errcode = '22023', hint = 'pedido_web_token';
    end if;
  elsif v_codigo is not null then
    perform retail.fn_club_cupon_reservar(p.id, v_codigo);
  end if;

  return v_r || jsonb_build_object('cupon', retail.fn_pedido_web_cupon(p.id),
                                   'total', (select w.total from retail.pedidos_web w where w.id = p.id));
end;
$$;
comment on function retail.tienda_separar_con_cupon(uuid, uuid, jsonb, uuid, text) is
  'Separar de la tienda web con el cupón del Club: crea el pedido (tienda_separar) y reserva el cupón en la misma transacción; si el cupón no sirve, no queda nada. Sin código, separa sin cupón. La llama el rol tienda_web con el usuario ya verificado.';
revoke all on function retail.tienda_separar_con_cupon(uuid, uuid, jsonb, uuid, text) from public, anon, authenticated;

do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'tienda_web') then
    grant execute on function retail.tienda_validar_cupon(uuid, text, numeric) to tienda_web;
    grant execute on function retail.tienda_separar_con_cupon(uuid, uuid, jsonb, uuid, text) to tienda_web;
  end if;
end;
$grant$;

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== fin de la PARTE 2 ==============================
