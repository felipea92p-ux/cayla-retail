// Registrar el comprobante de una orden de compra (ADR-0362, fase 2 · actividades 4 a 8): la lógica pura de la pantalla. Sin React ni
// red: se importa desde el cliente y se prueba sola (`comprobante-orden-reglas.test.ts`).
//
//   PROMETE: precargar el papel con lo que la orden todavía no tiene en papel (lo pendiente de cada línea y su costo neto por unidad);
//   cuadrar los centavos partiendo una línea en dos renglones cuando el costo redondeado no suma lo pedido; calcular subtotal, IGV
//   y total como los calcula `registrar_comprobante_orden`; decir qué le falta al papel con las MISMAS reglas que esa función (de aquí
//   sale la guía de foco: si la base rechaza algo que esto dejaba pasar, la prueba lo atrapa); armar lo que viaja a la base; y leer lo
//   que vuelve (el documento, el saldo y los avisos de «de más», que no bloquean).
//   NO HACE: no habla con la base ni decide permisos (el módulo «Órdenes de compra» y quién firma los decide la función).
//
// El contrato con la base: docs/compras/ordenes-de-compra-2026-10/contrato-comprobante-de-orden.md.
//
// Los montos se calculan en CÉNTIMOS enteros (como la base los guarda con `numeric(12, 2)`) y viajan como número con a lo más dos
// decimales: un `cantidad × costo` en coma flotante sumaría centavos que el papel no tiene.

import type { CampoDeGuia } from "./guia-campos";
import { aTexto, leerNumero, textoParaBase, TOPES } from "./orden-compra-alta";
import { METODO_SALDO_A_FAVOR, soles } from "./compras-reglas";
import { sumarDias } from "./fechas-lima";
import type { Vinculo } from "./marcas";
import type { DatosPagoProveedor } from "./proveedores-reglas";
import type { DetalleOrden, LineaDetalle } from "./ordenes-compra-reglas";

export type TipoComprobante = "boleta" | "nota_venta" | "factura" | "sin_comprobante";
export type CondicionComprobante = "credito" | "contado";

/** En el orden que lo pide la pantalla (Boleta | Nota de venta | Factura | Sin comprobante). «Sin comprobante» (decisión 50, Felipe
 *  2026-10-12: «Debe existir 4 tipos de comprobantes»): el proveedor no dio ningún papel; la base le pone un número interno, SC-000001. */
export const TIPOS_COMPROBANTE: readonly { valor: TipoComprobante; texto: string }[] = [
  { valor: "boleta", texto: "Boleta" },
  { valor: "nota_venta", texto: "Nota de venta" },
  { valor: "factura", texto: "Factura" },
  { valor: "sin_comprobante", texto: "Sin comprobante" },
];

export const textoDeTipo = (tipo: TipoComprobante | ""): string => TIPOS_COMPROBANTE.find((t) => t.valor === tipo)?.texto ?? "Comprobante";

/** Solo la factura discrimina IGV; en boleta y nota de venta el costo del papel ya es el costo y el IGV va en cero (sin comprobante,
 *  igual: no hay papel que dé crédito fiscal). */
export const discriminaIgv = (tipo: TipoComprobante | ""): boolean => tipo === "factura";

/** Boleta, nota de venta y factura traen su serie y su número; sin comprobante no hay papel que copiar: la base pone el número interno. */
export const pidePapel = (tipo: TipoComprobante | ""): boolean => tipo !== "sin_comprobante";

/** Las palabras de la pantalla según el tipo: sin comprobante no hay «papel» que copiar, hay una compra (ley 4: decir lo que es). */
export function palabrasDelTipo(tipo: TipoComprobante | ""): {
  total: string;
  seccion: string;
  copia: string;
  emision: string;
  /** Por qué el interruptor del IGV está apagado (null en una factura, que sí lo usa). */
  sinIgv: string | null;
  vacio: string;
  vacioConOrden: string;
  sinPoner: string;
  poner: string;
  boton: string;
} {
  const papel = pidePapel(tipo);
  return {
    total: papel ? "Total del papel" : "Total de la compra",
    seccion: papel ? "Lo que dice el papel" : "Lo que compraste",
    copia: papel ? "Copia el papel tal como llegó" : "Pon lo que compraste",
    emision: papel ? "Fecha de emisión" : "Fecha de la compra",
    vacio: papel ? "Agrega lo que trae el papel para poder registrarlo." : "Agrega lo que compraste para poder registrarlo.",
    vacioConOrden: papel
      ? "Pon lo que trae el papel: elige de la orden aquí abajo, o agrega algo que no estaba."
      : "Pon lo que compraste: elige de la orden aquí abajo, o agrega algo que no estaba.",
    sinPoner: papel ? "De la orden, sin poner en este papel" : "De la orden, sin poner en esta compra",
    poner: papel ? "Poner en el papel" : "Poner en la compra",
    boton: papel ? "Registrar comprobante" : "Registrar sin comprobante",
    sinIgv: discriminaIgv(tipo)
      ? null
      : papel
        ? `Una ${textoDeTipo(tipo).toLowerCase()} no lleva IGV aparte: el costo del papel es el costo.`
        : "Sin comprobante no hay IGV: lo que pagaste es el costo.",
  };
}

/** El título del aviso al registrar: «B001-123 registrado», o «Compra sin comprobante SC-000001 registrada». */
export function tituloDeRegistro(tipo: TipoComprobante | "", documento: string): string {
  return pidePapel(tipo) ? `${documento} registrado` : `Compra sin comprobante ${documento} registrada`;
}

