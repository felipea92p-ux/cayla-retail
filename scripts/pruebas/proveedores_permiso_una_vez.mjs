#!/usr/bin/env node
/**
 * Prueba de `20261116223000_proveedores_permiso_una_vez.sql` (2026-11-16): Compras ▸ Proveedores no cargaba en las terminales de
 * Almacén porque `fn_proveedores()` preguntaba el permiso de la plata en CADA fila (13 columnas × cada proveedor), y para una
 * cuenta que no es líder cada pregunta recorre la cadena entera de permisos: con 139 proveedores eran 12 s contra un tope de 8.
 *
 * No mide milisegundos (eso depende de la máquina y falla por azar): CUENTA cuántas veces se llama al permiso
 * (`pg_stat_xact_user_functions`, con `track_functions = 'all'`) con la lista que trae la base y con 20 proveedores más. Si el
 * número crece con la lista, el permiso volvió a preguntarse por fila.
 *
 * La terminal se arma como la de producción: una cuenta de aparato cuyo rol ve Proveedores y Facturas de proveedor. Cada caso
 * corre en una transacción que TERMINA EN ROLLBACK con la migración aplicada dentro (o deshecha, en el control): el Postgres
 * local compartido no cambia.
 *
 * USO: pnpm pruebas:proveedores-permiso-una-vez   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261116223000_proveedores_permiso_una_vez.sql"), "utf8");
// El control vuelve a dejar la función como estaba (el permiso dentro de cada fila). En el CI la migración ya está aplicada, así
// que «sin el arreglo» se arma deshaciendo, siempre después de aplicarla (re-pegable: no hace nada si ya estaba).
const SIN_ARREGLO = `${MIGRACION}
do $d$ begin
  execute replace(pg_get_functiondef('retail.fn_proveedores()'::regprocedure),
    'case when (select retail.fn_ve_plata_de_proveedores()) then', 'case when retail.fn_ve_plata_de_proveedores() then');
end $d$;`;
const LIDER = "22222222-2222-4222-8222-000000000001";
const INTEGRANTE = "22222222-2222-4222-8222-000000000003";
const TERMINAL = "22222222-2222-4222-8222-0000000000e6";
const MAS_PROVEEDORES = 20;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

/** La terminal de Almacén Trujillo, como en producción, y el contador de llamadas de esta transacción. */
const ESCENA = `
set local track_functions = 'all';
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into auth.users (id, email) values ('${TERMINAL}', 'terminal-proveedores@cayla.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id, rol_id)
  values (:'tru', 'Almacén de prueba', 'administrativa', '${TERMINAL}', retail.fn_rol_por_clave('integrante'));
insert into retail.rol_modulos (rol_id, modulo)
  select retail.fn_rol_por_clave('integrante'), m from unnest(array['proveedores', 'facturas_compra']) m on conflict do nothing;
create function pg_temp.llamadas(p_funcion text) returns bigint language sql as $f$
  select coalesce((select calls from pg_stat_xact_user_functions where schemaname = 'retail' and funcname = p_funcion), 0);
$f$;
`;

/** Lee la lista con la sesión de \`quien\` (rol authenticated: aplican permisos y políticas). */
const leerComo = (quien, destino = "_n") =>
  `set local role authenticated;
set local request.jwt.claim.sub = '${quien}';
set local request.jwt.claim.role = 'authenticated';
select count(*) as ${destino} from retail.fn_proveedores() \\gset
reset role;
`;

/**
 * Cuenta las llamadas a \`funcion\` en una lectura de la terminal con la lista de la base (\`:con_base\`) y en otra con 20 proveedores
 * más (\`:con_mas\`). Deja también cuántas filas trajo cada lectura (\`:filas_base\`, \`:filas_mas\`).
 */
