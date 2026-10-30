// La lista de Gastos como el extracto del banco («L1 · Por día», Felipe 2026-10-30, maqueta `docs/maquetas/gastos-lista-2026-10/`):
// los gastos van por día, del más nuevo al más viejo, y cada día dice cuánto se fue y en cuántos gastos. Cada fila dice qué fue y,
// debajo, en qué, cómo se pagó y su comprobante; solo se marca lo que no es normal (anulado, por pagar, sin comprobante en algo
// grande). Lo chico que se repite el mismo día en la misma sede («Baño» seis veces) va en una sola fila que se abre.
// Lógica pura, probada en `gastos-extracto-reglas.test.ts`: no cambia qué es un gasto ni cuánto suma el mes (eso es de la base).
import type { TonoChip } from "@/components/ui/Chip";
import { soles } from "./compras-reglas";
import { nombreCortoSede, SEDE_EMPRESA } from "./finanzas-telar-reglas";
import { nombreDelDia } from "./gastos-ritmo-reglas";
import { estadoGasto, fechaCorta, igvDeFactura, papelEnUnaLinea, TEXTO_MEDIO, type GastoFila } from "./gastos-reglas";
import type { FiltrosLista } from "./gastos-telar-reglas";
import { sinTildes } from "./marcas";

/**
 * Desde cuánto un gasto sin comprobante lleva la marca «Sin comprobante» (Felipe 2026-10-30). Por debajo están el mototaxi, el baño y
 * los útiles, que nunca traen factura: marcarlos haría que la marca deje de verse. Desde S/ 300, con factura se recuperarían S/ 46 o más.
 */
export const UMBRAL_SIN_COMPROBANTE = 300;
/** Lo que se junta en una fila «×N» es lo chico de todos los días: un gasto de S/ 50 o más va siempre en su propia fila. */
export const TOPE_REPETIDO = 50;
/** Cuántos días se ven al llegar; el resto, con «Ver los N días de antes». Buscar o elegir un día muestra todos. */
export const DIAS_A_LA_VISTA = 5;
/** Una factura que vence en estos días o menos se marca en ámbar (como «esta semana» en Por pagar). */
const DIAS_DE_AVISO = 7;

export type GastoParaExtracto = Pick<
  GastoFila,
  | "id"
  | "fecha"
  | "descripcion"
  | "proveedorNombre"
  | "categoria"
  | "categoriaNombre"
  | "ubicacionId"
  | "ubicacionNombre"
  | "montoTotal"
  | "estado"
  | "motivoAnulacion"
  | "compraId"
  | "condicion"
  | "fechaVencimiento"
  | "saldo"
  | "tienePagos"
  | "medioPago"
  | "cajaMovimientoId"
  | "comprobanteTipo"
  | "comprobante"
>;

/** Lo que no es normal en un gasto, en un chip; `porque` es la frase que lo explica (el `title` del chip y su texto para el lector). */
export type MarcaGasto = { texto: string; tono: TonoChip; porque: string };

/** Días entre dos fechas `AAAA-MM-DD` (positivo si `hasta` viene después). */
function diasEntre(desde: string, hasta: string): number {
  const t = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((t(hasta) - t(desde)) / 86_400_000);
}

/**
 * La marca de un gasto, o `null` si es un gasto normal. Una sola por fila, de la más importante a la menos: anulado, después lo que
 * falta pagar (vencido en rojo, como en Por pagar; ámbar si vence en 7 días o menos; pizarra si hay tiempo) y, al final, lo grande sin
 * comprobante.
 */
