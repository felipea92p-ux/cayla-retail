-- Fondos por rendir, fase 6 · actividad 1 (ADR-0362): entregar plata a una persona, registrar lo que devuelve, anular un error y ver
-- cuánto tiene cada una.
--
-- EL PROBLEMA PRIMERO. Las piezas de 20261013181000 (el tipo de cuenta `fondo`, los movimientos `entrega_fondo` y `devolucion_fondo`
-- y el módulo) no hacen nada solas: nadie puede escribir esos movimientos, y las funciones de dinero que ya existen no los conocen
-- (un tipo nuevo pasaría sin reglas por el validador de puntas, y el líder vería el fondo de otra persona como una cuenta más para pagar
-- en las 13 pantallas que preguntan «¿De dónde sale la plata?»). Y el control que Felipe pidió (decisiones 26, 30 y 35) tiene dos
-- candados: nadie se entrega plata a sí mismo, y quien entrega no es la dueña del fondo.
--
-- QUÉ CREA
--   1. Las claves `fondo_entregar`, `fondo_devolver` y `fondo_anular` en `acciones_sin_responsable`: con la cuenta de una PERSONA firma
--      ella, sin combo; desde una TERMINAL, el combo «Responsable» (el mismo trato que las órdenes de compra, decisión 39).
--   2. `fn_fondo_saldo(cuenta)`, interna: lo que una persona tiene en la mano, sumado del MISMO libro que «Cuentas y dinero»
--      (`fn_dinero_libro`). Así el día que se pague desde el fondo (actividad 2) el saldo ya lo cuenta, sin tocar esta función.
--   3. `fn_fondo_de(persona)`, interna: la cuenta de fondo de una persona; la crea la primera vez («Fondo · Nombre Apellido», 1413).
--   4. `entregar_fondo(persona, cuenta de origen, monto, para qué, fecha, token)`: de un banco, una caja fuerte o lo que tiene el líder
--      (esto último, solo el líder, como en todo el ERP) al fondo de la persona. Exige el módulo `fondos`, el «para qué» (queda en la
--      referencia del movimiento) y que la persona no sea quien entrega: ni la cuenta con la que se entró ni la del combo.
--   5. `devolver_fondo(persona, cuenta de destino, monto, nota, fecha, token)`: lo que la persona devuelve a un banco, una caja fuerte o
--      al líder. Nunca más de lo que tiene, y la registra otra persona con el módulo (quien recibe la plata), no la dueña.
--   6. `anular_movimiento_fondo(id, motivo)`: un error se anula con su motivo, no se borra. Mismos candados; y anular una entrega no puede
--      dejar el fondo en negativo (si esa plata ya se usó, no se «des-entrega»).
--   7. Las lecturas de la pantalla, todas con el módulo `fondos`: `fn_fondos()` (una fila por persona: tiene en la mano, le entregaron,
--      devolvió y gastó —lo que falta para cuadrar, que hoy es 0 y la actividad 2 llena sin cambiar esta función—), `fn_fondos_movimientos`
--      y `fn_fondos_opciones()` (a quién se le puede entregar y desde qué cuentas).
--   8. Las funciones de dinero que ya existen aprenden el fondo, con reemplazos anclados en su definición viva (abortan sin cambiar
--      nada si la función cambió desde que se escribió esta migración):
--      · `fn_movimientos_dinero_validar`: las puntas de la entrega y la devolución, y que un fondo solo se mueva con ellas.
--      · `fn_texto_movimiento_dinero`: «Entrega de fondo» y «Devolución de fondo» (los ven el libro, el Diario y el flujo).
--      · `fn_cuentas_dinero_inmutable`: la dueña de un fondo no cambia, un fondo no pasa a ser otra cosa ni se archiva desde aquí.
--      · `fn_cuentas_para_elegir`: el fondo de una persona no aparece en «¿De dónde sale la plata?» (pagar desde «Mi fondo» es la
--        actividad 2, y solo para su dueña).
--      · `anular_movimiento_dinero` y `fn_movimientos_dinero`: la plata de un fondo no se anula en «Cuentas y dinero» (allí el líder
--        podría anular su propia entrega); se anula en Compras ▸ Fondos por rendir, con sus candados.
--
-- DESCARTÉ
--   · Que `registrar_movimiento_dinero` acepte los tipos nuevos: su permiso es «el líder, todo» y los candados del fondo (el módulo, la
--     dueña) no son los suyos. Su lista cerrada ya los rechaza.
--   · Que la dueña registre su propia devolución: diría que devolvió plata que nadie recibió. La registra quien la recibe.
--   · Calcular el saldo del fondo solo con `movimientos_dinero`: el día que se pague desde el fondo, esa suma mentiría. El libro ya junta
--     todo lo que entra y sale de una cuenta.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte, DESPUÉS de 20261013181000: funciones nuevas y reemplazos anclados;
-- sin tablas, sin políticas, sin `drop trigger` (ADR-0195) y sin `select … into` dentro de textos entre comillas (ADR-0288). Antes de
-- pegar, simular los reemplazos contra la definición de producción (solo lectura). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplaza un texto en la definición VIVA de una función, solo si aparece las veces esperadas; si ya está reemplazado, no hace nada.
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

