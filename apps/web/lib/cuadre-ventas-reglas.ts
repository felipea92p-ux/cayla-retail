// De Ventas a Finanzas (ADR-0609): por qué «Vendido» de Ventas ▸ Reportes no es «Ventas» de Finanzas, en céntimos y sede por sede.
//
// PROMETE: arma el cuadro para la sede de la barra. Cada fila que no aporta nada se esconde, salvo el principio y el final; «Sin explicar» sale solo
// si hay algo, porque es la señal de que las dos cifras se separaron por algo que nadie nombró.
// ASUME: toda cifra viene de la base (`fn_cuadre_ventas_finanzas`). Aquí no se calcula plata: se suma por columnas y se escribe.

import { SEDE_EMPRESA, SEDE_TODAS, type ClaveSede } from "./finanzas-telar-reglas";

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

type Clave = "vendido" | "igv" | "anulaciones" | "devoluciones" | "cambios" | "claure" | "otras" | "ventasNetas";

const CONCEPTOS: readonly { clave: Clave; nombre: string; detalle: string }[] = [
  { clave: "vendido", nombre: "Vendido", detalle: "Ventas ▸ Reportes: lo cobrado, con IGV" },
  { clave: "igv", nombre: "IGV", detalle: "Está dentro de lo cobrado. El libro no lo cuenta como ingreso" },
  { clave: "anulaciones", nombre: "Anuladas en otro mes", detalle: "La venta y su anulación cayeron en meses distintos" },
  { clave: "devoluciones", nombre: "Devoluciones", detalle: "Lo devuelto en el mes, sin IGV" },
  { clave: "cambios", nombre: "Diferencias de cambios", detalle: "Lo que se cobró o devolvió al cambiar una prenda, sin IGV" },
  { clave: "claure", nombre: "Prendas de CLAURE", detalle: "Se le deben a CLAURE: no son ingreso de CAYLA" },
  { clave: "otras", nombre: "Sin explicar", detalle: "Una diferencia que ninguna regla nombra: avísale al equipo" },
  { clave: "ventasNetas", nombre: "Ventas del libro", detalle: "Finanzas, en el libro, sin IGV" },
];

export type FilaCuadro = { clave: Clave; nombre: string; detalle: string; montos: number[]; total: number };
export type CuadroVentas = { columnas: string[]; filas: FilaCuadro[]; sinExplicar: number; conTotal: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;
const hayCentimos = (n: number) => Math.round(n * 100) !== 0;

/** El cuadro de la sede de la barra: todas → una columna por sede y su total; una → esa sola. `null`: no hay nada que comparar. */
export function cuadroVentas(sedes: readonly SedeCuadre[], sede: ClaveSede): CuadroVentas | null {
  if (sede === SEDE_EMPRESA) return null;
  const suyas = sede === SEDE_TODAS ? [...sedes] : sedes.filter((s) => s.ubicacionId === sede);
  const conAlgo = suyas.filter((s) => hayCentimos(s.vendido) || hayCentimos(s.ventasNetas));
  if (!conAlgo.length) return null;
  const filas = CONCEPTOS.map((c) => {
    const montos = conAlgo.map((s) => s[c.clave]);
    return { ...c, montos, total: r2(montos.reduce((t, m) => t + m, 0)) };
  }).filter((f) => f.clave === "vendido" || f.clave === "ventasNetas" || f.montos.some(hayCentimos));
  return {
    columnas: conAlgo.map((s) => s.nombre),
    filas,
    sinExplicar: filas.find((f) => f.clave === "otras")?.total ?? 0,
    conTotal: conAlgo.length > 1,
  };
}
