-- ============================================================================
-- 20261017183000_recortes_deshacer_y_candado.sql — CAYLA V2 · «Arma el tuyo» (ADR-0434): el «Deshacer» de un descarte que no pisa a
-- nadie, y el recorte que es de SU foto
--
-- EL PROBLEMA PRIMERO. El «Deshacer» del aviso de «Descartaste…» (PR #1164) volvía a anotar el recorte con `registrar_recorte`. Si en
-- esos 7 segundos otra persona ya lo había usado, el «Deshacer» le pisaba esa decisión sin avisar, y la Actividad quedaba diciendo
-- «usó» porque el «Deshacer» no se anotaba (`/chaos` de Tienda web ▸ Vitrina ▸ Probador, 2026-10-17, semilla 1017).
--
-- LO QUE HACE.
--   · `deshacer_descarte_recorte(p_foto, p_estado)`, nueva: devuelve un recorte DESCARTADO al estado que tenía (`listo` o
--     `por_revisar`, el que la pantalla recuerda) solo si sigue descartado —si alguien ya decidió, responde `recorte_ya_cambio` y no
--     toca nada— y lo deja en la Actividad («deshizo el descarte…»). Es de la Vitrina web y firma con el responsable, como revisar.
--   · `registrar_recorte` (misma firma) suma dos reglas: el archivo es el de ESA foto —`recortes/<nombre de la foto>.png` o
--     `recortes/<nombre de la foto>-<sello>.png`, como lo arma `rutaDelRecorte`— y una foto que ya tiene recorte la cambia quien ve la
--     Vitrina web (los demás, con el MISMO archivo, reciben lo que ya está: es un reintento). Subir una foto nueva no cambia: cada foto
--     nueva es un archivo nuevo, todavía sin recorte.
--
-- PRODUCCIÓN. **APLICADA el 2026-10-17** con el OK de Felipe y el CI en verde, antes de fusionar el PR #1164 (la pantalla de ese PR llama a
-- la función nueva): huellas `d06caffc4fe3d6c5d0b1fd478ca73b3d` (registrar_recorte) y `9302fe9523162ece22d9cc889d78d7c7`
-- (deshacer_descarte_recorte). Una sola parte, re-ejecutable: dos funciones y sus permisos; no altera tablas, no crea políticas ni toca
-- disparadores (ADR-0195). Comprobación al pie. Pruebas: `pnpm pruebas:vitrina-probador` (sección 9).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Anotar un recorte: el archivo es el de su foto, y una foto con recorte la cambia quien ve la Vitrina ----------
create or replace function retail.registrar_recorte(p_foto text, p_recorte text, p_proporcion numeric, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_estado text;
  v_proporcion numeric(6, 4);
  v_base text;
  v_fila retail.foto_recortes%rowtype;
begin
  if not (retail.fn_ve_modulo('vitrina_web') or retail.fn_puede_editar_catalogo()) then
    raise exception 'recorte_sin_permiso'
      using errcode = '42501', hint = 'Para guardar el recorte de una foto necesitas la Vitrina web o poder editar el catálogo.';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  if p_foto is null or p_foto !~ '^[^/]' or p_foto ~ '^(recortes|originales)/' then
    raise exception 'recorte_datos_invalidos' using hint = 'Esa no es una foto de prenda.';
  end if;
  if p_recorte is null or p_recorte !~ '^recortes/[^/]+\.png$' then
    raise exception 'recorte_datos_invalidos' using hint = 'El recorte tiene que ser un PNG de la carpeta de recortes.';
  end if;
  if p_proporcion is null or p_proporcion <= 0.05 or p_proporcion >= 20 then
    raise exception 'recorte_datos_invalidos' using hint = 'La proporción del recorte no es válida.';
  end if;
  if p_motivo is not null and p_motivo not in ('huecos', 'con_fondo', 'sin_original') then
    raise exception 'recorte_datos_invalidos' using hint = 'No se entiende por qué el recorte quedó por revisar.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'retail-productos-fotos' and o.name = p_foto)
     and not exists (select 1 from retail.producto_fotos pf
                      where substring(split_part(pf.url, '?', 1) from '/storage/v1/object/public/retail-productos-fotos/(.+)$') = p_foto) then
    raise exception 'recorte_foto_no_existe' using hint = 'Esa foto ya no está. Recarga la pantalla.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'retail-productos-fotos' and o.name = p_recorte) then
    raise exception 'recorte_archivo_no_existe' using hint = 'El recorte no llegó al almacén. Vuelve a intentarlo.';
  end if;

  -- El recorte es de ESTA foto: el nombre del archivo de la foto, sin su extensión, solo o con un sello (`rutaDelRecorte`).
  v_base := regexp_replace(regexp_replace(p_foto, '^.*/', ''), '\.[^.]+$', '');
  if p_recorte <> 'recortes/' || v_base || '.png'
     and left(p_recorte, length('recortes/' || v_base || '-')) <> 'recortes/' || v_base || '-' then
    raise exception 'recorte_datos_invalidos' using hint = 'Ese recorte no es de esta foto.';
  end if;

  -- Una foto que ya tiene recorte la cambia quien ve la Vitrina. El mismo archivo otra vez es un reintento (la respuesta de la primera
  -- vez no llegó): se devuelve lo que ya está.
  for v_fila in select * from retail.foto_recortes where foto = p_foto for update loop
    exit;
  end loop;
  if v_fila.foto is not null and not retail.fn_ve_modulo('vitrina_web') then
    if v_fila.recorte = p_recorte then
      return jsonb_build_object('foto', v_fila.foto, 'recorte', v_fila.recorte, 'proporcion', v_fila.proporcion, 'estado', v_fila.estado, 'motivo', v_fila.motivo);
    end if;
    raise exception 'recorte_sin_permiso'
      using errcode = '42501', hint = 'Esa foto ya tiene su recorte: lo cambia quien ve la Vitrina web.';
  end if;

  v_estado := case when p_motivo is null then 'listo' else 'por_revisar' end;
  v_proporcion := round(p_proporcion, 4);
  insert into retail.foto_recortes (foto, recorte, proporcion, estado, motivo, creado_por, actualizado_por)
  values (p_foto, p_recorte, v_proporcion, v_estado, p_motivo, v_actor, v_actor)
  on conflict (foto) do update
     set recorte = excluded.recorte,
         proporcion = excluded.proporcion,
         estado = excluded.estado,
         motivo = excluded.motivo,
         actualizado_en = now(),
         actualizado_por = v_actor;

  return jsonb_build_object('foto', p_foto, 'recorte', p_recorte, 'proporcion', v_proporcion, 'estado', v_estado, 'motivo', p_motivo);
end;
$fn$;
revoke all on function retail.registrar_recorte(text, text, numeric, text) from public, anon;
grant execute on function retail.registrar_recorte(text, text, numeric, text) to authenticated;

-- ---------- 2. Deshacer un descarte, solo si sigue descartado ----------
create or replace function retail.deshacer_descarte_recorte(p_foto text, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_fila retail.foto_recortes%rowtype;
  v_prenda text;
begin
  perform retail.fn_exigir_modulo('vitrina_web');
  v_actor := retail.fn_actor_persona_id(true);

  if p_foto is null or p_estado is null or p_estado not in ('listo', 'por_revisar') then
    raise exception 'recorte_datos_invalidos' using hint = 'Falta la foto o cómo estaba su recorte.';
  end if;
  for v_fila in select * from retail.foto_recortes where foto = p_foto for update loop
    exit;
  end loop;
  if v_fila.foto is null then
    raise exception 'recorte_no_existe' using hint = 'Esa foto todavía no tiene recorte. Recarga la pantalla.';
  end if;
  if v_fila.estado <> 'descartado' then
    raise exception 'recorte_ya_cambio' using hint = 'Alguien ya decidió ese recorte después: recarga para verlo.';
  end if;
  if p_estado = 'por_revisar' and v_fila.motivo is null then
    raise exception 'recorte_datos_invalidos' using hint = 'Ese recorte no dice por qué quedaba por revisar.';
  end if;

  v_prenda := (select p.referencia
                 from retail.producto_fotos pf
                 join retail.productos p on p.id = pf.producto_id
                where substring(split_part(pf.url, '?', 1) from '/storage/v1/object/public/retail-productos-fotos/(.+)$') = p_foto
                order by pf.created_at
                limit 1);
  update retail.foto_recortes
     set estado = p_estado, actualizado_en = now(), actualizado_por = v_actor
   where foto = p_foto;
  perform retail.fn_vitrina_recorte_anotar(
    'vitrina_recorte_descarte_deshecho',
    'deshizo el descarte del recorte de una foto de «' || coalesce(v_prenda, 'una prenda') || '»',
    v_actor, p_foto, jsonb_build_object('foto', p_foto, 'antes', 'descartado', 'ahora', p_estado, 'motivo', v_fila.motivo));

  return jsonb_build_object('foto', p_foto, 'recorte', v_fila.recorte, 'proporcion', v_fila.proporcion, 'estado', p_estado, 'motivo', v_fila.motivo);
end;
$fn$;
revoke all on function retail.deshacer_descarte_recorte(text, text) from public, anon;
grant execute on function retail.deshacer_descarte_recorte(text, text) to authenticated;
comment on function retail.deshacer_descarte_recorte(text, text) is
  'Vitrina ▸ Probador (ADR-0434, /chaos 2026-10-17): el «Deshacer» de un recorte descartado. Lo devuelve a listo o por_revisar solo si sigue descartado (si no, recorte_ya_cambio) y lo anota en la Actividad. Es de la Vitrina web y firma el responsable.';

-- ---------- 3. Validación final: si algo no quedó, se deshace todo ----------
do $$
begin
  if to_regprocedure('retail.deshacer_descarte_recorte(text, text)') is null then
    raise exception 'recortes: falta deshacer_descarte_recorte';
  end if;
  if has_function_privilege('anon', 'retail.deshacer_descarte_recorte(text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'retail.registrar_recorte(text, text, numeric, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'retail.deshacer_descarte_recorte(text, text)', 'EXECUTE') then
    raise exception 'recortes: los permisos de sus funciones no quedaron como deben';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'registrar_recorte') <> 1 then
    raise exception 'recortes: registrar_recorte quedó con dos firmas';
  end if;
end $$;

reset lock_timeout;

-- Comprobación después de pegarla (lectura):
--   select f || ' = ' || md5(pg_get_functiondef(f::regprocedure))
--     from unnest(array['retail.registrar_recorte(text,text,numeric,text)', 'retail.deshacer_descarte_recorte(text,text)']) f;
--   -- Las huellas esperadas van en la descripción del PR #1164 (se calculan en un banco con la migración).
