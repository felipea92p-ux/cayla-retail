/**
 * «Bajar prendas al piso» (ADR-0208, paso 1): las reglas puras de la pantalla, sin React, sin DOM y sin supabase,
 * para que las usen la página (servidor) y el formulario (cliente) y se puedan probar.
 *
 * EL PROBLEMA. Frescura del piso solo sirve si la bajada se registra cuando la prenda se cuelga, no cuando se cobra.
 * Por eso la lista vive en el navegador (cada lectura de la pistola suma 1) y la base se toca UNA sola vez, al
 * confirmar, con `bajar_al_piso`: todo o nada, y con un token que hace seguro reintentar si se corta la conexión.
 * Reintentar es seguro SOLO con la misma lista: por eso, mientras no se sabe si la bajada se guardó, la lista se
 * congela, y si la base dice que ese token ya se usó, devuelve lo que guardó para que la pantalla deje solo lo que falta.
 */

import { resolverCodigoV2 } from "./buscar-prenda-v2";
import { ID_CARGO_ESPECIAL } from "./cargo-especial";
import { esRespuestaIncierta, traducirError, type ErrorEscritura } from "./error-escritura";
import { diaYHoraLima } from "./fechas-lima";

export const MAX_LINEAS_BAJADA = 300;
export const HORAS_DE_VIDA_DEL_BORRADOR = 12;
// v2 suma `enviadoEn`: distingue una lista nunca enviada de una cuya respuesta se perdió. Un v1 se lee como sin enviar.
export const VERSION_BORRADOR = 2;

/** Los rótulos del único botón mientras no se sabe si la bajada se guardó (los textos los nombran tal cual). */
export const BOTON_CONFIRMAR_DE_NUEVO = "Confirmar de nuevo";
export const BOTON_COMPROBAR = "Comprobar";

/** La RPC y sus parámetros en un solo lugar: `bajada-reglas.test.ts` los fija contra la migración. */
export const RPC_BAJADA = "bajar_al_piso";
export const PARAMETROS_RPC_BAJADA = ["p_ubicacion_id", "p_items", "p_token"] as const;

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MS_HORA = 3_600_000;

/** Lo mínimo de FilaStock (lib/inventario-v2.ts) que necesita la pantalla; FilaStock lo satisface por estructura. */
export type FilaDeStock = {
  varianteId: string;
  sku: string | null;
  referencia: string;
  talla: string | null;
  color: string | null;
  codigosBarras: string[];
  fotoUrl: string | null;
  piso: number | null;
  almacen: number | null;
  almacenDisponible: number | null;
};

export type PrendaBajable = {
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  codigosBarras: string[];
  fotoUrl: string | null;
  piso: number;
  almacen: number;
  almacenDisponible: number;
};

export type LineaBajada = { varianteId: string; cantidad: number };

export type Lectura =
  | { tipo: "suma"; prenda: PrendaBajable; cantidadAhora: number }
  | { tipo: "vacio" }
  | { tipo: "desconocido"; codigo: string }
  | { tipo: "sin_almacen"; prenda: PrendaBajable }
  | { tipo: "todo_apartado"; prenda: PrendaBajable; apartadas: number }
  | { tipo: "tope"; prenda: PrendaBajable; disponible: number };

export type ItemRpc = { variante_id: string; cantidad: number };

export type ArgumentosDeBajada = { p_ubicacion_id: string; p_items: ItemRpc[]; p_token: string };

export type RespuestaBajada = { bajada_id: string; ya_registrada: boolean; lineas: number; unidades: number; registrada_en: string };

export type ErrorDeBajada =
  | { tipo: "sin_alcance"; mensaje: string; lineas: { varianteId: string; hay: number; motivo: string }[] }
  // `guardadas`: las líneas de la bajada que YA se guardó con ese token (el `detail` de la base); null si no vinieron
  // o no se pudieron leer enteras, y entonces no se puede calcular qué falta.
  | { tipo: "token_reusado"; mensaje: string; guardadas: LineaBajada[] | null }
  | { tipo: "red"; mensaje: string }
  | { tipo: "otro"; mensaje: string };

