"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { PrendaCelda } from "@/components/ui/PrendaCelda";
import {
  ETIQUETA_SITUACION,
  MIN_DIAS_HISTORIAL,
  calcularVelocidad,
  formatoCobertura,
  textoAccion,
  textoCobertura,
  textoEnRed,
  type AnalisisVariante,
  type Situacion,
} from "@/lib/resumen-reglas";

// Los dos modales del Resumen (2026-09-17, ADR-0097). Regla transversal:
// cuando CAYLA dice "riesgo de quiebre" o "sugerir traslado", acá se ve con
// qué números lo dijo — sin saturar la pantalla principal.

export const TONO_SITUACION: Record<Situacion, TonoChip> = {
  riesgo_quiebre: "rojo",
  curva_incompleta: "ambar",
  // Ámbar y no rojo a propósito: el rojo se reserva para el riesgo probado por
  // ventas; "reponer tienda" es la política de reserva de Felipe (Existencias
  // sí lo pinta rojo en su chip "Stock bajo" — misma regla, distinta pantalla).
  reponer_tienda: "ambar",
  reponer_piso: "ambar",
  posible_sobrestock: "neutro",
  mejora_en_camino: "verde",
  normal: "neutro",
};

function fechaCorta(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", timeZone: "America/Lima" });
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="p-3">
      <p className="label-cayla text-[10px] text-tinta/55">{etiqueta}</p>
      <p className="mt-0.5 text-sm text-tinta">{children}</p>
    </div>
  );
}

function textoVelocidad(a: AnalisisVariante): string {
  const v = a.velocidad;
  switch (v.estado) {
    case "sin_historial":
      return "Sin historial en esta sede";
    case "historial_corto":
      return `${v.ventasNetas} vendida${v.ventasNetas === 1 ? "" : "s"} en ${v.diasObservados} día${v.diasObservados === 1 ? "" : "s"} — historial corto (mínimo ${MIN_DIAS_HISTORIAL})`;
    case "sin_ventas":
      return `Sin ventas en ${v.diasObservados} días`;
    default:
      return `${v.unidadesDia!.toFixed(v.unidadesDia! < 1 ? 2 : 1)}/día · observado ${v.diasObservados} día${v.diasObservados === 1 ? "" : "s"}`;
  }
}

