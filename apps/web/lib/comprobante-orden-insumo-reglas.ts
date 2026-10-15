// Registrar el comprobante de una orden de insumos del Taller (ADR-0362, fase 7 parte 2 · actividad 1): la lógica pura de la pantalla.
// Sin React ni red: se importa desde el cliente y se prueba sola (`comprobante-orden-insumo-reglas.test.ts`).
//
// Es la gemela de `comprobante-orden-reglas.ts` (el papel de una orden de tienda, fase 2) con las medidas del Taller: un INSUMO del
// catálogo en vez de categoría + marca, la cantidad con hasta tres decimales en la unidad de la línea y el costo con hasta cuatro (las
// cuentas exactas de `ordenes-insumo-reglas.ts`), la factura que suma su IGV o no (18 % o 0 %), y —en esta actividad— solo al crédito: el
// contado llega en la actividad 2. Lo que no cambia entre las dos (los cuatro tipos de papel, la serie de ejemplo, las fechas, las palabras
// de «sin comprobante», el aviso de corte) se toma de allá.
//
//   PROMETE: precargar el papel con lo que la orden todavía no tiene en papel (lo pendiente de cada línea y su costo neto por unidad);
//   calcular subtotal, IGV y total como `registrar_comprobante_orden_insumo`; decir qué le falta con las MISMAS reglas que esa función (de
//   aquí sale la guía de foco: si la base rechaza algo que esto dejaba pasar, la prueba lo atrapa); armar lo que viaja a la base; y leer lo
//   que vuelve (el documento y los avisos de «de más» y «fuera de la orden», que no bloquean, decisión 43).
//   NO HACE: no habla con la base ni decide permisos (el módulo «Órdenes de insumos» y quién firma los decide la función).
//
// El contrato con la base: docs/compras/ordenes-de-compra-2026-10/contrato-ordenes-de-insumos.md (punto 2).

import type { CampoDeGuia } from "./guia-campos";
import { aTexto, leerNumero, textoParaBase } from "./orden-compra-alta";
import { soles } from "./compras-reglas";
import {
  TOPES_COMPROBANTE,
  discriminaIgv,
  pidePapel,
  problemaDeEmision,
  problemaDeVencimiento,
  type TipoComprobante,
} from "./comprobante-orden-reglas";
import {
  TOPES_INSUMO,
  cantidadConUnidad,
  cifraDeCantidad,
  dudaDeCantidadInsumo,
  dudaDePrecioInsumo,
  importeCentimos,
  leerCantidadInsumo,
  leerPrecioInsumo,
  nombreUnidad,
  type DetalleOrdenInsumo,
  type LineaOrdenInsumo,
} from "./ordenes-insumo-reglas";

/** El IGV que suma una factura del Taller cuando se enciende «Sumar IGV». La base acepta de 0 % a 18 % (`igv_fuera_de_rango`). */
export const IGV_PAPEL_INSUMO = 18;

/** Lo que la base acepta (`registrar_comprobante_orden_insumo`): hasta 200 renglones y una nota de 500 letras. La serie y el número se
 *  escriben con los topes de la caja de tiendas (la base admite más, 20 y 30). */
export const TOPES_PAPEL_INSUMO = { lineas: 200, serie: TOPES_COMPROBANTE.serie, numero: TOPES_COMPROBANTE.numero, nota: 500 } as const;

// ---------------------------------------------------------------------------------------------------------------------------------
// Las líneas de la orden, con su id y lo que ya llegó en papel
// ---------------------------------------------------------------------------------------------------------------------------------

/** Una línea pedida, lista para el papel: la de la orden con su id (`orden_insumo_items.id`) y lo ya facturado en papeles vigentes. */
export type PedidaInsumo = LineaOrdenInsumo & {
  /** null si la base no lo trajo (una base sin la fase 7 parte 2): esa línea no se puede poner en el papel. */
  itemId: string | null;
  /** En la unidad de la línea. */
  facturado: number;
};

