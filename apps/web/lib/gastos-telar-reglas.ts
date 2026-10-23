// Gastos en el telar de Finanzas (Felipe 2026-10-23): la pregunta que responde su cabecera, sus chips y la sede que se nombra
// arriba. Lógica pura, probada en `gastos-telar-reglas.test.ts`; el total sale de `fn_gastos_panel` y no se recalcula aquí.
import { nombreCortoSede } from "./finanzas-telar-reglas";
import { textoMes, type PanelGastos, type UbicacionGastos, type Ver } from "./gastos-reglas";
import type { TonoChip } from "@/components/ui/Chip";

/** Quién gastó, dentro de una frase: «CAYLA», «la empresa», «el Taller», «Lima». */
function quien(ver: Ver, ubicaciones: readonly UbicacionGastos[]): string {
  if (ver.soloEmpresa) return "la empresa";
  if (!ver.ubicacionId) return "CAYLA";
  const nombre = nombreCortoSede(ubicaciones.find((u) => u.id === ver.ubicacionId)?.nombre ?? "la tienda");
  return /^taller$/i.test(nombre) ? "el Taller" : nombre;
}

/** «¿Cuánto gastó Lima en octubre?» */
export function preguntaDeGastos(ver: Ver, ubicaciones: readonly UbicacionGastos[], mes: string): string {
  return `¿Cuánto gastó ${quien(ver, ubicaciones)} en ${textoMes(mes).split(" ")[0]}?`;
}

/** La línea de arriba de la cabecera: la sede que se mira, como la dice el hilo elegido. */
export function sedeDeLaCabecera(ver: Ver, ubicaciones: readonly UbicacionGastos[]): string {
  if (ver.soloEmpresa) return "Empresa";
  if (!ver.ubicacionId) return "Todas las sedes";
  return nombreCortoSede(ubicaciones.find((u) => u.id === ver.ubicacionId)?.nombre ?? "Tu sede");
}

/** Bajo la cifra: cuántos gastos son y, si hay, cuántos no tienen comprobante (sin él no se recupera el IGV). */
export function chipsDeGastos(panel: Pick<PanelGastos, "n" | "sinComprobante">): { texto: string; tono: TonoChip }[] {
  const chips: { texto: string; tono: TonoChip }[] = [{ texto: `${panel.n} ${panel.n === 1 ? "gasto" : "gastos"}`, tono: "pizarra" }];
  if (panel.sinComprobante > 0) chips.push({ texto: `${panel.sinComprobante} sin comprobante`, tono: "ambar" });
  return chips;
}
