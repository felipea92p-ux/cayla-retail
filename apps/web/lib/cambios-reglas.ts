// Reglas puras de Cambios — sin `createClient`, cero dependencia de servidor, mismo
// patrón que `vender-reglas.ts`: los componentes de Cambios (`CambiosPanel` y sus
// piezas) son cliente y necesitan esto como VALOR.

import { diaLima, inicioDeDiaLima } from "./panel-serie";
import { parsearComprobante } from "./comprobantes-reglas";
import { soles } from "./compras-reglas";
//
// Identidad de una prenda (2026-09-16): el formulario identificaba "la prenda que se
// vendió" buscando en el catálogo la primera variante con el mismo `sku`. Las prendas
// del censo (`crear_producto_con_variantes`) nacen SIN sku, y el sku nulo viajaba como
// "" — así que con dos prendas nuevas en el catálogo, "" calzaba con la PRIMERA de
// ellas. La identidad de una prenda es su `varianteId`; el código es solo lo que se lee
// (`codigoPrenda`, que vive en `prenda-reglas.ts` porque lo usan todos los flujos de
// venta, no solo Cambios).

// ============================================================================
// Motivo del cambio y estado de la prenda que vuelve (2026-09-18,
// 20260918150000_cambios_motivo_y_estado_de_prenda.sql). Los valores son los de los
// `check` de `retail.cambios` — si se cambia uno, se cambia el otro.
// ============================================================================

export const MOTIVOS_CAMBIO = [
  { valor: "talla_chica", etiqueta: "Le quedó chica" },
  { valor: "talla_grande", etiqueta: "Le quedó grande" },
  { valor: "otro_color", etiqueta: "Prefiere otro color" },
  { valor: "defecto", etiqueta: "Tiene un defecto" },
  { valor: "otro", etiqueta: "Otro motivo" },
] as const;

export type MotivoCambio = (typeof MOTIVOS_CAMBIO)[number]["valor"];
/** vendible = vuelve al piso de venta; no_vendible = entra a cuarentena (R-39). */
export type CondicionCambio = "vendible" | "no_vendible";

/** Espejo del candado `cambios_defecto_no_vuelve_al_piso`: una prenda que se cambia
 *  por defecto nunca vuelve al piso. Con cualquier otro motivo decide quien la recibe
 *  (null = no hay nada forzado). */
export function condicionForzada(motivo: MotivoCambio | null): CondicionCambio | null {
  return motivo === "defecto" ? "no_vendible" : null;
}

export function etiquetaMotivo(motivo: MotivoCambio): string {
  return MOTIVOS_CAMBIO.find((m) => m.valor === motivo)?.etiqueta ?? motivo;
}

/** Los del `check` de `cambios.metodo_pago_diferencia`. */
export const METODOS_DIFERENCIA = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
  { valor: "yape", etiqueta: "Yape" },
  { valor: "plin", etiqueta: "Plin" },
  { valor: "transferencia", etiqueta: "Transferencia" },
] as const;
export type MetodoDiferencia = (typeof METODOS_DIFERENCIA)[number]["valor"];

// ============================================================================
// Qué escribió (o escaneó) la colaboradora en el buscador (2026-09-18). Tres
// lecturas, en este orden:
//   · "B001-10" → una boleta o factura con serie.
//   · solo dígitos → puede ser el número de una boleta ("10") o el DNI/RUC de la
//     clienta ("45879632"): se buscan los dos, no se adivina.
//   · cualquier otra cosa → la etiqueta de la prenda (exacta), o parte del nombre
//     de la clienta o de la prenda.
// ============================================================================

export type Busqueda =
  | { tipo: "comprobante"; serie: string; numero: number }
  | { tipo: "numero"; texto: string; numero: number | null }
  | { tipo: "texto"; texto: string };

