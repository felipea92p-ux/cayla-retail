"use client";

import { useSyncExternalStore } from "react";
import { Flag, ListChecks } from "lucide-react";
import type { ControlConteo } from "@/components/conteo/control-conteo";
import { Modal } from "@/components/ui/Modal";

/* ====================================================================
   «Aplicar todos completos» · llenar de un golpe lo que CAYLA esperaba (Inventario ▸ Conteo ▸ Contar, 2026-10-01)

   Pedido de Felipe: un botón que, en vez de ir tarjeta por tarjeta con «Completar todo», cuente de una vez TODAS las variantes que
   siguen pendientes con la cantidad exacta que debe haber. Es el «Completar todo» de cada tarjeta, para toda la lista.

   Qué hace y qué NO hace (lo decide `ContarConteo`, aquí solo se dibuja):
   · Solo toca las variantes que SIGUEN pendientes entre las que se ven (la lista acotada por «Contar esta prenda», y lo que deja el
     buscador si hay texto). Lo que alguien ya escribió, escaneó o recontó no se pisa nunca.
   · Dice la verdad sobre sí mismo (ADR-0328, actividad 15; Felipe, 2026-10-04): cada línea queda marcada «sin contar» en la base
     (`conteo_aplicar_completos`, una sola llamada con el mismo responsable y el mismo candado que contar), el resultado lo dice aparte
     (con las cifras reales de ESTE conteo, `textosAplicarTodos`) y lo aplicado NO sube la exactitud. Antes, el conteo decía «todo
     correcto» sin que nadie hubiera mirado; ahora el líder ve cuánto se contó de verdad. Quitar el atajo se descartó: hace falta para
     terminar un conteo grande.
   · No toca las «en reconteo»: ahí alguien ya vio una diferencia (ADR-0282). Si hay, se dice cuántas se dejan.
   · Si el conteo todavía puede ser el de ARRANQUE, avisa en ámbar que aplicar sin contar hace que deje de serlo (y lo que falte en lo
     contado contará como pérdida): es la consecuencia que más cuesta y la única que la persona puede evitar antes.
   · Pregunta antes, una sola vez, con la consecuencia dicha. «Seguir contando» es el primer botón y el más a mano.

   El botón vive en la franja bajo el buscador, con la forma y el icono del «Completar todo» de las tarjetas: se ve, pero no compite con
   «Revisar conteo» (el botón principal, abajo) ni queda a un clic de él.
   ==================================================================== */

/** El botón de la franja. Se apaga cuando no queda nada pendiente en todo el conteo; se suscribe solo al resumen (una lectura no redibuja la pantalla). */
export function BotonAplicarTodos({ control, alPedir }: { control: ControlConteo; alPedir: () => void }) {
  const quedanPendientes = () => control.resumen().pendientes > 0;
  const hay = useSyncExternalStore(control.suscribirResumen, quedanPendientes, quedanPendientes);
  return (
    <button
      type="button"
      disabled={!hay}
      onClick={alPedir}
      title={hay ? "Cuenta las variantes pendientes con lo que CAYLA espera" : "No queda ninguna variante pendiente"}
      className="btn-cayla btn-secundario h-9 min-h-0 shrink-0 gap-2 px-3 text-[13px] text-rojo-profundo disabled:opacity-50"
    >
      <ListChecks aria-hidden className="h-4 w-4" />
      Aplicar todos completos
    </button>
  );
}

/** La pregunta de antes de aplicar: cuántas variantes, qué se anota en ellas, cómo se leerá el resultado y qué se deja sin tocar. */
export function ConfirmarAplicarTodos({
  textos,
  avisoArranque,
  cuantas,
  alConfirmar,
  onClose,
}: {
  /** `textosAplicarTodos`: con las cifras reales del conteo, nunca un ejemplo fijo. */
  textos: { subtitulo: string; detalle: string; reconteo: string | null };
  /** `avisoArranqueAlAplicar`: si aplicar hace que este conteo deje de ser el de arranque, o `null`. */
  avisoArranque: string | null;
  cuantas: number;
  alConfirmar: () => void;
  onClose: () => void;
}) {
  return (
    <Modal titulo="¿Aplicar todos completos?" subtitulo={textos.subtitulo} ancho="max-w-md" onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-4">
          {avisoArranque && (
            <p role="status" className="flex items-start gap-2 rounded-xl border border-ambar/35 bg-ambar/[0.07] px-3.5 py-3 text-sm text-ambar-profundo">
              <Flag aria-hidden strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0" />
              {avisoArranque}
            </p>
          )}
          <p className="text-sm text-tinta/80">{textos.detalle}</p>
          {textos.reconteo && <p className="nota-cayla">{textos.reconteo}</p>}
          {/* La salida segura va primero y más a mano: aplicar afirma «lo encontré tal cual». */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
            <button type="button" onClick={cerrar} className="btn-cayla btn-secundario h-11">
              Seguir contando
            </button>
            <button
              type="button"
              onClick={() => {
                alConfirmar();
                cerrar();
              }}
              className="btn-cayla btn-primario h-11"
            >
              Sí, aplicar a {cuantas.toLocaleString("es-PE")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
