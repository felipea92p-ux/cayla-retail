/* ====================================================================
   «Para hoy» de Existencias (rediseño del 2026-10-04, decisión de Felipe en la ronda 2: la portada es el buscador, «Para
   hoy» y el catálogo de prendas).

   El problema que reemplaza: cuatro tarjetas fijas («Resumen disponible», «Colgar en el piso hoy», «En camino hacia acá»,
   «Incidencias») que se dibujaban siempre, aunque dijeran 0, y que ocupaban la primera pantalla sin decir por dónde empezar.
   Aquí cada cosa pendiente de la sede es una TAREA con su cifra y su frase, en el orden en que conviene hacerlas; lo que está en
   0 no aparece. La pantalla muestra las tres primeras y deja ver el resto a un toque.

   No decide reglas nuevas: «por colgar» y «sin stock atrás» son los mismos casos de «Hoy» (`lib/existencias-hoy.ts`), las
   ventas sin registrar son la cola `prendas_por_regularizar` (plazo de 2 días de ADR-0179; su lista vive en Existencias, ADR-0330) y lo demás son las colas
   que Existencias ya leía (dañadas, apartados, traslados).
   Dos reglas de `/rigor` (2026-10-04):
   - el rojo es un presupuesto (`MAX_ROJO_POR_PANTALLA`, 2): solo los plazos vencidos van en rojo, y si hay más de dos, los
     siguientes bajan a ámbar. Con un rojo por fila, el que importa deja de verse.
   - la cola que no responde se DICE («no se pudo leer»), no se calla: una tarea que desaparece cuando la base falla se lee
     igual que «no hay ninguna».
   Lo mismo vale para el motor del piso (ADR-0328 act. 7, integración de la ola 1): con el piso SIN CUADRAR —como está toda tienda
   el día que se pega el motor— no hay «por colgar» (cada talla que lo sería queda «En pausa»), y si su lectura falla tampoco.
   Sin una fila propia, las dos cosas se leían «Todo al día. No hay nada pendiente en el piso», justo el falso «al día» que la
   tarjeta «Colgar en el piso hoy» ya había corregido antes de que el rediseño la retirara.
   ==================================================================== */

import { MAX_ROJO_POR_PANTALLA } from "@cayla-retail/shared";
import { contarEnPausa, hoyDeTalla, TEXTO_HOY } from "./existencias-hoy";
import { agruparPorPrenda, ordenarPorListaDelDia, type FilaPrenda, type PrendaAgrupada } from "./existencias-prendas";

export type TipoTareaHoy =
  | "por_colgar"
  | "piso_en_pausa"
  | "piso_sin_calcular"
  | "sin_registrar"
  | "danadas"
  | "apartados_vencidos"
  | "traslados_atrasados"
  | "en_camino"
  | "sin_stock_atras";

/** El tono de la tarea: ámbar = hay algo que hacer aquí, rojo = ya se pasó un plazo, pizarra = informativo (llega o se pide afuera). */
export type TonoTareaHoy = "ambar" | "rojo" | "pizarra";

export type TareaHoy = {
  tipo: TipoTareaHoy;
  /** `null`: no se pudo contar (la cola no respondió); la fila lo dice sin número. */
  cifra: number | null;
  /** Lo que sigue a la cifra: «tallas por colgar». */
  texto: string;
  /** Una línea que dice por qué importa o por dónde empezar. */
  detalle: string;
  tono: TonoTareaHoy;
};

