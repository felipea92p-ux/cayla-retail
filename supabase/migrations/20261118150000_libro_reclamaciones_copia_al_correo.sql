-- ============================================================================
-- 20261118150000_libro_reclamaciones_copia_al_correo.sql — CAYLA V2 · Tienda online · Libro de Reclamaciones · PARTE 2: la copia
-- (ADR-0679, Felipe 2026-11-18)
--
-- EL PROBLEMA PRIMERO. Quien deja una hoja en el Libro de Reclamaciones virtual tiene que recibir una copia en su correo (DS 011-2011-PCM
-- y modificatorias). La PARTE 1 (20261118145000) ya guarda la hoja y muestra la constancia en pantalla; pero si la persona cierra la
-- pestaña sin imprimirla, se queda sin prueba de lo que reclamó. Y el correo puede fallar (el proveedor no responde, la llave no está):
-- la hoja no puede perderse por eso ni la copia puede quedar olvidada.
--
-- ANALOGÍA CAYLA. La copia en papel carbón que la tienda le entrega a quien llenó la hoja del libro físico. Aquí la copia viaja por correo;
-- si el cartero no pasó, la hoja se queda en la bandeja de «por enviar» hasta que pase.
--
-- QUÉ HACE
--   1. `hojas_reclamacion` suma `copia_enviada_en` (cuándo salió la copia), `copia_intentos` y `copia_tomada_en` (quién la está mandando).
--   2. El candado de la hoja (PARTE 1) suma una regla: la copia se marca enviada UNA vez y no se desmarca; los intentos solo suben.
--   3. `tienda_libro_copias_reclamar(limite, id)`: toma las hojas cuya copia falta (con `skip locked`: dos vueltas a la vez no toman la
--      misma), les suma un intento y devuelve cada hoja completa con su marca (para el enlace a la constancia). Con `id`, solo esa: la
--      acción que guarda la hoja manda su copia enseguida. Una hoja tomada hace menos de 2 minutos no se vuelve a tomar (la está mandando
--      otro); con 5 intentos se deja (la tienda lo anota en su registro para revisarlo a mano).
--   4. `tienda_libro_copia_enviada(id)`: la marca enviada.
--   5. `tienda_ver_hoja_reclamacion` suma `copia_enviada` (la constancia dice «te enviamos una copia» o «en unos minutos»).
--
-- DECIDÍ: una cola en la misma fila, no una tabla aparte de correos: cada hoja tiene UNA copia, y así no hay dos fuentes que se desalineen.
-- DECIDÍ: la acción manda la copia enseguida y una tarea programada (`/api/libro-copias`, cada 5 minutos) reintenta la que falló: la
--   persona recibe su copia al instante casi siempre, y nunca se queda sin ella por un fallo pasajero.
-- DESCARTÉ: mandar el correo desde la base (pg_net o un aviso a la tienda: ADR-0166, ADR-0352); reintentar para siempre (un correo mal
--   escrito que el proveedor rechaza no se arregla reintentando: a los 5 intentos, a mano).
--
-- SE ROMPE SI: alguien marca una copia enviada sin que haya salido (solo la tienda llama `tienda_libro_copia_enviada`, después de que el
--   proveedor de correo respondió que la recibió).
--
-- PRODUCCIÓN. APLICADA el 2026-11-18 con el OK de Felipe (CLI `supabase db query --linked`, en una transacción, registrada con
-- esta misma versión en schema_migrations; las 18 funciones del Libro, idénticas a la base local probada). Antes: NO estaba aplicada: va DESPUÉS de la PARTE 1 y espera el OK de Felipe. Una sola parte, idempotente. Agrega columnas a
-- `hojas_reclamacion`, una tabla nueva que la tienda aún no usa en producción (sin choque con nada), sin políticas, sin `drop trigger` y
-- sin `select … into` dentro de un texto entre comillas.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select column_name from information_schema.columns where table_schema = 'retail' and table_name = 'hojas_reclamacion'
--      and column_name like 'copia%' order by 1;                                              → copia_enviada_en, copia_intentos, copia_tomada_en
--   select has_function_privilege('tienda_web', 'retail.tienda_libro_copias_reclamar(integer, uuid)', 'execute');    → t
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $guarda$
begin
  if to_regclass('retail.hojas_reclamacion') is null then
    raise exception 'Falta la hoja: pega antes 20261118145000_libro_reclamaciones_tienda.sql.';
  end if;
