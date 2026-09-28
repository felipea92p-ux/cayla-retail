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
 *   D. `fn_rentabilidad`: la ejecuta `authenticated` y nadie más de la app, y adentro solo deja al líder. (Su cuerpo lo
 *      verifica la propia migración al pegarse; aquí no se fija, para que una migración posterior pueda cambiarlo.)
 *   E. El PEGADO de las dos migraciones, sobre la foto de producción del 2026-09-28 armada dentro del ROLLBACK desde el
 *      TEXTO de cada migración (no desde el estado vivo): la primera vez cambian SOLO lo que dicen (las tres `_json`; las
 *      dos de notas de crédito), la segunda nada, y los permisos quedan en la lista EXPLÍCITA de producción; sus guardas
 *      abortan con un cuerpo desconocido, y la verificación de A con una dueña sin EXECUTE, un permiso que dio otro rol,
 *      un permiso de columna o una lectura para `anon`. Como no parten de los cuerpos vivos, una migración posterior que
 *      cambie una de estas funciones (algo legítimo) no las pone rojas; si cambia la FIRMA de una de las cuatro que A
 *      exige, A ya no se puede pegar sobre esta base y esas pruebas se omiten con un aviso que lo dice.
 *   F. Cerrar las puertas no rompe la tienda: COMO `authenticated`, una venta con boleta sigue emitiendo su comprobante y
 *      bajando el stock (emitir_comprobante y fn_aplicar_movimiento por dentro), y aprobar una devolución de una venta
 *      aceptada por SUNAT sigue emitiendo su nota de crédito (emitir_nota por dentro).
 * Cada caso de A, B y F tiene su CONTROL: con la puerta abierta a propósito (A, B) o cerrada también para la dueña (F),
 * dentro del ROLLBACK, la misma sonda da lo contrario. Si no, la prueba no probaría nada.
 *
 * CÓMO. Como las demás de `scripts/pruebas`: `docker exec ... psql`, una transacción por caso que TERMINA EN ROLLBACK
 * (nunca se commitea nada), `set local role` para que el permiso se evalúe de verdad (en el Postgres del CI `postgres`
 * no es superusuario; en el desechable sí, y se salta toda ACL). Los mismos casos corren en los dos: los roles de prueba
 * (la dueña, el que otorga) se crean con `create role` + `grant <rol> to current_user`, que alcanza con CREATEROLE. Las sondas corren la sentencia dentro de una función
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

const FIRMA_NOTA = "retail.emitir_nota(uuid, text, text, numeric, numeric, numeric, jsonb)";
const FIRMA_RENTABILIDAD = "retail.fn_rentabilidad(date, integer, numeric)";

/** Huella normalizada de un cuerpo: la misma de `deriva.sql` y de las guardas de las migraciones. */
const HUELLA = (expr) =>
  `md5(regexp_replace(regexp_replace(regexp_replace(${expr}, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))`;

/**
 * Aplica `accion` (con `%s` en el lugar de la función) a TODAS las sobrecargas de esos nombres en `retail`: un control no
 * se cae porque una migración posterior le cambió la firma a una función (le agregó un parámetro, por ejemplo).
 */
const A_TODAS = (nombres, accion) => `do $t$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
            where p.pronamespace = 'retail'::regnamespace and p.proname in (${nombres.map((n) => `'${n}'`).join(", ")}) loop
    execute format('${accion}', f);
  end loop;
end
$t$;
`;

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
  `select count(*) filter (where abierta), count(*) filter (where not duena_puede), count(distinct proname)
from (
  select p.oid, p.proname,
         exists (select 1 from (values ('public'), ('anon'), ('authenticated'), ('service_role')) g(rol)
                  where has_function_privilege(g.rol, p.oid, 'execute')) as abierta,
         has_function_privilege(p.proowner, p.oid, 'execute') as duena_puede
    from pg_proc p
   where p.pronamespace = 'retail'::regnamespace
     and p.proname in ('emitir_comprobante', 'emitir_nota', 'fn_aplicar_movimiento', 'recalcular_stock')
) z;`,
  ["0", "0", "4"]
);

