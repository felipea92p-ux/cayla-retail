-- ============================================================================
-- 20261015150000_nos_debe_saldo_a_favor.sql — CAYLA V2 · ADR-0362, fase 5b, actividades 1 a 5 (parte 2 de 2: las funciones). Va después de
-- 20261015145000_nos_debe_saldo_a_favor_esquema.sql. Contrato: docs/compras/ordenes-de-compra-2026-10/contrato-nos-debe.md.
--
-- EL PROBLEMA PRIMERO. Una deuda del proveedor solo se saldaba con la prenda. Si no la va a mandar, la plata pagada por ella no volvía.
--
-- QUÉ HACE («Pasar a saldo a favor», decisión 58; actividad 1, con boleta, nota de venta o sin comprobante: sin IGV; actividad 2, con
-- factura: el documento lleva su IGV, que espera la nota de crédito del proveedor en la cuenta puente 4019).
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
--      Con una factura con IGV, el documento lleva su IGV con la razón IGV/subtotal del propio comprobante (la de `fn_deuda_valor_de`): la
--      plata que vuelve es la que se pagó.
--   4. `resolver_deuda_proveedor` (REESCRITA, con candado de huella): `saldo_a_favor` deja de decir «todavía no» y pide Proveedores (o ser
--      líder: `fn_puede_gestionar_proveedores`); «Depositó» sigue diciendo «todavía no» hasta la actividad 5. Y una deuda sin marca
--      (ADR-0393: se cuenta sin marca si hace falta) ya no dice «no existe»: la marca se une con LEFT JOIN.
--   5. `fn_nos_debe_deuda` (REESCRITA, con candado de huella): el monto pendiente sale del papel (`fn_deuda_valor_de`; lo que no tiene papel,
--      al costo con que se recibió), cada resolución trae su documento, y la marca se une con LEFT JOIN.
--   6. Lo que habla con SUNAT no cuenta el documento interno (REEMPLAZOS ANCLADOS): `fn_impuestos_compras`, `fn_impuestos_registro_compras`,
--      `fn_igv_credito_fiscal` y `resumen_compras_extra`. El Diario lo nombra «Documento interno DI-…» y lleva su IGV a la cuenta puente
--      4019, no a la 4011 (`fn_asientos`): el crédito fiscal no baja hasta la nota del proveedor, igual que en Impuestos, y el IGV del Diario
--      sigue cuadrando contra Impuestos (`fn_conciliacion_contable`). Y una nota del
--      proveedor (`fn_insertar_nota_credito_compra`) no puede usar la serie DI- ni ser una nota por faltante de un comprobante que ya tiene
--      documentos internos: esa nota se adjunta al documento interno (actividad 3).
--   7. «Llegó su nota de crédito» (actividad 3): `adjuntar_nota_proveedor` ata la nota 07 del proveedor a los documentos internos de una
--      factura que respalda, sin mover plata (eso ya lo hizo el documento): pide el módulo Notas de crédito, que la nota diga lo mismo que
--      esos documentos (el monto se escribe como dice el papel, y tiene que coincidir), y respeta el mes cerrado. Desde la fecha de esa nota:
--      Impuestos la cuenta como nota de crédito (`fn_impuestos_compras`, `fn_impuestos_registro_compras`, `fn_igv_credito_fiscal`,
--      `resumen_compras_extra`: REEMPLAZOS ANCLADOS) y el Diario saca su IGV de la cuenta puente 4019 y baja el crédito fiscal (4011,
--      `fn_asientos_nota_proveedor`). El tablero de Notas de crédito lee qué documentos ya tienen su nota (`fn_notas_proveedor_tablero`).
--   8. El aviso del IGV (actividad 4): `fn_igv_en_espera` dice al Inicio y al Observatorio cuánto IGV de lo que no llegó falta regularizar:
--      los documentos internos de una factura que esperan la nota del proveedor (su IGV, en la cuenta puente) y las prendas de una factura
--      que no llegaron y nadie resolvió (su IGV sigue en el crédito fiscal sin la mercadería). Cada parte, solo para quien puede hacer algo
--      con ella (Notas de crédito; ver lo que debe un proveedor); para los demás, nula.
--   9. «Depositó» (actividad 5, decisiones 24 y 59): el proveedor devuelve en plata lo que no mandó. `registrar_deposito_deuda` (la web)
--      recibe el depósito (cuánto, cómo, cuándo y a qué cuenta entró) y llama a `resolver_deuda_proveedor` con la forma `deposito`, que en
--      UNA transacción registra el documento interno (como pasar a saldo a favor) y el reembolso de lo que quedó a favor: lo depositado tiene
--      que ser eso, ni más ni menos. Con el módulo Proveedores, como pasar a saldo a favor. El resolvedor no cambia de firma (lo recargan
--      20261013180000 y sus pruebas): el depósito le llega en un ajuste de la transacción, `retail.deposito_de_deuda`. Y
--      `fn_saldo_favor_visible`: el saldo a favor que lee la ficha, con el permiso de quien ve la plata de los proveedores (con Proveedores
--      solo, la ficha decía S/ 0: `fn_saldo_favor_proveedor` suma con los permisos de quien mira, y la tabla no le muestra las filas).
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
-- La de 8 argumentos (actividades 1 a 4, nunca en producción) se reemplaza por la de 10: la forma (`saldo_a_favor` o `deposito`) y la fecha
-- (la del depósito; sin ella, hoy). Se borra antes para no dejar dos versiones que la llamada no sabría distinguir.
drop function if exists retail.fn_pasar_deuda_a_saldo_a_favor(uuid, integer, text, uuid, text, uuid, uuid, text);
create or replace function retail.fn_pasar_deuda_a_saldo_a_favor(
  p_diferencia_id uuid,
  p_cantidad integer,
  p_nota text,
  p_token uuid,
  p_huella text,
  p_actor uuid,
  p_ubicacion_id uuid,
  p_texto_cierre text,
  p_forma text default 'saldo_a_favor',
  p_fecha date default null
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
  v_hoy date := coalesce(p_fecha, retail.fn_hoy_lima());
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
    -- Con una factura con IGV, el documento lleva su IGV (actividad 2): la razón IGV/subtotal del propio comprobante, la misma de
    -- `fn_deuda_valor_de`. Ese IGV espera la nota del proveedor en la cuenta puente 4019 (`fn_asientos`).
    v_igv := coalesce((select case when c.tipo = 'factura' and coalesce(c.igv, 0) > 0 and c.subtotal > 0
                                   then round(v_base * c.igv / c.subtotal, 2) else 0 end
                         from retail.compras c where c.id = v_compra), 0);
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
    values (p_diferencia_id, p_forma, v_cantidad, p_nota,
            case when v_primera_res is null then p_token end, case when v_primera_res is null then p_huella end, p_actor, v_nota_id)
    returning id into v_res;
    v_primera_res := coalesce(v_primera_res, v_res);
    v_docs := v_docs || jsonb_build_object('documento', v_doc, 'nota_credito_id', v_nota_id, 'compra_id', v_compra, 'comprobante', v_c.documento,
                                           'cantidad', v_cantidad, 'monto', v_monto, 'igv', v_igv, 'baja_deuda', v_aplicado,
                                           'a_favor', v_excedente);
  end loop;

  return jsonb_build_object('resolucion_id', v_primera_res, 'documentos', v_docs);
end;
$$;
comment on function retail.fn_pasar_deuda_a_saldo_a_favor(uuid, integer, text, uuid, text, uuid, uuid, text, text, date) is
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
  -- «Depositó» (actividad 5): los datos del depósito los pone `registrar_deposito_deuda` en un ajuste de esta transacción; sin él, no hay.
  p_deposito jsonb := case when lower(btrim(coalesce(p_forma, ''))) = 'deposito'
                           then nullif(nullif(current_setting('retail.deposito_de_deuda', true), ''), 'null')::jsonb end;
  v_dep_monto numeric;
  v_dep_metodo text;
  v_dep_fecha date;
  v_dep_referencia text;
  v_dep_cuenta uuid;
  v_a_favor numeric;
  v_doc jsonb;
begin
  -- Pasar a saldo a favor y «Depositó» mueven plata: son de quien lleva a los proveedores (fase 5b, decisiones 58 y 59; el módulo es la
  -- llave, 40). La reposición, como en la 5a: Proveedores o Recibir.
  if v_forma in ('saldo_a_favor', 'deposito') then
    if retail.fn_puede_gestionar_proveedores() is not true then
      raise exception '%', case when v_forma = 'deposito' then 'Registrar que un proveedor depositó lo que debe necesita el módulo «Proveedores» en tu rol'
                                else 'Pasar a saldo a favor lo que debe un proveedor necesita el módulo «Proveedores» en tu rol' end
        using errcode = '42501', hint = 'nos_debe_sin_modulo';
    end if;
  elsif retail.fn_ve_modulo('proveedores') is not true and retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Marcar lo que repuso un proveedor necesita el módulo «Proveedores» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'nos_debe_sin_modulo';
  end if;
  if v_forma is null or v_forma not in ('repuesta', 'saldo_a_favor', 'deposito') then
    raise exception 'No se entiende cómo se resolvió la deuda: elige «Llegó la reposición», «Pasar a saldo a favor» o «Depositó»' using hint = 'nos_debe_forma';
  end if;

  -- La deuda se bloquea ANTES de mirar el token: un doble clic con el mismo token se pone en fila y el segundo devuelve lo del primero;
  -- dos personas marcando la misma deuda a la vez, también, y la segunda ve lo que ya quedó. La marca puede faltar (ADR-0393): LEFT JOIN.
  select x.id, x.despacho_id, x.proveedor_id, x.tipo, x.causa, x.cantidad, x.creado_en, d.numero as envio_numero, d.ubicacion_destino_id,
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
  v_huella := md5((jsonb_build_object('diferencia_id', p_diferencia_id, 'forma', v_forma, 'cantidad', p_cantidad, 'nota', v_nota)
                   || case when v_forma = 'deposito' then jsonb_build_object('deposito', p_deposito) else '{}'::jsonb end)::text);
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
    raise exception '%', case when v_forma = 'repuesta' then 'Escribe cuántas llegaron: desde 1'
                              when v_forma = 'deposito' then 'Escribe cuántas pagó con el depósito: desde 1'
                              else 'Escribe cuántas pasan a saldo a favor: desde 1' end
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

  -- «Depositó»: cuánto, cómo, cuándo y a qué cuenta entró (como un reembolso). El monto se compara más abajo con lo que quedó a favor.
  if v_forma = 'deposito' then
    if p_deposito is null or jsonb_typeof(p_deposito) <> 'object' then
      raise exception 'Faltan los datos del depósito: cuánto, cómo y cuándo' using hint = 'nos_debe_deposito_monto';
    end if;
    if jsonb_typeof(p_deposito -> 'monto') <> 'number' or (p_deposito ->> 'monto')::numeric <= 0 then
      raise exception 'Escribe cuánto te depositó' using hint = 'nos_debe_deposito_monto';
    end if;
    v_dep_monto := (p_deposito ->> 'monto')::numeric;
    if v_dep_monto <> round(v_dep_monto, 2) then
      raise exception 'El monto del depósito admite como máximo 2 decimales' using hint = 'nos_debe_deposito_monto';
    end if;
    v_dep_metodo := lower(nullif(btrim(coalesce(p_deposito ->> 'metodo', '')), ''));
    if v_dep_metodo is null or v_dep_metodo not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
      raise exception 'Elige cómo te devolvió la plata' using hint = 'nos_debe_deposito_metodo';
    end if;
    begin
      v_dep_fecha := coalesce(nullif(p_deposito ->> 'fecha', '')::date, retail.fn_hoy_lima());
    exception when others then
      raise exception 'La fecha del depósito no se entiende' using hint = 'nos_debe_deposito_fecha';
    end;
    if v_dep_fecha > retail.fn_hoy_lima() then
      raise exception 'La fecha del depósito no puede ser futura' using hint = 'nos_debe_deposito_fecha';
    end if;
    if v_dep_fecha < (v_deuda.creado_en at time zone 'America/Lima')::date then
      raise exception 'El depósito no puede ser anterior a la recepción donde faltaron' using hint = 'nos_debe_deposito_fecha';
    end if;
    v_dep_referencia := nullif(btrim(coalesce(p_deposito ->> 'referencia', '')), '');
    if length(v_dep_referencia) > 60 then
      raise exception 'La referencia va hasta 60 letras' using hint = 'nos_debe_deposito_referencia';
    end if;
    begin
      v_dep_cuenta := nullif(p_deposito ->> 'cuenta_id', '')::uuid;
    exception when others then
      raise exception 'Esa cuenta no existe: recarga la pantalla' using hint = 'nos_debe_deposito_cuenta';
    end;
    if v_dep_cuenta is not null
       and not exists (select 1 from retail.cuentas_dinero c where c.id = v_dep_cuenta and c.archivada_en is null and c.tipo <> 'fondo') then
      raise exception 'Esa cuenta ya no está: elige otra' using hint = 'nos_debe_deposito_cuenta';
    end if;
  end if;

  begin
    if v_forma = 'repuesta' then
      insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, nota, token_cliente, huella, creado_por)
      values (p_diferencia_id, 'repuesta', p_cantidad, v_nota, p_token, v_huella, v_actor)
      returning id into v_id;
    else
      v_plata := retail.fn_pasar_deuda_a_saldo_a_favor(
        p_diferencia_id, p_cantidad, v_nota, p_token, v_huella, v_actor, v_deuda.ubicacion_destino_id,
        left(case when v_forma = 'deposito' then 'Las pagó con un depósito: ' || p_cantidad else 'Pasó a saldo a favor ' || p_cantidad end
             || ' de ' || v_deuda.que || ' (faltaron en la ' || retail.fn_envio_numero_texto(v_deuda.envio_numero) || ')', 300),
        v_forma, case when v_forma = 'deposito' then v_dep_fecha end);
      v_id := (v_plata ->> 'resolucion_id')::uuid;
      if v_forma = 'deposito' then
        -- Lo que el proveedor depositó es lo que quedó a favor después de bajar lo que se le debía de ese comprobante: ni más ni menos.
        v_a_favor := coalesce((select sum((d ->> 'a_favor')::numeric) from jsonb_array_elements(v_plata -> 'documentos') d), 0);
        if v_a_favor <= 0 then
          raise exception 'Todavía le debes ese comprobante: lo que no llegó solo baja tu deuda (S/ %). No hace falta que te deposite: usa «Pasar a saldo a favor»',
            to_char(coalesce((select sum((d ->> 'baja_deuda')::numeric) from jsonb_array_elements(v_plata -> 'documentos') d), 0), 'FM999999990.00')
            using hint = 'nos_debe_deposito_sin_sobrante';
        end if;
        if v_dep_monto <> v_a_favor then
          raise exception 'El depósito es de S/ %, pero lo que no llegó deja S/ % a tu favor (después de bajar lo que le debías): revisa el monto',
            to_char(v_dep_monto, 'FM999999990.00'), to_char(v_a_favor, 'FM999999990.00') using hint = 'nos_debe_deposito_monto';
        end if;
        -- Un reembolso por documento interno, con su parte: así cada uno queda saldado en el libro del saldo a favor.
        for v_doc in select d from jsonb_array_elements(v_plata -> 'documentos') d where (d ->> 'a_favor')::numeric > 0 loop
          perform retail.fn_insertar_reembolso_proveedor(v_deuda.proveedor_id, (v_doc ->> 'a_favor')::numeric, v_dep_metodo, v_dep_referencia,
                                                         v_dep_fecha, v_nota, v_actor, (v_doc ->> 'nota_credito_id')::uuid, v_dep_cuenta);
        end loop;
      end if;
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
    elsif v_forma = 'deposito' then
      v_desc := 'registró que ' || v_deuda.proveedor || ' depositó lo de ' || p_cantidad || ' de ' || v_deuda.que || ' (faltaron en la '
        || retail.fn_envio_numero_texto(v_deuda.envio_numero) || '): '
        || coalesce((select string_agg(e ->> 'documento', ', ') from jsonb_array_elements(v_plata -> 'documentos') e), '');
      perform retail.fn_actividad_anotar('proveedores', 'deuda_deposito', v_desc, v_actor, retail.fn_actividad_terminal_ahora(),
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

-- «Depositó» (actividad 5): la puerta de la web. Deja el depósito en un ajuste de ESTA transacción y llama al resolvedor con la forma
-- `deposito`, que lo vuelve a exigir todo (el módulo, la deuda, la cantidad, el depósito) y escribe el documento interno y el reembolso
-- juntos. Fuera de esta función el resolvedor no tiene depósito y no escribe nada.
create or replace function retail.registrar_deposito_deuda(p_diferencia_id uuid, p_cantidad integer, p_nota text, p_token uuid, p_deposito jsonb)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_r jsonb;
begin
  perform set_config('retail.deposito_de_deuda', coalesce(p_deposito, 'null'::jsonb)::text, true);
  v_r := retail.resolver_deuda_proveedor(p_diferencia_id, 'deposito', p_cantidad, p_nota, p_token);
  perform set_config('retail.deposito_de_deuda', '', true);
  return v_r;
end;
$$;
comment on function retail.registrar_deposito_deuda(uuid, integer, text, uuid, jsonb) is
  'ADR-0362 fase 5b (actividad 5, decisiones 24 y 59): «Depositó». El proveedor devolvió en plata lo que no mandó: documento interno y reembolso de lo que quedó a favor, en una transacción. Con el módulo Proveedores.';

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

-- El IGV de un documento interno (una factura, actividad 2) no baja el crédito fiscal: va a la cuenta puente hasta la nota del proveedor.
select pg_temp.reemplazar(
  'retail.fn_asientos(date, date, uuid)',
  $v$'nota_credito_prov', '4011', 0, nc.igv, 'compra_notas_credito', nc.id, 'Baja el IGV descontable'$v$,
  $n$'nota_credito_prov', case when nc.serie_numero like 'DI-%' then '4019' else '4011' end, 0, nc.igv, 'compra_notas_credito', nc.id,
           case when nc.serie_numero like 'DI-%' then 'IGV por regularizar: falta la nota de crédito del proveedor' else 'Baja el IGV descontable' end$n$,
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

-- ---------- 8. «Llegó su nota de crédito»: la nota del proveedor que respalda documentos internos (actividad 3) ----------
-- Lo que devuelve: la nota y los documentos que respalda. Interna (la usan la función de abajo y su reintento).
create or replace function retail.fn_nota_proveedor_resumen(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object('nota_proveedor_id', p.id, 'serie_numero', p.serie_numero, 'fecha', p.fecha, 'subtotal', p.subtotal, 'igv', p.igv,
                            'monto', p.monto, 'comprobante', c.documento,
                            'documentos', coalesce((select jsonb_agg(n.serie_numero order by n.serie_numero)
                                                      from retail.compra_notas_proveedor_documentos d
                                                      join retail.compra_notas_credito n on n.id = d.nota_credito_id
                                                     where d.nota_proveedor_id = p.id), '[]'::jsonb))
    from retail.compra_notas_proveedor p
    join retail.compras c on c.id = p.compra_id
   where p.id = p_id;
$$;

create or replace function retail.adjuntar_nota_proveedor(p_documentos uuid[], p_serie_numero text, p_fecha date, p_monto numeric, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_serie text := upper(btrim(coalesce(p_serie_numero, '')));
  v_ids uuid[];
  v_n integer;
  v_compras integer;
  v_compra uuid;
  v_c record;
  v_actor uuid;
  v_huella text;
  v_existente record;
  v_ya text;
  v_base numeric(12, 2);
  v_igv numeric(12, 2);
  v_monto numeric(12, 2);
  v_id uuid;
  v_docs text;
  v_hoy date := retail.fn_hoy_lima();
begin
  -- Es del módulo Notas de crédito, como registrar una nota del proveedor (`fn_puede_registrar_notas_credito`).
  if retail.fn_puede_registrar_notas_credito() is not true then
    raise exception 'Adjuntar la nota de crédito de un proveedor necesita el módulo «Notas de crédito» en tu rol'
      using errcode = '42501', hint = 'nota_proveedor_sin_modulo';
  end if;

  -- Qué respalda: documentos internos de una FACTURA (con IGV), todos de un mismo comprobante.
  v_ids := array(select distinct x from unnest(coalesce(p_documentos, '{}'::uuid[])) x where x is not null order by 1);
  if cardinality(v_ids) = 0 then
    raise exception 'Elige qué documento interno respalda la nota' using hint = 'nota_proveedor_documentos';
  end if;
  select count(*), count(distinct n.compra_id), min(n.compra_id::text)::uuid into v_n, v_compras, v_compra
    from retail.compra_notas_credito n
   where n.id = any (v_ids) and n.interna and n.igv > 0;
  if v_n <> cardinality(v_ids) then
    raise exception 'La nota del proveedor solo se adjunta a documentos internos de una factura: recarga la pantalla' using hint = 'nota_proveedor_documentos';
  end if;
  if v_compras <> 1 then
    raise exception 'Una nota del proveedor es de un solo comprobante: elige documentos internos del mismo' using hint = 'nota_proveedor_documentos';
  end if;
  if not retail.fn_compra_es_de_mis_tiendas(v_compra) then
    raise exception 'Ese comprobante lo gestiona otra tienda: su nota la adjunta ella (o un líder)' using errcode = '42501', hint = 'nota_proveedor_sin_modulo';
  end if;

  -- El comprobante se bloquea: dos personas adjuntando a la vez se ponen en fila, y todo lo de abajo se mira después de esperar.
  select c.id, c.documento, c.estado, c.fecha_emision, c.proveedor_id, c.ubicacion_gestion_id, pr.nombre as proveedor into v_c
    from retail.compras c join retail.proveedores pr on pr.id = c.proveedor_id
   where c.id = v_compra
     for update of c;
  if v_c.estado <> 'vigente' then
    raise exception '% está anulado: no recibe notas de crédito', v_c.documento using hint = 'nota_proveedor_anulado';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  v_huella := md5(array_to_string(v_ids, ',') || '|' || v_serie || '|' || coalesce(p_fecha::text, '') || '|' || coalesce(round(p_monto, 2)::text, ''));

  -- El mismo pedido otra vez (doble clic, corte de señal) devuelve lo mismo; el mismo token con otros datos, no.
  if p_token is not null then
    select p.id, p.huella into v_existente from retail.compra_notas_proveedor p where p.token_cliente = p_token;
    if found then
      if v_existente.huella = v_huella then
        return retail.fn_nota_proveedor_resumen(v_existente.id);
      end if;
      raise exception 'Eso ya se guardó con otros datos: recarga la pantalla' using hint = 'nota_proveedor_otros_datos';
    end if;
  end if;

  -- Cada documento interno, una sola nota del proveedor.
  select string_agg(n.serie_numero || ' (' || p.serie_numero || ')', ', ' order by n.serie_numero) into v_ya
    from retail.compra_notas_proveedor_documentos d
    join retail.compra_notas_credito n on n.id = d.nota_credito_id
    join retail.compra_notas_proveedor p on p.id = d.nota_proveedor_id
   where d.nota_credito_id = any (v_ids);
  if v_ya is not null then
    raise exception 'Ya tiene su nota del proveedor: %. Recarga la pantalla', v_ya using hint = 'nota_proveedor_ya_adjunta';
  end if;

  -- La serie: la del proveedor, que no se repite en el comprobante (ni entre sus notas de crédito).
  if v_serie = '' then
    raise exception 'Escribe la serie y el número de la nota del proveedor' using hint = 'nota_proveedor_serie';
  end if;
  if v_serie like 'DI-%' then
    raise exception 'La serie DI- es de los documentos internos de CAYLA: escribe la de la nota del proveedor' using hint = 'nota_proveedor_serie';
  end if;
  if length(v_serie) > 30 then
    raise exception 'La serie y el número de la nota van hasta 30 letras' using hint = 'nota_proveedor_serie';
  end if;
  if exists (select 1 from retail.compra_notas_credito n where n.compra_id = v_compra and n.serie_numero = v_serie)
     or exists (select 1 from retail.compra_notas_proveedor p where p.compra_id = v_compra and p.serie_numero = v_serie) then
    raise exception 'La nota % ya está registrada en %', v_serie, v_c.documento using hint = 'nota_proveedor_serie';
  end if;

  -- La fecha: la de la nota, ni futura ni anterior al comprobante (como cualquier nota de crédito). El mes cerrado lo frena su disparador.
  if p_fecha is null then
    raise exception 'Elige la fecha de la nota' using hint = 'nota_proveedor_fecha';
  end if;
  if p_fecha > v_hoy then
    raise exception 'La fecha de la nota no puede ser futura' using hint = 'nota_proveedor_fecha';
  end if;
  if p_fecha < v_c.fecha_emision then
    raise exception 'La nota no puede ser anterior al comprobante (emitido el %)', to_char(v_c.fecha_emision, 'DD/MM/YYYY')
      using hint = 'nota_proveedor_fecha';
  end if;

  -- El monto: como lo dice el papel, y tiene que ser lo mismo que los documentos que respalda (la plata ya volvió con ellos: una nota por
  -- otra cifra es un error del proveedor, que la corrige él).
  select coalesce(sum(n.subtotal), 0), coalesce(sum(n.igv), 0), coalesce(sum(n.monto), 0) into v_base, v_igv, v_monto
    from retail.compra_notas_credito n where n.id = any (v_ids);
  if p_monto is null or p_monto <= 0 then
    raise exception 'Escribe el monto de la nota, como lo dice el papel' using hint = 'nota_proveedor_monto';
  end if;
  if p_monto <> round(p_monto, 2) then
    raise exception 'El monto de la nota admite como máximo 2 decimales' using hint = 'nota_proveedor_monto';
  end if;
  if p_monto <> v_monto then
    raise exception 'La nota dice S/ %, pero lo que no llegó suma S/ % (base S/ % + IGV S/ %): pídele al proveedor que la corrija',
      to_char(p_monto, 'FM999999990.00'), to_char(v_monto, 'FM999999990.00'), to_char(v_base, 'FM999999990.00'), to_char(v_igv, 'FM999999990.00')
      using hint = 'nota_proveedor_monto';
  end if;

  begin
    insert into retail.compra_notas_proveedor (compra_id, serie_numero, fecha, subtotal, igv, monto, usuario_id, token_cliente, huella)
    values (v_compra, v_serie, p_fecha, v_base, v_igv, v_monto, v_actor, p_token, v_huella)
    returning id into v_id;
    insert into retail.compra_notas_proveedor_documentos (nota_proveedor_id, nota_credito_id)
    select v_id, x from unnest(v_ids) x;
  exception when unique_violation then
    raise exception 'Eso ya se guardó: recarga la pantalla' using hint = 'nota_proveedor_otros_datos';
  end;

  -- Actividad (ADR-0207), sin montos, en el módulo donde vive el botón. Si falla, igual queda.
  begin
    select string_agg(n.serie_numero, ', ' order by n.serie_numero) into v_docs from retail.compra_notas_credito n where n.id = any (v_ids);
    perform retail.fn_actividad_anotar('notas_credito', 'nota_proveedor_adjunta',
      'adjuntó la nota ' || v_serie || ' de ' || v_c.proveedor || ' a ' || coalesce(v_docs, '') || ' (' || coalesce(v_c.documento, '') || ')',
      v_actor, retail.fn_actividad_terminal_ahora(), v_c.ubicacion_gestion_id, null, 'compra_notas_proveedor', v_id::text, now(),
      jsonb_build_object('compra_id', v_compra, 'documentos', to_jsonb(v_ids)), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la nota del proveedor % (%)', v_id, sqlerrm;
  end;

  return retail.fn_nota_proveedor_resumen(v_id);
end;
$$;
comment on function retail.adjuntar_nota_proveedor(uuid[], text, date, numeric, uuid) is
  'ADR-0362 fase 5b (actividad 3): «Llegó su nota de crédito». Ata la nota 07 del proveedor a los documentos internos de una factura que respalda, sin mover plata; desde su fecha, su IGV baja el crédito fiscal (Impuestos y Diario). Módulo Notas de crédito.';

-- El tablero de Notas de crédito: qué documentos internos ya tienen su nota del proveedor. Con el mismo candado que el tablero.
create or replace function retail.fn_notas_proveedor_tablero()
returns table (nota_credito_id uuid, nota_proveedor_id uuid, serie_numero text, fecha date)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_exige_dinero_de_compras('las notas de crédito de proveedores');
  select d.nota_credito_id, p.id, p.serie_numero, p.fecha
    from retail.compra_notas_proveedor_documentos d
    join retail.compra_notas_proveedor p on p.id = d.nota_proveedor_id
   where retail.fn_compra_es_de_mis_tiendas(p.compra_id);
$$;
comment on function retail.fn_notas_proveedor_tablero() is
  'ADR-0362 fase 5b (actividad 3): los documentos internos que ya tienen su nota del proveedor, para el tablero de Notas de crédito.';

-- El Diario: la nota del proveedor saca el IGV de la cuenta puente (debe 4019) y baja el crédito fiscal (haber 4011), en su fecha.
create or replace function retail.fn_asientos_nota_proveedor(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (f date, ubicacion_id uuid, asiento text, regla text, cuenta text, debe numeric, haber numeric, ot text, oid uuid, glosa text)
language sql stable set search_path = retail, public, extensions as $$
  with np as (
    select p.id, c.ubicacion_gestion_id as ubicacion_id, p.fecha, p.igv, p.serie_numero
      from retail.compra_notas_proveedor p
      join retail.compras c on c.id = p.compra_id
     where c.estado = 'vigente' and p.fecha between p_desde and p_hasta and (p_todo or c.ubicacion_gestion_id = any (p_ubics))
  )
  select np.fecha, np.ubicacion_id, 'nota_proveedor:' || np.id, 'nota_proveedor', '4019', np.igv, 0::numeric,
         'compra_notas_proveedor', np.id, 'Nota de crédito ' || np.serie_numero || ' del proveedor: el IGV sale de por regularizar'
    from np
  union all
  select np.fecha, np.ubicacion_id, 'nota_proveedor:' || np.id, 'nota_proveedor', '4011', 0::numeric, np.igv,
         'compra_notas_proveedor', np.id, 'Baja el IGV descontable'
    from np;
$$;

select pg_temp.reemplazar(
  'retail.fn_asientos(date, date, uuid)',
  $v$union all select * from l_nc union all select * from l_pago$v$,
  $n$union all select * from l_nc
    -- ADR-0362 fase 5b, actividad 3: la nota del proveedor saca el IGV de la cuenta puente y baja el crédito fiscal, en su mes.
    union all select * from retail.fn_asientos_nota_proveedor(p_desde, p_hasta, v_todo, v_ubics) union all select * from l_pago$n$,
  1);

-- Impuestos: la nota del proveedor es una nota de crédito ante SUNAT, en el mes de su fecha (origen `nota_credito`, como las demás: así
-- `fn_impuestos_igv_meses` y el panel la suman sin cambios). Se inserta ANTES de la rama de las notas, que el WHERE de esa rama es el
-- comienzo del texto que dejó 20261014153000 y partirlo haría que esa migración no se pudiera volver a pegar.
select pg_temp.reemplazar(
  'retail.fn_impuestos_compras(date, date)',
  $v$  select 'nota_credito', n.id, k.naturaleza, n.fecha, 'nota_credito', -n.subtotal, -n.igv, -n.monto, k.tipo = 'factura'
$v$,
  $n$  -- ADR-0362 fase 5b, actividad 3: la nota de crédito del proveedor que respalda documentos internos de una factura.
  select 'nota_credito', p.id, k.naturaleza, p.fecha, 'nota_credito', -p.subtotal, -p.igv, -p.monto, k.tipo = 'factura'
    from retail.compra_notas_proveedor p
    join retail.compras k on k.id = p.compra_id
   where k.estado = 'vigente' and p.fecha between p_desde and p_hasta
  union all
  select 'nota_credito', n.id, k.naturaleza, n.fecha, 'nota_credito', -n.subtotal, -n.igv, -n.monto, k.tipo = 'factura'
$n$,
  1);

select pg_temp.reemplazar(
  'retail.fn_impuestos_registro_compras(date)',
  $v$    select 'nota_credito', k.naturaleza, n.fecha, null, 'nota_credito',
$v$,
  $n$    -- ADR-0362 fase 5b, actividad 3: la nota de crédito del proveedor que respalda documentos internos de una factura.
    select 'nota_credito', k.naturaleza, p.fecha, null, 'nota_credito',
           split_part(p.serie_numero, '-', 1),
           nullif(substr(p.serie_numero, length(split_part(p.serie_numero, '-', 1)) + 2), ''),
           pr.ruc, pr.nombre,
           -p.subtotal, -p.igv, 0::numeric, -p.monto, k.tipo = 'factura',
           k.fecha_emision, k.tipo, k.serie, k.numero,
           coalesce(ug.nombre, case when k.naturaleza <> 'mercaderia' then 'De la empresa' end)
      from retail.compra_notas_proveedor p
      join retail.compras k on k.id = p.compra_id
      join retail.proveedores pr on pr.id = k.proveedor_id
      left join retail.ubicaciones ug on ug.id = k.ubicacion_gestion_id
     where k.estado = 'vigente' and p.fecha between v_ini and v_fin
    union all
    select 'nota_credito', k.naturaleza, n.fecha, null, 'nota_credito',
$n$,
  1);

select pg_temp.reemplazar(
  'retail.fn_igv_credito_fiscal(date)',
  $v$  nc as (select coalesce(sum(n.igv), 0) as v from retail.compra_notas_credito n join retail.compras k on k.id = n.compra_id, m$v$,
  $n$  nc as (select coalesce(sum(n.igv), 0)
                 -- ADR-0362 fase 5b, actividad 3: la nota del proveedor que respalda documentos internos baja el crédito fiscal en su mes.
                 + coalesce((select sum(p.igv) from retail.compra_notas_proveedor p join retail.compras kp on kp.id = p.compra_id, m mp
                              where kp.estado = 'vigente' and p.fecha >= mp.ini and p.fecha < mp.ini + interval '1 month'), 0) as v
           from retail.compra_notas_credito n join retail.compras k on k.id = n.compra_id, m$n$,
  1);

select pg_temp.reemplazar(
  'retail.resumen_compras_extra()',
  $v$      select coalesce(sum(nc.igv), 0)
      from retail.compra_notas_credito nc$v$,
  $n$      select coalesce(sum(nc.igv), 0)
             -- ADR-0362 fase 5b, actividad 3: la nota del proveedor que respalda documentos internos.
             + coalesce((select sum(p.igv) from retail.compra_notas_proveedor p join retail.compras cp on cp.id = p.compra_id
                          where p.fecha >= $1 and p.fecha < $2 and cp.estado = 'vigente' and fn_compra_es_de_mis_tiendas(cp.id)), 0)
      from retail.compra_notas_credito nc$n$,
  1);

-- ---------- 8b. El aviso del IGV (actividad 4) ----------
create or replace function retail.fn_igv_en_espera()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_sin_nota jsonb;
  v_faltantes jsonb;
begin
  -- Las notas del proveedor por pedir: de quien las adjunta (Notas de crédito), en sus tiendas, como el tablero.
  if retail.fn_puede_registrar_notas_credito() then
    select jsonb_build_object('documentos', count(*), 'facturas', count(distinct n.compra_id), 'igv', coalesce(sum(n.igv), 0),
                              'desde', min(n.fecha))
      into v_sin_nota
      from retail.compra_notas_credito n
      join retail.compras c on c.id = n.compra_id
     where n.interna and n.igv > 0 and c.estado = 'vigente' and retail.fn_compra_es_de_mis_tiendas(c.id)
       and not exists (select 1 from retail.compra_notas_proveedor_documentos d where d.nota_credito_id = n.id);
  end if;

  -- Las prendas de una factura que no llegaron y siguen sin resolver: de quien ve lo que debe un proveedor (como `fn_nos_debe_resumen`,
  -- de toda la empresa). Su IGV sale del papel (`fn_deuda_valor_de`): solo cuenta lo que está en una factura con IGV.
  if retail.fn_ve_plata_de_proveedores() then
    with abiertas as (
      select x.id, x.proveedor_id, x.creado_en,
             (x.cantidad - coalesce((select sum(r.cantidad) from retail.proveedor_deuda_resoluciones r where r.diferencia_id = x.id), 0))::integer as pendiente
        from retail.despacho_diferencias_vigentes x
       where x.tipo = 'faltante' and x.causa = 'no_vino'
    ),
    con_igv as (
      select a.id, a.proveedor_id, a.creado_en, p ->> 'compra_id' as compra_id, (p ->> 'cantidad')::integer as prendas, (p ->> 'igv')::numeric as igv
        from abiertas a
       cross join lateral jsonb_array_elements(retail.fn_deuda_valor_de(a.id, a.pendiente) -> 'papeles') p
       where a.pendiente > 0 and (p ->> 'igv')::numeric > 0
    ),
    resumen as (
      select count(distinct id) as deudas, count(distinct compra_id) as facturas, coalesce(sum(prendas), 0) as prendas,
             coalesce(sum(igv), 0) as igv, count(distinct proveedor_id) as proveedores, min(proveedor_id::text) as uno, min(creado_en) as desde
        from con_igv
    )
    select jsonb_build_object('deudas', r.deudas, 'facturas', r.facturas, 'prendas', r.prendas, 'igv', r.igv, 'proveedores', r.proveedores,
                              'proveedor_id', case when r.proveedores = 1 then r.uno end,
                              'proveedor', case when r.proveedores = 1 then (select pr.nombre from retail.proveedores pr where pr.id = r.uno::uuid) end,
                              'desde', r.desde)
      into v_faltantes
      from resumen r;
  end if;

  return jsonb_build_object('sin_nota', v_sin_nota, 'faltantes', v_faltantes);
end;
$$;
comment on function retail.fn_igv_en_espera() is
  'ADR-0362 fase 5b (actividad 4): el aviso del IGV del Inicio y del Observatorio. Notas del proveedor por pedir (documentos internos de una factura sin su nota) y prendas de una factura que no llegaron y siguen sin resolver, con su IGV. Cada parte, nula para quien no puede hacer nada con ella.';

-- ---------- 8c. El saldo a favor que lee la ficha (actividad 5) ----------
-- `fn_saldo_favor_proveedor` suma con los permisos de quien mira: con el módulo Proveedores solo, la tabla no le muestra las filas y la ficha
-- decía S/ 0 (aunque sí veía el libro). Esta lectura pregunta el permiso de ver la plata de los proveedores, como el libro, y suma todo.
-- La de siempre no se toca: la usan por dentro el pago y el reembolso.
create or replace function retail.fn_saldo_favor_visible(p_proveedor_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_plata_de_proveedores() is not true then
    raise exception 'Ver el saldo a favor de un proveedor necesita el módulo «Proveedores» o la plata de Compras en tu rol' using errcode = '42501';
  end if;
  return retail.fn_saldo_favor_proveedor(p_proveedor_id);
end;
$$;
comment on function retail.fn_saldo_favor_visible(uuid) is
  'ADR-0362 fase 5b (actividad 5): el saldo a favor de un proveedor para la ficha y Por pagar, con el permiso de ver la plata de los proveedores (con Proveedores solo, fn_saldo_favor_proveedor daba 0).';

-- ---------- 9. Permisos ----------
revoke all on function retail.fn_deuda_papel(uuid, integer) from public, anon, authenticated;
grant execute on function retail.fn_deuda_papel(uuid, integer) to service_role;
revoke all on function retail.fn_deuda_valor_de(uuid, integer) from public, anon, authenticated;
grant execute on function retail.fn_deuda_valor_de(uuid, integer) to service_role;
revoke all on function retail.fn_pasar_deuda_a_saldo_a_favor(uuid, integer, text, uuid, text, uuid, uuid, text, text, date) from public, anon, authenticated;
grant execute on function retail.fn_pasar_deuda_a_saldo_a_favor(uuid, integer, text, uuid, text, uuid, uuid, text, text, date) to service_role;
revoke all on function retail.fn_deuda_documentos_de(uuid) from public, anon, authenticated;
grant execute on function retail.fn_deuda_documentos_de(uuid) to service_role;
revoke all on function retail.fn_deuda_valor(uuid, integer) from public, anon;
grant execute on function retail.fn_deuda_valor(uuid, integer) to authenticated, service_role;
revoke all on function retail.resolver_deuda_proveedor(uuid, text, integer, text, uuid) from public, anon;
grant execute on function retail.resolver_deuda_proveedor(uuid, text, integer, text, uuid) to authenticated, service_role;
revoke all on function retail.registrar_deposito_deuda(uuid, integer, text, uuid, jsonb) from public, anon;
grant execute on function retail.registrar_deposito_deuda(uuid, integer, text, uuid, jsonb) to authenticated, service_role;
revoke all on function retail.fn_nos_debe_deuda(uuid) from public, anon;
revoke all on function retail.fn_nota_proveedor_resumen(uuid) from public, anon, authenticated;
grant execute on function retail.fn_nota_proveedor_resumen(uuid) to service_role;
revoke all on function retail.fn_asientos_nota_proveedor(date, date, boolean, uuid[]) from public, anon, authenticated;
revoke all on function retail.adjuntar_nota_proveedor(uuid[], text, date, numeric, uuid) from public, anon;
grant execute on function retail.adjuntar_nota_proveedor(uuid[], text, date, numeric, uuid) to authenticated, service_role;
revoke all on function retail.fn_notas_proveedor_tablero() from public, anon;
grant execute on function retail.fn_notas_proveedor_tablero() to authenticated, service_role;
revoke all on function retail.fn_saldo_favor_visible(uuid) from public, anon;
grant execute on function retail.fn_saldo_favor_visible(uuid) to authenticated, service_role;
revoke all on function retail.fn_igv_en_espera() from public, anon;
grant execute on function retail.fn_igv_en_espera() to authenticated, service_role;

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
  if position('''4019''' in pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)) = 0 then
    raise exception 'el Diario todavía baja el crédito fiscal con el IGV de un documento interno';
  end if;
  if position('nos_debe_todavia_no' in pg_get_functiondef('retail.fn_pasar_deuda_a_saldo_a_favor(uuid, integer, text, uuid, text, uuid, uuid, text, text, date)'::regprocedure)) > 0 then
    raise exception 'pasar a saldo a favor todavía no acepta facturas';
  end if;
  if to_regprocedure('retail.fn_saldo_favor_visible(uuid)') is null then
    raise exception 'falta el saldo a favor visible (fn_saldo_favor_visible)';
  end if;
  if position('retail.deposito_de_deuda' in pg_get_functiondef('retail.resolver_deuda_proveedor(uuid, text, integer, text, uuid)'::regprocedure)) = 0
     or to_regprocedure('retail.registrar_deposito_deuda(uuid, integer, text, uuid, jsonb)') is null then
    raise exception 'resolver_deuda_proveedor todavía no registra el depósito';
  end if;
  if to_regprocedure('retail.fn_igv_en_espera()') is null then
    raise exception 'falta el aviso del IGV (fn_igv_en_espera)';
  end if;
  if position('fn_asientos_nota_proveedor' in pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)) = 0 then
    raise exception 'el Diario todavía no lee la nota del proveedor';
  end if;
  if position('compra_notas_proveedor' in pg_get_functiondef('retail.fn_impuestos_compras(date, date)'::regprocedure)) = 0
     or position('compra_notas_proveedor' in pg_get_functiondef('retail.fn_impuestos_registro_compras(date)'::regprocedure)) = 0
     or position('compra_notas_proveedor' in pg_get_functiondef('retail.fn_igv_credito_fiscal(date)'::regprocedure)) = 0
     or position('compra_notas_proveedor' in pg_get_functiondef('retail.resumen_compras_extra()'::regprocedure)) = 0 then
    raise exception 'Impuestos todavía no cuenta la nota del proveedor';
  end if;
  if position('La serie DI- es de los documentos internos' in pg_get_functiondef('retail.fn_insertar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid, uuid)'::regprocedure)) = 0 then
    raise exception 'una nota del proveedor todavía puede usar la serie DI-';
  end if;
end;
$$;
