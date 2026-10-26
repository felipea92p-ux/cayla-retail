"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight, Plus, Receipt, Wallet } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { PestanasFin } from "@/components/finanzas/kit";
import { DockTelar, type AccionDock } from "@/components/finanzas/telar/DockTelar";
import { Orillo } from "@/components/finanzas/telar/Orillo";
import { RespuestaTelar } from "@/components/finanzas/telar/RespuestaTelar";
import type { ClaveSede, SedeTelar } from "@/lib/finanzas-telar-reglas";
import type { ChipRespuesta } from "@/lib/dinero-telar-reglas";

// Finanzas ▸ Cuentas y dinero en «El telar» (Felipe 2026-10-23; ADR-0195 F3/F4): la cabecera con la respuesta de la cara, el orillo
// (cuánto pone cada sede en esta cara), las tres caras y el dock. La mesa de mando (sede, mes, «Te toca») la monta una sola vez
// `app/(app)/finanzas/layout.tsx`: aquí no hay selector de sede propio. Cada cara es una ruta propia bajo /finanzas/dinero, y al
// pasar de una a otra se conserva la sede de la URL.

export type PestanaDinero = "cuentas" | "porpagar" | "conciliacion";

const PESTANAS: { clave: PestanaDinero; etiqueta: string; href: string; soloLider?: boolean }[] = [
  { clave: "cuentas", etiqueta: "Dónde está", href: "/finanzas/dinero" },
  { clave: "porpagar", etiqueta: "Qué debes", href: "/finanzas/dinero/por-pagar" },
  { clave: "conciliacion", etiqueta: "Cuadrar con el banco", href: "/finanzas/dinero/conciliacion", soloLider: true },
];

export function CabeceraDinero({
  pestana,
  esLider,
  conteos = {},
  sede,
  respuesta,
  orillo,
  sedes,
  hoy,
  acciones,
  onRegistrar,
}: {
  pestana: PestanaDinero;
  esLider: boolean;
  /** El número en la pestaña de cada cara (lo que pide atención), si hay. */
  conteos?: Partial<Record<PestanaDinero, number>>;
  /** La sede que se mira, como la dice la línea de arriba («Todas las sedes», «Trujillo»). */
  sede: string;
  /** La respuesta grande de la cara: su pregunta y su cifra (`valor: null` = no se pudo leer). */
  respuesta: { pregunta: string; valor: number | null; chips?: ChipRespuesta[]; motivo?: string };
  /** Cuánto pone cada sede en esta cara (`null` en Cuadrar: los bancos son de CAYLA entera). */
  orillo: { porSede: Record<ClaveSede, number>; que: string } | null;
  /** Los hilos de sede de la barra (`getSedesDelTelar`). */
  sedes: SedeTelar[];
  hoy: string;
  /** La acción principal de la cara, a la derecha de la cabecera. */
  acciones?: ReactNode;
  /** Abre «Registrar movimiento» aquí mismo; sin él, el dock lleva a Dónde está con la hoja abierta. */
  onRegistrar?: () => void;
}) {
  const params = useSearchParams();
  // Al cambiar de cara viaja solo la sede (la de la barra, o la vieja `?ver=` mientras dure el cambio), como en la barra común.
  const conSede = (ruta: string, extra?: string) => {
    const p = new URLSearchParams();
    for (const k of ["sede", "ver"]) {
      const v = params.get(k);
      if (v) p.set(k, v);
    }
    if (extra) p.set(extra, "1");
    const q = p.toString();
    return q ? `${ruta}?${q}` : ruta;
  };
  const caras = PESTANAS.filter((p) => !p.soloLider || esLider);
  const dock: AccionDock[] = [
    onRegistrar
      ? { texto: "Registrar movimiento", tecla: "m", icono: <Plus aria-hidden />, principal: true, onClick: onRegistrar }
      : { texto: "Registrar movimiento", tecla: "m", icono: <Plus aria-hidden />, principal: true, href: conSede("/finanzas/dinero", "registrar") },
    { texto: "Dónde está", tecla: "d", icono: <Wallet aria-hidden />, href: conSede("/finanzas/dinero") },
    { texto: "Qué debes", tecla: "p", icono: <Receipt aria-hidden />, href: conSede("/finanzas/dinero/por-pagar") },
    ...(esLider ? [{ texto: "Cuadrar con el banco", tecla: "c", icono: <ArrowLeftRight aria-hidden />, href: conSede("/finanzas/dinero/conciliacion") }] : []),
  ];

  return (
    <>
      <EncabezadoPagina
        sede={sede}
        titulo="Cuentas y dinero"
        subtitulo="Dónde está la plata, qué debes y si cuadra con el banco. Un saldo nunca se escribe a mano: se suma de los movimientos."
        acciones={acciones}
      >
        <RespuestaTelar pregunta={respuesta.pregunta} valor={respuesta.valor} chips={respuesta.chips} motivo={respuesta.motivo} />
      </EncabezadoPagina>
      {orillo && <Orillo porSede={orillo.porSede} sedes={sedes} que={orillo.que} hoy={hoy} />}
      <PestanasFin
        etiqueta="Las caras de Cuentas y dinero"
        guia="fin-dinero.pestanas"
        valor={pestana}
        items={caras.map((p) => ({ clave: p.clave, etiqueta: p.etiqueta, href: conSede(p.href), conteo: conteos[p.clave] }))}
      />
      <DockTelar acciones={dock} />
    </>
  );
}
