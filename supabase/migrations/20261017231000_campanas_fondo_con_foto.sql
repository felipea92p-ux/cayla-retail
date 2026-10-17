-- Tienda web ▸ Campañas (ADR-0436, actividad 8): el fondo de la portada con una foto propia.
--
-- EL PROBLEMA. El editor ya ofrece un fondo degradado, liso o con dibujo; la maqueta aprobada pide también «Con foto · La que subas»: una
-- foto horizontal de la campaña detrás del texto, oscurecida para que la letra se lea. La base no tenía dónde guardarla ni con qué medir
-- si la letra se lee sobre ella.
--
-- LO QUE HACE
--   PARTE 1 (la tabla y sus funciones; ninguna política):
--   · `campana_disenos` suma tres columnas: `foto` (la dirección pública de la foto, solo de nuestro almacén `retail-campanas-fotos`,
--     `fondos/<uuid>.jpg`), `foto_tono` (el color de lo más claro de la foto, que mide el ERP al subirla: con él la revisión sabe si la
--     letra se lee, en el ERP y en la tienda, sin abrir la foto) y `oscuro` (cuánto se oscurece la foto con el color de la campaña, de
--     0,15 a 0,90; de fábrica 0,45, como la maqueta).
--   · `fondo` admite 'foto', y un fondo con foto necesita su foto. La foto puede quedarse guardada con otro fondo: quien vuelve a «Con
--     foto» no la sube de nuevo.
--   · `fn_diseno_json` (lo que leen el ERP y la tienda) suma `foto`, `fotoTono` y `oscuro`.
--   · `guardar_diseno_borrador` los guarda; una foto que no está en el almacén no se guarda. Publicar y volver al anterior no cambian:
--     solo mueven el estado de la fila, y la foto viaja con ella.
--   PARTE 2 (sola, al final: ADR-0195, «Políticas y deadlocks»): el almacén público `retail-campanas-fotos` (hasta 5 MB, JPG, PNG o WebP) y
--     quién sube: quien tiene el módulo Campañas. Leer es público (la foto sale en la portada de la tienda). Ni update ni delete: una foto
--     no se pisa ni se borra (un diseño anterior puede seguir usándola).
--
-- QUÉ NO HACE. No sube fotos: eso lo hace el navegador, directo al almacén (como las fotos de las prendas y las muestras), y aquí solo
-- se guarda su dirección. No borra la foto vieja al cambiarla.
--
-- CUÁNDO SE PEGA. El día que se publique la web (casilla 1 de CONTINUAR.md), después de 20261017212000. En el SQL Editor de producción,
-- CADA PARTE POR SEPARADO, en orden. Cada una espera como mucho 3 s un candado: si la tienda está leyendo la tabla, falla limpio y se
-- vuelve a pegar esa misma parte. Todo es idempotente. En local y en el CI el archivo corre entero.

-- ============================== PARTE 1 · la tabla y sus funciones ==============================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.campana_disenos
  add column if not exists foto text,
  add column if not exists foto_tono text,
  add column if not exists oscuro numeric(3, 2) not null default 0.45;

alter table retail.campana_disenos drop constraint if exists campana_disenos_fondo;
alter table retail.campana_disenos add constraint campana_disenos_fondo check (fondo in ('degradado', 'liso', 'dibujo', 'foto'));

alter table retail.campana_disenos drop constraint if exists campana_disenos_foto_url;
alter table retail.campana_disenos add constraint campana_disenos_foto_url
  check (foto is null or foto ~ '^https?://[^/?#]+/storage/v1/object/public/retail-campanas-fotos/fondos/[0-9a-f-]{36}\.jpg$');

alter table retail.campana_disenos drop constraint if exists campana_disenos_foto_tono;
alter table retail.campana_disenos add constraint campana_disenos_foto_tono check (foto_tono is null or foto_tono ~ '^#[0-9a-f]{6}$');

-- Una foto llega siempre con su tono (sin él, la revisión no sabría si la letra se lee).
alter table retail.campana_disenos drop constraint if exists campana_disenos_foto_con_tono;
alter table retail.campana_disenos add constraint campana_disenos_foto_con_tono check ((foto is null) = (foto_tono is null));

alter table retail.campana_disenos drop constraint if exists campana_disenos_fondo_con_foto;
alter table retail.campana_disenos add constraint campana_disenos_fondo_con_foto check (fondo <> 'foto' or foto is not null);

alter table retail.campana_disenos drop constraint if exists campana_disenos_oscuro;
alter table retail.campana_disenos add constraint campana_disenos_oscuro check (oscuro between 0.15 and 0.90);

