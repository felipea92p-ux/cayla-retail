"use client";

import type { CSSProperties } from "react";
import { estaVencida } from "@/lib/por-regularizar-reglas";
import { anotadoPorCaja } from "@/lib/por-regularizar-mesa";
import type { FilaPorRegularizar } from "@/lib/por-regularizar";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { Chip } from "@/components/ui/Chip";
import { MosaicoDeVenta, soles } from "./piezas";

/**
 * Una venta sin registrar, tal como la anotó caja: un talón con su perforación (ADR-0360, maqueta A2). Es un botón: elegirlo trae a la
 * derecha las prendas entre las que se identifica. Al guardar cae el sello «Regularizada» y el talón se pliega (`saliendo`).
 */
export function TalonVenta({
  fila,
  ahora,
  seleccionado,
  saliendo,
  indice,
  variasSedes,
  tabIndex,
  sinChipPendiente = false,
  onElegir,
}: {
  fila: FilaPorRegularizar;
  ahora: Date;
  seleccionado: boolean;
  saliendo: boolean;
  indice: number;
  variasSedes: boolean;
  /** Una sola parada de Tab para toda la lista (la de la venta elegida): entre talones se va con ↑ ↓. */
  tabIndex: 0 | -1;
  /** En el filtro «Pendientes» todos lo son: el chip «Pendiente» no informa y se omite (la «Vencida» sí se queda). */
  sinChipPendiente?: boolean;
  onElegir: (id: string) => void;
}) {
  const vencida = fila.estado === "pendiente" && estaVencida(fila.vendidoEn, ahora);
  const { dia, hora } = diaYHoraLima(fila.vendidoEn);
  const linea =
    fila.estado === "regularizada"
      ? (fila.prendaReal ?? "Regularizada")
      : fila.estado === "cerrada_sin_prenda"
        ? "Cerrada sin identificar la prenda"
        : fila.estado === "anulada"
          ? "La venta se anuló"
          : `${fila.vendidoPor} · ${dia} · ${hora}${variasSedes ? ` · ${fila.sede}` : ""}`;
  // Lo que anotó caja (talla y color) va siempre: es contra lo que se compara cada prenda. Quién vendió y cuándo, en su propia línea.
  const anotado = anotadoPorCaja(fila);
  return (
    <button
      type="button"
      className="vsr-talon"
      data-vsr-talon={fila.id}
      data-saliendo={saliendo ? "" : undefined}
      aria-pressed={seleccionado}
      tabIndex={tabIndex}
      onClick={() => onElegir(fila.id)}
      style={{ "--i": Math.min(indice, 9) } as CSSProperties}
    >
      <span className="vsr-talon-foto">
        <MosaicoDeVenta venta={fila} />
      </span>
      <span className="vsr-talon-tx">
        <b>{fila.descripcion}</b>
        {anotado && <small className="vsr-talon-anotado">{anotado}</small>}
        <small>{linea}</small>
      </span>
      <span className="vsr-talon-der">
        <span className="vsr-talon-precio">{soles(fila.precioCobrado)}</span>
        {fila.estado === "regularizada" ? (
          <Chip tono="verde">Regularizada</Chip>
        ) : fila.estado === "cerrada_sin_prenda" ? (
          <Chip tono="pizarra">Cerrada</Chip>
        ) : fila.estado === "anulada" ? (
          <Chip tono="apagado">Anulada</Chip>
        ) : vencida ? (
          <Chip tono="rojo" vivo>
            Vencida
          </Chip>
        ) : sinChipPendiente ? null : (
          <Chip tono="ambar">Pendiente</Chip>
        )}
        <i className="vsr-nub" aria-hidden />
      </span>
      {saliendo && (
        <span className="vsr-sello" aria-hidden>
          Regularizada
        </span>
      )}
    </button>
  );
}
