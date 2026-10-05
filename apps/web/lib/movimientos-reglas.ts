import type { TonoChip } from "@/components/ui/Chip";
// Relativo, no `@/`: vitest no resuelve el alias y este archivo tiene pruebas.
import { ESTADO_ETIQUETA, ETIQUETA_TIPO, type EstadoComprobante, type TipoComprobante } from "./comprobantes-reglas";
import type { Cantidades } from "./inventario-reglas";

// Reglas de lectura de Movimientos, sin nada de servidor: las importan los
// componentes cliente (lista, filtros, detalle). Las lecturas contra Postgres
// viven en `movimientos-v2.ts` (mismo reparto que compras-reglas / compras).
//
// La idea central (ADR-0050): los 4 `tipo` que CAMBIAN el stock (entrada/salida/
// ajuste/traslado) se muestran como 5 CATEGORÍAS, porque «reposición interna» y
// «transferencia entre sedes» son las dos cosas que una encargada de sede
// distingue de un vistazo — y las dos son `traslado` en la base. `fn_movimientos`
// calcula la categoría una vez, en SQL; acá solo se etiqueta y se colorea.
//
// ADR-0141 sumó dos `tipo` que NO tocan `stock.cantidad` — `apartado` y
// `liberacion_apartado`: aparecen como filas (quién apartó qué y cuándo), pero no
// entran a los filtros ni al resumen, que cuentan lo que se movió.

export type TipoMovimiento = "entrada" | "salida" | "ajuste" | "traslado" | "apartado" | "liberacion_apartado";
export type CategoriaMovimiento = "entrada" | "salida" | "interno" | "ajuste" | "transferencia";
/** La categoría de una FILA: las 5 de arriba, más los dos movimientos de apartar. */
export type CategoriaFila = CategoriaMovimiento | "apartado" | "liberacion_apartado";

export const CATEGORIAS: CategoriaMovimiento[] = ["entrada", "salida", "interno", "ajuste", "transferencia"];

// Vocabulario de tienda (ADR-0234): «Traslado» como en el menú —nunca «Transferencia», que en el Perú suena a Yape o al
// banco— y «Dentro de la sede» en vez de «Interno», que no dice nada a quien no conoce el sistema.
export const ETIQUETA_CATEGORIA: Record<CategoriaFila, string> = {
  entrada: "Entrada",
  salida: "Salida",
  interno: "Dentro de la sede",
  ajuste: "Ajuste",
  transferencia: "Traslado",
  apartado: "Apartado",
  liberacion_apartado: "Apartado liberado",
};

/** Los filtros rápidos por tipo, en el orden en que se leen en la pantalla
 *  («Todos» es no elegir ninguno). Plural: son grupos de movimientos.
 *
 *  Se leen DESDE LA TIENDA (ADR-0234): «Entradas» es todo lo que sumó stock a la sede —también el traslado que llegó—,
 *  y «Salidas» todo lo que lo restó —también el que salió—; «Traslados» trae las dos piernas. Un traslado que llega está
 *  en «Entradas» y en «Traslados» a la vez: las cifras de las píldoras no suman el total, y está bien (son filtros, no
 *  cajones). El valor en la URL no cambia (`?cat=transferencia`): los enlaces ya compartidos siguen funcionando. */
export const FILTROS_TIPO: { valor: CategoriaMovimiento; etiqueta: string }[] = [
  { valor: "entrada", etiqueta: "Entradas" },
  { valor: "salida", etiqueta: "Salidas" },
  { valor: "transferencia", etiqueta: "Traslados" },
  { valor: "interno", etiqueta: "Piso ↔ almacén" },
  { valor: "ajuste", etiqueta: "Ajustes" },
];

// Sobrio a propósito: verde = llegó mercadería (del proveedor o de otra sede: para la tienda es lo mismo), ámbar = se
// movió dentro de la tienda (piso ↔ almacén), rojo = un ajuste que RESTA (hay que mirarlo), el resto neutro. Un ajuste
// que suma no es alarma.
export function tonoCategoria(categoria: CategoriaFila, delta: number): TonoChip {
  if (categoria === "entrada" || (categoria === "transferencia" && delta > 0)) return "verde";
  if (categoria === "interno" || categoria === "apartado" || categoria === "liberacion_apartado") return "ambar";
  if (categoria === "ajuste" && delta < 0) return "rojo";
  return "neutro";
}

/** El proceso que originó el movimiento (`movimientos.motivo`). Los de
 *  operación los escriben las RPC; los de «sistema» son cargas hechas por
 *  script, sin persona (`usuario_id` null): existen en producción y se
 *  muestran con nombre propio, no se inventan. `reposicion`/`merma`/
 *  `conteo_fisico`/`otro` son de `AjustarInventarioModal.tsx` (la lista vive en
 *  `ajuste-reglas.ts`) — un ajuste
 *  suelto vía `registrar_movimiento`, tipo='ajuste' — y se distinguen a
 *  propósito de `conteo` (ADR-0023): ese lo escribe SOLO `cerrar_conteo`, con
 *  `conteo_item_id` enlazado al conteo formal; `conteo_fisico` es el mismo
 *  gesto (contar y corregir) pero sin abrir un conteo de verdad. Un motivo
 *  que no esté acá se muestra tal cual — nunca rompe la pantalla.
 *
 *  `cuarentena_*` (2026-09-17, "Dañado"): la SALIDA de cuarentena cuando un
 *  líder resuelve una prenda dañada — `resolver_prenda_danada`, una por
 *  cada uno de los 3 estados de salida. La ENTRADA a cuarentena sigue
 *  usando el motivo `devolucion` de siempre (mismo gesto que una devolución
 *  vendible, solo cambia la sububicación destino). */
export const ETIQUETA_PROCESO: Record<string, string> = {
  recepcion: "Recepción",
  venta: "Venta",
  // Modelo anterior (una sola fila que sale de una sede y entra a otra): la dirección la
  // dice `etiquetaMovimiento`, que mira hacia dónde va el stock de la sede que se mira.
  transferencia: "Traslado",
  traslado_salida: "Traslado enviado",
  traslado_entrada: "Traslado recibido",
  // ADR-0239 (D-132): el envío se anuló antes de que la otra sede lo contara y la prenda volvió a la sede que lo envió.
  traslado_anulado: "Traslado anulado",
  // El filtro es por motivo y trae todo lo que escribe `mover_interno`, sea cual sea el par: no promete bajada ni retiro.
  // No es «Entre piso y almacén»: también mueve de la cuarentena o entre racks del Taller. Las bajadas y los retiros
  // tienen nombre propio por su par (`INTERNO_POR_PAR`); este es el de cualquier otro.
  movimiento_interno: "Movido dentro de la sede",
  devolucion: "Devolución",
  cambio: "Cambio",
  anulacion_venta: "Venta anulada",
  produccion: "Producción",
  conteo: "Conteo",
  apartado: "Apartado",
  liberacion_apartado: "Apartado liberado",
  // Los ajustes sueltos llevan «Ajuste a mano ·» delante: «Reposición» a secas se confundía con la bajada del almacén al
  // piso, que es otra cosa; y «a mano» (Felipe, 2026-10-03) los separa del ajuste de un conteo, que tiene documento —
  // «Ajuste · conteo físico» y «Ajuste · Conteo» se leían como sinónimos. El código `reposicion` se muestra como «encontré
  // prendas» desde ADR-0328 (actividad 4): es el nombre del motivo en Ajustar, también para lo registrado antes.
  reposicion: "Ajuste a mano · encontré prendas",
  merma: "Ajuste a mano · merma",
  conteo_fisico: "Ajuste a mano · conteo físico",
  // 2026-10-01 (ADR-0291): la prenda que faltó en un conteo y apareció; el ajuste queda enlazado a ese conteo.
  hallazgo_conteo: "Ajuste · encontrada tras un conteo",
  otro: "Ajuste a mano · otro",
  // ADR-0212: lo que ya estaba en la tienda al pasarla al sistema. «Stock inicial», como lo dice Nuevo producto.
  carga_inicial: "Stock inicial",
  // La carga de sistema que repartió el stock cuando la tienda empezó a separar piso y almacén.
  activacion_piso_almacen: "Separación de piso y almacén",
  siembra_cargo_especial: "Cargo especial",
  // ADR-0179: prenda vendida antes de registrarse que llegó en un lote contado sin ella.
  ingreso_regularizado: "Prenda sin registrar · ingreso",
  cuarentena_liquidada: "Dañado · liquidada",
  cuarentena_se_boto: "Dañado · se botó",
  cuarentena_donada: "Dañado · donada",
};

