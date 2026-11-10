// Estados financieros ▸ Balance general (balance general; ADR-0585, actividad 6).
//
// PROMETE: el Balance como una balanza que se lee de un vistazo: lo que tiene, contra lo que debe y lo que es tuyo, cada lado en pocos
// grupos que una tienda reconoce (no cuentas), cada grupo con sus líneas por su nombre; dos medidores que traducen el Balance a una
// decisión (si te cobraran todo hoy, cuánto cubres; para cuántos meses de venta tienes mercadería) y las recomendaciones.
// ASUME: toda cifra viene de la base (`fn_balance_general`, `fn_balance_por_tienda`, `fn_estado_resultados`). Si hay Balance que dibujar lo
// decide `situacion` (ADR-0619): aquí se recibe ya decidido.

import { nombreLinea, type LineaBalance, type UnidadBalance } from "./balance-reglas";
import { soles } from "./flujo-caja-reglas";
import type { Recomendacion } from "./ganamos-reglas";

export type GrupoBalance = { clave: string; nombre: string; lado: "tiene" | "debe" | "tuyo"; clase: string; monto: number; lineas: { nombre: string; monto: number; cuenta: string }[] };

/** Los grupos de cada lado, en el orden en que se leen. `de` dice qué líneas son suyas (por su cuenta), y lo que no cae en ninguno va a «Otros». */
const GRUPOS: readonly { clave: string; nombre: string; lado: GrupoBalance["lado"]; clase: string; de: (cuenta: string) => boolean }[] = [
  { clave: "plata", nombre: "Plata en cajas y bancos", lado: "tiene", clase: "bg-verde", de: (c) => c.startsWith("10") && c !== "105" },
  { clave: "cobros", nombre: "Lo que te deben o está por llegar", lado: "tiene", clase: "bg-verde/40", de: (c) => c === "105" || c.startsWith("12") || c.startsWith("14") || c.startsWith("16") },
  // Va aparte: SUNAT lo descuenta del IGV que viene, no lo paga en plata, así que no entra a «si te cobraran todo hoy» (ADR-0620).
  { clave: "credito", nombre: "Saldo a favor de IGV", lado: "tiene", clase: "bg-verde/25", de: (c) => c === "4011" },
  { clave: "mercaderia", nombre: "Mercadería y telas", lado: "tiene", clase: "bg-tinta/55", de: (c) => c.startsWith("20") || c.startsWith("21") || c.startsWith("23") || c.startsWith("24") || c.startsWith("28") },
  { clave: "equipos", nombre: "Muebles y equipos", lado: "tiene", clase: "bg-tinta/25", de: (c) => c.startsWith("33") || c.startsWith("39") },
  { clave: "proveedores", nombre: "Proveedores", lado: "debe", clase: "bg-ambar", de: (c) => c.startsWith("42") },
  { clave: "impuestos", nombre: "Impuestos", lado: "debe", clase: "bg-taupe", de: (c) => c.startsWith("40") },
  { clave: "sueldos", nombre: "Sueldos por pagar", lado: "debe", clase: "bg-tinta/30", de: (c) => c.startsWith("41") },
  { clave: "prestamos", nombre: "Tarjeta y préstamos", lado: "debe", clase: "bg-tinta/45", de: (c) => c.startsWith("45") || c === "47" },
];

/** El Balance en grupos: Activo, Pasivo y Patrimonio. Sin los grupos vacíos. Un monto negativo resta de su lado. */
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
  if (tuyo.length) out.push({ clave: "tuyo", nombre: "Patrimonio", lado: "tuyo", clase: "bg-tinta", monto: suma(tuyo), lineas: tuyo.map(linea) });
  return out;
}
const suma = (xs: readonly LineaBalance[]) => Math.round(xs.reduce((a, l) => a + l.monto, 0) * 100) / 100;
const sumaMontos = (xs: readonly { monto: number }[]) => Math.round(xs.reduce((a, l) => a + l.monto, 0) * 100) / 100;
const linea = (l: LineaBalance) => ({ nombre: nombreLinea(l), monto: l.monto, cuenta: l.cuenta });

export type Medidores = {
  /** (plata + lo que te deben) ÷ lo que debes, sin el saldo a favor de IGV, que no se cobra. `null` si no debes nada. */
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
  // Lo que se mide contra lo vendido es lo que está para vender: las telas y la ropa en proceso del Taller van en el grupo, pero no se venden al costo del mes.
  const mercaderia = sumaMontos(grupos.find((g) => g.clave === "mercaderia")?.lineas.filter((l) => !/^2[34]/.test(l.cuenta)) ?? []);
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
 * Qué te recomiendo en Balance general (hasta 3). Sale de lo que la pantalla ya muestra: si el Balance no cuadra, la mercadería
 * guardada, cuánto de lo que debes cubre la plata y la sede que no devuelve lo invertido.
 */
export function recomendacionesVale({
  cuadra,
  sinComprobar = false,
  conDiferencias = false,
  medidas,
  unidades,
  sede,
  href,
}: {
  /** `null`: mirando una sede (allí no hay Balance entero que cuadre). */
  cuadra: boolean | null;
  /** La comprobación no se pudo leer: no se sabe si cuadra, y el error de arriba ya lo dice. Ni «no cuadra» ni «cuadra» (tarea 87). */
  sinComprobar?: boolean;
  /** Se dibuja, pero una cuenta no coincide (ADR-0619): el aviso de arriba ya lo dice, y aquí no se puede decir «cuadra». */
  conDiferencias?: boolean;
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
  if (!out.length && conDiferencias) {
    out.push({ clave: "solo-la-diferencia", tono: "info", prioridad: 9, titulo: "Lo único por resolver es la diferencia de arriba", texto: "Lo que debes está cubierto y la mercadería no está quieta de más." });
  }
  if (!out.length && !sinComprobar) {
    out.push({ clave: "tranquilo", tono: "exito", prioridad: 9, titulo: sede ? "Nada fuera de lo normal" : "El Balance cuadra", texto: sede ? "Lo invertido rinde y no hay alertas." : "Lo que debes está cubierto y la mercadería no está quieta de más." });
  }
  return out.sort((a, b) => a.prioridad - b.prioridad).slice(0, 3);
}
