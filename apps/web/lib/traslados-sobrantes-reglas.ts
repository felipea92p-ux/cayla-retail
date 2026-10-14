import type { CampoDeGuia } from "./guia-campos";
import { textoObligatorioValido } from "./traslados-recepcion-reglas";

// La prenda de más de un traslado (ADR-0404, Felipe 2026-10-14). Al cerrar con la diferencia, de cada prenda entra hasta lo
// enviado; lo contado de más queda como SOBRANTE A REVISAR, fuera del stock (no se puede cobrar), hasta que alguien que puede
// cerrar la diferencia decide qué pasó. Estas reglas son puras: qué se ofrece, qué se puede guardar, qué dice la guía de foco y
// cómo se lee un sobrante ya revisado. La base vuelve a validar todo (`resolver_sobrante_traslado`).

export type DecisionSobrante = "salio_del_origen" | "encontrada" | "error_de_conteo";
export type EstadoSobrante = "por_revisar" | DecisionSobrante;

export type SobranteTraslado = {
  id: string;
  varianteId: string;
  cantidad: number;
  estado: EstadoSobrante;
  creadoEn: string;
  revisadoEn: string | null;
  revisadoPorNombre: string | null;
  nota: string | null;
};

/** El tope de la nota en la base (`sobrante_nota_larga`). */
export const MAX_NOTA_SOBRANTE = 200;

const ESTADOS: readonly EstadoSobrante[] = ["por_revisar", "salio_del_origen", "encontrada", "error_de_conteo"];
export function esEstadoSobrante(x: unknown): x is EstadoSobrante {
  return typeof x === "string" && (ESTADOS as readonly string[]).includes(x);
}

/** Las tres salidas, en el orden en que se ofrecen, con lo que pasa con el stock dicho en palabras de tienda. */
export function opcionesDeSobrante(origen: string, destino: string): { valor: DecisionSobrante; titulo: string; sub: string }[] {
  return [
    { valor: "salio_del_origen", titulo: `Salió de ${origen} sin anotarse`, sub: `Se descuenta de ${origen} y entra a ${destino}.` },
    { valor: "encontrada", titulo: "No sé de dónde salió", sub: `Entra a ${destino} como prenda encontrada.` },
    { valor: "error_de_conteo", titulo: "Me equivoqué al contar", sub: "No entra nada: la prenda no estaba." },
  ];
}

/** ¿Se puede guardar la revisión? Lo mismo que exige la base: una de las tres, una nota de 5 a 200 letras y quién lo decide. */
export function puedeGuardarSobrante(decision: DecisionSobrante | null, nota: string, responsableListo: boolean): boolean {
  return decision !== null && textoObligatorioValido(nota) && nota.trim().length <= MAX_NOTA_SOBRANTE && responsableListo;
}

/** La guía de foco del formulario (ADR-0284): sale de la misma regla que `puedeGuardarSobrante` (la prueba exige que coincidan). */
export function camposSobrante(decision: DecisionSobrante | null, nota: string, responsableListo: boolean): CampoDeGuia[] {
  return [
    { id: "sobrante-decision", nombre: "Qué pasó", requerido: true, hecho: decision !== null, pendiente: "Elige qué pasó con la prenda de más." },
    {
      id: "sobrante-nota",
      nombre: "Cómo lo supiste",
      requerido: true,
      hecho: textoObligatorioValido(nota) && nota.trim().length <= MAX_NOTA_SOBRANTE,
      pendiente: "Escribe cómo lo supiste.",
    },
    { id: "sobrante-responsable", nombre: "Quién lo decide", requerido: true, hecho: responsableListo, pendiente: "Elige quién lo decide." },
  ];
}

/** Lo que dice un sobrante ya revisado, después del nombre de la prenda. */
export function textoDeLaDecision(estado: EstadoSobrante, origen: string): string {
  switch (estado) {
    case "salio_del_origen":
      return `Salió de ${origen} sin anotarse: se descontó allá y entró aquí.`;
    case "encontrada":
      return "Entró como prenda encontrada.";
    case "error_de_conteo":
      return "Fue un error al contar: no entró.";
    default:
      return "Por revisar: todavía no está en el stock y no se puede vender.";
  }
}

/** Cuántas unidades esperan revisión (las que no están en el stock). */
export function unidadesPorRevisar(sobrantes: readonly Pick<SobranteTraslado, "estado" | "cantidad">[]): number {
  return sobrantes.reduce((n, s) => (s.estado === "por_revisar" ? n + s.cantidad : n), 0);
}

/** El aviso al guardar: qué pasó con el stock, en una línea. */
export function avisoDeSobrante(decision: DecisionSobrante, cantidad: number, origen: string, destino: string): { titulo: string; detalle: string } {
  const prendas = cantidad === 1 ? "La prenda" : `Las ${cantidad} prendas`;
  switch (decision) {
    case "salio_del_origen":
      return { titulo: "Revisada: salió de " + origen, detalle: `${prendas} ${cantidad === 1 ? "salió" : "salieron"} del stock de ${origen} y ${cantidad === 1 ? "entró" : "entraron"} al de ${destino}.` };
    case "encontrada":
      return { titulo: "Revisada: prenda encontrada", detalle: `${prendas} ${cantidad === 1 ? "entró" : "entraron"} al stock de ${destino} como encontrada${cantidad === 1 ? "" : "s"}.` };
    case "error_de_conteo":
      return { titulo: "Revisada: error al contar", detalle: "No entró nada al stock." };
  }
}