/** `enviadoEn`: se escribe ANTES de llamar a la base y se borra al recibir su respuesta, sea cual sea. */
export type BorradorDeBajada = { v: 2; token: string; lineas: LineaBajada[]; creadoEn: string; enviadoEn?: string };

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function esEnteroPositivo(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x > 0;
}

function esEnteroNoNegativo(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= 0;
}

function plural(n: number, singular: string, varias: string): string {
  return `${n} ${n === 1 ? singular : varias}`;
}

function compararTexto(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "", "es", { numeric: true });
}

function unidadesDe(lineas: readonly LineaBajada[]): number {
  return lineas.reduce((acc, l) => acc + l.cantidad, 0);
}

// ---------------------------------------------------------------------------------------------------------------
// La lista de prendas de la tienda
// ---------------------------------------------------------------------------------------------------------------

/** Solo tiendas que separan piso y almacén; conserva las que tienen almacén > 0 o piso > 0; ordena por referencia, talla y color. */
export function aPrendasBajables(filas: readonly FilaDeStock[]): PrendaBajable[] {
  const prendas: PrendaBajable[] = [];
  for (const f of filas) {
    if (f.piso === null || f.almacen === null || f.varianteId === ID_CARGO_ESPECIAL) continue;
    // Una prenda que ya está toda en el piso se queda: al escanearla se oye cuánto cuenta el sistema, no «no la encuentro».
    if (f.almacen <= 0 && f.piso <= 0) continue;
    prendas.push({
      varianteId: f.varianteId,
      sku: f.sku ?? "",
      referencia: f.referencia,
      talla: f.talla,
      color: f.color,
      codigosBarras: [...f.codigosBarras],
      fotoUrl: f.fotoUrl,
      piso: f.piso,
      almacen: f.almacen,
      almacenDisponible: Math.min(Math.max(f.almacenDisponible ?? f.almacen, 0), f.almacen),
    });
  }
  return prendas.sort(
    (a, b) =>
      compararTexto(a.referencia, b.referencia) ||
      compararTexto(a.talla, b.talla) ||
      compararTexto(a.color, b.color) ||
      compararTexto(a.sku, b.sku)
  );
}

/** «Blusa lino · M · Blanco», omitiendo lo vacío: el mismo nombre que arma `retail.fn_prenda_corta` en los errores. */
export function nombreDePrenda(p: Pick<PrendaBajable, "referencia" | "talla" | "color">): string {
  return (
    [p.referencia, p.talla, p.color]
      .map((t) => (t ?? "").trim())
      .filter(Boolean)
      .join(" · ") || "Una prenda"
  );
}

/** Unidades del almacén separadas para clientas: siguen ahí, pero la base no deja moverlas. */
export function apartadasEnAlmacen(p: PrendaBajable): number {
  return Math.max(0, p.almacen - p.almacenDisponible);
}

/**
 * Lo que la base dijo de una línea que no alcanzó: su tope pasa a ser lo que hay de verdad (sin_alcance) o 0 (archivada,
 * «Prenda sin registrar», borrada). Lo apartado se conserva para que el aviso de escaneo no diga «apartadas» de más.
 */
export function conTopeDeLaBase(p: PrendaBajable, problema: { hay: number; motivo: string } | undefined): PrendaBajable {
  if (!problema) return p;
  const hay = problema.motivo === "sin_alcance" ? problema.hay : 0;
  return { ...p, almacenDisponible: hay, almacen: hay + apartadasEnAlmacen(p) };
}

// ---------------------------------------------------------------------------------------------------------------
// Cada lectura de la pistola
// ---------------------------------------------------------------------------------------------------------------

