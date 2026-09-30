"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useSedeActiva } from "@/components/SedeActiva";
import { useDeTurno } from "@/lib/useDeTurno";
import {
  encabezadosResponsable,
  esErrorDeResponsable,
  estadoCombo,
  listaResponsable,
  motivoSinResponsable,
  preguntaResponsable,
  proponeSesion,
  responsableInicial,
  responsableVigente,
  type EstadoCombo,
  type Firma,
  type ListaResponsable,
  type ModoResponsable,
} from "@/lib/responsable-reglas";
import { recordarResponsableGuardar, recordarResponsableLeer, recordarResponsableOlvidar, suscribirRecordado } from "@/lib/responsable-conteo";

/**
 * Todo lo que una pantalla necesita del combo «Responsable» (ADR-0161): se crea con `useResponsable()`, se pinta con
 * `<ComboResponsable control={...} />` y, al guardar:
 *
 *     const { error } = await firmar(supabase.rpc("abrir_caja", {...}), resp.firma());
 *     resp.despues(error);   // éxito → vuelve a como vino · rechazo por el responsable → lo mismo y relee la lista
 *
 * y el botón de guardar se apaga con `!resp.listo` (su porqué, en `resp.motivo`).
 */
export type ControlResponsable = {
  ubicacionId: string | null;
  sede: string;
  lista: ListaResponsable;
  estado: EstadoCombo;
  /** Lo que dice el combo vacío, según el modo: «¿Quién está atendiendo?» o «¿Quién hace esta operación?». */
  pregunta: string;
  /** El elegido (o, sin tocar el combo, la persona de la sesión), solo si sigue presente. */
  elegidoId: string | null;
  elegir: (personaId: string) => void;
  limpiar: () => void;
  recargar: () => Promise<void>;
  recargando: boolean;
  /** La lista es la que este navegador recordaba (pantalla abierta sin red, ADR-0210): la hora de esa lectura. */
  deMemoria: string | null;
  /** Hay un responsable vigente: se puede guardar. */
  listo: boolean;
  /** Por qué no se puede guardar todavía (`null` si `listo`). */
  motivo: string | null;
  /** La firma para `firmar(...)` (o `null` si falta elegir). `momento` solo para la venta sin conexión. */
  firma: (momento?: string | null) => Firma | null;
  /** Los mismos encabezados para un `fetch` a una ruta `/api/*` (vacío si falta elegir). */
  encabezados: () => Record<string, string>;
  /** Tras guardar: vuelve a como vino si salió bien; si la base rechazó por el responsable, lo mismo y relee la lista. */
  despues: (error: { code?: string | null; hint?: string | null; message?: string | null } | null | undefined) => void;
};

/**
 * @param ubicacion — por defecto la sede activa de la cabecera (A11). Solo se pasa cuando la pantalla ya la recibe
 *   (Punto de venta, Caja), para que la lista sea exactamente la de la operación.
 * @param opciones.modo — `"operacion"` (por defecto): «¿Quién hace esta operación?» y viene elegido con quien inició
 *   sesión, si es una persona presente. Punto de venta (venta y apartados), Cambios y Devoluciones pasan
 *   `"atencion"`: «¿Quién está atendiendo?» y siempre vacío (ver «Dos modos» en `responsable-reglas.ts`).
 * @param opciones.recordarEn — una clave (`claveResponsableConteo(id)`): el elegido se guarda en el navegador y se
 *   recupera en la pantalla siguiente, y un guardado exitoso NO lo reinicia. Es el Conteo (2026-09-30): el responsable se
 *   elige al abrirlo y no se vuelve a preguntar. Solo un rechazo de la base por el responsable (ya no está de turno, sin
 *   asistencia) lo borra y trae el combo de vuelta. Sin esta opción todo sigue como antes.
 */
