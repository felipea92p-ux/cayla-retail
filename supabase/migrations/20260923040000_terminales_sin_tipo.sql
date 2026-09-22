-- ============================================================================
-- 20260923040000_terminales_sin_tipo.sql — CAYLA V2 · ADR-0162 (terminales) + ADR-0161 B (roles por módulo)
--
-- EL PROBLEMA PRIMERO. Las terminales nacieron (20260923010000) con un TIPO fijo, `ventas` o `administrativa`, y un
-- candado de «una activa por tipo y tienda». Después llegaron los roles por módulo (20260923030000): lo que ve y hace una
-- cuenta —persona o aparato— ya lo decide su ROL. Quedaban dos fuentes de verdad para lo mismo: el tipo decía «ventas»
-- y el rol podía decir otra cosa. Y el candado por tipo impedía lo que Felipe pidió el 2026-09-22: dos cajas en la misma
-- tienda («Terminal Caja 1 TRU» y «Terminal Caja 2 TRU»), o una terminal de almacén con su propio rol.
--
-- LA DECISIÓN (Felipe, 2026-09-22)
--   1. Las terminales se CREAN desde la pantalla (Colaboradores ▸ Terminales), solo un líder. La cuenta de Auth la crea
--      el servidor con la llave de servicio (`app/actions/terminales.ts`); esta migración no cambia eso: sigue sin haber
--      una RPC que cree usuarios de Auth.
--   2. Ya NO hay tipo: lo que ve una terminal lo decide su ROL. Al crear se elige tienda, nombre y rol. Puede haber más de
--      una terminal por tienda.
--
-- QUÉ HACE
--   1. `terminales.tipo` pasa a admitir vacío y deja de decidir nada. NO se borra (nunca se borran datos): queda como
--      LEGADO, con lo que tenían las terminales creadas antes de hoy. Una terminal nueva nace sin tipo.
--   2. El candado «una activa por tipo y tienda» se reemplaza por «un NOMBRE por tienda entre las activas»: el nombre es
--      lo que distingue dos aparatos de la misma tienda en la pantalla y en el pie del menú.
--   3. El disparador de la terminal (`fn_terminal_rol_coherente`): si llega `rol_id` lo usa; si no y hay tipo (legado),
--      el rol de ese tipo, como antes; si no hay ninguno, rechaza. Además exige lo que antes solo decía un comentario:
--      la terminal vive en una TIENDA ACTIVA, y su rol no es Líder ni está archivado.
--   4. Lo que aún leía el tipo en funciones vivas (buscado con pg_get_functiondef en una copia de la base local:
--      `fn_es_terminal`, `fn_mi_terminal`, `fn_terminales`, `reactivar_terminal` y el disparador; ninguna `fn_puede_*`
--      ni `fn_mis_modulos` lo miraba ya):
--        · `fn_mi_terminal()` devuelve el NOMBRE del aparato (antes, su tipo). La web solo la usa para saber «esto es un
--          aparato»; los permisos salen de `fn_mis_modulos()`.
--        · `fn_es_terminal(p_tipo)` conserva su firma (ADR-0026). Sin tipo: «¿es una terminal?». Con un tipo viejo, lo
--          traduce a su módulo: `ventas` ⇒ ve Punto de venta, `administrativa` ⇒ ve Existencias. Nada vivo la llama con
--          tipo hoy; se deja coherente por si alguna migración vieja se vuelve a pegar.
--        · `fn_terminales()` suma el rol (id y nombre) y el correo de la cuenta, y deja de devolver el tipo. Cambia su
--          tabla de retorno: eso exige `drop` + `create` (no crea sobrecarga: los argumentos no cambian).
--        · `reactivar_terminal` ya no mira el tipo: exige que el nombre no lo use otra activa de la tienda.
--
-- SE ROMPE SI
--   · Alguien vuelve a pegar 20260923010000 entero: recrea el índice por tipo y la `fn_terminales()` vieja. Volver a pegar
--     esta después lo deja bien (es re-ejecutable). `pnpm pruebas:terminales-sin-persona` lo detecta.
--   · Se crea una terminal sin rol ni tipo por fuera de la pantalla y del script: el disparador la rechaza (falla cerrado).
--
-- Re-ejecutable. En el repo SIN prefijo `retail.` en lo que el search_path resuelve; al pegar en el SQL Editor de
-- producción, empezar con `set search_path to retail, public, extensions;` (las referencias a tablas ya van con `retail.`).
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. El tipo queda como legado ====================
alter table retail.terminales alter column tipo drop not null;
comment on column retail.terminales.tipo is
  'LEGADO (ADR-0162, 20260923040000): ya no decide nada. Lo que ve la terminal lo decide rol_id. Se conserva lo que tenían las terminales creadas antes; las nuevas nacen con null.';
comment on column retail.terminales.rol_id is
  'El rol de la cuenta (ADR-0161 B): los módulos que ve y hace. Nunca Líder de equipo, nunca un rol archivado al asignarlo.';

-- ==================== 2. Un nombre por tienda entre las activas ====================
drop index if exists retail.terminales_una_activa_por_tipo_y_tienda;

do $$
begin
  -- Si dos activas de una tienda ya se llaman igual, crear el índice fallaría con un error críptico: se avisa en claro.
  if exists (select 1 from retail.terminales where activo
             group by ubicacion_id, lower(btrim(nombre)) having count(*) > 1) then
    raise exception 'Hay dos terminales activas con el mismo nombre en una tienda: renombra o desactiva una antes de pegar esta migración';
  end if;
end $$;

create unique index if not exists terminales_nombre_unico_activa
  on retail.terminales (ubicacion_id, lower(btrim(nombre))) where activo;