/** Qué significa lo que llegó al campo (SKU o código de barras, sin mayúsculas ni acentos), sin tocar la lista. */
export function leerCodigo(texto: string, prendas: readonly PrendaBajable[], lineas: readonly LineaBajada[]): Lectura {
  const codigo = texto.trim();
  if (!codigo) return { tipo: "vacio" };
  const prenda = resolverCodigoV2(codigo, prendas.slice());
  if (!prenda) return { tipo: "desconocido", codigo };
  const apartadas = apartadasEnAlmacen(prenda);
  if (prenda.almacenDisponible <= 0) return apartadas > 0 ? { tipo: "todo_apartado", prenda, apartadas } : { tipo: "sin_almacen", prenda };
  const enLista = lineas.find((l) => l.varianteId === prenda.varianteId)?.cantidad ?? 0;
  if (enLista >= prenda.almacenDisponible) return { tipo: "tope", prenda, disponible: prenda.almacenDisponible };
  return { tipo: "suma", prenda, cantidadAhora: enLista + 1 };
}

/** +1 y la línea sube al principio: la última escaneada queda arriba, donde ella mira. */
export function sumarLectura(lineas: readonly LineaBajada[], varianteId: string): LineaBajada[] {
  const antes = lineas.find((l) => l.varianteId === varianteId)?.cantidad ?? 0;
  return [{ varianteId, cantidad: antes + 1 }, ...lineas.filter((l) => l.varianteId !== varianteId)];
}

/**
 * Cantidad escrita a mano o con − / +: entera, acotada a [0, almacenDisponible]; 0 quita la línea; lo que no es
 * entero no cambia nada. La línea NO se mueve de lugar: subirla mientras ella toca «+» se la sacaría del dedo.
 */
export function fijarCantidad(lineas: readonly LineaBajada[], prenda: PrendaBajable, cantidad: number): LineaBajada[] {
  if (!Number.isInteger(cantidad)) return [...lineas];
  const nueva = Math.min(Math.max(cantidad, 0), prenda.almacenDisponible);
  if (nueva === 0) return quitarLinea(lineas, prenda.varianteId);
  return lineas.map((l) => (l.varianteId === prenda.varianteId ? { ...l, cantidad: nueva } : l));
}

export function quitarLinea(lineas: readonly LineaBajada[], varianteId: string): LineaBajada[] {
  return lineas.filter((l) => l.varianteId !== varianteId);
}

/**
 * Lo que queda en `actuales` después de descontar lo que ya viajó (`guardadas`): por prenda, la diferencia si es
 * positiva, en el orden de `actuales`. Es lo que sigue colgado sin registrar cuando la base avisa que ese token ya se
 * usó, y lo que queda en la lista si algo cambió mientras se guardaba.
 */
export function loQueFalta(actuales: readonly LineaBajada[], guardadas: readonly LineaBajada[]): LineaBajada[] {
  const viajo = new Map<string, number>();
  for (const g of guardadas) viajo.set(g.varianteId, (viajo.get(g.varianteId) ?? 0) + g.cantidad);
  return actuales.flatMap((l) => {
    const resto = l.cantidad - (viajo.get(l.varianteId) ?? 0);
    return resto > 0 ? [{ varianteId: l.varianteId, cantidad: resto }] : [];
  });
}

/** prendas = suma de unidades; modelos = referencias distintas. */
export function resumenDeBajada(lineas: readonly LineaBajada[], prendas: readonly PrendaBajable[]): { prendas: number; modelos: number } {
  const porId = new Map(prendas.map((p) => [p.varianteId, p] as const));
  const modelos = new Set<string>();
  for (const l of lineas) modelos.add(porId.get(l.varianteId)?.referencia ?? l.varianteId);
  return { prendas: unidadesDe(lineas), modelos: modelos.size };
}

// ---------------------------------------------------------------------------------------------------------------
// La pistola mientras la pantalla no puede leer
// ---------------------------------------------------------------------------------------------------------------