export type EntradaParaHoy = {
  /** La sede separa piso y almacén (una tienda). En el Taller no hay «por colgar». */
  separa: boolean;
  porColgar: { tallas: number; unidades: number; prendas: readonly string[] };
  /** El motor del piso: cuántas tallas esperan el cuadre del piso («En pausa») y si su lectura no respondió (`fallo`). */
  piso: { enPausa: number; fallo: boolean };
  /** Tallas «sin stock atrás» que tampoco vienen en camino (lo que viene en camino no se pide de nuevo). */
  sinStockAtras: { tallas: number };
  /** `null`: la sede no es una tienda (las ventas sin registrar nacen en Vender) y no se dibuja. `"fallo"`: la cola no respondió y se dice. */
  sinRegistrar: { pendientes: number; vencidas: number } | "fallo" | null;
  danadas: number;
  /** Quien mira puede decidir qué se hace con las dañadas (un líder, en su sede). Si no, la fila solo informa. */
  resuelveDanadas: boolean;
  apartados: { vencidos: number };
  enCamino: { traslados: number; atrasados: number; proximaLlegada: string | null };
};

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Lo «por colgar» de TODA la sede (no lo filtrado), con la decisión del motor del piso que trae cada talla (`hoyDeTalla`). */
export type PorColgarDeSede<F extends FilaPrenda> = {
  /** Cuántas tallas (variantes) están «Por colgar»: el motor pide una colgada, no queda ninguna y en el almacén hay. */
  tallas: number;
  /** Lo libre en el almacén de esas tallas: lo que se podría colgar hoy. */
  unidades: number;
  /** Cuántas tallas serían «por colgar» pero esperan el cuadre del piso («En pausa», ADR-0328 decisión 5). Con el piso sin
   *  cuadrar `tallas` es 0 y esta es la cifra que «Para hoy» y el Inicio dicen en su lugar: nunca un «al día» falso. */
  enPausa: number;
  /** Esas tallas, en el orden de la sede (lo que se manda a «Colgar en el piso»). */
  filas: F[];
  /** Agrupadas por prenda (modelo + color), en el orden de la lista del día del motor: lo vendido ayer primero. */
  prendas: PrendaAgrupada<F>[];
};

/** La ÚNICA cuenta de «por colgar» de una sede: de aquí salen la fila de «Para hoy» en Existencias, la cifra que suma el filtro
 *  «Hoy ▸ Por colgar» y el aviso y el bloque del Inicio de Almacén. Hasta el 2026-10-04 el Inicio contaba por su lado (modelos con
 *  alguna talla que pedía reponer, agotadas incluidas) y su número no coincidía con el de Existencias: con una sola función, no
 *  pueden discrepar (ADR-0331 act. b).
 *
 *  QUÉ es «por colgar» no se decide aquí: lo decide el motor del piso (`lib/piso-plan.ts`, ADR-0328 act. 7) y cada talla trae su
 *  decisión en `planPiso`. El motor también da el ORDEN (`listaDelDia`: lo vendido ayer primero); sin lista (el motor no respondió,
 *  o el piso está en pausa) las prendas quedan en el orden en que llegaron. Se pide siempre, para que ninguna pantalla vuelva a
 *  ordenar por su cuenta. */
export function porColgarDeLaSede<F extends FilaPrenda>(stock: readonly F[], listaDelDia: readonly string[]): PorColgarDeSede<F> {
  const filas = stock.filter((f) => hoyDeTalla(f) === "por_colgar");
  return {
    tallas: filas.length,
    unidades: filas.reduce((s, f) => s + (f.almacenDisponible ?? 0), 0),
    enPausa: contarEnPausa(stock),
    filas,
    prendas: ordenarPorListaDelDia(agruparPorPrenda(filas), listaDelDia),
  };
}

/** Lo que la fila «por colgar» de «Para hoy» lee de esa cuenta: las cifras y los nombres con los que empezar. */
export function entradaPorColgar(p: PorColgarDeSede<FilaPrenda>): EntradaParaHoy["porColgar"] {
  return { tallas: p.tallas, unidades: p.unidades, prendas: p.prendas.map((x) => x.referencia) };
}

/** «Pantalón Carla, Blusa Emma y 3 más»: los nombres con los que empezar, sin alargar la línea. */
export function nombresConResto(nombres: readonly string[], mostrar = 2): string {
  const unicos = [...new Set(nombres)];
  if (unicos.length === 0) return "";
  const vistos = unicos.slice(0, mostrar);
  const resto = unicos.length - vistos.length;
  if (resto === 0) return vistos.length === 1 ? vistos[0] : `${vistos.slice(0, -1).join(", ")} y ${vistos.at(-1)}`;
  return `${vistos.join(", ")} y ${resto} más`;
}

