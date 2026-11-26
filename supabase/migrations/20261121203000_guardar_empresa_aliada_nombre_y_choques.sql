-- ============================================================================
-- 20261121203000 — Guardar una empresa aliada: el nombre invisible y el choque de dos altas a la vez (ADR-0683)
--
-- EL PROBLEMA. /chaos sobre `guardar_empresa_aliada` (20261121152000) encontró dos cosas:
--   · Gravedad 2 (dato malo en silencio): un nombre hecho solo de caracteres de ancho cero se guardaba, porque `btrim` solo quita espacios.
--     La aliada quedaba sin nombre a la vista en Configuración, en Vender y en el Diario.
--   · Gravedad 4 (error feo pero seguro): si dos aliadas con el mismo nombre se creaban a la vez, las dos generaban la misma `clave` y la
--     segunda fallaba con «Ya hay una empresa con ese RUC» (hint 'ruc'): el manejador de `unique_violation` atrapaba cualquier choque.
--
-- LO QUE HACE. La misma función de 20261121152000 (igual en producción: misma huella md5 de `pg_get_functiondef`), con tres cambios:
--   1. El nombre exige al menos una letra o un número (también con tilde o ñ).
--   2. Un `pg_advisory_xact_lock` al empezar: un guardado de aliadas a la vez. Lo hace solo el Admin y es raro, así que esperar no cuesta.
--   3. El mensaje del choque según la restricción: RUC → «ya hay una con ese RUC»; clave → «vuelve a guardar»; otra → se relanza tal cual.
--
-- CÓMO SE VIGILA. `pnpm pruebas:empresas-aliadas` (casos «nombre invisible» y «dos altas a la vez», este con dos sesiones en paralelo).
-- CÓMO SE PEGA. Una sola parte, idempotente (`create or replace`), sin políticas ni `alter`. Va DESPUÉS de 20261121152000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.guardar_empresa_aliada(uuid, text, text, text, text, text, text, uuid[], jsonb)') is null then
    raise exception 'Falta guardar_empresa_aliada: pega antes 20261121152000. No se aplicó nada.';
  end if;
end
$$;

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
  v_restriccion text;
begin
  if not retail.fn_es_admin() then
    raise exception 'Solo el Admin registra o edita una empresa aliada.' using errcode = '42501';
  end if;
  if v_id = v_casa then
    raise exception 'CAYLA se edita en sus datos de empresa, no como aliada.' using errcode = 'P0001';
  end if;
  -- Un guardado de aliadas a la vez (20261121203000): dos altas simultáneas generaban la misma clave, o pasaban juntas la revisión del RUC.
  -- La segunda espera a que la primera termine y, como cada sentencia de abajo mira la base de nuevo, ya ve lo que la otra guardó.
  perform pg_advisory_xact_lock(hashtext('retail.guardar_empresa_aliada'));
  -- Al menos una letra o un número (20261121203000): btrim solo quita espacios, y un nombre de puros caracteres invisibles se guardaba.
  if v_nombre !~ '[[:alnum:]À-ÖØ-öø-ÿ]' or char_length(v_nombre) > 40 then
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
    -- El mensaje según la restricción que chocó (20261121203000): antes todo choque se decía «RUC», también el de la clave o el de una cuenta.
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'empresas_ruc_unico' then
      raise exception 'Ya hay una empresa con ese RUC.' using errcode = 'P0001', hint = 'ruc';
    elsif v_restriccion = 'empresas_clave_key' then
      raise exception 'Otra empresa se guardó al mismo tiempo: vuelve a guardar.' using errcode = 'P0001', hint = 'nombre';
    end if;
    raise;
end
$$;

revoke all on function retail.guardar_empresa_aliada(uuid, text, text, text, text, text, text, uuid[], jsonb) from public, anon;
grant execute on function retail.guardar_empresa_aliada(uuid, text, text, text, text, text, text, uuid[], jsonb) to authenticated;

select 'QUEDÓ BIEN' as resultado;
