-- ============================================================================
-- 20261027231000_mis_compras_auditoria_candados.sql — CAYLA V2 · ADR-0543 (Mis compras: candados de la auditoría 2026-10-27)
-- Siete hallazgos que la auditoría de «Mis compras» encontró abiertos, todos en funciones y permisos (ninguna tabla nueva, ningún dato nuevo).
--
-- EL PROBLEMA PRIMERO (en el orden en que importa: primero la plata, después los permisos, al final la lectura).
--   H1  La plata que Compras CONFIRMA crea una entrega al fondo (`entrega_fondo`) y la anotada guarda su id en `movimiento_id`. Esa entrega
--       aparece en «Entregas y devoluciones» con su «Anular», y `anular_movimiento_fondo` solo protegía a los cierres de ronda: cualquiera con
--       «Fondos por rendir» (que no fuera la dueña) la podía anular. La plata anotada seguía «confirmada» pero sin movimiento, y como
--       `movimiento_id` es único no había forma de confirmarla otra vez: un estado imposible (principio 2). Ahora un movimiento que una plata
--       anotada tiene como suyo no se anula aparte, igual que el de un cierre; y la lista tampoco ofrece el «Anular».
--   H2  «Ya tenía plata» no sale de ningún banco: al confirmarla se FIJA el saldo inicial del fondo (hasta S/ 1 000 000) sin que nada se mueva.
--       Confirmar cualquier otra plata mueve dinero real desde una cuenta que elige quien confirma; esta, no: es un número que se escribe.
--       Decisión conservadora (Felipe pidió corregir todo): la compradora sigue pudiendo ANOTAR «ya tenía»; CONFIRMARLA es solo del líder
--       (`fn_es_lider()`, a la cuenta, no al responsable del combo). `devolver_fondo` queda como está: es decisión de Felipe (ver el ADR).
--   H3  `fn_ronda_compras_texto(uuid)` y `fn_ronda_compras_de(uuid)` son `security definer` y no validan nada; sus `revoke` quitaban `public` y
--       `anon`, pero no `authenticated` (el permiso de fábrica de la base, 0005_grants.sql): cualquier cuenta podía leer por RPC la ronda, lo
--       comprado y lo gastado de cualquier persona. Nadie las llama directo (la web lee `fn_mi_plata_compras`, `fn_revisar_compras` y
--       `fn_mis_envios`, que sí son `security definer` y las llaman con el permiso de su dueño): se les quita `authenticated`, como ya
--       tenían sus hermanas (`fn_ronda_compras_cuenta`, `fn_tienda_de_persona`, `fn_mi_plata_tiene`). Las tres funciones de disparador de las
--       rondas también (no se llaman a mano; un disparador no pide permiso al dispararse).
--   H22 La tabla `compra_item_recibido_antes` tenía RLS encendido pero no el `revoke all … from anon, authenticated` de todas las demás
--       tablas de Mis compras. Sin políticas nadie la leía, pero un candado que depende de una sola capa se rompe con una política de más.
--   H11 `terminar_dia_compras` y `abrir_ronda_compras` toman el candado `compra_ronda:<persona>`; anotar una compra, un gasto o plata no lo
--       tomaban. Una compra que entraba mientras la ronda se cerraba caía en la ronda recién cerrada, y el cierre ya había calculado «lo que
--       tienes» sin ella. Ahora las tres lo toman con la MISMA clave (`fn_ronda_compras_candado`): el que llega segundo espera, y si la ronda ya
--       se cerró, la base le dice «Abre tu ronda» (`compra_ronda_sin_abrir`) en vez de meter la compra en la ronda cerrada.
--   H14 «Tenías al abrirla» se despeja de lo que «tienes ahora» menos lo que «te dieron» en la ronda. «Te dieron» sumaba lo anotado, y lo que
--       tienes suma lo CONFIRMADO: si Compras confirma otro monto, la diferencia caía en «tenías». Ahora suma lo confirmado si ya lo confirmaron
--       (`coalesce(monto_confirmado, monto)`), en la ronda abierta de Mis compras y en el cuaderno de Revisar compras.
--   H10 `terminar_dia_compras` no era idempotente: si la respuesta se perdía (corte de red) y la ronda sí se cerró, el segundo toque decía «No
--       tienes una ronda abierta» y la pantalla «No se guardó», aunque sí se había guardado. Ahora, sin ronda abierta pero con una cerrada hace
--       menos de 2 minutos, devuelve el resultado de ESE cierre con una marca nueva `ya_estaba: true` (mismas claves que un cierre normal).
--
-- LO QUE NO ESTÁ AQUÍ (y por qué). H19 (el céntimo de redondeo va en una sola unidad de `completar_papel_compra`) y H20 (los habituales usan
-- `min(costo)` y la rama «comprado» no filtra activos) se dejaron: repartir céntimos entre unidades cambia el costo de lo que ya entró a la
-- tienda y «el último costo» de un modelo no está definido cuando sus tallas cuestan distinto: son decisiones de negocio disfrazadas de arreglos
-- (y no se pudo probar contra Postgres). Las decisiones de Felipe pendientes (H4–H9, H12, H15, H18, H23, H24) están listadas en el ADR.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA sola parte: solo funciones, permisos y un `revoke` de tabla; ni `alter table`, ni
-- políticas, ni `drop trigger` (ADR-0195: nada que tome los candados de auth y storage). Idempotente. Los nueve reemplazos son ANCLADOS sobre
-- la definición viva: no hacen nada si ya están hechos y se detienen, sin cambiar nada, si la función no es la esperada. Sin la lectura «into» dentro de ningún texto entre comillas (ADR-0288).
-- Orden: después de 20261026174000 (la última de Mis compras).
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

