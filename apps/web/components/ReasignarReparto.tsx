"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { CampoSelectNativo, CampoTexto } from "@/components/ui/campos";
import type { CompraResumen } from "@/lib/compras-reglas";
import {
  errorDeReasignacion,
  ETIQUETA_MOTIVO_REASIGNACION,
  filasDeLinea,
  MOTIVOS_REASIGNACION,
  tiendasConPendiente,
  type FilaReparto,
  type MotivoReasignacion,
} from "@/lib/reparto-reglas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Mover mercadería de una tienda a otra DENTRO de un comprobante ya registrado (ADR-0139). Solo un líder, y solo lo que
// aún no se recibió ni se cerró como faltante: lo que ya entró al stock de una tienda no se mueve por aquí (para eso
// están los traslados). Queda un rastro en `compra_reasignaciones` (quién, cuánto, de dónde a dónde, por qué).
//
// Cuándo hace falta: la mercadería llegó a una tienda distinta de la que decía el comprobante, o se repartió mal al
// registrarlo. Sin esto, recibirla «ahí» se rechaza («esa línea no tiene mercadería asignada a esta tienda»).

type Tienda = { id: string; nombre: string };
export type LineaReasignable = { id: string; producto: string };

const BTN_PRIMARIO = "label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-50";

export function BotonReasignar({
  compra,
  lineas,
  filas,
  ubicaciones,
  lineaInicialId,
  etiqueta = "Reasignar entre tiendas",
}: {
  compra: CompraResumen;
  /** Las líneas del comprobante, con el nombre con el que se muestran. */
  lineas: LineaReasignable[];
  filas: FilaReparto[];
  /** Las tiendas activas, en el orden de la app: de ahí se elige «a dónde va». */
  ubicaciones: Tienda[];
  /** Abre el modal con esta línea ya elegida (el enlace de su fila). */
  lineaInicialId?: string;
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="label-cayla inline-flex items-center gap-1.5 text-[11px] text-rojo hover:underline">
        <ArrowLeftRight aria-hidden className="h-3.5 w-3.5" />
        {etiqueta}
      </button>
      {abierto && <ReasignarRepartoModal compra={compra} lineas={lineas} filas={filas} ubicaciones={ubicaciones} lineaInicialId={lineaInicialId} onClose={() => setAbierto(false)} />}
    </>
  );
}

