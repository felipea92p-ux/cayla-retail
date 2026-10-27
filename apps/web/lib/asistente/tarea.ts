// «Pregúntale a CAYLA» acompaña una TAREA (Felipe 2026-10-27: «Quiero vender un short mom color rojo talla S» tiene que llevarte paso a paso
// hasta el pago y la boleta). Una tarea es una lista corta de pasos en orden, cada uno pegado a una pieza que EXISTE (un paso de una guía
// interactiva con su `data-guia`) y con una orden corta que usa los datos de la persona («Toca el Rojo», «Elige la talla S»).
//
// La persona hace cada clic; CAYLA enciende dónde tocar y pasa sola al siguiente (`components/asistente/Acompanante.tsx`). Nunca hace un
// clic que cambie la tienda: es una venta real, hecha por ella con la guía al lado. Aquí lo puro: revisar lo que propone la IA, sin creerle.

import type { Guia, PasoGuia } from "../guias/tipos";
import { PASO_QUE_GUARDA, PUENTES } from "./puentes";
import { pasoSePuedeRellenar, rellenoValido } from "./relleno";

/** Más pasos ya no es acompañar una tarea: vender de punta a punta, con el cobro y la boleta, cabe en 10. */
export const MAXIMO_DE_PASOS = 10;
/** Una orden se lee de un vistazo: «Elige cómo paga el cliente». Más larga, se corta. */
export const LARGO_MAXIMO_ORDEN = 60;

export type PasoTarea = {
  guiaId: string;
  pasoId: string;
  /** El `data-guia` que se enciende. */
  ancla: string;
  /** La pantalla donde vive (la entrada del menú o la dirección de la guía). */
  href: string;
  /** Lo que la persona tiene que hacer, corto y con sus datos. */
  orden: string;
  /** El porqué, bajo «¿Por qué?»: el texto del paso de la guía, que ya está escrito y vigilado. */
  porQue: string;
  /** Si la persona dio un dato que este paso escribe (el buscador), el dato tal cual. */
  rellenar: string | null;
  /** Un paso que solo existe en el celular (la lupa del buscador, «Ver ticket»): en escritorio no se cuenta ni se muestra. */
  soloCelular?: boolean;
};

/**
 * ¿Este paso es el que guarda o confirma? Lo dice el nombre de su pieza (`data-guia`), que en las guías sigue unas pocas formas:
 * `….guardar`, `….confirmar`, `….enviar`, `….registrar`, `….pagar`, `….anular`, `….terminar` y el pie de una hoja (`….pie`,
 * `….form-pie`, `….costo-pie`). Es una pista para la IA y para cerrar una tarea que quedó a medias, no un permiso: guardar lo hace la persona.
 */
export function pasoGuarda(paso: Pick<PasoGuia, "ancla">): boolean {
  const ultimo = paso.ancla?.split(".").at(-1) ?? "";
  return /^(guardar|confirmar|enviar|registrar|pagar|anular|terminar|listo|pie|form-pie)$|-(guardar|confirmar|enviar|costo-pie)$/.test(ultimo);
}

/** ¿La dirección es esta pantalla? Una pantalla con id en su guía (`/productos/[id]/editar`) vale para cualquier id. */
export function mismaPantalla(href: string, pathname: string): boolean {
  const patron = rutaDe(href).split("/");
  const ruta = rutaDe(pathname).split("/");
  return patron.length === ruta.length && patron.every((s, k) => (s.startsWith("[") && s.endsWith("]") ? ruta[k] !== "" : s === ruta[k]));
}

/** Una pantalla que se abre desde otra (con un id en la dirección): no hay a dónde llevar a la persona, se llega por el paso anterior. */
export const seAbreDesdeOtra = (href: string) => href.includes("[");

/** Lo que la IA propone por paso (salida estructurada; los nombres van como los de los tramos). */
export type PasoPropuesto = { guia_id: string; paso_id: string; orden: string; rellenar: string };

/** Una guía candidata y a dónde se llega a ella (las mismas que vio la IA). */
type Candidata = { guia: Guia; href: string | null };

