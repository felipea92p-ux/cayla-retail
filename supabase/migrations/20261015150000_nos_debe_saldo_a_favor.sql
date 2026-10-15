-- ============================================================================
-- 20261015150000_nos_debe_saldo_a_favor.sql — CAYLA V2 · ADR-0362, fase 5b, actividad 1 (parte 2 de 2: las funciones). Va después de
-- 20261015145000_nos_debe_saldo_a_favor_esquema.sql. Contrato: docs/compras/ordenes-de-compra-2026-10/contrato-nos-debe.md.
--
-- EL PROBLEMA PRIMERO. Una deuda del proveedor solo se saldaba con la prenda. Si no la va a mandar, la plata pagada por ella no volvía.
--
-- QUÉ HACE («Pasar a saldo a favor», decisión 58; esta actividad, con boleta, nota de venta o sin comprobante: sin IGV).
--   1. `fn_deuda_papel` (interna): de qué líneas de comprobante salen las prendas de una deuda, con la MISMA regla del cupo que la recepción
--      (`fn_recepcion_cerrar`): las líneas de comprobantes vigentes de esa línea pedida, con cupo (facturado − recibido − cerrado), primero
--      la que nombra el envío y después las más antiguas. Lo que no tiene papel con cupo no se facturó: no se pagó.
--   2. `fn_deuda_valor_de` (interna) y `fn_deuda_valor` (la hoja): cuánto vale, en plata, pasar N prendas de una deuda a saldo a favor: al
--      costo del PAPEL (lo que CAYLA paga), con su IGV si el papel es una factura con IGV (la razón IGV/subtotal del propio comprobante). Una
--      sola regla para la hoja, la ficha y el documento.
--   3. `fn_pasar_deuda_a_saldo_a_favor` (interna): por cada comprobante del reparto, en una transacción: cierra esas prendas en sus líneas
--      (`compra_item_cierres`, «no llegó», en la sede del envío: el comprobante deja de esperarlas y baja lo «por recibir» al costo del papel),
--      registra el DOCUMENTO INTERNO DI-… (`compra_notas_credito`, interna) que baja lo que se le debe a ese comprobante, deja el resto como
--      saldo a favor en el libro de siempre (`proveedor_creditos`, tipo `nota_credito`, en positivo) y anota la resolución de la deuda con
--      su documento. Bloquea la deuda (quien llama) y los comprobantes de esa línea pedida, en orden, antes de mirar el cupo y el saldo.
--   4. `resolver_deuda_proveedor` (REESCRITA, con candado de huella): `saldo_a_favor` deja de decir «todavía no» y pide Proveedores (o ser
--      líder: `fn_puede_gestionar_proveedores`); con una factura sigue diciendo «todavía no» hasta la actividad 2; «Depositó», hasta la 5. Y
--      una deuda sin marca (ADR-0393: se cuenta sin marca si hace falta) ya no dice «no existe»: la marca se une con LEFT JOIN.
--   5. `fn_nos_debe_deuda` (REESCRITA, con candado de huella): el monto pendiente sale del papel (`fn_deuda_valor_de`; lo que no tiene papel,
--      al costo con que se recibió), cada resolución trae su documento, y la marca se une con LEFT JOIN.
--   6. Lo que habla con SUNAT no cuenta el documento interno (REEMPLAZOS ANCLADOS): `fn_impuestos_compras`, `fn_impuestos_registro_compras`,
--      `fn_igv_credito_fiscal` y `resumen_compras_extra`. El Diario lo nombra «Documento interno DI-…» (`fn_asientos`). Y una nota del
--      proveedor (`fn_insertar_nota_credito_compra`) no puede usar la serie DI- ni ser una nota por faltante de un comprobante que ya tiene
--      documentos internos: esa nota se adjunta al documento interno (actividad 3).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261015145000. Sin tablas, sin políticas, sin `drop trigger`
-- (ADR-0195), sin `select … into` dentro de textos entre comillas (ADR-0288). Las reescrituras y los reemplazos abortan SIN TOCAR NADA si la
-- función viva cambió, y no hacen nada si ya están aplicados: se puede pegar dos veces. El bloque final comprueba que quedó todo.
-- ============================================================================

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261015020000): falla si la función viva cambió, y es re-ejecutable.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- Candado de huella para las dos funciones que se reescriben enteras: si la viva no es la de 20261013180000 (ni la de esta migración, que se
-- reconoce por una marca), la migración aborta sin tocar nada.
create or replace function pg_temp.exigir_huella(p_firma text, p_huella text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
begin
  if position(p_marca in v_def) = 0 and md5(v_def) <> p_huella then
    raise exception '% cambió desde que se escribió esta migración (su huella ya no es %): regenera la reescritura desde su definición real.',
      p_firma, p_huella;
  end if;
end;
$f$;

select pg_temp.exigir_huella('retail.resolver_deuda_proveedor(uuid, text, integer, text, uuid)', 'b2b786ba62411d13868a379b2298bb23',
                             'fn_pasar_deuda_a_saldo_a_favor');
select pg_temp.exigir_huella('retail.fn_nos_debe_deuda(uuid)', 'c4a1bee3b64cc45d3aafe73d433cc971', 'fn_deuda_valor_de');

-- ---------- 1. El papel de una deuda (interna) ----------
create or replace function retail.fn_deuda_papel(p_diferencia_id uuid, p_cantidad integer)
returns table (orden integer, compra_id uuid, compra_item_id uuid, toma integer, costo_unitario numeric, tipo text, con_igv boolean,
               documento text, proveedor_id uuid, subtotal numeric, igv numeric)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_oci uuid;
  v_ci_nombrado uuid;
  v_resto integer := greatest(coalesce(p_cantidad, 0), 0);
  v_fila record;
  v_n integer := 0;
begin
  select di.orden_compra_item_id, di.compra_item_id
    into v_oci, v_ci_nombrado
    from retail.despacho_diferencias_vigentes x
    join retail.despacho_items di on di.id = x.despacho_item_id
   where x.id = p_diferencia_id;
  if v_oci is null or v_resto = 0 then
    return;
  end if;
  -- La misma regla del cupo que la recepción (fn_recepcion_cerrar, decisión 9): primero la línea que nombra el envío, después las más antiguas.
  for v_fila in
    select ci.id as ci_id, ci.compra_id as c_id, ci.costo_unitario as costo, c.tipo as c_tipo,
           (c.tipo = 'factura' and coalesce(c.igv, 0) > 0) as c_con_igv, c.documento as c_documento, c.proveedor_id as c_proveedor,
           c.subtotal as c_subtotal, c.igv as c_igv,
           (ci.cantidad
             - coalesce((select sum(mv.cantidad) from retail.movimientos mv where mv.compra_item_id = ci.id), 0)
             - coalesce((select sum(k.cantidad) from retail.compra_item_cierres k where k.compra_item_id = ci.id), 0))::integer as cupo
      from retail.compra_items ci
      join retail.compras c on c.id = ci.compra_id and c.estado = 'vigente'
     where ci.orden_compra_item_id = v_oci
     order by coalesce(ci.id = v_ci_nombrado, false) desc, c.created_at, ci.id
  loop
    exit when v_resto = 0;
    if v_fila.cupo > 0 then
      v_n := v_n + 1;
      orden := v_n;
      compra_id := v_fila.c_id;
      compra_item_id := v_fila.ci_id;
      toma := least(v_resto, v_fila.cupo);
      costo_unitario := v_fila.costo;
      tipo := v_fila.c_tipo;
      con_igv := v_fila.c_con_igv;
      documento := v_fila.c_documento;
      proveedor_id := v_fila.c_proveedor;
      subtotal := v_fila.c_subtotal;
      igv := v_fila.c_igv;
      v_resto := v_resto - toma;
      return next;
    end if;
  end loop;
end;
$$;
comment on function retail.fn_deuda_papel(uuid, integer) is
  'ADR-0362 fase 5b: de qué líneas de comprobante (vigentes, con cupo) salen N prendas de una deuda del proveedor; la misma regla que la recepción. Interna.';

-- ---------- 2. Cuánto vale pasar N prendas de una deuda a saldo a favor ----------
create or replace function retail.fn_deuda_valor_de(p_diferencia_id uuid, p_cantidad integer)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with p as (
    select * from retail.fn_deuda_papel(p_diferencia_id, p_cantidad)
  ),
  por_papel as (
    select p.compra_id, min(p.documento) as documento, min(p.tipo) as tipo, bool_or(p.con_igv) as con_igv, sum(p.toma)::integer as cantidad,
           round(sum(p.toma * p.costo_unitario), 2) as base,
           case when bool_or(p.con_igv) and max(p.subtotal) > 0
                then round(round(sum(p.toma * p.costo_unitario), 2) * max(p.igv) / max(p.subtotal), 2) else 0 end as igv,
           min(p.orden) as orden
      from p
     group by p.compra_id
  ),
  -- Lo que se le debe hoy a cada comprobante: el documento baja primero eso y lo que sobra queda a favor del proveedor.
  con_saldo as (
    select pp.*, pp.base + pp.igv as monto, greatest(c.saldo, 0) as saldo,
           least(pp.base + pp.igv, greatest(c.saldo, 0)) as baja_deuda,
           pp.base + pp.igv - least(pp.base + pp.igv, greatest(c.saldo, 0)) as a_favor
      from por_papel pp
      join retail.compras c on c.id = pp.compra_id
  )
  select jsonb_build_object(
           'cantidad', greatest(coalesce(p_cantidad, 0), 0),
           'con_papel', coalesce((select sum(cantidad) from con_saldo), 0),
           'sin_papel', greatest(coalesce(p_cantidad, 0) - coalesce((select sum(cantidad) from con_saldo), 0), 0),
           'base', coalesce((select sum(base) from con_saldo), 0),
           'igv', coalesce((select sum(igv) from con_saldo), 0),
           'monto', coalesce((select sum(monto) from con_saldo), 0),
           'baja_deuda', coalesce((select sum(baja_deuda) from con_saldo), 0),
           'a_favor', coalesce((select sum(a_favor) from con_saldo), 0),
           'con_factura', coalesce((select bool_or(tipo = 'factura') from con_saldo), false),
           'papeles', coalesce((select jsonb_agg(jsonb_build_object('compra_id', compra_id, 'documento', documento, 'tipo', tipo,
                                                                     'cantidad', cantidad, 'base', base, 'igv', igv, 'monto', monto,
                                                                     'saldo', saldo, 'baja_deuda', baja_deuda, 'a_favor', a_favor)
                                                  order by orden)
                                  from con_saldo), '[]'::jsonb));
$$;
comment on function retail.fn_deuda_valor_de(uuid, integer) is
  'ADR-0362 fase 5b: cuánto vale en plata pasar N prendas de una deuda a saldo a favor, al costo del papel y con su IGV si es factura. Interna: la usan la ficha, la hoja y el documento.';

create or replace function retail.fn_deuda_valor(p_diferencia_id uuid, p_cantidad integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_cantidad integer := p_cantidad;
begin
  if not (retail.fn_ve_plata_de_proveedores() or retail.fn_ve_modulo('ordenes_compra') or retail.fn_ve_modulo('recibir')) then
    raise exception 'Ver lo que te debe un proveedor necesita el módulo «Proveedores», la plata de Compras, «Órdenes de compra» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'nos_debe_sin_modulo';
  end if;
  if v_cantidad is null then
    v_cantidad := (select x.cantidad - coalesce((select sum(r.cantidad) from retail.proveedor_deuda_resoluciones r where r.diferencia_id = x.id), 0)
                     from retail.despacho_diferencias_vigentes x
                    where x.id = p_diferencia_id and x.tipo = 'faltante' and x.causa = 'no_vino')::integer;
  end if;
  if v_cantidad is null then
    raise exception 'Esa deuda no existe: recarga la pantalla' using hint = 'nos_debe_no_existe';
  end if;
  return retail.fn_deuda_valor_de(p_diferencia_id, v_cantidad);
end;
$$;
comment on function retail.fn_deuda_valor(uuid, integer) is
  'ADR-0362 fase 5b: la hoja «Pasar a saldo a favor» pregunta cuánto vale pasar N prendas (sin N: lo pendiente). Pide lo mismo que ver lo que debe un proveedor.';

-- ---------- 3. Pasar a saldo a favor (interna) ----------
create or replace function retail.fn_pasar_deuda_a_saldo_a_favor(
  p_diferencia_id uuid,
  p_cantidad integer,
  p_nota text,
  p_token uuid,
  p_huella text,
  p_actor uuid,
  p_ubicacion_id uuid,
  p_texto_cierre text
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_oci uuid;
  v_reparto jsonb;
  v_con_papel integer;
  v_compra uuid;
  v_c record;
  v_linea jsonb;
  v_cierre uuid;
  v_primer_cierre uuid;
  v_base numeric;
  v_igv numeric;
  v_monto numeric;
  v_cantidad integer;
  v_aplicado numeric;
  v_excedente numeric;
  v_doc text;
  v_nota_id uuid;
  v_res uuid;
  v_primera_res uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_docs jsonb := '[]'::jsonb;
begin
  -- Los comprobantes de esa línea pedida se bloquean, en orden: dos personas pasando deudas del mismo papel, un pago o una recepción a la
  -- vez se ponen en fila, y el cupo y el saldo se miran después de esperar.
  select di.orden_compra_item_id into v_oci
    from retail.despacho_diferencias_vigentes x
    join retail.despacho_items di on di.id = x.despacho_item_id
   where x.id = p_diferencia_id;
  perform 1 from retail.compras c
   where c.estado = 'vigente'
     and c.id in (select ci.compra_id from retail.compra_items ci where ci.orden_compra_item_id = v_oci)
   order by c.id
     for update;

  -- El reparto se calcula UNA vez: los cierres que se escriben abajo cambian el cupo.
  v_reparto := coalesce((select jsonb_agg(to_jsonb(p) order by p.orden) from retail.fn_deuda_papel(p_diferencia_id, p_cantidad) p), '[]'::jsonb);
  v_con_papel := coalesce((select sum((e ->> 'toma')::integer) from jsonb_array_elements(v_reparto) e), 0);
  if v_con_papel < p_cantidad then
    raise exception '%', case
      when v_con_papel = 0 then 'Esas prendas no están en ningún comprobante con cupo: no se facturaron, así que no hay plata que pasar a saldo a favor. Si el proveedor las cobra después, regístralo y vuelve a intentarlo'
      else 'De esas ' || p_cantidad || ', ' || case when v_con_papel = 1 then 'solo 1 está' else 'solo ' || v_con_papel || ' están' end
        || ' en un comprobante con cupo y ' || case when p_cantidad - v_con_papel = 1 then 'la otra no se facturó' else 'las otras '
        || (p_cantidad - v_con_papel) || ' no se facturaron' end || ': no hay plata que pasar a saldo a favor por ellas. Pasa ' || v_con_papel
    end using hint = 'nos_debe_sin_papel';
  end if;
  -- Con una factura, el documento interno lleva su IGV y espera la nota de crédito del proveedor: llega en la actividad 2.
  if exists (select 1 from jsonb_array_elements(v_reparto) e where e ->> 'tipo' = 'factura') then
    raise exception 'Las prendas de una factura se pasan a saldo a favor con su IGV: todavía no' using hint = 'nos_debe_todavia_no';
  end if;

  for v_compra in
    select distinct (e ->> 'compra_id')::uuid from jsonb_array_elements(v_reparto) e order by 1
  loop
    v_primer_cierre := null;
    v_base := 0;
    v_cantidad := 0;
    -- Los cierres: esas prendas ya no se esperan en el comprobante (bajan lo «por recibir» al costo del papel).
    for v_linea in
      select e from jsonb_array_elements(v_reparto) e where (e ->> 'compra_id')::uuid = v_compra order by (e ->> 'orden')::integer
    loop
      insert into retail.compra_item_cierres (compra_item_id, cantidad, motivo, nota, usuario_id, ubicacion_id)
      values ((v_linea ->> 'compra_item_id')::uuid, (v_linea ->> 'toma')::integer, 'no_llego', p_texto_cierre, p_actor, p_ubicacion_id)
      returning id into v_cierre;
      v_primer_cierre := coalesce(v_primer_cierre, v_cierre);
      v_base := v_base + (v_linea ->> 'toma')::integer * (v_linea ->> 'costo_unitario')::numeric;
      v_cantidad := v_cantidad + (v_linea ->> 'toma')::integer;
    end loop;

    select c.id, c.proveedor_id, c.total, c.saldo, c.documento into v_c from retail.compras c where c.id = v_compra;
    v_base := round(v_base, 2);
    v_igv := 0;
    v_monto := v_base + v_igv;
    if v_monto <= 0 then
      raise exception 'Esas prendas costaron S/ 0 en %: no hay plata que pasar a saldo a favor', v_c.documento using hint = 'nos_debe_sin_plata';
    end if;
    -- Ninguna suma de notas (del proveedor o internas) pasa del comprobante: no se acredita más de lo que se facturó.
    if coalesce((select sum(n.monto) from retail.compra_notas_credito n where n.compra_id = v_compra), 0) + v_monto > v_c.total then
      raise exception 'Las notas de crédito y documentos internos de % pasarían del comprobante (S/ %)', v_c.documento, v_c.total
        using hint = 'nos_debe_pasa_del_comprobante';
    end if;
    -- Baja primero lo que se le debe a ESE comprobante; lo que sobra queda a favor del proveedor (se descuenta del próximo pago).
    v_aplicado := least(v_monto, greatest(v_c.saldo, 0));
    v_excedente := v_monto - v_aplicado;
    v_doc := 'DI-' || lpad(nextval('retail.compra_notas_internas_seq')::text, 6, '0');
    insert into retail.compra_notas_credito (compra_id, cierre_id, serie_numero, fecha, subtotal, igv, monto, aplicado, motivo, nota, usuario_id,
                                             interna)
    values (v_compra, v_primer_cierre, v_doc, v_hoy, v_monto - v_igv, v_igv, v_monto, v_aplicado, 'faltante', p_nota, p_actor, true)
    returning id into v_nota_id;
    if v_excedente > 0 then
      insert into retail.proveedor_creditos (proveedor_id, tipo, monto, fecha, compra_id, nota_credito_id, usuario_id)
      values (v_c.proveedor_id, 'nota_credito', v_excedente, v_hoy, v_compra, v_nota_id, p_actor);
    end if;
    -- La resolución de la deuda, con su documento. El token va en la primera: un reintento la encuentra y devuelve lo mismo.
    insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, nota, token_cliente, huella, creado_por, nota_credito_id)
    values (p_diferencia_id, 'saldo_a_favor', v_cantidad, p_nota,
            case when v_primera_res is null then p_token end, case when v_primera_res is null then p_huella end, p_actor, v_nota_id)
    returning id into v_res;
    v_primera_res := coalesce(v_primera_res, v_res);
    v_docs := v_docs || jsonb_build_object('documento', v_doc, 'nota_credito_id', v_nota_id, 'compra_id', v_compra, 'comprobante', v_c.documento,
                                           'cantidad', v_cantidad, 'monto', v_monto, 'baja_deuda', v_aplicado, 'a_favor', v_excedente);
  end loop;

  return jsonb_build_object('resolucion_id', v_primera_res, 'documentos', v_docs);
end;
$$;
comment on function retail.fn_pasar_deuda_a_saldo_a_favor(uuid, integer, text, uuid, text, uuid, uuid, text) is
  'ADR-0362 fase 5b (decisión 58): cierra en el papel las prendas que no llegaron, registra el documento interno DI-… que baja la deuda del comprobante y deja el resto a favor, y anota la resolución. Interna: la llama resolver_deuda_proveedor con la deuda ya bloqueada.';

-- ---------- 4. Resolver una deuda (la web) ----------
create or replace function retail.resolver_deuda_proveedor(p_diferencia_id uuid, p_forma text, p_cantidad integer, p_nota text, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_forma text := lower(nullif(btrim(coalesce(p_forma, '')), ''));
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_huella text;
  v_deuda record;
  v_existente record;
  v_actor uuid;
  v_pendiente integer;
  v_id uuid;
  v_restriccion text;
  v_desc text;
  v_detalle jsonb;
  v_plata jsonb;
begin
  -- Pasar a saldo a favor mueve plata: es de quien lleva a los proveedores (fase 5b, decisión 58; el módulo es la llave, 40). La reposición,
  -- como en la 5a: Proveedores o Recibir.
  if v_forma = 'saldo_a_favor' then
    if retail.fn_puede_gestionar_proveedores() is not true then
      raise exception 'Pasar a saldo a favor lo que debe un proveedor necesita el módulo «Proveedores» en tu rol'
        using errcode = '42501', hint = 'nos_debe_sin_modulo';
    end if;
  elsif retail.fn_ve_modulo('proveedores') is not true and retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Marcar lo que repuso un proveedor necesita el módulo «Proveedores» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'nos_debe_sin_modulo';
  end if;
  -- «Depositó» llega en la actividad 5 de la fase 5b.
  if v_forma = 'deposito' then
    raise exception 'Todavía no: «Depositó» llega en la siguiente entrega' using hint = 'nos_debe_todavia_no';
  end if;
  if v_forma is null or v_forma not in ('repuesta', 'saldo_a_favor') then
    raise exception 'No se entiende cómo se resolvió la deuda: elige «Llegó la reposición» o «Pasar a saldo a favor»' using hint = 'nos_debe_forma';
  end if;

  -- La deuda se bloquea ANTES de mirar el token: un doble clic con el mismo token se pone en fila y el segundo devuelve lo del primero;
  -- dos personas marcando la misma deuda a la vez, también, y la segunda ve lo que ya quedó. La marca puede faltar (ADR-0393): LEFT JOIN.
  select x.id, x.despacho_id, x.proveedor_id, x.tipo, x.causa, x.cantidad, d.numero as envio_numero, d.ubicacion_destino_id,
         pr.nombre as proveedor, concat_ws(' · ', c.nombre, m.nombre) as que
    into v_deuda
    from retail.despacho_diferencias_vigentes x
    join retail.despachos d on d.id = x.despacho_id
    join retail.proveedores pr on pr.id = x.proveedor_id
    join retail.categorias c on c.id = x.categoria_id
    left join retail.marcas m on m.id = x.marca_id
   where x.id = p_diferencia_id
     for update of x;
  if not found then
    raise exception 'Esa deuda no existe: recarga la pantalla' using hint = 'nos_debe_no_existe';
  end if;
  if v_deuda.tipo <> 'faltante' or v_deuda.causa <> 'no_vino' then
    raise exception 'Eso no es una deuda del proveedor: solo lo que «no vino» se repone' using hint = 'nos_debe_no_es_deuda';
  end if;

  -- Doble clic o reintento sin red: lo mismo ya se guardó y se devuelve, aunque quien lo hizo ya no esté de turno (comprobar algo
  -- guardado no escribe nada). El mismo token con otros datos no es un reintento.
  v_huella := md5(jsonb_build_object('diferencia_id', p_diferencia_id, 'forma', v_forma, 'cantidad', p_cantidad, 'nota', v_nota)::text);
  if p_token is not null then
    for v_existente in select r.id, r.huella from retail.proveedor_deuda_resoluciones r where r.token_cliente = p_token loop
      if v_existente.huella = v_huella then
        return jsonb_build_object('resolucion_id', v_existente.id, 'deuda', retail.fn_nos_debe_deuda(p_diferencia_id),
                                  'documentos', retail.fn_deuda_documentos_de(v_existente.id));
      end if;
      raise exception 'Eso ya se guardó con otros datos: recarga la pantalla' using hint = 'nos_debe_otros_datos';
    end loop;
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_cantidad is null or p_cantidad < 1 then
    raise exception '%', case when v_forma = 'repuesta' then 'Escribe cuántas llegaron: desde 1' else 'Escribe cuántas pasan a saldo a favor: desde 1' end
      using hint = 'nos_debe_cantidad';
  end if;
  if v_forma = 'repuesta' and v_nota is null then
    raise exception 'Escribe una nota: cómo llegó la reposición' using hint = 'nos_debe_nota';
  end if;
  if length(v_nota) > 300 then
    raise exception 'La nota es muy larga: hasta 300 letras' using hint = 'nos_debe_nota';
  end if;
  v_pendiente := v_deuda.cantidad
    - coalesce((select sum(r.cantidad) from retail.proveedor_deuda_resoluciones r where r.diferencia_id = p_diferencia_id), 0)::integer;
  if v_pendiente <= 0 then
    raise exception 'Esta deuda ya está saldada: no queda nada por reponer' using hint = 'nos_debe_saldada';
  end if;
  if p_cantidad > v_pendiente then
    raise exception 'De esta deuda % por reponer: no puedes marcar %',
      case when v_pendiente = 1 then 'queda 1' else 'quedan ' || v_pendiente end, p_cantidad
      using hint = 'nos_debe_pasa_de_lo_debido';
  end if;

  begin
    if v_forma = 'repuesta' then
      insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, nota, token_cliente, huella, creado_por)
      values (p_diferencia_id, 'repuesta', p_cantidad, v_nota, p_token, v_huella, v_actor)
      returning id into v_id;
    else
      v_plata := retail.fn_pasar_deuda_a_saldo_a_favor(
        p_diferencia_id, p_cantidad, v_nota, p_token, v_huella, v_actor, v_deuda.ubicacion_destino_id,
        left('Pasó a saldo a favor ' || p_cantidad || ' de ' || v_deuda.que || ' (faltaron en la '
             || retail.fn_envio_numero_texto(v_deuda.envio_numero) || ')', 300));
      v_id := (v_plata ->> 'resolucion_id')::uuid;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'proveedor_deuda_resoluciones_token_key' then
      for v_existente in select r.id, r.huella, r.diferencia_id from retail.proveedor_deuda_resoluciones r where r.token_cliente = p_token loop
        if v_existente.huella = v_huella then
          return jsonb_build_object('resolucion_id', v_existente.id, 'deuda', retail.fn_nos_debe_deuda(v_existente.diferencia_id),
                                    'documentos', retail.fn_deuda_documentos_de(v_existente.id));
        end if;
      end loop;
      raise exception 'Eso ya se guardó con otros datos: recarga la pantalla' using hint = 'nos_debe_otros_datos';
    end if;
    raise;
  end;

  -- Actividad (ADR-0207), sin montos. La reposición, en el módulo donde vive el botón: Proveedores (la ficha) o, para quien solo tiene
  -- Recibir, Recibir. Pasar a saldo a favor, siempre en Proveedores. Llamadas con el módulo escrito: así `actividad-reglas.test.ts` ve en
  -- qué módulos anota la base. Si falla, igual queda.
  begin
    v_detalle := jsonb_build_object('diferencia_id', p_diferencia_id, 'despacho_id', v_deuda.despacho_id,
                                    'envio', retail.fn_envio_numero_texto(v_deuda.envio_numero), 'proveedor_id', v_deuda.proveedor_id,
                                    'forma', v_forma, 'cantidad', p_cantidad);
    if v_forma = 'saldo_a_favor' then
      v_desc := 'pasó a saldo a favor ' || p_cantidad || ' de ' || v_deuda.que || ' que debe ' || v_deuda.proveedor || ' (faltaron en la '
        || retail.fn_envio_numero_texto(v_deuda.envio_numero) || '): '
        || coalesce((select string_agg(e ->> 'documento', ', ') from jsonb_array_elements(v_plata -> 'documentos') e), '');
      perform retail.fn_actividad_anotar('proveedores', 'deuda_saldo_a_favor', v_desc, v_actor, retail.fn_actividad_terminal_ahora(),
                                         v_deuda.ubicacion_destino_id, null, 'proveedor_deuda_resoluciones', v_id::text, now(),
                                         v_detalle || jsonb_build_object('documentos', v_plata -> 'documentos'), 'vivo');
    else
      v_desc := 'marcó que ' || v_deuda.proveedor || ' repuso ' || p_cantidad || ' de ' || v_deuda.que || ' (faltaron en la '
        || retail.fn_envio_numero_texto(v_deuda.envio_numero) || ')';
      if retail.fn_ve_modulo('proveedores') then
        perform retail.fn_actividad_anotar('proveedores', 'deuda_repuesta', v_desc, v_actor, retail.fn_actividad_terminal_ahora(),
                                           v_deuda.ubicacion_destino_id, null, 'proveedor_deuda_resoluciones', v_id::text, now(),
                                           v_detalle, 'vivo');
      else
        perform retail.fn_actividad_anotar('recibir', 'deuda_repuesta', v_desc, v_actor, retail.fn_actividad_terminal_ahora(),
                                           v_deuda.ubicacion_destino_id, null, 'proveedor_deuda_resoluciones', v_id::text, now(),
                                           v_detalle, 'vivo');
      end if;
    end if;
  exception when others then
    raise warning 'actividad: no se anotó la resolución de la deuda % (%)', p_diferencia_id, sqlerrm;
  end;

  return jsonb_build_object('resolucion_id', v_id, 'deuda', retail.fn_nos_debe_deuda(p_diferencia_id),
                            'documentos', coalesce(v_plata -> 'documentos', '[]'::jsonb));
end;
$$;

-- Los documentos de una resolución (y de las que nacieron con ella en la misma llamada): lo que devuelve un reintento.
create or replace function retail.fn_deuda_documentos_de(p_resolucion_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object('documento', n.serie_numero, 'nota_credito_id', n.id, 'compra_id', n.compra_id,
                                               'comprobante', c.documento, 'cantidad', r.cantidad, 'monto', n.monto,
                                               'baja_deuda', n.aplicado, 'a_favor', n.monto - n.aplicado)
                            order by n.serie_numero), '[]'::jsonb)
    from retail.proveedor_deuda_resoluciones r0
    join retail.proveedor_deuda_resoluciones r on r.diferencia_id = r0.diferencia_id and r.creado_por = r0.creado_por
                                              and r.creado_en = r0.creado_en and r.nota_credito_id is not null
    join retail.compra_notas_credito n on n.id = r.nota_credito_id
    join retail.compras c on c.id = n.compra_id
   where r0.id = p_resolucion_id;
$$;

-- ---------- 5. Una deuda, leída: su monto sale del papel ----------
create or replace function retail.fn_nos_debe_deuda(p_diferencia_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
           'diferencia_id', x.id,
           'despacho_id', x.despacho_id,
           'envio', retail.fn_envio_numero_texto(d.numero),
           'sede', jsonb_build_object('id', u.id, 'nombre', u.nombre),
           'fecha', x.creado_en,
           'orden', jsonb_build_object('id', o.id, 'numero', retail.fn_orden_compra_numero_texto(o.numero)),
           'proveedor', jsonb_build_object('id', pr.id, 'nombre', pr.nombre),
           'categoria', jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia),
           'marca', case when m.id is not null then jsonb_build_object('id', m.id, 'nombre', m.nombre) end,
           'descripcion', di.descripcion,
           'cantidad', x.cantidad,
           'resuelto', s.resuelto,
           'pendiente', x.cantidad - s.resuelto,
           'estado', case when x.cantidad > s.resuelto then 'por_reponer' else 'saldada' end,
           'saldada_en', case when x.cantidad <= s.resuelto then s.ultima end,
           'costo_unitario', x.costo_unitario,
           'monto', round(x.cantidad * x.costo_unitario, 2),
           -- Fase 5b: lo pendiente vale lo que dice el papel (`fn_deuda_valor_de`: lo que CAYLA paga por esas prendas, con su IGV si es una
           -- factura con IGV); lo que no tiene papel con cupo, al costo con que se recibió la línea (sin IGV: nadie lo facturó).
           'monto_pendiente', v.base + round(v.sin_papel * x.costo_unitario, 2),
           'con_igv', v.igv > 0,
           'monto_pendiente_con_igv', case when v.igv > 0 then v.monto + round(v.sin_papel * x.costo_unitario, 2) end,
           'sin_papel', v.sin_papel,
           'papel', case when pa.id is not null then
             jsonb_build_object('compra_id', pa.id, 'tipo', pa.tipo, 'serie', pa.serie, 'numero', pa.numero) end,
           'nota', x.nota,
           'anotado_por', nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''),
           'resoluciones', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', r.id,
                      'forma', r.forma,
                      'cantidad', r.cantidad,
                      'despacho_id', r.despacho_id,
                      'envio', retail.fn_envio_numero_texto(rd.numero),
                      'documento', rn.serie_numero,
                      'monto', rn.monto,
                      'nota', r.nota,
                      'creado_por', nullif(btrim(concat_ws(' ', rp.nombres, rp.apellidos)), ''),
                      'creado_en', r.creado_en
                    ) order by r.creado_en, r.id)
               from retail.proveedor_deuda_resoluciones r
               left join retail.despachos rd on rd.id = r.despacho_id
               left join retail.compra_notas_credito rn on rn.id = r.nota_credito_id
               left join public.personas rp on rp.id = r.creado_por
              where r.diferencia_id = x.id
           ), '[]'::jsonb)
         )
    from retail.despacho_diferencias_vigentes x
    join retail.despachos d on d.id = x.despacho_id
    join retail.ubicaciones u on u.id = d.ubicacion_destino_id
    join retail.despacho_items di on di.id = x.despacho_item_id
    join retail.orden_compra_items i on i.id = di.orden_compra_item_id
    join retail.ordenes_compra o on o.id = i.orden_compra_id
    join retail.proveedores pr on pr.id = x.proveedor_id
    join retail.categorias c on c.id = x.categoria_id
    left join retail.marcas m on m.id = x.marca_id
    left join public.personas pe on pe.id = x.creado_por
   cross join lateral (select coalesce(sum(r.cantidad), 0)::integer as resuelto, max(r.creado_en) as ultima
                         from retail.proveedor_deuda_resoluciones r
                        where r.diferencia_id = x.id) s
   cross join lateral (select (vv ->> 'base')::numeric as base, (vv ->> 'igv')::numeric as igv, (vv ->> 'monto')::numeric as monto,
                              (vv ->> 'sin_papel')::integer as sin_papel
                         from retail.fn_deuda_valor_de(x.id, x.cantidad - s.resuelto) vv) v
    -- El papel de la línea: el comprobante vigente que nombra el envío; si no, el más reciente de esa línea pedida.
    left join lateral (
      select cp.id, cp.tipo, cp.serie, cp.numero
        from retail.compra_items ci
        join retail.compras cp on cp.id = ci.compra_id and cp.estado = 'vigente'
       where ci.orden_compra_item_id = di.orden_compra_item_id
       order by (ci.id = di.compra_item_id) desc nulls last, cp.created_at desc, ci.id
       limit 1
    ) pa on true
   where x.id = p_diferencia_id
     and x.tipo = 'faltante' and x.causa = 'no_vino';
