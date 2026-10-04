// Reglas de la cola «Por regularizar» (ADR-0179): prendas vendidas en caja antes de estar en el
// sistema, que almacén une después con su prenda real. Lógica pura: la usan la pestaña de Recibir
// y el aviso del inicio.
import { hoyLima } from "./fechas-lima";

/** Días que almacén tiene para regularizar antes de que la prenda salga «Vencida» y avise al líder. */
export const DIAS_PARA_VENCER = 2;
const MS_POR_DIA = 86_400_000;

export function estaVencida(vendidoEn: string, ahora: Date = new Date()): boolean {
  return ahora.getTime() - new Date(vendidoEn).getTime() >= DIAS_PARA_VENCER * MS_POR_DIA;
}

/** Desde cuándo una pendiente ya cuenta como vencida (para filtrar en la base). */
export function vencidasDesde(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - DIAS_PARA_VENCER * MS_POR_DIA).toISOString();
}

/**
 * Desde cuándo se muestran las ya resueltas (regularizadas o de venta anulada): el 1.º del mes ANTERIOR, a las 00:00 de
 * Lima. Tiene que cubrir el mes completo en curso, porque las cifras «este mes» se calculan sobre las filas que llegan
 * (`cifrasPorRegularizar`); y con el mes anterior, el día 1 la lista de resueltas no amanece vacía. Las PENDIENTES no
 * tienen ventana: una de hace tres meses sigue siendo trabajo, y es justo la que primero vence. Lima va cinco horas
 * detrás de UTC todo el año, así que el corte se escribe con su desfase fijo.
 */
export function resueltasDesde(ahora: Date = new Date()): string {
  const [anio, mes] = hoyLima(ahora).split("-").map(Number);
  const [anioAnterior, mesAnterior] = mes === 1 ? [anio - 1, 12] : [anio, mes - 1];
  return `${anioAnterior}-${String(mesAnterior).padStart(2, "0")}-01T00:00:00-05:00`;
}

/** diferencia = cobrado − oficial: negativa = descuento no planificado; positiva = sobreprecio. */
export function tipoDiferencia(diferencia: number): "descuento" | "sobreprecio" | "exacto" {
  if (diferencia < 0) return "descuento";
  if (diferencia > 0) return "sobreprecio";
  return "exacto";
}

/** Lo que dice la base (`regularizar_prenda`, hint `regularizar_propia_venta`) y la pantalla cuando el elegido en el combo vendió. */
export const NO_SU_PROPIA_VENTA = "Quien vendió esta prenda no puede regularizarla: que lo haga otra persona del equipo o un líder.";
/** Lo que dice la pantalla cuando la venta es de la persona de la cuenta: elegir a otra en el combo no la vuelve ajena. */
export const TU_PROPIA_VENTA = "Tú vendiste esta prenda: la regulariza otra persona del equipo desde su cuenta o desde la terminal, o un líder.";

/**
 * ADR-0328 (actividad 5, Felipe 2026-10-04): nadie regulariza su propia venta, salvo el líder. Espejo de la regla de
 * `regularizar_prenda` (20261004204000), que es la que decide: esto solo lo dice ANTES de tocar «Regularizar».
 *   · una venta sin vendedora registrada no tiene con quién compararse: pasa;
 *   · la cuenta es de quien vendió y no es de líder → no (con su propia cuenta, nombrar a otra persona no vuelve ajena la venta);
 *   · firma quien vendió → no, salvo el líder firmando ÉL MISMO: cuenta de líder y el elegido es la persona de la cuenta. Con la
 *     sesión de una líder abierta en caja, elegir a la asesora que vendió no le presta la excepción (revisión, R1).
 */
export function motivoPropiaVenta(p: { vendidoPorId: string | null; responsableId: string | null; personaSesionId: string | null; esLider: boolean }): string | null {
  const { vendidoPorId: vendio, responsableId: firma, personaSesionId: cuenta, esLider } = p;
  if (!vendio) return null;
  if (vendio === cuenta && !esLider) return TU_PROPIA_VENTA;
  if (vendio === firma && !(esLider && firma === cuenta)) return NO_SU_PROPIA_VENTA;
  return null;
}

/** La fila de la lista lo dice antes de abrirla: la vendió la persona de esta cuenta y la cuenta no es de líder. */
export function vendidaPorLaCuenta(vendidoPorId: string | null, personaSesionId: string | null, esLider: boolean): boolean {
  return !esLider && vendidoPorId !== null && vendidoPorId === personaSesionId;
}

type FilaParaCifras = { estado: string; vendidoEn: string; diferencia: number | null };

/** Las cuatro cifras de la cabecera. «Del mes» = mes calendario de Lima de la venta. */
export function cifrasPorRegularizar(filas: FilaParaCifras[], ahora: Date = new Date()) {
  const mes = hoyLima(ahora).slice(0, 7);
  let pendientes = 0;
  let vencidas = 0;
  let descuentoMes = 0;
  let sobreprecioMes = 0;
  for (const f of filas) {
    if (f.estado === "pendiente") {
      pendientes++;
      if (estaVencida(f.vendidoEn, ahora)) vencidas++;
    } else if (f.estado === "regularizada" && f.diferencia !== null && hoyLima(new Date(f.vendidoEn)).slice(0, 7) === mes) {
      if (f.diferencia < 0) descuentoMes += -f.diferencia;
      else sobreprecioMes += f.diferencia;
    }
  }
  const redondear = (n: number) => Math.round(n * 100) / 100;
  return { pendientes, vencidas, descuentoMes: redondear(descuentoMes), sobreprecioMes: redondear(sobreprecioMes) };
}
