"use client";

import { useSyncExternalStore } from "react";
import { ListChecks } from "lucide-react";
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
     («12 contadas · 40 sin contar») y lo aplicado NO sube la exactitud. Antes, el conteo decía «todo correcto» sin que nadie hubiera
     mirado; ahora el líder ve cuánto se contó de verdad. Quitar el atajo se descartó: hace falta para terminar un conteo grande.
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

/** La pregunta de antes de aplicar: cuántas variantes, qué se anota en ellas y cuándo conviene. */
export function ConfirmarAplicarTodos({ cuantas, alConfirmar, onClose }: { cuantas: number; alConfirmar: () => void; onClose: () => void }) {
  const variantes = `${cuantas.toLocaleString("es-PE")} ${cuantas === 1 ? "variante pendiente" : "variantes pendientes"}`;
  return (
    <Modal
      titulo="¿Aplicar todos completos?"
      subtitulo={`Se anotará en las ${variantes} lo que CAYLA espera, y quedarán marcadas «sin contar».`}
      ancho="max-w-md"
      onClose={onClose}
    >
      {(cerrar) => (
        <div className="space-y-4">
          <p className="text-sm text-tinta/80">
            El resultado lo dirá aparte («12 contadas · 40 sin contar») y lo que se aplica sin contar no sube la exactitud. Lo que ya anotaste no se toca; si
            después cuentas una a mano, deja de estar «sin contar».
          </p>
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
