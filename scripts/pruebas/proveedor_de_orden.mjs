#!/usr/bin/env node
/**
 * Prueba de `retail.registrar_proveedor_de_orden(...)` (migración `20261021202000_registrar_proveedor_de_orden.sql`): registrar un
 * proveedor nuevo desde la orden de compra con lo más básico (informe `docs/pantallas/compras-ordenes-nueva.md`, tarea #7).
 *
 * LO QUE VIGILA.
 *   · La puerta: solo con el módulo Órdenes de compra (42501 y `ordenes_compra_sin_modulo`); anon no la ejecuta.
 *   · Lo escrito: nombre + RUC de 11 dígitos, o «sin RUC» (nunca los dos, nunca ninguno), celular opcional de 9 dígitos que empieza con 9
 *     (acepta +51 y espacios). Cada rechazo lleva su `hint` y NINGÚN mensaje lleva el nombre ni el RUC.
 *   · Que no duplique: el mismo RUC o el mismo nombre (sin tildes ni mayúsculas) devuelve el proveedor que ya estaba, con
 *     `ya_existia`; el mismo nombre con OTRO RUC es otra empresa (`proveedor_nombre_en_uso`); uno desactivado no se reactiva
 *     (`proveedor_desactivado`).
 *   · Que no escriba de más: banco, cuenta, CCI, billeteras y rubros quedan vacíos, y un proveedor que ya existía no cambia.
 *   · Que deje rastro: un renglón en Actividad con quién lo hizo, sin el RUC.
 *
 * Cada caso corre en una transacción que TERMINA EN ROLLBACK con la migración cargada dentro (idempotente): el Postgres local no
 * cambia. La carrera de dos llamadas a la vez NO está aquí (haría COMMIT): se probó aparte, a mano.
 *
 * USO: pnpm pruebas:proveedor-de-orden [--contenedor <nombre>]
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261021202000_registrar_proveedor_de_orden.sql"), "utf8");
const INTEGRANTE = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

/** La escena: la integrante (cuyo rol ve Caja, no Órdenes de compra) y su persona. */
const ESCENA = `
select c.rol_id as rol_int from retail.colaboradores c join public.personas p on p.id = c.persona_id where p.auth_user_id = '${INTEGRANTE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${INTEGRANTE}' \\gset
delete from retail.rol_modulos where rol_id = :'rol_int' and modulo = 'ordenes_compra';
`;
const conModulo = `insert into retail.rol_modulos (rol_id, modulo) values (:'rol_int', 'ordenes_compra') on conflict do nothing;`;
/** Con la cuenta de una persona y la clave que suelta el combo «Responsable» (lo que manda la pantalla). */
const comoMicaela = `set local role authenticated;
set local request.jwt.claim.sub = '${INTEGRANTE}';
set local request.jwt.claims = '{"sub":"${INTEGRANTE}","role":"authenticated"}';
select set_config('request.headers', '{"x-responsable-omitido":"proveedor_de_orden"}', true) \\g /dev/null
`;
const llama = (args) => `retail.registrar_proveedor_de_orden(${args})`;

const dentro = (cuerpo) => psql(`begin;\n${MIGRACION}\n${ESCENA}\n${cuerpo}\nrollback;`);

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
/** Pasa si UNA consulta imprime `t` (cada caso arma una sola, con `and`). */
const pasa = (sql) => () => {
  try {
    const salida = dentro(sql);
    if (!salida.split("\n").includes("t")) return `salida inesperada: ${salida || "(vacía)"}`;
  } catch (e) {
    return `se rechazó y debía pasar: ${String(e.stderr ?? e.message).split("\n").slice(0, 2).join(" ")}`;
  }
};
const rechaza = (sql, patron) => () => {
  try {
    return `pasó y debía rechazarse: ${dentro(sql)}`;
  } catch (e) {
    if (!patron.test(String(e.stderr))) return `se rechazó por otra cosa: ${String(e.stderr).split("\n").slice(0, 2).join(" ")}`;
  }
};
/** Que el mensaje de error NO contenga lo escrito (el repo y los logs son públicos; un RUC 10… contiene un DNI). */
const rechazaSinFiltrar = (sql, patron, secreto) => () => {
  try {
    return `pasó y debía rechazarse: ${dentro(sql)}`;
  } catch (e) {
    const err = String(e.stderr);
    if (!patron.test(err)) return `se rechazó por otra cosa: ${err.split("\n").slice(0, 2).join(" ")}`;
    // psql repite la consulta en el mensaje; solo se mira lo que escribió la FUNCIÓN (líneas ERROR y HINT).
    const dicho = err.split("\n").filter((l) => /^(psql:.*ERROR|HINT)/.test(l)).join(" ");
    if (dicho.includes(secreto)) return `el mensaje de error repite lo escrito: ${dicho}`;
  }
};