-- ---------- 1. H3 y H22: permisos ----------
-- Las dos lecturas de la ronda no se llaman desde afuera: las llaman funciones `security definer` con el permiso de su dueño.
revoke all on function retail.fn_ronda_compras_texto(uuid) from public, anon, authenticated;
revoke all on function retail.fn_ronda_compras_de(uuid) from public, anon, authenticated;
-- Los disparadores no piden permiso al dispararse (solo al crearse): nadie los necesita llamar a mano.
revoke all on function retail.fn_compra_rondas_fija() from public, anon, authenticated;
revoke all on function retail.fn_compra_en_su_ronda() from public, anon, authenticated;
revoke all on function retail.fn_ronda_id_fija() from public, anon, authenticated;
-- La única tabla de Mis compras que quedó sin este candado: solo la leen y escriben funciones `security definer`.
revoke all on retail.compra_item_recibido_antes from anon, authenticated;

-- ---------- 2. H11: el candado de la ronda, con la misma clave que abrir y cerrar ----------
-- `compra_ronda:<persona>` es la clave de `abrir_ronda_compras` y `terminar_dia_compras`: se escribe en UN lugar para que las cinco funciones
-- no puedan quedar con claves distintas. Sin persona (una sesión sin cuenta), no toma nada: la función que la llama ya habrá fallado antes.
-- Orden de candados (para que nunca se crucen): ronda primero; después, el de cada operación (`compra_papel:`, `compra_gasto:`, `fondo:`).
-- Ninguna función que toma `fondo:` o esos candados toma el de la ronda después (`terminar_dia_compras` solo lee mientras lo tiene).
create or replace function retail.fn_ronda_compras_candado(p_persona uuid)
returns void
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if p_persona is not null then
    perform pg_advisory_xact_lock(hashtextextended('compra_ronda:' || p_persona::text, 0));
  end if;
end $$;
revoke all on function retail.fn_ronda_compras_candado(uuid) from public, anon, authenticated;