const contar = (funcion) => `
select pg_temp.llamadas('${funcion}') as c0 \\gset
${leerComo(TERMINAL, "filas_base")}
select pg_temp.llamadas('${funcion}') - :c0 as con_base \\gset
insert into retail.proveedores (nombre) select 'Proveedor de prueba ' || g from generate_series(1, ${MAS_PROVEEDORES}) g;
-- Se cuenta DESPUÉS del alta: sus disparadores también llaman a la cadena de permisos, y eso no es leer la lista.
select pg_temp.llamadas('${funcion}') as c1 \\gset
${leerComo(TERMINAL, "filas_mas")}
select pg_temp.llamadas('${funcion}') - :c1 as con_mas \\gset
`;

const dentro = (cuerpo, { conArreglo = true } = {}) => psql(`begin;\n${conArreglo ? MIGRACION : SIN_ARREGLO}\n${ESCENA}\n${cuerpo}\nrollback;`);

let fallas = 0;
let total = 0;
function caso(nombre, fn) {
  total++;
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join("\n    ")}`);
  }
}
/** La última línea de la salida es la respuesta: «t» pasa; cualquier otra cosa se muestra tal cual. */
const pasa = (sql, opciones) => () => {
  const salida = dentro(sql, opciones);
  const ultima = salida.split("\n").at(-1);
  if (!ultima.startsWith("t")) return `salida inesperada: ${ultima || "(vacía)"}`;
};

caso(
  "CONTROL: con la función como estaba, la terminal pregunta el permiso MÁS veces con 20 proveedores más (el problema existía)",
  pasa(`${contar("fn_ve_plata_de_proveedores")}
select :con_mas > :con_base and :filas_mas = :filas_base + ${MAS_PROVEEDORES}, :con_base, :con_mas;`, { conArreglo: false })
);
caso(
  "con el arreglo, la terminal pregunta el permiso de la plata las mismas veces con 20 proveedores más, y como mucho 15",
  pasa(`${contar("fn_ve_plata_de_proveedores")}
select :con_mas = :con_base and :con_base <= 15 and :filas_mas = :filas_base + ${MAS_PROVEEDORES}, :con_base, :con_mas;`)
);
caso(
  "con el arreglo, la cadena de permisos de la terminal (fn_terminal_actual) tampoco crece con la lista",
  pasa(`${contar("fn_terminal_actual")}
select :con_mas = :con_base, :con_base, :con_mas;`)
);
caso(
  "la terminal, el líder y una integrante leen exactamente la misma lista con el arreglo que sin él",
  pasa(`${SIN_ARREGLO}
create temp table antes_filas as select null::text as quien, p.* from retail.fn_proveedores() p where false;
create temp table despues_filas as select * from antes_filas where false;
grant insert, select on antes_filas, despues_filas to authenticated;
${["TERMINAL", "LIDER", "INTEGRANTE"]
  .map(
    (q) => `set local role authenticated;
set local request.jwt.claim.sub = '${{ TERMINAL, LIDER, INTEGRANTE }[q]}';
set local request.jwt.claim.role = 'authenticated';
insert into antes_filas select '${q}', p.* from retail.fn_proveedores() p;
reset role;`
  )
  .join("\n")}
${MIGRACION}
${["TERMINAL", "LIDER", "INTEGRANTE"]
  .map(
    (q) => `set local role authenticated;
set local request.jwt.claim.sub = '${{ TERMINAL, LIDER, INTEGRANTE }[q]}';
set local request.jwt.claim.role = 'authenticated';
insert into despues_filas select '${q}', p.* from retail.fn_proveedores() p;
reset role;`
  )
  .join("\n")}
select (select count(*) from (select * from antes_filas except all select * from despues_filas) a) = 0
   and (select count(*) from (select * from despues_filas except all select * from antes_filas) d) = 0
   and (select count(distinct quien) from antes_filas) = 3
   and (select count(*) from antes_filas where quien = 'TERMINAL' and facturas is not null) > 0;`)
);
caso(
  "pegar la migración dos veces deja la función arreglada y dice «QUEDÓ BIEN»",
  pasa(`${MIGRACION}
select position('case when retail.fn_ve_plata_de_proveedores() then' in pg_get_functiondef('retail.fn_proveedores()'::regprocedure)) = 0;`)
);

console.log(`\n${total - fallas}/${total} casos pasan.`);
process.exit(fallas ? 1 : 0);