/** Las líneas de la orden con su id y lo facturado, por posición (`fn_orden_insumo` → `facturacion`). */
export function pedidasDeLaOrden(d: Pick<DetalleOrdenInsumo, "lineas" | "facturacion">): PedidaInsumo[] {
  const porPosicion = new Map(d.facturacion.map((f) => [f.posicion, f]));
  return d.lineas.map((l) => {
    const f = porPosicion.get(l.posicion);
    return { ...l, itemId: f?.itemId ?? null, facturado: f?.facturado ?? 0 };
  });
}

/** ¿La base ya sabe del papel de una orden de insumos? Toda línea trae su id en `facturacion` (una base anterior no lo manda). */
export const baseConPapelDeInsumos = (d: Pick<DetalleOrdenInsumo, "lineas" | "facturacion">): boolean =>
  d.lineas.length > 0 && pedidasDeLaOrden(d).every((p) => p.itemId !== null);

const milesimas = (cantidad: number) => Math.round(cantidad * 1000);

/** Lo que de una línea pedida falta por llegar en papel, en milésimas de su unidad (nunca menos de cero). */
export function pendienteMilesimas(p: Pick<PedidaInsumo, "cantidad" | "facturado">): number {
  return Math.max(0, milesimas(p.cantidad) - milesimas(p.facturado));
}

/** El papel de la orden entera: null si todavía no llegó nada en papel; «completa» si cada línea ya tiene todo lo pedido en papeles
 *  vigentes; «en_parte» si no. */
export function papelDeOrdenInsumo(pedidas: readonly Pick<PedidaInsumo, "cantidad" | "facturado">[]): "en_parte" | "completa" | null {
  if (!pedidas.some((p) => p.facturado > 0)) return null;
  return pedidas.every((p) => pendienteMilesimas(p) === 0) ? "completa" : "en_parte";
}

/** «10 de 12.5 metros»; si pasa lo pedido, «15 de 12.5 metros · 2.5 de más». Lo que dice cada línea de la orden abierta. */
export function textoPapelDeLineaInsumo(p: Pick<PedidaInsumo, "cantidad" | "facturado" | "unidadMedida">): string {
  const base = `${cifraDeCantidad(p.facturado)} de ${cantidadConUnidad(p.cantidad, p.unidadMedida)}`;
  const deMas = milesimas(p.facturado) - milesimas(p.cantidad);
  return deMas > 0 ? `${base} · ${cifraDeCantidad(deMas / 1000)} de más` : base;
}

/** Medio hacia arriba de un cociente de enteros positivos, en BigInt (lo que hace `round` de Postgres con un `numeric` positivo). */
function redondearCociente(n: bigint, d: bigint): number {
  const dos = BigInt(2);
  return Number((dos * n + d) / (dos * d));
}

/**
 * El costo neto por unidad de una línea pedida, en diezmilésimas de sol: su precio si no tiene descuento (exacto: el papel suma lo mismo
 * que la orden); con descuento, el subtotal de la orden entre la cantidad, a cuatro decimales. El papel no tiene columna de descuento: su
 * costo ya es neto.
 */
export function costoNetoDiezmilesimas(p: Pick<LineaOrdenInsumo, "cantidad" | "precioUnitario" | "descuento" | "subtotal">): number {
  if (!(p.descuento > 0)) return Math.round(p.precioUnitario * 10_000);
  const cant = milesimas(p.cantidad);
  if (cant <= 0) return 0;
  // costo = (subtotal en céntimos / 100) / (cantidad en milésimas / 1000) soles; × 10 000 para diezmilésimas.
  return redondearCociente(BigInt(Math.round(p.subtotal * 100)) * BigInt(100_000), BigInt(cant));
}

/** Un costo en diezmilésimas como se lee en su caja: con dos decimales al menos y los cuatro si los usa («25.50», «0.035»). Un texto
 *  así nunca se lee como «miles con punto» (un tercer decimal escrito nunca termina en cero). */
