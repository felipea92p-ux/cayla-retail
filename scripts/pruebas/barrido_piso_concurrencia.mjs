#!/usr/bin/env node
/**
 * Prueba de concurrencia de ADR-0690 «El barrido del piso», actividad 2 — cinco celulares a la vez, con conexiones reales y COMMIT.
 *
 * POR QUÉ APARTE. `barrido_piso.mjs` corre todo en ROLLBACK; así no se ve lo que pasa cuando dos transacciones chocan de verdad
 * (una sin commit es invisible para la otra). Esta prueba SÍ commitea, y por eso solo corre en una base desechable: aborta si
 * no se le pasa `BASE_DESECHABLE=1`. No va en el CI (igual que `bajada_al_piso_concurrencia.mjs`) y no limpia lo que deja (lo
 * escaneado no se puede borrar): cada corrida crea su propia sede («ZZ Barrido Concurrencia <marca>») y solo cuenta lo suyo.
 *
 * QUÉ CUBRE
 *   K1 cinco personas tocan «Empezar el barrido» a la vez en la misma sede → UN solo barrido, cuatro se suman al de la primera.
 *   K2 cinco celulares escanean a la vez (200 lecturas cada uno, en lotes de 50, varios en la MISMA prenda) → entran las 1.000,
 *      la suma de cada prenda es exacta y nadie pisa a nadie (en Conteo, el último guardado ganaba).
 *   K3 el mismo lote reenviado a la vez desde dos conexiones (la respuesta se perdió y el celular reintenta) → se guarda una vez:
 *      una respuesta dice guardadas = 50 y la otra 0, y el total no se duplica.
 *
 * USO
 *   BASE_DESECHABLE=1 pnpm pruebas:barrido-piso-concurrencia    → SOLO contra un Postgres desechable
 */

import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

if (process.env.BASE_DESECHABLE !== "1") {
  console.error(
    "Esta prueba COMMITEA un barrido y sus lecturas (no se pueden borrar). Córrela solo contra un Postgres desechable:\n" +
      "  BASE_DESECHABLE=1 pnpm pruebas:barrido-piso-concurrencia"
  );
  process.exit(1);
}

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed): opera cualquier tienda y firma él
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function psqlAsync(sql) {
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout, stderr }));
    p.stdin.write(sql);
    p.stdin.end();
  });
}
const jsons = (texto) => texto.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));

/** Una sesión de la API como Felipe, en su propia transacción que se commitea al final. */
const COMO_FELIPE = `set request.jwt.claim.sub = '${FELIPE}';
set request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
set role authenticated;
`;

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle = "") {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).slice(0, 2500).replace(/\n/g, "\n    ")}`);
  }
}

// La sede propia de esta corrida, con piso y almacén, y cuatro prendas cualquiera del catálogo.
const marca = randomUUID().slice(0, 8);
const sede = psql(`insert into retail.ubicaciones (nombre, tipo) values ('ZZ Barrido Concurrencia ${marca}', 'tienda') returning id;`).split("\n")[0];
psql(`insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values ('${sede}', 'Piso de venta', 'piso_venta'), ('${sede}', 'Almacén de tienda', 'almacen_tienda');`);
const prendas = psql(`select v.id from retail.variantes v join retail.productos p on p.id = v.producto_id
  where v.id <> '22222222-2222-4222-8222-222222222222' and not p.es_prueba order by v.id limit 4;`).split("\n");

// K1 · cinco «Empezar» a la vez.
const aperturas = await Promise.all(
  Array.from({ length: 5 }, () => psqlAsync(`${COMO_FELIPE}select retail.abrir_barrido_piso('${sede}');\n`))
);
const respuestas = aperturas.flatMap((r) => jsons(r.stdout));
const ids = new Set(respuestas.map((r) => r.estado?.barrido?.id));
esperar(
  "K1 · cinco personas tocan «Empezar» a la vez → UN barrido abierto; una lo creó y cuatro se sumaron",
  aperturas.every((r) => r.code === 0) &&
    ids.size === 1 &&
    respuestas.filter((r) => r.nuevo === true).length === 1 &&
    psql(`select count(*) from retail.barridos_piso where ubicacion_id = '${sede}';`) === "1",
  aperturas.map((r) => r.stderr || r.stdout).join("\n")
);
const barrido = [...ids][0];

// K2 · cinco celulares, 200 lecturas cada uno en 4 lotes de 50; cada celular reparte sus lecturas en las 4 prendas.
const loteSql = (lecturas) =>
  `${COMO_FELIPE}select retail.registrar_lecturas_barrido('${barrido}', '${JSON.stringify(lecturas)}'::jsonb);\n`;
const celulares = Array.from({ length: 5 }, (_, c) =>
  Array.from({ length: 4 }, (_, l) => Array.from({ length: 50 }, (_, i) => ({ id: randomUUID(), variante_id: prendas[(c + l + i) % 4] })))
);
const esperado = {};
for (const lotes of celulares) for (const lote of lotes) for (const x of lote) esperado[x.variante_id] = (esperado[x.variante_id] ?? 0) + 1;
const corridas = await Promise.all(
  celulares.map(async (lotes) => {
    const out = [];
    for (const lote of lotes) out.push(await psqlAsync(loteSql(lote)));
    return out;
  })
);
const todas = corridas.flat();
const porPrenda = Object.fromEntries(
  psql(`select variante_id || '|' || sum(cantidad) from retail.barrido_piso_lecturas where barrido_id = '${barrido}' group by variante_id;`)
    .split("\n")
    .map((l) => l.split("|"))
    .map(([v, n]) => [v, Number(n)])
);
esperar(
  "K2 · cinco celulares a la vez, 1.000 lecturas en 20 lotes → entran todas y cada prenda suma exacto (nadie pisa a nadie)",
  todas.every((r) => r.code === 0 && jsons(r.stdout)[0]?.guardadas === 50) &&
    Object.values(porPrenda).reduce((a, n) => a + n, 0) === 1000 &&
    Object.entries(esperado).every(([v, n]) => porPrenda[v] === n),
  JSON.stringify({ esperado, porPrenda, errores: todas.filter((r) => r.code !== 0).map((r) => r.stderr) })
);

// K3 · el mismo lote desde dos conexiones a la vez.
const repetido = Array.from({ length: 50 }, (_, i) => ({ id: randomUUID(), variante_id: prendas[i % 4] }));
const [a, b] = await Promise.all([psqlAsync(loteSql(repetido)), psqlAsync(loteSql(repetido))]);
const ra = jsons(a.stdout)[0];
const rb = jsons(b.stdout)[0];
esperar(
  "K3 · el mismo lote reenviado a la vez desde dos conexiones → se guarda una sola vez (50 y 0) y el total no se duplica",
  a.code === 0 &&
    b.code === 0 &&
    [ra?.guardadas, rb?.guardadas].sort().join(",") === "0,50" &&
    psql(`select sum(cantidad) from retail.barrido_piso_lecturas where barrido_id = '${barrido}';`) === "1050",
  `${a.stderr}${a.stdout}\n${b.stderr}${b.stdout}`
);

console.log(`\n${fallos === 0 ? "✓" : "✗"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);