/** Qué procesos caben en cada tipo, para el filtro en dos pasos de Movimientos (2026-09-22,
 *  demo de rediseño): se elige el tipo y DEBAJO aparecen solo sus procesos, en vez de una lista
 *  de 19. Sale de con qué `tipo` escribe cada RPC cada motivo: «Cambio» vive en dos (la prenda
 *  devuelta entra, la nueva sale) y por eso está en Entradas y en Salidas. Un proceso que no esté
 *  acá se sigue filtrando por URL (`?proc=`); solo no tiene botón. */
export const PROCESOS_POR_CATEGORIA: Record<CategoriaMovimiento, string[]> = {
  // Desde la tienda (ADR-0234): el traslado recibido es una entrada y el enviado, una salida — y los dos siguen en «Traslados».
  entrada: ["traslado_entrada", "traslado_anulado", "recepcion", "devolucion", "cambio", "anulacion_venta", "produccion", "carga_inicial", "ingreso_regularizado"],
  salida: ["venta", "traslado_salida", "cambio", "cuarentena_liquidada", "cuarentena_se_boto", "cuarentena_donada"],
  interno: ["movimiento_interno", "activacion_piso_almacen"],
  transferencia: ["traslado_entrada", "traslado_salida", "traslado_anulado"],
  ajuste: ["conteo", "conteo_fisico", "hallazgo_conteo", "merma", "reposicion", "otro"],
};

/** El tipo al que pertenece un proceso, si es uno solo. Sirve para que un enlace con solo
 *  `?proc=conteo` (el de Conteo) muestre apretado «Ajustes» y, debajo, «Conteo». Null si el
 *  proceso vive en dos tipos (cambio) o no está en la tabla. */
export function categoriaDeProceso(motivo: string | null | undefined): CategoriaMovimiento | null {
  if (!motivo) return null;
  const tipos = CATEGORIAS.filter((c) => PROCESOS_POR_CATEGORIA[c].includes(motivo));
  return tipos.length === 1 ? tipos[0] : null;
}

export function etiquetaProceso(motivo: string | null): string {
  if (!motivo) return "Sin proceso";
  return ETIQUETA_PROCESO[motivo] ?? motivo.replace(/_/g, " ");
}

/** Los motivos con que las RPC escriben cada pierna de un traslado (ADR-0239 suma la vuelta de un envío anulado). */
const PIERNAS_DE_TRASLADO: readonly string[] = ["traslado_entrada", "traslado_salida", "traslado_anulado"];

/** Por el PAR exacto, como `fn_bajadas_del_piso`: solo el destino llamaba «Bajada» a lo que sale de cuarentena. */
const INTERNO_POR_PAR: Record<string, string> = {
  "almacen_tienda→piso_venta": "Bajada al piso",
  "piso_venta→almacen_tienda": "Retiro del piso",
};

/** Lo que dice la columna «Movimiento»: el proceso en lenguaje claro. En una
 *  transferencia la palabra que importa es hacia dónde va el stock DE LA SEDE QUE SE
 *  MIRA («llegada» si suma, «salida» si resta): lo dice el signo, no el motivo — así
 *  también se lee bien una fila del modelo anterior, que no distingue las dos piernas.
 *  «Interno» sale de la categoría (estructura, `fn_es_traslado_interno`), nunca del motivo (ADR-0203); un par que no es
 *  bajada ni retiro conserva el nombre de su proceso («Movimiento interno», «Activación piso/almacén»). */
export function etiquetaMovimiento(m: Pick<Movimiento, "categoria" | "motivo" | "delta" | "sububicacion" | "sububicacionDestino">): string {
  if (m.categoria === "transferencia") {
    // Las piernas del traslado en dos fases dicen su propio nombre: el signo no distingue «recibido» de «anulado»
    // (los dos suman). Solo la fila del modelo anterior, sin pierna, se lee por el signo.
    if (m.motivo && PIERNAS_DE_TRASLADO.includes(m.motivo)) return ETIQUETA_PROCESO[m.motivo];
    return m.delta > 0 ? ETIQUETA_PROCESO.traslado_entrada : ETIQUETA_PROCESO.traslado_salida;
  }
  if (m.categoria === "interno") {
    const porPar = INTERNO_POR_PAR[`${m.sububicacion?.tipo ?? ""}→${m.sububicacionDestino?.tipo ?? ""}`];
    if (porPar) return porPar;
  }
  return etiquetaProceso(m.motivo);
}

/** Rediseño de Movimientos (2026-09-22): el mismo texto de `etiquetaMovimiento`, con el prefijo
 *  Entrada/Salida/Interno/Ajuste delante — para que se entienda de inmediato sin interpretar el
 *  proceso. No es una categoría nueva: es `ETIQUETA_CATEGORIA[categoria]` (ADR-0050, sin tocar), con
 *  un caso especial para «transferencia» — que a nivel de categoría sigue siendo transferencia, pero
 *  la pierna que llega a esta sede se LEE como entrada y la que sale, como salida (mismo criterio de
 *  signo que ya usa `etiquetaMovimiento`). Si el texto del proceso ya empieza con esa palabra (los
 *  ajustes sueltos ya traen «Ajuste ·» en `ETIQUETA_PROCESO`), no se duplica. */
export function etiquetaConDireccion(m: Pick<Movimiento, "categoria" | "motivo" | "delta" | "sububicacion" | "sububicacionDestino">): string {
  if (m.categoria === "transferencia") return `${m.delta > 0 ? "Entrada" : "Salida"} · ${etiquetaMovimiento(m)}`;
  // Dentro de la tienda no entra ni sale nada: «Bajada al piso» / «Retiro del piso» ya dicen hacia dónde (ADR-0234).
  if (m.categoria === "interno") return etiquetaMovimiento(m);
  const detalle = etiquetaMovimiento(m);
  const direccion = ETIQUETA_CATEGORIA[m.categoria];
  return detalle.startsWith(direccion) ? detalle : `${direccion} · ${detalle}`;
}

