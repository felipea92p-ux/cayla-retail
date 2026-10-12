/* ====================================================================
   El pie de una tarjeta de Existencias (2026-10-07, maqueta `docs/maquetas/existencias-tarjeta-cajon-2026-10/`, contrato en su
   `LOGICA.md`, §1.3 y §1.4). Lógica pura, con su prueba; el componente (`PieTarjeta`) solo la dibuja.

   A la izquierda, UNA cosa que dice lo que toca, con su nombre a la vista (antes era una percha sola que no decía nada):
   - «Colgar en el piso», si al modelo le falta algo en el piso y se puede colgar: en ámbar si lo pide el motor del piso; neutro si
     solo lo dicen los números (el piso en pausa, sin cuadrar). Abre SIEMPRE «Colgar varias» (la tabla),
     aunque falte una sola talla (Felipe, 2026-10-07).
   - Con un filtro «Hoy»/«Condición» que no es «Por colgar»: «Ver talla X», la que más importa del filtro.
   - Si no, el aviso «Se acabó: L» (texto rojo, no es botón) cuando una talla del color se agotó. Ya no hay botón «Pedir talla X»:
     la columna roja de la tabla lo dice, y Pedir vive en «Más» y en el cajón.
   - Si no, «✓ Todo en el piso»: cada talla con algo libre tiene al menos una colgada.
   A la derecha, «Más ⌄»: un menú que se abre con un clic (no al pasar el mouse). Lleva Subir, Enviar, Pedir, Ajustar y Ver ficha; lo
   que el rol no tiene no se dibuja, y lo que hoy no se puede se ve apagado diciendo por qué.

   Los nombres son los del sistema: «Colgar en el piso» (ADR-0339) y su inverso «Subir a almacén».
   ==================================================================== */

export type ClaveAccion = "subir" | "enviar" | "pedir" | "ajustar" | "ficha";

export type BotonTarjeta =
  | { tipo: "colgar"; etiqueta: string; sugerido: boolean }
  | { tipo: "ver"; etiqueta: string }
  | { tipo: "agotada"; etiqueta: string }
  | { tipo: "sinColgar"; etiqueta: string }
  | { tipo: "ok"; etiqueta: string };

export function botonDeTarjeta(x: {
  puedeReponer: boolean;
  /** Cuántas tallas del modelo faltan en el piso según el motor (`tallasQueFaltan`): botón en ámbar. */
  tallasPorColgar: number;
  /** Cuántas tallas del modelo no tienen NINGUNA colgada y sí algo en almacén (lo físico, `tallasSinColgar`). Con el piso en pausa el
   *  motor no marca nada, pero decir «Todo en el piso» con 0 colgadas sería falso: el botón sale igual, sin el ámbar. */
  tallasSinColgar: number;
  /** Alguna talla del modelo tiene algo libre en el almacén. */
  hayQueBajar: boolean;
  /** Cuántas de esas tallas son del color que se ve: el botón cuenta solo esas (2026-10-07, «2 tallas» sobre un color agotado
   *  confundía). Si el color visto no tiene ninguna y otro sí, dice «Colgar en otros colores». Sin el dato, cuenta el modelo. */
  tallasDelColor?: number;
  /** Con un filtro que no es «Por colgar»: la talla que más importa («M»). */
  verTalla?: string | null;
  /** Las tallas agotadas del color que se ve (`tallasAgotadas`). */
  agotadas: readonly string[];
}): BotonTarjeta {
  if (x.verTalla) return { tipo: "ver", etiqueta: `Ver talla ${x.verTalla}` };
  const n = Math.max(x.tallasPorColgar, x.tallasSinColgar);
  if (x.puedeReponer && x.hayQueBajar && n > 0)
    return {
      tipo: "colgar",
      etiqueta: x.tallasDelColor === 0 ? "Colgar en otros colores" : (x.tallasDelColor ?? n) > 1 ? `Colgar en el piso · ${x.tallasDelColor ?? n} tallas` : "Colgar en el piso",
      sugerido: x.tallasPorColgar > 0,
    };
  if (x.agotadas.length > 0) return { tipo: "agotada", etiqueta: `Se acabó: ${x.agotadas.join(", ")}` };
  // Quien no puede colgar no ve el botón, pero tampoco se le dice «Todo en el piso» si hay tallas sin ninguna colgada.
  if (n > 0) return { tipo: "sinColgar", etiqueta: n === 1 ? "1 talla sin colgar" : `${n} tallas sin colgar` };
  return { tipo: "ok", etiqueta: "Todo en el piso" };
}

export type OpcionMas = {
  clave: ClaveAccion;
  etiqueta: string;
  /** Si viene, la opción se ve pero no se elige, y dice por qué. */
  motivo?: string;
};

export function opcionesDeMas(x: {
  puedeReponer: boolean;
  puedeEnviar: boolean;
  puedePedir: boolean;
  puedeAjustar: boolean;
  /** Algo libre colgado en el piso (lo apartado no se sube). */
  hayEnElPiso: boolean;
  /** Algo libre en el almacén para mandar a otra sede. */
  hayEnAlmacen: boolean;
  /** La talla agotada que otra sede tiene, si hay una («L»). */
  pedible: string | null;
}): OpcionMas[] {
  const o: OpcionMas[] = [];
  if (x.puedeReponer) o.push({ clave: "subir", etiqueta: "Subir a almacén", motivo: x.hayEnElPiso ? undefined : "No hay nada colgado" });
  if (x.puedeEnviar) o.push({ clave: "enviar", etiqueta: "Enviar a otra sede", motivo: x.hayEnAlmacen ? undefined : "No hay nada en almacén" });
  if (x.puedePedir)
    o.push({
      clave: "pedir",
      etiqueta: x.pedible ? `Pedir talla ${x.pedible} a otra sede` : "Pedir a otra sede",
      motivo: x.pedible ? undefined : "Ninguna talla agotada que otra sede tenga",
    });
  if (x.puedeAjustar) o.push({ clave: "ajustar", etiqueta: "Ajustar stock" });
  o.push({ clave: "ficha", etiqueta: "Ver ficha" });
  return o;
}