/** `comprobantes.numero` es `integer`: un RUC de 11 dígitos comparado contra esa
 *  columna revienta la consulta ("out of range"), así que solo se lee como número de
 *  comprobante lo que cabe. */
const MAX_DIGITOS_NUMERO_COMPROBANTE = 9;

export function clasificarBusqueda(texto: string): Busqueda | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  if (/^\d+$/.test(limpio)) {
    return { tipo: "numero", texto: limpio, numero: limpio.length <= MAX_DIGITOS_NUMERO_COMPROBANTE ? Number(limpio) : null };
  }
  const { serie, numero } = parsearComprobante(limpio);
  if (serie && numero !== null) return { tipo: "comprobante", serie, numero };
  return { tipo: "texto", texto: limpio };
}

// ============================================================================
// Estado de una prenda vendida frente a un cambio (2026-09-18): un solo lugar
// decide qué dice su chip y si se puede iniciar el cambio, para que la lista, el
// paso "Prenda" y las validaciones nunca se contradigan.
// ============================================================================

/** Lo que dice el chip de estado de una prenda — lo comparten Cambios y Devoluciones
 *  (2026-09-18): siempre palabra, y ícono cuando ayuda; nunca solo color. */
export type EstadoVisual = {
  clave: string;
  texto: string;
  /** Tono del `Chip` del sistema: neutro casi siempre, verde = hecho, ámbar = urgencia. */
  tono: "neutro" | "ambar" | "verde" | "apagado";
  icono: "check" | "reloj" | null;
};

export type EstadoPrenda = EstadoVisual & { cambiable: boolean };

/** Cuántas unidades de una línea vendida todavía se pueden cambiar o devolver: lo
 *  comprado menos lo ya cambiado y lo ya devuelto (pendiente o aprobado). Cambios y
 *  Devoluciones se descuentan entre sí a propósito: la base solo cruza cada una contra
 *  sí misma, y una prenda cambiada que luego se devuelve —o al revés— vuelve al stock
 *  dos veces (BACKLOG, ADR-0105). */
export function unidadesDisponibles(l: { cantidad: number; yaCambiado: number; yaDevuelto: number }): number {
  return Math.max(0, l.cantidad - l.yaCambiado - l.yaDevuelto);
}

/** En este orden: una venta anulada no cuenta; una prenda ya cambiada o devuelta dice
 *  eso (más útil que "fuera de plazo"); después, el plazo. */
export function estadoPrendaVendida(
  linea: { cantidad: number; yaCambiado: number; yaDevuelto: number; anulada: boolean; creadoEn: string },
  ahora: Date
): EstadoPrenda {
  if (linea.anulada) return { clave: "anulada", texto: "Venta anulada", tono: "apagado", icono: null, cambiable: false };
  if (unidadesDisponibles(linea) <= 0) {
    return linea.yaDevuelto > linea.yaCambiado
      ? { clave: "devuelta", texto: "Devolución registrada", tono: "neutro", icono: "check", cambiable: false }
      : { clave: "completado", texto: "Cambio completado", tono: "verde", icono: "check", cambiable: false };
  }
  const { estado, diasRestantes } = estadoPlazoCambio(linea.creadoEn, ahora);
  if (estado === "fuera_de_plazo") return { clave: "fuera_de_plazo", texto: "Fuera del plazo", tono: "neutro", icono: null, cambiable: false };
  if (estado === "por_vencer") {
    const texto = diasRestantes === 0 ? "Último día para cambiar" : `Vence en ${diasRestantes} día${diasRestantes === 1 ? "" : "s"}`;
    return { clave: "por_vencer", texto, tono: "ambar", icono: "reloj", cambiable: true };
  }
  return { clave: "dentro_del_plazo", texto: "Dentro del plazo", tono: "neutro", icono: "reloj", cambiable: true };
}

