// La guía de foco de las hojas de Ventas ▸ Pedidos web (ADR-0284, ADR-0408 act. 8 y 9). No agrega reglas: cada «falta» es exactamente
// lo que `confirmar_pedido_web`, `no_confirmar_pedido_web`, `anular_pedido_web`, `reservar_linea_pedido_web`, `enviar_pedido_web_desde`,
// `registrar_pago_pedido_web` y `anular_pago_pedido_web` rechazarían (o lo que apaga el botón), y la prueba lo compara contra
// `problemaParaConfirmar`, `faltaDeLlegada`, `problemaDelPago` y `problemaParaAnular`.

import type { CampoDeGuia } from "./guia-campos";
import { faltaDeDecision, faltaDeLlegada, problemaDelCodigo, type DecisionLinea, type LineaDetalle } from "./pedidos-web-reglas";
import {
  esDigital,
  problemaDeCaja,
  problemaDeOperacion,
  problemaDelMedio,
  problemaDelMonto,
  problemaParaAnular,
  type CampoDelPago,
  type FormPago,
  type MotivoAnularPago,
} from "./pedidos-web-cobro-reglas";

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

/** Registrar un pago: cuánto, cómo pagó, su n.º de operación (solo si es digital: el efectivo no lo lleva y la guía no lo pide) y quién
 *  lo registra. El efectivo sin caja abierta deja el medio «por hacer»: la base no lo cobraría. `rechazo`: lo que la base acaba de
 *  rechazar de un campo (el n.º que ya se usó en otro pedido): ese campo vuelve a faltar, con la frase de la base, hasta que se cambie. */
export function camposPago(
  h: { form: FormPago; falta: number; cajaAbierta: boolean | null; tienda: string; rechazo?: { campo: CampoDelPago; detalle: string } | null } & Responsable,
): CampoDeGuia[] {
  const rechazado = (campo: CampoDelPago) => (h.rechazo?.campo === campo ? h.rechazo.detalle : null);
  const monto = rechazado("monto") ?? problemaDelMonto(h.form.monto, h.falta);
  const medio = rechazado("medio") ?? problemaDelMedio(h.form.medio, h.cajaAbierta, h.tienda);
  const campos: CampoDeGuia[] = [
    { id: "monto", nombre: "Monto", requerido: true, hecho: monto === null, pendiente: monto ?? "" },
    { id: "medio", nombre: "Cómo pagó", requerido: true, hecho: medio === null, pendiente: medio ?? "" },
  ];
  if (esDigital(h.form.medio)) {
    const operacion = rechazado("operacion") ?? problemaDeOperacion(h.form.medio, h.form.operacion);
    campos.push({ id: "operacion", nombre: "N.º de operación", requerido: true, hecho: operacion === null, pendiente: operacion ?? "" });
  }
  // Actividad 10: el pago que completa el total hace nacer la boleta, que va en la caja del día. Sin caja abierta, falta eso.
  const caja = problemaDeCaja(h.form, h.falta, h.cajaAbierta, h.tienda);
  if (caja) campos.push({ id: "caja", nombre: "Caja abierta", requerido: true, hecho: false, pendiente: caja });
  return [...campos, responsable(h)];
}

/** Entregar (actividad 10): el código que el cliente muestra (4 cifras; si es EL de su pedido lo dice la base) y quién entrega.
 *  `rechazo`: lo que la base acaba de rechazar del código (de otro pedido): falta otra vez, con la frase de la base, hasta que se cambie. */
export function camposEntregar(h: { codigo: string; rechazo?: string | null } & Responsable): CampoDeGuia[] {
  const codigo = h.rechazo ?? problemaDelCodigo(h.codigo);
  return [{ id: "codigo", nombre: "Código para recoger", requerido: true, hecho: codigo === null, pendiente: codigo ?? "" }, responsable(h)];
}

/** Anular (o devolver) un pago: por qué y quién lo hace. Si es efectivo, primero la caja abierta de hoy (de ella sale la plata): sin
 *  caja, falta eso antes que nada. */
export function camposAnularPago(
  h: { medio: string; motivo: MotivoAnularPago | null; cajaAbierta: boolean | null; tienda: string } & Responsable,
): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  if (h.medio === "efectivo") {
    const caja = problemaParaAnular({ medio: h.medio }, "devuelto_al_cliente", h.cajaAbierta, h.tienda);
    campos.push({ id: "caja", nombre: "Caja abierta", requerido: true, hecho: caja === null, pendiente: caja ?? "" });
  }
  campos.push({ id: "motivo", nombre: "Por qué", requerido: true, hecho: h.motivo !== null, pendiente: "Elige por qué se anula." });
  return [...campos, responsable(h)];
}
