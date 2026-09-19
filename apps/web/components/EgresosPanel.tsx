"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { GastoModal } from "@/components/GastoModal";
import { AnularGastoModal, NoEsGastoModal } from "@/components/EgresosModales";
import { diaMes } from "@/lib/fechas-lima";
import { etiquetaComprobante, etiquetaMedioPago, lineaTarjeta, sugerenciaEgreso, type TarjetaSede } from "@/lib/gastos-reglas";
import type { CajaAbiertaGasto, CategoriaGasto, EgresoNoGasto, EgresoSinClasificar, GastoFila } from "@/lib/gastos";

// Pantalla de gastos (ADR-0117). Responde, en este orden, lo que decide quien la abre:
//   1. ¿Cuánto gastó CADA sede este mes, y cuánto la empresa? → una tarjeta por sede, nunca un
//      selector que esconda las otras (small multiples: comparar de un vistazo).
//   2. ¿Hay plata que salió de una caja y nadie dijo en qué? → «Egresos sin clasificar». No se
//      esconde ni se suma sola: hasta que el líder la clasifica, no entra en ninguna tarjeta.
//   3. ¿Qué gastos hay, y puedo corregir uno? → la lista, con su anulación.
// Las cifras vienen sumadas de Postgres; aquí no se suma nada de plata.

type Modal =
  | { tipo: "gasto" }
  | { tipo: "clasificar"; egreso: EgresoSinClasificar }
  | { tipo: "nogasto"; egreso: EgresoSinClasificar }
  | { tipo: "anular"; gasto: GastoFila };

const PLANTILLA = "sm:grid-cols-[3.5rem_7.5rem_minmax(0,1fr)_9rem_6.5rem_7rem_4.5rem]";
const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaHoraLima = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

