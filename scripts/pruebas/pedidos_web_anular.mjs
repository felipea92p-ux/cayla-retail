#!/usr/bin/env node
/**
 * Anular un pedido web PAGADO que todavía no se entrega (ADR-0408; Felipe, 2026-10-15) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261015114000_pedidos_web_anular_pagado.sql` y `20261015115000_pedidos_web_anular_pagado_lecturas.sql`:
 *   A. Anular: el pedido queda anulado con su motivo; sus prendas reservadas vuelven a estar libres (también la de otra tienda; lo que
 *      estaba por conseguir o viajando queda fuera del pedido y entra libre al llegar); cada pago se devuelve por su medio (el efectivo
 *      sale de la caja abierta de HOY); su venta se anula entera; y su boleta va por el camino que ya tiene el ERP: se libera sin
 *      transmitir si nunca se intentó mandar, nace su nota de crédito por el total si SUNAT la aceptó, queda como estaba si SUNAT la
 *      rechazó; y si se está mandando, se intentó y pudo llegar, tiene una baja en trámite o la tienda no tiene serie de nota de
 *      crédito, NO se anula nada y se dice qué hacer.
 *   B. La plata y la caja: sin caja abierta (con efectivo que devolver) no se anula nada; con solo pagos digitales no hace falta caja;
 *      si la caja de hoy no tiene ese efectivo, no se anula nada; y la caja espera exactamente el efectivo que no salió.
 *   C. Los candados: sin el módulo, con un motivo que no es de un pedido pagado, o con el pedido en otro estado, nada; dos toques con la
 *      misma marca devuelven la MISMA anulación (una sola devolución); anulado, no se entrega, no se cobra y su venta no se toca; y
 *      escribiendo directo, un pedido pagado no queda anulado sin devolver todo, sin anular su venta o con su boleta viva sin su nota.
 *   D. Finanzas: el diario revierte la venta y los pagos (la 122 y la 201 vuelven a cero), el Balance no deja nada sin explicar en
 *      caja, bancos, adelantos ni mercadería, la mercadería vuelve a la tienda, lo digital sale de la cuenta que selló y, en Impuestos,
 *      la nota de crédito anula lo que declaró la boleta.
 *   E. Lo que leen las pantallas: la hoja del ERP dice qué le pasará a la boleta antes de confirmar y, después, su nota de crédito;
 *      «Mis pedidos» dice lo que se le devolvió y la nota; «Revisar si se guardó» encuentra una anulación.
 *   F. Las dos migraciones se pueden pegar dos veces, y las de la actividad 10 se pueden volver a pegar DESPUÉS de estas.
 *   G. Carreras de verdad: dos cajas anulan el mismo pedido a la vez; anular y entregar a la vez; anular y registrar el último pago.
 *   Y después de cada escenario que mueve prendas, el stock de las prendas de la prueba cuadra con `movimientos` (INV-01).
 *
 * CÓMO. Cada escenario corre en su transacción y termina en ROLLBACK (nunca se commitea nada). Cada uno arma su piso de partida: un
 * cliente «ZZ» con DNI, dos prendas sin campaña que se venden en Trujillo y Lima con su stock vaciado DENTRO de la transacción, una caja
 * abierta en cada tienda y series de boleta propias de la prueba. Lo que dice SUNAT de una boleta se simula cambiando su estado (como lo
 * escribiría la respuesta de Lucode): esta prueba NUNCA llama a Lucode. Los errores esperados se reconocen por su HINT (`pg_temp.probar`
 * corre la llamada y deshace todo lo que hizo). Las carreras (G) commitean de verdad en una base desechable: solo corren con
 * `--carreras` y NUNCA contra el contenedor compartido `supabase_db_cayla-retail`.
 *
 * MUTANTES. `--mutantes` corre los escenarios contra versiones rotas a propósito de las funciones VIVAS (cada mutante cambia un texto
 * de su definición dentro de la transacción) y falla si alguno sobrevive. No va en el CI (tarda): se corre a mano al tocarlas.
 *
 * DA POR SENTADO: `Tienda Trujillo` y `Tienda Lima` con su piso y su almacén, dos prendas activas sin campaña que se venden en las dos,
 * Felipe como líder y Micaela como integrante sin «Pedidos web» (el seed), y el motor, el ERP, el cobro y la actividad 10 aplicados.
 *
 * USO
 *   pnpm pruebas:pedidos-web-anular                                        → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:pedidos-web-anular -- --mutantes                          → además, los mutantes (a mano)
 *   pnpm pruebas:pedidos-web-anular -- --contenedor supabase_db_<mi-pila>  → contra una pila propia
 *   pnpm pruebas:pedidos-web-anular -- --contenedor supabase_db_<mi-pila> --carreras   → y las carreras (commitean: solo pila propia)
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const CON_MUTANTES = process.argv.includes("--mutantes");
const CON_CARRERAS = process.argv.includes("--carreras");
const MIGRACIONES = [
  "supabase/migrations/20261015114000_pedidos_web_anular_pagado.sql",
  "supabase/migrations/20261015115000_pedidos_web_anular_pagado_lecturas.sql",
];
// Las de la actividad 10, que tienen que poder volver a pegarse DESPUÉS de estas (sus anclas no se tocan).
const DE_LA_ACTIVIDAD_10 = [
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
    values (p_v, p_u, p_sub, 'entrada', p_n, 'prueba', 'prueba anular pedido web: colchón', retail.fn_actor_persona_id(true))
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
      values (p_v, p_u, r.sububicacion_id, 'apartado', r.libres, 'apartado', 'prueba anular pedido web: piso de partida',
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
    v := retail.abrir_caja(p_u, 0, 'prueba anular pedido web');
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
create function pg_temp.esperado(p_u uuid) returns numeric language sql as $f$
  select e.esperado from retail.cajas c cross join lateral retail.fn_calcular_esperado_caja(c.id) e where c.ubicacion_id = p_u and c.estado = 'abierta'
$f$;
-- La boleta de la venta de un pedido.
create function pg_temp.boleta(p_pedido uuid) returns uuid language sql as $f$
  select c.id from retail.comprobantes c join retail.pedidos_web w on w.venta_id = c.venta_id
   where w.id = p_pedido and c.tipo in ('boleta', 'factura') order by c.created_at desc limit 1
$f$;
-- Lo que SUNAT dijo de la boleta (como lo escribe la respuesta de Lucode), sin llamar a nadie. «vieja»: nació hace 5 minutos (la cola ya la
-- habría tomado; recién nacida, puede estar viajando).
create function pg_temp.vieja(p_pedido uuid) returns void language sql as $f$
  update retail.comprobantes set created_at = now() - interval '5 minutes' where id = pg_temp.boleta(p_pedido)
$f$;
create function pg_temp.aceptada(p_pedido uuid) returns void language sql as $f$
  update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'produccion', enviado_at = now(),
         created_at = now() - interval '5 minutes'
   where id = pg_temp.boleta(p_pedido)
$f$;
-- La serie de nota de crédito de la prueba (la letra de la boleta: B) en una tienda.
create function pg_temp.serie_nota(p_u uuid) returns void language sql as $f$
  insert into retail.series_comprobantes (ubicacion_id, tipo, serie, siguiente_numero)
  select p_u, 'nota_credito', case when p_u = (select id from retail.ubicaciones where nombre = 'Tienda Trujillo') then 'BC98' else 'BD98' end, 1
   where not exists (select 1 from retail.series_comprobantes s where s.ubicacion_id = p_u and s.tipo = 'nota_credito' and left(s.serie, 1) = 'B' and s.archivada_at is null)
$f$;
-- Un pedido escrito como «pagado completo» en la base, resumido: estado/motivo/pagado/venta/boleta.
create function pg_temp.foto(p_pedido uuid) returns text language sql as $f$
  select w.estado || '/' || coalesce(w.cierre_motivo, '-') || '/' || case when w.pagado = w.total then 'todo' else w.pagado::text end
         || '/' || v.estado || '/' || c.estado
         || '/' || (select count(*) from retail.pedido_web_pagos g where g.pedido_id = w.id and g.estado = 'aprobado')
    from retail.pedidos_web w join retail.ventas v on v.id = w.venta_id
    join retail.comprobantes c on c.venta_id = v.id and c.tipo in ('boleta', 'factura')
   where w.id = p_pedido
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
   set serie = case tipo when 'boleta' then 'B' else 'F' end || case when ubicacion_id = :'tru' then 'T98' else 'L98' end, siguiente_numero = 1
 where ubicacion_id in (:'tru', :'lim') and tipo in ('boleta', 'factura') and archivada_at is null;
select pg_temp.caja(:'tru') as caja_tru, pg_temp.caja(:'lim') as caja_lim \\gset
update retail.configuracion_tienda_web set horas_para_confirmar = 24, horas_aviso_sin_pagar = 48, dias_aviso_sin_recoger = 7 where id;
-- Un cliente con DNI (la boleta lo lleva).
select '9' || lpad((floor(random() * 9999999))::integer::text, 7, '0') as dni \\gset
insert into retail.clientas (nombre, telefono_whatsapp, documento_tipo, documento_numero)
  values ('ZZ Cliente anular pedido web', '999888771', 'dni', :'dni') returning id as cli \\gset
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
// Pagado completo y listo para recoger, con sus prendas en el almacén de Trujillo: «efectivo» todo en efectivo; «mixto» S/ 10 en
// efectivo y el resto por Yape; «yape» todo por Yape.
const pagado = (alias, prendas = ["v"], forma = "efectivo", op = "62000001") => `
${prendas.map((p) => `select pg_temp.dejar(:'${p}', :'tru', :'tru_alm', 1);`).join("\n")}
${separar(alias, prendas)}
${confirmarTodas(alias)}
${forma === "mixto" ? `select ${pagar(alias, 10)} is not null as _p1_${alias} \\gset\nselect ${pagar(alias, falta(alias), "yape", op)} is not null as _p2_${alias} \\gset` : ""}
${forma === "efectivo" ? `select ${pagar(alias, falta(alias))} is not null as _p_${alias} \\gset` : ""}
${forma === "yape" ? `select ${pagar(alias, falta(alias), "yape", op)} is not null as _p_${alias} \\gset` : ""}
select venta_id as venta_${alias}, codigo_recojo as cod_${alias}, total as total_${alias} from retail.pedidos_web where id = :'${alias}' \\gset
`;
const anular = (alias, motivo = "cliente_desistio", token = "null") => `retail.anular_pedido_web_pagado(:'${alias}', '${motivo}', ${token})`;
const hint = (llamada) => `split_part(pg_temp.probar(${llamada}), '|', 2)`;
const sql = (texto) => `format(${texto})`;
const anularProbando = (alias, motivo = "cliente_desistio") => hint(sql(`'select retail.anular_pedido_web_pagado(%L, %L)', :'${alias}', '${motivo}'`));
// Lo que la base exige al confirmar la transacción (los disparadores diferidos), ahora: 'ok' o el hint.
const VERIFICAR_YA = `split_part(pg_temp.probar('set constraints all immediate'), '|', 2)`;

// ---- Los escenarios: [nombre, cuerpo, esperado] (un título suelto es [titulo]) ---------------------------------------------

const ESCENARIOS = [
  ["— A. Anular: prendas, plata, venta y boleta —"],
  [
    "boleta sin enviar (nunca se intentó): el pedido queda anulado, sus prendas libres, cada pago devuelto (el efectivo de la caja de hoy), la venta anulada entera y la boleta liberada sin transmitir",
    `${pagado("a", ["v", "v2"], "mixto")}
select pg_temp.vieja(:'a');
select pg_temp.fisico(:'v', :'tru') + pg_temp.fisico(:'v2', :'tru') as fis0,
       pg_temp.apartada(:'v', :'tru') + pg_temp.apartada(:'v2', :'tru') as ap0, pg_temp.esperado(:'tru') as esp0 \\gset
select ${anular("a")} as r \\gset
select concat_ws('|',
  :'r'::jsonb ->> 'estado', :'r'::jsonb -> 'boleta' ->> 'estado', :'r'::jsonb ->> 'nota_credito' is null,
  jsonb_array_length(:'r'::jsonb -> 'devuelto'), :'r'::jsonb ->> 'repetido',
  (select estado || '/' || cierre_motivo || '/' || (cerrado_por is not null) || '/' || pagado || '/' || (pagado_en is not null) || '/' || (venta_id = :'venta_a')
     from retail.pedidos_web where id = :'a'),
  (select string_agg(estado, ',' order by posicion) from retail.pedido_web_lineas where pedido_id = :'a'),
  (select string_agg(ap.estado || ':' || ap.cierre_motivo, ',' order by l.posicion) from retail.pedido_web_lineas l join retail.apartados ap on ap.id = l.apartado_id where l.pedido_id = :'a'),
  pg_temp.fisico(:'v', :'tru') + pg_temp.fisico(:'v2', :'tru') = :'fis0'::integer,
  pg_temp.apartada(:'v', :'tru') + pg_temp.apartada(:'v2', :'tru') = :'ap0'::integer - 2,
  (select string_agg(estado || ':' || anulado_motivo, ',' order by registrado_en, id) from retail.pedido_web_pagos where pedido_id = :'a'),
  (select cm.tipo || ':' || cm.monto || ':' || (cm.caja_id = :'caja_tru'::uuid) from retail.pedido_web_pagos g join retail.caja_movimientos cm on cm.id = g.anulado_caja_movimiento_id where g.pedido_id = :'a'),
  pg_temp.esperado(:'tru') = :'esp0'::numeric - 10,
  (select v.estado || '/' || (v.motivo_anulacion like 'Pedido web W-% anulado: el cliente desistió') || '/' || (v.anulado_por is not null)
     || '/' || (select count(*) || ':' || bool_and(ai.condicion = 'vendible' and ai.movimiento_id is null) from retail.venta_anulacion_items ai where ai.venta_id = v.id)
     from retail.ventas v where v.id = :'venta_a'),
  (select estado || '/' || (motivo_no_emitido like 'Pedido web W-%') from retail.comprobantes where id = pg_temp.boleta(:'a')),
  (select count(*) from retail.comprobantes where comprobante_original_id = pg_temp.boleta(:'a')),
  ${CUADRA}, ${VERIFICAR_YA} = '');`,
    "anulado|no_emitido|t|2|false|anulado/cliente_desistio/true/0.00/true/true|liberada,liberada|liberado:otro,liberado:otro|t|t|anulado:devuelto_al_cliente,anulado:devuelto_al_cliente|egreso:10.00:true|t|anulada/true/true/2:true|no_emitido/true|0|t|t",
  ],
  [
    "boleta aceptada por SUNAT: nace su nota de crédito por el total («01», la boleta línea por línea), pendiente para la cola; la boleta sigue aceptada y la cola la toma",
    `${pagado("a", ["v", "v2"])}
select pg_temp.aceptada(:'a'), pg_temp.serie_nota(:'tru');
select ${anular("a", "error_en_pedido")} as r \\gset
select n.id as nota from retail.comprobantes n where n.comprobante_original_id = pg_temp.boleta(:'a') \\gset
update retail.comprobantes set created_at = now() - interval '3 minutes' where id = :'nota';
select concat_ws('|',
  :'r'::jsonb ->> 'estado', :'r'::jsonb -> 'boleta' ->> 'estado', (:'r'::jsonb -> 'nota_credito' ->> 'texto') ~ '^BC98-\\d{6}$',
  (select n.tipo || '/' || n.estado || '/' || n.motivo || '/' || (n.total = c.total) || '/' || (round(n.subtotal + n.igv, 2) = n.total)
          || '/' || (n.subtotal = c.subtotal and n.igv = c.igv) || '/' || (n.venta_id is null) || '/' || jsonb_array_length(n.items)
          || '/' || (n.cliente_num_doc = :'dni')
     from retail.comprobantes n join retail.comprobantes c on c.id = n.comprobante_original_id where n.id = :'nota'),
  (select estado from retail.comprobantes where id = pg_temp.boleta(:'a')),
  (select estado from retail.ventas where id = :'venta_a'),
  :'nota' in (select retail.fn_tomar_comprobantes_para_reintento(:'tru', 20)),
  ${CUADRA}, ${VERIFICAR_YA} = '');`,
    "anulado|aceptado|t|nota_credito/pendiente/01/true/true/true/true/2/true|aceptado|anulada|t|t|t",
  ],
  [
    "boleta aceptada y la tienda SIN serie de nota de crédito: no se anula NADA (pedido, pagos, caja, venta y boleta como estaban) y se dice qué hacer",
    `${pagado("a")}
select pg_temp.aceptada(:'a');
select pg_temp.esperado(:'tru') as esp0, pg_temp.foto(:'a') as foto0 \\gset
select pg_temp.probar(${sql(`'select retail.anular_pedido_web_pagado(%L, %L)', :'a', 'cliente_desistio'`)}) as r \\gset
select concat_ws('|', split_part(:'r', '|', 2), position('serie de nota de crédito' in :'r') > 0,
  pg_temp.foto(:'a') = :'foto0', pg_temp.esperado(:'tru') = :'esp0'::numeric, pg_temp.foto(:'a'));`,
    "pedido_web_sin_serie_nota|t|t|t|pagado/-/todo/completada/aceptado/1",
  ],
  [
    "boleta que ya se intentó mandar (en la cola, o pendiente con un intento) o enviada sin respuesta: pudo llegar a SUNAT, no se anula y se dice qué hacer",
    `${pagado("a")}
${pagado("b", ["v2"])}
select pg_temp.vieja(:'a'), pg_temp.vieja(:'b');
select retail.fn_marcar_reintento_transmision(pg_temp.boleta(:'a'), 'sin_respuesta: prueba') is null as _cola \\gset
update retail.comprobantes set intentos_transmision = 1 where id = pg_temp.boleta(:'b');
select concat_ws('|',
  (select estado from retail.comprobantes where id = pg_temp.boleta(:'a')), ${anularProbando("a")},
  ${anularProbando("b")},
  position('Reintentar ahora' in pg_temp.probar(${sql(`'select retail.anular_pedido_web_pagado(%L, %L)', :'a', 'cliente_desistio'`)})) > 0,
  pg_temp.foto(:'a'), pg_temp.foto(:'b'));`,
    "pendiente_reintento|pedido_web_boleta_en_camino|pedido_web_boleta_en_camino|t|pagado/-/todo/completada/pendiente_reintento/1|pagado/-/todo/completada/pendiente/1",
  ],
  [
    "boleta enviada a SUNAT sin respuesta todavía: no se anula, y dice que espera su respuesta",
    `${pagado("a")}
update retail.comprobantes set estado = 'enviado', entorno_transmision = 'produccion', enviado_at = now(), created_at = now() - interval '5 minutes' where id = pg_temp.boleta(:'a');
select concat_ws('|', ${anularProbando("a")},
  position('todavía no responde' in pg_temp.probar(${sql(`'select retail.anular_pedido_web_pagado(%L, %L)', :'a', 'cliente_desistio'`)})) > 0,
  pg_temp.foto(:'a'));`,
    "pedido_web_boleta_en_camino|t|pagado/-/todo/completada/enviado/1",
  ],
  [
    "boleta recién nacida (puede estar viajando a Lucode) o tomada por la cola: se espera, no se libera",
    `${pagado("a")}
${pagado("b", ["v2"])}
select pg_temp.vieja(:'b');
update retail.comprobantes set proximo_reintento_at = now() + interval '5 minutes' where id = pg_temp.boleta(:'b');
select concat_ws('|', ${anularProbando("a")}, ${anularProbando("b")}, pg_temp.foto(:'a'), pg_temp.foto(:'b'));`,
    "pedido_web_boleta_enviandose|pedido_web_boleta_enviandose|pagado/-/todo/completada/pendiente/1|pagado/-/todo/completada/pendiente/1",
  ],
  [
    "boleta rechazada por SUNAT: no quedó viva, se anula sin nota de crédito y la boleta queda como estaba",
    `${pagado("a")}
update retail.comprobantes set estado = 'rechazado', entorno_transmision = 'produccion', motivo_rechazo = 'prueba', created_at = now() - interval '5 minutes' where id = pg_temp.boleta(:'a');
select ${anular("a")} ->> 'estado' as e \\gset
select concat_ws('|', :'e', (select estado from retail.comprobantes where id = pg_temp.boleta(:'a')),
  (select count(*) from retail.comprobantes where comprobante_original_id = pg_temp.boleta(:'a')),
  (select estado from retail.ventas where id = :'venta_a'), ${VERIFICAR_YA} = '');`,
    "anulado|rechazado|0|anulada|t",
  ],
  [
    "boleta aceptada con una baja en trámite ante SUNAT: no se anula",
    `${pagado("a")}
select pg_temp.aceptada(:'a'), pg_temp.serie_nota(:'tru');
update retail.comprobantes set anulacion_solicitada_at = now(), motivo_anulacion = 'prueba' where id = pg_temp.boleta(:'a');
select concat_ws('|', ${anularProbando("a")}, pg_temp.foto(:'a'));`,
    "pedido_web_boleta_con_baja|pagado/-/todo/completada/aceptado/1",
  ],
  [
    "una prenda reservada en otra tienda y otra por conseguir: la de Lima vuelve a estar libre allá; la que se conseguía queda fuera del pedido",
    `select pg_temp.dejar(:'v', :'lim', :'lim_alm', 1);
${separar("a", ["v", "v2"])}
select retail.confirmar_pedido_web(:'a', jsonb_build_array(
  jsonb_build_object('linea_id', (select id from retail.pedido_web_lineas where pedido_id = :'a' and posicion = 1), 'decision', 'reservar', 'ubicacion_id', :'lim'),
  jsonb_build_object('linea_id', (select id from retail.pedido_web_lineas where pedido_id = :'a' and posicion = 2), 'decision', 'por_conseguir', 'fecha', retail.fn_hoy_lima() + 7))) is not null as _c \\gset
select ${pagar("a", falta("a"), "yape", "62000002")} is not null as _p \\gset
select venta_id as venta_a from retail.pedidos_web where id = :'a' \\gset
select pg_temp.vieja(:'a');
select pg_temp.apartada(:'v', :'lim') as ap_lim \\gset
select ${anular("a", "no_se_puede_entregar")} ->> 'estado' as e \\gset
select concat_ws('|', :'e', (select string_agg(estado, ',' order by posicion) from retail.pedido_web_lineas where pedido_id = :'a'),
  pg_temp.apartada(:'v', :'lim') = :'ap_lim'::integer - 1,
  (select count(*) from retail.venta_anulacion_items where venta_id = :'venta_a'),
  (select cierre_motivo from retail.pedidos_web where id = :'a'), ${CUADRA}, ${VERIFICAR_YA} = '');`,
    "anulado|liberada,por_conseguir|t|2|no_se_puede_entregar|t|t",
  ],
  [
    "una prenda que viajaba en un traslado: al anular queda fuera del pedido y, al llegar, entra LIBRE a la tienda (no se reserva)",
    `select pg_temp.dejar(:'v', :'lim', :'lim_alm', 1);
${separar("a")}
select retail.confirmar_pedido_web(:'a', jsonb_build_array(jsonb_build_object('linea_id', (select id from retail.pedido_web_lineas where pedido_id = :'a'), 'decision', 'reservar', 'ubicacion_id', :'lim'))) is not null as _c \\gset
select ${pagar("a", falta("a"), "transferencia", "62000003")} is not null as _p \\gset
select (retail.enviar_pedido_web_desde(:'a', :'lim', now() + interval '1 day') ->> 'transferencia_id') as tr \\gset
select pg_temp.vieja(:'a');
select ${anular("a")} ->> 'estado' as e \\gset
select pg_temp.apartada(:'v', :'tru') as ap0, pg_temp.fisico(:'v', :'tru') as fis0 \\gset
select retail.registrar_recepcion_traslado(:'tr', :'v', 1) is not null as _r \\gset
select (select resultado from retail.confirmar_traslado(:'tr', 'almacen_tienda')) as _conf \\gset
select concat_ws('|', :'e', (select estado from retail.pedido_web_lineas where pedido_id = :'a'),
  pg_temp.fisico(:'v', :'tru') = :'fis0'::integer + 1, pg_temp.apartada(:'v', :'tru') = :'ap0'::integer,
  ${CUADRA}, ${VERIFICAR_YA} = '');`,
    "anulado|por_conseguir|t|t|t|t",
  ],

  ["— B. La plata y la caja —"],
  [
    "con efectivo que devolver y SIN caja abierta: no se anula NADA; con solo pagos digitales no hace falta caja",
    `${pagado("a")}
${pagado("b", ["v2"], "yape", "62000004")}
select pg_temp.vieja(:'a'), pg_temp.vieja(:'b');
select pg_temp.cerrar_caja(:'tru');
select pg_temp.foto(:'a') as foto0 \\gset
select concat_ws('|', ${anularProbando("a")}, pg_temp.foto(:'a') = :'foto0', ${anular("b")} ->> 'estado', ${VERIFICAR_YA} = '');`,
    "pedido_web_sin_caja|t|anulado|t",
  ],
  [
    "la caja de hoy sin ese efectivo (se cobró en la caja de otro día): no se anula NADA; con efectivo suficiente sí, y sale de la caja de hoy",
    `${pagado("a")}
select pg_temp.vieja(:'a');
select pg_temp.cerrar_caja(:'tru');
select retail.abrir_caja(:'tru', 0, 'prueba anular: caja de hoy vacía') as caja_hoy \\gset
select pg_temp.foto(:'a') as foto0 \\gset
select ${anularProbando("a")} as sin_efectivo \\gset
select pg_temp.cerrar_caja(:'tru');
select retail.abrir_caja(:'tru', 500, 'prueba anular: caja de hoy con efectivo') as caja_hoy2 \\gset
select ${anular("a")} ->> 'estado' as e \\gset
select concat_ws('|', :'sin_efectivo', :'foto0' like 'pagado/%', :'e',
  (select cm.caja_id = :'caja_hoy2'::uuid from retail.pedido_web_pagos g join retail.caja_movimientos cm on cm.id = g.anulado_caja_movimiento_id where g.pedido_id = :'a'),
  pg_temp.esperado(:'tru') = 500 - :'total_a'::numeric, ${VERIFICAR_YA} = '');`,
    "efectivo_insuficiente|t|anulado|t|t|t",
  ],
  [
    "pagado hoy en efectivo y anulado hoy: la caja vuelve exactamente a lo que esperaba antes del pago",
    `select pg_temp.esperado(:'tru') as esp0 \\gset
${pagado("a")}
select pg_temp.vieja(:'a');
select ${anular("a")} is not null as _x \\gset
select pg_temp.esperado(:'tru') = :'esp0'::numeric;`,
    "t",
  ],

  ["— C. Los candados —"],
  [
    "sin el módulo «Pedidos web» no se anula (Micaela)",
    `${pagado("a")}
select pg_temp.vieja(:'a');
set local request.jwt.claim.sub = '${MICAELA}';
select ${anularProbando("a")} as sin_modulo \\gset
set local request.jwt.claim.sub = '${FELIPE}';
select concat_ws('|', :'sin_modulo', pg_temp.foto(:'a'));`,
    "pedido_web_sin_modulo|pagado/-/todo/completada/pendiente/1",
  ],
  [
    "el motivo es de un pedido pagado (desistió, error, no se puede entregar): «no pagó», «sin stock» o ninguno, no",
    `${pagado("a")}
select pg_temp.vieja(:'a');
select concat_ws('|', ${anularProbando("a", "cliente_no_pago")}, ${anularProbando("a", "sin_stock")},
  ${hint(sql(`'select retail.anular_pedido_web_pagado(%L, null)', :'a'`))}, pg_temp.foto(:'a'));`,
    "pedido_web_motivo|pedido_web_motivo|pedido_web_motivo|pagado/-/todo/completada/pendiente/1",
  ],
  [
    "solo un pedido pagado: confirmado, entregado o ya anulado, no (y dos anulaciones con marcas distintas: la segunda lo ve anulado)",
    `${pagado("a")}
${pagado("b", ["v2"])}
select pg_temp.vieja(:'a');
select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1);
${separar("c")}
${confirmarTodas("c")}
select retail.entregar_pedido_web(:'b', :'cod_b') is not null as _e \\gset
select ${anular("a", "cliente_desistio", "gen_random_uuid()")} is not null as _x \\gset
select concat_ws('|', ${anularProbando("c")}, ${anularProbando("b")}, ${anularProbando("a")},
  (select count(*) from retail.caja_movimientos cm join retail.pedido_web_pagos g on g.anulado_caja_movimiento_id = cm.id where g.pedido_id = :'a'));`,
    "pedido_web_estado|pedido_web_estado|pedido_web_estado|1",
  ],
  [
    "dos toques con la MISMA marca devuelven la misma anulación (una sola devolución, una sola nota); la marca con otro motivo, rechazada",
    `${pagado("a", ["v", "v2"], "mixto", "62000005")}
select pg_temp.aceptada(:'a'), pg_temp.serie_nota(:'tru');
select gen_random_uuid() as tok \\gset
select ${anular("a", "cliente_desistio", "(:'tok')::uuid")} ->> 'repetido' as r1 \\gset
select ${anular("a", "cliente_desistio", "(:'tok')::uuid")} as r2 \\gset
select concat_ws('|', :'r1', :'r2'::jsonb ->> 'repetido', jsonb_array_length(:'r2'::jsonb -> 'devuelto'),
  ${hint(sql(`'select retail.anular_pedido_web_pagado(%L, %L, %L)', :'a', 'error_en_pedido', :'tok'`))},
  (select count(*) from retail.caja_movimientos cm join retail.pedido_web_pagos g on g.anulado_caja_movimiento_id = cm.id where g.pedido_id = :'a'),
  (select count(*) from retail.comprobantes where comprobante_original_id = pg_temp.boleta(:'a')),
  (select count(*) from retail.venta_anulacion_items where venta_id = :'venta_a'), ${VERIFICAR_YA} = '');`,
    "false|true|2|token_reusado|1|1|2|t",
  ],
  [
    "anulado, ya no se entrega, no se cobra, su venta no se anula otra vez, no se cambia ni se devuelve, y un pago no se «devuelve» dos veces",
    `${pagado("a")}
select pg_temp.vieja(:'a');
select (select id from retail.venta_items where venta_id = :'venta_a') as item, (select id from retail.pedido_web_pagos where pedido_id = :'a') as pago \\gset
select ${anular("a")} is not null as _x \\gset
select concat_ws('|',
  ${hint(sql(`'select retail.entregar_pedido_web(%L, %L)', :'a', :'cod_a'`))},
  ${hint(sql(`'select retail.registrar_pago_pedido_web(%L, 1, %L)', :'a', 'efectivo'`))},
  position('ya está anulada' in pg_temp.probar(${sql(`'select retail.anular_venta(%L, %L, %L)', :'venta_a', 'prueba', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'condicion', 'vendible'))`)})) > 0,
  split_part(pg_temp.probar(${sql(`'select retail.crear_devolucion(%L, %L, %L, %L, %L)', :'venta_a', :'tru', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'cantidad', 1, 'condicion', 'vendible')), 'prueba', 'talla'`)}), '|', 1),
  ${hint(sql(`'select retail.anular_pago_pedido_web(%L, %L)', :'pago', 'devuelto_al_cliente'`))});`,
    "pedido_web_estado|pedido_web_no_cobrable|t|error|pedido_web_estado",
  ],
  [
    "escribiendo directo: un pagado no queda anulado sin anular su venta ni devolver todo, ni con un motivo de otro estado; la marca solo nace al anular y no cambia",
    `${pagado("a", ["v", "v2"], "mixto", "62000006")}
select pg_temp.vieja(:'a');
select concat_ws('|',
  split_part(pg_temp.probar(${sql(`'update retail.pedidos_web set estado = %L, cerrado_en = now(), cerrado_por = retail.fn_actor_persona_id(true), cierre_motivo = %L where id = %L; set constraints all immediate', 'anulado', 'cliente_desistio', :'a'`)}), '|', 2),
  position('pedidos_web_cierre_coherente' in pg_temp.probar(${sql(`'update retail.pedidos_web set estado = %L, cerrado_en = now(), cerrado_por = retail.fn_actor_persona_id(true), cierre_motivo = %L where id = %L', 'anulado', 'cliente_no_pago', :'a'`)})) > 0,
  ${hint(sql(`'update retail.pedidos_web set anulacion_token = gen_random_uuid() where id = %L', :'a'`))});`,
    "pedido_web_incoherente|t|pedido_web_inmutable",
  ],
  [
    "escribiendo directo: un pago sin devolver, la boleta aceptada sin su nota o la venta sin anular (con todo lo demás hecho): no se guarda",
    `${pagado("a", ["v", "v2"], "mixto", "62000007")}
${pagado("b", ["v2"], "yape", "62000008")}
select pg_temp.vieja(:'a');
select pg_temp.aceptada(:'b');
create function pg_temp.a_mano(p_pedido uuid, p_pagos text, p_boleta boolean, p_venta boolean default true) returns text language plpgsql as $f$
declare w retail.pedidos_web%rowtype; g record; v_cm uuid; v_caja uuid;
begin
  for w in select * from retail.pedidos_web x where x.id = p_pedido loop exit; end loop;
  v_caja := (select c.id from retail.cajas c where c.ubicacion_id = w.ubicacion_id and c.estado = 'abierta');
  update retail.pedidos_web set estado = 'anulado', cerrado_en = now(), cerrado_por = retail.fn_actor_persona_id(true), cierre_motivo = 'cliente_desistio' where id = w.id;
  update retail.pedido_web_lineas set estado = 'liberada' where pedido_id = w.id and estado = 'reservada';
  perform retail.fn_pedido_web_soltar(l.id, retail.fn_actor_persona_id(true), 'a mano') from retail.pedido_web_lineas l where l.pedido_id = w.id and l.estado = 'liberada';
  for g in select * from retail.pedido_web_pagos x where x.pedido_id = w.id and x.estado = 'aprobado' and (p_pagos = 'todos' or x.medio <> 'efectivo') loop
    v_cm := null;
    if g.medio = 'efectivo' then
      insert into retail.caja_movimientos (caja_id, tipo, monto, motivo, usuario_id) values (v_caja, 'egreso', g.monto, 'a mano', retail.fn_actor_persona_id(true)) returning id into v_cm;
    end if;
    update retail.pedido_web_pagos set estado = 'anulado', anulado_en = now(), anulado_por = retail.fn_actor_persona_id(true), anulado_motivo = 'devuelto_al_cliente', anulado_caja_movimiento_id = v_cm where id = g.id;
  end loop;
  insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion) select w.venta_id, vi.id, 'vendible' from retail.venta_items vi where vi.venta_id = w.venta_id;
  if p_venta then
    update retail.ventas set estado = 'anulada', motivo_anulacion = 'a mano', anulado_por = retail.fn_actor_persona_id(true), anulado_en = now() where id = w.venta_id;
  end if;
  if p_boleta then
    update retail.comprobantes set estado = 'no_emitido', motivo_no_emitido = 'a mano', marcado_no_emitido_por = retail.fn_actor_persona_id(true), marcado_no_emitido_at = now()
     where venta_id = w.venta_id and tipo = 'boleta';
  end if;
  set constraints all immediate;
  return 'ok';
end $f$;
select concat_ws('|',
  split_part(pg_temp.probar(${sql(`'select pg_temp.a_mano(%L, %L, true)', :'a', 'digitales'`)}), '|', 2),
  split_part(pg_temp.probar(${sql(`'select pg_temp.a_mano(%L, %L, false)', :'b', 'todos'`)}), '|', 2),
  split_part(pg_temp.probar(${sql(`'select pg_temp.a_mano(%L, %L, true, false)', :'a', 'todos'`)}), '|', 2),
  -- Y hecho entero a mano (todo devuelto, la boleta liberada), sí se guarda: la verificación no exige la función, exige el estado.
  split_part(pg_temp.probar(${sql(`'select pg_temp.a_mano(%L, %L, true)', :'a', 'todos'`)}), '|', 1));`,
    "pedido_web_incoherente|pedido_web_incoherente|pedido_web_incoherente|ok",
  ],

  ["— D. Finanzas: el diario, el Balance, el libro, el flujo e Impuestos —"],
  [
    "el diario revierte la venta el día que se anula (la 122 y la 201 de la venta vuelven a cero) y cada pago devuelto sale de la caja o el banco",
    `${pagado("a", ["v"], "mixto", "62000009")}
select pg_temp.vieja(:'a');
select ${anular("a")} is not null as _x \\gset
create temp table d as select * from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima());
select concat_ws('|',
  (select string_agg(d.cuenta || ':' || d.debe || ':' || d.haber, ',' order by d.cuenta, d.debe) from d where d.asiento = 'anulacion:' || :'venta_a' and d.cuenta in ('122', '4011', '7011')),
  (select sum(d.haber - d.debe) from d
    where d.cuenta = '122' and (d.origen_id = :'venta_a' or d.origen_id in (select id from retail.pedido_web_pagos where pedido_id = :'a'))) = 0,
  (select coalesce(sum(d.debe - d.haber), 0) from d where d.cuenta = '201' and d.origen_id = :'venta_a') = 0,
  (select count(*) from d where d.regla = 'pedido_web_pago_anulado' and d.origen_id in (select id from retail.pedido_web_pagos where pedido_id = :'a')) = 4);`,
    "122:0:" + "@TOTAL@" + ",4011:@IGV@:0,7011:@BASE@:0|t|t|t",
  ],
  [
    "el Balance: un pedido pagado en efectivo y por Yape, anulado (con la boleta liberada o con su nota de crédito) no deja nada sin explicar en caja, bancos, adelantos ni mercadería",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1), pg_temp.dejar(:'v2', :'tru', :'tru_alm', 1);
select retail.crear_cuenta_dinero('ZZ BCP prueba anular', 'banco', 0, retail.fn_hoy_lima() - 20) as bcp \\gset
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
${separar("a")}
${confirmarTodas("a")}
select ${pagar("a", 6)} is not null as _p1 \\gset
select ${pagar("a", falta("a"), "yape", "62000010")} is not null as _p2 \\gset
${separar("b", ["v2"])}
${confirmarTodas("b")}
select ${pagar("b", falta("b"), "yape", "62000011")} is not null as _p3 \\gset
select pg_temp.dif() as d1 \\gset
select pg_temp.vieja(:'a'), pg_temp.aceptada(:'b'), pg_temp.serie_nota(:'tru');
select ${anular("a")} is not null as _x, ${anular("b", "error_en_pedido")} is not null as _y \\gset
select pg_temp.dif() as d2 \\gset
select concat_ws('|', pg_temp.igual(:'d0', :'d1'), pg_temp.igual(:'d0', :'d2'), ${VERIFICAR_YA} = '');`,
    "t|t|t",
  ],
  [
    "la mercadería del Balance: la prenda de una venta web anulada vuelve a contar en su tienda (sin anular, la vendida se descontaba)",
    `select coalesce((select unidades from retail.fn_bal_stock(retail.fn_hoy_lima()) where ubicacion_id = :'tru'), 0) as u0 \\gset
${pagado("a")}
select coalesce((select unidades from retail.fn_bal_stock(retail.fn_hoy_lima()) where ubicacion_id = :'tru'), 0) as u1 \\gset
select pg_temp.vieja(:'a');
select ${anular("a")} is not null as _x \\gset
select coalesce((select unidades from retail.fn_bal_stock(retail.fn_hoy_lima()) where ubicacion_id = :'tru'), 0) as u2 \\gset
select concat_ws('|', :'u1'::bigint - :'u0'::bigint, :'u2'::bigint - :'u0'::bigint);`,
    "0|1",
  ],
  [
    "el libro de cuentas y el flujo: lo pagado por Yape vuelve a salir de la cuenta que selló; el efectivo devuelto es «efectivo de clientes»",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1);
select retail.crear_cuenta_dinero('ZZ BCP prueba anular libro', 'banco', 0, retail.fn_hoy_lima() - 20) as bcp \\gset
select retail.guardar_medio_de_cobro(:'tru', 'yape', :'bcp') as _m1 \\gset
create function pg_temp.saldo(p_id uuid) returns numeric language sql as $f$ select saldo from retail.fn_cuentas_dinero_saldos() where id = p_id $f$;
select pg_temp.saldo(:'bcp') as b0 \\gset
${separar("a")}
${confirmarTodas("a")}
select ${pagar("a", 7)} is not null as _p1 \\gset
select ${pagar("a", falta("a"), "yape", "62000012")} is not null as _p2 \\gset
select pg_temp.saldo(:'bcp') - :'b0'::numeric as tras_pagar \\gset
select pg_temp.vieja(:'a');
select ${anular("a")} is not null as _x \\gset
select concat_ws('|', :'tras_pagar'::numeric = (select total from retail.pedidos_web where id = :'a') - 7, pg_temp.saldo(:'bcp') = :'b0'::numeric,
  (select string_agg(l.categoria || ':' || l.monto, ',' order by l.monto)
     from retail.fn_flujo_lineas(retail.fn_hoy_lima(), retail.fn_hoy_lima()) l
    where l.monto in (7, -7) and l.categoria in ('efectivo', 'otros_ingresos', 'por_clasificar')));`,
    "t|t|efectivo:-7.00,efectivo:7.00",
  ],
  [
    "Impuestos: la boleta aceptada y su nota de crédito suman cero ese día; una boleta liberada no se declara",
    `${pagado("a")}
${pagado("b", ["v2"])}
select pg_temp.aceptada(:'a'), pg_temp.serie_nota(:'tru'), pg_temp.vieja(:'b');
select ${anular("a")} is not null as _x, ${anular("b")} is not null as _y \\gset
select concat_ws('|',
  (select sum(i.signo * i.total) from retail.fn_impuestos_ventas(retail.fn_hoy_lima(), retail.fn_hoy_lima()) i
    where i.cuenta and i.comprobante_id in (pg_temp.boleta(:'a'), (select id from retail.comprobantes where comprobante_original_id = pg_temp.boleta(:'a')))),
  (select count(*) from retail.fn_impuestos_ventas(retail.fn_hoy_lima(), retail.fn_hoy_lima()) i where i.comprobante_id = pg_temp.boleta(:'b')));`,
    "0.00|0",
  ],

  ["— E. Lo que leen las pantallas —"],
  [
    "la hoja del ERP: antes de confirmar dice qué le pasará a la boleta (liberar, nota de crédito, o esperar con el porqué); anulado, su nota de crédito",
    `${pagado("a")}
${pagado("b", ["v2"])}
select pg_temp.vieja(:'a');
select retail.fn_pedido_web_detalle(:'a') -> 'anulacion_boleta' as l0, retail.fn_pedido_web_detalle(:'b') -> 'anulacion_boleta' as f0 \\gset
select pg_temp.aceptada(:'b');
select retail.fn_pedido_web_detalle(:'b') -> 'anulacion_boleta' as s0 \\gset
select pg_temp.serie_nota(:'tru');
select retail.fn_pedido_web_detalle(:'b') -> 'anulacion_boleta' as n0 \\gset
select ${anular("b")} is not null as _x \\gset
select retail.fn_pedido_web_detalle(:'b') as d1 \\gset
select concat_ws('|', :'l0'::jsonb ->> 'camino', :'f0'::jsonb ->> 'camino', :'f0'::jsonb ->> 'hint', :'s0'::jsonb ->> 'hint',
  :'n0'::jsonb ->> 'camino', (:'n0'::jsonb ->> 'explicacion') like '%nota de crédito por S/%',
  :'d1'::jsonb ->> 'estado', :'d1'::jsonb ->> 'anulacion_boleta' is null, (:'d1'::jsonb -> 'nota_credito' ->> 'texto') ~ '^BC98-\\d{6}$',
  :'d1'::jsonb -> 'nota_credito' ->> 'estado',
  (select string_agg(x ->> 'estado' || ':' || (x ->> 'anulado_motivo') || ':' || ((x ->> 'anulado_por') is not null), ',') from jsonb_array_elements(:'d1'::jsonb -> 'pagos') x));`,
    "liberar|esperar|pedido_web_boleta_enviandose|pedido_web_sin_serie_nota|nota_credito|t|anulado|t|t|pendiente|anulado:devuelto_al_cliente:true",
  ],
  [
    "«Mis pedidos»: anulado con su motivo, lo que se le devolvió y la nota de crédito (con la boleta liberada, sin boleta ni nota)",
    `${pagado("a")}
${pagado("b", ["v2"], "mixto", "62000013")}
select pg_temp.aceptada(:'a'), pg_temp.serie_nota(:'tru'), pg_temp.vieja(:'b');
select ${anular("a", "error_en_pedido")} is not null as _x, ${anular("b", "no_se_puede_entregar")} is not null as _y \\gset
select (select x from jsonb_array_elements(retail.fn_pedidos_web_de_clienta(:'cli')) x where x ->> 'pedido_id' = :'a') as ma,
       (select x from jsonb_array_elements(retail.fn_pedidos_web_de_clienta(:'cli')) x where x ->> 'pedido_id' = :'b') as mb \\gset
select concat_ws('|',
  :'ma'::jsonb ->> 'estado', :'ma'::jsonb ->> 'cierre_motivo', (:'ma'::jsonb ->> 'devuelto')::numeric = :'total_a'::numeric,
  (:'ma'::jsonb ->> 'nota_credito') ~ '^BC98-\\d{6}$', (:'ma'::jsonb ->> 'boleta') ~ '^BT98-\\d{6}$',
  :'mb'::jsonb ->> 'cierre_motivo', (:'mb'::jsonb ->> 'devuelto')::numeric = :'total_b'::numeric,
  coalesce(:'mb'::jsonb ->> 'nota_credito', 'sin nota'), coalesce(:'mb'::jsonb ->> 'boleta', 'sin boleta'), (:'mb'::jsonb ->> 'pagado')::numeric);`,
    "anulado|error_en_pedido|t|t|t|no_se_puede_entregar|t|sin nota|sin boleta|0.00",
  ],
  [
    "«Revisar si se guardó» encuentra una anulación por su marca; una marca que nunca llegó, no",
    `${pagado("a")}
select pg_temp.vieja(:'a');
select gen_random_uuid() as tok \\gset
select ${anular("a", "cliente_desistio", "(:'tok')::uuid")} is not null as _x \\gset
select concat_ws('|',
  retail.fn_resolver_intento('anular_pedido_web_pagado', :'tok') ->> 'estado',
  retail.fn_resolver_intento('anular_pedido_web_pagado', :'tok') ->> 'estado_pedido',
  retail.fn_resolver_intento('anular_pedido_web_pagado', gen_random_uuid()) ->> 'estado');`,
    "hecho|anulado|no_llego",
  ],
];

// ---- Los mutantes: cada uno rompe UNA promesa en la función VIVA; alguna prueba tiene que ponerse roja ----------------------

const F_ANULAR = "retail.anular_pedido_web_pagado(uuid, text, uuid)";
const F_CAMINO = "retail.fn_pedido_web_camino_boleta(uuid)";
const MUTANTES = [
  ["anular no suelta las reservas", F_ANULAR,
    "    update retail.pedido_web_lineas x set estado = 'liberada' where x.id = l.id;\n    perform retail.fn_pedido_web_soltar(l.id, v_persona,",
    "    perform retail.fn_pedido_web_resumen(l.id);\n    perform concat(l.id, v_persona,"],
  ["anular no devuelve los pagos", F_ANULAR,
    "       set estado = 'anulado', anulado_en = now(), anulado_por = v_persona, anulado_motivo = 'devuelto_al_cliente',",
    "       set observacion = observacion, actualizado_en = coalesce(actualizado_en, now()),"],
  ["el efectivo no sale de la caja", F_ANULAR, "    if g.medio = 'efectivo' then\n      insert into retail.caja_movimientos", "    if false then\n      insert into retail.caja_movimientos"],
  ["anula sin caja abierta", F_ANULAR, "    if v_caja is null then\n      v_tienda :=", "    if false then\n      v_tienda :="],
  ["la caja de hoy puede quedar con menos de cero (sin el candado explícito)", F_ANULAR, "  perform retail.fn_exigir_efectivo_en_caja(v_caja);", "  perform v_caja;"],
  ["la venta no se anula", F_ANULAR,
    "set estado = 'anulada', motivo_anulacion = v_motivo, anulado_por = v_persona, anulado_en = now()", "set nota = nota"],
  ["la venta se anula sin sus filas de anulación", F_ANULAR,
    "    select v.id, vi.id, 'vendible', null from retail.venta_items vi where vi.venta_id = v.id;",
    "    select v.id, vi.id, 'vendible', null from retail.venta_items vi where false;"],
  ["la boleta no se libera", F_ANULAR,
    "set estado = 'no_emitido', motivo_no_emitido = v_motivo, marcado_no_emitido_por = v_persona, marcado_no_emitido_at = now()",
    "set motivo_no_emitido = motivo_no_emitido"],
  ["no nace la nota de crédito", F_ANULAR, "    perform retail.emitir_nota(b.id, 'nota_credito', '01',", "    perform jsonb_build_array(b.id, 'nota_credito', '01',"],
  ["la nota de crédito no es por el total", F_ANULAR, "'01', b.subtotal, b.igv, b.total,", "'01', b.subtotal, b.igv, b.total - 1,"],
  ["sin el permiso del módulo", F_ANULAR,
    "  perform retail.fn_pedido_web_exigir(p.ubicacion_id);\n  if p.estado <> 'pagado' then", "  if p.estado <> 'pagado' then"],
  ["anula un pedido que no está pagado", F_ANULAR, "  if p.estado <> 'pagado' then\n    raise exception '%', case p.estado",
    "  if false then\n    raise exception '%', case p.estado"],
  ["acepta cualquier motivo", F_ANULAR,
    "if p_motivo is null or p_motivo not in ('cliente_desistio', 'error_en_pedido', 'no_se_puede_entregar') then", "if p_motivo is null then"],
  ["la misma marca anula otra vez", F_ANULAR, "    if v_existente is not null then\n      if v_existente <> p_pedido_id",
    "    if false then\n      if v_existente <> p_pedido_id"],
  ["libera una boleta que ya se intentó mandar", F_CAMINO, "if c.estado = 'pendiente_reintento' or c.intentos_transmision > 0 then", "if false then"],
  ["libera una boleta recién nacida o tomada por la cola", F_CAMINO,
    "if c.created_at > now() - interval '2 minutes' or c.proximo_reintento_at > now() then", "if false then"],
  ["anula con la boleta enviada sin respuesta", F_CAMINO, "  if c.estado = 'enviado' then\n    return v_base", "  if false then\n    return v_base"],
  ["anula con una baja en trámite", F_CAMINO, "    if c.anulacion_solicitada_at is not null then", "    if false then"],
  ["no mira la serie de nota de crédito", F_CAMINO, "    if not exists (select 1 from retail.series_comprobantes s", "    if false and not exists (select 1 from retail.series_comprobantes s"],
  ["el pagado podía pasar a anulado sin la función (la verificación no exige devolver todo)", "retail.fn_pedido_web_verificar(uuid)",
    "    if p.pagado <> 0 then", "    if false then"],
  ["la verificación acepta la boleta viva sin su nota", "retail.fn_pedido_web_verificar(uuid)",
    "       or exists (select 1 from retail.comprobantes c\n                   where c.venta_id = p.venta_id and c.tipo in ('boleta', 'factura')\n                     and (c.estado in",
    "       or exists (select 1 from retail.comprobantes c\n                   where false and c.venta_id = p.venta_id and c.tipo in ('boleta', 'factura')\n                     and (c.estado in"],
  ["la verificación acepta la venta sin anular", "retail.fn_pedido_web_verificar(uuid)",
    "where v.id = p.venta_id and (v.ubicacion_id <> p.ubicacion_id or v.estado <> 'anulada'))", "where v.id = p.venta_id and (v.ubicacion_id <> p.ubicacion_id))"],
  ["el Balance no devuelve a la mercadería lo de una venta web anulada", "retail.fn_bal_stock(date)",
    "from (select * from al_corte union all select * from anulado_web) a", "from (select * from al_corte) a"],
  ["la hoja no sabe qué le pasará a la boleta", "retail.fn_pedido_web_detalle(uuid)",
    "'anulacion_boleta', (select retail.fn_pedido_web_camino_boleta(w.venta_id)", "'anulacion_boleta', (select null::jsonb"],
  ["«Mis pedidos» no dice lo devuelto", "retail.fn_pedidos_web_de_clienta(uuid, integer, integer)",
    "'devuelto', (select coalesce(sum(g.monto), 0)", "'devuelto', (select 0 + 0 * coalesce(sum(g.monto), 0)"],
  ["«Revisar si se guardó» no conoce la anulación", "retail.fn_resolver_intento(text, uuid)",
    "    elsif p_operacion = 'anular_pedido_web_pagado' then", "    elsif false then"],
  ["el pedido pagado no puede pasar a anulado", "retail.fn_pedido_web_reglas()",
    "    or (old.estado = 'pagado' and new.estado in ('entregado', 'anulado'))) then", "    or (old.estado = 'pagado' and new.estado in ('entregado'))) then"],
];

function escenariosContra(aplicar) {
  const PREPARAR = preparar(aplicar);
  const resultados = [];
  for (const [nombre, cuerpo, esperado] of ESCENARIOS) {
    if (cuerpo === undefined) continue;
    const r = correr(`${PREPARAR}${cuerpo}\nrollback;\n`);
    const ultima = r.ok ? r.salida.split("\n").pop() : null;
    const ok = r.ok && coincide(ultima, esperado);
    resultados.push({ nombre, ok, detalle: r.ok ? `dio «${ultima}», se esperaba «${esperado}»` : r.mensaje });
  }
  return resultados;
}

// Un esperado puede llevar @TOTAL@, @IGV@ y @BASE@ (lo que vale la venta de la prueba): se acepta cualquier monto en su lugar, con tal
// de que @IGV@ + @BASE@ = @TOTAL@.
function coincide(ultima, esperado) {
  if (!esperado.includes("@")) return ultima === esperado;
  const patron = new RegExp(
    `^${esperado.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("@TOTAL@", "(\\d+\\.\\d{2})").replace("@IGV@", "(\\d+\\.\\d{2})").replace("@BASE@", "(\\d+\\.\\d{2})")}$`,
  );
  const m = patron.exec(ultima ?? "");
  if (!m) return false;
  const [, total, igv, base] = m.map(Number);
  return Math.abs(igv + base - total) < 0.005 && total > 0;
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
  const marca = `ZZ carrera anular ${Date.now()}`;
  // Tres pedidos de verdad (commit), en Trujillo, con una caja abierta: a y b pagados completos (en efectivo, la boleta vieja), c
  // confirmado con un pago parcial.
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
    values (p_v, p_u, p_sub, 'entrada', p_n, 'prueba', 'carrera anular pedido web', retail.fn_actor_persona_id(true)) returning id into v_mov;
  perform retail.fn_aplicar_movimiento(v_mov);
end $f$;
select pg_temp.dejar(:'v', :'tru', :'tru_alm', 3);
select coalesce((select id from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta'), retail.abrir_caja(:'tru', 0, 'carrera anular')) as caja \\gset
-- La boleta de la carrera sale de una serie propia de Trujillo (en el seed Lima y Trujillo comparten B001 y chocan). Se queda: esta
-- pila es desechable, y una segunda corrida sigue su numeración.
update retail.series_comprobantes s
   set serie = 'BT95', siguiente_numero = coalesce((select max(c.numero) + 1 from retail.comprobantes c where c.tipo = 'boleta' and c.serie = 'BT95'), 1)
 where s.ubicacion_id = :'tru' and s.tipo = 'boleta' and s.archivada_at is null and s.serie <> 'BT95';
insert into retail.clientas (nombre, telefono_whatsapp) values ('${marca}', '999888768') returning id as cli \\gset
create function pg_temp.pedido(p_cli uuid, p_tru uuid, p_v uuid, p_precio numeric) returns uuid language plpgsql as $f$
declare v_id uuid;
begin
  v_id := (retail.crear_pedido_web(p_cli, p_tru, jsonb_build_array(jsonb_build_object('variante_id', p_v, 'precio_lista', p_precio))) ->> 'pedido_id')::uuid;
  perform retail.confirmar_pedido_web(v_id, jsonb_build_array(jsonb_build_object('linea_id', (select id from retail.pedido_web_lineas where pedido_id = v_id), 'decision', 'reservar')));
  return v_id;
end $f$;
select pg_temp.pedido(:'cli', :'tru', :'v', :'p_v'::numeric) as a, pg_temp.pedido(:'cli', :'tru', :'v', :'p_v'::numeric) as b,
       pg_temp.pedido(:'cli', :'tru', :'v', :'p_v'::numeric) as c \\gset
select retail.registrar_pago_pedido_web(:'a', (select total from retail.pedidos_web where id = :'a'), 'efectivo') is not null as _pa,
       retail.registrar_pago_pedido_web(:'b', (select total from retail.pedidos_web where id = :'b'), 'efectivo') is not null as _pb,
       retail.registrar_pago_pedido_web(:'c', 1, 'efectivo') is not null as _pc \\gset
update retail.comprobantes set created_at = now() - interval '10 minutes' where venta_id in (select venta_id from retail.pedidos_web where id in (:'a', :'b'));
commit;
select :'a' || '|' || :'b' || '|' || :'c' || '|' || (select codigo_recojo from retail.pedidos_web where id = :'b'::uuid)
       || '|' || (select (total - pagado)::text from retail.pedidos_web where id = :'c'::uuid);
`);
  if (!armar.ok) {
    console.log(`✗ no se pudo armar la carrera\n    ${armar.mensaje.split("\n").slice(0, 6).join("\n    ")}`);
    return { total: 1, fallos: 1 };
  }
  const [a, b, c, codB, faltaC] = armar.salida.split("\n").pop().split("|");
  const sesion = (cuerpo) => `begin;\nset local request.jwt.claim.sub = '${FELIPE}';\nselect pg_sleep(0.3);\n${cuerpo}\ncommit;\n`;
  const estadoDe = (id) =>
    correr(`select w.estado || '/' || w.pagado || '/' || v.estado || '/' || (select count(*) from retail.pedido_web_pagos g where g.pedido_id = w.id and g.anulado_caja_movimiento_id is not null)
              || '/' || (select count(*) from retail.movimientos m join retail.pedido_web_lineas l on l.venta_item_id = m.venta_item_id where l.pedido_id = w.id and m.tipo = 'salida')
              from retail.pedidos_web w left join retail.ventas v on v.id = w.venta_id where w.id = '${id}';`).salida;

  // 1. Dos cajas anulan el mismo pedido a la vez (marcas distintas).
  const [r1, r2] = await Promise.all([
    psqlAsync(sesion(`select retail.anular_pedido_web_pagado('${a}', 'cliente_desistio', gen_random_uuid()) ->> 'estado';`)),
    psqlAsync(sesion(`select retail.anular_pedido_web_pagado('${a}', 'cliente_desistio', gen_random_uuid()) ->> 'estado';`)),
  ]);
  const ganan = [r1, r2].filter((r) => r.code === 0).length;
  const pierde = [r1, r2].find((r) => r.code !== 0);
  total++;
  const fa = estadoDe(a);
  const ok1 = ganan === 1 && /pedido_web_estado/.test(pierde?.stderr ?? "") && fa === "anulado/0.00/anulada/1/0";
  console.log(`${ok1 ? "✓" : "✗"} dos cajas anulan el mismo pedido a la vez: una lo anula, la otra lo ve anulado; una sola devolución`);
  if (!ok1) {
    fallos++;
    console.log(`    ganan=${ganan} estado=${fa} ${(pierde?.stderr ?? "").split("\n").slice(0, 3).join(" ")}`);
  }

  // 2. Anular y entregar el mismo pedido a la vez.
  const [e1, e2] = await Promise.all([
    psqlAsync(sesion(`select retail.anular_pedido_web_pagado('${b}', 'cliente_desistio') ->> 'estado';`)),
    psqlAsync(sesion(`select retail.entregar_pedido_web('${b}', '${codB}') ->> 'estado';`)),
  ]);
  const ganaE = [e1, e2].filter((r) => r.code === 0).length;
  const pierdeE = [e1, e2].find((r) => r.code !== 0);
  const fb = estadoDe(b);
  total++;
  const ok2 = ganaE === 1 && /pedido_web_estado/.test(pierdeE?.stderr ?? "") && ["anulado/0.00/anulada/1/0", "entregado/" + fb.split("/")[1] + "/completada/0/1"].includes(fb);
  console.log(`${ok2 ? "✓" : "✗"} anular y entregar a la vez: gana uno y el otro lo ve cambiado (anulado sin salida, o entregado sin devolución) → ${fb}`);
  if (!ok2) {
    fallos++;
    console.log(`    ganan=${ganaE} estado=${fb} ${(pierdeE?.stderr ?? "").split("\n").slice(0, 3).join(" ")}`);
  }

  // 3. Registrar el último pago y anular a la vez: el pago queda siempre. La anulación, si llega antes, ve el pedido sin pagar completo y no
  //    hace nada; si llega después, ve su boleta recién nacida (puede estar viajando a Lucode) y tampoco hace nada: se anula unos minutos
  //    después. Lo único imposible: un pago perdido, una devolución sin anulación o una venta a medias.
  const [p1, p2] = await Promise.all([
    psqlAsync(sesion(`select retail.registrar_pago_pedido_web('${c}', ${faltaC}, 'efectivo') ->> 'estado_pedido';`)),
    psqlAsync(sesion(`select pg_sleep(0.05); select retail.anular_pedido_web_pagado('${c}', 'cliente_desistio') ->> 'estado';`)),
  ]);
  const fc = estadoDe(c);
  total++;
  const pagoOk = p1.code === 0;
  const anuloOk = p2.code === 0;
  const ok3 =
    pagoOk &&
    (anuloOk ? fc === "anulado/0.00/anulada/2/0" : /pedido_web_estado|pedido_web_boleta_enviandose/.test(p2.stderr) && fc === "pagado/" + fc.split("/")[1] + "/completada/0/0");
  const quien = anuloOk ? "anuló" : /pedido_web_estado/.test(p2.stderr) ? "la anulación llegó antes y no hizo nada" : "la anulación esperó a la boleta recién nacida";
  console.log(`${ok3 ? "✓" : "✗"} el último pago y anular a la vez: el pago queda y la anulación no deja nada a medias (${quien}) → ${fc}`);
  if (!ok3) {
    fallos++;
    console.log(`    pago=${p1.code} anular=${p2.code} estado=${fc} ${(p2.stderr || p1.stderr).split("\n").slice(0, 3).join(" ")}`);
  }
  return { total, fallos };
}

async function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  const hay = correr("select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('anular_pedido_web_pagado', 'fn_pedido_web_camino_boleta');");
  if (hay.salida !== "2") {
    console.error(`Faltan las funciones de anular un pedido pagado: aplica ${MIGRACIONES.join(", ")}.`);
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
  const actividad10 = DE_LA_ACTIVIDAD_10.map((f) => readFileSync(f, "utf8"));
  total++;
  const dosVeces = correr(`${PREPARAR_BASE}
${textos.join("\n")}
${textos.join("\n")}
${actividad10.join("\n")}
set local request.jwt.claim.sub = '${FELIPE}';
${pagado("a")}
select pg_temp.aceptada(:'a'), pg_temp.serie_nota(:'tru');
create function pg_temp.veces(p_firma text, p_texto text) returns integer language sql as $f$
  select (length(d) - length(replace(d, p_texto, ''))) / length(p_texto) from (select pg_get_functiondef(p_firma::regprocedure) d) x
$f$;
select concat_ws('|', ${anular("a")} ->> 'estado',
  pg_temp.veces('retail.fn_pedido_web_verificar(uuid)', 'anulado DESPUÉS de quedar pagado completo'),
  pg_temp.veces('retail.fn_pedido_web_verificar(uuid)', 'la venta no es la de sus prendas'),
  pg_temp.veces('retail.fn_pedido_web_reglas()', 'anulacion_token is distinct from'),
  pg_temp.veces('retail.fn_pedido_web_reglas()', 'entrega_token is distinct from'),
  pg_temp.veces('retail.fn_resolver_intento(text, uuid)', 'anular_pedido_web_pagado'),
  pg_temp.veces('retail.fn_pedido_web_detalle(uuid)', '''anulacion_boleta'''),
  pg_temp.veces('retail.fn_pedido_web_detalle(uuid)', '''entregado_por'''),
  pg_temp.veces('retail.fn_pedidos_web_de_clienta(uuid, integer, integer)', '''devuelto'''),
  pg_temp.veces('retail.fn_bal_stock(date)', 'anulado_web as ('),
  pg_temp.veces('retail.fn_bal_stock(date)', 'vendido_web as ('),
  ${VERIFICAR_YA} = '');
rollback;
`);
  const okDos = dosVeces.ok && dosVeces.salida.split("\n").pop() === "anulado|1|1|1|1|2|1|1|1|1|1|t";
  console.log(`${okDos ? "✓" : "✗"} las dos migraciones se pueden pegar dos veces, y las de la actividad 10 se pueden volver a pegar después: nada se duplica y anular sigue funcionando`);
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
