-- ============================================================================
-- 20261029034000_danadas_foto_del_dano.sql — CAYLA V2 · ADR-0564, actividad 7 (Felipe, 2026-10-28)
-- Dañadas: una foto OPCIONAL del daño al reportarla (la tabla y las funciones; el bucket y sus políticas van aparte, en 20261029045000).
--
-- EL PROBLEMA PRIMERO. Para decidir si una prenda se arregla en una costurera cercana, en el Taller o se liquida, quien decide hoy solo
-- lee unas pocas palabras. Una foto de la mancha o del descosido lo dice mejor, pero no puede frenar el reporte: con la tienda abierta y
-- una clienta esperando, la foto es un extra. Por eso la foto se sube DESPUÉS de reportar, con la dañada ya guardada, y si falla la
-- prenda queda reportada igual.
--
-- DECISIÓN DE FELIPE (2026-10-28, ADR-0564): la foto es opcional.
--
-- QUÉ HACE (mismo patrón que las fotos de los gastos del viaje, 20261013233000: el archivo va directo al bucket y recién después se
-- registra su fila; la fila es la que hace existir a la foto, un objeto sin fila es basura que nadie ve).
--   1. `prendas_danadas_fotos`: una fila por foto (hasta 3 por dañada). Ni update ni delete: una foto no se pisa ni se borra. Con RLS
--      encendido y SIN políticas: solo se lee y se escribe por las funciones de abajo (ADR-0195: aquí no se crea ninguna política).
--   2. `registrar_foto_danada(p_danada_id, p_ruta, p_nombre, p_tipo, p_bytes)`: registra una foto ya subida. Quien ve Existencias y opera la
--      sede de la dañada, firmado por el responsable. La ruta debe empezar con el id de la dañada. Repetir la misma ruta devuelve
--      `ya_registrada`.
--   3. `fotos_de_danadas(p_ids)`: las rutas de las fotos de esas dañadas que quien llama puede ver (el líder, o su propia sede: la misma
--      regla que la lista de Dañadas).
--   4. `fn_puede_ver_foto_danada(p_ruta)`: lo mismo para la política de lectura del bucket (20261029045000).
--
-- ESTADOS QUE DEJAN DE SER POSIBLES:
--   · una foto sin dañada (FK), de más de 10 MB o de un tipo que no es imagen (CHECK); más de 3 fotos por dañada (la función lo rechaza);
--   · una foto de la dañada de OTRA sede registrada por alguien que no la opera (la función lo rechaza).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: DOS partes, en orden y por separado. PARTE 1: este archivo (tabla + funciones, sin políticas), ANTES de
-- publicar la web. PARTE 2: 20261029045000_danadas_foto_bucket.sql (bucket y políticas, SOLO esas: ADR-0195). Si la web sale antes que las
-- partes, nada se rompe: la lectura de fotos nunca lanza (sin la función, no hay fotos) y solo subir la foto falla al usarse, avisando que la
-- prenda quedó reportada igual. Idempotente.
-- Cómo se verifica después:
--   select danada_id, count(*) from retail.prendas_danadas_fotos group by 1;
--
-- SE ROMPE SI: se pega la parte 2 sin la parte 1 (la política llama a `fn_puede_ver_foto_danada`): la parte 2 lo comprueba y avisa.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create table if not exists retail.prendas_danadas_fotos (
  id uuid primary key default gen_random_uuid(),
  danada_id uuid not null references retail.prendas_danadas (id),
  ruta text not null unique,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 200),
  tipo text not null check (tipo in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  bytes integer not null check (bytes > 0 and bytes <= 10 * 1024 * 1024),
  subida_por uuid,
  created_at timestamptz not null default now(),
  constraint prendas_danadas_fotos_ruta_de_la_danada check (ruta like danada_id::text || '/%')
);

create index if not exists prendas_danadas_fotos_danada_idx on retail.prendas_danadas_fotos (danada_id);

comment on table retail.prendas_danadas_fotos is
  'ADR-0564: las fotos opcionales del daño de una prenda reportada (hasta 3). RLS encendido y SIN políticas a propósito: solo se escribe con registrar_foto_danada y se lee con fotos_de_danadas / fn_puede_ver_foto_danada. Ni update ni delete.';

alter table retail.prendas_danadas_fotos enable row level security;

create or replace function retail.registrar_foto_danada(p_danada_id uuid, p_ruta text, p_nombre text, p_tipo text, p_bytes integer)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  pd prendas_danadas%rowtype;
  v_id uuid;
  v_actor uuid;
