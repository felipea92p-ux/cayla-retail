// Recibir en la sede un envío de orden de compra (ADR-0362, fase 4): la lógica pura de la pantalla. Sin React ni red: se importa desde el
// servidor y desde el cliente, y se prueba sola (`recepcion-envio-reglas.test.ts`).
//
//   PROMETE: leer lo que contestan `fn_envios_por_abrir`, `fn_ordenes_directas_por_recibir`, `fn_envio_detalle`, `fn_prendas_para_recibir`,
//   `preparar_prenda_al_recibir`, `abrir_despacho`, `recibir_orden_sin_envio` y `recibir_despacho` sin confiar en su forma (la web puede
//   publicarse antes que la migración: una fila rara se descarta, un campo que falta toma un valor neutro); armar la matriz talla × color de
//   cada línea y sus sumas (contado, buenas, dañadas, la diferencia contra lo que venía); decir qué le falta a la recepción con las MISMAS
//   reglas que `recibir_despacho` (de aquí sale la guía de foco); armar `p_lineas` y `p_extras`; leer el aviso de costo atípico; y los textos
//   de lo que quedó («ENV-000061 recibido · 30 prendas al almacén, 2 a cuarentena · faltan 2»).
//   NO HACE: no habla con la base ni decide permisos (el módulo Recibir, la sede y «quien hizo la orden no la recibe» los decide la función).
//
// El contrato con la base: docs/compras/ordenes-de-compra-2026-10/contrato-recepcion-de-envio.md.
//
// Las cantidades se escriben como texto, igual que en el alta de producto: vacío es cero; solo enteros de 0 a 9999 (`leerCantidad`). El costo
// se lee con la costumbre del ERP (punto decimal, coma de miles; «12,50» sin punto es doce cincuenta: `leerNumero`).

import { claveCelda, claveReferencia, construirCeldas, leerCantidad, tituloReferencia, type ColorAlta } from "./alta-producto";
import { leerCostosAtipicos, MOTIVOS_COSTO_ATIPICO, type CostoAtipico, type MotivoCostoAtipico } from "./costo-atipico-reglas";
import { urlEtiquetasDePrecio } from "./etiqueta-precio-reglas";
import { lineasEnUrl, MAX_VARIANTES_EN_URL } from "./existencias-prendas";
import type { CampoDeGuia } from "./guia-campos";
import type { AccionDespues } from "./llegada-reglas";
import { aTexto, leerNumero, textoParaBase } from "./orden-compra-alta";
import { numeroEnvio, numeroOrdenCompra, type EstadoEnvio } from "./ordenes-compra-reglas";
import { cubrirReposiciones, deudaDe, leerDeudasDelEnvio, opcionReposicion, pendienteDe, VALOR_REPOSICION, type DeudaDelEnvio, type PedidoReposicion } from "./nos-debe-reglas";
import { compararTallas } from "./tallas";

// ---------------------------------------------------------------------------------------------------------------------------------
// Nombres de la base y topes
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lecturas: empiezan con `fn_`, así el loader no bloquea la pantalla mientras se busca (`espera-reglas.ts`). La de la fase 4 es
 *  `fn_envios_por_recibir` (en camino y abiertos, con «creado por mí»); la de la fase 3 (`fn_envios_por_abrir`, solo en camino) queda
 *  de respaldo mientras la base no tenga la nueva. */
export const RPC_ENVIOS_POR_RECIBIR = "fn_envios_por_recibir";
export const RPC_ENVIOS_POR_ABRIR = "fn_envios_por_abrir";
export const RPC_ORDENES_DIRECTAS = "fn_ordenes_directas_por_recibir";
export const RPC_PRENDAS_PARA_RECIBIR = "fn_prendas_para_recibir";
/** Escrituras: abren el loader («guardado»). */
export const RPC_ABRIR_DESPACHO = "abrir_despacho";
export const RPC_RECIBIR_SIN_ENVIO = "recibir_orden_sin_envio";
export const RPC_PREPARAR_PRENDA = "preparar_prenda_al_recibir";
export const RPC_RECIBIR_DESPACHO = "recibir_despacho";

/** Lo que la base acepta (los topes de `recibir_despacho`). */
export const TOPES_RECEPCION = { nota: 500 } as const;

/** Lo que la pantalla deja escribir en la hoja de la prenda nueva (el nombre de un modelo del ERP, `MAX_NOMBRE_MODELO`). */
export const TOPES_PRENDA = { nombre: 80, descripcion: 300 } as const;

/** Hasta cuántas prendas devuelve `fn_prendas_para_recibir` (las que coinciden con la búsqueda primero). */
export const MAX_PRENDAS_PARA_RECIBIR = 30;

/** El aviso de costo atípico de la recepción (`recibir_despacho`): el detalle viene en JSON en `details`. */
export const HINT_COSTO_ATIPICO_RECEPCION = "recepcion_costo_atipico";
/** Decisión 17: quien hizo una de las órdenes del envío no lo recibe (ni el líder). */
export const HINT_QUIEN_COMPRO = "recibir_quien_compro";

// ---------------------------------------------------------------------------------------------------------------------------------
// Causas (decisiones 14, 15, 23 y 27)
// ---------------------------------------------------------------------------------------------------------------------------------

export type CausaFaltante = "no_vino" | "se_perdio" | "otra_sede";
/** `reposicion` (fase 5a): lo de más es lo que el proveedor debía de una recepción anterior. Solo se ofrece si lo debe (`opcionesSobrante`). */
export type CausaSobrante = "regalo" | "cobra_aparte" | "proxima_compra" | typeof VALOR_REPOSICION;
/** Una dañada con arreglo queda en cuarentena esperando; sin arreglo, en cuarentena para liquidar, regalar, desechar o devolver. */
export type SolucionDanada = "pendiente" | "sin_solucion";

/** Qué pasó con lo que faltó, en palabras de tienda. La lista es provisional (contrato): Felipe la revisa. */
export const CAUSAS_FALTANTE: readonly { valor: CausaFaltante; texto: string; ayuda: string }[] = [
  { valor: "no_vino", texto: "No vino", ayuda: "El proveedor no lo mandó: queda como deuda por reponer." },
  { valor: "se_perdio", texto: "Se perdió en el camino", ayuda: "Lo asume CAYLA: al proveedor se le paga completo." },
  { valor: "otra_sede", texto: "Llegó a otra sede", ayuda: "Se cruza en el papel con la otra sede: no es deuda." },
];

/** Qué pasa con lo que vino de más (decisión 15: lo marca quien recibe). La reposición se suma solo cuando aplica (`opcionesSobrante`). */
export const CAUSAS_SOBRANTE: readonly { valor: CausaSobrante; texto: string; ayuda: string }[] = [
  { valor: "regalo", texto: "Regalo", ayuda: "El proveedor no lo cobra." },
  { valor: "cobra_aparte", texto: "Se cobra aparte", ayuda: "El proveedor manda otro comprobante por esto." },
  { valor: "proxima_compra", texto: "Se arregla en la próxima compra", ayuda: "Se cobra o se descuenta en la próxima orden." },
];

export const SOLUCIONES_DANADA: readonly { valor: SolucionDanada; texto: string; textoUna: string; ayuda: string }[] = [
  { valor: "pendiente", texto: "Sí, tienen arreglo", textoUna: "Sí, tiene arreglo", ayuda: "Quedan en cuarentena hasta que se arreglen." },
  { valor: "sin_solucion", texto: "No tienen arreglo", textoUna: "No tiene arreglo", ayuda: "Quedan en cuarentena para liquidar, regalar, desechar o devolver." },
];

export const textoCausa = (causa: string | null | undefined): string | null =>
  causa === VALOR_REPOSICION
    ? "Reposición de lo que faltó"
    : ([...CAUSAS_FALTANTE, ...CAUSAS_SOBRANTE].find((c) => c.valor === causa)?.texto ?? (causa ? causa.replace(/_/g, " ") : null));

// ---------------------------------------------------------------------------------------------------------------------------------
// Lectores tolerantes
// ---------------------------------------------------------------------------------------------------------------------------------

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const cifra = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const booleano = (v: unknown): boolean | null => (v === true || v === "true" ? true : v === false || v === "false" ? false : null);
const ESTADOS: readonly EstadoEnvio[] = ["en_camino", "abierto", "cerrado", "anulado"];
const estadoDe = (v: unknown): EstadoEnvio | null => ESTADOS.find((e) => e === v) ?? null;

/** «OC-000129» desde lo que mande la base: el texto ya escrito o la cifra. */
function numeroDeOrden(v: unknown): string | null {
  const t = texto(v);
  if (t && /^oc-/i.test(t)) return t.toUpperCase();
  const n = cifra(v);
  return n == null ? t : numeroOrdenCompra(n);
}

/** Un `{ id, nombre }` del detalle (o null si no viene completo). */
function idNombre(v: unknown): { id: string; nombre: string } | null {
  const r = objeto(v);
  if (!r) return null;
  const id = texto(r.id);
  const nombre = texto(r.nombre);
  return id && nombre ? { id, nombre } : null;
}

// ---- Lo que está por recibir en una sede (la puerta) -------------------------------------------------------------------------------

/** Un envío en camino (o ya abierto) hacia la sede: una fila de la tarjeta de `/recibir`. */
export type EnvioPorAbrir = {
  id: string;
  /** «ENV-000061». */
  numero: string;
  numeroGuia: string | null;
  estado: Extract<EstadoEnvio, "en_camino" | "abierto">;
  unidades: number;
  lineas: number;
  ordenes: string[];
  proveedores: string[];
  /** Quien mira hizo alguna de sus órdenes (decisión 17): la pantalla lo dice antes de que la base lo frene. */
  creadoPorMi: boolean;
};

/** Lee `fn_envios_por_abrir`: una fila sin id o sin número se descarta; un estado que no es «en camino» ni «abierto» también (la base de la
 *  fase 3 no manda el estado: todo lo que manda está en camino). */
export function leerEnviosPorAbrir(data: unknown): EnvioPorAbrir[] {
  return lista(data)
    .map((f): EnvioPorAbrir | null => {
      const r = objeto(f);
      if (!r) return null;
      const id = texto(r.id) ?? texto(r.despacho_id);
      const numero = numeroEnvio(r.numero);
      const estado = r.estado == null ? "en_camino" : estadoDe(r.estado);
      if (!id || !numero || (estado !== "en_camino" && estado !== "abierto")) return null;
      return {
        id,
        numero,
        numeroGuia: texto(r.numero_guia),
        estado,
        unidades: Math.max(0, cifra(r.unidades) ?? 0),
        lineas: Math.max(0, cifra(r.lineas) ?? 0),
        ordenes: lista(r.ordenes).map(numeroDeOrden).filter((x): x is string => !!x),
        proveedores: lista(r.proveedores).map((p) => texto(p) ?? idNombre(p)?.nombre ?? null).filter((x): x is string => !!x),
        creadoPorMi: booleano(r.creado_por_mi) ?? false,
      };
    })
    .filter((e): e is EnvioPorAbrir => e !== null);
}

/** Una orden «directo» a la sede que llegó sin guía (decisión 48): se recibe contra la orden. */
export type OrdenDirecta = {
  ordenId: string;
  /** «OC-000465». */
  numero: string;
  proveedor: string | null;
  unidadesPorEnviar: number;
  creadaPorMi: boolean;
};

