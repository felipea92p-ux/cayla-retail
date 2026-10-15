// La guía de foco de las hojas de Ventas ▸ Pedidos web (ADR-0284, ADR-0408 act. 8). No agrega reglas: cada «falta» es exactamente
// lo que `confirmar_pedido_web`, `no_confirmar_pedido_web`, `anular_pedido_web`, `reservar_linea_pedido_web` y `enviar_pedido_web_desde`
// rechazarían (o lo que apaga el botón), y la prueba lo compara contra `problemaParaConfirmar` y `faltaDeLlegada`.

import type { CampoDeGuia } from "./guia-campos";
import { faltaDeDecision, faltaDeLlegada, type DecisionLinea, type LineaDetalle } from "./pedidos-web-reglas";

type Responsable = { responsableListo: boolean; responsableMotivo: string | null };

const responsable = (h: Responsable): CampoDeGuia => ({
  id: "responsable",
  nombre: "Quién lo hace",
  requerido: true,
  hecho: h.responsableListo,
  pendiente: h.responsableMotivo ?? "Elige quién lo hace.",
});

/** El id de la guía para una prenda del pedido (su `data-campo`). */
export const campoDeLinea = (lineaId: string) => `linea-${lineaId}`;

/** Confirmar: una decisión por prenda (de dónde sale, por conseguir con su fecha, o quitarla) y quién confirma. Si se quitan TODAS,
 *  no se confirma: se cierra con «No se puede confirmar» (la base lo rechaza con `pedido_web_sin_prendas`). */
export function camposConfirmar(
  h: {
    lineas: readonly Pick<LineaDetalle, "lineaId" | "referencia" | "talla">[];
    decisiones: Readonly<Record<string, DecisionLinea | null>>;
    hoy: string;
  } & Responsable,
): CampoDeGuia[] {
  const todasQuitadas = h.lineas.length > 0 && h.lineas.every((l) => h.decisiones[l.lineaId]?.tipo === "quitar");
  return [
    ...h.lineas.map((l): CampoDeGuia => {
      const falta = faltaDeDecision(h.decisiones[l.lineaId], h.hoy);
      return {
        id: campoDeLinea(l.lineaId),
        nombre: [l.referencia, l.talla].filter(Boolean).join(" · "),
        requerido: true,
        hecho: falta === null && !todasQuitadas,
        pendiente: falta ?? (todasQuitadas ? "Deja al menos una prenda, o ciérralo con «No se puede confirmar»." : ""),
      };
    }),
    responsable(h),
  ];
}

/** No confirmar o anular: el motivo (uno de los de la base) y quién lo hace. */
export function camposMotivo(h: { motivo: string | null } & Responsable): CampoDeGuia[] {
  return [{ id: "motivo", nombre: "Por qué", requerido: true, hecho: h.motivo !== null, pendiente: "Elige por qué." }, responsable(h)];
}

/** Reservar una prenda que estaba por conseguir y ya llegó: solo quién lo hace (de dónde sale viene elegido, el almacén primero). */
export function camposReservar(h: Responsable): CampoDeGuia[] {
  return [responsable(h)];
}

/** Enviar a la tienda del pedido: cuándo llega (de hoy a 60 días) y quién lo envía. */
export function camposEnviar(h: { llega: string; hoy: string } & Responsable): CampoDeGuia[] {
  const falta = faltaDeLlegada(h.llega, h.hoy);
  return [{ id: "llega", nombre: "Cuándo llega", requerido: true, hecho: falta === null, pendiente: falta ?? "" }, responsable(h)];
}