-- ---------- 1. Con la cuenta de una persona, sin combo (decisión 39, extendida al fondo) ----------
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('fondo_entregar', 'Entregar plata al fondo de una persona (con la cuenta de una persona firma ella, desde una terminal se elige quién)'),
  ('fondo_devolver', 'Registrar lo que una persona devuelve de su fondo (con la cuenta de una persona firma ella, desde una terminal se elige quién)'),
  ('fondo_anular', 'Anular una entrega o una devolución de fondo (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 2. Piezas internas ----------

-- Lo que una persona tiene en la mano: el mismo libro que suma todas las cuentas de dinero.
create or replace function retail.fn_fondo_saldo(p_cuenta_id uuid) returns numeric
language sql stable security definer set search_path = retail, public, extensions as $$
  select coalesce((select c.saldo_inicial from retail.cuentas_dinero c where c.id = p_cuenta_id), 0)
       + coalesce((select sum(l.monto) from retail.fn_dinero_libro(retail.fn_hoy_lima()) l where l.cuenta_id = p_cuenta_id), 0);
$$;

-- La cuenta de fondo viva de una persona; la crea la primera vez. Quien la llama ya tomó el candado de esa persona.
create or replace function retail.fn_fondo_de(p_persona_id uuid, p_crear boolean default true) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_id uuid;
  v_nombre text;
begin
  v_id := (select c.id from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = p_persona_id and c.archivada_en is null);
  if v_id is not null or not p_crear then
    return v_id;
  end if;
  v_nombre := left('Fondo · ' || coalesce(nullif(trim(concat_ws(' ', (select p.nombres from public.personas p where p.id = p_persona_id),
                                                                    (select p.apellidos from public.personas p where p.id = p_persona_id))), ''),
                                         'sin nombre'), 74);
  -- El nombre de una cuenta viva no se repite: dos personas que se llaman igual se distinguen con el inicio de su id.
  if exists (select 1 from retail.cuentas_dinero c where lower(c.nombre) = lower(v_nombre) and c.archivada_en is null) then
    v_nombre := v_nombre || ' · ' || upper(left(p_persona_id::text, 4));
  end if;
  insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, persona_id, orden, creada_por)
  values (v_nombre, 'fondo', '1413', p_persona_id, 55, retail.fn_actor_persona_id(true))
  returning id into v_id;
  return v_id;
end $$;

-- Nadie mueve plata de su propio fondo desde Fondos por rendir: ni con la cuenta con la que entró, ni eligiéndose en el combo.
create or replace function retail.fn_fondo_exigir_otra_persona(p_persona_id uuid, p_actor uuid, p_que text) returns void
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if p_persona_id = p_actor
     or p_persona_id = (select p.id from public.personas p where p.auth_user_id = auth.uid()) then
    raise exception '%', p_que || ': que lo haga otra persona con el módulo Fondos por rendir.' using errcode = '42501', hint = 'fondo_propio';
  end if;
end $$;