export function marcaDelGasto(g: GastoParaExtracto, hoy: string): MarcaGasto | null {
  const e = estadoGasto(g);
  if (e === "anulado") return { texto: "Anulado", tono: "apagado", porque: g.motivoAnulacion ? `Anulado: ${g.motivoAnulacion}` : "Anulado: no cuenta en el mes." };
  if (e === "por_pagar" || e === "parcial") {
    const falta = `Faltan ${soles(g.saldo ?? 0)}${e === "parcial" ? ` de ${soles(g.montoTotal)}` : ""}`;
    if (!g.fechaVencimiento) return { texto: "Por pagar", tono: "pizarra", porque: `${falta}, sin fecha de vencimiento.` };
    const dias = diasEntre(hoy, g.fechaVencimiento);
    const cuando = fechaCorta(g.fechaVencimiento);
    if (dias < 0) return { texto: `Vencida · ${cuando}`, tono: "rojo", porque: `${falta}: venció el ${cuando}.` };
    if (dias === 0) return { texto: "Por pagar · vence hoy", tono: "ambar", porque: `${falta}: vence hoy.` };
    return {
      texto: `Por pagar · vence ${cuando}`,
      tono: dias <= DIAS_DE_AVISO ? "ambar" : "pizarra",
      porque: `${falta}: vence el ${cuando} (en ${dias} ${dias === 1 ? "día" : "días"}).`,
    };
  }
  if (g.comprobanteTipo === "sin_comprobante" && g.montoTotal >= UMBRAL_SIN_COMPROBANTE) {
    return { texto: "Sin comprobante", tono: "ambar", porque: `Sin boleta ni factura: con factura recuperarías ${soles(igvDeFactura(g.montoTotal))} de IGV.` };
  }
  return null;
}

/** Cómo se pagó, en pocas palabras: «A crédito» mientras se deba (el vencimiento lo dice la marca), el cajón de la tienda o el medio. */
export function comoSePago(g: GastoParaExtracto): string | null {
  const e = estadoGasto(g);
  if (g.compraId && g.condicion === "credito" && (e === "por_pagar" || e === "parcial")) return "A crédito";
  if (g.cajaMovimientoId) return `Cajón de ${g.ubicacionNombre ? nombreCortoSede(g.ubicacionNombre) : "la tienda"}`;
  if (g.medioPago) return TEXTO_MEDIO[g.medioPago];
  return g.tienePagos ? "Pagado" : null;
}

/**
 * La línea de debajo de qué fue: «Movilidad · Cajón de Lima · Boleta B001-12». Sin comprobante no se escribe (en lo chico es lo normal;
 * en lo grande, lo dice la marca); un anulado suma su motivo.
 */
export function detalleDelGasto(g: GastoParaExtracto): string {
  const partes = [g.categoriaNombre, comoSePago(g), g.comprobanteTipo === "sin_comprobante" ? null : papelEnUnaLinea(g)];
  if (g.estado === "anulado" && g.motivoAnulacion) partes.push(`anulado: ${g.motivoAnulacion}`);
  return partes.filter(Boolean).join(" · ");
}

export type FilaExtracto<T extends GastoParaExtracto> =
  | { tipo: "gasto"; gasto: T; marca: MarcaGasto | null }
  | { tipo: "repetidos"; clave: string; gastos: T[]; total: number };

export type DiaDelExtracto<T extends GastoParaExtracto> = {
  fecha: string;
  /** «Hoy · jueves 30 de octubre», «Ayer · miércoles 29 de octubre», «Martes 28 de octubre». */
  titulo: string;
  hoy: boolean;
  /** Lo que se fue ese día y en cuántos gastos, sin los anulados (no cuentan en el mes). */
  total: number;
  n: number;
  filas: FilaExtracto<T>[];
};

const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** «Hoy · jueves 30 de octubre», «Ayer · …» o «Martes 28 de octubre». */
export function tituloDelDia(fecha: string, hoy: string): string {
  const nombre = nombreDelDia(fecha.slice(0, 7), Number(fecha.slice(8, 10)));
  const atras = diasEntre(fecha, hoy);
  if (atras === 0) return `Hoy · ${nombre}`;
  if (atras === 1) return `Ayer · ${nombre}`;
  return conMayuscula(nombre);
}