function ReasignarRepartoModal({
  compra,
  lineas,
  filas,
  ubicaciones,
  lineaInicialId,
  onClose,
}: {
  compra: CompraResumen;
  lineas: LineaReasignable[];
  filas: FilaReparto[];
  ubicaciones: Tienda[];
  lineaInicialId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const nombreDe = (id: string) => ubicaciones.find((u) => u.id === id)?.nombre ?? "Otra tienda";
  const orden = useMemo(() => ubicaciones.map((u) => u.id), [ubicaciones]);

  // Solo las líneas a las que aún les falta recibir algo en alguna tienda: de las demás no hay nada que mover.
  const reasignables = useMemo(() => lineas.filter((l) => tiendasConPendiente(filasDeLinea(filas, l.id, orden)).length > 0), [lineas, filas, orden]);

  // Valores iniciales pensados para el caso más común: mover TODO lo que falta de la primera tienda que tiene pendiente,
  // hacia la tienda que ya recibe otra parte de la misma línea (si es una sola).
  function iniciales(lineaId: string) {
    const propias = filasDeLinea(filas, lineaId, orden);
    const origen = tiendasConPendiente(propias)[0];
    const otras = propias.filter((f) => f.ubicacionId !== origen?.ubicacionId);
    return { desdeId: origen?.ubicacionId ?? "", haciaId: otras.length === 1 ? otras[0].ubicacionId : "", cantidad: origen ? String(origen.pendiente) : "" };
  }

  const primera = reasignables.find((l) => l.id === lineaInicialId)?.id ?? reasignables[0]?.id ?? "";
  const inicio = iniciales(primera);
  const [lineaId, setLineaId] = useState(primera);
  const [desdeId, setDesdeId] = useState(inicio.desdeId);
  const [haciaId, setHaciaId] = useState(inicio.haciaId);
  const [cantidad, setCantidad] = useState(inicio.cantidad);
  const [motivo, setMotivo] = useState<MotivoReasignacion | "">("");
  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);
  // Quién mueve la mercadería (ADR-0161/0162): `reasignar_reparto_compra` firma con esa persona.
  const responsable = useResponsable();

  const propias = filasDeLinea(filas, lineaId, orden);
  const origenes = tiendasConPendiente(propias);
  const origen = propias.find((f) => f.ubicacionId === desdeId);
  const destino = propias.find((f) => f.ubicacionId === haciaId);
  const n = Math.floor(Number(cantidad));
  const linea = reasignables.find((l) => l.id === lineaId);
  const error = errorDeReasignacion({
    desdeId,
    haciaId,
    cantidad: n,
    pendienteDesde: origen?.pendiente ?? 0,
    nombreDesde: nombreDe(desdeId),
    motivo,
    nota,
  });
  const cantidadOk = Number.isInteger(n) && n >= 1 && n <= (origen?.pendiente ?? 0);

  function elegirLinea(id: string) {
    const i = iniciales(id);
    setLineaId(id);
    setDesdeId(i.desdeId);
    setHaciaId(i.haciaId);
    setCantidad(i.cantidad);
  }

  function elegirOrigen(id: string) {
    setDesdeId(id);
    if (id === haciaId) setHaciaId("");
    const f = propias.find((x) => x.ubicacionId === id);
    setCantidad(f ? String(f.pendiente) : "");
  }

  async function reasignar() {
    if (error) return void avisar.error(error);
    if (!responsable.listo) return void (responsable.motivo && avisar.error(responsable.motivo));
    setLoading(true);
    const { error: fallo } = await firmar(createClient().rpc("reasignar_reparto_compra", {
      p_compra_item_id: lineaId,
      p_desde: desdeId,
      p_hacia: haciaId,
      p_cantidad: n,
      p_motivo: motivo as MotivoReasignacion,
      ...(nota.trim() ? { p_nota: nota.trim() } : {}),
    }), responsable.firma());
    setLoading(false);
    responsable.despues(fallo);
    if (fallo) return void avisar.error(traducirError(fallo, "reasignar la mercadería"));
    avisar.exito(`${n} ${n === 1 ? "unidad reasignada" : "unidades reasignadas"} a ${nombreDe(haciaId)}`, {
      detalle: `Ahora ${nombreDe(haciaId)} puede recibir ${(destino?.asignado ?? 0) + n} de ${linea?.producto ?? "esta línea"}; ${nombreDe(desdeId)} queda con ${(origen?.asignado ?? 0) - n}.`,
    });
    router.refresh();
    onClose();
  }

  return (
    <Modal
      titulo={
        <>
          <span className="label-cayla mb-0.5 block text-[11px] text-tinta/65">Reasignar entre tiendas</span>
          <span className="block text-[28px] leading-tight">Mover mercadería</span>
        </>
      }
      subtitulo={`Comprobante ${compra.documento} · ${compra.proveedorNombre}`}
      ancho="max-w-xl"
      onClose={onClose}
    >
      {() =>
        reasignables.length === 0 ? (
          <p className="text-sm text-tinta/75">A este comprobante ya no le falta recibir nada en ninguna tienda: no hay mercadería que reasignar.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // El modal se monta en un portal, pero React propaga los eventos por el árbol de componentes: sin esto este «enviar»
              // subiría al <form> de quien lo abra (si lo hubiera).
              e.stopPropagation();
              void reasignar();
            }}
            className="space-y-5"
          >
            <p className="text-sm leading-relaxed text-tinta/70">
              Úsalo cuando la mercadería llegó a una tienda distinta de la que decía el comprobante, o se repartió mal al registrarlo. Solo se mueve lo que <b className="font-semibold">aún no se recibió</b>.
            </p>

            {reasignables.length > 1 ? (
              <CampoSelectNativo etiqueta="¿De qué línea?" value={lineaId} onChange={(e) => elegirLinea(e.target.value)}>
                {reasignables.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.producto}
                  </option>
                ))}
              </CampoSelectNativo>
            ) : (
              <p className="text-sm text-tinta">
                <span className="label-cayla mr-2 text-[11px] text-tinta/65">Línea</span>
                {linea?.producto}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <CampoSelectNativo etiqueta="Sale de" value={desdeId} onChange={(e) => elegirOrigen(e.target.value)}>
                {origenes.map((f) => (
                  <option key={f.ubicacionId} value={f.ubicacionId}>
                    {nombreDe(f.ubicacionId)} · le faltan {f.pendiente}
                  </option>
                ))}
              </CampoSelectNativo>
              <CampoSelectNativo etiqueta="Va a" value={haciaId} onChange={(e) => setHaciaId(e.target.value)}>
                <option value="">Elige la tienda…</option>
                {ubicaciones
                  .filter((u) => u.id !== desdeId)
                  .map((u) => {
                    const f = propias.find((x) => x.ubicacionId === u.id);
                    return (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                        {f ? ` · ya le tocan ${f.asignado}` : ""}
                      </option>
                    );
                  })}
              </CampoSelectNativo>
            </div>

            <div>
              <label htmlFor="reasignar-cantidad" className="label-cayla text-[11px] text-tinta/65">
                ¿Cuántas unidades se mueven?
              </label>
              <input
                id="reasignar-cantidad"
                type="number"
                min={1}
                max={origen?.pendiente ?? 1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="ml-3 w-20 border-b border-tinta/25 bg-transparent px-1 py-1 text-center text-sm tabular-nums text-tinta outline-none focus:border-b-2 focus:border-rojo"
              />
              <span className="ml-2 text-xs text-tinta/55">de {origen?.pendiente ?? 0} pendientes en {nombreDe(desdeId)}</span>
              {/* El efecto, antes de confirmar: cómo queda lo que le toca a cada tienda. */}
              {cantidadOk && haciaId && (
                <p className="mt-2 text-xs tabular-nums text-tinta/70" aria-live="polite">
                  {nombreDe(desdeId)}: {origen?.asignado} → <b className="font-semibold text-tinta">{(origen?.asignado ?? 0) - n}</b> · {nombreDe(haciaId)}: {destino?.asignado ?? 0} →{" "}
                  <b className="font-semibold text-tinta">{(destino?.asignado ?? 0) + n}</b>
                </p>
              )}
            </div>

            <fieldset>
              <legend className="label-cayla mb-2 text-[11px] text-tinta/65">¿Por qué se mueve?</legend>
              <div className="space-y-1.5">
                {MOTIVOS_REASIGNACION.map((m) => (
                  <label key={m} className="flex cursor-pointer items-center gap-2.5 text-sm text-tinta/80">
                    <input type="radio" name="motivo-reasignacion" checked={motivo === m} onChange={() => setMotivo(m)} className="accent-rojo" />
                    {ETIQUETA_MOTIVO_REASIGNACION[m]}
                  </label>
                ))}
              </div>
            </fieldset>

            <CampoTexto
              etiqueta={motivo === "otro" ? "Nota (cuenta el motivo)" : "Nota (opcional)"}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Algo que ayude a entenderlo después"
              maxLength={200}
            />

            <p className="text-xs leading-relaxed text-tinta/60">
              No se borra nada: queda un registro en el historial del comprobante con quién lo movió, cuánto y por qué. Lo que una tienda ya recibió no se toca.
            </p>

            <ComboResponsable control={responsable} deshabilitado={loading} />

            <div className="flex justify-end border-t border-tinta/10 pt-4">
              <button type="submit" className={BTN_PRIMARIO} disabled={loading || error !== null} title={error ?? undefined}>
                {loading ? "Moviendo…" : cantidadOk && haciaId ? `Mover ${n} ${n === 1 ? "unidad" : "unidades"} a ${nombreDe(haciaId)}` : "Mover mercadería"}
              </button>
            </div>
          </form>
        )
      }
    </Modal>
  );
}
