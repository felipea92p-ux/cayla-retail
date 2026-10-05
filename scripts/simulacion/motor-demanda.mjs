#!/usr/bin/env node
/**
 * Simulación del motor de demanda (ADR-0346 a 0349) — `node scripts/simulacion/motor-demanda.mjs [--corridas N] [--json ruta]`.
 *
 * PARA QUÉ. Medir el impacto ANTES de que haya datos reales: en producción el motor todavía no habla (ninguna tienda llega al
 * 90 %). Aquí se arma una CAYLA de mentira donde la demanda VERDADERA de cada prenda es conocida, se simulan 4 semanas de
 * tienda (quiebres, ventas «sin registrar», clientes que piden lo que no hay) y se compara, contra esa verdad, cómo estima
 * «cuánto se vende» cada método y qué pasa el mes siguiente si se produce según cada uno.
 *
 * QUÉ USA DEL SISTEMA. Las MISMAS reglas que la web: `ritmoDeLaRed` (lib/demanda-reglas.ts) para el motor y `calcular`
 * (lib/plan-compra-reglas.ts) para el plan de diciembre. No toca ninguna base de datos.
 *
 * LOS TRES MÉTODOS QUE SE COMPARAN (ritmo de la red por prenda, unidades por día):
 *   · «Piso hoy»     — lo vendido con su prenda en 14 días ÷ 14 (el motor del piso, piso-plan.ts).
 *   · «Análisis hoy» — lo vendido ÷ días con stock, por tienda, con 3 días mínimos (resumen-reglas.ts; Producción lo usa).
 *   · «Motor»        — días colgada + apoyo en el grupo (K = 14) + «sin registrar» y «no había» en el grupo (ADR-0347/0348).
 *   · «Oráculo»      — la demanda verdadera: el techo de lo que cualquier método podría lograr.
 *
 * SIMPLIFICACIONES (a propósito, y dichas): un día cuenta como «colgada» si la prenda amaneció en el piso; la reposición
 * piso←almacén es una vez por mañana con probabilidad 0,7; no hay compras durante la ventana; el mes siguiente se simula
 * como una sola bolsa de la red (la producción llega repartida perfectamente). Ninguna de estas favorece a un método.
 */

import { writeFileSync } from "node:fs";
import { ritmoDeLaRed } from "../../apps/web/lib/demanda-reglas.ts";
import { calcular, cuantilCritico } from "../../apps/web/lib/plan-compra-reglas.ts";

// ---------------------------------------------------------------------------------------------------------------------
// Azar reproducible
// ---------------------------------------------------------------------------------------------------------------------
function rng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const poisson = (r, l) => {
  if (l <= 0) return 0;
  if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * normal(r)));
  const L = Math.exp(-l);
  let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
};
const normal = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const elegir = (r, pesos) => { let x = r() * pesos.reduce((s, p) => s + p, 0); for (let i = 0; i < pesos.length; i++) { x -= pesos[i]; if (x <= 0) return i; } return pesos.length - 1; };

// ---------------------------------------------------------------------------------------------------------------------
// La CAYLA simulada
// ---------------------------------------------------------------------------------------------------------------------
const TIENDAS = [ { id: "TRU", factor: 1.0 }, { id: "AQP", factor: 0.8 }, { id: "LIM", factor: 0.3 } ];
// Calibrada con TRU real (2026-10-03/05): ~50 unidades vendidas al día, ~1.000 prendas en stock, ~900 variantes. Las bases
// suman 50 unidades/día en TRU; AQP vende el 80 % y LIM el 30 %.
const CATEGORIAS = [
  { id: "Polos", base: 13.5, precio: 49.9, costo: 18 },
  { id: "Blusas", base: 12, precio: 69.9, costo: 28 },
  { id: "Pantalones", base: 8.5, precio: 89.9, costo: 36 },
  { id: "Vestidos", base: 6.8, precio: 119.9, costo: 48 },
  { id: "Faldas", base: 5, precio: 79.9, costo: 30 },
  { id: "Casacas", base: 4.2, precio: 159.9, costo: 70 },
];
const TALLAS = ["S", "M", "L", "XL"], W_TALLA = [0.2, 0.35, 0.3, 0.15];
const FAMILIAS = ["neutro", "tierra", "rosado"], W_FAM = [0.45, 0.35, 0.2];
const MODELOS_POR_CATEGORIA = 20;
const DIAS = 28;                 // la ventana del motor (DIAS_DEMANDA)
const DIAS_FUTURO = 30;          // lo que se produce para cubrir (días objetivo de Producción)
const COSTO_SOBRANTE = 0.35;     // lo que cuesta cada prenda que sobra, como parte de su costo (capital + rebaja)