// ============================================================================
// Validaciones del cambio, en el orden del recorrido real: la compra, el plazo,
// la prenda, el motivo, lo que se lleva, y la caja si hay efectivo de por medio.
// Mismo patrón que `motivoBloqueoCobro` en Vender (ADR-0044): UNA lista alimenta la
// pantalla ("✓ Compra encontrada…"), el botón y a dónde va el foco — nunca tres
// condiciones distintas que no se hablan.
//
// Cada una refleja una regla que YA existe en `registrar_cambio` (venta anulada,
// cantidad disponible, stock del piso, caja abierta para el efectivo) o en la
// pantalla (plazo R-38, motivo). Mostrarla antes solo evita que la base la rechace
// con la clienta esperando.
// ============================================================================

export type Validacion = {
  /** Qué se está revisando ("compra", "plazo", "motivo"…): de ahí sale a qué campo va
   *  el foco cuando frena. Cada flujo (Cambios, Devoluciones) tiene las suyas. */
  clave: string;
  /** `ok` ✓ · `alerta` frena (algo está mal) · `pendiente` frena (falta un dato) ·
   *  `aviso` NO frena: lo que conviene saber antes de seguir (ej. fuera de plazo en una
   *  devolución, que igual decide un líder). */
  estado: "ok" | "alerta" | "pendiente" | "aviso";
  titulo: string;
  detalle?: string;
};

export function validarCambio(e: {
  venta: { comprobante: string | null; creadoEn: string; anulada: boolean };
  ahora: Date;
  cantidadComprada: number;
  disponible: number;
  motivo: MotivoCambio | null;
  /** Talla y color ya elegidos (los que la prenda tenga). */
  eligioPrenda: boolean;
  nueva: { descripcion: string; stockAqui: number; otrasSedes: string | null } | null;
  sede: string;
  diferencia: number;
  metodo: MetodoDiferencia;
  cajaAbierta: boolean;
}): Validacion[] {
  const lista: Validacion[] = [];
  const fecha = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long" }).format(new Date(e.venta.creadoEn));

  lista.push(
    e.venta.anulada
      ? { clave: "compra", estado: "alerta", titulo: "La venta está anulada", detalle: "Sus prendas ya volvieron al stock." }
      : { clave: "compra", estado: "ok", titulo: "Compra encontrada", detalle: `${e.venta.comprobante ?? "Venta sin comprobante"} · ${fecha}` }
  );

  const plazo = estadoPlazoCambio(e.venta.creadoEn, e.ahora);
  const diasDesdeLaCompra = DIAS_PLAZO_CAMBIO - plazo.diasRestantes;
  lista.push(
    plazo.estado === "fuera_de_plazo"
      ? {
          clave: "plazo",
          estado: "alerta",
          titulo: "Fuera del plazo de cambios",
          detalle: `La compra fue hace ${diasDesdeLaCompra} días; el plazo es de ${DIAS_PLAZO_CAMBIO}.`,
        }
      : {
          clave: "plazo",
          estado: "ok",
          titulo: "Dentro del plazo de cambios",
          detalle:
            plazo.diasRestantes === 0
              ? "Hoy es el último día."
              : `Quedan ${plazo.diasRestantes} día${plazo.diasRestantes === 1 ? "" : "s"} (hasta el ${fechaLimiteCambio(e.venta.creadoEn)}).`,
        }
  );

  lista.push(
    e.disponible > 0
      ? {
          clave: "prenda",
          estado: "ok",
          titulo: "Prenda elegible",
          detalle: e.cantidadComprada > 1 ? `Quedan ${e.disponible} de ${e.cantidadComprada} por cambiar.` : undefined,
        }
      : { clave: "prenda", estado: "alerta", titulo: "Esta prenda ya se cambió" }
  );

  lista.push(
    e.motivo
      ? { clave: "motivo", estado: "ok", titulo: `Motivo: ${etiquetaMotivo(e.motivo).toLowerCase()}` }
      : { clave: "motivo", estado: "pendiente", titulo: "Falta elegir por qué la cambia" }
  );

  if (!e.eligioPrenda) lista.push({ clave: "stock", estado: "pendiente", titulo: "Falta elegir la talla y el color que se lleva" });
  else if (!e.nueva) lista.push({ clave: "stock", estado: "alerta", titulo: "Esa talla y color no existen en el catálogo" });
  else if (e.nueva.stockAqui <= 0)
    lista.push({
      clave: "stock",
      estado: "alerta",
      titulo: `No queda ${e.nueva.descripcion} en ${e.sede}`,
      detalle: e.nueva.otrasSedes ? `Hay ${e.nueva.otrasSedes}.` : "Tampoco hay en otra sede.",
    });
  else lista.push({ clave: "stock", estado: "ok", titulo: "Stock disponible", detalle: `${e.nueva.stockAqui} en el piso de ${e.sede}.` });

  // `registrar_cambio` rechaza el efectivo sin caja abierta (20260916180000): mejor
  // decirlo acá que dejar que la base lo diga con la clienta esperando.
  if (e.diferencia !== 0 && e.metodo === "efectivo") {
    lista.push(
      e.cajaAbierta
        ? { clave: "caja", estado: "ok", titulo: "Caja abierta", detalle: e.diferencia > 0 ? "La diferencia entra al cajón." : "La diferencia sale del cajón." }
        : { clave: "caja", estado: "alerta", titulo: "La caja está cerrada", detalle: "Ábrela en Caja, o cobra la diferencia con otro método." }
    );
  }
  return lista;
}