-- Anotar una compra: la envoltura es la que llama la pantalla (la de seis datos, `fn_registrar_compra_rapida_base`, queda detrás de ella).
-- Con el módulo, para que quien no lo tiene siga viendo el mismo error de siempre (42501) y no uno del responsable.
select pg_temp.reemplazar('retail.registrar_compra_rapida(uuid,uuid,text,numeric,text,jsonb,numeric,text)',
$v$  -- Sin el pago (una pantalla de antes): como siempre, todo pagado en efectivo (lo pone el disparador).$v$,
$n$  -- Auditoría 2026-10-27 (H11): el mismo candado que abrir y cerrar la ronda; si se está cerrando, esta compra espera y la base le dice «Abre tu ronda».
  if retail.fn_ve_modulo('ordenes_compra') is true then
    perform retail.fn_ronda_compras_candado(retail.fn_actor_persona_id(true));
  end if;
  -- Sin el pago (una pantalla de antes): como siempre, todo pagado en efectivo (lo pone el disparador).$n$,
1);

-- Anotar un gasto: después de saber quién es (y de la validación de módulo), antes del candado de su identificador.
select pg_temp.reemplazar('retail.registrar_gasto_rapido(uuid,text,text,numeric,text)',
$v$  perform pg_advisory_xact_lock(hashtextextended('compra_gasto:' || p_id::text, 0));$v$,
$n$  -- Auditoría 2026-10-27 (H11): el mismo candado que abrir y cerrar la ronda.
  perform retail.fn_ronda_compras_candado(v_actor);
  perform pg_advisory_xact_lock(hashtextextended('compra_gasto:' || p_id::text, 0));$n$,
1);

-- Anotar plata: justo antes del candado de su fondo. La plata sin ronda abierta se anota igual (queda sin ronda); lo que cambia es que no se
-- anote «a la vez» que se cierra la ronda: o entra en la ronda antes del cierre (y el cierre la cuenta) o después (y queda sin ronda).
select pg_temp.reemplazar('retail.anotar_plata_compras(text,numeric,text,uuid,uuid)',
$v$  perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_persona::text, 0));$v$,
$n$  -- Auditoría 2026-10-27 (H11): el mismo candado que abrir y cerrar la ronda, antes que el del fondo.
  perform retail.fn_ronda_compras_candado(v_persona);
  perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_persona::text, 0));$n$,
1);

-- ---------- 3. H1: la plata anotada y confirmada no se anula aparte ----------
-- Después de saber de qué fondo es (como el guardia de los cierres, que va antes), antes de pedir quién anula: una anotada que ya se
-- confirmó tiene ese movimiento como suyo, y anularlo la dejaría «confirmada» sin plata y sin forma de confirmarse otra vez.
select pg_temp.reemplazar('retail.anular_movimiento_fondo(uuid,text)',
$v$  v_duena := (select c.persona_id from retail.cuentas_dinero c where c.id = v_fondo);$v$,
$n$  v_duena := (select c.persona_id from retail.cuentas_dinero c where c.id = v_fondo);
  -- Auditoría 2026-10-27 (H1): la plata que anotó una compradora y Compras ya confirmó va con su anotación.
  if exists (select 1 from retail.fondo_plata_anotada pa where pa.movimiento_id = p_id) then
    raise exception 'Es plata que una compradora anotó y Compras ya confirmó: no se anula aparte, porque su anotación quedaría confirmada sin plata en su fondo. Si se confirmó con un dato equivocado, avisa al líder para corregirla.'
      using errcode = 'P0001', hint = 'movimiento_de_plata_anotada';
  end if;$n$,
1);

-- Y la lista no ofrece el «Anular» de ese movimiento (como el de un cierre). El ancla es el final del reemplazo de 20261023143000.
select pg_temp.reemplazar('retail.fn_fondos_movimientos(uuid,integer)',
$v$k.id = d.token_cliente) as puede_anular -- ADR-0480$v$,
$n$k.id = d.token_cliente)
             and not exists (select 1 from retail.fondo_plata_anotada fpa where fpa.movimiento_id = d.id) as puede_anular -- ADR-0480 + auditoría 2026-10-27 (H1)$n$,
