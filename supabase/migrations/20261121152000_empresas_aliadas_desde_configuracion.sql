-- ============================================================================
-- 20261121152000 — Crear y editar una empresa aliada desde Configuración (ADR-0683, actividad 1)
--
-- EL PROBLEMA PRIMERO. Una empresa que no es CAYLA pero vende en sus tiendas (hoy CLAURE en Lima) solo podía nacer con una migración: el
-- Admin no tenía dónde registrarla, ni su RUC, ni a qué tiendas va, ni a qué números se le paga por Yape. Felipe (2026-11-21): «cuando
-- pase deba yo poder crearla y no me dé problemas cuando haga ventas».
--
-- QUÉ PROMETE.
--   · `empresas` guarda la identidad de una aliada: RUC (válido por el módulo 11 de SUNAT y único), razón social, régimen, correo y teléfono.
--   · `guardar_empresa_aliada` (solo el Admin) la crea o la edita en UNA transacción: sus datos, sus tiendas (`empresa_sedes`) y sus cuentas para
--     cobrar (`cuentas_dinero` de su empresa: banco 104, saldo 0, como el Yape de Claudia, ADR-0638). Todo queda o nada queda.
--   · `fn_empresas_aliadas()` las lee para Configuración, con sus tiendas y sus cuentas vigentes.
--
-- ESTADOS IMPOSIBLES QUE CIERRA.
--   · Dos aliadas con el mismo RUC, o una con el RUC de CAYLA: índice único + comprobación contra `configuracion_empresa`.
--   · Un RUC mal escrito: `fn_ruc_valido` (el mismo módulo 11 de `packages/shared/src/documento.ts`).
--   · Un Nuevo RUS en más de una tienda: el régimen opera en un solo establecimiento (confirmar con el contador; relajarlo es una línea).
--   · Una tienda que, al sumar una aliada, deja de tener a CAYLA: `fn_empresas_de_sede` solo pone a la casa en una sede SIN filas; al sumar la
--     primera aliada se agrega también la fila de la casa.
--   · Sacar a una aliada de una tienda donde todavía tiene prendas: se rechaza (su stock quedaría sin sede).
--   · Editar o crear a CAYLA desde aquí: la casa vive en `configuracion_empresa` y se lee aparte.
--
-- QUÉ NO PROMETE. Que una aliada nueva ya venda bien: el Diario, su cuenta, el cobro partido y las cifras de CAYLA siguen escritos para CLAURE
-- hasta las actividades 2 a 7 de ADR-0683. Por eso esta migración no se pega sola en producción: va con las de esas actividades.
--
-- DECIDÍ una sola función que guarda todo (datos, tiendas y cuentas). DESCARTÉ dos llamadas (como proveedor + cuentas, ADR-0134): si la
-- segunda falla, la aliada queda a medias en una tienda sin dónde cobrarle.
-- DECIDÍ `cuentas_dinero.medio_ajeno` (yape | plin | transferencia) para saber con qué cobra cada cuenta de una aliada. Nulo en las de CAYLA y en
-- el Yape de Claudia de antes (se lee como Yape).
-- SE ROMPE SI dos Admin editan la misma aliada a la vez: la fila se toma con `for update` y gana la segunda, completa; nunca una mezcla.
--
-- CÓMO VERIFICAR. pnpm pruebas:empresas-aliadas
-- CÓMO SE PEGA. Una sola parte (sin políticas). Se puede pegar dos veces.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La identidad de una aliada ----------
alter table retail.empresas add column if not exists ruc text;
alter table retail.empresas add column if not exists razon_social text;
alter table retail.empresas add column if not exists regimen text;
alter table retail.empresas add column if not exists correo text;
alter table retail.empresas add column if not exists telefono text;