/** Lo primero que falta o que frena — lo que explica el botón y a dónde va el foco.
 *  Un `aviso` informa pero no cuenta: no frena. */
export function primerBloqueo(validaciones: readonly Validacion[]): Validacion | null {
  return validaciones.find((v) => v.estado === "alerta" || v.estado === "pendiente") ?? null;
}

// ============================================================================
// Impacto del cambio, dicho antes de confirmarlo. Sale de lo que `registrar_cambio`
// hace de verdad: una entrada de la prenda devuelta (al piso, o a cuarentena si no
// es vendible) y una salida de la nueva del piso; y la diferencia × cantidad, que
// solo mueve el cajón si es en efectivo (ADR-0053).
// ============================================================================

export type ImpactoOperacion = {
  inventario: { signo: "+" | "−"; cantidad: number; prenda: string; donde: string }[];
  caja: { titulo: string; detalle: string };
  /** Un papel que se emite por el camino (Devoluciones: la nota de crédito). */
  documento?: { titulo: string; detalle: string };
};

export function impactoCambio(e: {
  devuelta: string;
  entregada: string;
  cantidad: number;
  condicion: CondicionCambio;
  diferencia: number;
  metodo: MetodoDiferencia;
  sede: string;
}): ImpactoOperacion {
  // En medio de una frase: "con tarjeta", pero "con Yape" — las marcas no se achican.
  const etiqueta = METODOS_DIFERENCIA.find((m) => m.valor === e.metodo)?.etiqueta ?? e.metodo;
  const metodo = e.metodo === "yape" || e.metodo === "plin" ? etiqueta : etiqueta.toLowerCase();
  const enEfectivo = e.metodo === "efectivo";
  const caja =
    e.diferencia === 0
      ? { titulo: "Sin diferencia de precio", detalle: "La caja no se mueve." }
      : e.diferencia > 0
        ? {
            titulo: `+ ${soles(e.diferencia)} por cobrar`,
            detalle: enEfectivo ? "En efectivo: entra al cajón y se suma al cierre de caja." : `Con ${metodo}: no pasa por el cajón.`,
          }
        : {
            titulo: `− ${soles(-e.diferencia)} a devolver`,
            detalle: enEfectivo ? "En efectivo: sale del cajón y se resta al cierre de caja." : `Por ${metodo}: no pasa por el cajón.`,
          };
  return {
    inventario: [
      {
        signo: "+",
        cantidad: e.cantidad,
        prenda: e.devuelta,
        donde: e.condicion === "vendible" ? `vuelve al piso de ${e.sede}` : `entra a cuarentena en ${e.sede}`,
      },
      { signo: "−", cantidad: e.cantidad, prenda: e.entregada, donde: `sale del piso de ${e.sede}` },
    ],
    caja,
  };
}

