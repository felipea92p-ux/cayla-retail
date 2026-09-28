// Lógica pura del cajón de detalle de Movimientos (reemplaza la expansión vertical de una operación y el modal
// centrado `MovimientoDetalle`, diseño aprobado por Felipe, 2026-09-28). Sin React: la usan el cajón y sus pruebas.
//
// UNA operación (una o varias filas guardadas de una sola vez, `agruparPorOperacion`) entra acá y sale con TODO lo que
// el cajón necesita dibujar — ya en castellano de pantalla, ya con sus enlaces. El componente no decide nada de
// negocio: solo pinta lo que esta función le entrega.
//
// Las 5 formas (`FormaCajon`) son las 5 capturas aprobadas. Un motivo que no esté explícitamente en ninguna de las 5
// cae en «individual» (una sola prenda: Venta es su ejemplo) — mismo patrón, con sus propios campos (ADR pendiente:
// «reutiliza el mismo patrón visual y adapta los campos», instrucción del pedido, sección 12).

import {
  etiquetaConDireccion,
  etiquetaMovimiento,
  etiquetaProceso,
  nombreCortoSububicacion,
  partesOrigenDestino,
  referenciaMovimiento,
  resumirOperacion,
  textoComprobante,
  type Movimiento,
  type OperacionMovimiento,
  type ReferenciaMovimiento,
} from "./movimientos-reglas";
import type { ApartadoDeMovimiento } from "./movimientos-atajos";

export type FormaCajon = "grupo" | "individual" | "cambio" | "interno" | "ajuste";

/** Qué forma de cajón le toca a una operación. Pura función de sus filas — nunca del ancho de pantalla ni de nada
 *  visual. `interno` y `ajuste` son SIEMPRE su propia forma (así tengan una fila o diez): el título ya dice qué pasó
 *  y listar «1 prenda distinta» adentro no es un caso raro. Cualquier otra operación de más de una fila usa `grupo`
 *  (el patrón «Incluye N prendas» de Traslado recibido); de una sola fila, `individual` (el patrón de Venta). */
export function formaDeOperacion(op: OperacionMovimiento): FormaCajon {
  const primera = op.filas[0];
  if (primera.motivo === "cambio") return "cambio";
  if (primera.categoria === "interno") return "interno";
  if (primera.categoria === "ajuste") return "ajuste";
  return op.filas.length > 1 ? "grupo" : "individual";
}

/** Icono a pintar en la lista/cajón según entra, sale o es neutro — mismo criterio que `PUNTO_MOVIMIENTO` de
 *  `FilaMovimiento.tsx`, pero como un tono para las cifras (no un punto). */
export type TonoCifra = "verde" | "rojo" | "neutro" | "ambar";

export function tonoDelta(delta: number, forma: FormaCajon): TonoCifra {
  if (forma === "interno") return "neutro";
  if (delta > 0) return "verde";
  if (delta < 0) return forma === "ajuste" ? "rojo" : "neutro"; // una venta no es alarma (sección 16 del pedido); un ajuste que resta, sí
  return "neutro";
}

/** Una celda del resumen superior (las 3 cajas o la tira dividida, según la forma). */
export type CeldaResumen = { valor: string; etiqueta: string; tono?: TonoCifra };

/** Un ítem de la lista «Incluye N prendas» (grupo/interno) o de «Sale»/«Entra» (cambio). */
export type ItemPrenda = {
  varianteId: string;
  referencia: string;
  variante: string | null; // "L · Azul marino"
  fotoUrl: string | null;
  cifra: string; // "+6", "3 unidades", "−1"
  /** El número sin formatear detrás de `cifra` (sin signo ni texto): para pluralizar "unidad"/"unidades" sin volver
   *  a parsear el string mostrado — que lleva el guion Unicode «−», no el ASCII, y `Number()` no lo entiende. */
  unidades: number;
  tono: TonoCifra;
};

/** Una fila de datos (icono + etiqueta + valor) del cuerpo del cajón. */
export type FilaDetalle = {
  clave: string;
  etiqueta: string;
  valor: string;
  subvalor?: string | null; // p.ej. "Piso → Clienta" en taupe bajo "Salida · Venta"
};

