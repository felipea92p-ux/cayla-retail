// Reglas de la cola «Por regularizar» (ADR-0179): prendas vendidas en caja antes de estar en el
// sistema, que almacén une después con su prenda real. Lógica pura: la usan la pestaña de Recibir
// y el aviso del inicio.
import { diaLima, hoyLima } from "./fechas-lima";
import { clave } from "./buscar-prenda-v2";
import { cargaAbierta, fechaCorta, type CargaInicialSede } from "./carga-inicial-reglas";

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
    } else if (f.estado === "regularizada" && f.diferencia !== null && diaLima(f.vendidoEn)?.slice(0, 7) === mes) {
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

// ---- Lo que la base va a rechazar al guardar, dicho ANTES del botón (ADR-0328 act. 5, 20261004204000) ----
// Rescatado de #788 el 2026-10-12 sobre la mesa de ADR-0360 (revisión adversarial de #975): la regla vive en `regularizar_prenda`, en
// producción desde el 2026-10-05; esto solo la dice antes, con las MISMAS frases, para que nadie haga todo el trabajo (elegir la prenda,
// contestar, firmar) y recién al tocar «Regularizar» se entere de que no se podía. Solo avisa: el botón y la guía de foco no cambian, y si
// esto y la base no coinciden, manda la base.

/** La frase de la base (`regularizar_prenda`, 42501, hint `regularizar_propia_venta`) cuando firma quien vendió. */
export const NO_SU_PROPIA_VENTA = "Quien vendió esta prenda no puede regularizarla: que lo haga otra persona del equipo o un líder.";
/** Cuando la venta es de la persona de la cuenta (y no es líder): elegir a otra en el combo no la vuelve ajena. */
export const TU_PROPIA_VENTA = "Tú vendiste esta prenda: la regulariza otra persona del equipo desde su cuenta o desde la terminal, o un líder.";

/**
 * Nadie regulariza su propia venta, salvo el líder firmando él mismo (Felipe 2026-10-04). Espejo de la regla de `regularizar_prenda`:
 *   · una venta sin quién la vendió registrado no tiene con quién compararse: pasa;
 *   · la cuenta es de quien vendió y no es de líder → no (con su propia cuenta, nombrar a otra persona no vuelve ajena la venta);
 *   · firma quien vendió → no, salvo el líder firmando ÉL MISMO: cuenta de líder y el elegido es la persona de la cuenta. Con la sesión de
 *     una líder abierta en caja, elegir a la asesora que vendió no le presta la excepción.
 * `null` = nada que decir.
 */
export function motivoPropiaVenta(p: { vendidoPorId: string | null; responsableId: string | null; personaSesionId: string | null; esLider: boolean }): string | null {
  const { vendidoPorId: vendio, responsableId: firma, personaSesionId: cuenta, esLider } = p;
  if (!vendio) return null;
  if (vendio === cuenta && !esLider) return TU_PROPIA_VENTA;
  if (vendio === firma && !(esLider && firma === cuenta)) return NO_SU_PROPIA_VENTA;
  return null;
}

/** La carga inicial de la sede tal como la base la dice en su frase (`fn_carga_inicial_de_sede`): abierta o no, y su último día ya
 *  corto («15-oct»; `null` = sin fecha). Donde se recibe `null` en vez de esto, no se sabe: la frase no afirma nada de la carga. */
export type CargaDeLaSede = { abierta: boolean; hastaCorta: string | null };

/** La carga de una sede leída con `fn_carga_inicial_sedes` (`lib/carga-inicial-reglas.ts`), en la forma de la frase de la base. */
export function cargaParaLaFrase(c: CargaInicialSede | null): CargaDeLaSede | null {
  return c ? { abierta: cargaAbierta(c), hastaCorta: c.hasta ? fechaCorta(c.hasta) : null } : null;
}

/**
 * La frase con que la base rechaza una prenda SIN ningún movimiento en la sede de la venta (`fn_exigir_prenda_cargada_en_sede`, hints
 * `prenda_sin_cargar_en_sede` y `prenda_sin_cargar_carga_cerrada`): regularizarla le cerraría su carga inicial. La salida depende de la
 * carga de ESA sede: abierta → primero su stock inicial; cerrada → «Encontré prendas». Sin saber la carga, la frase que no dice nada de
 * ella. Son las de la base al carácter: `por-regularizar-reglas.test.ts` las arma desde el texto de la migración y las compara.
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

/** La nota de la mesa (ADR-0360) para una prenda sin unidades libres que SÍ entró alguna vez a la tienda: con 0 libres, «Perdió la
 *  etiqueta» no tiene de dónde descontar (la base lo rechaza); «Llegó nueva» sí pasa. */
export const SIN_UNIDADES_LIBRES = "Hoy no tiene unidades libres en esta tienda. Si nunca se contó en un lote, elige «Llegó nueva».";

/**
 * La nota en ámbar bajo la balanza del puente, según la prenda elegida:
 *   · `cargada === false` (`fn_prenda_cargada_en_sede`: ningún movimiento en la sede) → la frase de la base (`prendaSinCargar`): ahí no
 *     pasa ninguna respuesta, tampoco «Llegó nueva» (antes la nota mandaba justo ahí);
 *   · sin unidades libres y la lectura todavía no volvió (`undefined`) → nada, para no decir una cosa y corregirla al instante;
 *   · sin unidades libres, cargada o sin poder leerlo (`null`) → `SIN_UNIDADES_LIBRES`, como antes;
 *   · con unidades libres → nada.
 */
export function notaSinUnidades(o: { disponible: number | null; cargada: boolean | null | undefined; sede: string; carga: CargaDeLaSede | null }): string | null {
  if (o.cargada === false) return prendaSinCargar(o.sede, o.carga);
  if (o.disponible !== 0 || o.cargada === undefined) return null;
  return SIN_UNIDADES_LIBRES;
}
