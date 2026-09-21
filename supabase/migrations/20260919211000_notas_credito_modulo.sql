-- ============================================================================
-- Módulo «Notas de crédito» (/compras/notas-credito) — la BASE DE DATOS.
--
-- EL PROBLEMA. Hoy la nota de crédito del proveedor se registra DENTRO de la guía de recepción
-- (`RecepcionEnvio` → `NotaCreditoCierre` → `recibir_envio(p_notas_credito)`): una pantalla que usa un
-- colaborador para contar prendas termina escribiendo dinero. Y no hay forma de ver, en una sola
-- lectura, qué notas ya llegaron y cuáles faltan reclamar: `compras_nota_pendiente()` exige que le
-- pases los ids de los comprobantes, o sea que solo sirve si YA sabes cuáles mirar.
-- Además, «el proveedor nos devuelve el dinero ahora» son hoy DOS llamadas
-- (`registrar_nota_credito_compra` + `registrar_reembolso_proveedor`): si la segunda falla, queda la
-- nota sin su devolución y un saldo a favor que en la realidad ya se cobró. Estado inconsistente
-- (principio 2), y de los caros: es dinero.
--
-- DECISIÓN (Felipe, spike `docs/maquetas/notas-credito-spike-2026-09/`, 2026-09-19).
--   D1 la nota se registra SOLO en el módulo · D2 «reclamada al proveedor» queda para una segunda
--   fase (sin tabla nueva ahora) · D3 «Aplicada» se deduce con FIFO en TypeScript: NO se tocan
--   `registrar_pago_compras`, `registrar_pagos_compra` ni `fn_consumir_saldo_favor` ·
--   D4 la urgencia (14 días) vive en TypeScript · D5 sí va la columna de adjunto ·
--   D6 el destino por defecto del dinero es «queda a favor» y NO se guardan cuentas de CAYLA.
--
-- QUÉ TRAE ESTA MIGRACIÓN (cuatro piezas, ninguna toca las funciones de pago):
--   1. `notas_credito_tablero()` — la lectura del módulo en UNA llamada: una fila por nota ya
--      registrada y una por nota pendiente (faltante cerrado y todavía sin nota), distinguidas por
--      `clase`. Solo líder (ADR-0126), `security definer` como `compras_nota_pendiente`.
--   2. `registrar_nota_credito_compra` gana el DESTINO DEL DINERO: `p_destino`
--      (`a_favor` | `reembolso`) y los tres datos de la devolución. Nota y devolución nacen en la
--      MISMA transacción o no nace ninguna.
--   3. `compra_adjuntos.nota_credito_id` (D5): el PDF de la nota colgado de su nota, no del
--      comprobante.
--   4. `fn_facturas_para_nota_credito()` — el buscador que elige el comprobante de origen. Busca
--      también POR MONTO, que es lo que `listar_compras` no sabe hacer (y por eso NO se la toca).
--
-- POR QUÉ SE EXTIENDE `registrar_nota_credito_compra` EN VEZ DE ENVOLVERLA EN UNA RPC NUEVA.
--   · «Registrar una nota» es UN acto del negocio; a qué va el dinero que sobra es un dato de ese
--     acto, no otro acto. Dos RPC para lo mismo serían dos puertas al mismo formulario, que es
--     justo el problema que este módulo viene a cerrar (principios 3 y 4).
--   · El riesgo real de cambiar la firma —la sobrecarga que ya nos mordió (ADR-0009)— se apaga con
--     el `drop function` explícito de abajo, y al final se verifica que quede UNA sola firma.
--   · Lo que de verdad mueve dinero, `fn_insertar_nota_credito_compra`, NO se toca: esta función es
--     una envoltura de permiso + candado. Extenderla es barato; envolverla otra vez, no.
--   Quien la llame hoy con 5, 6 o 7 argumentos sigue funcionando IGUAL: los cuatro nuevos tienen
--   valor por defecto y `a_favor` es el comportamiento de siempre.
--
-- NO BORRA DATOS. Las tres columnas/funciones nuevas nacen vacías o nulas; los `drop function` son
-- de la firma vieja en el mismo script que la recrea. La migración es re-ejecutable: pegarla dos
-- veces deja exactamente lo mismo (se verifica en `scripts/pruebas/notas_credito_modulo.mjs`).
--
-- EN PRODUCCIÓN: pegar con el prefijo `retail.` ya puesto (este archivo lo lleva) o con el
-- `set search_path` de la primera línea, que también va incluido. Una sola pegada, en orden.
-- ============================================================================
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Lectura del módulo: notas registradas + notas pendientes, en una sola llamada.
--
-- `clase` distingue las dos mitades porque son el MISMO objeto de negocio en dos momentos: «esto ya
-- lo reclamé y llegó» y «esto todavía se lo debo reclamar». La pantalla las ordena juntas.
--
-- Para `clase = 'pendiente'`:
--   · `id` y `cierre_id` = el ÚLTIMO cierre del comprobante. El último, no el primero, porque la
--     nota recién se puede pedir cuando no queda nada sin resolver: ahí empieza a correr el reloj
--     de los 14 días (D4), que la pantalla calcula desde `cerrado_en`.
--   · `monto_esperado` = el mismo cálculo que ya usa `compras_nota_pendiente()` (costo de lo cerrado
--     × (1 + tasa de IGV del comprobante), redondeado a 2). No se inventa una tercera copia de esa
--     regla: es la que `fn_insertar_nota_credito_compra` usa como tope al validar el monto.
--   · `resuelto` dice si ya se puede registrar la nota o todavía falta cerrar unidades. Es la única
--     columna fuera del contrato acordado con la pantalla, y va al final: sin ella el tablero no
--     puede distinguir un reclamo listo de uno bloqueado, que es un estado que el spike dibuja.
-- Para `clase = 'nota'`: `a_favor` = `monto - aplicado`, o sea lo que la nota dejó de saldo a favor
-- en el momento de registrarse (si después se devolvió o se usó, eso vive en `proveedor_creditos`).
-- ---------------------------------------------------------------------------
drop function if exists retail.notas_credito_tablero();

