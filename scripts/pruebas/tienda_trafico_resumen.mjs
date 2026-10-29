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
 *   7. Las prendas: por cada una, hasta dónde llegó cada persona con ella (también quien solo la separó), sus tallas, sus colores,
 *      sus caminos y cuántas la miraron antes (actividad 5).
 *   8. De dónde vienen: cuántas personas por camino y por ciudad (cada lista sin su propio filtro, con el otro) y las 24 horas de su
 *      primera entrada, en Lima (actividad 6).
 *   9. «Ahora» y «último dato».
 *  10. La migración se puede pegar dos veces.
 *  12. La serie del gráfico (20261029040000, actividad 2): por hora en un día, por día en varios, para estos días y los de antes.
 *  11. Los días con los que se compara (20261029015000, «Observatorio» actividad 1): a mano (el día anterior pedido, no el de atrás del
 *      mismo largo), con corte de hora («ayer a esta hora»), y lo que no vale se rechaza (22023); sin pedirlos, todo sigue igual.
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
const MIGRACION_PERIODOS = readFileSync("supabase/migrations/20261029015000_trafico_web_periodos.sql", "utf8");
const MIGRACION_SERIE = readFileSync("supabase/migrations/20261029040000_trafico_web_serie.sql", "utf8");
const MIGRACION_CALOR = readFileSync("supabase/migrations/20261029042000_trafico_web_calor.sql", "utf8");
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
-- Los dos pedidos llevan la prenda: quien los separó la separó (y quien recogió el entregado, la recogió). Las reglas de un pedido no
-- dejan sumarle una prenda a uno ya entregado: aquí se apagan solo para armar la escena (todo se deshace con el rollback).
set local session_replication_role = replica;
insert into retail.pedido_web_lineas (pedido_id, posicion, variante_id, precio_lista) values ('${PEDIDO_ENTREGADO}', 1, :'talla', 100), ('${PEDIDO_SEPARADO}', 1, :'talla', 100);
set local session_replication_role = origin;
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
${paso(5, "2025-01-09 23:55", 1, { prenda: true })}
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

// ---- 6. Las prendas (actividad 5) ----
// Lee las prendas como el líder y las mira como postgres: `P` es la lista.
const prendas = (expr, camino = "null") => escenario(`${resumen(camino)} -> 'prendas' as p \\gset
${COMO_POSTGRES}select ${expr.replaceAll("P", "(:'p'::jsonb)")};`);
esperarValor("solo sale la prenda que miró la gente del período", prendas("jsonb_array_length(P)"), "1");
esperarValor(
  "su recorrido cuenta personas: 3 la miraron (una solo al separar), 3 eligieron talla y la pusieron en la bolsa, 2 la separaron, 1 la recogió",
  prendas("jsonb_build_array(P -> 0 -> 'miraron', P -> 0 -> 'talla', P -> 0 -> 'bolsa', P -> 0 -> 'separaron', P -> 0 -> 'recogieron')"),
  "[3, 3, 3, 2, 1]",
);
esperarValor("con el filtro de Instagram, la miró 1", prendas("P -> 0 -> 'miraron'", "'instagram'"), "1");
esperarValor("la talla elegida la eligieron 2 personas", prendas("P -> 0 -> 'tallas' -> 0 -> 'n'"), "2");
esperarValor("el color elegido, también 2", prendas("P -> 0 -> 'colores' -> 0 -> 'n'"), "2");
esperarValor("sus caminos suman los que la miraron", prendas("(select sum((c ->> 'n')::int) from jsonb_array_elements(P -> 0 -> 'caminos') c)"), "3");
esperarValor("«antes» la miró quien la vio el día anterior", prendas("P -> 0 -> 'anterior'"), "1");
esperarValor(
  "trae su nombre, su código, su precio y los colores del catálogo",
  prendas("(P -> 0 ? 'nombre') and (P -> 0 ->> 'codigo') is not null and (P -> 0 ->> 'precio') is not null and jsonb_array_length(P -> 0 -> 'colores_catalogo') >= 1 and (P -> 0 ? 'foto') and (P -> 0 ? 'prefijo')"),
  "t",
);
const directoPrendas = escenario(`${COMO(FELIPE)}select count(*) from retail.fn_trafico_web_prendas('2025-01-10', '2025-01-10');`);
esperar("nadie llama directo a las prendas", !directoPrendas.ok && /permission denied/.test(directoPrendas.mensaje), directoPrendas.ok ? "se pudo" : directoPrendas.mensaje);

