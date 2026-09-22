-- ============================================================================
-- 20260922150000_venta_asesora_emisor_descuento_lider.sql — CAYLA V2
--
-- Amplía el contrato de `retail.registrar_venta` con lo que D-56/D-57/D-62/D-67/D-85/D-86/
-- D-87 de `docs/datos/DECISIONES-2026-09-21-menu-comercial.md` piden — SOLO backend (esquema +
-- RPC). El mostrador (`PuntoDeVenta.tsx`) se conecta a esto en una tanda aparte; este archivo
-- no cambia una sola línea de pantalla ni el comportamiento de la venta de hoy. ADR-0152.
--
-- QUÉ DECIDE
--   D-62 — la venta guarda una referencia de quién atendió (`ventas.asesora_id`), y una función
--     de lectura sugiere quién está de turno leyendo Dynamic (asistencia), sin filtrar nunca.
--   D-56/D-57 — cada venta elige quién emite el comprobante (`ventas.emisor`): Alegra (por fuera
--     de retail) o retail (con su propia serie, ya existente). Hoy retail SIEMPRE reserva
--     boleta; esta migración hace ese comportamiento explícito y seleccionable sin cambiarlo
--     para quien no pasa el parámetro nuevo (ver «SE ROMPE SI» — el default NO es el de D-56).
--   D-85 — series propias de retail por tienda: YA EXISTEN (`retail.series_comprobantes`,
--     `0010_facturacion.sql`, columnas `ubicacion_id, tipo, serie, siguiente_numero` — calzan
--     con lo que D-85 pedía «si no existe, créala»). No se crea ninguna tabla nueva: crearla
--     habría sido el caso especial que el principio 6 del repo pide eliminar, no agregar.
--   D-86/D-87 — una nota de crédito la emite quien emitió la boleta original: si fue Alegra,
--     se hace en Alegra, nunca en retail (retail no tiene el comprobante original que SUNAT
--     vincularía). No hace falta candado nuevo: `retail.emitir_nota`/`retail.emitir_comprobante`
--     ya exigen un `comprobante_original_id` que exista en `retail.comprobantes` — si la boleta
--     la emitió Alegra, ese comprobante nunca existió en retail y la nota no tiene de qué
--     partir. Solo se agrega el campo opcional para UBICAR la venta al hacer un cambio
--     (`ventas.boleta_alegra_numero`), sin decimales de SUNAT ni intento de cuadre (D-59).
--   D-67 — descuento de venta con tope por rol y autorización de un líder cuando lo supera,
--     con auditoría de quién autorizó y por qué.
--
-- LA OBJECIÓN — el default de `p_emisor` NO es 'alegra'. D-56 dice literal «con "La emite
-- Alegra" por defecto» — pero eso describe qué opción va PRESELECCIONADA en la pantalla del
-- mostrador que todavía no existe, no lo que debe pasar si NADIE manda el parámetro. Hoy
-- `PuntoDeVenta.tsx` llama `registrar_venta` SIEMPRE con `p_tipo_comprobante` puesto (boleta o
-- factura) — es decir, hoy el comportamiento real, de hecho, YA es «retail emite» (D-56 lo dice
-- así: «hoy retail reserva boleta en cada venta y la deja pendiente»). El requerimiento explícito
-- de esta tanda es aditivo: «la llamada actual de PuntoDeVenta.tsx debe seguir funcionando
-- EXACTAMENTE igual que hoy, sin ningún cambio de comportamiento visible hasta que el mostrador
-- los use» — y ese mostrador de hoy no manda `p_emisor`. Si el default fuera 'alegra', pegar esta
-- migración en producción apagaría la emisión de TODAS las boletas de las 3 tiendas en el
-- instante mismo del pegado, sin haber tocado ni una línea de React — el peor tipo de regresión,
-- silenciosa y en un sistema que ya transmite documentos reales a SUNAT. Se resuelve la
-- contradicción a favor de la regla explícita y más fuerte (no romper lo que ya funciona):
-- `p_emisor default 'retail'`. Cuando el mostrador ofrezca el selector (tanda aparte), ESA
-- pantalla decide su propio valor inicial (Alegra, por D-56) y lo manda siempre explícito — el
-- default de la función deja de importar el día que nadie vuelve a omitir el parámetro.
--
-- LO QUE NO PIDIÓ — un FK ingenuo a `retail.colaboradores` para `asesora_id`/
-- `descuento_autorizado_por` se habría roto solo: desde `20260922110000_colaboradores_
-- suspender_y_actividad.sql`, «suspender» y `quitar_colaborador` MUEVEN o BORRAN la fila de
-- `retail.colaboradores` de verdad (no es una tabla con historial, es «quién tiene la puerta
-- abierta HOY»). Cualquier asesora o líder que alguna vez vendió o autorizó un descuento y
-- luego se suspende o se da de baja habría dejado esa venta con un FK roto — la suspensión
-- misma habría fallado con «viola llave foránea», rompiendo justo la operación diaria más común
-- del módulo Colaboradores. Las dos columnas referencian `public.personas(id)` en su lugar —
-- el identificador estable que Dynamic nunca borra (una persona se desactiva, nunca desaparece)
-- y el mismo patrón que ya usan `ventas.usuario_id`/`ventas.anulado_por` (0010/0009). Quién fue
-- líder o asesora EN ESE MOMENTO es un hecho histórico que no debe volverse irrepresentable
-- porque hoy esa persona ya no tenga acceso a retail.
--
-- QUIÉN Y CUÁNDO. Felipe, ronda de 60 preguntas del 2026-09-21 (D-53..D-91) — ejecutado por el
-- arquitecto (tanda de agentes, D-88/D-89) el 2026-09-22, worktree propio desde `origin/main`.
--
-- QUÉ CAMBIA
--   · `retail.ventas` — 6 columnas nuevas, todas nullable o con DEFAULT (ver arriba y abajo).
--   · `retail.colaboradores.tope_descuento_pct` — tope de descuento manual por rol (10% para
--     colaborador, NULL/sin tope para líder — así lo pide la tarea; D-67 deja el número exacto
--     a que Felipe lo ajuste después, es un solo `update`, no una migración de esquema).
--   · `retail.fn_es_lider_persona(uuid)` — nueva, misma idea que `fn_es_lider()` pero para UNA
--     persona dada (quien autoriza), no para quien ejecuta la llamada.
--   · `retail.fn_asesoras_de_turno(uuid)` — nueva, lectura de asistencia de Dynamic.
--   · `retail.registrar_venta` — 5 parámetros nuevos al final, todos con DEFAULT (ver firma
--     abajo). Cambia de firma → `drop function` primero (ADR-0026: un `create or replace` con
--     un parámetro nuevo deja las dos firmas vivas a la vez) y se vuelve a otorgar EXECUTE
--     explícito después del `create` (el `drop` se lo lleva — el mismo detalle que ya documentó
--     `20260918091500_emitir_comprobante_idempotente_y_valida_igv.sql`).
--
-- QUÉ SE CONSERVA. Todo el cuerpo de `registrar_venta` anterior a esta migración (candado de
-- ubicación, precio de catálogo, campañas, descuento POR LÍNEA con código/escalonado — R-45,
-- ADR-0048 —, idempotencia por token, IGV). El descuento nuevo de esta migración
-- (`p_descuento_pct`) es un dato de AUDITORÍA a nivel de VENTA, no reemplaza ni se cruza con el
-- descuento por línea que ya existe (`venta_items.descuento_unitario`): son dos mecanismos
-- distintos que hoy conviven sin validarse entre sí — ver «PENDIENTE» abajo.
--
-- QUIÉN DEJA DE PODER HACER QUÉ. Nadie: los 5 parámetros nuevos tienen DEFAULT que reproducen
-- el comportamiento de hoy. Lo nuevo que SÍ empieza a exigirse (candado real, no cosmético):
-- un colaborador (no líder) que mande `p_descuento_pct` por encima de su
-- `colaboradores.tope_descuento_pct` sin un `p_autorizado_por` que sea un líder ACTIVO recibe
-- 42501 — pero eso solo pasa el día que el mostrador empiece a mandar ese parámetro.
--
-- PENDIENTE (fuera de esta tanda, a propósito — ver también el ADR)
--   · El mostrador (PuntoDeVenta.tsx) todavía no manda ninguno de los 5 parámetros nuevos.
--   · Reconciliar `p_descuento_pct` (nivel venta) con `venta_items.descuento_unitario` (nivel
--     línea) es una decisión de negocio de la tanda del mostrador, no de esta.
--   · Los topes exactos (10% colaborador hoy) son ajustables por Felipe con un `update
--     retail.colaboradores set tope_descuento_pct = ...` — no requieren otra migración.
--
-- Verificado contra un Postgres 17 desechable local (Docker caído — ver memoria
-- `postgres-desechable-sin-docker`), con las 194 migraciones de `origin/main` + seed aplicadas
-- antes que esta, y contra producción (`vovjyyiafkxteijimpuy`, solo lectura) para las columnas
-- reales de `public.jornadas`/`public.marcajes` (ver cabecera de `fn_asesoras_de_turno`).
--
-- Este archivo NO trae el prefijo `retail.` (se agrega solo al pegar en el SQL Editor de
-- producción, nunca en el repo — CLAUDE.md).
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. retail.ventas — columnas nuevas, todas nullable o con DEFAULT ----------