/** Una orden limpia: una línea, sin comillas de adorno ni punto final, con su mayúscula, a su medida. `null` si no queda nada. */
export function limpiarOrden(orden: string): string | null {
  let o = orden.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim().replace(/^["'«»“”]+|["'«»“”]+$/g, "").replace(/[.。]+$/, "").trim();
  if (o.length < 3) return null;
  if (o.length > LARGO_MAXIMO_ORDEN) o = `${o.slice(0, LARGO_MAXIMO_ORDEN - 1).trimEnd()}…`;
  return o.charAt(0).toLocaleUpperCase("es") + o.slice(1);
}

/**
 * La tarea que se le puede creer: solo pasos de las guías que vio la IA, con un ancla de verdad, sin repetir el mismo paso dos veces
 * seguidas y 10 como mucho. El dato del buscador viaja solo si la persona lo dijo tal cual (`rellenoValido`). Una tarea de menos de dos
 * pasos no es una tarea: para «¿dónde está X?» sigue el recorrido de siempre.
 */
export function revisarTarea(propuestos: readonly PasoPropuesto[] | null | undefined, candidatas: readonly Candidata[], rutaActual: string, pregunta: string): PasoTarea[] {
  const pasos: PasoTarea[] = [];
  for (const p of propuestos ?? []) {
    if (pasos.length >= MAXIMO_DE_PASOS) break;
    const candidata = candidatas.find((c) => c.guia.id === p.guia_id);
    const paso = candidata?.guia.pasos.find((x) => x.id === p.paso_id);
    if (!candidata || !paso || paso.ancla === null) continue;
    const anterior = pasos.at(-1);
    if (anterior && anterior.guiaId === candidata.guia.id && anterior.pasoId === paso.id) continue;
    const orden = limpiarOrden(p.orden) ?? paso.titulo;
    pasos.push({
      guiaId: candidata.guia.id,
      pasoId: paso.id,
      ancla: paso.ancla,
      href: candidata.href ?? rutaActual,
      orden,
      porQue: paso.texto,
      rellenar: pasoSePuedeRellenar(paso) ? rellenoValido(p.rellenar, pregunta) : null,
    });
  }
  const completa = completarTarea(conPuentes(elegirEnLaLista(pasos, candidatas, pregunta), candidatas), candidatas);
  return completa.length >= 2 ? completa : [];
}

/**
 * Cómo TERMINA una tarea en cada guía, para que nunca quede a medio camino (Felipe 2026-10-27: vender va «hasta los métodos de pago y
 * boletas»). La IA a veces corta en el ticket: si la tarea pasa por alguno de los pasos de `desde` y no llega al último del cierre, se le
 * agregan los que faltan, en orden, con su orden de fábrica. Los pasos tienen que existir en la guía (si no, no se agregan).
 */
const CIERRES: Record<string, { desde: readonly string[]; pasos: readonly { pasoId: string; orden: string }[] }> = {
  vender: {
    desde: ["buscador", "resultados", "prenda", "colores", "prenda-tallas", "ticket", "cobrar"],
    pasos: [
      { pasoId: "responsable", orden: "Elige quién está atendiendo" },
      { pasoId: "cobrar", orden: "Toca Cobrar" },
      { pasoId: "cobro-medio", orden: "Elige cómo paga" },
      { pasoId: "cobro-comprobante", orden: "Marca Boleta o Factura" },
      { pasoId: "cobro-confirmar", orden: "Revisa y confirma tú el cobro" },
    ],
  },
};

/** Los pasos de elegir la prenda en su tarjeta o en su hoja (Vender): con el buscador no hacen falta, la lista ya trae cada color y talla. */
const ELEGIR_EN_TARJETA = new Set(["prenda", "colores", "prenda-tallas", "prenda-pie"]);

/**
 * En Vender, si la tarea empieza buscando la prenda, lo que sigue es elegirla EN LA LISTA del buscador: cada fila es un color y una talla
 * y, al tocarla, entra al ticket. Los pasos de la tarjeta o de su hoja de tallas (que la IA a veces elige) no aparecen por ese camino y la
 * guía se quedaría esperando: se cambian por uno solo, «resultados», con la orden de elegir que dio la IA (el color y la talla).
 */
function elegirEnLaLista(tarea: readonly PasoTarea[], candidatas: readonly Candidata[], pregunta: string): PasoTarea[] {
  const vender = candidatas.find((c) => c.guia.id === "vender");
  const iBuscador = tarea.findIndex((p) => p.guiaId === "vender" && p.pasoId === "buscador");
  const resultados = vender?.guia.pasos.find((x) => x.id === "resultados" && x.ancla !== null);
  if (!vender || iBuscador < 0 || !resultados) return [...tarea];
  const deTarjeta = tarea.filter((p) => p.guiaId === "vender" && (ELEGIR_EN_TARJETA.has(p.pasoId) || p.pasoId === "resultados"));
  const orden = ordenDeLaLista(pregunta) ?? (deTarjeta.find((p) => /talla|color/i.test(p.orden)) ?? deTarjeta.at(-1))?.orden ?? "Elige la prenda en la lista";
  const sin = tarea.filter((p) => !(p.guiaId === "vender" && (ELEGIR_EN_TARJETA.has(p.pasoId) || p.pasoId === "resultados")));
  const paso: PasoTarea = { guiaId: "vender", pasoId: resultados.id, ancla: resultados.ancla!, href: tarea[iBuscador]!.href, orden: `${orden} en la lista`.replace(/ en la lista en la lista$/, " en la lista"), porQue: resultados.texto, rellenar: null };
  const j = sin.findIndex((p) => p.guiaId === "vender" && p.pasoId === "buscador");
  // En el celular el ticket vive tras «Ver ticket», en la barra de abajo: se abre antes de elegir quién atiende y cobrar.
  const barra = vender.guia.pasos.find((x) => x.id === "barra-ticket" && x.ancla !== null);
  const yaBarra = sin.some((p) => p.guiaId === "vender" && p.pasoId === "barra-ticket");
  const despues = barra && !yaBarra ? [{ guiaId: "vender", pasoId: barra.id, ancla: barra.ancla!, href: tarea[iBuscador]!.href, orden: "Toca Ver ticket", porQue: barra.texto, rellenar: null, soloCelular: true }] : [];
  // En el celular el buscador está detrás de la lupa (la cámara ocupa su lugar): primero se toca la lupa. En escritorio esa pieza no
  // existe y el acompañante la salta sola.
  const lupa = vender.guia.pasos.find((x) => x.id === "buscar-por-nombre" && x.ancla !== null);
  const yaLupa = sin.some((p) => p.guiaId === "vender" && p.pasoId === "buscar-por-nombre");
  const antes = lupa && !yaLupa ? [{ guiaId: "vender", pasoId: lupa.id, ancla: lupa.ancla!, href: tarea[iBuscador]!.href, orden: "Toca la lupa para buscar", porQue: lupa.texto, rellenar: null, soloCelular: true }] : [];
  return [...sin.slice(0, j), ...antes, ...sin.slice(j, j + 1), paso, ...despues, ...sin.slice(j + 1)];
}

/**
 * «Toca Negro · talla M en la lista», con el color y la talla tal como los escribió la persona («color negro», «talla m», «en rojo»):
 * la IA a veces deja uno afuera. Sin ninguno de los dos, `null` y queda la orden de la IA.
 */
export function ordenDeLaLista(pregunta: string): string | null {
  const t = pregunta.toLocaleLowerCase("es");
  const talla = /\btalla\s+(xxs|xs|s|m|l|xl|xxl|xxxl|\d{1,2})\b/.exec(t)?.[1]?.toUpperCase();
  // «color X» tal cual, o los colores de siempre por su nombre («una blusa negra talla M», «en rojo»). «en X» solo no basta: «en efectivo».
  const color =
    /\bcolor\s+([a-záéíóúñ]{3,}(?:\s+(?:claro|oscuro|palo|denim|perla))?)/.exec(t)?.[1] ??
    /\b(negr[oa]|blanc[oa]|roj[oa]|azul|verde|beige|rosad[oa]|gris|marr[oó]n|celeste|amarill[oa]|morad[oa]|crema|guinda|mostaza|camel|vino|nude|lila|turquesa|naranja|fucsia|plomo)\b/.exec(t)?.[1];
  const conMayuscula = color ? color.charAt(0).toLocaleUpperCase("es") + color.slice(1) : null;
  if (!talla && !conMayuscula) return null;
  return `Toca ${[conMayuscula, talla ? `talla ${talla}` : null].filter(Boolean).join(" · ")} en la lista`;
}

/**
 * Antes del primer paso de una pantalla con id (Editar producto), los pasos de su pantalla madre que la abren («Toca la prenda»,
 * «Toca Editar»), si la IA no los puso y la madre está entre las candidatas (`PUENTES`).
 */
function conPuentes(tarea: readonly PasoTarea[], candidatas: readonly Candidata[]): PasoTarea[] {
  // Los pasos de un puente que la IA puso por su cuenta se sacan y vuelven a entrar en su orden (a veces pone «Editar» antes de «Toca
  // la prenda», y el acompañante se salta uno).
  const delPuente = (p: PasoTarea) => Object.entries(PUENTES).some(([hija, pu]) => tarea.some((t) => t.guiaId === hija) && pu.desde === p.guiaId && pu.pasos.some((x) => x.pasoId === p.pasoId));
  const quitados = tarea.filter(delPuente);
  const salida: PasoTarea[] = [];
  for (const paso of tarea.filter((t) => !delPuente(t))) {
    const puente = PUENTES[paso.guiaId];
    const anterior = salida.at(-1);
    const madre = puente ? candidatas.find((c) => c.guia.id === puente.desde) : undefined;
    if (puente && madre && anterior?.guiaId !== paso.guiaId) {
      for (const p of puente.pasos) {
        const deLaGuia = madre.guia.pasos.find((x) => x.id === p.pasoId && x.ancla !== null);
        if (!deLaGuia || salida.some((s) => s.guiaId === puente.desde && s.pasoId === p.pasoId)) continue;
        // El de la IA solo si trae un dato que escribir (su búsqueda con el nombre de la prenda); si no, la orden de fábrica, más clara.
        const suyo = quitados.find((q) => q.guiaId === puente.desde && q.pasoId === p.pasoId && q.rellenar);
        salida.push(suyo ?? { guiaId: puente.desde, pasoId: deLaGuia.id, ancla: deLaGuia.ancla!, href: madre.href ?? madre.guia.ruta, orden: p.orden, porQue: deLaGuia.texto, rellenar: null });
      }
    }
    salida.push(paso);
  }
  return salida;
}

/** El prefijo de la pieza (`editar` en `editar.guardar`): el de la pantalla, o el de una hoja que se abre en ella (`agregar-color`). */
const prefijo = (ancla: string) => ancla.split(".")[0] ?? "";

/** El prefijo que más usan las piezas de una guía: el de la pantalla misma, no el de sus hojas. */
function prefijoDeLaPantalla(guia: Guia): string {
  const cuenta = new Map<string, number>();
  for (const p of guia.pasos) if (p.ancla) cuenta.set(prefijo(p.ancla), (cuenta.get(prefijo(p.ancla)) ?? 0) + 1);
  return [...cuenta].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

/** Lo que se le suma a la tarea para que llegue a su cierre; y quita «revisa el ticket» si sigue el cobro (no es una acción). */
export function completarTarea(tarea: readonly PasoTarea[], candidatas: readonly Candidata[]): PasoTarea[] {
  const salida = [...tarea];
  for (const [guiaId, cierre] of Object.entries(CIERRES)) {
    const guia = candidatas.find((c) => c.guia.id === guiaId);
    if (!guia || !salida.some((p) => p.guiaId === guiaId && cierre.desde.includes(p.pasoId))) continue;
    const orden = cierre.pasos.map((c) => c.pasoId);
    cierre.pasos.forEach((c, k) => {
      const paso = guia.guia.pasos.find((x) => x.id === c.pasoId && x.ancla !== null);
      if (!paso || salida.some((p) => p.guiaId === guiaId && p.pasoId === c.pasoId)) return;
      // En su lugar: antes del primer paso del cierre que va después de él («quién atiende» antes de Cobrar), o al final.
      const antesDe = salida.findIndex((p) => p.guiaId === guiaId && orden.indexOf(p.pasoId) > k);
      const nuevo = { guiaId, pasoId: paso.id, ancla: paso.ancla!, href: guia.href ?? salida[0]?.href ?? guia.guia.ruta, orden: c.orden, porQue: paso.texto, rellenar: null };
      salida.splice(antesDe < 0 ? salida.length : antesDe, 0, nuevo);
    });
    // Un paso del cierre que la IA puso dos veces (Cobrar antes y después de «quién atiende») queda una sola, la última.
    for (let k = salida.length - 1; k >= 0; k--) {
      const p = salida[k]!;
      if (p.guiaId === guiaId && orden.includes(p.pasoId) && salida.slice(k + 1).some((q) => q.guiaId === guiaId && q.pasoId === p.pasoId)) salida.splice(k, 1);
    }
  }
  // Toda tarea, no solo una venta, termina en el paso que guarda (Felipe 2026-10-27: «en cualquier cosa que pida el usuario»). Si la IA
  // cortó antes, se agrega el primer paso que guarda que viene después del último suyo, en la misma guía.
  const ultimo = salida.at(-1);
  const suGuia = ultimo && !CIERRES[ultimo.guiaId] ? candidatas.find((c) => c.guia.id === ultimo.guiaId) : undefined;
  if (ultimo && suGuia && !pasoGuarda(ultimo)) {
    const desde = suGuia.guia.pasos.findIndex((x) => x.id === ultimo.pasoId);
    const cierre = suGuia.guia.pasos.slice(desde + 1).find((x) => x.ancla !== null && pasoGuarda(x));
    if (cierre) salida.push({ guiaId: ultimo.guiaId, pasoId: cierre.id, ancla: cierre.ancla!, href: ultimo.href, orden: "Revisa y guarda tú", porQue: cierre.texto, rellenar: null });
  } else if (ultimo && suGuia && prefijo(ultimo.ancla) !== prefijoDeLaPantalla(suGuia.guia)) {
    // Guardó una HOJA («Agregar» en Agregar color suma a la tabla) y la pantalla guarda aparte después («Revisar y guardar»): falta ese.
    const desde = suGuia.guia.pasos.findIndex((x) => x.id === ultimo.pasoId);
    const pantalla = prefijoDeLaPantalla(suGuia.guia);
    const cierre = suGuia.guia.pasos.slice(desde + 1).find((x) => x.ancla !== null && pasoGuarda(x) && prefijo(x.ancla) === pantalla);
    if (cierre) salida.push({ guiaId: ultimo.guiaId, pasoId: cierre.id, ancla: cierre.ancla!, href: ultimo.href, orden: "Revisa y guarda tú los cambios", porQue: cierre.texto, rellenar: null });
  }
  // Donde la guía explica el guardado sobre otra pieza, se enciende el botón de verdad (`PASO_QUE_GUARDA`).
  for (const [k, p] of salida.entries()) {
    const cambio = PASO_QUE_GUARDA[p.guiaId];
    const otro = cambio && p.pasoId === cambio.en ? candidatas.find((c) => c.guia.id === p.guiaId)?.guia.pasos.find((x) => x.id === cambio.usar && x.ancla !== null) : undefined;
    if (otro) salida[k] = { ...p, pasoId: otro.id, ancla: otro.ancla!, porQue: otro.texto };
  }
  const conCobro = salida.some((p) => p.pasoId === "cobrar");
  return salida.filter((p) => !(conCobro && p.guiaId === "vender" && p.pasoId === "ticket")).slice(0, MAXIMO_DE_PASOS);
}

/** La dirección sin consulta ni grupos: para saber si la persona ya está en la pantalla del paso. */
export function rutaDe(href: string): string {
  return (href.split(/[?#]/)[0] ?? href).replace(/\/\([^)]+\)/g, "") || "/";
}
