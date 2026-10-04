/* ====================================================================
   «Para hoy» de Existencias (rediseño del 2026-10-04, decisión de Felipe en la ronda 2: la portada es el buscador, «Para
   hoy» y el catálogo de prendas).

   El problema que reemplaza: cuatro tarjetas fijas («Resumen disponible», «Reponer a piso hoy», «En camino hacia acá»,
   «Incidencias») que se dibujaban siempre, aunque dijeran 0, y que ocupaban la primera pantalla sin decir por dónde empezar.
   Aquí cada cosa pendiente de la sede es una TAREA con su cifra y su frase, en el orden en que conviene hacerlas; lo que está en
   0 no aparece. La pantalla muestra las tres primeras y deja ver el resto a un toque.

   No decide reglas nuevas: «por colgar» y «sin stock atrás» son los mismos casos de «Hoy» (`lib/existencias-hoy.ts`), las
   ventas sin registrar son la cola de Recibir (`prendas_por_regularizar`, plazo de 2 días de ADR-0179) y lo demás son las colas
   que Existencias ya leía (dañadas, apartados, traslados).
   Dos reglas de `/rigor` (2026-10-04):
   - el rojo es un presupuesto (`MAX_ROJO_POR_PANTALLA`, 2): solo los plazos vencidos van en rojo, y si hay más de dos, los
     siguientes bajan a ámbar. Con un rojo por fila, el que importa deja de verse.
   - la cola que no responde se DICE («no se pudo leer»), no se calla: una tarea que desaparece cuando la base falla se lee
     igual que «no hay ninguna».
   ==================================================================== */

import { MAX_ROJO_POR_PANTALLA } from "@cayla-retail/shared";

export type TipoTareaHoy =
  | "por_colgar"
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
  sinStockAtras: { tallas: number };
  /** `null`: quien mira no ve Recibir (no podría resolverla) y no se dibuja. `"fallo"`: la cola no respondió y se dice. */
  sinRegistrar: { pendientes: number; vencidas: number } | "fallo" | null;
  danadas: number;
  apartados: { vencidos: number };
  enCamino: { traslados: number; atrasados: number; proximaLlegada: string | null };
};

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

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
      detalle: `Hay ${e.porColgar.unidades} ${plural(e.porColgar.unidades, "guardada", "guardadas")} y ninguna en el piso${empezar ? `: empieza por ${empezar}` : ""}. Si ya están colgadas, regístralas al bajar: el sistema las cree guardadas.`,
      tono: "ambar",
    });
  }

  if (e.sinRegistrar === "fallo") {
    tareas.push({
      tipo: "sin_registrar",
      cifra: null,
      texto: "No se pudo leer las ventas sin registrar",
      detalle: "Ábrelas en Recibir para ver cuántas esperan su prenda.",
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
      detalle: "Están fuera de la venta y esperan una decisión: botar, donar o liquidar.",
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
      texto: plural(e.sinStockAtras.tallas, "talla sin nada atrás", "tallas sin nada atrás"),
      detalle: "Queda poco en el piso y el almacén está vacío: pídela a otra sede o al Taller.",
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

/** Cuántas se ven de entrada: la decisión de Felipe fue «Para hoy» con 3 frases como máximo. */
export const TAREAS_A_LA_VISTA = 3;