begin
  if not fn_ve_modulo('existencias') then
    raise exception 'No puedes subir la foto de una prenda dañada: tu rol no tiene el módulo «Existencias». Pídele al líder que lo active.'
      using errcode = '42501', hint = 'foto_sin_modulo';
  end if;
  select * into pd from prendas_danadas where id = p_danada_id;
  if not found then
    raise exception 'Esa prenda dañada ya no está en la lista.' using hint = 'foto_no_existe';
  end if;
  if not fn_puede_operar_ubicacion(pd.ubicacion_id) then
    raise exception 'No puedes subir la foto de una prenda de esa tienda: no es tu sede.' using hint = 'foto_sin_tienda';
  end if;
  if p_ruta is null or p_ruta not like p_danada_id::text || '/%' then
    raise exception 'La foto no corresponde a esta prenda dañada.' using hint = 'foto_ruta_invalida';
  end if;
  -- La misma foto otra vez (un reintento tras un corte): lo mismo, sin repetir.
  select id into v_id from prendas_danadas_fotos where ruta = p_ruta;
  if v_id is not null then
    return jsonb_build_object('ya_registrada', true, 'id', v_id);
  end if;
  if (select count(*) from prendas_danadas_fotos where danada_id = p_danada_id) >= 3 then
    raise exception 'Una prenda dañada admite hasta 3 fotos.' using hint = 'foto_demasiadas';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  insert into prendas_danadas_fotos (danada_id, ruta, nombre, tipo, bytes, subida_por)
    values (p_danada_id, p_ruta, btrim(coalesce(p_nombre, 'foto')), p_tipo, p_bytes, v_actor)
    returning id into v_id;
  return jsonb_build_object('ya_registrada', false, 'id', v_id);
end;
$fn$;

comment on function retail.registrar_foto_danada(uuid, text, text, text, integer) is
  'ADR-0564: registra la fila de una foto del daño ya subida al bucket retail-danadas (hasta 3 por dañada). Quien ve Existencias y opera la sede; firma el responsable. Repetir la misma ruta devuelve ya_registrada.';

revoke all on function retail.registrar_foto_danada(uuid, text, text, text, integer) from public, anon;
grant execute on function retail.registrar_foto_danada(uuid, text, text, text, integer) to authenticated;

-- Las dañadas que quien llama puede ver: el líder, o las de su propia sede (la política de lectura de `prendas_danadas`).
create or replace function retail.fn_puede_ver_danada(p_danada_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    exists (
      select 1 from retail.prendas_danadas pd
       where pd.id = p_danada_id
         and (retail.fn_es_lider() or pd.ubicacion_id = retail.fn_ubicacion_actual_persona())
    ),
    false
  );
$$;

revoke all on function retail.fn_puede_ver_danada(uuid) from public, anon;
grant execute on function retail.fn_puede_ver_danada(uuid) to authenticated;

create or replace function retail.fotos_de_danadas(p_ids uuid[])
returns table (danada_id uuid, ruta text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select f.danada_id, f.ruta
    from retail.prendas_danadas_fotos f
   where f.danada_id = any(p_ids)
     and retail.fn_ve_modulo('existencias')
     and retail.fn_puede_ver_danada(f.danada_id)
   order by f.created_at, f.id;
$$;

comment on function retail.fotos_de_danadas(uuid[]) is
  'ADR-0564: las rutas de las fotos del daño de esas dañadas que quien llama puede ver (el líder, o las de su propia sede). Lectura: la web firma el enlace.';

revoke all on function retail.fotos_de_danadas(uuid[]) from public, anon;
grant execute on function retail.fotos_de_danadas(uuid[]) to authenticated;

create or replace function retail.fn_puede_ver_foto_danada(p_ruta text)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    retail.fn_ve_modulo('existencias')
    and exists (
      select 1 from retail.prendas_danadas_fotos f
       where f.ruta = p_ruta and retail.fn_puede_ver_danada(f.danada_id)
    ),
    false
  );
$$;

comment on function retail.fn_puede_ver_foto_danada(text) is
  'ADR-0564: ¿puede quien llama ver la foto de esta ruta? La usa la política de lectura del bucket retail-danadas (20261029045000).';

revoke all on function retail.fn_puede_ver_foto_danada(text) from public, anon;
grant execute on function retail.fn_puede_ver_foto_danada(text) to authenticated;

notify pgrst, 'reload schema';
