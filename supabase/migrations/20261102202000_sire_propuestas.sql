-- ============================================================================
-- 20261102202000_sire_propuestas.sql — CAYLA V2 (ADR-0601, actividad 1 · 2026-11-02)
--
-- EL PROBLEMA PRIMERO.
--   Cada mes SUNAT arma la «propuesta» del Registro de Compras (RCE) y del de Ventas (RVIE) del SIRE con los comprobantes electrónicos que
--   recibió a nombre de CAYLA. El contador la acepta y la genera en el portal, casi siempre tal cual. Nadie la compara con lo que registró el
--   ERP: una factura de un proveedor que nadie registró, o una registrada que el proveedor nunca envió (su IGV no se descuenta), pasan sin
--   que nadie lo vea. Investigación: docs/investigacion/2026-11-02-sire-api-al-erp.md.
--
-- QUÉ HACE.
--   · `sire_propuestas`: cada propuesta que se sube (o que trae la API, actividad 5), con su registro, su mes, quién la subió y cuándo.
--     Subir otra vez el mismo mes NO borra la anterior: agrega una nueva, y la vigente es la última. Así queda el historial de qué se comparó.
--   · `sire_lineas`: los comprobantes de cada propuesta, ya leídos por la web (`lib/sire-propuesta-reglas.ts` lee el txt de SUNAT).
--   · `guardar_propuesta_sire`: la guarda. `fn_sire_propuesta`: la vigente de un mes, en un jsonb (una sola respuesta, sin el corte de 1.000
--     filas de PostgREST: las ventas de un mes pasan de 1.000 comprobantes).
--   El CRUCE con el ERP no vive aquí: lo hace `lib/sire-cruce-reglas.ts` sobre `fn_impuestos_registro_compras`, el mismo registro que baja
--   el contador. Así la comparación usa exactamente lo que se le entrega.
--
-- CONTRATO
--   PROMETE: una propuesta guardada no se edita ni se borra. Solo se guarda la de un mes que ya empezó y con un registro conocido. Las líneas
--            nacen con su propuesta en la misma transacción: nunca queda una propuesta a medias.
--   ASUME:   `fn_puede_ver_impuestos()` (ADR-0253) y `fn_actor_persona_id(true)` (ADR-0162) como están en producción.
--   NO HACE: no habla con SUNAT (eso es la actividad 5), no acepta ni genera nada en el SIRE, y no valida el contenido del archivo: lo que llega
--            ya lo leyó la web; aquí solo se cuida la forma (tipo, montos numéricos, largo).
--
-- DECIDÍ: guardar las líneas y no el archivo. Lo que se compara son los comprobantes; el archivo de SUNAT trae 40 columnas y un CAR que cambia
--   de nombre entre versiones. Guardar lo leído deja la comparación de cualquier mes pasado a la vista sin volver a leer nada.
-- DESCARTÉ: reemplazar la propuesta del mes al subir otra (un `delete` + `insert`). Se perdería con qué se comparó un cierre; y la regla del repo
--   es no borrar. El costo es espacio: unas decenas de facturas de compras al mes y ~2 000 comprobantes de ventas, unos cientos de KB por mes.
-- SE ROMPE SI: alguien sube un archivo de otro RUC o de otro mes: lo frena la web (`leerPropuestaSire`), no la base. La base sí frena un mes futuro.
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: dos tablas nuevas sin políticas (RLS encendido; solo las leen
-- y escriben funciones `security definer`), y dos funciones. Sin `alter` de tablas en uso, sin `drop trigger`, sin políticas, sin `select … into`.
-- Prueba: `pnpm pruebas:sire-propuestas`.
-- ============================================================================
set lock_timeout = '3s';

create table if not exists retail.sire_propuestas (
  id uuid primary key default gen_random_uuid(),
  registro text not null check (registro in ('compras', 'ventas')),
  -- El primer día del mes de la propuesta.
  periodo date not null check (periodo = date_trunc('month', periodo)::date),
  -- `archivo`: la subió alguien desde el portal; `api`: la trajo el proceso automático (actividad 5).
  origen text not null default 'archivo' check (origen in ('archivo', 'api')),
  archivo text check (archivo is null or length(archivo) <= 200),
  lineas integer not null check (lineas >= 0),
  subida_por uuid references public.personas (id),
  -- `clock_timestamp()` y no `now()`: dos subidas en la misma transacción tendrían la misma hora y la vigente saldría al azar.
  subida_at timestamptz not null default clock_timestamp()
);
create index if not exists sire_propuestas_vigente on retail.sire_propuestas (registro, periodo, subida_at desc);
alter table retail.sire_propuestas enable row level security;
comment on table retail.sire_propuestas is 'Cada propuesta del SIRE (RCE o RVIE) que se subió para compararla con el ERP. La vigente de un mes es la última; nunca se borra (ADR-0601).';