alter table retail.ventas
  add column if not exists asesora_id uuid references public.personas (id),
  add column if not exists emisor text not null default 'retail',
  add column if not exists boleta_alegra_numero text,
  add column if not exists descuento_pct numeric(5, 2) not null default 0,
  add column if not exists descuento_autorizado_por uuid references public.personas (id),
  add column if not exists descuento_motivo text;

alter table retail.ventas drop constraint if exists ventas_emisor_check;
alter table retail.ventas add constraint ventas_emisor_check
  check (emisor in ('alegra', 'retail'));

-- D-87: el número de Alegra solo tiene sentido en una venta que Alegra emitió — en una que
-- emitió retail, el comprobante real vive en `retail.comprobantes` y este campo confundiría.
alter table retail.ventas drop constraint if exists ventas_boleta_alegra_solo_si_alegra;
alter table retail.ventas add constraint ventas_boleta_alegra_solo_si_alegra
  check (boleta_alegra_numero is null or emisor = 'alegra');

alter table retail.ventas drop constraint if exists ventas_descuento_pct_rango;
alter table retail.ventas add constraint ventas_descuento_pct_rango
  check (descuento_pct >= 0 and descuento_pct <= 100);

-- Estado imposible evitado (principio 4/Lamport): un "quién autorizó" sin ningún descuento que
-- autorizar no significa nada — si aparece, es un dato mal armado, no un caso raro a tolerar.
alter table retail.ventas drop constraint if exists ventas_descuento_autorizado_requiere_descuento;
alter table retail.ventas add constraint ventas_descuento_autorizado_requiere_descuento
  check (descuento_autorizado_por is null or descuento_pct > 0);

