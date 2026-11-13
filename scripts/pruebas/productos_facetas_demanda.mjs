#!/usr/bin/env node
/**
 * Prueba de `20261113225000_productos_facetas_ventas_de_una_vez.sql` (ADR-0656, act. d): los conteos de los filtros de Catálogo ▸
 * Productos toman las ventas de 30 días primero y después buscan su prenda. Es solo un cambio de CAMINO: lo que devuelve
 * `fn_productos_facetas` tiene que ser idéntico, carácter por carácter.
 *
 * Vigila en la BASE, sobre el volumen del presupuesto de rendimiento (12.000 variantes, ~3.000 ventas) y con poco stock en 600
 * prendas, para que la demanda decida qué cae en «reponer» (sin eso, «reponer» vale 0 con y sin la migración y no se probaría nada):
 *   · los conteos son los de antes: sin filtros, con «reponer», «bajo» y «sin red», con una categoría, con la sede y como
 *     integrante de Trujillo;
 *   · la escena mira la demanda de verdad: «reponer» trae prendas;
 *   · control: si la demanda dejara de leer las ventas, «reponer» cambiaría (la comparación ve lo que cree ver);
 *   · pegarla dos veces deja la misma función; si la «demanda» de hoy cambió, no toca nada y lo dice.
 *
 * Todo corre en transacciones que TERMINAN EN ROLLBACK: la base local compartida no cambia. «Antes» se arma deshaciendo, dentro de
 * la transacción, exactamente el texto que la migración pone (la base del CI ya la trae). Los dos textos salen del archivo de la
 * migración: si alguien la cambia, la prueba compara contra lo nuevo.
 *
 * USO: pnpm pruebas:productos-facetas-demanda   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261113225000_productos_facetas_ventas_de_una_vez.sql"), "utf8");
const VOLUMEN = readFileSync(join(RAIZ, "scripts/rendimiento/presupuesto-volumen.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo
const FACETAS = "retail.fn_productos_facetas(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, uuid)";

// Lo que la migración busca (`$a$`) y lo que pone (`$n$`), tal cual están en su archivo.
const ANCLA = /\$a\$([\s\S]*?)\$a\$/.exec(MIGRACION)?.[1];
const NUEVO = /\$n\$([\s\S]*?)\$n\$/.exec(MIGRACION)?.[1];
if (!ANCLA || !NUEVO) throw new Error("No encontré los textos $a$ y $n$ en la migración: ¿cambió su forma?");

// Como `presupuesto.mjs`: el volumen apaga y prende los disparadores (`session_replication_role`), y eso pide superusuario.
function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

const como = (cuenta) => `set local request.jwt.claim.sub = '${cuenta}';
set local request.jwt.claims = '{"sub":"${cuenta}","role":"authenticated"}';
set local role authenticated;`;
const comoNadie = "reset role;";

// «Antes»: la función sin la migración. Si la base no la tiene, el reemplazo no encuentra nada y no cambia nada.
const DESHACER = `do $deshacer$
declare v_def text := pg_get_functiondef('${FACETAS}'::regprocedure);
begin
  execute replace(v_def, $n$${NUEVO}$n$, $a$${ANCLA}$a$);
  v_def := pg_get_functiondef('${FACETAS}'::regprocedure);
  if position('ventas_30d' in v_def) > 0 or position($a$${ANCLA}$a$ in v_def) = 0 then
    raise exception 'la prueba no pudo volver a la demanda de antes: el texto de la migración no es el que está en la base';
  end if;
end
$deshacer$;`;

// Poco stock en 600 prendas del volumen: 1 por variante y lugar en las 300 primeras, 0 en las 300 siguientes.
const ESCENA = `set local session_replication_role = replica;
update retail.stock s set cantidad = case when p.referencia <= 'PRESUPUESTO 00300' then 1 else 0 end, cantidad_apartada = 0
  from retail.variantes v join retail.productos p on p.id = v.producto_id
 where v.id = s.variante_id and p.referencia like 'PRESUPUESTO %' and p.referencia <= 'PRESUPUESTO 00600';
set local session_replication_role = origin;`;

const TRUJILLO = "(select id from retail.ubicaciones where nombre = 'Tienda Trujillo')";
const CATEGORIA = "(select p.categoria_id from retail.productos p where p.referencia = 'PRESUPUESTO 00007')";
/** Los conteos que se comparan, como la cuenta que esté puesta: una línea «etiqueta|md5|reponer». */
const CONTEOS = (etiqueta) => `select '${etiqueta}|' || md5(string_agg(x, '#' order by n)) || '|' || (array_agg(r order by n))[1]
from (values
  (1, retail.fn_productos_facetas()),
  (2, retail.fn_productos_facetas(p_disponibilidad => 'reponer')),
  (3, retail.fn_productos_facetas(p_disponibilidad => 'bajo')),
  (4, retail.fn_productos_facetas(p_disponibilidad => 'sin_red')),
  (5, retail.fn_productos_facetas(p_categoria_id => ${CATEGORIA}, p_disponibilidad => 'reponer')),
  (6, retail.fn_productos_facetas(p_ubicacion_id => ${TRUJILLO}, p_disponibilidad => 'en_sede')),
  (7, retail.fn_productos_facetas(p_busqueda => 'PRESUPUESTO 0001', p_disponibilidad => 'reponer'))
) c(n, j), lateral (select j::text as x, j->'facetas'->'disponibilidad'->>'reponer' as r) y;`;

