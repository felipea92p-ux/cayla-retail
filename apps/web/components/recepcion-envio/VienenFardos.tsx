// «Vienen 2 fardos» sobre la frase que resume un envío (ADR-0480). Vive solo, sin controles, para que la hoja «Detalle» de Recibir no arrastre
// a su huella de guía las piezas de la pantalla de recibir (`PiezasEnvio` trae un «Volver» que esa hoja no tiene).

/** Cuántos paquetes entregó la compradora al transporte: lo que la tienda espera ver llegar. Sin fardos dichos —un envío de antes o armado en
 *  el escritorio— no dibuja nada, nunca «0 fardos». */
export function VienenFardos({ bultos }: { bultos: number | null }) {
  if (bultos === null) return null;
  return (
    <p className="text-[14.5px] text-tinta">
      {bultos === 1 ? "Viene" : "Vienen"} <b className="font-display text-[22px] tabular-nums">{bultos.toLocaleString("es-PE")}</b> {bultos === 1 ? "fardo" : "fardos"}
    </p>
  );
}
