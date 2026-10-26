// Prueba de la lógica de los filtros contra un cálculo independiente hecho directo sobre los datos reales.
// Correr:  node docs/maquetas/tienda-filtros-2026-10/verificar/logica.prueba.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const aqui = new URL(".", import.meta.url).pathname;
const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(aqui + "../datos-filtros.js", "utf8"), ctx);
const T = ctx.TIENDA;
const L = createRequire(import.meta.url)("../logica.js");
const M = L.crear(T);

let fallas = 0, pruebas = 0;
const ok = (cond, msg) => {
  pruebas++;
  if (!cond) {
    fallas++;
    if (fallas <= 25) console.log("  ✗", msg);
  }
};

// --- El oráculo: lo mismo, escrito aparte y sin la lógica de la maqueta -------------------------------------------------
const talla = (t) => (t === "Estándar" || t === "Única" ? ["UNICA"] : t === "S/M" ? ["S", "M"] : [t]);
function oraculo({ grupo = null, cat = null, color = [], talla: tallas = [] }) {
  return T.prendas
    .filter((p) => (!grupo || p.g === grupo) && (!cat || p.cat === cat))
    .filter((p) =>
      p.v.some(([c, t, s]) => s > 0 && (color.length === 0 || color.includes(T.famDe[c])) && (tallas.length === 0 || talla(t).some((x) => tallas.includes(x)))),
    )
    .map((p) => p.id)
    .sort();
}
const ids = (lista) => lista.map((p) => p.id).sort();
const igual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const vacio = M.estadoVacio();
const con = (o) => ({ ...vacio, color: [], talla: [], ...o });

console.log("Datos:", T.prendas.length, "prendas ·", T.familias.length, "familias de color ·", T.grupos.length, "grupos");

// 1. Sin filtros
console.log("\n1. Sin filtros");
ok(igual(ids(M.resultados(vacio)), oraculo({})), "resultados sin filtros no coincide con el oráculo");
ok(M.conteos(vacio).total === oraculo({}).length, "total sin filtros");
console.log("  con stock en Trujillo:", oraculo({}).length, "de", T.prendas.length);

// 2. Todos los pares color × talla contra el oráculo (la unidad es la variante)
console.log("\n2. Cada color × cada talla (a nivel de variante)");
let pares = 0, conAlgo = 0, sobraNaive = 0;
for (const f of T.familias) {
  for (const t of L.ORDEN_TALLAS) {
    const e = con({ color: [f.id], talla: [t] });
    const esperado = oraculo(e);
    pares++;
    if (esperado.length) conAlgo++;
    ok(igual(ids(M.resultados(e)), esperado), `par ${f.id} × ${t}`);
    // Lo que daría filtrar por separado (el error que esta lógica evita): hay prendas con el color en una talla y la talla en otro color
    const solo = (x) => new Set(oraculo(x));
    const a = solo({ color: [f.id] }), b = solo({ talla: [t] });
    const naive = [...a].filter((x) => b.has(x)).length;
    sobraNaive += naive - esperado.length;
  }
}
console.log("  pares:", pares, "· con prendas:", conAlgo, "· prendas de más si se filtrara por separado (suma de todos los pares):", sobraNaive);
ok(sobraNaive > 0, "los datos no muestran la diferencia entre variante y filtro por separado");

// 3. Cuántas daría cada opción (regla 3)
console.log("\n3. Los números de cada opción");
for (const t of L.ORDEN_TALLAS) {
  const c = M.conteos(con({ talla: [t] }));
  for (const f of T.familias) ok(c.color[f.id] === oraculo({ color: [f.id], talla: [t] }).length, `conteo color ${f.id} con talla ${t}`);
}
for (const f of T.familias) {
  const c = M.conteos(con({ color: [f.id] }));
  for (const t of L.ORDEN_TALLAS) ok(c.talla[t] === oraculo({ color: [f.id], talla: [t] }).length, `conteo talla ${t} con color ${f.id}`);
}
for (const g of T.grupos) {
  for (const f of T.familias) {
    const c = M.conteos(con({ color: [f.id] }));
    ok(c.grupo[g.id] === oraculo({ grupo: g.id, color: [f.id] }).length, `conteo grupo ${g.id} con color ${f.id}`);
  }
  for (const k of g.cats) {
    const c = M.conteos(con({ grupo: g.id, color: ["negro"], talla: ["M"] }));
    ok((c.cat[k] || 0) === oraculo({ grupo: g.id, cat: k, color: ["negro"], talla: ["M"] }).length, `conteo categoría ${k}`);
  }
}