exito(
  "A · CONTROL: con EXECUTE devuelto a authenticated y service_role, las mismas sondas ya NO dan 42501",
  `${INICIO}
${A_TODAS(["emitir_comprobante", "emitir_nota"], "grant execute on function %s to authenticated")}
${A_TODAS(["fn_aplicar_movimiento", "recalcular_stock"], "grant execute on function %s to service_role")}
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

/**
 * Los permisos de los roles de la app (PUBLIC, anon, authenticated, service_role) sobre todo lo que toca ADR-0252, en una
 * línea «objeto:rol=privilegios». Por tabla Y por columna (un `grant update (cantidad)` no sale en has_table_privilege y
 * deja escribir igual), y por función (todas las sobrecargas del nombre). Se compara contra la lista EXPLÍCITA de
 * producción, nunca contra una foto de la misma base: esa comparación sería circular y no vería un permiso de más que
 * trajera la propia migración.
 */
const PERMISOS_APP = `(with roles(rol) as (values ('public'), ('anon'), ('authenticated'), ('service_role')),
tablas(t) as (values ('retail.movimientos'), ('retail.stock')),
tpriv(p) as (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')),
cpriv(p) as (values ('select'), ('insert'), ('update'), ('references')),
filas as (
  select split_part(t, '.', 2) as objeto, rol, p as priv from tablas, roles, tpriv where has_table_privilege(rol, t, p)
  union all
  select split_part(t, '.', 2), rol, 'columna:' || p from tablas, roles, cpriv
   where has_any_column_privilege(rol, t, p) and not has_table_privilege(rol, t, p)
  union all
  select f.proname::text, rol, 'execute' from pg_proc f, roles
   where f.pronamespace = 'retail'::regnamespace
     and f.proname in ('emitir_comprobante', 'emitir_nota', 'fn_aplicar_movimiento', 'recalcular_stock', 'fn_rentabilidad',
                       'fn_stock_por_sede_json', 'fn_resumen_comparacion_json', 'fn_resumen_variantes_json')
     and has_function_privilege(rol, f.oid, 'execute')
)
select coalesce(string_agg(objeto || ':' || rol || '=' || privs, ' ' order by objeto collate "C", rol collate "C"), '(ninguno)')
  from (select objeto, rol, string_agg(distinct priv, ',' order by priv) as privs from filas group by objeto, rol) z)`;

/** Lo que producción tiene (consultado el 2026-09-28): las cuatro cerradas, sin nadie de la app; las tablas, solo lectura. */
const PERMISOS_DE_PRODUCCION = [
  "fn_rentabilidad:authenticated=execute",
  "fn_resumen_comparacion_json:authenticated=execute",
  "fn_resumen_variantes_json:authenticated=execute",
  "fn_stock_por_sede_json:authenticated=execute",
  "movimientos:authenticated=select",
  "movimientos:service_role=references,select,trigger",
  "stock:authenticated=select",
  "stock:service_role=references,select,trigger",
].join(" ");

exito(
  "B · estado vivo: los roles de la app tienen EXACTAMENTE los permisos de producción (tabla, columna y función), ni uno de más",
  `select ${PERMISOS_APP};`,
  [PERMISOS_DE_PRODUCCION]
);

exito(
  "B · CONTROL: un update de UNA columna de stock para authenticated y una lectura de movimientos para anon sí cambian esa lista",
  `begin;
grant update (cantidad) on retail.stock to authenticated;
grant select on retail.movimientos to anon;
select ${PERMISOS_APP};
rollback;`,
  [
    PERMISOS_DE_PRODUCCION.replace("movimientos:authenticated=select", "movimientos:anon=select movimientos:authenticated=select").replace(
      "stock:authenticated=select",
      "stock:authenticated=columna:update,select"
    ),
  ]
);

// ===========================================================================
// C. Notas de crédito de compras: ¿el cierre sigue esperando su nota? (20260928200100)
// ===========================================================================

/** Proveedor, las sedes y la variante del seed. */
const BASE = `
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
`;
const HOY = "retail.fn_hoy_lima()";

/**
 * Un comprobante a crédito con la RPC real: una línea por cantidad, a S/ 50 + IGV 18 % (S/ 59 la unidad). Deja `:<v>`
 * (por omisión `:c1`), gestionado por `:<gestora>` (por omisión el Taller).
 */
const compra = (lineas, { v = "c1", gestora = "taller" } = {}) => `
select retail.registrar_compra(:'prov1', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'${gestora}',
  jsonb_build_array(${lineas.map((c) => `jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', ${c}, 'costo_unitario', 50)`).join(", ")}),
  p_tipo => 'factura', p_fecha_emision => ${HOY}, p_fecha_vencimiento => ${HOY} + 10, p_igv_porcentaje => 18) as ${v} \\gset
`;

/** Un comprobante de UNA línea, cerrada ENTERA (nada llegó). Deja `:<v>` y su cierre `:k_<v>`. */
const compraCerrada = (cantidad, { v = "c1", gestora = "taller" } = {}) => `${compra([cantidad], { v, gestora })}
select retail.cerrar_linea_compra((select id from retail.compra_items where compra_id = :'${v}'), ${cantidad}, 'no_llego') as k_${v} \\gset
`;

/**
 * Lo que espera el comprobante `:<v>` en las dos lecturas: filas «pendiente» del tablero, sus unidades y su monto
 * esperado; filas de la lista y su monto esperado; y notas del tablero. El monto importa: con dos cierres, el que sigue
 * esperando tiene que pedir SOLO lo suyo (sumar los dos es el doble conteo que Felipe pidió corregir el 2026-09-22).
 */
const PENDIENTES = (v = "c1") => `select
  (select count(*) from retail.notas_credito_tablero() where compra_id = :'${v}' and clase = 'pendiente'),
  (select coalesce(sum(unidades_cerradas), 0) from retail.notas_credito_tablero() where compra_id = :'${v}' and clase = 'pendiente'),
  (select coalesce(sum(monto_esperado), 0)::numeric(12, 2) from retail.notas_credito_tablero() where compra_id = :'${v}' and clase = 'pendiente'),
  (select count(*) from retail.compras_nota_pendiente(array[:'${v}'::uuid])),
  (select coalesce(sum(monto_esperado), 0)::numeric(12, 2) from retail.compras_nota_pendiente(array[:'${v}'::uuid])),
  (select count(*) from retail.notas_credito_tablero() where compra_id = :'${v}' and clase = 'nota');`;

const comoFelipe = (sql) => `begin;\nset local request.jwt.claim.sub = '${FELIPE}';\n${BASE}${sql}\nrollback;`;

/** Le da (dentro de la transacción) esos módulos de Compras al rol «integrante», que es el de Micaela (fija a Trujillo). */
const MODULOS_DE_COMPRAS = (...claves) =>
  `delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo in ('facturas_compra', 'por_pagar', 'notas_credito');
${claves.length ? `insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('integrante'), m from unnest(array[${claves.map((c) => `'${c}'`).join(", ")}]) m;` : ""}
`;

exito(
  "C · un cierre sin ninguna nota espera su nota en el tablero y en la lista (4 u, S/ 236.00)",
  comoFelipe(`${compra([24])}
select id as it1 from retail.compra_items where compra_id = :'c1' \\gset
select retail.cerrar_linea_compra(:'it1', 4, 'no_llego') as k1 \\gset
${PENDIENTES()}`),
  ["1", "4", "236.00", "1", "236.00", "0"]
);

exito(
  "C · un cierre saldado con una nota por DEVOLUCIÓN atada a él ya no espera (el caso que arregló producción)",
  comoFelipe(`${compra([24])}
select id as it1 from retail.compra_items where compra_id = :'c1' \\gset
select retail.cerrar_linea_compra(:'it1', 4, 'no_llego') as k1 \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-ARV1', ${HOY}, 236.00, 'devolucion', null, :'k1') as nc \\gset
${PENDIENTES()}`),
  ["0", "0", "0.00", "0", "0.00", "1"]
);

exito(
  "C · dos líneas cerradas y la nota por faltante atada al ÚLTIMO cierre (como la manda la pantalla): no queda ningún pendiente fantasma",
  comoFelipe(`${compra([14, 10])}
select (array_agg(id order by cantidad desc))[1] as it1, (array_agg(id order by cantidad desc))[2] as it2 from retail.compra_items where compra_id = :'c1' \\gset
select retail.cerrar_linea_compra(:'it1', 14, 'no_llego') as k1 \\gset
select retail.cerrar_linea_compra(:'it2', 10, 'danada') as k2 \\gset
select cierre_id as ultimo from retail.notas_credito_tablero() where compra_id = :'c1' and clase = 'pendiente' \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-ARV2', ${HOY}, 1416.00, 'faltante', null, :'ultimo') as nc \\gset
${PENDIENTES()}`),
  ["0", "0", "0.00", "0", "0.00", "1"]
);

exito(
  "C · dos líneas cerradas y una nota por DEVOLUCIÓN atada a la primera: sigue esperando SOLO la otra, con sus 10 u y sus S/ 590.00 (la regla (a) es por cierre)",
  comoFelipe(`${compra([14, 10])}
select (array_agg(id order by cantidad desc))[1] as it1, (array_agg(id order by cantidad desc))[2] as it2 from retail.compra_items where compra_id = :'c1' \\gset
select retail.cerrar_linea_compra(:'it1', 14, 'no_llego') as k1 \\gset
select retail.cerrar_linea_compra(:'it2', 10, 'danada') as k2 \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-ARV5', ${HOY}, 826.00, 'devolucion', null, :'k1') as nc \\gset
${PENDIENTES()}`),
  ["1", "10", "590.00", "1", "590.00", "1"]
);

exito(
  "C · una nota por DESCUENTO sin cierre atado no apaga el pendiente (solo la nota por faltante, o una atada al cierre)",
  comoFelipe(`${compra([24])}
select id as it1 from retail.compra_items where compra_id = :'c1' \\gset
select retail.cerrar_linea_compra(:'it1', 4, 'no_llego') as k1 \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-ARV3', ${HOY}, 100.00, 'descuento') as nc \\gset
${PENDIENTES()}`),
  ["1", "4", "236.00", "1", "236.00", "1"]
);

exito(
  "C · una nota por DEVOLUCIÓN sin cierre atado (así la registra hoy el modal) tampoco lo apaga",
  comoFelipe(`${compra([24])}
select id as it1 from retail.compra_items where compra_id = :'c1' \\gset
select retail.cerrar_linea_compra(:'it1', 4, 'no_llego') as k1 \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-ARV4', ${HOY}, 236.00, 'devolucion') as nc \\gset
${PENDIENTES()}`),
  ["1", "4", "236.00", "1", "236.00", "1"]
);

// La regla (a) es «de cualquier motivo» y NO mira el monto: una nota chica atada a un cierre lo apaga entero. Es lo que se
// decidió (ADR-0252, «Se rompe si»), y por eso la pantalla solo ata la nota por faltante: si algún día ata otras, tiene que
// ser cuando la nota cubre el esperado de ese cierre. Esta prueba lo deja a la vista (y que el motivo no importa).
exito(
  "C · una nota por DESCUENTO de S/ 50 atada a un cierre de S/ 590 lo apaga ENTERO: la regla (a) es de cualquier motivo y no mira el monto",
  comoFelipe(`${compraCerrada(10)}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-ARV6', ${HOY}, 50.00, 'descuento', null, :'k_c1') as nc \\gset
${PENDIENTES()}`),
  ["0", "0", "0.00", "0", "0.00", "1"]
);

exito(
  "C · (el cierre de arriba sí esperaba S/ 590.00 antes de la nota chica)",
  comoFelipe(`${compraCerrada(10)}
${PENDIENTES()}`),
  ["1", "10", "590.00", "1", "590.00", "0"]
);

exito(
  "C · dos comprobantes: la nota por faltante de UNO no apaga el pendiente del OTRO (la regla (b) es por comprobante)",
  comoFelipe(`${compraCerrada(4, { v: "c1" })}${compraCerrada(4, { v: "c2" })}
select retail.registrar_nota_credito_compra(:'c2', 'FC01-ARV7', ${HOY}, 236.00, 'faltante', null, :'k_c2') as nc \\gset
${PENDIENTES("c1")}`),
  ["1", "4", "236.00", "1", "236.00", "0"]
);

exito(
  "C · con el módulo Notas de crédito, Micaela (Trujillo) ve el pendiente de su sede y NO el de Lima, en el tablero y en la lista",
  comoFelipe(`${MODULOS_DE_COMPRAS("notas_credito")}${compraCerrada(4, { v: "c1", gestora: "lima" })}${compraCerrada(4, { v: "c2", gestora: "trujillo" })}
set local request.jwt.claim.sub = '${MICAELA}';
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
select (select count(*) from retail.notas_credito_tablero() where compra_id = :'c1' and clase = 'pendiente'),
       (select count(*) from retail.compras_nota_pendiente(array[:'c1'::uuid])),
       (select count(*) from retail.notas_credito_tablero() where compra_id = :'c2' and clase = 'pendiente'),
       (select count(*) from retail.compras_nota_pendiente(array[:'c2'::uuid]));`),
  ["0", "0", "1", "1"]
);

exito(
  "C · sin módulos de Compras, Micaela no recibe nada de la lista y el tablero la rechaza (42501)",
  `${INICIO}set local request.jwt.claim.sub = '${FELIPE}';
${BASE}${MODULOS_DE_COMPRAS()}${compraCerrada(4, { v: "c1", gestora: "trujillo" })}
${COMO("authenticated", MICAELA)}
select (select count(*) from retail.compras_nota_pendiente(array[:'c1'::uuid])), left(${sonda("select count(*) from retail.notas_credito_tablero()")}, 5);
rollback;`,
  ["0", "42501"]
);

// ===========================================================================
// D. fn_rentabilidad: solo para el líder
// ===========================================================================

// Sin fijar su cuerpo: lo verifica la migración A al pegarse, y una migración posterior tiene que poder cambiarlo.
exito(
  "D · fn_rentabilidad la ejecuta authenticated y nadie más de la app",
  `select has_function_privilege('authenticated', p.oid, 'execute'), has_function_privilege('anon', p.oid, 'execute'),
       has_function_privilege('public', p.oid, 'execute'), has_function_privilege('service_role', p.oid, 'execute')
  from pg_proc p where p.oid = '${FIRMA_RENTABILIDAD}'::regprocedure;`,
  ["t", "f", "f", "f"]
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
// E. El pegado de las migraciones: sobre la foto de producción, dos veces, y sus guardas
// ===========================================================================
// Estas pruebas NO parten de los cuerpos vivos. Arman, dentro del ROLLBACK, la foto de producción del 2026-09-28 de lo
// que cada migración recrea, sacada del TEXTO de la propia migración (que no cambia una vez en main), y pegan encima. Así
// una migración posterior que cambie una de estas funciones —algo legítimo— no las pone rojas ni le pide a nadie editar
// una migración ya fusionada: lo que queda en la base lo siguen vigilando los candados de estado vivo (A, B, C, D).

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
/** Los objetos que cambiaron entre dos fotos, por nombre (o «(ninguno)»), como expresión. */
const CAMBIOS = (antes, despues) =>
  `(select coalesce(string_agg(split_part(k, '(', 1), ',' order by k), '(ninguno)') from (
     select coalesce(a.k, d.k) as k from ${antes} a full join ${despues} d on d.k = a.k where a.h is distinct from d.h) z)`;

/** Un tramo del texto de una migración, entre dos marcas. Si una marca no está, el texto cambió: se detiene todo. */
function tramo(texto, desde, hasta, que) {
  const i = texto.indexOf(desde);
  const j = texto.indexOf(hasta, i + 1);
  if (i < 0 || j < 0) {
    console.error(`✗ no encontré ${que} en el texto de la migración (¿cambió?): marcas «${desde}» … «${hasta}»`);
    process.exit(1);
  }
  return texto.slice(i, j);
}

const FIRMAS_JSON = [
  "retail.fn_stock_por_sede_json()",
  "retail.fn_resumen_comparacion_json(uuid, date, date, date, date)",
  "retail.fn_resumen_variantes_json(uuid, date, date, date, date)",
];
const JSON_DE_A = tramo(MIGRACION_A, "create or replace function retail.fn_resumen_variantes_json(", "-- ── 6.", "las tres `_json` de A");
/** Las `_json` de producción: las de `main` sin el `retail.` delante de la función de adentro (la única diferencia). */
const JSON_DE_PRODUCCION = JSON_DE_A.replace(/from retail\.(fn_[a-z_]+)\(/g, "from $1(");
if ((JSON_DE_A.match(/from retail\.fn_[a-z_]+\(/g) ?? []).length !== 3) {
  console.error("✗ no pude armar la foto de producción de las `_json` desde 20260928200000 (¿cambió su texto?)");
  process.exit(1);
}

/**
 * La foto de producción del 2026-09-28 de lo que A recrea: fn_rentabilidad (A trae el cuerpo de producción) y las tres
 * `_json` de producción, con los permisos de producción (solo `authenticated`). Se borran y se crean de nuevo para no
 * depender de lo que dejó una migración posterior (otro tipo de retorno, otra firma): es una foto, no una edición.
 */
const FOTO_PRODUCCION_A = `
drop function if exists ${FIRMA_RENTABILIDAD};
${tramo(MIGRACION_A, "create or replace function retail.fn_rentabilidad(", "-- ── 5.", "fn_rentabilidad de A")}
${FIRMAS_JSON.map((f) => `drop function if exists ${f};`).join("\n")}
${JSON_DE_PRODUCCION}
revoke all on function ${FIRMAS_JSON.join(", ")} from public, anon, service_role;
grant execute on function ${FIRMAS_JSON.join(", ")} to authenticated;
`;
const HUELLAS_FOTO_A = `(select string_agg(${HUELLA("prosrc")}, ',' order by proname) from pg_proc
  where pronamespace = 'retail'::regnamespace
    and proname in ('fn_rentabilidad', 'fn_stock_por_sede_json', 'fn_resumen_comparacion_json', 'fn_resumen_variantes_json'))`;

// A exige estas cuatro firmas, las del 2026-09-28 (su guarda). NO se actualizan aunque cambien en la base: si una migración
// posterior cambia una, A ya no se puede pegar sobre esta base y sus pruebas de pegado se omiten (ya cumplieron). Una guarda
// de A que pidiera OTRA firma, en cambio, aborta sobre esta base y las pone rojas.
const FIRMAS_QUE_A_EXIGE = [
  "retail.emitir_comprobante(uuid, text, numeric, numeric, numeric, uuid, text, text, text, jsonb, uuid)",
  "retail.emitir_nota(uuid, text, text, numeric, numeric, numeric, jsonb)",
  "retail.fn_aplicar_movimiento(uuid)",
  "retail.recalcular_stock()",
];
const FIRMAS_QUE_FALTAN = (() => {
  try {
    return psql(`select string_agg(f, ', ') from unnest(array[${FIRMAS_QUE_A_EXIGE.map((f) => `'${f}'`).join(", ")}]) f where to_regprocedure(f) is null;`).trim();
  } catch {
    return "";
  }
})();
const MOTIVO_SIN_A = `una migración posterior cambió ${FIRMAS_QUE_FALTAN}: A exige la firma del 2026-09-28 y ya no se puede pegar sobre esta base (esta prueba de pegado ya cumplió)`;
const exitoA = (nombre, sql, esperado) => (FIRMAS_QUE_FALTAN ? omitir(nombre, MOTIVO_SIN_A) : exito(nombre, sql, esperado));
const errorA = (nombre, sql, contiene) => (FIRMAS_QUE_FALTAN ? omitir(nombre, MOTIVO_SIN_A) : error(nombre, sql, contiene));

exitoA(
  "E · la foto de producción de lo que A recrea es fiel: las huellas y los permisos de producción del 2026-09-28",
  `begin;
${FOTO_PRODUCCION_A}
select ${HUELLAS_FOTO_A}, ${PERMISOS_APP};
rollback;`,
  ["1a61f19254ea7a84d87b1abdb939734f,cc71c6d66dfce3ccac05c1ac8c16b532,972b6bc8c2a396021fde0aba600c5cd3,4365f3228a2f68db7dabe607f7dd6bb4", PERMISOS_DE_PRODUCCION]
);

exitoA(
  "E · A pegada sobre la foto de producción cambia EXACTAMENTE las tres `_json`; pegada otra vez, nada; y los permisos quedan en la lista de producción",
  `begin;
${FOTO_PRODUCCION_A}
${FOTO("_antes")}
${MIGRACION_A}
${FOTO("_medio")}
${MIGRACION_A}
${FOTO("_despues")}
select ${CAMBIOS("_antes", "_medio")}, ${CAMBIOS("_medio", "_despues")}, ${PERMISOS_APP};
rollback;`,
  ["retail.fn_resumen_comparacion_json,retail.fn_resumen_variantes_json,retail.fn_stock_por_sede_json", "(ninguno)", PERMISOS_DE_PRODUCCION]
);

errorA(
  "E · la guarda de A aborta si una `_json` tiene un cuerpo que no es ni el de main ni el de producción",
  `begin;
${FOTO_PRODUCCION_A}
create or replace function retail.fn_stock_por_sede_json() returns jsonb language sql stable
  set search_path to 'retail', 'public', 'extensions' as $$ select '[]'::jsonb $$;
${MIGRACION_A}
rollback;`,
  "retail.fn_stock_por_sede_json() cambió después del 2026-09-28"
);

errorA(
  "E · la guarda de A aborta si fn_rentabilidad ya existe con otro cuerpo (p. ej. el PR #168 la cambió antes de que A entre)",
  `begin;
${FOTO_PRODUCCION_A}
create or replace function ${FIRMA_RENTABILIDAD.replace("(date, integer, numeric)", "(p_dia date default null, p_dias integer default 90, p_igv numeric default 0.18)")}
  returns table (nivel text, clave text, etiqueta text, unidades integer, venta_neta numeric, venta_neta_con_costo numeric, costo numeric,
                 unidades_sin_costo integer, descuento numeric, unidades_devueltas integer, stock integer, dias_ventana integer, desde date, hasta date)
  language sql stable as $$ select null::text, null::text, null::text, 0, 0::numeric, 0::numeric, 0::numeric, 0, 0::numeric, 0, 0, 0, null::date, null::date $$;
${MIGRACION_A}
rollback;`,
  "retail.fn_rentabilidad(date, integer, numeric) cambió después del 2026-09-28"
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
/**
 * Crea un rol de prueba del que `current_user` es miembro. Con superusuario no hace falta el `grant`, y sin serlo (el CI,
 * producción) alcanza con CREATEROLE: quien crea el rol puede dárselo a sí mismo, y así puede `set role` y cederle una
 * función. El rol muere con el ROLLBACK.
 */
const ROL_DE_PRUEBA = (rol) => `create role ${rol} nologin;\ngrant ${rol} to current_user;\n`;
const QUITAR_A_LA_DUENA = superusuario
  ? `${ROL_DE_PRUEBA(DUENA)}alter function ${FIRMA_NOTA} owner to ${DUENA};
revoke execute on function ${FIRMA_NOTA} from ${DUENA};`
  : `revoke execute on function ${FIRMA_NOTA} from current_user;`;

errorA(
  "E · la verificación de A aborta, nombrando a la dueña, si la dueña de emitir_nota perdió su propio EXECUTE",
  `begin;
${FOTO_PRODUCCION_A}
${QUITAR_A_LA_DUENA}
${MIGRACION_A}
rollback;`,
  "La dueña de retail.emitir_nota"
);

exitoA(
  "E · y con una dueña NO superusuaria que conserva su EXECUTE, A pasa y la función queda solo para ella",
  `begin;
${FOTO_PRODUCCION_A}
${ROL_DE_PRUEBA(DUENA)}grant create on schema retail to ${DUENA};
alter function ${FIRMA_NOTA} owner to ${DUENA};
${MIGRACION_A}
select proacl::text = '{${DUENA}=X/${DUENA}}' from pg_proc where oid = '${FIRMA_NOTA}'::regprocedure;
rollback;`,
  ["t"]
);

// Un `revoke` solo quita lo que otorgó quien lo corre: un permiso que dio OTRO rol sobrevive a los `revoke` de A. Para
// eso está su verificación final: aborta en vez de dar la puerta por cerrada. Corre igual con o sin superusuario.
const OTORGANTE = `${DUENA}_g`;
/** El rol que otorga recibe `permiso` con grant option y, como él, se lo da a `destino`. */
const OTORGA = (permiso, destino) => `${ROL_DE_PRUEBA(OTORGANTE)}grant usage on schema retail to ${OTORGANTE};
grant ${permiso} to ${OTORGANTE} with grant option;
set local role ${OTORGANTE};
grant ${permiso} to ${destino};
reset role;
`;

errorA(
  "E · la verificación de A aborta si otro rol le dio escritura de stock a service_role (el revoke de A no la quita)",
  `begin;
${FOTO_PRODUCCION_A}
${OTORGA("insert on retail.stock", "service_role")}
${MIGRACION_A}
rollback;`,
  "service_role todavía tiene insert sobre retail.stock"
);

errorA(
  "E · la verificación de A aborta si otro rol le dio EXECUTE de emitir_nota a authenticated (el revoke de A no lo quita)",
  `begin;
${FOTO_PRODUCCION_A}
${OTORGA(`execute on function ${FIRMA_NOTA}`, "authenticated")}
${MIGRACION_A}
rollback;`,
  "todavía la puede ejecutar authenticated"
);

errorA(
  "E · la verificación de A aborta si otro rol le dio a authenticated el update de UNA columna de stock (has_table_privilege no lo ve)",
  `begin;
${FOTO_PRODUCCION_A}
${OTORGA("update (cantidad) on retail.stock", "authenticated")}
${MIGRACION_A}
rollback;`,
  "authenticated todavía tiene update sobre retail.stock"
);

errorA(
  "E · la verificación de A aborta si anon puede leer movimientos (A no lo quita: no es escritura; en producción anon no tiene nada)",
  `begin;
${FOTO_PRODUCCION_A}
grant select on retail.movimientos to anon;
${MIGRACION_A}
rollback;`,
  "anon todavía tiene select sobre retail.movimientos"
);

errorA(
  "E · la verificación de A aborta si anon puede ejecutar una `_json` (A la recrea con `create or replace`, que conserva los permisos)",
  `begin;
${FOTO_PRODUCCION_A}
grant execute on function retail.fn_stock_por_sede_json() to anon;
${MIGRACION_A}
rollback;`,
  "retail.fn_stock_por_sede_json() no quedó con los permisos de producción"
);

/** Los cuerpos de producción de las dos de notas de crédito: los de esta migración sin la regla (b). */
const SIN_REGLA_B = (sql) =>
  sql
    .replace(/\n\s*-- \(b\) \.\.\.y el comprobante[^\n]*\n\s*and not exists \(\n\s*select 1 from compra_notas_credito n\n\s*where n\.compra_id = c\.id and n\.motivo = 'faltante'\n\s*\)/, "")
    .replace(/\n\s*and not exists \(\n\s*select 1 from retail\.compra_notas_credito n\n\s*where n\.compra_id = c\.id and n\.motivo = 'faltante'\n\s*\)/, "");
const CREAR_B = tramo(MIGRACION_B, "create or replace function retail.compras_nota_pendiente", "-- ── VERIFICACIÓN FINAL", "las dos funciones de B");
const NOTAS_DE_PRODUCCION = SIN_REGLA_B(CREAR_B);
if (NOTAS_DE_PRODUCCION === CREAR_B || (CREAR_B.match(/n\.motivo = 'faltante'/g) ?? []).length !== 2) {
  console.error("✗ no pude armar la foto de producción de las notas de crédito desde 20260928200100 (¿cambió su texto?)");
  process.exit(1);
}
const FIRMAS_NOTAS = ["retail.compras_nota_pendiente(uuid[])", "retail.notas_credito_tablero()"];
/** La foto de producción del 2026-09-28 de las dos de notas de crédito, con sus permisos (solo `authenticated`). */
const FOTO_PRODUCCION_B = `
${FIRMAS_NOTAS.map((f) => `drop function if exists ${f};`).join("\n")}
${NOTAS_DE_PRODUCCION}
revoke all on function ${FIRMAS_NOTAS.join(", ")} from public, anon, service_role;
grant execute on function ${FIRMAS_NOTAS.join(", ")} to authenticated;
`;
const EJECUTAN_NOTAS = `(select string_agg(p.proname || ':' || g.rol, ' ' order by p.proname, g.rol) from pg_proc p
  cross join (values ('public'), ('anon'), ('authenticated'), ('service_role')) g(rol)
  where p.pronamespace = 'retail'::regnamespace and p.proname in ('compras_nota_pendiente', 'notas_credito_tablero')
    and has_function_privilege(g.rol, p.oid, 'execute'))`;

exito(
  "E · la foto de producción de las dos de notas de crédito es fiel: sus huellas del 2026-09-28 y solo authenticated",
  `begin;
${FOTO_PRODUCCION_B}
select (select string_agg(${HUELLA("prosrc")}, ',' order by proname) from pg_proc
         where pronamespace = 'retail'::regnamespace and proname in ('compras_nota_pendiente', 'notas_credito_tablero')), ${EJECUTAN_NOTAS};
rollback;`,
  ["fe0f9ae0f1b0f987af947a8f3f620e60,802b963051dae7e16a631b8f8efcf6c2", "compras_nota_pendiente:authenticated notas_credito_tablero:authenticated"]
);

exito(
  "E · B pegada sobre la foto de producción cambia EXACTAMENTE esas dos; pegada otra vez, nada; y siguen solo para authenticated",
  `begin;
${FOTO_PRODUCCION_B}
${FOTO("_antes")}
${MIGRACION_B}
${FOTO("_medio")}
${MIGRACION_B}
${FOTO("_despues")}
select ${CAMBIOS("_antes", "_medio")}, ${CAMBIOS("_medio", "_despues")}, ${EJECUTAN_NOTAS};
rollback;`,
  ["retail.compras_nota_pendiente,retail.notas_credito_tablero", "(ninguno)", "compras_nota_pendiente:authenticated notas_credito_tablero:authenticated"]
);

error(
  "E · la guarda de B aborta con un cuerpo desconocido de compras_nota_pendiente",
  `begin;
${FOTO_PRODUCCION_B}
${CREAR_B.slice(0, CREAR_B.indexOf("comment on function")).replace("group by c.id;", "group by c.id having true;")}
${MIGRACION_B}
rollback;`,
  "retail.compras_nota_pendiente(uuid[]) cambió después del 2026-09-28"
);

// ===========================================================================
// F. Cerrar las puertas no rompe la tienda: lo que la persona SÍ llama sigue emitiendo, COMO authenticated
// ===========================================================================
// Las cuatro funciones quedan solo para su dueña, y las que llama la tienda (security definer) corren con los permisos
// de esa dueña. En el CI y en producción la dueña (`postgres`) NO es superusuaria, así que si perdiera su EXECUTE la
// venta se caería. Aquí `postgres` sí lo es y se saltaría toda ACL: por eso, dentro del ROLLBACK, la función que llama
// la tienda pasa a una dueña NO superusuaria que hereda los permisos de `postgres` (como la dueña real).

const SANDRA = "22222222-2222-4222-8222-000000000005"; // otra líder: quien registró la devolución no puede aprobarla

/** Pasa esas funciones (por nombre) a una dueña NO superusuaria que hereda de `postgres` (solo si `postgres` es superusuario). */
const DUENA_COMO_EN_PRODUCCION = (nombres) =>
  superusuario
    ? `create role ${DUENA}_f nologin;
grant postgres to ${DUENA}_f;
${A_TODAS(nombres, `alter function %s owner to ${DUENA}_f`)}
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
const QUITAR_EMITIR_A_LA_DUENA = A_TODAS(["emitir_comprobante"], "revoke execute on function %s from postgres");

exito(
  "F · COMO authenticated, una venta con boleta emite su comprobante y baja el stock (emitir_comprobante y fn_aplicar_movimiento por dentro)",
  `${TIENDA_LISTA}${DUENA_COMO_EN_PRODUCCION(["registrar_venta"])}
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
  `${TIENDA_LISTA}${DUENA_COMO_EN_PRODUCCION(["registrar_venta"])}
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
  `${DEVOLUCION_LISTA}${DUENA_COMO_EN_PRODUCCION(["aprobar_devolucion"])}
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
  `${DEVOLUCION_LISTA}${DUENA_COMO_EN_PRODUCCION(["aprobar_devolucion"])}
${A_TODAS(["emitir_nota"], "revoke execute on function %s from postgres")}
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