// ---- 7. De dónde vienen y a qué hora (actividad 6) ----
// Mira el resumen como postgres: `R` es el resumen entero.
const conResumen = (expr, camino = "null", ciudad = "null") => escenario(`${resumen(camino, ciudad)} as r \\gset
${COMO_POSTGRES}select ${expr.replaceAll("R", "(:'r'::jsonb)")};`);
esperarValor(
  "los caminos dicen cuántas personas llegaron por cada uno (y suman el total)",
  conResumen("(R -> 'caminos' ->> 'instagram') || ',' || (R -> 'caminos' ->> 'google') || ',' || (select sum(v::int) from jsonb_each_text(R -> 'caminos') as t(k, v))"),
  "1,1,4",
);
esperarValor("con Instagram puesto, los caminos se siguen contando todos (tocar otro cambia de camino)", conResumen("(select sum(v::int) from jsonb_each_text(R -> 'caminos') as t(k, v))", "'instagram'"), "4");
esperarValor("…pero las ciudades son las de Instagram", conResumen("R -> 'ciudades'", "'instagram'"), '{"trujillo": 1}');
esperarValor("con Lima puesta, los caminos son los de Lima", conResumen("R -> 'caminos'", "null", "'lima'"), '{"google": 1, "tiktok": 1}');
esperarValor(
  "las horas son 24, suman los que entraron y van por la hora de Lima de su primera entrada",
  conResumen("jsonb_array_length(R -> 'horas') || ',' || (select sum(v::int) from jsonb_array_elements_text(R -> 'horas') v) || ',' || (R -> 'horas' ->> 9) || ',' || (R -> 'horas' ->> 15) || ',' || (R -> 'horas' ->> 16)"),
  "24,4,1,1,0",
);

// ---- 8. La ciudad de cada departamento ----
esperarValor(
  "la ciudad de cada departamento",
  escenario(`select string_agg(retail.fn_trafico_web_ciudad(r), ',' order by n) from unnest(array['PE-LAL','PE-LIM','PE-LMA','PE-CAL','PE-ARE','PE-LAM','PE-PIU','PE-CUS','PE-AMA','PE','US',null]) with ordinality as t(r, n);`),
  "trujillo,lima,lima,lima,arequipa,chiclayo,piura,cusco,otras,otras,fuera,sin_dato",
);

// ---- 9. Ahora y último dato ----
esperarValor(
  "«ahora» cuenta a quien dio un paso hace menos de 5 minutos, y «último dato» es el último paso que llegó",
  escenario(`${paso(8, "2025-01-10 12:00", 0, { camino: "directo" }).replace(lima("2025-01-10 12:00"), "now()")}
    ${resumen()} as r \\gset
    ${COMO_POSTGRES}select ((:'r'::jsonb ->> 'ahora')::int >= 1) and ((:'r'::jsonb ->> 'ultimo_dato')::timestamptz = now());`),
  "t",
);
esperarValor("la base del veredicto son 6 cifras que nunca crecen", escenario(`${resumen()} as r \\gset
  ${COMO_POSTGRES}select bool_and(a >= b) from (select (e.v)::int a, lead((e.v)::int) over (order by e.n) b from jsonb_array_elements_text(:'r'::jsonb -> 'base') with ordinality as e(v, n)) x where b is not null;`), "t");

