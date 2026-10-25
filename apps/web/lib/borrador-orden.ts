import { FASES, fasesIniciales, type FaseBorrador } from "./orden-fases-reglas";
import type { TelaBorrador } from "./orden-tela-reglas";

// El borrador de «Nueva orden» (ADR-0509): lo escrito sobrevive a salir de la pantalla. Un compositor sobre la lista se abandona con más facilidad que una hoja (basta tocar el menú) y
// armar 120 blusas con sus fases son varios minutos. Reglas puras y un almacén que NUNCA lanza: sin Supabase ni React.
//
// DÓNDE VIVE. En el navegador (`localStorage`), por Taller y por modelo: `cayla:borrador-orden:<taller>:<modelo>` (`<modelo>` es el id del producto, o «nuevo» si se está creando uno). No hay
// estado «borrador» en la base (una orden solo está en proceso, terminada o anulada) y no hace falta: un borrador no es una orden. Nunca guarda dinero ni datos personales: cantidades, fases
// y la nota que la persona escribió.
//
// CONTRATO
//   PROMETE: que guardar, leer y borrar no lanzan nunca (el almacenamiento falla en una ventana privada, con el disco lleno o con los datos del sitio bloqueados: se devuelve `false`/`null` y la
//            pantalla sigue como si no hubiera borrador); que lo leído se VALIDA (un borrador viejo, de otra versión o a medias se ignora, no rompe la pantalla); y que `guardarBorrador` dice si
//            de verdad quedó guardado (la pantalla solo se fía de él mientras así sea).
//   ASUME: `FotoDelBorrador` es lo que el formulario ya sabe armar de su estado; aquí no se decide qué es válido para abrir la orden (eso es del formulario y de la base).
//   NO HACE: no restaura nada solo (lo hace el formulario, a la vista de la persona), ni borra por su cuenta (se borra al abrir la orden, al descartar o al empezar de cero).

export type TipoDeOrden = "produccion" | "muestra";
export type ModoDeModelo = "existe" | "nuevo";

/** Todo lo que la persona escribió o eligió y que se perdería: lo mismo que el formulario cuenta como «trabajo» para preguntar «¿Salir sin guardar?». */
export type FotoDelBorrador = {
  tipo: TipoDeOrden;
  modoModelo: ModoDeModelo;
  productoId: string;
  nombreNuevo: string;
  categoriaNuevaId: string;
  tallasNuevas: string[];
  coloresNuevos: string[];
  precioNuevo: string;
  cantidades: Record<string, string>;
  fases: FaseBorrador[];
  /** `null` = la persona no tocó la tela (manda la sugerencia). */
  telasManual: TelaBorrador[] | null;
  fechaEntrega: string;
  nota: string;
};

export type BorradorDeOrden = { v: 1; guardadoEn: string; foto: FotoDelBorrador };

/** De dónde arranca el formulario cuando no arranca en blanco: un borrador que se retoma, o lo que se deja para «crear otra» (el tipo, las fases y el modelo). */
export type PartidaDeOrden = {
  foto: Partial<FotoDelBorrador>;
  /** Es un borrador que se retoma: lo que trae cuenta como trabajo que se perdería al cerrar (no es el punto de partida de una orden en blanco). */
  deBorrador?: boolean;
  /** «Crear otra orden después de esta» sigue prendido (si no, cada orden obligaría a prenderlo otra vez). */
  otraDespues?: boolean;
};

/** El almacén mínimo que se usa (el `Storage` del navegador, o uno de mentira en las pruebas). */
export type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const VERSION = 1;
const PREFIJO = "cayla:borrador-orden";
export const claveDelBorrador = (tallerId: string, modelo: string) => `${PREFIJO}:${tallerId}:${modelo}`;
const claveDelUltimo = (tallerId: string) => `${PREFIJO}:${tallerId}:ultimo`;