/** La forma mínima de un `KeyboardEvent` y de `document.activeElement`, sin DOM (como `escaner-tecla-suelta.ts`). */
export type TeclaDePistola = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean };
export type ElementoConFoco = { tagName: string; isContentEditable?: boolean } | null;

const CAMPOS_DE_TEXTO = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Mientras se guarda (el loader deja la app `inert`: una lectura caería en ninguna parte) o mientras la lista está
 * congelada, ¿esta tecla es de la pistola? Un carácter imprimible o el Enter que remata el código. No lo es un atajo
 * (Ctrl/Cmd/Alt), el espacio (activa botones) ni lo que se escribe en OTRO campo de texto (el buscador del combo).
 */
export function teclaDeLaPistola(tecla: TeclaDePistola, activo: ElementoConFoco, activoEsElEscaner: boolean): "caracter" | "enter" | null {
  if (tecla.ctrlKey || tecla.metaKey || tecla.altKey) return null;
  if (activo && !activoEsElEscaner && (CAMPOS_DE_TEXTO.has(activo.tagName.toUpperCase()) || activo.isContentEditable)) return null;
  if (tecla.key === "Enter") return "enter";
  if (tecla.key.length === 1 && tecla.key !== " ") return "caracter";
  return null;
}

/** Lo que disparó la pistola mientras la pantalla no podía leer: los códigos completos y el que iba a medias. */
export type BuferDePistola = { codigos: string[]; parcial: string };
export const BUFER_VACIO: BuferDePistola = { codigos: [], parcial: "" };

/** Suma una tecla al búfer: un carácter alarga el código en curso; el Enter lo cierra (un Enter suelto no es código). */
export function alBufer(b: BuferDePistola, tipo: "caracter" | "enter", key: string): BuferDePistola {
  if (tipo === "caracter") return { codigos: b.codigos, parcial: b.parcial + key };
  return b.parcial.trim() ? { codigos: [...b.codigos, b.parcial], parcial: "" } : { codigos: b.codigos, parcial: "" };
}

// ---------------------------------------------------------------------------------------------------------------
// La llamada a la base
// ---------------------------------------------------------------------------------------------------------------

/**
 * Sin ceros, sin duplicados (se suman, como hace la base) y ordenado por variante_id. NO recorta en 300: una lista
 * cortada en silencio dejaría prendas colgadas que el sistema cree en el almacén; la base rechaza la bajada entera
 * con su propio mensaje («Una bajada admite hasta 300 prendas distintas…») y la lista queda intacta.
 */
export function itemsParaRpc(lineas: readonly LineaBajada[]): ItemRpc[] {
  const porVariante = new Map<string, number>();
  for (const l of lineas) {
    if (!esEnteroPositivo(l.cantidad)) continue;
    porVariante.set(l.varianteId, (porVariante.get(l.varianteId) ?? 0) + l.cantidad);
  }
  return [...porVariante]
    .map(([variante_id, cantidad]) => ({ variante_id, cantidad }))
    .sort((a, b) => (a.variante_id < b.variante_id ? -1 : a.variante_id > b.variante_id ? 1 : 0));
}

/** El objeto que recibe `rpc(RPC_BAJADA, …)`: la pantalla no escribe los nombres de los parámetros a mano. */
export function argumentosDeBajada(ubicacionId: string, lineas: readonly LineaBajada[], token: string): ArgumentosDeBajada {
  return { p_ubicacion_id: ubicacionId, p_items: itemsParaRpc(lineas), p_token: token };
}

/** Valida la forma del jsonb que devuelve `bajar_al_piso`; null si no calza. */
export function leerRespuestaDeBajada(data: unknown): RespuestaBajada | null {
  if (!esObjeto(data)) return null;
  const { bajada_id, ya_registrada, lineas, unidades, registrada_en } = data;
  if (typeof bajada_id !== "string" || !ES_UUID.test(bajada_id)) return null;
  if (typeof ya_registrada !== "boolean" || !esEnteroNoNegativo(lineas) || !esEnteroNoNegativo(unidades)) return null;
  if (typeof registrada_en !== "string" || Number.isNaN(Date.parse(registrada_en))) return null;
  return { bajada_id, ya_registrada, lineas, unidades, registrada_en };
}

