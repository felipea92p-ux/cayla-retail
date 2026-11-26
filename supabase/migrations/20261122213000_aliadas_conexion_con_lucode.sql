-- ============================================================================
-- Empresas aliadas (ADR-0683) · conectar cada aliada con Lucode, su llave guardada en el Vault (Felipe 2026-11-22: «la recomendada»).
--
-- EL PROBLEMA. Para que una aliada emita boletas con SU RUC (fase 2, docs/investigacion/2026-11-21-empresas-aliadas-y-boleta-por-ruc.md), el
--   ERP necesita la llave de Lucode de ESA empresa. Hoy hay una sola (`LUCODE_TOKEN`, la de CAYLA, en Vercel). Con esa llave cualquiera emite
--   comprobantes legales a nombre de la empresa: no puede vivir en una columna que alguien pueda leer.
--
-- LO QUE HACE (solo guarda y prueba la conexión; NO cambia cómo se emite: hasta la fase 2 todo sigue saliendo como CAYLA, por consignación).
--   1. `empresas` gana: el domicilio fiscal (sale impreso en su boleta), el id del secreto en el Vault, los 4 últimos caracteres de la llave
--      (para reconocerla: «termina en …4F2A») y el estado de la última prueba (sin_probar · conectada · rechazada) con su hora.
--   2. `guardar_comprobantes_aliada`: el Admin guarda el domicilio y, si escribe una, la llave. La llave va CIFRADA al Vault
--      (`vault.create_secret` / `vault.update_secret`) y nunca vuelve: ninguna función la devuelve a la pantalla.
--   3. `fn_llave_lucode_aliada`: la única que la lee, y solo con la llave de servicio (el servidor, `POST /api/lucode/probar-aliada`).
--   4. `anotar_prueba_lucode_aliada`: el servidor anota lo que respondió Lucode. Tampoco la llama la pantalla.
--   5. `fn_empresas_aliadas` suma `domicilio_fiscal` y, solo para el Admin, `comprobantes` (cómo está la conexión, sin la llave).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: tal cual, de una vez. No crea políticas ni dispara `drop trigger`; el `alter` de `empresas` va con
--   `lock_timeout` de 3 s (si choca, no se aplica nada y se vuelve a pegar). Idempotente. Termina con «QUEDÓ BIEN».
-- SI EL VAULT NO RESPONDE: guardar la llave falla con su error y no se guarda nada a medias (todo en una transacción); lo demás del ERP sigue.
-- Lo vigila: scripts/pruebas/empresas_aliadas_lucode.mjs.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Columnas ----------
alter table retail.empresas add column if not exists domicilio_fiscal text;
alter table retail.empresas add column if not exists lucode_secreto_id uuid;
alter table retail.empresas add column if not exists lucode_termina text;
alter table retail.empresas add column if not exists lucode_estado text;
alter table retail.empresas add column if not exists lucode_probada_en timestamptz;

do $restricciones$
begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_domicilio_corto') then
    alter table retail.empresas add constraint empresas_domicilio_corto check (domicilio_fiscal is null or char_length(domicilio_fiscal) <= 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'empresas_lucode_estado_valido') then
    alter table retail.empresas add constraint empresas_lucode_estado_valido check (lucode_estado is null or lucode_estado in ('sin_probar', 'conectada', 'rechazada'));
  end if;
  -- Llave y estado van juntos: sin secreto no hay estado ni «termina en».
  if not exists (select 1 from pg_constraint where conname = 'empresas_lucode_completo') then
    alter table retail.empresas add constraint empresas_lucode_completo check (
      (lucode_secreto_id is null) = (lucode_estado is null) and (lucode_secreto_id is null) = (lucode_termina is null));
  end if;
end
$restricciones$;

comment on column retail.empresas.lucode_secreto_id is
  'ADR-0683: id del secreto en vault.secrets con la llave de Lucode de esta aliada. La llave nunca se guarda aquí ni vuelve a la pantalla; solo la lee fn_llave_lucode_aliada (service_role).';
comment on column retail.empresas.lucode_termina is 'ADR-0683: los 4 últimos caracteres de la llave, para reconocerla («termina en …4F2A»).';
comment on column retail.empresas.lucode_estado is 'ADR-0683: la última prueba de la llave contra Lucode: sin_probar | conectada | rechazada.';
comment on column retail.empresas.domicilio_fiscal is 'ADR-0683: el domicilio fiscal de la aliada (sale en su boleta, fase 2).';

