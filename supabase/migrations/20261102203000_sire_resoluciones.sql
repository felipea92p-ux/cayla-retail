-- ============================================================================
-- 20261102203000_sire_resoluciones.sql — CAYLA V2 (ADR-0601, actividad 2 · 2026-11-02)
--
-- EL PROBLEMA PRIMERO.
--   «Comparar con SUNAT» (actividad 1) dice qué no cuadra entre la propuesta del SIRE y el ERP. Pero una diferencia no siempre es un error
--   que se arregla registrando algo: una factura de CLAURE sale con el RUC de CAYLA y no va al ERP de CAYLA (ADR-0560); una factura que
--   llegó tarde se anota en otro mes; una que nadie reconoce se le avisa al contador. Sin dónde decirlo, esas líneas quedan «por mirar»
--   para siempre y la lista deja de servir: nadie distingue lo nuevo de lo ya visto.
--
-- QUÉ HACE.
--   · `sire_resoluciones`: lo que alguien decidió sobre UNA diferencia de un mes (por la llave del comprobante: tipo|serie|número|RUC),
--     con quién y cuándo. Deshacer no borra: marca la resolución como deshecha, y la línea vuelve a la lista.
--   · `resolver_diferencia_sire` y `deshacer_resolucion_sire`. `fn_sire_propuesta` devuelve además las resoluciones vigentes del mes.
--   Resolver NO cambia la propuesta ni el ERP: solo dice «ya se vio, y esto es lo que pasa». Lo que se corrige de verdad (registrar el
--   gasto, anular un duplicado) se hace en su pantalla, y el cruce lo ve solo.
--
-- CONTRATO
--   PROMETE: una sola resolución vigente por comprobante y mes (índice único parcial: dos personas resolviendo a la vez, una gana y la
--            otra recibe `ya_resuelta`). Nada se borra. La resolución vive por la llave, no por la línea: sobrevive a subir otra versión.
--   ASUME:   `fn_puede_ver_impuestos()` y `fn_actor_persona_id(true)` como en producción; `fn_sire_propuesta` es de 20261102202000.
--   NO HACE: no valida que la llave esté en la propuesta (una resolución de un comprobante que ya no aparece se ignora en la web).
--
-- DECIDÍ: decisiones cerradas (cinco) y no un texto libre: el aviso de Impuestos y el cierre (actividad 4) las cuentan, y «Nadie la
--   reconoce» pide hablar con el contador. La nota sí es libre.
-- DESCARTÉ: guardar el estado en `sire_lineas`. Una propuesta nueva del mismo mes perdería lo decidido y habría que volver a resolver todo.
-- SE ROMPE SI: la llave cambia de forma en la web (`claveComprobante`, lib/sire-cruce-reglas.ts): las resoluciones viejas dejarían de
--   encontrar su línea. Está cubierto por su prueba.
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: una tabla nueva sin políticas (RLS encendido), dos
-- funciones nuevas y `fn_sire_propuesta` reescrita entera (es de 20261102202000, de esta misma rama). Sin `drop trigger`, sin políticas,
-- sin `select … into`. Va DESPUÉS de 20261102202000. Prueba: `pnpm pruebas:sire-propuestas`.
-- ============================================================================
set lock_timeout = '3s';

create table if not exists retail.sire_resoluciones (
  id uuid primary key default gen_random_uuid(),
  registro text not null check (registro in ('compras', 'ventas')),
  periodo date not null check (periodo = date_trunc('month', periodo)::date),
  -- La llave del comprobante como la arma la web: «01|F001|123|20100000001».
  clave text not null check (clave ~ '^[0-9A-Z]{2}\|[^|]{1,20}\|[0-9]{1,20}\|[0-9A-Z]{0,20}$'),
  decision text not null check (decision in ('es_de_claure', 'no_es_nuestra', 'otro_mes', 'pedida_al_proveedor', 'revisada')),
  nota text check (nota is null or length(nota) <= 300),
  resuelta_por uuid references public.personas (id),
  resuelta_at timestamptz not null default clock_timestamp(),
  deshecha_por uuid references public.personas (id),
  deshecha_at timestamptz
);
create unique index if not exists sire_resoluciones_una_vigente on retail.sire_resoluciones (registro, periodo, clave) where deshecha_at is null;
alter table retail.sire_resoluciones enable row level security;
comment on table retail.sire_resoluciones is 'Lo decidido sobre una diferencia entre la propuesta del SIRE y el ERP (ADR-0601). Deshacer marca deshecha_at; nunca se borra.';

