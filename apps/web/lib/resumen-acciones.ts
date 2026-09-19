import { nombreCorto } from "./resumen-formato";
import { textoDondeHay, textoLlegada, type AnalisisVariante, type PasoPlan, type Ubicacion } from "./resumen-reglas";

// De una recomendación a lo que pasa al hacer clic (2026-09-19, ADR-0113).
// Regla de oro de Felipe: el Resumen SUGIERE, nunca mueve inventario. Toda acción
// lleva o prellena el flujo real que ya existe, y la persona confirma allí:
//   · trasladar / pedir al Taller → `/inventario/mover?origen&destino&variante&cantidad`
//     (el formulario de `iniciar_traslado`, con fecha y confirmación humana);
//   · bajar al piso → el `ReponerPisoModal` de Existencias (`mover_interno`), con
//     la cantidad prellenada y el botón «Confirmar» de siempre;
//   · esperar llegada → el traslado que viene en camino;
//   · lo demás → el detalle, que explica y ofrece los enlaces.
// Ninguna de estas vías escribe por su cuenta: no hay una segunda implementación
// de traslados ni de movimientos internos.

export type AccionEjecutable =
  | { via: "enlace"; href: string }
  | { via: "bajar_al_piso"; cantidad: number }
  | { via: "detalle" }
  | { via: "ninguna" };

export type ContextoAccion = {
  destinoId: string;
  varianteId: string;
  origenAbastecimiento: "compra" | "produccion" | "ambos" | null;
  /** ¿La sede separa piso y almacén y tenemos sus dos sububicaciones? Sin eso el modal no puede abrir. */
  puedeBajarAlPiso: boolean;
};

export function resolverAccion(paso: PasoPlan | null, c: ContextoAccion): AccionEjecutable {
  if (!paso) return { via: "ninguna" };
  switch (paso.tipo) {
    case "bajar_al_piso":
      return c.puedeBajarAlPiso && paso.cantidad ? { via: "bajar_al_piso", cantidad: paso.cantidad } : { via: "detalle" };
    case "trasladar":
    case "pedir_al_taller":
      if (!paso.origen || !paso.cantidad) return { via: "detalle" };
      return {
        via: "enlace",
        href: `/inventario/mover?origen=${paso.origen.id}&destino=${c.destinoId}&variante=${c.varianteId}&cantidad=${paso.cantidad}`,
      };
    case "esperar_llegada":
      return { via: "enlace", href: paso.trasladoId ? `/inventario/traslados/${paso.trasladoId}` : "/inventario/traslados" };
    case "ubicar_stock":
      return { via: "enlace", href: `/inventario?ubicacion=${c.destinoId}` };
    case "revisar_abastecimiento":
      // Solo hay un destino honesto cuando se sabe cómo se repone la prenda.
      if (c.origenAbastecimiento === "produccion") return { via: "enlace", href: "/produccion" };
      if (c.origenAbastecimiento === "compra") return { via: "enlace", href: "/compras" };
      return { via: "detalle" };
    case "revisar_reposicion":
    case "revisar_liquidacion":
      return { via: "detalle" };
  }
}

/** Cómo se enlaza cada paso del plan en el detalle (mismo contexto que la fila). */
export function contextoAccion(a: AnalisisVariante, destino: Ubicacion, puedeBajarAlPiso: boolean): ContextoAccion {
  return { destinoId: destino.id, varianteId: a.fila.varianteId, origenAbastecimiento: a.fila.origenAbastecimiento, puedeBajarAlPiso };
}

/**
 * La columna «Oportunidad / dónde hay»: lo que puede resolver el problema, en
 * frases cortas — el almacén de la misma tienda (si hay que bajarlo), lo que ya
 * viene, y qué otras sedes tienen la prenda. Nunca la cantidad sugerida: esa va
 * en la acción.
 */
export function partesOportunidad(a: AnalisisVariante, destino: Ubicacion): string[] {
  const partes: string[] = [];
  const bajar = a.plan.pasos.find((p) => p.tipo === "bajar_al_piso");
  if (bajar) partes.push(`Almacén ${nombreCorto(destino.nombre)}: ${a.fila.almacen}`);
  const espera = a.plan.pasos.find((p) => p.tipo === "esperar_llegada");
  if (espera?.cantidad) partes.push(`Llegan +${espera.cantidad}${textoLlegada(espera.diasLlegada ?? null)}`);
  const red = textoDondeHay(a.fila.enRed, 2);
  if (red) partes.push(red);
  return partes.length > 0 ? partes : ["—"];
}