/** «el próximo llega el lun 6 a las 10:30», en hora de Lima. */
export function textoLlegada(iso: string): string {
  const fecha = new Date(iso);
  const dia = fecha.toLocaleDateString("es-PE", { weekday: "short", day: "numeric", timeZone: "America/Lima" });
  const hora = fecha.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });
  return `el próximo llega el ${dia.replace(".", "")} a las ${hora}`;
}

/** Todas las tareas pendientes de la sede, en el orden en que conviene hacerlas. Lo que está en 0 no entra.
 *  Orden: primero lo que hace vender hoy (colgar), después lo que deja el stock en verdad (ventas sin registrar), después las
 *  colas con una decisión pendiente (dañadas, apartados vencidos), lo que viene en camino y, al final, lo que se resuelve fuera
 *  de la tienda (pedir lo que no tiene nada atrás). */
export function tareasParaHoy(e: EntradaParaHoy): TareaHoy[] {
  const tareas: TareaHoy[] = [];

  if (e.separa && e.porColgar.tallas > 0) {
    const empezar = nombresConResto(e.porColgar.prendas);
    tareas.push({
      tipo: "por_colgar",
      cifra: e.porColgar.tallas,
      texto: plural(e.porColgar.tallas, "talla por colgar", "tallas por colgar"),
      // La segunda frase es la honestidad del número: si la prenda ya cuelga y el sistema la cree guardada (una bajada que no se
      // registró, o la carga inicial que entró al almacén), lo que toca es registrarla, no volver a colgarla.
      detalle: `${e.porColgar.unidades} ${plural(e.porColgar.unidades, "guardada", "guardadas")} y ninguna colgada${empezar ? `: empieza por ${empezar}` : ""}. ¿Ya cuelgan? Regístralas al colgarlas.`,
      tono: "ambar",
    });
  }

  // En el lugar de «por colgar», porque es lo que lo reemplaza: sin plan no se sabe qué colgar, y en pausa no se manda a colgar.
  if (e.separa && e.piso.fallo) {
    tareas.push({
      tipo: "piso_sin_calcular",
      cifra: null,
      texto: "No se pudo calcular qué colgar hoy",
      detalle: "La columna «Hoy» dice N/D hasta que responda. Si ves una talla sin nada colgado, cuélgala igual en el piso.",
      tono: "pizarra",
    });
  } else if (e.separa && e.piso.enPausa > 0) {
    tareas.push({
      tipo: "piso_en_pausa",
      cifra: e.piso.enPausa,
      texto: plural(e.piso.enPausa, "talla espera el cuadre del piso", "tallas esperan el cuadre del piso"),
      // La misma razón del aviso de la tabla (`avisoPausaDelPiso`): sin cuadre, «colgar» podría pedir lo que ya cuelga.
      detalle: "Hasta cuadrarlo, «Hoy» no manda a colgar nada: podría pedir colgar lo que ya cuelga. Se cuadra una vez, escaneando lo guardado.",
      tono: "ambar",
    });
  }

  if (e.sinRegistrar === "fallo") {
    tareas.push({
      tipo: "sin_registrar",
      cifra: null,
      texto: "No se pudo leer las ventas sin registrar",
      // Sin nombrar otra pantalla: el botón de la fila ya lleva a la lista (ADR-0330, en Existencias).
      detalle: "Ábrelas para ver cuántas esperan su prenda.",
      tono: "pizarra",
    });
  } else if (e.sinRegistrar && e.sinRegistrar.pendientes > 0) {
    const { pendientes, vencidas } = e.sinRegistrar;
    tareas.push({
      tipo: "sin_registrar",
      cifra: pendientes,
      texto: plural(pendientes, "venta sin registrar", "ventas sin registrar"),
      detalle:
        vencidas > 0
          ? `${vencidas} ${plural(vencidas, "lleva", "llevan")} más de 2 días esperando su prenda: hasta unirlas, el stock cuenta prendas que ya se vendieron.`
          : "Cada una espera que se le asigne su prenda para descontarla del stock.",
      tono: vencidas > 0 ? "rojo" : "ambar",
    });
  }

  if (e.danadas > 0) {
    tareas.push({
      tipo: "danadas",
      cifra: e.danadas,
      texto: plural(e.danadas, "prenda dañada", "prendas dañadas"),
      detalle: e.resuelveDanadas
        ? "Están fuera de la venta y esperan tu decisión: botar, donar o liquidar."
        : "Están fuera de la venta: un líder decide si se botan, se donan o se liquidan.",
      tono: "ambar",
    });
  }

  if (e.apartados.vencidos > 0) {
    tareas.push({
      tipo: "apartados_vencidos",
      cifra: e.apartados.vencidos,
      texto: plural(e.apartados.vencidos, "apartado vencido", "apartados vencidos"),
      detalle: "El cliente no volvió a tiempo: avísale o libera la prenda para venderla.",
      tono: "rojo",
    });
  }

  if (e.enCamino.atrasados > 0) {
    tareas.push({
      tipo: "traslados_atrasados",
      cifra: e.enCamino.atrasados,
      texto: plural(e.enCamino.atrasados, "traslado atrasado", "traslados atrasados"),
      detalle: "Ya debía llegar y todavía no se recibe: confirma con la sede que lo envió.",
      tono: "rojo",
    });
  } else if (e.enCamino.traslados > 0) {
    tareas.push({
      tipo: "en_camino",
      cifra: e.enCamino.traslados,
      texto: plural(e.enCamino.traslados, "traslado en camino", "traslados en camino"),
      detalle: e.enCamino.proximaLlegada ? `Viene hacia aquí: ${textoLlegada(e.enCamino.proximaLlegada)}.` : "Viene hacia aquí; recíbelo apenas llegue.",
      tono: "pizarra",
    });
  }

  if (e.separa && e.sinStockAtras.tallas > 0) {
    tareas.push({
      tipo: "sin_stock_atras",
      cifra: e.sinStockAtras.tallas,
      // La misma palabra del filtro «Hoy» al que lleva «Ver cuáles» (ADR-0326). Con el mínimo de 1 por talla (umbral 0), este caso es
      // una talla sin ninguna libre, ni colgada ni guardada: «queda poco en el piso» ya no es cierto.
      texto: `${plural(e.sinStockAtras.tallas, "talla", "tallas")} ${TEXTO_HOY.sin_stock_atras.toLocaleLowerCase("es")}`,
      detalle: "No queda ninguna, ni colgada ni guardada, y no viene ninguna en camino: pídela a otra sede o al Taller.",
      tono: "pizarra",
    });
  }

  return conPresupuestoDeRojo(tareas);
}

