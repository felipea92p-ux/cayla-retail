"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoMonto, SelectNativo } from "@/components/ui/campos";
import { Modal, campoEtiqueta, campoTexto, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { NuevaOrdenProduccionForm } from "@/components/NuevaOrdenProduccionForm";
import { ETAPAS_MUESTRA, ETAPAS_PRODUCCION, semaforoMargen, type EstadoEtapa } from "@/lib/produccion-reglas";
import type { ModeloProducible, OrdenProduccion } from "@/lib/produccion";

// Producción del Taller (V2, 2026-09-15). Tres listas —en proceso, terminadas,
// anuladas— y cuatro acciones, cada una una RPC: etapa, cerrar, anular,
// revertir. Ninguna escribe en las tablas directo (no hay policy que lo
// permita): si la base dice que no, el aviso lo dice con las palabras de la
// RPC (`traducirError` deja pasar los P0001 tal cual).

const ESTADOS_ETAPA: { valor: EstadoEtapa; texto: string }[] = [
  { valor: "pendiente", texto: "Pendiente" },
  { valor: "hecho", texto: "Hecho" },
  { valor: "tercerizado", texto: "Tercerizado" },
];

function soles(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fechaCorta(iso: string | null) {
  if (!iso) return null;
  // Las fechas `date` llegan como YYYY-MM-DD sin hora: se leen como locales
  // para que el 15 no se vuelva 14 al restar el huso de Lima.
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

const SEMAFORO = {
  gana: { texto: "Gana", clase: "bg-verde" },
  filo: { texto: "Al filo", clase: "bg-ambar" },
  pierde: { texto: "Pierde", clase: "bg-rojo" },
} as const;

function semaforo(precio: number, costo: number): { texto: string; clase: string } | null {
  const s = semaforoMargen(precio, costo);
  if (!s) return null;
  return { texto: `${SEMAFORO[s.tono].texto} · ${Math.round(s.margen * 100)}%`, clase: SEMAFORO[s.tono].clase };
}

export function OrdenesProduccionV2({
  tallerId,
  ordenes,
  modelos,
}: {
  tallerId: string;
  ordenes: OrdenProduccion[];
  modelos: ModeloProducible[];
}) {
  const router = useRouter();
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [cerrando, setCerrando] = useState<OrdenProduccion | null>(null);
  const [anulando, setAnulando] = useState<OrdenProduccion | null>(null);
  const [revirtiendo, setRevirtiendo] = useState<OrdenProduccion | null>(null);
  const [ocupadaId, setOcupadaId] = useState<string | null>(null);

  const enProceso = ordenes.filter((o) => o.estado === "en_proceso");
  const terminadas = ordenes.filter((o) => o.estado === "terminada");
  const anuladas = ordenes.filter((o) => o.estado === "anulada");

  async function fijarEtapa(orden: OrdenProduccion, etapa: string, estado: EstadoEtapa) {
    setOcupadaId(orden.id);
    const { error } = await createClient().rpc("set_etapa_produccion", {
      p_produccion_id: orden.id,
      p_etapa: etapa,
      p_estado: estado,
    });
    setOcupadaId(null);
    if (error) {
      avisar.error(traducirError(error, "cambiar la etapa"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-8">
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

      {/* ==================== En proceso ==================== */}
      <section className="space-y-3">
        <h2 className="label-cayla text-[11px] text-tinta/65">En proceso</h2>
        {enProceso.length === 0 ? (
          <p className="card-cayla p-5 text-sm text-tinta/75">Todo lo abierto ya se cerró. Abre una orden para empezar una corrida.</p>
        ) : (
          enProceso.map((o) => (
            <OrdenEnProceso
              key={o.id}
              orden={o}
              ocupada={ocupadaId === o.id}
              onEtapa={(etapa, estado) => fijarEtapa(o, etapa, estado)}
              onCerrar={() => setCerrando(o)}
              onAnular={() => setAnulando(o)}
            />
          ))
        )}
      </section>

      {/* ==================== Terminadas ==================== */}
      {terminadas.length > 0 && (
        <section className="space-y-3">
          <h2 className="label-cayla text-[11px] text-tinta/65">Terminadas</h2>
          {terminadas.map((o) => (
            <OrdenTerminada key={o.id} orden={o} onRevertir={() => setRevirtiendo(o)} />
          ))}
        </section>
      )}

      {/* ==================== Anuladas ==================== */}
      {anuladas.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-cayla text-[11px] text-tinta/65">Anuladas</h2>
          {anuladas.map((o) => (
            <div key={o.id} className="card-cayla flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm text-tinta/65">
              <span className="text-tinta/80">{o.referencia}</span>
              <span>× {o.cantidadPlan}</span>
              {o.esMuestra && <span className="label-cayla text-[10px]">muestra</span>}
              {o.nota && <span className="truncate">— {o.nota}</span>}
              <span className="ml-auto text-xs">{fechaCorta(o.creadoEn)}</span>
            </div>
          ))}
        </section>
      )}

      {nuevaAbierta && <NuevaOrdenProduccionForm tallerId={tallerId} modelos={modelos} onClose={() => setNuevaAbierta(false)} />}
      {cerrando && <CierreOrdenModal orden={cerrando} onClose={() => setCerrando(null)} />}
      {anulando && <AnularOrdenModal orden={anulando} onClose={() => setAnulando(null)} />}
      {revirtiendo && <RevertirOrdenModal orden={revirtiendo} onClose={() => setRevirtiendo(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Lineas({ lineas, mostrarBuenas }: { lineas: OrdenProduccion["lineas"]; mostrarBuenas: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {lineas.map((l) => (
        <span
          key={l.varianteId}
          className="inline-flex items-center gap-1.5 rounded-md border border-tinta/15 px-2 py-1 text-xs text-tinta/80"
          title={l.sku}
        >
          {l.colorHex && <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-tinta/15" style={{ background: l.colorHex }} />}
          {[l.color, l.talla].filter(Boolean).join(" · ") || l.sku}
          <span className="font-medium text-tinta">
            × {mostrarBuenas && l.cantidadBuenas !== null ? `${l.cantidadBuenas}/${l.cantidadPlan}` : l.cantidadPlan}
          </span>
        </span>
      ))}
    </div>
  );
}

function OrdenEnProceso({
  orden,
  ocupada,
  onEtapa,
  onCerrar,
  onAnular,
}: {
  orden: OrdenProduccion;
  ocupada: boolean;
  onEtapa: (etapa: string, estado: EstadoEtapa) => void;
  onCerrar: () => void;
  onAnular: () => void;
}) {
  const etapas = orden.esMuestra ? ETAPAS_MUESTRA : ETAPAS_PRODUCCION;
  const costoDirecto = orden.costoTela + orden.costoAvios + orden.costoMaquila;
  const sem = semaforo(orden.precioVenta, orden.costoUnitario);
  const hoy = new Date().toISOString().slice(0, 10);
  const vencida = !!orden.fechaEntrega && orden.fechaEntrega < hoy;

  return (
    <article className="card-cayla space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg text-tinta">{orden.referencia}</h3>
            {orden.esMuestra && (
              <span className="label-cayla rounded-full border border-tinta/20 px-2 py-0.5 text-[10px] text-tinta/70">Muestra</span>
            )}
            {orden.categoria && <span className="text-xs text-tinta/65">{orden.categoria}</span>}
          </div>
          <p className="mt-0.5 text-xs text-tinta/65">
            {orden.cantidadPlan} prendas planeadas · abierta el {fechaCorta(orden.creadoEn)}
            {orden.fechaEntrega && (
              <>
                {" · "}
                <span className={vencida ? "font-medium text-rojo" : ""}>
                  entrega {fechaCorta(orden.fechaEntrega)}
                  {vencida && " (pasada)"}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-lg text-tinta">{soles(orden.costoUnitario)}</p>
          <p className="text-[11px] text-tinta/65">costo estimado / prenda</p>
          {sem && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-tinta/75">
              <span aria-hidden className={`h-2 w-2 rounded-full ${sem.clase}`} />
              {sem.texto} vs. {soles(orden.precioVenta)}
            </p>
          )}
        </div>
      </div>

      <Lineas lineas={orden.lineas} mostrarBuenas={false} />

      {/* Etapas: un select por etapa. Es lo que el Taller marca varias veces al
          día — un control nativo, grande, sin modal de por medio. */}
      <div className="grid gap-2 sm:grid-cols-3">
        {etapas.map((e) => {
          const estado = orden.etapas[e.clave] ?? "pendiente";
          return (
            <label key={e.clave} className="space-y-1" title={e.detalle}>
              <span className={`${campoEtiqueta} flex items-center gap-1.5`}>
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${estado === "hecho" ? "bg-verde" : estado === "tercerizado" ? "bg-ambar" : "bg-tinta/25"}`} />
                {e.etiqueta}
              </span>
              <SelectNativo value={estado} disabled={ocupada} onChange={(ev) => onEtapa(e.clave, ev.target.value as EstadoEtapa)}>
                {ESTADOS_ETAPA.map((s) => (
                  <option key={s.valor} value={s.valor}>
                    {s.texto}
                  </option>
                ))}
              </SelectNativo>
            </label>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tinta/65">
        <span>Tela {soles(orden.costoTela)}</span>
        <span>Avíos {soles(orden.costoAvios)}</span>
        <span>Maquila {soles(orden.costoMaquila)}</span>
        <span className="text-tinta/80">Total {soles(costoDirecto)}</span>
        {orden.nota && <span className="basis-full truncate">— {orden.nota}</span>}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Boton peso="primario" onClick={onCerrar} disabled={ocupada}>
          {orden.esMuestra ? "Dar por terminada" : "Cerrar al inventario"}
        </Boton>
        <Boton peso="discreto" onClick={onAnular} disabled={ocupada}>
          Anular
        </Boton>
      </div>
    </article>
  );
}

function OrdenTerminada({ orden, onRevertir }: { orden: OrdenProduccion; onRevertir: () => void }) {
  const sem = semaforo(orden.precioVenta, orden.costoUnitario);
  return (
    <article className="card-cayla space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base text-tinta">{orden.referencia}</h3>
            {orden.esMuestra && (
              <span className="label-cayla rounded-full border border-tinta/20 px-2 py-0.5 text-[10px] text-tinta/70">Muestra</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-tinta/65">
            {orden.cantidadBuenas} buenas de {orden.cantidadPlan}
            {orden.inventariadoEn
              ? ` · en stock del Taller desde el ${fechaCorta(orden.inventariadoEn)}`
              : orden.esMuestra
                ? " · no entra al stock"
                : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-base text-tinta">{soles(orden.costoUnitario)}</p>
          <p className="text-[11px] text-tinta/65">costo real / prenda</p>
          {sem && (
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-tinta/75">
              <span aria-hidden className={`h-2 w-2 rounded-full ${sem.clase}`} />
              {sem.texto}
            </p>
          )}
        </div>
      </div>
      <Lineas lineas={orden.lineas} mostrarBuenas />
      <div className="flex justify-end">
        <Boton peso="discreto" onClick={onRevertir}>
          Revertir cierre
        </Boton>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */

// Cerrar: cuántas salieron buenas por talla-color y el costo REAL de la
// corrida. La base recalcula el costo unitario sobre las buenas (la merma se
// absorbe sola) y, si no es muestra, mete la entrada al stock del Taller.
function CierreOrdenModal({ orden, onClose }: { orden: OrdenProduccion; onClose: () => void }) {
  const router = useRouter();
  const [buenas, setBuenas] = useState<Record<string, string>>(
    Object.fromEntries(orden.lineas.map((l) => [l.varianteId, String(l.cantidadPlan)]))
  );
  const [tela, setTela] = useState(String(orden.costoTela));
  const [avios, setAvios] = useState(String(orden.costoAvios));
  const [maquila, setMaquila] = useState(String(orden.costoMaquila));
  const [cargando, setCargando] = useState(false);

  const totalBuenas = orden.lineas.reduce((s, l) => s + (Number(buenas[l.varianteId]) || 0), 0);
  const costoTotal = (Number(tela) || 0) + (Number(avios) || 0) + (Number(maquila) || 0);
  const unitario = totalBuenas > 0 ? costoTotal / totalBuenas : 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (totalBuenas <= 0) {
      avisar.error("No salió ninguna prenda buena — si la corrida se perdió, anula la orden en vez de cerrarla.");
      return;
    }
    setCargando(true);
    const { error } = await createClient().rpc("cerrar_produccion", {
      p_produccion_id: orden.id,
      p_buenas: orden.lineas.map((l) => ({ variante_id: l.varianteId, cantidad: Math.max(0, Math.floor(Number(buenas[l.varianteId]) || 0)) })),
      p_costo_tela: Number(tela) || 0,
      p_costo_avios: Number(avios) || 0,
      p_costo_maquila: Number(maquila) || 0,
    });
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "cerrar la orden"));
      return;
    }
    avisar.exito(
      orden.esMuestra ? `Muestra ${orden.referencia} terminada` : `${totalBuenas} prendas de ${orden.referencia} entraron al stock del Taller`,
      { detalle: `Costo real ${soles(unitario)} por prenda` }
    );
    router.refresh();
    onClose();
  }

  return (
    <Modal
      titulo={orden.esMuestra ? "Dar por terminada la muestra" : "Cerrar al inventario"}
      subtitulo={`${orden.referencia} · ${orden.cantidadPlan} planeadas`}
      onClose={onClose}
      ancho="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <span className={campoEtiqueta}>Cuántas salieron buenas</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {orden.lineas.map((l) => (
              <label key={l.varianteId} className="flex items-center justify-between gap-3 rounded-md border border-tinta/15 px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5 text-tinta/80">
                  {l.colorHex && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-tinta/15" style={{ background: l.colorHex }} />}
                  <span className="truncate">{[l.color, l.talla].filter(Boolean).join(" · ") || l.sku}</span>
                  <span className="shrink-0 text-xs text-tinta/65">de {l.cantidadPlan}</span>
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={buenas[l.varianteId] ?? ""}
                  onChange={(e) => setBuenas((b) => ({ ...b, [l.varianteId]: e.target.value }))}
                  className="w-16 border-b border-tinta/20 bg-transparent px-1 py-1 text-right text-sm text-tinta outline-none focus:border-rojo"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <CampoMonto etiqueta="Tela (real)" inputMode="decimal" value={tela} onChange={(e) => setTela(e.target.value)} />
          <CampoMonto etiqueta="Avíos (real)" inputMode="decimal" value={avios} onChange={(e) => setAvios(e.target.value)} />
          <CampoMonto etiqueta="Maquila (real)" inputMode="decimal" value={maquila} onChange={(e) => setMaquila(e.target.value)} />
        </div>

        <div className="flex items-baseline justify-between rounded-md bg-sand/60 px-3 py-2 text-sm">
          <span className="text-tinta/70">
            {totalBuenas} buenas · costo {soles(costoTotal)}
          </span>
          <span className="font-display text-lg text-tinta">{soles(unitario)} / prenda</span>
        </div>

        {!orden.esMuestra && (
          <p className="text-xs text-tinta/65">
            Al confirmar, cada talla entra al stock del Taller con este costo y queda registrada en Movimientos. Si algo sale mal, la orden se puede revertir.
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={cargando} className={botonPrimario}>
            {cargando ? "Cerrando…" : orden.esMuestra ? "Terminar muestra" : "Confirmar e inventariar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AnularOrdenModal({ orden, onClose }: { orden: OrdenProduccion; onClose: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    const { error } = await createClient().rpc("anular_produccion", { p_produccion_id: orden.id, p_motivo: motivo.trim() || undefined });
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "anular la orden"));
      return;
    }
    avisar.exito(`Orden de ${orden.referencia} anulada`);
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Anular orden" subtitulo={`${orden.referencia} · ${orden.cantidadPlan} planeadas`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-tinta/75">La orden queda anulada y no toca el stock. Sigue visible abajo, para que no se pierda el registro.</p>
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="anular-motivo">
            Motivo (opcional)
          </label>
          <input id="anular-motivo" type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se cancela la corrida" className={campoTexto} />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={botonCancelar}>
            Volver
          </button>
          <button type="submit" disabled={cargando} className={botonPrimario}>
            {cargando ? "Anulando…" : "Anular orden"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RevertirOrdenModal({ orden, onClose }: { orden: OrdenProduccion; onClose: () => void }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);

  async function confirmar() {
    setCargando(true);
    const { error } = await createClient().rpc("revertir_produccion", { p_produccion_id: orden.id });
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "revertir el cierre"));
      return;
    }
    avisar.exito(`Orden de ${orden.referencia} vuelve a estar en proceso`);
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Revertir cierre" subtitulo={`${orden.referencia} · ${orden.cantidadBuenas} buenas`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-tinta/75">
          {orden.inventariadoEn
            ? `Las ${orden.cantidadBuenas} prendas salen del stock del Taller (queda un movimiento de reversión, la entrada original no se borra) y la orden vuelve a "en proceso" para corregir buenas o costos.`
            : "La muestra vuelve a \"en proceso\". No había stock que devolver."}
        </p>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={botonCancelar}>
            Volver
          </button>
          <button type="button" onClick={confirmar} disabled={cargando} className={botonPrimario}>
            {cargando ? "Revirtiendo…" : "Revertir"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