$$;

-- ---------- 6. El documento interno no es un documento de SUNAT ----------
-- En la línea del JOIN, no en el WHERE: el WHERE es el comienzo del texto que dejó 20261014153000 (los gastos del viaje), y partirlo haría
-- que esa migración ya no se pudiera volver a pegar (SE ROMPE SI de la fase 6 en ADR-0362).
select pg_temp.reemplazar(
  'retail.fn_impuestos_compras(date, date)',
  $v$    from retail.compra_notas_credito n
    join retail.compras k on k.id = n.compra_id
$v$,
  $n$    from retail.compra_notas_credito n
    join retail.compras k on k.id = n.compra_id and not n.interna -- ADR-0362 fase 5b: el documento interno no es una nota ante SUNAT
$n$,
  1);

select pg_temp.reemplazar(
  'retail.fn_impuestos_registro_compras(date)',
  $v$      from retail.compra_notas_credito n
      join retail.compras k on k.id = n.compra_id
      join retail.proveedores pr on pr.id = k.proveedor_id
      left join retail.ubicaciones ug on ug.id = k.ubicacion_gestion_id
     where k.estado = 'vigente' and n.fecha between v_ini and v_fin$v$,
  $n$      from retail.compra_notas_credito n
      join retail.compras k on k.id = n.compra_id
      join retail.proveedores pr on pr.id = k.proveedor_id
      left join retail.ubicaciones ug on ug.id = k.ubicacion_gestion_id
     where k.estado = 'vigente' and n.fecha between v_ini and v_fin
       and not n.interna -- ADR-0362 fase 5b: el documento interno de CAYLA no va al registro de compras$n$,
  1);

