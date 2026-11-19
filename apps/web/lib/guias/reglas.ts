// Guías interactivas (ADR-0389): las reglas puras que usa el motor. Sin React ni DOM: se prueban en `reglas.test.ts`.

import type { AccionGuia, Guia, PasoGuia, PiezaATocar } from "./tipos";

/** Sin tildes ni mayúsculas, espacios colapsados: «CONFIRMAR  cobro» y «Confirmar cobro» son lo mismo. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Verbos de una pieza que ESCRIBE en la base, mueve dinero o stock, o saca algo de la pantalla. La demo corre en la tienda de
 * verdad (producción): si el piloto tocara uno, la venta, el apartado o el cierre serían reales. Lista a propósito ancha:
 * «Agregar» al ticket no llega a la base, pero sí a los tickets en espera del aparato, y «Quitar» en otra pantalla borra de
 * verdad. Mejor una demo que explica un botón sin tocarlo que una que se equivoca una vez.
 */
const VERBOS_QUE_ESCRIBEN = [
  "guardar", "cobrar", "confirmar", "registrar", "eliminar", "borrar", "quitar", "anular", "emitir", "enviar", "pagar",
  "aprobar", "rechazar", "aceptar", "transferir", "imprimir", "abrir caja", "cerrar caja", "apartar", "liberar", "descartar",
  "subir", "recibir", "despachar", "crear", "agregar", "anadir", "dejar en espera", "soltar", "aplicar", "cerrar el conteo",
  "marcar", "suspender", "reactivar", "devolver", "cambiar", "canjear", "entregar", "retirar", "reponer", "bajar", "ajustar",
  "programar", "pasar a borrador", "descargar", "compartir", "whatsapp", "llamar", "salir", "cerrar sesion", "anotar", "corregir", "pedir", "avisar", "unir",
  "archivar", "desactivar", "activar", "asignar", "dar acceso", "revertir", "reintentar", "conciliar", "transmitir", "cargar",
] as const;

/**
 * ¿Por qué el piloto NO debe tocar esta pieza? `null` si se puede tocar. Es la regla «nunca guardar» (Felipe, 2026-10-07):
 * la guía abre, escribe un ejemplo y elige; el último paso que guarda lo EXPLICA, no lo ejecuta.
 */
