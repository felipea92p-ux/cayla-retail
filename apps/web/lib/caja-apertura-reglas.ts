import { diferenciaApertura, leerMonto, motivoAperturaValido } from "./caja-cierre-reglas";

/* ====================================================================
   Abrir caja, la hoja con resumen (Felipe 2026-11-03, `docs/maquetas/caja-abrir-v2-2026-11/`).

   El total del cajón SIEMPRE se escribe; contar billetes y monedas es una ayuda opcional que solo suma y escribe ese total
   (no se guarda el desglose: `abrir_caja` sigue recibiendo `p_monto_apertura` y `p_motivo_diferencia`). Lo que decide si se puede
   abrir vive aquí y no en el componente: el candado real está en la base, esto lo explica antes de enviar.
   ==================================================================== */

/** Los billetes y monedas del Perú, de mayor a menor. `valor` en soles. */
export const DENOMINACIONES = [
  { valor: 200, tipo: "billete" },
  { valor: 100, tipo: "billete" },
  { valor: 50, tipo: "billete" },
  { valor: 20, tipo: "billete" },
  { valor: 10, tipo: "billete" },
  { valor: 5, tipo: "moneda" },
  { valor: 2, tipo: "moneda" },
  { valor: 1, tipo: "moneda" },
  { valor: 0.5, tipo: "moneda" },
  { valor: 0.2, tipo: "moneda" },
  { valor: 0.1, tipo: "moneda" },
] as const;

/** Cuántos hay de cada denominación, por su valor en soles escrito como texto («0.5»). */
export type ConteoCajon = Record<string, number>;

export const llaveDenominacion = (valor: number): string => String(valor);

/** Lo máximo que se cuenta de una sola denominación: más que eso es un error de dedo. */
export const MAX_POR_DENOMINACION = 999;

/** El total de lo contado, sumado en céntimos para que 0.1 + 0.2 no dé 0.30000000000000004. */
export function sumaConteo(conteo: ConteoCajon): number {
  const centimos = DENOMINACIONES.reduce((a, d) => a + Math.round(d.valor * 100) * Math.max(0, conteo[llaveDenominacion(d.valor)] ?? 0), 0);
  return centimos / 100;
}

export const hayConteo = (conteo: ConteoCajon): boolean => DENOMINACIONES.some((d) => (conteo[llaveDenominacion(d.valor)] ?? 0) > 0);

/** Un monto como se escribe en el campo: dos decimales, punto decimal («258.50»). */
export const montoEscrito = (n: number): string => n.toFixed(2);

export type FaltaParaAbrir = "monto" | "motivo" | null;

export type EstadoApertura = {
  /** El monto con el que se abriría; `null` si el campo está vacío o no se entiende. */
  monto: number | null;
  /** Contra el último cierre: 0 = coincide, negativo = faltan, positivo = sobran; `null` = sin monto o sin cierre previo. */
  diferencia: number | null;
  pideMotivo: boolean;
  listo: boolean;
  /** Lo que falta para poder abrir, en el orden en que la persona lo resuelve. */
  falta: FaltaParaAbrir;
};

export function estadoApertura({ texto, esperado, motivo }: { texto: string; esperado: number | null; motivo: string }): EstadoApertura {
  const monto = leerMonto(texto);
  const diferencia = monto === null ? null : diferenciaApertura(monto, esperado);
  const pideMotivo = diferencia !== null && diferencia !== 0;
  const montoValido = monto !== null && monto >= 0;
  const falta: FaltaParaAbrir = !montoValido ? "monto" : pideMotivo && !motivoAperturaValido(motivo) ? "motivo" : null;
  return { monto, diferencia, pideMotivo, listo: falta === null, falta };
}

/** «Falta: el monto del cajón». Corto a propósito: se lee de un vistazo bajo el botón. */
export function textoFalta(falta: FaltaParaAbrir): string {
  if (falta === "monto") return "el monto del cajón";
  if (falta === "motivo") return "qué pasó con la diferencia";
  return "";
}
