// Relativo, no `@/`: vitest no resuelve el alias y este archivo tiene pruebas.
import { ETIQUETA_COLGADA, ETIQUETA_GUARDADA, etiquetaMovimiento, parDeInterno, respaldoDeAjuste, type Movimiento } from "./movimientos-reglas";

// Los tipos que se VEN de un movimiento (rediseño de Movimientos, ADR-0353): cada uno con su nombre, su color, su ícono
// y el grupo del filtro de la derecha al que pertenece. Es la capa que contesta «¿qué fue esto?» de un vistazo —una
// venta, una colgada en piso, una guardada en almacén…— y reemplaza al color por categoría (`tonoCategoria`), que no
// separaba una bajada de un retiro.
//
// No es otra clasificación de la base: sale de lo que `fn_movimientos` ya devuelve (categoría, proceso, signo y el par de
// lugares). Lógica pura, sin React ni servidor: la leen los componentes, el cajón y las pruebas.
//
// Palabras decididas por Felipe (2026-10-05): «Colgada en piso» (almacén → piso) y «Guardada en almacén» (piso →
// almacén). Reemplazan a «Bajada al piso» y «Retiro del piso» DENTRO de Movimientos; el resto del sistema (el módulo
// «Bajar al piso», Existencias, el Punto de venta) todavía las dice con las palabras de antes: está en el backlog.

export type TipoVisual =
  | "venta"
  | "colgada"
  | "guardada"
  | "llegada"
  | "traslado"
  | "devolucion"
  | "cambio"
  | "ajuste"
  | "conteo"
  | "apartado"
  | "danada"
  | "movida"
  | "otro";

/** Los colores del tipo, por el nombre del token de `globals.css`. «oliva» es `--verde-2`: el verde de la llegada, otra
 *  tonalidad que el de la venta (verde con un toque de ámbar; no es un color nuevo). */
export type TonoTipo = "verde" | "oliva" | "ambar" | "pizarra" | "tinta" | "rojo" | "rojo-profundo" | "taupe";

export type InfoTipo = {
  nombre: string;
  plural: string;
  tono: TonoTipo;
  /** El ícono que se dibuja: el mismo nombre del tipo (un solo juego de íconos, `SelloTipo`). */
  icono: TipoVisual;
  /** El sello lleva borde punteado: es lo que se hizo «a mano», sin documento detrás (ajustes y conteos). */
  punteado: boolean;
};

export const TIPOS_VISUALES: Record<TipoVisual, InfoTipo> = {
  venta: { nombre: "Venta", plural: "Ventas", tono: "verde", icono: "venta", punteado: false },
  colgada: { nombre: ETIQUETA_COLGADA, plural: "Colgadas en piso", tono: "ambar", icono: "colgada", punteado: false },
  guardada: { nombre: ETIQUETA_GUARDADA, plural: "Guardadas en almacén", tono: "pizarra", icono: "guardada", punteado: false },
  llegada: { nombre: "Llegada", plural: "Llegadas", tono: "oliva", icono: "llegada", punteado: false },
  traslado: { nombre: "Traslado enviado", plural: "Traslados enviados", tono: "tinta", icono: "traslado", punteado: false },
  devolucion: { nombre: "Devolución", plural: "Devoluciones", tono: "rojo", icono: "devolucion", punteado: false },
  cambio: { nombre: "Cambio", plural: "Cambios", tono: "rojo", icono: "cambio", punteado: false },
  // Un ajuste sin conteo no tiene documento: el borde punteado lo dice sin palabras (ADR-0234, ajustes en bruto).
  ajuste: { nombre: "Ajuste a mano", plural: "Ajustes a mano", tono: "taupe", icono: "ajuste", punteado: true },
  conteo: { nombre: "Conteo", plural: "Conteos", tono: "taupe", icono: "conteo", punteado: true },
  apartado: { nombre: "Apartado", plural: "Apartados", tono: "taupe", icono: "apartado", punteado: false },
  danada: { nombre: "Dañado", plural: "Dañados", tono: "rojo-profundo", icono: "danada", punteado: false },
  movida: { nombre: "Movido dentro de la sede", plural: "Movidos dentro de la sede", tono: "tinta", icono: "movida", punteado: false },
  otro: { nombre: "Otro movimiento", plural: "Otros movimientos", tono: "tinta", icono: "otro", punteado: false },
};

type FilaDeTipo = Pick<Movimiento, "categoria" | "motivo" | "delta" | "sububicacion" | "sububicacionDestino">;

/** Procesos de la cuarentena de prendas dañadas: salen de la tienda sin venderse (ADR-0328: Pérdidas). */
const MOTIVOS_DANADA: readonly string[] = ["cuarentena_liquidada", "cuarentena_se_boto", "cuarentena_donada"];

/** El tipo que se ve de UNA fila. Nunca falla: un proceso que la web todavía no conoce cae en «otro» (o en «llegada» si
 *  sumó stock) y la pantalla se dibuja igual. */
export function tipoVisual(m: FilaDeTipo): TipoVisual {
  switch (m.categoria) {
    case "apartado":
    case "liberacion_apartado":
      return "apartado";
    case "interno": {
      const par = parDeInterno(m);
      if (par) return par === "colgada" ? "colgada" : "guardada";
      // Entrar a la cuarentena o salir de ella (prenda dañada) o cualquier otro par: no es colgar ni guardar.
      return m.sububicacion?.tipo === "cuarentena" || m.sububicacionDestino?.tipo === "cuarentena" ? "danada" : "movida";
    }
    case "transferencia":
      // Las dos piernas de un traslado se leen desde la sede que se mira: la que llega suma, la que sale resta.
      return m.delta > 0 ? "llegada" : "traslado";
    case "ajuste":
      return respaldoDeAjuste(m.motivo) === "en_un_conteo" ? "conteo" : "ajuste";
    case "entrada":
      if (m.motivo === "devolucion" || m.motivo === "anulacion_venta") return "devolucion";
      return m.motivo === "cambio" ? "cambio" : "llegada";
    case "salida":
      if (m.motivo === "venta") return "venta";
      if (m.motivo === "cambio") return "cambio";
      return m.motivo && MOTIVOS_DANADA.includes(m.motivo) ? "danada" : "otro";
  }
}

