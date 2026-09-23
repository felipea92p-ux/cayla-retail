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

/** diferencia = cobrado − oficial: negativa = descuento no planificado; positiva = sobreprecio. */
export function tipoDiferencia(diferencia: number): "descuento" | "sobreprecio" | "exacto" {
  if (diferencia < 0) return "descuento";
  if (diferencia > 0) return "sobreprecio";
  return "exacto";
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
