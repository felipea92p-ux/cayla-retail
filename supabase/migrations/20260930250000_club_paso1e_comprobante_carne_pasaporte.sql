-- ============================================================================
-- 20260930250000_club_paso1e_comprobante_carne_pasaporte.sql — CAYLA V2 · Club de clientas · paso 1, tanda 1e
-- ADR-0288, DECISIÓN 3 («el comprobante acepta carné y pasaporte»). OK de Felipe: «Lo que decidió Felipe (2026-09-29)»,
-- punto 1. Toca la emisión legal (CLAUDE.md, «Reglas de ejecución»): por eso es un archivo aparte de las tandas 1a–1d.
-- Una sola parte: sin políticas ni `drop trigger` (CLAUDE.md, «Políticas y deadlocks»; ver DECIDÍ).
--
-- EL PROBLEMA. Desde la tanda 1a la ficha de una clienta guarda su documento con tipo (DNI, carné de extranjería o
-- pasaporte), pero el comprobante solo acepta `dni`, `ruc` y `sin_documento` (candado `comprobantes_cliente_tipo_doc_check`,
-- 0010). Una clienta extranjera compra y su boleta sale «sin documento», solo con su nombre: SUNAT no sabe a quién se le
-- vendió, y `fn_ligar_ventas_por_documento` (1a, CL-27) nunca encuentra esas compras cuando ella se registra con su carné,
-- porque compara `comprobantes.cliente_tipo_doc` con el tipo de la ficha.
--
-- QUÉ HACE
--   1. `emitir_comprobante` (el único lugar por donde nace un comprobante con documento: lo llaman `registrar_venta`,
--      `convertir_proforma_a_comprobante`, `separar_prendas`, `abonar_separacion` y `entregar_separacion`): si el documento
--      es un carné o un pasaporte, lo limpia (sin espacios, en mayúsculas) y le exige su formato con `fn_documento_clienta`
--      (1a: los mismos mensajes que la ficha, hint `documento_invalido`), ANTES de reservar el correlativo. Un reemplazo
--      anclado sobre su cuerpo vivo, con candado de versión. El DNI, el RUC y «sin documento» siguen como estaban.
--   2. `comprobantes`: el candado de tipos suma `carne_extranjeria` y `pasaporte`, y un candado nuevo
--      (`comprobantes_carne_pasaporte_formato`) exige que esos dos lleven número, de 6 a 12 letras o dígitos en mayúsculas
--      (la regla de `fn_documento_clienta` y de `clientas_documento_formato`). Una factura sigue exigiendo RUC
--      (`comprobantes_factura_requiere_ruc`, sin tocar).
--   Lo que NO cambia y por qué alcanza:
--   - `registrar_venta` y `convertir_proforma_a_comprobante` pasan `p_cliente_tipo_doc` tal cual a `emitir_comprobante`.
--   - `emitir_nota` (notas de crédito y débito) copia el tipo y el número del comprobante que corrige.
--   - `abonar_separacion` y `entregar_separacion` copian el del comprobante anterior del apartado.
--   - `fn_ligar_ventas_por_documento` ya compara por tipo: un carné empieza a ligar solo, en cuanto el comprobante lo guarda.
--   Todas se revisaron en su definición viva (pg_get_functiondef), 2026-09-30: ninguna rechaza ni traduce estos tipos.
--   La que sí traduce es `separar_prendas`: arma `dni` o `sin_documento` desde su parámetro `p_clienta_dni` (solo dígitos).
--   Un apartado a una clienta con carné sigue saliendo «sin documento» con su nombre: ver DESCARTÉ.
--   El envío a Lucode (catálogo 06 de SUNAT: «4» carné de extranjería, «7» pasaporte), la caja y el papel cambian en la web
--   (`lib/lucode.ts`, `lib/documento-comprobante-reglas.ts`), no aquí.
--
-- DECIDÍ:
--   - Validar en `emitir_comprobante` y no solo con el candado de la tabla: el candado solo dice «violates check constraint»;
--     la función dice qué está mal («El carné de extranjería tiene de 6 a 12 letras o números, sin guiones.») y normaliza lo
--     que un teclado deja pasar (minúsculas, espacios). Y lo hace antes de reservar el número de la serie.
--   - Una sola parte, con los `alter` AL FINAL. La regla de partes de ADR-0195 es por las POLÍTICAS (toman `auth` y `storage`
--     en exclusiva): aquí no hay políticas ni `drop trigger`. Esta transacción toma en exclusiva una sola tabla,
--     `comprobantes`, y recién al final: si una venta la está usando, espera hasta 3 s (`lock_timeout`) y falla limpio, sin
--     tomar nada más que pueda cruzarse con esa venta (sin ciclo, no hay deadlock). El reemplazo de la función no bloquea tablas.
--   - Carné y pasaporte, aunque el DNI no tenga candado de formato en `comprobantes`: el DNI viene así desde 0010 y hay
--     comprobantes ya emitidos; ponerle candado ahora es otra decisión, no la de esta tanda.
-- DESCARTÉ:
--   - Apartados con carné o pasaporte: `separaciones.clienta_dni` y el parámetro `p_clienta_dni` de `separar_prendas` (y de
--     `separar_pedido_para_apartar`) son solo de DNI. Llevarlo a los apartados es cambiar la tabla y la firma de dos funciones
--     y el formulario de Apartar: su propia tanda, en el backlog. Mientras tanto, ese apartado sale «sin documento» con su
--     nombre, igual que hoy (principio 9).
--   - Un tipo `carne_extranjeria`/`pasaporte` sin número que caiga solo a `sin_documento`: esconde un error de la caja.
--     La pantalla ya manda `sin_documento` cuando el número está vacío; si llega vacío, es un error y se dice.
-- SE ROMPE SI:
--   - Se despliega la web de la tanda 1e ANTES de pegar esto: el candado viejo rechaza la boleta a un carné y, con ella, la
--     venta ENTERA (registrar_venta es una transacción). Por eso el orden es al revés que en la 1a: primero esto, después la web.
--   - SUNAT (vía Lucode) no acepta el código «4» o «7» con este número: la boleta queda `rechazado`, como cualquier rechazo,
--     y la venta NO se pierde. Por eso Felipe emite una boleta de prueba real a un carné antes de dar la tanda por cerrada. Si
--     se rechazara, se vuelve atrás en la web (`documentoParaComprobante` otra vez solo DNI): esta migración puede quedar.
--
-- CANDADO DE VERSIÓN. Antes de tocar nada, la sección 0 compara el md5 NORMALIZADO (sin comentarios ni espacios) del cuerpo
-- vivo de `emitir_comprobante` con el de main (en una base armada con todas las migraciones del repo, 2026-09-30) o con el de
-- después de este archivo; y el de `fn_documento_clienta` y `fn_ligar_ventas_por_documento` (1a), que se usan tal como
-- están. Con cualquier otro, aborta sin tocar nada. NO se comparó con producción (esta tanda no la consultó): si producción
-- tuviera otra versión de `emitir_comprobante`, la sección 0 lo dice y no se pega a ciegas. Al final, la sección 3 comprueba
-- que el cuerpo que quedó es exactamente el de «después».
--   emitir_comprobante            antes 392971c9f593de3d6279bd523230e89b → después a3f15c5be03998f3f5e1aa8a129db60b
--   fn_documento_clienta          5f52a8616111f6abc4159dcd9a47e97e (no cambia)
--   fn_ligar_ventas_por_documento 26ec241caa4b06164703f63e61210a94 (no cambia)
--
-- CÓMO SE PEGA: este archivo SOLO en el SQL Editor de producción, DESPUÉS de la tanda 1a (20260930160000; no depende de la
-- 1b, la 1c ni la 1d) y ANTES de desplegar la web de la tanda 1e. Mientras la web vieja siga en pie no cambia nada: nunca
-- manda estos tipos. Se puede pegar dos veces (idempotente). `lock_timeout` de 3 s: si una venta tiene tomada la tabla,
-- falla limpio y se vuelve a pegar. Después: una boleta de prueba REAL a un carné en Lucode (ADR-0288, paso 1e).
--
-- CONCURRENCIA. Dos cajas emiten a la vez: nada nuevo (el correlativo lo sigue reservando `fn_reservar_numero_serie` con su
-- candado de fila). La validación es de la fila que se inserta, sin leer otras.
-- CAÍDA EXTERNA. Nada de esto llama a Lucode, a SUNAT ni al padrón (carné y pasaporte no tienen padrón: el nombre va a mano).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. candado de versión ----------
do $guarda$
declare
  r record;
  v_md5 text;