/** El modelo al que pertenece: el id del producto, o «nuevo» si se está creando uno; `null` si todavía no hay modelo (nada que guardar). */
export function modeloDelBorrador(f: Pick<FotoDelBorrador, "modoModelo" | "productoId">): string | null {
  if (f.modoModelo === "nuevo") return "nuevo";
  return f.productoId !== "" ? f.productoId : null;
}

const fasesComoSon = (fases: readonly FaseBorrador[]) => JSON.stringify(fases);

/** ¿Hay trabajo que valga guardar? Elegir el modelo o el tipo no es trabajo: lo es una cantidad, un nombre, una categoría, tallas o colores del modelo nuevo, un precio, una nota, una fecha, una tela o una fase distinta de la de siempre. */
export function tieneTrabajo(f: FotoDelBorrador): boolean {
  if (Object.values(f.cantidades).some((v) => v.trim() !== "" && v.trim() !== "0")) return true;
  if (f.nombreNuevo.trim() !== "" || f.precioNuevo.trim() !== "" || f.nota.trim() !== "" || f.fechaEntrega !== "") return true;
  if (f.categoriaNuevaId !== "" || f.tallasNuevas.length > 0 || f.coloresNuevos.length > 0) return true;
  if (f.telasManual !== null) return true;
  return fasesComoSon(f.fases) !== fasesComoSon(fasesIniciales());
}

// ---------- Leer lo guardado: nada se fía hasta validarlo ----------

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const esTexto = (x: unknown): x is string => typeof x === "string";
const esListaDeTextos = (x: unknown): x is string[] => Array.isArray(x) && x.every(esTexto);
const esTextoONulo = (x: unknown): x is string | null => x === null || esTexto(x);
const CLAVES_DE_FASE = new Set<string>(FASES.map((f) => f.clave));

function esFase(x: unknown): x is FaseBorrador {
  if (!esObjeto(x)) return false;
  return (
    esTexto(x.clave) && CLAVES_DE_FASE.has(x.clave) && typeof x.encendida === "boolean" && (x.quien === "taller" || x.quien === "servicio") && esTextoONulo(x.proveedorId) &&
    esTexto(x.tarifa) && esTexto(x.fijo) && esTexto(x.minimo) && esTexto(x.fechaPrometida) && (x.posicion === null || x.posicion === "pieza" || x.posicion === "prenda")
  );
}

function esTela(x: unknown): x is TelaBorrador {
  return esObjeto(x) && esTextoONulo(x.insumoId) && esTextoONulo(x.colorCodigo) && esTexto(x.consumoPorPrenda);
}

function esFoto(x: unknown): x is FotoDelBorrador {
  if (!esObjeto(x)) return false;
  return (
    (x.tipo === "produccion" || x.tipo === "muestra") && (x.modoModelo === "existe" || x.modoModelo === "nuevo") && esTexto(x.productoId) && esTexto(x.nombreNuevo) && esTexto(x.categoriaNuevaId) &&
    esListaDeTextos(x.tallasNuevas) && esListaDeTextos(x.coloresNuevos) && esTexto(x.precioNuevo) && esObjeto(x.cantidades) && Object.values(x.cantidades).every(esTexto) &&
    Array.isArray(x.fases) && x.fases.every(esFase) && (x.telasManual === null || (Array.isArray(x.telasManual) && x.telasManual.every(esTela))) && esTexto(x.fechaEntrega) && esTexto(x.nota)
  );
}

/** Lo que había guardado, o `null` si no hay nada, es de otra versión, está a medias o no es JSON. Nunca lanza. */
export function leerBorrador(texto: string | null): BorradorDeOrden | null {
  if (!texto) return null;
  let x: unknown;
  try {
    x = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!esObjeto(x) || x.v !== VERSION || !esTexto(x.guardadoEn) || Number.isNaN(Date.parse(x.guardadoEn)) || !esFoto(x.foto)) return null;
  return { v: VERSION, guardadoEn: x.guardadoEn, foto: x.foto };
}