// Aquí no va el «no se guardó nada» genérico: sería falso si la respuesta se perdió DESPUÉS de guardar. El mismo token
// con la misma lista hace seguro volver a enviar; por eso la lista se congela hasta que la base responda.
const TEXTO_RED_CAIDA = `Se cortó la conexión y no sabemos si la bajada se guardó. Tu lista sigue aquí: pulsa «${BOTON_CONFIRMAR_DE_NUEVO}». Si ya se había guardado, no se repite.`;

function lineasSinAlcance(details: string | null | undefined): { varianteId: string; hay: number; motivo: string }[] {
  if (!details) return [];
  let crudo: unknown;
  try {
    crudo = JSON.parse(details);
  } catch {
    return [];
  }
  if (!Array.isArray(crudo)) return [];
  return crudo.flatMap((p: unknown) =>
    esObjeto(p) && typeof p.variante_id === "string" && typeof p.motivo === "string" && typeof p.hay === "number" && Number.isFinite(p.hay)
      ? [{ varianteId: p.variante_id, hay: Math.max(0, Math.trunc(p.hay)), motivo: p.motivo }]
      : []
  );
}

/**
 * Las líneas de la bajada ya guardada con ese token: `[{variante_id, cantidad}, …]`. Todo o nada: con una sola
 * entrada rara (o la lista vacía, que la base nunca guarda) devuelve null, porque descontar de menos haría bajar DOS
 * veces lo que ya se bajó.
 */
function lineasGuardadas(details: string | null | undefined): LineaBajada[] | null {
  if (!details) return null;
  let crudo: unknown;
  try {
    crudo = JSON.parse(details);
  } catch {
    return null;
  }
  if (!Array.isArray(crudo) || crudo.length === 0) return null;
  const lineas: LineaBajada[] = [];
  for (const x of crudo as unknown[]) {
    if (!esObjeto(x) || typeof x.variante_id !== "string" || !ES_UUID.test(x.variante_id) || !esEnteroPositivo(x.cantidad)) return null;
    lineas.push({ varianteId: x.variante_id, cantidad: x.cantidad });
  }
  return lineas;
}

// Los rechazos que la base levanta DESPUÉS de mirar la marca (20260926000200: módulo y tienda → forma → marca →
// responsable → piso/almacén → stock). Prueban que esa marca no había guardado nada, o dicen qué guardó.
const HINTS_DESPUES_DE_LA_MARCA = new Set([
  "bajada_token_reusado",
  "bajada_token_ajeno",
  "responsable_requerido",
  "responsable_no_presente",
  "bajada_tienda_sin_piso",
  "bajada_sin_alcance",
]);

/**
 * En un REENVÍO (la marca ya viajó una vez y no se supo qué pasó): ¿esta respuesta dice qué pasó con esa marca?
 * Sí con éxito, con un rechazo posterior a mirar la marca o con un choque de candados en la escritura (40P01: pasó
 * la marca y se deshizo entero). No con un corte de red, una sesión vencida, el módulo apagado o la tienda sin
 * permiso: la base contestó sin mirar la marca, y soltarla dejaría bajar dos veces lo que quizá ya se guardó.
 */
export function respuestaResuelveLaMarca(error: ErrorEscritura): boolean {
  if (!error) return true;
  if (esRespuestaIncierta(error)) return false;
  if (error.code === "40P01") return true;
  return !!error.hint && HINTS_DESPUES_DE_LA_MARCA.has(error.hint);
}