const RUC = "20123456789";
const NOMBRE = "ZZ Textiles del Sur SAC";

// La puerta.
caso(
  "sin el módulo Órdenes de compra, la integrante recibe 42501",
  rechaza(`${comoMicaela}\nselect * from ${llama(`'${NOMBRE}', '${RUC}'`)};`, /ordenes_compra_sin_modulo/)
);
caso("anon no la ejecuta", rechaza(`set local role anon;\nselect * from ${llama(`'${NOMBRE}', '${RUC}'`)};`, /permission denied/));

// Crear.
caso(
  "con el módulo, nombre + RUC crean el proveedor y dicen que es nuevo",
  pasa(`${conModulo}\n${comoMicaela}
select proveedor_id as nuevo, proveedor_nombre = '${NOMBRE}' and proveedor_ruc = '${RUC}' and not ya_existia as bien from ${llama(`'${NOMBRE}', '${RUC}'`)} \\gset
reset role;
select :'bien' = 't' and exists (select 1 from retail.proveedores where id = :'nuevo' and ruc = '${RUC}' and activo);`)
);
caso(
  "no escribe de más: banco, cuenta, CCI, billeteras y rubros quedan vacíos y el celular también",
  pasa(`${conModulo}\n${comoMicaela}
select proveedor_id as nuevo from ${llama(`'${NOMBRE}', '${RUC}'`)} \\gset
reset role;
select p.banco is null and p.cuenta_bancaria is null and p.cci is null and p.celular_billetera is null and p.billeteras is null
   and p.titular_cuenta is null and p.telefono is null and p.rubros = '{}' and p.forma_pago_preferida is null and p.plazo_credito_dias is null
  from retail.proveedores p where p.id = :'nuevo';`)
);
caso(
  "el celular se normaliza: «+51 987 654 321» queda 987654321",
  pasa(`${conModulo}\n${comoMicaela}
select proveedor_id as nuevo from ${llama(`'${NOMBRE}', '${RUC}', false, '+51 987 654 321'`)} \\gset
reset role;
select telefono = '987654321' from retail.proveedores where id = :'nuevo';`)
);

// Sin duplicar.
caso(
  "el mismo RUC otra vez devuelve el mismo proveedor, dice que ya existía y no crea otro",
  pasa(`${conModulo}\n${comoMicaela}
select proveedor_id as p1 from ${llama(`'${NOMBRE}', '${RUC}'`)} \\gset
select proveedor_id = :'p1' and ya_existia as igual from ${llama(`'${NOMBRE}', '${RUC}'`)} \\gset
reset role;
select :'igual' = 't' and (select count(*) from retail.proveedores where ruc = '${RUC}') = 1;`)
);
caso(
  "el mismo RUC con otro nombre devuelve el que ya estaba y no lo renombra",
  pasa(`${conModulo}\n${comoMicaela}
select proveedor_id as p1 from ${llama(`'${NOMBRE}', '${RUC}'`)} \\gset
select proveedor_id = :'p1' and ya_existia and proveedor_nombre = '${NOMBRE}' as igual from ${llama(`'ZZ Otro Nombre Distinto', '${RUC}'`)} \\gset
reset role;
select :'igual' = 't' and not exists (select 1 from retail.proveedores where nombre = 'ZZ Otro Nombre Distinto');`)
);
caso(
  "el mismo nombre con OTRO RUC es otra empresa: se rechaza con proveedor_nombre_en_uso",
  rechaza(`${conModulo}\n${comoMicaela}
select * from ${llama(`'${NOMBRE}', '${RUC}'`)};
select * from ${llama(`'${NOMBRE}', '20987654321'`)};`, /proveedor_nombre_en_uso/)
);
caso(
  "sin RUC: crea con el RUC vacío; el mismo nombre (sin tildes ni mayúsculas) devuelve el mismo",
  pasa(`${conModulo}\n${comoMicaela}
select proveedor_id as p1, proveedor_ruc is null and not ya_existia as nuevo from ${llama(`'ZZ Ñandú Sin RUC', null, true`)} \\gset
select proveedor_id = :'p1' and ya_existia as igual from ${llama(`'  zz nandu SIN ruc ', null, true`)} \\gset
reset role;
select :'nuevo' = 't' and :'igual' = 't' and (select count(*) from retail.proveedores where retail.fn_clave_texto(nombre) = 'zz nandu sin ruc') = 1;`)
);
caso(
  "un nombre que ya existía SIN RUC, escrito ahora con RUC, devuelve esa ficha (sin RUC): la pantalla lo dice, no se descarta en silencio",
  pasa(`${conModulo}\n${comoMicaela}
select proveedor_id as p1 from ${llama(`'ZZ Puesto de Gamarra', null, true`)} \\gset
select proveedor_id = :'p1' and ya_existia and proveedor_ruc is null as igual from ${llama(`'ZZ Puesto de Gamarra', '${RUC}'`)} \\gset
reset role;
select :'igual' = 't' and not exists (select 1 from retail.proveedores where ruc = '${RUC}');`)
);
caso(
  "un proveedor desactivado no se reactiva ni se devuelve: proveedor_desactivado",
  rechaza(`${conModulo}\ninsert into retail.proveedores (nombre, ruc, activo) values ('${NOMBRE}', '${RUC}', false);\n${comoMicaela}\nselect * from ${llama(`'${NOMBRE}', '${RUC}'`)};`, /proveedor_desactivado/)
);
caso(
  "un proveedor que ya existía con su cuenta no cambia nada (ni banco ni nombre ni estado)",
  pasa(`${conModulo}\ninsert into retail.proveedores (nombre, ruc, banco, cci, rubros) values ('${NOMBRE}', '${RUC}', 'BCP', '00219300123456789012', array['Tela']);
${comoMicaela}
select proveedor_id as p1 from ${llama(`'${NOMBRE}', '${RUC}', false, '987654321'`)} \\gset
reset role;
select p.banco = 'BCP' and p.cci = '00219300123456789012' and p.rubros = array['Tela'] and p.telefono is null
  from retail.proveedores p where p.id = :'p1';`)
);

