// «Llegó mercadería» (ADR-0330): la puerta única para meter al stock lo que llega de un proveedor. Sin React ni red.
//
// CONTRATO
//   PROMETE: dada la lista de lo que se va leyendo (pistola o nombre), sumar, corregir y quitar prendas; poner primero, al buscar,
//            las prendas de las marcas del proveedor elegido; armar el pedido de `recibir_lote` tal cual lo espera la base; decirle a
//            la guía de foco qué falta (proveedor, prendas, quién recibe) y qué sigue después de recibir (etiquetas, piso).
//   ASUME:   `recibir_lote` (sin cambios, 20260930122000) es quien valida de verdad: permiso de la sede, costo atípico, token. Aquí
//            solo se repite lo que apaga el botón —sin proveedor, sin prendas o sin responsable no se puede recibir—.
//   NO HACE: no cuenta contra una factura (eso es `RecepcionEnvio`): solo pregunta si viene con una de las que ese proveedor
//            tiene pendientes en esta sede. Ni guarda, ni decide la sede: la sede es la de la cabecera.
import { clave, filtrarPrendasV2, resolverCodigoV2, type PrendaBuscableV2 } from "./buscar-prenda-v2";
import { urlEtiquetasDePrecio } from "./etiqueta-precio-reglas";
import { lineasEnUrl, MAX_VARIANTES_EN_URL } from "./existencias-prendas";
import { diaYHoraLima, hoyLima } from "./fechas-lima";
import type { CampoDeGuia } from "./guia-campos";

export type PrendaLlegada = PrendaBuscableV2 & { productoId: string; colorHex?: string | null; fotoUrl?: string | null };

/** Una prenda de lo que llegó. `costo` es texto porque es lo que se teclea; vacío = sin costo (no toca el costo de la prenda). */
export type LineaLlegada = { varianteId: string; cantidad: number; costo: string };

/** Suma `n` de una prenda. Si ya estaba, crece su cantidad en su lugar; si es nueva, entra ARRIBA (lo último leído se ve sin bajar). */
export function sumarPrenda(lineas: readonly LineaLlegada[], varianteId: string, n = 1): LineaLlegada[] {
  if (lineas.some((l) => l.varianteId === varianteId)) {
    return lineas.map((l) => (l.varianteId === varianteId ? { ...l, cantidad: l.cantidad + n } : l)).filter((l) => l.cantidad > 0);
  }
  return n > 0 ? [{ varianteId, cantidad: n, costo: "" }, ...lineas] : [...lineas];
}

/** La cantidad escrita a mano. Cero o menos quita la prenda: «0 llegaron» es lo mismo que no haberla leído. */
export function fijarCantidad(lineas: readonly LineaLlegada[], varianteId: string, cantidad: number): LineaLlegada[] {
  const n = Number.isFinite(cantidad) ? Math.floor(cantidad) : 0;
  return lineas.flatMap((l) => (l.varianteId !== varianteId ? [l] : n > 0 ? [{ ...l, cantidad: n }] : []));
}

export function fijarCosto(lineas: readonly LineaLlegada[], varianteId: string, costo: string): LineaLlegada[] {
  // Un negativo se recorta a 0 aquí, antes de viajar hasta el `check (costo >= 0)` de la base.
  const limpio = costo.trim() === "" ? "" : String(Math.max(0, Number(costo) || 0));
  return lineas.map((l) => (l.varianteId === varianteId ? { ...l, costo: limpio } : l));
}

export function totalUnidades(lineas: readonly LineaLlegada[]): number {
  return lineas.reduce((a, l) => a + l.cantidad, 0);
}

/**
 * Las prendas que coinciden con lo escrito, con las del proveedor elegido PRIMERO. El orden dentro de cada grupo es el del
 * catálogo (estable). No esconde a las de otras marcas: un proveedor puede traer una marca que todavía no se le vinculó.
 */
export function sugerirPrendas<T extends PrendaLlegada>(texto: string, prendas: readonly T[], marcasDelProveedor: readonly string[], max = 6): T[] {
  if (clave(texto).length < 2) return [];
  const suyas = new Set(marcasDelProveedor.map((m) => clave(m)));
  const todas = filtrarPrendasV2(texto, [...prendas], prendas.length);
  const delProveedor = todas.filter((p) => p.marca && suyas.has(clave(p.marca)));
  const otras = todas.filter((p) => !(p.marca && suyas.has(clave(p.marca))));
  return [...delProveedor, ...otras].slice(0, max);
}