comment on index retail.terminales_nombre_unico_activa is
  'ADR-0162 sin tipo: dos terminales activas de la misma tienda no pueden llamarse igual (es lo que las distingue en pantalla). Una desactivada no ocupa el nombre.';

-- ==================== 3. El disparador de la terminal ====================
create or replace function retail.fn_terminal_rol_coherente() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  v_rol retail.roles;
  v_ubicacion retail.ubicaciones;
begin
  -- Sin rol: el del tipo LEGADO (una terminal creada antes de hoy, o un script viejo). Sin ninguno de los dos, no entra.
  if new.rol_id is null and new.tipo is not null then
    new.rol_id := retail.fn_rol_por_clave(case new.tipo when 'ventas' then 'terminal_ventas' else 'terminal_administrativa' end);
  end if;
  if new.rol_id is null then
    raise exception 'Elige el rol de la terminal: es lo que decide qué ve' using errcode = '23502';
  end if;

  -- El rol solo se valida cuando se ASIGNA (alta o cambio): archivar un rol ya exige que nadie lo tenga.
  if tg_op = 'INSERT' or new.rol_id is distinct from old.rol_id then
    select * into v_rol from retail.roles where id = new.rol_id;
    if v_rol.id is null then
      raise exception 'Ese rol no existe — actualiza la pantalla' using errcode = '23503';
    end if;
    if v_rol.fijo or v_rol.clave = 'lider' then
      raise exception 'Una terminal no puede tener el rol Líder de equipo' using errcode = '23514';
    end if;
    if v_rol.archivado_at is not null then
      raise exception 'El rol % está archivado: elige otro', v_rol.nombre using errcode = '23514';
    end if;
  end if;

  -- La tienda: solo al crear o al mudarla. Una terminal es el aparato de un MOSTRADOR (tienda), no de un almacén.
  if tg_op = 'INSERT' or new.ubicacion_id is distinct from old.ubicacion_id then
    select * into v_ubicacion from retail.ubicaciones where id = new.ubicacion_id;
    if v_ubicacion.id is null or v_ubicacion.tipo <> 'tienda' or not v_ubicacion.activo then
      raise exception 'Una terminal solo se crea en una tienda activa' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- ==================== 4. Las funciones que miraban el tipo ====================
-- Sin tipo: «¿es una terminal?». Un tipo desconocido da falso (falla cerrado).
create or replace function retail.fn_es_terminal(p_tipo text default null)
returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select exists (select 1 from retail.fn_terminal_actual())
     and (p_tipo is null
          or (p_tipo = 'ventas' and retail.fn_ve_modulo('vender'))
          or (p_tipo = 'administrativa' and retail.fn_ve_modulo('existencias')));
$$;
comment on function retail.fn_es_terminal(text) is
  'ADR-0162: ¿la sesión es una terminal? p_tipo es LEGADO: ventas ⇒ su rol ve Punto de venta; administrativa ⇒ ve Existencias. Los permisos salen de fn_ve_modulo, no de un tipo.';

create or replace function retail.fn_mi_terminal()
returns text
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select t.nombre from retail.fn_terminal_actual() t limit 1;
$$;
comment on function retail.fn_mi_terminal() is
  'ADR-0162: el NOMBRE del aparato de la sesión, o null si es una persona. La web solo la usa para saber «es un aparato»; qué ve lo dice fn_mis_modulos().';

drop function if exists retail.fn_terminales();
create function retail.fn_terminales()
returns table (id uuid, nombre text, ubicacion_id uuid, ubicacion_nombre text, rol_id uuid, rol_nombre text,
               correo text, activo boolean, creada_at timestamptz, desactivada_at timestamptz, ultimo_acceso timestamptz)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede ver las terminales' using errcode = '42501';
  end if;
  return query
    select t.id, t.nombre, t.ubicacion_id, u.nombre, t.rol_id, r.nombre, au.email::text, t.activo, t.creada_at,
           t.desactivada_at, au.last_sign_in_at
    from retail.terminales t
    join retail.ubicaciones u on u.id = t.ubicacion_id
    join retail.roles r on r.id = t.rol_id
    left join auth.users au on au.id = t.auth_user_id
    order by u.nombre, t.activo desc, t.nombre;
end;
$fn$;

create or replace function retail.reactivar_terminal(p_terminal_id uuid)
returns void
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_t retail.terminales;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede reactivar una terminal' using errcode = '42501';
  end if;
  select * into v_t from retail.terminales where id = p_terminal_id;
  if v_t.id is null or v_t.activo then
    raise exception 'Esa terminal no existe o ya está activa';
  end if;
  if v_t.auth_user_id is null then
    raise exception 'Esa terminal ya no tiene cuenta: crea una nueva en Colaboradores ▸ Terminales';
  end if;
  if exists (select 1 from retail.terminales
             where ubicacion_id = v_t.ubicacion_id and activo and lower(btrim(nombre)) = lower(btrim(v_t.nombre))) then
    raise exception 'Esa tienda ya tiene otra terminal activa llamada «%»', v_t.nombre using errcode = '23505';
  end if;
  update retail.terminales set activo = true, desactivada_at = null, desactivada_por = null where id = p_terminal_id;
end;
$fn$;

-- ==================== 5. Grants ====================
do $$
declare
  v_firma text;
begin
  foreach v_firma in array array['retail.fn_es_terminal(text)', 'retail.fn_mi_terminal()', 'retail.fn_terminales()',
                                 'retail.reactivar_terminal(uuid)'] loop
    execute format('revoke all on function %s from public, anon', v_firma);
    execute format('grant execute on function %s to authenticated', v_firma);
  end loop;
end $$;
