#!/usr/bin/env node
/**
 * La propuesta k de la ficha de la tienda online (ADR-0408): «Otra persona ya separó la última en Trujillo» — contra el Postgres
 * local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261015044000_tienda_separadas_por_otros.sql` (`retail.tienda_separadas_por_otros(usuario, modelo, tienda)`):
 *   1. La puerta: security definer con su search_path, solo `tienda_web` la ejecuta (y de verdad, con su rol).
 *   2. Dice que sí solo cuando las prendas de los pedidos web POR CONFIRMAR de OTROS clientes que recogen en ESA tienda (y que
 *      no pasaron su plazo) cubren lo que queda libre de esa talla ahí: una de una, dos de dos (en uno o en dos pedidos), no una
 *      de dos; lo de la propia cuenta, otra tienda, un pedido vencido (con el plazo de Configuración ▸ Tienda web) o uno ya
 *      confirmado no cuentan; sin nada libre en esa tienda, no.
 *   3. «Lo libre» es la pieza de la ficha (`fn_tienda_disponible`): la reserva de un pedido confirmado ya lo baja.
 *   4. Nunca sale una cifra ni quién: las llaves son las tallas activas del modelo y cada valor es un sí o un no.
 *   5. null sin cuenta, con un modelo oculto, con una tienda que no es de la web o sin tienda («Todas»).
 *   6. La migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario corre en su transacción y termina en ROLLBACK: nunca se commitea nada en el Postgres local que comparten
 * los worktrees. Cada uno arma su piso: Trujillo y Lima en la web («ZZ …»), sin campañas, el plazo de fábrica (24 h), un modelo
 * con al menos dos tallas que se vende en las dos tiendas (el único en la Vitrina), su stock libre vaciado DENTRO de la transacción
 * (con un «apartado» del libro) y dos clientes con cuenta web (A mira la ficha, B separa). Los pedidos se crean con
 * `tienda_separar`, como en la web. El paso del tiempo se prueba apagando, solo en esa transacción, el disparador que protege la
 * fecha del pedido.
 *
 * MUTANTES. `--mutantes` corre todos los escenarios contra versiones rotas a propósito de la migración (contar lo propio, no mirar
 * el plazo, contar otra tienda, sacar la cifra…) y falla si alguna sobrevive: una prueba que no mata a ningún mutante no prueba
 * nada. No va en el CI (tarda): se corre a mano al tocar la función.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261015044000_tienda_separadas_por_otros.sql` mete la migración dentro
 * de cada transacción (que se revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * DA POR SENTADO: `Tienda Trujillo` y `Tienda Lima` con su piso y su almacén, un modelo activo con dos tallas que se venden en las
 * dos sin precio propio de tienda, Felipe como líder (el seed), el motor del pedido web (20261014235000), la bolsa y «Separar»
 * (20261015021000), las tiendas de la web (20261014231000), la Vitrina (20261014225000) y la ficha (20261015012000).
 *
 * USO
 *   pnpm pruebas:tienda-separadas                       → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-separadas -- --mutantes         → además, los mutantes (a mano)
 *   pnpm pruebas:tienda-separadas -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const CON_MUTANTES = process.argv.includes("--mutantes");
const MIGRACION = "supabase/migrations/20261015044000_tienda_separadas_por_otros.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: confirma un pedido en cualquier tienda

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

const AYUDAS = `
-- Deja n unidades más en una fila (una «entrada» del libro).
create function pg_temp.dejar(p_v uuid, p_u uuid, p_sub uuid, p_n integer) returns void language plpgsql as $f$
declare v_mov uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
    values (p_v, p_u, p_sub, 'entrada', p_n, 'prueba', 'prueba tienda separadas: colchón') returning id into v_mov;
  perform retail.fn_aplicar_movimiento(v_mov);
end $f$;
-- Deja SIN disponible la prenda en una tienda: aparta (en el libro) todo lo libre de cada fila.
create function pg_temp.vaciar(p_v uuid, p_u uuid) returns void language plpgsql as $f$
declare r record; v_mov uuid;
begin
  for r in select st.sububicacion_id, st.cantidad - st.cantidad_apartada as libres
             from retail.stock st left join retail.sububicaciones s on s.id = st.sububicacion_id
            where st.variante_id = p_v and st.ubicacion_id = p_u and st.cantidad - st.cantidad_apartada > 0
              and (s.id is null or s.tipo <> 'cuarentena')
  loop
    insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
      values (p_v, p_u, r.sububicacion_id, 'apartado', r.libres, 'apartado', 'prueba tienda separadas: piso de partida') returning id into v_mov;
    perform retail.fn_aplicar_movimiento(v_mov);
  end loop;
end $f$;
-- Todas las prendas de un pedido con la misma decisión (para confirmarlo como lo haría la sede).
create function pg_temp.todas(p_pedido uuid, p_decision text) returns jsonb language sql as $f$
  select jsonb_agg(jsonb_build_object('linea_id', l.id, 'decision', p_decision) order by l.posicion)
    from retail.pedido_web_lineas l where l.pedido_id = p_pedido
$f$;
-- «Separar» como lo hace la web: la prenda, cuántas y el precio que el cliente vio (el de la tienda de recojo).
create function pg_temp.separar(p_usuario uuid, p_sede uuid, p_v uuid, p_n integer) returns text language sql as $f$
  select retail.tienda_separar(p_usuario, p_sede,
           jsonb_build_array(jsonb_build_object('variante_id', p_v, 'cantidad', p_n,
             'precio', (select x.precio from retail.fn_bolsa_web_precios(array[p_v], array[p_sede]) x))),
           gen_random_uuid()) ->> 'codigo'
$f$;
`;

const preparar = (aplicar) => `
begin;
${aplicar}
set local request.jwt.claim.sub = '${FELIPE}';
${lugares("Tienda Trujillo", "tru")}
${lugares("Tienda Lima", "lim")}
-- Las tiendas de la web: Trujillo y Lima, como las encendería Configuración ▸ Tienda web; ninguna otra.
update retail.ubicacion_datos_web set mostrar = false where mostrar;
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
-- Sin campañas y el plazo de fábrica.
update retail.etiquetas set activo = false where activo and descuento_pct is not null;
insert into retail.configuracion_tienda_web (id) values (true) on conflict (id) do nothing;
update retail.configuracion_tienda_web set horas_para_confirmar = 24, horas_aviso_sin_pagar = 48, dias_aviso_sin_recoger = 7 where id;
-- Un modelo con dos tallas que se venden en las dos tiendas y sin precio propio en ninguna.
select v.producto_id as prod from retail.variantes v
  join retail.productos p on p.id = v.producto_id
 where v.activo and v.precio > 0 and p.estado = 'activo' and p.estado_alta <> 'rechazado' and not p.es_prueba
   and p.id <> '11111111-1111-4111-8111-111111111111'
   and retail.fn_variante_permitida_en_sede(v.id, :'tru') and retail.fn_variante_permitida_en_sede(v.id, :'lim')
   and not exists (select 1 from retail.precios_sede_prenda ps where ps.producto_id = v.producto_id and ps.archivado_en is null)
 group by v.producto_id having count(*) >= 2
 order by v.producto_id limit 1 \\gset
select id as v from retail.variantes where producto_id = :'prod' and activo and precio > 0 order by id limit 1 \\gset
select id as v2 from retail.variantes where producto_id = :'prod' and activo and precio > 0 and id <> :'v' order by id limit 1 \\gset
-- La Vitrina: solo ese modelo.
update retail.vitrina_productos set publicado = false where publicado;
insert into retail.vitrina_productos (producto_id, publicado, publicado_en)
values (:'prod', true, now())
on conflict (producto_id) do update set publicado = true, publicado_en = now();
${AYUDAS}
select pg_temp.vaciar(:'v', :'tru'), pg_temp.vaciar(:'v', :'lim'), pg_temp.vaciar(:'v2', :'tru'), pg_temp.vaciar(:'v2', :'lim');
-- Dos clientes con cuenta web (su usuario del proyecto de clientes es un id cualquiera: aquí no se entra a ningún lado).
insert into retail.clientas (nombre, telefono_whatsapp) values ('ZZ Cliente A separadas', '999888781') returning id as cli_a \\gset
insert into retail.clientas (nombre, telefono_whatsapp) values ('ZZ Cliente B separadas', '999888782') returning id as cli_b \\gset
select gen_random_uuid() as usr_a, gen_random_uuid() as usr_b \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados)
values (:'usr_a', :'cli_a', 'zz-sep-a@prueba-tienda.test', 'prueba'), (:'usr_b', :'cli_b', 'zz-sep-b@prueba-tienda.test', 'prueba');
`;

// Lo que ve A (o quien se diga) en esa tienda: «v=sí|v2=no».
const VE = (sede = "tru", usr = "usr_a") =>
  `(select coalesce((r ->> :'v'), '-') || '|' || coalesce((r ->> :'v2'), '-') from (select retail.tienda_separadas_por_otros(:'${usr}', :'prod', :'${sede}') as r) x)`;
const SEPARAR = (usr, sede, prenda, n = 1) => `select pg_temp.separar(:'${usr}', :'${sede}', :'${prenda}', ${n}) as _c \\gset\n`;
// El paso del tiempo, solo en esta transacción (como en pruebas:tienda-bolsa).
const VIAJAR = (sql) => `
set constraints all immediate;
alter table retail.pedidos_web disable trigger pedidos_web_reglas;
${sql}
alter table retail.pedidos_web enable trigger pedidos_web_reglas;
set constraints all deferred;
`;
const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;

// ---- Los escenarios ---------------------------------------------------------------------------------------------------------

/** [sección, nombre, cuerpo, esperado, sinPiso]: la ÚLTIMA línea de la salida es el veredicto. `sinPiso`: solo lee el catálogo
 *  de Postgres y no necesita el piso de partida. */