end
$guarda$;

-- ---------- 1. Las columnas de la copia ----------
alter table retail.hojas_reclamacion
  add column if not exists copia_enviada_en timestamptz,
  add column if not exists copia_intentos   smallint not null default 0,
  add column if not exists copia_tomada_en  timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hojas_reclamacion_copia') then
    alter table retail.hojas_reclamacion add constraint hojas_reclamacion_copia check (
      copia_intentos between 0 and 100 and (copia_enviada_en is null or copia_enviada_en >= creada_en));
  end if;
end
$$;

comment on column retail.hojas_reclamacion.copia_enviada_en is 'Cuándo salió la copia de la hoja al correo del cliente (el proveedor de correo la recibió). Null: falta. Se marca una vez.';
comment on column retail.hojas_reclamacion.copia_intentos is 'Cuántas veces se intentó mandar la copia. Con 5 se deja de intentar (a mano).';
comment on column retail.hojas_reclamacion.copia_tomada_en is 'Cuándo la tomó el último intento: otro no la vuelve a tomar en 2 minutos.';

create index if not exists hojas_reclamacion_copia_pendiente_idx on retail.hojas_reclamacion (creada_en) where copia_enviada_en is null;

-- ---------- 2. El candado, con la copia ----------
create or replace function retail.fn_hojas_reclamacion_reglas()
returns trigger
language plpgsql
set search_path = retail, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una hoja del Libro de Reclamaciones no se borra.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    -- Lo que escribió el cliente y lo que decía la hoja ese día no cambia nunca.
    if (new.id, new.anio, new.numero, new.creada_en, new.marca, new.cuenta_web_id, new.proveedor_razon_social, new.proveedor_ruc,
        new.proveedor_domicilio, new.ubicacion_id, new.ubicacion_nombre, new.ubicacion_direccion, new.consumidor_nombre,
        new.consumidor_tipo_documento, new.consumidor_documento, new.consumidor_domicilio, new.consumidor_telefono,
        new.consumidor_correo, new.menor_de_edad, new.apoderado_nombre, new.bien_tipo, new.bien_monto, new.bien_descripcion,
        new.tipo, new.detalle, new.pedido)
       is distinct from
       (old.id, old.anio, old.numero, old.creada_en, old.marca, old.cuenta_web_id, old.proveedor_razon_social, old.proveedor_ruc,
        old.proveedor_domicilio, old.ubicacion_id, old.ubicacion_nombre, old.ubicacion_direccion, old.consumidor_nombre,
        old.consumidor_tipo_documento, old.consumidor_documento, old.consumidor_domicilio, old.consumidor_telefono,
        old.consumidor_correo, old.menor_de_edad, old.apoderado_nombre, old.bien_tipo, old.bien_monto, old.bien_descripcion,
        old.tipo, old.detalle, old.pedido) then
      raise exception 'Lo escrito en una hoja del Libro de Reclamaciones no cambia.' using errcode = '42501';
    end if;
    -- La copia (PARTE 2): enviada una vez, y los intentos solo suben.
    if old.copia_enviada_en is not null and new.copia_enviada_en is distinct from old.copia_enviada_en then
      raise exception 'La copia de la hoja ya salió: no se desmarca.' using errcode = '42501';
    end if;
    if new.copia_intentos < old.copia_intentos then
      raise exception 'Los intentos de la copia no bajan.' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function retail.fn_hojas_reclamacion_reglas() from public, anon, authenticated;

