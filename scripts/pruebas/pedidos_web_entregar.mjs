#!/usr/bin/env node
/**
 * Entregar un pedido web y su boleta (ADR-0408, actividad 10) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261015051000_pedidos_web_venta_al_pagar.sql`, `20261015052000_pedidos_web_entregar.sql` y
 * `20261015053000_pedidos_web_en_finanzas.sql`:
 *   A. La venta al pagar: con el pago que completa el total nace la venta (completada, en la caja abierta, del cliente, una línea por
 *      prenda, UN pago «anticipo» por lo pagado) y su boleta por el total, PENDIENTE (en la cola de Lucode, sin un solo intento: la
 *      transacción no llama a nadie). El stock no se mueve. Un pago parcial no hace nada de eso; el que completa sin caja abierta no
 *      anota nada; el doble clic no hace dos ventas; la caja cuenta el efectivo una sola vez; la pasarela que completaría queda por
 *      revisar.
 *   B. Entregar con el código: correcto, cada prenda sale del stock con la salida de SU línea de venta (INV-03) y su reserva se cierra
 *      como «entregada»; mal escrito o de otro pedido, nada se entrega; dos veces, nada se duplica (la misma marca devuelve lo mismo);
 *      lo que viene en camino o está por conseguir no deja entregar; sin el módulo no se entrega.
 *   C. Los candados: mientras no se entrega, su venta no se anula, no se cambia ni se devuelve; la venta y su línea no se cambian
 *      escribiendo directo; un pedido pagado sin venta no se guarda; un «anticipo» suelto sigue rechazado.
 *   D. Finanzas: el efectivo del pedido y su devolución son «efectivo de clientes» en el flujo; cada pago sella su cuenta (cambiar
 *      hoy a qué banco cae el Yape no lo mueve); lo digital entra a Cuentas y dinero (y sale si se devolvió); el diario lo entra contra
 *      «adelantos de clientes» y la venta lo aplica; y un pedido pagado por partes, con pagos anulados, sin entregar y entregado, no deja
 *      nada sin explicar en el Balance (caja, bancos, adelantos ni mercadería).
 *   E. Lo que leen las pantallas: el ERP ve la boleta y quién entregó, nunca el código; «Mis pedidos» ve el código solo listo para
 *      recoger, y su boleta.
 *   F. Las tres migraciones se pueden volver a pegar (dos veces) y todo sigue igual.
 *   G. Carreras de verdad: dos cajas entregan el mismo pedido a la vez; dos cajas anotan el último pago a la vez.
 *   Y después de cada escenario que mueve prendas, el stock de las prendas de la prueba cuadra con `movimientos` (INV-01).
 *
 * CÓMO. Cada escenario corre en su transacción y termina en ROLLBACK (nunca se commitea nada). Cada uno arma su piso de partida: un
 * cliente «ZZ» con DNI, dos prendas sin campaña que se venden en Trujillo y Lima con su stock vaciado DENTRO de la transacción, una caja
 * abierta en cada tienda y una serie de boleta propia de la prueba (en el seed local Lima y Trujillo comparten B001). Los errores
 * esperados se reconocen por su HINT (`pg_temp.probar` corre la llamada y deshace todo lo que hizo). Las carreras (G) commitean de
 * verdad en una base desechable: solo corren con `--carreras` y NUNCA contra el contenedor compartido `supabase_db_cayla-retail`.
 *
 * MUTANTES. `--mutantes` corre los escenarios contra versiones rotas a propósito de las funciones VIVAS (cada mutante cambia un texto
 * de su definición dentro de la transacción) y falla si alguno sobrevive. No va en el CI (tarda): se corre a mano al tocarlas.
 *
 * DA POR SENTADO: `Tienda Trujillo` y `Tienda Lima` con su piso y su almacén, dos prendas activas sin campaña que se venden en las dos,
 * Felipe como líder y Micaela como integrante sin «Pedidos web» (el seed), y el motor, el ERP y el cobro del pedido web aplicados.
 *
 * USO
 *   pnpm pruebas:pedidos-web-entregar                                        → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:pedidos-web-entregar -- --mutantes                          → además, los mutantes (a mano)
 *   pnpm pruebas:pedidos-web-entregar -- --contenedor supabase_db_<mi-pila>  → contra una pila propia
 *   pnpm pruebas:pedidos-web-entregar -- --contenedor supabase_db_<mi-pila> --carreras   → y las carreras (commitean: solo pila propia)
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const CON_MUTANTES = process.argv.includes("--mutantes");
const CON_CARRERAS = process.argv.includes("--carreras");
const MIGRACIONES = [
  "supabase/migrations/20261015051000_pedidos_web_venta_al_pagar.sql",
  "supabase/migrations/20261015052000_pedidos_web_entregar.sql",
  "supabase/migrations/20261015053000_pedidos_web_en_finanzas.sql",
];
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: ve todos los módulos y opera todas las tiendas
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo, sin el módulo «Pedidos web»

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
function psqlAsync(sql) {
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS_PSQL, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout, stderr }));
    p.stdin.write(sql);
    p.stdin.end();
  });
}

// ---- El piso de partida de cada escenario ----------------------------------------------------------------------------------

const lugares = (nombre, sufijo) => `
select id as ${sufijo} from retail.ubicaciones where nombre = '${nombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'${sufijo}', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'${sufijo}', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'almacen_tienda');
select id as ${sufijo}_piso from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'piso_venta' \\gset
select id as ${sufijo}_alm from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'almacen_tienda' \\gset
`;

const elegirPrenda = (alias, excluir = "") => `
select v.id as ${alias}, v.precio::text as p_${alias} from retail.variantes v
 where v.activo and v.precio > 0 and v.id <> '22222222-2222-4222-8222-222222222222'
   ${excluir}
   and retail.fn_variante_permitida_en_sede(v.id, :'tru') and retail.fn_variante_permitida_en_sede(v.id, :'lim')
   and not exists (select 1 from retail.fn_campanas_por_variante(retail.fn_hoy_lima(), 0, array[v.id]))
 order by v.id limit 1 \\gset
`;

const AYUDAS = `
-- Corre una llamada y DESHACE todo lo que hizo (éxito o error): 'ok' o 'error|<hint>|<mensaje>'.
create function pg_temp.probar(p_sql text) returns text language plpgsql as $f$
declare v_hint text; v_msg text;
begin
  begin
    execute p_sql;
    raise exception 'PROBAR_OK';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
    if v_msg = 'PROBAR_OK' then return 'ok'; end if;
    return 'error|' || coalesce(v_hint, '') || '|' || v_msg;
  end;
end $f$;
-- Deja n unidades más en una fila (una «entrada» del libro, firmada como todo movimiento: INV-10).
create function pg_temp.dejar(p_v uuid, p_u uuid, p_sub uuid, p_n integer) returns void language plpgsql as $f$
declare v_mov uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota, usuario_id)
    values (p_v, p_u, p_sub, 'entrada', p_n, 'prueba', 'prueba entregar pedido web: colchón', retail.fn_actor_persona_id(true))
    returning id into v_mov;
  perform retail.fn_aplicar_movimiento(v_mov);
end $f$;
-- Deja SIN disponible la prenda en el piso, el almacén y la fila sin lugar de una tienda: aparta (en el libro) lo libre.
create function pg_temp.vaciar(p_v uuid, p_u uuid) returns void language plpgsql as $f$
declare r record; v_mov uuid;
begin
  for r in select st.sububicacion_id, st.cantidad - st.cantidad_apartada as libres
             from retail.stock st left join retail.sububicaciones s on s.id = st.sububicacion_id
            where st.variante_id = p_v and st.ubicacion_id = p_u and st.cantidad - st.cantidad_apartada > 0
              and (s.id is null or s.tipo in ('almacen_tienda', 'piso_venta'))
  loop
    insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota, usuario_id)
      values (p_v, p_u, r.sububicacion_id, 'apartado', r.libres, 'apartado', 'prueba entregar pedido web: piso de partida',
              retail.fn_actor_persona_id(true)) returning id into v_mov;
    perform retail.fn_aplicar_movimiento(v_mov);
  end loop;
end $f$;
create function pg_temp.apartada(p_v uuid, p_u uuid) returns integer language sql as $f$
  select coalesce(sum(cantidad_apartada), 0)::integer from retail.stock where variante_id = p_v and ubicacion_id = p_u
$f$;
create function pg_temp.fisico(p_v uuid, p_u uuid) returns integer language sql as $f$
  select coalesce(sum(cantidad), 0)::integer from retail.stock where variante_id = p_v and ubicacion_id = p_u
$f$;
-- INV-01 de /chaos, solo para una prenda: las filas de stock que NO cuadran con el libro, resumidas en una huella.
create function pg_temp.descuadre(p_v uuid) returns text language sql as $f$
  with rec as (
    select ubicacion_id, sububicacion_id, sum(c) as c, sum(a) as a from (
      select ubicacion_id, sububicacion_id, cantidad as c, 0 as a from retail.movimientos where variante_id = p_v and tipo in ('entrada', 'ajuste')
      union all select ubicacion_id, sububicacion_id, -cantidad, 0 from retail.movimientos where variante_id = p_v and tipo in ('salida', 'traslado')
      union all select ubicacion_destino_id, sububicacion_destino_id, cantidad, 0 from retail.movimientos where variante_id = p_v and tipo = 'traslado'
      union all select ubicacion_id, sububicacion_id, 0, cantidad from retail.movimientos where variante_id = p_v and tipo = 'apartado'
      union all select ubicacion_id, sububicacion_id, 0, -cantidad from retail.movimientos where variante_id = p_v and tipo = 'liberacion_apartado'
    ) t group by 1, 2
  ), s as (select * from retail.stock where variante_id = p_v)
  select md5(coalesce(string_agg(format('%s/%s:%s-%s/%s-%s', coalesce(r.ubicacion_id, s.ubicacion_id), coalesce(r.sububicacion_id, s.sububicacion_id),
                                        coalesce(s.cantidad, 0), coalesce(r.c, 0), coalesce(s.cantidad_apartada, 0), coalesce(r.a, 0)), ';'
                                 order by coalesce(r.ubicacion_id, s.ubicacion_id), coalesce(r.sububicacion_id, s.sububicacion_id)), ''))
    from rec r full join s on s.ubicacion_id = r.ubicacion_id and s.sububicacion_id is not distinct from r.sububicacion_id
   where coalesce(s.cantidad, 0) <> coalesce(r.c, 0) or coalesce(s.cantidad_apartada, 0) <> coalesce(r.a, 0)
$f$;
-- INV-02 y INV-03 de /chaos, solo para una venta: '' si cuadra (lo vendido = lo cobrado; cada línea con las salidas que le tocan).
create function pg_temp.venta_cuadra(p_venta uuid) returns text language sql as $f$
  select concat_ws(';',
    case when (select coalesce(sum(subtotal), 0) from retail.venta_items where venta_id = p_venta)
              <> (select coalesce(sum(monto), 0) from retail.venta_pagos where venta_id = p_venta) then 'pagos' end,
    (select string_agg('linea ' || vi.id::text, ',') from retail.venta_items vi
      where vi.venta_id = p_venta
        and coalesce((select sum(m.cantidad) from retail.movimientos m where m.venta_item_id = vi.id and m.tipo = 'salida'), 0)
            <> case when exists (select 1 from retail.pedido_web_lineas l where l.venta_item_id = vi.id and l.estado <> 'entregada')
                    then 0 else vi.cantidad end))
$f$;
-- Todas las prendas de un pedido con la misma decisión.
create function pg_temp.todas(p_pedido uuid, p_decision text) returns jsonb language sql as $f$
  select jsonb_agg(jsonb_build_object('linea_id', l.id, 'decision', p_decision,
                                      'fecha', case when p_decision = 'por_conseguir' then retail.fn_hoy_lima() + 7 end) order by l.posicion)
    from retail.pedido_web_lineas l where l.pedido_id = p_pedido
$f$;
create function pg_temp.caja(p_u uuid) returns uuid language plpgsql as $f$
declare v uuid;
begin
  select id into v from retail.cajas where ubicacion_id = p_u and estado = 'abierta';
  if v is null then
    v := retail.abrir_caja(p_u, 0, 'prueba entregar pedido web');
  end if;
  return v;
end $f$;
create function pg_temp.cerrar_caja(p_u uuid) returns void language plpgsql as $f$
declare v uuid;
begin
  for v in select id from retail.cajas where ubicacion_id = p_u and estado = 'abierta' loop
    perform retail.cerrar_caja(v, (select e.esperado from retail.fn_calcular_esperado_caja(v) e));
  end loop;
end $f$;
-- Un código de 4 cifras que NO es el del pedido.
create function pg_temp.otro_codigo(p_pedido uuid) returns text language sql as $f$
  select case when codigo_recojo = '1000' then '1001' else '1000' end from retail.pedidos_web where id = p_pedido
$f$;
`;

const preparar = (aplicar) => `
begin;
${aplicar}
set local request.jwt.claim.sub = '${FELIPE}';
${lugares("Tienda Trujillo", "tru")}
${lugares("Tienda Lima", "lim")}
${elegirPrenda("v")}
${elegirPrenda("v2", "and v.id <> :'v'")}
${AYUDAS}
select pg_temp.descuadre(:'v') as descuadre_v, pg_temp.descuadre(:'v2') as descuadre_v2 \\gset
select pg_temp.vaciar(:'v', :'tru'), pg_temp.vaciar(:'v', :'lim'), pg_temp.vaciar(:'v2', :'tru'), pg_temp.vaciar(:'v2', :'lim');
-- Una serie de boleta propia de la prueba en cada tienda (en el seed local Lima y Trujillo comparten B001) y una caja abierta en cada una.
update retail.series_comprobantes
   set serie = case tipo when 'boleta' then 'B' else 'F' end || case when ubicacion_id = :'tru' then 'T97' else 'L97' end, siguiente_numero = 1
 where ubicacion_id in (:'tru', :'lim') and tipo in ('boleta', 'factura') and archivada_at is null;
select pg_temp.caja(:'tru') as caja_tru, pg_temp.caja(:'lim') as caja_lim \\gset
update retail.configuracion_tienda_web set horas_para_confirmar = 24, horas_aviso_sin_pagar = 48, dias_aviso_sin_recoger = 7 where id;
-- Un cliente del Club con DNI (la boleta lo lleva).
select '9' || lpad((floor(random() * 9999999))::integer::text, 7, '0') as dni \\gset
insert into retail.clientas (nombre, telefono_whatsapp, documento_tipo, documento_numero)
  values ('ZZ Cliente entregar pedido web', '999888770', 'dni', :'dni') returning id as cli \\gset
`;
const PREPARAR_BASE = preparar("");
// El stock de las dos prendas de la prueba sigue cuadrando con el libro (no apareció un descuadre NUEVO).
const CUADRA = `pg_temp.descuadre(:'v') = :'descuadre_v' and pg_temp.descuadre(:'v2') = :'descuadre_v2'`;

const separar = (alias, prendas = ["v"], ubic = "tru") => `
select (retail.crear_pedido_web(:'cli', :'${ubic}', jsonb_build_array(${prendas
  .map((p) => `jsonb_build_object('variante_id', :'${p}', 'precio_lista', :'p_${p}'::numeric)`)
  .join(", ")})) ->> 'pedido_id') as ${alias} \\gset
`;
const confirmarTodas = (alias, decision = "reservar") =>
  `select retail.confirmar_pedido_web(:'${alias}', pg_temp.todas(:'${alias}', '${decision}')) is not null as _c \\gset\n`;
const falta = (alias) => `(select total - pagado from retail.pedidos_web where id = :'${alias}')`;
const pagar = (alias, monto, medio = "efectivo", op = null, token = "null") =>
  `retail.registrar_pago_pedido_web(:'${alias}', ${monto}, '${medio}', ${op ? `'${op}'` : "null"}, ${token})`;
// Pagado completo y listo para recoger: con una prenda en el almacén de Trujillo, separada, confirmada y pagada en efectivo.
const pagadoListo = (alias, prendas = ["v"]) => `
${prendas.map((p) => `select pg_temp.dejar(:'${p}', :'tru', :'tru_alm', 1);`).join("\n")}
${separar(alias, prendas)}
${confirmarTodas(alias)}
select ${pagar(alias, falta(alias))} is not null as _pago_${alias} \\gset
select venta_id as venta_${alias}, codigo_recojo as cod_${alias} from retail.pedidos_web where id = :'${alias}' \\gset
`;
const entregar = (alias, codigo, token = "null") => `retail.entregar_pedido_web(:'${alias}', ${codigo}, ${token})`;
const hint = (llamada) => `split_part(pg_temp.probar(${llamada}), '|', 2)`;
const sql = (texto) => `format(${texto})`;
// Lo que la base exige al confirmar la transacción (los disparadores diferidos), ahora: 'ok' o el hint.
const VERIFICAR_YA = `split_part(pg_temp.probar('set constraints all immediate'), '|', 2)`;

// ---- Los escenarios: [nombre, cuerpo, esperado] (un título suelto es [titulo]) ---------------------------------------------

const ESCENARIOS = [
  ["— A. La venta y la boleta nacen con el pago que completa el total —"],
  [
    "un pago parcial no hace venta ni boleta; el que completa la hace (completada, en la caja, del cliente, una línea por prenda, un anticipo por el total) y el stock no se mueve",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1), pg_temp.dejar(:'v2', :'tru', :'tru_piso', 1);
${separar("a", ["v", "v2"])}
${confirmarTodas("a")}
select pg_temp.fisico(:'v', :'tru') + pg_temp.fisico(:'v2', :'tru') as fis0, pg_temp.apartada(:'v', :'tru') + pg_temp.apartada(:'v2', :'tru') as ap0 \\gset
select ${pagar("a", 10, "yape", "61000001")} ->> 'estado_pedido' as e1 \\gset
select (select count(*) from retail.ventas v where v.cliente_id = :'cli') as ventas1, (select venta_id is null from retail.pedidos_web where id = :'a') as sin_venta1 \\gset
select ${pagar("a", falta("a"))} as r2 \\gset
select venta_id as venta from retail.pedidos_web where id = :'a' \\gset
select concat_ws('|',
  :'e1', :'ventas1', :'sin_venta1',
  :'r2'::jsonb ->> 'estado_pedido', (:'r2'::jsonb ->> 'venta_id') = :'venta', (:'r2'::jsonb ->> 'boleta') ~ '^BT97-0000\\d\\d$',
  (select v.estado || '/' || (v.caja_id = :'caja_tru'::uuid) || '/' || (v.cliente_id = :'cli'::uuid) || '/' || (v.ubicacion_id = :'tru'::uuid)
     from retail.ventas v where v.id = :'venta'),
  (select count(*) || '/' || bool_and(vi.cantidad = 1) from retail.venta_items vi where vi.venta_id = :'venta'),
  (select string_agg(vp.metodo || '=' || (vp.monto = w.total), ',') from retail.venta_pagos vp join retail.pedidos_web w on w.venta_id = vp.venta_id where vp.venta_id = :'venta'),
  pg_temp.fisico(:'v', :'tru') + pg_temp.fisico(:'v2', :'tru') = :'fis0'::integer,
  pg_temp.apartada(:'v', :'tru') + pg_temp.apartada(:'v2', :'tru') = :'ap0'::integer,
  pg_temp.venta_cuadra(:'venta') = '', ${CUADRA}, ${VERIFICAR_YA} = '');`,
    "confirmado|0|t|pagado|t|t|completada/true/true/true|2/true|anticipo=true|t|t|t|t|t",
  ],
  [
    "la boleta es por el TOTAL, con el DNI y el nombre de la ficha, PENDIENTE en la cola y sin un solo intento de envío",
    `${pagadoListo("a", ["v", "v2"])}
select concat_ws('|',
  c.tipo, c.estado, c.intentos_transmision, c.total = w.total, round(c.subtotal + c.igv, 2) = c.total,
  c.cliente_tipo_doc, c.cliente_num_doc = :'dni', c.cliente_nombre, c.es_anticipo, c.anticipo_deducido = 0,
  jsonb_array_length(c.items), c.ultimo_intento_transmision_at is null, c.entorno_transmision is null)
  from retail.comprobantes c join retail.pedidos_web w on w.venta_id = c.venta_id where w.id = :'a';`,
    "boleta|pendiente|0|t|t|dni|t|ZZ Cliente entregar pedido web|f|t|2|t|t",
  ],
  [
    "sin caja abierta, el pago que COMPLETA no se anota (ni por Yape) y lo dice antes; uno parcial, sí",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1);
${separar("a")}
${confirmarTodas("a")}
select pg_temp.cerrar_caja(:'tru');
select ${hint(sql(`'select retail.registrar_pago_pedido_web(%L, %s, %L, %L)', :'a', ${falta("a")}, 'yape', '61000002'`))} as h \\gset
select concat_ws('|', :'h',
  -- Lo dice ANTES de anotar, con lo que hay que hacer.
  position('Ábrela antes de registrarlo' in pg_temp.probar(${sql(`'select retail.registrar_pago_pedido_web(%L, %s, %L, %L)', :'a', ${falta("a")}, 'yape', '61000002'`)})) > 0,
  (select count(*) from retail.pedido_web_pagos where pedido_id = :'a'),
  ${pagar("a", 5, "yape", "61000003")} ->> 'estado_pedido',
  (select venta_id is null from retail.pedidos_web where id = :'a'));`,
    "pedido_web_sin_caja|t|0|confirmado|t",
  ],
  [
    "doble clic en el pago que completa (la misma marca): una venta, una boleta, un pago",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1);
${separar("a")}
${confirmarTodas("a")}
select gen_random_uuid() as tok \\gset
select ${pagar("a", falta("a"), "yape", "61000004", "(:'tok')::uuid")} ->> 'venta_id' as v1 \\gset
select ${pagar("a", "(select total from retail.pedidos_web where id = :'a')", "yape", "61000004", "(:'tok')::uuid")} ->> 'venta_id' as v2 \\gset
select concat_ws('|', :'v1' = :'v2',
  (select count(*) from retail.ventas where cliente_id = :'cli'),
  (select count(*) from retail.comprobantes c join retail.ventas v on v.id = c.venta_id where v.cliente_id = :'cli'),
  (select count(*) from retail.pedido_web_pagos where pedido_id = :'a'));`,
    "t|1|1|1",
  ],
  [
    "la caja cuenta el efectivo del pedido una sola vez: el pago entra; la venta (anticipo) no suma nada",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1);
${separar("a")}
${confirmarTodas("a")}
select (select esperado from retail.fn_calcular_esperado_caja(:'caja_tru')) as esp0 \\gset
select ${pagar("a", falta("a"))} is not null as _p \\gset
select (select esperado from retail.fn_calcular_esperado_caja(:'caja_tru')) as esp1 \\gset
select :'esp1'::numeric - :'esp0'::numeric = (select total from retail.pedidos_web where id = :'a');`,
    "t",
  ],
  [
    "pagado completo con una prenda por conseguir: la venta nace con su línea, pero no está listo para recoger ni se entrega",
    `${separar("a")}
${confirmarTodas("a", "por_conseguir")}
select ${pagar("a", falta("a"), "plin", "61000005")} ->> 'estado_pedido' as e \\gset
select concat_ws('|', :'e',
  (select count(*) from retail.venta_items vi join retail.pedidos_web w on w.venta_id = vi.venta_id where w.id = :'a'),
  (select listo_para_recoger::text from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a'),
  ${hint(sql(`'select retail.entregar_pedido_web(%L, %L)', :'a', (select codigo_recojo from retail.pedidos_web where id = :'a')`))},
  ${VERIFICAR_YA} = '');`,
    "pagado|1|false|pedido_web_no_listo|t",
  ],
  [
    "la pasarela: un cobro que completaría el pedido queda por revisar (sin venta ni boleta), con su motivo",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1);
${separar("a")}
${confirmarTodas("a")}
select retail.fn_registrar_aviso_pasarela_pedido_web(:'a', 'culqi', 'chr_a10', 'aprobado', ${falta("a")}) as r \\gset
select concat_ws('|', :'r'::jsonb ->> 'estado_pago', :'r'::jsonb ->> 'ok', :'r'::jsonb ->> 'motivo',
  (select estado || '/' || (venta_id is null) from retail.pedidos_web where id = :'a'));`,
    "por_revisar|false|completa_el_pedido|confirmado/true",
  ],
  [
    "Análisis no la ve dos veces: reservada no está libre, y vendida desde el pago (una línea en la venta del día)",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 2);
select coalesce((select e.almacen_libre + e.piso_libre + e.sin_lugar from retail.fn_existencias_base(:'tru', null) e where e.variante_id = :'v'), 0) as libre0 \\gset
${separar("a")}
${confirmarTodas("a")}
select ${pagar("a", falta("a"))} is not null as _p \\gset
select concat_ws('|',
  coalesce((select e.almacen_libre + e.piso_libre + e.sin_lugar from retail.fn_existencias_base(:'tru', null) e where e.variante_id = :'v'), 0) = :'libre0'::integer - 1,
  (select count(*) from retail.venta_items vi join retail.ventas ve on ve.id = vi.venta_id
    where vi.variante_id = :'v' and ve.estado = 'completada' and ve.cliente_id = :'cli'));`,
    "t|1",
  ],

  ["— B. Entregar con el código de 4 cifras —"],
  [
    "con el código correcto: entregado, cada prenda sale del stock con la salida de SU línea de venta y su reserva se cierra «entregada»",
    `${pagadoListo("a", ["v", "v2"])}
select pg_temp.fisico(:'v', :'tru') as f0, pg_temp.apartada(:'v', :'tru') as a0 \\gset
select ${entregar("a", ":'cod_a'")} as r \\gset
select concat_ws('|',
  :'r'::jsonb ->> 'estado', :'r'::jsonb ->> 'repetido', (:'r'::jsonb ->> 'venta_id') = :'venta_a',
  (select string_agg(estado, ',' order by posicion) from retail.pedido_web_lineas where pedido_id = :'a'),
  (select string_agg(ap.estado || ':' || ap.cierre_motivo, ',' order by l.posicion) from retail.pedido_web_lineas l join retail.apartados ap on ap.id = l.apartado_id where l.pedido_id = :'a'),
  pg_temp.fisico(:'v', :'tru') = :'f0'::integer - 1, pg_temp.apartada(:'v', :'tru') = :'a0'::integer - 1,
  (select count(*) from retail.movimientos m join retail.pedido_web_lineas l on l.venta_item_id = m.venta_item_id
    where l.pedido_id = :'a' and m.tipo = 'salida' and m.motivo = 'venta'),
  (select entregado_por is not null and entregado_en is not null from retail.pedidos_web where id = :'a'),
  pg_temp.venta_cuadra(:'venta_a') = '', ${CUADRA}, ${VERIFICAR_YA} = '');`,
    "entregado|false|t|entregada,entregada|liberado:entregada,liberado:entregada|t|t|2|t|t|t|t",
  ],
  [
    "con el código de otro pedido o mal escrito, no se entrega NADA (ni el stock ni el pedido cambian)",
    `${pagadoListo("a")}
select pg_temp.fisico(:'v', :'tru') as f0 \\gset
select concat_ws('|',
  ${hint(sql(`'select retail.entregar_pedido_web(%L, %L)', :'a', pg_temp.otro_codigo(:'a')`))},
  ${hint(sql(`'select retail.entregar_pedido_web(%L, %L)', :'a', '12a4'`))},
  ${hint(sql(`'select retail.entregar_pedido_web(%L, %L)', :'a', '123'`))},
  ${hint(sql(`'select retail.entregar_pedido_web(%L, null)', :'a'`))},
  (select estado from retail.pedidos_web where id = :'a'), pg_temp.fisico(:'v', :'tru') = :'f0'::integer,
  (select count(*) from retail.pedido_web_lineas where pedido_id = :'a' and estado = 'entregada'));`,
    "pedido_web_codigo_incorrecto|pedido_web_codigo|pedido_web_codigo|pedido_web_codigo|pagado|t|0",
  ],
  [
    "los espacios del código no cuentan («20 94» es «2094»)",
    `${pagadoListo("a")}
select ${entregar("a", "left(:'cod_a', 2) || ' ' || right(:'cod_a', 2)")} ->> 'estado';`,
    "entregado",
  ],
  [
    "entregar dos veces no duplica nada: la misma marca devuelve la MISMA entrega; otra marca, «ya se entregó»; una marca con otro código, rechazada",
    `${pagadoListo("a")}
select gen_random_uuid() as tok \\gset
select ${entregar("a", ":'cod_a'", "(:'tok')::uuid")} ->> 'repetido' as r1 \\gset
select ${entregar("a", ":'cod_a'", "(:'tok')::uuid")} ->> 'repetido' as r2 \\gset
select concat_ws('|', :'r1', :'r2',
  ${hint(sql(`'select retail.entregar_pedido_web(%L, %L, gen_random_uuid())', :'a', :'cod_a'`))},
  ${hint(sql(`'select retail.entregar_pedido_web(%L, %L, %L)', :'a', pg_temp.otro_codigo(:'a'), :'tok'`))},
  (select count(*) from retail.movimientos m join retail.pedido_web_lineas l on l.venta_item_id = m.venta_item_id where l.pedido_id = :'a' and m.tipo = 'salida'),
  ${CUADRA});`,
    "false|true|pedido_web_estado|token_reusado|1|t",
  ],
  [
    "lo que viene en un traslado no deja entregar; al recibirlo se reserva solo y ahí sí",
    `select pg_temp.dejar(:'v', :'lim', :'lim_alm', 1);
${separar("a")}
select retail.confirmar_pedido_web(:'a', jsonb_build_array(jsonb_build_object('linea_id', (select id from retail.pedido_web_lineas where pedido_id = :'a'), 'decision', 'reservar', 'ubicacion_id', :'lim'))) is not null as _c \\gset
select ${pagar("a", falta("a"), "transferencia", "61000006")} is not null as _p \\gset
select (retail.enviar_pedido_web_desde(:'a', :'lim', now() + interval '1 day') ->> 'transferencia_id') as tr \\gset
select codigo_recojo as cod from retail.pedidos_web where id = :'a' \\gset
select ${hint(sql(`'select retail.entregar_pedido_web(%L, %L)', :'a', :'cod'`))} as en_camino \\gset
-- Trujillo cuenta lo que llegó y confirma la recepción (al almacén): la prenda se reserva sola para su pedido.
select retail.registrar_recepcion_traslado(:'tr', :'v', 1) is not null as _r \\gset
select (select resultado from retail.confirmar_traslado(:'tr', 'almacen_tienda')) as _conf \\gset
select concat_ws('|', :'en_camino', (select estado from retail.pedido_web_lineas where pedido_id = :'a'),
  ${entregar("a", ":'cod'")} ->> 'estado', pg_temp.descuadre(:'v') = :'descuadre_v');`,
    "pedido_web_no_listo|reservada|entregado|t",
  ],
  [
    "sin el módulo «Pedidos web» no se entrega (Micaela), y un pedido sin pagar completo tampoco",
    `${pagadoListo("a")}
select pg_temp.dejar(:'v2', :'tru', :'tru_alm', 1);
${separar("b", ["v2"])}
${confirmarTodas("b")}
select codigo_recojo as cod_b from retail.pedidos_web where id = :'b' \\gset
set local request.jwt.claim.sub = '${MICAELA}';
select ${hint(sql(`'select retail.entregar_pedido_web(%L, %L)', :'a', :'cod_a'`))} as sin_modulo \\gset
set local request.jwt.claim.sub = '${FELIPE}';
select concat_ws('|', :'sin_modulo', ${hint(sql(`'select retail.entregar_pedido_web(%L, %L)', :'b', :'cod_b'`))});`,
    "pedido_web_sin_modulo|pedido_web_estado",
  ],

  ["— C. Los candados —"],
  [
    "mientras no se entrega, su venta no se anula, no se cambia ni se devuelve; entregada, ya admite la devolución",
    `${pagadoListo("a")}
select (select id from retail.venta_items where venta_id = :'venta_a') as item \\gset
select concat_ws('|',
  ${hint(sql(`'select retail.anular_venta(%L, %L, %L)', :'venta_a', 'prueba', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'condicion', 'vendible'))`))},
  ${hint(sql(`'select retail.registrar_cambio(%L, %L, %L, 1, null, null, %L, %L)', :'item', :'tru', :'v2', 'talla_chica', 'vendible'`))},
  ${hint(sql(`'select retail.crear_devolucion(%L, %L, %L, %L, %L)', :'venta_a', :'tru', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'cantidad', 1, 'condicion', 'vendible')), 'prueba', 'talla'`))},
  ${entregar("a", ":'cod_a'")} ->> 'estado',
  split_part(pg_temp.probar(${sql(`'select retail.crear_devolucion(%L, %L, %L, %L, %L)', :'venta_a', :'tru', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'cantidad', 1, 'condicion', 'vendible')), 'prueba', 'talla'`)}), '|', 1));`,
    "pedido_web_por_entregar|pedido_web_por_entregar|pedido_web_por_entregar|entregado|ok",
  ],
  [
    "escribiendo directo: la venta del pedido y la línea de venta de una prenda no se cambian; un pedido no queda pagado sin su venta",
    `${pagadoListo("a")}
select pg_temp.dejar(:'v2', :'tru', :'tru_alm', 1);
${separar("b", ["v2"])}
${confirmarTodas("b")}
select concat_ws('|',
  ${hint(sql(`'update retail.pedidos_web set venta_id = null where id = %L', :'a'`))},
  ${hint(sql(`'update retail.pedido_web_lineas set venta_item_id = null where pedido_id = %L', :'a'`))},
  ${hint(sql(`'update retail.pedidos_web set venta_id = %L where id = %L', :'venta_a', :'b'`))},
  -- Un cobro aprobado escrito directo (sin la función que hace nacer la venta) deja el pedido «pagado»: al confirmar, no se guarda.
  split_part(pg_temp.probar(${sql(`'insert into retail.pedido_web_pagos (pedido_id, origen, medio, monto, estado, proveedor, referencia_externa) values (%L, %L, %L, %s, %L, %L, %L); set constraints all immediate', :'b', 'pasarela', 'tarjeta', (select total from retail.pedidos_web where id = :'b'), 'aprobado', 'culqi', 'directo_a10'`)}), '|', 2));`,
    "pedido_web_inmutable|pedido_web_inmutable|pedido_web_inmutable|pedido_web_incoherente",
  ],
  [
    "lo vendido del pedido cuadra con su venta al confirmar la transacción: una línea de venta de más, un pago cambiado o una salida sin entregar no se guardan",
    `${pagadoListo("a")}
select (select id from retail.venta_items where venta_id = :'venta_a') as item \\gset
select concat_ws('|',
  split_part(pg_temp.probar(${sql(`'insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (%L, %L, 1, 1, 0); update retail.pedidos_web set venta_id = venta_id where id = %L; set constraints all immediate', :'venta_a', :'v2', :'a'`)}), '|', 2),
  split_part(pg_temp.probar(${sql(`'update retail.venta_pagos set monto = monto - 1 where venta_id = %L; update retail.pedidos_web set venta_id = venta_id where id = %L; set constraints all immediate', :'venta_a', :'a'`)}), '|', 2),
  split_part(pg_temp.probar(${sql(`'insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id) values (%L, %L, %L, %L, 1, %L, %L); update retail.pedidos_web set venta_id = venta_id where id = %L; set constraints all immediate', :'v', :'tru', :'tru_alm', 'salida', 'venta', :'item', :'a'`)}), '|', 2),
  ${VERIFICAR_YA} = '');`,
    "pedido_web_incoherente|pedido_web_incoherente|pedido_web_incoherente|t",
  ],
  [
    "un pago «anticipo» suelto sigue rechazado (solo en un apartado o en la venta de un pedido web)",
    `insert into retail.ventas (ubicacion_id, caja_id, nota) values (:'tru', :'caja_tru', 'prueba: anticipo suelto') returning id as vs \\gset
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'vs', 'anticipo', 1);
select ${hint("'set constraints all immediate'")};`,
    "anticipo_sin_apartado",
  ],
  [
    "como authenticated de verdad (la API, no el superusuario): el pago que completa hace la venta y la boleta, el cambio antes de entregar se rechaza con su regla (no con «permission denied») y la entrega pasa",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1);
${separar("a")}
${confirmarTodas("a")}
select total as total_a from retail.pedidos_web where id = :'a' \\gset
set local role authenticated;
select (retail.registrar_pago_pedido_web(:'a', :'total_a', 'efectivo') ->> 'venta_id') is not null as con_venta \\gset
reset role;
select pw.venta_id as venta_a, pw.codigo_recojo as cod_a, (select vi.id from retail.venta_items vi where vi.venta_id = pw.venta_id) as item_a
  from retail.pedidos_web pw where pw.id = :'a' \\gset
set local role authenticated;
select ${hint(sql(`'select retail.registrar_cambio(%L, %L, %L, 1, %L, gen_random_uuid(), %L, %L)', :'item_a', :'tru', :'v', 'tarjeta', 'talla_chica', 'vendible'`))} as cambio \\gset
select retail.entregar_pedido_web(:'a', :'cod_a') ->> 'estado' as entregado \\gset
reset role;
select concat_ws('|', :'con_venta', (select count(*) from retail.comprobantes where venta_id = :'venta_a'), :'cambio', :'entregado',
  (select count(*) from retail.movimientos where venta_item_id = :'item_a' and tipo = 'salida'));`,
    "t|1|pedido_web_por_entregar|entregado|1",
  ],

  ["— D. Finanzas: como la plata de los apartados —"],
  [
    "el flujo: el efectivo del pedido entra como «efectivo de clientes» y su devolución sale igual (no «otros ingresos» ni «por clasificar»)",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1);
${separar("a")}
${confirmarTodas("a")}
select (${pagar("a", 7)} ->> 'pago_id') as pago \\gset
select retail.anular_pago_pedido_web(:'pago', 'devuelto_al_cliente') is not null as _x \\gset
select (select caja_movimiento_id from retail.pedido_web_pagos where id = :'pago') as ing, (select anulado_caja_movimiento_id from retail.pedido_web_pagos where id = :'pago') as egr \\gset
-- Los dos renglones de la caja de hoy, por su monto con signo, en la categoría que les da el flujo.
select string_agg(l.categoria || ':' || l.monto, ',' order by l.monto)
  from retail.fn_flujo_lineas(retail.fn_hoy_lima(), retail.fn_hoy_lima()) l
 where l.monto in (7, -7) and l.categoria in ('efectivo', 'otros_ingresos', 'por_clasificar');`,
    "efectivo:-7.00,efectivo:7.00",
  ],
  [
    "el libro de cuentas: lo digital del pedido entra por su medio; anotado por error no cuenta; devuelto, entra y sale",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1);
${separar("a")}
${confirmarTodas("a")}
create function pg_temp.yape_hoy(p_u uuid) returns numeric language sql as $f$
  select coalesce(sum(l.monto), 0) from retail.fn_dinero_libro(retail.fn_hoy_lima()) l
   where l.clave = 'cobros:' || retail.fn_hoy_lima()::text || ':' || p_u::text || ':yape'
$f$;
select pg_temp.yape_hoy(:'tru') as antes \\gset
select (${pagar("a", 3, "yape", "61000007")} ->> 'pago_id') as p1 \\gset
select (${pagar("a", 5, "yape", "61000008")} ->> 'pago_id') as p2 \\gset
select (${pagar("a", 11, "yape", "61000009")} ->> 'pago_id') as p3 \\gset
select pg_temp.yape_hoy(:'tru') - :'antes'::numeric as con_los_tres \\gset
select retail.anular_pago_pedido_web(:'p2', 'error_al_anotar') is not null as _x, retail.anular_pago_pedido_web(:'p3', 'devuelto_al_cliente') is not null as _y \\gset
select :'con_los_tres' || '|' || (pg_temp.yape_hoy(:'tru') - :'antes'::numeric);`,
    "19.00|3.00",
  ],
  [
    "el sello: lo pagado por Yape queda en la cuenta de cobro de su tienda y no se mueve si HOY cambia a qué banco cae el Yape; el efectivo, en el cajón; la cuenta no se cambia después",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1);
${separar("a")}
${confirmarTodas("a")}
select retail.crear_cuenta_dinero('ZZ BCP prueba pedido web', 'banco', 0, retail.fn_hoy_lima() - 20) as bcp \\gset
select retail.crear_cuenta_dinero('ZZ Interbank prueba pedido web', 'banco', 0, retail.fn_hoy_lima() - 20) as ibk \\gset
select retail.guardar_medio_de_cobro(:'tru', 'yape', :'bcp') as _m1 \\gset
select (${pagar("a", 9, "yape", "61000021")} ->> 'pago_id') as p1 \\gset
select (${pagar("a", 5, "yape", "61000022")} ->> 'pago_id') as p3 \\gset
select (${pagar("a", 4)} ->> 'pago_id') as p2 \\gset
-- HOY el Yape de Trujillo pasa a Interbank. Lo cobrado antes sigue en el BCP. Se mide con lo que mueve anular esos pagos (no con
-- los saldos enteros, que también mueven los cobros sin cuenta que la base ya tenía de hoy): anotado por error, su entrada
-- desaparece de la cuenta donde estaba; devuelto, su salida va por la cuenta que selló. Las dos, del BCP.
select retail.guardar_medio_de_cobro(:'tru', 'yape', :'ibk') as _m2 \\gset
create function pg_temp.saldo(p_id uuid) returns numeric language sql as $f$ select saldo from retail.fn_cuentas_dinero_saldos() where id = p_id $f$;
select pg_temp.saldo(:'bcp') as b0, pg_temp.saldo(:'ibk') as i0 \\gset
select retail.anular_pago_pedido_web(:'p1', 'error_al_anotar') is not null as _err,
       retail.anular_pago_pedido_web(:'p3', 'devuelto_al_cliente') is not null as _dev \\gset
select concat_ws('|',
  (select cuenta_dinero_id = :'bcp' from retail.pedido_web_pagos where id = :'p1'),
  (select cuenta_dinero_id = retail.fn_cuenta_de_cajon(:'tru') from retail.pedido_web_pagos where id = :'p2'),
  pg_temp.saldo(:'bcp') - :'b0'::numeric, pg_temp.saldo(:'ibk') - :'i0'::numeric,
  ${hint(sql(`'update retail.pedido_web_pagos set cuenta_dinero_id = %L where id = %L', :'ibk', :'p2'`))});`,
    "t|t|-14.00|0.00|pedido_web_pago_inmutable",
  ],
  [
    "el diario: cada pago entra a la caja o al banco contra «adelantos de clientes» (122) y lo anulado sale; uno digital anotado por error no existe; la venta aplica todo lo pagado",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1);
${separar("a")}
${confirmarTodas("a")}
select (${pagar("a", 6)} ->> 'pago_id') as p1 \\gset
select (${pagar("a", 5, "yape", "61000031")} ->> 'pago_id') as p2 \\gset
select (${pagar("a", 2, "plin", "61000032")} ->> 'pago_id') as p3 \\gset
select (${pagar("a", 3)} ->> 'pago_id') as p4 \\gset
select retail.anular_pago_pedido_web(:'p2', 'devuelto_al_cliente') is not null as _x, retail.anular_pago_pedido_web(:'p3', 'error_al_anotar') is not null as _y,
       retail.anular_pago_pedido_web(:'p4', 'error_al_anotar') is not null as _z \\gset
select ${pagar("a", falta("a"))} is not null as _todo \\gset
select venta_id as venta_a, total as total_a from retail.pedidos_web where id = :'a' \\gset
create temp table d as select * from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima());
create function pg_temp.lineas(p_oid uuid) returns text language sql as $f$
  select coalesce(string_agg(d.regla || ':' || d.cuenta || ':' || d.debe || ':' || d.haber, ',' order by d.regla, d.cuenta), '-')
    from d where d.origen_id = p_oid
$f$;
select concat_ws('|', pg_temp.lineas(:'p1'), pg_temp.lineas(:'p2'), pg_temp.lineas(:'p3'), pg_temp.lineas(:'p4'),
  (select string_agg(d.debe::text, ',') = :'total_a' from d where d.origen_id = :'venta_a' and d.cuenta = '122'),
  (select sum(d.haber - d.debe) from d
    where d.cuenta = '122' and (d.origen_id = :'venta_a' or d.origen_id in (select id from retail.pedido_web_pagos where pedido_id = :'a'))) = 0);`,
    "pedido_web_pago:101:6.00:0,pedido_web_pago:122:0:6.00|pedido_web_pago:104:5.00:0,pedido_web_pago:122:0:5.00,pedido_web_pago_anulado:104:0:5.00,pedido_web_pago_anulado:122:5.00:0|-|pedido_web_pago:101:3.00:0,pedido_web_pago:122:0:3.00,pedido_web_pago_anulado:101:0:3.00,pedido_web_pago_anulado:122:3.00:0|t|t",
  ],
  [
    "el Balance: un pedido web pagado por partes (con pagos devueltos), sin entregar y después entregado no deja nada sin explicar en caja, bancos, adelantos ni mercadería",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1);
${separar("a")}
${confirmarTodas("a")}
select retail.crear_cuenta_dinero('ZZ BCP prueba pedido web', 'banco', 0, retail.fn_hoy_lima() - 20) as bcp \\gset
select retail.guardar_medio_de_cobro(:'tru', 'yape', :'bcp') as _m1 \\gset
-- El arranque de Finanzas, si la base no lo tiene: hoy, con lo que el sistema ya sabe; el capital, lo que falta para cuadrar.
select (retail.fn_fecha_de_arranque() is null)::int as sin_arranque \\gset
\\if :sin_arranque
create temp table prop as select * from retail.fn_saldos_iniciales_propuesta(retail.fn_hoy_lima()) where origen = 'sistema' and monto <> 0;
select (select coalesce(jsonb_agg(jsonb_build_object('cuenta', cuenta, 'monto', monto, 'origen', 'sistema')), '[]'::jsonb) from prop)
    || jsonb_build_array(jsonb_build_object('cuenta', '50', 'monto',
         (select coalesce(sum(case when tipo = 'activo' and cuenta not like '39%' then monto when cuenta like '39%' then -monto
                                   when tipo = 'pasivo' then -monto else 0 end), 0) from prop))) as lineas \\gset
select retail.registrar_saldo_inicial(retail.fn_hoy_lima(), :'lineas'::jsonb) is not null as _arranque \\gset
\\endif
-- Por cada cuenta, la diferencia entre sus dos caminos y lo que las causas ya explican (sin «sin explicar»).
create function pg_temp.dif() returns jsonb language sql as $f$
  select coalesce(jsonb_object_agg(c.clave, jsonb_build_array(c.diferencia,
           coalesce((select sum((x ->> 'monto')::numeric) from jsonb_array_elements(c.causas) x where x ->> 'clave' <> 'sin_explicar'), 0))), '{}'::jsonb)
    from retail.fn_conciliacion_contable(retail.fn_hoy_lima()) c where c.clave in ('101', '104', '122', '201')
$f$;
create function pg_temp.igual(a jsonb, b jsonb) returns boolean language sql as $f$
  select bool_and(coalesce((a -> k ->> 0)::numeric, 0) = coalesce((b -> k ->> 0)::numeric, 0)
              and coalesce((a -> k ->> 1)::numeric, 0) = coalesce((b -> k ->> 1)::numeric, 0))
    from unnest(array['101', '104', '122', '201']) k
$f$;
select pg_temp.dif() as d0 \\gset
select (${pagar("a", 6)} ->> 'pago_id') as p1 \\gset
select (${pagar("a", 2)} ->> 'pago_id') as p2 \\gset
select (${pagar("a", 5, "yape", "61000041")} ->> 'pago_id') as p3 \\gset
select retail.anular_pago_pedido_web(:'p2', 'devuelto_al_cliente') is not null as _x, retail.anular_pago_pedido_web(:'p3', 'devuelto_al_cliente') is not null as _y \\gset
select pg_temp.dif() as d1 \\gset
select ${pagar("a", falta("a"), "yape", "61000042")} is not null as _todo \\gset
select codigo_recojo as cod_a from retail.pedidos_web where id = :'a' \\gset
select pg_temp.dif() as d2 \\gset
select ${entregar("a", ":'cod_a'")} is not null as _e \\gset
select pg_temp.dif() as d3 \\gset
select concat_ws('|', pg_temp.igual(:'d0', :'d1'), pg_temp.igual(:'d0', :'d2'), pg_temp.igual(:'d0', :'d3'));`,
    "t|t|t",
  ],

  ["— E. Lo que leen las pantallas —"],
  [
    "el ERP: la boleta (número y estado) y quién lo entregó; el código para recoger nunca sale en el detalle",
    `${pagadoListo("a")}
select retail.fn_pedido_web_detalle(:'a') as d0 \\gset
select ${entregar("a", ":'cod_a'")} is not null as _e \\gset
select retail.fn_pedido_web_detalle(:'a') as d1 \\gset
select concat_ws('|',
  (:'d0'::jsonb -> 'boleta' ->> 'texto') ~ '^BT97-\\d{6}$', :'d0'::jsonb -> 'boleta' ->> 'estado', (:'d0'::jsonb ->> 'venta_id') = :'venta_a',
  :'d1'::jsonb ->> 'estado', (:'d1'::jsonb ->> 'entregado_por') is not null,
  -- El código son 4 cifras al azar: buscarlo como TEXTO en todo el JSON daba rojo cuando aparecía por casualidad dentro de una fecha,
  -- un id o un monto (pasó el 2026-10-15 en el CI del PR #1118). Se busca como VALOR de cualquier campo, en cualquier nivel y como
  -- texto o como número: un código filtrado bajo cualquier nombre sigue dando rojo.
  not jsonb_path_exists(:'d0'::jsonb, '$.** ? (@ == $c || @ == $n)', jsonb_build_object('c', :'cod_a', 'n', (:'cod_a')::int))
    and position('codigo_recojo' in :'d0') = 0);`,
    "t|pendiente|t|entregado|t|t",
  ],
  [
    "«Mis pedidos»: listo para recoger, el código y la boleta; entregado, la boleta y sin código",
    `${pagadoListo("a")}
select (select x from jsonb_array_elements(retail.fn_pedidos_web_de_clienta(:'cli')) x where x ->> 'pedido_id' = :'a') as m0 \\gset
select ${entregar("a", ":'cod_a'")} is not null as _e \\gset
select (select x from jsonb_array_elements(retail.fn_pedidos_web_de_clienta(:'cli')) x where x ->> 'pedido_id' = :'a') as m1 \\gset
select concat_ws('|',
  :'m0'::jsonb ->> 'estado', (:'m0'::jsonb ->> 'codigo_recojo') = :'cod_a', (:'m0'::jsonb ->> 'boleta') ~ '^BT97-\\d{6}$',
  :'m1'::jsonb ->> 'estado', coalesce(:'m1'::jsonb ->> 'codigo_recojo', 'sin código'), (:'m1'::jsonb ->> 'boleta') = (:'m0'::jsonb ->> 'boleta'));`,
    "pagado|t|t|entregado|sin código|t",
  ],
];

// ---- Los mutantes: cada uno rompe UNA promesa en la función VIVA; alguna prueba tiene que ponerse roja ----------------------

const MUTANTES = [
  ["el pago que completa no hace nacer la venta", "retail.registrar_pago_pedido_web(uuid, numeric, text, text, uuid)",
    "    perform retail.fn_pedido_web_vender(p.id, v_persona);", "    null;"],
  ["el pago que completa no pide la caja antes de anotar", "retail.registrar_pago_pedido_web(uuid, numeric, text, text, uuid)",
    "  if p_monto = p.total - p.pagado\n     and not exists", "  if false\n     and not exists"],
  ["la venta cobra lo pagado en efectivo (la caja lo contaría dos veces)", "retail.fn_pedido_web_vender(uuid, uuid)",
    "values (v_venta, 'anticipo', p.pagado)", "values (v_venta, 'efectivo', p.pagado)"],
  ["la venta saca la prenda del stock al pagar", "retail.fn_pedido_web_vender(uuid, uuid)",
    "    update retail.pedido_web_lineas x set venta_item_id = v_item where x.id = l.id;",
    "    update retail.pedido_web_lineas x set venta_item_id = v_item where x.id = l.id;\n    insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, venta_item_id) values (l.variante_id, p.ubicacion_id, 'salida', 1, 'venta', v_item);"],
  ["la boleta sin el documento de la ficha", "retail.fn_pedido_web_vender(uuid, uuid)",
    "  if v_doc_tipo is null or v_doc_num is null then", "  if true then"],
  ["la venta en cualquier caja (no la de su tienda)", "retail.fn_pedido_web_vender(uuid, uuid)",
    "where c.ubicacion_id = p.ubicacion_id and c.estado = 'abierta' for share", "where c.estado = 'abierta' order by c.ubicacion_id <> p.ubicacion_id desc limit 1 for share"],
  ["entregar sin mirar el código", "retail.entregar_pedido_web(uuid, text, uuid)",
    "  if v_codigo <> p.codigo_recojo then", "  if false then"],
  ["entregar sin mirar que todo esté en la tienda", "retail.entregar_pedido_web(uuid, text, uuid)",
    "  if v_falta is not null then\n    raise exception 'El pedido web % todavía no se puede entregar", "  if false then\n    raise exception 'El pedido web % todavía no se puede entregar"],
  ["entregar sin el permiso del módulo", "retail.entregar_pedido_web(uuid, text, uuid)",
    "  perform retail.fn_pedido_web_exigir(p.ubicacion_id);\n  if p.estado <> 'pagado' then", "  if p.estado <> 'pagado' then"],
  ["entregar no saca la prenda del stock", "retail.entregar_pedido_web(uuid, text, uuid)",
    "values (a.variante_id, a.ubicacion_id, a.sububicacion_id, 'salida', 1, 'venta', l.venta_item_id, v_persona,",
    "values (a.variante_id, a.ubicacion_id, a.sububicacion_id, 'entrada', 0 + 1, 'venta', l.venta_item_id, v_persona,"],
  ["entregar no cierra la reserva", "retail.entregar_pedido_web(uuid, text, uuid)",
    "    perform retail.fn_aplicar_movimiento(v_mov);\n    update retail.apartados ap", "    update retail.apartados ap"],
  ["la misma marca entrega otra vez (no devuelve la entrega)", "retail.entregar_pedido_web(uuid, text, uuid)",
    "    if v_existente is not null then\n      if v_existente <> p_pedido_id", "    if false then\n      if v_existente <> p_pedido_id"],
  ["la venta del pedido se puede anular antes de entregar", "retail.anular_venta(uuid, text, jsonb)",
    "where w.venta_id = p_venta_id and w.estado <> 'entregado') then", "where false) then"],
  ["un pedido pagado no exige su venta al confirmar", "retail.fn_pedido_web_verificar(uuid)",
    "  if (p.estado in ('pagado', 'entregado')) <> (p.venta_id is not null) then", "  if false then"],
  ["la venta de otras prendas pasa la verificación", "retail.fn_pedido_web_verificar(uuid)",
    "    if v_mal > 0 then\n      raise exception 'En el pedido web %, la venta no es la de sus prendas", "    if false then\n      raise exception 'En el pedido web %, la venta no es la de sus prendas"],
  ["el flujo pone el efectivo del pedido en «otros ingresos»", "retail.fn_flujo_lineas(date, date)",
    "or exists (select 1 from retail.pedido_web_pagos pw where pw.caja_movimiento_id = m.id)", "or false"],
  ["el flujo deja la devolución del pedido «por clasificar»", "retail.fn_flujo_lineas(date, date)",
    "when exists (select 1 from retail.pedido_web_pagos pw where pw.anulado_caja_movimiento_id = m.id) then 'efectivo'", "when false then 'efectivo'"],
  ["el libro cuenta lo anotado por error", "retail.fn_dinero_libro(date)",
    "(pw.estado = 'aprobado' or (pw.estado = 'anulado' and pw.anulado_motivo = 'devuelto_al_cliente'))", "(pw.estado in ('aprobado', 'anulado'))"],
  ["el pago no sella su cuenta", "retail.fn_pedido_web_pagos_sellar()",
    "    new.cuenta_dinero_id := retail.fn_cuenta_sellada('cobro', new.medio, v_ubic, retail.fn_hoy_lima(), new.cuenta_dinero_id);",
    "    new.cuenta_dinero_id := null;"],
  ["el libro no usa la cuenta sellada (cambiar el Yape mueve lo ya cobrado)", "retail.fn_dinero_libro(date)",
    "pw.medio, pw.monto, pw.cuenta_dinero_id", "pw.medio, pw.monto, null::uuid"],
  ["lo devuelto no sale por la cuenta que selló el pago", "retail.fn_dinero_libro(date)",
    "pw.medio, -pw.monto, pw.cuenta_dinero_id", "pw.medio, -pw.monto, null::uuid"],
  ["el diario entra el pago a ventas en vez de a adelantos de clientes", "retail.fn_asientos_pedidos_web(date, date, boolean, uuid[])",
    "'pedido_web_pago', '122',", "'pedido_web_pago', '7011',"],
  ["el diario no entra el efectivo anotado por error (el cajón sí lo tuvo)", "retail.fn_asientos_pedidos_web(date, date, boolean, uuid[])",
    " or x.medio = 'efectivo')", ")"],
  ["el diario no suma los pagos de los pedidos web", "retail.fn_asientos(date, date, uuid)",
    "    union all select * from retail.fn_asientos_pedidos_web(p_desde, p_hasta, v_todo, v_ubics)", ""],
  ["los adelantos del Balance no cuentan lo pagado de los pedidos web", "retail.fn_bal_anticipos(date)",
    "   where x.origen = 'tienda' and x.registrado_en < fin.t", "   where false"],
  ["la mercadería del Balance cuenta lo vendido por la web que falta entregar", "retail.fn_bal_stock(date)",
    "union all select * from vendido_web) x", ") x"],
  ["el Balance cree que el efectivo del pedido web no dice de dónde vino", "retail.fn_bal_causas_dinero(date, date)",
    "and not exists (select 1 from retail.pedido_web_pagos pw where pw.caja_movimiento_id = cm.id)", "and true"],
  ["el Balance cree que lo devuelto del pedido web es un egreso sin clasificar", "retail.fn_bal_causas_dinero(date, date)",
    "and not exists (select 1 from retail.pedido_web_pagos pw where pw.anulado_caja_movimiento_id = cm.id)", "and true"],
  ["el ERP ve el código para recoger", "retail.fn_pedido_web_detalle(uuid)",
    "    'venta_id', (select w.venta_id from retail.pedidos_web w where w.id = p_pedido_id),",
    "    'venta_id', (select w.venta_id from retail.pedidos_web w where w.id = p_pedido_id),\n    'codigo_recojo', (select w.codigo_recojo from retail.pedidos_web w where w.id = p_pedido_id),"],
  ["«Mis pedidos» sin la boleta", "retail.fn_pedidos_web_de_clienta(uuid, integer, integer)",
    "             'boleta', (select c.serie || '-' || lpad(c.numero::text, 6, '0')", "             'boleta', (select null::text"],
];

function escenariosContra(aplicar) {
  const PREPARAR = preparar(aplicar);
  const resultados = [];
  for (const [nombre, cuerpo, esperado] of ESCENARIOS) {
    if (cuerpo === undefined) continue;
    const r = correr(`${PREPARAR}${cuerpo}\nrollback;\n`);
    const ultima = r.ok ? r.salida.split("\n").pop() : null;
    resultados.push({ nombre, ok: r.ok && ultima === esperado, detalle: r.ok ? `dio «${ultima}», se esperaba «${esperado}»` : r.mensaje });
  }
  return resultados;
}

// Muta la definición VIVA de una función dentro de la transacción (se revierte con el escenario).
const mutar = (firma, de, a) => `
do $mut$
declare v_def text := pg_get_functiondef('${firma}'::regprocedure);
begin
  if position(${dolar(de)} in v_def) = 0 then raise exception 'MUTANTE_SIN_TEXTO'; end if;
  execute replace(v_def, ${dolar(de)}, ${dolar(a)});
end $mut$;
`;
function dolar(texto) {
  return `$t$${texto}$t$`;
}

// ---- Las carreras (commitean de verdad: solo contra una pila propia) ---------------------------------------------------------

async function carreras() {
  if (CONTENEDOR_LOCAL === "supabase_db_cayla-retail") {
    console.log("· las carreras commitean de verdad: no se corren contra la base compartida (usa --contenedor con tu pila)");
    return { total: 0, fallos: 0 };
  }
  let total = 0;
  let fallos = 0;
  const marca = `ZZ carrera entregar ${Date.now()}`;
  // Un pedido pagado completo y listo, de verdad (commit), en Trujillo, con una caja abierta.
  const armar = correr(`
begin;
set local request.jwt.claim.sub = '${FELIPE}';
${lugares("Tienda Trujillo", "tru")}
${lugares("Tienda Lima", "lim")}
${elegirPrenda("v", "and true")}
create function pg_temp.dejar(p_v uuid, p_u uuid, p_sub uuid, p_n integer) returns void language plpgsql as $f$
declare v_mov uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota, usuario_id)
    values (p_v, p_u, p_sub, 'entrada', p_n, 'prueba', 'carrera entregar pedido web', retail.fn_actor_persona_id(true)) returning id into v_mov;
  perform retail.fn_aplicar_movimiento(v_mov);
end $f$;
select pg_temp.dejar(:'v', :'tru', :'tru_alm', 2);
select coalesce((select id from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta'), retail.abrir_caja(:'tru', 0, 'carrera entregar')) as caja \\gset
-- La boleta de la carrera sale de una serie propia de Trujillo (en el seed Lima y Trujillo comparten B001 y chocan). Se queda: esta
-- pila es desechable, y una segunda corrida sigue su numeración.
update retail.series_comprobantes s
   set serie = 'BT96', siguiente_numero = coalesce((select max(c.numero) + 1 from retail.comprobantes c where c.tipo = 'boleta' and c.serie = 'BT96'), 1)
 where s.ubicacion_id = :'tru' and s.tipo = 'boleta' and s.archivada_at is null and s.serie <> 'BT96';
insert into retail.clientas (nombre, telefono_whatsapp) values ('${marca}', '999888769') returning id as cli \\gset
select (retail.crear_pedido_web(:'cli', :'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v', 'precio_lista', :'p_v'::numeric))) ->> 'pedido_id') as a \\gset
select (retail.crear_pedido_web(:'cli', :'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v', 'precio_lista', :'p_v'::numeric))) ->> 'pedido_id') as b \\gset
select retail.confirmar_pedido_web(:'a', jsonb_build_array(jsonb_build_object('linea_id', (select id from retail.pedido_web_lineas where pedido_id = :'a'), 'decision', 'reservar'))) is not null as _ca \\gset
select retail.confirmar_pedido_web(:'b', jsonb_build_array(jsonb_build_object('linea_id', (select id from retail.pedido_web_lineas where pedido_id = :'b'), 'decision', 'reservar'))) is not null as _cb \\gset
select retail.registrar_pago_pedido_web(:'a', (select total from retail.pedidos_web where id = :'a'), 'efectivo') is not null as _pa \\gset
commit;
select :'a' || '|' || :'b' || '|' || (select codigo_recojo from retail.pedidos_web where id = :'a'::uuid) || '|' || (select total::text from retail.pedidos_web where id = :'b'::uuid);
`);
  if (!armar.ok) {
    console.log(`✗ no se pudo armar la carrera\n    ${armar.mensaje.split("\n").slice(0, 6).join("\n    ")}`);
    return { total: 1, fallos: 1 };
  }
  const [a, b, cod, totalB] = armar.salida.split("\n").pop().split("|");
  const sesion = (cuerpo) => `begin;\nset local request.jwt.claim.sub = '${FELIPE}';\nselect pg_sleep(0.3);\n${cuerpo}\ncommit;\n`;

  // 1. Dos cajas entregan el mismo pedido a la vez.
  const [r1, r2] = await Promise.all([
    psqlAsync(sesion(`select retail.entregar_pedido_web('${a}', '${cod}') ->> 'estado';`)),
    psqlAsync(sesion(`select retail.entregar_pedido_web('${a}', '${cod}') ->> 'estado';`)),
  ]);
  const ganadores = [r1, r2].filter((r) => r.code === 0).length;
  const perdedor = [r1, r2].find((r) => r.code !== 0);
  const salidas = correr(`select count(*) from retail.movimientos m join retail.pedido_web_lineas l on l.venta_item_id = m.venta_item_id where l.pedido_id = '${a}' and m.tipo = 'salida';`);
  total++;
  const ok1 = ganadores === 1 && /pedido_web_estado/.test(perdedor?.stderr ?? "") && salidas.salida === "1";
  console.log(`${ok1 ? "✓" : "✗"} dos cajas entregan el mismo pedido a la vez: una lo entrega, la otra lo ve entregado; una sola salida`);
  if (!ok1) {
    fallos++;
    console.log(`    ganadores=${ganadores} salidas=${salidas.salida} ${(perdedor?.stderr ?? "").split("\n").slice(0, 3).join(" ")}`);
  }

  // 2. Dos cajas anotan el último pago (todo) del mismo pedido a la vez, con marcas distintas.
  const [p1, p2] = await Promise.all([
    psqlAsync(sesion(`select retail.registrar_pago_pedido_web('${b}', ${totalB}, 'yape', '71000001') ->> 'estado_pedido';`)),
    psqlAsync(sesion(`select retail.registrar_pago_pedido_web('${b}', ${totalB}, 'yape', '71000002') ->> 'estado_pedido';`)),
  ]);
  const pagaron = [p1, p2].filter((r) => r.code === 0).length;
  const otro = [p1, p2].find((r) => r.code !== 0);
  const ventasB = correr(`select (select count(*) from retail.ventas v where v.id = (select venta_id from retail.pedidos_web where id = '${b}'))
    || '|' || (select count(*) from retail.comprobantes c where c.venta_id = (select venta_id from retail.pedidos_web where id = '${b}'))
    || '|' || (select count(*) from retail.pedido_web_pagos where pedido_id = '${b}' and estado = 'aprobado');`);
  total++;
  const ok2 = pagaron === 1 && /pedido_web_no_cobrable|pedido_web_pasa_el_total/.test(otro?.stderr ?? "") && ventasB.salida === "1|1|1";
  console.log(`${ok2 ? "✓" : "✗"} dos cajas anotan el último pago a la vez: uno queda, el otro se rechaza; una venta y una boleta`);
  if (!ok2) {
    fallos++;
    console.log(`    pagaron=${pagaron} ventas|boletas|pagos=${ventasB.salida} ${(otro?.stderr ?? "").split("\n").slice(0, 3).join(" ")}`);
  }
  return { total, fallos };
}

async function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  const hay = correr("select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('entregar_pedido_web', 'fn_pedido_web_vender');");
  if (hay.salida !== "2") {
    console.error(`Faltan las funciones de entregar: aplica ${MIGRACIONES.join(", ")}.`);
    process.exit(2);
  }
  const prep = correr(`${PREPARAR_BASE}select coalesce(nullif(:'v', ''), 'sin prenda') || '|' || coalesce(nullif(:'v2', ''), 'sin prenda');\nrollback;\n`);
  if (!prep.ok || prep.salida.includes("sin prenda")) {
    console.error(`No se pudo armar el piso de partida (¿dos prendas activas sin campaña que se vendan en Trujillo y Lima?):\n${prep.mensaje ?? prep.salida}`);
    process.exit(2);
  }

  let fallos = 0;
  let total = 0;
  const resultados = escenariosContra("");
  let i = 0;
  for (const [nombre, cuerpo] of ESCENARIOS) {
    if (cuerpo === undefined) {
      console.log(nombre);
      continue;
    }
    const r = resultados[i++];
    total++;
    console.log(`${r.ok ? "✓" : "✗"} ${r.nombre}`);
    if (!r.ok) {
      fallos++;
      console.log(`    ${String(r.detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
    }
  }

  console.log("— F. Las migraciones —");
  const textos = MIGRACIONES.map((f) => readFileSync(f, "utf8"));
  total++;
  const dosVeces = correr(`${PREPARAR_BASE}
${textos.join("\n")}
${textos.join("\n")}
set local request.jwt.claim.sub = '${FELIPE}';
${pagadoListo("a")}
create function pg_temp.veces(p_firma text, p_texto text) returns integer language sql as $f$
  select (length(d) - length(replace(d, p_texto, ''))) / length(p_texto) from (select pg_get_functiondef(p_firma::regprocedure) d) x
$f$;
select concat_ws('|', (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('entregar_pedido_web', 'fn_pedido_web_vender', 'fn_pedido_web_entrega_respuesta', 'fn_venta_de_pedido_web_por_entregar')),
  :'venta_a' <> '', ${entregar("a", ":'cod_a'")} ->> 'estado',
  pg_temp.veces('retail.registrar_pago_pedido_web(uuid, numeric, text, text, uuid)', 'fn_pedido_web_vender'),
  pg_temp.veces('retail.fn_dinero_libro(date)', 'retail.pedido_web_pagos pw'),
  pg_temp.veces('retail.fn_asientos(date, date, uuid)', 'fn_asientos_pedidos_web'),
  pg_temp.veces('retail.fn_bal_anticipos(date)', 'retail.pedido_web_pagos'),
  pg_temp.veces('retail.fn_bal_stock(date)', 'select * from vendido_web'),
  pg_temp.veces('retail.fn_bal_causas_dinero(date, date)', 'retail.pedido_web_pagos pw'),
  pg_temp.veces('retail.fn_flujo_lineas(date, date)', 'retail.pedido_web_pagos pw'));
rollback;
`);
  const okDos = dosVeces.ok && dosVeces.salida.split("\n").pop() === "4|t|entregado|1|2|1|1|1|2|2";
  console.log(`${okDos ? "✓" : "✗"} las tres migraciones se pueden pegar dos veces seguidas: nada se duplica y pagar y entregar siguen funcionando`);
  if (!okDos) {
    fallos++;
    console.log(`    ${dosVeces.ok ? dosVeces.salida.split("\n").pop() : dosVeces.mensaje.split("\n").slice(0, 6).join("\n    ")}`);
  }

  if (CON_CARRERAS) {
    console.log("— G. Las carreras (dos sesiones a la vez) —");
    const c = await carreras();
    total += c.total;
    fallos += c.fallos;
  }

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);

  if (!CON_MUTANTES) return;
  console.log("\n— Mutantes (cada uno tiene que poner rojo algún escenario) —");
  let vivos = 0;
  for (const [nombre, firma, de, a] of MUTANTES) {
    const existe = correr(`select position(${dolar(de)} in pg_get_functiondef('${firma}'::regprocedure)) > 0;`);
    if (!existe.ok || existe.salida !== "t") {
      console.log(`✗ ${nombre}: el texto que muta ya no está en ${firma} (actualiza el mutante)`);
      vivos++;
      continue;
    }
    const muertos = escenariosContra(mutar(firma, de, a)).filter((r) => !r.ok);
    if (muertos.length === 0) vivos++;
    console.log(`${muertos.length > 0 ? "✓" : "✗"} ${nombre}${muertos.length > 0 ? ` — lo frena «${muertos[0].nombre}»` : " — SOBREVIVE: ningún escenario lo vio"}`);
  }
  console.log(`\n${MUTANTES.length - vivos}/${MUTANTES.length} mutantes frenados.`);
  if (vivos > 0) process.exit(1);
}

main();
