#!/usr/bin/env node
/**
 * Prueba de ADR-0261, tarea #7: una talla con prendas no se retira
 * (migración `20260929030000_talla_con_prendas_no_se_retira.sql`).
 *
 * El caso real (2026-09-28): 2 tallas de «Prueba Pantalon» se desactivaron con 6 prendas adentro y Existencias las
 * perdió. Acá: BLU-EMMA-NEG-M con prendas en Trujillo. Cada caso corre en su transacción con la migración aplicada
 * dentro y TERMINA EN ROLLBACK. El control saca el disparador y prueba que sin él la talla se retiraba con prendas.
 *
 * USO: pnpm pruebas:talla-con-prendas   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20260929030000_talla_con_prendas_no_se_retira.sql"), "utf8");
// El control: sin el disparador (así se deshace). Solo dentro de una transacción que termina en ROLLBACK.
const SIN_CANDADO = "drop trigger if exists variantes_talla_con_prendas_no_se_retira on retail.variantes;";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

/** BLU-EMMA-NEG-M, activa, con 3 prendas en el piso de Trujillo y nada en otra sede. */
const ESCENA = `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
update retail.variantes set activo = true where id = :'v';
delete from retail.stock where variante_id = :'v';
insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad)
select :'v', :'ubic', sb.id, 3 from retail.sububicaciones sb where sb.ubicacion_id = :'ubic' and sb.tipo = 'piso_venta';
`;
const RETIRAR = `update retail.variantes set activo = false where id = :'v'; select activo from retail.variantes where id = :'v';`;

const dentro = (cuerpo, { conCandado = true } = {}) => psql(`begin;\n${MIGRACION}\n${conCandado ? "" : SIN_CANDADO}\n${ESCENA}\n${cuerpo}\nrollback;`);

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
const igual = (sql, esperado, opciones) => () => {
  const salida = dentro(sql, opciones);
  if (salida !== esperado) return `esperaba «${esperado}», salió «${salida}»`;
};
/** El cuerpo tiene que fallar con un mensaje que contenga `texto`. */
const rechaza = (sql, texto) => () => {
  try {
    const salida = dentro(sql);
    return `debía fallar y salió «${salida}»`;
  } catch (e) {
    const msg = String(e.stderr ?? e.message);
    if (!msg.includes(texto)) return `falló, pero sin «${texto}»: ${msg.split("\n")[0]}`;
  }
};

caso("con 3 prendas en Trujillo NO se retira, y el mensaje dice dónde están", rechaza(RETIRAR, "todavía tiene prendas (3 en Trujillo)"));

caso(
  "el mensaje dice qué hacer (vender, trasladar o ajustar) y nombra la talla por su SKU",
  rechaza(RETIRAR, "La talla BLU-EMMA-NEG-M todavía tiene prendas (3 en Trujillo). Véndelas, trasládalas o ajústalas antes de retirarla.")
);

caso(
  "las prendas en Cuarentena también cuentan (existen, aunque no se vendan)",
  rechaza(
    `update retail.stock set cantidad = 0 where variante_id = :'v';
     insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad)
     select :'v', :'ubic', sb.id, 2 from retail.sububicaciones sb where sb.ubicacion_id = :'ubic' and sb.tipo = 'cuarentena';
     ${RETIRAR}`,
    "(2 en Trujillo)"
  )
);

caso(
  "varias sedes: las nombra todas",
  rechaza(
    `insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad)
     select :'v', :'lima', sb.id, 4 from retail.sububicaciones sb where sb.ubicacion_id = :'lima' and sb.tipo = 'piso_venta';
     ${RETIRAR}`,
    "(4 en Lima, 3 en Trujillo)"
  )
);

caso(
  "en 0 en todas las sedes pero con 5 en camino a Lima: tampoco se retira",
  rechaza(
    `update retail.stock set cantidad = 0 where variante_id = :'v';
     insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado) values (:'ubic', :'lima', 'en_transito') returning id as t \\gset
     insert into retail.transferencia_items (transferencia_id, variante_id, cantidad) values (:'t', :'v', 5);
     ${RETIRAR}`,
    "(5 en camino a Lima)"
  )
);

caso(
  "en 0 y sin nada en camino: se retira",
  igual(`update retail.stock set cantidad = 0 where variante_id = :'v'; ${RETIRAR}`, "f")
);

caso(
  "un traslado ya recibido no la frena (solo lo que sigue en camino)",
  igual(
    `update retail.stock set cantidad = 0 where variante_id = :'v';
     insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado) values (:'ubic', :'lima', 'en_transito') returning id as t \\gset
     insert into retail.transferencia_items (transferencia_id, variante_id, cantidad) values (:'t', :'v', 5);
     update retail.transferencias set estado = 'cerrada' where id = :'t';
     ${RETIRAR}`,
    "f"
  )
);

caso(
  "reactivar una talla siempre se puede, aunque tenga prendas",
  igual(
    `alter table retail.variantes disable trigger variantes_talla_con_prendas_no_se_retira;
     update retail.variantes set activo = false where id = :'v';
     alter table retail.variantes enable trigger variantes_talla_con_prendas_no_se_retira;
     update retail.variantes set activo = true where id = :'v'; select activo from retail.variantes where id = :'v';`,
    "t"
  )
);

caso(
  "una talla ya retirada con prendas (el caso de hoy) no bloquea otros cambios: el candado mira el paso, no el estado",
  igual(
    `alter table retail.variantes disable trigger variantes_talla_con_prendas_no_se_retira;
     update retail.variantes set activo = false where id = :'v';
     alter table retail.variantes enable trigger variantes_talla_con_prendas_no_se_retira;
     update retail.variantes set precio = precio + 1 where id = :'v'; select 'ok';`,
    "ok"
  )
);

caso("control: sin el disparador, la talla se retiraba con sus 3 prendas adentro", igual(RETIRAR, "f", { conCandado: false }));

caso(
  "nadie de fuera llama la función del disparador",
  igual(`select has_function_privilege('authenticated', 'retail.fn_talla_con_prendas_no_se_retira()', 'execute');`, "f")
);

console.log(`\n${total - fallas}/${total} casos`);
process.exit(fallas ? 1 : 0);
