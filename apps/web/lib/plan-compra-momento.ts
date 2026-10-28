import { diasEntre, ranurasSinPlan, type CampanasLeidas, type EstadoCampana, type FiltroPlan, type RanuraCalendario } from "./plan-compra-reglas";

// Qué pregunta responde el Plan de campaña según el MOMENTO de la campaña y cuánto plan tiene (prompt maestro, 2026-10-13). Antes de que
// empiece, la pregunta es «¿cuánto compro?». Si ya empezó (o terminó) y nadie la planificó, ofrecer «Armar plan» en cada fila es ruido: lo
// útil hoy es ver cómo va (Resultados) y dejar lista la próxima. Y lo que no tiene nada que decir no se dibuja: con 0 planes, las columnas
// «Comprar» e «Inversión» y la leyenda de una barra que nadie ve. Lógica pura, con su prueba; no cambia ni el cálculo ni lo que se guarda.

/** Qué partes de la tabla se dibujan. Las cuatro combinaciones posibles tienen su plantilla en `FilaCategoria`. */
export type FormaTabla = {
  /** «Venta esperada»: la barra de rango, o «Armar plan» antes de la campaña. */
  venta: boolean;
  /** «Comprar» e «Inversión»: solo dicen algo si alguna categoría tiene plan. */
  compra: boolean;
  /** «Vendido hasta hoy» / «Lo que pasó»: desde que la campaña empieza. */
  real: boolean;
  /** «Cómo leer la barra»: solo si hay alguna barra que leer. */
  leyenda: boolean;
};

export function formaDeLaTabla(estado: EstadoCampana, conPlan: number): FormaTabla {
  const hayPlan = conPlan > 0;
  return { venta: estado === "antes" || hayPlan, compra: hayPlan, real: estado !== "antes", leyenda: hayPlan };
}

/** La campaña que viene y cómo se llega a ella: un plan que ya existe se abre por su URL; una del calendario de Etiquetas sin plan
 *  (ADR-0372 act. f) se arma desde su hoja, igual que en el selector. */
export type Proxima = {
  nombre: string;
  dias: number;
  destino: { tipo: "plan"; id: string } | { tipo: "calendario"; ranura: RanuraCalendario };
};

/** La campaña que viene: la primera que todavía no empieza, tenga plan o esté en el calendario sin él. No cuenta la que se mira ni las
 *  archivadas. A igual fecha gana la que ya tiene plan (no hay que armarla). */
export function proximaCampana(c: Pick<CampanasLeidas, "planes" | "etiquetas" | "calendario">, hoy: string, actualId: string): Proxima | null {
  const candidatas: (Proxima & { desde: string; orden: number })[] = [
    ...c.planes
      .filter((p) => !p.archivado && p.id !== actualId && p.desde > hoy)
      .map((p) => ({ nombre: p.nombre, desde: p.desde, orden: 0, dias: diasEntre(hoy, p.desde), destino: { tipo: "plan" as const, id: p.id } })),
    ...ranurasSinPlan(c, hoy)
      .filter((r) => r.desde > hoy)
      .map((r) => ({ nombre: r.nombre, desde: r.desde, orden: 1, dias: diasEntre(hoy, r.desde), destino: { tipo: "calendario" as const, ranura: r } })),
  ];
  const primera = candidatas.sort((a, b) => a.desde.localeCompare(b.desde) || a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"))[0];
  return primera ? { nombre: primera.nombre, dias: primera.dias, destino: primera.destino } : null;
}

/** Lo que la pantalla ofrece como camino principal. */
export type QueToca =
  /** Antes de la campaña: llenar el plan («Empezar por …», que elige `siguienteSinPlan`). */
  | { tipo: "llenar" }
  /** Ya empezó o terminó y ninguna categoría tiene plan: ver cómo va y planificar la próxima. */
  | { tipo: "sin-plan"; estado: "durante" | "despues"; proxima: Proxima | null }
  /** Ya empezó o terminó con plan: la tabla misma compara lo planificado con lo vendido. */
  | { tipo: "mirar" };

export function queTocaHoy(estado: EstadoCampana, conPlan: number, proxima: Proxima | null): QueToca {
  if (estado === "antes") return { tipo: "llenar" };
  if (conPlan > 0) return { tipo: "mirar" };
  return { tipo: "sin-plan", estado, proxima };
}

/** La frase bajo el título. Sin las fechas: ya las dicen el selector y el chip del momento (antes salían tres veces). */
export function subtituloDelPlan(estado: EstadoCampana, conPlan: number, nombre: string): string {
  if (estado === "antes") return `Cuánto comprar de cada categoría para ${nombre}.`;
  if (conPlan === 0) {
    return estado === "durante"
      ? `${nombre} empezó sin plan: aquí ves lo que hay y lo que se vendió hasta hoy.`
      : `${nombre} terminó sin plan: aquí ves lo que se vendió.`;
  }
  return estado === "durante"
    ? `${nombre}: lo que planificaste y, al lado, lo que se vendió hasta hoy.`
    : `${nombre}: lo que planificaste y, al lado, lo que se vendió de verdad.`;
}

const enDias = (n: number) => (n <= 0 ? "hoy" : n === 1 ? "mañana" : `en ${n} días`);

/** El aviso de una campaña sin plan que ya empezó o terminó: qué pasó y qué conviene hacer hoy, en palabras de tienda. */
export function avisoSinPlan(t: Extract<QueToca, { tipo: "sin-plan" }>): { titulo: string; texto: string; verResultados: string } {
  const proxima = t.proxima ? ` La próxima, ${t.proxima.nombre}, empieza ${enDias(t.proxima.dias)}.` : "";
  return t.estado === "durante"
    ? {
        titulo: "Esta campaña empezó sin plan",
        // Sin «tócala en la tabla»: la fila se sigue pudiendo abrir, pero decirlo aquí costaba una línea y empujaba la tabla bajo el pliegue a 1024 × 768.
        texto: `Lo útil hoy es ver cómo va cada categoría, para reponer o impulsar a tiempo.${proxima}`,
        verResultados: "Ver cómo va",
      }
    : {
        titulo: "Esta campaña terminó sin plan",
        texto: `No hay supuestos con qué compararla, pero en Resultados ves lo que se vendió.${proxima}`,
        verResultados: "Ver lo que se vendió",
      };
}

/**
 * Una píldora de filtro se muestra si cambia algo: «Todas» siempre; las demás, si recortan la lista sin vaciarla (con 0 planes, «Sin plan»
 * filtra lo mismo que «Todas» y «Con plan 0» lleva a una lista vacía). La que está puesta no se esconde nunca. Se decide con los conteos de
 * TODAS las categorías, no con los de la búsqueda: si no, las píldoras aparecerían y desaparecerían mientras se escribe.
 */
export function pildoraVisible(clave: FiltroPlan, conteos: Readonly<Record<FiltroPlan, number>>, activa: FiltroPlan): boolean {
  if (clave === "todas" || clave === activa) return true;
  const n = conteos[clave];
  return n > 0 && n < conteos.todas;
}