-- ---------- 3. Entregar plata a una persona ----------
create or replace function retail.entregar_fondo(
  p_persona_id uuid,
  p_cuenta_origen_id uuid,
  p_monto numeric,
  p_motivo text,
  p_fecha date default null,
  p_token uuid default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_id uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_fecha date := coalesce(p_fecha, retail.fn_hoy_lima());
  v_monto numeric := round(p_monto, 2);
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_o retail.cuentas_dinero%rowtype;
  v_actor uuid;
  v_fondo uuid;
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Entregar plata para comprar necesita el módulo Fondos por rendir en tu rol.' using errcode = '42501';
  end if;
  -- Doble clic / reintento: el segundo intento espera al primero y devuelve SU movimiento (ADR-0190).
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('movimientos_dinero:' || p_token::text, 0));
    v_id := (select d.id from retail.movimientos_dinero d where d.token_cliente = p_token);
    if v_id is not null then
      return v_id;
    end if;
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién entrega la plata.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_persona_id is null or not exists (
       select 1 from public.personas p join retail.colaboradores c on c.persona_id = p.id
        where p.id = p_persona_id and p.estado = 'activo' and c.estado = 'activo') then
    raise exception 'Elige a quién le entregas la plata: una persona activa del equipo.' using errcode = 'P0001';
  end if;
  perform retail.fn_fondo_exigir_otra_persona(p_persona_id, v_actor, 'Nadie se entrega plata a sí mismo');

  select * into v_o from retail.cuentas_dinero where id = p_cuenta_origen_id;
  if not found then
    raise exception 'Elige de dónde sale la plata.' using errcode = 'P0001';
  end if;
  if v_o.tipo not in ('banco', 'caja_fuerte', 'por_rendir') then
    raise exception 'La plata de un fondo sale de un banco, de una caja fuerte o de lo que tiene el líder: «%» no lo es.', v_o.nombre
      using errcode = 'P0001';
  end if;
  if v_o.tipo = 'por_rendir' and not retail.fn_es_lider() then
    raise exception 'Lo que tiene el líder solo lo mueve el líder.' using errcode = '42501';
  end if;
  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if v_motivo is null then
    raise exception 'Di para qué es la plata (la compra o el viaje).' using errcode = 'P0001';
  end if;
  if char_length(v_motivo) > 200 then
    raise exception 'El «para qué» es muy largo (máximo 200 letras).' using errcode = 'P0001';
  end if;
  if v_fecha > v_hoy then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fondo:' || p_persona_id::text, 0));
  v_fondo := retail.fn_fondo_de(p_persona_id, true);

  insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, cuenta_destino_id, monto, referencia, registrado_por, token_cliente)
  values ('entrega_fondo', v_fecha, v_o.id, v_fondo, v_monto, v_motivo, v_actor, p_token)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  if p_token is not null and exists (select 1 from retail.movimientos_dinero d where d.token_cliente = p_token) then
    return (select d.id from retail.movimientos_dinero d where d.token_cliente = p_token);
  end if;
  raise;
end $$;

