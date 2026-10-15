#!/usr/bin/env node
/**
 * El motor del pedido web (ADR-0408, base de las actividades 7, 8 y 9) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261014235000_pedidos_web_modelo.sql` y `20261015000000_pedidos_web_cobros.sql`:
 *   A. «Separar» crea el pedido por confirmar con su número, su total y su código, y NO toca el stock ni el libro.
 *   B. Confirmar reserva con el motor de Apartados: sube `cantidad_apartada`, nace su apartado, y Vender (`registrar_venta`)
 *      ya no puede vender esa unidad; primero el almacén (propuesta j); otra tienda, por conseguir con fecha o quitar; todo o nada.
 *   C. Dos piden la última: uno la reserva, el otro recibe «sin stock» y queda por conseguir, y se sabe quién separó antes.
 *   D. No confirmar no toca el stock; anular libera (y la reserva no se suelta desde Apartados).
 *   E. El cierre de las 24 h no toca lo confirmado; los avisos de 48 h y 7 días se calculan al leer.
 *   F. Cobrar: un pago nunca pasa el total (ni saltándose la función), el n.º de operación no se repite, el efectivo exige caja
 *      abierta y aparece en ella, el mismo aviso de la pasarela dos veces no duplica, y lo que no cabe queda por revisar.
 *   G. Permisos: sin el módulo no se confirma ni se cobra; las internas no las ejecuta nadie de afuera (ni `tienda_web`).
 *   H. Las transiciones y los estados imposibles los rechaza la base, aunque se escriba directo en las tablas.
 *   I. La migración se puede pegar dos veces.
 *   J. Una carrera de verdad: dos sesiones a la vez por la última unidad (la segunda espera a la primera; sin bloqueo mutuo).
 *   Y después de cada escenario que mueve prendas, el stock de las prendas de la prueba cuadra con `movimientos` (INV-01).
 *
 * CÓMO. Cada escenario corre en su transacción y termina en ROLLBACK: nunca se commitea nada en el Postgres local que
 * comparten los worktrees. Cada uno arma su propio piso de partida: un cliente «ZZ», dos prendas sin campaña que se venden en
 * Trujillo y Lima, y sus filas de piso y almacén vaciadas DENTRO de la transacción (con un «apartado» del libro, que mueve el
 * stock y el libro juntos) para dejar exactamente las unidades que cada caso necesita. Los errores esperados se prueban con
 * `pg_temp.probar` (corre la llamada y deshace todo lo que hizo, sea éxito o error) y se reconocen por su HINT, no por el texto.
 * Para el paso del tiempo (24 h, 48 h, 7 días), el escenario apaga SOLO en su transacción el disparador que protege las
 * fechas y las corre hacia atrás.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<modelo.sql>,<cobros.sql>` mete las migraciones dentro de cada transacción (que se
 * revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace el CI). La carrera (J) necesita las migraciones
 * aplicadas: dos sesiones que crean las mismas tablas a la vez se esperan en el catálogo, no en el stock.
 *
 * DA POR SENTADO: `Tienda Trujillo` y `Tienda Lima` con su piso y su almacén, al menos dos prendas activas sin campaña que se
 * venden en las dos, y a Felipe como líder y Micaela como integrante (el seed).
 *
 * USO
 *   pnpm pruebas:pedidos-web-motor    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:pedidos-web-motor -- --contenedor supabase_db_<mi-pila>   → contra una pila propia
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACIONES = [
  "supabase/migrations/20261014235000_pedidos_web_modelo.sql",
  "supabase/migrations/20261015000000_pedidos_web_cobros.sql",
];
const APLICAR_ANTES = process.env.APLICAR_ANTES
  ? process.env.APLICAR_ANTES.split(",").map((f) => readFileSync(f.trim(), "utf8")).join("\n")
  : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: ve todos los módulos y opera todas las tiendas
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo, sin el módulo «Pedidos web»

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

function psqlAsync(sql) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS_PSQL, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout, stderr, ms: Date.now() - inicio }));
    p.stdin.write(sql);
    p.stdin.end();
  });
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
// La ÚLTIMA línea de la salida es el veredicto del escenario.
function esperarValor(nombre, r, esperado) {
  const ultima = r.ok ? r.salida.split("\n").pop() : null;
  esperar(nombre, r.ok && ultima === esperado, r.ok ? `dio «${ultima}», se esperaba «${esperado}»` : r.mensaje);
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

// Piezas de la prueba: viven solo en esta transacción.
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
-- Lo mismo, pero lo hecho se QUEDA si sale bien (para dejar el pedido en un estado y seguir).
create function pg_temp.intentar(p_sql text) returns text language plpgsql as $f$
declare v_hint text; v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
  return 'error|' || coalesce(v_hint, '') || '|' || v_msg;
end $f$;
-- Deja n unidades más en una fila (una «entrada» del libro).
create function pg_temp.dejar(p_v uuid, p_u uuid, p_sub uuid, p_n integer) returns void language plpgsql as $f$
declare v_mov uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
    values (p_v, p_u, p_sub, 'entrada', p_n, 'prueba', 'prueba pedidos web: colchón') returning id into v_mov;
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
    insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
      values (p_v, p_u, r.sububicacion_id, 'apartado', r.libres, 'apartado', 'prueba pedidos web: piso de partida') returning id into v_mov;
    perform retail.fn_aplicar_movimiento(v_mov);
  end loop;
end $f$;
-- Lo libre de una prenda en un lugar (o en toda la tienda si p_sub es null y p_todo).
create function pg_temp.libres(p_v uuid, p_u uuid, p_sub uuid) returns integer language sql as $f$
  select coalesce(sum(cantidad - cantidad_apartada), 0)::integer from retail.stock
   where variante_id = p_v and ubicacion_id = p_u and sububicacion_id is not distinct from p_sub
$f$;
create function pg_temp.apartada(p_v uuid, p_u uuid) returns integer language sql as $f$
  select coalesce(sum(cantidad_apartada), 0)::integer from retail.stock where variante_id = p_v and ubicacion_id = p_u
$f$;
create function pg_temp.fisico(p_v uuid) returns integer language sql as $f$
  select coalesce(sum(cantidad), 0)::integer from retail.stock where variante_id = p_v
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
create function pg_temp.linea(p_pedido uuid, p_pos integer) returns uuid language sql as $f$
  select id from retail.pedido_web_lineas where pedido_id = p_pedido and posicion = p_pos
$f$;
-- Una caja abierta en la tienda (la que haya o una nueva).
create function pg_temp.caja(p_u uuid) returns uuid language plpgsql as $f$
declare v uuid;
begin
  select id into v from retail.cajas where ubicacion_id = p_u and estado = 'abierta';
  if v is null then
    v := retail.abrir_caja(p_u, 0, 'prueba pedidos web');
  end if;
  return v;
end $f$;
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
insert into retail.clientas (nombre, telefono_whatsapp) values ('ZZ Cliente prueba pedidos web', '999888777') returning id as cli \\gset
`;
const PREPARAR = preparar(APLICAR_ANTES);
// El stock de las dos prendas de la prueba sigue cuadrando con el libro (no apareció un descuadre NUEVO).
const CUADRA = `pg_temp.descuadre(:'v') = :'descuadre_v' and pg_temp.descuadre(:'v2') = :'descuadre_v2'`;

// Un pedido con las prendas dadas (una unidad por elemento), en Trujillo salvo que se diga otra cosa.
const separar = (alias, prendas = ["v"], ubic = "tru") => `
select (retail.crear_pedido_web(:'cli', :'${ubic}', jsonb_build_array(${prendas
  .map((p) => `jsonb_build_object('variante_id', :'${p}', 'precio_lista', :'p_${p}'::numeric)`)
  .join(", ")})) ->> 'pedido_id') as ${alias} \\gset
`;
const confirmarTodas = (alias, decision = "reservar") =>
  `select retail.confirmar_pedido_web(:'${alias}', pg_temp.todas(:'${alias}', '${decision}')) is not null as _c \\gset\n`;
// El paso del tiempo, solo en esta transacción: se vacían los controles diferidos pendientes (con eventos pendientes Postgres
// no deja tocar la tabla), se apagan los disparadores que protegen las fechas, se corren hacia atrás y se vuelve a lo normal.
const VIAJAR_EN_EL_TIEMPO = (sql) => `
set constraints all immediate;
alter table retail.pedidos_web disable trigger pedidos_web_reglas;
alter table retail.pedido_web_lineas disable trigger pedido_web_lineas_reglas;
${sql}
alter table retail.pedidos_web enable trigger pedidos_web_reglas;
alter table retail.pedido_web_lineas enable trigger pedido_web_lineas_reglas;
set constraints all deferred;
`;
const vender = (prenda = "v") =>
  `format('select retail.registrar_venta(%L, jsonb_build_array(jsonb_build_object(''variante_id'', %L, ''cantidad'', 1, ''precio_unitario'', %s)), jsonb_build_array(jsonb_build_object(''metodo'', ''efectivo'', ''monto'', %s)))', :'tru', :'${prenda}', :'p_${prenda}', :'p_${prenda}')`;
const hint = (llamada) => `split_part(pg_temp.probar(${llamada}), '|', 2)`;

function escenario(nombre, cuerpo, esperado) {
  esperarValor(nombre, correr(`${PREPARAR}${cuerpo}\nrollback;\n`), esperado);
}

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('crear_pedido_web', 'registrar_pago_pedido_web');");
    if (hay.salida !== "2") {
      console.error(`Faltan las funciones del pedido web: aplica ${MIGRACIONES.join(" y ")} o corre con APLICAR_ANTES=${MIGRACIONES.join(",")}`);
      process.exit(2);
    }
  }
  const prep = correr(`${PREPARAR}select coalesce(nullif(:'v', ''), 'sin prenda') || '|' || coalesce(nullif(:'v2', ''), 'sin prenda');\nrollback;\n`);
  if (!prep.ok) {
    console.error(`No se pudo armar el piso de partida (¿hay dos prendas activas sin campaña que se vendan en Trujillo y Lima?):\n${prep.mensaje}`);
    process.exit(2);
  }

  // ===================================================================================================================
  console.log("— A. «Separar» —");
  escenario(
    "separar crea el pedido por confirmar (W-…, total, código de 4 cifras) y NO toca el stock ni el libro",
    `select pg_temp.fisico(:'v') + pg_temp.fisico(:'v2') as fis, pg_temp.apartada(:'v', :'tru') + pg_temp.apartada(:'v2', :'tru') as apa,
            (select count(*) from retail.movimientos where variante_id in (:'v', :'v2')) as movs \\gset
${separar("a", ["v", "v2"])}
select w.estado = 'por_confirmar' and w.codigo ~ '^W-[0-9]{4,}$' and w.total = :'p_v'::numeric + :'p_v2'::numeric and w.pagado = 0
       and w.codigo_recojo ~ '^[1-9][0-9]{3}$'
       and (select count(*) from retail.pedido_web_lineas l where l.pedido_id = w.id and l.estado = 'pendiente' and l.apartado_id is null) = 2
       and pg_temp.fisico(:'v') + pg_temp.fisico(:'v2') = :'fis'::integer
       and pg_temp.apartada(:'v', :'tru') + pg_temp.apartada(:'v2', :'tru') = :'apa'::integer
       and (select count(*) from retail.movimientos where variante_id in (:'v', :'v2')) = :'movs'::bigint
       and ${CUADRA}
  from retail.pedidos_web w where w.id = :'a';`,
    "t",
  );
  escenario(
    "dos veces «Separar» con la misma marca devuelven el MISMO pedido (doble toque)",
    `select gen_random_uuid() as tok \\gset
select retail.crear_pedido_web(:'cli', :'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v', 'precio_lista', :'p_v'::numeric)), :'tok') ->> 'pedido_id' as a1 \\gset
select retail.crear_pedido_web(:'cli', :'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v', 'precio_lista', :'p_v'::numeric)), :'tok') ->> 'pedido_id' as a2 \\gset
select :'a1' = :'a2' and (select count(*) from retail.pedidos_web where token_cliente = :'tok') = 1;`,
    "t",
  );
  escenario(
    "una bolsa vacía, una prenda que no existe, un precio NaN, cero o con tres decimales, o un descuento sin campaña no se separan",
    `select string_agg(${hint("x.llamada")}, ',' order by x.n) from (values
  (1, format('select retail.crear_pedido_web(%L, %L, %L)', :'cli', :'tru', '[]')),
  (2, format('select retail.crear_pedido_web(%L, %L, %L)', :'cli', :'tru', jsonb_build_array(jsonb_build_object('variante_id', gen_random_uuid(), 'precio_lista', 10)))),
  (3, format('select retail.crear_pedido_web(%L, %L, %L)', :'cli', :'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v', 'precio_lista', 'NaN')))),
  (4, format('select retail.crear_pedido_web(%L, %L, %L)', :'cli', :'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v', 'precio_lista', 0)))),
  (5, format('select retail.crear_pedido_web(%L, %L, %L)', :'cli', :'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v', 'precio_lista', 10.001)))),
  (6, format('select retail.crear_pedido_web(%L, %L, %L)', :'cli', :'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v', 'precio_lista', 50, 'descuento', 5)))),
  (7, format('select retail.crear_pedido_web(%L, %L, %L)', :'cli', :'tru', jsonb_build_array(jsonb_build_object('variante_id', 'no-es-un-id', 'precio_lista', 50)))),
  (8, format('select retail.crear_pedido_web(%L, %L, %L)', gen_random_uuid(), :'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v', 'precio_lista', 50))))
) x(n, llamada);`,
    "pedido_web_bolsa_vacia,pedido_web_linea_invalida,pedido_web_linea_invalida,pedido_web_linea_invalida,pedido_web_linea_invalida,pedido_web_linea_invalida,pedido_web_linea_invalida,pedido_web_clienta",
  );
  escenario(
    "un pedido no se guarda sin prendas (la base lo revisa al confirmar la transacción)",
    `insert into retail.pedidos_web (clienta_id, ubicacion_id) values (:'cli', :'tru');
select ${hint("'set constraints all immediate'")};`,
    "pedido_web_incoherente",
  );

  // ===================================================================================================================
  console.log("— B. Confirmar y reservar —");
  escenario(
    "confirmar reserva: sube cantidad_apartada, el stock físico no cambia, nace su apartado sin fecha, y Vender ya no puede vender esa unidad",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
select pg_temp.caja(:'tru') as caja \\gset
select pg_temp.probar(${vender()}) as antes \\gset
select pg_temp.apartada(:'v', :'tru') as apa, pg_temp.fisico(:'v') as fis, (select count(*) from retail.movimientos where variante_id = :'v' and tipo = 'apartado') as movs \\gset
${separar("a")}
${confirmarTodas("a")}
select :'antes' = 'ok'
   and pg_temp.apartada(:'v', :'tru') = :'apa'::integer + 1 and pg_temp.fisico(:'v') = :'fis'::integer
   and (select count(*) from retail.movimientos where variante_id = :'v' and tipo = 'apartado') = :'movs'::bigint + 1
   and (select a.estado = 'abierto' and a.vence_el is null and a.cantidad = 1 and a.sububicacion_id = :'tru_piso'
          from retail.apartados a join retail.pedido_web_lineas l on l.apartado_id = a.id where l.pedido_id = :'a')
   and (select estado from retail.pedidos_web where id = :'a') = 'confirmado'
   and pg_temp.probar(${vender()}) like 'error|%Stock insuficiente%'
   and ${CUADRA};`,
    "t",
  );
  escenario(
    "la reserva lleva el número del pedido, nunca el nombre ni el celular del cliente (sobrevivirían a la ficha anonimizada)",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1), pg_temp.dejar(:'v2', :'lim', :'lim_alm', 1);
${separar("a", ["v", "v2"])}
select retail.confirmar_pedido_web(:'a', jsonb_build_array(
  jsonb_build_object('linea_id', pg_temp.linea(:'a', 1), 'decision', 'reservar'),
  jsonb_build_object('linea_id', pg_temp.linea(:'a', 2), 'decision', 'reservar', 'ubicacion_id', :'lim'))) is not null as _c \\gset
select string_agg(a.clienta_nombre || ' / ' || a.clienta_contacto, ' ; ' order by l.posicion) = (select 'Pedido web ' || codigo || ' / Pedidos web ; Pedido web ' || codigo || ' para Tienda Trujillo / Tienda Trujillo' from retail.pedidos_web where id = :'a')
   and bool_and(a.clienta_nombre || a.clienta_contacto || coalesce(a.nota, '') !~ '(ZZ Cliente|999888777)')
  from retail.pedido_web_lineas l join retail.apartados a on a.id = l.apartado_id where l.pedido_id = :'a';`,
    "t",
  );
  escenario(
    "primero el almacén (propuesta j): con una en el almacén y otra en el piso, la reserva sale del almacén y la del piso se sigue vendiendo",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1), pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
select pg_temp.caja(:'tru') as caja \\gset
${separar("a")}
${confirmarTodas("a")}
select (retail.fn_pedido_web(:'a') -> 'lineas' -> 0 ->> 'lugar') = 'almacen'
   and pg_temp.libres(:'v', :'tru', :'tru_alm') = 0 and pg_temp.libres(:'v', :'tru', :'tru_piso') = 1
   and pg_temp.probar(${vender()}) = 'ok'
   and ${CUADRA};`,
    "t",
  );
  escenario(
    "dos prendas iguales en un pedido: la primera sale del almacén y la segunda del piso",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1), pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a", ["v", "v"])}
${confirmarTodas("a")}
select string_agg(x ->> 'lugar', ',' order by (x ->> 'posicion')::integer) from jsonb_array_elements(retail.fn_pedido_web(:'a') -> 'lineas') x;`,
    "almacen,piso",
  );
  escenario(
    "con el lugar elegido, la reserva sale de ahí aunque el almacén tenga",
    `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1), pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
select retail.confirmar_pedido_web(:'a', jsonb_build_array(jsonb_build_object('linea_id', pg_temp.linea(:'a', 1), 'decision', 'reservar', 'sububicacion_id', :'tru_piso'))) is not null as _c \\gset
select (retail.fn_pedido_web(:'a') -> 'lineas' -> 0 ->> 'lugar') || '|' || pg_temp.libres(:'v', :'tru', :'tru_alm');`,
    "piso|1",
  );
  escenario(
    "de otra tienda: la reserva vive donde está la prenda, la línea dice de dónde y las lecturas la marcan «por traer»",
    `select pg_temp.dejar(:'v', :'lim', :'lim_alm', 1);
select pg_temp.apartada(:'v', :'lim') as apa \\gset
${separar("a")}
select retail.confirmar_pedido_web(:'a', jsonb_build_array(jsonb_build_object('linea_id', pg_temp.linea(:'a', 1), 'decision', 'reservar', 'ubicacion_id', :'lim'))) is not null as _c \\gset
select pg_temp.apartada(:'v', :'lim') = :'apa'::integer + 1
   and (select ubicacion_id from retail.pedido_web_lineas where pedido_id = :'a') = :'lim'::uuid
   and (retail.fn_pedido_web(:'a') -> 'lineas' -> 0 ->> 'por_traer')::boolean
   and (select por_traer from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a') = 1
   and (retail.fn_pedidos_web_de_clienta(:'cli') -> 0 -> 'lineas' -> 0 ->> 'viene_de') = 'Tienda Lima'
   and ${CUADRA};`,
    "t",
  );
  escenario(
    "por conseguir con fecha: sin reserva y sin tocar el stock; cuando llega, se reserva",
    `select pg_temp.apartada(:'v', :'tru') as apa \\gset
${separar("a")}
${confirmarTodas("a", "por_conseguir")}
select (select estado || '|' || (fecha_compromiso = retail.fn_hoy_lima() + 7)::text || '|' || (apartado_id is null)::text
          from retail.pedido_web_lineas where pedido_id = :'a') as antes, pg_temp.apartada(:'v', :'tru') = :'apa'::integer as sin_tocar \\gset
select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
select retail.reservar_linea_pedido_web(pg_temp.linea(:'a', 1)) is not null as _r \\gset
select :'antes' = 'por_conseguir|true|true' and :'sin_tocar'::boolean
   and (select estado from retail.pedido_web_lineas where pedido_id = :'a') = 'reservada'
   and (select fecha_compromiso from retail.pedido_web_lineas where pedido_id = :'a') = retail.fn_hoy_lima() + 7
   and pg_temp.apartada(:'v', :'tru') = :'apa'::integer + 1
   and ${CUADRA};`,
    "t",
  );
  escenario(
    "quitar (sin stock): la prenda sale del pedido y de su total",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a", ["v", "v2"])}
select retail.confirmar_pedido_web(:'a', jsonb_build_array(
  jsonb_build_object('linea_id', pg_temp.linea(:'a', 1), 'decision', 'reservar'),
  jsonb_build_object('linea_id', pg_temp.linea(:'a', 2), 'decision', 'quitar'))) is not null as _c \\gset
select (total = :'p_v'::numeric)::text || '|' || (select string_agg(estado, ',' order by posicion) from retail.pedido_web_lineas where pedido_id = :'a')
  from retail.pedidos_web where id = :'a';`,
    "true|reservada,quitada",
  );
  escenario(
    "si se quitan todas, no se confirma (se cierra con «No se puede confirmar»)",
    `${separar("a")}
select ${hint(`format('select retail.confirmar_pedido_web(%L, %L)', :'a', pg_temp.todas(:'a', 'quitar'))`)};`,
    "pedido_web_sin_prendas",
  );
  escenario(
    "las decisiones: si falta una, sobra una de otro pedido, se repite, viene mal escrita, o la fecha no sirve, no se confirma nada",
    `${separar("a", ["v", "v2"])}
${separar("b")}
select string_agg(${hint("x.llamada")}, ',' order by x.n) from (values
  (1, format('select retail.confirmar_pedido_web(%L, %L)', :'a', jsonb_build_array(jsonb_build_object('linea_id', pg_temp.linea(:'a', 1), 'decision', 'quitar')))),
  (2, format('select retail.confirmar_pedido_web(%L, %L)', :'a', pg_temp.todas(:'a', 'quitar') || jsonb_build_array(jsonb_build_object('linea_id', pg_temp.linea(:'b', 1), 'decision', 'quitar')))),
  (3, format('select retail.confirmar_pedido_web(%L, %L)', :'a', pg_temp.todas(:'a', 'quitar') || jsonb_build_array(jsonb_build_object('linea_id', pg_temp.linea(:'a', 1), 'decision', 'quitar')))),
  (4, format('select retail.confirmar_pedido_web(%L, %L)', :'a', jsonb_build_array(jsonb_build_object('linea_id', 'x', 'decision', 'quitar')))),
  (5, format('select retail.confirmar_pedido_web(%L, %L)', :'a', jsonb_build_array(jsonb_build_object('linea_id', pg_temp.linea(:'a', 1), 'decision', 'regalar'), jsonb_build_object('linea_id', pg_temp.linea(:'a', 2), 'decision', 'quitar')))),
  (6, format('select retail.confirmar_pedido_web(%L, %L)', :'a', jsonb_build_array(jsonb_build_object('linea_id', pg_temp.linea(:'a', 1), 'decision', 'por_conseguir', 'fecha', retail.fn_hoy_lima() - 1), jsonb_build_object('linea_id', pg_temp.linea(:'a', 2), 'decision', 'quitar'))))
) x(n, llamada);`,
    "pedido_web_decisiones,pedido_web_decisiones,pedido_web_decisiones,pedido_web_decisiones,pedido_web_decisiones,pedido_web_fecha",
  );
  escenario(
    "confirmar es todo o nada: si una prenda ya no está libre, no queda ninguna reservada y el error dice cuál",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a", ["v", "v2"])}
select pg_temp.apartada(:'v', :'tru') as apa \\gset
select pg_temp.intentar(format('select retail.confirmar_pedido_web(%L, %L)', :'a', pg_temp.todas(:'a', 'reservar'))) as r \\gset
select split_part(:'r', '|', 2) = 'pedido_web_sin_stock'
   and pg_temp.apartada(:'v', :'tru') = :'apa'::integer
   and (select estado from retail.pedidos_web where id = :'a') = 'por_confirmar'
   and not exists (select 1 from retail.pedido_web_lineas where pedido_id = :'a' and estado <> 'pendiente');`,
    "t",
  );
  escenario(
    "no se confirma dos veces, ni un pedido cerrado",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${confirmarTodas("a")}
${separar("b")}
select retail.no_confirmar_pedido_web(:'b', 'cliente_desistio') is not null as _n \\gset
select ${hint(`format('select retail.confirmar_pedido_web(%L, %L)', :'a', pg_temp.todas(:'a', 'reservar'))`)} || ',' ||
       ${hint(`format('select retail.confirmar_pedido_web(%L, %L)', :'b', pg_temp.todas(:'b', 'quitar'))`)};`,
    "pedido_web_estado,pedido_web_estado",
  );

  // ===================================================================================================================
  console.log("— C. Dos piden la última —");
  escenario(
    "dos pedidos por la última: el primero la reserva, el segundo recibe «sin stock» con su línea, queda por conseguir, y se sabe quién separó antes",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${separar("b")}
select (retail.fn_pedido_web(:'b') -> 'lineas' -> 0 -> 'compiten') as comp_b, (retail.fn_pedido_web(:'a') -> 'lineas' -> 0 -> 'compiten') as comp_a \\gset
${confirmarTodas("a")}
select pg_temp.intentar(format('select retail.confirmar_pedido_web(%L, %L)', :'b', pg_temp.todas(:'b', 'reservar'))) as rb \\gset
${confirmarTodas("b", "por_conseguir")}
select (:'comp_b'::jsonb -> 0 ->> 'pedido_id') = :'a' and (:'comp_b'::jsonb -> 0 ->> 'separo_antes')::boolean
   and (:'comp_a'::jsonb -> 0 ->> 'pedido_id') = :'b' and not (:'comp_a'::jsonb -> 0 ->> 'separo_antes')::boolean
   and (select numero from retail.pedidos_web where id = :'a') < (select numero from retail.pedidos_web where id = :'b')
   and split_part(:'rb', '|', 2) = 'pedido_web_sin_stock'
   and (select estado from retail.pedido_web_lineas where pedido_id = :'a') = 'reservada'
   and (select estado from retail.pedido_web_lineas where pedido_id = :'b') = 'por_conseguir'
   and pg_temp.libres(:'v', :'tru', :'tru_piso') = 0
   and ${CUADRA};`,
    "t",
  );

  // ===================================================================================================================
  console.log("— D. No confirmar y anular —");
  escenario(
    "no confirmar: se cierra con su motivo y quién, y el stock no cambia (nunca bajó)",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
select pg_temp.apartada(:'v', :'tru') as apa \\gset
${separar("a")}
select retail.no_confirmar_pedido_web(:'a', 'sin_stock') is not null as _n \\gset
select estado = 'anulado' and cierre_motivo = 'sin_stock' and cerrado_por is not null and confirmado_en is null
   and pg_temp.apartada(:'v', :'tru') = :'apa'::integer
  from retail.pedidos_web where id = :'a';`,
    "t",
  );
  escenario(
    "anular libera: vuelve lo reservado (en su tienda y en la otra), su apartado se cierra, el libro anota la liberación",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1), pg_temp.dejar(:'v2', :'lim', :'lim_alm', 1);
select pg_temp.apartada(:'v', :'tru') as apa_t, pg_temp.apartada(:'v2', :'lim') as apa_l,
       (select count(*) from retail.movimientos where variante_id in (:'v', :'v2') and tipo = 'liberacion_apartado') as libs \\gset
${separar("a", ["v", "v2"])}
select retail.confirmar_pedido_web(:'a', jsonb_build_array(
  jsonb_build_object('linea_id', pg_temp.linea(:'a', 1), 'decision', 'reservar'),
  jsonb_build_object('linea_id', pg_temp.linea(:'a', 2), 'decision', 'reservar', 'ubicacion_id', :'lim'))) is not null as _c \\gset
select retail.anular_pedido_web(:'a', 'cliente_desistio') is not null as _x \\gset
select (select estado || '|' || cierre_motivo from retail.pedidos_web where id = :'a') = 'anulado|cliente_desistio'
   and (select string_agg(l.estado || '/' || a.estado, ',' order by l.posicion) from retail.pedido_web_lineas l join retail.apartados a on a.id = l.apartado_id where l.pedido_id = :'a') = 'liberada/liberado,liberada/liberado'
   and pg_temp.apartada(:'v', :'tru') = :'apa_t'::integer and pg_temp.apartada(:'v2', :'lim') = :'apa_l'::integer
   and (select count(*) from retail.movimientos where variante_id in (:'v', :'v2') and tipo = 'liberacion_apartado') = :'libs'::bigint + 2
   and ${CUADRA};`,
    "t",
  );
  escenario(
    "anular con un pago: el pedido se anula, lo pagado queda «por devolver» y se devuelve anulando el pago",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${confirmarTodas("a")}
select retail.registrar_pago_pedido_web(:'a', 10, 'yape', '04812793') ->> 'pago_id' as pago \\gset
select retail.anular_pedido_web(:'a', 'cliente_no_pago') is not null as _x \\gset
select (select pagado from retail.pedidos_web where id = :'a') as antes \\gset
select retail.anular_pago_pedido_web(:'pago', 'devuelto_al_cliente') is not null as _y \\gset
select :'antes'::numeric = 10 and (select pagado = 0 and estado = 'anulado' from retail.pedidos_web where id = :'a');`,
    "t",
  );
  escenario(
    "un pedido pagado completo no se anula (su boleta ya sale), y uno por confirmar se cierra con «No se puede confirmar»",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${confirmarTodas("a")}
select retail.registrar_pago_pedido_web(:'a', :'p_v'::numeric, 'plin', '03712280') is not null as _p \\gset
${separar("b")}
select ${hint(`format('select retail.anular_pedido_web(%L, %L)', :'a', 'cliente_desistio')`)} || ',' ||
       ${hint(`format('select retail.anular_pedido_web(%L, %L)', :'b', 'cliente_desistio')`)} || ',' ||
       ${hint(`format('select retail.no_confirmar_pedido_web(%L, %L)', :'b', 'porque_si')`)} || ',' ||
       ${hint(`format('select retail.anular_pedido_web(%L, %L)', :'a', 'cliente_no_pago')`)};`,
    "pedido_web_estado,pedido_web_estado,pedido_web_motivo,pedido_web_estado",
  );
  escenario(
    "la reserva de un pedido web no se suelta desde Apartados (ni con liberar_apartado ni escribiendo en la tabla)",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${confirmarTodas("a")}
select apartado_id as ap from retail.pedido_web_lineas where pedido_id = :'a' \\gset
select ${hint(`format('select retail.liberar_apartado(%L, %L)', :'ap', 'otro')`)} || ',' ||
       ${hint(`format('update retail.apartados set estado = %L, cerrado_en = now(), cierre_motivo = %L, movimiento_cierre_id = movimiento_id where id = %L', 'liberado', 'otro', :'ap')`)} || ',' ||
       ${hint(`format('update retail.apartados set sububicacion_id = %L where id = %L', :'tru_alm', :'ap')`)};`,
    "apartado_de_pedido_web,apartado_de_pedido_web,apartado_de_pedido_web",
  );

  // ===================================================================================================================
  console.log("— E. Plazos —");
  escenario(
    "el cierre de las 24 h cierra lo que nadie confirmó y no toca lo confirmado ni lo reciente; antes del cierre ya se lee vencido y no se confirma",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("viejo")}
${separar("b")}
${separar("nuevo", ["v2"])}
${VIAJAR_EN_EL_TIEMPO(`update retail.pedidos_web set creado_en = now() - interval '25 hours' where id in (:'viejo', :'b');`)}
select retail.confirmar_pedido_web(:'b', pg_temp.todas(:'b', 'reservar'), 48) is not null as _c \\gset
select pg_temp.apartada(:'v', :'tru') as apa \\gset
select (select estado from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'viejo') as leido,
       ${hint(`format('select retail.confirmar_pedido_web(%L, %L)', :'viejo', pg_temp.todas(:'viejo', 'quitar'))`)} as conf \\gset
select retail.fn_cerrar_pedidos_web_vencidos() as n1 \\gset
select retail.fn_cerrar_pedidos_web_vencidos() as n2 \\gset
select :'leido' = 'vencido' and :'conf' = 'pedido_web_vencido' and :'n1'::integer >= 1
   and (select count(*) from retail.pedidos_web where id = :'viejo' and estado = 'vencido' and cierre_motivo = 'sin_confirmar' and cerrado_por is null) = 1
   and (select estado from retail.pedidos_web where id = :'b') = 'confirmado'
   and (select estado from retail.pedidos_web where id = :'nuevo') = 'por_confirmar'
   and pg_temp.apartada(:'v', :'tru') = :'apa'::integer
   and :'n2'::integer = 0;`,
    "t",
  );
  escenario(
    "los avisos se calculan al leer: confirmado sin pagar a las 48 h; pagado, listo y sin recoger a los 7 días (con el código a la vista)",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1), pg_temp.dejar(:'v2', :'tru', :'tru_piso', 1);
${separar("a")}
${confirmarTodas("a")}
${separar("b", ["v2"])}
${confirmarTodas("b")}
select retail.registrar_pago_pedido_web(:'b', :'p_v2'::numeric, 'yape', '05120448') is not null as _p \\gset
select (retail.fn_pedidos_web_de_clienta(:'cli') -> 0 ->> 'codigo_recojo') as cod_b, (select codigo_recojo from retail.pedidos_web where id = :'b') as real_b,
       (select sin_pagar from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a') as sp_hoy,
       (select sin_recoger from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'b') as sr_hoy \\gset
${VIAJAR_EN_EL_TIEMPO(`
update retail.pedidos_web set creado_en = creado_en - interval '9 days', confirmado_en = confirmado_en - interval '49 hours' where id = :'a';
update retail.pedidos_web set creado_en = creado_en - interval '9 days', confirmado_en = confirmado_en - interval '9 days', pagado_en = pagado_en - interval '8 days' where id = :'b';
update retail.pedido_web_lineas set reservada_en = reservada_en - interval '9 days' where pedido_id = :'b';`)}
select :'cod_b' = :'real_b' and not :'sp_hoy'::boolean and not :'sr_hoy'::boolean
   and (select sin_pagar from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a')
   and not (select sin_pagar from retail.fn_pedidos_web_sede(:'tru', 24, 72) where pedido_id = :'a')
   and (select listo_para_recoger and sin_recoger from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'b')
   and not (select sin_recoger from retail.fn_pedidos_web_sede(:'tru', 24, 48, 10) where pedido_id = :'b')
   and (retail.fn_pedido_web(:'a') ->> 'sin_pagar')::boolean
   and (select (x ->> 'codigo_recojo') is null from jsonb_array_elements(retail.fn_pedidos_web_de_clienta(:'cli')) x where x ->> 'pedido_id' = :'a');`,
    "t",
  );
  escenario(
    "con una prenda por conseguir, un pedido pagado no está listo para recoger (ni corre su plazo)",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a", ["v", "v2"])}
select retail.confirmar_pedido_web(:'a', jsonb_build_array(
  jsonb_build_object('linea_id', pg_temp.linea(:'a', 1), 'decision', 'reservar'),
  jsonb_build_object('linea_id', pg_temp.linea(:'a', 2), 'decision', 'por_conseguir', 'fecha', retail.fn_hoy_lima() + 3))) is not null as _c \\gset
select retail.registrar_pago_pedido_web(:'a', (select total from retail.pedidos_web where id = :'a'), 'transferencia', '039900211') is not null as _p \\gset
select (select estado from retail.pedidos_web where id = :'a') || '|' || (select (listo_para_recoger or sin_recoger)::text from retail.fn_pedidos_web_sede(:'tru') where pedido_id = :'a')
       || '|' || coalesce(retail.fn_pedidos_web_de_clienta(:'cli') -> 0 ->> 'codigo_recojo', 'sin código');`,
    "pagado|false|sin código",
  );
  escenario(
    "los plazos fuera de rango se rechazan (los mismos topes que Configuración ▸ Tienda web)",
    `select ${hint("'select retail.fn_cerrar_pedidos_web_vencidos(0)'")} || ',' || ${hint("format('select * from retail.fn_pedidos_web_sede(%L, 24, 721)', :'tru')")};`,
    "pedido_web_plazo,pedido_web_plazo",
  );

  // ===================================================================================================================
  console.log("— F. Cobrar —");
  escenario(
    "un pago nunca pasa el total: la función lo dice, y la base lo impide aunque alguien se salte la función",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${confirmarTodas("a")}
select retail.registrar_pago_pedido_web(:'a', 10, 'yape', '11112222') is not null as _p \\gset
select ${hint(`format('select retail.registrar_pago_pedido_web(%L, %s, %L, %L)', :'a', :'p_v'::numeric, 'yape', '11113333')`)} as f \\gset
select pg_temp.probar(format('insert into retail.pedido_web_pagos (pedido_id, origen, medio, monto, estado, numero_operacion, registrado_por) values (%L, %L, %L, %s, %L, %L, (select id from public.personas where auth_user_id = %L))',
  :'a', 'tienda', 'yape', :'p_v'::numeric, 'aprobado', '11114444', '${FELIPE}')) as d \\gset
select :'f' = 'pedido_web_pasa_el_total' and :'d' like 'error|%pedidos_web_pagado_en_rango%'
   and (select pagado from retail.pedidos_web where id = :'a') = 10;`,
    "t",
  );
  escenario(
    "pagos parciales hasta el total: el pedido pasa solo a «pagado» y ya no se cobra más",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${confirmarTodas("a")}
select retail.registrar_pago_pedido_web(:'a', 10, 'yape', '22221111') ->> 'estado_pedido' as e1 \\gset
select retail.registrar_pago_pedido_web(:'a', :'p_v'::numeric - 10, 'plin', '22223333') ->> 'estado_pedido' as e2 \\gset
select :'e1' || ',' || :'e2' || ',' || (select (pagado = total and pagado_en is not null)::text from retail.pedidos_web where id = :'a')
       || ',' || ${hint(`format('select retail.registrar_pago_pedido_web(%L, 1, %L, %L)', :'a', 'yape', '22224444')`)};`,
    "confirmado,pagado,true,pedido_web_no_cobrable",
  );
  escenario(
    "el mismo n.º de operación dos veces se rechaza (aunque sea en otro pedido y con espacios); anulado, se puede volver a anotar",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1), pg_temp.dejar(:'v2', :'tru', :'tru_piso', 1);
${separar("a")}
${confirmarTodas("a")}
${separar("b", ["v2"])}
${confirmarTodas("b")}
select retail.registrar_pago_pedido_web(:'a', 5, 'yape', '04812793') ->> 'pago_id' as pago \\gset
select ${hint(`format('select retail.registrar_pago_pedido_web(%L, 5, %L, %L)', :'a', 'yape', '04812793')`)} || ',' ||
       ${hint(`format('select retail.registrar_pago_pedido_web(%L, 5, %L, %L)', :'b', 'transferencia', '0481 2793')`)} as dobles \\gset
select retail.anular_pago_pedido_web(:'pago', 'error_al_anotar') is not null as _x \\gset
select :'dobles' || ',' || pg_temp.probar(format('select retail.registrar_pago_pedido_web(%L, 5, %L, %L)', :'b', 'yape', '04812793'))
       || ',' || ${hint(`format('select retail.registrar_pago_pedido_web(%L, 5, %L, %L)', :'b', 'yape', '12345')`)};`,
    "pedido_web_operacion_repetida,pedido_web_operacion_repetida,ok,pedido_web_operacion",
  );
  escenario(
    "el efectivo exige caja abierta y aparece en ella: el esperado sube lo cobrado; anularlo lo saca; sin caja no se cobra",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
select pg_temp.caja(:'tru') as caja \\gset
${separar("a")}
${confirmarTodas("a")}
select (select esperado from retail.fn_calcular_esperado_caja(:'caja')) as esp0 \\gset
select retail.registrar_pago_pedido_web(:'a', 20, 'efectivo') ->> 'pago_id' as pago \\gset
select (select esperado from retail.fn_calcular_esperado_caja(:'caja')) as esp1,
       (select cm.caja_id = :'caja'::uuid and cm.tipo = 'ingreso' and cm.monto = 20 from retail.pedido_web_pagos g join retail.caja_movimientos cm on cm.id = g.caja_movimiento_id where g.id = :'pago') as en_caja \\gset
select retail.anular_pago_pedido_web(:'pago', 'devuelto_al_cliente') is not null as _x \\gset
select (select esperado from retail.fn_calcular_esperado_caja(:'caja')) as esp2 \\gset
select retail.cerrar_caja(:'caja', (select esperado from retail.fn_calcular_esperado_caja(:'caja'))) is not null as _cc \\gset
select ${hint(`format('select retail.registrar_pago_pedido_web(%L, 20, %L)', :'a', 'efectivo')`)} as sin_caja \\gset
select :'esp1'::numeric = :'esp0'::numeric + 20 and :'en_caja'::boolean and :'esp2'::numeric = :'esp0'::numeric
   and :'sin_caja' = 'pedido_web_sin_caja' and ${hint(`format('select retail.registrar_pago_pedido_web(%L, 20, %L, %L)', :'a', 'efectivo', '123456')`)} = 'pedido_web_operacion';`,
    "t",
  );
  escenario(
    "doble clic al anotar: la misma marca devuelve el MISMO pago y suma una sola vez",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${confirmarTodas("a")}
select gen_random_uuid() as tok \\gset
select retail.registrar_pago_pedido_web(:'a', 7, 'yape', '33330001', :'tok') ->> 'pago_id' as p1 \\gset
select retail.registrar_pago_pedido_web(:'a', 7, 'yape', '33330001', :'tok') ->> 'pago_id' as p2 \\gset
select :'p1' = :'p2' and (select pagado from retail.pedidos_web where id = :'a') = 7 and (select count(*) from retail.pedido_web_pagos where pedido_id = :'a') = 1;`,
    "t",
  );
  escenario(
    "no se cobra un pedido sin confirmar, ni uno vencido o anulado; un monto NaN, negativo o con tres decimales, o un medio inventado tampoco",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${separar("b")}
select retail.no_confirmar_pedido_web(:'b', 'cliente_no_respondio') is not null as _n \\gset
${separar("c", ["v2"])}
${confirmarTodas("c", "por_conseguir")}
select string_agg(${hint("x.llamada")}, ',' order by x.n) from (values
  (1, format('select retail.registrar_pago_pedido_web(%L, 5, %L, %L)', :'a', 'yape', '44440001')),
  (2, format('select retail.registrar_pago_pedido_web(%L, 5, %L, %L)', :'b', 'yape', '44440002')),
  (3, format('select retail.registrar_pago_pedido_web(%L, %L, %L, %L)', :'c', 'NaN', 'yape', '44440003')),
  (4, format('select retail.registrar_pago_pedido_web(%L, -5, %L, %L)', :'c', 'yape', '44440004')),
  (5, format('select retail.registrar_pago_pedido_web(%L, 5.001, %L, %L)', :'c', 'yape', '44440005')),
  (6, format('select retail.registrar_pago_pedido_web(%L, 5, %L, %L)', :'c', 'tarjeta', '44440006'))
) x(n, llamada);`,
    "pedido_web_no_cobrable,pedido_web_no_cobrable,pedido_web_monto,pedido_web_monto,pedido_web_monto,pedido_web_medio",
  );
  escenario(
    "pasarela: el mismo aviso dos veces no duplica; pendiente → aprobado; un aviso viejo no hace retroceder; lo que no cabe queda por revisar (ok=false)",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${confirmarTodas("a")}
select retail.fn_registrar_aviso_pasarela_pedido_web(:'a', 'culqi', 'chr_1', 'aprobado', 10) as r1 \\gset
select retail.fn_registrar_aviso_pasarela_pedido_web(:'a', 'culqi', 'chr_1', 'aprobado', 10) as r2 \\gset
select retail.fn_registrar_aviso_pasarela_pedido_web(:'a', 'izipay', 'ord_2', 'pendiente', 5) as r3 \\gset
select retail.fn_registrar_aviso_pasarela_pedido_web(:'a', 'izipay', 'ord_2', 'aprobado', 5) as r4 \\gset
select retail.fn_registrar_aviso_pasarela_pedido_web(:'a', 'izipay', 'ord_2', 'pendiente', 5) as r5 \\gset
select retail.fn_registrar_aviso_pasarela_pedido_web(:'a', 'culqi', 'chr_3', 'aprobado', :'p_v'::numeric) as r6 \\gset
select (:'r1'::jsonb ->> 'ok')::boolean and (:'r2'::jsonb ->> 'repetido')::boolean and (:'r1'::jsonb ->> 'pago_id') = (:'r2'::jsonb ->> 'pago_id')
   and (:'r3'::jsonb ->> 'estado_pago') = 'pendiente' and (:'r4'::jsonb ->> 'estado_pago') = 'aprobado'
   and not (:'r5'::jsonb ->> 'ok')::boolean and (:'r5'::jsonb ->> 'motivo') = 'aviso_no_aplica' and (:'r5'::jsonb ->> 'estado_pago') = 'aprobado'
   and not (:'r6'::jsonb ->> 'ok')::boolean and (:'r6'::jsonb ->> 'estado_pago') = 'por_revisar' and (:'r6'::jsonb ->> 'motivo') = 'pedido_no_lo_admite'
   and (select pagado from retail.pedidos_web where id = :'a') = 15
   and (select count(*) from retail.pedido_web_pagos where pedido_id = :'a') = 3
   and ${hint(`format('select retail.fn_registrar_aviso_pasarela_pedido_web(%L, %L, %L, %L, 99)', :'a', 'culqi', 'chr_1', 'aprobado')`)} = 'pasarela_aviso_no_coincide';`,
    "t",
  );
  escenario(
    "pasarela: un cobro sobre un pedido anulado no se pierde ni suma: queda por revisar con su explicación",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${confirmarTodas("a")}
select retail.anular_pedido_web(:'a', 'cliente_desistio') is not null as _x \\gset
select retail.fn_registrar_aviso_pasarela_pedido_web(:'a', 'culqi', 'chr_9', 'aprobado', 10) as r \\gset
select (:'r'::jsonb ->> 'estado_pago') || '|' || (:'r'::jsonb ->> 'ok') || '|' || (select pagado::text from retail.pedidos_web where id = :'a')
       || '|' || ((select observacion from retail.pedido_web_pagos where referencia_externa = 'chr_9') like '%anulado%')::text;`,
    "por_revisar|false|0.00|true",
  );
  escenario(
    "anular un pago: con motivo, solo los de la tienda, y nunca en un pedido ya pagado completo",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${confirmarTodas("a")}
select retail.registrar_pago_pedido_web(:'a', 5, 'yape', '55550001') ->> 'pago_id' as p1 \\gset
select retail.fn_registrar_aviso_pasarela_pedido_web(:'a', 'culqi', 'chr_5', 'aprobado', 5) ->> 'pago_id' as p2 \\gset
select retail.registrar_pago_pedido_web(:'a', (select total - pagado from retail.pedidos_web where id = :'a'), 'plin', '55550002') is not null as _p \\gset
select ${hint(`format('select retail.anular_pago_pedido_web(%L, %L)', :'p1', 'porque_si')`)} || ',' ||
       ${hint(`format('select retail.anular_pago_pedido_web(%L, %L)', :'p2', 'error_al_anotar')`)} || ',' ||
       ${hint(`format('select retail.anular_pago_pedido_web(%L, %L)', :'p1', 'error_al_anotar')`)};`,
    "pedido_web_pagado,pedido_web_pago_pasarela,pedido_web_pagado",
  );

  // ===================================================================================================================
  console.log("— G. Permisos —");
  escenario(
    "sin el módulo «Pedidos web» no se confirma, no se cobra, no se anula ni se lee (Micaela, integrante)",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${separar("b")}
${confirmarTodas("b")}
set local request.jwt.claim.sub = '${MICAELA}';
select string_agg(${hint("x.llamada")}, ',' order by x.n) from (values
  (1, format('select retail.confirmar_pedido_web(%L, %L)', :'a', pg_temp.todas(:'a', 'reservar'))),
  (2, format('select retail.no_confirmar_pedido_web(%L, %L)', :'a', 'sin_stock')),
  (3, format('select retail.registrar_pago_pedido_web(%L, 5, %L, %L)', :'b', 'yape', '66660001')),
  (4, format('select retail.anular_pedido_web(%L, %L)', :'b', 'cliente_desistio')),
  (5, format('select * from retail.fn_pedidos_web_sede(%L)', :'tru')),
  (6, format('select retail.fn_pedido_web(%L)', :'b'))
) x(n, llamada);`,
    "pedido_web_sin_modulo,pedido_web_sin_modulo,pedido_web_sin_modulo,pedido_web_sin_modulo,pedido_web_sin_modulo,pedido_web_sin_modulo",
  );
  escenario(
    "como authenticated de verdad: las del ERP responden con el permiso de adentro; las internas, «permission denied»",
    `${separar("a")}
set local request.jwt.claim.sub = '${MICAELA}';
set local role authenticated;
select string_agg(case when y.r like 'error|pedido_web_sin_modulo|%' then 'sin_modulo' when y.r like '%permission denied%' then 'denegado' else y.r end, ',' order by y.n)
  from (select x.n, pg_temp.probar(x.llamada) as r from (values
  (1, format('select retail.confirmar_pedido_web(%L, %L)', :'a', '[]')),
  (2, format('select retail.crear_pedido_web(%L, %L, %L)', :'cli', :'tru', '[]')),
  (3, format('select retail.fn_pedidos_web_de_clienta(%L)', :'cli')),
  (4, 'select retail.fn_cerrar_pedidos_web_vencidos()'),
  (5, format('select retail.fn_registrar_aviso_pasarela_pedido_web(%L, %L, %L, %L, 5)', :'a', 'culqi', 'x', 'aprobado')),
  (6, 'select count(*) from retail.pedidos_web')
) x(n, llamada)) y;`,
    "sin_modulo,denegado,denegado,denegado,denegado,denegado",
  );
  escenario(
    "nadie de afuera ejecuta las internas ni toca las tablas: anon y tienda_web no ejecutan ninguna; RLS encendido y sin políticas",
    `select (select count(*) from pg_proc p
          where p.pronamespace = 'retail'::regnamespace
            and (p.proname like '%pedido%web%' or p.proname like '%pedidos_web%' or p.proname like '%apartado_de_pedido_web%')
            and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('tienda_web', p.oid, 'EXECUTE')
                 or has_function_privilege('public', p.oid, 'EXECUTE')))
     || '|' || (select string_agg(p.proname, ',' order by p.proname) from pg_proc p
          where p.pronamespace = 'retail'::regnamespace and has_function_privilege('authenticated', p.oid, 'EXECUTE')
            and (p.proname like '%pedido%web%' or p.proname like '%pedidos_web%'))
     || '|' || (select count(*) from pg_class c
          where c.relnamespace = 'retail'::regnamespace and c.relname in ('pedidos_web', 'pedido_web_lineas', 'pedido_web_pagos')
            and (has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                 or has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                 or has_table_privilege('tienda_web', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')))
              + (select count(*) from unnest(array['authenticated', 'anon', 'tienda_web']) r
                  where has_sequence_privilege(r, 'retail.pedidos_web_numero_seq', 'USAGE, SELECT, UPDATE'))
     || '|' || (select bool_and(c.relrowsecurity)::text from pg_class c where c.relnamespace = 'retail'::regnamespace and c.relname in ('pedidos_web', 'pedido_web_lineas', 'pedido_web_pagos'))
     || '|' || (select count(*) from pg_policies where schemaname = 'retail' and tablename in ('pedidos_web', 'pedido_web_lineas', 'pedido_web_pagos'))
     || '|' || has_function_privilege('service_role', 'retail.fn_cerrar_pedidos_web_vencidos(integer)', 'EXECUTE')::text;`,
    // Las del ERP: las del motor y, desde la actividad 8 (20261015010000 y 20261015011000), enviar a la tienda del pedido, la lista,
    // el detalle, el número del menú y los apartados que Existencias rotula. Todas con su permiso adentro.
    "0|anular_pago_pedido_web,anular_pedido_web,confirmar_pedido_web,enviar_pedido_web_desde,fn_apartados_de_pedidos_web,fn_pedido_web,fn_pedido_web_detalle,fn_pedidos_web_por_confirmar,fn_pedidos_web_sede,fn_pedidos_web_tablero,no_confirmar_pedido_web,registrar_pago_pedido_web,reservar_linea_pedido_web|0|true|0|true",
  );

  // ===================================================================================================================
  console.log("— H. Lo imposible lo rechaza la base (escribiendo directo en las tablas) —");
  escenario(
    "un pedido no salta de estado: por confirmar → pagado, vencido/anulado → confirmado, pagado → confirmado",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${separar("b")}
select retail.no_confirmar_pedido_web(:'b', 'cliente_desistio') is not null as _n \\gset
${separar("c")}
${confirmarTodas("c")}
select retail.registrar_pago_pedido_web(:'c', :'p_v'::numeric, 'yape', '77770001') is not null as _p \\gset
select string_agg(${hint("x.llamada")}, ',' order by x.n) from (values
  (1, format('update retail.pedidos_web set estado = %L, pagado_en = now() where id = %L', 'pagado', :'a')),
  (2, format('update retail.pedidos_web set estado = %L, confirmado_en = now(), confirmado_por = cerrado_por, cerrado_en = null, cerrado_por = null, cierre_motivo = null where id = %L', 'confirmado', :'b')),
  (3, format('update retail.pedidos_web set estado = %L, pagado_en = null where id = %L', 'confirmado', :'c')),
  (4, format('update retail.pedidos_web set codigo_recojo = %L where id = %L', '1234', :'c')),
  (5, format('update retail.pedidos_web set ubicacion_id = %L where id = %L', :'lim', :'a'))
) x(n, llamada);`,
    "pedido_web_transicion,pedido_web_transicion,pedido_web_transicion,pedido_web_inmutable,pedido_web_inmutable",
  );
  escenario(
    "una prenda no se reserva sin su apartado, no vuelve a pendiente, no cambia de precio y no se agrega a un pedido confirmado",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${separar("b")}
${confirmarTodas("b")}
select string_agg((split_part(pg_temp.probar(x.llamada), '|', 3) like x.espera)::text, ',' order by x.n) from (values
  (1, format('update retail.pedido_web_lineas set estado = %L, resuelta_en = now(), resuelta_por = (select id from public.personas where auth_user_id = %L) where pedido_id = %L', 'reservada', '${FELIPE}', :'a'), '%pedido_web_lineas_reserva_coherente%'),
  (2, format('update retail.pedido_web_lineas set estado = %L where pedido_id = %L', 'pendiente', :'b'), '%no pasa de%'),
  (3, format('update retail.pedido_web_lineas set precio_lista = precio_lista + 1 where pedido_id = %L', :'a'), '%no se cambian%'),
  (4, format('insert into retail.pedido_web_lineas (pedido_id, posicion, variante_id, precio_lista) values (%L, 9, %L, 10)', :'b', :'v'), '%pendiente y solo a un pedido%'),
  (5, format('update retail.pedido_web_lineas set estado = %L where pedido_id = %L', 'quitada', :'b'), '%no pasa de%')
) x(n, llamada, espera);`,
    "true,true,true,true,true",
  );
  escenario(
    "el total y lo pagado no se pueden falsear: la base recalcula sus sumas al confirmar la transacción",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${confirmarTodas("a")}
set constraints all immediate;
select ${hint(`format('update retail.pedidos_web set total = total + 1 where id = %L', :'a')`)} || ',' ||
       ${hint(`format('update retail.pedidos_web set pagado = 1 where id = %L', :'a')`)};`,
    "pedido_web_incoherente,pedido_web_incoherente",
  );
  escenario(
    "nada se borra: ni un pedido, ni una prenda, ni un pago (tampoco vaciando la tabla); un pago no se edita",
    `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("a")}
${confirmarTodas("a")}
select retail.registrar_pago_pedido_web(:'a', 5, 'yape', '88880001') ->> 'pago_id' as pago \\gset
set constraints all immediate;
select string_agg(${hint("x.llamada")}, ',' order by x.n) from (values
  (1, format('delete from retail.pedido_web_pagos where id = %L', :'pago')),
  (2, format('delete from retail.pedido_web_lineas where pedido_id = %L', :'a')),
  (3, format('delete from retail.pedidos_web where id = %L', :'a')),
  (4, 'truncate retail.pedido_web_pagos'),
  (5, format('update retail.pedido_web_pagos set monto = 1 where id = %L', :'pago')),
  (6, format('update retail.pedido_web_pagos set estado = %L where id = %L', 'pendiente', :'pago'))
) x(n, llamada);`,
    "pedido_web_no_se_borra,pedido_web_no_se_borra,pedido_web_no_se_borra,pedido_web_no_se_borra,pedido_web_pago_inmutable,pedido_web_transicion",
  );
  // Desde 20261015054000 ya no se unen fichas (Felipe 2026-10-14: el documento y el correo son de una sola persona): el cliente de un
  // pedido no cambia NUNCA. Ni a mano, ni porque una ficha figure unida a otra (como dejaría una unión de antes: se arma a mano).
  escenario(
    "el cliente de un pedido web no se cambia nunca: ni a mano, ni siguiendo a una ficha que figura unida a otra (ya no se unen fichas)",
    `${separar("a")}
insert into retail.clientas (nombre, telefono_whatsapp) values ('ZZ Otra ficha', '999777666') returning id as otra \\gset
select ${hint(`format('update retail.pedidos_web set clienta_id = %L where id = %L', :'otra', :'a')`)} as amano \\gset
update retail.clientas set documento_numero = null, nombre = 'Clienta anonimizada', telefono_whatsapp = null, anonimizada = true,
       archivada_en = now(), motivo_archivo = 'prueba pedidos web', fusionada_en_id = :'otra' where id = :'cli';
select ${hint(`format('update retail.pedidos_web set clienta_id = %L where id = %L', :'otra', :'a')`)} as unida \\gset
select :'amano' || '|' || :'unida' || '|' || ((select clienta_id from retail.pedidos_web where id = :'a') = :'cli'::uuid)::text;`,
    "pedido_web_inmutable|pedido_web_inmutable|true",
  );

  // ===================================================================================================================
  console.log("— I. La migración —");
  {
    const sql = MIGRACIONES.map((m) => readFileSync(m, "utf8")).join("\n");
    const dos = correr(`begin;\n${sql}\n${sql}\nselect count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('crear_pedido_web', 'confirmar_pedido_web', 'registrar_pago_pedido_web');\nrollback;\n`);
    esperarValor("se puede volver a correr (dos veces seguidas, como un segundo pegado)", dos, "3");
    const despues = correr(`${preparar(`${sql}\n${sql}`)}select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);\n${separar("a")}\n${confirmarTodas("a")}\nselect (select estado from retail.pedidos_web where id = :'a');\nrollback;\n`);
    esperarValor("y después de pegarla dos veces, el motor sigue funcionando", despues, "confirmado");
  }
}

// ===================================================================================================================
// J. La carrera: dos sesiones REALES a la vez por la misma prenda. Con ROLLBACK no se puede ver «el segundo pierde» entre dos
// conexiones (lo que no se commitea no lo ve la otra: límite de MVCC); eso lo prueba C en serie. Aquí se prueba lo que solo
// se ve con dos conexiones: que la segunda ESPERA a la primera en la fila de stock (no puede reservar la última mientras la
// primera la tiene), que nadie termina en bloqueo mutuo, y que con un tope de espera la segunda se rinde sin reservar nada.
async function carrera() {
  console.log("— J. La carrera por la última unidad (dos sesiones a la vez) —");
  if (APLICAR_ANTES) {
    console.log("  (con APLICAR_ANTES no corre: dos sesiones que crean las mismas tablas se esperan en el catálogo, no en el stock)");
    return;
  }
  // Una prenda con pocas unidades libres COMMITEADAS en Trujillo (nada se cambia fuera de las transacciones que se revierten).
  const r = correr(`
select st.variante_id || '|' || sum(st.cantidad - st.cantidad_apartada) from retail.stock st
  join retail.ubicaciones u on u.id = st.ubicacion_id and u.nombre = 'Tienda Trujillo'
  left join retail.sububicaciones s on s.id = st.sububicacion_id
  join retail.variantes v on v.id = st.variante_id and v.activo and v.precio > 0
 where (s.id is null or s.tipo in ('almacen_tienda', 'piso_venta')) and st.cantidad - st.cantidad_apartada > 0
   and retail.fn_variante_permitida_en_sede(v.id, u.id)
 group by st.variante_id having sum(st.cantidad - st.cantidad_apartada) between 1 and 20
 order by sum(st.cantidad - st.cantidad_apartada), st.variante_id limit 1;`);
  if (!r.ok || !r.salida) {
    esperar("la carrera necesita una prenda con 1 a 20 unidades libres en Trujillo", false, r.mensaje ?? "no hay ninguna");
    return;
  }
  const [variante, libres] = r.salida.split("|");
  const n = Number(libres);
  const sesion = (lineas, extra = "", espera = "") => `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
${extra}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select precio::text as precio from retail.variantes where id = '${variante}' \\gset
insert into retail.clientas (nombre, telefono_whatsapp) values ('ZZ Carrera pedidos web', '999666555') returning id as cli \\gset
select (retail.crear_pedido_web(:'cli', :'tru', (select jsonb_agg(jsonb_build_object('variante_id', '${variante}', 'precio_lista', :'precio'::numeric)) from generate_series(1, ${lineas})))
        ->> 'pedido_id') as ped \\gset
select 'LISTO';
select retail.confirmar_pedido_web(:'ped', (select jsonb_agg(jsonb_build_object('linea_id', l.id, 'decision', 'reservar')) from retail.pedido_web_lineas l where l.pedido_id = :'ped')) ->> 'estado';
${espera}
rollback;
`;
  // A se lleva TODO lo libre (incluida la última) y la retiene 2,5 s; B pide una 400 ms después.
  {
    const pA = psqlAsync(sesion(n, "", "select pg_sleep(2.5);"));
    await dormir(400);
    const pB = psqlAsync(sesion(1));
    const [a, b] = await Promise.all([pA, pB]);
    const todo = `${a.stdout}${a.stderr}${b.stdout}${b.stderr}`.toLowerCase();
    const sinDeadlock = !todo.includes("deadlock");
    const ambas = a.code === 0 && b.code === 0 && a.stdout.includes("confirmado") && b.stdout.includes("confirmado");
    const espero = b.ms > 1800;
    esperar(
      `dos sesiones por la última (${n} libre${n === 1 ? "" : "s"}, A se las lleva todas): B espera a que A termine, sin bloqueo mutuo, y reserva recién cuando A suelta`,
      sinDeadlock && ambas && espero,
      `sin_bloqueo=${sinDeadlock} ambas=${ambas} esperó=${espero} (B: ${b.ms} ms)\nA: ${a.stderr.trim()}\nB: ${b.stderr.trim()}`,
    );
  }
  // Lo mismo, pero B no espera más de medio segundo: se rinde con «lock timeout» y no reserva nada.
  {
    const pA = psqlAsync(sesion(n, "", "select pg_sleep(2.0);"));
    await dormir(400);
    const pB = psqlAsync(sesion(1, "set local lock_timeout = '500ms';"));
    const [a, b] = await Promise.all([pA, pB]);
    const ok = a.code === 0 && a.stdout.includes("confirmado") && b.code !== 0 && /lock timeout/i.test(b.stderr) && !b.stdout.includes("confirmado");
    esperar(
      "mientras A tiene la última, B no puede reservarla: con un tope de espera, se rinde sin reservar",
      ok,
      `A: code=${a.code} ${a.stderr.trim()}\nB: code=${b.code} ${b.stderr.trim()} ${b.stdout.trim()}`,
    );
  }
}

main();
await carrera();
console.log(`\n${total - fallos}/${total} escenarios en verde.`);
if (fallos > 0) process.exit(1);
