#!/usr/bin/env node
/**
 * Prueba de integración de los tipos que se ven en Movimientos (ADR-0346, migración 20261005160000) contra el Postgres LOCAL:
 * el filtro `p_categoria = venta | colgada | guardada | llegada | traslado | cliente` de `retail.fn_movimientos` y los mismos
 * grupos de `retail.fn_movimientos_resumen_procesos`.
 *
 * Lo que ninguna prueba de TypeScript puede verificar:
 *   · una colgada (almacén → piso) y una guardada (piso → almacén) se filtran POR SEPARADO en la lista y en las cifras;
 *   · las dos siguen dentro de «interno»: el filtro viejo trae las dos, y las cifras de «interno» las suman;
 *   · un movimiento interno de OTRO par (piso → cuarentena) cuenta en «interno» y en ninguna de las dos;
 *   · un valor desconocido de `p_categoria` sigue lanzando el error de siempre;
 *   · el parche está puesto y es re-pegable (volver a correr la migración no cambia nada).
 *
 * Todo lo de prueba lleva fechas de enero de 2020, que ningún dato de siembra tiene: el período las aísla. Cada caso
 * termina en ROLLBACK — no deja nada en el Postgres compartido (regla: no ensuciar la base local; jamás `db reset`).
 *
 * USO
 *   pnpm pruebas:movimientos-colgada-y-guardada    → necesita el stack local levantado
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
}

/** Tienda Lima con piso y almacén, el Taller, quién firma, y las fechas de cada operación (una por día de enero de 2020). */
const PRELUDIO = `
begin;
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select id as sp from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta' \\gset
select id as sa from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda' \\gset
select id as persona from public.personas where auth_user_id = '${FELIPE}' \\gset

create function pg_temp.variante(sku text) returns uuid language plpgsql as $$
declare p uuid; v uuid;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'productos' and column_name = 'marca_id') then
    insert into retail.productos (referencia, estado, marca_id, proveedor_id)
      select 'ZZ ' || sku, 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
      returning id into p;
  else
    insert into retail.productos (referencia, estado) values ('ZZ ' || sku, 'activo') returning id into p;
  end if;
  insert into retail.variantes (producto_id, sku, precio, costo, activo) values (p, sku, 100, 40, true) returning id into v;
  return v;
end $$;

-- Un movimiento con su hora puesta a mano: en una sola transacción de prueba \`now()\` es el mismo para todo, y acá cada
-- operación necesita su propia hora (la de SU transacción).
create function pg_temp.mov(v uuid, tipo text, cant int, u uuid, sub uuid, motivo text, t timestamptz, persona uuid,
                            ti uuid default null, trc uuid default null, vi uuid default null, camb uuid default null,
                            destino uuid default null, sub_destino uuid default null)
returns uuid language sql as $$
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at, usuario_id,
                                  transferencia_item_id, transferencia_recepcion_id, venta_item_id, cambio_id,
                                  ubicacion_destino_id, sububicacion_destino_id)
  values (v, u, sub, tipo, cant, motivo, t, persona, ti, trc, vi, camb, destino, sub_destino) returning id
$$;

select pg_temp.variante('ZZ-TDA-A') as va \\gset
select pg_temp.variante('ZZ-TDA-B') as vb \\gset
select pg_temp.variante('ZZ-TDA-C') as vc \\gset

-- Una colgada de dos prendas de una vez (almacén → piso), la misma hora.
select pg_temp.mov(:'va', 'traslado', 2, :'ubic', :'sa', 'movimiento_interno', '2020-01-14 10:00-05', :'persona', destino => :'ubic', sub_destino => :'sp');
select pg_temp.mov(:'vb', 'traslado', 1, :'ubic', :'sa', 'movimiento_interno', '2020-01-14 10:00-05', :'persona', destino => :'ubic', sub_destino => :'sp');
-- Una guardada de una prenda (piso → almacén).
select pg_temp.mov(:'vc', 'traslado', 3, :'ubic', :'sp', 'movimiento_interno', '2020-01-15 10:00-05', :'persona', destino => :'ubic', sub_destino => :'sa');
-- Un movimiento interno de otro par: del piso a la cuarentena (una prenda dañada).
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Cuarentena', 'cuarentena' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'cuarentena');
select id as sc from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'cuarentena' \\gset
select pg_temp.mov(:'va', 'traslado', 1, :'ubic', :'sp', 'movimiento_interno', '2020-01-16 10:00-05', :'persona', destino => :'ubic', sub_destino => :'sc');
-- Una venta, y los demás tipos que se ven: una llegada, un traslado enviado, una devolución, una venta anulada y una prenda
-- dañada liquidada (que no pertenece a ningún botón: se ve en «Todos»).
select pg_temp.mov(:'vb', 'salida', 1, :'ubic', :'sp', 'venta', '2020-01-17 10:00-05', :'persona');
select pg_temp.mov(:'va', 'entrada', 10, :'ubic', :'sa', 'recepcion', '2020-01-18 10:00-05', :'persona');
select pg_temp.mov(:'vb', 'salida', 2, :'ubic', :'sa', 'traslado_salida', '2020-01-19 10:00-05', :'persona');
select pg_temp.mov(:'vc', 'entrada', 1, :'ubic', :'sp', 'devolucion', '2020-01-20 10:00-05', :'persona');
select pg_temp.mov(:'va', 'entrada', 1, :'ubic', :'sp', 'anulacion_venta', '2020-01-21 10:00-05', :'persona');
select pg_temp.mov(:'vb', 'salida', 1, :'ubic', :'sc', 'cuarentena_liquidada', '2020-01-22 10:00-05', :'persona');
-- Lo que devuelven las cifras de enero de 2020, por grupo y proceso.
create function pg_temp.r(g text, p text, col text) returns text language plpgsql as $$
declare res text;
begin
  execute format('select coalesce(sum(%I), 0)::text from retail.fn_movimientos_resumen_procesos($1, p_desde => date ''2020-01-01'', p_hasta => date ''2020-01-31'') where grupo = $2 and ($3 is null or proceso = $3)', col)
    into res using current_setting('prueba.ubic')::uuid, g, p;
  return res;
end $$;
select set_config('prueba.ubic', :'ubic', false);
-- Cuántas FILAS trae la lista con un tipo (el filtro que tocan las píldoras).
create function pg_temp.n(cat text) returns int language sql as $$
  select count(*)::int from retail.fn_movimientos(current_setting('prueba.ubic')::uuid, p_desde => date '2020-01-01', p_hasta => date '2020-01-31', p_categoria => cat, p_limite => 200)
$$;
set local request.jwt.claim.sub = '${FELIPE}';
`;