select pg_temp.reemplazar(
  'retail.fn_igv_credito_fiscal(date)',
  $v$         where k.estado = 'vigente' and n.fecha >= m.ini and n.fecha < m.ini + interval '1 month')$v$,
  $n$         where k.estado = 'vigente' and n.fecha >= m.ini and n.fecha < m.ini + interval '1 month'
           and not n.interna) -- ADR-0362 fase 5b: el documento interno no baja el crédito fiscal (lo baja la nota del proveedor)$n$,
  1);

select pg_temp.reemplazar(
  'retail.resumen_compras_extra()',
  $v$      where nc.fecha >= $1 and nc.fecha < $2
        and c.estado = 'vigente'$v$,
  $n$      where nc.fecha >= $1 and nc.fecha < $2
        and not nc.interna -- ADR-0362 fase 5b: el documento interno no es IGV de una nota del proveedor
        and c.estado = 'vigente'$n$,
  1);

select pg_temp.reemplazar(
  'retail.fn_asientos(date, date, uuid)',
  $v$'Nota de crédito ' || nc.serie_numero as glosa$v$,
  $n$case when nc.serie_numero like 'DI-%' then 'Documento interno ' else 'Nota de crédito ' end || nc.serie_numero as glosa$n$,
  1);

-- ---------- 7. Una nota del proveedor no usa la serie DI- ni duplica lo que ya saldó un documento interno ----------
select pg_temp.reemplazar(
  'retail.fn_insertar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid, uuid)',
  $v$  if v_serie = '' then
    raise exception 'La nota de crédito necesita su serie y número';
  end if;
$v$,
  $n$  if v_serie = '' then
    raise exception 'La nota de crédito necesita su serie y número';
  end if;
  -- ADR-0362 fase 5b: la serie DI- es de los documentos internos de CAYLA.
  if v_serie like 'DI-%' then
    raise exception 'La serie DI- es de los documentos internos de CAYLA: escribe la serie y el número de la nota del proveedor';
  end if;
$n$,
  1);