-- ---------- 4. Lo que la persona devuelve ----------
create or replace function retail.devolver_fondo(
  p_persona_id uuid,
  p_cuenta_destino_id uuid,
  p_monto numeric,
  p_nota text default null,
  p_fecha date default null,
  p_token uuid default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_id uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_fecha date := coalesce(p_fecha, retail.fn_hoy_lima());
  v_monto numeric := round(p_monto, 2);
  v_nota text := nullif(trim(coalesce(p_nota, '')), '');
  v_d retail.cuentas_dinero%rowtype;
  v_actor uuid;
  v_fondo uuid;
  v_saldo numeric;
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Registrar lo que se devuelve de un fondo necesita el módulo Fondos por rendir en tu rol.' using errcode = '42501';
  end if;
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('movimientos_dinero:' || p_token::text, 0));
    v_id := (select d.id from retail.movimientos_dinero d where d.token_cliente = p_token);
    if v_id is not null then
      return v_id;
    end if;
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién recibe la plata.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_fondo_exigir_otra_persona(p_persona_id, v_actor, 'Lo que devuelves de tu fondo lo registra quien recibe la plata');

  select * into v_d from retail.cuentas_dinero where id = p_cuenta_destino_id;
  if not found then
    raise exception 'Elige a dónde vuelve la plata.' using errcode = 'P0001';
  end if;
  if v_d.tipo not in ('banco', 'caja_fuerte', 'por_rendir') then
    raise exception 'Lo que se devuelve de un fondo vuelve a un banco, a una caja fuerte o al líder: «%» no lo es.', v_d.nombre
      using errcode = 'P0001';
  end if;
  if v_d.tipo = 'por_rendir' and not retail.fn_es_lider() then
    raise exception 'Lo que tiene el líder solo lo mueve el líder.' using errcode = '42501';
  end if;
  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_nota, '')) > 200 then
    raise exception 'La nota es muy larga (máximo 200 letras).' using errcode = 'P0001';
  end if;
  if v_fecha > v_hoy then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fondo:' || p_persona_id::text, 0));
  v_fondo := retail.fn_fondo_de(p_persona_id, false);
  if v_fondo is null then
    raise exception 'Esa persona no tiene fondo: no hay nada que devolver.' using errcode = 'P0001';
  end if;
  v_saldo := retail.fn_fondo_saldo(v_fondo);
  if v_monto > v_saldo then
    raise exception 'Tiene S/ % en su fondo: no puede devolver S/ %.', to_char(greatest(v_saldo, 0), 'FM999G999G990D00'),
      to_char(v_monto, 'FM999G999G990D00') using errcode = 'P0001', hint = 'fondo_insuficiente';
  end if;

  insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, cuenta_destino_id, monto, referencia, registrado_por, token_cliente)
  values ('devolucion_fondo', v_fecha, v_fondo, v_d.id, v_monto, v_nota, v_actor, p_token)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  if p_token is not null and exists (select 1 from retail.movimientos_dinero d where d.token_cliente = p_token) then
    return (select d.id from retail.movimientos_dinero d where d.token_cliente = p_token);
  end if;
  raise;
end $$;

-- ---------- 5. Anular una entrega o una devolución ----------
create or replace function retail.anular_movimiento_fondo(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_m retail.movimientos_dinero%rowtype;
  v_actor uuid;
  v_fondo uuid;
  v_duena uuid;
  v_saldo numeric;
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Anular la plata de un fondo necesita el módulo Fondos por rendir en tu rol.' using errcode = '42501';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Di por qué se anula.' using errcode = 'P0001';
  end if;
  select * into v_m from retail.movimientos_dinero where id = p_id for update;
  if not found or v_m.tipo not in ('entrega_fondo', 'devolucion_fondo') then
    raise exception 'Ese movimiento no es de un fondo.' using errcode = 'P0001';
  end if;
  if v_m.estado = 'anulado' then
    raise exception 'Ese movimiento ya estaba anulado.' using errcode = 'P0001';
  end if;
  v_fondo := case when v_m.tipo = 'entrega_fondo' then v_m.cuenta_destino_id else v_m.cuenta_origen_id end;
  v_duena := (select c.persona_id from retail.cuentas_dinero c where c.id = v_fondo);

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién anula.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_fondo_exigir_otra_persona(v_duena, v_actor, 'La plata de tu propio fondo no la anulas tú');

  perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_duena::text, 0));
  -- Una entrega de la que ya salió plata (devuelta o pagada) no se «des-entrega»: el fondo quedaría diciendo que CAYLA le debe a la
  -- persona una plata que sí recibió. Desde la actividad 2 el fondo puede estar en negativo (pagó de su bolsillo): de una entrega
  -- nunca «salió» más de lo que se entregó.
  if v_m.tipo = 'entrega_fondo' then
    v_saldo := retail.fn_fondo_saldo(v_fondo);
    if v_saldo - v_m.monto < 0 then
      raise exception 'De esa entrega ya salieron S/ % (lo que se devolvió o se pagó con ella): anularla dejaría el fondo en S/ %.', to_char(least(v_m.monto, v_m.monto - v_saldo), 'FM999G999G990D00'),
        to_char(v_saldo - v_m.monto, 'FM999G999G990D00') using errcode = 'P0001', hint = 'fondo_insuficiente';
    end if;
  end if;

  update retail.movimientos_dinero
     set estado = 'anulado', motivo_anulacion = trim(p_motivo), anulado_por = v_actor, anulado_en = now()
   where id = p_id;
end $$;

-- ---------- 6. Lo que ve la pantalla ----------