/** Lee `fn_ordenes_directas_por_recibir`. Una orden sin nada por enviar no se ofrece (no habría qué recibir). */
export function leerOrdenesDirectas(data: unknown): OrdenDirecta[] {
  return lista(data)
    .map((f): OrdenDirecta | null => {
      const r = objeto(f);
      if (!r) return null;
      const ordenId = texto(r.orden_id) ?? texto(r.orden_compra_id) ?? texto(r.id);
      const numero = numeroDeOrden(r.numero);
      const unidades = cifra(r.unidades_por_enviar) ?? cifra(r.unidades);
      if (!ordenId || !numero || unidades == null || unidades <= 0) return null;
      const proveedor = texto(r.proveedor) ?? idNombre(r.proveedor)?.nombre ?? texto(r.proveedor_nombre);
      return { ordenId, numero, proveedor, unidadesPorEnviar: unidades, creadaPorMi: booleano(r.creada_por_mi) ?? booleano(r.creado_por_mi) ?? false };
    })
    .filter((o): o is OrdenDirecta => o !== null);
}

/** Lo que se dice en vez del botón cuando quien mira hizo la orden (decisión 17). */
export const TEXTO_LA_RECIBE_OTRA = "La recibe otra persona: tú hiciste la orden";

// ---- Un envío por dentro (`fn_envio_detalle`) ---------------------------------------------------------------------------------------

export type CategoriaDeLinea = { id: string; nombre: string; prefijo: string | null; familia: string | null };

/** Una línea del envío: lo que se pidió y salió hacia la sede, con su precio congelado (quien recibe lo ve y lo corrige, decisión 18). */
export type LineaEnvio = {
  /** El id de la línea del envío (`despacho_items.id`): lo que `p_lineas` nombra. */
  id: string;
  orden: { id: string | null; numero: string | null };
  posicion: number | null;
  proveedor: { id: string; nombre: string } | null;
  categoria: CategoriaDeLinea;
  marca: { id: string; nombre: string };
  descripcion: string | null;
  /** Lo que salió en este envío: «vienen 20». */
  enviado: number;
  /** El costo por unidad congelado al enviar (el neto de la orden). */
  costoUnitario: number;
  compraItemId: string | null;
  /** El precio de venta que puso quien compró (decisión 21): precarga el de la prenda nueva. */
  precioVentaSugerido: number | null;
  /** La prenda del catálogo que eligió la compradora al comprar desde el celular (ADR-0480): se ofrece de un toque al contar. */
  prendaElegida: { productoId: string; nombre: string | null; codigo: string | null } | null;
};

/** El papel de una compra anotada desde el celular que viene en el envío (ADR-0480): la tienda cuenta mirando su foto. Sin montos. */
export type PapelDelEnvio = {
  id: string;
  tipo: string | null;
  fotoRuta: string | null;
  fecha: string | null;
  proveedor: string | null;
  compradora: string | null;
};

/** Lo que entró de una línea (o de algo que no estaba en la guía), tal como se cerró: «cómo se cerró». */
export type RecibidoEnvio = {
  despachoItemId: string | null;
  /** Lo que no estaba en la guía: su lugar entre los extras (1, 2…); `null` en una línea del envío. */
  extra: number | null;
  varianteId: string | null;
  prenda: string | null;
  talla: string | null;
  color: string | null;
  cantidad: number;
  danadas: number;
  costoUnitario: number | null;
  categoria: string | null;
  marca: string | null;
};

export type DiferenciaEnvio = {
  despachoItemId: string | null;
  extra: number | null;
  tipo: "faltante" | "sobrante";
  causa: string | null;
  cantidad: number;
  categoria: string | null;
  marca: string | null;
};

export type DetalleEnvio = {
  id: string;
  numero: string;
  estado: EstadoEnvio;
  sede: { id: string; nombre: string } | null;
  numeroGuia: string | null;
  /** La nota de quien envió. */
  nota: string | null;
  /** La nota de quien recibió (al cerrar). */
  notaRecepcion: string | null;
  despachadoPor: string | null;
  despachadoEn: string | null;
  abiertoPor: string | null;
  abiertoEn: string | null;
  cerradoPor: string | null;
  cerradoEn: string | null;
  anuladoPor: string | null;
  anuladoEn: string | null;
  motivoAnulacion: string | null;
  version: number;
  /** Cuántas prendas vienen en total. */
  enviado: number;
  lineas: LineaEnvio[];
  /** Solo en un envío cerrado; `null` si la base todavía no lo dice. */
  recibidos: RecibidoEnvio[] | null;
  diferencias: DiferenciaEnvio[] | null;
  /** Los lotes de la recepción (uno por proveedor), si la base los manda. */
  lotes: string[];
  /** En un envío cerrado: el resumen de cómo se cerró (`recepcion`, el mismo que devuelve `recibir_despacho`). */
  recepcion: ResultadoRecepcion | null;
  /** Si la base lo dice: quien mira hizo alguna de sus órdenes (decisión 17). */
  creadoPorMi: boolean | null;
  /** Lo que los proveedores del envío deben por reponer, por categoría y marca (fase 5a, `deudas_del_proveedor`): con esto se ofrece «Es la
   *  reposición de lo que faltó». `null` = la base todavía no lo dice (la recepción sigue sin esa opción). */
  deudas: DeudaDelEnvio[] | null;
  /** Los papeles de las compras anotadas desde el celular que vienen en el envío (ADR-0480); vacío en uno armado en el escritorio. */
  papeles: PapelDelEnvio[];
};

function leerCategoria(r: Record<string, unknown>): CategoriaDeLinea | null {
  const c = objeto(r.categoria);
  const id = (c ? texto(c.id) : null) ?? texto(r.categoria_id);
  const nombre = (c ? texto(c.nombre) : null) ?? texto(r.categoria);
  if (!id || !nombre) return null;
  return { id, nombre, prefijo: (c ? texto(c.prefijo) : null) ?? texto(r.categoria_prefijo), familia: (c ? texto(c.familia) : null) ?? texto(r.categoria_familia) };
}

function leerMarca(r: Record<string, unknown>): { id: string; nombre: string } | null {
  const m = objeto(r.marca);
  const id = (m ? texto(m.id) : null) ?? texto(r.marca_id);
  const nombre = (m ? texto(m.nombre) : null) ?? texto(r.marca);
  return id && nombre ? { id, nombre } : null;
}

function leerLineaEnvio(f: unknown): LineaEnvio | null {
  const r = objeto(f);
  if (!r) return null;
  const id = texto(r.id) ?? texto(r.despacho_item_id);
  const categoria = leerCategoria(r);
  const marca = leerMarca(r);
  const enviado = cifra(r.cantidad) ?? cifra(r.enviado);
  if (!id || !categoria || !marca || enviado == null || enviado < 0) return null;
  const o = objeto(r.orden);
  return {
    id,
    orden: { id: (o ? texto(o.id) : null) ?? texto(r.orden_compra_id), numero: numeroDeOrden(o ? o.numero : r.orden) },
    posicion: cifra(r.posicion),
    proveedor: idNombre(r.proveedor),
    categoria,
    marca,
    descripcion: texto(r.descripcion),
    enviado,
    costoUnitario: Math.max(0, cifra(r.precio_unitario) ?? cifra(r.costo_unitario) ?? 0),
    compraItemId: texto(r.compra_item_id),
    precioVentaSugerido: cifra(r.precio_venta_sugerido),
    prendaElegida: leerPrendaElegida(r.producto),
  };
}

function leerPrendaElegida(v: unknown): LineaEnvio["prendaElegida"] {
  const o = objeto(v);
  const productoId = o ? texto(o.id) : null;
  return o && productoId ? { productoId, nombre: texto(o.nombre), codigo: texto(o.codigo) } : null;
}

/** La carpeta de las fotos de los papeles de compra (ADR-0480): una ruta de otra carpeta no se firma. */
export const CARPETA_PAPELES_COMPRA = "papeles/";

function leerPapel(v: unknown): PapelDelEnvio | null {
  const o = objeto(v);
  const id = o ? texto(o.id) : null;
  if (!o || !id) return null;
  const ruta = texto(o.foto_ruta);
  return {
    id,
    tipo: texto(o.tipo),
    fotoRuta: ruta && ruta.startsWith(CARPETA_PAPELES_COMPRA) ? ruta : null,
    fecha: texto(o.fecha),
    proveedor: texto(o.proveedor),
    compradora: texto(o.compradora),
  };
}

function nombreDePrenda(r: Record<string, unknown>): string | null {
  const p = objeto(r.prenda) ?? objeto(r.producto);
  return (p ? texto(p.nombre) ?? texto(p.referencia) : null) ?? texto(r.prenda) ?? texto(r.producto) ?? texto(r.referencia);
}

function leerRecibido(f: unknown): RecibidoEnvio | null {
  const r = objeto(f);
  if (!r) return null;
  const cantidad = cifra(r.cantidad);
  if (cantidad == null || cantidad < 0) return null;
  const t = objeto(r.talla);
  const c = objeto(r.color);
  return {
    despachoItemId: texto(r.despacho_item_id),
    extra: cifra(r.extra),
    varianteId: texto(r.variante_id),
    prenda: nombreDePrenda(r),
    talla: (t ? texto(t.valor) ?? texto(t.nombre) : null) ?? texto(r.talla),
    color: (c ? texto(c.nombre) : null) ?? texto(r.color),
    cantidad,
    danadas: Math.max(0, cifra(r.danadas) ?? 0),
    costoUnitario: cifra(r.costo_unitario) ?? cifra(r.costo),
    categoria: idNombre(r.categoria)?.nombre ?? texto(r.categoria),
    marca: idNombre(r.marca)?.nombre ?? texto(r.marca),
  };
}

function leerDiferencia(f: unknown): DiferenciaEnvio | null {
  const r = objeto(f);
  if (!r) return null;
  const tipo = r.tipo === "faltante" || r.tipo === "sobrante" ? r.tipo : null;
  const cantidad = cifra(r.cantidad);
  if (!tipo || cantidad == null || cantidad <= 0) return null;
  return {
    despachoItemId: texto(r.despacho_item_id),
    extra: cifra(r.extra),
    tipo,
    causa: texto(r.causa),
    cantidad,
    categoria: idNombre(r.categoria)?.nombre ?? texto(r.categoria),
    marca: idNombre(r.marca)?.nombre ?? texto(r.marca),
  };
}

/**
 * Lee `fn_envio_detalle`. `null` si no llegó un envío (no existe, o la respuesta no se entiende). Una línea rara se descarta. Acepta las dos
 * formas de la base: la de la fase 3 (`categoria` y `marca` como texto, con su `_id` al lado; `orden` como texto) y la de la fase 4
 * (`categoria` `{id, nombre, prefijo, familia}`, `marca` `{id, nombre}`, `orden` `{id, numero}`).
 */