-- ---------- 3. La constancia dice si la copia salió ----------
create or replace function retail.tienda_ver_hoja_reclamacion(p_id uuid, p_marca uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'id', h.id, 'codigo', h.codigo, 'creada_en', h.creada_en,
    'proveedor', jsonb_build_object('razon_social', h.proveedor_razon_social, 'ruc', h.proveedor_ruc, 'domicilio', h.proveedor_domicilio),
    'tienda', case when h.ubicacion_id is null then null
                   else jsonb_build_object('nombre', h.ubicacion_nombre, 'direccion', h.ubicacion_direccion) end,
    'consumidor', jsonb_build_object(
      'nombre', h.consumidor_nombre, 'tipo_documento', h.consumidor_tipo_documento, 'documento', h.consumidor_documento,
      'domicilio', h.consumidor_domicilio, 'telefono', h.consumidor_telefono, 'correo', h.consumidor_correo,
      'menor_de_edad', h.menor_de_edad, 'apoderado', h.apoderado_nombre),
    'bien', jsonb_build_object('tipo', h.bien_tipo, 'monto', h.bien_monto, 'descripcion', h.bien_descripcion),
    'tipo', h.tipo, 'detalle', h.detalle, 'pedido', h.pedido,
    'copia_enviada', h.copia_enviada_en is not null)
    from retail.hojas_reclamacion h
   where p_id is not null and p_marca is not null and h.id = p_id and h.marca = p_marca
$$;

-- ---------- 4. Tomar las copias que faltan ----------
create or replace function retail.tienda_libro_copias_reclamar(p_limite integer, p_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_copias jsonb;
begin
  with tomadas as (
    select h.id from retail.hojas_reclamacion h
     where h.copia_enviada_en is null and h.copia_intentos < 5
       and (h.copia_tomada_en is null or h.copia_tomada_en < now() - interval '2 minutes')
       and (p_id is null or h.id = p_id)
     order by h.creada_en, h.id
     limit v_limite
     for update skip locked
  ),
  sumadas as (
    update retail.hojas_reclamacion h set copia_intentos = h.copia_intentos + 1, copia_tomada_en = now()
      from tomadas t where h.id = t.id
    returning h.id, h.marca, h.creada_en, h.copia_intentos
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'marca', s.marca, 'intentos', s.copia_intentos,
           -- La hoja completa, la misma que ve la persona en su constancia.
           'hoja', retail.tienda_ver_hoja_reclamacion(s.id, s.marca))
         order by s.creada_en, s.id), '[]'::jsonb)
    into v_copias
    from sumadas s;
  return jsonb_build_object('estado', 'ok', 'copias', v_copias);
end;
$$;
comment on function retail.tienda_libro_copias_reclamar(integer, uuid) is
  'Tienda online, Libro de Reclamaciones (ADR-0679): toma hasta `limite` hojas cuya copia al correo falta (skip locked; no las tomadas hace menos de 2 minutos; hasta 5 intentos), les suma un intento y devuelve {estado, copias: [{marca, intentos, hoja}]}. Con `id`, solo esa hoja. Solo la llama tienda_web.';

create or replace function retail.tienda_libro_copia_enviada(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
begin
  update retail.hojas_reclamacion set copia_enviada_en = now() where id = p_id and copia_enviada_en is null;
  return jsonb_build_object('estado', 'ok');
end;
$$;
comment on function retail.tienda_libro_copia_enviada(uuid) is
  'Tienda online, Libro de Reclamaciones (ADR-0679): marca enviada la copia de una hoja (el proveedor de correo la recibió). Una vez; marcarla otra vez no cambia nada. Solo la llama tienda_web.';

-- ---------- 5. Permisos ----------
revoke all on function retail.tienda_libro_copias_reclamar(integer, uuid) from public, anon, authenticated;
revoke all on function retail.tienda_libro_copia_enviada(uuid) from public, anon, authenticated;
revoke all on function retail.tienda_ver_hoja_reclamacion(uuid, uuid) from public, anon, authenticated;
grant execute on function retail.tienda_libro_copias_reclamar(integer, uuid) to tienda_web;
grant execute on function retail.tienda_libro_copia_enviada(uuid) to tienda_web;
grant execute on function retail.tienda_ver_hoja_reclamacion(uuid, uuid) to tienda_web;
