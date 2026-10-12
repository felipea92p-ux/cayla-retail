import { lineasEnUrl, MAX_VARIANTES_EN_URL } from "./existencias-prendas";
import type { Movimiento } from "./movimientos-reglas";

// Atajos de Movimientos (ADR-0241): desde lo que pasó, a la pantalla que ya hace lo siguiente — con la prenda cargada.
// Movimientos sigue siendo un historial que no escribe nada: cada atajo LLEVA a otra pantalla (Cambios, Devoluciones,
// Bajar al piso, Etiquetas, Conteo, Existencias, Apartados) o abre el modal de siempre (Ajustar), nunca hace el trabajo
// aquí. Cada uno aparece solo si quien mira ve ese módulo (ADR-0161): un atajo que termina en «Sin acceso» es peor que
// no tenerlo.
//
// Lógica pura, sin React: la usan el detalle de un movimiento y la fila desplegada de una operación, y se prueba sola.

/** Lo que Movimientos sabe del apartado de un movimiento (`apartados.movimiento_id` o `movimiento_cierre_id` →
 *  `separaciones`). Lo lee `getApartadosDeMovimientos`; null si no se pudo leer o el apartado es anterior a
 *  Apartados v2 (sin separación). */
export type ApartadoDeMovimiento = {
  separacionId: string;
  codigo: string;
  /** «María P.»: nombre y la inicial del apellido, como en la lista de Apartados. */
  clienta: string;
  estado: "abierta" | "entregada" | "liberada" | "devuelta" | string;
  /** `aaaa-mm-dd`. */
  venceEl: string | null;
};

export type AccesosAtajos = {
  /** Las claves de módulo que la cuenta ve (`persona.modulos`). */
  modulos: readonly string[];
  /** `puede(persona, "ajustarStock")`: el mismo candado que el botón «Ajustar» de Existencias (ADR-0250). */
  puedeAjustar: boolean;
};

export type Atajo = {
  clave: "cambio" | "devolucion" | "bajar" | "etiquetas" | "contar" | "ajustar" | "existencias" | "apartado";
  texto: string;
  detalle: string;
  /** A dónde lleva. Sin `href`, es una acción de la pantalla (hoy solo «ajustar»: abre `AjustarInventarioModal`). */
  href?: string;
  /** El que se destaca (fondo tinta): lo más probable que se quiera hacer después de ESTE movimiento. */
  principal?: boolean;
};

/** Lo que entró a la sede y se puede bajar o etiquetar: lo que llegó de afuera (proveedor, Taller, producción, stock
 *  inicial). Una devolución o un cambio también suman, pero la prenda vuelve al piso con su etiqueta: no aplica. */
function esLlegada(m: Pick<Movimiento, "delta" | "categoria" | "motivo">): boolean {
  if (m.delta <= 0) return false;
  if (m.categoria !== "entrada" && m.categoria !== "transferencia") return false;
  return m.motivo !== "devolucion" && m.motivo !== "cambio";
}

/** La zona de ESTA sede donde quedó: en una pierna de traslado es `sububicacion` o `sububicacionDestino`. */
function zonaDeLaSede(m: Pick<Movimiento, "sububicacion" | "sububicacionDestino">): string | null {
  return (m.sububicacion ?? m.sububicacionDestino)?.tipo ?? null;
}

/** La boleta o factura como la busca Cambios y Devoluciones (`parsearComprobante`: «B004-000031»). */
function busquedaDeVenta(m: Pick<Movimiento, "venta">): string | null {
  return m.venta?.comprobante?.numero ?? null;
}

export function hrefEtiquetas(varianteIds: readonly string[]): string | null {
  const ids = [...new Set(varianteIds)];
  if (ids.length === 0 || ids.length > MAX_VARIANTES_EN_URL) return null;
  return `/etiquetas-de-precio?variantes=${ids.join(",")}`;
}

/** «Bajar al piso» con las tallas cargadas «por escanear» (el 1 es solo la forma del enlace: ADR-0237). */
export function hrefBajarAlPiso(varianteIds: readonly string[]): string | null {
  const ids = [...new Set(varianteIds)];
  if (ids.length === 0 || ids.length > MAX_VARIANTES_EN_URL) return null;
  return `/inventario/bajar?lineas=${lineasEnUrl(ids.map((varianteId) => ({ varianteId, cantidad: 1 })))}`;
}

/** Los atajos del detalle de UN movimiento, en el orden en que se ofrecen: primero lo propio de su proceso, después
 *  corregir y, al final, ver la prenda en Existencias. */