begin
  for r in
    select * from (values
      -- firma                                                                                        antes (main)                        despues (este archivo)
      ('retail.emitir_comprobante(uuid,text,numeric,numeric,numeric,uuid,text,text,text,jsonb,uuid)', '392971c9f593de3d6279bd523230e89b', 'a3f15c5be03998f3f5e1aa8a129db60b'),
      ('retail.fn_documento_clienta(text,text)',                                                   '5f52a8616111f6abc4159dcd9a47e97e', '5f52a8616111f6abc4159dcd9a47e97e'),
      ('retail.fn_ligar_ventas_por_documento(uuid,text,text)',                                     '26ec241caa4b06164703f63e61210a94', '26ec241caa4b06164703f63e61210a94')
    ) as t(firma, antes, despues)
  loop
    -- Asignación y no `select … into`: el SQL Editor de Supabase confunde un `select … into` con un SELECT INTO que crea
    -- una tabla (CLAUDE.md, «El SQL Editor agrega líneas por su cuenta»).
    v_md5 := (
      select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
        from pg_proc p
       where p.oid = to_regprocedure(r.firma)
    );
    if v_md5 is null then
      raise exception '% no existe en esta base: pega antes la tanda 1a del club (20260930160000).', r.firma;
    end if;
    if v_md5 is distinct from r.antes and v_md5 is distinct from r.despues then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.',
        r.firma, v_md5, r.antes, r.despues;
    end if;
  end loop;