comment on column retail.campana_disenos.foto is
  'ADR-0436, actividad 8: la dirección pública de la foto del fondo (solo retail-campanas-fotos/fondos/<uuid>.jpg). Puede quedarse con otro fondo.';
comment on column retail.campana_disenos.foto_tono is
  'ADR-0436, actividad 8: el color de lo más claro de la foto (#rrggbb), medido por el ERP al subirla. La revisión lo usa para saber si la letra se lee.';
comment on column retail.campana_disenos.oscuro is
  'ADR-0436, actividad 8: cuánto se oscurece la foto con el color de la campaña (0,15 a 0,90).';

-- El diseño como lo lee el código (los mismos nombres de `DisenoDeCampana`), ahora con la foto.
create or replace function retail.fn_diseno_json(d retail.campana_disenos)
returns jsonb
language sql
stable
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'paleta', d.paleta,
    'colores', d.colores,
    'fondo', d.fondo,
    'patron', d.patron,
    'intensidad', d.intensidad,
    'acomodo', d.acomodo,
    'corte', d.corte,
    'tamano', d.tamano,
    'frase', d.frase,
    'prendas', to_jsonb(d.prendas),
    'cuenta', d.cuenta,
    'pctGigante', d.pct_gigante,
    'colibri', d.colibri,
    'sello', d.sello,
    'foto', d.foto,
    'fotoTono', d.foto_tono,
    'oscuro', d.oscuro
  );
$$;

revoke all on function retail.fn_diseno_json(retail.campana_disenos) from public, anon, authenticated;

-- Guardar el borrador, ahora con la foto. Igual que en 20261017160000 en todo lo demás (la versión, las prendas de la campaña, los
-- errores que entiende la pantalla). Una web de antes, que no manda la foto, la deja vacía y no toca `oscuro`.
create or replace function retail.guardar_diseno_borrador(p_etiqueta_id uuid, p_diseno jsonb, p_version integer)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_actual retail.campana_disenos;
  v_prendas uuid[];
  v_corte smallint;
  v_foto text;
  v_oscuro numeric(3, 2);
  v_version integer;
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Diseñar una campaña necesita el módulo «Campañas» en tu rol.' using errcode = '42501';
  end if;
  perform retail.fn_campana_para_disenar(p_etiqueta_id);
  v_actor := retail.fn_actor_persona_id(true);
  if p_diseno is null or jsonb_typeof(p_diseno) <> 'object' then
    raise exception 'El diseño no es válido. Recarga la pantalla.' using errcode = '22023', hint = 'diseno_invalido';
  end if;

  begin
    v_prendas := case when jsonb_typeof(p_diseno -> 'prendas') = 'array' then array(select jsonb_array_elements_text(p_diseno -> 'prendas')::uuid) end;
    v_corte := (p_diseno ->> 'corte')::smallint;
    v_oscuro := (p_diseno ->> 'oscuro')::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'El diseño no es válido. Recarga la pantalla.' using errcode = '22023', hint = 'diseno_invalido';
  end;
  -- Las prendas de la portada salen de la campaña: un modelo que no está en ella no se guarda.
  if v_prendas is not null and exists (
    select 1 from unnest(v_prendas) x(producto_id)
    where not exists (
      select 1 from retail.variante_etiquetas ve join retail.variantes v on v.id = ve.variante_id
      where ve.etiqueta_id = p_etiqueta_id and v.producto_id = x.producto_id
    )
  ) then
    raise exception 'Una de las prendas elegidas ya no está en la campaña. Elígelas de nuevo.' using errcode = 'P0001', hint = 'prenda_fuera';
  end if;
  -- La foto tiene que estar de verdad en el almacén (donde hay Storage: el Postgres del CI no lo tiene). Una dirección a un archivo que
  -- no existe dejaría la portada sin foto.
  v_foto := nullif(p_diseno ->> 'foto', '');
  if v_foto is not null and to_regclass('storage.objects') is not null then
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'retail-campanas-fotos' and o.name = substring(v_foto from '/retail-campanas-fotos/(.+)$')
    ) then
      raise exception 'La foto no terminó de subirse. Súbela de nuevo.' using errcode = 'P0001', hint = 'foto_sin_subir';
    end if;
  end if;

  select * into v_actual from retail.campana_disenos where etiqueta_id = p_etiqueta_id and estado = 'borrador' for update;
  if coalesce(v_actual.version, 0) <> coalesce(p_version, 0) then
    raise exception 'Alguien más cambió o publicó este diseño mientras lo probabas. Recarga para ver el último.' using errcode = 'P0001', hint = 'diseno_cambiado';
  end if;

  begin
    if v_actual.id is null then
      insert into retail.campana_disenos (etiqueta_id, estado, paleta, colores, fondo, patron, intensidad, acomodo, corte, tamano, frase, prendas,
                                          cuenta, pct_gigante, colibri, sello, foto, foto_tono, oscuro, version, actualizado_por)
      values (p_etiqueta_id, 'borrador', p_diseno ->> 'paleta', nullif(p_diseno -> 'colores', 'null'::jsonb), p_diseno ->> 'fondo',
              p_diseno ->> 'patron', p_diseno ->> 'intensidad', p_diseno ->> 'acomodo', v_corte, p_diseno ->> 'tamano',
              coalesce(p_diseno ->> 'frase', ''), v_prendas, (p_diseno ->> 'cuenta')::boolean, (p_diseno ->> 'pctGigante')::boolean,
              (p_diseno ->> 'colibri')::boolean, p_diseno ->> 'sello', v_foto, nullif(p_diseno ->> 'fotoTono', ''), coalesce(v_oscuro, 0.45),
              1, v_actor)
      returning version into v_version;
    else
      update retail.campana_disenos set
        paleta = p_diseno ->> 'paleta',
        colores = nullif(p_diseno -> 'colores', 'null'::jsonb),
        fondo = p_diseno ->> 'fondo',
        patron = p_diseno ->> 'patron',
        intensidad = p_diseno ->> 'intensidad',
        acomodo = p_diseno ->> 'acomodo',
        corte = v_corte,
        tamano = p_diseno ->> 'tamano',
        frase = coalesce(p_diseno ->> 'frase', ''),
        prendas = v_prendas,
        cuenta = (p_diseno ->> 'cuenta')::boolean,
        pct_gigante = (p_diseno ->> 'pctGigante')::boolean,
        colibri = (p_diseno ->> 'colibri')::boolean,
        sello = p_diseno ->> 'sello',
        foto = v_foto,
        foto_tono = nullif(p_diseno ->> 'fotoTono', ''),
        oscuro = coalesce(v_oscuro, v_actual.oscuro),
        version = v_actual.version + 1,
        actualizado_en = now(),
        actualizado_por = v_actor
      where id = v_actual.id
      returning version into v_version;
    end if;
  exception
    -- Dos primeros guardados a la vez: el segundo choca con el índice de «un borrador por campaña».
    when unique_violation then
      raise exception 'Alguien más cambió o publicó este diseño mientras lo probabas. Recarga para ver el último.' using errcode = 'P0001', hint = 'diseno_cambiado';
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'El diseño no es válido. Recarga la pantalla.' using errcode = '22023', hint = 'diseno_invalido';
  end;
  return v_version;
