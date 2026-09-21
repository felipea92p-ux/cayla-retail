import { Fragment } from "react";
import type { EntornoTransmision } from "@/lib/comprobantes-reglas";
import { etapasDelHilo, type EstadoDeFila, type NodoDelHilo, type TramoDelHilo } from "@/lib/facturacion-actividad";

// El hilo del comprobante (ADR-0124, spec §9): cuatro nodos —venta, número reservado, enviado a
// SUNAT, aceptado— unidos por tres tramos, como el hilo cosido de Atelier. Es la respuesta a «¿ya
// está?» sin leer: verde hecho, ámbar por hacer o esperando, rojo rechazado, y una raya punteada
// —nunca verde— cuando SUNAT no vio el comprobante (pruebas). Nunca va solo: lleva `role="img"` y
// un `aria-label` con el estado en palabras, y en la tabla va junto a un chip con texto.
//
// Es de servidor y no tiene estado: cuando el comprobante cambia de estado, los mismos nodos
// cambian de clase y el CSS anima el paso (el relleno, el tilde que se traza, el tramo que avanza).
// `transmitiendo` hace correr un destello ámbar por el tramo hacia SUNAT mientras se envía.

const CLASE_NODO: Record<NodoDelHilo, string> = {
  hecho: "hilo-n--on",
  "ambar-punteado": "hilo-n--next",
  "ambar-pulso": "hilo-n--wait",
  rechazado: "hilo-n--bad",
  vacio: "",
  prueba: "hilo-n--prueba",
  apagado: "hilo-n--apagado",
};

const CLASE_TRAMO: Record<TramoDelHilo, string> = {
  lleno: "hilo-l--on",
  vacio: "",
  prueba: "hilo-l--prueba",
  apagado: "hilo-l--apagado",
};

export function HiloComprobante({ estado, entorno, transmitiendo = false }: { estado: EstadoDeFila; entorno: EntornoTransmision; transmitiendo?: boolean }) {
  const { nodos, tramos, descripcion } = etapasDelHilo(estado, entorno);
  return (
    <span className="hilo-comprobante" role="img" aria-label={descripcion}>
      {nodos.map((nodo, i) => (
        <Fragment key={i}>
          <i className={`hilo-n ${CLASE_NODO[nodo]}`}>
            {/* Los dos trazos existen siempre: el estado prende uno u otro por clase, y así el tilde
                (o la equis) se DIBUJA cuando el comprobante cambia, en vez de aparecer de golpe. */}
            <svg viewBox="0 0 12 12" aria-hidden>
              <path className="hilo-ck" pathLength={1} d="M3 6.3l2.1 2.1 3.9-4.4" />
              <path className="hilo-xx" pathLength={1} d="M3.7 3.7l4.6 4.6M8.3 3.7l-4.6 4.6" />
            </svg>
          </i>
          {i < tramos.length && <b className={`hilo-l ${CLASE_TRAMO[tramos[i]]}${transmitiendo && i === 1 ? " hilo-l--trabaja" : ""}`} />}
        </Fragment>
      ))}
    </span>
  );
}