/**
 * Qué hace un Enter en el buscador (la pistola escribe el código y manda Enter). El código exacto gana; si no, la primera
 * sugerencia —la misma que se ve arriba de la lista—; si nada coincide, se dice.
 */
export function leerTexto<T extends PrendaLlegada>(texto: string, prendas: readonly T[], marcasDelProveedor: readonly string[]): T | null {
  const exacta = resolverCodigoV2(texto, [...prendas]);
  if (exacta) return exacta;
  return sugerirPrendas(texto, prendas, marcasDelProveedor, 1)[0] ?? null;
}

/** Lo que pide el buscador, siguiendo al proveedor elegido (ADR-0290): sin proveedor, una instrucción que no promete nada. */
export function textoDelBuscador(proveedor: { nombre: string; marcas: readonly string[] } | null): string {
  if (!proveedor) return "Escanea la etiqueta o escribe el nombre de la prenda";
  const de = proveedor.marcas.length === 1 ? proveedor.marcas[0] : proveedor.nombre;
  return `Escanea o escribe una prenda de ${de}`;
}

/** El proveedor como se lee en su lista: la razón social y, si las tiene, las marcas con que el equipo lo conoce (ADR-0140). */
export function textoDelProveedor(nombre: string, marcas: readonly string[]): string {
  if (marcas.length === 0) return nombre;
  const nombreClave = clave(nombre);
  const otras = marcas.filter((m) => clave(m) !== nombreClave);
  return otras.length === 0 ? nombre : `${nombre} · ${otras.join(", ")}`;
}

/** Una factura ya registrada a la que todavía le falta mercadería en ESTA sede (`listarPorRecibir` con la sede, ADR-0139). */
export type FacturaPendiente = { id: string; proveedorId: string; documento: string; fechaEmision: string; pendientes: number };

/** Las facturas de ese proveedor que le faltan a esta sede, la más antigua primero: es la que más probablemente llegó. */
export function facturasDelProveedor(facturas: readonly FacturaPendiente[], proveedorId: string): FacturaPendiente[] {
  if (!proveedorId) return [];
  return facturas
    .filter((f) => f.proveedorId === proveedorId && f.pendientes > 0)
    .sort((a, b) => a.fechaEmision.localeCompare(b.fechaEmision) || a.documento.localeCompare(b.documento));
}

/** Recibir contra esa factura: la vista de siempre (`RecepcionEnvio`) con el comprobante ya marcado. */
export function urlContraFactura(compraId: string): string {
  return `/recibir?vista=factura&compra=${compraId}`;
}

/**
 * Los campos de la guía de foco: lo mismo que apaga el botón «Recibir», en el orden de la pantalla. La pregunta de la factura
 * solo aparece si ese proveedor tiene facturas pendientes aquí, y es SUGERIDA: se puede recibir sin contestarla (ADR-0330).
 */
export function camposDeLlegada(p: {
  proveedorId: string;
  lineas: readonly LineaLlegada[];
  responsableListo: boolean;
  responsableMotivo: string | null;
  /** `null`: el proveedor no tiene facturas pendientes aquí (no se pregunta). `true`/`false`: si ya se contestó. */
  facturaRespondida?: boolean | null;
}): CampoDeGuia[] {
  const factura: CampoDeGuia[] =
    p.facturaRespondida == null
      ? []
      : [{ id: "llegada-factura", nombre: "Factura", requerido: false, sugerido: true, hecho: p.facturaRespondida, pendiente: "Dime si viene con la factura." }];
  return [
    { id: "llegada-proveedor", nombre: "De quién", requerido: true, hecho: p.proveedorId !== "", pendiente: "Elige el proveedor." },
    ...factura,
    { id: "llegada-prendas", nombre: "Qué llegó", requerido: true, hecho: totalUnidades(p.lineas) > 0, pendiente: "Escanea o busca las prendas que llegaron." },
    {
      id: "llegada-responsable",
      nombre: "Quién recibe",
      requerido: true,
      hecho: p.responsableListo,
      pendiente: p.responsableMotivo ?? "Elige quién recibe.",
    },
  ];
}

