// Lógica pura del cajón de detalle de Movimientos (reemplaza la expansión vertical de una operación y el modal
// centrado `MovimientoDetalle`, diseño aprobado por Felipe, 2026-09-28). Sin React: la usan el cajón y sus pruebas.
//
// UNA operación (una o varias filas guardadas de una sola vez, `agruparPorOperacion`) entra acá y sale con TODO lo que
// el cajón necesita dibujar — ya en castellano de pantalla, ya con sus enlaces. El componente no decide nada de
// negocio: solo pinta lo que esta función le entrega.
//
// Simplificado el 2026-10-01 (pedido de Felipe, tras leer el cajón de las bajadas como alguien sin contexto): todos los
// cajones se leen igual y sin saber de stock. Arriba, el nombre del movimiento y CUÁNDO; después UNA frase con el número
// grande («3 prendas llegaron desde Tienda Lima») y QUIÉN; el resto es lo que ayuda a creerla: la prenda, la lista, lo
// que había y lo que hay ahora en la tienda, y el documento. Se fueron las palabras de oficina («Movimiento»,
// «Referencia», «Impacto», «Consultar», «Stock Antes/Después», «variante»): cada dato dice lo que es en palabras de tienda.
//
// Las formas (`FormaCajon`) son el patrón visual de cada caso. Un motivo que no esté explícitamente en ninguna cae en
// «individual» (una sola prenda) o «grupo» (varias): mismo patrón, con su frase por defecto — nunca rompe el cajón.
// Un movimiento «interno» (piso ↔ almacén) no tiene cajón propio: se dibuja con el de las bajadas del día
// (`construirDetalleBajadas`, con una sola operación).

import {
  etiquetaConDireccion,
  etiquetaDia,
  etiquetaMovimiento,
  etiquetaProceso,
  nombreCortoSububicacion,
  partesOrigenDestino,
  referenciaMovimiento,
  resumirBajadas,
  resumirOperacion,
  type Movimiento,
  type OperacionMovimiento,
  type ReferenciaMovimiento,
} from "./movimientos-reglas";
import type { ApartadoDeMovimiento } from "./movimientos-atajos";

export type FormaCajon = "grupo" | "individual" | "cambio" | "interno" | "ajuste";

/** Qué forma de cajón le toca a una operación. Pura función de sus filas — nunca del ancho de pantalla ni de nada
 *  visual. `interno` y `ajuste` son SIEMPRE su propia forma (así tengan una fila o diez): el título ya dice qué pasó
 *  y listar «1 prenda distinta» adentro no es un caso raro. Cualquier otra operación de más de una fila usa `grupo`
 *  (una entrada o un traslado de varias prendas); de una sola fila, `individual` (una venta, un traslado de una). */
export function formaDeOperacion(op: OperacionMovimiento): FormaCajon {
  const primera = op.filas[0];
  if (primera.motivo === "cambio") return "cambio";
  if (primera.categoria === "interno") return "interno";
  if (primera.categoria === "ajuste") return "ajuste";
  return op.filas.length > 1 ? "grupo" : "individual";
}

/** Color de una cifra: verde suma, rojo falta (solo un ajuste que resta: ahí sí hay que mirar), neutro el resto. */
export type TonoCifra = "verde" | "rojo" | "neutro";

/** Una prenda de una lista (grupo, ajuste de varias, cambio): nombre, talla · color, y cuántas, ya dicho:
 *  «3 prendas», «1 prenda», «2 más», «5 menos». */
export type ItemPrenda = {
  varianteId: string;
  referencia: string;
  variante: string | null; // "L · Azul marino"
  fotoUrl: string | null;
  cantidad: string;
  tono: TonoCifra;
};

/** Una fila de «Más información»: el documento del movimiento (traslado, boleta, conteo, factura…) o el historial de la
 *  prenda. Con `href` o `onClick` se puede abrir; sin ninguno es solo una línea informativa (el documento existe pero
 *  quien mira no tiene el módulo para abrirlo). Solo lectura: nunca una acción que mueva stock. */
