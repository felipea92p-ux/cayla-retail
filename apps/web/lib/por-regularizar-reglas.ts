// Reglas de la cola «Por regularizar» (ADR-0179): prendas vendidas en caja antes de estar en el
// sistema, que almacén une después con su prenda real. Lógica pura: la usan la pestaña de Recibir
// y el aviso del inicio.
import { hoyLima } from "./fechas-lima";
import { clave } from "./buscar-prenda-v2";

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

/** Cuántas ventas sin registrar se pintan por página: con la cola de arranque de una tienda grande la lista pasaba de las 200 filas. */
export const VENTAS_POR_PAGINA = 25;

export type CampoOrden = "prenda" | "vendio" | "cobrado" | "estado";
export type Orden = { campo: CampoOrden; dir: "asc" | "desc" };

/** Al abrir: de la venta más reciente a la más antigua (Felipe, 2026-10-06). */
export const ORDEN_INICIAL: Orden = { campo: "vendio", dir: "desc" };

/** Al tocar un encabezado: el mismo campo invierte; uno nuevo arranca de mayor a menor (lo más reciente, lo más caro, lo más urgente
 *  primero), salvo el nombre de la prenda, que arranca de la A a la Z. */
export function siguienteOrden(actual: Orden, campo: CampoOrden): Orden {
  if (actual.campo === campo) return { campo, dir: actual.dir === "desc" ? "asc" : "desc" };
  return { campo, dir: campo === "prenda" ? "asc" : "desc" };
}

type FilaOrdenable = {
  id: string;
  descripcion: string;
  vendidoEn: string;
  precioCobrado: number;
  estado: string;
};

/** Más alto = más urgente: la vencida primero, después la pendiente, y al final lo ya resuelto. */
function urgencia(f: FilaOrdenable, ahora: Date): number {
  if (f.estado === "pendiente") return estaVencida(f.vendidoEn, ahora) ? 5 : 4;
  if (f.estado === "regularizada") return 3;
  if (f.estado === "cerrada_sin_prenda") return 2;
  return 1;
}

/** Copia ordenada (no toca el orden de lectura de `getPorRegularizar`, que lee las pendientes de la más vieja a la más nueva para
 *  paginar la base sin saltarse filas). Siempre desempata por fecha (la más reciente primero) y luego por `id`: dos ventas
 *  iguales no cambian de lugar entre un refresco y otro. */
export function ordenarVentas<T extends FilaOrdenable>(filas: T[], orden: Orden, ahora: Date = new Date()): T[] {
  const signo = orden.dir === "asc" ? 1 : -1;
  const valor = (f: T): number | string => {
    switch (orden.campo) {
      case "prenda":
        return clave(f.descripcion);
      case "vendio":
        return Date.parse(f.vendidoEn);
      case "cobrado":
        return f.precioCobrado;
      case "estado":
        return urgencia(f, ahora);
    }
  };
  return [...filas].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    const cmp = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb, "es") : (va as number) - (vb as number);
    return signo * cmp || Date.parse(b.vendidoEn) - Date.parse(a.vendidoEn) || a.id.localeCompare(b.id);
  });
}

type FilaBuscable = {
  descripcion: string;
  categoria: string;
  talla: string;
  color: string;
  vendidoPor: string;
  sede: string;
  prendaReal: string | null;
  precioCobrado: number;
};

/** Lo escrito en el buscador: cada palabra tiene que empezar alguna palabra de la fila (sin mayúsculas ni tildes), en cualquier
 *  orden: «polo vino» o «pamela 35» encuentran su fila. Por inicio de palabra y no por trozo: «m» busca la talla M y «Marrón», no
 *  cada palabra que lleve una «m» adentro. Busca en la prenda que anotó caja, su categoría, talla y color, quién vendió, la sede, la
 *  prenda real (si ya se regularizó) y el precio cobrado. */
export function coincideConBusqueda(f: FilaBuscable, consulta: string): boolean {
  const terminos = clave(consulta).split(/\s+/).filter(Boolean);
  if (terminos.length === 0) return true;
  const texto = ` ${clave([f.descripcion, f.categoria, f.talla, f.color, f.vendidoPor, f.sede, f.prendaReal, f.precioCobrado.toFixed(2)].filter(Boolean).join(" "))}`;
  return terminos.every((t) => texto.includes(` ${t}`));
}
