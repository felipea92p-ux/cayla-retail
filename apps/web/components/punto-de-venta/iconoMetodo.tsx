import { Banknote, CreditCard, Landmark, QrCode } from "lucide-react";
import type { MetodoPagoVenta } from "@cayla-retail/shared";

// El ícono de cada medio de pago (pedido de Felipe, 2026-09-14): `lucide` para lo genérico y, para Yape y Plin, sus marcas dibujadas a
// mano en MONOCROMO —heredan `currentColor`, nunca el morado ni el azul de las marcas: el rojo es acento, no logo—.
//
// Vive aquí, solo, y NO dentro del ticket de Vender (ADR-0674, actividad 7): lo usan Caja, Apartados y las fichas de medio de pago de
// todo el ERP (`components/ui/FichasMedio.tsx`), y al importarlo del ticket se llevaban la pantalla de Vender entera.

const ICONO = "h-5 w-5 shrink-0";

/** Yape: la burbuja rellena con «S/» adentro, como su isotipo. */
function IconoYape({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2.5a8.5 8.5 0 0 0-6.3 14.2l-.6 4.1a.6.6 0 0 0 .9.6l3.5-2.1A8.5 8.5 0 1 0 12 2.5Z" />
      <text x="12" y="14.4" textAnchor="middle" fontSize="8" fontWeight="700" fontFamily="ui-sans-serif, system-ui, sans-serif" className="fill-papel">
        S/
      </text>
    </svg>
  );
}

/** Plin: la burbuja en trazo con la palabra adentro, como su isotipo. */
function IconoPlin({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round">
      <path d="M12 3a8.8 8.8 0 0 1 0 17.6c-1.4 0-2.7-.3-3.9-.9L4 21l.8-3.6A8.8 8.8 0 0 1 12 3Z" />
      <text x="12" y="14.3" textAnchor="middle" fontSize="6.5" fontWeight="700" fontFamily="ui-sans-serif, system-ui, sans-serif" fill="currentColor" stroke="none">
        plin
      </text>
    </svg>
  );
}

/** El ícono de un medio, al tamaño que pida quien lo pinta: los cuadrados de la hoja de cobro lo quieren llenando el cuadro. */
export function iconoMetodo(m: MetodoPagoVenta, className: string): React.ReactNode {
  switch (m) {
    case "efectivo":
      return <Banknote className={className} aria-hidden />;
    case "tarjeta":
      return <CreditCard className={className} aria-hidden />;
    case "qr":
      return <QrCode className={className} aria-hidden />;
    case "yape":
      return <IconoYape className={className} />;
    case "plin":
      return <IconoPlin className={className} />;
    case "transferencia":
      return <Landmark className={className} aria-hidden />;
  }
}

export const ICONO_METODO: Record<MetodoPagoVenta, React.ReactNode> = {
  efectivo: iconoMetodo("efectivo", ICONO),
  tarjeta: iconoMetodo("tarjeta", ICONO),
  qr: iconoMetodo("qr", ICONO),
  yape: iconoMetodo("yape", ICONO),
  plin: iconoMetodo("plin", ICONO),
  transferencia: iconoMetodo("transferencia", ICONO),
};
