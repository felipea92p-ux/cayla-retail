// De Ventas a Finanzas (ADR-0609): de «Vendido» de Ventas ▸ Reportes a «Vendiste con IGV» de Finanzas y de ahí a «Lo que vendiste», en céntimos y sede por sede.
//
// PROMETE: arma el cuadro para la sede de la barra, en dos tramos: Vendido en Ventas + anuladas + devoluciones + cambios + su IGV = Vendiste con IGV; Vendiste con IGV − IGV − CLAURE = Lo que vendiste.
// Las dos cifras fuertes son las de arriba en Ganancias y pérdidas. Cada fila que no aporta nada se esconde, salvo esas y el principio; «Sin explicar» sale solo si hay algo, porque es la señal
// de que las cifras se separaron por algo que nadie nombró: es lo que queda para llegar a la cifra de arriba, así que nunca se reparte y el «Cuadra al céntimo» no puede mentir.
// ASUME: las cifras vienen de la base (`fn_cuadre_ventas_finanzas`, y el IGV de cada columna de `fn_igv_de_las_ventas`). El IGV del cuadro es solo el de las ventas vigentes; el de la columna
// suma el de cambios, devoluciones y anuladas: esa diferencia es la fila «IGV de cambios y devoluciones», y se calcula solo aquí, para mostrarla.
// NO HACE: sin el IGV de la columna no inventa el tramo: el cuadro va directo a las ventas sin IGV, como antes, y lo dice (`conIgv`).

import { SEDE_EMPRESA, SEDE_TODAS, type ClaveSede } from "./finanzas-telar-reglas";
import { NOMBRE_CLAURE_VENTAS, NOMBRE_IGV_VENTAS, NOMBRE_VENDISTE_CON_IGV } from "./ganamos-reglas";
import type { FilaER } from "./resultados-reglas";

export type SedeCuadre = {
  ubicacionId: string | null;
  nombre: string;
  vendido: number;
  igv: number;
  anulaciones: number;
  devoluciones: number;
  cambios: number;
  claure: number;
  otras: number;
  ventasNetas: number;
};

type Fila = Record<string, unknown>;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function leerSedeCuadre(f: Fila): SedeCuadre {
  return {
    ubicacionId: f.ubicacion_id ? String(f.ubicacion_id) : null,
    nombre: String(f.nombre ?? ""),
    vendido: num(f.vendido),
    igv: num(f.igv),
    anulaciones: num(f.anulaciones_otro_mes),
    devoluciones: num(f.devoluciones),
    cambios: num(f.cambios),
    claure: num(f.claure),
    otras: num(f.otras),
    ventasNetas: num(f.ventas_netas),
  };
}

type Clave = "vendido" | "anulaciones" | "devoluciones" | "cambios" | "igvAjustes" | "otras" | "vendisteConIgv" | "igv" | "claure" | "ventasNetas";
type Concepto = { clave: Clave; nombre: string; detalle: string };

const VENDIDO: Concepto = { clave: "vendido", nombre: "Vendido en Ventas", detalle: "Ventas ▸ Reportes: lo cobrado, con IGV" };
const ANULADAS: Concepto = { clave: "anulaciones", nombre: "Anuladas en otro mes", detalle: "La venta y su anulación cayeron en meses distintos" };
const SIN_EXPLICAR: Concepto = { clave: "otras", nombre: "Sin explicar", detalle: "Una diferencia que ninguna regla nombra: avísale al equipo" };

const CONCEPTOS_CON_IGV: readonly Concepto[] = [
  VENDIDO,
  ANULADAS,
  { clave: "devoluciones", nombre: "Devoluciones", detalle: "Lo devuelto en el mes, sin IGV" },
  { clave: "cambios", nombre: "Diferencias de cambios", detalle: "Lo que se cobró o devolvió al cambiar una prenda, sin IGV" },
  { clave: "igvAjustes", nombre: "IGV de cambios y devoluciones", detalle: "Las devoluciones y los cambios van sin IGV: este es el suyo" },
  SIN_EXPLICAR,
  { clave: "vendisteConIgv", nombre: NOMBRE_VENDISTE_CON_IGV, detalle: "La cifra de Ganancias y pérdidas, con lo de CLAURE" },
  { clave: "igv", nombre: NOMBRE_IGV_VENTAS, detalle: "Está dentro de lo vendido, pero es de SUNAT" },
  { clave: "claure", nombre: NOMBRE_CLAURE_VENTAS, detalle: "Sin IGV. Es de CLAURE: no es ingreso de CAYLA" },
  { clave: "ventasNetas", nombre: "Lo que vendiste", detalle: "Sin IGV y sin CLAURE: lo que es ingreso de CAYLA" },
];