/** Debajo del rechazo, mientras la lista sigue congelada porque la base no miró la marca. */
export function textoMarcaSinResolver(enviadoEn: string, boton: string): string {
  return `Todavía no sabemos si la bajada que enviaste a las ${formatearHoraLima(enviadoEn)} se guardó. Cuando se resuelva lo de arriba, pulsa «${boton}»: si ya se había guardado, no se repite.`;
}

/** La nota junto al pie. Con la lista congelada no se puede afirmar que las prendas sigan en el almacén. */
export function textoNotaDelPie(congelada: boolean): string {
  return congelada
    ? "Hasta comprobar, no sabemos si el sistema ya las ve en el piso: no las subas por «Reponer» mientras tanto."
    : "Mientras no confirmes, estas prendas siguen en el almacén para el sistema: la caja no las ve en el piso.";
}

/** El rechazo de la base, dicho para quien está junto al fardo; nunca lanza, ni con un `details` roto. */
export function interpretarErrorDeBajada(error: ErrorEscritura, sede: string): ErrorDeBajada {
  if (esRespuestaIncierta(error)) return { tipo: "red", mensaje: TEXTO_RED_CAIDA };
  if (error?.code === "40P01") {
    return { tipo: "otro", mensaje: "Otra operación estaba moviendo las mismas prendas en ese momento. No se guardó nada: vuelve a confirmar." };
  }
  const contexto = sede.trim() ? `bajar las prendas al piso de ${sede.trim()}` : "bajar las prendas al piso";
  if (error?.hint === "bajada_sin_alcance") {
    return { tipo: "sin_alcance", mensaje: error.message || traducirError(error, contexto), lineas: lineasSinAlcance(error.details) };
  }
  if (error?.hint === "bajada_token_reusado") {
    return { tipo: "token_reusado", mensaje: error.message || traducirError(error, contexto), guardadas: lineasGuardadas(error.details) };
  }
  return { tipo: "otro", mensaje: traducirError(error, contexto) };
}

/** Qué hace la pantalla cuando la base avisa que ese token ya guardó una bajada y sabemos qué guardó. */
export type SalidaTokenReusado =
  | { tipo: "ya_estaba"; exito: { titulo: string; detalle: string } }
  | { tipo: "faltan"; lineas: LineaBajada[]; mensaje: string };

/**
 * `lineas` − lo guardado. Si no falta nada, es una bajada ya registrada (misma tarjeta que «ya_registrada»). Si falta
 * algo, esas líneas se quedan (con token nuevo, lo decide la pantalla) y el texto de la base dice cuántas quedan.
 */
export function resolverTokenReusado(lineas: readonly LineaBajada[], guardadas: readonly LineaBajada[], mensaje: string, sede: string): SalidaTokenReusado {
  const faltan = loQueFalta(lineas, guardadas);
  if (faltan.length === 0) {
    // La hora solo viaja en el texto de la base («…ya se guardó a las 10:32…»); sin ella, el detalle no la inventa.
    const hora = /a las (\d{1,2}:\d{2})/.exec(mensaje)?.[1];
    return {
      tipo: "ya_estaba",
      exito: {
        titulo: tituloDeExito(unidadesDe(guardadas), sede),
        detalle: hora ? `Esta bajada ya estaba registrada a las ${hora}. No se repitió.` : "Esta bajada ya estaba registrada. No se repitió.",
      },
    };
  }
  const m = unidadesDe(faltan);
  const quedan = m === 1 ? "Te queda 1 prenda por confirmar." : `Te quedan ${m} prendas por confirmar.`;
  return { tipo: "faltan", lineas: faltan, mensaje: `${mensaje.trim()} ${quedan}` };
}

// ---------------------------------------------------------------------------------------------------------------
// Lo que se lee en pantalla
// ---------------------------------------------------------------------------------------------------------------