export const ETIQUETA_ESTADO_DEVOLUCION: Record<string, string> = {
  pendiente: "Pendiente de aprobar",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

// ---------------------------------------------------------------------------
// La fila que devuelve `fn_movimientos`, ya en castellano de pantalla. Cada
// proceso trae su referencia como un objeto propio (o null): así el detalle
// pregunta «¿tiene venta?» y no «¿venta_id es null y comprobante_numero…?».
// ---------------------------------------------------------------------------
export type Movimiento = {
  id: string;
  /** ISO con microsegundos y zona, tal cual lo devuelve Postgres — es la
   *  mitad del cursor de paginado y se reenvía sin tocar. */
  creadoEn: string;
  /** `aaaa-mm-dd` en hora de Lima: por esto se agrupa la lista. */
  fecha: string;
  hora: string;
  tipo: TipoMovimiento;
  categoria: CategoriaFila;
  motivo: string | null;
  cantidad: number;
  /** Efecto sobre la ubicación que se está mirando: + entra, − sale, 0 interno. */
  delta: number;
  /** Sin persona detrás: carga por script (`usuario_id` null). */
  esSistema: boolean;
  nota: string | null;
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  ubicacionId: string;
  ubicacion: string;
  ubicacionDestinoId: string | null;
  ubicacionDestino: string | null;
  sububicacion: { id: string; nombre: string; tipo: string | null } | null;
  sububicacionDestino: { id: string; nombre: string; tipo: string | null } | null;
  usuarioId: string | null;
  usuario: string | null;
  venta: { id: string; nota: string | null; comprobante: { tipo: TipoComprobante; numero: string; estado: EstadoComprobante } | null } | null;
  lote: { id: string; guia: string | null; nota: string | null; proveedor: string | null } | null;
  compra: { id: string; documento: string | null } | null;
  /** `numero`: el número corrido del traslado («Traslado 24»); null si la base que responde es anterior a
   *  20260919155000 y todavía no lo devuelve. */
  transferencia: { id: string; estado: string | null; nota: string | null; numero: number | null } | null;
  conteo: { id: string; sistema: number | null; contado: number | null; numero: number | null } | null;
  devolucion: { id: string; motivo: string | null; estado: string | null } | null;
  cambio: { id: string; diferencia: number | null } | null;
};

/** Cursor de paginado: «las 50 después de ESTA fila». Dos partes, no tres como
 *  el de Compras: acá no hay una fecha de negocio distinta de `created_at`. */
export type CursorMovimientos = { creadoEn: string; id: string };

const ES_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;
const ES_UUID = /^[0-9a-f-]{36}$/i;

export function serializarCursorMovimientos(c: CursorMovimientos): string {
  return `${c.creadoEn}~${c.id}`;
}

export function leerCursorMovimientos(texto: string | undefined): CursorMovimientos | null {
  if (!texto) return null;
  const [creadoEn, id] = texto.split("~");
  return ES_TIMESTAMP.test(creadoEn ?? "") && ES_UUID.test(id ?? "") ? { creadoEn, id } : null;
}

// ---------------------------------------------------------------------------
// Cómo se lee cada movimiento. Texto, no JSX: lo usan la lista, el detalle y
// el `title` de una celda truncada por igual.
// ---------------------------------------------------------------------------

/** «+3», «−1», o «3» cuando es interno (no cambia el total de la tienda). */
export function textoDelta(m: Pick<Movimiento, "categoria" | "cantidad" | "delta">): string {
  // Apartar no cambia el stock (`delta` llega null de la base): se muestra cuántas prendas fueron.
  if (m.categoria === "interno" || m.categoria === "apartado" || m.categoria === "liberacion_apartado") return String(Math.abs(m.cantidad));
  if (m.delta > 0) return `+${m.delta}`;
  if (m.delta < 0) return `−${Math.abs(m.delta)}`;
  return "0";
}

/** El nombre de una sububicación para una celda angosta: las dos que el motor
 *  conoce se abrevian («Piso», «Almacén»); cualquier otra (un rack del Taller)
 *  va con su nombre. El detalle muestra siempre el nombre completo. */
export function nombreCortoSububicacion(s: Movimiento["sububicacion"]): string {
  if (!s) return "Sin sububicación";
  if (s.tipo === "piso_venta") return "Piso";
  if (s.tipo === "almacen_tienda") return "Almacén";
  return s.nombre;
}

/** De dónde a dónde, para la columna «Origen → Destino» de la lista (diseño
 *  de Felipe, 2026-09-16): cada proceso nombra sus dos puntas en el
 *  vocabulario de la tienda, no en el de la base. Una venta sale del piso
 *  hacia la clienta; una recepción llega del proveedor al almacén; un ajuste
 *  no tiene dos puntas — es un solo lugar y el proceso ya dice qué pasó.
 *  `destino` null = mostrar solo el origen. */
export function partesOrigenDestino(m: Movimiento): { origen: string; destino: string | null } {
  const aqui = m.sububicacion ? nombreCortoSububicacion(m.sububicacion) : m.ubicacion;
  switch (m.categoria) {
    case "interno":
      return { origen: nombreCortoSububicacion(m.sububicacion), destino: nombreCortoSububicacion(m.sububicacionDestino) };
    case "transferencia":
      return { origen: m.ubicacion, destino: m.ubicacionDestino ?? "—" };
    case "ajuste":
      return { origen: aqui, destino: null };
  }
  switch (m.motivo) {
    case "venta":
    case "cuarentena_liquidada":
      return { origen: aqui, destino: "Cliente" };
    case "anulacion_venta":
    case "devolucion":
      return { origen: "Cliente", destino: aqui };
    case "cambio":
      return m.delta > 0 ? { origen: "Cliente", destino: aqui } : { origen: aqui, destino: "Cliente" };
    case "recepcion":
      return { origen: m.lote?.proveedor ?? "Proveedor", destino: aqui };
    case "produccion":
      return { origen: "Producción", destino: aqui };
  }
  return { origen: aqui, destino: null };
}

export function textoComprobante(c: NonNullable<Movimiento["venta"]>["comprobante"]): string {
  if (!c) return "Sin comprobante";
  return `${ETIQUETA_TIPO[c.tipo] ?? c.tipo} ${c.numero}`;
}

/** El proceso que originó el movimiento, para la columna «Referencia»: lo más corto que
 *  lo identifica, y a dónde llevar a quien lo toque. `detalle` es una segunda línea
 *  opcional (el proveedor de una recepción); `href` null = solo texto.
 *
 *  Solo se usa lo que la base YA guarda. Los traslados y los conteos tienen número
 *  corrido («Traslado 24»); una venta, una devolución o un cambio se identifican por el
 *  comprobante de la venta («Boleta B001-000184»); una recepción, por su factura o su guía.
 *  No hay «Venta 184» ni «Devolución 7»: esas tablas no tienen número propio y acá no se
 *  inventa uno. Null si el movimiento no salió de un proceso con referencia (una carga de
 *  sistema, un ajuste suelto, una producción): la celda queda vacía, no dice «—» a la fuerza.
 *
 *  `enlaceCompras`: la factura de compra vive en Compras, que es solo de líder; a quien no
 *  lo es se le muestra el texto sin un enlace que lo devolvería al inicio. */
export type ReferenciaMovimiento = { texto: string; detalle: string | null; href: string | null };

export function referenciaMovimiento(m: Movimiento, opciones: { enlaceCompras?: boolean } = {}): ReferenciaMovimiento | null {
  if (m.transferencia) {
    const n = m.transferencia.numero;
    return { texto: n !== null ? `Traslado ${n}` : "Traslado", detalle: null, href: `/inventario/traslados/${m.transferencia.id}` };
  }
  if (m.conteo) {
    const n = m.conteo.numero;
    return { texto: n !== null ? `Conteo ${n}` : "Conteo", detalle: null, href: `/inventario/conteo/${m.conteo.id}` };
  }
  switch (m.motivo) {
    case "venta":
    case "anulacion_venta":
    case "devolucion":
    case "cambio":
    case "cuarentena_liquidada":
      // La venta de origen: la de la línea vendida, la que se devolvió o la que se cambió. Sin boleta, «Venta sin
      // comprobante» — «Sin comprobante» a secas, suelto en la lista, no decía de qué.
      return m.venta ? { texto: m.venta.comprobante ? textoComprobante(m.venta.comprobante) : "Venta sin comprobante", detalle: null, href: null } : null;
    case "recepcion": {
      const factura = m.compra?.documento ?? null;
      const guia = m.lote?.guia ?? null;
      const proveedor = m.lote?.proveedor ?? null;
      if (factura) {
        return {
          texto: `Factura ${factura}`,
          detalle: [guia ? `Guía ${guia}` : null, proveedor].filter(Boolean).join(" · ") || null,
          href: opciones.enlaceCompras && m.compra ? `/compras/factura/${m.compra.id}` : null,
        };
      }
      if (guia) return { texto: `Guía ${guia}`, detalle: proveedor, href: null };
      return proveedor ? { texto: proveedor, detalle: null, href: null } : null;
    }
  }
  return null;
}

/** La referencia de un ajuste hecho a mano (Felipe, 2026-10-03): no hay documento detrás, y la fila lo dice en vez de
 *  quedar en blanco, con la nota de quien ajustó o «sin nota». Se decide por el dato y no por el motivo: un ajuste sin
 *  conteo enlazado no tiene documento, se llame como se llame. Null si no es un ajuste o si tiene su conteo (ese ya
 *  dice «Conteo N»). Solo para la lista: el cajón ya muestra la nota como motivo. */
export function referenciaSinDocumento(m: Pick<Movimiento, "categoria" | "nota" | "conteo">): ReferenciaMovimiento | null {
  if (m.categoria !== "ajuste" || m.conteo) return null;
  const nota = m.nota?.trim();
  return { texto: "Sin documento", detalle: nota ? `«${nota}»` : "sin nota", href: null };
}

/** «Hoy», «Ayer», o «lunes 15 de septiembre». `fecha` viene en día de Lima;
 *  se arma con componentes locales para que un servidor en UTC no la corra un
 *  día hacia atrás (`new Date("2026-09-15")` sería medianoche UTC). */
export function etiquetaDia(fecha: string, hoyLima: string): string {
  if (fecha === hoyLima) return "Hoy";
  const [a, m, d] = fecha.split("-").map(Number);
  const [ha, hm, hd] = hoyLima.split("-").map(Number);
  const dia = new Date(a, m - 1, d);
  const hoy = new Date(ha, hm - 1, hd);
  if (hoy.getTime() - dia.getTime() === 86_400_000) return "Ayer";
  const texto = dia.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: a === ha ? undefined : "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** El día de hoy en Lima como `aaaa-mm-dd`, venga de donde venga el servidor. */
export function hoyEnLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function etiquetaEstadoComprobante(estado: EstadoComprobante): string {
  return ESTADO_ETIQUETA[estado] ?? estado;
}

// ---------------------------------------------------------------------------
// Filtros de la pantalla, de la URL a lo que se le pide a Postgres. Viven acá (no
// en `movimientos-v2.ts`) porque son reglas puras: los componentes cliente las
// importan y tienen pruebas.
//
// Quedan a la vista cuatro controles: la búsqueda, el tipo (`cat`), la sububicación
// (`sub`) y el período (`rango`, o `desde`/`hasta` cuando es personalizado). Todo lo
// demás (el proceso específico, `proc`) sale debajo del tipo elegido («Internos» ▸ «Movimiento interno»). Ya no se filtra
// por persona: la autoría sigue guardada en `movimientos.usuario_id` y en el detalle
// de cada movimiento, pero un `?usuario=` viejo se ignora sin romper nada.
// ---------------------------------------------------------------------------

/** Sin nada en la URL, la pantalla muestra los últimos 30 días — y lo dice. */
export const DIAS_POR_DEFECTO = 30;

/** Los períodos que se eligen con un toque. «Todo el historial» (`rango=todo`) sigue
 *  existiendo, dentro de «Personalizado», para quien de verdad necesita ir más atrás. */
export const PERIODOS_RAPIDOS = [7, 30, 90] as const;
/** «Hoy» (ADR-0241): la pregunta de la tienda es «qué pasó hoy». En el celular es lo que se ve sin tocar nada; en la
 *  computadora, un botón más antes de «7 días». */
export type PeriodoMovimientos = "hoy" | "7" | "30" | "90" | "todo" | "personalizado";

/** Las sububicaciones que se pueden filtrar, por su TIPO (una tienda tiene una de cada
 *  una). En la URL viaja el nombre corto (`?sub=piso`), no un uuid: así el enlace sigue
 *  valiendo si una Líder cambia de sede, y se lee. Un uuid viejo sigue entendiéndose. */
export const FILTROS_SUBUBICACION: { token: "piso" | "almacen" | "cuarentena"; tipo: string; etiqueta: string }[] = [
  { token: "piso", tipo: "piso_venta", etiqueta: "Piso" },
  { token: "almacen", tipo: "almacen_tienda", etiqueta: "Almacén" },
  { token: "cuarentena", tipo: "cuarentena", etiqueta: "Cuarentena" },
];
export type TokenSububicacion = (typeof FILTROS_SUBUBICACION)[number]["token"];

export type FiltrosMovimientos = {
  busqueda?: string;
  /** `aaaa-mm-dd` inclusivos, en día de Lima. */
  desde?: string;
  hasta?: string;
  categoria?: CategoriaMovimiento;
  motivo?: string;
  sububicacionId?: string;
};

/** Parámetros de URL de la pantalla. `mov` es el movimiento abierto en el detalle. */
export type ParamsMovimientos = {
  q?: string;
  desde?: string;
  hasta?: string;
  rango?: string;
  cat?: string;
  proc?: string;
  sub?: string;
  cursor?: string;
  ubicacion?: string;
  mov?: string;
};

export type FiltrosResueltos = FiltrosMovimientos & {
  periodo: PeriodoMovimientos;
  /** Qué botón de sububicación queda apretado (null = «Todas»). */
  sub: TokenSububicacion | null;
};

const esFecha = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const esUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
// Un motivo es texto libre en la base, pero lo que llega por URL se acota a lo que un
// motivo puede ser: minúsculas, dígitos y guion bajo.
const esMotivo = (v?: string) => !!v && /^[a-z0-9_]{1,40}$/.test(v);

/** `aaaa-mm-dd` de hace `dias` días respecto de `hoy`, sin pasar por la zona horaria del servidor. */
export function restarDias(hoy: string, dias: number): string {
  const [a, m, d] = hoy.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}

/** El primer día de un período de N días que TERMINA hoy: 7 días es hoy y los 6 anteriores
 *  (misma cuenta que el Resumen). */
export function desdeDeUltimosDias(dias: number, hoy: string = hoyEnLima()): string {
  return restarDias(hoy, dias - 1);
}

/** Traduce la URL a filtros, descartando cualquier valor que no sea válido.
 *  `sububicaciones`: las de la ubicación que se mira (para pasar «piso» a su id). */
export function filtrosDesdeParams(
  p: ParamsMovimientos,
  contexto: {
    hoy?: string;
    sububicaciones?: { id: string; tipo: string | null }[];
    /** Qué período rige sin nada en la URL: «hoy» en el celular, 30 días en lo demás (ADR-0241). */
    porDefecto?: "hoy" | "30";
  } = {}
): FiltrosResueltos {
  const hoy = contexto.hoy ?? hoyEnLima();
  const desdeUrl = esFecha(p.desde) ? p.desde : undefined;
  const hastaUrl = esFecha(p.hasta) ? p.hasta : undefined;

  let periodo: PeriodoMovimientos;
  let desde: string | undefined;
  let hasta: string | undefined;
  if (desdeUrl || hastaUrl) {
    periodo = "personalizado";
    desde = desdeUrl;
    hasta = hastaUrl;
  } else if (p.rango === "todo") {
    periodo = "todo";
  } else if (p.rango === "hoy" || (!p.rango && contexto.porDefecto === "hoy")) {
    periodo = "hoy";
    desde = hoy;
  } else {
    const dias = PERIODOS_RAPIDOS.find((n) => String(n) === p.rango) ?? DIAS_POR_DEFECTO;
    periodo = String(dias) as PeriodoMovimientos;
    desde = desdeDeUltimosDias(dias, hoy);
  }

  // `?sub=piso` (o, de un enlace viejo, el uuid de la sububicación).
  const lista = contexto.sububicaciones ?? [];
  const porToken = FILTROS_SUBUBICACION.find((f) => f.token === p.sub);
  const porId = !porToken && esUuid(p.sub) ? lista.find((s) => s.id === p.sub) : undefined;
  const sububicacion = porToken ? lista.find((s) => s.tipo === porToken.tipo) : porId;
  const sub = sububicacion ? (FILTROS_SUBUBICACION.find((f) => f.tipo === sububicacion.tipo)?.token ?? null) : null;

  return {
    busqueda: p.q?.trim() || undefined,
    desde,
    hasta,
    categoria: CATEGORIAS.find((c) => c === p.cat),
    motivo: esMotivo(p.proc) ? p.proc : undefined,
    sububicacionId: sububicacion?.id,
    periodo,
    sub,
  };
}

/** El período en palabras, para el título de la primera tarjeta. */
export function textoPeriodo(periodo: PeriodoMovimientos, desde?: string, hasta?: string): string {
  if (periodo === "hoy") return "Hoy";
  if (periodo === "7" || periodo === "30" || periodo === "90") return `Últimos ${periodo} días`;
  if (periodo === "todo") return "Todo el historial";
  if (desde && hasta) return `${fechaCorta(desde)} – ${fechaCorta(hasta)}`;
  if (desde) return `Desde ${fechaCorta(desde)}`;
  if (hasta) return `Hasta ${fechaCorta(hasta)}`;
  return "Todo el historial";
}

// ---------------------------------------------------------------------------
// Operaciones (ADR-0234): lo que se guardó de una sola vez. Una recepción de 16 variantes, una venta de dos prendas o
// una bajada al piso escaneada de una vez son UNA operación; la lista las muestra como una fila que se despliega.
// ---------------------------------------------------------------------------

/** El documento del que cuelga un movimiento: el traslado, el conteo, la devolución, el cambio, el lote o la venta —en
 *  ese orden, el mismo del `coalesce` de `fn_movimientos_resumen_procesos`—; vacío si el proceso no tiene (una bajada, un
 *  ajuste suelto, una carga inicial). */
export function documentoDeOperacion(
  m: Pick<Movimiento, "transferencia" | "conteo" | "devolucion" | "cambio" | "lote" | "venta">
): string {
  return m.transferencia?.id ?? m.conteo?.id ?? m.devolucion?.id ?? m.cambio?.id ?? m.lote?.id ?? m.venta?.id ?? "";
}

/** La clave de una operación: misma hora exacta (`created_at` es la hora de la TRANSACCIÓN, `now()`), misma persona,
 *  mismo proceso y mismo documento. Con el documento, dos ventas guardadas en una misma transacción (un script, la
 *  siembra) no se leen como una sola con la boleta de la primera. Es la misma cuenta que hace
 *  `fn_movimientos_resumen_procesos` (`count(distinct (created_at, usuario_id, motivo, documento))`): si se cambia una,
 *  se cambia la otra. */
export function claveOperacion(
  m: Pick<Movimiento, "creadoEn" | "usuarioId" | "motivo" | "transferencia" | "conteo" | "devolucion" | "cambio" | "lote" | "venta">
): string {
  return `${m.creadoEn}|${m.usuarioId ?? ""}|${m.motivo ?? ""}|${documentoDeOperacion(m)}`;
}

export type OperacionMovimiento = { clave: string; fecha: string; hora: string; filas: Movimiento[] };

/** Agrupa las filas (ya ordenadas de la más nueva a la más vieja) en operaciones sin cambiar el orden: cada operación
 *  aparece donde aparece su primera fila. Una operación de una sola fila es una operación como cualquier otra. */
export function agruparPorOperacion(filas: readonly Movimiento[]): OperacionMovimiento[] {
  const porClave = new Map<string, OperacionMovimiento>();
  const operaciones: OperacionMovimiento[] = [];
  for (const m of filas) {
    const clave = claveOperacion(m);
    let op = porClave.get(clave);
    if (!op) {
      op = { clave, fecha: m.fecha, hora: m.hora, filas: [] };
      porClave.set(clave, op);
      operaciones.push(op);
    }
    op.filas.push(m);
  }
  return operaciones;
}

export type ResumenOperacion = {
  /** Lo que la operación sumó a la sede, lo que restó (en positivo) y lo que movió entre piso y almacén. */
  entran: number;
  salen: number;
  movidas: number;
  /** Unidades que se apartaron para una clienta o que volvieron a estar libres (ADR-0141): no cambian el stock, pero
   *  la fila tiene que decir cuántas — hasta el 2026-09-26 una operación de dos apartados decía «0». */
  apartadas: number;
  liberadas: number;
  /** Cuántas variantes distintas (talla y color) y de qué productos, en el orden en que aparecen. */
  variantes: number;
  productos: string[];
  /** Qué pasó, en palabras de tienda. Un cambio (entra lo devuelto, sale lo nuevo) se llama «Cambio». */
  etiqueta: string;
  origen: string;
  destino: string | null;
  referencia: ReferenciaMovimiento | null;
};

export function resumirOperacion(op: OperacionMovimiento, opciones: { enlaceCompras?: boolean } = {}): ResumenOperacion {
  const primera = op.filas[0];
  let entran = 0;
  let salen = 0;
  let movidas = 0;
  let apartadas = 0;
  let liberadas = 0;
  const variantes = new Set<string>();
  const productos: string[] = [];
  const etiquetas = new Set<string>();
  let referencia: ReferenciaMovimiento | null = null;
  for (const m of op.filas) {
    if (m.categoria === "interno") movidas += Math.abs(m.cantidad);
    else if (m.categoria === "apartado") apartadas += Math.abs(m.cantidad);
    else if (m.categoria === "liberacion_apartado") liberadas += Math.abs(m.cantidad);
    else if (m.delta > 0) entran += m.delta;
    else if (m.delta < 0) salen -= m.delta;
    variantes.add(m.varianteId);
    if (!productos.includes(m.referencia)) productos.push(m.referencia);
    etiquetas.add(etiquetaConDireccion(m));
    referencia ??= referenciaMovimiento(m, opciones);
  }
  // Todas las filas dicen lo mismo (lo normal): esa es la etiqueta y esas son sus puntas. Si no (un cambio), el nombre
  // del proceso y solo el lugar de la sede: «Cliente → Piso» sería verdad para una fila y mentira para la otra.
  const mixta = etiquetas.size > 1;
  const partes = partesOrigenDestino(primera);
  return {
    entran,
    salen,
    movidas,
    apartadas,
    liberadas,
    variantes: variantes.size,
    productos,
    etiqueta: mixta ? etiquetaProceso(primera.motivo) : etiquetaConDireccion(primera),
    origen: mixta ? (primera.sububicacion ? nombreCortoSububicacion(primera.sububicacion) : primera.ubicacion) : partes.origen,
    destino: mixta ? null : partes.destino,
    referencia,
  };
}

/** La cantidad de una operación, como la de una fila: «+80», «−3», «+1 / −1» (un cambio), «⇄ 54» (piso ↔ almacén),
 *  «2 apartadas» o «1 libre». */
export function textoCantidadOperacion(
  r: Pick<ResumenOperacion, "entran" | "salen" | "movidas"> & Partial<Pick<ResumenOperacion, "apartadas" | "liberadas">>
): string {
  const partes = [r.entran > 0 && `+${r.entran}`, r.salen > 0 && `−${r.salen}`].filter(Boolean);
  if (partes.length > 0) return partes.join(" / ");
  if (r.movidas > 0) return `⇄ ${r.movidas}`;
  if (r.apartadas) return textoApartado(r.apartadas, "apartado");
  if (r.liberadas) return textoApartado(r.liberadas, "liberacion_apartado");
  return "0";
}

/** «1 apartada», «3 apartadas», «1 libre», «2 libres»: lo que un apartado hizo con las unidades, sin signo (no entran
 *  ni salen de la sede: quedan reservadas para una clienta o vuelven a estar a la venta). */
export function textoApartado(unidades: number, categoria: "apartado" | "liberacion_apartado"): string {
  const n = Math.abs(unidades);
  if (categoria === "apartado") return `${n} ${n === 1 ? "apartada" : "apartadas"}`;
  return `${n} ${n === 1 ? "libre" : "libres"}`;
}

// ---------------------------------------------------------------------------
// Bajadas plegadas (ADR-0241): en «Todos», las operaciones de piso ↔ almacén del día —no cambian el total— van en UNA
// fila que se despliega. En TRU eran 27 de 84 operaciones en 30 días: un tercio de la lista no movía el stock.
// ---------------------------------------------------------------------------

export type ItemLista =
  | { tipo: "operacion"; op: OperacionMovimiento }
  | { tipo: "bajadas"; clave: string; operaciones: OperacionMovimiento[] };

/** Una operación es «de piso ↔ almacén» si todas sus filas lo son (una bajada escaneada de 12 tallas, un retiro). */
export function esOperacionInterna(op: Pick<OperacionMovimiento, "filas">): boolean {
  return op.filas.length > 0 && op.filas.every((m) => m.categoria === "interno");
}

/** Las operaciones de UN día, con las de piso ↔ almacén juntas en un solo ítem puesto donde estaba la más reciente.
 *  Con una sola no se pliega nada: una fila que se despliega para mostrar una fila no ahorra nada. */
export function plegarBajadas(operaciones: readonly OperacionMovimiento[]): ItemLista[] {
  const internas = operaciones.filter(esOperacionInterna);
  if (internas.length < 2) return operaciones.map((op) => ({ tipo: "operacion", op }));
  const items: ItemLista[] = [];
  let puesto = false;
  for (const op of operaciones) {
    if (!esOperacionInterna(op)) items.push({ tipo: "operacion", op });
    else if (!puesto) {
      items.push({ tipo: "bajadas", clave: `bajadas-${op.fecha}`, operaciones: internas });
      puesto = true;
    }
  }
  return items;
}

/** Lo que dice la fila plegada: «Bajadas al piso» si todas lo fueron (lo normal), si no «Movido dentro de la sede»;
 *  cuántas veces, cuántas tallas, cuántas unidades y entre qué horas (las operaciones llegan de la más nueva a la más
 *  vieja). */
export function resumirBajadas(operaciones: readonly OperacionMovimiento[]): {
  etiqueta: string;
  veces: number;
  tallas: number;
  unidades: number;
  desde: string;
  hasta: string;
} {
  const filas = operaciones.flatMap((op) => op.filas);
  const etiquetas = new Set(filas.map((m) => etiquetaConDireccion(m)));
  const soloBajadas = etiquetas.size === 1 && etiquetas.has("Bajada al piso");
  return {
    etiqueta: soloBajadas ? "Bajadas al piso" : "Movido dentro de la sede",
    veces: operaciones.length,
    tallas: new Set(filas.map((m) => m.varianteId)).size,
    unidades: filas.reduce((s, m) => s + Math.abs(m.cantidad), 0),
    desde: operaciones[operaciones.length - 1]?.hora ?? "",
    hasta: operaciones[0]?.hora ?? "",
  };
}

// ---------------------------------------------------------------------------
// Las cifras de la pantalla (ADR-0234), de `fn_movimientos_resumen_procesos`.
// ---------------------------------------------------------------------------

/** Un grupo por cada filtro de tipo, más «todos». Una fila cuenta en todos los grupos donde la pantalla la muestra. */
export type GrupoResumen = "todos" | CategoriaMovimiento;
export const GRUPOS_RESUMEN: readonly GrupoResumen[] = ["todos", ...CATEGORIAS];

export type ProcesoResumen = { proceso: string; operaciones: number; filas: number; entran: number; salen: number; movidas: number };
export type CifrasGrupo = { operaciones: number; entran: number; salen: number; movidas: number; procesos: ProcesoResumen[] };
export type ResumenTienda = Record<GrupoResumen, CifrasGrupo>;

/** Lo que devuelve la RPC (los `bigint` pueden llegar como texto), a cifras por grupo. Siempre trae los seis grupos. Dentro
 *  de un grupo, una operación tiene un solo proceso: sumar las operaciones de sus procesos no cuenta nada dos veces. */
export function leerResumenTienda(
  filas: readonly { grupo: string; proceso: string; operaciones: number | string; filas: number | string; entran: number | string; salen: number | string; movidas: number | string }[]
): ResumenTienda {
  const resumen = Object.fromEntries(GRUPOS_RESUMEN.map((g) => [g, { operaciones: 0, entran: 0, salen: 0, movidas: 0, procesos: [] }])) as unknown as ResumenTienda;
  for (const f of filas) {
    const grupo = GRUPOS_RESUMEN.find((g) => g === f.grupo);
    if (!grupo) continue;
    const p: ProcesoResumen = {
      proceso: f.proceso,
      operaciones: Number(f.operaciones ?? 0),
      filas: Number(f.filas ?? 0),
      entran: Number(f.entran ?? 0),
      salen: Number(f.salen ?? 0),
      movidas: Number(f.movidas ?? 0),
    };
    const g = resumen[grupo];
    g.operaciones += p.operaciones;
    g.entran += p.entran;
    g.salen += p.salen;
    g.movidas += p.movidas;
    g.procesos.push(p);
  }
  return resumen;
}

/** Cómo se nombra cada proceso en el desglose de «Entró» y «Salió», detrás de la cifra: «80 por traslado», «4 vendidas».
 *  Una pareja [singular, plural] cuando la palabra concuerda con la cifra. Todo proceso de `ETIQUETA_PROCESO` que pueda
 *  sumar o restar en esas tarjetas tiene la suya: lo exige una prueba, porque sin frase el respaldo pegaba la etiqueta de
 *  la fila y su « · » partía el desglose en dos («+1 por ajuste · encontrada tras un conteo», 2026-10-03). Los ajustes no
 *  están: van por respaldo (`desgloseAjustes`). */
export const FRASE_PROCESO: Record<string, string | readonly [string, string]> = {
  traslado_entrada: "por traslado",
  traslado_salida: "por traslado",
  // Una fila del modelo anterior (salía de una sede y entraba a otra): `fn_movimientos_resumen_procesos` ya la parte en
  // recibido / enviado, pero si llega con su nombre viejo dice lo mismo.
  transferencia: "por traslado",
  traslado_anulado: "por traslado anulado",
  recepcion: "de proveedor",
  devolucion: "por devolución",
  cambio: "por cambio",
  anulacion_venta: "por venta anulada",
  produccion: "de producción",
  carga_inicial: "de stock inicial",
  ingreso_regularizado: ["sin registrar, regularizada", "sin registrar, regularizadas"],
  venta: ["vendida", "vendidas"],
  cuarentena_liquidada: ["dañada, liquidada", "dañadas, liquidadas"],
  cuarentena_se_boto: ["dañada, botada", "dañadas, botadas"],
  cuarentena_donada: ["dañada, donada", "dañadas, donadas"],
  siembra_cargo_especial: "por cargo especial",
};

/** Un motivo que la base escribió y la web todavía no conoce (`motivo` es texto libre) no rompe la tarjeta: se nombra con
 *  su etiqueta, sin el « · » que la partiría en dos. */
function frase(proceso: string, cifra: number): string {
  const f = FRASE_PROCESO[proceso];
  if (!f) return `por ${etiquetaProceso(proceso).toLowerCase().replaceAll(" · ", ", ")}`;
  return typeof f === "string" ? f : Math.abs(cifra) === 1 ? f[0] : f[1];
}

/** El desglose de una tarjeta: de mayor a menor, cada proceso con su cifra. `entran` para «Entró», `salen` para «Salió».
 *  Los procesos en cero no se nombran. Los ajustes no pasan por acá: van en bruto y por respaldo (`desgloseAjustes`).
 *
 *  `anuladas` (solo en «Salió»): cuántas de las ventas se anularon después, dicho junto a «vendidas» —«30 vendidas (2 se
 *  anularon)»—. Sin eso, «30 vendidas» afirmaba 30 ventas cuando quedaron 28, y las 2 solo aparecían en «Entró» como
 *  «por venta anulada» (2026-10-03). La anulación sigue contando como entrada (ADR-0234 D1); cambia la palabra, no la
 *  cifra. Se dice «de ellas» sin comprobarlo fila por fila porque `anular_venta` exige la caja de esa venta abierta: la
 *  venta y su anulación caen en el mismo turno. */
export function desgloseCifras(g: CifrasGrupo, forma: "entran" | "salen", opciones: { anuladas?: number } = {}): string {
  const anuladas = forma === "salen" ? (opciones.anuladas ?? 0) : 0;
  return g.procesos
    .map((p) => ({ p, v: forma === "entran" ? p.entran : p.salen }))
    .filter(({ v }) => v !== 0)
    .sort((a, b) => b.v - a.v)
    .map(({ p, v }) => {
      const texto = `${v.toLocaleString("es-PE")} ${frase(p.proceso, v)}`;
      if (p.proceso !== "venta" || anuladas <= 0) return texto;
      return `${texto} (${anuladas === 1 ? "1 se anuló" : `${anuladas.toLocaleString("es-PE")} se anularon`})`;
    })
    .join(" · ");
}

/** Cuántas prendas volvieron por una venta anulada en el período: la cara «Entró» de esas ventas, para nombrarlas junto a
 *  «vendidas» en «Salió». Las cifras no dependen del filtro de tipo (la RPC no lo recibe), así que se leen de «entrada»
 *  aunque se esté mirando «Salidas». */
export function ventasAnuladas(resumen: ResumenTienda): number {
  return resumen.entrada.procesos.filter((p) => p.proceso === "anulacion_venta").reduce((s, p) => s + p.entran, 0);
}

/** Los ajustes que salen de un conteo de verdad: `conteo` lo escribe solo `cerrar_conteo`, y `hallazgo_conteo` queda
 *  enlazado al conteo donde faltó la prenda (ADR-0291); los dos llevan `conteo_item_id`. Todo otro ajuste —reposición,
 *  merma, conteo físico, otro, o un motivo que todavía no existe— lo escribe alguien a mano en «Ajustar stock» y no tiene
 *  documento detrás. */
const AJUSTES_EN_UN_CONTEO: readonly string[] = ["conteo", "hallazgo_conteo"];

export type RespaldoAjuste = "a_mano" | "en_un_conteo";

export function respaldoDeAjuste(proceso: string | null): RespaldoAjuste {
  return proceso !== null && AJUSTES_EN_UN_CONTEO.includes(proceso) ? "en_un_conteo" : "a_mano";
}

/** La tarjeta de Ajustes en BRUTO (Felipe, 2026-10-03): lo que faltó y lo que apareció por separado, nunca un neto. En
 *  TRU, +87 y −35 se mostraban como «+52», y la encargada leía que sobraba mercadería cuando 35 prendas habían faltado;
 *  el neto además restaba dentro de cada motivo («−5 por conteo» eran +4 y −9). Cada cara se parte por RESPALDO
 *  («26 a mano · 9 en un conteo»), no por motivo: lo que se viene a saber es si hay un documento detrás; el motivo sigue
 *  en cada fila y en los filtros de proceso. Null = esa cara está en cero. */
export function desgloseAjustes(g: CifrasGrupo): { faltaron: string | null; aparecieron: string | null } {
  const cara = (lado: "entran" | "salen"): string | null => {
    const por = (respaldo: RespaldoAjuste) => g.procesos.filter((p) => respaldoDeAjuste(p.proceso) === respaldo).reduce((s, p) => s + p[lado], 0);
    const partes: [number, string][] = [
      [por("a_mano"), "a mano"],
      [por("en_un_conteo"), "en un conteo"],
    ];
    return (
      partes
        .filter(([v]) => v > 0)
        .map(([v, texto]) => `${v.toLocaleString("es-PE")} ${texto}`)
        .join(" · ") || null
    );
  };
  return { faltaron: cara("salen"), aparecieron: cara("entran") };
}

/** «unidad» o «unidades», según la cifra. */
export function unidades(cifra: number): string {
  return Math.abs(cifra) === 1 ? "unidad" : "unidades";
}

// ---------------------------------------------------------------------------
// El buscador entiende los nombres de los procesos (ADR-0234): quien escribe «venta» o «traslado» quiere ver ventas o
// traslados, y la búsqueda solo busca prendas y referencias («Traslado 24»). Una palabra sola (o dos, como «stock
// inicial») que nombra un proceso se vuelve el filtro de ese tipo; con un número detrás sigue siendo una referencia.
// ---------------------------------------------------------------------------

type FiltroDePalabra = { cat: CategoriaMovimiento | null; proc: string | null; etiqueta: string };

const PALABRAS_DE_FILTRO: readonly (FiltroDePalabra & { palabras: readonly string[] })[] = [
  { palabras: ["venta", "ventas", "vendida", "vendidas", "vendido", "vendidos"], cat: "salida", proc: "venta", etiqueta: "Ventas" },
  { palabras: ["traslado", "traslados", "transferencia", "transferencias"], cat: "transferencia", proc: null, etiqueta: "Traslados" },
  { palabras: ["ajuste", "ajustes"], cat: "ajuste", proc: null, etiqueta: "Ajustes" },
  { palabras: ["conteo", "conteos"], cat: "ajuste", proc: "conteo", etiqueta: "Conteos" },
  { palabras: ["merma", "mermas"], cat: "ajuste", proc: "merma", etiqueta: "Mermas" },
  { palabras: ["devolucion", "devoluciones"], cat: "entrada", proc: "devolucion", etiqueta: "Devoluciones" },
  // «Cambio» vive en Entradas y en Salidas: el filtro va solo por proceso, sin tipo.
  { palabras: ["cambio", "cambios"], cat: null, proc: "cambio", etiqueta: "Cambios" },
  { palabras: ["recepcion", "recepciones", "compra", "compras"], cat: "entrada", proc: "recepcion", etiqueta: "Recepciones" },
  { palabras: ["stock inicial", "carga inicial"], cat: "entrada", proc: "carga_inicial", etiqueta: "Stock inicial" },
  { palabras: ["bajada", "bajadas", "retiro", "retiros"], cat: "interno", proc: null, etiqueta: "Piso ↔ almacén" },
  { palabras: ["entrada", "entradas", "llegada", "llegadas"], cat: "entrada", proc: null, etiqueta: "Entradas" },
  { palabras: ["salida", "salidas"], cat: "salida", proc: null, etiqueta: "Salidas" },
];

/** Minúsculas, sin tildes y con un solo espacio entre palabras. */
function normalizar(texto: string): string {
  return quitarTildes(texto).toLowerCase().replace(/\s+/g, " ").trim();
}

/** «Devolución» → «Devolucion»: la forma descompuesta (NFD) sin sus marcas de acento (U+0300 a U+036F), como
 *  `buscar-prenda-v2.ts`. */
function quitarTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** El filtro que nombra lo escrito, o null si lo escrito es una búsqueda de verdad (una prenda, «Traslado 24»). */
export function filtroDePalabra(texto: string): FiltroDePalabra | null {
  const t = normalizar(texto);
  if (!t) return null;
  const hallado = PALABRAS_DE_FILTRO.find((f) => f.palabras.includes(t));
  return hallado ? { cat: hallado.cat, proc: hallado.proc, etiqueta: hallado.etiqueta } : null;
}

// ---------------------------------------------------------------------------
// Quién lo hizo, con verbo (ADR-0234): «Felipe Alvarez» solo no dice si vendió, recibió o ajustó.
// ---------------------------------------------------------------------------

export function verboDelResponsable(m: Pick<Movimiento, "categoria" | "motivo" | "delta">): string {
  if (m.categoria === "transferencia") return m.delta > 0 ? "Recibió" : "Envió";
  if (m.categoria === "interno") return "Movió";
  switch (m.motivo) {
    case "venta":
      return "Vendió";
    case "anulacion_venta":
      return "Anuló la venta";
    case "devolucion":
      return "Recibió la devolución";
    case "cambio":
      return "Hizo el cambio";
    case "recepcion":
      return "Recibió";
    case "conteo":
      return "Cerró el conteo";
    case "hallazgo_conteo":
      return "Registró el hallazgo";
    case "carga_inicial":
      return "Cargó";
    case "apartado":
      return "Apartó";
    case "liberacion_apartado":
      return "Liberó";
  }
  return m.categoria === "ajuste" ? "Ajustó" : "Registró";
}

/** El período para la etiqueta de una tarjeta, corto: «30 días», «todo el historial», «1/9 – 26/9». */
export function periodoCorto(periodo: PeriodoMovimientos, desde?: string, hasta?: string): string {
  if (periodo === "hoy") return "hoy";
  if (periodo === "7" || periodo === "30" || periodo === "90") return `${periodo} días`;
  const corta = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${Number(d)}/${Number(m)}`;
  };
  if (periodo === "todo" || (!desde && !hasta)) return "todo el historial";
  if (desde && hasta) return `${corta(desde)} – ${corta(hasta)}`;
  return desde ? `desde el ${corta(desde)}` : `hasta el ${corta(hasta!)}`;
}

/** Lo que la lista muestra de cada prenda además de su fila (ADR-0234): el producto (para ir a su historial), su foto
 *  principal y cuánto hay HOY en la sede. `stockHoy` null = no se pudo leer (la lista sigue sin él). La lee
 *  `getPrendasDeMovimientos` (servidor); el tipo vive acá para que los componentes cliente no importen el servidor. */
export type PrendaDeMovimiento = { productoId: string; fotoUrl: string | null; stockHoy: Cantidades | null };

/** A dónde vuelve «←» en un traslado o un conteo abierto desde Movimientos (ADR-0234): a la misma lista, con sus
 *  filtros. Solo una ruta de Movimientos: cualquier otra cosa que venga en la URL se ignora (un enlace armado a mano no
 *  puede sacar a nadie de la app). */
export function volverAMovimientos(valor: string | null | undefined): string | null {
  if (!valor) return null;
  return /^\/inventario\/movimientos(\?[^#\s]*)?$/.test(valor) ? valor : null;
}

// ---------------------------------------------------------------------------
// Exportar a Excel (ADR-0234, decisión D3): el módulo promete «Consultar y exportar» en Roles y accesos. Un archivo CSV
// (abre igual en Excel y en Sheets) con TODO lo filtrado, no solo la página: una fila por prenda, con el efecto sobre la
// sede con signo, para que una suma en Excel dé lo que entró menos lo que salió. Lo arma la ruta
// `inventario/movimientos/exportar` (una descarga directa, como Exportar de Historial, ADR-0230).
// ---------------------------------------------------------------------------

export const ENCABEZADOS_CSV_MOVIMIENTOS = [
  "Fecha",
  "Hora",
  "Qué pasó",
  "Prenda",
  "Código",
  "Talla",
  "Color",
  "Unidades",
  "Efecto en la sede",
  // Cuántas quedaron en la sede al terminar ese movimiento (ADR-0234, saldo): lo mismo que dice la pantalla («quedan 4»).
  // Vacía si la base no lo pudo decir.
  "Quedan en la sede",
  "De dónde",
  "A dónde",
  "Zona",
  "Referencia",
  "Quién",
  "Nota",
] as const;

/** Un TEXTO que empieza con = + - @ Excel lo ejecuta como fórmula (una nota «=HIPERVINCULO(…)» sería un enlace armado
 *  por cualquiera): se le antepone un apóstrofo, como hace Exportar de Historial. Las cifras van como números, sin tocar:
 *  un «−1» tiene que poder sumarse. */
function sinFormula(texto: string): string {
  return /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
}

/** Una fila del archivo. «Efecto en la sede»: +5 entró, −1 salió, 0 se movió entre piso y almacén. `quedan`: el saldo
 *  de `fn_movimientos_saldos` para ese movimiento; sin él, la celda va vacía (nunca un 0 que parezca dato). */
export function filaCsvMovimiento(m: Movimiento, quedan: number | null = null): (string | number)[] {
  const { origen, destino } = partesOrigenDestino(m);
  const efecto = m.categoria === "interno" || m.categoria === "apartado" || m.categoria === "liberacion_apartado" ? 0 : m.delta;
  const texto = (v: string | null | undefined) => sinFormula(v ?? "");
  return [
    fechaCorta(m.fecha),
    m.hora,
    texto(etiquetaConDireccion(m)),
    texto(m.referencia),
    texto(m.sku),
    texto(m.talla),
    texto(m.color),
    Math.abs(m.cantidad),
    efecto,
    quedan ?? "",
    texto(origen),
    texto(destino),
    m.sububicacion ? texto(nombreCortoSububicacion(m.sububicacion)) : "",
    texto(referenciaMovimiento(m)?.texto),
    m.esSistema ? "Sistema" : texto(m.usuario),
    texto(m.nota),
  ];
}

/** «movimientos_tienda-lima_2026-09-26.csv»: la sede y el día, sin tildes ni espacios (algunos celulares los rompen). Si
 *  el archivo no trae todo (pasó el tope), el nombre lo dice: nunca un archivo que parece completo y no lo es. */
export function nombreArchivoMovimientos(sede: string, hoy: string, recortado = false): string {
  const slug = quitarTildes(sede).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `movimientos_${slug || "sede"}_${hoy}${recortado ? "_solo-los-mas-recientes" : ""}.csv`;
}