// Lo escrito.
const MAL = [
  ["sin nombre", `null, '${RUC}'`, /proveedor_sin_nombre/],
  ["con el nombre vacío", `'   ', '${RUC}'`, /proveedor_sin_nombre/],
  ["con un nombre de más de 120 letras", `'${"x".repeat(121)}', '${RUC}'`, /proveedor_nombre_largo/],
  ["con RUC y «sin RUC» a la vez", `'${NOMBRE}', '${RUC}', true`, /proveedor_ruc_y_sin_ruc/],
  ["sin RUC y sin marcar «sin RUC»", `'${NOMBRE}', null, false`, /proveedor_sin_ruc/],
  ["con un RUC de 10 dígitos", `'${NOMBRE}', '2012345678'`, /proveedor_ruc_invalido/],
  ["con un RUC con letras", `'${NOMBRE}', '2012345678A'`, /proveedor_ruc_invalido/],
  ["con un celular que no empieza con 9", `'${NOMBRE}', '${RUC}', false, '887654321'`, /proveedor_celular_invalido/],
  ["con un celular corto", `'${NOMBRE}', '${RUC}', false, '98765'`, /proveedor_celular_invalido/],
];
for (const [que, args, patron] of MAL) {
  caso(`rechaza ${que}`, rechaza(`${conModulo}\n${comoMicaela}\nselect * from ${llama(args)};`, patron));
}
caso(
  "los mensajes de error no repiten el RUC ni el nombre escritos",
  rechazaSinFiltrar(`${conModulo}\n${comoMicaela}\nselect * from ${llama(`'ZZ Nombre Secreto', '2012345678'`)};`, /proveedor_ruc_invalido/, "ZZ Nombre Secreto")
);

// Firma y rastro.
caso(
  "queda un renglón en Actividad hecho por la integrante, sin el RUC",
  pasa(`${conModulo}\n${comoMicaela}
select proveedor_id as nuevo from ${llama(`'${NOMBRE}', '${RUC}'`)} \\gset
reset role;
select count(*) = 1 and bool_and(persona_id = :'micaela_p') and bool_and(detalle::text not like '%${RUC}%') and bool_and(descripcion not like '%${RUC}%')
  from retail.actividad where modulo = 'ordenes_compra' and accion = 'proveedor_registrado' and registro_id = :'nuevo'::text;`)
);
caso(
  "devolver el que ya estaba NO anota otra vez en Actividad",
  pasa(`${conModulo}\n${comoMicaela}
select proveedor_id as nuevo from ${llama(`'${NOMBRE}', '${RUC}'`)} \\gset
select * from ${llama(`'${NOMBRE}', '${RUC}'`)} \\g /dev/null
reset role;
select count(*) = 1 from retail.actividad where modulo = 'ordenes_compra' and accion = 'proveedor_registrado' and registro_id = :'nuevo'::text;`)
);
caso(
  "la clave «proveedor_de_orden» está en la lista de acciones sueltas del combo Responsable",
  pasa(`select exists (select 1 from retail.acciones_sin_responsable where clave = 'proveedor_de_orden');`)
);

// Re-pegable.
caso("pegar la migración dos veces no cambia nada la segunda", pasa(`${MIGRACION}\nselect (select count(*) from retail.acciones_sin_responsable where clave = 'proveedor_de_orden') = 1;`));

console.log(`\n${total - fallas}/${total} casos pasan.`);
process.exit(fallas ? 1 : 0);