create index if not exists ventas_asesora_id_idx on retail.ventas (asesora_id);

comment on column retail.ventas.asesora_id is
  'D-62: quién atendió la venta (public.personas.id — no retail.colaboradores: esa fila puede moverse/borrarse al suspender). Referencia informativa, nunca exigida.';
comment on column retail.ventas.emisor is
  'D-56/D-57: quién emite el comprobante tributario de esta venta. "retail" reserva boleta con series propias (retail.series_comprobantes); "alegra" no reserva nada, el ticket dice que la boleta la emite Alegra aparte. Default "retail" = el comportamiento de hoy (ver cabecera de la migración, no el default de D-56).';
comment on column retail.ventas.boleta_alegra_numero is
  'D-87: número de boleta de Alegra, texto libre (ej. "B001-00045"), SOLO para ubicar la venta al hacer un cambio. Nunca se usa para reconciliar montos (D-59: sin cuadre).';
comment on column retail.ventas.descuento_pct is
  'D-67: descuento a nivel de VENTA (distinto de venta_items.descuento_unitario, que es por línea). 0 = sin descuento de venta.';
comment on column retail.ventas.descuento_autorizado_por is
  'D-67: persona (public.personas.id) que autorizó un descuento_pct por encima del tope del rol de quien vendió — debe ser un líder activo al momento de autorizar.';
comment on column retail.ventas.descuento_motivo is
  'D-67: por qué se autorizó el descuento de venta (auditoría para D-63, efectividad sin lastimar margen).';

-- ---------- 2. retail.colaboradores.tope_descuento_pct (D-67) ----------

alter table retail.colaboradores
  add column if not exists tope_descuento_pct numeric(5, 2) default 10;

alter table retail.colaboradores drop constraint if exists colaboradores_tope_descuento_pct_rango;
alter table retail.colaboradores add constraint colaboradores_tope_descuento_pct_rango
  check (tope_descuento_pct is null or (tope_descuento_pct >= 0 and tope_descuento_pct <= 100));

comment on column retail.colaboradores.tope_descuento_pct is
  'D-67: tope de descuento de VENTA (ventas.descuento_pct) que este colaborador puede aplicar sin autorización de un líder. NULL = sin tope. Por defecto 10 para colaborador; los líderes existentes quedan en NULL abajo.';