function armarCatalogo(r) {
  const variantes = [];
  for (const c of CATEGORIAS) {
    const atractivo = Array.from({ length: MODELOS_POR_CATEGORIA }, () => Math.exp(0.7 * normal(r)));
    const suma = atractivo.reduce((s, x) => s + x, 0);
    atractivo.forEach((m, i) => {
      const fams = [elegir(r, W_FAM), elegir(r, W_FAM)];
      const wf = fams.map((f) => W_FAM[f]);
      fams.forEach((f, j) => TALLAS.forEach((t, k) => {
        const parte = (m / suma) * (wf[j] / (wf[0] + wf[1])) * W_TALLA[k];
        variantes.push({
          id: `${c.id}-${i}-${j}-${t}`, producto: `${c.id}-${i}`, categoria: c.id, talla: t, familia: FAMILIAS[f], cat: c,
          // demanda verdadera por tienda, unidades por día mientras está a la vista
          lambda: TIENDAS.map((s) => c.base * s.factor * parte),
        });
      }));
    });
  }
  return variantes;
}

/**
 * 4 semanas de tienda. `u` = parte de lo vendido que se anota «sin registrar»; `pAnota` = parte de los que piden lo que no
 * hay y la vendedora lo anota con la prenda (ADR-0348).
 */
function simularVentana(r, variantes, { u, pAnota }) {
  const est = variantes.map((v) => TIENDAS.map(() => ({
    // ~1,1 prendas por variante y tienda (TRU: 1.034 en ~900 variantes), dos tercios colgadas.
    piso: Math.min(3, poisson(r, 0.7)), almacen: Math.min(3, poisson(r, 0.4)),
    vendidas28: 0, vendidas14: 0, diasExpuesta: 0, anotadas: 0, perdidas: 0,
  })));
  for (let d = 0; d < DIAS; d++) {
    variantes.forEach((v, i) => TIENDAS.forEach((_, s) => {
      const e = est[i][s];
      if (e.piso === 0 && e.almacen > 0 && r() < 0.7) { e.piso++; e.almacen--; }
      const expuesta = e.piso > 0;
      if (expuesta) e.diasExpuesta++;
      const clientes = poisson(r, v.lambda[s]);
      for (let k = 0; k < clientes; k++) {
        if (e.piso > 0) {
          e.piso--;
          if (r() < u) e.anotadas++;
          else { e.vendidas28++; if (d >= DIAS - 14) e.vendidas14++; }
        } else if (r() < 0.4 * pAnota) e.perdidas++;
      }
    }));
  }
  return est;
}

// ---------------------------------------------------------------------------------------------------------------------
// Los métodos
// ---------------------------------------------------------------------------------------------------------------------
function estimar(variantes, est) {
  const piso = variantes.map((_, i) => est[i].reduce((s, e) => s + e.vendidas14, 0) / 14);
  const analisis = variantes.map((_, i) => est[i].reduce((s, e) => s + (e.diasExpuesta >= 3 ? e.vendidas28 / e.diasExpuesta : 0), 0));
  // El motor: una lectura por tienda con la forma de fn_demanda_sede, y la regla real (ritmoDeLaRed).
  const sedes = TIENDAS.map((t, s) => {
    const grupos = new Map();
    const variantesLectura = variantes.map((v, i) => {
      const e = est[i][s];
      const clave = `${v.categoria}|${v.talla}|${v.familia}`;
      const g = grupos.get(clave) ?? { categoriaId: v.categoria, tallaId: v.talla, familiaColor: v.familia, anotadas: 0, perdidas: 0, dias: new Set() };
      g.anotadas += e.anotadas; g.perdidas += e.perdidas;
      grupos.set(clave, g);
      return { varianteId: v.id, productoId: v.producto, categoriaId: v.categoria, tallaId: v.talla, talla: v.talla, colorCodigo: null,
        familiaColor: v.familia, vendidas: e.vendidas28, diasExpuesta: e.diasExpuesta, pisoHoy: e.piso, almacenHoy: e.almacen };
    });
    // Días con alguna prenda del grupo colgada: aproximado por el máximo de días colgada de sus prendas.
    for (const p of variantesLectura) { const g = grupos.get(`${p.categoriaId}|${p.tallaId}|${p.familiaColor}`); g.max = Math.max(g.max ?? 0, p.diasExpuesta); }
    return { ubicacionId: t.id, nombre: t.id, puedeHablar: true, lectura: {
      hoy: "2026-11-01", desde: "2026-10-04", hasta: "2026-10-31", dias: DIAS, cuadradoEn: null, variantes: variantesLectura,
      grupos: [...grupos.values()].map((g) => ({ categoriaId: g.categoriaId, tallaId: g.tallaId, familiaColor: g.familiaColor, anotadas: g.anotadas, perdidas: g.perdidas, diasAlgunaExpuesta: g.max ?? 0 })),
    } };
  });
  const red = ritmoDeLaRed(sedes);
  const motor = variantes.map((v) => red.get(v.id) ?? 0);
  const oraculo = variantes.map((v) => v.lambda.reduce((s, x) => s + x, 0));
  return { piso, analisis, motor, oraculo };
}