export type ConsultarLink = {
  clave: string;
  texto: string; // «Traslado 99», «Boleta B001-000001», «Historial de esta prenda»
  detalle?: string | null; // «Guía 123 · Proveedor SAC»
  href?: string;
  /** Sin `href`: abre algo EN esta pantalla (hoy solo la venta, en su propio modal ya existente). */
  onClick?: "abrir_venta";
};

export type DetalleCajon = {
  forma: FormaCajon;
  clave: string;
  titulo: string; // el nombre del movimiento, sin «Entrada ·» / «Salida ·»: «Venta», «Traslado recibido»
  /** «Hoy, a las 10:59» · «Lunes 28 de septiembre, a las 10:59». */
  cuando: string;
  /** Solo cuando el movimiento es de UNA prenda (venta, traslado de una, ajuste de una): su foto, nombre y talla · color. */
  prenda: { referencia: string; variante: string | null; fotoUrl: string | null } | null;
  /** El número grande y la frase que lo sigue: «3» + «prendas llegaron desde Tienda Lima». */
  cifra: string;
  frase: string;
  /** En qué parte de la tienda pasó: «Almacén», «Piso de venta». Sin esto, «había 1 · ahora hay 2» (que es el total de piso
   *  y almacén juntos) no dice si se contó, se vendió o llegó en el piso o en el almacén. Null si la fila no trae lugar. */
  donde: string | null;
  /** Quién lo hizo: «Carla Ruiz y Luis Soto»; null si es carga de sistema. */
  quien: string | null;
  /** «En la tienda había 6 y ahora hay 5» (piso + almacén), derivado del saldo real y del cambio. Null si la base no
   *  trajo el saldo (se omite en vez de inventar un «antes»), si son varias prendas o si no cambia el total (apartar). */
  enTienda: { antes: number; despues: number } | null;
  /** Solo ajustes: por qué («Diferencia detectada en conteo físico» o la nota que escribió quien ajustó). */
  motivo: string | null;
  /** `grupo` y `ajuste` de varias: la lista de prendas. */
  items: ItemPrenda[] | null;
  /** `cambio`: lo que la clienta devolvió y lo que se llevó, cada uno con sus prendas (casi siempre una). */
  devolvio: ItemPrenda[] | null;
  llevo: ItemPrenda[] | null;
  consultar: ConsultarLink[];
};

/** Lo que el cajón necesita del entorno para armar enlaces y «quién»/«cuándo» — todo dato REAL, nada inventado: si algo
 *  no llega, esa línea se omite. */
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
  /** El día de hoy en Lima, para decir «Hoy» / «Ayer» en vez de una fecha. */
  hoyLima: string;
};

/** Lo que muestra el cajón: UNA operación (`DetalleCajon`) o las bajadas de un día / un movimiento interno
 *  (`DetalleBajadas`). */
export type VistaCajon = { tipo: "operacion"; detalle: DetalleCajon } | { tipo: "bajadas"; detalle: DetalleBajadas };

// ---------------------------------------------------------------------------
// Palabras de tienda: la frase de cada movimiento.
// ---------------------------------------------------------------------------

/** «1 prenda» · «3 prendas». */
function cuantasPrendas(n: number): string {
  return `${n.toLocaleString("es-PE")} ${n === 1 ? "prenda" : "prendas"}`;
}