// 4. Caminata al azar: el estado «0 resultados» no se alcanza tocando filtros (regla 4)
console.log("\n4. Caminata al azar (6000 toques)");
let semilla = 20261025;
const azar = () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 4294967296);
const elige = (a) => a[Math.floor(azar() * a.length)];
let e = M.estadoVacio();
let rechazos = 0, soltados = 0, maxFiltros = 0, muertasVistas = 0;
for (let i = 0; i < 6000; i++) {
  const r = azar();
  const estadoAntes = e;
  if (r < 0.4) {
    const t = elige(L.ORDEN_TALLAS);
    const n = M.alternar(e, "talla", t);
    if (!n.hecho) { rechazos++; ok(!e.talla.includes(t) && (M.conteos(e).talla[t] === 0 || !M.opciones(e).tallaRelevante), `rechazó talla ${t} que sí daba resultados y sí se pide`); }
    e = n.estado;
  } else if (r < 0.8) {
    const f = elige(T.familias).id;
    const n = M.alternar(e, "color", f);
    if (!n.hecho) { rechazos++; ok(!e.color.includes(f) && M.conteos(e).color[f] === 0, `rechazó color ${f} que sí daba resultados`); }
    e = n.estado;
  } else if (r < 0.92) {
    const g = elige([null, ...T.grupos]);
    const cat = g && azar() < 0.5 ? elige(g.cats) : null;
    const n = M.navegar(e, g && g.id, cat);
    if (n.soltoAlgo) soltados++;
    e = n.estado;
    // En el grupo nuevo, todo lo elegido existe (lo que no, se soltó y se dijo)
    const ex = M.existe(e);
    for (const f of e.color) ok(ex.color[f] > 0, `navegar dejó el color ${f} que no existe en ${g && g.id}`);
    for (const t of e.talla) ok(ex.talla[t] > 0, `navegar dejó la talla ${t} que no existe en ${g && g.id}`);
    ok(n.antes && M.serializar(n.antes) === M.serializar(estadoAntes), "navegar no guardó el estado de antes para deshacer");
  } else if (r < 0.96) e = M.limpiar(e, elige([undefined, "color", "talla"]));
  else e = M.siguienteOrden(e);

  const res = M.resultados(e);
  const c = M.conteos(e);
  ok(res.length > 0, `paso ${i}: 0 resultados con ${M.serializar(e)}`);
  ok(res.length === c.total, `paso ${i}: total del conteo (${c.total}) ≠ resultados (${res.length})`);
  ok(igual(ids(res), oraculo(e)), `paso ${i}: resultados ≠ oráculo con ${M.serializar(e)}`);
  // Una opción elegida puede quedar «muerta» (0 con lo que se sumó en la otra faceta), pero siempre queda una viva por faceta y
  // `muertas` dice exactamente cuáles son.
  const mu = M.muertas(e);
  ok(JSON.stringify(mu.color) === JSON.stringify(e.color.filter((f) => !(c.color[f] > 0))), `paso ${i}: muertas de color`);
  ok(JSON.stringify(mu.talla) === JSON.stringify(e.talla.filter((t) => !(c.talla[t] > 0))), `paso ${i}: muertas de talla`);
  if (e.color.length) ok(mu.color.length < e.color.length, `paso ${i}: todos los colores elegidos están muertos con ${M.serializar(e)}`);
  if (e.talla.length) ok(mu.talla.length < e.talla.length, `paso ${i}: todas las tallas elegidas están muertas con ${M.serializar(e)}`);
  muertasVistas += mu.color.length + mu.talla.length;
  maxFiltros = Math.max(maxFiltros, e.color.length + e.talla.length);
  // Donde no se pide talla no puede haber ninguna talla elegida (sería un filtro invisible)
  if (!M.opciones(e).tallaRelevante) ok(e.talla.length === 0, `paso ${i}: talla elegida donde no se pide: ${M.serializar(e)}`);
  // La dirección va y vuelve sin cambiar nada
  const lei = M.leer(M.serializar(e)).estado;
  ok(M.serializar(lei) === M.serializar(e), `paso ${i}: la dirección no vuelve igual: ${M.serializar(e)} → ${M.serializar(lei)}`);
}
console.log("  toques rechazados (opción con 0):", rechazos, "· veces que se soltó algo al cambiar de grupo:", soltados, "· opciones «muertas» vistas:", muertasVistas, "· máximo de filtros a la vez:", maxFiltros);