// ---- 10. Se puede pegar dos veces ----
const dosVeces = correr(`begin;\n${MIGRACION}\n${MIGRACION}\nrollback;`);
esperar("la migración se puede pegar dos veces", dosVeces.ok, dosVeces.mensaje);

// ---- 11. Los días con los que se compara ----
const comparar = (extra) => `${COMO(FELIPE)}select retail.resumen_trafico_web('2025-01-10', '2025-01-10', null, null${extra})`;
esperarValor("sin pedirlos, «antes» sigue siendo el día de atrás del mismo largo", escenario(`${comparar("")} ->> 'anterior';`), "1");
esperarValor("los días de antes se pueden pedir a mano (el 9)", escenario(`${comparar(", '2025-01-09', '2025-01-09'")} ->> 'anterior';`), "1");
esperarValor("pedidos a mano, se devuelven tal cual", escenario(`${comparar(", '2025-01-02', '2025-01-03'")} ->> 'anterior_desde';`), "2025-01-02");
esperarValor("pedir otros días sin ninguna visita en ellos da 0", escenario(`${comparar(", '2025-01-02', '2025-01-03'")} ->> 'anterior';`), "0");
esperarValor(
  "con corte, solo cuenta a quien entró hasta esa hora de ayer (a las 11 p. m. aún nadie)",
  escenario(`${comparar(`, '2025-01-09', '2025-01-09', ${lima("2025-01-09 23:00")}`)} ->> 'anterior';`),
  "0",
);
esperarValor(
  "con corte, quien entró antes de esa hora sí cuenta (a las 11:55 p. m. ya entró la persona 5)",
  escenario(`${comparar(`, '2025-01-09', '2025-01-09', ${lima("2025-01-09 23:55")}`)} ->> 'anterior';`),
  "1",
);
esperarValor("sin corte, «anterior_corte» sale vacío", escenario(`${comparar("")} ->> 'anterior_corte' is null;`), "t");
esperarValor(
  "con corte, «anterior_corte» dice cuál fue",
  escenario(`${comparar(`, '2025-01-09', '2025-01-09', ${lima("2025-01-09 23:00")}`)} ->> 'anterior_corte' is not null;`),
  "t",
);
for (const [nombre, extra] of [
  ["solo la mitad de los días de antes no vale", ", '2025-01-09', null"],
  ["los días de antes al revés no valen", ", '2025-01-09', '2025-01-08'"],
  ["los días de antes que tocan el período no valen", ", '2025-01-09', '2025-01-10'"],
  ["un corte sin días de antes no vale", `, null, null, ${lima("2025-01-09 23:00")}`],
]) {
  const r = escenario(`${comparar(extra)};`);
  esperar(`${nombre} (22023)`, !r.ok && /días con los que se compara/.test(r.mensaje), r.ok ? "se leyó" : r.mensaje);
}
esperar("la migración de períodos se puede pegar dos veces", correr(`begin;\n${MIGRACION_PERIODOS}\n${MIGRACION_PERIODOS}\nrollback;`).ok, "falló al pegar dos veces");
const un = correr(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'resumen_trafico_web';`);
esperarValor("queda UNA sola `resumen_trafico_web` (sin sobrecarga que haga ambigua la llamada con nombres)", un, "1");

// ---- 12. La serie del gráfico ----
// Del 10: la 1 entró a las 3 p. m. y recogió; la 2 entró a las 8 p. m. y llegó a la bolsa; la 3 a las 9 p. m. y se fue; la 6 a las 9 a. m. y separó.
esperarValor("en un día, la serie va por hora", escenario(`${resumen()} -> 'serie' ->> 'por';`), "hora");
esperarValor(
  "por hora: [hora, entraron, vieron, separaron, recogieron] en orden, solo las horas con gente",
  escenario(`${resumen()} -> 'serie' -> 'actual';`),
  "[[9, 1, 1, 1, 0], [15, 1, 1, 1, 1], [20, 1, 1, 0, 0], [21, 1, 0, 0, 0]]",
);
esperarValor(
  "la serie suma lo mismo que los totales del período (entraron)",
  escenario(`${resumen()} as r \\gset
  ${COMO_POSTGRES}select (select sum((e ->> 1)::int) from jsonb_array_elements(:'r'::jsonb -> 'serie' -> 'actual') e) = (:'r'::jsonb -> 'pasos' ->> 0)::int;`),
  "t",
);
esperarValor(
  "«antes» va por hora del día de antes, completo aunque haya corte (la 5 entró a las 11:50 p. m. del 9)",
  escenario(`${COMO(FELIPE)}select retail.resumen_trafico_web('2025-01-10', '2025-01-10', null, null, '2025-01-09', '2025-01-09', ${lima("2025-01-09 12:00")}) -> 'serie' -> 'antes';`),
  "[[23, 1, 1, 0, 0]]",
);
esperarValor("en varios días, la serie va por día", escenario(`${resumen("null", "null", "2025-01-09", "2025-01-10")} -> 'serie' ->> 'por';`), "dia");
esperarValor(
  "por día: el día 0 es el primero del período (el 9 tiene a la 5; el 10, a las otras 4)",
  escenario(`${resumen("null", "null", "2025-01-09", "2025-01-10")} -> 'serie' -> 'actual';`),
  "[[0, 1, 1, 0, 0], [1, 4, 3, 2, 1]]",
);
esperarValor("con un camino puesto, la serie es solo de ese camino", escenario(`${resumen("'instagram'")} -> 'serie' -> 'actual';`), "[[15, 1, 1, 1, 1]]");
esperar("la migración de la serie se puede pegar dos veces", correr(`begin;\n${MIGRACION_SERIE}\n${MIGRACION_SERIE}\nrollback;`).ok, "falló al pegar dos veces");

// ---- 13. El mapa de calor (día de la semana × hora) ----
// El 10 de enero de 2025 es viernes (día 4) y el 9, jueves (día 3). Un día mira las 4 semanas que terminan en él: del 14 de diciembre al 10.
esperarValor("un día mira 4 semanas: desde el 14 de diciembre", escenario(`${resumen()} -> 'calor' ->> 'desde';`), "2024-12-14");
esperarValor("en 4 semanas, cada día de la semana cae 4 veces", escenario(`${resumen()} -> 'calor' -> 'dias';`), "[4, 4, 4, 4, 4, 4, 4]");
esperarValor(
  "las celdas son [día, hora, personas] por la primera entrada, en Lima (la 5 entró el jueves 9 a las 11:50 p. m.)",
  escenario(`${resumen()} -> 'calor' -> 'celdas';`),
  "[[3, 23, 1], [4, 9, 1], [4, 15, 1], [4, 20, 1], [4, 21, 1]]",
);
esperarValor("con un camino puesto, el mapa es solo de ese camino", escenario(`${resumen("'instagram'")} -> 'calor' -> 'celdas';`), "[[4, 15, 1]]");
esperarValor(
  "un período de más de 4 semanas se mira entero (del 1 de noviembre al 10 de enero: 71 días)",
  escenario(`${resumen("null", "null", "2024-11-01", "2025-01-10")} -> 'calor' as c \\gset
  ${COMO_POSTGRES}select (:'c'::jsonb ->> 'desde') || ' ' || (select sum(d::int) from jsonb_array_elements_text(:'c'::jsonb -> 'dias') d);`),
  "2024-11-01 71",
);
esperar("la migración del mapa de calor se puede pegar dos veces", correr(`begin;\n${MIGRACION_CALOR}\n${MIGRACION_CALOR}\nrollback;`).ok, "falló al pegar dos veces");

console.log(`\n${total - fallos} de ${total} bien.`);
if (fallos) process.exit(1);
