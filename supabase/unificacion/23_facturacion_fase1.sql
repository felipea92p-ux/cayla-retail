-- ============================================================================
-- 23 — EL CÉNTIMO DEL COMPROBANTE
-- Se pega en el SQL Editor de PRODUCCIÓN (proyecto de cayla-DYNAMIC,
-- vovjyyiafkxteijimpuy). Solo toca el schema `retail`.
--
-- ORDEN DE PEGADO DE ESTA TANDA:  22  →  23  →  24  →  25
--
-- ############################################################################
-- ##  REESCRITO EL 2026-09-08. La versión del 05-sep creaba `comprobantes.   ##
-- ##  items` y `actualizar_transmision_comprobante`. YA NO: ambos existen    ##
-- ##  hoy en producción (verificado con information_schema y pg_proc), los   ##
-- ##  pegó otra sesión. Este archivo quedó reducido a UNA LÍNEA por función. ##
-- ############################################################################
--
-- ---------------------------------------------------------------------------
-- EL PROBLEMA: la boleta le cobra un céntimo de más o de menos a la clienta
-- ---------------------------------------------------------------------------
-- Cuando la pantalla de Facturación no manda el desglose por prenda, las dos
-- funciones arman un ítem genérico con el SUBTOTAL YA REDONDEADO a céntimos:
--
--     'precio_unitario', p_subtotal          ← lo que hay hoy en producción
--
-- Lucode y SUNAT no se quedan con ese número: re-derivan el total como
-- precio_unitario × cantidad × 1.18. Y un subtotal redondeado a 2 decimales,
-- multiplicado de vuelta, no reconstruye el total original.
--
-- Medido sobre el rango real de precios de CAYLA (barrido de S/1,00 a S/2.000,00
-- en pasos de S/0,10): 3.059 de 19.991 precios descuadran un céntimo — el 15,3 %.
-- Entre ellos, cuatro precios que CAYLA usa de verdad:
--     S/19,90  → el documento sale por 19,89
--     S/109,90 → sale por 109,91
--     S/129,90 → sale por 129,89
--     S/349,90 → sale por 349,91
-- Con `round(p_total / 1.18, 6)` el descuadre desaparece por completo: Lucode
-- acepta 6 decimales en `precio_unitario` justamente para esto.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ ESTO ES URGENTE HOY Y NO LO ERA EL VIERNES
-- ---------------------------------------------------------------------------
-- El arreglo del frontend que manda `p_items` explícito (y por lo tanto evita
-- el fallback) está escrito pero NO desplegado — vive sin commitear en la rama
-- `claude/project-start-071b20`. La app que hoy corre en Vercel NO manda ítems.
-- Es decir: con `series_comprobantes` en 0, la PRIMERA boleta real que se emita
-- va a pasar por este fallback. Y un comprobante mal emitido no se corrige: se
-- anula con nota de crédito, con el correlativo ya quemado ante SUNAT.
--
-- Por eso el arreglo va en la BASE y no solo en la pantalla. La regla fiscal no
-- puede depender de que un componente de React se acuerde de mandar el desglose:
-- cualquier llamada futura que omita ítems (la integración con `ventas` de la
-- semana 2, un script, otra pantalla) reintroduce el céntimo en silencio.
--
-- ---------------------------------------------------------------------------
-- QUÉ NO CAMBIA (a propósito)
-- ---------------------------------------------------------------------------
-- Los dos cuerpos de abajo son los de PRODUCCIÓN de hoy, copiados con
-- pg_get_functiondef y pegados sin tocar nada más: mismas firmas (10 y 7
-- argumentos), mismas validaciones, mismo orden, mismo insert. Lo único distinto
-- es `p_subtotal` → `round(p_total / 1.18, 6)` en el ítem genérico.
--
-- `subtotal`, `igv` y `total` de la CABECERA siguen redondeados a céntimo, y así
-- debe ser: son plata que se declara y se cobra. El que necesita precisión es el
-- factor unitario, que es un número intermedio del que SUNAT deriva el total.
-- No se "arregla" redondeándolo más adelante: si alguien lo baja a 2 decimales,
-- vuelve el descuadre.
--
-- 1.18 = 1 + IGV (18 %), el mismo factor que usa `packages/shared`.
--
-- REVERSIBLE: sí. Volver atrás es recrear las dos funciones con `p_subtotal` en
-- lugar de la expresión — el cuerpo anterior queda descrito acá arriba.
-- ============================================================================

