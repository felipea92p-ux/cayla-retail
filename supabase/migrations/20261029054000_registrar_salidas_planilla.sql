-- ============================================================================
-- 20261029054000_registrar_salidas_planilla.sql — CAYLA V2 (ADR-0567, actividad 3)
--
-- EL PROBLEMA PRIMERO. Las actividades 1 y 2 dicen cuánto de un grupo pagado en Dynamic salió hacia cada banco y de qué cuenta de CAYLA
-- sale. Falta registrarlo: hoy se hace con «Pagar la planilla», un movimiento por banco, a mano y sin enlace con Dynamic, así que nada
-- impide registrar la misma salida dos veces (doble clic, dos personas, la hoja abierta en dos pestañas) ni deja saber qué tramo ya tiene
-- la suya. Y si la planilla de octubre se paga antes de que esto llegue a producción, sus salidas se registran a mano: hay que poder
-- enlazarlas después sin duplicarlas.
--
-- CONTRATO (Liskov)
--   PROMETE: (1) `registrar_salidas_planilla(periodo, grupo, salidas, token)`: por cada banco de `salidas` (`[{banco, cuenta_id, monto,
--            fecha}]` o `[{banco, movimiento_id}]` para enlazar una ya registrada), crea su «Pago de la planilla» con
--            `registrar_movimiento_dinero` (la misma puerta, el mismo candado de banco y fecha, el mismo responsable) o enlaza la dada, y
--            guarda el enlace con el neto que Dynamic decía. TODO O NADA: si un banco falla, no queda ninguno. Un tramo con su salida
--            vigente no recibe otra (dos personas a la vez: una gana y la otra recibe «ya está registrada», sin dejar nada). Repetir
--            la misma llamada con el mismo token devuelve lo mismo sin escribir. Devuelve `[{banco, movimiento_id}]`.
--            (2) `fn_planilla_salidas_sueltas()`: los «Pago de la planilla» vigentes desde el inicio de Finanzas que no están enlazados
--            a ningún tramo, para enlazarlos.
--   ASUME:   20261029052000 (la tabla, la lectura) y `registrar_movimiento_dinero` con `pago_planilla` (ADR-0417) y su token por
--            intento (ADR-0412 y ADR-0548). Cada banco usa un token derivado del de la hoja (`md5(token || banco)`), así que el
--            reintento de cada uno es idempotente por su cuenta.
--   FALLA:   `42501` sin ser líder o sin ver la planilla en Dynamic; `P0001` con un grupo sin pagar, un banco repetido o sin nada por
--            registrar, un tramo que ya tiene su salida, o una salida a enlazar que no es un «Pago de la planilla» vigente y suelto; y
--            todo lo que ya rechaza `registrar_movimiento_dinero` (monto, banco, fecha antes del inicio de Finanzas).
--   NO HACE: no toca `registrar_movimiento_dinero` (la llama), ni Dynamic, ni el 62 | 41: el Diario asienta cada salida 41 | 104 como
--            cualquier «Pago de la planilla». Para cambiar una salida se anula y se vuelve a registrar.
--
-- CONCURRENCIA. Cada tramo se toma con un candado de transacción (`pg_advisory_xact_lock`) ANTES de mirar si ya tiene salida, y en orden
-- fijo de banco (sin abrazos mortales entre dos hojas). La mirada va DESPUÉS del candado, en una sentencia nueva: en READ COMMITTED ve lo
-- que la otra transacción ya confirmó. La llave primaria de `planilla_salidas` es la última red.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, DESPUÉS DE 20261029052000 Y 20261029053000. Solo crea dos funciones: no toma tablas
-- ni crea políticas. Sin un select con «into» dentro de un texto entre comillas (ADR-0288). Idempotente.
-- Verificado: `scripts/pruebas/planilla_salidas.mjs` (escena 7) y, el 2026-10-29 en un Postgres privado, una carrera real de dos sesiones con
-- COMMIT sobre el mismo tramo: con el candado queda UNA salida y la segunda recibe «ya está registrada»; sin él quedaban DOS.
-- SE ROMPE SI: alguien registra a mano un «Pago de la planilla» y además la registra desde el aviso: quedan dos salidas, una suelta. Por
-- eso la hoja ofrece enlazar las sueltas antes de crear una nueva.
-- DOWN: drop function retail.registrar_salidas_planilla(uuid, text, jsonb, uuid); drop function retail.fn_planilla_salidas_sueltas();
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Las salidas registradas a mano que no están enlazadas ----------
create or replace function retail.fn_planilla_salidas_sueltas()
returns table (movimiento_id uuid, fecha date, monto numeric, cuenta_id uuid, cuenta_nombre text, referencia text)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_desde date := retail.fn_finanzas_desde();
begin
  if not coalesce(retail.fn_es_lider(), false) then
    return;
  end if;
  return query
  select m.id, m.fecha, m.monto, m.cuenta_origen_id, c.nombre, m.referencia
    from retail.movimientos_dinero m
    join retail.cuentas_dinero c on c.id = m.cuenta_origen_id
   where m.tipo = 'pago_planilla' and m.estado = 'vigente'
     and (v_desde is null or m.fecha >= v_desde)
     and not exists (select 1 from retail.planilla_salidas s where s.movimiento_id = m.id)
   order by m.fecha desc, m.created_at desc;
