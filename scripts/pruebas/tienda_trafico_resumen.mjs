#!/usr/bin/env node
/**
 * Tienda web ▸ Tráfico: lo que lee el ERP (ADR-0495, actividad 4) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261023231000_trafico_web_lectura.sql`:
 *   1. Solo quien ve el módulo `trafico` lee (el líder); una integrante sin el módulo recibe 42501. Un período al revés, 22023.
 *   2. Se cuentan PERSONAS por el paso más lejano al que llegaron: quien agrega a la bolsa sin abrir la ficha cuenta como que vio la
 *      prenda y eligió talla; el recorrido nunca crece hacia abajo; «recogieron» sale del pedido entregado.
 *   3. Solo cuenta quien ENTRÓ en esos días (Lima): quien entró la noche anterior no es de este período.
 *   4. El camino y la ciudad son los de la primera entrada del período: los caminos suman el total y filtrar por uno da su fila.
 *   5. «Antes» son los días de atrás del mismo largo; quien manda más de 200 pasos en un día no se cuenta.
 *   6. La ciudad de cada departamento (Lima, Lima Metropolitana y Callao son Lima; otro del Perú, «otras»; fuera, «fuera»).
 *   7. «Ahora» y «último dato».
 *   8. La migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK y escribe sus pasos en enero de 2025, lejos de lo que haya en la base local.
 *
 * DA POR SENTADO (el seed): Felipe líder, Micaela integrante sin el módulo, una clienta y una tienda.
 *
 * USO
 *   pnpm pruebas:tienda-trafico-resumen    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-trafico-resumen -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = readFileSync("supabase/migrations/20261023231000_trafico_web_lectura.sql", "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo, sin «trafico»

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 6).join("\n    ")}`);
  }
}
const ultima = (r) => (r.ok ? { ok: true, salida: r.salida.split("\n").at(-1) } : r);
function esperarValor(nombre, r, esperado) {
  const u = ultima(r);
  esperar(nombre, u.ok && u.salida === esperado, u.ok ? `dio «${u.salida}», se esperaba «${esperado}»` : u.mensaje);
}

const COMO = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;
const COMO_POSTGRES = "reset role;\n";

// Un paso en una hora de Lima («2025-01-10 15:00»).
const v = (n) => `'0c0c0c0c-0000-4000-8000-${String(n).padStart(12, "0")}'`;
const lima = (cuando) => `('${cuando}'::timestamp at time zone 'America/Lima')`;
const paso = (vis, cuando, p, extra = {}) =>
  `insert into retail.trafico_web (visitante, ocurrio_en, paso, camino, region, producto_id, variante_id, pedido_web_id) values (${v(vis)}, ${lima(cuando)}, ${p}, ${extra.camino ? `'${extra.camino}'` : "null"}, ${extra.region ? `'${extra.region}'` : "null"}, ${extra.prenda ? ":'prenda'" : "null"}, ${extra.talla ? ":'talla'" : "null"}, ${extra.pedido ? `'${extra.pedido}'` : "null"});`;

const PEDIDO_ENTREGADO = "0c0c0c0c-0000-4000-8000-0000000000e1";
const PEDIDO_SEPARADO = "0c0c0c0c-0000-4000-8000-0000000000e2";

const PREPARAR = `
begin;
select p.id as prenda from retail.productos p where exists (select 1 from retail.variantes x where x.producto_id = p.id) order by p.codigo nulls last, p.id limit 1 \\gset
select x.id as talla from retail.variantes x where x.producto_id = :'prenda' order by x.id limit 1 \\gset
select id as felipe_p from public.personas where auth_user_id = '${FELIPE}' \\gset
insert into retail.pedidos_web (id, clienta_id, ubicacion_id, estado, total, pagado, confirmado_en, confirmado_por, pagado_en, entregado_en, entregado_por, creado_en)
select '${PEDIDO_ENTREGADO}', (select id from retail.clientas order by id limit 1), (select id from retail.ubicaciones order by id limit 1),
  'entregado', 100, 100, now(), :'felipe_p', now(), now(), :'felipe_p', ${lima("2025-01-10 15:10")};
insert into retail.pedidos_web (id, clienta_id, ubicacion_id, creado_en)
select '${PEDIDO_SEPARADO}', (select id from retail.clientas order by id limit 1), (select id from retail.ubicaciones order by id limit 1), ${lima("2025-01-10 16:10")};
-- 1: entra por Instagram desde La Libertad y llega hasta recoger.
${paso(1, "2025-01-10 15:00", 0, { camino: "instagram", region: "PE-LAL" })}
${paso(1, "2025-01-10 15:01", 1, { prenda: true })}
${paso(1, "2025-01-10 15:02", 2, { prenda: true, talla: true })}
${paso(1, "2025-01-10 15:03", 3, { prenda: true, talla: true })}
${paso(1, "2025-01-10 15:10", 4, { pedido: PEDIDO_ENTREGADO })}
-- 2: entra por TikTok desde Lima Metropolitana y agrega desde la tarjeta (sin abrir la ficha ni elegir talla aparte).
${paso(2, "2025-01-10 20:00", 0, { camino: "tiktok", region: "PE-LMA" })}
${paso(2, "2025-01-10 20:05", 3, { prenda: true, talla: true })}
-- 3: entra directo, sin departamento, y se va.
${paso(3, "2025-01-10 21:00", 0, { camino: "directo" })}
-- 4: nunca «entró» en el período (solo vio): no cuenta.
${paso(4, "2025-01-10 10:00", 1, { prenda: true })}
-- 5: entró la noche anterior (por WhatsApp, desde Cusco) y miró hoy: es de ayer, no de hoy.
${paso(5, "2025-01-09 23:50", 0, { camino: "whatsapp", region: "PE-CUS" })}
${paso(5, "2025-01-10 00:05", 1, { prenda: true })}
-- 6: entra dos veces: primero por Google desde el Callao, después por el QR. Cuenta una vez, por Google, en Lima; y separa sin recoger.
${paso(6, "2025-01-10 09:00", 0, { camino: "google", region: "PE-CAL" })}
${paso(6, "2025-01-10 16:00", 0, { camino: "qr", region: "PE-LAL" })}
${paso(6, "2025-01-10 16:10", 4, { pedido: PEDIDO_SEPARADO })}
-- 7: manda 201 pasos en un día: no es una persona.
${paso(7, "2025-01-10 12:00", 0, { camino: "otros", region: "US" })}
insert into retail.trafico_web (visitante, ocurrio_en, paso, producto_id) select ${v(7)}, ${lima("2025-01-10 12:01")}, 1, :'prenda' from generate_series(1, 200);
`;
const FIN = "rollback;\n";
const escenario = (cuerpo) => correr(`${PREPARAR}${cuerpo}\n${FIN}`);
const resumen = (camino = "null", ciudad = "null", desde = "2025-01-10", hasta = "2025-01-10") =>
  `${COMO(FELIPE)}select retail.resumen_trafico_web('${desde}', '${hasta}', ${camino}, ${ciudad})`;

// ---- 1. Quién lee ----
esperarValor("el líder lee", escenario(`${resumen()} ? 'pasos';`), "t");
const micaela = escenario(`${COMO(MICAELA)}select retail.resumen_trafico_web('2025-01-10', '2025-01-10');`);
esperar("una integrante sin el módulo recibe 42501", !micaela.ok && /no ve «Tráfico/.test(micaela.mensaje), micaela.ok ? "pudo leer" : micaela.mensaje);
const alReves = escenario(`${COMO(FELIPE)}select retail.resumen_trafico_web('2025-01-10', '2025-01-01');`);
esperar("un período al revés no se lee (22023)", !alReves.ok && /período no es válido/.test(alReves.mensaje), alReves.ok ? "se leyó" : alReves.mensaje);
const directo = escenario(`${COMO(FELIPE)}select count(*) from retail.fn_trafico_web_personas('2025-01-10', '2025-01-10');`);
esperar("nadie llama directo a la lista de personas", !directo.ok && /permission denied/.test(directo.mensaje), directo.ok ? "se pudo" : directo.mensaje);

// ---- 2 y 3. Personas por su paso más lejano, solo las que entraron ese día ----
esperarValor(
  "el recorrido cuenta personas: 4 entraron, 3 vieron y eligieron talla y la pusieron en la bolsa (una desde la tarjeta), 2 separaron, 1 recogió",
  escenario(`${resumen()} -> 'pasos';`),
  "[4, 3, 3, 3, 2, 1]",
);

// ---- 4. Camino y ciudad de la primera entrada; los caminos suman el total ----
esperarValor("filtrar por Instagram da solo a esa persona, hasta recoger", escenario(`${resumen("'instagram'")} -> 'pasos';`), "[1, 1, 1, 1, 1, 1]");
esperarValor("quien entró por Google y después por el QR cuenta por Google", escenario(`${resumen("'google'")} -> 'pasos' -> 0;`), "1");
esperarValor("…y no por el QR", escenario(`${resumen("'qr'")} -> 'pasos' -> 0;`), "0");
esperarValor(
  "los caminos suman el total",
  escenario(`${COMO(FELIPE)}select sum((retail.resumen_trafico_web('2025-01-10', '2025-01-10', c, null) -> 'pasos' ->> 0)::int) from unnest(array['instagram','directo','whatsapp','tiktok','google','qr','otros']) c;`),
  "4",
);
esperarValor("Lima junta Lima Metropolitana y el Callao", escenario(`${resumen("null", "'lima'")} -> 'pasos';`), "[2, 2, 2, 2, 1, 0]");
esperarValor("sin departamento es «sin_dato»", escenario(`${resumen("null", "'sin_dato'")} -> 'pasos' -> 0;`), "1");

// ---- 5. Antes, y lo que no es una persona ----
esperarValor("«antes» son los días de atrás del mismo largo (la persona que entró la noche anterior)", escenario(`${resumen()} -> 'anterior';`), "1");
esperarValor("quien manda más de 200 pasos en un día no cuenta (ni por «Otros»)", escenario(`${resumen("'otros'")} -> 'pasos' -> 0;`), "0");
esperarValor("una semana: del 10 al 16, contra del 3 al 9", escenario(`${resumen("null", "null", "2025-01-10", "2025-01-16")} ->> 'anterior_desde';`), "2025-01-03");

// ---- 6. La ciudad de cada departamento ----
esperarValor(
  "la ciudad de cada departamento",
  escenario(`select string_agg(retail.fn_trafico_web_ciudad(r), ',' order by n) from unnest(array['PE-LAL','PE-LIM','PE-LMA','PE-CAL','PE-ARE','PE-LAM','PE-PIU','PE-CUS','PE-AMA','PE','US',null]) with ordinality as t(r, n);`),
  "trujillo,lima,lima,lima,arequipa,chiclayo,piura,cusco,otras,otras,fuera,sin_dato",
);

// ---- 7. Ahora y último dato ----
esperarValor(
  "«ahora» cuenta a quien dio un paso hace menos de 5 minutos, y «último dato» es el último paso que llegó",
  escenario(`${paso(8, "2025-01-10 12:00", 0, { camino: "directo" }).replace(lima("2025-01-10 12:00"), "now()")}
    ${resumen()} as r \\gset
    ${COMO_POSTGRES}select ((:'r'::jsonb ->> 'ahora')::int >= 1) and ((:'r'::jsonb ->> 'ultimo_dato')::timestamptz = now());`),
  "t",
);
esperarValor("la base del veredicto son 6 cifras que nunca crecen", escenario(`${resumen()} as r \\gset
  ${COMO_POSTGRES}select bool_and(a >= b) from (select (e.v)::int a, lead((e.v)::int) over (order by e.n) b from jsonb_array_elements_text(:'r'::jsonb -> 'base') with ordinality as e(v, n)) x where b is not null;`), "t");

// ---- 8. Se puede pegar dos veces ----
const dosVeces = correr(`begin;\n${MIGRACION}\n${MIGRACION}\nrollback;`);
esperar("la migración se puede pegar dos veces", dosVeces.ok, dosVeces.mensaje);

console.log(`\n${total - fallos} de ${total} bien.`);
if (fallos) process.exit(1);