// 5. Cambiar de grupo desde cualquier estado nunca deja 0 y dice qué soltó
console.log("\n5. Cambiar de grupo con filtros puestos");
let casos = 0;
for (const f of T.familias) for (const t of L.ORDEN_TALLAS) {
  const base = con({ color: [f.id], talla: [t] });
  if (!oraculo(base).length) continue;
  for (const g of T.grupos) {
    const n = M.navegar(base, g.id, null);
    casos++;
    ok(M.resultados(n.estado).length > 0, `navegar a ${g.id} desde ${f.id}×${t} dejó 0`);
    // Se suelta algo si el color o la talla no existen en el grupo, o si no hay ninguna variante con los dos
    const hayColor = oraculo({ grupo: g.id, color: [f.id] }).length > 0;
    const hayTalla = oraculo({ grupo: g.id, talla: [t] }).length > 0;
    const hayAmbos = oraculo({ grupo: g.id, color: [f.id], talla: [t] }).length > 0;
    const pide = M.opciones({ ...vacio, grupo: g.id }).tallaRelevante; // donde no se pide talla, ninguna talla queda elegida
    ok(n.soltoAlgo === (!hayColor || !hayTalla || !hayAmbos || !pide), `soltoAlgo=${n.soltoAlgo} al ir a ${g.id} desde ${f.id}×${t} (color ${hayColor}, talla ${hayTalla}, ambos ${hayAmbos}, pide ${pide})`);
    if (hayColor && hayTalla && hayAmbos && pide) ok(n.estado.color.length === 1 && n.estado.talla.length === 1, `soltó de más al ir a ${g.id} desde ${f.id}×${t}`);
  }
}
console.log("  casos:", casos);

// 5b. La talla «Estándar / única» no sobrevive donde no se pide talla (hallazgo de tres verificadores independientes)
console.log("\n5b. Talla única hacia un grupo sin tallas");
for (const g of ["bolsos", "bisuteria", "otros"]) {
  const base = con({ talla: ["UNICA"] });
  const n = M.navegar(base, g, null);
  ok(n.estado.talla.length === 0 && n.soltado.talla.includes("UNICA") && n.soltoAlgo, `UNICA sobrevivió al ir a ${g}`);
  ok(M.alternar({ ...vacio, grupo: g, color: [], talla: [] }, "talla", "UNICA").hecho === false, `se pudo elegir UNICA dentro de ${g}`);
  ok(M.leer("#g=" + g + "&t=UNICA").estado.talla.length === 0, `leer dejó UNICA dentro de ${g}`);
}
ok(M.navegar(con({ talla: ["UNICA"] }), "blusas", null).estado.talla.join() === "UNICA", "UNICA debe quedarse en un grupo que sí pide talla");

// 6. Una dirección escrita a mano no rompe nada
console.log("\n6. Direcciones raras");
for (const h of ["", "#", "#c=zzz&t=99&g=nada&o=xx&p=-4", "#c=negro,negro,blanco&t=XXL&g=bolsos", "#g=blusas&k=Jeans", "#p=9999", "#t=%E0%A4%A", "#c=negro&t=34&g=blusas"]) {
  let r;
  try { r = M.leer(h); } catch (x) { ok(false, `leer(${h}) lanzó ${x.message}`); continue; }
  ok(M.resultados(r.estado).length > 0, `leer(${h}) dejó 0`);
  ok(r.estado.pagina >= 1, `leer(${h}) página ${r.estado.pagina}`);
}

// 7. Cuándo tiene sentido pedir talla
console.log("\n7. ¿Se pide talla? (hay al menos dos tallas de verdad)");
for (const g of [null, ...T.grupos]) {
  const o = M.opciones({ ...vacio, grupo: g && g.id });
  const nombre = g ? g.nombre : "Todo";
  console.log("  " + nombre.padEnd(22), o.tallaRelevante ? "sí " : "NO ", "tallas:", o.tallas.join(" ") || "—", "· colores:", o.familias.length);
}
ok(M.opciones({ ...vacio, grupo: "bolsos" }).tallaRelevante === false, "bolsos no debería pedir talla");
ok(M.opciones({ ...vacio, grupo: "pantalones" }).tallaRelevante === true, "pantalones debería pedir talla");
ok(M.opciones(vacio).tallaRelevante === true, "todo debería pedir talla");

// 8. Qué dice cada tarjeta
console.log("\n8. Lo que dice cada tarjeta");
const nneg = M.resultados(con({ color: ["negro"], talla: ["M"] }));
const muestra = nneg[0];
const co = M.coincidencias(muestra, con({ color: ["negro"], talla: ["M"] }));
ok(co.colores.length === 1 && co.colores[0] === "Negro" && co.tallas.join() === "M", "coincidencias de negro × M");
ok(M.muestras(muestra, con({ color: ["negro"] }))[0].elegido, "la muestra elegida va primero");
ok(/color=NEG/.test(M.enlaceDe(muestra, con({ color: ["negro"], talla: ["M"] }))), "el enlace lleva el color");
console.log("  ejemplo:", muestra.n, "→", M.enlaceDe(muestra, con({ color: ["negro"], talla: ["M"] })));

console.log(`\n${fallas === 0 ? "TODO BIEN" : "HAY FALLAS"}: ${pruebas - fallas}/${pruebas} comprobaciones`);
process.exit(fallas === 0 ? 0 : 1);
