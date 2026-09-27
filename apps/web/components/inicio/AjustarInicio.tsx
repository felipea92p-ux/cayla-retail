"use client";

import { useState, useTransition } from "react";
import { guardarEleccionInicio } from "@/app/actions/inicio";
import { Modal } from "@/components/ui/Modal";
import { estaElegido, type Aviso, type EleccionAvisos } from "@/lib/inicio-avisos";

// «Ajustar» de «Te toca»: el filtro personal del Inicio (Felipe, 2026-09-26). Solo lista avisos de módulos que la cuenta
// ve (llegan ya filtrados desde el servidor), arranca con lo recomendado para su rol y NO deja apagar lo que siempre es
// urgente (SUNAT, caja con diferencia): esos llevan candado. Lo que se apaga y después se vuelve urgente sale igual.
//
// Paso 1: la elección vive en una cookie por cuenta en este aparato (`app/actions/inicio.ts`); el servidor la lee y
// dibuja el Inicio ya filtrado.
// Paso 2 (pendiente): guardarla en la base para que siga a la persona en cualquier aparato.

type AvisoAjustable = Pick<Aviso, "clave" | "grupo" | "titulo" | "ocultable" | "urgenteSi">;

export function AjustarInicio({
  avisos,
  eleccionInicial,
  esLider,
  etiquetaRol,
}: {
  avisos: AvisoAjustable[];
  eleccionInicial: EleccionAvisos;
  esLider: boolean;
  etiquetaRol: string;
}) {
  const [, empezar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [eleccion, setEleccion] = useState<EleccionAvisos>(eleccionInicial);

  function guardar(nueva: EleccionAvisos) {
    setEleccion(nueva);
    // Sin loader a pantalla completa: es una preferencia de vista, el interruptor ya cambió al tocarlo.
    empezar(() => guardarEleccionInicio(nueva as Record<string, boolean>));
  }

  const grupos = [...new Set(avisos.map((a) => a.grupo))];

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] text-taupe transition-colors hover:bg-tinta/5"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="10" cy="17" r="2" />
        </svg>
        Ajustar
      </button>
      {abierto && (
        <Modal
          titulo="¿Qué quieres ver en «Te toca»?"
          subtitulo="Solo aparecen avisos de los módulos que tu rol ve. Lo urgente sale igual aunque lo apagues."
          onClose={() => setAbierto(false)}
          variante="hoja"
          ancho="max-w-lg"
        >
          {(cerrar) => (
            <div className="space-y-5">
              {grupos.map((g) => (
                <div key={g}>
                  <p className="label-cayla mb-2 text-[11px] text-tinta/65">{g}</p>
                  <div className="space-y-1.5">
                    {avisos
                      .filter((a) => a.grupo === g)
                      .map((a) => {
                        const activo = estaElegido(a, eleccion, esLider);
                        return (
                          <div key={a.clave} className="flex items-center gap-3 rounded-[10px] border border-sand bg-papel px-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-tinta">{a.titulo}</p>
                              {a.ocultable && a.urgenteSi && (
                                <p className="mt-0.5 text-xs text-rojo-profundo">Sale aunque lo apagues: {a.urgenteSi.toLowerCase()}</p>
                              )}
                            </div>
                            {a.ocultable ? (
                              <button
                                type="button"
                                role="switch"
                                aria-checked={activo}
                                aria-label={a.titulo}
                                onClick={() => guardar({ ...eleccion, [a.clave]: !activo })}
                                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${activo ? "bg-verde" : "bg-tinta/30"}`}
                              >
                                <span
                                  className={`absolute top-[3px] left-[3px] size-[18px] rounded-full bg-crema transition-transform duration-200 ease-cayla ${activo ? "translate-x-4" : ""}`}
                                />
                              </button>
                            ) : (
                              <span className="flex shrink-0 items-center gap-1 text-xs text-rojo-profundo">
                                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                                  <rect x="5" y="11" width="14" height="9" rx="2" />
                                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                                </svg>
                                Siempre visible
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" className="btn-cayla btn-secundario" onClick={() => guardar({})}>
                  Volver a lo recomendado para {etiquetaRol}
                </button>
                <button type="button" className="btn-cayla btn-primario" onClick={cerrar}>
                  Listo
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