// ---------- El almacén: cada llamada puede fallar y ninguna lanza ----------

/** El `localStorage` del navegador, o `null` si no se puede ni pedir (el acceso mismo lanza con los datos del sitio bloqueados). */
export function almacenDelNavegador(): Almacen | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Guarda el borrador y apunta que es el último del Taller. `true` solo si de verdad quedó guardado. Sin modelo o sin trabajo, no guarda nada. */
export function guardarBorrador(almacen: Almacen | null, tallerId: string, foto: FotoDelBorrador, ahora: Date = new Date()): boolean {
  const modelo = modeloDelBorrador(foto);
  if (!almacen || !modelo || !tieneTrabajo(foto)) return false;
  try {
    const borrador: BorradorDeOrden = { v: VERSION, guardadoEn: ahora.toISOString(), foto };
    almacen.setItem(claveDelBorrador(tallerId, modelo), JSON.stringify(borrador));
    almacen.setItem(claveDelUltimo(tallerId), modelo);
    return true;
  } catch {
    return false;
  }
}

export function leerBorradorGuardado(almacen: Almacen | null, tallerId: string, modelo: string): BorradorDeOrden | null {
  if (!almacen) return null;
  try {
    return leerBorrador(almacen.getItem(claveDelBorrador(tallerId, modelo)));
  } catch {
    return null;
  }
}

/** El texto del último borrador tal como está guardado (el que ofrece la lista para retomar): un valor estable que comparar en `useSyncExternalStore`; se lee con `leerBorrador`. */
export function textoDelUltimoBorrador(almacen: Almacen | null, tallerId: string): string | null {
  if (!almacen) return null;
  try {
    const modelo = almacen.getItem(claveDelUltimo(tallerId));
    return modelo ? almacen.getItem(claveDelBorrador(tallerId, modelo)) : null;
  } catch {
    return null;
  }
}

/** Borra el borrador de un modelo (se abrió la orden, se descartó, o se empezó de cero) y, si era el último, suelta el apunte. */
export function borrarBorrador(almacen: Almacen | null, tallerId: string, modelo: string): void {
  if (!almacen) return;
  try {
    almacen.removeItem(claveDelBorrador(tallerId, modelo));
    if (almacen.getItem(claveDelUltimo(tallerId)) === modelo) almacen.removeItem(claveDelUltimo(tallerId));
  } catch {
    /* sin almacén no había borrador que borrar */
  }
}

/** Cuántas prendas lleva escritas: la suma de las cantidades válidas (enteros de 1 a 9999, como las lee la base). */
export function prendasDelBorrador(f: Pick<FotoDelBorrador, "cantidades">): number {
  return Object.values(f.cantidades).reduce((suma, v) => (/^\d{1,4}$/.test(v.trim()) ? suma + Number(v.trim()) : suma), 0);
}

/** Cómo se nombra el borrador en la lista: el modelo (o el nombre que se le estaba poniendo al nuevo) y cuántas prendas lleva. `nombres` = modelo → nombre que ve la persona. */
export function resumenDelBorrador(f: FotoDelBorrador, nombres: ReadonlyMap<string, string>): { modelo: string; prendas: number } {
  const nuevo = f.modoModelo === "nuevo";
  const modelo = nuevo ? f.nombreNuevo.trim() || "un modelo nuevo" : (nombres.get(f.productoId) ?? "un modelo que ya no está");
  return { modelo, prendas: prendasDelBorrador(f) };
}

/** «hace un momento», «hace 5 min», «hace 3 h», «hace 2 d»: cuándo se dejó, para que la persona sepa de qué borrador se trata. */
export function haceCuanto(guardadoEn: string, ahora: Date = new Date()): string {
  const min = Math.max(0, Math.floor((ahora.getTime() - Date.parse(guardadoEn)) / 60000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  if (min < 60 * 24) return `hace ${Math.floor(min / 60)} h`;
  return `hace ${Math.floor(min / (60 * 24))} d`;
}
