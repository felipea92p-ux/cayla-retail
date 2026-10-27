"use client";

import { Lock } from "lucide-react";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";

// La puerta del candado de Editar producto (ADR-0494, actividad 3; maqueta `docs/maquetas/stock-solo-en-existencias-2026-10/`, dirección A).
//
// El stock de una talla guardada ya no se ajusta aquí: su número lleva un candado, y tocarlo abre esta hoja, que dice a dónde se va a
// ajustar (Existencias, con su motivo y su responsable) y lleva directo a esa talla (`hrefAjustarDesdeEditar`). Es una hoja y no un
// salto directo porque la colaboradora de siempre toca el número esperando poder escribirlo: la hoja le explica el cambio una vez
// por toque, en una frase, y le deja el camino a un clic.

export function PuertaAjustarStock({ etiqueta, href, onCerrar }: { etiqueta: string; href: string; onCerrar: () => void }) {
  return (
    <Modal titulo="Ajustar stock" subtitulo={etiqueta} onClose={onCerrar} tamano="angosta">
      <div className="space-y-4">
        <div className="flex gap-3 text-sm text-tinta/80">
          <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-full bg-hueso text-tinta">
            <Lock className="h-4 w-4" />
          </span>
          <p>
            Este número tiene candado: el stock se ajusta en <b>Existencias</b>, con su motivo y su responsable. Te llevamos directo a esa talla.
          </p>
        </div>
        <PieAcciones>
          <Boton peso="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <BotonEnlace peso="primario" href={href}>
            Ajustar stock
          </BotonEnlace>
        </PieAcciones>
      </div>
    </Modal>
  );
}