export function motivoParaNoTocar(p: PiezaATocar): string | null {
  const tipo = p.tipo?.toLowerCase() ?? null;
  if (tipo === "submit") return "envía un formulario";
  // Una pestaña cambia de vista y nada más, se llame como se llame («Apartar», «Entregar»). Un enlace-pestaña a otra ruta
  // sigue la regla de los enlaces, más abajo.
  if (p.rol === "tab" && !p.href) return null;
  // Abre una ventana o un menú (`aria-haspopup`): no guarda; lo que guarda es el botón de adentro, que sigue la regla.
  if (p.abreVentana && !p.href) return null;
  if (p.etiqueta === "button" && p.enFormulario && (tipo === null || tipo === "")) return "envía un formulario (botón sin type dentro de un form)";
  if (p.etiqueta === "input" && (tipo === "submit" || tipo === "file" || tipo === "image")) return "envía o sube algo";
  if (p.href) {
    const destino = p.href.split(/[?#]/)[0] ?? "";
    if (/^(https?:|mailto:|tel:|whatsapp:)/i.test(p.href)) return "sale del ERP";
    if (destino && destino !== p.rutaActual) return "lleva a otra pantalla";
  }
  // Un pliegue (`aria-expanded`) muestra u oculta lo que ya está en la pantalla: se toca aunque diga «Ver y cambiar». Va DESPUÉS de
  // las reglas de envío y de los enlaces, así que un submit o un enlace a otra pantalla con `aria-expanded` sigue prohibido.
  if (p.esPliegue) return null;
  const texto = normalizar(p.texto);
  for (const verbo of VERBOS_QUE_ESCRIBEN) {
    if (new RegExp(`(^|[^a-z])${verbo}([^a-z]|$)`).test(texto)) return `es un botón que hace algo («${verbo}»)`;
  }
  return null;
}

/**
 * Un toque «para abrir» o «para cerrar» un pliegue (`AccionGuia` con `para`): ¿se toca? `expandido` es el `aria-expanded` del control
 * tal como lo trae el DOM («true», «false» o null). El mismo toque abre y cierra, así que tocar a ciegas alterna: al volver con ← un
 * paso reabría lo que el siguiente había cerrado. Mirando el estado, correrlo dos veces deja lo mismo que correrlo una.
 * «no-es-pliegue»: el control no dice si está abierto, y tocarlo sería volver a tocar a ciegas.
 */
export function toqueDelPliegue(para: "abrir" | "cerrar" | "marcar" | "desmarcar", expandido: string | null): "tocar" | "ya-esta" | "no-es-pliegue" {
  if (expandido !== "true" && expandido !== "false") return "no-es-pliegue";
  // Una casilla es lo mismo con otras palabras: «marcar» la quiere marcada («true»), «desmarcar», sin marcar.
  const quiere = para === "abrir" || para === "marcar";
  return quiere === (expandido === "true") ? "ya-esta" : "tocar";
}

/** ¿Esta ruta del registro («/compras/proveedores/[id]») describe esta URL («/compras/proveedores/9f…»)? */
export function rutaCoincide(patron: string, pathname: string): boolean {
  const limpio = (r: string) => (r.length > 1 ? r.replace(/\/+$/, "") : r);
  // Los grupos de Next («(billetera)») no aparecen en la URL.
  const a = limpio(patron).split("/").filter((s) => !/^\(.*\)$/.test(s));
  const b = limpio(pathname).split("/");
  if (a.length !== b.length) return false;
  return a.every((seg, i) => (/^\[.+\]$/.test(seg) ? (b[i] ?? "") !== "" : seg === b[i]));
}

/** La guía de la pantalla abierta, o null. Una ruta exacta gana a una con `[id]`. */
export function guiaDeRuta<G extends Pick<Guia, "ruta">>(pathname: string, guias: readonly G[]): G | null {
  const exacta = guias.find((g) => !g.ruta.includes("[") && rutaCoincide(g.ruta, pathname));
  return exacta ?? guias.find((g) => rutaCoincide(g.ruta, pathname)) ?? null;
}

export const ANCHO_ESCRITORIO = 1024;

/** ¿El paso tiene sentido ahora? (rol, estado de la pantalla y ancho). `presentes` = anclas que hay en el DOM. */
export function pasoAplica(paso: PasoGuia, presentes: ReadonlySet<string>, anchoVentana: number): boolean {
  if (paso.solo === "escritorio" && anchoVentana < ANCHO_ESCRITORIO) return false;
  if (paso.solo === "celular" && anchoVentana >= ANCHO_ESCRITORIO) return false;
  if (paso.requiere?.some((a) => !presentes.has(a))) return false;
  if (paso.excluye?.some((a) => presentes.has(a))) return false;
  return true;
}

/**
 * ¿Se le ofrece la guía al entrar? Una vez por persona y por pantalla (Felipe, 2026-10-07): si ya se le ofreció (la vio, la
 * saltó o dijo «ahora no»), nunca más sola; para repetirla está «Demo» en su perfil.
 *
 * Y solo en las pantallas que son una ENTRADA DEL MENÚ de esa persona (Felipe, 2026-10-09: 79 ofertas por persona cansan). Una
 * pantalla interna (una factura, editar un producto, un conteo) no se ofrece sola: su demo está en «Demo ▸ Esta pantalla».
 */
export function debeOfrecer({ guiaId, vistas, leidas, entradaDelMenu = true }: { guiaId: string; vistas: ReadonlySet<string>; leidas: boolean; entradaDelMenu?: boolean }): boolean {
  // Sin saber todavía qué vio (la lectura no llegó), no se ofrece: mejor tarde que dos veces.
  if (!leidas || !entradaDelMenu) return false;
  return !vistas.has(guiaId);
}

/** ¿La URL abierta es EXACTAMENTE una entrada del menú de esta persona? (`/compras` sí; `/compras/nueva` y `/compras/factura/9f` no). */
export function esEntradaDelMenu(pathname: string, entradas: readonly string[]): boolean {
  const limpio = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return entradas.some((e) => (e.length > 1 ? e.replace(/\/+$/, "") : e) === limpio);
}

export type Caja = { top: number; left: number; width: number; height: number };
export type Ventana = { ancho: number; alto: number };

/** El recorte del velo: la pieza con aire alrededor, sin salirse de la ventana. */
export function recorteDe(pieza: Caja, ventana: Ventana, margen = 8): Caja {
  const top = Math.max(4, pieza.top - margen);
  const left = Math.max(4, pieza.left - margen);
  const bottom = Math.min(ventana.alto - 4, pieza.top + pieza.height + margen);
  const right = Math.min(ventana.ancho - 4, pieza.left + pieza.width + margen);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** El velo: toda la ventana, menos un rectángulo redondeado (el agujero) por donde se ve la pieza. Sin agujero, el velo entero. */
export function caminoDelVelo(v: Ventana, a: Caja): string {
  const fuera = `M0 0H${v.ancho}V${v.alto}H0Z`;
  if (a.width < 1 || a.height < 1) return fuera;
  const r = Math.min(14, a.width / 2, a.height / 2);
  const { left: x, top: y, width: w, height: h } = a;
  return `${fuera}M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

export type LadoTarjeta = "abajo" | "arriba" | "derecha" | "izquierda" | "centro";

/**
 * Dónde va la tarjeta: abajo de la pieza si cabe; si no, arriba, a la derecha o a la izquierda; si la pieza ocupa casi toda
 * la pantalla, encima y al centro-abajo. En celular (< 640 px) siempre pegada abajo o arriba, a lo ancho.
 */
export function posicionTarjeta(recorte: Caja | null, ventana: Ventana, tarjeta: { ancho: number; alto: number }, aire = 14): { top: number; left: number; lado: LadoTarjeta } {
  const borde = 16;
  const ancho = Math.min(tarjeta.ancho, ventana.ancho - borde * 2);
  const centradoX = (x: number) => Math.min(Math.max(borde, x - ancho / 2), ventana.ancho - ancho - borde);
  if (!recorte) return { top: Math.max(borde, (ventana.alto - tarjeta.alto) / 2), left: (ventana.ancho - ancho) / 2, lado: "centro" };

  const abajo = recorte.top + recorte.height + aire;
  const arriba = recorte.top - aire - tarjeta.alto;
  const medioX = recorte.left + recorte.width / 2;
  if (abajo + tarjeta.alto <= ventana.alto - borde) return { top: abajo, left: centradoX(medioX), lado: "abajo" };
  if (arriba >= borde) return { top: arriba, left: centradoX(medioX), lado: "arriba" };

  if (ventana.ancho >= 640) {
    const altoY = Math.min(Math.max(borde, recorte.top), ventana.alto - tarjeta.alto - borde);
    const derecha = recorte.left + recorte.width + aire;
    if (derecha + ancho <= ventana.ancho - borde) return { top: altoY, left: derecha, lado: "derecha" };
    const izquierda = recorte.left - aire - ancho;
    if (izquierda >= borde) return { top: altoY, left: izquierda, lado: "izquierda" };
  }
  // La pieza llena la pantalla (un modal grande, el catálogo): la tarjeta va abajo, encima de la pieza.
  return { top: Math.max(borde, ventana.alto - tarjeta.alto - borde), left: centradoX(ventana.ancho / 2), lado: "centro" };
}

/** Cerrar un pliegue o desmarcar una casilla solo oculta: no hace aparecer ninguna pieza, ni hay que esperarla. */
const soloCierra = (a: AccionGuia) => a.tipo === "clic" && (a.para === "cerrar" || a.para === "desmarcar");
const puedeAbrir = (acciones: readonly AccionGuia[] | undefined) => !!acciones?.some((a) => !soloCierra(a));

/** Lo que un paso le hace a la pantalla, en orden: su `preparar` y, ya encendida la pieza, su `demostrar`. */
export function accionesDelPaso(p: PasoGuia): readonly AccionGuia[] {
  return [...(p.preparar ?? []), ...(p.demostrar ?? [])];
}

/** ¿Esta acción deja algo a la vista para los pasos que siguen? Un toque que no es un cierre (también uno «si está») o un ejemplo escrito. */
const dejaAlgo = (a: AccionGuia): a is Extract<AccionGuia, { tipo: "clic" | "escribir" }> => (a.tipo === "clic" && !soloCierra(a)) || a.tipo === "escribir";

/**
 * Lo que el motor vio al AVANZAR por cada paso (por su índice), para saber al volver qué sigue abierto de lo que hizo cada uno. Sin esto
 * (una prueba, un paso que nunca se recorrió hacia adelante) la regla supone que todo lo hecho sigue abierto.
 *  · `hojas`: cuántas hojas había abiertas al empezar el paso, antes de su `preparar`.
 *  · `hizo`: si lo que deja algo de su `preparar` o su `demostrar` salió bien. Es falso solo si el toque o el ejemplo no se pudo hacer (la
 *    pieza no apareció, o el piloto se negó): un «si está» sin su pieza, o un pliegue que ya estaba abierto, salen bien sin tocar nada.
 */
export type MemoriaDeIda = { hojas?: readonly (number | undefined)[]; hizo?: readonly (boolean | undefined)[] };

/**
 * Al volver con ←, de qué paso sale lo que deja a la vista al paso `indice`: el último de antes que dejó algo que sigue abierto (abrió la
 * hoja donde vive, eligió su pestaña, escribió la búsqueda que muestra). Al volver, el motor cierra las hojas que la guía abrió después, y
 * un paso de adentro que no la abre él mismo se saltaba: la guía caía varios pasos más atrás (Editar producto: «Sumarlos a la ficha» →
 * «Llegó un color o una talla nueva»). El motor repite lo de ese paso solo si al paso le falta su pieza, y si lo que ese paso toca tampoco
 * está (la ficha de Existencias se abre desde el menú «Más»), sigue hacia atrás desde ahí. `null` si no hay ninguno.
 *
 * Qué cuenta como «dejó algo» (ADR-0389, act. 2026-11-18 d):
 *  · Su `preparar` Y su `demostrar`: la guía cuenta una historia —«mira, la abrimos» y el paso siguiente explica lo de adentro—, y lo que
 *    abrió un `demostrar` es tan parte de la pantalla como lo que abrió un `preparar` (Configuración: «Una tasa nueva» abre la hoja de
 *    «Desde cuándo y cuánto»; Vender: «Escanea o busca» escribe lo que «Lo que encontró» muestra).
 *  · No un paso que solo cierra (Escape, `para: "cerrar"`) o vacía un buscador: no deja nada, y la cadena se cortaba en él (Productos,
 *    Configuración, Devoluciones). Tampoco lo que un paso de después deshizo: un ejemplo que se vació, un pliegue que se cerró.
 *  · No lo que se cerró antes de `indice` (`memoria.hojas`): si entre ese paso y `indice` hubo menos hojas abiertas que las que dejó, lo que
 *    abrió ya no está (un Escape lo cerró). Contar escapes en el texto de la guía no alcanza: un Escape sin hoja abierta no cierra nada
 *    (Devoluciones pide dos seguidos con una sola hoja), y una pestaña no se cierra con Escape.
 *  · No un paso cuyo toque no se pudo hacer al avanzar (`memoria.hizo`): repetirlo solo esperaría una pieza que no aparece.
 * Un paso de otro ancho (`solo`) no cuenta: sus toques son de otra pantalla. Repetir lo de un paso no desarma nada porque todo se puede
 * repetir: abre una hoja que el motor ya cerró, elige una pestaña, escribe lo mismo, o toca un pliegue o una casilla mirando su estado.
 */
export function fuenteAlVolver(pasos: readonly PasoGuia[], indice: number, anchoVentana: number, memoria: MemoriaDeIda = {}): number | null {
  const hojas = memoria.hojas ?? [];
  const vaciados = new Set<string>();
  const cerrados = new Set<string>();
  // Hojas al empezar el paso que corrió después del que se mira (las que ese dejó), y las menos que hubo desde ahí hasta `indice`.
  let despues = hojas[indice];
  let minimo = despues ?? Number.POSITIVE_INFINITY;
  for (let j = indice - 1; j >= 0; j--) {
    const p = pasos[j]!;
    if (p.solo && !pasoAplica({ ...p, requiere: undefined, excluye: undefined }, new Set(), anchoVentana)) continue;
    // De atrás hacia adelante: lo que un paso posterior deshizo (vaciar, cerrar) anula lo que este dejó en esa misma pieza.
    let dejo = false;
    for (const a of [...accionesDelPaso(p)].reverse()) {
      if (a.tipo === "vaciar") vaciados.add(a.ancla);
      else if (a.tipo === "clic" && soloCierra(a)) cerrados.add(a.ancla);
      else if (a.tipo === "escribir") dejo ||= !vaciados.has(a.ancla);
      else if (a.tipo === "clic") dejo ||= !(a.para && cerrados.has(a.ancla));
    }
    const sigueAbierto = despues === undefined || minimo >= despues;
    if (dejo && sigueAbierto && memoria.hizo?.[j] !== false) return j;
    const h = hojas[j];
    if (h !== undefined) {
      despues = h;
      minimo = Math.min(minimo, h);
    }
  }
  return null;
}

/**
 * Las piezas que tienen que estar a la vista para repetir lo que hizo un paso: las de cada acción que deja algo (un toque, también uno
 * «si está», o el campo donde escribe). Si falta una, lo que la contiene se cerró y el motor reabre primero lo de antes, hacia atrás. Todas,
 * no solo la primera: «Ritmo, productos, equipo, stock» de Inicio toca el período (que siempre está) y después la pestaña de la tienda que
 * se acercó en un paso anterior.
 */
export function piezasParaRepetir(p: PasoGuia): string[] {
  return accionesDelPaso(p).filter(dejaAlgo).map((a) => a.ancla);
}

/**
 * Lo que deshicieron los pasos que hay entre la fuente y el paso que se rehace (`desde` < j < `hasta`): vaciar un buscador, cerrar un
 * pliegue, desmarcar una casilla. Al rehacer, el motor repite lo de la fuente entero, y sin esto quedaba puesto lo que un paso de entre medio
 * ya había quitado: Colaboradores repetía la búsqueda de «Buscar a alguien», que «El equipo, por sede» había vaciado, y «La ficha de una
 * persona» no encontraba su fila. Un paso de otro ancho no cuenta. Los Escape no van: lo que cerraron ya lo descartó `fuenteAlVolver`.
 */
export function limpiezasEntre(pasos: readonly PasoGuia[], desde: number, hasta: number, anchoVentana: number): AccionGuia[] {
  return pasos
    .slice(desde + 1, hasta)
    .filter((p) => !p.solo || pasoAplica({ ...p, requiere: undefined, excluye: undefined }, new Set(), anchoVentana))
    .flatMap((p) => accionesDelPaso(p).filter((a) => a.tipo === "vaciar" || soloCierra(a)));
}

/**
 * ¿Tocar este enlace cambia la URL dentro del ERP? El destino («/productos/atributos?tab=tejidos»), o `null` si no navega (otro origen,
 * la misma URL, sin `href`). Una pestaña con `href` rehace la pantalla al terminar de navegar: el toque que venía detrás tocaba la pantalla
 * vieja y la hoja que abría se cerraba sola (Atributos: «Su foto o su dibujo»). El piloto espera a que la URL sea esta antes de seguir.
 */
export function destinoDeNavegacion(href: string | null, actual: { origin: string; pathname: string; search: string }): string | null {
  if (!href || href.startsWith("#")) return null;
  let url: URL;
  try {
    url = new URL(href, `${actual.origin}${actual.pathname}${actual.search}`);
  } catch {
    return null;
  }
  if (url.origin !== actual.origin) return null;
  const destino = `${url.pathname}${url.search}`;
  return destino === `${actual.pathname}${actual.search}` ? null : destino;
}

/** El toque de un `preparar` que abre algo (una hoja, una pestaña, un menú): el primero que no es un cierre ni un «si está». */
export function toqueQueAbre(acciones: readonly AccionGuia[]): Extract<AccionGuia, { tipo: "clic" }> | null {
  for (const a of acciones) if (a.tipo === "clic" && !a.siEsta && !soloCierra(a)) return a;
  return null;
}

/**
 * Lo que se cierra al volver con ← del paso `desde` al paso `hasta` (el último que se mostró antes). «Atrás» salta directo a ese paso,
 * y los de entre medio —los que al avanzar se saltaron porque su pieza no estaba (un opcional, otro ancho)— no corren su `preparar`.
 * Pero sus cierres (`para: "cerrar"`) hacen falta: el paso de antes de un pliegue es el que lo cierra, y si ese paso no se mostró
 * (Rendimiento sin meta: «¿Cuadran las metas?» se salta), «Cambios de meta» quedaba abierto sobre los pasos de atrás. Un cierre solo
 * esconde y es idempotente, así que correrlo de más no desarma nada; lo que el paso de destino necesita abierto lo pide su `preparar`.
 */
export function cierresAlVolver(pasos: readonly PasoGuia[], desde: number, hasta: number): AccionGuia[] {
  return pasos.slice(hasta + 1, desde).flatMap((p) => (p.preparar ?? []).filter(soloCierra));
}

/**
 * ¿Hay que esperar a que la pieza aparezca? Solo si algo la acaba de abrir: el propio paso la prepara, o el paso anterior
 * hizo algo con la pantalla (abrir un modal, escribir). Si no, la pieza está o no está, y esperar es tiempo muerto.
 */
export function esperaPorAncla(paso: PasoGuia, anterior: PasoGuia | null): number {
  const algoLaAbre = puedeAbrir(paso.preparar) || puedeAbrir(anterior?.demostrar) || puedeAbrir(anterior?.preparar);
  if (algoLaAbre) return paso.opcional ? 1400 : 2200;
  return paso.opcional ? 120 : 900;
}

/**
 * Cuántos pasos va a tener la demo, para el «3 de 12»: los que aplican y cuya pieza está a la vista, más los que dependen
 * de algo que la guía abre antes (no se ven todavía, pero van a aparecer). Un opcional sin pieza cuenta solo si antes la
 * guía cambia de vista con un toque (abre una pestaña o un modal): lo que no está ahora puede estar después.
 */
export function totalEstimado(pasos: readonly PasoGuia[], presentes: ReadonlySet<string>, anchoVentana: number): number {
  let n = 0;
  let cambiaDeVista = false;
  pasos.forEach((p, i) => {
    if (p.preparar?.some((a) => a.tipo === "clic" && !soloCierra(a))) cambiaDeVista = true;
    if (pasoAplica(p, presentes, anchoVentana)) {
      const anterior = i > 0 ? pasos[i - 1]! : null;
      if (!p.opcional || p.ancla === null || presentes.has(p.ancla) || cambiaDeVista || esperaPorAncla(p, anterior) > 1000) n++;
    }
    if (p.demostrar?.some((a) => a.tipo === "clic")) cambiaDeVista = true;
  });
  return n;
}