/** «Ana» · «Ana y Luis» · «Ana, Luis y Carla». */
function unirNombres(nombres: string[]): string {
  return nombres.length <= 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** Quién lo hizo, sin repetir y en orden de aparición. Sin persona (carga de sistema), null: la línea «Por …» se omite
 *  en vez de inventar un rol. */
function quienes(filas: readonly Movimiento[]): string | null {
  const nombres = [...new Set(filas.map((m) => (m.esSistema || !m.usuario ? null : m.usuario)).filter((n): n is string => n !== null))];
  return nombres.length > 0 ? unirNombres(nombres) : null;
}

/** El lugar de la tienda donde pasó, en palabras de tienda: «Almacén», «Piso de venta»; cualquier otra sububicación
 *  (cuarentena, un rack del Taller) va con su nombre. Con varias filas en lugares distintos, todos: «Almacén y Piso de
 *  venta». Null si ninguna fila trae lugar: la línea se omite en vez de inventarlo. */
function dondeDe(filas: readonly Movimiento[]): string | null {
  const lugares = [...new Set(filas.map((m) => (m.sububicacion ? (m.sububicacion.tipo === "piso_venta" ? "Piso de venta" : m.sububicacion.tipo === "almacen_tienda" ? "Almacén" : m.sububicacion.nombre) : null)).filter((l): l is string => l !== null))];
  return lugares.length > 0 ? unirNombres(lugares) : null;
}

/** El lugar de una fila para una frase («1 prenda más en el almacén»): «el piso», «el almacén», o el nombre de otra
 *  sububicación. Null si la fila no trae lugar. */
function lugarEnFrase(m: Pick<Movimiento, "sububicacion">): string | null {
  if (!m.sububicacion) return null;
  return m.sububicacion.tipo === "piso_venta" ? "el piso" : m.sububicacion.tipo === "almacen_tienda" ? "el almacén" : m.sububicacion.nombre;
}

/** Lo que dice la frase grande de un movimiento que suma o resta stock (o aparta), desde la tienda que se mira:
 *  «prendas llegaron desde Tienda Lima», «prenda vendida». El número va aparte, en grande, delante. Un motivo sin frase
 *  propia dice, al menos, hacia dónde fue el stock. */
export function fraseDeMovimiento(m: Movimiento, n: number): string {
  const una = n === 1;
  const prenda = una ? "prenda" : "prendas";
  const { origen, destino } = partesOrigenDestino(m);
  switch (m.motivo) {
    case "venta":
      return `${prenda} ${una ? "vendida" : "vendidas"}`;
    case "anulacion_venta":
      return `${prenda} ${una ? "volvió" : "volvieron"} a la tienda: se anuló la venta`;
    case "devolucion":
      return `${prenda} ${una ? "devuelta" : "devueltas"} por un cliente`;
    case "recepcion":
      return `${prenda} ${una ? "llegó" : "llegaron"} ${m.lote?.proveedor ? `de ${m.lote.proveedor}` : "de un proveedor"}`;
    case "produccion":
      return `${prenda} ${una ? "llegó" : "llegaron"} de Producción`;
    case "carga_inicial":
      return `${prenda} ${una ? "se cargó" : "se cargaron"} como stock inicial`;
    case "traslado_entrada":
      return `${prenda} ${una ? "llegó" : "llegaron"} desde ${origen}`;
    case "traslado_salida":
      return `${prenda} ${una ? "salió" : "salieron"} hacia ${destino ?? "otra tienda"}`;
    case "traslado_anulado":
      return `${prenda} ${una ? "volvió" : "volvieron"} a la tienda: se anuló el envío`;
    case "cuarentena_liquidada":
      return `${prenda} ${una ? "dañada liquidada" : "dañadas liquidadas"}`;
    case "cuarentena_se_boto":
      return `${prenda} ${una ? "dañada botada" : "dañadas botadas"}`;
    case "cuarentena_donada":
      return `${prenda} ${una ? "dañada donada" : "dañadas donadas"}`;
    case "apartado":
      return `${prenda} ${una ? "apartada" : "apartadas"} para un cliente`;
    case "liberacion_apartado":
      return `${prenda} ${una ? "liberada: vuelve" : "liberadas: vuelven"} a estar a la venta`;
  }
  // Modelo anterior de traslado (una sola fila, sin pierna): lo dice el signo, como `etiquetaMovimiento`.
  if (m.categoria === "transferencia") return m.delta > 0 ? `${prenda} ${una ? "llegó" : "llegaron"} desde ${origen}` : `${prenda} ${una ? "salió" : "salieron"} hacia ${destino ?? "otra tienda"}`;
  return m.delta > 0 ? `${prenda} ${una ? "entró" : "entraron"} a la tienda` : `${prenda} ${una ? "salió" : "salieron"} de la tienda`;
}

/** «1 prenda más en el almacén» · «5 prendas menos en el piso»: lo que hizo un ajuste, sin signos y diciendo DÓNDE (un
 *  ajuste corrige el piso o el almacén, no «la tienda»). Sin lugar, «en la tienda». */
export function fraseDeAjuste(delta: number, lugar: string | null = null): string {
  const n = Math.abs(delta);
  return `${n === 1 ? "prenda" : "prendas"} ${delta > 0 ? "más" : "menos"} en ${lugar ?? "la tienda"}`;
}

/** «Hoy, a las 10:59» · «Ayer, a las 18:35» · «Lunes 28 de septiembre, a las 10:59». */
function cuandoDe(op: Pick<OperacionMovimiento, "fecha" | "hora">, ctx: ContextoCajon): string {
  return `${etiquetaDia(op.fecha, ctx.hoyLima)}, a las ${op.hora}`;
}

function itemDeFila(m: Movimiento, ctx: ContextoCajon, cantidad: string, tono: TonoCifra = "neutro"): ItemPrenda {
  return {
    varianteId: m.varianteId,
    referencia: m.referencia,
    variante: [m.talla, m.color].filter(Boolean).join(" · ") || null,
    fotoUrl: ctx.prendas[m.varianteId]?.fotoUrl ?? null,
    cantidad,
    tono,
  };
}

/** Cuántas prendas movió una fila de entrada/salida/traslado/apartado (el cambio de stock, o lo apartado). */
function unidadesDeFila(m: Movimiento): number {
  return m.categoria === "apartado" || m.categoria === "liberacion_apartado" ? Math.abs(m.cantidad) : Math.abs(m.delta);
}

function referenciaApartado(m: Movimiento, ctx: ContextoCajon): ReferenciaMovimiento | null {
  const a = ctx.apartados[m.id];
  if (!a) return null;
  return { texto: `Apartado ${a.codigo}`, detalle: a.clienta || null, href: ctx.modulosVisibles.includes("apartados") ? `/vender/apartados?abrir=${a.separacionId}` : null };
}

/** El documento del movimiento (traslado, conteo, boleta, factura de compra, apartado) y el historial de la prenda. El
 *  historial solo se ofrece si todas las filas son del MISMO producto: con varios, llevar al del primero sería mentir. */
function masInformacion(op: OperacionMovimiento, ctx: ContextoCajon): ConsultarLink[] {
  const primera = op.filas[0];
  const enlaces: ConsultarLink[] = [];
  const esApartado = primera.categoria === "apartado" || primera.categoria === "liberacion_apartado";
  const ref = esApartado ? referenciaApartado(primera, ctx) : referenciaMovimiento(primera, { enlaceCompras: ctx.enlaceCompras });
  if (ref) {
    const abreVenta = Boolean(primera.venta) && ctx.enlaceVentas && !ref.href;
    enlaces.push({ clave: "documento", texto: ref.texto, detalle: ref.detalle, ...(ref.href ? { href: ref.href } : abreVenta ? { onClick: "abrir_venta" as const } : {}) });
  }
  const productos = new Set(op.filas.map((m) => ctx.prendas[m.varianteId]?.productoId ?? ""));
  const [producto] = [...productos];
  if (productos.size === 1 && producto) enlaces.push({ clave: "historial", texto: op.filas.length > 1 ? "Historial de estas prendas" : "Historial de esta prenda", href: `/productos/${producto}/historial` });
  return enlaces;
}

// ---------------------------------------------------------------------------
// El cajón de una operación.
// ---------------------------------------------------------------------------

/** Lo que el cajón necesita dibujar para una operación que NO es interna (las internas van por
 *  `construirDetalleBajadas`: use `vistaDeOperacion` y no tendrás que decidirlo). */
export function construirDetalleCajon(op: OperacionMovimiento, ctx: ContextoCajon): DetalleCajon {
  const forma = formaDeOperacion(op);
  const primera = op.filas[0];
  const r = resumirOperacion(op, { enlaceCompras: ctx.enlaceCompras });
  const base = {
    forma,
    clave: op.clave,
    cuando: cuandoDe(op, ctx),
    donde: dondeDe(op.filas),
    quien: quienes(op.filas),
    prenda: null,
    enTienda: null,
    motivo: null,
    items: null,
    devolvio: null,
    llevo: null,
    consultar: masInformacion(op, ctx),
  };

  if (forma === "cambio") {
    const entra = op.filas.filter((m) => m.delta > 0);
    const sale = op.filas.filter((m) => m.delta < 0);
    return {
      ...base,
      titulo: "Cambio",
      cifra: `${r.entran}`,
      frase: r.entran === 1 && r.salen === 1 ? "prenda cambiada por otra" : `${r.entran === 1 ? "prenda devuelta" : "prendas devueltas"} por ${cuantasPrendas(r.salen)}`,
      devolvio: entra.map((m) => itemDeFila(m, ctx, cuantasPrendas(Math.abs(m.delta)))),
      llevo: sale.map((m) => itemDeFila(m, ctx, cuantasPrendas(Math.abs(m.delta)))),
    };
  }

  if (forma === "ajuste") {
    const una = op.filas.length === 1;
    const esConteo = Boolean(primera.conteo);
    const saldo = ctx.saldos?.[primera.id] ?? null;
    return {
      ...base,
      titulo: esConteo ? "Ajuste por conteo" : etiquetaProceso(primera.motivo),
      prenda: una ? { referencia: primera.referencia, variante: [primera.talla, primera.color].filter(Boolean).join(" · ") || null, fotoUrl: ctx.prendas[primera.varianteId]?.fotoUrl ?? null } : null,
      cifra: una ? `${Math.abs(primera.delta)}` : `${op.filas.length}`,
      frase: una ? fraseDeAjuste(primera.delta, lugarEnFrase(primera)) : "prendas se corrigieron",
      enTienda: una && saldo !== null ? { antes: saldo - primera.delta, despues: saldo } : null,
      motivo: esConteo ? "Diferencia detectada en conteo físico" : (primera.nota ?? etiquetaProceso(primera.motivo)),
      items: una ? null : op.filas.map((m) => itemDeFila(m, ctx, `${Math.abs(m.delta)} ${m.delta > 0 ? "más" : "menos"}`, m.delta > 0 ? "verde" : "rojo")),
    };
  }

  if (forma === "grupo") {
    const mixta = r.entran > 0 && r.salen > 0;
    const n = r.entran || r.salen || r.apartadas || r.liberadas;
    // Sin el prefijo Entrada/Salida: el cajón ya dice la dirección en la frase. Las filas mezcladas (caso raro) usan el
    // nombre del proceso a secas, como ya hacía `resumirOperacion`.
    const titulo = new Set(op.filas.map((m) => etiquetaConDireccion(m))).size > 1 ? etiquetaProceso(primera.motivo) : etiquetaMovimiento(primera);
    return {
      ...base,
      titulo,
      cifra: `${mixta ? op.filas.length : n}`,
      frase: mixta ? "prendas se movieron" : fraseDeMovimiento(primera, n),
      items: op.filas.map((m) => itemDeFila(m, ctx, cuantasPrendas(unidadesDeFila(m)))),
    };
  }

  // individual — una sola fila: una venta, un traslado de una prenda, una devolución, un apartado…
  const esApartado = primera.categoria === "apartado" || primera.categoria === "liberacion_apartado";
  const n = unidadesDeFila(primera);
  const saldo = ctx.saldos?.[primera.id] ?? null;
  return {
    ...base,
    forma: "individual",
    titulo: etiquetaMovimiento(primera),
    prenda: { referencia: primera.referencia, variante: [primera.talla, primera.color].filter(Boolean).join(" · ") || null, fotoUrl: ctx.prendas[primera.varianteId]?.fotoUrl ?? null },
    cifra: `${n}`,
    frase: fraseDeMovimiento(primera, n),
    enTienda: saldo !== null && !esApartado ? { antes: saldo - primera.delta, despues: saldo } : null,
  };
}

/** Qué dibuja el cajón para una operación: una interna (bajada, retiro) se lee con el cajón de las bajadas; cualquier
 *  otra, con el suyo. */
export function vistaDeOperacion(op: OperacionMovimiento, ctx: ContextoCajon): VistaCajon {
  return formaDeOperacion(op) === "interno"
    ? { tipo: "bajadas", detalle: construirDetalleBajadas(op.clave, [op], ctx) }
    : { tipo: "operacion", detalle: construirDetalleCajon(op, ctx) };
}

// ---------------------------------------------------------------------------
// El cajón de «Colgadas en el piso» del día: la fila plegada de la lista (`plegarBajadas`) ya no se despliega hacia abajo,
// abre este cajón. También es el de UN movimiento interno suelto (una bajada o un retiro). Es de CONSULTA como los
// demás y se lee de corrido, sin saber de stock: qué pasó (una frase), cuándo, quién, y la lista de prendas.
// ---------------------------------------------------------------------------

/** Una prenda movida (una fila de una operación) dentro del cajón de las bajadas. */
export type FilaBajada = {
  id: string;
  hora: string;
  referencia: string;
  variante: string | null; // "L · Azul marino"
  fotoUrl: string | null;
  /** «1 prenda», «2 prendas»: la cantidad ya dicha, sin símbolos. */
  cantidad: string;
  /** «Almacén → Piso». Solo si no todas son bajadas (o no todas son retiros): ahí cada fila tiene que decir hacia dónde
   *  fue. Si todas van hacia el mismo lado, null: sería repetir. */
  sentido: string | null;
};

export type DetalleBajadas = {
  clave: string;
  titulo: string; // «Colgadas en el piso» · «Colgada en el piso» · «Retiro del piso» · «Movido dentro de la sede»: el nombre de la fila
  /** «Hoy, de 10:04 a 11:29» · «Ayer, a las 18:35». */
  cuando: string;
  /** El número grande y la frase que lo sigue: «10» + «prendas pasaron del almacén al piso de venta». */
  cifra: string;
  frase: string;
  /** Quién las hizo: «Carla Ruiz y Luis Soto»; null si todas son carga de sistema. */
  quien: string | null;
  nota: string;
  /** ¿Hay más de una hora? Con una sola, la hora ya está en `cuando` y repetirla en cada fila sobra. */
  mostrarHora: boolean;
  /** La más reciente primero, como la lista; una fila por prenda aunque se hayan movido juntas. */
  filas: FilaBajada[];
};

/** Lo que el cajón de las bajadas necesita dibujar, sacado de las operaciones internas (llegan de la más nueva a la más
 *  vieja, `plegarBajadas`): las del día plegadas, o una sola. Todo dato real: el nombre se omite si la base no lo trajo. */
export function construirDetalleBajadas(clave: string, operaciones: readonly OperacionMovimiento[], ctx: ContextoCajon): DetalleBajadas {
  const r = resumirBajadas(operaciones);
  const filas = operaciones.flatMap((op) => op.filas.map((m) => ({ op, m })));
  const etiquetas = new Set(filas.map(({ m }) => etiquetaConDireccion(m)));
  const sentido = etiquetas.size === 1 ? [...etiquetas][0] : null;
  const bajada = sentido === "Colgada en el piso";
  const retiro = sentido === "Retiro del piso";
  const dia = etiquetaDia(operaciones[0].fecha, ctx.hoyLima);
  const horas = new Set(operaciones.map((op) => op.hora));
  const una = r.unidades === 1;
  return {
    clave,
    // Una sola operación se llama por su nombre en singular («Colgada en el piso»); varias, como la fila plegada.
    titulo: operaciones.length === 1 ? etiquetaMovimiento(operaciones[0].filas[0]) : r.etiqueta,
    cuando: r.desde === r.hasta ? `${dia}, a las ${r.hasta}` : `${dia}, de ${r.desde} a ${r.hasta}`,
    cifra: `${r.unidades}`,
    frase: bajada
      ? `${una ? "prenda pasó" : "prendas pasaron"} del almacén al piso de venta`
      : retiro
        ? `${una ? "prenda volvió" : "prendas volvieron"} del piso al almacén`
        : `${una ? "prenda cambió" : "prendas cambiaron"} de lugar dentro de la tienda`,
    quien: quienes(filas.map(({ m }) => m)),
    nota: "El stock total de la tienda no cambia: solo cambiaron de lugar.",
    mostrarHora: horas.size > 1,
    filas: filas.map(({ op, m }) => ({
      id: m.id,
      hora: op.hora,
      referencia: m.referencia,
      variante: [m.talla, m.color].filter(Boolean).join(" · ") || null,
      fotoUrl: ctx.prendas[m.varianteId]?.fotoUrl ?? null,
      cantidad: cuantasPrendas(Math.abs(m.cantidad)),
      sentido: bajada || retiro ? null : `${nombreCortoSububicacion(m.sububicacion)} → ${nombreCortoSububicacion(m.sububicacionDestino)}`,
    })),
  };
}