export const IGV_PORCENTAJE = 18;

/** Si el proveedor no tiene plazo de crédito en su ficha, el vencimiento se sugiere a 30 días (lo mismo que Facturas de proveedor). */
export const PLAZO_POR_DEFECTO_DIAS = 30;

/** Lo que la pantalla deja escribir. Serie y número igual que Facturas de proveedor; el resto, los topes de la orden. */
export const TOPES_COMPROBANTE = { lineas: 100, serie: 8, numero: 12, nota: 500 } as const;

/** Lo que «Registrar comprobante» sabe del proveedor de la orden: su plazo (para sugerir el vencimiento), cómo se le paga (para decir a
 *  dónde va la plata) y cuánto le debe a CAYLA (el saldo a favor se puede usar como medio de pago al contado). */
export type ProveedorDelComprobante = {
  plazoCreditoDias: number | null;
  datosPago: DatosPagoProveedor;
  saldoFavor: number;
};

/** Lo que el servidor le entrega a la pantalla además de la orden: las categorías y marcas activas (para «Algo que no estaba en la orden»)
 *  y la ficha de pago del proveedor. */
export type DatosDelComprobante = {
  categorias: { id: string; nombre: string; prefijo: string | null; familia: string | null }[];
  marcas: { id: string; nombre: string }[];
  /** Qué marca trae cada proveedor, para poner sola la única marca del proveedor en una prenda nueva. */
  vinculos: Vinculo[];
  /** `null` = no se pudo leer su ficha: el vencimiento se sugiere a 30 días y el pago no dice a dónde va la plata. */
  proveedor: ProveedorDelComprobante | null;
  /** Por qué no se pudieron leer las categorías o las marcas (sin ellas no se puede agregar algo fuera de la orden). */
  fallaListas: string | null;
};

/** Qué decir cuando se corta la señal al registrar. El pedido pudo llegar a la base y perderse solo la respuesta: reintentar sin cambiar
 *  nada es seguro (el mismo token con los mismos datos devuelve el mismo comprobante, sin repetir nada). */
export const AVISO_DE_CORTE_COMPROBANTE =
  "Se cortó la conexión y no sabemos si el comprobante llegó a registrarse. Vuelve a pulsar «Registrar comprobante» sin cambiar nada: si ya se registró, no se repite.";

