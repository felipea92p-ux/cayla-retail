-- 20260925210000 — Editar y eliminar las cuentas de CAYLA (ADR-0195 F3, «Actualización 2026-09-25»; Felipe 2026-09-25)
--
-- EL PROBLEMA PRIMERO
--   En Configuración ▸ Cuentas y cobros una cuenta se agrega y se archiva, pero no se corrige: si el líder escribió mal
--   el nombre, el número, el tipo o el saldo con el que empieza, la única salida era archivarla y crear otra (y el nombre
--   quedaba ocupado mientras la vieja siguiera activa). Tampoco había cómo quitar una cuenta creada por error.
--
-- LAS REGLAS
--   1. EDITAR. El nombre y el número se cambian siempre (el cajón, la caja fuerte y el efectivo por rendir, solo el
--      nombre). El TIPO, solo mientras nadie la haya usado: cada cobro o pago sellado se validó contra su tipo (F3b), y
--      cambiarlo después dejaría un Yape «sellado» en una tarjeta de crédito. El SALDO INICIAL y su fecha, mientras la
--      cuenta no tenga una conciliación vigente (el banco ya certificó un saldo que saldría de ese punto de partida) y los
--      meses que toca no estén cerrados (ADR-0198). Cada cambio queda en `configuracion_historial` con el antes y el
--      después.
--   2. ELIMINAR = BORRAR DE VERDAD, pero SOLO una cuenta por la que nunca pasó nada: ninguna fila de ninguna tabla la
--      apunta (cobros, pagos, gastos, movimientos, conciliaciones, configuración de cobros…). Se pregunta a las llaves
--      foráneas mismas (`fn_usos_cuenta_dinero`), así una tabla que se agregue mañana también cuenta, y el `delete` lo
--      vuelve a garantizar la base: si algo la apunta, falla. Es deshacer un error de tipeo, no borrar historia: su
--      creación y su eliminación quedan en `configuracion_historial` con la fila completa. Una cuenta que YA se usó no
--      se elimina: se archiva (como hasta hoy) y sus movimientos se quedan (CLAUDE.md: nunca se borra historia).
--   3. Las cuentas que nacen con cada sede (cajón, caja fuerte, efectivo por rendir) no se eliminan ni cambian de tipo.
--   4. El candado de la tabla (`fn_cuentas_dinero_inmutable`) sigue diciendo lo mismo para todos, salvo para estas dos
--      funciones: ellas encienden `retail.editando_cuenta` solo durante su propio cambio (el mismo patrón que
--      `retail.movimiento_de_sistema` de F3b) después de validar las reglas de arriba.
--   Todo es solo del líder (`fn_exigir_lider_dinero`), firmado con el responsable (`fn_actor_persona_id(true)`).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA sola ejecución. Solo funciones (`create or replace`): no toca tablas en uso, no crea
-- políticas ni borra disparadores (CLAUDE.md «Políticas y deadlocks»). Idempotente. Antes debe estar F3 (20260925110000)
-- y F9 (20260925180000, por `fn_exigir_mes_abierto`).
-- SE ROMPE SI: la web nueva se publica antes (llama a `editar_cuenta_dinero`, `eliminar_cuenta_dinero` y
-- `fn_cuenta_dinero_detalle`, que no existirían). La web de hoy no se entera de esta migración.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El candado de la tabla, con la puerta de las dos funciones ----------
create or replace function retail.fn_cuentas_dinero_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
declare v_editando boolean := coalesce(current_setting('retail.editando_cuenta', true), '') = 'si';
begin
  if tg_op = 'DELETE' then
    -- Solo `eliminar_cuenta_dinero`, que ya comprobó que nada la apunta (y si algo la apunta, la llave foránea falla).
    if not v_editando then
      raise exception 'Una cuenta no se borra: se archiva.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if (new.id, new.ubicacion_id, new.creada_por, new.created_at) is distinct from (old.id, old.ubicacion_id, old.creada_por, old.created_at) then
    raise exception 'De una cuenta no cambia su sede ni quién la creó.' using errcode = 'P0001';
  end if;
  -- El tipo, su cuenta contable y el saldo inicial los cambia solo `editar_cuenta_dinero`, que valida cuándo se puede.
  if not v_editando
     and (new.tipo, new.cuenta_contable, new.saldo_inicial, new.saldo_desde) is distinct from
         (old.tipo, old.cuenta_contable, old.saldo_inicial, old.saldo_desde) then
    raise exception 'De una cuenta solo cambia el nombre, el número o si está archivada: su tipo y su saldo inicial quedan.' using errcode = 'P0001';
  end if;
  if new.archivada_en is not null and old.archivada_en is null and new.tipo in ('cajon', 'caja_fuerte', 'por_rendir') then
    raise exception 'El cajón, la caja fuerte y el efectivo por rendir nacen con cada sede: no se archivan.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- 2. Quién apunta a una cuenta ----------