create function retail.notas_credito_tablero()
returns table (
  clase text,
  id uuid,
  compra_id uuid,
  documento text,
  proveedor_id uuid,
  proveedor_nombre text,
  serie_numero text,
  fecha date,
  monto numeric,
  aplicado numeric,
  a_favor numeric,
  igv numeric,
  motivo text,
  nota text,
  cierre_id uuid,
  compra_total numeric,
  compra_saldo numeric,
  compra_fecha_emision date,
  compra_estado text,
  unidades_cerradas integer,
  monto_esperado numeric,
  cerrado_en timestamptz,
  created_at timestamptz,
  resuelto boolean
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $function$
  -- CANDADO (ADR-0126): solo el líder ve dinero de Compras. Va primero: si falla, aborta antes de
  -- leer un solo peso.
  select retail.fn_exige_dinero_de_compras('las notas de crédito de proveedores');

  select t.clase, t.id, t.compra_id, t.documento, t.proveedor_id, t.proveedor_nombre,
         t.serie_numero, t.fecha, t.monto, t.aplicado, t.a_favor, t.igv, t.motivo, t.nota,
         t.cierre_id, t.compra_total, t.compra_saldo, t.compra_fecha_emision, t.compra_estado,
         t.unidades_cerradas, t.monto_esperado, t.cerrado_en, t.created_at, t.resuelto
  from (
    -- (a) las notas que ya existen
    select 'nota'::text as clase,
           n.id,
           n.compra_id,
           c.documento,
           c.proveedor_id,
           p.nombre as proveedor_nombre,
           n.serie_numero,
           n.fecha,
           n.monto,
           n.aplicado,
           (n.monto - n.aplicado)::numeric(12, 2) as a_favor,
           n.igv,
           n.motivo,
           n.nota,
           n.cierre_id,
           c.total as compra_total,
           c.saldo as compra_saldo,
           c.fecha_emision as compra_fecha_emision,
           c.estado as compra_estado,
           k.cantidad as unidades_cerradas,
           null::numeric as monto_esperado,
           k.created_at as cerrado_en,
           n.created_at,
           true as resuelto
    from retail.compra_notas_credito n
    join retail.compras c on c.id = n.compra_id
    join retail.proveedores p on p.id = c.proveedor_id
    left join retail.compra_item_cierres k on k.id = n.cierre_id

    union all

    -- (b) los faltantes cerrados que todavía no tienen su nota por faltante
    select 'pendiente'::text,
           f.cierre_id,
           f.compra_id,
           f.documento,
           f.proveedor_id,
           f.proveedor_nombre,
           null::text,
           null::date,
           null::numeric,
           null::numeric,
           null::numeric,
           null::numeric,
           'faltante'::text,
           null::text,
           f.cierre_id,
           f.compra_total,
           f.compra_saldo,
           f.compra_fecha_emision,
           f.compra_estado,
           f.unidades_cerradas,
           f.monto_esperado,
           f.cerrado_en,
           f.cerrado_en,
           f.resuelto
    from (
      select c.id as compra_id,
             c.documento,
             c.proveedor_id,
             p.nombre as proveedor_nombre,
             c.total as compra_total,
             c.saldo as compra_saldo,
             c.fecha_emision as compra_fecha_emision,
             c.estado as compra_estado,
             sum(k.cantidad)::integer as unidades_cerradas,
             round(
               sum(k.cantidad * i.costo_unitario)
                 * (1 + case when c.subtotal > 0 then c.igv / c.subtotal else 0 end),
               2
             ) as monto_esperado,
             max(k.created_at) as cerrado_en,
             (array_agg(k.id order by k.created_at desc, k.id desc))[1] as cierre_id,
             (c.recibido_cantidad + c.cerrado_cantidad >= c.facturado_cantidad) as resuelto
      from retail.compras c
      join retail.proveedores p on p.id = c.proveedor_id
      join retail.compra_items i on i.compra_id = c.id
      join retail.compra_item_cierres k on k.compra_item_id = i.id
      where c.estado = 'vigente'
        and not exists (
          select 1 from retail.compra_notas_credito n
          where n.compra_id = c.id and n.motivo = 'faltante'
        )
      group by c.id, p.nombre
    ) f
  ) t
  order by coalesce(t.fecha, t.cerrado_en::date) desc nulls last, t.created_at desc, t.id;
$function$;

comment on function retail.notas_credito_tablero() is
  'Tablero de /compras/notas-credito: una fila por nota registrada (clase=nota) y una por faltante cerrado sin nota (clase=pendiente). Solo líder (ADR-0126).';

revoke all on function retail.notas_credito_tablero() from public, anon;
grant execute on function retail.notas_credito_tablero() to authenticated;

-- ---------------------------------------------------------------------------
-- 2a. El escritor del reembolso, compartido.
--
-- `registrar_reembolso_proveedor` guardaba el movimiento con su propia mano. Ahora ese cuerpo vive
-- acá y lo usan las DOS puertas: la RPC de siempre («el proveedor me devolvió plata de un saldo que
-- ya tenía») y la nota con `p_destino = 'reembolso'` («me la devuelve al momento»). Una sola fuente
-- de verdad para escribir en `proveedor_creditos` (principio 4): si mañana el reembolso pide un dato
-- más, se agrega en un solo lugar.
--
-- `p_nota_credito_id` es la trazabilidad exacta de la devolución: de CUÁL nota salió. No contradice
-- la decisión D3 (que es sobre «Aplicada», y sobre no tocar las funciones de pago): acá la columna
-- ya existe en la tabla, el CHECK `proveedor_creditos_origen` la admite en un reembolso, y se llena
-- sin cambiar ninguna función de pago. `fn_proveedor_creditos()` la lee para mostrar la serie.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_insertar_reembolso_proveedor(
  p_proveedor_id uuid,
  p_monto numeric,
  p_metodo text,
  p_referencia text,
  p_fecha date,
  p_nota text,
  p_persona uuid,
  p_nota_credito_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  v_saldo numeric(12, 2);
  v_id uuid;
begin
  if p_monto is null or p_monto <= 0 or p_monto <> round(p_monto, 2) then
    raise exception 'El reembolso necesita un monto mayor a cero con hasta 2 decimales';
  end if;
  if coalesce(p_metodo, '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
    raise exception 'Medio de devolución no reconocido: %', coalesce(p_metodo, '(vacío)');
  end if;
  if p_fecha is not null and p_fecha > fn_hoy_lima() then
    raise exception 'La fecha del reembolso no puede ser futura';
  end if;

  -- Candado del proveedor: dos reembolsos simultáneos no pueden pasarse del saldo entre los dos.
  perform 1 from proveedores where id = p_proveedor_id for update;
  if not found then
    raise exception 'El proveedor % no existe', p_proveedor_id;
  end if;
  v_saldo := fn_saldo_favor_proveedor(p_proveedor_id);
  if p_monto > v_saldo then
    raise exception 'El saldo a favor con este proveedor es S/ % y el reembolso es de S/ %', v_saldo, p_monto;
  end if;

  insert into proveedor_creditos (proveedor_id, tipo, monto, fecha, metodo, referencia, nota, usuario_id, nota_credito_id)
    values (p_proveedor_id, 'reembolso', p_monto, coalesce(p_fecha, fn_hoy_lima()), p_metodo,
            nullif(trim(coalesce(p_referencia, '')), ''), nullif(trim(coalesce(p_nota, '')), ''),
            p_persona, p_nota_credito_id)
    returning id into v_id;
  return v_id;
end;
$function$;

comment on function retail.fn_insertar_reembolso_proveedor(uuid, numeric, text, text, date, text, uuid, uuid) is
  'Escribe el reembolso en proveedor_creditos con sus candados. Interno: el permiso lo pone quien la llama (registrar_reembolso_proveedor o registrar_nota_credito_compra).';

-- Interna: nadie la llama desde la API. El permiso lo revisa la RPC de afuera.
revoke all on function retail.fn_insertar_reembolso_proveedor(uuid, numeric, text, text, date, text, uuid, uuid)
  from public, anon, authenticated;

-- La RPC de siempre: mismo nombre, misma firma, mismas validaciones y mismos mensajes; ahora delega
-- la escritura. Sin `nota_credito_id` (este reembolso sale del saldo, no de una nota concreta).
create or replace function retail.registrar_reembolso_proveedor(
  p_proveedor_id uuid,
  p_monto numeric,
  p_metodo text,
  p_referencia text default null,
  p_fecha date default null,
  p_nota text default null
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  v_persona uuid;
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar reembolsos de proveedores';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  return fn_insertar_reembolso_proveedor(p_proveedor_id, p_monto, p_metodo, p_referencia, p_fecha, p_nota, v_persona, null);
end;
$function$;

revoke all on function retail.registrar_reembolso_proveedor(uuid, numeric, text, text, date, text) from public, anon;
grant execute on function retail.registrar_reembolso_proveedor(uuid, numeric, text, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2b. Registrar la nota diciendo QUÉ PASA CON EL DINERO.
--
-- `drop` explícito de la firma de 7 parámetros: `create or replace` con otra lista de parámetros NO
-- reemplaza, CREA UNA SOBRECAGA (ADR-0009). Al final del archivo se verifica que quede una sola.
-- Los 7 parámetros de siempre conservan nombre y orden (Supabase llama por nombre); los 4 nuevos van
-- al final y con valor por defecto, así que toda llamada de hoy sigue igual.
--
-- La regla del dinero: la nota SIEMPRE baja primero la deuda de su comprobante (eso lo hace
-- `fn_insertar_nota_credito_compra`, que no se toca). Lo que sobra —y solo lo que sobra— es lo que
-- se puede devolver. Por eso no hay parámetro de monto del reembolso: lo decide la función.
-- ---------------------------------------------------------------------------
drop function if exists retail.registrar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid);

create or replace function retail.registrar_nota_credito_compra(
  p_compra_id uuid,
  p_serie_numero text,
  p_fecha date,
  p_monto numeric,
  p_motivo text,
  p_nota text default null,
  p_cierre_id uuid default null,
  p_destino text default 'a_favor',
  p_reembolso_metodo text default null,
  p_reembolso_fecha date default null,
  p_reembolso_referencia text default null
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  v_persona uuid;
  v_proveedor uuid;
  v_documento text;
  v_id uuid;
  v_sobrante numeric(12, 2);
  v_fecha date;
  v_hoy date := fn_hoy_lima();
begin
  -- Dinero: solo quien puede registrar pagos (líder).
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar notas de crédito de proveedores';
  end if;

  if coalesce(p_destino, '') not in ('a_favor', 'reembolso') then
    raise exception 'Destino del dinero de la nota no reconocido: % (solo «a_favor» o «reembolso»)',
      coalesce(nullif(p_destino, ''), '(vacío)');
  end if;

  -- Candado del comprobante: la nota se valida contra el saldo, y un pago
  -- simultáneo no puede dejarlo por debajo de la nota.
  select proveedor_id, documento into v_proveedor, v_documento from compras where id = p_compra_id for update;
  if not found then
    raise exception 'La compra % no existe', p_compra_id;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  v_id := fn_insertar_nota_credito_compra(p_compra_id, p_serie_numero, p_fecha, p_monto, p_motivo, p_nota, p_cierre_id, v_persona);

  -- Con «queda a favor» (el valor por defecto, D6) acá no pasa nada más: el estado que deja esta
  -- función es exactamente el de siempre. Los tres datos de la devolución se ignoran a propósito —
  -- el destino lo decide la elección del líder, no lo que haya quedado escrito en el formulario.
  if p_destino = 'reembolso' then
    -- El monto devuelto es EXACTAMENTE el sobrante que la nota dejó a favor. Nunca lo que bajó de
    -- la deuda: eso no es plata que el proveedor tenga que sacar del bolsillo.
    select monto - aplicado into v_sobrante from compra_notas_credito where id = v_id;
    if coalesce(v_sobrante, 0) <= 0 then
      raise exception 'La nota % solo baja la deuda de %: no sobra nada que el proveedor pueda devolver. Regístrala como «queda a favor».',
        upper(trim(coalesce(p_serie_numero, ''))), coalesce(v_documento, '(sin documento)');
    end if;

    v_fecha := coalesce(p_reembolso_fecha, v_hoy);
    if v_fecha > v_hoy then
      raise exception 'La fecha de la devolución (%) no puede ser futura: hoy es %',
        to_char(v_fecha, 'DD/MM/YYYY'), to_char(v_hoy, 'DD/MM/YYYY');
    end if;
    if v_fecha < p_fecha then
      raise exception 'La fecha de la devolución (%) no puede ser anterior a la de la nota de crédito (%)',
        to_char(v_fecha, 'DD/MM/YYYY'), to_char(p_fecha, 'DD/MM/YYYY');
    end if;

    -- Misma transacción: si esto falla, la nota tampoco queda. Nunca una nota con una devolución a
    -- medias (principio 2).
    perform fn_insertar_reembolso_proveedor(v_proveedor, v_sobrante, p_reembolso_metodo,
                                            p_reembolso_referencia, v_fecha, null, v_persona, v_id);
  end if;

  return v_id;
end;
$function$;

comment on function retail.registrar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid, text, text, date, text) is
  'Registra la nota de crédito del proveedor y, con p_destino = reembolso, devuelve el sobrante en la MISMA transacción. p_destino: a_favor (por defecto, D6) | reembolso. Solo líder.';

revoke all on function retail.registrar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid, text, text, date, text) from public, anon;
grant execute on function retail.registrar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid, text, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. El adjunto de la nota (D5).
--
-- `compra_adjuntos` cuelga del comprobante. Un comprobante con dos notas deja un cajón de PDFs sin
-- saber cuál es de cuál — y el PDF de la nota es justo lo que se busca en una auditoría.
--
-- La FK es COMPUESTA a propósito: (compra_id, nota_credito_id) → (compra_id, id). Así la base no
-- deja colgar el adjunto de una nota de OTRO comprobante; y como `nota_credito_id` es nulo en los
-- adjuntos normales, con MATCH SIMPLE la FK simplemente no aplica y todo lo de hoy sigue igual.
--
-- Permisos: la tabla solo tiene política de SELECT (`fn_puede_ver_dinero_de_compras`) y se escribe
-- por RPC `security definer`; una columna más no le abre nada a un integrante.
-- ---------------------------------------------------------------------------
alter table retail.compra_adjuntos
  add column if not exists nota_credito_id uuid;

comment on column retail.compra_adjuntos.nota_credito_id is
  'La nota de crédito de la que es evidencia este archivo (D5). NULL = adjunto del comprobante, como siempre.';

-- Orden obligatorio al re-ejecutar: primero se suelta la FK, recién después su clave candidata
-- (Postgres no deja borrar un unique del que cuelga una FK).
alter table retail.compra_adjuntos
  drop constraint if exists compra_adjuntos_nota_credito_id_fkey,
  drop constraint if exists compra_adjuntos_nota_de_su_compra;

-- clave candidata para la FK compuesta (el PK sigue siendo `id`; esto es solo el par que la FK necesita)
alter table retail.compra_notas_credito
  drop constraint if exists compra_notas_credito_id_compra_key,
  add constraint compra_notas_credito_id_compra_key unique (id, compra_id);

alter table retail.compra_adjuntos
  add constraint compra_adjuntos_nota_de_su_compra
    foreign key (nota_credito_id, compra_id)
    references retail.compra_notas_credito (id, compra_id);

create index if not exists compra_adjuntos_nota_credito_idx
  on retail.compra_adjuntos (nota_credito_id)
  where nota_credito_id is not null and archivado_en is null;

-- La RPC de adjuntos gana el parámetro (sin él la columna no se podría llenar: la tabla no tiene
-- política de INSERT). Firma vieja al `drop`, parámetro nuevo al final y con valor por defecto: las
-- llamadas de hoy (`lib/adjuntos-compra.ts`) no cambian. De paso se le cierra el EXECUTE a PUBLIC,
-- que lo tenía abierto por descuido (el candado interno igual la frenaba).
drop function if exists retail.registrar_adjunto_compra(uuid, text, text, text, integer);

create or replace function retail.registrar_adjunto_compra(
  p_compra_id uuid,
  p_ruta text,
  p_nombre text,
  p_tipo text,
  p_bytes integer,
  p_nota_credito_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  v_compra retail.compras%rowtype;
  v_persona uuid;
  v_id uuid;
begin
  if not retail.fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para adjuntar documentos a una factura';
  end if;
  select * into v_compra from retail.compras where id = p_compra_id;
  if v_compra.id is null then
    raise exception 'La compra % no existe', p_compra_id;
  end if;
  if v_compra.estado = 'anulada' then
    raise exception 'La factura %-% está anulada, no acepta adjuntos', v_compra.serie, v_compra.numero;
  end if;
  if retail.fn_texto_o_null(p_nombre) is null then
    raise exception 'El adjunto necesita un nombre de archivo';
  end if;
  if p_ruta not like p_compra_id::text || '/%' then
    raise exception 'El archivo tiene que estar en la carpeta de esta factura';
  end if;
  if p_tipo not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif') then
    raise exception 'Solo se aceptan PDF o imágenes (JPG, PNG, WebP, HEIC); llegó %', p_tipo;
  end if;
  if p_bytes is null or p_bytes <= 0 or p_bytes > 10 * 1024 * 1024 then
    raise exception 'El archivo tiene que pesar entre 1 byte y 10 MB';
  end if;
  -- La nota tiene que ser de ESTA factura (la FK compuesta lo vuelve a exigir, pero acá el mensaje
  -- se entiende).
  if p_nota_credito_id is not null and not exists (
    select 1 from retail.compra_notas_credito n where n.id = p_nota_credito_id and n.compra_id = p_compra_id
  ) then
    raise exception 'Esa nota de crédito no es de la factura %-%', v_compra.serie, v_compra.numero;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into retail.compra_adjuntos (compra_id, ruta, nombre, tipo, bytes, subido_por, nota_credito_id)
  values (p_compra_id, p_ruta, trim(p_nombre), p_tipo, p_bytes, v_persona, p_nota_credito_id)
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function retail.registrar_adjunto_compra(uuid, text, text, text, integer, uuid) from public, anon;
grant execute on function retail.registrar_adjunto_compra(uuid, text, text, text, integer, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. El buscador de facturas para elegir el origen de la nota.
--
-- `listar_compras` busca por documento y por nombre de proveedor, pero NO por monto: quien tiene la
-- nota en la mano suele acordarse del importe («la de mil ciento ochenta»), no del número de
-- factura. Se hace una función aparte —y NO se toca `listar_compras`— porque esa la usan otras tres
-- pantallas con paginación por cursor y no se le mete un criterio nuevo por un caso de este módulo.
--
-- Cómo busca el monto: se le quita todo lo que no sea dígito o punto («1,180» → «1180») y se compara
-- por PREFIJO contra el total y el saldo escritos sin separador de miles («1180.00»). Así «1180»,
-- «1,180» y «1180.00» encuentran S/ 1,180.00, y «118» lo encuentra mientras se escribe.
-- ---------------------------------------------------------------------------
drop function if exists retail.fn_facturas_para_nota_credito(text, uuid, text, integer);

create function retail.fn_facturas_para_nota_credito(
  p_texto text default null,
  p_proveedor_id uuid default null,
  p_filtro text default 'todas',
  p_limite integer default 20
)
returns table (
  id uuid,
  documento text,
  proveedor_id uuid,
  proveedor_nombre text,
  fecha_emision date,
  fecha_vencimiento date,
  total numeric,
  pagado numeric,
  saldo numeric,
  estado text,
  tiene_nota boolean,
  notas_monto numeric
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $function$
declare
  v_texto text := nullif(trim(coalesce(p_texto, '')), '');
  v_filtro text := lower(coalesce(nullif(trim(coalesce(p_filtro, '')), ''), 'todas'));
  v_limite integer := greatest(1, least(coalesce(p_limite, 20), 200));
  v_digitos text;
begin
  -- CANDADO (ADR-0126): solo el líder ve dinero de Compras.
  perform retail.fn_exige_dinero_de_compras('las facturas de proveedores');

  if v_filtro not in ('todas', 'con_saldo', 'pagadas') then
    raise exception 'Filtro de búsqueda no reconocido: % (solo «todas», «con_saldo» o «pagadas»)', v_filtro;
  end if;

  -- «S/ 1,180.00», «1180», «1,180» → «1180». Si lo que queda no es un número, no se busca por monto.
  v_digitos := nullif(regexp_replace(coalesce(v_texto, ''), '[^0-9.]', '', 'g'), '');
  if v_digitos is not null and v_digitos !~ '^[0-9]+(\.[0-9]{0,2})?$' then
    v_digitos := null;
  end if;

  return query
    select c.id,
           c.documento,
           c.proveedor_id,
           p.nombre,
           c.fecha_emision,
           c.fecha_vencimiento,
           c.total,
           c.pagado,
           c.saldo,
           c.estado_pago,
           (n.veces > 0) as tiene_nota,
           n.suma as notas_monto
    from retail.compras c
    join retail.proveedores p on p.id = c.proveedor_id
    cross join lateral (
      select count(*) as veces, coalesce(sum(x.monto), 0)::numeric(12, 2) as suma
      from retail.compra_notas_credito x where x.compra_id = c.id
    ) n
    where c.estado = 'vigente'
      and (p_proveedor_id is null or c.proveedor_id = p_proveedor_id)
      and (v_filtro <> 'con_saldo' or c.saldo > 0)
      and (v_filtro <> 'pagadas' or c.estado_pago = 'pagada')
      and (
        v_texto is null
        or c.documento ilike '%' || v_texto || '%'
        or p.nombre ilike '%' || v_texto || '%'
        or coalesce(p.ruc, '') ilike '%' || v_texto || '%'
        or (v_digitos is not null and (
              to_char(c.total, 'FM9999999990.00') like v_digitos || '%'
              or to_char(c.saldo, 'FM9999999990.00') like v_digitos || '%'
              or c.total = v_digitos::numeric
              or c.saldo = v_digitos::numeric
           ))
      )
    order by c.fecha_emision desc, c.created_at desc, c.id desc
    limit v_limite;
end;
$function$;

comment on function retail.fn_facturas_para_nota_credito(text, uuid, text, integer) is
  'Busca comprobantes vigentes para elegir el origen de una nota de crédito: por documento, proveedor (nombre o RUC) y por MONTO (total o saldo). Solo líder.';

revoke all on function retail.fn_facturas_para_nota_credito(text, uuid, text, integer) from public, anon;
grant execute on function retail.fn_facturas_para_nota_credito(text, uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Candado del propio script: una sola firma de cada función tocada (ADR-0009).
--    Si alguna quedó duplicada, la migración aborta y no deja la base a medias.
-- ---------------------------------------------------------------------------
do $verifica$
declare
  f record;
begin
  for f in
    select p.proname, count(*) as firmas
    from pg_proc p
    where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('registrar_nota_credito_compra', 'registrar_reembolso_proveedor',
                        'fn_insertar_reembolso_proveedor', 'registrar_adjunto_compra',
                        'notas_credito_tablero', 'fn_facturas_para_nota_credito')
    group by p.proname
    having count(*) > 1
  loop
    raise exception '% quedó con % firmas vivas: sobrecarga (ADR-0009). Revisa el drop function correspondiente.',
      f.proname, f.firmas;
  end loop;
end
$verifica$;
