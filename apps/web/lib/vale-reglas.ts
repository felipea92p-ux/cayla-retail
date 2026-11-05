// Estados financieros ▸ ¿Cuánto vale CAYLA? (balance general; ADR-0585, actividad 6).
//
// PROMETE: el Balance como una balanza que se lee de un vistazo: lo que tiene, contra lo que debe y lo que es tuyo, cada lado en pocos
// grupos que una tienda reconoce (no cuentas), cada grupo con sus líneas por su nombre; dos medidores que traducen el Balance a una
// decisión (si te cobraran todo hoy, cuánto cubres; para cuántos meses de venta tienes mercadería) y las recomendaciones.
// ASUME: toda cifra viene de la base (`fn_balance_general`, `fn_balance_por_tienda`, `fn_estado_resultados`). El Balance se dibuja solo si
// la comprobación no bloquea (ADR-0198): esto no lo decide aquí, lo recibe ya cuadrado.

import { nombreLinea, type LineaBalance, type UnidadBalance } from "./balance-reglas";
import { soles } from "./flujo-caja-reglas";
import type { Recomendacion } from "./ganamos-reglas";

export type GrupoBalance = { clave: string; nombre: string; lado: "tiene" | "debe" | "tuyo"; clase: string; monto: number; lineas: { nombre: string; monto: number }[] };

/** Los grupos de cada lado, en el orden en que se leen. `de` dice qué líneas son suyas (por su cuenta), y lo que no cae en ninguno va a «Otros». */
const GRUPOS: readonly { clave: string; nombre: string; lado: GrupoBalance["lado"]; clase: string; de: (cuenta: string) => boolean }[] = [
  { clave: "plata", nombre: "Plata en cajas y bancos", lado: "tiene", clase: "bg-verde", de: (c) => c.startsWith("10") && c !== "105" },
  { clave: "cobros", nombre: "Lo que te deben o está por llegar", lado: "tiene", clase: "bg-verde/40", de: (c) => c === "105" || c.startsWith("12") || c.startsWith("14") || c.startsWith("16") || c === "4011" },
  { clave: "mercaderia", nombre: "Mercadería", lado: "tiene", clase: "bg-tinta/55", de: (c) => c.startsWith("20") || c.startsWith("21") || c.startsWith("28") },
  { clave: "equipos", nombre: "Muebles y equipos", lado: "tiene", clase: "bg-tinta/25", de: (c) => c.startsWith("33") || c.startsWith("39") },
  { clave: "proveedores", nombre: "Proveedores", lado: "debe", clase: "bg-ambar", de: (c) => c.startsWith("42") },
  { clave: "impuestos", nombre: "Impuestos", lado: "debe", clase: "bg-taupe", de: (c) => c.startsWith("40") },
  { clave: "sueldos", nombre: "Sueldos por pagar", lado: "debe", clase: "bg-tinta/30", de: (c) => c.startsWith("41") },
  { clave: "prestamos", nombre: "Tarjeta y préstamos", lado: "debe", clase: "bg-tinta/45", de: (c) => c.startsWith("45") || c === "47" },
];

/** El Balance (ya cuadrado) en grupos: lo que tiene, lo que debe y lo tuyo. Sin los grupos vacíos. Un monto negativo resta de su lado. */
export function gruposDelBalance(lineas: readonly LineaBalance[]): GrupoBalance[] {
  const lado = (l: LineaBalance): GrupoBalance["lado"] => (l.seccion === "activo" ? "tiene" : l.seccion === "pasivo" ? "debe" : "tuyo");
  const out: GrupoBalance[] = [];
  const usadas = new Set<LineaBalance>();
  for (const g of GRUPOS) {
    const suyas = lineas.filter((l) => lado(l) === g.lado && !usadas.has(l) && g.de(l.cuenta));
    suyas.forEach((l) => usadas.add(l));
    if (suyas.length) out.push({ clave: g.clave, nombre: g.nombre, lado: g.lado, clase: g.clase, monto: suma(suyas), lineas: suyas.map(linea) });
  }
  for (const [l, nombre, clase] of [
    ["tiene", "Otros", "bg-sand"],
    ["debe", "Otras deudas", "bg-sand"],
  ] as const) {
    const resto = lineas.filter((x) => lado(x) === l && !usadas.has(x) && Math.round(x.monto) !== 0);
    if (resto.length) out.push({ clave: `otros-${l}`, nombre, lado: l, clase, monto: suma(resto), lineas: resto.map(linea) });
  }
  const tuyo = lineas.filter((l) => lado(l) === "tuyo");
  if (tuyo.length) out.push({ clave: "tuyo", nombre: "Lo tuyo", lado: "tuyo", clase: "bg-tinta", monto: suma(tuyo), lineas: tuyo.map(linea) });
  return out;
}
const suma = (xs: readonly LineaBalance[]) => Math.round(xs.reduce((a, l) => a + l.monto, 0) * 100) / 100;
const linea = (l: LineaBalance) => ({ nombre: nombreLinea(l), monto: l.monto });