-- USO INTERNO. Cuántas filas de cada tabla la apuntan, leído de las llaves foráneas que llegan a `cuentas_dinero` (no
-- de una lista escrita a mano): una tabla nueva con su llave también cuenta. Solo las tablas con al menos una fila.
create or replace function retail.fn_usos_cuenta_dinero(p_cuenta_id uuid)
returns table (tabla text, n bigint)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare r record; v_n bigint;
begin
  for r in
    select k.conrelid::regclass as rel, c.relname::text as nombre, a.attname::text as columna
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
     where k.contype = 'f' and k.confrelid = 'retail.cuentas_dinero'::regclass and cardinality(k.conkey) = 1
     order by c.relname, a.attname
  loop
    execute format('select count(*) from %s where %I = $1', r.rel, r.columna) into v_n using p_cuenta_id;
    if v_n > 0 then
      tabla := r.nombre;
      n := v_n;
      return next;
    end if;
  end loop;
end $$;
comment on function retail.fn_usos_cuenta_dinero(uuid) is
  'USO INTERNO (ADR-0195). Cuántas filas de cada tabla apuntan a una cuenta, según las llaves foráneas que llegan a cuentas_dinero. Vacío = nunca se usó: se puede eliminar y cambiar de tipo.';

-- ---------- 3. Lo que la ventana «Editar cuenta» necesita saber ----------
create or replace function retail.fn_cuenta_dinero_detalle(p_cuenta_id uuid) returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_c retail.cuentas_dinero%rowtype;
  v_hoy date := retail.fn_hoy_lima();
  v_usos jsonb;
  v_usada boolean;
  v_automatica boolean;
  v_conciliada date;
  v_mes_cerrado date;
  v_recibe jsonb;
  v_motivo_saldo text;
