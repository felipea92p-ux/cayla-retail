// Gastos en el telar de Finanzas (Felipe 2026-10-23): la pregunta que responde su cabecera, sus chips y la sede que se nombra
// arriba. Lógica pura, probada en `gastos-telar-reglas.test.ts`; el total sale de `fn_gastos_panel` y no se recalcula aquí.
import { nombreCortoSede, SEDE_EMPRESA } from "./finanzas-telar-reglas";
import { sinTildes } from "./marcas";
import { DESDE_EL_UMBRAL, pideComprobante } from "./gastos-extracto-reglas";
import { textoMes, type PanelGastos, type UbicacionGastos, type Ver } from "./gastos-reglas";
import { nombresDeVarias } from "./gastos-varias-sedes";
import type { TonoChip } from "@/components/ui/Chip";

/** Quién gastó, dentro de una frase: «CAYLA», «la empresa», «el Taller», «Lima», «Trujillo y Lima». */
function quien(ver: Ver, ubicaciones: readonly UbicacionGastos[]): string {
  if (ver.varias) return nombresDeVarias(ver, ubicaciones, nombreCortoSede, true);
  if (ver.soloEmpresa) return "la empresa";
  if (!ver.ubicacionId) return "CAYLA";
  const nombre = nombreCortoSede(ubicaciones.find((u) => u.id === ver.ubicacionId)?.nombre ?? "la tienda");
  return /^taller$/i.test(nombre) ? "el Taller" : nombre;
}

/** «¿Cuánto gastó Lima en octubre?»; con varias sedes, «¿Cuánto gastaron Trujillo y Lima en octubre?». */
export function preguntaDeGastos(ver: Ver, ubicaciones: readonly UbicacionGastos[], mes: string): string {
  return `¿Cuánto ${ver.varias ? "gastaron" : "gastó"} ${quien(ver, ubicaciones)} en ${textoMes(mes).split(" ")[0]}?`;
}

/** La línea de arriba de la cabecera: la sede que se mira, como la dice el hilo elegido. */
export function sedeDeLaCabecera(ver: Ver, ubicaciones: readonly UbicacionGastos[]): string {
  if (ver.varias) return nombresDeVarias(ver, ubicaciones, nombreCortoSede, false);
  if (ver.soloEmpresa) return "Empresa";
  if (!ver.ubicacionId) return "Todas las sedes";
  return nombreCortoSede(ubicaciones.find((u) => u.id === ver.ubicacionId)?.nombre ?? "Tu sede");
}

/**
 * Bajo la cifra: cuántos gastos son y, si hay, cuántos de S/ 300 o más no tienen comprobante. `sinComprobante` es esa cuenta
 * (`sinComprobanteGrande`), la misma que marca la lista: lo chico sin papel (el mototaxi, el baño) no es una alarma (Felipe 2026-10-30).
 */
export function chipsDeGastos(panel: Pick<PanelGastos, "n" | "sinComprobante">): { texto: string; tono: TonoChip }[] {
  const chips: { texto: string; tono: TonoChip }[] = [{ texto: `${panel.n} ${panel.n === 1 ? "gasto" : "gastos"}`, tono: "pizarra" }];
  if (panel.sinComprobante > 0) chips.push({ texto: `${panel.sinComprobante} sin comprobante`, tono: "ambar" });
  return chips;
}

// ---- La lista: los filtros a la vista y la búsqueda que no mira tildes ----------------------------------------------------------

/** `sin_grande`: sin comprobante y de S/ 300 o más, lo que marca la lista (lo pone «Ver cuáles» de la bandeja). */
export type FiltroComprobante = "todos" | "sin" | "con" | "sin_grande";
/** `sede`: la sede de un gasto (`empresa` = lo que no es de ninguna), puesta desde el desglose de «En qué se va»; "" = todas. */
export type FiltrosLista = { q: string; categoria: string; sede: string; dia: number | null; comprobante: FiltroComprobante };

/** Sin ningún filtro: así nace la lista, así la deja «Limpiar todo», y de aquí sale el valor que quita cada píldora. */
export const SIN_FILTROS: FiltrosLista = { q: "", categoria: "", sede: "", dia: null, comprobante: "todos" };

type GastoParaFiltrar = {
  categoria: string;
  estado: "vigente" | "anulado";
  montoTotal: number;
  ubicacionId: string | null;
  fecha: string;
  descripcion: string;
  proveedorNombre: string | null;
  comprobante: string | null;
  categoriaNombre: string;
  comprobanteTipo: string;
  /** Lo marcado «no emite comprobante» ya no entra a «Sin comprobante, de S/ 300 o más» (ADR-0588). */
  noEmite?: unknown;
};

/** Lo que calza con los filtros. La búsqueda va sin tildes ni mayúsculas («bano» encuentra «Baño») sobre lo que se lee en la fila. */
export function filtrarGastos<T extends GastoParaFiltrar>(gastos: readonly T[], f: FiltrosLista, mes: string): T[] {
  const q = sinTildes(f.q.trim());
  const fechaDia = f.dia ? `${mes}-${String(f.dia).padStart(2, "0")}` : null;
  return gastos.filter(
    (g) =>
      (!f.categoria || g.categoria === f.categoria) &&
      (!f.sede || (g.ubicacionId ?? SEDE_EMPRESA) === f.sede) &&
      (!fechaDia || g.fecha === fechaDia) &&
      (f.comprobante === "todos" ||
        (f.comprobante === "sin_grande" ? pideComprobante(g) : (f.comprobante === "sin") === (g.comprobanteTipo === "sin_comprobante"))) &&
      (!q || [g.descripcion, g.proveedorNombre ?? "", g.comprobante ?? "", g.categoriaNombre].some((t) => sinTildes(t).includes(q))),
  );
}

export type FiltroPuestoGastos = { clave: keyof FiltrosLista; texto: string };

/** Los filtros puestos, como se leen en sus píldoras (cada una se quita sola). */
export function filtrosPuestosDeGastos(f: FiltrosLista, nombreCategoria: (c: string) => string, mesNombre: string, nombreSede: (clave: string) => string = (c) => c): FiltroPuestoGastos[] {
  const r: FiltroPuestoGastos[] = [];
  if (f.categoria) r.push({ clave: "categoria", texto: nombreCategoria(f.categoria) });
  if (f.sede) r.push({ clave: "sede", texto: `En ${nombreSede(f.sede)}` });
  if (f.dia) r.push({ clave: "dia", texto: `El ${f.dia} de ${mesNombre}` });
  if (f.comprobante !== "todos")
    r.push({ clave: "comprobante", texto: f.comprobante === "sin" ? "Sin comprobante" : f.comprobante === "sin_grande" ? `Sin comprobante, ${DESDE_EL_UMBRAL}` : "Con comprobante" });
  if (f.q.trim()) r.push({ clave: "q", texto: `«${f.q.trim()}»` });
  return r;
}

/**
 * Lo que la pantalla dice cuando una lectura falla: «No se pudo leer el IGV perdido.», sin el texto técnico de la base que venía
 * detrás de los dos puntos (en inglés, con nombres de funciones). El detalle técnico sigue en la consola del servidor.
 */
export function fallaLegible(falla: string): string {
  const i = falla.indexOf(":");
  const corta = (i > 0 ? falla.slice(0, i) : falla).trim();
  return /[.!?]$/.test(corta) ? corta : `${corta}.`;
}
