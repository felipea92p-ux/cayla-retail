import type { TonoChip } from "@/components/ui/Chip";
// Relativo, no `@/`: vitest no resuelve el alias y este archivo tiene pruebas.
import { ESTADO_ETIQUETA, ETIQUETA_TIPO, type EstadoComprobante, type TipoComprobante } from "./comprobantes-reglas";

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

export const ETIQUETA_CATEGORIA: Record<CategoriaFila, string> = {
  entrada: "Entrada",
  salida: "Salida",
  interno: "Interno",
  ajuste: "Ajuste",
  transferencia: "Transferencia",
  apartado: "Apartado",
  liberacion_apartado: "Apartado liberado",
};

/** Los filtros rápidos por tipo, en el orden en que se leen en la pantalla
 *  («Todos» es no elegir ninguno). Plural: son grupos de movimientos. */
export const FILTROS_TIPO: { valor: CategoriaMovimiento; etiqueta: string }[] = [
  { valor: "entrada", etiqueta: "Entradas" },
  { valor: "salida", etiqueta: "Salidas" },
  { valor: "interno", etiqueta: "Internos" },
  { valor: "transferencia", etiqueta: "Transferencias" },
  { valor: "ajuste", etiqueta: "Ajustes" },
];

// Sobrio a propósito: verde = llegó mercadería, ámbar = se movió dentro de la
// tienda (piso ↔ almacén), rojo = un ajuste que RESTA (hay que mirarlo), el
// resto neutro. Un ajuste que suma no es alarma.
export function tonoCategoria(categoria: CategoriaFila, delta: number): TonoChip {
  if (categoria === "entrada") return "verde";
  if (categoria === "interno" || categoria === "apartado" || categoria === "liberacion_apartado") return "ambar";
  if (categoria === "ajuste" && delta < 0) return "rojo";
  return "neutro";
}

/** El proceso que originó el movimiento (`movimientos.motivo`). Los de
 *  operación los escriben las RPC; los de «sistema» son cargas hechas por
 *  script, sin persona (`usuario_id` null): existen en producción y se
 *  muestran con nombre propio, no se inventan. `reposicion`/`merma`/
 *  `conteo_fisico`/`otro` son de `AjustarInventarioModal.tsx` — un ajuste
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
  transferencia: "Transferencia",
  traslado_salida: "Transferencia · salida",
  traslado_entrada: "Transferencia · llegada",
  movimiento_interno: "Reposición interna",
  devolucion: "Devolución",
  cambio: "Cambio",
  anulacion_venta: "Anulación de venta",
  produccion: "Producción",
  conteo: "Conteo",
  apartado: "Apartado",
  liberacion_apartado: "Apartado liberado",
  // Los ajustes sueltos llevan «Ajuste ·» delante: «Reposición» a secas se confundía con
  // «Reposición interna» (bajar del almacén al piso), que es otra cosa.
  reposicion: "Ajuste · reposición",
  merma: "Ajuste · merma",
  conteo_fisico: "Ajuste · conteo físico",
  otro: "Ajuste · otro",
  carga_inicial: "Carga inicial",
  activacion_piso_almacen: "Activación piso/almacén",
  siembra_cargo_especial: "Cargo especial",
  cuarentena_liquidada: "Dañado · liquidada",
  cuarentena_se_boto: "Dañado · se botó",
  cuarentena_donada: "Dañado · donada",
};

/** Los procesos que ofrece el filtro, en el orden en que se leen. */
export const PROCESOS_FILTRO: { valor: string; etiqueta: string }[] = [
  "recepcion",
  "venta",
  "traslado_salida",
  "traslado_entrada",
  "movimiento_interno",
  "devolucion",
  "cambio",
  "anulacion_venta",
  "produccion",
  "conteo",
  "reposicion",
  "merma",
  "conteo_fisico",
  "otro",
  "carga_inicial",
  "activacion_piso_almacen",
  "cuarentena_liquidada",
  "cuarentena_se_boto",
  "cuarentena_donada",
].map((valor) => ({ valor, etiqueta: ETIQUETA_PROCESO[valor] }));

/** Qué procesos caben en cada tipo, para el filtro en dos pasos de Movimientos (2026-09-22,
 *  demo de rediseño): se elige el tipo y DEBAJO aparecen solo sus procesos, en vez de una lista
 *  de 19. Sale de con qué `tipo` escribe cada RPC cada motivo: «Cambio» vive en dos (la prenda
 *  devuelta entra, la nueva sale) y por eso está en Entradas y en Salidas. Un proceso que no esté
 *  acá se sigue filtrando por URL (`?proc=`); solo no tiene botón. */