-- ---------- 2. Guardar el domicilio y la llave (el Admin, desde la pantalla) ----------
create or replace function retail.guardar_comprobantes_aliada(p_id uuid, p_domicilio text, p_llave text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid := retail.fn_actor_persona_id(true);
  v_nombre text;
  v_secreto uuid;
  v_domicilio text := nullif(btrim(coalesce(p_domicilio, '')), '');
  v_llave text := nullif(btrim(coalesce(p_llave, '')), '');
  v_cambio_llave boolean := false;
begin
  if not retail.fn_es_admin() then
    raise exception 'Solo un Admin conecta una empresa aliada con Lucode.' using errcode = '42501';
  end if;
  -- En fila: dos Admin que guardan la misma aliada a la vez no crean dos secretos.
  select e.nombre, e.lucode_secreto_id into v_nombre, v_secreto
    from retail.empresas e where e.id = p_id and e.id <> retail.fn_empresa_casa_id() and e.activo for update;
  if v_nombre is null then
    raise exception 'Esa empresa aliada no existe o está dada de baja.' using errcode = 'P0001';
  end if;
  if v_domicilio is not null and char_length(v_domicilio) > 200 then
    raise exception 'El domicilio fiscal va hasta en 200 letras.' using errcode = 'P0001', hint = 'domicilio';
  end if;
  if v_llave is not null and (v_llave !~ '^\S+$' or char_length(v_llave) not between 20 and 500) then
    raise exception 'Esa no parece una llave de Lucode: cópiala entera, sin espacios.' using errcode = 'P0001', hint = 'llave';
  end if;

  if v_llave is not null then
    if v_secreto is not null and exists (select 1 from vault.secrets s where s.id = v_secreto) then
      perform vault.update_secret(v_secreto, v_llave);
    else
      v_secreto := vault.create_secret(v_llave, 'lucode_empresa_' || p_id::text, 'Llave de Lucode de la empresa aliada ' || v_nombre || ' (ADR-0683)');
    end if;
    v_cambio_llave := true;
  end if;

  update retail.empresas
     set domicilio_fiscal = v_domicilio,
         lucode_secreto_id = case when v_cambio_llave then v_secreto else lucode_secreto_id end,
         lucode_termina = case when v_cambio_llave then right(v_llave, 4) else lucode_termina end,
         lucode_estado = case when v_cambio_llave then 'sin_probar' else lucode_estado end,
         lucode_probada_en = case when v_cambio_llave then null else lucode_probada_en end
   where id = p_id;

  -- El historial dice QUE cambió la llave, nunca cuál es.
  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('aliada_comprobantes', jsonb_build_object('empresa_id', p_id, 'nombre', v_nombre, 'domicilio', v_domicilio, 'cambio_llave', v_cambio_llave), v_actor);

  return (select jsonb_build_object('termina', e.lucode_termina, 'estado', e.lucode_estado) from retail.empresas e where e.id = p_id);
end
$$;

revoke all on function retail.guardar_comprobantes_aliada(uuid, text, text) from public, anon;
grant execute on function retail.guardar_comprobantes_aliada(uuid, text, text) to authenticated;

-- ---------- 3. Leer la llave: solo el servidor ----------
create or replace function retail.fn_llave_lucode_aliada(p_id uuid)
returns text
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select d.decrypted_secret
    from retail.empresas e
    join vault.decrypted_secrets d on d.id = e.lucode_secreto_id
   where e.id = p_id and e.id <> retail.fn_empresa_casa_id() and e.activo;
$$;

revoke all on function retail.fn_llave_lucode_aliada(uuid) from public, anon, authenticated;
grant execute on function retail.fn_llave_lucode_aliada(uuid) to service_role;

-- ---------- 4. Anotar lo que respondió Lucode: solo el servidor ----------
create or replace function retail.anotar_prueba_lucode_aliada(p_id uuid, p_conectada boolean)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if p_conectada is null then
    raise exception 'Falta decir si Lucode aceptó la llave.' using errcode = 'P0001';
  end if;
  update retail.empresas
     set lucode_estado = case when p_conectada then 'conectada' else 'rechazada' end,
         lucode_probada_en = now()
   where id = p_id and lucode_secreto_id is not null;
end
$$;

revoke all on function retail.anotar_prueba_lucode_aliada(uuid, boolean) from public, anon, authenticated;
grant execute on function retail.anotar_prueba_lucode_aliada(uuid, boolean) to service_role;

-- ---------- 5. Leerlas para Configuración (copia de 20261121152000 + domicilio y, para el Admin, la conexión) ----------
create or replace function retail.fn_empresas_aliadas()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_admin boolean := retail.fn_es_admin();
begin
  if not (retail.fn_es_lider() or retail.fn_ve_modulo('configuracion')) then
    raise exception 'Ver las empresas aliadas necesita el módulo Configuración.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'puede_editar', v_admin,
    'aliadas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'clave', e.clave, 'nombre', e.nombre, 'ruc', e.ruc, 'razon_social', e.razon_social, 'regimen', e.regimen,
               'correo', e.correo, 'telefono', e.telefono, 'activo', e.activo, 'baja_el', e.baja_el, 'baja_detenida', e.baja_detenida,
               'entra_a_campanas', e.entra_a_campanas,
               'domicilio_fiscal', e.domicilio_fiscal,
               -- Solo el Admin ve cómo está la conexión; la llave nunca sale de aquí.
               'comprobantes', case when v_admin then jsonb_build_object(
                                 'termina', e.lucode_termina, 'estado', e.lucode_estado, 'probada_en', e.lucode_probada_en) end,
               'sedes', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre) order by u.nombre)
                                    from retail.empresa_sedes es join retail.ubicaciones u on u.id = es.ubicacion_id
                                   where es.empresa_id = e.id), '[]'::jsonb),
               'cuentas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'medio', coalesce(c.medio_ajeno, 'yape'), 'nombre', c.nombre, 'numero', c.numero,
                                                                        'banco', case when c.medio_ajeno = 'transferencia' then split_part(c.nombre, ' de ', 1) end)
                                                     order by c.created_at)
                                      from retail.cuentas_dinero c where c.empresa_id = e.id and c.archivada_en is null), '[]'::jsonb))
             order by e.orden, e.nombre)
        from retail.empresas e
       where e.id <> retail.fn_empresa_casa_id() and e.activo), '[]'::jsonb));
end
$$;

revoke all on function retail.fn_empresas_aliadas() from public, anon;
grant execute on function retail.fn_empresas_aliadas() to authenticated;

select 'QUEDÓ BIEN' as resultado;