end
$guarda$;

-- ---------- 1. emitir_comprobante: carné y pasaporte, limpios y con su formato ----------
-- Nombre propio y `drop` al final: `supabase start` corre todas las migraciones en UNA conexión, y un `pg_temp.*` de otra
-- migración con el mismo nombre y otros parámetros daría «is not unique» (memoria «reescribir una función de producción»).
create or replace function pg_temp.reemplazar_club1e_20260930(p_firma text, p_viejo text, p_nuevo text)
returns void language plpgsql as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado (pegar dos veces es inocuo). Se mira ANTES de contar el ancla: el texto nuevo termina con la propia ancla,
  -- que sigue ahí después del primer pegado (lo que la 1a aprendió en su primera versión).
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: se esperaba 1 vez «%» y hay %.', p_firma, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- El bloque va después de la idempotencia por token (un reintento devuelve el comprobante que ya existe, sin volver a mirar)
-- y antes de reservar el correlativo. `p_cliente_num_doc` es un parámetro: en PL/pgSQL se puede reasignar, y es lo que el
-- `insert into comprobantes` ya guarda. Ancla y texto nuevo van entre `$…$`, no entre comillas simples.
select pg_temp.reemplazar_club1e_20260930(
  'retail.emitir_comprobante(uuid,text,numeric,numeric,numeric,uuid,text,text,text,jsonb,uuid)',
  $ancla$  if p_tipo = 'nota_venta' and p_igv <> 0 then$ancla$,
  $nuevo$  -- ADR-0288 D-3 (tanda 1e): un carné de extranjería o un pasaporte va limpio (sin espacios, en mayúsculas) y con su
  -- formato, con las mismas reglas y mensajes que la ficha de la clienta. El DNI, el RUC y «sin documento», como siempre.
  if p_cliente_tipo_doc in ('carne_extranjeria', 'pasaporte') then
    p_cliente_num_doc := retail.fn_documento_clienta(p_cliente_tipo_doc, p_cliente_num_doc);
    if p_cliente_num_doc is null then
      raise exception 'Falta el número del % del comprobante. Escríbelo, o elige «Sin documento».',
        case p_cliente_tipo_doc when 'pasaporte' then 'pasaporte' else 'carné de extranjería' end
        using errcode = '22023', hint = 'documento_invalido';
    end if;
  end if;
  if p_tipo = 'nota_venta' and p_igv <> 0 then$nuevo$
);

drop function pg_temp.reemplazar_club1e_20260930(text, text, text);

-- ---------- 2. comprobantes: los dos tipos nuevos y su formato ----------
-- Al final a propósito: es lo único de este archivo que toma una tabla en uso (ver DECIDÍ). `drop … if exists` + `add`:
-- pegar dos veces deja los mismos candados.
alter table retail.comprobantes drop constraint if exists comprobantes_cliente_tipo_doc_check;
alter table retail.comprobantes add constraint comprobantes_cliente_tipo_doc_check
  check (cliente_tipo_doc in ('dni', 'ruc', 'carne_extranjeria', 'pasaporte', 'sin_documento'));

alter table retail.comprobantes drop constraint if exists comprobantes_carne_pasaporte_formato;
alter table retail.comprobantes add constraint comprobantes_carne_pasaporte_formato
  check (
    cliente_tipo_doc not in ('carne_extranjeria', 'pasaporte')
    or coalesce(cliente_num_doc, '') ~ '^[A-Z0-9]{6,12}$'
  );

comment on column retail.comprobantes.cliente_tipo_doc is
  'Documento de quien compra: dni, ruc, carne_extranjeria, pasaporte o sin_documento (por defecto). A Lucode viaja con el catálogo 06 de SUNAT (1, 6, 4, 7; sin documento, 1 con el comodín 99999999): lib/lucode.ts. Una factura exige ruc (comprobantes_factura_requiere_ruc). Carné y pasaporte desde ADR-0288 D-3.';
comment on constraint comprobantes_carne_pasaporte_formato on retail.comprobantes is
  'Un carné de extranjería o un pasaporte lleva número: de 6 a 12 letras o dígitos, en mayúsculas y sin espacios (la regla de fn_documento_clienta y de clientas_documento_formato). ADR-0288 D-3.';

-- ---------- 3. lo que quedó es exactamente lo que se revisó ----------
do $despues$
declare
  v_md5 text;
begin
  v_md5 := (
    select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
      from pg_proc p
     where p.oid = 'retail.emitir_comprobante(uuid,text,numeric,numeric,numeric,uuid,text,text,text,jsonb,uuid)'::regprocedure
  );
  if v_md5 is distinct from 'a3f15c5be03998f3f5e1aa8a129db60b' then
    raise exception 'emitir_comprobante quedó con md5 normalizado % y no con el revisado (a3f15c5be03998f3f5e1aa8a129db60b): no se guarda nada.', v_md5;
  end if;
end
$despues$;
