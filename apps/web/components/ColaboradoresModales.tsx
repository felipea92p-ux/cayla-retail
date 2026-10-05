"use client";

import { useState } from "react";
import type { Terminal } from "@/lib/colaboradores";
import { confirmacionTerminal } from "@/lib/colaboradores-reglas";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import type { ControlResponsable } from "@/lib/useResponsable";

// El modal que queda de /colaboradores: desactivar o reactivar un aparato. «Dar acceso» vive en
// `colaboradores/DarAccesoModal.tsx` (ADR-0341) y lo de cada persona, en su ficha (ADR-0340).
// Recibe recibe `onConfirmar`, que devuelve `true` si la base aceptó; solo entonces se cierra el modal.
// Y `responsable` (ADR-0161/0162, Felipe 2026-09-23: el combo va en TODA acción que guarda): el combo de la pantalla,
// compartido. El modal solo lo pinta encima del botón y apaga el botón mientras falte; la firma y el `despues` los pone
// quien llama (`ejecutar` de `ColaboradoresPanel`).

type Cerrar = () => void;

/**
 * Confirma Desactivar / Reactivar una terminal (ADR-0162). Textos del spike aprobado (pantalla 5). Desactivar es el
 * botón rojo porque corta la sesión del aparato en el acto; reactivar no rompe nada y va en el primario de siempre.
 */
export function AlternarTerminalModal({
  terminal,
  onConfirmar,
  onClose,
  responsable,
}: {
  terminal: Pick<Terminal, "nombre" | "activo">;
  onConfirmar: () => Promise<boolean>;
  onClose: () => void;
  responsable: ControlResponsable;
}) {
  const [enviando, setEnviando] = useState(false);
  const { titulo, texto, boton } = confirmacionTerminal(terminal);

  async function confirmar(cerrar: Cerrar) {
    if (enviando || !responsable.listo) return;
    setEnviando(true);
    const ok = await onConfirmar();
    setEnviando(false);
    if (ok) cerrar();
  }

  return (
    <Modal titulo={titulo} ancho="max-w-md" onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          <p className="text-sm leading-relaxed text-tinta/85">{texto}</p>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          <div className="flex gap-2">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton
              type="button"
              peso="primario"
              className={`flex-1 ${terminal.activo ? "bg-rojo hover:bg-rojo/90" : ""}`}
              cargando={enviando}
              disabled={!responsable.listo}
              title={responsable.motivo ?? undefined}
              onClick={() => confirmar(cerrar)}
            >
              {enviando ? (terminal.activo ? "Desactivando…" : "Reactivando…") : boton}
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
