"use client";

import type { RefObject } from "react";
import { Modal } from "@/components/ui/Modal";
import { QUIZA_MAS, cifrasVista, registroCorto } from "@/lib/frescura-pantalla";
import type { FilaConfianza } from "@/lib/frescura-reglas";
import type { DatosFrescura } from "@/lib/frescura";
import type { Tolerado } from "@/lib/resultado";
import { NivelChip } from "./piezas";

// «Las N tiendas» (solo el líder; ADR-0208, paso 4): cómo está el piso de cada tienda y cómo se registra lo que se cuelga,
// este mes y el anterior. Lo arma la misma vuelta que la pantalla (una lectura por tienda + el registro de todas): abrirla
// no consulta nada. El registro nunca nombra personas: es del equipo (ADR-0208, bloque 1).

export function FrescuraTiendas({
  tiendas,
  registro,
  actual,
  volverA,
  onClose,
}: {
  tiendas: NonNullable<DatosFrescura["tiendas"]>;
  registro: Tolerado<FilaConfianza[]>;
  actual: string;
  /** El enlace que la abrió: al cerrar, el foco vuelve ahí. */
  volverA?: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  return (
    <Modal
      titulo={`Las ${tiendas.length} tiendas`}
      subtitulo="Cómo está el piso de cada tienda y cómo se registra lo que se cuelga, este mes y el anterior. Para mirar el detalle de otra, cámbiala en el selector de sede de arriba."
      onClose={onClose}
      variante="hoja"
      ancho="sm:max-w-[40rem]"
      alCerrarEnfocar={volverA}
    >
      {(cerrar) => (
        <>
          <ul className="divide-y divide-sand border-y border-sand">
            {tiendas.map((t) => {
              const c = t.lectura.datos && !("separaPiso" in t.lectura.datos) ? cifrasVista(t.lectura.datos) : null;
              const reg = registro.datos ? registroCorto(registro.datos, t.id) : [];
              return (
                <li key={t.id} className="py-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-[15px] font-semibold">{t.nombre}</span>
                    {t.id === actual && <span className="text-xs text-taupe">la que estás mirando</span>}
                  </div>
                  {t.lectura.fallo ? (
                    <p className="mt-1 text-[13px] text-taupe">{t.lectura.fallo}</p>
                  ) : c ? (
                    <p className="mt-1 text-[13px] leading-relaxed">
                      <b className="font-semibold tabular-nums">{c.edad ?? "—"}</b> días en el piso en promedio{c.edad !== null && c.edadQuizaMas ? ` ${QUIZA_MAS}` : ""} ·{" "}
                      <b className="font-semibold tabular-nums">{c.pctNuevas === null ? "—" : `${c.pctNuevas}%`}</b> de lo medido es Nueva ·{" "}
                      <b className="font-semibold tabular-nums">{c.porDecidir}</b> por decidir · <b className="font-semibold tabular-nums">{c.unidades}</b> unidades en el piso
                    </p>
                  ) : (
                    <p className="mt-1 text-[13px] text-taupe">No separa piso y almacén: Frescura no la mide.</p>
                  )}
                  {registro.fallo ? null : reg.length > 0 ? (
                    <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-taupe">
                      {reg.map((r) => (
                        <li key={r.mes} className="flex items-center gap-1.5">
                          <span>
                            {r.mes}: <span className="text-tinta">{r.texto}</span>
                          </span>
                          <NivelChip nivel={r.nivel} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {registro.fallo && <p className="mt-3 text-[13px] text-taupe">{registro.fallo}</p>}
          <p className="mt-3 text-[13px] text-taupe">
            «Al colgarlas»: las unidades que se registraron al bajarlas al piso, no recién al venderlas. La carga inicial y las bajadas que se
            deshicieron con un retiro no cuentan. «Ventas a pedido» llega con los botones de la caja.
          </p>
          <div className="mt-4 flex justify-end border-t border-sand pt-4">
            <button type="button" onClick={cerrar} className="btn-cayla btn-secundario">
              Cerrar
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