/** "Negro · Talla 30" — un solo formato para toda la pantalla, el color primero: es lo
 *  que se ve de lejos en la prenda. */
export function varianteLegible(v: { talla: string | null; color: string | null }): string {
  return [v.color, v.talla && `Talla ${v.talla}`].filter(Boolean).join(" · ");
}

/** Lo que se le entregó a la clienta, dicho corto: "Negro · Talla L" si es la misma
 *  prenda en otra talla o color, "Vestido Sofía · Negro · Talla M" si se llevó otra. */
export function descripcionEntregada(
  entregada: { productoId: string; referencia: string; talla: string | null; color: string | null },
  productoVendidoId: string
): string {
  const variante = varianteLegible(entregada);
  return entregada.productoId === productoVendidoId ? variante : [entregada.referencia, variante].filter(Boolean).join(" · ");
}

// ============================================================================
// Plazo de cambio (rediseño visual, 2026-09-18)
//
// `docs/datos/15-COMO-OPERA-CAYLA.md` R-38: "El plazo es de 15 días y lo aplica
// cualquiera en caja" — hoy es una regla escrita, no un dato: no hay columna ni
// tabla de política de cambio por sede (auditado antes de construir esto: ni
// `retail.ubicaciones` ni ninguna otra tabla la modela). Con el ok de Felipe
// (protocolo de pregunta, 2026-09-18): constantes documentadas acá, iguales para
// toda la empresa — no hay evidencia hoy de que el plazo varíe por sede, y una
// columna+migración+pantalla de configuración para un valor que nunca cambió
// sería construir para un volumen que no ha llegado (principio 5 del rol). Si
// algún día CAYLA necesita un plazo distinto por sede, este es el lugar a tocar.
// ============================================================================

/** R-38. */
export const DIAS_PLAZO_CAMBIO = 15;
/** A cuántos días de vencer el plazo el aviso pasa a ámbar. */
export const DIAS_UMBRAL_POR_VENCER = 3;

export type EstadoPlazoCambio = "vigente" | "por_vencer" | "fuera_de_plazo";

/** En qué punto del plazo de cambio está una venta, medido en días calendario
 *  completos desde que se vendió (no horas — una venta de ayer a las 11pm no debe
 *  leerse como "hoy mismo" solo por estar a pocas horas). */
export function estadoPlazoCambio(vendidoEn: string, ahora: Date): { estado: EstadoPlazoCambio; diasRestantes: number } {
  const diasTranscurridos = diaLima(ahora.getTime()) - diaLima(new Date(vendidoEn).getTime());
  const diasRestantes = DIAS_PLAZO_CAMBIO - diasTranscurridos;
  if (diasRestantes < 0) return { estado: "fuera_de_plazo", diasRestantes };
  if (diasRestantes <= DIAS_UMBRAL_POR_VENCER) return { estado: "por_vencer", diasRestantes };
  return { estado: "vigente", diasRestantes };
}

/** "3 de octubre": el último día en que se puede cambiar lo vendido en `vendidoEn` —
 *  el día de la venta más `DIAS_PLAZO_CAMBIO`, contado igual que `estadoPlazoCambio`. */
export function fechaLimiteCambio(vendidoEn: string): string {
  const ultimoDia = diaLima(new Date(vendidoEn).getTime()) + DIAS_PLAZO_CAMBIO;
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long" }).format(inicioDeDiaLima(ultimoDia));
}