export function atajosDeMovimiento(m: Movimiento, accesos: AccesosAtajos, apartado?: ApartadoDeMovimiento | null): Atajo[] {
  const ve = (clave: string) => accesos.modulos.includes(clave);
  const atajos: Atajo[] = [];

  // Una venta: lo que la clienta vuelve a pedir es cambiarla o devolverla. Solo con comprobante (sin él, Cambios no
  // tiene con qué buscarla y el atajo llevaría a una búsqueda vacía).
  const venta = m.motivo === "venta" ? busquedaDeVenta(m) : null;
  if (venta) {
    if (ve("cambios")) atajos.push({ clave: "cambio", texto: "Cambio", detalle: "talla o color", href: `/cambios?q=${encodeURIComponent(venta)}` });
    if (ve("devoluciones")) atajos.push({ clave: "devolucion", texto: "Devolución", detalle: "reingresa la prenda", href: `/devoluciones?q=${encodeURIComponent(venta)}` });
  }

  // Lo que llegó: colgarlo (si quedó en el almacén) y etiquetarlo.
  if (esLlegada(m)) {
    const bajar = zonaDeLaSede(m) === "almacen_tienda" && ve("existencias") ? hrefBajarAlPiso([m.varianteId]) : null;
    if (bajar) atajos.push({ clave: "bajar", texto: "Bajar al piso", detalle: "llega con esta talla cargada", href: bajar, principal: true });
    const etiquetas = hrefEtiquetas([m.varianteId]);
    if (etiquetas) atajos.push({ clave: "etiquetas", texto: "Imprimir etiqueta", detalle: [m.talla, m.color].filter(Boolean).join(" · ") || "de esta prenda", href: etiquetas });
  }

  // Un apartado: al apartado exacto, donde se cobra el saldo, se recuerda o se libera.
  const esApartado = m.categoria === "apartado" || m.categoria === "liberacion_apartado";
  if (esApartado && apartado && ve("apartados")) {
    atajos.push({
      clave: "apartado",
      texto: `Abrir ${apartado.codigo}`,
      detalle: apartado.estado === "abierta" ? "cobrar el saldo, recordar o liberar" : "ver cómo terminó",
      href: `/vender/apartados?abrir=${apartado.separacionId}`,
      principal: true,
    });
  }

  // Corregir: el movimiento no se toca; se cuenta la prenda o se ajusta con otro movimiento (la nota del pie lo promete).
  // No en una venta ni en un apartado: ahí se corrige con un cambio, una devolución o liberándolo.
  if (m.motivo !== "venta" && !esApartado) {
    if (ve("conteos")) atajos.push({ clave: "contar", texto: "Contar", detalle: "esta prenda", href: `/inventario/conteo?variantes=${m.varianteId}` });
    if (accesos.puedeAjustar) atajos.push({ clave: "ajustar", texto: "Corregir", detalle: "con un ajuste" });
  }

  if (ve("existencias")) {
    atajos.push({ clave: "existencias", texto: "Ver en Existencias", detalle: "tallas, piso y almacén, dónde más hay", href: `/inventario?variante=${m.varianteId}` });
  }
  return atajos;
}

/** Lo que se hace con una operación ENTERA desde su fila desplegada: bajar o etiquetar todo lo que llegó junto
 *  («Bajar estas 12 al piso»). Una venta de varias prendas no: el cambio y la devolución se eligen prenda por prenda. */
export function atajosDeOperacion(filas: readonly Movimiento[], accesos: AccesosAtajos): Atajo[] {
  const llegadas = filas.filter(esLlegada);
  if (llegadas.length < 2 || llegadas.length !== filas.length) return [];
  const ve = (clave: string) => accesos.modulos.includes(clave);
  const ids = [...new Set(llegadas.map((m) => m.varianteId))];
  const atajos: Atajo[] = [];
  const alAlmacen = llegadas.filter((m) => zonaDeLaSede(m) === "almacen_tienda").map((m) => m.varianteId);
  const bajar = alAlmacen.length > 0 && ve("existencias") ? hrefBajarAlPiso(alAlmacen) : null;
  const nBajar = new Set(alAlmacen).size;
  if (bajar) atajos.push({ clave: "bajar", texto: `Bajar ${nBajar === 1 ? "esta" : `estas ${nBajar}`} al piso`, detalle: "", href: bajar, principal: true });
  const etiquetas = hrefEtiquetas(ids);
  if (etiquetas) atajos.push({ clave: "etiquetas", texto: `Imprimir ${ids.length} ${ids.length === 1 ? "etiqueta" : "etiquetas"}`, detalle: "", href: etiquetas });
  return atajos;
}
