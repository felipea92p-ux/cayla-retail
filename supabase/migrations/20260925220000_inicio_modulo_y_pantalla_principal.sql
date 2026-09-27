-- ============================================================================
-- 20260925220000_inicio_modulo_y_pantalla_principal.sql — CAYLA V2 (Felipe, 2026-09-25)
--
-- EL PROBLEMA PRIMERO. Inicio no era de ningún módulo: toda persona lo veía y aterrizaba ahí al iniciar sesión, sin
-- excepción — la única regla propia era de TERMINAL (una que vende aterriza en el mostrador, no en Inicio, desde
-- 20260921). Felipe pidió dos cosas juntas: (1) que Inicio se pueda apagar en un rol, como cualquier otro módulo;
-- (2) que cada rol elija A DÓNDE aterriza su cuenta al iniciar sesión, no siempre Inicio.
--
-- LA EXCEPCIÓN A LA REGLA DE SIEMPRE. CLAUDE.md («Módulos y roles»): todo módulo nuevo nace SOLO para el líder. Inicio
-- nace distinto A PROPÓSITO: se siembra ENCENDIDO en todos los roles que ya existen (si naciera solo del líder, cada
-- cuenta existente se quedaría sin ningún lugar donde aterrizar el mismo día que se pega esta migración). Un rol NUEVO,
-- de acá en adelante, si se crea copiando otro lo hereda; a medida, nace sin él, como cualquier módulo.
--
-- PANTALLA PRINCIPAL. `retail.roles.pantalla_principal`: el módulo elegido como aterrizaje de ese rol, o NULL (sin
-- preferencia explícita: la web calcula sola la primera pantalla que el rol ve, en el orden del menú — nunca un rol se
-- queda sin saber a dónde ir mientras vea algo). Se guarda junto con los módulos, en la MISMA función
-- (`guardar_modulos_rol`): son la misma pantalla, un solo guardado. Se valida contra los módulos que se están guardando
-- EN ESE MISMO instante, no contra los de antes.
--
-- Requiere 20260923030000 (retail.modulos, retail.roles, guardar_modulos_rol) y 20260923100000 (fn_actor_persona_id).
-- Re-ejecutable.
-- ============================================================================

set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.guardar_modulos_rol(uuid, text[], integer)') is null then
    raise exception 'Falta 20260923030000_roles_por_modulo.sql (o una posterior que le haya cambiado la firma): pégala antes que esta';
  end if;
end $$;

-- ==================== 1. El módulo Inicio ====================
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable)
  values ('inicio', 'General', 'Inicio', 'Ver el tablero de inicio: lo del día, lo por atender y accesos rápidos a su tienda', 5, false, true)
  on conflict (clave) do nothing;

-- Excepción documentada arriba: se siembra ENCENDIDO en los roles que ya existen, salvo Terminal Ventas (su aterrizaje
-- sigue siendo el mostrador, regla propia de `aterrizajeDe` en la web — no participa de este candado) y los
-- ARCHIVADOS (sin cuentas por definición — `motivoParaNoArchivar` — y `fn_rol_modulos_coherente()` rechaza tocar los
-- módulos de un rol archivado: hay uno en producción, «Administrador», archivado por ADR-0178).
insert into retail.rol_modulos (rol_id, modulo)
  select r.id, 'inicio' from retail.roles r
   where r.fijo = false and r.archivado_at is null and (r.clave is null or r.clave <> 'terminal_ventas')
  on conflict (rol_id, modulo) do nothing;

-- ==================== 2. Pantalla principal por rol ====================
alter table retail.roles add column if not exists pantalla_principal text references retail.modulos (clave);

comment on column retail.roles.pantalla_principal is
  'A qué módulo aterriza esta cuenta al iniciar sesión (Felipe, 2026-09-25). NULL: sin preferencia — la web usa la
   primera pantalla que el rol ve, en el orden del menú. Se guarda junto con los módulos en guardar_modulos_rol().';

-- ==================== 3. guardar_modulos_rol gana `p_pantalla_principal` ====================
-- Un parámetro más SIEMPRE crea una sobrecarga nueva junto a la vieja (nunca la reemplaza): se arma la definición
-- nueva a partir de la VIVA (con conteo exacto de ocurrencias; aborta si cambió) y se borra la firma de 3 argumentos
-- después de crear la de 4 — mismo patrón que ADR-0193 (20260924160000) usó para sumarle `p_version_esperada`.
do $$
declare
  v_def text;
  v_n integer;
  a record;
