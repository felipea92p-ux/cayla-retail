"use client";

import { EMOJIS_DEL_MENSAJE } from "@/lib/emojis-del-mensaje";

/**
 * La fila «Emojis:» de toda hoja que edita un mensaje de WhatsApp (Pedidos web, Avisos del club). No recibe la lista a propósito: son
 * los mismos emojis en todas las hojas. Solo avisa cuál se tocó; dónde cae lo decide la hoja, que sabe dónde estaba el cursor.
 */
export function FilaEmojis({ disabled, onElegir }: { disabled?: boolean; onElegir: (emoji: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm text-taupe">Emojis:</span>
      {EMOJIS_DEL_MENSAJE.map((e) => (
        <button key={e} type="button" className="pildora-cayla" aria-label={`Insertar ${e}`} disabled={disabled} onClick={() => onElegir(e)}>
          {e}
        </button>
      ))}
    </div>
  );
}