export function leerDetalleEnvio(data: unknown): DetalleEnvio | null {
  const crudo = Array.isArray(data) ? data[0] : data;
  const d = objeto(crudo);
  if (!d) return null;
  const id = texto(d.id) ?? texto(d.despacho_id);
  const numero = numeroEnvio(d.numero);
  const estado = estadoDe(d.estado);
  if (!id || !numero || !estado) return null;
  const lineas = lista(d.lineas)
    .map(leerLineaEnvio)
    .filter((l): l is LineaEnvio => l !== null);
  const recibidos = Array.isArray(d.recibidos) ? d.recibidos.map(leerRecibido).filter((x): x is RecibidoEnvio => x !== null) : null;
  const recepcion = d.recepcion ? leerResultadoRecepcion(d.recepcion) : null;
  const diferencias = Array.isArray(d.diferencias) ? d.diferencias.map(leerDiferencia).filter((x): x is DiferenciaEnvio => x !== null) : null;
  return {
    id,
    numero,
    estado,
    sede: idNombre(d.sede),
    numeroGuia: texto(d.numero_guia),
    nota: texto(d.nota),
    notaRecepcion: texto(d.nota_recepcion),
    despachadoPor: texto(d.despachado_por),
    despachadoEn: texto(d.despachado_en),
    abiertoPor: texto(d.abierto_por),
    abiertoEn: texto(d.abierto_en),
    cerradoPor: texto(d.cerrado_por),
    cerradoEn: texto(d.cerrado_en),
    anuladoPor: texto(d.anulado_por),
    anuladoEn: texto(d.anulado_en),
    motivoAnulacion: texto(d.motivo_anulacion),
    version: cifra(d.version) ?? 1,
    enviado: cifra(d.unidades) ?? lineas.reduce((a, l) => a + l.enviado, 0),
    lineas,
    recibidos,
    diferencias,
    lotes: [
      ...new Set(
        [...lista(d.lotes), ...(recepcion?.lotes ?? [])].map((x) => texto(x) ?? texto(objeto(x)?.id)).filter((x): x is string => !!x),
      ),
    ],
    recepcion,
    creadoPorMi: booleano(d.creado_por_mi),
    deudas: leerDeudasDelEnvio(d.deudas_del_proveedor ?? d.deudas),
    papeles: lista(d.papeles).map(leerPapel).filter((x): x is PapelDelEnvio => x !== null),
  };
}

/** Los proveedores del envío (uno por línea, sin repetir), en el orden en que aparecen. Con dos o más, lo que no estaba en la guía dice de cuál es. */
export function proveedoresDelEnvio(d: Pick<DetalleEnvio, "lineas">): { id: string; nombre: string }[] {
  const vistos = new Map<string, { id: string; nombre: string }>();
  for (const l of d.lineas) if (l.proveedor && !vistos.has(l.proveedor.id)) vistos.set(l.proveedor.id, l.proveedor);
  return [...vistos.values()];
}

/** Las órdenes del envío, sin repetir: «OC-000129, OC-000130». */
export function ordenesDelEnvio(d: Pick<DetalleEnvio, "lineas">): string[] {
  return [...new Set(d.lineas.map((l) => l.orden.numero).filter((x): x is string => !!x))];
}

/** «Chompas · CAYLA · Chompa cuello alto». */
export function nombreDeLinea(l: Pick<LineaEnvio, "categoria" | "marca" | "descripcion">): string {
  return [l.categoria.nombre, l.marca.nombre, l.descripcion].filter(Boolean).join(" · ");
}

// ---- Las prendas de una categoría y marca (`fn_prendas_para_recibir`, `preparar_prenda_al_recibir`) -----------------------------------

export type VarianteRecepcion = {
  id: string;
  tallaId: string | null;
  talla: string | null;
  colorCodigo: string | null;
  color: string | null;
  codigo: string | null;
  costo: number | null;
  precio: number | null;
};

export type PrendaRecepcion = {
  productoId: string;
  nombre: string;
  codigo: string | null;
  fotoUrl: string | null;
  variantes: VarianteRecepcion[];
  /** Se creó al recibir (Es nueva). */
  nueva: boolean;
  /** `pendiente`: la creó quien no edita el catálogo y un líder la revisa después (sigue pudiéndose recibir). */
  estadoAlta: string | null;
};

function leerVariante(f: unknown): VarianteRecepcion | null {
  const r = objeto(f);
  if (!r) return null;
  const id = texto(r.id) ?? texto(r.variante_id);
  if (!id) return null;
  const t = objeto(r.talla);
  const c = objeto(r.color);
  return {
    id,
    tallaId: (t ? texto(t.id) : null) ?? texto(r.talla_id),
    talla: (t ? texto(t.valor) ?? texto(t.nombre) : null) ?? texto(r.talla),
    colorCodigo: (c ? texto(c.codigo) : null) ?? texto(r.color_codigo),
    color: (c ? texto(c.nombre) : null) ?? texto(r.color) ?? texto(r.color_nombre),
    codigo: texto(r.codigo) ?? texto(r.sku),
    costo: cifra(r.costo),
    precio: cifra(r.precio),
  };
}

function leerPrenda(f: unknown, nueva: boolean): PrendaRecepcion | null {
  const r = objeto(f);
  if (!r) return null;
  const productoId = texto(r.producto_id) ?? texto(r.id);
  const nombre = texto(r.nombre) ?? texto(r.referencia);
  if (!productoId || !nombre) return null;
  const variantes = lista(r.variantes)
    .map(leerVariante)
    .filter((v): v is VarianteRecepcion => v !== null);
  return { productoId, nombre, codigo: texto(r.codigo), fotoUrl: texto(r.foto_url) ?? texto(r.foto) ?? texto(r.foto_principal), variantes, nueva, estadoAlta: texto(r.estado_alta) };
}

/** Lee `fn_prendas_para_recibir`: las prendas de esa categoría y marca para «Ya la tengo». Una sin id o sin nombre se descarta. */
export function leerPrendasParaRecibir(data: unknown): PrendaRecepcion[] {
  return lista(data)
    .map((f) => leerPrenda(f, false))
    .filter((p): p is PrendaRecepcion => p !== null);
}

/**
 * Lee lo que contesta `preparar_prenda_al_recibir`: `{ producto_id, nombre, variantes }`. Con `previa` (una prenda que ya existía, «+ talla o
 * color»), junta sus variantes con las que devuelve la base (la base puede mandar todas o solo las nuevas): ninguna se pierde ni se repite.
 */