create table if not exists retail.sire_lineas (
  id bigint generated always as identity primary key,
  propuesta_id uuid not null references retail.sire_propuestas (id),
  car text check (car is null or length(car) <= 40),
  fecha date,
  -- Tabla 10 de SUNAT: 01 factura, 03 boleta, 07 nota de crédito, 08 nota de débito.
  tipo text not null check (tipo ~ '^[0-9A-Z]{2}$'),
  serie text not null check (length(serie) between 1 and 20),
  numero text not null check (numero ~ '^[0-9]{1,20}$'),
  doc_tipo text check (doc_tipo is null or length(doc_tipo) <= 2),
  doc_numero text check (doc_numero is null or length(doc_numero) <= 20),
  nombre text check (nombre is null or length(nombre) <= 200),
  base numeric(14, 2) not null default 0,
  igv numeric(14, 2) not null default 0,
  total numeric(14, 2) not null,
  moneda text not null default 'PEN' check (moneda ~ '^[A-Z]{3}$'),
  tipo_cambio numeric(10, 4) check (tipo_cambio is null or tipo_cambio > 0),
  ref_tipo text check (ref_tipo is null or length(ref_tipo) <= 2),
  ref_serie text check (ref_serie is null or length(ref_serie) <= 20),
  ref_numero text check (ref_numero is null or length(ref_numero) <= 20)
);
create index if not exists sire_lineas_propuesta on retail.sire_lineas (propuesta_id);
alter table retail.sire_lineas enable row level security;
comment on table retail.sire_lineas is 'Los comprobantes de una propuesta del SIRE, ya leídos del txt de SUNAT por la web (lib/sire-propuesta-reglas.ts).';

-- Guarda una propuesta leída por la web. Devuelve su id. Quien ve Impuestos la sube; firma el responsable del combo.
create or replace function retail.guardar_propuesta_sire(p_registro text, p_mes date, p_archivo text, p_lineas jsonb)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid;
  v_periodo date := date_trunc('month', p_mes)::date;
  v_n integer;
begin
  if not coalesce(retail.fn_puede_ver_impuestos(), false) then
    raise exception 'Solo quien ve Impuestos sube la propuesta del SIRE.' using errcode = '42501';
  end if;
  if p_registro is null or p_registro not in ('compras', 'ventas') then
    raise exception 'registro_desconocido' using errcode = '22023', detail = 'El registro es «compras» o «ventas».';
  end if;
  if p_mes is null or v_periodo > date_trunc('month', (now() at time zone 'America/Lima'))::date then
    raise exception 'mes_futuro' using errcode = '22023', detail = 'SUNAT todavía no tiene propuesta de ese mes.';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'lineas_invalidas' using errcode = '22023', detail = 'Las líneas llegan como una lista.';
  end if;
  v_n := jsonb_array_length(p_lineas);
  if v_n > 20000 then
    raise exception 'demasiadas_lineas' using errcode = '22023', detail = 'Una propuesta de más de 20 000 comprobantes no es de CAYLA.';
  end if;

  insert into retail.sire_propuestas (registro, periodo, origen, archivo, lineas, subida_por)
  values (p_registro, v_periodo, 'archivo', nullif(left(btrim(coalesce(p_archivo, '')), 200), ''), v_n, retail.fn_actor_persona_id(true))
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

-- La propuesta vigente (la última subida) de un registro y un mes, con sus líneas. `null` si nunca se subió.
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
        from retail.sire_lineas l where l.propuesta_id = v_p.id), '[]'::jsonb)
  );
end;
$$;

revoke all on function retail.guardar_propuesta_sire(text, date, text, jsonb) from public, anon;
revoke all on function retail.fn_sire_propuesta(text, date) from public, anon;
grant execute on function retail.guardar_propuesta_sire(text, date, text, jsonb) to authenticated;
grant execute on function retail.fn_sire_propuesta(text, date) to authenticated;
