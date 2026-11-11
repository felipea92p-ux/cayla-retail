"use client";

import type { ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { conMiles } from "@/lib/recepcion-modelos-reglas";

// La hoja «Tallas y colores» (ADR-0645, Felipe 2026-11-11: «para agregar las tallas y los colores se abra un modal, para darle más espacio»). Adentro va la misma tabla que
// antes vivía en la placa (`TallasDeLaPlaca`): se guarda sola cuando lo repartido cuadra con lo contado, así que la hoja no tiene «Guardar»: se cierra con su ×. Al pie, lo que
// se puede hacer con lo repartido (llevarlo al stock).

export function HojaRepartir({ nombre, contadas, children, pie, onCerrar }: { nombre: string; contadas: number; children: ReactNode; /** Lo que se hace con lo repartido: va pegado abajo. */ pie?: ReactNode; onCerrar: () => void }) {
  return (
    <Modal
      titulo={`Tallas y colores · ${nombre}`}
      subtitulo={`Reparte ${contadas === 1 ? "la que contaste" : `las ${conMiles(contadas)} que contaste`}: cuántas llegaron de cada talla y color. Se guarda solo cuando cuadra.`}
      tamano="ancha"
      conCerrar
      onClose={onCerrar}
    >
      <div className="rc-repartir">
        {children}
        {pie && <div className="pie-hoja-fijo rc-repartir-pie">{pie}</div>}
      </div>
    </Modal>
  );
}