/** Un link de «Consultar»: solo lectura, nunca una acción operativa (sección 14 del pedido). */
export type ConsultarLink = {
  clave: string;
  texto: string;
  href?: string;
  /** Sin `href`: abre algo EN esta pantalla (hoy solo la venta, en su propio modal ya existente). */
  onClick?: "abrir_venta";
  /** Estilo del icono final tal cual la captura aprobada de ESE cajón: unas usan flecha de salida, otras «›». */
  iconoFinal: "externo" | "cursor";
};

export type DetalleCajon = {
  forma: FormaCajon;
  clave: string;
  titulo: string;
  subtitulo: string | null;
  fotoUrl: string | null; // solo `individual`: la foto real de la prenda: en las demás formas es el isotipo
  resumen: CeldaResumen[];
  /** Referencia (Traslado N / Boleta / Conteo N / Factura…), si el proceso tiene una. */
  referencia: (ReferenciaMovimiento & { icono: "documento" | "copiar" }) | null;
  /** Solo `interno`: la nota fija ("Movimiento interno, no cambia..."). */
  notaDetalle: string | null;
  /** `grupo` / `interno`: la lista de prendas que viajaron juntas. */
  items: ItemPrenda[] | null;
  /** `cambio`: lo que sale y lo que entra, cada uno con sus prendas (casi siempre una). */
  sale: ItemPrenda[] | null;
  entra: ItemPrenda[] | null;
  /** `cambio`: el mensaje fijo de la captura. `interno`: "Stock total de sede: sin cambios." `grupo` (una entrada):
   *  "Antes: 0 · Ahora: N unidades" ya resuelto en `resumen` si aplica — acá solo el texto libre cuando no hay cifras. */
  notaImpacto: string | null;
  /** `individual` / `ajuste`: antes/después reales (derivados de `delta` + el saldo de `fn_movimientos_saldos`).
   *  Null si la base no trajo el saldo (se degrada sin la sección, principio 9 — nunca se inventa). */
  stock: { antes: number; despues: number } | null;
  filaMovimiento: FilaDetalle | null; // `individual`: "Movimiento" con su ruta
  motivo: string | null; // `ajuste`: "Diferencia detectada en conteo físico" o la nota del ajuste manual
  fechaHora: string; // "28/09/2026 · 10:59"
  realizadoPor: string | null; // "Caja / Vendedora" — null si es carga de sistema
  consultar: ConsultarLink[];
};

/** Lo que el cajón necesita del entorno para armar enlaces y "quedan"/"realizado por" — todo dato REAL, nada
 *  inventado (sección 17 del pedido): si algo no llega, la sección correspondiente se omite. */
export type ContextoCajon = {
  prendas: Record<string, { productoId: string; fotoUrl: string | null }>;
  /** Cuántas quedaron en la sede tras CADA fila (por id de movimiento) — `fn_movimientos_saldos`. Null = sin el dato. */
  saldos: Record<string, number> | null;
  apartados: Record<string, ApartadoDeMovimiento>;
  enlaceVentas: boolean;
  enlaceCompras: boolean;
  /** Los módulos que ve quien mira (`persona.modulos`): un apartado solo enlaza a Apartados si el rol lo ve — mismo
   *  candado que ya usa `referenciaApartado` de `FilaMovimiento.tsx` (ADR-0161). */
  modulosVisibles: readonly string[];
  volverA: string;
};