/** Lo que la base contesta cuando el mismo envío se repite con otros datos (la pantalla ofrece «Recargar»). */
export function esEnvioConOtrosDatos(mensaje: string | null | undefined): boolean {
  return !!mensaje && /ya se guard[óo] con otros datos/i.test(mensaje);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Sugerencias coherentes (ADR-0290): el ejemplo de la serie sigue al tipo de papel que se eligió
// ---------------------------------------------------------------------------------------------------------------------------------

/** La serie de ejemplo según el tipo: «F001» en una factura, «B001» en una boleta. Una nota de venta no tiene serie de SUNAT: un ejemplo
 *  neutro, solo cifras. Sin tipo, no promete nada. */
export function sugerirSerie(tipo: TipoComprobante | ""): string {
  switch (tipo) {
    case "factura":
      return "F001";
    case "boleta":
      return "B001";
    case "nota_venta":
      return "0001";
    default:
      return "Serie";
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// El papel, renglón por renglón
// ---------------------------------------------------------------------------------------------------------------------------------

/** Un renglón del papel. Con `ordenItemId` responde a una línea pedida (su categoría y marca son las de la orden y no se tocan); sin él
 *  es «algo que no estaba en la orden» y trae su propia categoría y marca. Los números se escriben como texto, igual que en la orden. */
export type LineaComprobante = {
  /** Estable para React mientras dura el formulario; no es un id de la base. */
  clave: string;
  ordenItemId: string | null;
  categoriaId: string;
  marcaId: string;
  descripcion: string;
  cantidad: string;
  /** Costo por unidad, SIN IGV, con hasta dos decimales. */
  costo: string;
  /** Precio de venta sugerido (opcional): lo que pensamos cobrar por la prenda. */
  precioVenta: string;
};

/** El pago de un comprobante al contado: lo mismo que cada línea de `LineasPago`. */
export type PagoBorrador = { monto: string; metodo: string; referencia: string; cuentaId?: string };

/** Todo lo que la pantalla le llena a la función. `tipo` y `condicion` vacíos = todavía sin elegir. */
export type BorradorComprobante = {
  tipo: TipoComprobante | "";
  serie: string;
  numero: string;
  /** `aaaa-mm-dd`. */
  emision: string;
  condicion: CondicionComprobante | "";
  /** El vencimiento que corre ahora (el sugerido si la persona no lo escribió). Solo cuenta al crédito. */
  vencimiento: string;
  /** Solo se mira en una factura. */
  sumaIgv: boolean;
  /** El total que dice el papel (opcional, solo factura con IGV): cuadra el redondeo del IGV por centavos. */
  totalDelPapel: string;
  lineas: LineaComprobante[];
  pagos: PagoBorrador[];
  nota: string;
};

/** Lo que la pantalla sabe y el borrador no: qué categorías y marcas siguen activas y cuáles son las líneas de ESTA orden. */
export type ContextoComprobante = {
  hoy: string;
  categoriasActivas: ReadonlySet<string>;
  marcasActivas: ReadonlySet<string>;
  lineasDeLaOrden: ReadonlySet<string>;
};

// ---------------------------------------------------------------------------------------------------------------------------------
// Precarga y centavos
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo que de una línea pedida falta por llegar en papel. Si la base no dice cuánto, lo pedido menos lo ya facturado (o todo). */
export function pendienteDe(l: Pick<LineaDetalle, "cantidad" | "facturado" | "pendiente">): number {
  return Math.max(0, l.pendiente ?? l.cantidad - (l.facturado ?? 0));
}

/** El subtotal NETO de la línea pedida en céntimos: cantidad × precio − descuento, tal como la orden lo guardó. */
export function subtotalNetoCentimos(l: Pick<LineaDetalle, "subtotal">): number {
  return Math.round(l.subtotal * 100);
}

/** El costo neto por unidad de una línea pedida en céntimos: (precio × cantidad − descuento) / cantidad, a dos decimales. */
export function costoNetoCentimos(l: Pick<LineaDetalle, "cantidad" | "subtotal">): number {
  return l.cantidad > 0 ? Math.round(subtotalNetoCentimos(l) / l.cantidad) : 0;
}

export type RenglonPrecargado = { cantidad: number; costoCentimos: number };

/**
 * Parte `cantidad` unidades que valen `totalCentimos` en a lo sumo DOS renglones de centavos enteros que suman exactamente el total.
 * 3 unidades que valen S/ 29.00 no se pueden escribir como 3 × un mismo costo (3 × 9.67 = 29.01): son 2 × 9.67 + 1 × 9.66. Siempre
 * alcanzan dos renglones porque el resto de dividir el total entre la cantidad es menor que la cantidad: esas unidades cuestan un
 * centavo más y las demás, el costo de abajo. Va primero el renglón de más unidades (el costo redondeado al más cercano).
 */
export function cuadrarCentavos(cantidad: number, totalCentimos: number): RenglonPrecargado[] {
  if (!Number.isInteger(cantidad) || cantidad < 1 || !Number.isInteger(totalCentimos) || totalCentimos < 0) return [];
  const base = Math.floor(totalCentimos / cantidad);
  const resto = totalCentimos - base * cantidad;
  if (resto === 0) return [{ cantidad, costoCentimos: base }];
  const caros: RenglonPrecargado = { cantidad: resto, costoCentimos: base + 1 };
  const baratos: RenglonPrecargado = { cantidad: cantidad - resto, costoCentimos: base };
  return resto * 2 >= cantidad ? [caros, baratos] : [baratos, caros];
}

/**
 * Los renglones con que se precarga UNA línea pedida. Con todo por llegar en papel (nada se facturó antes) los centavos se cuadran
 * contra el subtotal neto de la orden. Con una parte ya facturada queda un solo renglón con el costo redondeado: de los comprobantes
 * anteriores solo se sabe cuántas unidades traían, no sus centavos. Sin nada pendiente (ya llegó todo), un renglón con el costo y la
 * cantidad vacía, para que se escriba lo que de verdad dice el papel.
 */
export function renglonesDePedida(l: Pick<LineaDetalle, "cantidad" | "subtotal" | "facturado" | "pendiente">): RenglonPrecargado[] {
  const pendiente = pendienteDe(l);
  if (pendiente <= 0) return [{ cantidad: 0, costoCentimos: costoNetoCentimos(l) }];
  if (pendiente === l.cantidad) return cuadrarCentavos(l.cantidad, subtotalNetoCentimos(l));
  return [{ cantidad: pendiente, costoCentimos: costoNetoCentimos(l) }];
}

/** Los renglones del papel para una línea pedida, listos para el formulario. `siguienteClave` da la clave de cada uno. */
export function lineasDePedida(l: LineaDetalle, siguienteClave: () => string): LineaComprobante[] {
  if (l.id === null) return [];
  return renglonesDePedida(l).map((r) => ({
    clave: siguienteClave(),
    ordenItemId: l.id,
    categoriaId: l.categoriaId,
    marcaId: l.marcaId,
    descripcion: l.descripcion ?? "",
    cantidad: r.cantidad > 0 ? String(r.cantidad) : "",
    costo: aTexto(r.costoCentimos, 2),
    precioVenta: "",
  }));
}

/** El papel de arranque: cada línea pedida con algo pendiente, con su cantidad pendiente y su costo neto. Lo ya facturado no se vuelve a
 *  poner (se agrega a mano con «Poner»). */
export function precargarLineas(orden: Pick<DetalleOrden, "lineas">, siguienteClave: () => string): LineaComprobante[] {
  return orden.lineas.filter((l) => l.id !== null && pendienteDe(l) > 0).flatMap((l) => lineasDePedida(l, siguienteClave));
}

/** Las líneas pedidas que hoy no tienen ningún renglón en el papel (quitadas a propósito, o ya llegadas del todo): se ofrecen para poner. */
export function pedidasSinRenglon(orden: Pick<DetalleOrden, "lineas">, lineas: readonly LineaComprobante[]): LineaDetalle[] {
  const puestas = new Set(lineas.map((l) => l.ordenItemId).filter((id): id is string => id !== null));
  return orden.lineas.filter((l) => l.id !== null && !puestas.has(l.id));
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Leer y calcular (céntimos exactos)
// ---------------------------------------------------------------------------------------------------------------------------------

export type CalculoRenglon = {
  cantidad: number | null;
  costoCentimos: number | null;
  /** cantidad × costo, o null si falta alguno de los dos. */
  subtotalCentimos: number | null;
};

export function calcularRenglon(l: Pick<LineaComprobante, "cantidad" | "costo">): CalculoRenglon {
  const cant = leerNumero(l.cantidad, 0);
  const costo = leerNumero(l.costo, 2);
  const cantidad = cant.tipo === "ok" ? cant.escalado : null;
  const costoCentimos = costo.tipo === "ok" ? costo.escalado : null;
  return { cantidad, costoCentimos, subtotalCentimos: cantidad != null && costoCentimos != null ? cantidad * costoCentimos : null };
}

export function unidadesDelPapel(lineas: readonly LineaComprobante[]): number {
  return lineas.reduce((acc, l) => acc + (calcularRenglon(l).cantidad ?? 0), 0);
}

export type TotalesComprobante = {
  subtotalCentimos: number;
  igvCentimos: number;
  totalCentimos: number;
  /** ¿El total que manda es el que escribió la persona (el del papel) y no el calculado? */
  usaTotalDelPapel: boolean;
  /** Por qué el total del papel que se escribió no sirve, o null. */
  problemaTotalDelPapel: string | null;
};

/** El IGV de una factura: `round(subtotal × 18 %, 2)`, con la mitad hacia arriba como el `round` de la base. */
export function igvDeCentimos(subtotalCentimos: number): number {
  return Math.floor((subtotalCentimos * IGV_PORCENTAJE + 50) / 100);
}

/**
 * Lo que el total del papel puede alejarse del calculado y la base todavía lo acepta, en DÉCIMAS de céntimo (para comparar con enteros):
 * un centavo por renglón, más uno por el IGV y el papel, más 0.006 por unidad (lo que mueve el redondeo de un costo a dos decimales
 * agrandado por el IGV). Es la tolerancia de `registrar_comprobante_orden` (la de `registrar_compra`, A1 ADR-0135).
 */
export const toleranciaDelTotalDecimas = (renglones: number, unidades: number): number => (renglones + 1) * 10 + 6 * unidades;

/**
 * Subtotal, IGV y total tal como los guarda `registrar_comprobante_orden`: los costos son SIN IGV; en una factura con «Sumar IGV» se
 * suma el 18 % del subtotal; en boleta, nota de venta o factura sin IGV el total es exactamente el subtotal. Si en una factura con IGV
 * se escribió el total del papel, dentro de la tolerancia y sin bajar del subtotal, ese total manda y el IGV es la diferencia (el
 * redondeo lo absorbe el IGV, nunca el total: el papel dice lo que dice).
 */
export function totalesComprobante(
  lineas: readonly LineaComprobante[],
  { tipo, sumaIgv, totalDelPapel = "" }: { tipo: TipoComprobante | ""; sumaIgv: boolean; totalDelPapel?: string },
): TotalesComprobante {
  const subtotalCentimos = lineas.reduce((acc, l) => acc + (calcularRenglon(l).subtotalCentimos ?? 0), 0);
  const conIgv = discriminaIgv(tipo) && sumaIgv;
  const igvCalculado = conIgv ? igvDeCentimos(subtotalCentimos) : 0;
  const calculado: TotalesComprobante = {
    subtotalCentimos,
    igvCentimos: igvCalculado,
    totalCentimos: subtotalCentimos + igvCalculado,
    usaTotalDelPapel: false,
    problemaTotalDelPapel: null,
  };
  if (!conIgv || totalDelPapel.trim() === "") return calculado;
  const escrito = leerNumero(totalDelPapel, 2);
  if (escrito.tipo !== "ok") {
    return { ...calculado, problemaTotalDelPapel: "El total del papel va en soles, con hasta dos decimales." };
  }
  const unidades = lineas.reduce((acc, l) => acc + (calcularRenglon(l).cantidad ?? 0), 0);
  if (escrito.escalado < subtotalCentimos || Math.abs(escrito.escalado - calculado.totalCentimos) * 10 > toleranciaDelTotalDecimas(lineas.length, unidades)) {
    return {
      ...calculado,
      problemaTotalDelPapel: `El total del papel (${soles(escrito.escalado / 100)}) no cuadra con las líneas (${soles(calculado.totalCentimos / 100)}): revisa los costos.`,
    };
  }
  if (escrito.escalado === calculado.totalCentimos) return calculado;
  return { ...calculado, igvCentimos: escrito.escalado - subtotalCentimos, totalCentimos: escrito.escalado, usaTotalDelPapel: true };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Qué le falta (las reglas de `registrar_comprobante_orden`, dichas para quien llena)
// ---------------------------------------------------------------------------------------------------------------------------------

const limpio = (texto: string) => texto.replace(/\s+/g, "").replace(/^s\//i, "");

/** Miles escritos con punto («1.500»): no se adivina, se dice cómo escribir lo que se quiso (igual que en la orden). */
function dudaDeCantidad(texto: string): string {
  const t = limpio(texto);
  return `¿«${t}» son ${t.replace(".", "")}? Escribe la cantidad sin punto: ${t.replace(".", "")}.`;
}
function dudaDeMonto(texto: string): string {
  const t = limpio(texto);
  return `¿«${t}» es S/ ${t.replace(".", "")} o S/ ${t.slice(0, -1)}? Escríbelo sin punto (${t.replace(".", "")}) o con dos decimales (${t.slice(0, -1)}).`;
}

/** El primer problema de un renglón, en una frase para quien lo llena; null si está listo. */
export function problemaDeLinea(l: LineaComprobante, ctx: ContextoComprobante): string | null {
  if (l.ordenItemId !== null) {
    if (!ctx.lineasDeLaOrden.has(l.ordenItemId)) return "Este renglón no es de esta orden: quítalo y vuelve a ponerlo.";
  } else {
    if (!l.categoriaId || !ctx.categoriasActivas.has(l.categoriaId)) return "Elige la categoría.";
    if (!l.marcaId || !ctx.marcasActivas.has(l.marcaId)) return "Elige la marca.";
    if (l.descripcion.trim().length > TOPES.descripcion) return `La descripción va hasta ${TOPES.descripcion} letras.`;
  }
  const cant = leerNumero(l.cantidad, 0);
  if (cant.tipo === "vacio") return "Escribe la cantidad.";
  if (cant.tipo === "mal" && cant.motivo === "ambiguo") return dudaDeCantidad(l.cantidad);
  if (cant.tipo === "mal" || cant.escalado < 1 || cant.escalado > TOPES.cantidad) return "La cantidad va de 1 a 99 999 unidades, sin decimales.";
  const costo = leerNumero(l.costo, 2);
  if (costo.tipo === "vacio") return "Escribe el costo por unidad (0 si no tuvo costo).";
  if (costo.tipo === "mal" && costo.motivo === "ambiguo") return dudaDeMonto(l.costo);
  if (costo.tipo === "mal" || costo.escalado > TOPES.precioCentimos) return "El costo va de S/ 0 a S/ 99 999.99, con hasta dos decimales.";
  const venta = leerNumero(l.precioVenta, 2);
  if (venta.tipo === "mal" && venta.motivo === "ambiguo") return dudaDeMonto(l.precioVenta);
  if (venta.tipo === "mal" || (venta.tipo === "ok" && venta.escalado > TOPES.precioCentimos)) return "El precio de venta va de S/ 0 a S/ 99 999.99, con hasta dos decimales.";
  return null;
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** La emisión: una fecha real, no futura (la base compara con el día de hoy en Lima). */
export function problemaDeEmision(emision: string, hoy: string): string | null {
  if (!ES_FECHA.test(emision)) return "Escribe la fecha de emisión que dice el papel.";
  if (emision > hoy) return "La emisión no puede ser después de hoy.";
  return null;
}

/** El vencimiento de un comprobante al crédito: obligatorio y desde la emisión en adelante. */
export function problemaDeVencimiento(vencimiento: string, emision: string): string | null {
  if (!ES_FECHA.test(vencimiento)) return "Escribe cuándo vence: al crédito hay que decir hasta cuándo se paga.";
  if (ES_FECHA.test(emision) && vencimiento < emision) return "El vencimiento no puede ser antes de la emisión.";
  return null;
}

/** El vencimiento que se sugiere: la emisión más el plazo de crédito del proveedor (30 días si su ficha no lo dice). */
export function vencimientoSugerido(emision: string, plazoDias: number | null | undefined): string {
  return ES_FECHA.test(emision) ? sumarDias(emision, plazoDias != null && plazoDias >= 0 ? plazoDias : PLAZO_POR_DEFECTO_DIAS) : "";
}

/** La suma de los medios de pago en céntimos, o por qué no se puede sumar. */
export function sumaDePago(pagos: readonly PagoBorrador[]): { centimos: number; problema: null } | { centimos: null; problema: string } {
  if (pagos.length === 0) return { centimos: null, problema: "Agrega el medio de pago." };
  let suma = 0;
  for (const p of pagos) {
    const m = leerNumero(p.monto, 2);
    if (m.tipo === "vacio" || (m.tipo === "ok" && m.escalado === 0)) return { centimos: null, problema: "Cada medio de pago necesita un monto mayor a cero." };
    if (m.tipo === "mal") return { centimos: null, problema: "El monto del pago va en soles, con hasta dos decimales." };
    suma += m.escalado;
  }
  return { centimos: suma, problema: null };
}

/** Al contado el pago es exactamente el total del comprobante (la base lo exige). */
export function problemaDePago(pagos: readonly PagoBorrador[], totalCentimos: number): string | null {
  const suma = sumaDePago(pagos);
  if (suma.centimos === null) return suma.problema;
  if (suma.centimos !== totalCentimos) {
    return `Al contado el pago es el total (${soles(totalCentimos / 100)}); vas en ${soles(suma.centimos / 100)}.`;
  }
  return null;
}

/** Los campos de la guía de foco, en el orden de la pantalla. `hecho` y `requerido` son las reglas de la base: la guía no inventa
 *  ninguna. El tipo y la condición arrancan con un valor de fábrica que IMPORTA (cambia el IGV y si hay vencimiento o pago): hasta
 *  que la persona los elige —aunque elija el mismo— son «sugeridos»: la luz pasa por ellos y nunca bloquean (ADR-0284 act. h). */
export function camposDelComprobante(
  b: BorradorComprobante,
  ctx: ContextoComprobante,
  elegido: { tipo: boolean; condicion: boolean },
  responsable: { pide: boolean; listo: boolean; motivo: string | null },
): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  const tipoValido = b.tipo !== "";
  campos.push({
    id: "tipo",
    nombre: "Tipo de papel",
    requerido: !tipoValido,
    sugerido: tipoValido && !elegido.tipo,
    hecho: tipoValido && elegido.tipo,
    pendiente: tipoValido
      ? "Confirma qué papel te dieron: boleta, nota de venta, factura o sin comprobante."
      : "Elige qué papel te dieron: boleta, nota de venta, factura o sin comprobante.",
  });
  // Sin comprobante no hay serie ni número que escribir: la base le pone su número interno (lo mismo que exige la base).
  if (pidePapel(b.tipo)) {
    campos.push({ id: "serie", nombre: "Serie", requerido: true, hecho: b.serie.trim() !== "", pendiente: "Escribe la serie que dice el papel." });
    campos.push({ id: "numero", nombre: "Número", requerido: true, hecho: b.numero.trim() !== "", pendiente: "Escribe el número que dice el papel." });
  }
  const problemaEmision = problemaDeEmision(b.emision, ctx.hoy);
  campos.push({ id: "emision", nombre: palabrasDelTipo(b.tipo).emision, requerido: true, hecho: problemaEmision === null, pendiente: problemaEmision ?? "" });
  const condicionValida = b.condicion !== "";
  campos.push({
    id: "condicion",
    nombre: "Cómo se paga",
    requerido: !condicionValida,
    sugerido: condicionValida && !elegido.condicion,
    hecho: condicionValida && elegido.condicion,
    pendiente: condicionValida ? "Confirma si lo pagas al contado o a crédito." : "Elige si lo pagas al contado o a crédito.",
  });
  if (b.condicion === "credito") {
    const problema = problemaDeVencimiento(b.vencimiento, b.emision);
    campos.push({ id: "vencimiento", nombre: "Vence el", requerido: true, hecho: problema === null, pendiente: problema ?? "" });
  }
  if (b.lineas.length === 0) {
    campos.push({ id: "lineas", nombre: "Prendas del papel", requerido: true, hecho: false, pendiente: "Pon al menos una prenda del papel." });
  }
  b.lineas.forEach((l, i) => {
    const problema = problemaDeLinea(l, ctx);
    campos.push({ id: `linea-${l.clave}`, nombre: `Renglón ${i + 1}`, requerido: true, hecho: problema === null, pendiente: problema ?? "" });
  });
  if (b.lineas.length > TOPES_COMPROBANTE.lineas) {
    campos.push({
      id: "lineas",
      nombre: "Prendas del papel",
      requerido: true,
      hecho: false,
      pendiente: `Un comprobante lleva hasta ${TOPES_COMPROBANTE.lineas} renglones: registra el resto en otro comprobante.`,
    });
  }
  // El total del papel es opcional: solo entra a la guía si se escribió y no sirve.
  const totales = totalesComprobante(b.lineas, { tipo: b.tipo, sumaIgv: b.sumaIgv, totalDelPapel: b.totalDelPapel });
  if (totales.problemaTotalDelPapel) {
    campos.push({ id: "total-papel", nombre: "Total del papel", requerido: true, hecho: false, pendiente: totales.problemaTotalDelPapel });
  }
  if (b.condicion === "contado") {
    const problema = problemaDePago(b.pagos, totales.totalCentimos);
    campos.push({ id: "pago", nombre: "Pago", requerido: true, hecho: problema === null, pendiente: problema ?? "" });
  }
  const notaLarga = b.nota.trim().length > TOPES_COMPROBANTE.nota;
  campos.push({
    id: "nota",
    nombre: "Nota",
    requerido: notaLarga,
    hecho: b.nota.trim().length > 0 && !notaLarga,
    pendiente: notaLarga ? `La nota va hasta ${TOPES_COMPROBANTE.nota} letras.` : "",
  });
  if (responsable.pide) {
    campos.push({ id: "responsable", nombre: "Quién lo registra", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién registra el comprobante." });
  }
  return campos;
}

/** El primer problema que impide registrar (o null): lo mismo que la guía, dicho de una vez. Es la red de seguridad de «Registrar»; la
 *  base vuelve a exigir todo. */
export function primerProblema(
  b: BorradorComprobante,
  ctx: ContextoComprobante,
  elegido: { tipo: boolean; condicion: boolean } = { tipo: true, condicion: true },
): string | null {
  const falta = camposDelComprobante(b, ctx, elegido, { pide: false, listo: true, motivo: null }).find((c) => c.requerido && !c.hecho);
  return falta ? falta.pendiente : null;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// «De más» antes de guardar: lo mismo que la base avisará después
// ---------------------------------------------------------------------------------------------------------------------------------

export type DeMasDeLinea = {
  ordenItemId: string;
  posicion: number;
  /** «Polos · Kero», con la descripción si la tiene. */
  descripcion: string;
  pedido: number;
  facturadoAntes: number;
  estaVez: number;
  /** Cuánto pasa de lo pedido: antes + esta vez − pedido. */
  deMas: number;
};

/** «Polos · Kero · Manga larga»: cómo se llama una línea pedida en un aviso. */
export function nombreDeLinea(l: Pick<LineaDetalle, "categoria" | "marca" | "descripcion">): string {
  return [l.categoria, l.marca, l.descripcion].filter((x): x is string => !!x && x.trim() !== "").join(" · ");
}

/** Las líneas pedidas a las que este papel les pone más de lo pedido (lo facturado antes en comprobantes vigentes, más esta vez). No
 *  bloquea: la base lo acepta y lo avisa (decisión 43). */
export function deMasPorLinea(lineas: readonly LineaComprobante[], orden: Pick<DetalleOrden, "lineas">): DeMasDeLinea[] {
  const estaVezPorLinea = new Map<string, number>();
  for (const l of lineas) {
    if (l.ordenItemId === null) continue;
    estaVezPorLinea.set(l.ordenItemId, (estaVezPorLinea.get(l.ordenItemId) ?? 0) + (calcularRenglon(l).cantidad ?? 0));
  }
  const salida: DeMasDeLinea[] = [];
  for (const p of orden.lineas) {
    if (p.id === null) continue;
    const estaVez = estaVezPorLinea.get(p.id) ?? 0;
    const antes = p.facturado ?? 0;
    if (estaVez > 0 && antes + estaVez > p.cantidad) {
      salida.push({ ordenItemId: p.id, posicion: p.posicion, descripcion: nombreDeLinea(p), pedido: p.cantidad, facturadoAntes: antes, estaVez, deMas: antes + estaVez - p.cantidad });
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que viaja a la base
// ---------------------------------------------------------------------------------------------------------------------------------

export type LineaParaBase = {
  orden_compra_item_id: string | null;
  categoria_id: string | null;
  marca_id: string | null;
  descripcion: string | null;
  cantidad: number;
  costo_unitario: number;
  precio_venta_sugerido: number | null;
};

/** Un medio de pago como lo recibe `registrar_comprobante_orden` (el formato de `registrar_compra`). */
export type PagoParaBase = { monto: number; metodo: string; referencia?: string; cuenta_id?: string };

/**
 * `p_lineas`: un renglón por línea del papel. Los de una línea pedida nombran la línea (`orden_compra_item_id`) y la base saca de ella la
 * categoría, la marca y la descripción; los de algo que no estaba en la orden llevan los suyos. Los números van con a lo más dos
 * decimales, calculados desde céntimos enteros. Solo se llama con el papel listo (la guía sin nada requerido pendiente).
 */
export function lineasParaBase(lineas: readonly LineaComprobante[]): LineaParaBase[] {
  return lineas.map((l) => {
    const c = calcularRenglon(l);
    const venta = leerNumero(l.precioVenta, 2);
    const base = {
      cantidad: c.cantidad ?? 0,
      costo_unitario: (c.costoCentimos ?? 0) / 100,
      precio_venta_sugerido: venta.tipo === "ok" ? venta.escalado / 100 : null,
    };
    if (l.ordenItemId !== null) {
      return { orden_compra_item_id: l.ordenItemId, categoria_id: null, marca_id: null, descripcion: null, ...base };
    }
    return { orden_compra_item_id: null, categoria_id: l.categoriaId, marca_id: l.marcaId, descripcion: textoParaBase(l.descripcion) || null, ...base };
  });
}

/**
 * `p_pago`: un medio por línea de `LineasPago`, con el monto en soles exactos (desde céntimos), el medio, la referencia si se escribió
 * y la cuenta de «Sale de» (`cuentaDe` la resuelve: la que se eligió o la propuesta; el saldo a favor del proveedor no sale de ninguna
 * cuenta). `null` si no hay medios o alguno no tiene un monto mayor a cero con dos decimales: la guía ya lo habría dicho.
 */
export function pagoParaBase(
  pagos: readonly PagoBorrador[],
  cuentaDe: (pago: PagoBorrador) => string | null | undefined = (p) => p.cuentaId,
): PagoParaBase[] | null {
  const salida: PagoParaBase[] = [];
  for (const p of pagos) {
    const monto = leerNumero(p.monto, 2);
    if (monto.tipo !== "ok" || monto.escalado <= 0) return null;
    const referencia = textoParaBase(p.referencia);
    const cuenta = p.metodo === METODO_SALDO_A_FAVOR ? null : cuentaDe(p);
    salida.push({ monto: monto.escalado / 100, metodo: p.metodo, ...(referencia ? { referencia } : {}), ...(cuenta ? { cuenta_id: cuenta } : {}) });
  }
  return salida.length > 0 ? salida : null;
}

export type ArgsRegistrarComprobante = {
  p_orden_id: string;
  p_tipo: TipoComprobante;
  p_serie: string;
  p_numero: string;
  p_lineas: LineaParaBase[];
  p_fecha_emision: string;
  p_condicion: CondicionComprobante;
  /** Solo al crédito. */
  p_fecha_vencimiento?: string;
  /** Solo una factura suma el 18 %: en boleta y nota de venta va en falso. */
  p_suma_igv: boolean;
  /** El total que dice el papel, solo cuando cuadra el redondeo de una factura con IGV. */
  p_total?: number;
  /** Solo al contado. */
  p_pago?: PagoParaBase[];
  p_nota?: string;
  p_token: string;
};

/**
 * Los argumentos de `registrar_comprobante_orden`. `pago` es el que arma `pagoParaBase` (con la cuenta de «Sale de» de cada medio);
 * solo viaja al contado, y al crédito la base lo rechaza. `token` se genera una vez y se reusa en cada reintento: la base devuelve el mismo comprobante si el
 * envío es el mismo.
 */
export function argsRegistrarComprobante(
  b: BorradorComprobante,
  { ordenId, token, pago }: { ordenId: string; token: string; pago: PagoParaBase[] | null },
): ArgsRegistrarComprobante {
  const tipo = b.tipo as TipoComprobante;
  const condicion = b.condicion as CondicionComprobante;
  const totales = totalesComprobante(b.lineas, { tipo: b.tipo, sumaIgv: b.sumaIgv, totalDelPapel: b.totalDelPapel });
  const nota = textoParaBase(b.nota);
  return {
    p_orden_id: ordenId,
    p_tipo: tipo,
    // Sin comprobante no viaja serie ni número: la base pone el número interno (y los ignoraría igual).
    p_serie: pidePapel(b.tipo) ? textoParaBase(b.serie).toUpperCase() : "",
    p_numero: pidePapel(b.tipo) ? textoParaBase(b.numero) : "",
    p_lineas: lineasParaBase(b.lineas),
    p_fecha_emision: b.emision,
    p_condicion: condicion,
    ...(condicion === "credito" ? { p_fecha_vencimiento: b.vencimiento } : {}),
    p_suma_igv: discriminaIgv(b.tipo) && b.sumaIgv,
    ...(totales.usaTotalDelPapel ? { p_total: totales.totalCentimos / 100 } : {}),
    ...(condicion === "contado" && pago ? { p_pago: pago } : {}),
    ...(nota ? { p_nota: nota } : {}),
    p_token: token,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que vuelve de la base
// ---------------------------------------------------------------------------------------------------------------------------------

export type AvisoGuardado =
  | { tipo: "de_mas"; ordenItemId: string | null; posicion: number | null; descripcion: string; pedido: number; facturadoAntes: number; estaVez: number }
  | { tipo: "fuera_de_orden"; descripcion: string; estaVez: number };

export type ResultadoComprobante = {
  compraId: string;
  /** Serie y número, «B001-123». */
  documento: string;
  total: number;
  /** Lo que queda por pagar (cero al contado). */
  saldo: number;
  avisos: AvisoGuardado[];
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const cifra = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Lee lo que contesta `registrar_comprobante_orden`: `{ compra_id, documento, total, saldo, avisos }`. Un aviso raro se descarta (no
 *  bloquean y no deben tumbar la confirmación); si no llegó el comprobante, null. Acepta también una lista de una fila. */
export function leerResultadoComprobante(data: unknown): ResultadoComprobante | null {
  const crudo = Array.isArray(data) ? data[0] : data;
  if (!crudo || typeof crudo !== "object") return null;
  const r = crudo as Record<string, unknown>;
  const compraId = texto(r.compra_id);
  const documento = texto(r.documento);
  if (!compraId || !documento) return null;
  const avisos = (Array.isArray(r.avisos) ? r.avisos : [])
    .map((a): AvisoGuardado | null => {
      if (!a || typeof a !== "object") return null;
      const x = a as Record<string, unknown>;
      const estaVez = cifra(x.esta_vez);
      if (x.tipo === "de_mas") {
        const pedido = cifra(x.pedido);
        const antes = cifra(x.facturado_antes);
        if (estaVez == null || pedido == null || antes == null) return null;
        return {
          tipo: "de_mas",
          ordenItemId: texto(x.orden_compra_item_id),
          posicion: cifra(x.posicion),
          descripcion: texto(x.descripcion) ?? "Una prenda",
          pedido,
          facturadoAntes: antes,
          estaVez,
        };
      }
      if (x.tipo === "fuera_de_orden" && estaVez != null) return { tipo: "fuera_de_orden", descripcion: texto(x.descripcion) ?? "Una prenda", estaVez };
      return null;
    })
    .filter((a): a is AvisoGuardado => a !== null);
  return { compraId, documento, total: cifra(r.total) ?? 0, saldo: cifra(r.saldo) ?? 0, avisos };
}

const unidadesTexto = (n: number) => `${n.toLocaleString("es-PE")} ${n === 1 ? "unidad" : "unidades"}`;

/** Los avisos de «de más» y «fuera de orden», dichos en una o dos frases para el aviso de la esquina (nunca bloquean). */
export function resumenDeAvisos(avisos: readonly AvisoGuardado[]): { titulo: string; detalle: string } | null {
  if (avisos.length === 0) return null;
  const hayDeMas = avisos.some((a) => a.tipo === "de_mas");
  const hayFuera = avisos.some((a) => a.tipo === "fuera_de_orden");
  const titulo = hayDeMas && hayFuera ? "El papel no calza del todo con la orden" : hayDeMas ? "El papel trae más de lo que pediste" : "El papel trae prendas que no estaban en la orden";
  const frases = avisos.map((a) =>
    a.tipo === "de_mas"
      ? `${a.descripcion}: pediste ${a.pedido.toLocaleString("es-PE")} y el papel ya suma ${(a.facturadoAntes + a.estaVez).toLocaleString("es-PE")} (${(a.facturadoAntes + a.estaVez - a.pedido).toLocaleString("es-PE")} de más)`
      : `${a.descripcion}: ${unidadesTexto(a.estaVez)} que no estaban en la orden`,
  );
  const mostradas = frases.slice(0, 3);
  const resto = frases.length - mostradas.length;
  return { titulo, detalle: `${mostradas.join(" · ")}${resto > 0 ? ` · y ${resto} más` : ""}. Quedó registrado igual.` };
}

/** «OC-000129 · Queda en Por pagar S/ 1,486.80» o «OC-000129 · Pagado al contado S/ 1,486.80»: lo que quedó, dicho como se ve en la lista. */
export function detalleDeRegistro(numeroOrden: string, r: Pick<ResultadoComprobante, "total" | "saldo">): string {
  return `${numeroOrden} · ${r.saldo > 0 ? `Queda en Por pagar ${soles(r.saldo)}` : `Pagado al contado ${soles(r.total)}`}`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Anular un comprobante de la orden
// ---------------------------------------------------------------------------------------------------------------------------------

/** El motivo de anular el comprobante: la base solo pide que no esté vacío; la pantalla lo limita a 300 letras como el de la orden. */
export const MAX_MOTIVO_COMPROBANTE = 300;

export function problemaDeMotivoComprobante(motivo: string): string | null {
  const t = motivo.trim();
  if (!t) return "Escribe por qué se anula el comprobante.";
  if (t.length > MAX_MOTIVO_COMPROBANTE) return `El motivo va hasta ${MAX_MOTIVO_COMPROBANTE} letras.`;
  return null;
}

/** ¿Se ofrece «Anular» en este comprobante? Solo uno vigente y sin pagos: con pagos la base no deja anularlo (`anular_compra`). Si no
 *  se sabe el estado de pago, se ofrece y la base decide. */
export function sePuedeAnularComprobante(c: { estado: string; estadoPago: string | null }): boolean {
  return c.estado === "vigente" && (c.estadoPago === null || c.estadoPago === "pendiente");
}