select pg_temp.reemplazar(
  'retail.fn_insertar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid, uuid)',
  $v$    if exists (select 1 from compra_notas_credito where compra_id = p_compra_id and motivo = 'faltante') then
      raise exception '%-% ya tiene su nota de crédito por faltante: es una sola por comprobante. Para otro concepto (devolución, descuento) elige ese motivo',
        v_c.serie, v_c.numero;
    end if;
$v$,
  $n$    -- ADR-0362 fase 5b: lo que no llegó y ya se pasó a saldo a favor con un documento interno no se vuelve a acreditar: la nota del
    -- proveedor se adjunta a ese documento.
    if exists (select 1 from compra_notas_credito where compra_id = p_compra_id and motivo = 'faltante' and interna) then
      raise exception '%-% ya tiene documentos internos por lo que no llegó: la nota del proveedor se adjunta a ellos con «Llegó su nota de crédito»',
        v_c.serie, v_c.numero;
    end if;
    if exists (select 1 from compra_notas_credito where compra_id = p_compra_id and motivo = 'faltante' and not interna) then
      raise exception '%-% ya tiene su nota de crédito por faltante: es una sola por comprobante. Para otro concepto (devolución, descuento) elige ese motivo',
        v_c.serie, v_c.numero;
    end if;
$n$,
  1);