-- Una fila por persona con fondo vivo. «Gastó» es lo que falta para cuadrar (le entregaron − devolvió − tiene): hoy es 0, y desde la
-- actividad 2 (pagar desde el fondo) lo llena el libro sin cambiar esta función.
create or replace function retail.fn_fondos()
returns table (
  cuenta_id uuid, persona_id uuid, persona_nombre text, sede_nombre text, saldo numeric, entregado numeric, devuelto numeric,
  gastado numeric, primera_entrega date, ultima_entrega date, ultimo_motivo text, es_mio boolean
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_yo uuid := (select p.id from public.personas p where p.auth_user_id = auth.uid());
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Ver los fondos necesita el módulo Fondos por rendir en tu rol.' using errcode = '42501';
  end if;
  return query
  with fondos as (
    select c.id, c.persona_id from retail.cuentas_dinero c where c.tipo = 'fondo' and c.archivada_en is null
  ),
  libro as materialized (
    select l.cuenta_id, l.monto from retail.fn_dinero_libro(retail.fn_hoy_lima()) l where l.cuenta_id in (select f.id from fondos f)
  ),
  movs as materialized (
    select d.tipo, d.fecha, d.created_at, d.monto, d.referencia,
           case when d.tipo = 'entrega_fondo' then d.cuenta_destino_id else d.cuenta_origen_id end as fondo_id
      from retail.movimientos_dinero d
     where d.estado = 'vigente' and d.tipo in ('entrega_fondo', 'devolucion_fondo')
  ),
  sumas as (
    select f.id, f.persona_id,
           coalesce((select sum(l.monto) from libro l where l.cuenta_id = f.id), 0) as saldo,
           coalesce((select sum(m.monto) from movs m where m.fondo_id = f.id and m.tipo = 'entrega_fondo'), 0) as entregado,
           coalesce((select sum(m.monto) from movs m where m.fondo_id = f.id and m.tipo = 'devolucion_fondo'), 0) as devuelto
      from fondos f
  )
  select s.id, s.persona_id, trim(concat_ws(' ', p.nombres, p.apellidos)), u.nombre,
         s.saldo, s.entregado, s.devuelto, s.entregado - s.devuelto - s.saldo,
         (select min(m.fecha) from movs m where m.fondo_id = s.id and m.tipo = 'entrega_fondo'),
         (select max(m.fecha) from movs m where m.fondo_id = s.id and m.tipo = 'entrega_fondo'),
         (select m.referencia from movs m where m.fondo_id = s.id and m.tipo = 'entrega_fondo' order by m.fecha desc, m.created_at desc limit 1),
         s.persona_id = v_yo
    from sumas s
    join public.personas p on p.id = s.persona_id
    left join retail.colaboradores co on co.persona_id = s.persona_id
    left join retail.ubicaciones u on u.id = co.ubicacion_asignada_id
   order by s.saldo desc, 3;
end $$;

-- Las entregas y devoluciones, la más nueva primero. `puede_anular` es la pista para la pantalla; quien decide es la función.
create or replace function retail.fn_fondos_movimientos(p_persona_id uuid default null, p_limite integer default 200)
returns table (
  id uuid, tipo text, fecha date, persona_id uuid, persona_nombre text, cuenta_id uuid, cuenta_nombre text, monto numeric,
  motivo text, estado text, motivo_anulacion text, registrado_por_nombre text, anulado_por_nombre text, creado_en timestamptz,
  puede_anular boolean
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_yo uuid := (select p.id from public.personas p where p.auth_user_id = auth.uid());
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Ver los fondos necesita el módulo Fondos por rendir en tu rol.' using errcode = '42501';
  end if;
  return query
  select d.id, d.tipo, d.fecha, f.persona_id, trim(concat_ws(' ', pe.nombres, pe.apellidos)),
         o.id, o.nombre, d.monto, d.referencia, d.estado, d.motivo_anulacion,
         trim(concat_ws(' ', pr.nombres, pr.apellidos)), trim(concat_ws(' ', pa.nombres, pa.apellidos)), d.created_at,
         d.estado = 'vigente' and f.persona_id is distinct from v_yo
    from retail.movimientos_dinero d
    join retail.cuentas_dinero f on f.id = case when d.tipo = 'entrega_fondo' then d.cuenta_destino_id else d.cuenta_origen_id end
    join retail.cuentas_dinero o on o.id = case when d.tipo = 'entrega_fondo' then d.cuenta_origen_id else d.cuenta_destino_id end
    join public.personas pe on pe.id = f.persona_id
    left join public.personas pr on pr.id = d.registrado_por
    left join public.personas pa on pa.id = d.anulado_por
   where d.tipo in ('entrega_fondo', 'devolucion_fondo')
     and (p_persona_id is null or f.persona_id = p_persona_id)
   order by d.fecha desc, d.created_at desc
   limit greatest(coalesce(p_limite, 200), 1);
end $$;

-- A quién se le puede entregar (las personas activas del equipo; la pantalla marca a quien entra, que no puede entregarse) y desde qué
-- cuentas sale o a cuáles vuelve la plata (bancos, cajas fuertes y, solo para el líder, lo que tiene el líder).
create or replace function retail.fn_fondos_opciones() returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_lider boolean := retail.fn_es_lider();
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Ver los fondos necesita el módulo Fondos por rendir en tu rol.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'yo', (select p.id from public.personas p where p.auth_user_id = auth.uid()),
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'sede', x.sede) order by x.nombre)
        from (select p.id, trim(concat_ws(' ', p.nombres, p.apellidos)) as nombre, u.nombre as sede
                from public.personas p
                join retail.colaboradores c on c.persona_id = p.id
                left join retail.ubicaciones u on u.id = c.ubicacion_asignada_id
               where p.estado = 'activo' and c.estado = 'activo') x
    ), '[]'::jsonb),
    'cuentas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'tipo', c.tipo, 'sede', u.nombre) order by c.orden, u.nombre nulls first, c.nombre)
        from retail.cuentas_dinero c
        left join retail.ubicaciones u on u.id = c.ubicacion_id
       where c.archivada_en is null
         and (c.tipo in ('banco', 'caja_fuerte') or (c.tipo = 'por_rendir' and v_lider))
    ), '[]'::jsonb)
  );