export type Medidores = {
  /** (plata + lo que te deben) ÷ lo que debes. `null` si no debes nada. */
  cobertura: number | null;
  plataYCobros: number;
  deudas: number;
  /** Mercadería ÷ lo que costó lo vendido en un mes. `null` sin costo del mes. */
  mesesDeMercaderia: number | null;
  mercaderia: number;
};

export function medidores(grupos: readonly GrupoBalance[], costoDelMes: number | null): Medidores {
  const de = (clave: string) => grupos.find((g) => g.clave === clave)?.monto ?? 0;
  const plataYCobros = de("plata") + de("cobros");
  const deudas = grupos.filter((g) => g.lado === "debe").reduce((a, g) => a + g.monto, 0);
  const mercaderia = de("mercaderia");
  return {
    cobertura: deudas > 0 ? plataYCobros / deudas : null,
    plataYCobros,
    deudas,
    mesesDeMercaderia: costoDelMes && costoDelMes > 0 ? mercaderia / costoDelMes : null,
    mercaderia,
  };
}

/** Desde cuántos meses de venta la mercadería guardada merece decirse (plata quieta). */
export const MESES_DE_MERCADERIA_ALTOS = 4;

/**
 * Qué te recomiendo en ¿Cuánto vale CAYLA? (hasta 3). Sale de lo que la pantalla ya muestra: si el Balance no cuadra, la mercadería
 * guardada, cuánto de lo que debes cubre la plata y la sede que no devuelve lo invertido.
 */
export function recomendacionesVale({
  cuadra,
  medidas,
  unidades,
  sede,
  href,
}: {
  /** `null`: mirando una sede (allí no hay Balance entero que cuadre). */
  cuadra: boolean | null;
  medidas: Medidores | null;
  unidades: readonly UnidadBalance[];
  /** La sede que se mira, o `null` en CAYLA entera. */
  sede: string | null;
  href: (ruta: string, sede?: string) => string;
}): Recomendacion[] {
  const out: Recomendacion[] = [];
  if (cuadra === false) {
    out.push({ clave: "no-cuadra", tono: "error", prioridad: 1, titulo: "El Balance todavía no cuadra", texto: "Arriba dice qué no coincide, por cuánto y dónde se arregla. Hasta entonces, la cifra no se muestra." });
  }
  if (medidas?.mesesDeMercaderia != null && medidas.mesesDeMercaderia >= MESES_DE_MERCADERIA_ALTOS) {
    out.push({
      clave: "mercaderia",
      tono: "atencion",
      prioridad: 2,
      titulo: `Tienes mercadería para ${medidas.mesesDeMercaderia.toFixed(1).replace(".", ",")} meses de venta`,
      texto: `Son ${soles(medidas.mercaderia)} de plata quieta. Revisa lo que no rota antes de comprar más.`,
      accion: { texto: "Ver Frescura del piso", href: "/gestion/frescura" },
    });
  }
  if (medidas?.cobertura != null && medidas.cobertura < 1) {
    out.push({
      clave: "cobertura",
      tono: "info",
      prioridad: 3,
      titulo: `Si te cobraran todo hoy, cubres el ${Math.round(medidas.cobertura * 100)} %`,
      texto: `Debes ${soles(medidas.deudas)} y tienes ${soles(medidas.plataYCobros)} en plata y cobros; el resto lo cubre la mercadería al venderse.`,
      accion: { texto: "Ver lo que se debe", href: href("/finanzas/dinero/por-pagar") },
    });
  }
  const tiendas = unidades.filter((u) => u.tipo === "tienda" && u.rinde !== null);
  const peor = [...tiendas].sort((a, b) => a.rinde! - b.rinde!)[0];
  const mejor = [...tiendas].sort((a, b) => b.rinde! - a.rinde!)[0];
  const pct = (r: number) => `${r >= 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(1).replace(".", ",")} %`;
  if (peor && peor.rinde! < 0 && (!sede || sede === peor.ubicacionId)) {
    out.push({
      clave: `rinde-${peor.ubicacionId}`,
      tono: "atencion",
      prioridad: 4,
      titulo: `${peor.nombre} no devuelve lo invertido`,
      texto: `Rinde ${pct(peor.rinde!)} al mes sobre ${soles(peor.invertido)}${mejor && mejor !== peor ? `; ${mejor.nombre} rinde ${pct(mejor.rinde!)}` : ""}.`,
      ...(sede ? {} : { accion: { texto: `Ver ${peor.nombre}`, href: href("/finanzas/reportes/balance", peor.ubicacionId) } }),
    });
  }
  if (!out.length) {
    out.push({ clave: "tranquilo", tono: "exito", prioridad: 9, titulo: sede ? "Nada fuera de lo normal" : "El Balance cuadra", texto: sede ? "Lo invertido rinde y no hay alertas." : "Lo que debes está cubierto y la mercadería no está quieta de más." });
  }
  return out.sort((a, b) => a.prioridad - b.prioridad).slice(0, 3);
}