do $restricciones$
begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_ruc_forma') then
    alter table retail.empresas add constraint empresas_ruc_forma check (ruc is null or ruc ~ '^(10|15|17|20)[0-9]{9}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'empresas_regimen_valido') then
    alter table retail.empresas add constraint empresas_regimen_valido check (regimen is null or regimen in ('nuevo_rus', 'rer', 'mype', 'general'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'empresas_textos_cortos') then
    alter table retail.empresas add constraint empresas_textos_cortos check (
      char_length(nombre) <= 40 and (razon_social is null or char_length(razon_social) <= 120)
      and (correo is null or char_length(correo) <= 120) and (telefono is null or char_length(telefono) <= 20));
  end if;
end
$restricciones$;

create unique index if not exists empresas_ruc_unico on retail.empresas (ruc) where ruc is not null;

-- La baja (Felipe 2026-11-21: «borrar con doble confirmación y un plazo de una semana»). Se pide hoy y se aplica en 7 días; mientras tanto se deshace.
alter table retail.empresas add column if not exists baja_pedida_en timestamptz;
alter table retail.empresas add column if not exists baja_pedida_por uuid;
alter table retail.empresas add column if not exists baja_el date;
alter table retail.empresas add column if not exists baja_detenida text;
do $baja$
begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_baja_completa') then
    alter table retail.empresas add constraint empresas_baja_completa check ((baja_pedida_en is null) = (baja_el is null));
  end if;
end
$baja$;
comment on column retail.empresas.baja_el is 'ADR-0683: el día en que se aplica la baja pedida (7 días después de pedirla). Nulo: sin baja pendiente.';

comment on column retail.empresas.ruc is 'ADR-0683: el RUC de una empresa aliada (11 dígitos, módulo 11). El de CAYLA vive en configuracion_empresa.';
comment on column retail.empresas.regimen is 'ADR-0683: nuevo_rus (solo boleta, un local) | rer | mype | general.';

-- ---------- 2. Con qué cobra cada cuenta de una aliada ----------
alter table retail.cuentas_dinero add column if not exists medio_ajeno text;
do $medio$
begin
  if not exists (select 1 from pg_constraint where conname = 'cuentas_dinero_medio_ajeno_valido') then
    alter table retail.cuentas_dinero add constraint cuentas_dinero_medio_ajeno_valido check (medio_ajeno is null or medio_ajeno in ('yape', 'plin', 'transferencia'));
  end if;
end
$medio$;
comment on column retail.cuentas_dinero.medio_ajeno is 'ADR-0683: en una cuenta de una empresa aliada, con qué le pagan ahí (yape | plin | transferencia). Nulo en las de CAYLA; nulo en una aliada se lee como Yape (el de Claudia, ADR-0638).';

-- ---------- 3. ¿Es un RUC de verdad? ----------
-- El módulo 11 de SUNAT, igual que `validarDocumento` (packages/shared/src/documento.ts): pesos 5 4 3 2 7 6 5 4 3 2 sobre los 10 primeros.
create or replace function retail.fn_ruc_valido(p_ruc text)
returns boolean
language sql
immutable
set search_path = retail, public, extensions
as $$
  select coalesce(p_ruc ~ '^(10|15|17|20)[0-9]{9}$', false)
     and (11 - (
           (substr(p_ruc, 1, 1)::int * 5 + substr(p_ruc, 2, 1)::int * 4 + substr(p_ruc, 3, 1)::int * 3 + substr(p_ruc, 4, 1)::int * 2
          + substr(p_ruc, 5, 1)::int * 7 + substr(p_ruc, 6, 1)::int * 6 + substr(p_ruc, 7, 1)::int * 5 + substr(p_ruc, 8, 1)::int * 4
          + substr(p_ruc, 9, 1)::int * 3 + substr(p_ruc, 10, 1)::int * 2) % 11)) % 10 = substr(p_ruc, 11, 1)::int
$$;

-- ---------- 4. Guardar una aliada: datos, tiendas y cuentas, todo o nada ----------
-- p_cuentas: [{ "id": uuid|null, "medio": "yape"|"plin"|"transferencia", "banco": text|null, "numero": text, "quitar": bool }]
create or replace function retail.guardar_empresa_aliada(
  p_id uuid,
  p_nombre text,
  p_ruc text,
  p_razon_social text,
  p_regimen text,
  p_correo text,
  p_telefono text,
  p_sedes uuid[],
  p_cuentas jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_casa uuid := retail.fn_empresa_casa_id();
  v_actor uuid := retail.fn_actor_persona_id(true);
  v_id uuid := p_id;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_ruc text := regexp_replace(coalesce(p_ruc, ''), '\D', '', 'g');
  v_correo text := nullif(btrim(coalesce(p_correo, '')), '');
  v_telefono text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_sedes uuid[] := coalesce((select array_agg(distinct s) from unnest(p_sedes) s where s is not null), '{}');
  v_antes uuid[] := '{}';
  v_clave text;
  v_base text;
  v_n int := 1;
  v_sede uuid;
  v_c jsonb;
  v_medio text;
  v_banco text;
  v_numero text;
  v_cuenta uuid;
  v_nombre_cuenta text;
  v_reactiva uuid;
begin
  if not retail.fn_es_admin() then
    raise exception 'Solo el Admin registra o edita una empresa aliada.' using errcode = '42501';
  end if;
  if v_id = v_casa then
    raise exception 'CAYLA se edita en sus datos de empresa, no como aliada.' using errcode = 'P0001';
  end if;
  if v_nombre = '' or char_length(v_nombre) > 40 then
    raise exception 'Escribe el nombre de la empresa (hasta 40 letras).' using errcode = 'P0001', hint = 'nombre';
  end if;
  if not retail.fn_ruc_valido(v_ruc) then
    raise exception 'Ese RUC no es válido: revisa los 11 dígitos.' using errcode = 'P0001', hint = 'ruc';
  end if;
  if v_ruc = (select regexp_replace(coalesce(ce.ruc, ''), '\D', '', 'g') from retail.configuracion_empresa ce limit 1) then
    raise exception 'Ese es el RUC de CAYLA.' using errcode = 'P0001', hint = 'ruc';
  end if;
  -- Registrar de nuevo el RUC de una aliada que se dio de baja la trae de vuelta, con su historia: no nace otra con el mismo RUC.
  if v_id is null then
    select e.id into v_reactiva from retail.empresas e where e.ruc = v_ruc and not e.activo;
    v_id := v_reactiva;
  end if;
  if exists (select 1 from retail.empresas e where e.ruc = v_ruc and e.id is distinct from v_id) then
    raise exception 'Ya hay una empresa con ese RUC: «%».', (select e.nombre from retail.empresas e where e.ruc = v_ruc) using errcode = 'P0001', hint = 'ruc';
  end if;
  if p_regimen is null or p_regimen not in ('nuevo_rus', 'rer', 'mype', 'general') then
    raise exception 'Elige el régimen de la empresa.' using errcode = 'P0001', hint = 'regimen';
  end if;
  if v_correo is not null and (char_length(v_correo) > 120 or v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Ese correo no se ve bien escrito.' using errcode = 'P0001', hint = 'correo';
  end if;
  if v_telefono is not null and v_telefono !~ '^\+?[0-9 ]{6,20}$' then
    raise exception 'Ese teléfono no se ve bien escrito.' using errcode = 'P0001', hint = 'telefono';
  end if;
  if cardinality(v_sedes) = 0 then
    raise exception 'Elige al menos una tienda donde vende.' using errcode = 'P0001', hint = 'sedes';
  end if;
  if p_regimen = 'nuevo_rus' and cardinality(v_sedes) > 1 then
    raise exception 'Un Nuevo RUS vende en un solo local: elige una tienda.' using errcode = 'P0001', hint = 'sedes';
  end if;
  if exists (select 1 from unnest(v_sedes) s where not exists (select 1 from retail.ubicaciones u where u.id = s and u.activo and u.tipo = 'tienda')) then
    raise exception 'Una de esas tiendas no existe o no vende.' using errcode = 'P0001', hint = 'sedes';
  end if;
  if jsonb_typeof(coalesce(p_cuentas, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_cuentas, '[]'::jsonb)) > 10 then
    raise exception 'Se guardan hasta 10 cuentas por empresa.' using errcode = 'P0001', hint = 'cuentas';
  end if;

  if v_id is null then
    -- La clave es para el código (etiquetas, colores); la ve nadie. Sale del nombre y nunca choca con «cayla» ni «claure».
    v_base := left(trim(both '_' from regexp_replace(translate(lower(v_nombre), 'áéíóúàèìòùäëïöüñç', 'aeiouaeiouaeiounc'), '[^a-z0-9]+', '_', 'g')), 30);
    if v_base = '' then v_base := 'aliada'; end if;
    v_clave := v_base;
    while exists (select 1 from retail.empresas e where e.clave = v_clave) or v_clave in ('cayla', 'claure') loop
      v_n := v_n + 1;
      v_clave := v_base || '_' || v_n;
    end loop;
    insert into retail.empresas (id, clave, nombre, orden, activo, ruc, razon_social, regimen, correo, telefono, cuenta_corriente_desde)
    values (gen_random_uuid(), v_clave, v_nombre, coalesce((select max(e.orden) from retail.empresas e), 0) + 10, true,
            v_ruc, nullif(btrim(coalesce(p_razon_social, '')), ''), p_regimen, v_correo, v_telefono, retail.fn_hoy_lima())
    returning id into v_id;
  else
    perform 1 from retail.empresas e where e.id = v_id for update;
    if not found then
      raise exception 'Esa empresa ya no existe. Recarga la pantalla.' using errcode = 'P0001';
    end if;
    select coalesce(array_agg(es.ubicacion_id), '{}') into v_antes from retail.empresa_sedes es where es.empresa_id = v_id;
    update retail.empresas
       set nombre = v_nombre, ruc = v_ruc, razon_social = nullif(btrim(coalesce(p_razon_social, '')), ''), regimen = p_regimen,
           correo = v_correo, telefono = v_telefono
     where id = v_id;
    if v_reactiva is not null then
      update retail.empresas set activo = true, baja_pedida_en = null, baja_pedida_por = null, baja_el = null, baja_detenida = null where id = v_id;
    end if;
  end if;

  -- Las tiendas que deja: solo si ahí ya no tiene prendas (su stock quedaría sin sede).
  foreach v_sede in array v_antes loop
    if not (v_sede = any (v_sedes)) then
      if exists (select 1 from retail.stock_dueno sd where sd.empresa_id = v_id and sd.ubicacion_id = v_sede and (sd.cantidad <> 0 or sd.cantidad_apartada <> 0)) then
        raise exception 'En «%» todavía hay prendas suyas: sácalas o véndelas antes de quitarle esa tienda.', (select u.nombre from retail.ubicaciones u where u.id = v_sede)
          using errcode = 'P0001', hint = 'sedes';
      end if;
      -- Con historia ahí (vendió, recibió o contó), la tienda se queda: el Diario reconoce lo suyo por las tiendas donde opera (ADR-0683, actividad 2).
      if exists (select 1 from retail.movimientos m where m.empresa_id = v_id and m.ubicacion_id = v_sede) then
        raise exception 'En «%» ya tiene historia: no se le quita esa tienda. Si ya no vende, dale de baja.', (select u.nombre from retail.ubicaciones u where u.id = v_sede)
          using errcode = 'P0001', hint = 'sedes';
      end if;
      delete from retail.empresa_sedes es where es.empresa_id = v_id and es.ubicacion_id = v_sede;
    end if;
  end loop;
  -- Las que suma. Si la tienda no tenía filas, la casa estaba ahí «por defecto»: se escribe para que siga estándolo.
  foreach v_sede in array v_sedes loop
    if not exists (select 1 from retail.empresa_sedes es where es.ubicacion_id = v_sede) then
      insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (v_casa, v_sede);
    end if;
    if not exists (select 1 from retail.empresa_sedes es where es.empresa_id = v_id and es.ubicacion_id = v_sede) then
      insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (v_id, v_sede);
    end if;
  end loop;

  -- Las cuentas: una de su empresa por cada número, banco 104 con saldo cero (ADR-0638). Quitar es archivar: puede tener cobros.
  for v_c in select x from jsonb_array_elements(coalesce(p_cuentas, '[]'::jsonb)) x loop
    v_cuenta := nullif(v_c->>'id', '')::uuid;
    if v_cuenta is not null and not exists (select 1 from retail.cuentas_dinero c where c.id = v_cuenta and c.empresa_id = v_id) then
      raise exception 'Una de esas cuentas no es de esta empresa. Recarga la pantalla.' using errcode = 'P0001', hint = 'cuentas';
    end if;
    if coalesce((v_c->>'quitar')::boolean, false) then
      if v_cuenta is not null then
        update retail.cuentas_dinero set archivada_en = now(), archivada_por = v_actor where id = v_cuenta and archivada_en is null;
      end if;
      continue;
    end if;
    v_medio := v_c->>'medio';
    v_banco := nullif(btrim(coalesce(v_c->>'banco', '')), '');
    v_numero := btrim(coalesce(v_c->>'numero', ''));
    if v_medio is null or v_medio not in ('yape', 'plin', 'transferencia') then
      raise exception 'Elige si cada cuenta es Yape, Plin o cuenta bancaria.' using errcode = 'P0001', hint = 'cuentas';
    end if;
    if v_medio in ('yape', 'plin') then
      v_numero := regexp_replace(v_numero, '\D', '', 'g');
      if v_numero !~ '^9[0-9]{8}$' then
        raise exception 'El celular del % tiene 9 dígitos y empieza con 9.', initcap(v_medio) using errcode = 'P0001', hint = 'cuentas';
      end if;
      v_banco := null;
      v_nombre_cuenta := initcap(v_medio) || ' de ' || v_nombre;
    else
      if v_banco is null or char_length(v_banco) > 30 then
        raise exception 'Escribe el banco de la cuenta.' using errcode = 'P0001', hint = 'cuentas';
      end if;
      if v_numero !~ '^[0-9][0-9 -]{4,38}[0-9]$' then
        raise exception 'El número de cuenta o CCI se ve mal escrito.' using errcode = 'P0001', hint = 'cuentas';
      end if;
      v_nombre_cuenta := v_banco || ' de ' || v_nombre;
    end if;
    v_nombre_cuenta := left(v_nombre_cuenta, 80);
    if v_cuenta is null then
      insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, empresa_id, saldo_inicial, saldo_desde, orden, numero, medio_ajeno, creada_por)
      values (v_nombre_cuenta, 'banco', '104', v_id, 0, null, 900, v_numero, v_medio, v_actor);
    else
      update retail.cuentas_dinero set nombre = v_nombre_cuenta, numero = v_numero, medio_ajeno = v_medio where id = v_cuenta;
    end if;
  end loop;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya hay una empresa con ese RUC.' using errcode = 'P0001', hint = 'ruc';
end
$$;

revoke all on function retail.guardar_empresa_aliada(uuid, text, text, text, text, text, text, uuid[], jsonb) from public, anon;
grant execute on function retail.guardar_empresa_aliada(uuid, text, text, text, text, text, text, uuid[], jsonb) to authenticated;

-- ---------- 5. Leerlas para Configuración ----------
create or replace function retail.fn_empresas_aliadas()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not (retail.fn_es_lider() or retail.fn_ve_modulo('configuracion')) then
    raise exception 'Ver las empresas aliadas necesita el módulo Configuración.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'puede_editar', retail.fn_es_admin(),
    'aliadas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'clave', e.clave, 'nombre', e.nombre, 'ruc', e.ruc, 'razon_social', e.razon_social, 'regimen', e.regimen,
               'correo', e.correo, 'telefono', e.telefono, 'activo', e.activo, 'baja_el', e.baja_el, 'baja_detenida', e.baja_detenida,
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
revoke all on function retail.fn_ruc_valido(text) from public, anon;

-- ---------- 6. Dar de baja: se pide, se puede deshacer 7 días, y se aplica sola ----------
-- ¿Tiene prendas suyas en alguna tienda? Mientras tenga, no se da de baja: su stock quedaría de una empresa que ya no vende.
create or replace function retail.fn_aliada_tiene_prendas(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select exists (select 1 from retail.stock_dueno sd where sd.empresa_id = p_empresa_id and (sd.cantidad <> 0 or sd.cantidad_apartada <> 0))
$$;
revoke all on function retail.fn_aliada_tiene_prendas(uuid) from public, anon, authenticated;

-- La doble confirmación: la persona ya tocó «Dar de baja» en la hoja y aquí escribe el nombre de la empresa.
create or replace function retail.programar_baja_empresa_aliada(p_id uuid, p_confirmacion text)
returns date
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_e retail.empresas%rowtype;
  v_el date := retail.fn_hoy_lima() + 7;
begin
  if not retail.fn_es_admin() then
    raise exception 'Solo el Admin da de baja una empresa aliada.' using errcode = '42501';
  end if;
  select * into v_e from retail.empresas e where e.id = p_id for update;
  if not found or not v_e.activo or p_id = retail.fn_empresa_casa_id() then
    raise exception 'Esa empresa ya no está activa. Recarga la pantalla.' using errcode = 'P0001';
  end if;
  if v_e.baja_el is not null then
    raise exception '«%» ya tiene la baja pedida para el %.', v_e.nombre, to_char(v_e.baja_el, 'DD/MM') using errcode = 'P0001';
  end if;
  if lower(btrim(coalesce(p_confirmacion, ''))) <> lower(btrim(v_e.nombre)) then
    raise exception 'Escribe «%» tal cual para confirmar.', v_e.nombre using errcode = 'P0001', hint = 'confirmacion';
  end if;
  if retail.fn_aliada_tiene_prendas(p_id) then
    raise exception '«%» todavía tiene prendas en una tienda: sácalas o véndelas antes de darla de baja.', v_e.nombre using errcode = 'P0001', hint = 'prendas';
  end if;
  update retail.empresas
     set baja_pedida_en = now(), baja_pedida_por = retail.fn_actor_persona_id(true), baja_el = v_el, baja_detenida = null
   where id = p_id;
  return v_el;
end
$$;
revoke all on function retail.programar_baja_empresa_aliada(uuid, text) from public, anon;
grant execute on function retail.programar_baja_empresa_aliada(uuid, text) to authenticated;

create or replace function retail.deshacer_baja_empresa_aliada(p_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_es_admin() then
    raise exception 'Solo el Admin deshace la baja de una empresa aliada.' using errcode = '42501';
  end if;
  update retail.empresas set baja_pedida_en = null, baja_pedida_por = null, baja_el = null, baja_detenida = null
   where id = p_id and activo and baja_el is not null;
  if not found then
    raise exception 'Esa baja ya se aplicó o ya no estaba pedida. Recarga la pantalla.' using errcode = 'P0001';
  end if;
end
$$;
revoke all on function retail.deshacer_baja_empresa_aliada(uuid) from public, anon;
grant execute on function retail.deshacer_baja_empresa_aliada(uuid) to authenticated;

-- Aplica las bajas que ya cumplieron su semana (el trabajo diario de Vercel, `/api/empresas/bajas`). Correrla dos veces es inofensivo.
--   · Si todavía tiene prendas: no se aplica, y queda dicho por qué (`baja_detenida`), para que el Admin lo vea en su tarjeta.
--   · Si nunca tuvo historia (ni prendas ni movimientos) y nada la apunta: se borra de verdad, con sus tiendas y sus cuentas.
--   · Si tuvo historia: deja de estar activa (desaparece de las tiendas, de Nuevo producto y de los filtros) y sus cuentas se archivan.
--     Lo que vendió, sus movimientos y su cuenta pasada quedan tal cual: borrar eso dejaría el pasado apuntando a nada.
create or replace function retail.fn_aplicar_bajas_de_aliadas()
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_e record;
  v_borradas int := 0;
  v_de_baja int := 0;
  v_detenidas int := 0;
begin
  for v_e in
    select e.id, e.nombre from retail.empresas e
     where e.activo and e.baja_el is not null and e.baja_el <= retail.fn_hoy_lima() and e.id <> retail.fn_empresa_casa_id()
     for update
  loop
    if retail.fn_aliada_tiene_prendas(v_e.id) then
      update retail.empresas set baja_detenida = 'Todavía tiene prendas en una tienda.' where id = v_e.id;
      v_detenidas := v_detenidas + 1;
      continue;
    end if;
    if not exists (select 1 from retail.productos p where p.empresa_id = v_e.id)
       and not exists (select 1 from retail.movimientos m where m.empresa_id = v_e.id) then
      begin
        perform set_config('retail.editando_cuenta', 'si', true);
        delete from retail.cuentas_dinero c where c.empresa_id = v_e.id;
        perform set_config('retail.editando_cuenta', '', true);
        delete from retail.stock_dueno sd where sd.empresa_id = v_e.id;
        delete from retail.empresa_sedes es where es.empresa_id = v_e.id;
        delete from retail.empresas e where e.id = v_e.id;
        v_borradas := v_borradas + 1;
        continue;
      exception when foreign_key_violation then
        -- Una de sus cuentas ya recibió un cobro (o algo más la apunta): no se borra, se da de baja.
        perform set_config('retail.editando_cuenta', '', true);
      end;
    end if;
    update retail.cuentas_dinero set archivada_en = now() where empresa_id = v_e.id and archivada_en is null;
    update retail.empresas set activo = false, baja_detenida = null where id = v_e.id;
    v_de_baja := v_de_baja + 1;
  end loop;
  return jsonb_build_object('borradas', v_borradas, 'dadas_de_baja', v_de_baja, 'detenidas', v_detenidas);
end
$$;
revoke all on function retail.fn_aplicar_bajas_de_aliadas() from public, anon, authenticated;

select 'QUEDÓ BIEN' as resultado;