1);

-- ---------- 4. H2: confirmar «ya tenía» es solo del líder ----------
-- Dentro del bloque de «ya tenía»: después de las validaciones comunes (monto, «nadie confirma la suya») y antes de crear o tocar el fondo.
-- Volver a confirmar lo que ya estaba confirmado devuelve antes de llegar aquí (no se le pide líder a un reintento).
select pg_temp.reemplazar('retail.confirmar_plata_compras(uuid,numeric,uuid)',
$v$    -- El saldo inicial de su fondo, con la fecha en que lo anotó (es su primera plata: nada en su fondo es de antes).$v$,
$n$    -- Auditoría 2026-10-27 (H2): no sale de ningún banco, solo fija con cuánto empieza el fondo; lo confirma un líder (se pregunta a la cuenta).
    if not coalesce(retail.fn_es_lider(), false) then
      raise exception 'La plata que ya tenía antes de usar el sistema la confirma un líder: no sale de ningún banco, solo fija con cuánto empieza su fondo. Pídele a un líder que la confirme.'
        using errcode = '42501', hint = 'plata_ya_tenia_solo_lider';
    end if;
    -- El saldo inicial de su fondo, con la fecha en que lo anotó (es su primera plata: nada en su fondo es de antes).$n$,
1);

-- ---------- 5. H14: «te dieron» suma lo confirmado, no lo anotado ----------
select pg_temp.reemplazar('retail.fn_ronda_compras_de(uuid)',
$v$select sum(a.monto) from retail.fondo_plata_anotada a where a.ronda_id = r.id$v$,
$n$select sum(coalesce(a.monto_confirmado, a.monto)) from retail.fondo_plata_anotada a where a.ronda_id = r.id$n$,
1);
select pg_temp.reemplazar('retail.fn_ronda_compras_cuenta(uuid)',
$v$select sum(a.monto) from retail.fondo_plata_anotada a where a.ronda_id = p_ronda$v$,
$n$select sum(coalesce(a.monto_confirmado, a.monto)) from retail.fondo_plata_anotada a where a.ronda_id = p_ronda$n$,
1);

-- ---------- 6. H10: cerrar la ronda dos veces seguidas devuelve el mismo cierre ----------
-- Sin ronda abierta pero con una cerrada hace menos de 2 minutos (una respuesta que se perdió y la persona vuelve a tocar el botón): se
-- devuelve ese cierre con `ya_estaba: true`, nada se escribe de nuevo ni se anota otra actividad. Pasados 2 minutos, el error de siempre.
-- Va dentro de `if v_ronda is null`, después del candado de la ronda: dos toques a la vez se ponen en fila y el segundo ve el cierre del primero.
select pg_temp.reemplazar('retail.terminar_dia_compras(text)',
$v$    raise exception 'No tienes una ronda de compras abierta' using errcode = 'P0001', hint = 'compra_ronda_sin_abrir';$v$,
$n$    -- Auditoría 2026-10-27 (H10): el cierre de hace un momento, si la respuesta no llegó.
    for v_rep in
      select r.numero, k.decision, k.monto, k.fecha
        from retail.compra_rondas r join retail.compra_cierres k on k.id = r.cierre_id
       where r.persona_id = v_actor and r.cerrada_en is not null and r.cerrada_en > now() - interval '2 minutes'
       order by r.cerrada_en desc limit 1
    loop
      return jsonb_build_object('decision', v_rep.decision, 'monto', v_rep.monto, 'fecha', v_rep.fecha,
                                'ronda', retail.fn_ronda_compras_numero_texto(v_rep.numero), 'ya_estaba', true);
    end loop;
    raise exception 'No tienes una ronda de compras abierta' using errcode = 'P0001', hint = 'compra_ronda_sin_abrir';$n$,
1);

notify pgrst, 'reload schema';