/**
 * Las filas de un día. Lo chico, sin marca, que se repite (mismo nombre, sede, categoría y forma de pago) va en una fila «×N»; lo demás,
 * solo. Del más grande al más chico (un grupo pesa lo que suma) y los anulados al final: no cuentan en el día.
 */
export function filasDelDia<T extends GastoParaExtracto>(gastos: readonly T[], hoy: string): FilaExtracto<T>[] {
  const solos: FilaExtracto<T>[] = [];
  const grupos = new Map<string, T[]>();
  for (const g of gastos) {
    const marca = marcaDelGasto(g, hoy);
    if (marca || g.montoTotal >= TOPE_REPETIDO) {
      solos.push({ tipo: "gasto", gasto: g, marca });
      continue;
    }
    const clave = [sinTildes(g.descripcion.trim()), g.ubicacionId ?? SEDE_EMPRESA, g.categoria, comoSePago(g) ?? ""].join("|");
    grupos.set(clave, [...(grupos.get(clave) ?? []), g]);
  }
  for (const [clave, lista] of grupos) {
    if (lista.length === 1) solos.push({ tipo: "gasto", gasto: lista[0]!, marca: null });
    else solos.push({ tipo: "repetidos", clave: `${lista[0]!.fecha}|${clave}`, gastos: lista, total: redondear(lista.reduce((s, g) => s + g.montoTotal, 0)) });
  }
  const anulado = (f: FilaExtracto<T>) => f.tipo === "gasto" && f.gasto.estado === "anulado";
  const peso = (f: FilaExtracto<T>) => (f.tipo === "gasto" ? f.gasto.montoTotal : f.total);
  const id = (f: FilaExtracto<T>) => (f.tipo === "gasto" ? f.gasto.id : f.clave);
  return solos.sort((a, b) => Number(anulado(a)) - Number(anulado(b)) || peso(b) - peso(a) || id(a).localeCompare(id(b)));
}

/** Los gastos por día, del más nuevo al más viejo. */
export function extractoPorDia<T extends GastoParaExtracto>(gastos: readonly T[], hoy: string): DiaDelExtracto<T>[] {
  const porFecha = new Map<string, T[]>();
  for (const g of gastos) porFecha.set(g.fecha, [...(porFecha.get(g.fecha) ?? []), g]);
  return [...porFecha.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([fecha, lista]) => {
      const vigentes = lista.filter((g) => g.estado !== "anulado");
      return {
        fecha,
        titulo: tituloDelDia(fecha, hoy),
        hoy: fecha === hoy,
        total: redondear(vigentes.reduce((s, g) => s + g.montoTotal, 0)),
        n: vigentes.length,
        filas: filasDelDia(lista, hoy),
      };
    });
}

/** Lo que dice el día a la derecha de su nombre: «S/ 514.50» y «· 7 gastos»; un día de solo anulados no suma nada. */
export function resumenDelDia(d: Pick<DiaDelExtracto<GastoParaExtracto>, "total" | "n">): { monto: string | null; cuenta: string } {
  if (d.n === 0) return { monto: null, cuenta: "Solo anulados" };
  return { monto: soles(d.total), cuenta: `${d.n} ${d.n === 1 ? "gasto" : "gastos"}` };
}

/**
 * Cuántos días se ven al llegar. Con una búsqueda o un día elegido se ven todos (lo buscado no se esconde); si los de antes serían uno
 * solo, también («Ver el día de antes» por una fila es un toque de más).
 */
export function diasALaVista(total: number, f: Pick<FiltrosLista, "q" | "dia">): number {
  if (f.q.trim() || f.dia) return total;
  return total <= DIAS_A_LA_VISTA + 1 ? total : DIAS_A_LA_VISTA;
}

/** «Ver los 12 días de antes». */
export function textoDiasDeAntes(n: number): string {
  return `Ver los ${n} días de antes`;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