/** Sin el IGV de la columna: de lo cobrado a las ventas sin IGV, con el IGV que el cuadro sí conoce. */
const CONCEPTOS_SIN_LECTURA: readonly Concepto[] = [
  VENDIDO,
  { clave: "igv", nombre: "IGV", detalle: "Está dentro de lo cobrado, pero es de SUNAT" },
  ANULADAS,
  { clave: "devoluciones", nombre: "Devoluciones", detalle: "Lo devuelto en el mes, sin IGV" },
  { clave: "cambios", nombre: "Diferencias de cambios", detalle: "Lo que se cobró o devolvió al cambiar una prenda, sin IGV" },
  { clave: "claure", nombre: "Prendas de CLAURE", detalle: "Es de CLAURE: no es ingreso de CAYLA" },
  SIN_EXPLICAR,
  { clave: "ventasNetas", nombre: "Ventas", detalle: "Finanzas, sin IGV: lo que es ingreso de CAYLA" },
];

export type FilaCuadro = { clave: Clave; nombre: string; detalle: string; montos: number[]; total: number };
export type CuadroVentas = { columnas: string[]; filas: FilaCuadro[]; sinExplicar: number; conTotal: boolean; conIgv: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;
const hayCentimos = (n: number) => Math.round(n * 100) !== 0;

/** Una columna de arriba, la de Ganancias y pérdidas. */
type ColumnaArriba = Pick<FilaER, "unidad" | "ubicacionId" | "ventas" | "igvCobrado" | "claureSinIgv">;
type Montos = Record<Clave, number>;

const columnaDeLaSede = (s: SedeCuadre, arriba: readonly ColumnaArriba[]) => arriba.find((c) => c.unidad !== "consolidado" && (c.unidad === "empresa" ? null : c.ubicacionId) === s.ubicacionId);

/** Los dos tramos de una sede. `null`: su columna no llegó con el IGV leído. */
function montosConIgv(s: SedeCuadre, c: ColumnaArriba | undefined): Montos | null {
  if (c?.igvCobrado === undefined || c.claureSinIgv === undefined) return null;
  const vendisteConIgv = r2(c.ventas + c.igvCobrado + c.claureSinIgv);
  const igvAjustes = r2(c.igvCobrado + s.igv);
  const otras = r2(vendisteConIgv - (s.vendido + s.anulaciones + s.devoluciones + s.cambios + igvAjustes));
  return { vendido: s.vendido, anulaciones: s.anulaciones, devoluciones: s.devoluciones, cambios: s.cambios, igvAjustes, otras, vendisteConIgv, igv: -c.igvCobrado, claure: -c.claureSinIgv, ventasNetas: c.ventas };
}

const montosSinLectura = (s: SedeCuadre): Montos => ({ ...s, igvAjustes: 0, vendisteConIgv: 0 });

/** El cuadro de la sede de la barra: todas → una columna por sede y su total; una → esa sola. `arriba`: las columnas de Ganancias y pérdidas, con su IGV leído. `null`: no hay nada que comparar. */
export function cuadroVentas(sedes: readonly SedeCuadre[], sede: ClaveSede, arriba: readonly ColumnaArriba[]): CuadroVentas | null {
  if (sede === SEDE_EMPRESA) return null;
  const suyas = sede === SEDE_TODAS ? [...sedes] : sedes.filter((s) => s.ubicacionId === sede);
  const conAlgo = suyas.filter((s) => hayCentimos(s.vendido) || hayCentimos(s.ventasNetas) || hayCentimos(columnaDeLaSede(s, arriba)?.igvCobrado ?? 0));
  if (!conAlgo.length) return null;
  const conIgv = conAlgo.map((s) => montosConIgv(s, columnaDeLaSede(s, arriba)));
  const leidas = conIgv.filter((m) => m !== null);
  const conLectura = leidas.length === conAlgo.length;
  const porSede = conLectura ? leidas : conAlgo.map(montosSinLectura);
  const siempre: readonly Clave[] = ["vendido", "vendisteConIgv", "ventasNetas"];
  const filas = (conLectura ? CONCEPTOS_CON_IGV : CONCEPTOS_SIN_LECTURA)
    .map((c) => {
      const montos = porSede.map((m) => m[c.clave]);
      return { ...c, montos, total: r2(montos.reduce((t, m) => t + m, 0)) };
    })
    .filter((f) => siempre.includes(f.clave) || f.montos.some(hayCentimos));
  return {
    columnas: conAlgo.map((s) => s.nombre),
    filas,
    // En valor absoluto: una sede de más y otra de menos no se cancelan en el «Cuadra al céntimo».
    sinExplicar: r2((filas.find((f) => f.clave === "otras")?.montos ?? []).reduce((t, m) => t + Math.abs(m), 0)),
    conTotal: conAlgo.length > 1,
    conIgv: conLectura,
  };
}
