"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { MatrizOrdenTabla } from "@/components/MatrizOrden";
import { ChipEntrega, semaforoDeOrden } from "@/components/OrdenTarjeta";
import { OrdenCierre } from "@/components/OrdenCierre";
import { OrdenInsumos } from "@/components/OrdenInsumos";
import {
  desgloseCosto,
  estadoEntrega,
  etapaActual,
  etapasDe,
  matrizDeLineas,
  posicionEnMedidor,
  urlLlevarATiendas,
  type EstadoEtapa,
} from "@/lib/produccion-reglas";
import type { OrdenProduccion } from "@/lib/produccion";
import type { ConsumoDeOrden, InsumoVista } from "@/lib/insumos";

/** Debe coincidir con `.anim-cajon-salida` en globals.css. */
const MS_SALIDA = 240;

const COLOR_PARTE = {
  tela: "bg-tinta",
  avios: "bg-taupe",
  maquila: "bg-tinta/25",
} as const;

// Panel de una orden (ADR-0133, F2): al tocar una tarjeta se abre un cajón desde el borde derecho, con el tablero
// intacto detrás. Muestra dónde está la orden (etapas), qué se fabrica (talla × color), cuánto cuesta (solo el
// líder) y permite cerrarla por talla. Cierre en dos tiempos, igual que `ProveedorVistaRapida`: primero se anima la
// salida y recién ahí se le avisa al padre.
export function OrdenPanel({
  orden,
  tallerId,
  esLider,
  hoy,
  insumos,
  consumos,
  onCerrar,
  onAnular,
  onRevertir,
}: {
  orden: OrdenProduccion;
  tallerId: string;
  esLider: boolean;
  hoy: string;
  insumos: InsumoVista[];
  consumos: ConsumoDeOrden[];
  onCerrar: () => void;
  onAnular: () => void;
  onRevertir: () => void;
}) {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);
  const [cerrando, setCerrando] = useState(false); // el bloque de cierre por talla está abierto
  const [ocupada, setOcupada] = useState(false);
  const pedirSalida = useCallback(() => setSaliendo(true), []);
  useEffect(() => {
    if (!saliendo) return;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onCerrar, reducido ? 0 : MS_SALIDA);
    return () => clearTimeout(t);
  }, [saliendo, onCerrar]);

  const abierta = orden.estado === "en_proceso";
  // F8: una orden de producción cerrada deja prendas en el stock del Taller; el enlace lleva al traslado con el origen y las líneas ya puestas.
  const llevarUrl = orden.estado === "terminada" && !orden.esMuestra ? urlLlevarATiendas(tallerId, orden.lineas) : null;
  const etapas = etapasDe(orden.esMuestra);
  const actual = etapaActual(orden.etapas, orden.esMuestra);
  const entrega = estadoEntrega(orden.fechaEntrega, hoy);
  const matriz = matrizDeLineas(orden.lineas);
  const costo = desgloseCosto(orden.costoTela, orden.costoAvios, orden.costoMaquila);
  const sem = semaforoDeOrden(orden);

  async function fijarEtapa(clave: string, nuevo: EstadoEtapa, anterior: EstadoEtapa, mensaje: string) {
    setOcupada(true);
    const { error } = await createClient().rpc("set_etapa_produccion", {
      p_produccion_id: orden.id,
      p_etapa: clave,
      p_estado: nuevo,
    });
    setOcupada(false);
    if (error) {
      avisar.error(traducirError(error, "cambiar la etapa"));
      return;
    }
    avisar.exito(mensaje, {
      detalle: orden.referencia,
      accion: {
        texto: "Deshacer",
        onClick: async () => {
          const { error: e2 } = await createClient().rpc("set_etapa_produccion", {
            p_produccion_id: orden.id,
            p_etapa: clave,
            p_estado: anterior,
          });
          if (e2) avisar.error(traducirError(e2, "deshacer el cambio de etapa"));
          router.refresh();
        },
      },
    });
    router.refresh();
  }

  return (
    <Dialog.Root open onOpenChange={(a) => !a && pedirSalida()}>
      <Dialog.Portal>
        <Dialog.Overlay className={`fixed inset-0 z-50 bg-tinta/25 backdrop-blur-[2px] ${saliendo ? "anim-velo-salida" : "anim-velo"}`} />
        <Dialog.Content
          aria-describedby={undefined}
          className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[34rem] flex-col border-l border-sand bg-papel outline-none ${saliendo ? "anim-cajon-salida" : "anim-cajon"}`}
        >
          <header className="flex items-start justify-between gap-3 border-b border-sand px-6 pb-4 pt-5">
            <div className="min-w-0">
              <p className="label-cayla text-[11px] text-tinta/65">
                {[
                  orden.esMuestra ? "Muestra" : orden.categoria,
                  `${orden.cantidadPlan} prendas`,
                  orden.fechaEntrega ? `entrega ${diaMes(orden.fechaEntrega)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <Dialog.Title className="font-display mt-1 text-2xl leading-tight text-tinta">{orden.referencia}</Dialog.Title>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {abierta && <ChipEntrega entrega={entrega} />}
                {orden.estado === "terminada" && <Chip tono="verde">Terminada · {orden.cantidadBuenas} buenas</Chip>}
              </div>
            </div>
            <Dialog.Close
              className="rounded-full p-2 text-tinta/65 outline-none transition-colors hover:bg-tinta/10 hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 py-6">
            {/* -------- etapas (una orden terminada ya no las necesita: importa lo que salió) -------- */}
            {orden.estado !== "terminada" && (
              <section aria-label="Etapas">
                <h3 className="label-cayla mb-3 text-[11px] text-tinta/65">Etapas</h3>
                <ol className="grid grid-cols-3">
                  {etapas.map((e, i) => {
                    const estado = orden.etapas[e.clave] ?? "pendiente";
                    const esActual = abierta && e.clave === actual;
                    const previaHecha = i > 0 && orden.etapas[etapas[i - 1].clave] === "hecho";
                    return (
                      <li key={e.clave} className="relative pt-9 text-center">
                        {i > 0 && (
                          <>
                            <span aria-hidden className="absolute left-[calc(-50%+1rem)] right-[calc(50%+1rem)] top-[13px] h-0.5 bg-sand" />
                            <span
                              aria-hidden
                              className={`absolute left-[calc(-50%+1rem)] right-[calc(50%+1rem)] top-[13px] h-0.5 origin-left bg-verde transition-transform duration-700 ease-cayla ${previaHecha ? "scale-x-100" : "scale-x-0"}`}
                            />
                          </>
                        )}
                        <span
                          aria-hidden
                          className={`absolute left-1/2 top-0 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full border-2 transition-colors duration-300 ${
                            estado === "hecho"
                              ? "border-verde bg-verde text-crema"
                              : estado === "tercerizado"
                                ? "border-ambar bg-ambar/10 text-ambar-profundo"
                                : esActual
                                  ? "border-tinta bg-papel text-tinta"
                                  : "border-sand bg-papel text-tinta/50"
                          }`}
                        >
                          {estado === "hecho" ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5 fill-none stroke-current stroke-[2.6]"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className="trazo-linea anim-trazo" />
                            </svg>
                          ) : estado === "tercerizado" ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5 fill-none stroke-current stroke-[2.4]"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M5 12h14M13 6l6 6-6 6" />
                            </svg>
                          ) : (
                            <span className="text-xs font-semibold tabular-nums">{i + 1}</span>
                          )}
                        </span>
                        <p className="text-[13px] font-semibold text-tinta">{e.etiqueta}</p>
                        <p className="px-1 text-[11.5px] leading-snug text-tinta/65">
                          {estado === "tercerizado" ? "Con maquila externa" : e.detalle}
                        </p>
                        {abierta && esActual && (
                          <div className="mt-2.5 flex flex-col items-center gap-1.5">
                            <Boton
                              peso="primario"
                              disabled={ocupada}
                              className="!px-3 !py-2"
                              onClick={() => fijarEtapa(e.clave, "hecho", estado, `${e.etiqueta} hecho`)}
                            >
                              Marcar hecho
                            </Boton>
                            <Boton
                              peso="discreto"
                              disabled={ocupada}
                              className="!px-3 !py-2"
                              onClick={() =>
                                estado === "tercerizado"
                                  ? fijarEtapa(e.clave, "pendiente", estado, `${e.etiqueta} volvió al Taller`)
                                  : fijarEtapa(e.clave, "tercerizado", estado, `${e.etiqueta} salió a maquila externa`)
                              }
                            >
                              {estado === "tercerizado" ? "Traer de vuelta" : "Enviar a maquila"}
                            </Boton>
                          </div>
                        )}
                        {abierta && estado === "hecho" && (
                          <button
                            type="button"
                            disabled={ocupada}
                            onClick={() => fijarEtapa(e.clave, "pendiente", estado, `${e.etiqueta} reabierta`)}
                            className="mt-1.5 text-[11.5px] text-tinta/65 underline underline-offset-2 outline-none hover:text-tinta focus-visible:text-tinta disabled:opacity-50"
                          >
                            Reabrir
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {/* -------- qué se fabrica -------- */}
            <section aria-label="Qué se fabrica">
              <h3 className="label-cayla mb-3 text-[11px] text-tinta/65">
                {orden.estado === "terminada" ? "Lo que salió · talla × color" : "Qué se fabrica · talla × color"}
              </h3>
              <MatrizOrdenTabla matriz={matriz} modo={orden.estado === "terminada" ? "resultado" : "plan"} />
            </section>

            {/* -------- costo (solo el líder) -------- */}
            {esLider && (
              <section aria-label="Costo de la corrida">
                <h3 className="label-cayla mb-3 text-[11px] text-tinta/65">
                  {orden.estado === "terminada" ? "Costo real de la corrida" : "Costo de la corrida"}
                </h3>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="font-display text-4xl leading-none tabular-nums text-tinta">
                      {costo.total > 0 ? <CifraQueCuenta valor={orden.costoUnitario} formato="soles" alMontar /> : "—"}
                    </p>
                    <p className="mt-1 text-xs text-tinta/65">
                      por prenda · {soles(costo.total)} entre {orden.cantidadBuenas ?? orden.cantidadPlan}
                    </p>
                  </div>
                  <div className="text-right">
                    {sem && (
                      <Chip tono={sem.tono === "gana" ? "verde" : sem.tono === "filo" ? "ambar" : "rojo"}>
                        {sem.texto} · {Math.round(sem.margen * 100)}%
                      </Chip>
                    )}
                    {orden.precioVenta > 0 && <p className="mt-1.5 text-xs text-tinta/65">precio de venta {soles(orden.precioVenta)}</p>}
                  </div>
                </div>
                {costo.total > 0 && (
                  <>
                    <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full bg-tinta/10" aria-hidden>
                      {costo.partes.map((p, i) =>
                        p.parte > 0 ? (
                          <span
                            key={p.clave}
                            className={`anim-crece-x block h-full ${COLOR_PARTE[p.clave]}`}
                            style={{
                              width: `${p.parte * 100}%`,
                              ["--i" as string]: i,
                            }}
                          />
                        ) : null,
                      )}
                    </div>
                    <ul className="mt-3 space-y-1.5 text-[13px]">
                      {costo.partes.map((p) => (
                        <li key={p.clave} className="flex items-center gap-2.5">
                          <span aria-hidden className={`h-2.5 w-2.5 rounded-sm ${COLOR_PARTE[p.clave]}`} />
                          <span className="text-tinta/80">{p.etiqueta}</span>
                          <span className="ml-auto tabular-nums text-tinta/75">{soles(p.valor)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {sem && (
                  <div className="mt-5">
                    <div className="relative">
                      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                        <span className="flex-[40] bg-rojo/25" />
                        <span className="flex-[20] bg-ambar/30" />
                        <span className="flex-[40] bg-verde/30" />
                      </div>
                      <span
                        aria-hidden
                        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-papel bg-tinta shadow-[0_0_0_1px_var(--color-tinta)] transition-[left] duration-700 ease-cayla"
                        style={{
                          left: `${posicionEnMedidor(sem.margen) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-tinta/65">
                      <span>pierde &lt; 40%</span>
                      <span>al filo</span>
                      <span>gana ≥ 60%</span>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* -------- insumos descontados (F3) -------- */}
            {!orden.esMuestra && <OrdenInsumos orden={orden} insumos={insumos} consumos={consumos} esLider={esLider} editable={abierta} />}

            {orden.nota && <p className="text-sm text-tinta/75">— {orden.nota}</p>}

            {/* -------- cierre por talla -------- */}
            {abierta && cerrando && <OrdenCierre orden={orden} tallerId={tallerId} matriz={matriz} esLider={esLider} onHecho={pedirSalida} />}
          </div>

          {llevarUrl && (
            <section aria-label="Siguiente paso" className="mx-5 mb-4 rounded-2xl border border-sand bg-crema p-3.5">
              <p className="label-cayla text-[11px] text-tinta/65">Siguiente paso</p>
              <p className="mt-1 text-[13px] text-tinta/80">
                Las {orden.cantidadBuenas} prendas buenas están en el stock del Taller. Para venderlas hay que llevarlas a las tiendas: el traslado sale del Taller y cada tienda confirma lo que llegó.
              </p>
              <Link href={llevarUrl} className="label-cayla mt-2.5 inline-block rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo">
                Llevarlas a las tiendas
              </Link>
            </section>
          )}
          <footer className="flex gap-2 border-t border-sand px-6 py-4">
            {abierta && !cerrando && (
              <>
                <Boton peso="primario" className="flex-1" onClick={() => setCerrando(true)}>
                  {orden.esMuestra ? "Dar por terminada" : "Cerrar al inventario"}
                </Boton>
                <Boton peso="discreto" onClick={onAnular}>
                  Anular
                </Boton>
              </>
            )}
            {abierta && cerrando && (
              <Boton peso="discreto" className="flex-1" onClick={() => setCerrando(false)}>
                Volver sin cerrar
              </Boton>
            )}
            {orden.estado === "terminada" && (
              <Boton peso="discreto" onClick={onRevertir}>
                Revertir cierre
              </Boton>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