export function useResponsable(
  ubicacion?: { ubicacionId: string; etiqueta: string },
  { modo = "operacion", recordarEn }: { modo?: ModoResponsable; recordarEn?: string } = {},
): ControlResponsable {
  const activa = useSedeActiva();
  const ubicacionId = ubicacion?.ubicacionId ?? activa?.ubicacionId ?? null;
  const sede = ubicacion?.etiqueta ?? activa?.etiqueta ?? "esta tienda";
  // El Admin firma él, sin lista ni asistencia (20260924171300): ni se pregunta quién está de turno.
  const adminId = activa?.esAdmin ? (activa.personaSesionId ?? null) : null;
  const nombreAdmin = activa?.nombreSesion ?? "";
  const propuesto = proponeSesion(modo) ? (activa?.personaSesionId ?? null) : null;
  const deTurno = useDeTurno(adminId ? null : ubicacionId);
  // Lo que se tocó en el combo; `undefined` = nadie lo tocó todavía y vale el propuesto.
  const [tocado, setTocado] = useState<string | undefined>(undefined);
  // Lo recordado (el responsable que abrió el conteo): el servidor dibuja sin él (`null`) y el navegador lo lee del almacenamiento.
  const recordado = useSyncExternalStore(
    suscribirRecordado,
    () => (recordarEn ? recordarResponsableLeer(recordarEn) : null),
    () => null,
  );
  const elegido = adminId ?? responsableInicial(tocado ?? recordado ?? undefined, propuesto);

  // Con Admin, la lista es solo él: así las pantallas que buscan el nombre del elegido («Atendió», «Cerró») lo encuentran.
  const lista = useMemo(
    () =>
      adminId
        ? { elegibles: [{ personaId: adminId, nombre: nombreAdmin, enPausa: false, deOtraSede: false }], enPausa: [], salieron: 0 }
        : listaResponsable(deTurno.filas),
    [adminId, nombreAdmin, deTurno.filas],
  );
  const elegidoId = useMemo(() => responsableVigente(lista, elegido), [lista, elegido]);
  const estado = estadoCombo({ cargo: deTurno.cargo, fallo: deTurno.fallo, lista, elegidoId: elegido, admin: adminId !== null });
  const listo = (estado === "listo" || estado === "admin") && ubicacionId !== null;

  // «Limpiar» (venta nueva, cancelar) vuelve a como vino al abrir: la persona de la sesión, o vacío.
  const limpiar = useCallback(() => setTocado(undefined), []);
  const elegir = useCallback(
    (personaId: string) => {
      setTocado(personaId);
      if (recordarEn) recordarResponsableGuardar(recordarEn, personaId);
    },
    [recordarEn],
  );
  const { recargar } = deTurno;

  const firma = useCallback(
    (momento?: string | null): Firma | null =>
      elegidoId && ubicacionId ? { responsableId: elegidoId, ubicacionId, momento: momento ?? null } : null,
    [elegidoId, ubicacionId],
  );

  const despues = useCallback<ControlResponsable["despues"]>(
    (error) => {
      if (!error) {
        // Con `recordarEn` el éxito no reinicia: quien abrió el conteo firma todos sus pasos.
        if (!recordarEn) setTocado(undefined);
        return;
      }
      if (esErrorDeResponsable(error)) {
        setTocado(undefined);
        if (recordarEn) recordarResponsableOlvidar(recordarEn);
        void recargar();
      }
    },
    [recargar, recordarEn],
  );

  return {
    ubicacionId,
    sede,
    lista,
    estado,
    pregunta: preguntaResponsable(modo),
    elegidoId,
    elegir,
    limpiar,
    recargar,
    recargando: deTurno.recargando,
    deMemoria: deTurno.deMemoria,
    listo,
    motivo: listo ? null : motivoSinResponsable(estado, sede, modo),
    firma,
    encabezados: () => {
      const f = firma();
      return f ? encabezadosResponsable(f) : {};
    },
    despues,
  };
}