begin
  perform retail.fn_exigir_lider_dinero('Editar cuentas');
  select * into v_c from retail.cuentas_dinero where id = p_cuenta_id;
  if not found then
    raise exception 'Esa cuenta no existe. Recarga la pantalla.' using errcode = 'P0001';
  end if;
  v_automatica := v_c.tipo in ('cajon', 'caja_fuerte', 'por_rendir');
  select coalesce(jsonb_agg(jsonb_build_object('tabla', u.tabla, 'n', u.n) order by u.n desc, u.tabla), '[]'::jsonb)
    into v_usos from retail.fn_usos_cuenta_dinero(p_cuenta_id) u;
  v_usada := jsonb_array_length(v_usos) > 0;
  select max(k.fecha) into v_conciliada from retail.conciliaciones k where k.cuenta_id = p_cuenta_id and k.estado = 'vigente';
  v_mes_cerrado := case when v_c.saldo_desde is not null then retail.fn_primer_mes_cerrado(null, v_c.saldo_desde, v_hoy) end;
  -- Qué cobros entran HOY a esta cuenta (lo que impide archivarla).
  select coalesce(jsonb_agg(jsonb_build_object('tienda', u.nombre, 'medio', m.medio) order by u.nombre, m.medio), '[]'::jsonb)
    into v_recibe
    from retail.ubicaciones u cross join (values ('yape'), ('plin'), ('tarjeta'), ('transferencia')) m (medio)
   where u.activo and u.tipo = 'tienda' and retail.fn_cuenta_de_cobro(u.id, m.medio, v_hoy) = p_cuenta_id;
  v_motivo_saldo := case
    when v_automatica then 'El cajón, la caja fuerte y el efectivo por rendir no llevan saldo inicial: su punto de partida se registra en Reportes ▸ Balance.'
    when v_conciliada is not null then 'Esta cuenta se concilió con el banco al ' || to_char(v_conciliada, 'DD/MM/YYYY')
         || ': anula esa conciliación en Cuentas y dinero para corregir su saldo inicial.'
    when v_mes_cerrado is not null then retail.fn_texto_periodo(v_mes_cerrado, 'empresa', null)
         || ' está cerrado: reábrelo con motivo para corregir el saldo inicial.'
  end;
  return jsonb_build_object(
    'id', v_c.id, 'nombre', v_c.nombre, 'tipo', v_c.tipo, 'numero', v_c.numero,
    'saldo_inicial', v_c.saldo_inicial, 'saldo_desde', v_c.saldo_desde,
    'archivada', v_c.archivada_en is not null, 'automatica', v_automatica,
    'usos', v_usos, 'usada', v_usada, 'recibe', v_recibe,
    'puede_eliminar', not v_automatica and not v_usada,
    'puede_cambiar_tipo', not v_automatica and not v_usada,
    'puede_cambiar_saldo', v_motivo_saldo is null,
    'motivo_saldo', v_motivo_saldo);
end $$;
comment on function retail.fn_cuenta_dinero_detalle(uuid) is
  'Solo líder (ADR-0195). Lo que la ventana «Editar cuenta» necesita: los datos de la cuenta, quién la usa (fn_usos_cuenta_dinero), qué cobros entran hoy a ella y qué se puede cambiar.';

-- ---------- 4. Editar ----------
-- `p_tipo`, `p_saldo_inicial` y `p_saldo_desde` nulos = no cambian. El saldo llega con su signo (la tarjeta de crédito
-- empieza con lo que se debe, en negativo), como en `crear_cuenta_dinero`.
create or replace function retail.editar_cuenta_dinero(p_cuenta_id uuid, p_nombre text, p_numero text default null,
                                                       p_tipo text default null, p_saldo_inicial numeric default null,
                                                       p_saldo_desde date default null)
returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_c retail.cuentas_dinero%rowtype;
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_numero text;
  v_tipo text;
  v_saldo numeric(12,2);
  v_desde date;
  v_hoy date := retail.fn_hoy_lima();
  v_automatica boolean;
  v_conciliada date;
  v_antes jsonb := '{}'::jsonb;
  v_despues jsonb := '{}'::jsonb;
  v_actor uuid;