/** El banner bajo el campo (o, para una lectura válida, lo que oye el lector de pantalla). Vacío: no dice nada. */
export function textoDeLectura(l: Lectura, sede: string): string {
  switch (l.tipo) {
    case "vacio":
      return "";
    case "desconocido":
      return `No encuentro «${l.codigo}» entre las prendas que hay en ${sede} según el sistema. Escríbelo a mano (es el SKU) o revisa que la prenda esté recibida en Recibir mercadería.`;
    case "suma":
      return `${nombreDePrenda(l.prenda)}, ahora ${l.cantidadAhora}`;
    case "sin_almacen": {
      // Ella tiene la prenda en la mano: el almacén real no está en 0, el sistema está desfasado. Se dice el hecho y el
      // paso siguiente, sin decirle dónde exhibirla.
      const enPiso = l.prenda.piso > 0 ? ` (cuenta ${l.prenda.piso} en el piso)` : "";
      return `${nombreDePrenda(l.prenda)}: el sistema no tiene unidades en el almacén de ${sede}${enPiso}. Si la tienes en la mano, revisa que el fardo esté recibido en Recibir mercadería o avisa al líder.`;
    }
    case "todo_apartado":
      return l.apartadas === 1
        ? `${nombreDePrenda(l.prenda)}: la única unidad del almacén está apartada para una clienta y no se puede mover.`
        : `${nombreDePrenda(l.prenda)}: las ${l.apartadas} unidades del almacén están apartadas para clientas y no se pueden mover.`;
    case "tope":
      return l.disponible === 1
        ? `${nombreDePrenda(l.prenda)}: en el almacén hay 1 y ya la tienes en la lista. No se puede bajar más.`
        : `${nombreDePrenda(l.prenda)}: en el almacén hay ${l.disponible} y ya las tienes todas en la lista. No se puede bajar más.`;
  }
}

/** Si ella escanea con la lista congelada: primero hay que saber qué pasó con la bajada anterior. */
export function textoEscaneoCongelado(boton: string): string {
  return `Primero pulsa «${boton}»: no sabemos si la bajada anterior se guardó.`;
}

/** «12 prendas · 3 modelos» del pie. */
export function textoDeResumen(r: { prendas: number; modelos: number }): string {
  return `${plural(r.prendas, "prenda", "prendas")} · ${plural(r.modelos, "modelo", "modelos")}`;
}

/** El rótulo del botón: «Confirmar bajada · 12 prendas». */
export function textoDeConfirmar(prendas: number): string {
  return `Confirmar bajada · ${plural(prendas, "prenda", "prendas")}`;
}

/** 'HH:mm' en 24 h, hora de Lima (misma cuenta que `diaYHoraLima`). */
export function formatearHoraLima(iso: string): string {
  return Number.isNaN(Date.parse(iso)) ? "--:--" : diaYHoraLima(iso).hora;
}

function tituloDeExito(unidades: number, sede: string): string {
  return unidades === 1 ? `Se bajó 1 prenda al piso de ${sede}` : `Se bajaron ${unidades} prendas al piso de ${sede}`;
}

/**
 * La tarjeta de éxito. `responsable` (opcional) completa el detalle «10:32 · Ana»; si la bajada ya estaba registrada
 * el detalle lo dice, para que ella no la vuelva a hacer.
 */
export function textoDeExito(r: RespuestaBajada, sede: string, responsable?: string | null): { titulo: string; detalle: string } {
  const hora = formatearHoraLima(r.registrada_en);
  const titulo = tituloDeExito(r.unidades, sede);
  if (r.ya_registrada) return { titulo, detalle: `Esta bajada ya estaba registrada a las ${hora}. No se repitió.` };
  return { titulo, detalle: responsable?.trim() ? `${hora} · ${responsable.trim()}` : hora };
}

/** El aviso de la esquina (`avisar.exito`). */
export function avisoDeExito(r: RespuestaBajada, sede: string): { titulo: string; detalle: string } {
  return { titulo: r.unidades === 1 ? "1 prenda bajada al piso" : `${r.unidades} prendas bajadas al piso`, detalle: sede };
}