// La demanda rota a propósito, ya con la migración: deja de leer las ventas.
const ROMPER = `do $romper$ begin
  execute replace(pg_get_functiondef('${FACETAS}'::regprocedure), 'from ventas_30d m', 'from (select * from ventas_30d limit 0) m');
end $romper$;`;

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
const igual = (real, esperado) => (real === esperado ? null : `esperaba «${esperado}» y salió «${real}»`);

// Una sola carga del volumen para los casos de conteo: antes, con la migración y con la demanda rota, en la misma transacción.
let lineas = {};
try {
  const salida = psql(`begin;
set local timezone = 'America/Lima';
${VOLUMEN}
reset search_path;
${ESCENA}
${DESHACER}
${como(FELIPE)}
${CONTEOS("antes-lider")}
${como(MICAELA)}
${CONTEOS("antes-micaela")}
${comoNadie}
${MIGRACION}
reset search_path;
${como(FELIPE)}
${CONTEOS("despues-lider")}
${como(MICAELA)}
${CONTEOS("despues-micaela")}
${comoNadie}
${ROMPER}
${como(FELIPE)}
${CONTEOS("rota-lider")}
rollback;`);
  for (const l of salida.split("\n")) {
    const [etiqueta, huella, reponer] = l.split("|");
    if (/^(antes|despues|rota)-/.test(etiqueta)) lineas[etiqueta] = { huella, reponer: Number(reponer) };
  }
} catch (e) {
  lineas = { error: String(e.stderr ?? e.message).split("\n").slice(0, 4).join("\n    ") };
}
const de = (etiqueta) => {
  if (lineas.error) throw new Error(lineas.error);
  if (!lineas[etiqueta]) throw new Error(`la transacción no dejó la línea «${etiqueta}»`);
  return lineas[etiqueta];
};

caso("los conteos son los de antes, carácter por carácter (siete combinaciones de filtros, como líder)", () =>
  igual(de("despues-lider").huella, de("antes-lider").huella));

caso("y como integrante de Trujillo", () => igual(de("despues-micaela").huella, de("antes-micaela").huella));

caso("la escena mira la demanda: «reponer» trae prendas", () =>
  de("despues-lider").reponer > 0 ? null : `«reponer» vale ${de("despues-lider").reponer}: la escena no prueba la demanda`);

caso("control: si la demanda dejara de leer las ventas, los conteos cambiarían", () =>
  de("rota-lider").huella !== de("despues-lider").huella && de("rota-lider").reponer < de("despues-lider").reponer
    ? null
    : "con la demanda rota los conteos salieron iguales: la comparación no ve la demanda");

const huella = `select md5(pg_get_functiondef('${FACETAS}'::regprocedure));`;

caso("pegarla dos veces deja la misma función", () => {
  const [una, dos] = psql(`begin;\n${DESHACER}\n${MIGRACION}\n${huella}\n${MIGRACION}\n${huella}\nrollback;`)
    .split("\n")
    .filter((l) => /^[0-9a-f]{32}$/.test(l));
  return una && una === dos ? null : `la huella cambió al pegarla otra vez: ${una} → ${dos}`;
});

caso("si la «demanda» de hoy cambió, la migración no toca nada y lo dice", () => {
  try {
    psql(`begin;\n${DESHACER}
do $cambiar$ begin
  execute replace(pg_get_functiondef('${FACETAS}'::regprocedure), 'sum(m.cantidad)::numeric / 30 as diaria', 'sum(m.cantidad)::numeric / 31 as diaria');
end $cambiar$;
${MIGRACION}\nrollback;`);
    return "la migración se aplicó sobre una demanda que no es la de hoy";
  } catch (e) {
    return /se esperaba UNA aparición/.test(String(e.stderr)) ? null : String(e.stderr).split("\n")[0];
  }
});

console.log(`\n${total - fallas}/${total} casos`);
process.exit(fallas ? 1 : 0);
