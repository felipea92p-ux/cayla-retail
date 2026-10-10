import type { FilaPorRegularizar } from "@/lib/por-regularizar";
import { lineaDeCorreccion } from "@/lib/corregir-prenda-sin-registrar-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";

/** «Corregido por … el …» bajo lo anotado (ADR-0369): que nadie confunda lo corregido con lo que dijo caja. Nada si nunca se corrigió. */
export function LineaCorregida({ fila }: { fila: FilaPorRegularizar }) {
  if (!fila.correccion) return null;
  return <small className="vsr-sl-corregida">{lineaDeCorreccion(fila.correccion, diaYHoraLima(fila.correccion.ultimaEn).dia)}</small>;
}