begin
  perform retail.fn_exigir_lider_dinero('Editar cuentas');
  select * into v_c from retail.cuentas_dinero where id = p_cuenta_id for update;
  if not found then
    raise exception 'Esa cuenta no existe. Recarga la pantalla.' using errcode = 'P0001';
  end if;
  v_automatica := v_c.tipo in ('cajon', 'caja_fuerte', 'por_rendir');
  if v_nombre = '' then
    raise exception 'La cuenta necesita un nombre.' using errcode = 'P0001';
  end if;
  if char_length(v_nombre) > 80 then
    raise exception 'El nombre es muy largo (máximo 80 letras).' using errcode = 'P0001';
  end if;
  v_numero := case when v_automatica then v_c.numero else nullif(trim(coalesce(p_numero, '')), '') end;
  if char_length(coalesce(v_numero, '')) > 40 then
    raise exception 'El número es muy largo (máximo 40 caracteres).' using errcode = 'P0001';
  end if;
  v_tipo := coalesce(p_tipo, v_c.tipo);
  v_saldo := round(coalesce(p_saldo_inicial, v_c.saldo_inicial), 2);
  v_desde := coalesce(p_saldo_desde, v_c.saldo_desde);

  -- El tipo: solo de las que se agregan y solo si nadie la usó.
  if v_tipo is distinct from v_c.tipo then
    if v_automatica then
      raise exception 'El cajón, la caja fuerte y el efectivo por rendir nacen con cada sede: su tipo no cambia.' using errcode = 'P0001';
    end if;
    if v_tipo not in ('banco', 'por_abonar', 'tarjeta_credito') then
      raise exception 'Una cuenta que se agrega es un banco o billetera, un POS por abonar o una tarjeta de crédito.' using errcode = 'P0001';
    end if;
    if exists (select 1 from retail.fn_usos_cuenta_dinero(p_cuenta_id)) then
      raise exception 'Esta cuenta ya se usó: su tipo queda. Si te equivocaste de tipo, archívala y agrega otra.' using errcode = 'P0001';
    end if;
  end if;

  -- El saldo inicial y su fecha: sin conciliación vigente y con los meses que toca abiertos.
  if (v_saldo, v_desde) is distinct from (v_c.saldo_inicial, v_c.saldo_desde) then
    if v_automatica then
      raise exception 'El cajón, la caja fuerte y el efectivo por rendir no llevan saldo inicial.' using errcode = 'P0001';
    end if;
    if v_desde is null then
      raise exception 'Di desde qué día cuenta el saldo inicial.' using errcode = 'P0001';
    end if;
    if v_desde > v_hoy then
      raise exception 'La fecha del saldo inicial no puede ser futura.' using errcode = 'P0001';
    end if;
    select max(k.fecha) into v_conciliada from retail.conciliaciones k where k.cuenta_id = p_cuenta_id and k.estado = 'vigente';
    if v_conciliada is not null then
      raise exception 'Esta cuenta se concilió con el banco al %: anula esa conciliación en Cuentas y dinero para corregir su saldo inicial.',
        to_char(v_conciliada, 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
    perform retail.fn_exigir_mes_abierto(null, least(v_desde, coalesce(v_c.saldo_desde, v_desde)), v_hoy,
                                         'corregir el saldo inicial de esta cuenta');
  end if;

  if v_nombre is distinct from v_c.nombre then
    v_antes := v_antes || jsonb_build_object('nombre', v_c.nombre);
    v_despues := v_despues || jsonb_build_object('nombre', v_nombre);
  end if;
  if v_numero is distinct from v_c.numero then
    v_antes := v_antes || jsonb_build_object('numero', v_c.numero);
    v_despues := v_despues || jsonb_build_object('numero', v_numero);
  end if;
  if v_tipo is distinct from v_c.tipo then
    v_antes := v_antes || jsonb_build_object('tipo', v_c.tipo);
    v_despues := v_despues || jsonb_build_object('tipo', v_tipo);
  end if;
  if v_saldo is distinct from v_c.saldo_inicial then
    v_antes := v_antes || jsonb_build_object('saldo_inicial', v_c.saldo_inicial);
    v_despues := v_despues || jsonb_build_object('saldo_inicial', v_saldo);
  end if;
  if v_desde is distinct from v_c.saldo_desde then
    v_antes := v_antes || jsonb_build_object('saldo_desde', v_c.saldo_desde);
    v_despues := v_despues || jsonb_build_object('saldo_desde', v_desde);
  end if;
  if v_despues = '{}'::jsonb then
    return;  -- Nada cambió: no se escribe historia vacía.
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  perform set_config('retail.editando_cuenta', 'si', true);
  begin
    update retail.cuentas_dinero
       set nombre = v_nombre, numero = v_numero, tipo = v_tipo,
           cuenta_contable = case v_tipo when 'banco' then '104' when 'por_abonar' then '105' when 'tarjeta_credito' then '451' else cuenta_contable end,
           orden = case when v_tipo is distinct from v_c.tipo then case v_tipo when 'banco' then 10 when 'por_abonar' then 20 else 60 end else orden end,
           saldo_inicial = v_saldo, saldo_desde = v_desde
     where id = p_cuenta_id;
  exception when unique_violation then
    perform set_config('retail.editando_cuenta', '', true);
    raise exception 'Ya hay otra cuenta activa con ese nombre.' using errcode = '23505';
  end;
  perform set_config('retail.editando_cuenta', '', true);

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('cuenta_dinero_editada', jsonb_build_object('cuenta_id', p_cuenta_id, 'nombre', v_nombre, 'antes', v_antes, 'despues', v_despues), v_actor);
end $$;
comment on function retail.editar_cuenta_dinero(uuid, text, text, text, numeric, date) is
  'Solo líder (ADR-0195). Corrige una cuenta: nombre y número siempre; tipo mientras nadie la usó; saldo inicial sin conciliación vigente y con sus meses abiertos. Queda en configuracion_historial con el antes y el después.';

-- ---------- 5. Eliminar ----------
create or replace function retail.eliminar_cuenta_dinero(p_cuenta_id uuid) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_c retail.cuentas_dinero%rowtype; v_actor uuid;
begin
  perform retail.fn_exigir_lider_dinero('Eliminar cuentas');
  select * into v_c from retail.cuentas_dinero where id = p_cuenta_id for update;
  if not found then
    raise exception 'Esa cuenta ya no está. Recarga la pantalla.' using errcode = 'P0001';
  end if;
  if v_c.tipo in ('cajon', 'caja_fuerte', 'por_rendir') then
    raise exception 'El cajón, la caja fuerte y el efectivo por rendir nacen con cada sede: no se eliminan.' using errcode = 'P0001';
  end if;
  if exists (select 1 from retail.fn_usos_cuenta_dinero(p_cuenta_id)) then
    raise exception 'Por esta cuenta ya pasó plata o recibe cobros: no se elimina, se archiva (sus movimientos se quedan).' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  perform set_config('retail.editando_cuenta', 'si', true);
  begin
    delete from retail.cuentas_dinero where id = p_cuenta_id;
  exception when foreign_key_violation then
    -- Alguien la usó entre la revisión y el borrado: la llave foránea manda.
    perform set_config('retail.editando_cuenta', '', true);
    raise exception 'Por esta cuenta acaba de pasar plata: no se elimina, se archiva.' using errcode = 'P0001';
  end;
  perform set_config('retail.editando_cuenta', '', true);
  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('cuenta_dinero_eliminada', jsonb_build_object('cuenta_id', p_cuenta_id, 'nombre', v_c.nombre, 'cuenta', to_jsonb(v_c)), v_actor);
end $$;
comment on function retail.eliminar_cuenta_dinero(uuid) is
  'Solo líder (ADR-0195). Borra una cuenta por la que nunca pasó nada (ninguna fila la apunta; la llave foránea lo vuelve a garantizar). La fila completa queda en configuracion_historial. Una cuenta usada se archiva.';

-- ---------- 6. Permisos ----------
revoke all on function retail.fn_usos_cuenta_dinero(uuid) from public, anon, authenticated;
revoke all on function retail.fn_cuenta_dinero_detalle(uuid) from public, anon;
revoke all on function retail.editar_cuenta_dinero(uuid, text, text, text, numeric, date) from public, anon;
revoke all on function retail.eliminar_cuenta_dinero(uuid) from public, anon;
grant execute on function retail.fn_cuenta_dinero_detalle(uuid) to authenticated;
grant execute on function retail.editar_cuenta_dinero(uuid, text, text, text, numeric, date) to authenticated;
grant execute on function retail.eliminar_cuenta_dinero(uuid) to authenticated;

reset lock_timeout;