const ESCENARIOS = [];
const seccion = (titulo) => ESCENARIOS.push([titulo]);
const escenario = (nombre, cuerpo, esperado, { sinPiso = false } = {}) => ESCENARIOS.push([null, nombre, cuerpo, esperado, sinPiso]);

seccion("— 1. La puerta —");
escenario(
  "security definer con su search_path, y solo de tienda_web (ni public, ni anon, ni authenticated)",
  `select concat_ws('|', p.prosecdef, exists (select 1 from unnest(coalesce(p.proconfig, '{}')) x where x like 'search\\_path=%'),
    has_function_privilege('public', p.oid, 'EXECUTE'), has_function_privilege('anon', p.oid, 'EXECUTE'),
    has_function_privilege('authenticated', p.oid, 'EXECUTE'), has_function_privilege('tienda_web', p.oid, 'EXECUTE'))
  from pg_proc p where p.oid = 'retail.tienda_separadas_por_otros(uuid, uuid, uuid)'::regprocedure;`,
  "t|t|f|f|f|t",
  { sinPiso: true },
);
escenario(
  "como tienda_web de verdad (su rol): responde",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${SEPARAR("usr_b", "tru", "v")}
${COMO_TIENDA}
select ${VE()};`,
  "true|false",
);
escenario(
  "como tienda_web, leer los pedidos web por fuera de sus funciones se niega",
  `${COMO_TIENDA}
select case when has_table_privilege('retail.pedidos_web', 'SELECT') or has_table_privilege('retail.pedido_web_lineas', 'SELECT') then 'abierta' else 'cerrada' end;`,
  "cerrada",
);

seccion("— 2. Cuándo dice que sí —");
escenario(
  "sin nada separado, ninguna talla avisa",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1), pg_temp.dejar(:'v2', :'tru', :'tru_alm', 1);
select ${VE()};`,
  "false|false",
);
escenario(
  "otra persona separó la última en Trujillo: esa talla sí, la otra no",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1), pg_temp.dejar(:'v2', :'tru', :'tru_alm', 1);