end $$;

-- ---------- 7. Las funciones de dinero que ya existen aprenden el fondo ----------

-- Las puntas: la entrega va de un banco, una caja fuerte o el líder a un fondo; la devolución, al revés; y un fondo solo se mueve con ellas.
select pg_temp.reemplazar('retail.fn_movimientos_dinero_validar()',
$v$     or (new.tipo = 'entre_cuentas' and not ((v_o.tipo = 'banco' and v_d.tipo = 'banco')
                                             or (v_d.tipo = 'cajon' and v_o.tipo in ('cajon', 'caja_fuerte', 'por_rendir')))) then$v$,
$n$     or (new.tipo = 'entre_cuentas' and not ((v_o.tipo = 'banco' and v_d.tipo = 'banco')
                                             or (v_d.tipo = 'cajon' and v_o.tipo in ('cajon', 'caja_fuerte', 'por_rendir'))))
     -- ADR-0362 fase 6: el fondo de una persona solo recibe entregas y solo devuelve (pagar desde él llega en la actividad 2).
     or (new.tipo = 'entrega_fondo' and (coalesce(v_o.tipo, '') not in ('banco', 'caja_fuerte', 'por_rendir') or coalesce(v_d.tipo, '') <> 'fondo'))
     or (new.tipo = 'devolucion_fondo' and (coalesce(v_o.tipo, '') <> 'fondo' or coalesce(v_d.tipo, '') not in ('banco', 'caja_fuerte', 'por_rendir')))
     or (new.tipo not in ('entrega_fondo', 'devolucion_fondo') and 'fondo' in (coalesce(v_o.tipo, ''), coalesce(v_d.tipo, ''))) then$n$,
1);

select pg_temp.reemplazar('retail.fn_texto_movimiento_dinero(text)',
$v$    when 'entre_cuentas' then 'Entre cuentas'$v$,
$n$    when 'entre_cuentas' then 'Entre cuentas'
    when 'entrega_fondo' then 'Entrega de fondo'
    when 'devolucion_fondo' then 'Devolución de fondo'$n$,
1);

