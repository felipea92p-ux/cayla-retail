"use client";

import { useState } from "react";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { Boton } from "@/components/ui/campos";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { NuevaOrdenProduccionForm } from "@/components/NuevaOrdenProduccionForm";
import { OrdenPanel } from "@/components/OrdenPanel";
import { AnularOrdenModal, RevertirOrdenModal } from "@/components/OrdenModales";
import { OrdenTarjeta, semaforoDeOrden } from "@/components/OrdenTarjeta";
import { useFlipCajas } from "@/lib/useFlipCajas";
import { COLUMNAS_TABLERO, etapaActual, resumenTablero } from "@/lib/produccion-reglas";
import type { ModeloProducible, OrdenProduccion } from "@/lib/produccion";
import type { ConsumoDeOrden, InsumoVista } from "@/lib/insumos";

// Órdenes de producción del Taller (ADR-0133, F2): un tablero por etapa en vez de una lista plana. La etapa donde
// está la orden ES su columna; al marcarla hecha la tarjeta viaja a la siguiente. Las muestras (otras tres
// etapas) van en su franja; las terminadas y anuladas siguen debajo, como antes. Toda escritura es una RPC
// (etapa, cerrar, anular, revertir): ninguna toca las tablas directo.

export function OrdenesTablero({
  tallerId,
  ordenes,
  modelos,
  esLider,
  hoy,
  insumos,
  consumosPorOrden,
}: {
  tallerId: string;
  ordenes: OrdenProduccion[];
  modelos: ModeloProducible[];
  esLider: boolean;
  hoy: string;
  insumos: InsumoVista[];
  consumosPorOrden: Record<string, ConsumoDeOrden[]>;
}) {
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [anulando, setAnulando] = useState<OrdenProduccion | null>(null);
  const [revirtiendo, setRevirtiendo] = useState<OrdenProduccion | null>(null);
  const [verTerminadas, setVerTerminadas] = useState(false);

  const enProceso = ordenes.filter((o) => o.estado === "en_proceso");
  const produccion = enProceso.filter((o) => !o.esMuestra);
  const muestras = enProceso.filter((o) => o.esMuestra);
  const terminadas = ordenes.filter((o) => o.estado === "terminada");
  const anuladas = ordenes.filter((o) => o.estado === "anulada");
  const resumen = resumenTablero(ordenes, hoy);

  const porColumna = (clave: string) => produccion.filter((o) => etapaActual(o.etapas, false) === clave);
  // Firma de «qué tarjeta está en qué columna»: solo cuando cambia se anima el viaje.
  const { ref: refTarjeta, contenedor: refTablero } = useFlipCajas(produccion.map((o) => `${o.id}:${etapaActual(o.etapas, false)}`).join("|"));

  const abierta = ordenes.find((o) => o.id === abiertaId && o.estado !== "anulada") ?? null;
  const urgentes = resumen.vencidas + resumen.pronto;
  let indice = 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tinta/65">
          {enProceso.length === 0 ? "Ninguna orden en proceso." : `${enProceso.length} en proceso`}
          {terminadas.length > 0 && ` · ${terminadas.length} terminadas`}
        </p>
        <Boton peso="primario" onClick={() => setNuevaAbierta(true)} disabled={modelos.length === 0}>
          + Nueva orden
        </Boton>
      </div>

      {modelos.length === 0 && (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          No hay modelos con variantes activas en el catálogo. Crea el modelo y sus tallas en Productos antes de abrir una orden.
        </p>
      )}

      {/* ==================== cifras ==================== */}
      <div className={`grid gap-3 sm:grid-cols-2 ${esLider ? "xl:grid-cols-3" : ""}`}>
        <TarjetaCifra compacta punto="verde" etiqueta="Órdenes en curso" className="anim-entra" style={{ ["--i" as string]: 0 }} valor={<CifraQueCuenta valor={resumen.enCurso} alMontar />}>
          {resumen.prendas} prendas planeadas
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          punto={resumen.vencidas > 0 ? "rojo" : urgentes > 0 ? "ambar" : "verde"}
          etiqueta="Entregas por atender"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          valor={<CifraQueCuenta valor={urgentes} alMontar />}
          detalleTono={resumen.vencidas > 0 ? "text-rojo-profundo" : urgentes > 0 ? "text-ambar-profundo" : "text-verde-profundo"}
        >
          {urgentes === 0 ? "todas con tiempo" : `${resumen.vencidas} pasadas · ${resumen.pronto} por vencer`}
        </TarjetaCifra>
        {esLider && (
          <TarjetaCifra
            compacta
            punto="verde"
            etiqueta="Margen promedio"
            className="anim-entra"
            style={{ ["--i" as string]: 2 }}
            vacia={resumen.margenPromedio === null}
            valor={resumen.margenPromedio === null ? "—" : <CifraQueCuenta valor={resumen.margenPromedio * 100} formato="porcentaje" alMontar />}
          >
            {resumen.margenPromedio === null ? "sin precio o costo todavía" : "sobre el precio de venta"}
          </TarjetaCifra>
        )}
      </div>

      {/* ==================== tablero ==================== */}
      {produccion.length === 0 && muestras.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todo lo abierto ya se cerró. Abre una orden para empezar una corrida.</p>
      ) : (
        <div ref={refTablero} className="relative grid auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3.5 overflow-x-auto pb-2">
          {COLUMNAS_TABLERO.map((col) => {
            const tarjetas = porColumna(col.clave);
            return (
              <section key={col.clave} aria-label={col.titulo} className="min-h-[9rem] rounded-2xl bg-sand/35 p-2.5">
                <header className="flex items-center justify-between px-1.5 pb-2.5 pt-1.5">
                  <h2 className="label-cayla text-[11px] text-tinta/65">{col.titulo}</h2>
                  <span className="text-xs tabular-nums text-tinta/65">{tarjetas.length}</span>
                </header>
                <div className="space-y-2.5">
                  {tarjetas.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-tinta/25 px-3 py-5 text-center text-xs text-tinta/65">
                      {col.clave === "listo" ? "Cuando terminen los acabados, la orden espera aquí para entrar al stock." : "Sin órdenes en esta etapa."}
                    </p>
                  ) : (
                    tarjetas.map((o) => (
                      <OrdenTarjeta key={o.id} orden={o} esLider={esLider} hoy={hoy} indice={indice++} refTarjeta={refTarjeta(o.id)} onAbrir={() => setAbiertaId(o.id)} />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ==================== muestras ==================== */}
      {muestras.length > 0 && (
        <section className="space-y-3">
          <h2 className="label-cayla text-[11px] text-tinta/65">Muestras en desarrollo</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {muestras.map((o) => (
              <OrdenTarjeta key={o.id} orden={o} esLider={esLider} hoy={hoy} indice={indice++} onAbrir={() => setAbiertaId(o.id)} />
            ))}
          </div>
        </section>
      )}

      {/* ==================== terminadas ==================== */}
      {terminadas.length > 0 && (
        <section className="space-y-2">
          <button
            type="button"
            aria-expanded={verTerminadas}
            onClick={() => setVerTerminadas((v) => !v)}
            className="label-cayla text-[11px] text-tinta/65 outline-none hover:text-tinta focus-visible:text-tinta"
          >
            Terminadas ({terminadas.length}) {verTerminadas ? "▾" : "▸"}
          </button>
          {/* Se abre por `grid-template-rows` (ADR-0128): sin medir alturas, sin salto. */}
          <div className={`grid transition-[grid-template-rows] duration-300 ease-cayla ${verTerminadas ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <ul className="min-h-0 space-y-2 overflow-hidden">
              {terminadas.map((o) => {
                const sem = semaforoDeOrden(o);
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      tabIndex={verTerminadas ? 0 : -1}
                      onClick={() => setAbiertaId(o.id)}
                      className="card-cayla alza-cayla flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-left text-sm"
                    >
                      <span className="font-display text-base text-tinta">{o.referencia}</span>
                      <span className="text-tinta/65">
                        {o.cantidadBuenas} buenas de {o.cantidadPlan}
                      </span>
                      {o.inventariadoEn ? <span className="text-xs text-tinta/65">en stock desde el {diaMes(o.inventariadoEn.slice(0, 10))}</span> : o.esMuestra ? <span className="text-xs text-tinta/65">muestra · no entra al stock</span> : null}
                      {esLider && (
                        <span className="ml-auto inline-flex items-center gap-2 tabular-nums text-tinta">
                          {soles(o.costoUnitario)}
                          {sem && <span aria-hidden className={`h-2 w-2 rounded-full ${sem.clase}`} />}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* ==================== anuladas ==================== */}
      {anuladas.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-cayla text-[11px] text-tinta/65">Anuladas</h2>
          {anuladas.map((o) => (
            <div key={o.id} className="card-cayla flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm text-tinta/65">
              <span className="text-tinta/80">{o.referencia}</span>
              <span>× {o.cantidadPlan}</span>
              {o.esMuestra && <span className="label-cayla text-[10px]">muestra</span>}
              {o.nota && <span className="truncate">— {o.nota}</span>}
              <span className="ml-auto text-xs">{diaMes(o.creadoEn.slice(0, 10))}</span>
            </div>
          ))}
        </section>
      )}

      {abierta && (
        <OrdenPanel
          key={abierta.id}
          orden={abierta}
          esLider={esLider}
          hoy={hoy}
          insumos={insumos}
          consumos={consumosPorOrden[abierta.id] ?? []}
          onCerrar={() => setAbiertaId(null)}
          onAnular={() => setAnulando(abierta)}
          onRevertir={() => setRevirtiendo(abierta)}
        />
      )}
      {nuevaAbierta && <NuevaOrdenProduccionForm tallerId={tallerId} modelos={modelos} onClose={() => setNuevaAbierta(false)} />}
      {anulando && <AnularOrdenModal orden={anulando} consumos={consumosPorOrden[anulando.id] ?? []} onClose={() => setAnulando(null)} />}
      {revirtiendo && <RevertirOrdenModal orden={revirtiendo} onClose={() => setRevirtiendo(null)} />}
    </div>
  );
}
