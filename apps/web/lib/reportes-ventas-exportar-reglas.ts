import { celdaCsv } from "./historial-exportar-reglas";
import { filasDeTabla, totalDeTabla, type CorteDeTabla, type CortesMes, type ReporteMes } from "./reportes-ventas-reglas";
import { cambioDeFila, parteDeFila, sePuedeComparar, type FiltrosRanking, type NivelRanking, type OrdenRanking, type PeriodoRanking, type Ranking } from "./reportes-ranking-reglas";

// Las descargas de Ventas ▸ Reportes (maqueta docs/maquetas/reportes-ventas-2026-11/): «Ventas del mes» (la tabla del corte elegido, con su Total) y el
// «Ranking de prendas» (todas las filas con los filtros puestos, no solo la página). Reglas puras, con pruebas, del mismo formato que el Historial
// (ADR-0230): UTF-8 con BOM (sin él Excel lee «Blusa Ã‰mma»), coma como separador, punto decimal, una celda con comillas si trae coma, comillas o salto
// de línea, y una celda que empieza con = + - @ lleva un apóstrofo delante (Excel la ejecutaría como fórmula).
//
// PROMETE: (1) el archivo dice lo mismo que la pantalla: el Total son las cifras del mes y cada fila sale de las mismas cuentas; (2) el cambio contra el
// período anterior va VACÍO donde la pantalla pone «—» (no hay con qué comparar), nunca 0 ni un porcentaje inventado; (3) los montos van con dos
// decimales y los porcentajes con uno, como números (Excel los suma); (4) sin costo ni margen.
// ASUME: que quien llama ya validó el acceso (módulo `reportes_ventas`) y que las filas llegan completas (no una página).

const BOM = "﻿";
const dos = (n: number): string => n.toFixed(2);
const pct = (n: number | null): string => (n === null ? "" : (n * 100).toFixed(1));
// Un número limpio (-50.0, 250.00) NO se protege: el apóstrofo de `celdaCsv` lo volvería texto y Excel ya no lo sumaría. Una celda que solo parece fórmula
// (=Polos, +Top, -5+2) sí lleva su apóstrofo.
const NUMERO = /^-?\d+(\.\d+)?$/;
const celda = (t: string): string => (NUMERO.test(t) ? t : celdaCsv(t));
const archivo = (lineas: string[][]): string => `${BOM}${lineas.map((l) => l.map(celda).join(",")).join("\r\n")}\r\n`;

const COLUMNAS_TIENDA = ["Tienda", "Vendido (S/)", "% del total", "Cambio vs mes pasado (%)", "Ventas", "Ticket promedio (S/)", "Prendas", "Devuelto (S/)"];
const COLUMNAS_CATEGORIA = ["Categoría", "Vendido (S/)", "% del total", "Cambio vs mes pasado (%)", "Prendas"];

/** «Ventas del mes» por tienda o por categoría, con su fila de Total al pie. Las categorías van TODAS (la pantalla junta la cola; el archivo no). */
export function csvDeVentasDelMes(r: ReporteMes, cortes: CortesMes, corte: CorteDeTabla): string {
  const porTienda = corte === "tienda";
  const filas = filasDeTabla(porTienda ? cortes.tiendas : [...cortes.categorias].sort((a, b) => b.actual.vendido - a.actual.vendido || a.nombre.localeCompare(b.nombre, "es")), r);
  const total = totalDeTabla(r);
  const linea = (f: (typeof filas)[number]): string[] =>
    porTienda
      ? [f.nombre, dos(f.vendido), pct(f.parte), pct(f.cambio), String(f.tickets), f.ticket === null ? "" : dos(f.ticket), String(f.unidades), dos(f.devuelto)]
      : [f.nombre, dos(f.vendido), pct(f.parte), pct(f.cambio), String(f.unidades)];
  // «Sin categoría» va al final aunque haya vendido más que otras, como en pantalla.
  const ordenadas = porTienda ? filas : [...filas.filter((f) => f.nombre !== "Sin categoría"), ...filas.filter((f) => f.nombre === "Sin categoría")];
  return archivo([porTienda ? COLUMNAS_TIENDA : COLUMNAS_CATEGORIA, ...ordenadas.map(linea), linea(total)]);
}

/** «ventas-2026-10-por-categoria-todas.csv»: se reconoce en la carpeta de descargas sin abrirlo. */
export function nombreArchivoVentasDelMes(mes: string, corte: CorteDeTabla, alcance: string): string {
  return `ventas-${mes.slice(0, 7)}-por-${corte === "tienda" ? "tienda" : "categoria"}-${slug(alcance) || "todas"}.csv`;
}

const slug = (t: string): string =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^tienda\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Las filas completas del ranking (todas las páginas juntas) y lo que el archivo necesita saber de ellas. */
export type RankingCompleto = Pick<Ranking, "filas" | "totalPeriodo" | "primeraVenta" | "anterior" | "mayor">;

/**
 * El Ranking de prendas completo con los filtros puestos. Por modelo no lleva color ni talla; por color y talla sí. El cambio es de lo que se ordena
 * (prendas o soles), como en pantalla, y va vacío si no se puede comparar.
 */
export function csvDeRanking(r: RankingCompleto, nivel: NivelRanking, orden: OrdenRanking): string {
  const variante = nivel === "variante";
  const cabecera = ["Posición", "Modelo", "Código", "Categoría", "Marca", ...(variante ? ["Color", "Talla"] : []), "Prendas", "Vendido (S/)", "% del total", "Prendas del período anterior", "Vendido del período anterior (S/)", "Cambio vs período anterior (%)", "Quedan en tiendas"];
  const comparable = sePuedeComparar(r);
  const lineas = r.filas.map((f) => [
    String(f.pos),
    f.nombre,
    f.codigo ?? "",
    f.categoria ?? "",
    f.marca ?? "",
    ...(variante ? [f.colorNombre ?? "", f.talla ?? ""] : []),
    String(f.unidades),
    dos(f.vendido),
    pct(parteDeFila(f, orden, r)),
    comparable ? String(f.unidadesAnt) : "",
    comparable ? dos(f.vendidoAnt) : "",
    pct(cambioDeFila(f, orden, r)),
    String(f.stock),
  ]);
  return archivo([cabecera, ...lineas]);
}

/** «ranking-prendas-2026-10-01-a-2026-10-31-todas.csv» (el último día INCLUIDO, no el que ya no cuenta). */
export function nombreArchivoRanking(p: Pick<PeriodoRanking, "desde" | "hasta">, f: Pick<FiltrosRanking, "nivel">, alcance: string): string {
  const ultimo = new Date(Date.parse(`${p.hasta}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return `ranking-prendas${f.nivel === "variante" ? "-por-color-y-talla" : ""}-${p.desde}-a-${ultimo}-${slug(alcance) || "todas"}.csv`;
}