export function costoParaCaja(diezmilesimas: number): string {
  return diezmilesimas % 100 === 0 ? aTexto(diezmilesimas / 100, 2) : aTexto(diezmilesimas, 4, { recortar: true });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// El papel, renglón por renglón
// ---------------------------------------------------------------------------------------------------------------------------------

/** Un renglón del papel. Con `ordenItemId` responde a una línea pedida (su insumo es el de la orden y no se toca); sin él es un insumo
 *  que no estaba en la orden (decisión 43) y trae el suyo. Los números se escriben como texto, igual que en la orden. */
export type LineaPapelInsumo = {
  /** Estable para React mientras dura el formulario; no es un id de la base. */
  clave: string;
  ordenItemId: string | null;
  /** «» = sin elegir (solo en un insumo que no estaba en la orden). */
  insumoId: string;
  /** En la unidad de la línea (o la del insumo elegido), con hasta tres decimales. */
  cantidad: string;
  /** Costo por unidad, SIN IGV, con hasta cuatro decimales. */
  costo: string;
};

/** Todo lo que la pantalla le llena a la función. `tipo` vacío = todavía sin elegir. Al crédito siempre, en esta actividad. */
export type BorradorPapelInsumo = {
  tipo: TipoComprobante | "";
  serie: string;
  numero: string;
  /** `aaaa-mm-dd`. */
  emision: string;
  /** El vencimiento que corre ahora (el sugerido si la persona no lo escribió). */
  vencimiento: string;
  /** Solo se mira en una factura. */
  sumaIgv: boolean;
  /** El total que dice el papel (opcional, solo factura con IGV): cuadra el redondeo del IGV por centavos. */
  totalDelPapel: string;
  lineas: LineaPapelInsumo[];
  nota: string;
};

/** Lo que la pantalla sabe y el borrador no: las líneas de ESTA orden (con su unidad) y los insumos activos (con la suya). */
export type ContextoPapelInsumo = {
  hoy: string;
  /** `orden_insumo_items.id` → la unidad de la línea. */
  lineasDeLaOrden: ReadonlyMap<string, string>;
  /** Insumo activo (sin archivar) → su unidad hoy. */
  insumos: ReadonlyMap<string, string>;
};

/** La unidad en que se escribe un renglón: la de su línea pedida, o la del insumo elegido. null si todavía no se sabe. */
export function unidadDeRenglon(l: Pick<LineaPapelInsumo, "ordenItemId" | "insumoId">, ctx: Pick<ContextoPapelInsumo, "lineasDeLaOrden" | "insumos">): string | null {
  if (l.ordenItemId !== null) return ctx.lineasDeLaOrden.get(l.ordenItemId) ?? null;
  return l.insumoId ? (ctx.insumos.get(l.insumoId) ?? null) : null;
}

/** Los renglones con que se precarga UNA línea pedida: lo pendiente y su costo neto; sin nada pendiente (ya llegó todo), la cantidad
 *  vacía, para que se escriba lo que de verdad dice el papel. */
export function renglonDePedida(p: PedidaInsumo, clave: string): LineaPapelInsumo | null {
  if (p.itemId === null) return null;
  const pendiente = pendienteMilesimas(p);
  return {
    clave,
    ordenItemId: p.itemId,
    insumoId: p.insumoId,
    cantidad: pendiente > 0 ? aTexto(pendiente, 3, { recortar: true }) : "",
    costo: costoParaCaja(costoNetoDiezmilesimas(p)),
  };
}

/** El papel de arranque: cada línea pedida con algo pendiente. Lo que ya llegó en papel no se vuelve a poner (se agrega con «Poner»). */
export function precargarPapelInsumo(pedidas: readonly PedidaInsumo[], siguienteClave: () => string): LineaPapelInsumo[] {
  return pedidas
    .filter((p) => p.itemId !== null && pendienteMilesimas(p) > 0)
    .flatMap((p) => {
      const r = renglonDePedida(p, siguienteClave());
      return r ? [r] : [];
    });
}

/** Las líneas pedidas que hoy no tienen ningún renglón en el papel (quitadas a propósito, o ya llegadas del todo): se ofrecen para poner. */
export function pedidasSinRenglonInsumo(pedidas: readonly PedidaInsumo[], lineas: readonly LineaPapelInsumo[]): PedidaInsumo[] {
  const puestas = new Set(lineas.map((l) => l.ordenItemId).filter((id): id is string => id !== null));
  return pedidas.filter((p) => p.itemId !== null && !puestas.has(p.itemId));
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Leer y calcular (exacto, como la base)
// ---------------------------------------------------------------------------------------------------------------------------------

export type CalculoRenglonInsumo = {
  cantidadMilesimas: number | null;
  costoDiezmilesimas: number | null;
  /** `round(cantidad × costo, 2)` en céntimos, o null si falta alguno de los dos. */
  subtotalCentimos: number | null;
};

export function calcularRenglonInsumo(l: Pick<LineaPapelInsumo, "cantidad" | "costo">): CalculoRenglonInsumo {
  const cant = leerCantidadInsumo(l.cantidad);
  const costo = leerPrecioInsumo(l.costo);
  const cantidadMilesimas = cant.tipo === "ok" ? cant.escalado : null;
  const costoDiezmilesimas = costo.tipo === "ok" ? costo.escalado : null;
  return {
    cantidadMilesimas,
    costoDiezmilesimas,
    subtotalCentimos: cantidadMilesimas != null && costoDiezmilesimas != null ? importeCentimos(cantidadMilesimas, costoDiezmilesimas) : null,
  };
}

export type TotalesPapelInsumo = {
  subtotalCentimos: number;
  igvCentimos: number;
  totalCentimos: number;
  /** ¿El total que manda es el que escribió la persona (el del papel) y no el calculado? */
  usaTotalDelPapel: boolean;
  /** Por qué el total del papel que se escribió no sirve, o null. */
  problemaTotalDelPapel: string | null;
};

/** ¿Esta factura suma IGV? Solo una factura, y solo con «Sumar IGV» encendido. */
export const sumaIgvPapel = (b: Pick<BorradorPapelInsumo, "tipo" | "sumaIgv">): boolean => discriminaIgv(b.tipo) && b.sumaIgv;

/**
 * Subtotal, IGV y total tal como los guarda `registrar_comprobante_orden_insumo`: el subtotal es la suma de lo redondeado por renglón; en
 * una factura con «Sumar IGV», `round(subtotal × 18 %, 2)` (mitad hacia arriba); en lo demás, nada. Si en esa factura se escribió el total
 * del papel, a no más de un céntimo por renglón (más uno) del calculado y sin bajar del subtotal, ese total manda y el IGV es la diferencia
 * (el proveedor redondea por renglón).
 */
export function totalesPapelInsumo(b: Pick<BorradorPapelInsumo, "tipo" | "sumaIgv" | "totalDelPapel" | "lineas">): TotalesPapelInsumo {
  const subtotalCentimos = b.lineas.reduce((acc, l) => acc + (calcularRenglonInsumo(l).subtotalCentimos ?? 0), 0);
  const conIgv = sumaIgvPapel(b);
  const igvCalculado = conIgv ? Math.floor((subtotalCentimos * IGV_PAPEL_INSUMO + 50) / 100) : 0;
  const calculado: TotalesPapelInsumo = {
    subtotalCentimos,
    igvCentimos: igvCalculado,
    totalCentimos: subtotalCentimos + igvCalculado,
    usaTotalDelPapel: false,
    problemaTotalDelPapel: null,
  };
  if (!conIgv || b.totalDelPapel.trim() === "") return calculado;
  const escrito = leerNumero(b.totalDelPapel, 2);
  if (escrito.tipo !== "ok") return { ...calculado, problemaTotalDelPapel: "El total del papel va en soles, con hasta dos decimales." };
  if (escrito.escalado < subtotalCentimos || Math.abs(escrito.escalado - calculado.totalCentimos) > b.lineas.length + 1) {
    return {
      ...calculado,
      problemaTotalDelPapel: `El total del papel (${soles(escrito.escalado / 100)}) no cuadra con las líneas (${soles(calculado.totalCentimos / 100)}): revisa cantidades y costos.`,
    };
  }
  if (escrito.escalado === calculado.totalCentimos) return calculado;
  return { ...calculado, igvCentimos: escrito.escalado - subtotalCentimos, totalCentimos: escrito.escalado, usaTotalDelPapel: true };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Qué le falta (las reglas de `registrar_comprobante_orden_insumo`, dichas para quien llena)
// ---------------------------------------------------------------------------------------------------------------------------------

/** El primer problema de un renglón, en una frase para quien lo llena; null si está listo. */
export function problemaDeRenglonInsumo(l: LineaPapelInsumo, ctx: Pick<ContextoPapelInsumo, "lineasDeLaOrden" | "insumos">): string | null {
  if (l.ordenItemId !== null && !ctx.lineasDeLaOrden.has(l.ordenItemId)) return "Este renglón no es de esta orden: quítalo y vuelve a ponerlo.";
  const unidad = unidadDeRenglon(l, ctx);
  if (!unidad) return "Elige el insumo.";
  const plural = nombreUnidad(unidad);
  const cant = leerCantidadInsumo(l.cantidad);
  if (cant.tipo === "vacio") return `Escribe la cantidad en ${plural}.`;
  if (cant.tipo === "mal" && cant.motivo === "ambiguo") return dudaDeCantidadInsumo(l.cantidad, unidad);
  if (cant.tipo === "mal" || cant.escalado < 1 || cant.escalado > TOPES_INSUMO.cantidadMilesimas)
    return `La cantidad va de 0.001 a 99 999.999 ${plural}, con hasta tres decimales.`;
  const costo = leerPrecioInsumo(l.costo);
  if (costo.tipo === "vacio") return `Escribe el costo por ${nombreUnidad(unidad, 1)} (0 si no tuvo costo).`;
  if (costo.tipo === "mal" && costo.motivo === "ambiguo") return dudaDePrecioInsumo(l.costo);
  if (costo.tipo === "mal" || costo.escalado > TOPES_INSUMO.precioDiezmilesimas) return "El costo va de S/ 0 a S/ 99 999.9999, con hasta cuatro decimales.";
  return null;
}

/**
 * Los campos de la guía de foco, en el orden de la pantalla. `hecho` y `requerido` son las reglas de la base: la guía no inventa ninguna
 * (lo vigila la prueba, contra los casos de `scripts/pruebas/comprobante_orden_insumo.mjs`). El tipo de papel arranca con un valor de
 * fábrica que importa (cambia el IGV y si hay serie): hasta que la persona lo elige —aunque elija el mismo— es «sugerido»: la luz pasa por
 * él y nunca bloquea (ADR-0284 act. h). `responsable` solo cuenta en una terminal (decisión 39).
 */
export function camposDelPapelInsumo(
  b: BorradorPapelInsumo,
  ctx: ContextoPapelInsumo,
  elegido: { tipo: boolean },
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
  campos.push({ id: "emision", nombre: pidePapel(b.tipo) ? "Fecha de emisión" : "Fecha de la compra", requerido: true, hecho: problemaEmision === null, pendiente: problemaEmision ?? "" });
  const problemaVence = problemaDeVencimiento(b.vencimiento, b.emision);
  campos.push({ id: "vencimiento", nombre: "Vence el", requerido: true, hecho: problemaVence === null, pendiente: problemaVence ?? "" });
  if (b.lineas.length === 0) {
    campos.push({ id: "lineas", nombre: "Insumos del papel", requerido: true, hecho: false, pendiente: "Pon al menos un insumo del papel." });
  }
  b.lineas.forEach((l, i) => {
    const problema = problemaDeRenglonInsumo(l, ctx);
    campos.push({ id: `linea-${l.clave}`, nombre: `Renglón ${i + 1}`, requerido: true, hecho: problema === null, pendiente: problema ?? "" });
  });
  if (b.lineas.length > TOPES_PAPEL_INSUMO.lineas) {
    campos.push({
      id: "lineas",
      nombre: "Insumos del papel",
      requerido: true,
      hecho: false,
      pendiente: `Un comprobante lleva hasta ${TOPES_PAPEL_INSUMO.lineas} renglones: registra el resto en otro comprobante.`,
    });
  }
  // El total del papel es opcional: solo entra a la guía si se escribió y no sirve.
  const totales = totalesPapelInsumo(b);
  if (totales.problemaTotalDelPapel) {
    campos.push({ id: "total-papel", nombre: "Total del papel", requerido: true, hecho: false, pendiente: totales.problemaTotalDelPapel });
  }
  const notaLarga = b.nota.trim().length > TOPES_PAPEL_INSUMO.nota;
  campos.push({
    id: "nota",
    nombre: "Nota",
    requerido: notaLarga,
    hecho: b.nota.trim().length > 0 && !notaLarga,
    pendiente: notaLarga ? `La nota va hasta ${TOPES_PAPEL_INSUMO.nota} letras.` : "",
  });
  if (responsable.pide) {
    campos.push({ id: "responsable", nombre: "Quién lo registra", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién registra el comprobante." });
  }
  return campos;
}

/** El primer problema que impide registrar (o null): lo mismo que la guía, dicho de una vez. Es la red de seguridad de «Registrar»; la
 *  base vuelve a exigir todo. */
export function primerProblemaPapelInsumo(b: BorradorPapelInsumo, ctx: ContextoPapelInsumo): string | null {
  const falta = camposDelPapelInsumo(b, ctx, { tipo: true }, { pide: false, listo: true, motivo: null }).find((c) => c.requerido && !c.hecho);
  return falta ? falta.pendiente : null;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// «De más» antes de guardar: lo mismo que la base avisará después
// ---------------------------------------------------------------------------------------------------------------------------------

export type DeMasDeInsumo = {
  itemId: string;
  posicion: number;
  insumo: string;
  unidad: string;
  /** Todo en la unidad de la línea. */
  pedido: number;
  facturadoAntes: number;
  estaVez: number;
  /** Cuánto pasa de lo pedido: antes + esta vez − pedido. */
  deMas: number;
};

/** Las líneas pedidas a las que este papel les pone más de lo pedido (lo facturado antes en papeles vigentes, más esta vez). No bloquea:
 *  la base lo acepta y lo avisa (decisión 43). En milésimas hasta el final: 0.1 + 0.2 metros no son 0.30000000000000004. */
export function deMasPorLineaInsumo(lineas: readonly LineaPapelInsumo[], pedidas: readonly PedidaInsumo[]): DeMasDeInsumo[] {
  const estaVezPorLinea = new Map<string, number>();
  for (const l of lineas) {
    if (l.ordenItemId === null) continue;
    estaVezPorLinea.set(l.ordenItemId, (estaVezPorLinea.get(l.ordenItemId) ?? 0) + (calcularRenglonInsumo(l).cantidadMilesimas ?? 0));
  }
  const salida: DeMasDeInsumo[] = [];
  for (const p of pedidas) {
    if (p.itemId === null) continue;
    const estaVez = estaVezPorLinea.get(p.itemId) ?? 0;
    const antes = milesimas(p.facturado);
    const pedido = milesimas(p.cantidad);
    if (estaVez > 0 && antes + estaVez > pedido) {
      salida.push({
        itemId: p.itemId,
        posicion: p.posicion,
        insumo: p.insumo,
        unidad: p.unidadMedida,
        pedido: pedido / 1000,
        facturadoAntes: antes / 1000,
        estaVez: estaVez / 1000,
        deMas: (antes + estaVez - pedido) / 1000,
      });
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que viaja a la base (números como TEXTO canónico: un flotante convertiría 0.1 + 0.2 antes de llegar al `numeric`)
// ---------------------------------------------------------------------------------------------------------------------------------

export type RenglonInsumoParaBase =
  | { orden_insumo_item_id: string; cantidad: string; costo_unitario: string }
  | { insumo_id: string; cantidad: string; costo_unitario: string };

export type ArgsRegistrarPapelInsumo = {
  p_orden_id: string;
  p_tipo: TipoComprobante;
  p_serie: string;
  p_numero: string;
  p_lineas: RenglonInsumoParaBase[];
  p_fecha_emision: string;
  p_condicion: "credito";
  p_fecha_vencimiento: string;
  /** 18 en una factura con «Sumar IGV»; 0 en lo demás (la base solo lo mira en una factura). */
  p_igv_porcentaje: number;
  /** El total que dice el papel, solo cuando cuadra el redondeo de una factura con IGV. */
  p_total?: string;
  p_nota?: string;
  p_token: string;
};

/**
 * Los argumentos de `registrar_comprobante_orden_insumo`. Un renglón de una línea pedida nombra la línea (la base pone su insumo); uno que
 * no estaba en la orden, su insumo. `token` se genera una vez y se reusa en cada reintento: la base devuelve el mismo papel si el envío es
 * el mismo. Solo se llama con el papel listo (la guía sin nada requerido pendiente).
 */
export function argsRegistrarPapelInsumo(b: BorradorPapelInsumo, { ordenId, token }: { ordenId: string; token: string }): ArgsRegistrarPapelInsumo {
  const totales = totalesPapelInsumo(b);
  const nota = textoParaBase(b.nota);
  const lineas = b.lineas.map((l): RenglonInsumoParaBase => {
    const c = calcularRenglonInsumo(l);
    const numeros = {
      cantidad: c.cantidadMilesimas != null ? aTexto(c.cantidadMilesimas, 3, { recortar: true }) : "",
      costo_unitario: c.costoDiezmilesimas != null ? aTexto(c.costoDiezmilesimas, 4, { recortar: true }) : "",
    };
    return l.ordenItemId !== null ? { orden_insumo_item_id: l.ordenItemId, ...numeros } : { insumo_id: l.insumoId, ...numeros };
  });
  return {
    p_orden_id: ordenId,
    p_tipo: b.tipo as TipoComprobante,
    // Sin comprobante no viaja serie ni número: la base pone el número interno (y los ignoraría igual).
    p_serie: pidePapel(b.tipo) ? textoParaBase(b.serie).toUpperCase() : "",
    p_numero: pidePapel(b.tipo) ? textoParaBase(b.numero) : "",
    p_lineas: lineas,
    p_fecha_emision: b.emision,
    p_condicion: "credito",
    p_fecha_vencimiento: b.vencimiento,
    p_igv_porcentaje: sumaIgvPapel(b) ? IGV_PAPEL_INSUMO : 0,
    ...(totales.usaTotalDelPapel ? { p_total: aTexto(totales.totalCentimos, 2) } : {}),
    ...(nota ? { p_nota: nota } : {}),
    p_token: token,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que vuelve de la base
// ---------------------------------------------------------------------------------------------------------------------------------

export type AvisoPapelInsumo =
  | { tipo: "de_mas"; itemId: string | null; posicion: number | null; insumo: string; unidad: string; pedido: number; facturado: number }
  | { tipo: "fuera_de_orden"; insumo: string; unidad: string; cantidad: number };

export type ResultadoPapelInsumo = {
  comprobanteId: string;
  /** Serie y número, «F001-77» o «SC-000004». */
  documento: string;
  total: number;
  /** El mismo envío llegó dos veces (doble clic, reintento sin señal): es el papel que ya estaba. */
  repetido: boolean;
  avisos: AvisoPapelInsumo[];
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const cifra = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Lee lo que contesta `registrar_comprobante_orden_insumo`. Un aviso raro se descarta (no bloquean y no deben tumbar la confirmación);
 *  si no llegó el papel, null. Acepta también una lista de una fila. */
export function leerResultadoPapelInsumo(data: unknown): ResultadoPapelInsumo | null {
  const crudo = Array.isArray(data) ? data[0] : data;
  if (!crudo || typeof crudo !== "object") return null;
  const r = crudo as Record<string, unknown>;
  const comprobanteId = texto(r.comprobante_id);
  const documento = texto(r.documento);
  if (!comprobanteId || !documento) return null;
  const avisos = (Array.isArray(r.avisos) ? r.avisos : [])
    .map((a): AvisoPapelInsumo | null => {
      if (!a || typeof a !== "object") return null;
      const x = a as Record<string, unknown>;
      const insumo = texto(x.insumo) ?? "Un insumo";
      const unidad = texto(x.unidad) ?? "unidad";
      if (x.tipo === "de_mas") {
        const pedido = cifra(x.pedido);
        const facturado = cifra(x.facturado);
        if (pedido == null || facturado == null) return null;
        return { tipo: "de_mas", itemId: texto(x.orden_insumo_item_id), posicion: cifra(x.posicion), insumo, unidad, pedido, facturado };
      }
      const cantidad = cifra(x.cantidad);
      if (x.tipo === "fuera_de_orden" && cantidad != null) return { tipo: "fuera_de_orden", insumo, unidad, cantidad };
      return null;
    })
    .filter((a): a is AvisoPapelInsumo => a !== null);
  return { comprobanteId, documento, total: cifra(r.total) ?? 0, repetido: r.repetido === true, avisos };
}

/** Los avisos de «de más» y «fuera de la orden», dichos en una o dos frases para el aviso de la esquina (nunca bloquean). */
export function resumenDeAvisosInsumo(avisos: readonly AvisoPapelInsumo[]): { titulo: string; detalle: string } | null {
  if (avisos.length === 0) return null;
  const hayDeMas = avisos.some((a) => a.tipo === "de_mas");
  const hayFuera = avisos.some((a) => a.tipo === "fuera_de_orden");
  const titulo = hayDeMas && hayFuera ? "El papel no calza del todo con la orden" : hayDeMas ? "El papel trae más de lo que pediste" : "El papel trae insumos que no estaban en la orden";
  const frases = avisos.map((a) =>
    a.tipo === "de_mas"
      ? `${a.insumo}: pediste ${cantidadConUnidad(a.pedido, a.unidad)} y el papel ya suma ${cantidadConUnidad(a.facturado, a.unidad)} (${cifraDeCantidad((milesimas(a.facturado) - milesimas(a.pedido)) / 1000)} de más)`
      : `${a.insumo}: ${cantidadConUnidad(a.cantidad, a.unidad)} que no estaban en la orden`,
  );
  const mostradas = frases.slice(0, 3);
  const resto = frases.length - mostradas.length;
  return { titulo, detalle: `${mostradas.join(" · ")}${resto > 0 ? ` · y ${resto} más` : ""}. Quedó registrado igual.` };
}

/** «OI-000012 · Queda por pagar S/ 164.02»: lo que quedó, dicho para el aviso de la esquina (al crédito, lo paga el líder después). */
export function detalleDeRegistroInsumo(numeroOrden: string, total: number): string {
  return `${numeroOrden} · Queda por pagar ${soles(total)}`;
}
