-- ============================================================================
-- 20261127150000 — Un retiro dice quién se lleva la plata y para qué (ADR-0713)
--
-- EL PROBLEMA PRIMERO. «Plata del dueño» (Finanzas ▸ Dinero) contaba lo que salió de CAYLA por QUIEN LO ANOTÓ. El 2026-11-27 la tarjeta decía que
-- una encargada de AQP «sacó S/ 2,812.10»: eran dos retiros de la caja fuerte de AQP que ella anotó; uno se lo llevó Felipe y el otro era un ajuste del cuadre
-- de caja, sin motivo escrito. La base solo guardaba quién registró (`registrado_por`): quién se llevó la plata y para qué no estaban en ningún lado.
--
-- CONTRATO (Liskov)
--   PROMETE: todo retiro y toda devolución de préstamo que entra por `registrar_movimiento_dinero` desde hoy guarda quién se llevó la plata
--            (`movimientos_dinero.se_la_lleva_persona_id`, un colaborador), y todo retiro dice para qué (su `referencia`, que ya existía). Sin eso no
--            se guarda nada: ni el movimiento ni el egreso de caja que lo acompaña (una sola transacción). `fn_quien_se_la_llevo()` le dice al líder,
--            por movimiento, el nombre de quien se la llevó.
--   ASUME:   la pantalla manda a la persona en el encabezado `x-se-la-lleva` (el id de su persona), igual que manda la aliada de un pago en `x-aliada`
--            (ADR-0683): la firma de la función no cambia, y sus siete llamadas internas (planilla, SUNAT, máquinas…) no se enteran.
--   FALLA:   `P0001` con hint `se_la_lleva` si falta quién o no es un colaborador; con hint `retiro_sin_motivo` si un retiro no dice para qué.
--   NO HACE: no toca los movimientos de antes (siguen sin quién: la pantalla los cuenta por quien los anotó y lo dice); no parte «CAYLA te debe» por
--            persona (la deuda sigue siendo una sola bolsa); no pide quién PUSO la plata (un aporte del cajón lo registra la tienda, que no lo sabe).
--
-- DECIDÍ el encabezado y un ayudante que se llama dentro del `insert`. DESCARTÉ un parámetro nuevo en `registrar_movimiento_dinero`: cambiar su firma
-- obliga a borrarla y recrearla entera (10 mil caracteres con siete parches vivos encima) y rompe las guardas de las migraciones que la nombran por su
-- firma de diez argumentos. DESCARTÉ también un `check` en la tabla: quince pruebas siembran retiros insertando directo, y la única puerta real
-- de un retiro es esta función (las otras seis que insertan en `movimientos_dinero` no escriben retiros ni devoluciones; consultado en producción).
-- SE ROMPE SI alguien agrega otra función que inserte un retiro: no pasaría por el ayudante. La prueba `pruebas:retiro-quien-y-para-que` lo dice.
--
-- CÓMO. Reemplazo anclado sobre la función VIVA (`pg_temp.reemplazar`, el patrón de 20261029011000): aborta sin cambiar nada si el texto que
-- espera no está exactamente una vez. Una sola parte: un `alter table` con candado corto, sin políticas ni triggers.
-- CÓMO VERIFICAR. pnpm pruebas:retiro-quien-y-para-que
-- CÓMO SE PEGA. Una sola parte, después de 20261121162000. Se puede pegar dos veces.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

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

-- ---------- 1. Quién se llevó la plata ----------
alter table retail.movimientos_dinero add column if not exists se_la_lleva_persona_id uuid references public.personas (id);
do $chequeo$
begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_dinero_se_la_lleva_solo_al_sacar') then
    -- Solo lo que SALE hacia una persona lleva quién: en un depósito o un aporte no significa nada.
    alter table retail.movimientos_dinero add constraint movimientos_dinero_se_la_lleva_solo_al_sacar
      check (se_la_lleva_persona_id is null or tipo in ('retiro', 'devolucion_prestamo'));
  end if;
end
$chequeo$;
comment on column retail.movimientos_dinero.se_la_lleva_persona_id is
  'ADR-0713: en un retiro o una devolución de préstamo, quién se llevó la plata (un colaborador). Nulo en lo demás y en los registrados antes del 2026-11-27.';