-- ---------- 8. Permisos ----------
revoke all on function retail.fn_deuda_papel(uuid, integer) from public, anon, authenticated;
grant execute on function retail.fn_deuda_papel(uuid, integer) to service_role;
revoke all on function retail.fn_deuda_valor_de(uuid, integer) from public, anon, authenticated;
grant execute on function retail.fn_deuda_valor_de(uuid, integer) to service_role;
revoke all on function retail.fn_pasar_deuda_a_saldo_a_favor(uuid, integer, text, uuid, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function retail.fn_pasar_deuda_a_saldo_a_favor(uuid, integer, text, uuid, text, uuid, uuid, text) to service_role;
revoke all on function retail.fn_deuda_documentos_de(uuid) from public, anon, authenticated;
grant execute on function retail.fn_deuda_documentos_de(uuid) to service_role;
revoke all on function retail.fn_deuda_valor(uuid, integer) from public, anon;
grant execute on function retail.fn_deuda_valor(uuid, integer) to authenticated, service_role;
revoke all on function retail.resolver_deuda_proveedor(uuid, text, integer, text, uuid) from public, anon;
grant execute on function retail.resolver_deuda_proveedor(uuid, text, integer, text, uuid) to authenticated, service_role;
revoke all on function retail.fn_nos_debe_deuda(uuid) from public, anon;

reset lock_timeout;

-- ---------- Comprobación: si algo no quedó, el pegado falla y no se aplica nada ----------
do $$
begin
  if position('fn_pasar_deuda_a_saldo_a_favor' in pg_get_functiondef('retail.resolver_deuda_proveedor(uuid, text, integer, text, uuid)'::regprocedure)) = 0 then
    raise exception 'resolver_deuda_proveedor todavía no pasa a saldo a favor';
  end if;
  if position('fn_deuda_valor_de' in pg_get_functiondef('retail.fn_nos_debe_deuda(uuid)'::regprocedure)) = 0 then
    raise exception 'el monto de una deuda todavía no sale del papel';
  end if;
  if position('not n.interna' in pg_get_functiondef('retail.fn_impuestos_compras(date, date)'::regprocedure)) = 0
     or position('not n.interna' in pg_get_functiondef('retail.fn_impuestos_registro_compras(date)'::regprocedure)) = 0
     or position('not n.interna' in pg_get_functiondef('retail.fn_igv_credito_fiscal(date)'::regprocedure)) = 0
     or position('not nc.interna' in pg_get_functiondef('retail.resumen_compras_extra()'::regprocedure)) = 0 then
    raise exception 'Impuestos todavía cuenta el documento interno';
  end if;
  if position('Documento interno ' in pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)) = 0 then
    raise exception 'el Diario todavía llama «nota de crédito» al documento interno';
  end if;
  if position('La serie DI- es de los documentos internos' in pg_get_functiondef('retail.fn_insertar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid, uuid)'::regprocedure)) = 0 then
    raise exception 'una nota del proveedor todavía puede usar la serie DI-';
  end if;
end;
$$;