/** El tipo de una operación (varias filas guardadas juntas): el de su primera fila. Una operación tiene un solo proceso
 *  (`claveOperacion`), y un cambio —que entra y sale— es «cambio» en las dos filas. */
export function tipoDeOperacion(filas: readonly FilaDeTipo[]): TipoVisual {
  return tipoVisual(filas[0]);
}

// ---------------------------------------------------------------------------
// Los siete grupos del filtro de la derecha: lo que la persona toca para ver «solo las ventas», «solo las colgadas»…
// Los tipos que no están en ninguno (apartados, dañadas, movidos, otros) se ven en «Todos» y no tienen botón.
// ---------------------------------------------------------------------------

export type GrupoTipo = "venta" | "colgada" | "guardada" | "llegada" | "traslado" | "cliente" | "ajuste";

export type InfoGrupo = {
  id: GrupoTipo;
  nombre: string;
  tipos: readonly TipoVisual[];
  /** El ícono y el color del botón: los del primer tipo del grupo. */
  tipo: TipoVisual;
  /** Hacia dónde va el stock de la tienda, en una frase corta. */
  flujo: string;
};

export const GRUPOS_TIPO: readonly InfoGrupo[] = [
  { id: "venta", nombre: "Ventas", tipos: ["venta"], tipo: "venta", flujo: "Sale de la tienda" },
  { id: "colgada", nombre: "Colgadas en piso", tipos: ["colgada"], tipo: "colgada", flujo: "Se mueve dentro" },
  { id: "guardada", nombre: "Guardadas en almacén", tipos: ["guardada"], tipo: "guardada", flujo: "Se mueve dentro" },
  { id: "llegada", nombre: "Llegadas", tipos: ["llegada"], tipo: "llegada", flujo: "Entra a la tienda" },
  { id: "traslado", nombre: "Traslados enviados", tipos: ["traslado"], tipo: "traslado", flujo: "Sale de la tienda" },
  { id: "cliente", nombre: "Cambios y devoluciones", tipos: ["devolucion", "cambio"], tipo: "devolucion", flujo: "Vuelve del cliente" },
  { id: "ajuste", nombre: "Ajustes y conteos", tipos: ["ajuste", "conteo"], tipo: "ajuste", flujo: "Corrige el stock" },
];

/** El grupo del filtro al que pertenece un tipo, o null si no tiene botón. */
export function grupoDeTipo(tipo: TipoVisual): InfoGrupo | null {
  return GRUPOS_TIPO.find((g) => g.tipos.includes(tipo)) ?? null;
}

export function grupoPorId(id: string | null | undefined): InfoGrupo | null {
  return GRUPOS_TIPO.find((g) => g.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Cómo se lee una fila: el rótulo de arriba («VENTA», «LLEGADA · Recepción») y los lugares del trayecto.
// ---------------------------------------------------------------------------

/** El rótulo de una fila: el nombre del tipo y, si el proceso dice algo más, ese detalle («Llegada · Recepción»,
 *  «Ajuste a mano · merma»). Si el proceso ya empieza con el nombre del tipo («Ajuste a mano · merma»), no se repite. */
export function rotuloDeMovimiento(m: FilaDeTipo): { tipo: TipoVisual; titulo: string; detalle: string | null } {
  const tipo = tipoVisual(m);
  const nombre = TIPOS_VISUALES[tipo].nombre;
  const proceso = etiquetaMovimiento(m);
  const igual = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" }) === 0;
  if (igual(proceso, nombre)) return { tipo, titulo: nombre, detalle: null };
  if (proceso.toLocaleLowerCase("es").startsWith(nombre.toLocaleLowerCase("es"))) {
    // «Ajuste a mano · merma» → título «Ajuste a mano», detalle «merma»
    const resto = proceso.slice(nombre.length).replace(/^[\s·]+/, "");
    return { tipo, titulo: nombre, detalle: resto || null };
  }
  return { tipo, titulo: nombre, detalle: proceso };
}

/** Qué ícono lleva cada punto del trayecto: el piso, el almacén, el cliente, «de fuera» (un proveedor o el Taller) o una sede. */
export type KindLugar = "piso" | "almacen" | "cliente" | "fuera" | "sede";

/** Los procesos que llegan de AFUERA de la red de sedes: un proveedor, el Taller, una carga. Su origen es «de fuera». */
const MOTIVOS_DE_FUERA: readonly string[] = ["recepcion", "produccion", "carga_inicial", "ingreso_regularizado", "siembra_cargo_especial"];

export function kindDeLugar(texto: string, lado: "origen" | "destino", motivo: string | null, tipo: TipoVisual): KindLugar {
  if (texto === "Piso") return "piso";
  if (texto === "Almacén") return "almacen";
  if (texto === "Cliente") return "cliente";
  if (lado === "origen" && tipo === "llegada" && motivo && MOTIVOS_DE_FUERA.includes(motivo)) return "fuera";
  if (texto === "Producción") return "fuera";
  return "sede";
}