end $$;
comment on function retail.fn_planilla_salidas_sueltas() is
  'ADR-0567: los «Pago de la planilla» vigentes desde el inicio de Finanzas que no están enlazados a un tramo de Dynamic (registrados a mano). Solo el líder.';
revoke all on function retail.fn_planilla_salidas_sueltas() from public, anon;
grant execute on function retail.fn_planilla_salidas_sueltas() to authenticated;

-- ---------- 2. Registrar las salidas de un grupo, todo o nada ----------
create or replace function retail.registrar_salidas_planilla(p_periodo_id uuid, p_grupo text, p_salidas jsonb, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_s record;
  v_neto numeric;
  v_pagado date;
  v_ini date;
  v_fin date;
  v_hay boolean;
  v_link uuid;
  v_link_vigente boolean;
  v_token uuid;
  v_mov uuid;
  v_ok boolean;
  v_ref text;
  v_actor uuid;
  v_hechas jsonb := '[]'::jsonb;
begin
  if not coalesce(retail.fn_es_lider(), false) then
    raise exception 'Registrar la salida de la planilla es del líder.' using errcode = '42501';
  end if;
  if not retail.fn_planilla_visible() then
    raise exception 'Solo quien ve la planilla en Dynamic registra su salida.' using errcode = '42501';
  end if;
  if p_periodo_id is null or nullif(btrim(coalesce(p_grupo, '')), '') is null or p_token is null then
    raise exception 'Falta el período, el grupo o el token de la hoja.' using errcode = 'P0001';
  end if;
  if p_salidas is null or jsonb_typeof(p_salidas) <> 'array' or jsonb_array_length(p_salidas) = 0 or jsonb_array_length(p_salidas) > 3 then
    raise exception 'Tiene que haber entre una y tres salidas, una por banco.' using errcode = 'P0001';
  end if;
  if (select count(distinct x ->> 'banco') from jsonb_array_elements(p_salidas) x) <> jsonb_array_length(p_salidas) then
    raise exception 'Cada banco va una sola vez.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_salidas) x where coalesce(x ->> 'banco', '') not in ('bcp', 'interbank', 'sin_banco')) then
    raise exception 'El banco tiene que ser BCP, Interbank o «sin banco».' using errcode = 'P0001';
  end if;
  if to_regclass('public.periodo_grupo_pago') is null then
    raise exception 'Dynamic no responde: no se sabe si ese grupo está pagado.' using errcode = 'P0001';
  end if;
  execute 'select exists (select 1 from public.periodo_grupo_pago g where g.periodo_id = $1 and g.grupo = $2 and g.estado = ''pagado'')'
    into v_hay using p_periodo_id, p_grupo;
  if not v_hay then
    raise exception 'Ese grupo no está pagado en Dynamic: su salida se registra cuando Dynamic lo pague.' using errcode = 'P0001';
  end if;

  v_actor := retail.fn_actor_persona_id(true);

  -- En orden fijo de banco: dos hojas del mismo grupo toman los candados en el mismo orden.
  for v_s in
    select x ->> 'banco' as banco, nullif(x ->> 'cuenta_id', '')::uuid as cuenta_id, (x ->> 'monto')::numeric as monto,
           nullif(x ->> 'fecha', '')::date as fecha, nullif(x ->> 'movimiento_id', '')::uuid as movimiento_id
      from jsonb_array_elements(p_salidas) x
     order by case x ->> 'banco' when 'bcp' then 1 when 'interbank' then 2 else 3 end
  loop
    perform pg_advisory_xact_lock(hashtextextended('planilla_salida:' || p_periodo_id || ':' || p_grupo || ':' || v_s.banco, 0));
    v_token := md5(p_token::text || ':' || v_s.banco)::uuid;

    -- ¿Ya tiene su salida? (sentencia nueva, después del candado: ve lo que otra hoja ya confirmó)
    v_link := (select s.movimiento_id from retail.planilla_salidas s
                where s.periodo_id = p_periodo_id and s.grupo = p_grupo and s.banco = v_s.banco);
    v_link_vigente := exists (select 1 from retail.movimientos_dinero m where m.id = v_link and m.estado = 'vigente');
    if v_link_vigente then
      -- La misma hoja que reintenta (su token o la misma salida a enlazar): devuelve lo que ya hizo.
      if exists (select 1 from retail.movimientos_dinero m where m.id = v_link and (m.token_cliente = v_token or m.id = v_s.movimiento_id)) then
        v_hechas := v_hechas || jsonb_build_object('banco', v_s.banco, 'movimiento_id', v_link);
        continue;
      end if;
      raise exception 'La salida de % de este grupo ya está registrada. Si estaba mal, anúlala en «Movimientos entre cuentas» y vuelve a registrarla.',
        case v_s.banco when 'bcp' then 'BCP' when 'interbank' then 'Interbank' else 'quienes no tienen banco' end using errcode = 'P0001';
    end if;

    -- El tramo tiene que tener algo por registrar en Dynamic.
    v_neto := null;
    for v_neto, v_pagado, v_ini, v_fin in
      select t.neto, t.pagado_el, t.fecha_ini, t.fecha_fin
        from retail.fn_planilla_salidas_por_registrar() t
       where t.periodo_id = p_periodo_id and t.grupo = p_grupo and t.banco = v_s.banco and t.movimiento_id is null
    loop
      exit;
    end loop;
    if v_neto is null then
      raise exception 'En este grupo de Dynamic no hay nada por registrar para %.',
        case v_s.banco when 'bcp' then 'BCP' when 'interbank' then 'Interbank' else 'quienes no tienen banco' end using errcode = 'P0001';
    end if;

    if v_s.movimiento_id is not null then
      -- Enlazar una que se registró a mano: un «Pago de la planilla» vigente y suelto.
      v_ok := exists (select 1 from retail.movimientos_dinero m
                       where m.id = v_s.movimiento_id and m.tipo = 'pago_planilla' and m.estado = 'vigente')
              and not exists (select 1 from retail.planilla_salidas s where s.movimiento_id = v_s.movimiento_id);
      if not v_ok then
        raise exception 'Esa salida no se puede enlazar: tiene que ser un «Pago de la planilla» vigente que no esté enlazado a otro grupo.' using errcode = 'P0001';
      end if;
      v_mov := v_s.movimiento_id;
    else
      v_ref := case p_grupo
                 when 'planilla' then 'Planilla'
                 when 'rxh' then 'Recibos por honorarios'
                 when 'practicante' then 'Practicantes'
                 when 'prueba' then 'Período de prueba'
                 when 'no_trabajador' then 'Fuera de planilla'
                 else 'Grupo ' || p_grupo
               end
               || ' del ' || to_char(v_ini, 'DD/MM') || ' al ' || to_char(v_fin, 'DD/MM') || ' · '
               || case v_s.banco when 'bcp' then 'quienes cobran en BCP' when 'interbank' then 'quienes cobran en Interbank' else 'sin banco en Dynamic' end;
      v_mov := retail.registrar_movimiento_dinero('pago_planilla', v_s.monto, v_s.cuenta_id, null, coalesce(v_s.fecha, v_pagado),
                                                  v_ref, 0, null, null, v_token);
    end if;

    insert into retail.planilla_salidas (periodo_id, grupo, banco, movimiento_id, neto_dynamic, registrada_por, registrada_en)
    values (p_periodo_id, p_grupo, v_s.banco, v_mov, v_neto, v_actor, now())
    on conflict (periodo_id, grupo, banco) do update
      set movimiento_id = excluded.movimiento_id, neto_dynamic = excluded.neto_dynamic,
          registrada_por = excluded.registrada_por, registrada_en = excluded.registrada_en;
    v_hechas := v_hechas || jsonb_build_object('banco', v_s.banco, 'movimiento_id', v_mov);
  end loop;

  return v_hechas;
end $$;
comment on function retail.registrar_salidas_planilla(uuid, text, jsonb, uuid) is
  'ADR-0567: registra (o enlaza) la salida del banco de cada tramo de un grupo pagado en Dynamic, todo o nada, una salida por tramo. Líder que ve la planilla en Dynamic.';
revoke all on function retail.registrar_salidas_planilla(uuid, text, jsonb, uuid) from public, anon;
grant execute on function retail.registrar_salidas_planilla(uuid, text, jsonb, uuid) to authenticated;
