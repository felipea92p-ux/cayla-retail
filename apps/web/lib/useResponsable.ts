"use client";

import { useCallback, useMemo, useState } from "react";
import { useSedeActiva } from "@/components/SedeActiva";
import { useDeTurno } from "@/lib/useDeTurno";
import {
  encabezadosResponsable,
  esErrorDeResponsable,
  estadoCombo,
  listaResponsable,
  motivoSinResponsable,
  responsableVigente,
  type EstadoCombo,
  type Firma,
  type ListaResponsable,
} from "@/lib/responsable-reglas";

/**
 * Todo lo que una pantalla necesita del combo «Responsable» (ADR-0161): se crea con `useResponsable()`, se pinta con
 * `<ComboResponsable control={...} />` y, al guardar:
 *
 *     const { error } = await firmar(supabase.rpc("abrir_caja", {...}), resp.firma());
 *     resp.despues(error);   // éxito → vuelve a vacío · rechazo por el responsable → vuelve a vacío y relee la lista
 *
 * y el botón de guardar se apaga con `!resp.listo` (su porqué, en `resp.motivo`).
 */
export type ControlResponsable = {
  ubicacionId: string | null;
  sede: string;
  lista: ListaResponsable;
  estado: EstadoCombo;
  /** El elegido, solo si sigue presente. */
  elegidoId: string | null;
  elegir: (personaId: string) => void;
  limpiar: () => void;
  recargar: () => Promise<void>;
  recargando: boolean;
  /** Hay un responsable vigente: se puede guardar. */
  listo: boolean;
  /** Por qué no se puede guardar todavía (`null` si `listo`). */
  motivo: string | null;
  /** La firma para `firmar(...)` (o `null` si falta elegir). `momento` solo para la venta sin conexión. */
  firma: (momento?: string | null) => Firma | null;
  /** Los mismos encabezados para un `fetch` a una ruta `/api/*` (vacío si falta elegir). */
  encabezados: () => Record<string, string>;
  /** Tras guardar: vuelve a vacío si salió bien; si la base rechazó por el responsable, vacía y relee la lista. */
  despues: (error: { code?: string | null; hint?: string | null; message?: string | null } | null | undefined) => void;
};

/**
 * @param ubicacion — por defecto la sede activa de la cabecera (A11). Solo se pasa cuando la pantalla ya la recibe
 *   (Punto de venta, Caja), para que la lista sea exactamente la de la operación.
 */
export function useResponsable(ubicacion?: { ubicacionId: string; etiqueta: string }): ControlResponsable {
  const activa = useSedeActiva();
  const ubicacionId = ubicacion?.ubicacionId ?? activa?.ubicacionId ?? null;
  const sede = ubicacion?.etiqueta ?? activa?.etiqueta ?? "esta tienda";
  const deTurno = useDeTurno(ubicacionId);
  const [elegido, setElegido] = useState<string | null>(null);

  const lista = useMemo(() => listaResponsable(deTurno.filas), [deTurno.filas]);
  const elegidoId = responsableVigente(lista, elegido);
  const estado = estadoCombo({ cargo: deTurno.cargo, fallo: deTurno.fallo, lista, elegidoId: elegido });
  const listo = estado === "listo" && ubicacionId !== null;

  const limpiar = useCallback(() => setElegido(null), []);
  const { recargar } = deTurno;

  const firma = useCallback(
    (momento?: string | null): Firma | null =>
      elegidoId && ubicacionId ? { responsableId: elegidoId, ubicacionId, momento: momento ?? null } : null,
    [elegidoId, ubicacionId],
  );

  const despues = useCallback<ControlResponsable["despues"]>(
    (error) => {
      if (!error) {
        setElegido(null);
        return;
      }
      if (esErrorDeResponsable(error)) {
        setElegido(null);
        void recargar();
      }
    },
    [recargar],
  );

  return {
    ubicacionId,
    sede,
    lista,
    estado,
    elegidoId,
    elegir: setElegido,
    limpiar,
    recargar,
    recargando: deTurno.recargando,
    listo,
    motivo: listo ? null : motivoSinResponsable(estado, sede),
    firma,
    encabezados: () => {
      const f = firma();
      return f ? encabezadosResponsable(f) : {};
    },
    despues,
  };
}