${SEPARAR("usr_b", "tru", "v")}
select ${VE()};`,
  "true|false",
);
escenario(
  "quedan dos: una separada no cubre (no); dos —en otro pedido o en el mismo— sí",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 2), pg_temp.dejar(:'v2', :'tru', :'tru_piso', 2);
${SEPARAR("usr_b", "tru", "v")}
select ${VE()} as una \\gset
${SEPARAR("usr_b", "tru", "v")}
${SEPARAR("usr_b", "tru", "v2", 2)}
select concat_ws(',', :'una', ${VE()});`,
  "false|false,true|true",
);
escenario(
  "lo de la propia cuenta no cuenta: A no ve «otra persona» por su pedido; B sí lo ve",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${SEPARAR("usr_a", "tru", "v")}
select concat_ws(',', ${VE("tru", "usr_a")}, ${VE("tru", "usr_b")});`,
  "false|false,true|false",
);
escenario(
  "un pedido para recoger en otra tienda no cuenta: el de Lima avisa en Lima, no en Trujillo",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1), pg_temp.dejar(:'v', :'lim', :'lim_piso', 1);
${SEPARAR("usr_b", "lim", "v")}
select concat_ws(',', ${VE("tru")}, ${VE("lim")});`,
  "false|false,true|false",
);
escenario(
  "un pedido que pasó su plazo no cuenta aunque el cierre no haya corrido; con 48 h en Configuración, vuelve a contar",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${SEPARAR("usr_b", "tru", "v")}
${VIAJAR(`update retail.pedidos_web set creado_en = now() - interval '25 hours' where codigo = :'_c';`)}
select ${VE()} as con24 \\gset
update retail.configuracion_tienda_web set horas_para_confirmar = 48 where id;
select concat_ws(',', :'con24', ${VE()});`,
  "false|false,true|false",
);
escenario(
  "uno confirmado ya no está por confirmar: su reserva baja lo libre (la pieza de la ficha) y no avisa; otro por confirmar, sí",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 2);
${SEPARAR("usr_b", "tru", "v")}
select id as ped from retail.pedidos_web where codigo = :'_c' \\gset
select retail.confirmar_pedido_web(:'ped', pg_temp.todas(:'ped', 'reservar')) is not null as _ok \\gset
select ${VE()} as confirmado \\gset
${SEPARAR("usr_b", "tru", "v")}
select concat_ws(',', :'confirmado', ${VE()});`,
  "false|false,true|false",
);
escenario(
  "sin nada libre en esa tienda no hay nada que avisar (la ficha ya dice «Otra tienda»), aunque otro la haya separado ahí",
  `select pg_temp.dejar(:'v', :'lim', :'lim_piso', 1);
${SEPARAR("usr_b", "tru", "v")}
select ${VE("tru")};`,
  "false|false",
);

