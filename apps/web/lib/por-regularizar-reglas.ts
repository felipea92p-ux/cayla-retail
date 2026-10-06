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

/**
 * La carga inicial de la sede de una venta, como la devuelve `fn_por_regularizar_sin_cargar` (que la lee del cierre por sede de
 * ADR-0328 act. 4 con `fn_carga_inicial_de_sede`, y funciona aunque ese cierre todavía no esté en la base: «abierta, sin fecha»).
 * `hastaCorta`: el último día abierto, ya dicho como la base lo dice («15-oct»); `null` = sin fecha. Donde se recibe `null` en vez
 * de esto, la lectura no volvió o falló: no se sabe, y la pantalla no afirma nada de la carga.
 */
export type CargaDeLaSede = { abierta: boolean; hastaCorta: string | null };

/** Por venta pendiente: si ninguna prenda que pueda ser ella se cargó nunca en su sede, y la carga de esa sede. */
export type VentaSinCargar = { sinCargar: boolean; carga: CargaDeLaSede };

/**
 * Lo que dice la base (`fn_exigir_prenda_cargada_en_sede`, 20261004204000) y la pantalla en cuanto se elige una prenda sin ningún
 * movimiento en la sede (`fn_prenda_cargada_en_sede`): regularizarla le cerraría su carga inicial. La salida depende de la carga de
 * ESA sede (ajuste del 2026-10-04): abierta (AQP y LIM hoy, sin fecha) → primero su stock inicial (hint `prenda_sin_cargar_en_sede`);
 * cerrada (TRU desde el 16-oct) → «Encontré prendas» (hint `prenda_sin_cargar_carga_cerrada`), porque la carga inicial ya no la
 * acepta. Las tres frases son las de la base al carácter (`scripts/pruebas/ventas_sin_registrar.mjs`, R6b y R6f–R6h); sin saber la
 * carga, la de antes, que no dice nada de ella.
 */
export function prendaSinCargar(sede: string, carga: CargaDeLaSede | null = null): string {
  const s = sede || "esta tienda";
  if (carga && !carga.abierta) {
    return `La carga de ${s} se cerró${carga.hastaCorta ? ` el ${carga.hastaCorta}` : ""} y esta prenda nunca se cargó ahí: regístrala con «Encontré prendas» (lo que hay hoy en la tienda, sin la vendida) y después regulariza.`;
  }
  if (carga) {
    return `Esta prenda todavía no está cargada en ${s}: primero cárgala con su stock inicial (la carga de ${s} sigue abierta${carga.hastaCorta ? ` hasta el ${carga.hastaCorta}` : ""}), con lo que hay hoy en la tienda sin la vendida, y vuelve a regularizarla.`;
  }
  return `Esta prenda todavía no está cargada en ${s}: primero cárgala con su stock inicial (lo que hay hoy en la tienda, sin la vendida) y vuelve a regularizarla.`;
}

/**
 * El enlace bajo el aviso: a la ficha del producto, que ajusta el stock de la SEDE ACTIVA (`productos/[id]/editar`, ADR-0270). Ahí
 * una prenda sin historia en la sede entra como stock inicial (carga abierta) o con «Encontré prendas» (cerrada, #785). Si la venta
 * es de otra sede que la activa (el líder mira «Tus tiendas»), se dice antes de irse: si no, cargaría en la sede equivocada.
 */
export function salidaPrendaSinCargar(o: { carga: CargaDeLaSede | null; sede: string; enOtraSede: boolean }): { texto: string; antes: string | null } {
  const texto = o.carga && !o.carga.abierta ? "Registrarla con «Encontré prendas»" : "Cargar su stock inicial";
  const antes = o.enOtraSede ? `La ficha trabaja sobre tu sede activa: cámbiala a ${o.sede || "la tienda de la venta"} antes.` : null;
  return { texto, antes };
}

export type GrupoSinCargar = { ubicacionId: string; sede: string; carga: CargaDeLaSede; ventas: number };

/**
 * ¿Esta venta pendiente va a la línea de «sin cargar»? Solo si la base la marcó `sinCargar` (ninguna prenda de la categoría y talla
 * ANOTADAS, de su color o su familia, se cargó nunca en la sede) y la pantalla no tiene otra pista (`conPista`: una candidata, o la
 * categoría que la caja ESCRIBIÓ, que la base no mira y puede estar cargada). Ante la duda, la fila queda como siempre.
 */
export function esVentaSinCargar(id: string, porVenta: Readonly<Record<string, VentaSinCargar>>, conPista: (id: string) => boolean): boolean {
  return porVenta[id]?.sinCargar === true && !conPista(id);
}

/**
 * Las ventas pendientes de prendas que su sede nunca cargó, juntas por sede (ajuste del 2026-10-04). En AQP casi todas las ~170
 * pendientes dan «primero cárgala» hasta que AQP cargue su catálogo: una línea por sede dice eso una vez, en vez de repetirlo en
 * cada fila (`esVentaSinCargar` decide cuáles). La sede con más ventas, primero.
 */
export function gruposSinCargar(
  pendientes: readonly { id: string; ubicacionId: string; sede: string }[],
  porVenta: Readonly<Record<string, VentaSinCargar>>,
  conPista: (id: string) => boolean,
): GrupoSinCargar[] {
  const grupos = new Map<string, GrupoSinCargar>();
  for (const f of pendientes) {
    const v = porVenta[f.id];
    if (!v || !esVentaSinCargar(f.id, porVenta, conPista)) continue;
    const g = grupos.get(f.ubicacionId) ?? { ubicacionId: f.ubicacionId, sede: f.sede, carga: v.carga, ventas: 0 };
    g.ventas++;
    grupos.set(f.ubicacionId, g);
  }
  return [...grupos.values()].sort((a, b) => b.ventas - a.ventas || a.sede.localeCompare(b.sede, "es"));
}

/** La línea de un grupo: cuántas, de qué sede y qué hacer (cargar el catálogo, o «Encontré prendas» si la carga ya se cerró). */
export function lineaSinCargar(g: Pick<GrupoSinCargar, "sede" | "carga" | "ventas">): string {
  const una = g.ventas === 1;
  const cuantas = una ? "1 venta de una prenda sin cargar" : `${g.ventas} ventas de prendas sin cargar`;
  const sede = g.sede || "esta tienda";
  if (!g.carga.abierta) {
    const cuando = g.carga.hastaCorta ? ` el ${g.carga.hastaCorta}` : "";
    return `${cuantas} en ${sede}: su carga se cerró${cuando}. ${una ? "Regístrala" : "Regístralas"} con «Encontré prendas» y después regulariza.`;
  }
  const hasta = g.carga.hastaCorta ? ` (la carga sigue abierta hasta el ${g.carga.hastaCorta})` : "";
  return `${cuantas}: carga primero el catálogo de ${sede}${hasta}.`;
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