// ============================================================================
// Agrupado de la lista de Cambios: por día ("Hoy" / "Ayer" / fecha) y, dentro de
// cada día, por compra — la clienta trae UNA boleta, no cuatro prendas sueltas
// (2026-09-18).
// ============================================================================

/** "Hoy" / "Ayer" / "16 de septiembre" — nunca el año: la lista solo muestra
 *  ventas recientes, un año de diferencia no es un caso real acá. */
export function etiquetaDia(vendidoEn: string, ahora: Date): string {
  const diasAtras = diaLima(ahora.getTime()) - diaLima(new Date(vendidoEn).getTime());
  if (diasAtras === 0) return "Hoy";
  if (diasAtras === 1) return "Ayer";
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long" }).format(new Date(vendidoEn));
}

/** Agrupa manteniendo el orden de llegada — un Map conserva el orden de inserción
 *  de sus claves, así que "Hoy" sale antes que "Ayer" sin ordenar nada aparte. */
function agruparEnOrden<T>(items: readonly T[], clave: (item: T) => string): [string, T[]][] {
  const grupos = new Map<string, T[]>();
  for (const item of items) {
    const k = clave(item);
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(item);
  }
  return Array.from(grupos);
}

export function agruparPorDia<T extends { creadoEn: string }>(lineas: readonly T[], ahora: Date): { etiqueta: string; lineas: T[] }[] {
  return agruparEnOrden(lineas, (l) => etiquetaDia(l.creadoEn, ahora)).map(([etiqueta, lineas]) => ({ etiqueta, lineas }));
}

export function agruparPorCompra<T extends { ventaId: string }>(lineas: readonly T[]): { ventaId: string; lineas: T[] }[] {
  return agruparEnOrden(lineas, (l) => l.ventaId).map(([ventaId, lineas]) => ({ ventaId, lineas }));
}

// ============================================================================
// Tallas que no calzan (2026-09-18): reemplaza a "Prenda más cambiada", que con
// 1 cambio de 1 no decía nada. La dirección talla vendida → talla entregada ya
// estaba en la base (`venta_items.variante_id` → `cambios.variante_nueva_id`).
// ============================================================================

export type CambioParaTallas = {
  referencia: string;
  productoVendidoId: string;
  productoEntregadoId: string;
  tallaVendida: string | null;
  tallaEntregada: string | null;
  cantidad: number;
};

export type TallaQueNoCalza = { referencia: string; de: string; a: string; prendas: number };

/** Un caso suelto es una clienta; tres de la misma prenda en la misma dirección ya
 *  empiezan a hablar de la horma. */
export const MINIMO_TALLAS_QUE_NO_CALZAN = 3;

/** Cambios de la MISMA prenda a otra talla, sumados por dirección (M → L), solo los
 *  que llegan al mínimo. Un cambio a otra prenda o al mismo talle no dice nada de la
 *  horma y no cuenta. */
export function tallasQueNoCalzan(cambios: readonly CambioParaTallas[], minimo = MINIMO_TALLAS_QUE_NO_CALZAN): TallaQueNoCalza[] {
  const porDireccion = new Map<string, TallaQueNoCalza>();
  for (const c of cambios) {
    if (c.productoVendidoId !== c.productoEntregadoId || !c.tallaVendida || !c.tallaEntregada || c.tallaVendida === c.tallaEntregada) continue;
    const k = `${c.productoVendidoId}|${c.tallaVendida}|${c.tallaEntregada}`;
    const actual = porDireccion.get(k) ?? { referencia: c.referencia, de: c.tallaVendida, a: c.tallaEntregada, prendas: 0 };
    actual.prendas += c.cantidad;
    porDireccion.set(k, actual);
  }
  return [...porDireccion.values()]
    .filter((t) => t.prendas >= minimo)
    .sort((a, b) => b.prendas - a.prendas || a.referencia.localeCompare(b.referencia, "es"));
}