begin
  if to_regprocedure('retail.guardar_modulos_rol(uuid, text[], integer, text)') is not null then
    raise notice 'guardar_modulos_rol ya tenía la firma de 4 argumentos (se volvió a pegar)';
    return;
  end if;
  -- Se resuelve la firma vieja RECIÉN acá (no en el DECLARE): en una repetición ya aplicada, el `return` de arriba
  -- ya salió antes de intentar leer una firma que esta misma migración borró.
  v_def := pg_get_functiondef('retail.guardar_modulos_rol(uuid, text[], integer)'::regprocedure);

  for a in
    select * from (values
      (1, E'(p_rol_id uuid, p_modulos text[], p_version_esperada integer DEFAULT NULL::integer)\n RETURNS integer',
          E'(p_rol_id uuid, p_modulos text[], p_version_esperada integer DEFAULT NULL::integer, p_pantalla_principal text DEFAULT NULL::text)\n RETURNS integer'),
      (2, E'  if v_malo is not null then\n    raise exception ''No existe el módulo «%»'', v_malo;\n  end if;\n',
          E'  if v_malo is not null then\n    raise exception ''No existe el módulo «%»'', v_malo;\n  end if;\n'
          '  -- 20260925220000: la pantalla principal tiene que ser uno de los módulos que se están guardando AHORA.\n'
          '  if p_pantalla_principal is not null and not (p_pantalla_principal = any(coalesce(p_modulos, ''{}''))) then\n'
          '    raise exception ''La pantalla principal tiene que ser uno de los módulos que se están guardando'' using errcode = ''23514'';\n'
          '  end if;\n'),
      (3, E'  if v_antes <> v_despues then\n    insert into retail.roles_historial (rol_id, accion, detalle, hecho_por)\n      values (p_rol_id, ''modulos'', jsonb_build_object(''antes'', v_antes, ''despues'', v_despues), retail.fn_actor_persona_id(true));\n  end if;\n',
          E'  if v_antes <> v_despues or v_rol.pantalla_principal is distinct from p_pantalla_principal then\n'
          '    insert into retail.roles_historial (rol_id, accion, detalle, hecho_por)\n'
          '      values (p_rol_id, ''modulos'', jsonb_build_object(''antes'', v_antes, ''despues'', v_despues,\n'
          '        ''pantalla_principal_antes'', v_rol.pantalla_principal, ''pantalla_principal_despues'', p_pantalla_principal), retail.fn_actor_persona_id(true));\n'
          '  end if;\n'
          '  if v_rol.pantalla_principal is distinct from p_pantalla_principal then\n'
          '    update retail.roles set pantalla_principal = p_pantalla_principal where id = p_rol_id;\n'
          '  end if;\n')
    ) as t(n, ancla, nuevo)
    order by t.n
  loop
    v_n := (length(v_def) - length(replace(v_def, a.ancla, ''))) / length(a.ancla);
    if v_n <> 1 then
      raise exception 'guardar_modulos_rol cambió desde que se escribió esta migración: se esperaba 1 ocurrencia del paso % y hay %. Regenera el reemplazo desde su definición real.', a.n, v_n;
    end if;
    v_def := replace(v_def, a.ancla, a.nuevo);
  end loop;

  execute v_def;                                                              -- crea la firma de 4 argumentos
  execute 'drop function retail.guardar_modulos_rol(uuid, text[], integer)';  -- y borra la de 3: nunca dos sobrecargas
  execute 'revoke all on function retail.guardar_modulos_rol(uuid, text[], integer, text) from public, anon';
  execute 'grant execute on function retail.guardar_modulos_rol(uuid, text[], integer, text) to authenticated';
end $$;

comment on function retail.guardar_modulos_rol(uuid, text[], integer, text) is
  'Reemplaza los módulos de un rol y su pantalla principal (20260925220000), en un solo guardado. p_pantalla_principal:
   uno de los p_modulos que se están guardando, o NULL (sin preferencia: la web calcula la primera pantalla que ve).
   p_version_esperada (ADR-0193): PT409 si otra persona cambió el rol entre medio.';

-- ==================== 4. Mi pantalla principal (mismo patrón que fn_mi_terminal/fn_es_admin) ====================
create or replace function retail.fn_mi_pantalla_principal() returns text
language sql stable security definer set search_path = retail, public, extensions
as $$
  select r.pantalla_principal
    from retail.colaboradores c join retail.roles r on r.id = c.rol_id
   where c.persona_id = retail.fn_actor_persona_id(false);
$$;

do $$
begin
  execute 'revoke all on function retail.fn_mi_pantalla_principal() from public, anon';
  execute 'grant execute on function retail.fn_mi_pantalla_principal() to authenticated, service_role';
end $$;

-- ==================== Verificación ====================
do $$
begin
  if to_regprocedure('retail.fn_mi_pantalla_principal()') is null then
    raise exception 'fn_mi_pantalla_principal no quedó creada';
  end if;
  if not exists (select 1 from retail.modulos where clave = 'inicio') then
    raise exception 'El módulo inicio no quedó sembrado';
  end if;
  if exists (
    select 1 from retail.roles r
     where r.fijo = false and r.archivado_at is null and (r.clave is null or r.clave <> 'terminal_ventas')
       and not exists (select 1 from retail.rol_modulos rm where rm.rol_id = r.id and rm.modulo = 'inicio')
  ) then
    raise exception 'Quedó un rol sin Inicio en el backfill (salvo Terminal Ventas y los archivados, que no participan)';
  end if;
end $$;