/** Producir para 30 días según cada ritmo y vivir el mes siguiente con la demanda verdadera. */
function mesSiguiente(r, variantes, est, ritmo) {
  let vendidas = 0, perdidas = 0, sobran = 0, margen = 0, producidas = 0;
  variantes.forEach((v, i) => {
    const hay = est[i].reduce((s, e) => s + e.piso + e.almacen, 0);
    const q = Math.max(0, Math.ceil(ritmo[i] * DIAS_FUTURO - hay - 1e-9));
    const disponible = hay + q;
    const demanda = poisson(r, v.lambda.reduce((s, x) => s + x, 0) * DIAS_FUTURO);
    const v1 = Math.min(disponible, demanda);
    vendidas += v1; perdidas += demanda - v1; sobran += disponible - v1; producidas += q;
    margen += v1 * (v.cat.precio - v.cat.costo) - (disponible - v1) * v.cat.costo * COSTO_SOBRANTE;
  });
  return { vendidas, perdidas, sobran, producidas, margen };
}

/**
 * Qué tan bien estima cada método. `agotadasVsVerdad`: entre las prendas que estuvieron a la vista menos de media ventana,
 * cuánto estima el método en total frente a lo que de verdad se pedía (100 % = justo; por debajo, las da por muertas).
 * `top`: de las 100 prendas que de verdad más se piden, cuántas pone el método entre sus 100 primeras.
 */
function errores(variantes, est, ritmo, verdad) {
  let abs = 0, sumaR = 0, sumaV = 0, agR = 0, agV = 0, nAgot = 0;
  variantes.forEach((_, i) => {
    abs += Math.abs(ritmo[i] - verdad[i]) * DIAS_FUTURO;
    sumaR += ritmo[i]; sumaV += verdad[i];
    const expuestaMedia = est[i].reduce((s, e) => s + e.diasExpuesta, 0) / TIENDAS.length;
    if (expuestaMedia < DIAS / 2) { agR += ritmo[i]; agV += verdad[i]; nAgot++; }
  });
  const orden = (xs) => new Set(xs.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).slice(0, 100).map(([, i]) => i));
  const topV = orden(verdad), topR = orden(ritmo);
  const top = [...topV].filter((i) => topR.has(i)).length;
  return { maeMes: abs / variantes.length, totalVsVerdad: sumaR / sumaV, agotadasVsVerdad: agV ? agR / agV : 1, agotadas: nAgot, top };
}

// ---------------------------------------------------------------------------------------------------------------------
// Corridas
// ---------------------------------------------------------------------------------------------------------------------
const arg = (n, def) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : def; };
const CORRIDAS = Number(arg("--corridas", 60));
const METODOS = ["piso", "analisis", "motor", "oraculo"];
const ESCENARIOS = [
  { id: "datos_limpios", nombre: "Datos limpios (90 % registrado, se anota la mitad de lo que no hay)", u: 0.05, pAnota: 0.5 },
  { id: "sin_venta_perdida", nombre: "Datos limpios, pero nadie anota lo que no había", u: 0.05, pAnota: 0 },
  { id: "datos_de_hoy", nombre: "Datos como hoy (82 % sin registrar)", u: 0.82, pAnota: 0.1 },
];

const resultados = {};
for (const esc of ESCENARIOS) {
  const acum = Object.fromEntries(METODOS.map((m) => [m, { maeMes: 0, totalVsVerdad: 0, agotadasVsVerdad: 0, top: 0, vendidas: 0, perdidas: 0, sobran: 0, producidas: 0, margen: 0 }]));
  let variantesN = 0, agotadas = 0;
  for (let k = 0; k < CORRIDAS; k++) {
    const r = rng(1000 + k);
    const variantes = armarCatalogo(r);
    variantesN = variantes.length;
    const est = simularVentana(r, variantes, esc);
    const ritmos = estimar(variantes, est);
    for (const m of METODOS) {
      const e = errores(variantes, est, ritmos[m], ritmos.oraculo);
      agotadas += m === "motor" ? e.agotadas : 0;
      // Misma semilla para el mes siguiente en los 4 métodos: la diferencia es solo la decisión.
      const f = mesSiguiente(rng(5000 + k), variantes, est, ritmos[m]);
      for (const [c, x] of Object.entries({ ...e, ...f })) if (c in acum[m]) acum[m][c] += x / CORRIDAS;
    }
  }
  resultados[esc.id] = { nombre: esc.nombre, variantes: variantesN, agotadasPorCorrida: agotadas / CORRIDAS, metodos: acum };
}