-- La dueña de un fondo no cambia; un fondo no pasa a ser otra cosa (ni otra cosa a fondo) y no se archiva desde «Cuentas y dinero».
select pg_temp.reemplazar('retail.fn_cuentas_dinero_inmutable()',
$v$  if (new.id, new.ubicacion_id, new.creada_por, new.created_at) is distinct from (old.id, old.ubicacion_id, old.creada_por, old.created_at) then$v$,
$n$  if new.persona_id is distinct from old.persona_id or (new.tipo = 'fondo') <> (old.tipo = 'fondo') then
    raise exception 'Un fondo es de una persona: de quién es y su tipo no cambian.' using errcode = 'P0001';
  end if;
  if new.tipo = 'fondo' and new.archivada_en is not null and old.archivada_en is null then
    raise exception 'Un fondo no se archiva desde aquí: se cierra cuando se rinde.' using errcode = 'P0001';
  end if;
  if (new.id, new.ubicacion_id, new.creada_por, new.created_at) is distinct from (old.id, old.ubicacion_id, old.creada_por, old.created_at) then$n$,
1);

-- «¿De dónde sale la plata?»: el fondo de una persona no es una cuenta para pagar cualquier cosa.
select pg_temp.reemplazar('retail.fn_cuentas_para_elegir(text, uuid)',
$v$     where c.archivada_en is null
       and (v_lider$v$,
$n$     where c.archivada_en is null
       and c.tipo <> 'fondo'
       and (v_lider$n$,
1);

-- La plata de un fondo se anula en Fondos por rendir, con sus candados; en «Cuentas y dinero» no.
select pg_temp.reemplazar('retail.anular_movimiento_dinero(uuid, text)',
$v$  if not retail.fn_es_lider() and not (v_m.tipo = 'deposito' and v_m.ubicacion_id = any (v_ubics)) then$v$,
$n$  if v_m.tipo in ('entrega_fondo', 'devolucion_fondo') then
    raise exception 'La plata de un fondo se anula en Compras ▸ Fondos por rendir.' using errcode = 'P0001';
  end if;
  if not retail.fn_es_lider() and not (v_m.tipo = 'deposito' and v_m.ubicacion_id = any (v_ubics)) then$n$,
1);

select pg_temp.reemplazar('retail.fn_movimientos_dinero(uuid, integer)',
$v$         d.estado = 'vigente' and (v_lider or (d.tipo = 'deposito' and d.ubicacion_id = any (v_ubics)))$v$,
$n$         d.estado = 'vigente' and d.tipo not in ('entrega_fondo', 'devolucion_fondo')
           and (v_lider or (d.tipo = 'deposito' and d.ubicacion_id = any (v_ubics)))$n$,
1);

-- ---------- 8. Permisos ----------
revoke all on function retail.fn_fondo_saldo(uuid) from public, anon, authenticated;
revoke all on function retail.fn_fondo_de(uuid, boolean) from public, anon, authenticated;
revoke all on function retail.fn_fondo_exigir_otra_persona(uuid, uuid, text) from public, anon, authenticated;
revoke all on function retail.entregar_fondo(uuid, uuid, numeric, text, date, uuid) from public, anon;
revoke all on function retail.devolver_fondo(uuid, uuid, numeric, text, date, uuid) from public, anon;
revoke all on function retail.anular_movimiento_fondo(uuid, text) from public, anon;
revoke all on function retail.fn_fondos() from public, anon;
revoke all on function retail.fn_fondos_movimientos(uuid, integer) from public, anon;
revoke all on function retail.fn_fondos_opciones() from public, anon;
grant execute on function retail.entregar_fondo(uuid, uuid, numeric, text, date, uuid) to authenticated, service_role;
grant execute on function retail.devolver_fondo(uuid, uuid, numeric, text, date, uuid) to authenticated, service_role;
grant execute on function retail.anular_movimiento_fondo(uuid, text) to authenticated, service_role;
grant execute on function retail.fn_fondos() to authenticated, service_role;
grant execute on function retail.fn_fondos_movimientos(uuid, integer) to authenticated, service_role;
grant execute on function retail.fn_fondos_opciones() to authenticated, service_role;

reset lock_timeout;
notify pgrst, 'reload schema';