-- ---------- 2. El ayudante: lee a quién manda la pantalla y exige el para qué ----------
create or replace function retail.fn_quien_se_la_lleva(p_tipo text, p_referencia text)
returns uuid
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_h text;
  v_id uuid;
begin
  if p_tipo is null or p_tipo not in ('retiro', 'devolucion_prestamo') then
    return null;
  end if;
  begin
    v_h := nullif(btrim(coalesce(current_setting('request.headers', true), '')), '')::json ->> 'x-se-la-lleva';
  exception when others then
    v_h := null;
  end;
  if nullif(btrim(coalesce(v_h, '')), '') is null then
    raise exception 'Di quién se lleva la plata.' using errcode = 'P0001', hint = 'se_la_lleva';
  end if;
  v_id := (select c.persona_id from retail.colaboradores c where c.persona_id::text = btrim(v_h) limit 1);
  if v_id is null then
    raise exception 'Quien se lleva la plata tiene que ser un colaborador de CAYLA.' using errcode = 'P0001', hint = 'se_la_lleva';
  end if;
  if p_tipo = 'retiro' and nullif(btrim(coalesce(p_referencia, '')), '') is null then
    raise exception 'Di para qué es el retiro.' using errcode = 'P0001', hint = 'retiro_sin_motivo';
  end if;
  return v_id;
end
$$;
revoke all on function retail.fn_quien_se_la_lleva(text, text) from public, anon, authenticated;
comment on function retail.fn_quien_se_la_lleva(text, text) is
  'ADR-0713: en un retiro o una devolución, el colaborador que manda la pantalla en `x-se-la-lleva`; sin él, o en un retiro sin para qué, no se guarda. Nulo en lo demás.';

-- ---------- 3. La puerta: registrar_movimiento_dinero lo guarda en el mismo insert ----------
select pg_temp.reemplazar('retail.registrar_movimiento_dinero(text, numeric, uuid, uuid, date, text, numeric, uuid, uuid, uuid)',
$v$caja_movimiento_id, referencia, registrado_por, token_cliente)$v$,
$n$caja_movimiento_id, referencia, registrado_por, token_cliente, se_la_lleva_persona_id)$n$,
1);
select pg_temp.reemplazar('retail.registrar_movimiento_dinero(text, numeric, uuid, uuid, date, text, numeric, uuid, uuid, uuid)',
$v$v_egreso, v_ref, v_actor, p_token)$v$,
$n$v_egreso, v_ref, v_actor, p_token, retail.fn_quien_se_la_lleva(p_tipo, v_ref))$n$,
1);

-- ---------- 4. La lectura: quién se llevó cada retiro y cada devolución (solo el líder) ----------
create or replace function retail.fn_quien_se_la_llevo()
returns table (movimiento_id uuid, persona_id uuid, nombre text)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
begin
  if not retail.fn_es_lider() then
    raise exception 'Ver quién se llevó la plata del dueño es del líder.' using errcode = '42501';
  end if;
  return query
  select d.id, d.se_la_lleva_persona_id, nullif(trim(concat_ws(' ', p.nombres, p.apellidos)), '')
    from retail.movimientos_dinero d
    join public.personas p on p.id = d.se_la_lleva_persona_id
   where d.tipo in ('retiro', 'devolucion_prestamo') and d.estado = 'vigente';
end
$$;
revoke all on function retail.fn_quien_se_la_llevo() from public, anon;
grant execute on function retail.fn_quien_se_la_llevo() to authenticated;
comment on function retail.fn_quien_se_la_llevo() is
  'ADR-0713: por cada retiro o devolución vigente que lo dice, quién se llevó la plata. Solo el líder.';

-- ---------- 5. Que quedó como se prometió ----------
do $$
declare
  v_def text := pg_get_functiondef('retail.registrar_movimiento_dinero(text, numeric, uuid, uuid, date, text, numeric, uuid, uuid, uuid)'::regprocedure);
begin
  if position('se_la_lleva_persona_id)' in v_def) = 0 or position('retail.fn_quien_se_la_lleva(p_tipo, v_ref))' in v_def) = 0 then
    raise exception 'ADR-0713: registrar_movimiento_dinero no quedó guardando quién se lleva la plata';
  end if;
end $$;
