-- ============================================================================
-- 20261102204000_sire_propuesta_api.sql — CAYLA V2 (ADR-0601, actividad 5 · 2026-11-02)
--
-- EL PROBLEMA PRIMERO.
--   Con las actividades 1 a 4, alguien tiene que entrar al portal SIRE, bajar la propuesta y subirla al ERP cada mes. Es un paso de dos
--   minutos que se olvida, y sin él no hay comparación. SUNAT publica una API para descargar la propuesta (manuales API SIRE Ventas v31 y
--   Compras v28): un proceso del servidor puede traerla sola cada mañana del día 2 al 10 (`/api/sire/propuesta`).
--
-- QUÉ HACE.
--   · `guardar_propuesta_sire_api`: lo mismo que `guardar_propuesta_sire`, para el proceso del servidor. No hay persona que firme: queda
--     `origen = 'api'` y `subida_por` vacío. Si lo que trae SUNAT es igual a la propuesta vigente del mes, NO crea otra versión (el proceso
--     corre todos los días del 2 al 10 y llenaría el historial de copias iguales): devuelve null.
--   Solo la puede llamar la llave de servicio (`service_role`): ni `anon`, ni `authenticated`, ni la tienda online.
--
-- CONTRATO
--   PROMETE: lo mismo que la subida a mano (todo o nada, nunca borra, la vigente es la última) y nunca una versión repetida.
--   ASUME:   las tablas de 20261102202000.
--   NO HACE: no habla con SUNAT (eso es la web, `lib/sire-api.ts`, con credenciales en variables de entorno, nunca en la base), no acepta
--            ni genera nada en el SIRE: la API solo se usa para LEER.
--
-- DECIDÍ: «igual» por una huella de los datos que se comparan (tipo, serie, número, documento, montos y moneda), en el mismo orden en los dos
--   lados. Un cambio de nombre del cliente o del CAR no es una propuesta nueva.
-- DESCARTÉ: guardar la Clave SOL o el client_secret en la base para que el proceso los lea: una base con la llave tributaria de CAYLA es un
--   blanco. Viven en las variables de entorno de Vercel y solo las lee el servidor.
-- SE ROMPE SI: alguien llama esta función con la llave de servicio desde otro lugar: queda una versión sin firma, marcada `api`.
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: una función nueva. Va DESPUÉS de 20261102202000.
-- Prueba: `pnpm pruebas:sire-propuestas`.
-- ============================================================================
set lock_timeout = '3s';

create or replace function retail.guardar_propuesta_sire_api(p_registro text, p_mes date, p_lineas jsonb)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid;
  v_periodo date := date_trunc('month', p_mes)::date;
  v_vigente uuid;
  v_huella_nueva text;
  v_huella_vigente text;
begin
  if p_registro is null or p_registro not in ('compras', 'ventas') then
    raise exception 'registro_desconocido' using errcode = '22023';
  end if;
  if p_mes is null or v_periodo > date_trunc('month', (now() at time zone 'America/Lima'))::date then
    raise exception 'mes_futuro' using errcode = '22023';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) > 20000 then
    raise exception 'lineas_invalidas' using errcode = '22023';
  end if;

  v_huella_nueva := (
    select md5(coalesce(string_agg(concat_ws('|', l.tipo, upper(l.serie), l.numero, coalesce(l.doc_numero, ''), round(coalesce(l.base, 0), 2),
                                             round(coalesce(l.igv, 0), 2), round(l.total, 2), coalesce(nullif(upper(l.moneda), ''), 'PEN')),
                                   ';' order by l.tipo, upper(l.serie), l.numero, coalesce(l.doc_numero, ''), round(l.total, 2)), ''))
      from jsonb_to_recordset(p_lineas) as l(tipo text, serie text, numero text, doc_numero text, base numeric, igv numeric, total numeric, moneda text));

  for v_vigente in
    select id from retail.sire_propuestas where registro = p_registro and periodo = v_periodo order by subida_at desc, id desc
  loop
    exit;
  end loop;
  if v_vigente is not null then
    v_huella_vigente := (
      select md5(coalesce(string_agg(concat_ws('|', l.tipo, l.serie, l.numero, coalesce(l.doc_numero, ''), l.base, l.igv, l.total, l.moneda),
                                     ';' order by l.tipo, l.serie, l.numero, coalesce(l.doc_numero, ''), l.total), ''))
        from retail.sire_lineas l where l.propuesta_id = v_vigente);
    if v_huella_vigente = v_huella_nueva then
      return null;
    end if;
  end if;

  insert into retail.sire_propuestas (registro, periodo, origen, archivo, lineas, subida_por)
  values (p_registro, v_periodo, 'api', 'API SIRE de SUNAT', jsonb_array_length(p_lineas), null)
  returning id into v_id;

  insert into retail.sire_lineas (propuesta_id, car, fecha, tipo, serie, numero, doc_tipo, doc_numero, nombre, base, igv, total, moneda,
                                  tipo_cambio, ref_tipo, ref_serie, ref_numero)
  select v_id, nullif(l.car, ''), nullif(l.fecha, '')::date, l.tipo, upper(l.serie), l.numero, nullif(l.doc_tipo, ''), nullif(l.doc_numero, ''),
         nullif(left(l.nombre, 200), ''), coalesce(l.base, 0), coalesce(l.igv, 0), l.total, coalesce(nullif(upper(l.moneda), ''), 'PEN'),
         l.tipo_cambio, nullif(l.ref_tipo, ''), nullif(upper(l.ref_serie), ''), nullif(l.ref_numero, '')
    from jsonb_to_recordset(p_lineas) as l(car text, fecha text, tipo text, serie text, numero text, doc_tipo text, doc_numero text, nombre text,
                                           base numeric, igv numeric, total numeric, moneda text, tipo_cambio numeric, ref_tipo text,
                                           ref_serie text, ref_numero text);
  return v_id;
end;
$$;

revoke all on function retail.guardar_propuesta_sire_api(text, date, jsonb) from public, anon, authenticated;
grant execute on function retail.guardar_propuesta_sire_api(text, date, jsonb) to service_role;