/** Como mucho `MAX_ROJO_POR_PANTALLA` filas en rojo, las primeras; las demás bajan a ámbar (siguen diciendo «vencido»). */
function conPresupuestoDeRojo(tareas: TareaHoy[]): TareaHoy[] {
  let rojos = 0;
  return tareas.map((t) => {
    if (t.tono !== "rojo") return t;
    rojos += 1;
    return rojos <= MAX_ROJO_POR_PANTALLA ? t : { ...t, tono: "ambar" };
  });
}

const GRAVEDAD: Record<TonoTareaHoy, number> = { rojo: 0, ambar: 1, pizarra: 2 };

/** La línea plegada del celular: la primera tarea (la que conviene hacer primero), el tono MÁS GRAVE de todas (un plazo vencido no
 *  se esconde detrás de una tarea ámbar) y cuántas tareas en rojo quedan dentro sin ser la primera. */
export function resumenPlegado(tareas: readonly TareaHoy[]): { primera: TareaHoy; tono: TonoTareaHoy; mas: number; vencidasDentro: number } | null {
  const [primera, ...resto] = tareas;
  if (!primera) return null;
  const tono = tareas.reduce<TonoTareaHoy>((t, x) => (GRAVEDAD[x.tono] < GRAVEDAD[t] ? x.tono : t), primera.tono);
  return { primera, tono, mas: resto.length, vencidasDentro: resto.filter((t) => t.tono === "rojo").length };
}

/** Cuántas se ven de entrada: la decisión de Felipe fue «Para hoy» con 3 frases como máximo. */
export const TAREAS_A_LA_VISTA = 3;
