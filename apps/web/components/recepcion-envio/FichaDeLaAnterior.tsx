"use client";

import { Boton } from "@/components/ui/campos";
import { FiltroPuesto } from "@/components/ui/FiltrosPuestos";
import type { DatoDeLaAnterior, FichaDeLaAnterior as Ficha } from "@/lib/recepcion-igual-que-anterior";

// «Igual que la anterior» (tarea 7 de Recibir, Felipe 2026-11-14): arriba del paso «¿Cómo es?», la ficha que ofrece el tejido, el patrón y las
// tallas de la prenda recién creada en el envío. Dice qué llena (cada dato es una píldora puesta) y cada dato se quita con su ✕ antes de
// usarla: es una oferta, nunca un valor de fábrica. «Usar» lo llena de un toque; después, cada dato sigue editable en su campo.
export function FichaDeLaAnterior({ ficha, onUsar, onQuitar }: { ficha: Ficha; onUsar: () => void; onQuitar: (clave: DatoDeLaAnterior) => void }) {
  return (
    <div className="nota-cayla sin-i flex flex-wrap items-center gap-2">
      <span className="text-sm">
        Igual que <strong className="font-medium">{ficha.nombre}</strong>
      </span>
      {ficha.datos.map((d) => (
        <FiltroPuesto key={d.clave} onQuitar={() => onQuitar(d.clave)} etiqueta={`No usar ${d.texto}`}>
          {d.texto}
        </FiltroPuesto>
      ))}
      <Boton type="button" peso="fantasma" className="btn-chico ml-auto" onClick={onUsar}>
        Usar
      </Boton>
    </div>
  );
}