function conVuelta(href: string, volverA: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}volver=${encodeURIComponent(volverA)}`;
}

function itemDeFila(m: Movimiento, ctx: ContextoCajon, forma: FormaCajon): ItemPrenda {
  const variante = [m.talla, m.color].filter(Boolean).join(" · ") || null;
  const cifra = m.categoria === "interno" ? `${Math.abs(m.cantidad)} ${Math.abs(m.cantidad) === 1 ? "unidad" : "unidades"}` : `${m.delta > 0 ? "+" : m.delta < 0 ? "−" : ""}${Math.abs(m.delta)}`;
  // En «Cambio» la prenda que sale y la que entra SÍ se colorean (rojo/verde, como en la captura aprobada) aunque una
  // venta sola no lo haga: acá la clienta se está llevando algo puntual, no es el patrón general de salida silenciosa.
  const tono: TonoCifra = forma === "cambio" ? (m.delta < 0 ? "rojo" : "verde") : tonoDelta(m.delta, forma);
  return {
    varianteId: m.varianteId,
    referencia: m.referencia,
    variante,
    fotoUrl: ctx.prendas[m.varianteId]?.fotoUrl ?? null,
    cifra,
    unidades: m.categoria === "interno" ? Math.abs(m.cantidad) : Math.abs(m.delta),
    tono,
  };
}

/** «28/09/2026 · 10:59», con la fecha `aaaa-mm-dd` real de la fila (no `fechaCorta`, que es d/m/a — acá se pide
 *  d/m/aaaa completo, como en las 5 capturas). */
function fechaHoraCompleta(fecha: string, hora: string): string {
  const [a, m, d] = fecha.split("-");
  return `${d}/${m}/${a} · ${hora}`;
}

function referenciaApartado(m: Movimiento, ctx: ContextoCajon): ReferenciaMovimiento | null {
  const a = ctx.apartados[m.id];
  if (!a) return null;
  return { texto: a.codigo, detalle: a.clienta || null, href: ctx.modulosVisibles.includes("apartados") ? `/vender/apartados?abrir=${a.separacionId}` : null };
}

/** El nombre "de tienda" de quién lo hizo: sección 8 del pedido — no hay columna de rol en la fila, solo el nombre.
 *  Sin persona (carga de sistema), null: la sección "Realizado por" se omite en vez de inventar un rol. */
function realizadoPor(m: Movimiento): string | null {
  if (m.esSistema) return null;
  if (!m.usuario) return null;
  return m.usuario;
}

export function construirDetalleCajon(op: OperacionMovimiento, ctx: ContextoCajon): DetalleCajon {
  const forma = formaDeOperacion(op);
  const primera = op.filas[0];
  const r = resumirOperacion(op, { enlaceCompras: ctx.enlaceCompras });
  const fechaHora = fechaHoraCompleta(op.fecha, op.hora);
  const consultarHistorial: ConsultarLink = {
    clave: "historial",
    texto: op.filas.length > 1 ? "Ver historial relacionado" : "Ver historial de esta variante",
    href: `/productos/${ctx.prendas[primera.varianteId]?.productoId ?? ""}/historial`,
    iconoFinal: "cursor",
  };

  if (forma === "cambio") {
    const sale = op.filas.filter((m) => m.delta < 0).map((m) => itemDeFila(m, ctx, forma));
    const entra = op.filas.filter((m) => m.delta > 0).map((m) => itemDeFila(m, ctx, forma));
    const refVenta = primera.venta?.comprobante ? { texto: textoComprobante(primera.venta.comprobante), detalle: null, href: null } : null;
    return {
      forma,
      clave: op.clave,
      titulo: "Cambio",
      subtitulo: r.productos[0] ?? primera.referencia,
      fotoUrl: null,
      resumen: [
        { valor: [r.entran > 0 && `+${r.entran}`, r.salen > 0 && `−${r.salen}`].filter(Boolean).join(" / ") || "—", etiqueta: "Movimiento" },
        { valor: nombreCortoSububicacion(primera.sububicacion), etiqueta: "Sede" },
        { valor: op.hora, etiqueta: "Hora" },
      ],
      referencia: refVenta ? { ...refVenta, icono: "copiar" } : null,
      notaDetalle: null,
      items: null,
      sale,
      entra,
      notaImpacto: "Intercambio registrado en la misma sede.",
      stock: null,
      filaMovimiento: null,
      motivo: null,
      fechaHora,
      realizadoPor: realizadoPor(primera),
      consultar: [
        ...(ctx.enlaceVentas && primera.venta ? [{ clave: "boleta", texto: "Ver boleta", onClick: "abrir_venta" as const, iconoFinal: "cursor" as const }] : []),
        consultarHistorial,
      ],
    };
  }

  if (forma === "interno") {
    const items = op.filas.map((m) => itemDeFila(m, ctx, forma));
    const unidades = op.filas.reduce((s, m) => s + Math.abs(m.cantidad), 0);
    return {
      forma,
      clave: op.clave,
      titulo: etiquetaMovimiento(primera),
      subtitulo: op.filas.length > 1 ? resumenProductos(r.productos) : null,
      fotoUrl: null,
      resumen: [
        { valor: `${unidades}`, etiqueta: "unidades" },
        { valor: `${nombreCortoSububicacion(primera.sububicacion)} → ${nombreCortoSububicacion(primera.sububicacionDestino)}`, etiqueta: "ruta" },
        { valor: `${r.variantes}`, etiqueta: r.variantes === 1 ? "prenda distinta" : "prendas distintas" },
      ],
      referencia: null,
      notaDetalle: "Movimiento interno, no cambia el total de stock de la sede.",
      items,
      sale: null,
      entra: null,
      notaImpacto: "Stock total de sede: sin cambios.",
      stock: null,
      filaMovimiento: null,
      motivo: null,
      fechaHora,
      realizadoPor: realizadoPor(primera),
      consultar: [
        { clave: "existencias", texto: "Ver existencias", href: `/inventario?variante=${primera.varianteId}`, iconoFinal: "cursor" },
        consultarHistorial,
      ],
    };
  }

  if (forma === "ajuste") {
    const saldo = ctx.saldos?.[primera.id] ?? null;
    const esConteo = Boolean(primera.conteo);
    const refConteo = esConteo ? referenciaMovimiento(primera) : null;
    return {
      forma,
      clave: op.clave,
      titulo: esConteo ? "Ajuste por conteo" : etiquetaProceso(primera.motivo),
      subtitulo: [primera.referencia, primera.talla, primera.color].filter(Boolean).join(" · "),
      fotoUrl: null,
      resumen: [
        { valor: `${primera.delta > 0 ? "+" : "−"}${Math.abs(primera.delta)} unidad${Math.abs(primera.delta) === 1 ? "" : "es"}`, etiqueta: "AJUSTE", tono: tonoDelta(primera.delta, forma) },
        { valor: nombreCortoSububicacion(primera.sububicacion), etiqueta: "UBICACIÓN" },
        { valor: primera.hora, etiqueta: "FECHA" },
      ],
      referencia: refConteo ? { ...refConteo, icono: "documento" } : null,
      notaDetalle: null,
      items: null,
      sale: null,
      entra: null,
      notaImpacto: null,
      stock: saldo !== null ? { antes: saldo - primera.delta, despues: saldo } : null,
      filaMovimiento: null,
      motivo: esConteo ? "Diferencia detectada en conteo físico" : (primera.nota ?? etiquetaProceso(primera.motivo)),
      fechaHora,
      realizadoPor: realizadoPor(primera),
      consultar: [...(refConteo ? [{ clave: "conteo", texto: "Ver conteo", href: refConteo.href ?? undefined, iconoFinal: "externo" as const }] : []), { ...consultarHistorial, iconoFinal: "cursor" as const }],
    };
  }

  if (forma === "grupo") {
    const items = op.filas.map((m) => itemDeFila(m, ctx, forma));
    const esEntradaSimple = r.entran > 0 && r.salen === 0;
    const { origen, destino } = partesOrigenDestino(primera);
    const referencia = r.referencia;
    // Título SIN el prefijo Entrada/Salida (literal a la captura, «Traslado recibido» a secas — la fila de la lista
    // sí lo lleva, acá el verde/rojo del resumen ya dice la dirección): las filas mezcladas (un cambio de varios
    // ítems, caso raro) siguen usando el nombre del proceso a secas, igual que ya hacía `resumirOperacion`.
    const tituloSinDireccion = new Set(op.filas.map((m) => etiquetaConDireccion(m))).size > 1 ? etiquetaProceso(primera.motivo) : etiquetaMovimiento(primera);
    return {
      forma,
      clave: op.clave,
      titulo: tituloSinDireccion,
      subtitulo: resumenProductos(r.productos),
      fotoUrl: null,
      // Literal a la captura de Traslado recibido: solo la 1ª celda es número grande + etiqueta; la ruta y la
      // hora·ubicación son una sola línea cada una, sin una segunda línea de etiqueta debajo.
      resumen: [
        { valor: `${esEntradaSimple ? "+" : r.salen > 0 && r.entran === 0 ? "−" : "⇄"}${esEntradaSimple ? r.entran : r.salen > 0 && r.entran === 0 ? r.salen : r.entran + r.salen}`, etiqueta: "unidades", tono: tonoDelta(esEntradaSimple ? 1 : -1, forma) },
        { valor: destino ? `${origen} → ${destino}` : origen, etiqueta: "" },
        { valor: `${op.hora} · ${nombreCortoSububicacion(primera.sububicacion)}`, etiqueta: "" },
      ],
      referencia: referencia ? { ...referencia, icono: "documento" } : null,
      notaDetalle: null,
      items,
      sale: null,
      entra: null,
      // Literal a la captura de Traslado recibido: "antes" de que llegara este envío, 0 de ESTE envío; "ahora", lo
      // que trajo. Para una salida múltiple (una venta o devolución de varias prendas) no hay un "antes 0" honesto
      // que mostrar, así que se deja como nota de una línea en vez de inventar una cifra.
      notaImpacto: esEntradaSimple ? null : `${r.salen} ${r.salen === 1 ? "unidad salió" : "unidades salieron"} de la sede.`,
      stock: null,
      filaMovimiento: null,
      motivo: null,
      fechaHora,
      realizadoPor: realizadoPor(primera),
      consultar: [...consultarDeReferencia(primera, ctx), consultarHistorial],
    };
  }

  // individual — una sola fila: Venta es el ejemplo de la captura; cualquier otro proceso de una sola prenda
  // (devolución, producción, dañado, apartado…) usa el mismo patrón con sus propios textos.
  const saldo = ctx.saldos?.[primera.id] ?? null;
  const esApartado = primera.categoria === "apartado" || primera.categoria === "liberacion_apartado";
  const referencia = esApartado ? referenciaApartado(primera, ctx) : referenciaMovimiento(primera, { enlaceCompras: ctx.enlaceCompras });
  const { origen, destino } = partesOrigenDestino(primera);
  return {
    forma: "individual",
    clave: op.clave,
    titulo: primera.referencia,
    subtitulo: [primera.talla, primera.color].filter(Boolean).join(" · ") || null,
    fotoUrl: ctx.prendas[primera.varianteId]?.fotoUrl ?? null,
    resumen: [
      { valor: etiquetaConDireccion(primera), etiqueta: "" },
      { valor: primera.categoria === "interno" || esApartado ? `${Math.abs(primera.cantidad)}` : `${primera.delta > 0 ? "+" : primera.delta < 0 ? "−" : ""}${Math.abs(primera.delta)}`, etiqueta: primera.categoria === "interno" || esApartado ? "unidades" : "unidad", tono: tonoDelta(primera.delta, "individual") },
      { valor: saldo !== null ? `quedan ${saldo}` : "—", etiqueta: "" },
    ],
    referencia: referencia ? { ...referencia, icono: primera.venta ? "copiar" : "documento" } : null,
    notaDetalle: null,
    items: null,
    sale: null,
    entra: null,
    notaImpacto: null,
    stock: saldo !== null && !esApartado ? { antes: saldo - primera.delta, despues: saldo } : null,
    filaMovimiento: { clave: "movimiento", etiqueta: "Movimiento", valor: etiquetaConDireccion(primera), subvalor: destino ? `${origen} → ${destino}` : origen },
    motivo: null,
    fechaHora,
    realizadoPor: realizadoPor(primera),
    consultar: [...consultarDeReferencia(primera, ctx), consultarHistorial],
  };
}

/** "Vestido Sofía, Falda Renata y 3 más" — hasta 2 nombres y el resto contado, como ya hace `FilaOperacion`. */
function resumenProductos(productos: string[]): string {
  return productos.length <= 2 ? productos.join(", ") : `${productos.slice(0, 2).join(", ")} y ${productos.length - 2} más`;
}

/** Los links de Consultar que salen de la referencia del proceso (Traslado/Conteo/Compra), más "Ver boleta" cuando
 *  hay venta y quien mira ve Historial de ventas — el mismo whitelist de la sección 14 del pedido, nunca un atajo
 *  operativo. */
function consultarDeReferencia(m: Movimiento, ctx: ContextoCajon): ConsultarLink[] {
  const links: ConsultarLink[] = [];
  if (m.transferencia) links.push({ clave: "traslado", texto: "Ver traslado", href: `/inventario/traslados/${m.transferencia.id}`, iconoFinal: "externo" });
  if (m.conteo) links.push({ clave: "conteo", texto: "Ver conteo", href: `/inventario/conteo/${m.conteo.id}`, iconoFinal: "externo" });
  if (m.venta && ctx.enlaceVentas) links.push({ clave: "boleta", texto: "Ver boleta", onClick: "abrir_venta", iconoFinal: "cursor" });
  else if (m.compra && ctx.enlaceCompras) links.push({ clave: "compra", texto: "Ver comprobante de compra", href: `/compras/factura/${m.compra.id}`, iconoFinal: "externo" });
  return links;
}

export { conVuelta };
