#!/usr/bin/env node
/**
 * Pruebas de los arreglos que vivían SOLO en producción y ahora están en `main` (ADR-0252) — CAYLA V2.
 * Migraciones: `20260928200000_arreglos_en_vivo_a_main.sql` y `20260928200100_nota_pendiente_por_cierre_o_faltante.sql`.
 *
 * EL PROBLEMA. La auditoría de huellas del 2026-09-28 (ADR-0251) encontró permisos y funciones que producción tenía y
 * `main` no: el CI y cada Postgres local probaban otro sistema que el de las tiendas, y la próxima migración que
 * recreara una de esas funciones desde el repo habría borrado el arreglo sin aviso. Estas pruebas miran el ESTADO VIVO de
 * la base (lo que dejan todas las migraciones), así que se ponen rojas el día que una migración futura vuelva a abrir
 * una puerta (por ejemplo, con `drop function` + `create function`, que no conserva los `revoke`).
 *
 * QUÉ PROMETE.
 *   A. `emitir_comprobante`, `emitir_nota`, `fn_aplicar_movimiento` y `recalcular_stock` no las ejecuta ningún rol de la
 *      app (`authenticated`, `anon`, `service_role`, PUBLIC): 42501. Solo su dueña, que conserva su EXECUTE.
 *   B. `stock` y `movimientos` no los escribe directo ningún rol de la app (insert, update, delete, truncate): 42501. La
 *      lectura sigue intacta para `authenticated` y `service_role` (Existencias y Movimientos las leen).
 *   C. Notas de crédito de compras (20260928200100): un cierre deja de esperar su nota si tiene una nota atada o si el
 *      comprobante ya tiene su nota por faltante. Incluye los dos casos que rompían las versiones anteriores y el que
 *      prueba que la regla (a) es por CIERRE (con dos líneas cerradas, la nota atada a una deja esperando solo a la otra).
 *   D. `fn_rentabilidad`: existe con el cuerpo de producción, la ejecuta `authenticated`, y adentro solo deja al líder.
 *   E. Las dos migraciones se pueden pegar dos veces; pegadas sobre la foto de producción cambian SOLO lo que dicen
 *      (las tres `_json`, y las dos de notas de crédito); y sus guardas abortan con un cuerpo desconocido o con una dueña
 *      sin EXECUTE.
 *   F. Cerrar las puertas no rompe la tienda: COMO `authenticated`, una venta con boleta sigue emitiendo su comprobante y
 *      bajando el stock (emitir_comprobante y fn_aplicar_movimiento por dentro), y aprobar una devolución de una venta
 *      aceptada por SUNAT sigue emitiendo su nota de crédito (emitir_nota por dentro).
 * Cada caso de A, B y F tiene su CONTROL: con la puerta abierta a propósito (A, B) o cerrada también para la dueña (F),
 * dentro del ROLLBACK, la misma sonda da lo contrario. Si no, la prueba no probaría nada.
 *
 * CÓMO. Como las demás de `scripts/pruebas`: `docker exec ... psql`, una transacción por caso que TERMINA EN ROLLBACK
 * (nunca se commitea nada), `set local role` para que el permiso se evalúe de verdad (en el Postgres del CI `postgres`
 * no es superusuario; en el desechable sí, y se salta toda ACL). Las sondas corren la sentencia dentro de una función
 * temporal que atrapa el error y devuelve «SQLSTATE:mensaje» (o «SIN_ERROR»). Las de tabla usan `where false`: Postgres
 * revisa el permiso antes de mirar una sola fila, así que no hace falta tocar datos. En F, donde `postgres` es
 * superusuario, la función que llama la tienda se le pasa (dentro del ROLLBACK) a una dueña NO superusuaria que hereda
 * los permisos de `postgres`: así la llamada de adentro se evalúa como en el CI y en producción, donde la dueña tampoco
 * es superusuaria.
 *
 * USO: pnpm pruebas:arreglos-en-vivo   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION_A = readFileSync(join(RAIZ, "supabase/migrations/20260928200000_arreglos_en_vivo_a_main.sql"), "utf8");
const MIGRACION_B = readFileSync(join(RAIZ, "supabase/migrations/20260928200100_nota_pendiente_por_cierre_o_faltante.sql"), "utf8");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — fija a Tienda Trujillo

const FIRMA_COMPROBANTE = "retail.emitir_comprobante(uuid, text, numeric, numeric, numeric, uuid, text, text, text, jsonb, uuid)";
const FIRMA_NOTA = "retail.emitir_nota(uuid, text, text, numeric, numeric, numeric, jsonb)";
const FIRMA_RENTABILIDAD = "retail.fn_rentabilidad(date, integer, numeric)";

/** Huella normalizada de un cuerpo: la misma de `deriva.sql` y de las guardas de las migraciones. */
const HUELLA = (expr) =>
  `md5(regexp_replace(regexp_replace(regexp_replace(${expr}, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

// No lanza: un caso que DEBE fallar no es un error del script, es el resultado que se prueba.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/**
 * Abre la transacción del caso y deja la sonda: corre una sentencia como el rol de ese momento y devuelve
 * «SQLSTATE:mensaje», o «SIN_ERROR» si pasó. Se crea como `postgres`, antes de cambiar de rol.
 */
const INICIO = `
begin;
create function pg_temp.probar(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  return sqlstate || ':' || sqlerrm;
end
$f$;
`;
const COMO = (rol, sub = "") => `set local role ${rol};\nset local request.jwt.claim.sub = '${sub}';\nset local request.jwt.claim.role = '${rol}';\n`;
const sonda = (sql) => `pg_temp.probar($s$${sql}$s$)`;
const NEGADO_FN = (f) => `42501:permission denied for function ${f}`;
const NEGADO_TABLA = (t) => `42501:permission denied for table ${t}`;

// Las sentencias que se prueban. Con argumentos cualquiera: si el permiso falta, Postgres corta antes de ejecutar.
const LLAMAR = {
  comprobante: `select retail.emitir_comprobante(null::uuid, 'boleta', 84.75, 15.25, 100.00)`,
  nota: `select retail.emitir_nota(null::uuid, 'nota_credito', 'prueba', 1, 0, 1, '[]'::jsonb)`,
  aplicar: `select retail.fn_aplicar_movimiento(gen_random_uuid())`,
  recalcular: `select retail.recalcular_stock()`,
};
const ESCRIBIR = (t) => [
  `insert into retail.${t} select * from retail.${t} where false`,
  `update retail.${t} set cantidad = cantidad where false`,
  `delete from retail.${t} where false`,
];

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });
const omitir = (nombre, motivo) => CASOS.push({ nombre, tipo: "omitido", motivo });

// ===========================================================================
// A. Funciones que solo ejecuta su dueña
// ===========================================================================

exito(
  "A · authenticated (líder) no ejecuta emitir_comprobante ni emitir_nota: 42501",
  `${INICIO}${COMO("authenticated", FELIPE)}
select ${sonda(LLAMAR.comprobante)}, ${sonda(LLAMAR.nota)};
rollback;`,
  [NEGADO_FN("emitir_comprobante"), NEGADO_FN("emitir_nota")]
);

exito(
  "A · anon no ejecuta ninguna de las cuatro: 42501",
  `${INICIO}${COMO("anon")}
select ${sonda(LLAMAR.comprobante)}, ${sonda(LLAMAR.nota)}, ${sonda(LLAMAR.aplicar)}, ${sonda(LLAMAR.recalcular)};
rollback;`,
  [NEGADO_FN("emitir_comprobante"), NEGADO_FN("emitir_nota"), NEGADO_FN("fn_aplicar_movimiento"), NEGADO_FN("recalcular_stock")]
);

exito(
  "A · la llave del servidor (service_role) no ejecuta ninguna de las cuatro: 42501",
  `${INICIO}${COMO("service_role")}
select ${sonda(LLAMAR.comprobante)}, ${sonda(LLAMAR.nota)}, ${sonda(LLAMAR.aplicar)}, ${sonda(LLAMAR.recalcular)};
rollback;`,
  [NEGADO_FN("emitir_comprobante"), NEGADO_FN("emitir_nota"), NEGADO_FN("fn_aplicar_movimiento"), NEGADO_FN("recalcular_stock")]
);

exito(
  "A · authenticated (líder) tampoco ejecuta fn_aplicar_movimiento ni recalcular_stock: 42501",
  `${INICIO}${COMO("authenticated", FELIPE)}
select ${sonda(LLAMAR.aplicar)}, ${sonda(LLAMAR.recalcular)};
rollback;`,
  [NEGADO_FN("fn_aplicar_movimiento"), NEGADO_FN("recalcular_stock")]
);

// Por NOMBRE y no por firma: una sobrecarga nueva de cualquiera de las cuatro entra sola a la revisión.
exito(
  "A · estado vivo: ninguna sobrecarga de las cuatro la ejecuta un rol de la app, y la dueña de cada una sí",
  `select count(*) filter (where abierta), count(*) filter (where duena_puede), count(*)
from (
  select p.oid,
         exists (select 1 from (values ('public'), ('anon'), ('authenticated'), ('service_role')) g(rol)
                  where has_function_privilege(g.rol, p.oid, 'execute')) as abierta,
         has_function_privilege(p.proowner, p.oid, 'execute') as duena_puede
    from pg_proc p
   where p.pronamespace = 'retail'::regnamespace
     and p.proname in ('emitir_comprobante', 'emitir_nota', 'fn_aplicar_movimiento', 'recalcular_stock')
) z;`,
  ["0", "4", "4"]
);

exito(
  "A · CONTROL: con EXECUTE devuelto a authenticated y service_role, las mismas sondas ya NO dan 42501",
  `${INICIO}
grant execute on function ${FIRMA_COMPROBANTE}, ${FIRMA_NOTA} to authenticated;
grant execute on function retail.fn_aplicar_movimiento(uuid), retail.recalcular_stock() to service_role;
create temp table _r (k text, v text);
grant all on _r to public;
${COMO("authenticated", FELIPE)}
insert into _r select 'c', ${sonda(LLAMAR.comprobante)};
insert into _r select 'n', ${sonda(LLAMAR.nota)};
reset role;
${COMO("service_role")}
insert into _r select 'a', ${sonda(LLAMAR.aplicar)};
reset role;
select string_agg(k || '=' || (v like '42501:permission denied%')::text, ',' order by k) from _r;
rollback;`,
  ["a=false,c=false,n=false"]
);

// ===========================================================================
// B. El libro (`movimientos`) y su foto (`stock`) solo se escriben por las funciones
// ===========================================================================

exito(
  "B · authenticated (líder) no escribe stock directo: insert, update y delete dan 42501",
  `${INICIO}${COMO("authenticated", FELIPE)}
select ${ESCRIBIR("stock").map(sonda).join(", ")};
rollback;`,
  [NEGADO_TABLA("stock"), NEGADO_TABLA("stock"), NEGADO_TABLA("stock")]
);

exito(
  "B · authenticated (líder) no escribe movimientos directo: insert, update y delete dan 42501",
  `${INICIO}${COMO("authenticated", FELIPE)}
select ${ESCRIBIR("movimientos").map(sonda).join(", ")};
rollback;`,
  [NEGADO_TABLA("movimientos"), NEGADO_TABLA("movimientos"), NEGADO_TABLA("movimientos")]
);

exito(
  "B · la llave del servidor (service_role, que se salta RLS) no escribe stock ni movimientos: 42501",
  `${INICIO}${COMO("service_role")}
select ${[...ESCRIBIR("stock"), ...ESCRIBIR("movimientos")].map(sonda).join(", ")};
rollback;`,
  [...Array(3).fill(NEGADO_TABLA("stock")), ...Array(3).fill(NEGADO_TABLA("movimientos"))]
);

exito(
  "B · nadie de la app tiene TRUNCATE (ni insert, update, delete) sobre stock ni movimientos",
  `select count(*) from (values ('public'), ('anon'), ('authenticated'), ('service_role')) g(rol)
  cross join (values ('retail.stock'), ('retail.movimientos')) t(tabla)
  cross join (values ('insert'), ('update'), ('delete'), ('truncate')) x(priv)
 where has_table_privilege(g.rol, t.tabla, x.priv);`,
  ["0"]
);

exito(
  "B · la lectura sigue intacta: el líder y la llave del servidor leen stock y movimientos",
  `${INICIO}${COMO("authenticated", FELIPE)}
select (select count(*) from retail.stock) > 0 as a1, ${sonda("select count(*) from retail.movimientos")} as a2 \\gset
reset role;
${COMO("service_role")}
select :'a1', :'a2', (select count(*) from retail.stock) > 0, ${sonda("select count(*) from retail.movimientos")};
rollback;`,
  ["t", "SIN_ERROR", "t", "SIN_ERROR"]
);

exito(
  "B · CONTROL: con la escritura devuelta, las mismas sondas pasan (0 filas, sin error)",
  `${INICIO}
grant insert, update, delete on retail.stock to authenticated;
grant insert on retail.movimientos to service_role;
create temp table _r (k text, v text);
grant all on _r to public;
${COMO("authenticated", FELIPE)}
insert into _r select 's' || n, ${"pg_temp.probar(x)"} from unnest(array[${ESCRIBIR("stock").map((s) => `$q$${s}$q$`).join(", ")}]) with ordinality as u(x, n);
reset role;
${COMO("service_role")}
insert into _r select 'm', ${sonda(ESCRIBIR("movimientos")[0])};
reset role;
select string_agg(k || '=' || v, ',' order by k) from _r;
rollback;`,
  ["m=SIN_ERROR,s1=SIN_ERROR,s2=SIN_ERROR,s3=SIN_ERROR"]
);

// ===========================================================================
// C. Notas de crédito de compras: ¿el cierre sigue esperando su nota? (20260928200100)
// ===========================================================================

/** Proveedor, Taller y la variante del seed. */
const BASE = `
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
`;
const HOY = "retail.fn_hoy_lima()";

/** Un comprobante a crédito con la RPC real: una línea por cantidad, a S/ 50 + IGV 18 %. Deja `:c1`. */
const compra = (lineas) => `
select retail.registrar_compra(:'prov1', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'taller',
  jsonb_build_array(${lineas.map((c) => `jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', ${c}, 'costo_unitario', 50)`).join(", ")}),
  p_tipo => 'factura', p_fecha_emision => ${HOY}, p_fecha_vencimiento => ${HOY} + 10, p_igv_porcentaje => 18) as c1 \\gset
`;

/** Pendientes del comprobante en las dos lecturas: filas «pendiente» del tablero, sus unidades, y filas de la lista. */
const PENDIENTES = `select
  (select count(*) from retail.notas_credito_tablero() where compra_id = :'c1' and clase = 'pendiente'),
  (select coalesce(sum(unidades_cerradas), 0) from retail.notas_credito_tablero() where compra_id = :'c1' and clase = 'pendiente'),
  (select count(*) from retail.compras_nota_pendiente(array[:'c1'::uuid])),
  (select count(*) from retail.notas_credito_tablero() where compra_id = :'c1' and clase = 'nota');`;

const comoFelipe = (sql) => `begin;\nset local request.jwt.claim.sub = '${FELIPE}';\n${BASE}${sql}\nrollback;`;

exito(
  "C · un cierre sin ninguna nota espera su nota en el tablero y en la lista (4 u)",
  comoFelipe(`${compra([24])}
select id as it1 from retail.compra_items where compra_id = :'c1' \\gset
select retail.cerrar_linea_compra(:'it1', 4, 'no_llego') as k1 \\gset
${PENDIENTES}`),
  ["1", "4", "1", "0"]
);

exito(
  "C · un cierre saldado con una nota por DEVOLUCIÓN atada a él ya no espera (el caso que arregló producción)",
  comoFelipe(`${compra([24])}
select id as it1 from retail.compra_items where compra_id = :'c1' \\gset
select retail.cerrar_linea_compra(:'it1', 4, 'no_llego') as k1 \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-ARV1', ${HOY}, 236.00, 'devolucion', null, :'k1') as nc \\gset
${PENDIENTES}`),
  ["0", "0", "0", "1"]
);

exito(
  "C · dos líneas cerradas y la nota por faltante atada al ÚLTIMO cierre (como la manda la pantalla): no queda ningún pendiente fantasma",
  comoFelipe(`${compra([14, 10])}
select (array_agg(id order by cantidad desc))[1] as it1, (array_agg(id order by cantidad desc))[2] as it2 from retail.compra_items where compra_id = :'c1' \\gset
select retail.cerrar_linea_compra(:'it1', 14, 'no_llego') as k1 \\gset
select retail.cerrar_linea_compra(:'it2', 10, 'danada') as k2 \\gset
select cierre_id as ultimo from retail.notas_credito_tablero() where compra_id = :'c1' and clase = 'pendiente' \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-ARV2', ${HOY}, 1416.00, 'faltante', null, :'ultimo') as nc \\gset
${PENDIENTES}`),
  ["0", "0", "0", "1"]
);

exito(
  "C · dos líneas cerradas y una nota por DEVOLUCIÓN atada a la primera: sigue esperando SOLO la otra, con sus 10 u (la regla (a) es por cierre)",
  comoFelipe(`${compra([14, 10])}
select (array_agg(id order by cantidad desc))[1] as it1, (array_agg(id order by cantidad desc))[2] as it2 from retail.compra_items where compra_id = :'c1' \\gset
select retail.cerrar_linea_compra(:'it1', 14, 'no_llego') as k1 \\gset
select retail.cerrar_linea_compra(:'it2', 10, 'danada') as k2 \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-ARV5', ${HOY}, 826.00, 'devolucion', null, :'k1') as nc \\gset
${PENDIENTES}`),
  ["1", "10", "1", "1"]
);

exito(
  "C · una nota por DESCUENTO sin cierre atado no apaga el pendiente (solo la nota por faltante, o una atada al cierre)",
  comoFelipe(`${compra([24])}
select id as it1 from retail.compra_items where compra_id = :'c1' \\gset
select retail.cerrar_linea_compra(:'it1', 4, 'no_llego') as k1 \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-ARV3', ${HOY}, 100.00, 'descuento') as nc \\gset
${PENDIENTES}`),
  ["1", "4", "1", "1"]
);

exito(
  "C · una nota por DEVOLUCIÓN sin cierre atado (así la registra hoy el modal) tampoco lo apaga",
  comoFelipe(`${compra([24])}
select id as it1 from retail.compra_items where compra_id = :'c1' \\gset
select retail.cerrar_linea_compra(:'it1', 4, 'no_llego') as k1 \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-ARV4', ${HOY}, 236.00, 'devolucion') as nc \\gset
${PENDIENTES}`),
  ["1", "4", "1", "1"]
);

// ===========================================================================
// D. fn_rentabilidad: la de producción, solo para el líder
// ===========================================================================

exito(
  "D · fn_rentabilidad tiene el cuerpo de producción (huella 1a61f192…) y la ejecuta solo authenticated",
  `select ${HUELLA("p.prosrc")},
       has_function_privilege('authenticated', p.oid, 'execute'), has_function_privilege('anon', p.oid, 'execute'),
       has_function_privilege('public', p.oid, 'execute'), has_function_privilege('service_role', p.oid, 'execute')
  from pg_proc p where p.oid = '${FIRMA_RENTABILIDAD}'::regprocedure;`,
  ["1a61f19254ea7a84d87b1abdb939734f", "t", "f", "f", "f"]
);

exito(
  "D · el líder la lee (una sola fila de total)",
  `${INICIO}${COMO("authenticated", FELIPE)}
select count(*) from retail.fn_rentabilidad() where nivel = 'total';
rollback;`,
  ["1"]
);

error(
  "D · un integrante (Micaela) recibe «Solo un líder puede ver la rentabilidad»",
  `${INICIO}${COMO("authenticated", MICAELA)}
select count(*) from retail.fn_rentabilidad();
rollback;`,
  "Solo un líder puede ver la rentabilidad"
);

exito(
  "D · anon y la llave del servidor no la ejecutan: 42501",
  `${INICIO}${COMO("anon")}
select ${sonda("select count(*) from retail.fn_rentabilidad()")} as x \\gset
reset role;
${COMO("service_role")}
select :'x', ${sonda("select count(*) from retail.fn_rentabilidad()")};
rollback;`,
  [NEGADO_FN("fn_rentabilidad"), NEGADO_FN("fn_rentabilidad")]
);

// ===========================================================================
// E. Las migraciones: dos veces, sobre la foto de producción, y sus guardas
// ===========================================================================

/**
 * Huella de todo `retail` que estas migraciones podrían tocar: cada función (cuerpo, permisos, atributos) y cada tabla.
 * La llave se arma con el nombre y los oid de los tipos: `regprocedure::text` y los nombres de tipo cambian según el
 * search_path (la migración lo cambia a mitad del caso) y la misma función saldría con dos llaves.
 */
const FOTO = (tabla) => `create temp table ${tabla} as
select 'retail.' || p.proname || '(' || p.proargtypes::text || ')' as k,
       md5(p.prosrc || '|' || coalesce(p.proacl::text, '') || '|' || coalesce(array_to_string(p.proconfig, ';'), '') || '|' || p.prosecdef::text || p.provolatile::text) as h
  from pg_proc p where p.pronamespace = 'retail'::regnamespace
union all
select 'retail.' || c.relname, md5(coalesce(c.relacl::text, '') || c.relrowsecurity::text)
  from pg_class c where c.relnamespace = 'retail'::regnamespace and c.relkind in ('r', 'v', 'm', 'p');`;
/** Los objetos que cambiaron entre dos fotos, por nombre (o «(ninguno)»). */
const CAMBIOS = (antes, despues) =>
  `select coalesce(string_agg(split_part(k, '(', 1), ',' order by k), '(ninguno)') from (
     select coalesce(a.k, d.k) as k from ${antes} a full join ${despues} d on d.k = a.k where a.h is distinct from d.h) z;`;

/**
 * La foto de producción de las tres `_json` (sin el `retail.` delante de la función de adentro), armada desde el cuerpo
 * vivo. Antes de usarla se comprueba que dé las huellas de producción: si no, la prueba no simularía nada.
 */
const JSON_DE_PRODUCCION = `
do $p$
declare f text;
begin
  foreach f in array array['retail.fn_stock_por_sede_json()', 'retail.fn_resumen_comparacion_json(uuid, date, date, date, date)',
                           'retail.fn_resumen_variantes_json(uuid, date, date, date, date)'] loop
    execute regexp_replace(pg_get_functiondef(f::regprocedure), 'from retail\\.(fn_[a-z_]+)\\(', 'from \\1(');
  end loop;
end
$p$;
select string_agg(${HUELLA("prosrc")}, ',' order by proname) as huellas_json from pg_proc
 where pronamespace = 'retail'::regnamespace and proname in ('fn_stock_por_sede_json', 'fn_resumen_comparacion_json', 'fn_resumen_variantes_json') \\gset
`;
const HUELLAS_JSON_PRODUCCION = "cc71c6d66dfce3ccac05c1ac8c16b532,972b6bc8c2a396021fde0aba600c5cd3,4365f3228a2f68db7dabe607f7dd6bb4";

exito(
  "E · A pegada otra vez sobre el estado vivo no cambia nada (idempotente, y lo vivo ya es lo de producción)",
  `begin;
${FOTO("_antes")}
${MIGRACION_A}
${MIGRACION_A}
${FOTO("_despues")}
${CAMBIOS("_antes", "_despues")}
rollback;`,
  ["(ninguno)"]
);

exito(
  "E · A pegada sobre la foto de producción de las `_json` cambia EXACTAMENTE esas tres (y nada más)",
  `begin;
${JSON_DE_PRODUCCION}
${FOTO("_antes")}
${MIGRACION_A}
${FOTO("_despues")}
select :'huellas_json';
${CAMBIOS("_antes", "_despues")}
rollback;`,
  ["retail.fn_resumen_comparacion_json,retail.fn_resumen_variantes_json,retail.fn_stock_por_sede_json"]
);

exito(
  "E · (la foto de las `_json` de arriba es fiel: da las huellas de producción del 2026-09-28)",
  `begin;
${JSON_DE_PRODUCCION}
select :'huellas_json';
rollback;`,
  [HUELLAS_JSON_PRODUCCION]
);

error(
  "E · la guarda de A aborta si una `_json` tiene un cuerpo que no es ni el de main ni el de producción",
  `begin;
create or replace function retail.fn_stock_por_sede_json() returns jsonb language sql stable
  set search_path to 'retail', 'public', 'extensions' as $$ select '[]'::jsonb $$;
${MIGRACION_A}
rollback;`,
  "cambió después del 2026-09-28"
);

error(
  "E · la guarda de A aborta si fn_rentabilidad ya existe con otro cuerpo (p. ej. el PR #168 la cambió)",
  `begin;
create or replace function ${FIRMA_RENTABILIDAD.replace("(date, integer, numeric)", "(p_dia date default null, p_dias integer default 90, p_igv numeric default 0.18)")}
  returns table (nivel text, clave text, etiqueta text, unidades integer, venta_neta numeric, venta_neta_con_costo numeric, costo numeric,
                 unidades_sin_costo integer, descuento numeric, unidades_devueltas integer, stock integer, dias_ventana integer, desde date, hasta date)
  language sql stable as $$ select null::text, null::text, null::text, 0, 0::numeric, 0::numeric, 0::numeric, 0, 0::numeric, 0, 0, 0, null::date, null::date $$;
${MIGRACION_A}
rollback;`,
  "cambió después del 2026-09-28"
);

// La dueña que pierde su EXECUTE: en el Postgres del CI `postgres` NO es superusuario, así que basta con quitárselo; en el
// desechable sí lo es (se salta toda ACL), y hay que darle la función a una dueña que no lo sea.
const superusuario = (() => {
  try {
    return psql("select rolsuper from pg_roles where rolname = current_user;").trim() === "t";
  } catch {
    return false;
  }
})();
const DUENA = `ev_duena_${Math.random().toString(36).slice(2, 8)}`;
const QUITAR_A_LA_DUENA = superusuario
  ? `create role ${DUENA} nologin;
alter function ${FIRMA_NOTA} owner to ${DUENA};
revoke execute on function ${FIRMA_NOTA} from ${DUENA};`
  : `revoke execute on function ${FIRMA_NOTA} from current_user;`;

error(
  "E · la verificación de A aborta, nombrando a la dueña, si la dueña de emitir_nota perdió su propio EXECUTE",
  `begin;
${QUITAR_A_LA_DUENA}
${MIGRACION_A}
rollback;`,
  "La dueña de retail.emitir_nota"
);

if (superusuario) {
  exito(
    "E · y con una dueña NO superusuaria que conserva su EXECUTE, A pasa y la función queda solo para ella",
    `begin;
create role ${DUENA} nologin;
alter function ${FIRMA_NOTA} owner to ${DUENA};
${MIGRACION_A}
select proacl::text = '{${DUENA}=X/${DUENA}}' from pg_proc where oid = '${FIRMA_NOTA}'::regprocedure;
rollback;`,
    ["t"]
  );
} else {
  omitir("E · con una dueña NO superusuaria que conserva su EXECUTE, A pasa", "aquí `postgres` no es superusuario: la dueña real ya la verifica cada pegado de A");
}

// Un `revoke` solo quita lo que otorgó quien lo corre: un permiso que dio OTRO rol sobrevive a los `revoke` de A. Para
// eso está su verificación final: aborta en vez de dar la puerta por cerrada. (Crear el rol que otorga pide ser
// superusuario; en el CI se omite y la verificación la sigue corriendo cada pegado de A.)
const OTORGANTE = `${DUENA}_g`;
if (superusuario) {
  error(
    "E · la verificación de A aborta si otro rol le dio escritura de stock a service_role (el revoke de A no la quita)",
    `begin;
create role ${OTORGANTE} nologin;
grant usage on schema retail to ${OTORGANTE};
grant insert on retail.stock to ${OTORGANTE} with grant option;
set local role ${OTORGANTE};
grant insert on retail.stock to service_role;
reset role;
${MIGRACION_A}
rollback;`,
    "service_role todavía tiene insert sobre retail.stock"
  );
  error(
    "E · la verificación de A aborta si otro rol le dio EXECUTE de emitir_nota a authenticated (el revoke de A no lo quita)",
    `begin;
create role ${OTORGANTE} nologin;
grant usage on schema retail to ${OTORGANTE};
grant execute on function ${FIRMA_NOTA} to ${OTORGANTE} with grant option;
set local role ${OTORGANTE};
grant execute on function ${FIRMA_NOTA} to authenticated;
reset role;
${MIGRACION_A}
rollback;`,
    "todavía la puede ejecutar authenticated"
  );
} else {
  omitir("E · la verificación de A aborta con un permiso que otorgó otro rol", "aquí `postgres` no es superusuario y no puede crear el rol que otorga");
}

/** Los cuerpos de producción de las dos de notas de crédito: los de esta migración sin la regla (b). */
const SIN_REGLA_B = (sql) =>
  sql
    .replace(/\n\s*-- \(b\) \.\.\.y el comprobante[^\n]*\n\s*and not exists \(\n\s*select 1 from compra_notas_credito n\n\s*where n\.compra_id = c\.id and n\.motivo = 'faltante'\n\s*\)/, "")
    .replace(/\n\s*and not exists \(\n\s*select 1 from retail\.compra_notas_credito n\n\s*where n\.compra_id = c\.id and n\.motivo = 'faltante'\n\s*\)/, "");
const CREAR_B = MIGRACION_B.slice(MIGRACION_B.indexOf("create or replace function retail.compras_nota_pendiente"), MIGRACION_B.indexOf("-- ── VERIFICACIÓN FINAL"));
const NOTAS_DE_PRODUCCION = SIN_REGLA_B(CREAR_B);
if (NOTAS_DE_PRODUCCION === CREAR_B || (CREAR_B.match(/n\.motivo = 'faltante'/g) ?? []).length !== 2) {
  console.error("✗ no pude armar la foto de producción de las notas de crédito desde 20260928200100 (¿cambió su texto?)");
  process.exit(1);
}

exito(
  "E · B pegada sobre la foto de producción (huellas fe0f9ae0… y 802b9630…) cambia EXACTAMENTE esas dos",
  `begin;
${NOTAS_DE_PRODUCCION}
select string_agg(${HUELLA("prosrc")}, ',' order by proname) as antes from pg_proc
 where pronamespace = 'retail'::regnamespace and proname in ('compras_nota_pendiente', 'notas_credito_tablero') \\gset
${FOTO("_antes")}
${MIGRACION_B}
${FOTO("_despues")}
select :'antes';
${CAMBIOS("_antes", "_despues")}
rollback;`,
  ["retail.compras_nota_pendiente,retail.notas_credito_tablero"]
);

exito(
  "E · (la foto de producción de las dos es fiel: da sus huellas del 2026-09-28)",
  `begin;
${NOTAS_DE_PRODUCCION}
select string_agg(${HUELLA("prosrc")}, ',' order by proname) from pg_proc
 where pronamespace = 'retail'::regnamespace and proname in ('compras_nota_pendiente', 'notas_credito_tablero');
rollback;`,
  ["fe0f9ae0f1b0f987af947a8f3f620e60,802b963051dae7e16a631b8f8efcf6c2"]
);

exito(
  "E · B pegada otra vez sobre el estado vivo no cambia nada",
  `begin;
${FOTO("_antes")}
${MIGRACION_B}
${FOTO("_despues")}
${CAMBIOS("_antes", "_despues")}
rollback;`,
  ["(ninguno)"]
);

error(
  "E · la guarda de B aborta con un cuerpo desconocido de compras_nota_pendiente",
  `begin;
${CREAR_B.slice(0, CREAR_B.indexOf("comment on function")).replace("group by c.id;", "group by c.id having true;")}
${MIGRACION_B}
rollback;`,
  "cambió después del 2026-09-28"
);

// ===========================================================================
// F. Cerrar las puertas no rompe la tienda: lo que la persona SÍ llama sigue emitiendo, COMO authenticated
// ===========================================================================
// Las cuatro funciones quedan solo para su dueña, y las que llama la tienda (security definer) corren con los permisos
// de esa dueña. En el CI y en producción la dueña (`postgres`) NO es superusuaria, así que si perdiera su EXECUTE la
// venta se caería. Aquí `postgres` sí lo es y se saltaría toda ACL: por eso, dentro del ROLLBACK, la función que llama
// la tienda pasa a una dueña NO superusuaria que hereda los permisos de `postgres` (como la dueña real).

const FIRMA_VENTA = "retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text)";
const FIRMA_APROBAR = "retail.aprobar_devolucion(uuid, numeric, text, uuid)";
const SANDRA = "22222222-2222-4222-8222-000000000005"; // otra líder: quien registró la devolución no puede aprobarla

/** Pasa las funciones a una dueña NO superusuaria que hereda de `postgres` (solo si `postgres` es superusuario). */
const DUENA_COMO_EN_PRODUCCION = (firmas) =>
  superusuario
    ? `create role ${DUENA}_f nologin;
grant postgres to ${DUENA}_f;
${firmas.map((f) => `alter function ${f} owner to ${DUENA}_f;`).join("\n")}
select rolsuper::text as _super_f from pg_roles where rolname = '${DUENA}_f' \\gset
`
    : `select 'false' as _super_f \\gset
`;

/** Tienda Lima con piso, caja abierta y 10 u de BLU-EMMA-NEG-M. Deja `:ubic`, `:v1`, `:v1_precio` y `:stock_antes`. */
const TIENDA_LISTA = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset
select id as v1, precio as v1_precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 10, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
select coalesce(sum(cantidad), 0) as stock_antes from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic' \\gset
`;
const VENDER_CON_BOLETA = `select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', :'v1_precio')),
  null, gen_random_uuid(), 'boleta') as venta_id \\gset`;
const QUITAR_EMITIR_A_LA_DUENA = `revoke execute on function ${FIRMA_COMPROBANTE} from postgres;`;

exito(
  "F · COMO authenticated, una venta con boleta emite su comprobante y baja el stock (emitir_comprobante y fn_aplicar_movimiento por dentro)",
  `${TIENDA_LISTA}${DUENA_COMO_EN_PRODUCCION([FIRMA_VENTA])}
${COMO("authenticated", FELIPE)}
${VENDER_CON_BOLETA}
reset role;
select :'_super_f',
       (select string_agg(tipo, ',') from retail.comprobantes where venta_id = :'venta_id'),
       (select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic') - :'stock_antes';
rollback;`,
  ["false", "boleta", "-1"]
);

error(
  "F · CONTROL: si la dueña pierde su EXECUTE de emitir_comprobante, la misma venta se cae (la prueba de arriba mira la llamada de adentro)",
  `${TIENDA_LISTA}${DUENA_COMO_EN_PRODUCCION([FIRMA_VENTA])}
${QUITAR_EMITIR_A_LA_DUENA}
${COMO("authenticated", FELIPE)}
${VENDER_CON_BOLETA}
rollback;`,
  "permission denied for function emitir_comprobante"
);

/** Venta con boleta ACEPTADA por SUNAT, serie de notas en la sede y una devolución pendiente registrada por Felipe. */
const DEVOLUCION_LISTA = `${TIENDA_LISTA}
${VENDER_CON_BOLETA}
update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox' where venta_id = :'venta_id';
insert into retail.series_comprobantes (ubicacion_id, tipo, serie)
  select :'ubic', 'nota_credito', 'BC01' where not exists (select 1 from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'nota_credito');
select id as venta_item from retail.venta_items where venta_id = :'venta_id' \\gset
select retail.crear_devolucion(:'venta_id', :'ubic',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'venta_item', 'cantidad', 1, 'condicion', 'vendible')),
  'prueba automatizada', 'otro') as devolucion_id \\gset
`;

exito(
  "F · COMO authenticated (otra líder), aprobar la devolución de una venta aceptada emite su nota de crédito (emitir_nota por dentro)",
  `${DEVOLUCION_LISTA}${DUENA_COMO_EN_PRODUCCION([FIRMA_APROBAR])}
${COMO("authenticated", SANDRA)}
select 1 as _a from retail.aprobar_devolucion(:'devolucion_id', null, null) \\gset
reset role;
select :'_super_f', d.estado, c.tipo, c.comprobante_original_id = (select id from retail.comprobantes where venta_id = :'venta_id' and tipo = 'boleta')
  from retail.devoluciones d join retail.comprobantes c on c.id = d.nota_credito_id where d.id = :'devolucion_id';
rollback;`,
  ["false", "aprobada", "nota_credito", "t"]
);

error(
  "F · CONTROL: si la dueña pierde su EXECUTE de emitir_nota, la misma aprobación se cae",
  `${DEVOLUCION_LISTA}${DUENA_COMO_EN_PRODUCCION([FIRMA_APROBAR])}
revoke execute on function ${FIRMA_NOTA} from postgres;
${COMO("authenticated", SANDRA)}
select 1 as _a from retail.aprobar_devolucion(:'devolucion_id', null, null) \\gset
rollback;`,
  "permission denied for function emitir_nota"
);

// ---------------------------------------------------------------------------

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  let fallos = 0;
  let omitidos = 0;
  for (const caso of CASOS) {
    if (caso.tipo === "omitido") {
      omitidos++;
      console.log(`↷ ${caso.nombre} (omitido: ${caso.motivo})`);
      continue;
    }
    const resultado = correr(caso.sql);
    if (caso.tipo === "error") {
      if (resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!resultado.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error con "${caso.contiene}", salió:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    } else if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
    } else {
      // La última línea de salida es la fila de verificación.
      const ultima = resultado.salida.split("\n").filter(Boolean).pop() ?? "";
      const columnas = ultima.split("|");
      const igual = columnas.length === caso.esperado.length && columnas.every((v, i) => v === caso.esperado[i]);
      if (!igual) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    esperado: ${JSON.stringify(caso.esperado)}\n    salió:    ${JSON.stringify(columnas)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    }
  }

  const corridos = CASOS.length - omitidos;
  console.log(`\n${corridos - fallos}/${corridos} pruebas en verde${omitidos ? ` (${omitidos} omitida${omitidos === 1 ? "" : "s"})` : ""}.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