export function EgresosPanel({
  tituloMes,
  mesAnterior,
  mesSiguiente,
  tarjetas,
  sinClasificar,
  noGasto,
  gastos,
  categorias,
  sedes,
  proveedores,
  cajasAbiertas,
  hoy,
}: {
  tituloMes: string;
  mesAnterior: string;
  mesSiguiente: string | null;
  tarjetas: TarjetaSede[];
  sinClasificar: { egresos: EgresoSinClasificar[]; total: number };
  noGasto: { marcas: EgresoNoGasto[]; total: number };
  gastos: GastoFila[];
  categorias: CategoriaGasto[];
  sedes: { id: string; nombre: string }[];
  proveedores: { id: string; nombre: string }[];
  cajasAbiertas: CajaAbiertaGasto[];
  hoy: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal | null>(null);
  const [revirtiendo, setRevirtiendo] = useState<string | null>(null);

  async function revertir(m: EgresoNoGasto) {
    setRevirtiendo(m.id);
    const { error } = await createClient().rpc("revertir_egreso_no_gasto", { p_id: m.id });
    setRevirtiendo(null);
    if (error) {
      avisar.error(traducirError(error, "revertir la marca"));
      return;
    }
    avisar.exito("El egreso volvió a «sin clasificar»", { detalle: `${soles(m.monto)} · ${m.ubicacionNombre}` });
    router.refresh();
  }

  const totalGeneral = tarjetas.reduce((s, t) => s + t.total, 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/60">Finanzas</p>
          <h1 className="font-display text-3xl text-tinta">Gastos</h1>
          <nav className="mt-2 flex items-center gap-3 text-sm text-tinta/70" aria-label="Mes">
            <Link href={`?mes=${mesAnterior}`} className="underline-offset-2 hover:text-rojo hover:underline" aria-label="Mes anterior">
              ‹
            </Link>
            <span className="capitalize text-tinta">{tituloMes}</span>
            {mesSiguiente ? (
              <Link href={`?mes=${mesSiguiente}`} className="underline-offset-2 hover:text-rojo hover:underline" aria-label="Mes siguiente">
                ›
              </Link>
            ) : (
              <span aria-hidden className="text-tinta/25">
                ›
              </span>
            )}
            <span className="text-tinta/55">· total {soles(totalGeneral)}</span>
          </nav>
        </div>
        <button type="button" onClick={() => setModal({ tipo: "gasto" })} className="label-cayla inline-flex items-center gap-1.5 rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo">
          <Plus aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
          Registrar gasto
        </button>
      </header>

      {/* 1. Una tarjeta por sede + «De la empresa» */}
      <section aria-label="Gastos por sede" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tarjetas.map((t) => (
          <TarjetaCifra key={t.ubicacionId ?? "empresa"} etiqueta={t.nombre} valor={soles(t.total)} vacia={t.nGastos === 0}>
            {lineaTarjeta(t)}
          </TarjetaCifra>
        ))}
      </section>

      {/* 2. Egresos de caja sin clasificar */}
      <section aria-labelledby="sin-clasificar" className="space-y-3">
        <div>
          <h2 id="sin-clasificar" className="font-display text-xl text-tinta">
            Egresos de caja sin clasificar{sinClasificar.total > 0 && <span className="text-rojo"> · {sinClasificar.total}</span>}
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-tinta/65">
            Plata que salió de una caja y todavía nadie dijo si fue un gasto. No entra en ninguna tarjeta de arriba hasta que la clasifiques: así un depósito al banco no se cuenta como gasto, y una compra de insumos no se cuenta dos veces.
          </p>
        </div>
        {sinClasificar.egresos.length === 0 ? (
          <p className="card-cayla px-5 py-4 text-sm text-tinta/65">No hay egresos sin clasificar. Todo lo que salió de caja ya tiene destino.</p>
        ) : (
          <ul className="card-cayla divide-y divide-tinta/10">
            {sinClasificar.egresos.map((e) => {
              const sugerido = sugerenciaEgreso(e.motivo, e.esAjuste);
              const base = "label-cayla rounded-md border px-3 py-1.5 text-[10px] transition-colors";
              const primario = `${base} border-tinta bg-tinta text-crema hover:bg-rojo hover:border-rojo`;
              const secundario = `${base} border-tinta/25 text-tinta hover:border-rojo hover:text-rojo`;
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-tinta">
                      <span className="tabular-nums">{soles(e.monto)}</span> · {e.motivo}
                      {e.esAjuste && <Chip tono="ambar" className="ml-2">Ajuste</Chip>}
                    </p>
                    <p className="text-xs text-tinta/60">
                      {e.ubicacionNombre} · {fechaHoraLima(e.creadoEn)}
                      {e.registradoPorNombre ? ` · ${e.registradoPorNombre}` : ""}
                      {e.nota ? ` · ${e.nota}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setModal({ tipo: "clasificar", egreso: e })} className={sugerido === "no_gasto" ? secundario : primario}>
                      Es un gasto
                    </button>
                    <button type="button" onClick={() => setModal({ tipo: "nogasto", egreso: e })} className={sugerido === "no_gasto" ? primario : secundario}>
                      No es gasto
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {sinClasificar.total > sinClasificar.egresos.length && (
          <p className="text-xs text-tinta/60">
            Mostrando los {sinClasificar.egresos.length} más recientes de {sinClasificar.total}. Al clasificarlos aparecen los siguientes.
          </p>
        )}
      </section>

      {/* 3. La lista de gastos del mes */}
      <section aria-labelledby="lista-gastos" className="space-y-3">
        <h2 id="lista-gastos" className="font-display text-xl text-tinta">
          Gastos de {tituloMes}
        </h2>
        {gastos.length === 0 ? (
          <p className="card-cayla px-5 py-4 text-sm text-tinta/65">Todavía no se registró ningún gasto este mes.</p>
        ) : (
          <Tabla>
            <Encabezado
              plantilla={PLANTILLA}
              columnas={[
                { titulo: "Fecha" },
                { titulo: "De quién" },
                { titulo: "Gasto" },
                { titulo: "Comprobante" },
                { titulo: "Pagado con" },
                { titulo: "Monto", alinear: "der" },
                { titulo: "" },
              ]}
            />
            {gastos.map((g) => {
              const anulado = g.estado === "anulado";
              return (
                <div key={g.id} className={fila(PLANTILLA, anulado ? "text-tinta/50" : "")}>
                  <span className={celda("izq", "text-sm tabular-nums")}>{diaMes(g.fecha)}</span>
                  <span className={celda("izq", "text-sm")}>{g.ubicacionNombre ?? "De la empresa"}</span>
                  <span className={celda("izq", "overflow-visible whitespace-normal")}>
                    <span className={`block text-sm ${anulado ? "line-through" : "text-tinta"}`}>{g.descripcion}</span>
                    <span className="block text-xs text-tinta/60">
                      {g.categoriaNombre}
                      {g.proveedorNombre ? ` · ${g.proveedorNombre}` : ""}
                      {anulado && g.motivoAnulacion ? ` · anulado: ${g.motivoAnulacion}` : ""}
                    </span>
                  </span>
                  <span className={celda("izq", "overflow-visible whitespace-normal text-sm")}>
                    {etiquetaComprobante(g.comprobanteTipo)}
                    {g.comprobanteNumero ? <span className="block text-xs text-tinta/60">{g.comprobanteNumero}</span> : null}
                  </span>
                  <span className={celda("izq", "text-sm")}>{etiquetaMedioPago(g.medioPago)}</span>
                  <span className={celda("der", `text-sm ${anulado ? "line-through" : "text-tinta"}`)}>{soles(g.montoTotal)}</span>
                  <span className={celda("der")}>
                    {anulado ? (
                      <Chip tono="apagado">Anulado</Chip>
                    ) : (
                      <button type="button" onClick={() => setModal({ tipo: "anular", gasto: g })} className="text-xs text-tinta/60 underline-offset-2 hover:text-rojo hover:underline">
                        Anular
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </Tabla>
        )}
      </section>

      {/* 4. Lo ya marcado «no es gasto»: el único camino para revertir una marca equivocada */}
      {noGasto.total > 0 && (
        <details className="card-cayla px-5 py-3">
          <summary className="cursor-pointer text-sm text-tinta/80">Marcados como «no es gasto» · {noGasto.total}</summary>
          <ul className="mt-3 divide-y divide-tinta/10">
            {noGasto.marcas.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <p className="min-w-0 text-sm text-tinta">
                  <span className="tabular-nums">{soles(m.monto)}</span> · {m.motivoEgreso}
                  <span className="block text-xs text-tinta/60">
                    {m.ubicacionNombre} · «{m.motivo}»{m.marcadoPorNombre ? ` · ${m.marcadoPorNombre}` : ""}
                  </span>
                </p>
                <button type="button" disabled={revirtiendo === m.id} onClick={() => revertir(m)} className="text-xs text-tinta/60 underline-offset-2 hover:text-rojo hover:underline disabled:opacity-50">
                  {revirtiendo === m.id ? "Revirtiendo…" : "Fue un error: revertir"}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {modal?.tipo === "gasto" && <GastoModal categorias={categorias} sedes={sedes} proveedores={proveedores} cajasAbiertas={cajasAbiertas} hoy={hoy} onClose={() => setModal(null)} />}
      {modal?.tipo === "clasificar" && (
        <GastoModal categorias={categorias} sedes={sedes} proveedores={proveedores} cajasAbiertas={cajasAbiertas} hoy={hoy} egreso={modal.egreso} onClose={() => setModal(null)} />
      )}
      {modal?.tipo === "nogasto" && <NoEsGastoModal egreso={modal.egreso} onClose={() => setModal(null)} />}
      {modal?.tipo === "anular" && <AnularGastoModal gasto={modal.gasto} onClose={() => setModal(null)} />}
    </div>
  );
}
