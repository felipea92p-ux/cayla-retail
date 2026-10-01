// Vender con la caja cerrada (ADR-0299, maqueta B «Persiana», docs/maquetas/caja-cerrada-2026-10/).
// Lo que dice el cartel y la línea de abajo, y los tiempos de la salida. Lógica pura: la importan el componente y su prueba.
import { diaYHoraLima, diasEntreFechas, hoyLima } from "./fechas-lima";

/** El último cierre de la sede, lo justo para decir cuándo cerró, quién y cuánto quedó en el cajón. */
export type CierreAnterior = {
  cerradaEn: string;
  cerradaPorNombre: string | null;
  /** Lo que quedó en el cajón al cerrar (ADR-0186). `null` en cierres anteriores a esa regla. */
  montoFondo: number | null;
};

/**
 * Salida al abrir: el cartel gira a «Abierto» (`giro` ms) y después la persiana sube (`subida` ms). Recién entonces la
 * capa se desmonta. Deben coincidir con `app/estilos/caja-cerrada.css` (0,9 s de giro + pausa; 1 s de subida).
 */
export const TIEMPOS_SALIDA = { giro: 1200, subida: 1150 } as const;

function soles(n: number): string {
  return "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** «hoy, 08:10», «ayer, 21:04» o «el 28/09, 21:04», en hora de Lima. */
export function cuandoCerro(cerradaEn: string, ahora: Date = new Date()): string {
  const { dia, hora } = diaYHoraLima(cerradaEn);
  const dias = diasEntreFechas(hoyLima(new Date(cerradaEn)), hoyLima(ahora));
  if (dias <= 0) return `hoy, ${hora}`;
  if (dias === 1) return `ayer, ${hora}`;
  return `el ${dia}, ${hora}`;
}

/** Lo que va bajo «Cerrado» en el cartel: la sede y desde cuándo está cerrada. */
export function bajadaDelCartel(sede: string, cierre: CierreAnterior | null, ahora: Date = new Date()): string {
  return cierre ? `${sede} · desde ${cuandoCerro(cierre.cerradaEn, ahora)}` : sede;
}

/**
 * La línea bajo el botón, en piezas (se separan con un punto): cuándo y quién cerró, y cuánto debería haber en el cajón.
 * Sin ningún cierre (sede nueva) dice que la primera apertura se escribe a mano: el formulario lo pide así.
 */
export function lineaUltimoCierre(cierre: CierreAnterior | null, ahora: Date = new Date()): string[] {
  if (!cierre) return ["Primera apertura de la sede: escribes con cuánto abres"];
  const piezas = [`Último cierre ${cuandoCerro(cierre.cerradaEn, ahora)}${cierre.cerradaPorNombre ? ` · ${cierre.cerradaPorNombre}` : ""}`];
  if (cierre.montoFondo !== null) piezas.push(`En el cajón ${soles(cierre.montoFondo)}`);
  return piezas;
}