seccion("— 3. Lo que sale —");
escenario(
  "nunca una cifra ni quién: las llaves son las tallas activas del modelo y cada valor es un sí o un no",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 3);
${SEPARAR("usr_b", "tru", "v", 3)}
select retail.tienda_separadas_por_otros(:'usr_a', :'prod', :'tru') as r \\gset
select concat_ws(',',
  (select array_agg(k order by k) from jsonb_object_keys((:'r')::jsonb) k)
    = (select array_agg(id::text order by id::text) from retail.variantes where producto_id = :'prod' and activo),
  (select bool_and(jsonb_typeof(x.value) = 'boolean') from jsonb_each((:'r')::jsonb) x),
  (:'r')::jsonb ->> :'v');`,
  "t,t,true",
);
escenario(
  "null: sin cuenta, con el modelo oculto, con una tienda que no es de la web, sin tienda («Todas») o sin modelo",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${SEPARAR("usr_b", "tru", "v")}
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
select concat_ws(',',
  retail.tienda_separadas_por_otros(gen_random_uuid(), :'prod', :'tru') is null,
  retail.tienda_separadas_por_otros(:'usr_a', :'prod', :'taller') is null,
  retail.tienda_separadas_por_otros(:'usr_a', :'prod', gen_random_uuid()) is null,
  retail.tienda_separadas_por_otros(:'usr_a', :'prod', null) is null,
  retail.tienda_separadas_por_otros(:'usr_a', null, :'tru') is null,
  retail.tienda_separadas_por_otros(:'usr_a', :'prod', :'tru') is null) as antes \\gset
update retail.ubicacion_datos_web set mostrar = false where ubicacion_id = :'tru';
select retail.tienda_separadas_por_otros(:'usr_a', :'prod', :'tru') is null as escondida \\gset
update retail.ubicacion_datos_web set mostrar = true where ubicacion_id = :'tru';
update retail.vitrina_productos set publicado = false where producto_id = :'prod';
select concat_ws(',', :'antes', :'escondida', retail.tienda_separadas_por_otros(:'usr_a', :'prod', :'tru') is null);`,
  "t,t,t,t,t,f,t,t",
);

seccion("— 4. La migración —");

// ---- Los mutantes: cada uno rompe UNA promesa; alguna prueba tiene que ponerse roja ------------------------------------------