const K = (clave, expresion) => `select 'K|${clave}|' || (${expresion})::text;`;

function parsear(salida) {
  const d = {};
  for (const linea of salida.split("\n")) {
    if (!linea.startsWith("K|")) continue;
    const [, clave, ...resto] = linea.split("|");
    d[clave] = resto.join("|");
  }
  return d;
}

let fallos = 0;
let total = 0;
function afirmar(nombre, condicion, detalle = "") {
  total += 1;
  if (condicion) console.log(`  ✔ ${nombre}`);
  else {
    fallos += 1;
    console.log(`  ✘ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}
const igual = (d, clave, esperado, nombre) => afirmar(nombre, d[clave] === String(esperado), `${clave}=${JSON.stringify(d[clave])} esperado=${JSON.stringify(String(esperado))}`);

function correr(titulo, sql, verificar) {
  console.log(`\n${titulo}`);
  let salida;
  try {
    salida = psql(sql).trim();
  } catch (e) {
    fallos += 1;
    total += 1;
    console.log(`  ✘ el SQL del caso falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 4).join(" ")}`);
    return;
  }
  verificar(parsear(salida));
}


correr(
  "1. La lista filtra la colgada y la guardada por separado",
  `${PRELUDIO}
${K("lista_colgada", "pg_temp.n('colgada')")}
${K("lista_guardada", "pg_temp.n('guardada')")}
${K("lista_interno", "pg_temp.n('interno')")}
${K("lista_ajuste", "pg_temp.n('ajuste')")}
${K("solo_colgada_par", "(select string_agg(distinct so.tipo || '>' || sd.tipo, ',') from retail.fn_movimientos(current_setting('prueba.ubic')::uuid, p_desde => date '2020-01-01', p_hasta => date '2020-01-31', p_categoria => 'colgada', p_limite => 200) f join retail.sububicaciones so on so.id = f.sububicacion_id join retail.sububicaciones sd on sd.id = f.sububicacion_destino_id)")}
rollback;`,
  (d) => {
    igual(d, "lista_colgada", 2, "«Colgada» trae las 2 filas de la colgada (almacén → piso) y nada más");
    igual(d, "lista_guardada", 1, "«Guardada» trae la fila de la guardada (piso → almacén)");
    igual(d, "lista_interno", 4, "«interno» sigue trayendo todo lo de dentro: 2 de la colgada + 1 de la guardada + 1 a la cuarentena");
    igual(d, "lista_ajuste", 0, "ninguna cae en «Ajustes»");
    igual(d, "solo_colgada_par", "almacen_tienda>piso_venta", "todas las filas de «Colgada» son del par almacén → piso");
  },
);

correr(
  "2. Las cifras tienen un grupo para cada una, y «interno» las suma",
  `${PRELUDIO}
${K("col_ops", "pg_temp.r('colgada', null, 'operaciones')")}
${K("col_movidas", "pg_temp.r('colgada', null, 'movidas')")}
${K("gua_ops", "pg_temp.r('guardada', null, 'operaciones')")}
${K("gua_movidas", "pg_temp.r('guardada', null, 'movidas')")}
${K("int_ops", "pg_temp.r('interno', null, 'operaciones')")}
${K("int_movidas", "pg_temp.r('interno', null, 'movidas')")}
${K("col_entran", "pg_temp.r('colgada', null, 'entran')")}
${K("todos_ops", "pg_temp.r('todos', null, 'operaciones')")}
${K("venta_salen", "pg_temp.r('salida', 'venta', 'salen')")}
rollback;`,
  (d) => {
    igual(d, "col_ops", 1, "«colgada»: UNA operación (las dos prendas se guardaron de una vez)");
    igual(d, "col_movidas", 3, "«colgada»: 3 unidades movidas (2 + 1)");
    igual(d, "gua_ops", 1, "«guardada»: una operación");
    igual(d, "gua_movidas", 3, "«guardada»: 3 unidades movidas");
    igual(d, "int_ops", 3, "«interno»: las 3 operaciones (colgada, guardada y la de la cuarentena)");
    igual(d, "int_movidas", 7, "«interno»: 3 + 3 + 1 unidades; la de la cuarentena cuenta solo acá");
    igual(d, "col_entran", 0, "lo que se cuelga no suma al total de la tienda");
    igual(d, "todos_ops", 9, "«todos»: las 3 internas, la venta, la llegada, el traslado, la devolución, la venta anulada y la prenda dañada, cada una una vez");
    igual(d, "venta_salen", 1, "la venta sigue contando como siempre");
  },
);

correr(
  "3. Los otros cuatro tipos que se ven: venta, llegada, traslado enviado y cambio o devolución",
  `${PRELUDIO}
${K("l_venta", "pg_temp.n('venta')")}
${K("l_llegada", "pg_temp.n('llegada')")}
${K("l_traslado", "pg_temp.n('traslado')")}
${K("l_cliente", "pg_temp.n('cliente')")}
${K("l_salida", "pg_temp.n('salida')")}
${K("l_entrada", "pg_temp.n('entrada')")}
${K("c_venta", "pg_temp.r('venta', null, 'operaciones') || '/' || pg_temp.r('venta', null, 'salen')")}
${K("c_llegada", "pg_temp.r('llegada', null, 'operaciones') || '/' || pg_temp.r('llegada', null, 'entran')")}
${K("c_traslado", "pg_temp.r('traslado', null, 'operaciones') || '/' || pg_temp.r('traslado', null, 'salen')")}
${K("c_cliente", "pg_temp.r('cliente', null, 'operaciones') || '/' || pg_temp.r('cliente', null, 'entran')")}
${K("c_salida", "pg_temp.r('salida', null, 'operaciones')")}
rollback;`,
  (d) => {
    igual(d, "l_venta", 1, "«Venta» trae la venta y nada más");
    igual(d, "l_llegada", 1, "«Llegada» trae la recepción: ni la devolución ni la venta anulada, que son del cliente");
    igual(d, "l_traslado", 1, "«Traslado» trae el envío");
    igual(d, "l_cliente", 2, "«Cliente» trae la devolución y la venta anulada");
    igual(d, "l_salida", 3, "«Salidas» (la de siempre) sigue trayendo la venta, el envío y la prenda dañada");
    igual(d, "l_entrada", 3, "«Entradas» (la de siempre) sigue trayendo la recepción, la devolución y la venta anulada");
    igual(d, "c_venta", "1/1", "cifras de «venta»: 1 operación, 1 prenda");
    igual(d, "c_llegada", "1/10", "cifras de «llegada»: 1 operación, 10 prendas");
    igual(d, "c_traslado", "1/2", "cifras de «traslado»: 1 operación, 2 prendas");
    igual(d, "c_cliente", "2/2", "cifras de «cliente»: 2 operaciones, 2 prendas");
    igual(d, "c_salida", 3, "la prenda dañada solo cuenta en «Salidas» y en «Todos»: no tiene botón");
  },
);

console.log("\n4. Un valor desconocido sigue lanzando el error de siempre");
try {
  psql(`${PRELUDIO}
select pg_temp.n('basura');
rollback;`);
  afirmar("p_categoria = 'basura' no se acepta", false, "la consulta respondió en vez de rechazar");
} catch (e) {
  afirmar("p_categoria = 'basura' no se acepta", /Categoría de movimiento desconocida/.test(String(e.stderr ?? e.message)), String(e.stderr ?? e.message).split("\n")[0]);
}

correr(
  "5. El parche está puesto y es re-pegable",
  `begin;
${K("marca_validacion", "position('ADR-0346: validacion_tipos_visuales' in pg_get_functiondef('retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid)'::regprocedure)) > 0")}
${K("marca_filtro", "position('ADR-0346: filtro_tipos_visuales' in pg_get_functiondef('retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid)'::regprocedure)) > 0")}
${K("marca_grupos", "position('ADR-0346: grupos_tipos_visuales' in pg_get_functiondef('retail.fn_movimientos_resumen_procesos(uuid, date, date, text, text, uuid, uuid)'::regprocedure)) > 0")}
${K("n_lista", "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_movimientos')")}
${K("anon", "has_function_privilege('anon', 'retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid)'::regprocedure, 'EXECUTE')")}
${K("auth", "has_function_privilege('authenticated', 'retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid)'::regprocedure, 'EXECUTE')")}
${K("md5_antes", "md5(pg_get_functiondef('retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid)'::regprocedure) || pg_get_functiondef('retail.fn_movimientos_resumen_procesos(uuid, date, date, text, text, uuid, uuid)'::regprocedure))")}
rollback;`,
  (d) => {
    igual(d, "marca_validacion", "true", "la validación acepta los tipos nuevos (parche puesto)");
    igual(d, "marca_filtro", "true", "el filtro de la lista los separa (parche puesto)");
    igual(d, "marca_grupos", "true", "las cifras tienen sus grupos (parche puesto)");
    igual(d, "n_lista", 1, "hay UNA sola fn_movimientos (la firma no cambió)");
    igual(d, "anon", "false", "anon NO puede ejecutarla");
    igual(d, "auth", "true", "authenticated sí");
    // Re-pegar la migración (sus trozos ya están puestos): no debe cambiar ni una letra de las dos funciones.
    const migracion = readFileSync(new URL("../../supabase/migrations/20261005160000_movimientos_colgada_y_guardada.sql", import.meta.url), "utf8");
    const huella = `${K("md5", "md5(pg_get_functiondef('retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid)'::regprocedure) || pg_get_functiondef('retail.fn_movimientos_resumen_procesos(uuid, date, date, text, text, uuid, uuid)'::regprocedure))")}`;
    let despues;
    try {
      despues = parsear(psql(`begin;\n${migracion}\n${huella}\nrollback;`));
    } catch (e) {
      afirmar("la migración se puede pegar otra vez", false, String(e.stderr ?? e.message).split("\n")[0]);
      return;
    }
    afirmar("la migración se puede pegar otra vez sin cambiar las funciones", despues.md5 === d.md5_antes, `${d.md5_antes} ≠ ${despues.md5}`);
  },
);

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);