export function DetalleVarianteModal({
  analisis: a,
  ubicacionId,
  onClose,
}: {
  analisis: AnalisisVariante;
  ubicacionId: string;
  onClose: () => void;
}) {
  const f = a.fila;
  const s = a.sugerencia;
  const enlaceMovimientos = `/inventario/movimientos?ubicacion=${ubicacionId}&q=${encodeURIComponent(f.sku || f.referencia)}`;
  const enlaceTraslado = s
    ? `/inventario/mover?origen=${s.origenId}&destino=${s.destinoId}&variante=${s.varianteId}&cantidad=${s.cantidad}`
    : null;

  return (
    <Modal
      titulo={`${f.referencia}${f.color ? ` · ${f.color}` : ""}${f.talla ? ` · ${f.talla}` : ""}`}
      subtitulo={<span className="font-mono">{f.sku}</span>}
      onClose={onClose}
      ancho="max-w-2xl"
    >
      {(cerrar) => (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tono={TONO_SITUACION[a.situacion]}>{ETIQUETA_SITUACION[a.situacion]}</Chip>
            {a.accion && <span className="text-sm text-tinta/75">→ {textoAccion(a)}</span>}
          </div>

          <div className="card-cayla grid grid-cols-2 divide-x divide-y divide-tinta/10 sm:grid-cols-3">
            <Dato etiqueta="Disponible">
              {f.disponible}
              {f.separaPisoAlmacen && (
                <span className="block text-xs text-tinta/55">
                  piso {f.piso} · almacén {f.almacen}
                  {f.sinSububicacion > 0 ? ` · sin ubicar ${f.sinSububicacion}` : ""}
                </span>
              )}
              {f.cuarentena > 0 && <span className="block text-xs text-tinta/55">dañado {f.cuarentena} (no cuenta)</span>}
            </Dato>
            <Dato etiqueta="Venta media">{textoVelocidad(a)}</Dato>
            <Dato etiqueta="Cobertura">
              {a.coberturaDias === null ? textoCobertura(a) : formatoCobertura(a.coberturaDias)}
              {f.enCamino > 0 && a.coberturaProyectadaDias !== null && (
                <span className="block text-xs text-tinta/55">con lo que viene: {formatoCobertura(a.coberturaProyectadaDias)}</span>
              )}
            </Dato>
            <Dato etiqueta="En camino">
              {f.enCamino > 0 ? `+${f.enCamino}` : "—"}
              {f.enCamino > 0 && (
                <span className={`block text-xs ${f.enCaminoAtrasado ? "text-rojo-profundo" : "text-tinta/55"}`}>
                  {f.enCaminoAtrasado && f.enCaminoATiempo < f.enCamino ? `${f.enCamino - f.enCaminoATiempo} atrasada${f.enCamino - f.enCaminoATiempo === 1 ? "" : "s"}` : ""}
                  {f.enCaminoATiempo > 0 ? `${f.enCaminoAtrasado && f.enCaminoATiempo < f.enCamino ? " · " : ""}${fechaCorta(f.proximaLlegada) ? `llega ${fechaCorta(f.proximaLlegada)}` : "sin fecha"}` : ""}
                </span>
              )}
            </Dato>
            <Dato etiqueta="Stock mínimo (producto, red)">{f.stockMinimo ?? "sin definir"}</Dato>
            <Dato etiqueta="Sell-through (ventana)">
              {a.sellThroughPct === null ? "—" : `${a.sellThroughPct}%`}
              <span className="block text-xs text-tinta/55">
                vendidas {f.ventasVentana} · devueltas {f.devolucionesVentana}
                {f.mermasVentana > 0 ? ` · merma ${f.mermasVentana}` : ""}
                {f.trasladosSalidaVentana > 0 ? ` · enviadas ${f.trasladosSalidaVentana}` : ""}
              </span>
            </Dato>
          </div>

          <div>
            <p className="label-cayla text-[10px] text-tinta/55">Por qué</p>
            <ul className="mt-1 space-y-1 text-sm text-tinta">
              {a.motivos.length === 0 ? <li className="text-tinta/55">Nada que señalar en esta sede.</li> : a.motivos.map((m, i) => <li key={i}>· {m}</li>)}
            </ul>
          </div>

          <div>
            <p className="label-cayla text-[10px] text-tinta/55">En la red</p>
            {f.enRed.length === 0 ? (
              <p className="mt-1 text-sm text-tinta/55">Ninguna otra sede tiene esta prenda ni la espera.</p>
            ) : (
              <ul className="mt-1 divide-y divide-tinta/10 text-sm">
                {f.enRed.map((o) => {
                  const v = calcularVelocidad(o.diasObservables, o.ventasVentana, o.devolucionesVentana);
                  return (
                    <li key={o.ubicacionId} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                      <span className="text-tinta">
                        {o.nombre}
                        <span className="text-tinta/55"> · {o.disponible} disponible{o.disponible === 1 ? "" : "s"}</span>
                        {o.separaPisoAlmacen && o.almacen !== o.disponible && <span className="text-tinta/55"> ({o.almacen} en almacén)</span>}
                        {o.enCamino > 0 && <span className="text-tinta/55"> · +{o.enCamino} en camino</span>}
                      </span>
                      <span className="text-xs text-tinta/55">
                        {v.estado === "ok" ? `vende ${v.unidadesDia!.toFixed(2)}/día` : v.estado === "sin_ventas" ? "sin ventas" : "sin historial"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-tinta/10 pt-4">
            <Link href={`/inventario?ubicacion=${ubicacionId}`} className="label-cayla text-[10px] text-tinta/55 underline-offset-2 hover:text-rojo hover:underline">
              Ver en Existencias
            </Link>
            <Link href={enlaceMovimientos} className="label-cayla text-[10px] text-tinta/55 underline-offset-2 hover:text-rojo hover:underline">
              Ver movimientos
            </Link>
            {s && (
              <span className="ml-auto flex flex-wrap items-center gap-3">
                <span className="text-xs text-tinta/55">
                  {s.origenNombre} → {s.destinoNombre} · {s.cantidad} ud{s.cantidad === 1 ? "" : "s"}
                </span>
                {enlaceTraslado && (
                  <Link href={enlaceTraslado} className="label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo">
                    Crear traslado
                  </Link>
                )}
              </span>
            )}
            <button type="button" onClick={cerrar} className="label-cayla text-[10px] text-tinta/55 underline-offset-2 hover:text-rojo hover:underline">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function ListaSituacionModal({
  titulo,
  subtitulo,
  filas,
  onElegir,
  onClose,
}: {
  titulo: string;
  subtitulo?: string;
  filas: AnalisisVariante[];
  onElegir: (a: AnalisisVariante) => void;
  onClose: () => void;
}) {
  return (
    <Modal titulo={titulo} subtitulo={subtitulo} onClose={onClose} ancho="max-w-2xl">
      {(cerrar) => (
        <div className="mt-2">
          {filas.length === 0 ? (
            <p className="py-6 text-sm text-tinta/55">Nada por acá — buena señal.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-tinta/10 overflow-y-auto pr-1">
              {filas.map((a) => (
                <li key={a.fila.varianteId}>
                  <button
                    type="button"
                    onClick={() => onElegir(a)}
                    className="flex w-full flex-wrap items-center gap-3 py-2.5 text-left transition-colors hover:bg-tinta/[0.03]"
                  >
                    <span className="min-w-0 flex-1">
                      <PrendaCelda referencia={a.fila.referencia} sku={a.fila.sku} talla={a.fila.talla} color={a.fila.color} fotoUrl={a.fila.fotoUrl} compacta />
                    </span>
                    <span className="w-24 text-xs text-tinta/75">{textoCobertura(a)}</span>
                    <span className="w-28 truncate text-xs text-tinta/75">{textoEnRed(a)}</span>
                    <span className="text-xs text-tinta">{textoAccion(a)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex justify-end border-t border-tinta/10 pt-3">
            <button type="button" onClick={cerrar} className="label-cayla text-[10px] text-tinta/55 underline-offset-2 hover:text-rojo hover:underline">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