end;
$$;

comment on function retail.guardar_diseno_borrador(uuid, jsonb, integer) is
  'Tienda web ▸ Campañas (ADR-0436): guarda el borrador del diseño (se llama sola mientras se prueba), con su foto de fondo (actividad 8). p_version = la versión sobre la que se trabajó (0 si no había); si no coincide, hint diseno_cambiado; una foto que no está en el almacén, hint foto_sin_subir. Devuelve la versión nueva. Pide fn_puede_campanas(); suelta del combo (campana_diseno_borrador).';

revoke all on function retail.guardar_diseno_borrador(uuid, jsonb, integer) from public, anon;
grant execute on function retail.guardar_diseno_borrador(uuid, jsonb, integer) to authenticated, service_role;

do $$
begin
  if position('''oscuro''' in pg_get_functiondef('retail.fn_diseno_json(retail.campana_disenos)'::regprocedure)) = 0
     or position('foto_sin_subir' in pg_get_functiondef('retail.guardar_diseno_borrador(uuid, jsonb, integer)'::regprocedure)) = 0 then
    raise exception 'campanas_fondo_con_foto: las funciones del diseño no quedaron con la foto';
  end if;
end $$;

reset lock_timeout;

-- ============================== PARTE 2 · el almacén de fotos y quién sube (sola) ==============================

set lock_timeout = '3s';

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'campanas_fondo_con_foto: sin schema storage en este Postgres; el almacén retail-campanas-fotos se crea donde Storage existe.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('retail-campanas-fotos', 'retail-campanas-fotos', true, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  -- Sube quien diseña (el módulo Campañas); leer es público, por la dirección de la foto. Sin update ni delete.
  drop policy if exists retail_campanas_fotos_insert on storage.objects;
  create policy retail_campanas_fotos_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'retail-campanas-fotos' and (select retail.fn_puede_campanas()));
end;
$$;

reset lock_timeout;