/** Los parámetros de `recibir_lote`, como los espera la base. `confirmadas`: las líneas (desde 1) cuyo costo atípico confirmó el líder. */
export function pedidoRecibirLote(p: {
  ubicacionId: string;
  proveedorId: string;
  lineas: readonly LineaLlegada[];
  numeroGuia: string;
  token: string;
  confirmadas?: readonly number[] | null;
}) {
  const validas = p.lineas.filter((l) => l.cantidad > 0);
  return {
    p_ubicacion_id: p.ubicacionId,
    p_proveedor_id: p.proveedorId,
    p_items: validas.map((l, n) => ({
      variante_id: l.varianteId,
      cantidad: l.cantidad,
      ...(l.costo !== "" ? { costo_unitario: Number(l.costo) } : {}),
      // Solo en el reintento tras `costo_atipico` y solo en las líneas que vio el líder (20260930122000).
      ...(p.confirmadas?.includes(n + 1) ? { confirma_costo: true } : {}),
    })),
    p_numero_guia: p.numeroGuia.trim() || undefined,
    p_token: p.token,
  };
}

/** La línea de la pantalla (su varianteId) que la base marcó como atípica: la base numera desde 1 sobre las líneas enviadas. */
export function varianteDeLineaEnviada(lineas: readonly LineaLlegada[], linea: number | null): string | null {
  if (linea === null) return null;
  return lineas.filter((l) => l.cantidad > 0)[linea - 1]?.varianteId ?? null;
}

/** Una llegada ya recibida en esta sede (de `getRecepcionesRecientes` con la sede). */
export type LlegadaReciente = { proveedorId: string | null; fecha: string; unidades: number; recibidoPor: string | null };

/**
 * Lo que ese proveedor ya metió HOY (día de Lima) en esta sede. Dos tablets, una caja: el token frena el doble clic de UNA
 * persona, no a dos personas recibiendo lo mismo. Por eso la puerta lo dice antes de recibir, sin bloquear (pueden ser dos
 * entregas de verdad).
 */
export function yaEntroHoy(recientes: readonly LlegadaReciente[], proveedorId: string, ahora: Date = new Date()): LlegadaReciente[] {
  if (!proveedorId) return [];
  const hoy = hoyLima(ahora);
  return recientes.filter((r) => r.proveedorId === proveedorId && hoyLima(new Date(r.fecha)) === hoy).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** El aviso, en una frase; null si hoy no entró nada de ese proveedor. */
export function avisoMismaCaja(entradas: readonly LlegadaReciente[], proveedorNombre: string): string | null {
  if (entradas.length === 0) return null;
  const ultima = entradas[0];
  const hora = diaYHoraLima(ultima.fecha).hora;
  const quien = ultima.recibidoPor ? `, la recibió ${ultima.recibidoPor}` : "";
  if (entradas.length === 1) {
    return `Hoy a las ${hora} ya entraron ${ultima.unidades} ${ultima.unidades === 1 ? "prenda" : "prendas"} de ${proveedorNombre}${quien}. Si es la misma caja, no la recibas de nuevo.`;
  }
  const unidades = entradas.reduce((a, e) => a + e.unidades, 0);
  return `Hoy ya entraron ${entradas.length} llegadas de ${proveedorNombre} (${unidades} prendas; la última a las ${hora}${quien}). Si es la misma caja, no la recibas de nuevo.`;
}

export type AccionDespues = { clave: "etiquetas" | "bajar"; texto: string; href: string; principal: boolean };

/**
 * Qué sigue después de recibir. Lo que llega de un proveedor viene sin la etiqueta de CAYLA: primero se etiqueta (principal) y
 * después se baja al piso (entró al almacén, ADR-0328). Sin el id del lote (quedó en la cola sin conexión) no hay etiquetas por lote.
 */
export function despuesDeRecibir(p: { loteId: string | null; lineas: readonly LineaLlegada[]; veExistencias: boolean }): AccionDespues[] {
  const unidades = totalUnidades(p.lineas);
  const acciones: AccionDespues[] = [];
  if (p.loteId) {
    acciones.push({
      clave: "etiquetas",
      texto: unidades === 1 ? "Imprimir la etiqueta de precio" : `Imprimir ${unidades} etiquetas de precio`,
      href: urlEtiquetasDePrecio({ lotes: [p.loteId] }),
      principal: true,
    });
  }
  if (p.veExistencias && p.lineas.length > 0) {
    acciones.push({
      clave: "bajar",
      texto: "Bajar al piso",
      href: p.lineas.length <= MAX_VARIANTES_EN_URL ? `/inventario/bajar?lineas=${lineasEnUrl(p.lineas)}` : "/inventario/bajar",
      principal: acciones.length === 0,
    });
  }
  return acciones;
}