export function leerPrendaPreparada(data: unknown, previa: PrendaRecepcion | null = null): PrendaRecepcion | null {
  const crudo = Array.isArray(data) ? data[0] : data;
  const leida = leerPrenda(crudo, previa ? previa.nueva : true);
  if (!leida) return null;
  if (!previa || previa.productoId !== leida.productoId) return leida;
  const porId = new Map(previa.variantes.map((v) => [v.id, v]));
  for (const v of leida.variantes) porId.set(v.id, { ...porId.get(v.id), ...v });
  return { ...previa, nombre: leida.nombre, estadoAlta: leida.estadoAlta ?? previa.estadoAlta, variantes: [...porId.values()] };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// La matriz talla × color de una prenda
// ---------------------------------------------------------------------------------------------------------------------------------

export type EjeTalla = { id: string | null; texto: string };
export type EjeColor = { codigo: string | null; nombre: string };
export type MatrizRecepcion = {
  /** Las columnas, en el orden de la curva (S · M · L, 36 · 38 · 40). Sin talla: una sola columna «Única». */
  tallas: EjeTalla[];
  /** Las filas: los colores de la prenda. Sin color: una sola fila «Sin color». */
  colores: EjeColor[];
  /** La variante de esa talla y ese color, o null si la prenda no la tiene (la celda sale rayada). */
  celda: (tallaId: string | null, colorCodigo: string | null) => VarianteRecepcion | null;
};

/**
 * La matriz de una prenda: una fila por color, una columna por talla, como la tabla de Nuevo producto (la misma forma a propósito). Los
 * colores van en el orden del vocabulario (`ordenColores`, los códigos en orden) y, si alguno no está ahí, por nombre.
 */
export function matrizDe(prenda: Pick<PrendaRecepcion, "variantes">, ordenColores: readonly string[] = []): MatrizRecepcion {
  const tallas = new Map<string, EjeTalla>();
  const colores = new Map<string, EjeColor>();
  const celdas = new Map<string, VarianteRecepcion>();
  for (const v of prenda.variantes) {
    const ct = v.tallaId ?? "";
    const cc = v.colorCodigo ?? "";
    if (!tallas.has(ct)) tallas.set(ct, { id: v.tallaId, texto: v.talla ?? "Única" });
    if (!colores.has(cc)) colores.set(cc, { codigo: v.colorCodigo, nombre: v.color ?? (v.colorCodigo ? v.colorCodigo : "Sin color") });
    celdas.set(claveCelda(v.tallaId, v.colorCodigo), v);
  }
  const posicion = new Map(ordenColores.map((c, i) => [c, i]));
  return {
    tallas: [...tallas.values()].sort((a, b) => compararTallas(a.texto, b.texto)),
    colores: [...colores.values()].sort((a, b) => {
      const pa = a.codigo ? (posicion.get(a.codigo) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      const pb = b.codigo ? (posicion.get(b.codigo) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      return pa - pb || a.nombre.localeCompare(b.nombre, "es");
    }),
    celda: (tallaId, colorCodigo) => celdas.get(claveCelda(tallaId, colorCodigo)) ?? null,
  };
}

/** «Negro en M»: el nombre de una celda para el lector de pantalla y los avisos. */
export function nombreDeVariante(v: Pick<VarianteRecepcion, "talla" | "color">): string {
  return `${v.color ?? "Sin color"} en ${v.talla ?? "Única"}`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que la persona va llenando
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo contado de una prenda: por variante, cuántas llegaron (buenas y dañadas juntas) y cuántas de esas vinieron dañadas. */
export type Conteo = {
  cantidades: Readonly<Record<string, string>>;
  danadas: Readonly<Record<string, string>>;
  /** «¿Llegó algo dañado?» está abierto. Cerrado, las dañadas no cuentan (y la pantalla las borra al cerrarlo). */
  conDanadas: boolean;
  /** ¿Tienen arreglo? Solo se pregunta si hay dañadas. */
  arreglo: SolucionDanada | null;
};

export type BorradorLinea = Conteo & {
  /** El costo por unidad, como se escribe; viene puesto con el del envío. */
  costo: string;
  prenda: PrendaRecepcion | null;
  /** «No llegó nada de esto»: la línea se decide sin prenda (todo es faltante). */
  noLlego: boolean;
  faltanteCausa: CausaFaltante | null;
  sobranteCausa: CausaSobrante | null;
};

/** Algo que llegó y no estaba en la guía (decisión 13: «la sede puede agregar … prendas antes de cerrar»). */
export type BorradorExtra = Conteo & {
  clave: string;
  /** De qué proveedor es: solo se elige si el envío trae dos o más. */
  proveedorId: string;
  categoriaId: string;
  marcaId: string;
  costo: string;
  prenda: PrendaRecepcion | null;
  sobranteCausa: CausaSobrante | null;
};

export type BorradorRecepcion = {
  /** Clave: el id de la línea del envío. */
  lineas: Readonly<Record<string, BorradorLinea>>;
  extras: readonly BorradorExtra[];
  nota: string;
};

const CONTEO_VACIO: Conteo = { cantidades: {}, danadas: {}, conDanadas: false, arreglo: null };

/** El costo como se escribe: 25 → «25.00». */
export const costoComoTexto = (n: number): string => aTexto(Math.round(n * 100), 2);

/** Cada línea arranca con el costo del envío puesto y sin prenda; sin extras ni nota. */
export function borradorInicial(d: Pick<DetalleEnvio, "lineas">): BorradorRecepcion {
  const lineas: Record<string, BorradorLinea> = {};
  for (const l of d.lineas) {
    lineas[l.id] = { ...CONTEO_VACIO, costo: costoComoTexto(l.costoUnitario), prenda: null, noLlego: false, faltanteCausa: null, sobranteCausa: null };
  }
  return { lineas, extras: [], nota: "" };
}

export function extraVacio(clave: string, proveedorId = ""): BorradorExtra {
  return { ...CONTEO_VACIO, clave, proveedorId, categoriaId: "", marcaId: "", costo: "", prenda: null, sobranteCausa: null };
}

/** Lo de una línea del borrador (o una vacía, si la base mandó una línea que la pantalla no conocía). */
export function lineaDelBorrador(b: BorradorRecepcion, l: LineaEnvio): BorradorLinea {
  return b.lineas[l.id] ?? { ...CONTEO_VACIO, costo: costoComoTexto(l.costoUnitario), prenda: null, noLlego: false, faltanteCausa: null, sobranteCausa: null };
}

/** Poner una prenda (nueva o que ya existía) empieza el conteo de cero: las cantidades de otra prenda no son de esta. */
export function conPrenda<T extends Conteo & { prenda: PrendaRecepcion | null }>(b: T, prenda: PrendaRecepcion | null): T {
  return { ...b, ...CONTEO_VACIO, prenda };
}

/** «+ talla o color»: la misma prenda con más variantes. Lo contado se queda (las variantes de antes siguen ahí). */
export function conVariantesNuevas<T extends Conteo & { prenda: PrendaRecepcion | null }>(b: T, prenda: PrendaRecepcion): T {
  return { ...b, prenda };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Sumas
// ---------------------------------------------------------------------------------------------------------------------------------

export type SumasConteo = {
  /** Lo contado: buenas + dañadas (lo que la base suma como «contado»). */
  contado: number;
  danadas: number;
  buenas: number;
  /** Celdas de cantidad con algo que no es una cantidad. */
  invalidas: number;
  /** Celdas de dañadas con algo que no es una cantidad. */
  danadasInvalidas: number;
  /** Las variantes con más dañadas que las que llegaron. */
  danadasDeMas: string[];
};

/** Las sumas de lo contado de UNA prenda. Solo cuentan las variantes de la prenda (lo escrito para otra prenda no suma). */
export function sumasDe(c: Conteo, prenda: Pick<PrendaRecepcion, "variantes"> | null): SumasConteo {
  const s: SumasConteo = { contado: 0, danadas: 0, buenas: 0, invalidas: 0, danadasInvalidas: 0, danadasDeMas: [] };
  if (!prenda) return s;
  for (const v of prenda.variantes) {
    const n = leerCantidad(c.cantidades[v.id] ?? "");
    if (n === null) {
      s.invalidas += 1;
      continue;
    }
    s.contado += n;
    if (!c.conDanadas) continue;
    const d = leerCantidad(c.danadas[v.id] ?? "");
    if (d === null) {
      s.danadasInvalidas += 1;
      continue;
    }
    if (d > n) s.danadasDeMas.push(v.id);
    else s.danadas += d;
  }
  s.buenas = s.contado - s.danadas;
  return s;
}

/** Lo contado de una línea del envío: sin decidir o «no llegó nada», cero. */
export function contadoDeLinea(b: BorradorLinea): number {
  return b.noLlego ? 0 : sumasDe(b, b.prenda).contado;
}

/** Una línea está decidida si dice qué prenda es o que no llegó nada. Sin decidir, la base la rechaza. */
export const lineaDecidida = (b: Pick<BorradorLinea, "prenda" | "noLlego">): boolean => b.noLlego || b.prenda !== null;

export type Diferencia = { tipo: "faltante" | "sobrante" | null; cantidad: number };

/** Lo contado contra lo que venía: «faltan 2», «vinieron 2 de más» o nada. */
export function diferenciaDe(enviado: number, contado: number): Diferencia {
  if (contado < enviado) return { tipo: "faltante", cantidad: enviado - contado };
  if (contado > enviado) return { tipo: "sobrante", cantidad: contado - enviado };
  return { tipo: null, cantidad: 0 };
}

/** «Faltan 2: ¿qué pasó?» / «Falta 1: ¿qué pasó?». */
export function preguntaFaltante(n: number): string {
  return `${n === 1 ? "Falta 1" : `Faltan ${n.toLocaleString("es-PE")}`}: ¿qué pasó?`;
}

/** «Vinieron 2 de más: ¿qué pasa con ellas?». */
export function preguntaSobrante(n: number): string {
  return `${n === 1 ? "Vino 1 de más: ¿qué pasa con ella?" : `Vinieron ${n.toLocaleString("es-PE")} de más: ¿qué pasa con ellas?`}`;
}

/** Cuánto se lleva contado de todo el envío (líneas y lo que no estaba en la guía): la cifra de la cabecera y el botón. */
export function totalesDeRecepcion(d: Pick<DetalleEnvio, "lineas">, b: BorradorRecepcion): { contado: number; buenas: number; danadas: number; enviado: number } {
  let contado = 0;
  let danadas = 0;
  let enviado = 0;
  for (const l of d.lineas) {
    enviado += l.enviado;
    const bl = lineaDelBorrador(b, l);
    if (bl.noLlego) continue;
    const s = sumasDe(bl, bl.prenda);
    contado += s.contado;
    danadas += s.danadas;
  }
  for (const e of b.extras) {
    const s = sumasDe(e, e.prenda);
    contado += s.contado;
    danadas += s.danadas;
  }
  return { contado, buenas: contado - danadas, danadas, enviado };
}

/** ¿Ya se llenó algo? (para «¿Salir sin guardar?»): una prenda puesta, una línea que no llegó, un costo corregido, algo fuera de la guía o la nota. */
export function hayAlgoEnElBorrador(d: Pick<DetalleEnvio, "lineas">, b: BorradorRecepcion): boolean {
  if (b.extras.length > 0 || textoParaBase(b.nota) !== "") return true;
  return d.lineas.some((l) => {
    const bl = b.lineas[l.id];
    if (!bl) return false;
    const costo = leerCosto(bl.costo).centimos;
    return bl.prenda !== null || bl.noLlego || costo !== Math.round(l.costoUnitario * 100);
  });
}

/** «Recibir 32 prendas»: el botón principal dice cuántas entran. Con todo decidido y nada contado (no llegó nada de ninguna línea), el
 *  envío se cierra sin prendas, y el botón lo dice. */
export function textoBotonRecibir(n: number, todoDecidido = false): string {
  if (n === 0) return todoDecidido ? "Cerrar sin prendas" : "Recibir";
  return `Recibir ${n.toLocaleString("es-PE")} ${n === 1 ? "prenda" : "prendas"}`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Qué le falta (las reglas de `recibir_despacho`, dichas para quien recibe)
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo más que aceptan `recibir_despacho` (el costo) y `preparar_prenda_al_recibir` (el precio de venta): S/ 99 999.99. */
const COSTO_MAXIMO_CENTIMOS = 9_999_999;
const PRECIO_MAXIMO_CENTIMOS = 9_999_999;

/** El costo por unidad escrito: en céntimos, o el problema (con 2 decimales, nunca negativo y hasta S/ 99 999.99, como la base). */
export function leerCosto(t: string): { centimos: number | null; problema: string | null } {
  const limpio = t.replace(/\s+/g, "");
  const n = leerNumero(limpio, 2);
  if (n.tipo === "vacio") return { centimos: null, problema: "Escribe el costo por unidad." };
  if (n.tipo === "ok") return n.escalado > COSTO_MAXIMO_CENTIMOS ? { centimos: null, problema: "El costo va hasta S/\u00a099,999.99." } : { centimos: n.escalado, problema: null };
  switch (n.motivo) {
    case "negativo":
      return { centimos: null, problema: "El costo no puede ser negativo." };
    case "decimales":
      return { centimos: null, problema: "El costo va con dos decimales como máximo." };
    case "ambiguo":
      return { centimos: null, problema: `¿«${limpio}» son ${limpio.replace(".", "")} soles? Escríbelo sin el punto de miles: ${limpio.replace(".", "")}.` };
    default:
      return { centimos: null, problema: "Escribe el costo con punto decimal, por ejemplo 12.50." };
  }
}

/** El problema de las cantidades de una prenda (o null). */
function problemaDeCantidades(s: SumasConteo): string | null {
  return s.invalidas > 0 ? "Las cantidades son números enteros, de 0 a 9999." : null;
}

/** El problema de las dañadas (o null): enteros, y nunca más que las que llegaron de esa talla y color. */
function problemaDeDanadas(s: SumasConteo): string | null {
  if (s.danadasInvalidas > 0) return "Las dañadas son números enteros, de 0 a 9999.";
  if (s.danadasDeMas.length > 0) return "No puede haber más dañadas que las que llegaron de esa talla y color.";
  return null;
}

/** Lo que la pantalla sabe y el borrador no. */
export type ContextoRecepcion = {
  lineas: readonly LineaEnvio[];
  /** Los proveedores del envío: con dos o más, lo que no estaba en la guía dice de cuál es. */
  proveedores: readonly { id: string; nombre: string }[];
  /** Las categorías y marcas activas, para lo que no estaba en la guía. `null` = no se pudieron leer (no se juzga). */
  categoriasActivas: ReadonlySet<string> | null;
  marcasActivas: ReadonlySet<string> | null;
  /** Lo que los proveedores del envío deben por reponer (fase 5a). Sin esto (o `null`), la reposición no se ofrece. */
  deudas?: readonly DeudaDelEnvio[] | null;
  /** Los nombres de las categorías y marcas (el vocabulario de la recepción): con ellos, lo que no estaba en la guía dice qué se debe
   *  («Te debe 2 chompas CAYLA…»); sin ellos, «2 prendas». */
  nombres?: { categorias: readonly { id: string; nombre: string }[]; marcas: readonly { id: string; nombre: string }[] } | null;
};

// ---- La reposición de lo que faltó (ADR-0362, fase 5a, decisión 14: «se cuenta en la próxima recepción de ese proveedor») ------------

/** El proveedor de algo que no estaba en la guía: el elegido o, con uno solo en el envío, ese. */
export function proveedorDelExtra(e: Pick<BorradorExtra, "proveedorId">, ctx: Pick<ContextoRecepcion, "proveedores">): string | null {
  return ctx.proveedores.length === 1 ? ctx.proveedores[0]!.id : e.proveedorId || null;
}

/**
 * Las opciones de «¿qué pasa con lo de más?» de una línea o de algo fuera de la guía: las de siempre y, SOLO si ese proveedor debe algo de
 * esa categoría y marca, «Es la reposición de lo que faltó» (con lo que debe dicho en su ayuda).
 */
export function opcionesSobrante(
  ctx: Pick<ContextoRecepcion, "deudas" | "proveedores">,
  donde: { proveedorId: string | null; categoriaId: string; marcaId: string; categoria?: string | null; marca?: string | null },
): { valor: CausaSobrante; texto: string; ayuda: string; aviso?: string }[] {
  const pendiente = pendienteDe(ctx.deudas, donde.proveedorId, donde.categoriaId, donde.marcaId);
  if (pendiente <= 0) return [...CAUSAS_SOBRANTE];
  const nombre = ctx.proveedores.find((p) => p.id === donde.proveedorId)?.nombre ?? null;
  return [...CAUSAS_SOBRANTE, opcionReposicion(pendiente, nombre, { categoria: donde.categoria, marca: donde.marca })];
}

/**
 * El costo con que se precarga lo que no estaba en la guía cuando se marca como reposición y todavía no tiene costo: el de la deuda más
 * antigua de ese proveedor, categoría y marca (la reposición entra al costo de la línea original: ADR-0362, «Consecuencias ya vistas»).
 * `null` si no hay deuda o la base no dice su costo.
 */
export function costoDeReposicion(
  ctx: Pick<ContextoRecepcion, "deudas">,
  donde: { proveedorId: string | null; categoriaId: string; marcaId: string },
): number | null {
  return deudaDe(ctx.deudas, donde.proveedorId, donde.categoriaId, donde.marcaId)?.costoUnitario ?? null;
}

/**
 * Los pedidos de reposición del borrador, en el orden de la pantalla (las líneas y después lo que no estaba en la guía), con cuántas puede
 * cubrir cada uno y su problema: es el espejo de `recibir_despacho` (la acepta solo si ese proveedor debe esa categoría y marca, y rechaza lo
 * que pase de lo debido). La clave es el id de la guía de su pregunta (`idGuia.sobrante` o `idGuia.extra(…, "sobrante")`).
 */
export function reposicionesDe(b: BorradorRecepcion, ctx: ContextoRecepcion): Map<string, { disponible: number; problema: string | null }> {
  const pedidos: PedidoReposicion[] = [];
  for (const l of ctx.lineas) {
    const bl = lineaDelBorrador(b, l);
    if (bl.noLlego || bl.sobranteCausa !== VALOR_REPOSICION) continue;
    const dif = diferenciaDe(l.enviado, sumasDe(bl, bl.prenda).contado);
    if (dif.tipo !== "sobrante") continue;
    pedidos.push({
      id: idGuia.sobrante(l.id),
      proveedorId: l.proveedor?.id ?? null,
      categoriaId: l.categoria.id,
      marcaId: l.marca.id,
      cantidad: dif.cantidad,
      categoria: l.categoria.nombre,
      marca: l.marca.nombre,
    });
  }
  for (const e of b.extras) {
    if (e.sobranteCausa !== VALOR_REPOSICION) continue;
    pedidos.push({
      id: idGuia.extra(e.clave, "sobrante"),
      proveedorId: proveedorDelExtra(e, ctx),
      categoriaId: e.categoriaId,
      marcaId: e.marcaId,
      cantidad: sumasDe(e, e.prenda).contado,
      categoria: ctx.nombres?.categorias.find((c) => c.id === e.categoriaId)?.nombre ?? null,
      marca: ctx.nombres?.marcas.find((m) => m.id === e.marcaId)?.nombre ?? null,
    });
  }
  return cubrirReposiciones(ctx.deudas, pedidos);
}

/** El nombre corto de una línea en la guía: «Línea 2». */
export const nombreLineaGuia = (i: number): string => `Línea ${i + 1}`;
export const nombreExtraGuia = (i: number): string => `Extra ${i + 1}`;

/** Ids de la guía: uno por cosa que decidir. */
export const idGuia = {
  prenda: (lineaId: string) => `l-${lineaId}-prenda`,
  costo: (lineaId: string) => `l-${lineaId}-costo`,
  conteo: (lineaId: string) => `l-${lineaId}-conteo`,
  danadas: (lineaId: string) => `l-${lineaId}-danadas`,
  arreglo: (lineaId: string) => `l-${lineaId}-arreglo`,
  faltante: (lineaId: string) => `l-${lineaId}-faltante`,
  sobrante: (lineaId: string) => `l-${lineaId}-sobrante`,
  extra: (clave: string, que: "proveedor" | "categoria" | "marca" | "costo" | "prenda" | "conteo" | "danadas" | "arreglo" | "sobrante") => `e-${clave}-${que}`,
} as const;

/** Los campos de dañadas y su arreglo (comunes a una línea y a lo que no estaba en la guía). */
function camposDeDanadas(c: Conteo, s: SumasConteo, ids: { danadas: string; arreglo: string }, nombre: string): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  if (c.conDanadas) {
    const problema = problemaDeDanadas(s);
    campos.push({ id: ids.danadas, nombre: `${nombre} · dañadas`, requerido: problema !== null, hecho: problema === null && s.danadas > 0, pendiente: problema ?? "Escribe cuántas llegaron dañadas en su talla y color." });
  }
  if (s.danadas > 0) {
    campos.push({ id: ids.arreglo, nombre: `${nombre} · arreglo`, requerido: true, hecho: c.arreglo !== null, pendiente: "Di si las dañadas tienen arreglo." });
  }
  return campos;
}

/**
 * Los campos de la guía de foco, en el orden de la pantalla. `hecho` y `requerido` son las reglas de `recibir_despacho`: la guía no inventa
 * ninguna. Lo único «sugerido» (avisa y no bloquea) es contar una prenda ya puesta: la base acepta una línea con su prenda y cero contadas
 * (todo faltante, con su causa), pero casi siempre es que falta contar.
 */
export function camposDeRecepcion(
  b: BorradorRecepcion,
  ctx: ContextoRecepcion,
  responsable: { listo: boolean; motivo: string | null },
): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  // «Es la reposición de lo que faltó» que la base rechazaría (el proveedor no debe eso, o vino más de lo que debe): la pregunta queda sin hacer.
  const reposiciones = reposicionesDe(b, ctx);
  const problemaReposicion = (id: string): string | null => reposiciones.get(id)?.problema ?? null;
  ctx.lineas.forEach((l, i) => {
    const bl = lineaDelBorrador(b, l);
    const nombre = nombreLineaGuia(i);
    campos.push({
      id: idGuia.prenda(l.id),
      nombre: `${nombre} · prenda`,
      requerido: true,
      hecho: lineaDecidida(bl),
      pendiente: "Di qué prenda es: una nueva o una que ya tienes. Si no llegó nada, márcalo.",
    });
    if (bl.noLlego) {
      campos.push({ id: idGuia.faltante(l.id), nombre: `${nombre} · qué pasó`, requerido: true, hecho: bl.faltanteCausa !== null, pendiente: `No llegó nada: elige qué pasó.` });
      return;
    }
    const problemaCosto = leerCosto(bl.costo).problema;
    campos.push({ id: idGuia.costo(l.id), nombre: `${nombre} · costo`, requerido: true, hecho: problemaCosto === null, pendiente: problemaCosto ?? "" });
    if (!bl.prenda) return;
    const s = sumasDe(bl, bl.prenda);
    const problemaCant = problemaDeCantidades(s);
    campos.push({
      id: idGuia.conteo(l.id),
      nombre: `${nombre} · cuántas`,
      requerido: problemaCant !== null,
      sugerido: true,
      hecho: problemaCant === null && s.contado > 0,
      pendiente: problemaCant ?? "Escribe cuántas llegaron de cada talla y color.",
    });
    campos.push(...camposDeDanadas(bl, s, { danadas: idGuia.danadas(l.id), arreglo: idGuia.arreglo(l.id) }, nombre));
    const dif = diferenciaDe(l.enviado, s.contado);
    if (dif.tipo === "faltante") {
      campos.push({ id: idGuia.faltante(l.id), nombre: `${nombre} · qué pasó`, requerido: true, hecho: bl.faltanteCausa !== null, pendiente: preguntaFaltante(dif.cantidad) });
    } else if (dif.tipo === "sobrante") {
      const problema = problemaReposicion(idGuia.sobrante(l.id));
      campos.push({ id: idGuia.sobrante(l.id), nombre: `${nombre} · de más`, requerido: true, hecho: bl.sobranteCausa !== null && problema === null, pendiente: problema ?? preguntaSobrante(dif.cantidad) });
    }
  });

  b.extras.forEach((e, i) => {
    const nombre = nombreExtraGuia(i);
    if (ctx.proveedores.length >= 2) {
      const ok = ctx.proveedores.some((p) => p.id === e.proveedorId);
      campos.push({ id: idGuia.extra(e.clave, "proveedor"), nombre: `${nombre} · proveedor`, requerido: true, hecho: ok, pendiente: "Elige de qué proveedor es." });
    }
    const categoriaOk = e.categoriaId !== "" && (ctx.categoriasActivas === null || ctx.categoriasActivas.has(e.categoriaId));
    const marcaOk = e.marcaId !== "" && (ctx.marcasActivas === null || ctx.marcasActivas.has(e.marcaId));
    campos.push({ id: idGuia.extra(e.clave, "categoria"), nombre: `${nombre} · categoría`, requerido: true, hecho: categoriaOk, pendiente: "Elige la categoría." });
    campos.push({ id: idGuia.extra(e.clave, "marca"), nombre: `${nombre} · marca`, requerido: true, hecho: marcaOk, pendiente: "Elige la marca." });
    const problemaCosto = leerCosto(e.costo).problema;
    campos.push({ id: idGuia.extra(e.clave, "costo"), nombre: `${nombre} · costo`, requerido: true, hecho: problemaCosto === null, pendiente: problemaCosto ?? "" });
    campos.push({
      id: idGuia.extra(e.clave, "prenda"),
      nombre: `${nombre} · prenda`,
      requerido: true,
      hecho: e.prenda !== null,
      pendiente: categoriaOk && marcaOk ? "Di qué prenda es: una nueva o una que ya tienes." : "Elige la categoría y la marca, y después la prenda.",
    });
    const s = sumasDe(e, e.prenda);
    if (e.prenda) {
      const problemaCant = problemaDeCantidades(s);
      campos.push({
        id: idGuia.extra(e.clave, "conteo"),
        nombre: `${nombre} · cuántas`,
        requerido: true,
        hecho: problemaCant === null && s.contado > 0,
        pendiente: problemaCant ?? "Escribe cuántas llegaron de cada talla y color.",
      });
      campos.push(...camposDeDanadas(e, s, { danadas: idGuia.extra(e.clave, "danadas"), arreglo: idGuia.extra(e.clave, "arreglo") }, nombre));
    }
    const problemaExtra = problemaReposicion(idGuia.extra(e.clave, "sobrante"));
    campos.push({
      id: idGuia.extra(e.clave, "sobrante"),
      nombre: `${nombre} · qué pasa`,
      requerido: true,
      hecho: e.sobranteCausa !== null && problemaExtra === null,
      pendiente: problemaExtra ?? "Elige qué pasa con esto: regalo, se cobra aparte o se arregla en la próxima compra.",
    });
  });

  const problemaNota = textoParaBase(b.nota).length > TOPES_RECEPCION.nota ? `La nota va hasta ${TOPES_RECEPCION.nota} letras.` : null;
  campos.push({ id: "nota", nombre: "Nota", requerido: problemaNota !== null, hecho: textoParaBase(b.nota).length > 0 && problemaNota === null, pendiente: problemaNota ?? "" });
  campos.push({ id: "responsable", nombre: "Quién recibe", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién recibe." });
  return campos;
}

/** El primer problema que impide recibir (o null): lo mismo que la guía, dicho de una vez. Es la red del botón; la base vuelve a exigir todo. */
export function primerProblema(b: BorradorRecepcion, ctx: ContextoRecepcion): string | null {
  const falta = camposDeRecepcion(b, ctx, { listo: true, motivo: null }).find((c) => c.requerido && !c.hecho);
  return falta ? falta.pendiente : null;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que viaja a la base
// ---------------------------------------------------------------------------------------------------------------------------------

export type VarianteParaBase = { variante_id: string; cantidad: number; danadas: number; danada_solucion: SolucionDanada | null };

export type LineaParaBase = {
  despacho_item_id: string;
  costo_unitario: number | null;
  confirma_costo: boolean;
  variantes: VarianteParaBase[];
  faltante_causa: CausaFaltante | null;
  sobrante_causa: CausaSobrante | null;
};

export type ExtraParaBase = {
  proveedor_id: string | null;
  categoria_id: string;
  marca_id: string;
  costo_unitario: number;
  confirma_costo: boolean;
  variantes: VarianteParaBase[];
  sobrante_causa: CausaSobrante | null;
};

/** Las variantes que viajan: solo las que llegaron (cantidad mayor a cero), con sus dañadas y su arreglo. */
function variantesParaBase(c: Conteo, prenda: PrendaRecepcion | null): VarianteParaBase[] {
  if (!prenda) return [];
  const salida: VarianteParaBase[] = [];
  for (const v of prenda.variantes) {
    const n = leerCantidad(c.cantidades[v.id] ?? "") ?? 0;
    if (n <= 0) continue;
    const d = c.conDanadas ? Math.min(n, leerCantidad(c.danadas[v.id] ?? "") ?? 0) : 0;
    salida.push({ variante_id: v.id, cantidad: n, danadas: d, danada_solucion: d > 0 ? c.arreglo : null });
  }
  return salida;
}

/** Las confirmaciones de costo atípico: las líneas (por su id) y lo que no estaba en la guía (por su clave) que la persona confirmó. */
export type Confirmadas = { lineas: ReadonlySet<string>; extras: ReadonlySet<string> };
export const SIN_CONFIRMAR: Confirmadas = { lineas: new Set(), extras: new Set() };

/**
 * `p_lineas`: una entrada por CADA línea del envío, una sola vez (la base lo exige). El costo viaja solo si se corrigió (`null` = el del envío)
 * y si algo entra. Las causas viajan solo cuando corresponden: una causa elegida antes de corregir el conteo no se manda si ya no aplica (la
 * base la rechazaría).
 */
export function lineasParaBase(d: Pick<DetalleEnvio, "lineas">, b: BorradorRecepcion, confirmadas: Confirmadas = SIN_CONFIRMAR): LineaParaBase[] {
  return d.lineas.map((l) => {
    const bl = lineaDelBorrador(b, l);
    const variantes = bl.noLlego ? [] : variantesParaBase(bl, bl.prenda);
    const contado = variantes.reduce((a, v) => a + v.cantidad, 0);
    const dif = diferenciaDe(l.enviado, contado);
    const costo = leerCosto(bl.costo).centimos;
    const corregido = contado > 0 && costo !== null && costo !== Math.round(l.costoUnitario * 100);
    return {
      despacho_item_id: l.id,
      costo_unitario: corregido ? costo / 100 : null,
      confirma_costo: confirmadas.lineas.has(l.id),
      variantes,
      faltante_causa: dif.tipo === "faltante" ? bl.faltanteCausa : null,
      sobrante_causa: dif.tipo === "sobrante" ? bl.sobranteCausa : null,
    };
  });
}

/** `p_extras`: lo que no estaba en la guía, con su costo (obligatorio) y su causa. Con un solo proveedor en el envío, `proveedor_id` va vacío. */
export function extrasParaBase(b: BorradorRecepcion, ctx: Pick<ContextoRecepcion, "proveedores">, confirmadas: Confirmadas = SIN_CONFIRMAR): ExtraParaBase[] {
  return b.extras.map((e) => ({
    proveedor_id: ctx.proveedores.length >= 2 ? e.proveedorId || null : null,
    categoria_id: e.categoriaId,
    marca_id: e.marcaId,
    costo_unitario: (leerCosto(e.costo).centimos ?? 0) / 100,
    confirma_costo: confirmadas.extras.has(e.clave),
    variantes: variantesParaBase(e, e.prenda),
    sobrante_causa: e.sobranteCausa,
  }));
}

export type ArgsRecibirDespacho = {
  p_despacho_id: string;
  p_version: number;
  p_lineas: LineaParaBase[];
  p_extras: ExtraParaBase[];
  p_nota: string | null;
  p_token: string;
};

/**
 * Los argumentos de `recibir_despacho`. `version` es la que vio la pantalla tras abrir el envío. `token` se genera una vez y se reusa en cada
 * reintento: el mismo token con los mismos datos devuelve la misma recepción (un corte de señal o un doble clic no la repiten).
 */
export function argsRecibirDespacho(
  d: Pick<DetalleEnvio, "id" | "lineas">,
  b: BorradorRecepcion,
  ctx: Pick<ContextoRecepcion, "proveedores">,
  o: { version: number; token: string; confirmadas?: Confirmadas },
): ArgsRecibirDespacho {
  const confirmadas = o.confirmadas ?? SIN_CONFIRMAR;
  const nota = textoParaBase(b.nota);
  return {
    p_despacho_id: d.id,
    p_version: o.version,
    p_lineas: lineasParaBase(d, b, confirmadas),
    p_extras: extrasParaBase(b, ctx, confirmadas),
    p_nota: nota || null,
    p_token: o.token,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que vuelve de la base
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo que contesta `abrir_despacho` (y `recibir_orden_sin_envio`, que deja el envío abierto). */
export type ResultadoApertura = { despachoId: string; numero: string | null; estado: EstadoEnvio | null; version: number | null };

export function leerResultadoApertura(data: unknown): ResultadoApertura | null {
  const r = objeto(Array.isArray(data) ? data[0] : data);
  if (!r) return null;
  const despachoId = texto(r.despacho_id) ?? texto(r.id);
  if (!despachoId) return null;
  return { despachoId, numero: numeroEnvio(r.numero), estado: estadoDe(r.estado), version: cifra(r.version) };
}

/** Lo que contesta `recibir_despacho`. */
export type ResultadoRecepcion = {
  despachoId: string;
  numero: string;
  lotes: string[];
  unidades: number;
  buenas: number;
  danadas: number;
  faltan: number;
  sobran: number;
};

/** Lee lo que contesta `recibir_despacho`. Sin el envío (id y número), `null`: la recepción pudo quedar guardada y se manda a revisar. */
export function leerResultadoRecepcion(data: unknown): ResultadoRecepcion | null {
  const r = objeto(Array.isArray(data) ? data[0] : data);
  if (!r) return null;
  const despachoId = texto(r.despacho_id) ?? texto(r.id);
  const numero = numeroEnvio(r.numero);
  if (!despachoId || !numero) return null;
  const unidades = Math.max(0, cifra(r.unidades) ?? 0);
  const danadas = Math.max(0, cifra(r.danadas) ?? 0);
  return {
    despachoId,
    numero,
    lotes: lista(r.lotes)
      .map((x) => texto(x) ?? texto(objeto(x)?.id))
      .filter((x): x is string => !!x),
    unidades,
    buenas: Math.max(0, cifra(r.buenas) ?? unidades - danadas),
    danadas,
    faltan: Math.max(0, cifra(r.faltan) ?? 0),
    sobran: Math.max(0, cifra(r.sobran) ?? 0),
  };
}

/** «ENV-000061 recibido» (o «cerrado sin prendas», si no llegó nada). */
export const tituloRecibido = (r: Pick<ResultadoRecepcion, "numero" | "buenas" | "danadas">): string =>
  r.buenas + r.danadas === 0 ? `${r.numero} cerrado sin prendas` : `${r.numero} recibido`;

/** «30 prendas al almacén, 2 a cuarentena · faltan 2». Sin prendas, solo lo que faltó o vino de más. */
export function detalleRecibido(r: Pick<ResultadoRecepcion, "buenas" | "danadas" | "faltan" | "sobran">): string {
  const entro = `${r.buenas.toLocaleString("es-PE")} ${r.buenas === 1 ? "prenda" : "prendas"} al almacén${r.danadas > 0 ? `, ${r.danadas.toLocaleString("es-PE")} a cuarentena` : ""}`;
  const partes = r.buenas + r.danadas === 0 ? [] : [entro];
  if (r.faltan > 0) partes.push(r.faltan === 1 ? "falta 1" : `faltan ${r.faltan.toLocaleString("es-PE")}`);
  if (r.sobran > 0) partes.push(`${r.sobran.toLocaleString("es-PE")} de más`);
  return partes.length > 0 ? partes.join(" · ") : "nada por anotar";
}

/** «ENV-000061 recibido · 30 prendas al almacén, 2 a cuarentena · faltan 2». Lo dice «Cómo se cerró», que a veces solo tiene el
 *  resumen que arma con las líneas (sin lotes ni despacho): por eso pide solo lo que usan sus dos piezas. */
export const textoRecibido = (r: Pick<ResultadoRecepcion, "numero" | "buenas" | "danadas" | "faltan" | "sobran">): string =>
  `${tituloRecibido(r)} · ${detalleRecibido(r)}`;

/** Qué decir cuando se corta la señal al recibir. La recepción pudo llegar a la base y perderse solo la respuesta: reintentar sin cambiar nada
 *  es seguro (el mismo token con los mismos datos devuelve la misma recepción, sin repetir nada). */
export const AVISO_DE_CORTE_RECEPCION =
  "Se cortó la conexión y no sabemos si la recepción llegó a guardarse. Vuelve a pulsar «Recibir» sin cambiar nada: si ya se guardó, no se repite.";

export const AVISO_DE_CORTE_APERTURA =
  "Se cortó la conexión y no sabemos si el envío se abrió. Vuelve a pulsar el botón: si ya estaba abierto, no pasa nada.";

export const AVISO_DE_CORTE_PRENDA =
  "Se cortó la conexión y no sabemos si la prenda se creó. Vuelve a pulsar el botón sin cambiar nada: si ya se creó, no se repite.";

/** ¿Conviene recargar? Otra persona cambió el envío, o la misma recepción ya se guardó con otros datos. */
export function sugiereRecargarRecepcion(mensaje: string | null | undefined): boolean {
  return !!mensaje && /recarga|ya se recibi|ya se guard[óo] con otros datos|cambi[óo] este env/i.test(mensaje);
}

/** Lo que se dice cuando la base frena a quien hizo una de las órdenes (decisión 17), sin importar cómo lo redacte. */
export const TEXTO_QUIEN_COMPRO =
  "Quien firma hizo una de las órdenes de este envío: lo tiene que recibir otra persona de la tienda. Elige en «Quién recibe» a quien lo está contando.";

/** Los avisos de la base de esta fase vienen ya en palabras de tienda (`hint` recepcion_*, recibir_*, envio_*, orden_*). Algunos llegan con
 *  42501 (otra sede, quien compró) y sin esto caerían al genérico «No se pudo…»: se dicen tal cual. `null` = no es uno de estos (el
 *  error sigue por `traducirError`: el responsable, la versión, la red). */
const HINTS_DE_LA_RECEPCION = /^(recepcion|recibir|envio|orden_compra|orden)_[a-z_]+$/;
/** La base dice «pulsa «Empezar a recibir»» (el botón de la fase 4); con la cara A el botón es «Abrir el fardo». El texto vive en nueve
 *  lugares del SQL, varios dentro de reemplazos anclados y huellas md5: se traduce aquí, por su pista, en vez de tocarlo allá. */
export const TEXTO_ENVIO_SIN_ABRIR = "Este envío todavía no se abrió: ábrelo primero y después cuenta.";

export function mensajeDeLaRecepcion(error: { message?: string | null; hint?: string | null } | null | undefined): string | null {
  if (!error?.message) return null;
  if (esQuienCompro(error)) return TEXTO_QUIEN_COMPRO;
  if (error.hint === "envio_sin_abrir") return TEXTO_ENVIO_SIN_ABRIR;
  if (error.hint && HINTS_DE_LA_RECEPCION.test(error.hint) && !/_sin_modulo$/.test(error.hint)) return error.message;
  return null;
}

/** ¿La base dijo que quien firma hizo una de las órdenes (decisión 17)? */
export function esQuienCompro(error: { hint?: string | null; message?: string | null } | null | undefined): boolean {
  return !!error && (error.hint === HINT_QUIEN_COMPRO || /hiciste esta orden/i.test(error.message ?? ""));
}

// ---- Costo atípico ------------------------------------------------------------------------------------------------------------------

/** Una prenda con el costo fuera de lo normal, con la línea del envío a la que pertenece (`null` si es algo que no estaba en la guía) y,
 *  si es algo fuera de la guía, su lugar entre los extras (1, 2…, el orden de `p_extras`). */
export type CostoAtipicoRecepcion = CostoAtipico & { despachoItemId: string | null; extra: number | null };

function leerItemAtipico(f: unknown, nombrar: (despachoItemId: string | null, varianteId: string | null) => string | null): CostoAtipicoRecepcion | null {
  const r = objeto(f);
  if (!r) return null;
  const motivo = MOTIVOS_COSTO_ATIPICO.find((m) => m === r.motivo) as MotivoCostoAtipico | undefined;
  const costo = cifra(r.costo) ?? cifra(r.costo_unitario);
  if (!motivo || costo == null) return null;
  const despachoItemId = texto(r.despacho_item_id);
  const varianteId = texto(r.variante_id);
  return {
    motivo,
    costoUnitario: costo,
    costoVigente: cifra(r.vigente) ?? cifra(r.costo_vigente),
    precio: cifra(r.precio),
    sku: nombrar(despachoItemId, varianteId) ?? texto(r.sku) ?? texto(r.codigo),
    varianteId,
    linea: null,
    despachoItemId,
    extra: cifra(r.extra),
  };
}

/**
 * Lee el rechazo por costo atípico de `recibir_despacho` (hint `recepcion_costo_atipico`, el detalle en JSON en `details`:
 * `[{ despacho_item_id, variante_id, motivo, costo, vigente }]`; se acepta también `{ items: [...] }`). Si no es eso, prueba el formato de
 * siempre (`costo_atipico`, el de «Llegó mercadería»). `nombrar` pone el nombre de la prenda que la pantalla conoce. `null` si no es un aviso
 * de costo atípico (el error sigue su camino normal). Nunca lanza.
 */
export function leerCostoAtipicoRecepcion(
  error: { message?: string | null; hint?: string | null; details?: string | null; detail?: string | null } | null | undefined,
  nombrar: (despachoItemId: string | null, varianteId: string | null) => string | null = () => null,
): CostoAtipicoRecepcion[] | null {
  if (!error) return null;
  const detalle = error.details ?? error.detail ?? null;
  if (error.hint === HINT_COSTO_ATIPICO_RECEPCION && detalle) {
    try {
      const d = JSON.parse(detalle) as unknown;
      const items = Array.isArray(d) ? d : lista(objeto(d)?.items);
      const leidos = items.map((x) => leerItemAtipico(x, nombrar)).filter((x): x is CostoAtipicoRecepcion => x !== null);
      if (leidos.length > 0) return leidos;
    } catch {
      // Un detalle roto no es un aviso que se pueda mostrar: el error sigue su camino.
    }
  }
  const deSiempre = leerCostosAtipicos({ message: error.message ?? null, details: detalle });
  return deSiempre ? deSiempre.map((c) => ({ ...c, sku: (c.varianteId ? nombrar(null, c.varianteId) : null) ?? c.sku, despachoItemId: null, extra: null })) : null;
}

/**
 * Lo que se le muestra a quien recibe: UNA frase por línea del envío (o por cada cosa fuera de la guía), no una por talla y color. El costo
 * se corrige por línea, así que cuatro tallas de la misma chompa son «una línea con el costo fuera de lo normal», no cuatro. Se queda con la
 * primera de cada línea y le pone el nombre de la línea (`nombrarLinea`). La confirmación sigue usando la lista completa (`confirmadasDe`).
 */
export function atipicosPorLinea(costos: readonly CostoAtipicoRecepcion[], nombrarLinea: (c: CostoAtipicoRecepcion) => string | null = () => null): CostoAtipicoRecepcion[] {
  const vistos = new Map<string, CostoAtipicoRecepcion>();
  for (const c of costos) {
    const clave = c.despachoItemId ?? (c.extra != null ? `extra-${c.extra}` : `variante-${c.varianteId ?? ""}`);
    if (!vistos.has(clave)) vistos.set(clave, { ...c, sku: nombrarLinea(c) ?? c.sku });
  }
  return [...vistos.values()];
}

/** Al confirmar los costos atípicos: qué líneas (por su id) y qué extras (los que traen esa prenda) viajan con `confirma_costo`. */
export function confirmadasDe(costos: readonly CostoAtipicoRecepcion[], b: BorradorRecepcion): Confirmadas {
  const lineas = new Set<string>();
  const extras = new Set<string>();
  const variantesMarcadas = new Set(costos.filter((c) => !c.despachoItemId && c.extra == null && c.varianteId).map((c) => c.varianteId as string));
  for (const c of costos) if (c.despachoItemId) lineas.add(c.despachoItemId);
  // Lo que no estaba en la guía: por su lugar (el orden de `p_extras`) o, si la base no lo dice, por la prenda.
  for (const c of costos) {
    const e = c.extra != null ? b.extras[c.extra - 1] : undefined;
    if (e) extras.add(e.clave);
  }
  for (const e of b.extras) if (e.prenda?.variantes.some((v) => variantesMarcadas.has(v.id))) extras.add(e.clave);
  // Si la base no dijo de qué línea es, se busca por la prenda: la línea (o el extra) que la está recibiendo.
  for (const [id, bl] of Object.entries(b.lineas)) if (bl.prenda?.variantes.some((v) => variantesMarcadas.has(v.id))) lineas.add(id);
  return { lineas, extras };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Después de recibir
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo bueno que entró al almacén, por variante (para «Bajar al piso»). Lo dañado queda en cuarentena y no se baja. */
export function buenasPorVariante(d: Pick<DetalleEnvio, "lineas">, b: BorradorRecepcion): { varianteId: string; cantidad: number }[] {
  const porVariante = new Map<string, number>();
  const sumar = (vs: VarianteParaBase[]) => {
    for (const v of vs) {
      const buenas = v.cantidad - v.danadas;
      if (buenas > 0) porVariante.set(v.variante_id, (porVariante.get(v.variante_id) ?? 0) + buenas);
    }
  };
  for (const l of d.lineas) {
    const bl = lineaDelBorrador(b, l);
    if (!bl.noLlego) sumar(variantesParaBase(bl, bl.prenda));
  }
  for (const e of b.extras) sumar(variantesParaBase(e, e.prenda));
  return [...porVariante.entries()].map(([varianteId, cantidad]) => ({ varianteId, cantidad }));
}

/** Lo bueno por variante de un envío ya cerrado, desde «cómo se cerró» (si la base manda la variante). */
export function buenasDeRecibidos(recibidos: readonly RecibidoEnvio[] | null): { varianteId: string; cantidad: number }[] {
  const porVariante = new Map<string, number>();
  for (const r of recibidos ?? []) {
    const buenas = r.cantidad - r.danadas;
    if (r.varianteId && buenas > 0) porVariante.set(r.varianteId, (porVariante.get(r.varianteId) ?? 0) + buenas);
  }
  return [...porVariante.entries()].map(([varianteId, cantidad]) => ({ varianteId, cantidad }));
}

/**
 * Qué sigue después de recibir (como «Llegó mercadería», `despuesDeRecibir`): primero las etiquetas de precio de los lotes del envío
 * (lo que llega de un proveedor viene sin la etiqueta de CAYLA) y después bajar al piso lo bueno (entró al almacén). Sin lotes no hay
 * etiquetas por lote; sin lo bueno por variante, «Bajar al piso» abre la pantalla sin nada marcado.
 *
 * La cuenta de etiquetas es la de TODO lo que entró (`unidades`, buenas y dañadas): es la que dice la pantalla de etiquetas, que lee el lote
 * entero (una por prenda; allí se baja si alguna no la necesita). Bajar al piso es solo lo bueno: lo dañado queda en cuarentena.
 */
export function despuesDeRecibirEnvio(p: {
  lotes: readonly string[];
  buenas: readonly { varianteId: string; cantidad: number }[];
  unidades: number;
  unidadesBuenas: number;
  veExistencias: boolean;
}): AccionDespues[] {
  const acciones: AccionDespues[] = [];
  if (p.lotes.length > 0 && p.unidades > 0) {
    acciones.push({
      clave: "etiquetas",
      texto: p.unidades === 1 ? "Imprimir la etiqueta de precio" : `Imprimir ${p.unidades.toLocaleString("es-PE")} etiquetas de precio`,
      href: urlEtiquetasDePrecio({ lotes: [...p.lotes] }),
      principal: true,
    });
  }
  if (p.veExistencias && p.unidadesBuenas > 0) {
    const lineas = p.buenas.filter((l) => l.cantidad > 0);
    acciones.push({
      clave: "bajar",
      texto: "Bajar al piso",
      href: lineas.length > 0 && lineas.length <= MAX_VARIANTES_EN_URL ? `/inventario/bajar?lineas=${lineasEnUrl(lineas)}` : "/inventario/bajar",
      principal: acciones.length === 0,
    });
  }
  return acciones;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// La hoja de la prenda: «Es nueva» y «+ talla o color» (`preparar_prenda_al_recibir`)
// ---------------------------------------------------------------------------------------------------------------------------------

export type TallaDeLaCategoria = { id: string; valor: string; habitual?: boolean };

/** Una categoría como la necesita la hoja de la prenda: sus tallas, si su familia pide tejido y patrón, y los que tiene habilitados. */
export type CategoriaParaRecibir = {
  id: string;
  nombre: string;
  prefijo: string | null;
  familia: string | null;
  tallas: TallaDeLaCategoria[];
  exigeTejidoPatron: boolean;
  tejidos: { id: string; texto: string }[];
  patrones: { id: string; texto: string }[];
};

/** El vocabulario del catálogo para crear la prenda al recibir y para lo que no estaba en la guía (lo lee el servidor: `lib/recepcion-envio.ts`). */
export type CatalogoParaRecibir = {
  categorias: CategoriaParaRecibir[];
  colores: ColorAlta[];
  marcas: { id: string; nombre: string }[];
  /** Qué marca trae cada proveedor (`marca_proveedores`): en lo que no estaba en la guía, primero las del proveedor del envío. */
  vinculos: { marcaId: string; proveedorId: string }[];
};

export type BorradorPrenda = {
  nombre: string;
  tallaIds: string[];
  colorCodigos: string[];
  precio: string;
  descripcion: string;
  tejidoId: string;
  patronId: string;
};

export type ContextoPrenda = {
  /** «nueva»: se crea la prenda. «agregar»: a una que ya existe le faltan tallas o colores. */
  modo: "nueva" | "agregar";
  /** Las tallas que la categoría ofrece (`categoria_tallas`), en el orden de la curva. */
  tallas: readonly TallaDeLaCategoria[];
  /** La familia de la categoría pide tejido y patrón (Indumentaria). */
  exigeTejidoPatron: boolean;
  tejidos: readonly { id: string; texto: string }[];
  patrones: readonly { id: string; texto: string }[];
  /** En «agregar»: las combinaciones que la prenda ya tiene (`claveCelda`). */
  existentes?: ReadonlySet<string>;
};

/** Lo que viene puesto: en «nueva», las tallas habituales de la categoría y el precio que sugirió quien compró; en «agregar», lo que la
 *  prenda ya tiene (para ver qué se suma). */
export function borradorDePrenda(ctx: ContextoPrenda, o: { precioSugerido?: number | null; prenda?: PrendaRecepcion | null } = {}): BorradorPrenda {
  if (ctx.modo === "agregar" && o.prenda) {
    const tallas = new Set(o.prenda.variantes.map((v) => v.tallaId).filter((x): x is string => !!x));
    const colores = [...new Set(o.prenda.variantes.map((v) => v.colorCodigo).filter((x): x is string => !!x))];
    return { nombre: o.prenda.nombre, tallaIds: ctx.tallas.filter((t) => tallas.has(t.id)).map((t) => t.id), colorCodigos: colores, precio: "", descripcion: "", tejidoId: "", patronId: "" };
  }
  return {
    nombre: "",
    // Sin tallas marcadas (Felipe 2026-10-13, /formidable): las «de siempre» venían marcadas aunque no hubieran llegado, y la prenda
    // nacía con tallas en cero que después salían en Existencias y en las etiquetas. Se marcan las que llegaron.
    tallaIds: [],
    colorCodigos: [],
    precio: o.precioSugerido != null && o.precioSugerido > 0 ? costoComoTexto(o.precioSugerido) : "",
    descripcion: "",
    tejidoId: "",
    patronId: "",
  };
}

/** Las tallas elegidas que la categoría ofrece, en el orden de la curva (una talla de otra categoría no existe aquí). */
export function tallasElegidas(b: Pick<BorradorPrenda, "tallaIds">, ctx: Pick<ContextoPrenda, "tallas">): string[] {
  const pedidas = new Set(b.tallaIds);
  return [...ctx.tallas]
    .filter((t) => pedidas.has(t.id))
    .sort((a, c) => compararTallas(a.valor, c.valor))
    .map((t) => t.id);
}

/** Las combinaciones talla × color que la hoja manda a crear: todas en «nueva»; en «agregar», solo las que la prenda todavía no tiene. */
export function combinacionesDeLaHoja(b: BorradorPrenda, ctx: ContextoPrenda): { talla_id: string | null; color_codigo: string | null }[] {
  const celdas = construirCeldas(tallasElegidas(b, ctx), [...b.colorCodigos]);
  return celdas.filter((c) => !(ctx.existentes?.has(c.clave) ?? false)).map((c) => ({ talla_id: c.tallaId, color_codigo: c.color }));
}

/** El precio de venta escrito: en céntimos, o el problema. En «nueva» va siempre y mayor que 0 (como Nuevo producto); en «agregar» es opcional. */
export function leerPrecioVenta(t: string, obligatorio: boolean): { centimos: number | null; problema: string | null } {
  const limpio = t.replace(/\s+/g, "");
  const n = leerNumero(limpio, 2);
  if (n.tipo === "vacio") return { centimos: null, problema: obligatorio ? "Escribe el precio de venta." : null };
  if (n.tipo === "mal") {
    if (n.motivo === "negativo") return { centimos: null, problema: "El precio no puede ser negativo." };
    if (n.motivo === "decimales") return { centimos: null, problema: "El precio va con dos decimales como máximo." };
    if (n.motivo === "ambiguo") return { centimos: null, problema: `¿«${limpio}» son ${limpio.replace(".", "")} soles? Escríbelo sin el punto de miles.` };
    return { centimos: null, problema: "Escribe el precio con punto decimal, por ejemplo 59.90." };
  }
  if (n.escalado <= 0) return { centimos: null, problema: "El precio de venta tiene que ser mayor que S/\u00a00." };
  if (n.escalado > PRECIO_MAXIMO_CENTIMOS) return { centimos: null, problema: "El precio va hasta S/\u00a099,999.99." };
  return { centimos: n.escalado, problema: null };
}

/**
 * Los campos de la guía de la hoja, en su orden. Salen de lo que `crear_producto_con_variantes` rechaza (nombre con al menos una letra o un
 * número, talla habilitada en la categoría, precio mayor que 0 y hasta S/ 99 999.99, tejido y patrón si la familia los pide) más lo que Nuevo
 * producto también exige (al menos una talla si la categoría las tiene). Los colores son opcionales: sin color, la prenda va «Sin color».
 *
 * Las tallas arrancan sin marcar (Felipe 2026-10-13, /formidable): se marcan las que llegaron, y sin ninguna no se crea.
 * `tocados.precio` (ADR-0284 act. h): el precio que sugirió quien compró viene puesto, pero importa (es al que se vende). Mientras la persona
 * no lo toca es «sugerido»: la luz pasa por él para que lo revise y no bloquea. Puesto mal (un precio que no sirve), bloquea como siempre.
 * (`tocados.tallas` queda en la firma por compatibilidad: ya no cambia nada.)
 */
export function camposDePrenda(b: BorradorPrenda, ctx: ContextoPrenda, tocados: { tallas?: boolean; precio?: boolean } = {}): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  const nueva = ctx.modo === "nueva";
  if (nueva) {
    const nombre = b.nombre.trim();
    const problemaNombre = !nombre ? "Escribe el nombre de la prenda." : claveReferencia(nombre) === "" ? "El nombre necesita al menos una letra o un número." : null;
    campos.push({ id: "prenda-nombre", nombre: "Nombre", requerido: true, hecho: problemaNombre === null, pendiente: problemaNombre ?? "" });
  }
  if (ctx.tallas.length > 0) {
    const ok = tallasElegidas(b, ctx).length > 0;
    campos.push({ id: "prenda-tallas", nombre: "Tallas", requerido: true, hecho: ok, pendiente: "Marca las tallas que llegaron." });
  }
  campos.push({ id: "prenda-colores", nombre: "Colores", requerido: false, hecho: b.colorCodigos.length > 0, pendiente: "" });
  if (!nueva) {
    const nuevas = combinacionesDeLaHoja(b, ctx).length;
    campos.push({ id: "prenda-nuevas", nombre: "Qué se suma", requerido: true, hecho: nuevas > 0, pendiente: "Elige una talla o un color que la prenda todavía no tenga." });
  }
  if (nueva) {
    const precio = leerPrecioVenta(b.precio, true);
    const porRevisar = precio.problema === null && !tocados.precio;
    campos.push(
      porRevisar
        ? { id: "prenda-precio", nombre: "Precio de venta", requerido: false, sugerido: true, hecho: false, pendiente: "Revisa el precio de venta: lo sugirió quien compró." }
        : { id: "prenda-precio", nombre: "Precio de venta", requerido: true, hecho: precio.problema === null, pendiente: precio.problema ?? "" },
    );
    if (ctx.exigeTejidoPatron) {
      campos.push({
        id: "prenda-tejido",
        nombre: "Tejido",
        requerido: true,
        hecho: ctx.tejidos.some((t) => t.id === b.tejidoId),
        pendiente: ctx.tejidos.length === 0 ? "Esta categoría no tiene tejidos habilitados: pídele a un líder que los habilite en Catálogo ▸ Categorías." : "Elige el tejido.",
      });
      campos.push({
        id: "prenda-patron",
        nombre: "Patrón",
        requerido: true,
        hecho: ctx.patrones.some((p) => p.id === b.patronId),
        pendiente: ctx.patrones.length === 0 ? "Esta categoría no tiene patrones habilitados: pídele a un líder que los habilite en Catálogo ▸ Categorías." : "Elige el patrón (si no tiene diseño, Liso).",
      });
    }
    const problemaDesc = b.descripcion.trim().length > TOPES_PRENDA.descripcion ? `La descripción va hasta ${TOPES_PRENDA.descripcion} letras.` : null;
    campos.push({ id: "prenda-descripcion", nombre: "Descripción", requerido: problemaDesc !== null, hecho: b.descripcion.trim() !== "" && problemaDesc === null, pendiente: problemaDesc ?? "" });
  }
  return campos;
}

export type ArgsPrepararPrenda = {
  p_despacho_id: string;
  p_despacho_item_id: string | null;
  p_categoria_id: string | null;
  p_marca_id: string | null;
  p_producto_id: string | null;
  p_referencia: string | null;
  p_variantes: { talla_id: string | null; color_codigo: string | null }[];
  p_precio: number | null;
  p_descripcion: string | null;
  p_tejido_id: string | null;
  p_patron_id: string | null;
  p_confirmo_distinto: boolean;
  p_token: string;
  /** Algo fuera de la guía en un envío de dos o más proveedores: de cuál es (con la pareja marca–proveedor se registra). */
  p_proveedor_id: string | null;
};

/**
 * Los argumentos de `preparar_prenda_al_recibir`. Para una línea del envío, la categoría y la marca salen de la línea (la base ignora las que
 * se manden); para algo que no estaba en la guía, van las elegidas. `token` se genera al abrir la hoja: un reintento no crea dos prendas.
 */
export function argsPrepararPrenda(
  b: BorradorPrenda,
  ctx: ContextoPrenda,
  o: {
    despachoId: string;
    despachoItemId: string | null;
    categoriaId: string;
    marcaId: string | null;
    productoId: string | null;
    confirmoDistinto: boolean;
    token: string;
    /** Solo para algo fuera de la guía: el proveedor elegido (vacío = el único del envío). */
    proveedorId?: string | null;
  },
): ArgsPrepararPrenda {
  const nueva = ctx.modo === "nueva";
  const precio = leerPrecioVenta(b.precio, nueva).centimos;
  const descripcion = textoParaBase(b.descripcion);
  return {
    p_despacho_id: o.despachoId,
    p_despacho_item_id: o.despachoItemId,
    p_categoria_id: o.despachoItemId ? null : o.categoriaId,
    p_marca_id: o.despachoItemId ? null : o.marcaId,
    p_producto_id: nueva ? null : o.productoId,
    p_referencia: nueva ? tituloReferencia(b.nombre) : null,
    p_variantes: combinacionesDeLaHoja(b, ctx),
    p_precio: precio == null ? null : precio / 100,
    p_descripcion: nueva && descripcion ? descripcion : null,
    p_tejido_id: nueva && ctx.exigeTejidoPatron && b.tejidoId ? b.tejidoId : null,
    p_patron_id: nueva && ctx.exigeTejidoPatron && b.patronId ? b.patronId : null,
    p_confirmo_distinto: o.confirmoDistinto,
    p_token: o.token,
    p_proveedor_id: o.despachoItemId ? null : o.proveedorId || null,
  };
}

/** «Se crean 4: M y L en Negro y en Blanco»: lo que la hoja va a crear, para leerlo antes de pulsar. */
export function textoDeLoQueSeCrea(b: BorradorPrenda, ctx: ContextoPrenda, nombreColor: (codigo: string) => string): string | null {
  // Sin tallas marcadas en una categoría que las tiene, todavía no se crea nada: «1 combinación: Única» decía algo que no iba a pasar
  // (la talla es obligatoria). Aparece apenas se marca la primera (las tallas arrancan sin marcar, Felipe 2026-10-13).
  if (ctx.modo === "nueva" && ctx.tallas.length > 0 && tallasElegidas(b, ctx).length === 0) return null;
  const combinaciones = combinacionesDeLaHoja(b, ctx);
  if (combinaciones.length === 0) return null;
  const tallas = [...new Set(combinaciones.map((c) => c.talla_id))].map((id) => (id ? (ctx.tallas.find((t) => t.id === id)?.valor ?? "?") : "Única"));
  const colores = [...new Set(combinaciones.map((c) => c.color_codigo))].map((c) => (c ? nombreColor(c) : "Sin color"));
  const y = (xs: string[]) => new Intl.ListFormat("es", { type: "conjunction" }).format(xs);
  const n = combinaciones.length;
  return `${n === 1 ? "Se crea 1 combinación" : `Se crean ${n} combinaciones`}: ${y(tallas)}${colores.length === 1 && colores[0] === "Sin color" ? "" : ` en ${y(colores)}`}.`;
}