const MUTANTES = [
  ["cuenta lo de la propia cuenta", "and w.clienta_id <> v_clienta", "and true"],
  ["no mira el plazo", "and now() < w.creado_en + make_interval(hours => v_horas)", "and true"],
  ["el plazo fijo en 24 h", "coalesce((select c.horas_para_confirmar from retail.configuracion_tienda_web c where c.id), 24)", "24"],
  ["cuenta los pedidos de otra tienda", "and w.ubicacion_id = p_sede", "and true"],
  [
    "cuenta lo ya confirmado",
    "where l.estado = 'pendiente'\n         and l.variante_id in (select v.id from retail.variantes v where v.producto_id = p_producto)\n         and w.estado = 'por_confirmar'",
    "where l.estado in ('pendiente', 'reservada')\n         and l.variante_id in (select v.id from retail.variantes v where v.producto_id = p_producto)\n         and w.estado in ('por_confirmar', 'confirmado')",
  ],
  ["basta con una aunque queden más", "and coalesce(s.n, 0) >= li.n", "and coalesce(s.n, 0) > 0"],
  ["avisa sin nada libre en esa tienda", "coalesce(li.n, 0) > 0 and coalesce(s.n, 0) >= li.n", "coalesce(s.n, 0) > 0"],
  ["saca la cifra que queda", "coalesce(li.n, 0) > 0 and coalesce(s.n, 0) >= li.n), '{}'::jsonb)", "coalesce(li.n, 0) - coalesce(s.n, 0)), '{}'::jsonb)"],
  ["responde sin cuenta", "if v_clienta is null\n     or p_producto is null", "if p_producto is null"],
  ["cualquier tienda vale", "or p_sede is null or not (p_sede = any (retail.fn_tienda_sedes_web()))", "or p_sede is null"],
  ["lee un modelo oculto", "or not exists (select 1 from retail.vitrina_productos vp where vp.producto_id = p_producto and vp.publicado)", ""],
];

function escenariosContra(aplicar) {
  const PREPARAR = preparar(aplicar);
  const resultados = [];
  for (const [titulo, nombre, cuerpo, esperado, sinPiso] of ESCENARIOS) {
    if (titulo) continue;
    const sql = sinPiso ? `begin;\n${aplicar}\n${cuerpo}\nrollback;\n` : `${PREPARAR}${cuerpo}\nrollback;\n`;
    const r = correr(sql);
    const ultima = r.ok ? r.salida.split("\n").pop() : null;
    resultados.push({ nombre, ok: r.ok && ultima === esperado, detalle: r.ok ? `dio «${ultima}», se esperaba «${esperado}»` : r.mensaje });
  }
  return resultados;
}

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select to_regprocedure('retail.tienda_separadas_por_otros(uuid, uuid, uuid)') is not null;");
    if (hay.salida !== "t") {
      console.error(`Falta la función de la propuesta k: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
      process.exit(2);
    }
  }
  const prep = correr(`${preparar(APLICAR_ANTES)}select coalesce(nullif(:'v', ''), 'sin prenda') || '|' || coalesce(nullif(:'v2', ''), 'sin prenda');\nrollback;\n`);
  if (!prep.ok || prep.salida.includes("sin prenda")) {
    console.error(`No se pudo armar el piso de partida (¿un modelo con dos tallas que se venda en Trujillo y Lima?):\n${prep.mensaje ?? prep.salida}`);
    process.exit(2);
  }

  let fallos = 0;
  let total = 0;
  const resultados = escenariosContra(APLICAR_ANTES);
  let i = 0;
  for (const [titulo] of ESCENARIOS) {
    if (titulo) {
      console.log(titulo);
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

  const texto = readFileSync(MIGRACION, "utf8");
  total++;
  const dosVeces = correr(`begin;\n${texto}\n${texto}\nselect count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'tienda_separadas_por_otros';\nrollback;\n`);
  const okDos = dosVeces.ok && dosVeces.salida.split("\n").pop() === "1";
  console.log(`${okDos ? "✓" : "✗"} la migración se puede pegar dos veces seguidas (sin duplicar la función)`);
  if (!okDos) {
    fallos++;
    console.log(`    ${dosVeces.ok ? dosVeces.salida : dosVeces.mensaje}`);
  }

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);

  if (!CON_MUTANTES) return;
  console.log("\n— Mutantes (cada uno tiene que poner rojo algún escenario) —");
  let vivos = 0;
  for (const [nombre, de, a] of MUTANTES) {
    if (!texto.includes(de)) {
      console.log(`✗ ${nombre}: el texto que muta ya no está en ${MIGRACION} (actualiza el mutante)`);
      vivos++;
      continue;
    }
    const muertos = escenariosContra(`${APLICAR_ANTES}\n${texto.replace(de, a)}`).filter((r) => !r.ok);
    if (muertos.length === 0) vivos++;
    console.log(`${muertos.length > 0 ? "✓" : "✗"} ${nombre}${muertos.length > 0 ? ` — lo frena «${muertos[0].nombre}»` : " — SOBREVIVE: ningún escenario lo vio"}`);
  }
  console.log(`\n${MUTANTES.length - vivos}/${MUTANTES.length} mutantes frenados.`);
  if (vivos > 0) process.exit(1);
}

main();