create or replace function retail.resolver_diferencia_sire(p_registro text, p_mes date, p_clave text, p_decision text, p_nota text)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid;
begin
  if not coalesce(retail.fn_puede_ver_impuestos(), false) then
    raise exception 'Solo quien ve Impuestos resuelve las diferencias con SUNAT.' using errcode = '42501';
  end if;
  begin
    insert into retail.sire_resoluciones (registro, periodo, clave, decision, nota, resuelta_por)
    values (p_registro, date_trunc('month', p_mes)::date, p_clave, p_decision, nullif(left(btrim(coalesce(p_nota, '')), 300), ''),
            retail.fn_actor_persona_id(true))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'ya_resuelta' using errcode = 'P0001', hint = 'ya_resuelta', detail = 'Alguien ya resolvió este comprobante. Recarga la pantalla.';
  end;
  return v_id;
end;
$$;

create or replace function retail.deshacer_resolucion_sire(p_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if not coalesce(retail.fn_puede_ver_impuestos(), false) then
    raise exception 'Solo quien ve Impuestos deshace una resolución.' using errcode = '42501';
  end if;
  update retail.sire_resoluciones
     set deshecha_at = clock_timestamp(), deshecha_por = retail.fn_actor_persona_id(true)
   where id = p_id and deshecha_at is null;
  if not found then
    raise exception 'ya_deshecha' using errcode = 'P0001', hint = 'ya_deshecha', detail = 'Esa resolución ya se había deshecho. Recarga la pantalla.';
  end if;
end;
$$;

-- La propuesta vigente del mes, ahora con las resoluciones vigentes (las mismas llaves que arma la web).
create or replace function retail.fn_sire_propuesta(p_registro text, p_mes date)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_p retail.sire_propuestas%rowtype;
begin
  if not coalesce(retail.fn_puede_ver_impuestos(), false) then
    raise exception 'Solo quien ve Impuestos mira la propuesta del SIRE.' using errcode = '42501';
  end if;
  for v_p in
    select * from retail.sire_propuestas
     where registro = p_registro and periodo = date_trunc('month', p_mes)::date
     order by subida_at desc, id desc
  loop
    exit;
  end loop;
  if v_p.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_p.id,
    'registro', v_p.registro,
    'mes', to_char(v_p.periodo, 'YYYY-MM'),
    'origen', v_p.origen,
    'archivo', v_p.archivo,
    'subida_at', v_p.subida_at,
    'subida_por', (select nullif(trim(coalesce(pe.nombres, '') || ' ' || coalesce(split_part(pe.apellidos, ' ', 1), '')), '')
                     from public.personas pe where pe.id = v_p.subida_por),
    'versiones', (select count(*) from retail.sire_propuestas x where x.registro = v_p.registro and x.periodo = v_p.periodo),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'car', l.car, 'fecha', l.fecha, 'tipo', l.tipo, 'serie', l.serie, 'numero', l.numero, 'doc_tipo', l.doc_tipo,
               'doc_numero', l.doc_numero, 'nombre', l.nombre, 'base', l.base, 'igv', l.igv, 'total', l.total, 'moneda', l.moneda,
               'tipo_cambio', l.tipo_cambio, 'ref_tipo', l.ref_tipo, 'ref_serie', l.ref_serie, 'ref_numero', l.ref_numero) order by l.id)
        from retail.sire_lineas l where l.propuesta_id = v_p.id), '[]'::jsonb),
    'resoluciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'clave', r.clave, 'decision', r.decision, 'nota', r.nota, 'resuelta_at', r.resuelta_at,
               'resuelta_por', (select nullif(trim(coalesce(pe.nombres, '') || ' ' || coalesce(split_part(pe.apellidos, ' ', 1), '')), '')
                                  from public.personas pe where pe.id = r.resuelta_por)) order by r.resuelta_at)
        from retail.sire_resoluciones r
       where r.registro = v_p.registro and r.periodo = v_p.periodo and r.deshecha_at is null), '[]'::jsonb)
  );
end;
$$;

revoke all on function retail.resolver_diferencia_sire(text, date, text, text, text) from public, anon;
revoke all on function retail.deshacer_resolucion_sire(uuid) from public, anon;
grant execute on function retail.resolver_diferencia_sire(text, date, text, text, text) to authenticated;
grant execute on function retail.deshacer_resolucion_sire(uuid) to authenticated;