// ---------------------------------------------------------------------------------------------------------------
// El borrador (localStorage, por tienda)
// ---------------------------------------------------------------------------------------------------------------

export function claveDeBorrador(ubicacionId: string): string {
  return `cayla:bajada:${ubicacionId}:borrador`;
}

export function serializarBorrador(b: BorradorDeBajada): string {
  return JSON.stringify({
    v: b.v,
    token: b.token,
    lineas: b.lineas.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad })),
    creadoEn: b.creadoEn,
    ...(b.enviadoEn ? { enviadoEn: b.enviadoEn } : {}),
  });
}

/**
 * null si el JSON está roto, es de otra versión, el token no es uuid, pasó de 12 h o no queda ninguna línea.
 * NO topa las cantidades: si la bajada sí se guardó y se perdió la respuesta, el almacén ya bajó; con la lista intacta
 * el mismo token responde «ya estaba registrada». Un borrador sin enviar descarta las prendas que ya no están en la
 * tienda; uno ENVIADO las conserva todas, porque la lista tiene que ser la misma que viajó (si no, no calza con lo
 * guardado). Un v1 se lee como sin enviar. Una marca de envío ilegible se toma como enviada a la hora de creación: ante
 * la duda, se comprueba antes de dejar empezar otra.
 */
export function leerBorrador(texto: string | null, ahora: Date, prendas: readonly PrendaBajable[]): BorradorDeBajada | null {
  if (!texto) return null;
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!esObjeto(crudo) || (crudo.v !== 1 && crudo.v !== VERSION_BORRADOR) || !Array.isArray(crudo.lineas)) return null;
  const { token, creadoEn } = crudo;
  if (typeof token !== "string" || !ES_UUID.test(token) || typeof creadoEn !== "string") return null;
  const creado = Date.parse(creadoEn);
  if (Number.isNaN(creado) || ahora.getTime() - creado > HORAS_DE_VIDA_DEL_BORRADOR * MS_HORA) return null;

  const marca = crudo.v === VERSION_BORRADOR ? crudo.enviadoEn : undefined;
  const enviadoEn =
    marca === undefined || marca === null || marca === "" ? undefined : typeof marca === "string" && !Number.isNaN(Date.parse(marca)) ? marca : creadoEn;

  const enTienda = new Set(prendas.map((p) => p.varianteId));
  const vistas = new Set<string>();
  const lineas: LineaBajada[] = [];
  for (const l of crudo.lineas as unknown[]) {
    if (!esObjeto(l) || typeof l.varianteId !== "string" || !esEnteroPositivo(l.cantidad)) continue;
    if ((!enviadoEn && !enTienda.has(l.varianteId)) || vistas.has(l.varianteId)) continue;
    vistas.add(l.varianteId);
    lineas.push({ varianteId: l.varianteId, cantidad: l.cantidad });
  }
  if (!lineas.length) return null;
  return enviadoEn ? { v: VERSION_BORRADOR, token, lineas, creadoEn, enviadoEn } : { v: VERSION_BORRADOR, token, lineas, creadoEn };
}

/** «Dejaste una bajada sin confirmar (12 prendas, 10:32). ¿Sigues con ella o empiezas de nuevo?» */
export function textoDeBorrador(b: BorradorDeBajada): string {
  return `Dejaste una bajada sin confirmar (${plural(unidadesDe(b.lineas), "prenda", "prendas")}, ${formatearHoraLima(b.creadoEn)}). ¿Sigues con ella o empiezas de nuevo?`;
}

/** El borrador que ya se envió y cuya respuesta no llegó: primero se comprueba, después se decide. */
export function textoDeEnvioIncierto(enviadoEn: string): string {
  return `Enviaste esta bajada a las ${formatearHoraLima(enviadoEn)} y no llegó la respuesta. Pulsa «${BOTON_COMPROBAR}»: si ya se guardó, no se repite.`;
}