// ---------------------------------------------------------------------------------------------------------------------
// Plan de diciembre: comprar lo esperado vs. el cuantil crítico (ADR-0349)
// ---------------------------------------------------------------------------------------------------------------------
const PLAN = [
  { id: "Polos (básico, lo que sobra se vende el año siguiente)", flojo: 300, normal: 450, bueno: 650, precio: 49.9, costo: 18, recupero: 50 },
  { id: "Blusas (lo que sobra se rebaja a la mitad)", flojo: 250, normal: 380, bueno: 560, precio: 69.9, costo: 28, recupero: 30 },
  { id: "Vestidos de fiesta (moda, lo que sobra se rebaja fuerte)", flojo: 80, normal: 140, bueno: 220, precio: 189.9, costo: 95, recupero: 25 },
  { id: "Casacas (temporada, margen chico)", flojo: 60, normal: 100, bueno: 160, precio: 159.9, costo: 110, recupero: 30 },
];
const triangular = (r, a, c, b) => { const u = r(), f = (c - a) / (b - a); return u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c)); };
const utilidad = (q, d, p) => Math.min(q, d) * p.precio + Math.max(q - d, 0) * p.precio * p.recupero / 100 - q * p.costo;
const plan = PLAN.map((p) => {
  const cuantil = calcular({ flojo: p.flojo, normal: p.normal, bueno: p.bueno, precio: p.precio, costo: p.costo, recuperoPct: p.recupero }, 0);
  const estrategias = { esperado: p.normal, cuantil: cuantil.objetivo };
  const r = rng(77);
  const N = 20000;
  const out = {};
  for (const [e, q] of Object.entries(estrategias)) out[e] = { compra: q, utilidad: 0, quiebre: 0, sobra: 0 };
  for (let k = 0; k < N; k++) {
    const d = Math.round(triangular(r, p.flojo, p.normal, p.bueno));
    for (const [e, q] of Object.entries(estrategias)) {
      out[e].utilidad += utilidad(q, d, p) / N;
      out[e].quiebre += (d > q ? 1 : 0) / N;
      out[e].sobra += Math.max(q - d, 0) / N;
    }
  }
  return { ...p, cuantilCritico: cuantilCritico(p.precio, p.costo, p.recupero), estrategias: out };
});

// ---------------------------------------------------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------------------------------------------------
const pct = (x) => `${(x * 100).toFixed(0)} %`;
const s = (x) => `S/ ${Math.round(x).toLocaleString("es-PE")}`;
for (const [id, r] of Object.entries(resultados)) {
  console.log(`\n${r.nombre} — ${r.variantes} prendas × ${TIENDAS.length} tiendas, ${CORRIDAS} corridas; ${Math.round(r.agotadasPorCorrida)} agotadas media ventana`);
  console.log("  método        error/mes  total/verdad  agotadas/verdad  top100  producidas  vendidas  perdidas  sobran   margen del mes");
  for (const m of METODOS) {
    const x = r.metodos[m];
    console.log(`  ${m.padEnd(12)}  ${x.maeMes.toFixed(2).padStart(8)}  ${pct(x.totalVsVerdad).padStart(12)}  ${pct(x.agotadasVsVerdad).padStart(15)}  ${Math.round(x.top).toString().padStart(6)}  ${Math.round(x.producidas).toString().padStart(10)}  ${Math.round(x.vendidas).toString().padStart(8)}  ${Math.round(x.perdidas).toString().padStart(8)}  ${Math.round(x.sobran).toString().padStart(6)}  ${s(x.margen).padStart(15)}`);
  }
}
console.log("\nPlan de diciembre (20.000 diciembres posibles por categoría)");
for (const p of plan) {
  const a = p.estrategias.esperado, b = p.estrategias.cuantil;
  console.log(`  ${p.id}: cuantil ${pct(p.cuantilCritico)} · esperado ${a.compra} → ${s(a.utilidad)} (quiebre ${pct(a.quiebre)}) · cuantil ${b.compra} → ${s(b.utilidad)} (quiebre ${pct(b.quiebre)})`);
}
const ruta = arg("--json", null);
if (ruta) writeFileSync(ruta, JSON.stringify({ corridas: CORRIDAS, resultados, plan }, null, 1));