-- Backfill: los líderes YA registrados quedan sin tope (coherente con "un líder no pierde
-- nada" — mismo criterio que 20260921120000_candado_de_lider_caja_y_ajuste.sql). Los nuevos
-- líderes que se den de alta después (hoy solo por SQL directo, 0016) heredan el mismo criterio
-- a mano; `agregar_colaborador`/`agregar_colaboradores` solo dan de alta colaboradores (0016/
-- 20260922110000), así que el DEFAULT de 10 para ellos es correcto sin tocar esas RPC.
update retail.colaboradores set tope_descuento_pct = null where rol = 'lider';

-- ---------- 3. fn_es_lider_persona: candado de líder, pero para OTRA persona ----------
-- `fn_es_lider()` (0016) resuelve sobre `auth.uid()` — quien ejecuta la llamada. D-67 necesita
-- lo mismo para el PERSONA_ID que llega en `p_autorizado_por`, que nunca es quien está logueada
-- en caja (es el líder cuya clave o cuenta autorizó, física o remotamente). Nombre distinto a
-- propósito: sobrecargar `fn_es_lider` con un parámetro habría sido el mismo problema que ya
-- evitó ADR-0026 (dos firmas vivas resolviendo cosas distintas bajo el mismo nombre).
create or replace function retail.fn_es_lider_persona(p_persona_id uuid) returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select exists (
    select 1 from public.personas p
    join retail.colaboradores c on c.persona_id = p.id
    where p.id = p_persona_id and p.estado = 'activo' and c.rol = 'lider'
  );
$$;
grant execute on function retail.fn_es_lider_persona(uuid) to authenticated;

-- ---------- 4. fn_asesoras_de_turno: sugerencia de quién atiende, leyendo Dynamic (D-62) ----------
--
-- `public.jornadas` (persona_id, fecha, sede_id, estado — enum estado_jornada: abierta/
-- en_pausa/cerrada/auto_cerrada_pendiente/revisada) y `public.marcajes` (persona_id, sede_id,
-- tipo — enum tipo_marca: entrada/salida_final/salida_o_retorno_{almuerzo,personal,tramite,
-- medico,otro}/, timestamp_marca, anulada_at, fecha_jornada) verificados campo por campo contra
-- PRODUCCIÓN (vovjyyiafkxteijimpuy, solo lectura, 2026-09-22) — no contra
-- docs/datos/14-DYNAMIC.md, que el propio D-62 marca desactualizado (habla de vistas
-- retail.personas/retail.sedes que ya no existen).
--
-- POR QUÉ LAS DOS TABLAS Y NO SOLO `jornadas.estado`. `jornadas` ya trae un estado agregado del
-- día (fuente de verdad de Dynamic), pero el estado `auto_cerrada_pendiente` sugiere que puede
-- quedar desfasado de la última marca real hasta que un proceso de Dynamic lo cierre. Se usa la
-- ÚLTIMA MARCA VIVA (`marcajes`, no anulada, del día) como señal principal de "ahora mismo", y
-- `jornadas.estado` como respaldo cuando no hay ninguna marca (ej. jornada creada sin marcar
-- aún). Nunca se expone el TIPO exacto de una pausa (médico/trámite/personal son datos
-- sensibles, D-62) — todo `salida_*` que no sea `salida_final` colapsa a 'en_pausa' en la
-- salida de esta función.
--
-- POR QUÉ `execute` DINÁMICO Y NO SQL FIJO. `public.jornadas`/`public.marcajes` son de Dynamic:
-- retail no es su dueño (docs/datos/14-DYNAMIC.md) y el Postgres LOCAL de desarrollo (sin
-- Docker: ADR-0033) solo imita `sedes`/`personas` — nunca jornadas/marcajes, a propósito, para
-- no fingir asistencia real. Un `select ... from public.jornadas` fijo habría hecho fallar el
-- `create function` mismo en cualquier Postgres que no sea producción (Postgres valida las
-- tablas referenciadas al crear la función — mismo mecanismo que ya documenta
-- `20260917100000_tallas_vocabulario_cerrado.sql:107`). El `execute` con el `begin/exception`
-- de abajo, además, hace real lo que D-62 ya pide en producción: "si la sede no tiene nada
-- cargado en Dynamic, tabla vacía sin error" — acá se extiende un paso más (todo falla, todo el
-- tiempo, D-8 Vogels): si Dynamic cambia de forma esas tablas algún día, esta sugerencia se
-- apaga sola en vez de tumbar la venta.
create or replace function retail.fn_asesoras_de_turno(p_ubicacion_id uuid)
returns table (
  persona_id uuid,
  nombre_corto text,
  estado_ahora text,
  es_de_esta_sede boolean
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_sede_dynamic_id uuid;
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para consultar el turno de esa ubicación';
  end if;

  select u.sede_dynamic_id into v_sede_dynamic_id from ubicaciones u where u.id = p_ubicacion_id;

  -- Sin enlace a una sede real de Dynamic (ej. Almacén Principal, o el Taller antes de
  -- enlazarse): no hay turno que leer. Tabla vacía, nunca error.
  if v_sede_dynamic_id is null then
    return;
  end if;

  begin
    return query execute $q$
      with candidatos as (
        select c.persona_id, p.nombres, p.apellidos, p.sede_base_id
        from retail.colaboradores c
        join public.personas p on p.id = c.persona_id
        where p.estado = 'activo'
          and (
            p.sede_base_id = $2
            or exists (
              select 1 from public.marcajes m
              where m.persona_id = c.persona_id and m.sede_id = $2 and m.anulada_at is null
                and coalesce(m.fecha_jornada, (m.timestamp_marca at time zone 'America/Lima')::date) = $1
            )
            or exists (
              select 1 from public.jornadas j
              where j.persona_id = c.persona_id and j.sede_id = $2 and j.fecha = $1
            )
          )
      ),
      ultima_marca as (
        select distinct on (m.persona_id) m.persona_id, m.tipo
        from public.marcajes m
        where m.sede_id = $2 and m.anulada_at is null
          and coalesce(m.fecha_jornada, (m.timestamp_marca at time zone 'America/Lima')::date) = $1
        order by m.persona_id, m.timestamp_marca desc
      ),
      jornada_hoy as (
        select j.persona_id, j.estado from public.jornadas j
        where j.sede_id = $2 and j.fecha = $1
      ),
      resultado as (
        select
          cd.persona_id as persona_id,
          cd.nombres || ' ' || left(cd.apellidos, 1) || '.' as nombre_corto,
          case
            when um.tipo = 'salida_final' then 'salio'
            when um.tipo in ('entrada', 'retorno_almuerzo', 'retorno_personal', 'retorno_tramite', 'retorno_medico', 'retorno_otro') then 'presente'
            when um.tipo is not null then 'en_pausa'
            when jh.estado in ('cerrada', 'auto_cerrada_pendiente', 'revisada') then 'salio'
            when jh.estado = 'en_pausa' then 'en_pausa'
            when jh.estado = 'abierta' then 'presente'
            else 'programada'
          end as estado_ahora,
          (cd.sede_base_id = $2) as es_de_esta_sede
        from candidatos cd
        left join ultima_marca um on um.persona_id = cd.persona_id
        left join jornada_hoy jh on jh.persona_id = cd.persona_id
      )
      select persona_id, nombre_corto, estado_ahora, es_de_esta_sede
      from resultado
      order by (estado_ahora = 'programada'), (estado_ahora = 'salio'), nombre_corto
    $q$ using v_hoy, v_sede_dynamic_id;
  exception when undefined_table or undefined_column then
    -- Dynamic no está disponible tal como esta función lo espera (ej. local sin el stub de
    -- ADR-0033, o un cambio de forma en producción todavía no reflejado acá). Nunca se rompe
    -- la venta por esto: se degrada a "sin sugerencia", igual que una sede sin datos.
    return;
  end;
end;
$$;
grant execute on function retail.fn_asesoras_de_turno(uuid) to authenticated;

-- ---------- 5. registrar_venta — firma ampliada (drop + create: ADR-0026) ----------

drop function if exists retail.registrar_venta(
  uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text
);

create or replace function retail.registrar_venta(
  p_ubicacion_id uuid, p_items jsonb, p_pagos jsonb,
  p_cliente_id uuid default null, p_token uuid default null,
  p_tipo_comprobante text default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null,
  p_codigo_descuento text default null,
  p_nota text default null,
  -- ---------- nuevo desde acá (D-56/57/62/67/85/86/87, 2026-09-22) ----------
  p_asesora_id uuid default null,
  p_emisor text default 'retail',
  p_descuento_pct numeric default 0,
  p_autorizado_por uuid default null,
  p_motivo_descuento text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta_id uuid; v_existente ventas%rowtype; v_item jsonb; v_pago jsonb;
  v_item_id uuid; v_mov_id uuid; v_costo numeric; v_persona uuid;
  v_sub uuid;
  v_caja_id uuid;
  v_total_items numeric := 0;
  v_total_pagos numeric := 0;
  v_igv numeric;
  v_subtotal numeric;
  v_precio_catalogo numeric; v_referencia text; v_sku text;
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  -- Días después de terminar que la base todavía ACEPTA el descuento de una
  -- campaña (venta hecha sin red y subida más tarde). No afecta lo que se exige.
  c_tolerancia_campana constant integer := 3;
  v_descuento numeric;
  v_hay_descuento boolean := false;  -- descuento MANUAL (el que pide código a una colaboradora)
  v_codigo codigos_descuento%rowtype;
  v_codigo_limpio text := upper(btrim(coalesce(p_codigo_descuento, '')));
  v_motivo text; v_motivo_otro text; v_argumento text;
  v_hoy date := fn_hoy_lima();
  v_c_id uuid; v_c_nombre text; v_c_pct numeric; v_c_unit numeric;
  v_etq_id uuid; v_etq_pct numeric;
  v_tope_descuento numeric;  -- D-67: tope de descuento de VENTA de quien vende (NULL = sin tope)
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para vender en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;
  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Falta indicar cómo se pagó la venta';
  end if;
  if p_tipo_comprobante is not null and p_tipo_comprobante not in ('boleta', 'factura') then
    raise exception 'Una venta solo puede facturarse como boleta o factura (se pidió %)', p_tipo_comprobante;
  end if;
  if p_emisor not in ('alegra', 'retail') then
    raise exception 'p_emisor solo puede ser "alegra" o "retail" (se pidió %)', p_emisor;
  end if;
  if p_descuento_pct < 0 or p_descuento_pct > 100 then
    raise exception 'El descuento de la venta debe estar entre 0%% y 100%% (se pidió %)', p_descuento_pct;
  end if;

  if p_token is not null then
    select * into v_existente from ventas where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  select id into v_caja_id from cajas where ubicacion_id = p_ubicacion_id and estado = 'abierta';
  if v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de registrar una venta';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'venta');

  -- D-67: descuento a nivel de VENTA (distinto del descuento por línea, que sigue su propio
  -- candado más abajo sin cambios). Solo se evalúa si de verdad se pidió uno.
  if p_descuento_pct > 0 then
    select tope_descuento_pct into v_tope_descuento from colaboradores where persona_id = v_persona;
    if v_tope_descuento is not null and p_descuento_pct > v_tope_descuento then
      if p_autorizado_por is null or not fn_es_lider_persona(p_autorizado_por) then
        raise exception 'Ese descuento (%.2f%%) supera tu tope (%.2f%%) — necesita la autorización de un líder de equipo', p_descuento_pct, v_tope_descuento
          using errcode = '42501';
      end if;
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select v.precio, p.referencia, v.sku
      into v_precio_catalogo, v_referencia, v_sku
      from variantes v join productos p on p.id = v.producto_id
      where v.id = (v_item ->> 'variante_id')::uuid;
    if v_precio_catalogo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;

    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial
       and not fn_variante_permitida_en_sede((v_item ->> 'variante_id')::uuid, p_ubicacion_id) then
      raise exception 'venta_variante_restringida_a_otra_sede' using detail = v_referencia || ' (' || v_sku || ')';
    end if;

    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial
       and round((v_item ->> 'precio_unitario')::numeric, 2) <> round(v_precio_catalogo, 2) then
      raise exception 'venta_precio_cambiado'
        using detail = v_referencia || ' (' || v_sku || ')',
              hint = format('En catálogo vale S/%s y la caja mandó S/%s', v_precio_catalogo, v_item ->> 'precio_unitario');
    end if;

    v_descuento := coalesce((v_item ->> 'descuento_unitario')::numeric, 0);
    v_motivo := btrim(coalesce(v_item ->> 'motivo_descuento', ''));

    -- La campaña que RIGE HOY para esta prenda (la de mayor %). El "Monto
    -- manual" no es una prenda del catálogo: no entra en campañas.
    v_c_id := null; v_c_nombre := null; v_c_pct := null;
    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial then
      select c.etiqueta_id, c.etiqueta_nombre, c.descuento_pct
        into v_c_id, v_c_nombre, v_c_pct
        from fn_campanas_por_variante(v_hoy, 0, array[(v_item ->> 'variante_id')::uuid]) c
        order by c.descuento_pct desc, c.etiqueta_nombre, c.etiqueta_id
        limit 1;
    end if;
    v_c_unit := case when v_c_pct is null then 0
                     else round((v_item ->> 'precio_unitario')::numeric * v_c_pct / 100, 2) end;

    -- Lo EXIGIDO: si la prenda tiene campaña hoy, la clienta la recibe. La caja
    -- no puede cobrar menos descuento (el 0,01 absorbe el redondeo del navegador).
    if v_c_id is not null and v_descuento < v_c_unit - 0.01 then
      raise exception 'venta_campana_omitida'
        using detail = v_referencia || ' (' || v_sku || ')',
              hint = format('«%s» da %s %% y la caja mandó S/%s de descuento', v_c_nombre,
                            trim(trailing '.' from trim(trailing '0' from v_c_pct::text)), v_descuento);
    end if;

    if v_motivo = 'campana' then
      -- Descuento de campaña: se verifica contra la etiqueta que la caja dice
      -- (aceptando una terminada hace pocos días, por la venta sin red).
      v_etq_id := nullif(btrim(coalesce(v_item ->> 'descuento_etiqueta_id', '')), '')::uuid;
      if v_etq_id is null then
        raise exception 'venta_campana_sin_etiqueta' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
      select c.descuento_pct into v_etq_pct
        from fn_campanas_por_variante(v_hoy, c_tolerancia_campana, array[(v_item ->> 'variante_id')::uuid]) c
        where c.etiqueta_id = v_etq_id;
      if not found then
        raise exception 'venta_campana_no_vigente' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
      if v_descuento <= 0
         or abs(v_descuento - round((v_item ->> 'precio_unitario')::numeric * v_etq_pct / 100, 2)) > 0.011 then
        raise exception 'venta_campana_monto_no_coincide'
          using detail = v_referencia || ' (' || v_sku || ')',
                hint = format('La etiqueta da %s %% y la caja mandó S/%s de descuento',
                              trim(trailing '.' from trim(trailing '0' from v_etq_pct::text)), v_descuento);
      end if;

    elsif v_descuento > 0 then
      -- Descuento MANUAL. Con campaña, solo vale si la supera: un solo descuento.
      if v_c_id is not null and v_descuento <= v_c_unit + 0.01 then
        raise exception 'venta_descuento_no_supera_campana'
          using detail = v_referencia || ' (' || v_sku || ')',
                hint = format('«%s» ya da S/%s por prenda', v_c_nombre, v_c_unit);
      end if;

      v_hay_descuento := true;

      v_motivo_otro := btrim(coalesce(v_item ->> 'motivo_descuento_detalle', ''));
      v_argumento := btrim(coalesce(v_item ->> 'argumento_descuento', ''));

      if v_motivo not in ('cumpleanos_clienta_top', 'prenda_con_desperfecto', 'liquidacion_temporada', 'cerrar_venta', 'otro') then
        raise exception 'venta_descuento_requiere_motivo' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
      if v_motivo = 'otro' and v_motivo_otro = '' then
        raise exception 'venta_descuento_otro_sin_detalle' using detail = v_referencia || ' (' || v_sku || ')';
      end if;

      select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
      if (v_item ->> 'precio_unitario')::numeric - v_descuento < v_costo then
        raise exception 'venta_descuento_bajo_costo' using detail = v_referencia || ' (' || v_sku || ')';
      end if;

      if fn_es_lider() then
        if v_descuento > round((v_item ->> 'precio_unitario')::numeric * 0.35, 2) + 0.01 then
          raise exception 'venta_descuento_supera_autorizacion' using detail = v_referencia || ' (' || v_sku || ')';
        elsif v_descuento > round((v_item ->> 'precio_unitario')::numeric * 0.20, 2) + 0.01 and v_argumento = '' then
          raise exception 'venta_descuento_requiere_argumento' using detail = v_referencia || ' (' || v_sku || ')';
        end if;
      end if;
    end if;

    v_total_items := v_total_items +
      (((v_item ->> 'precio_unitario')::numeric - v_descuento) * (v_item ->> 'cantidad')::integer);
  end loop;

  -- El código de una colaboradora autoriza solo los descuentos MANUALES: una
  -- campaña no lo pide (y una línea de campaña no cuenta contra el tope).
  if v_hay_descuento and not fn_es_lider() then
    if v_codigo_limpio = '' then
      raise exception 'venta_descuento_requiere_codigo';
    end if;
    select * into v_codigo from codigos_descuento
      where codigo = v_codigo_limpio
        and activo
        and (vigente_desde is null or vigente_desde <= v_hoy)
        and (vigente_hasta is null or vigente_hasta >= v_hoy)
        and (ubicacion_id is null or ubicacion_id = p_ubicacion_id);
    if not found then
      raise exception 'venta_codigo_descuento_invalido' using detail = v_codigo_limpio;
    end if;
    for v_item in select * from jsonb_array_elements(p_items) loop
      if btrim(coalesce(v_item ->> 'motivo_descuento', '')) <> 'campana'
         and coalesce((v_item ->> 'descuento_unitario')::numeric, 0)
             > round((v_item ->> 'precio_unitario')::numeric * v_codigo.porcentaje / 100, 2) + 0.01 then
        raise exception 'venta_descuento_supera_codigo'
          using detail = trim(trailing '.' from trim(trailing '0' from v_codigo.porcentaje::text)),
                hint = format('La línea %s pide S/%s de descuento', v_item ->> 'variante_id', v_item ->> 'descuento_unitario');
      end if;
    end loop;
  end if;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_total_pagos := v_total_pagos + (v_pago ->> 'monto')::numeric;
  end loop;
  if round(v_total_items, 2) <> round(v_total_pagos, 2) then
    raise exception 'Los pagos (S/%) no cuadran con el total de la venta (S/%)', v_total_pagos, v_total_items;
  end if;

  begin
    insert into ventas (
      ubicacion_id, cliente_id, caja_id, usuario_id, token_cliente, nota,
      asesora_id, emisor, descuento_pct, descuento_autorizado_por, descuento_motivo
    )
      values (
        p_ubicacion_id, p_cliente_id, v_caja_id, v_persona, p_token, nullif(btrim(p_nota), ''),
        p_asesora_id, p_emisor, p_descuento_pct, p_autorizado_por,
        nullif(btrim(coalesce(p_motivo_descuento, '')), '')
      )
      returning id into v_venta_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from ventas where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente.id;
  end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
    if v_costo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;

    insert into venta_items (
      venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
      motivo_descuento, motivo_descuento_detalle, argumento_descuento, descuento_etiqueta_id
    )
      values (
        v_venta_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer,
        (v_item ->> 'precio_unitario')::numeric, coalesce((v_item ->> 'descuento_unitario')::numeric, 0), v_costo,
        nullif(btrim(coalesce(v_item ->> 'motivo_descuento', '')), ''),
        nullif(btrim(coalesce(v_item ->> 'motivo_descuento_detalle', '')), ''),
        nullif(btrim(coalesce(v_item ->> 'argumento_descuento', '')), ''),
        case when btrim(coalesce(v_item ->> 'motivo_descuento', '')) = 'campana'
             then nullif(btrim(coalesce(v_item ->> 'descuento_etiqueta_id', '')), '')::uuid end
      )
      returning id into v_item_id;

    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, v_sub, 'salida',
              (v_item ->> 'cantidad')::integer, 'venta', v_item_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    -- `recibido`: lo que la clienta entregó en efectivo (para reimprimir el ticket con su
    -- vuelto). Solo cuenta en efectivo; cualquier otro medio lo deja en NULL.
    insert into venta_pagos (venta_id, metodo, monto, recibido)
      values (
        v_venta_id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric,
        case when v_pago ->> 'metodo' = 'efectivo' then nullif(v_pago ->> 'recibido', '')::numeric end
      );
  end loop;

  -- D-56: solo retail reserva comprobante. Cuando el emisor es Alegra, la venta queda
  -- registrada completa (stock, caja, pagos) y el comprobante se emite aparte, en Alegra.
  if p_tipo_comprobante is not null and p_emisor = 'retail' then
    v_igv := round((v_total_items - v_total_items / 1.18) * 100) / 100;
    v_subtotal := round((v_total_items - v_igv) * 100) / 100;
    perform emitir_comprobante(
      p_ubicacion_id, p_tipo_comprobante, v_subtotal, v_igv, v_total_items,
      v_venta_id, p_cliente_tipo_doc, p_cliente_num_doc, p_cliente_nombre, p_items
    );
  end if;

  return v_venta_id;
end;
$$;

grant execute on function retail.registrar_venta(
  uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text
) to authenticated;