export const PROCESOS_POR_CATEGORIA: Record<CategoriaMovimiento, string[]> = {
  entrada: ["recepcion", "devolucion", "cambio", "anulacion_venta", "produccion", "carga_inicial"],
  salida: ["venta", "cambio", "cuarentena_liquidada", "cuarentena_se_boto", "cuarentena_donada"],
  interno: ["movimiento_interno", "activacion_piso_almacen"],
  transferencia: ["traslado_salida", "traslado_entrada"],
  ajuste: ["conteo", "reposicion", "merma", "conteo_fisico", "otro"],
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

/** Lo que dice la columna «Movimiento»: el proceso en lenguaje claro. En una
 *  transferencia la palabra que importa es hacia dónde va el stock DE LA SEDE QUE SE
 *  MIRA («llegada» si suma, «salida» si resta): lo dice el signo, no el motivo — así
 *  también se lee bien una fila del modelo anterior, que no distingue las dos piernas. */
export function etiquetaMovimiento(m: Pick<Movimiento, "categoria" | "motivo" | "delta">): string {
  if (m.categoria === "transferencia") return m.delta > 0 ? ETIQUETA_PROCESO.traslado_entrada : ETIQUETA_PROCESO.traslado_salida;
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
  if (m.categoria === "transferencia") return m.delta > 0 ? "Entrada · Traslado recibido" : "Salida · Traslado enviado";
  if (m.categoria === "interno") return `Interno · a ${nombreCortoSububicacion(m.sububicacionDestino).toLowerCase()}`;
  const detalle = etiquetaMovimiento(m);
  const direccion = ETIQUETA_CATEGORIA[m.categoria];
  return detalle.startsWith(direccion) ? detalle : `${direccion} · ${detalle}`;
}

export const ETIQUETA_ESTADO_DEVOLUCION: Record<string, string> = {
  pendiente: "Pendiente de aprobar",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

/** `transferencias.estado` (20260916150000): "completada" son filas del
 *  modelo atómico anterior a esta migración — no vuelven a escribirse, pero
 *  siguen existiendo en el historial y hay que poder mostrarlas. */
export const ETIQUETA_ESTADO_TRASLADO: Record<string, string> = {
  completada: "Completada",
  en_transito: "En tránsito",
  recibido_con_diferencia: "Con diferencia — pendiente de líder",
  cerrada: "Cerrada",
};

export function tonoEstadoTraslado(estado: string): TonoChip {
  if (estado === "recibido_con_diferencia") return "ambar";
  if (estado === "en_transito") return "neutro";
  return "verde";
}

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

/** De dónde a dónde, según lo que importa en cada categoría: sububicaciones
 *  en un interno, sedes en una transferencia, la sububicación tocada en el
 *  resto (o nada, en una ubicación sin piso/almacén). */
export function textoOrigenDestino(m: Movimiento): string | null {
  if (m.categoria === "interno") {
    return `${nombreCortoSububicacion(m.sububicacion)} → ${nombreCortoSububicacion(m.sububicacionDestino)}`;
  }
  if (m.categoria === "transferencia") {
    return `${m.ubicacion} → ${m.ubicacionDestino ?? "—"}`;
  }
  return m.sububicacion?.nombre ?? null;
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
      return { origen: aqui, destino: "Clienta" };
    case "anulacion_venta":
    case "devolucion":
      return { origen: "Clienta", destino: aqui };
    case "cambio":
      return m.delta > 0 ? { origen: "Clienta", destino: aqui } : { origen: aqui, destino: "Clienta" };
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
      // La venta de origen: la de la línea vendida, la que se devolvió o la que se cambió.
      return m.venta ? { texto: textoComprobante(m.venta.comprobante), detalle: null, href: null } : null;
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

/** El rótulo de una fila en «Actividad reciente» de Inicio. `categoria` dice solo el tipo
 *  contable («Salida»), y una venta, un cambio y una merma son todas «salida»: quien mira
 *  Inicio necesita distinguirlas. Cambio y devolución van primero porque también pueden
 *  colgar de una venta. Lo demás cae a la categoría de siempre. */
export function etiquetaActividad(m: Pick<Movimiento, "categoria" | "delta" | "venta" | "cambio" | "devolucion">): string {
  if (m.cambio) return "Cambio";
  if (m.devolucion) return "Devolución";
  if (m.venta && m.delta < 0) return "Venta";
  return ETIQUETA_CATEGORIA[m.categoria];
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
// demás (el proceso específico, `proc`) va dentro de «Más filtros». Ya no se filtra
// por persona: la autoría sigue guardada en `movimientos.usuario_id` y en el detalle
// de cada movimiento, pero un `?usuario=` viejo se ignora sin romper nada.
// ---------------------------------------------------------------------------

/** Sin nada en la URL, la pantalla muestra los últimos 30 días — y lo dice. */
export const DIAS_POR_DEFECTO = 30;

/** Los períodos que se eligen con un toque. «Todo el historial» (`rango=todo`) sigue
 *  existiendo, dentro de «Personalizado», para quien de verdad necesita ir más atrás. */
export const PERIODOS_RAPIDOS = [7, 30, 90] as const;
export type PeriodoMovimientos = "7" | "30" | "90" | "todo" | "personalizado";

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
  contexto: { hoy?: string; sububicaciones?: { id: string; tipo: string | null }[] } = {}
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
  if (periodo === "7" || periodo === "30" || periodo === "90") return `Últimos ${periodo} días`;
  if (periodo === "todo") return "Todo el historial";
  if (desde && hasta) return `${fechaCorta(desde)} – ${fechaCorta(hasta)}`;
  if (desde) return `Desde ${fechaCorta(desde)}`;
  if (hasta) return `Hasta ${fechaCorta(hasta)}`;
  return "Todo el historial";
}