begin;

-- ============================================================================
-- 1. emitir_comprobante — boletas y facturas
--    Cuerpo de producción (pg_get_functiondef, 2026-09-08) con la única línea
--    del ítem genérico corregida.
-- ============================================================================

create or replace function retail.emitir_comprobante(
  p_sede_id uuid,
  p_tipo text,
  p_subtotal numeric,
  p_igv numeric,
  p_total numeric,
  p_venta_id uuid default null::uuid,
  p_cliente_tipo_doc text default 'sin_documento'::text,
  p_cliente_num_doc text default null::text,
  p_cliente_nombre text default null::text,
  p_items jsonb default null::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = retail, public
as $function$
declare
  v_persona_id uuid;
  v_serie text;
  v_numero integer;
  v_id uuid;
  v_items jsonb;
begin
  if not retail.puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para emitir comprobantes de esa sede';
  end if;
  if p_tipo not in ('boleta', 'factura', 'nota_credito', 'nota_debito') then
    raise exception 'Tipo de comprobante inválido: %', p_tipo;
  end if;
  if p_total is null or p_total <= 0 then
    raise exception 'El total del comprobante debe ser mayor a 0';
  end if;
  if p_tipo = 'factura' and (p_cliente_tipo_doc <> 'ruc' or p_cliente_num_doc is null) then
    raise exception 'Una factura requiere el RUC del cliente';
  end if;

  -- Ítem genérico de respaldo, para cuando la pantalla no manda desglose por
  -- prenda. `round(p_total / 1.18, 6)` y NO `p_subtotal`: SUNAT re-deriva el
  -- total como precio × cantidad × 1.18, y un subtotal redondeado a céntimos no
  -- reconstruye el total original en el 15 % de los precios de CAYLA (S/19,90,
  -- S/129,90 y S/349,90 entre ellos). Los 6 decimales son deliberados — ver la
  -- cabecera antes de "simplificarlos".
  v_items := coalesce(
    p_items,
    jsonb_build_array(jsonb_build_object(
      'descripcion', 'Venta de mercadería',
      'cantidad', 1,
      'precio_unitario', round(p_total / 1.18, 6)
    ))
  );
  if jsonb_array_length(v_items) = 0 then
    raise exception 'El comprobante no tiene ítems';
  end if;

  select id into v_persona_id from public.personas where auth_user_id = auth.uid();

  select r.serie, r.numero into v_serie, v_numero from retail.fn_reservar_numero_serie(p_sede_id, p_tipo) r;

  insert into comprobantes (
    venta_id, sede_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc,
    cliente_nombre, subtotal, igv, total, usuario_id, items
  ) values (
    p_venta_id, p_sede_id, p_tipo, v_serie, v_numero, p_cliente_tipo_doc, p_cliente_num_doc,
    p_cliente_nombre, p_subtotal, p_igv, p_total, v_persona_id, v_items
  ) returning id into v_id;

  return v_id;
end;
$function$;

-- ============================================================================
-- 2. emitir_nota — notas de crédito y débito
--    Mismo tratamiento. Acá el fallback tiene tres escalones: los ítems que
--    mandan, si no los del comprobante original (lo correcto para una
--    devolución: se devuelven las mismas prendas), y recién al final el
--    genérico — que es el que llevaba el céntimo mal.
-- ============================================================================

create or replace function retail.emitir_nota(
  p_comprobante_original_id uuid,
  p_tipo text,
  p_motivo text,
  p_subtotal numeric,
  p_igv numeric,
  p_total numeric,
  p_items jsonb default null::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = retail, public
as $function$
declare
  v_original comprobantes%rowtype;
  v_persona_id uuid;
  v_serie text;
  v_numero integer;
  v_id uuid;
  v_items jsonb;
begin
  if p_tipo not in ('nota_credito', 'nota_debito') then
    raise exception 'Tipo de nota inválido: %', p_tipo;
  end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'La nota requiere un motivo';
  end if;
  if p_total is null or p_total <= 0 then
    raise exception 'El total de la nota debe ser mayor a 0';
  end if;

  select * into v_original from comprobantes where id = p_comprobante_original_id;
  if not found then
    raise exception 'El comprobante original % no existe', p_comprobante_original_id;
  end if;
  if v_original.estado <> 'aceptado' then
    raise exception 'El comprobante original debe estar aceptado por SUNAT (estado actual: %)', v_original.estado;
  end if;
  if not retail.puede_operar_sede(v_original.sede_id) then
    raise exception 'No tienes permiso para emitir notas de esa sede';
  end if;

  -- Mismo arreglo del céntimo que en emitir_comprobante, en el tercer escalón.
  v_items := coalesce(
    p_items,
    v_original.items,
    jsonb_build_array(jsonb_build_object(
      'descripcion', 'Ajuste — ' || p_motivo,
      'cantidad', 1,
      'precio_unitario', round(p_total / 1.18, 6)
    ))
  );

  select id into v_persona_id from public.personas where auth_user_id = auth.uid();

  select r.serie, r.numero into v_serie, v_numero from retail.fn_reservar_numero_serie(v_original.sede_id, p_tipo) r;

  insert into comprobantes (
    venta_id, sede_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre,
    subtotal, igv, total, usuario_id, comprobante_original_id, motivo, items
  ) values (
    v_original.venta_id, v_original.sede_id, p_tipo, v_serie, v_numero,
    v_original.cliente_tipo_doc, v_original.cliente_num_doc, v_original.cliente_nombre,
    p_subtotal, p_igv, p_total, v_persona_id, p_comprobante_original_id, p_motivo, v_items
  ) returning id into v_id;

  return v_id;
end;
$function$;

commit;

-- ============================================================================
-- CÓMO SE VERIFICA — pegar DESPUÉS del commit. Las 3 columnas deben dar `true`.
-- ============================================================================
--
-- select
--   (select bool_and(pg_get_functiondef(oid) ~* 'round\(p_total / 1\.18, 6\)')
--      from pg_proc where pronamespace='retail'::regnamespace
--      and proname in ('emitir_comprobante','emitir_nota'))            as centimo_corregido,
--   -- las firmas NO cambiaron: 10 y 7 argumentos, una sola versión de cada una
--   ((select count(*) from pg_proc where pronamespace='retail'::regnamespace
--       and proname='emitir_comprobante') = 1
--    and (select pronargs from pg_proc where pronamespace='retail'::regnamespace
--           and proname='emitir_comprobante') = 10)                    as sin_sobrecarga_fantasma,
--   ((select count(*) from pg_proc where pronamespace='retail'::regnamespace
--       and proname='emitir_nota') = 1
--    and (select pronargs from pg_proc where pronamespace='retail'::regnamespace
--           and proname='emitir_nota') = 7)                            as nota_sin_sobrecarga;
--
-- LA PRUEBA ARITMÉTICA, con los precios reales de CAYLA. `centimo` debe ser
-- distinto del precio en varias filas; `seis_dec` debe ser IGUAL en todas:
--
--   select p as precio,
--          round(round(p/1.18, 2) * 1.18, 2) as centimo,
--          round(round(p/1.18, 6) * 1.18, 2) as seis_dec
--     from unnest(array[19.90, 39.90, 79.90, 109.90, 129.90, 199.90, 349.90]::numeric[]) as p;
--
-- Y la prueba de negocio, cuando ya haya serie registrada: emitir una boleta de
-- S/129,90 en sandbox y abrir el PDF. Debe decir 129,90 exacto, no 129,89.
-- ============================================================================
