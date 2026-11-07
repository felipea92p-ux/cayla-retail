import { X } from "lucide-react";

/**
 * La × que cierra una hoja de Vender (cobro y descuento), arriba a la derecha: la misma gota redonda de toda hoja del ERP (`.cerrar-hoja`,
 * vidrio/hoja.css; «Cerrar una hoja», ADR-0358). Antes eran una flecha «←» de «Volver» a la izquierda del título, que se leía como el «atrás» del
 * navegador y no decía que cerraba la hoja (Felipe 2026-11-02). Cerrar no guarda ni cobra nada: el ticket sigue como estaba.
 */
export function CerrarHoja({ onCerrar, deshabilitado = false }: { onCerrar: () => void; deshabilitado?: boolean }) {
  return (
    <button type="button" onClick={onCerrar} disabled={deshabilitado} aria-label="Cerrar" title="Cerrar" className="cerrar-hoja shrink-0">
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}
