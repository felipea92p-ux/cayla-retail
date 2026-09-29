"use client";

import { useState } from "react";
import { Check } from "lucide-react";
// Rutas relativas a propósito: la prueba de render de estas piezas (`lib/conteo-kit.test.ts`) corre en vitest, que no resuelve `@/`
// para valores (los tipos se borran y no importan). Mismo motivo que `ExistenciasVacio`.
import { Chip } from "../ui/Chip";
import { etiquetaDeLinea, type EstadoLinea as EstadoDeLinea } from "../../lib/conteo-reglas";

/* ====================================================================
   EstadoLinea · el estado de UNA variante del conteo, en su cifra y su tono
   (Inventario ▸ Conteo, rediseño 2026-09-29; plano en el kit de Conteo)

   Qué dice y de qué color lo decide `etiquetaDeLinea` (lib/conteo-reglas.ts, copy literal del contrato): esta pieza solo
   lo pinta con el `Chip` del sistema. No hay una segunda tabla de textos aquí: Contar, Revisar, Confirmar y el
   resultado leen la MISMA palabra («Falta 1», «Hay 3 de más», «Correcto») porque salen de la misma función.

   El reparto de color (contrato §3.3), siempre con TEXTO —nunca solo color—:
     · Correcto            → verde suave (Chip `verde`).
     · Faltan N / Hay N de más → rojo: son diferencias reales y nada más.
     · Pendiente           → neutro (sand/taupe). Nadie se equivocó: solo falta contar. Jamás rojo.
     · En reconteo         → ámbar: hay algo por volver a mirar.
     · «Confirmado»        → una marca discreta bajo la diferencia ya confirmada; no es un estado aparte.

   Movimiento: UNA sola respuesta a una acción, la que el contrato permite —la línea que pasa de Pendiente (o En
   reconteo) a Correcto se «asienta» (`anim-asentar`, 320 ms, sin rebote)—. No anima al cargar la pantalla: una
   página que abre con 30 correctas no se mueve, solo la que la persona acaba de verificar. Con movimiento reducido
   `anim-asentar` colapsa a un instante (globals.css, «Accesibilidad»), sin código extra aquí.

   Accesibilidad: `role="status"` (región viva educada: un cambio se anuncia sin interrumpir). Se dice con la
   palabra; la marca «Confirmado» lleva su propio texto. El alto de la pieza no cambia cuando aparece «Confirmado»
   (se reserva mientras hay diferencia), para que la fila no salte bajo el dedo.

   Es un componente de cliente solo por la transición (necesita recordar el estado anterior); un Server Component
   puede dibujarlo (Revisar, Resultado) pasándole números y texto. No exporta funciones.
   ==================================================================== */

export type EstadoLineaConteo = EstadoDeLinea;

type Props = {
  estado: EstadoLineaConteo;
  /** Lo que CAYLA esperaba al verificar (el «Debe haber» de la fila). Solo respalda la diferencia si `diferencia` no llega. */
  debeHaber: number;
  /** Lo que la persona contó; `null` = todavía nadie la contó (vacío ≠ 0). */
  contada: number | null;
  /** `contada − debeHaber`: negativo = faltan, positivo = hay de más. `null` si está pendiente. */
  diferencia: number | null;
  /**
   * Redundante con `estado === "diferencia_confirmada"` (regla D3 lo deriva de la confirmación): no cambia nada si
   * coincide. Solo rescata al llamador que armó `estado` sin mirar la confirmación y pasa `con_diferencia` + `true`.
   */
  confirmada?: boolean;
  /** No reservar la línea invisible de «Confirmado» mientras hay diferencia: la fila compacta de Contar (Revisar y Confirmar sí la reservan). */
  sinReserva?: boolean;
  className?: string;
};

export function EstadoLinea({ estado, debeHaber, contada, diferencia, confirmada, sinReserva = false, className = "" }: Props) {
  // La transición Pendiente → Correcto: se guarda el estado anterior EN el estado del componente y se compara al
  // renderizar (patrón de React para «derivar de la render anterior»; sin efecto ni ref). `asienta` queda en `true`
  // hasta el siguiente cambio de estado, así que la animación corre una sola vez, justo cuando la línea se verifica.
  const [previo, setPrevio] = useState(estado);
  const [asienta, setAsienta] = useState(false);
  if (previo !== estado) {
    setPrevio(estado);
    setAsienta(estado === "correcta" && (previo === "pendiente" || previo === "en_reconteo"));
  }

  const efectivo: EstadoLineaConteo = estado === "con_diferencia" && confirmada === true ? "diferencia_confirmada" : estado;
  const dif = diferencia ?? (contada === null ? null : contada - debeHaber);
  const etiqueta = etiquetaDeLinea({ estado: efectivo, diferencia: dif });
  // Mientras hay diferencia se reserva la línea de «Confirmado» (invisible hasta que se confirma): confirmar no debe
  // empujar nada ni cambiar el alto de la fila.
  const conDiferencia = efectivo === "con_diferencia" || efectivo === "diferencia_confirmada";

  return (
    <span role="status" data-critico className={`flex min-w-0 flex-col items-start justify-center gap-0.5 ${className}`}>
      <span className={asienta ? "anim-asentar" : undefined}>
        {/* En un panel muy angosto (celular de 320 px) el chip pierde el punto y baja a 12 px para que «Hay 12 de más» entre en su columna. */}
        <Chip tono={etiqueta.tono} className="@max-[20rem]:px-2 @max-[20rem]:text-[12px] @max-[20rem]:before:hidden">
          {etiqueta.texto}
        </Chip>
      </span>
      {conDiferencia && (!sinReserva || etiqueta.confirmada) && (
        <span
          aria-hidden={etiqueta.confirmada ? undefined : true}
          className={`inline-flex items-center gap-1 text-[11px] leading-4 text-taupe ${etiqueta.confirmada ? "" : "invisible"}`}
        >
          <Check aria-hidden strokeWidth={2} className="h-3 w-3" />
          Confirmado
        </span>
      )}
    </span>
  );
}
