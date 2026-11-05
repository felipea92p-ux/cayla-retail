"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PagarComprobanteProduccionModal } from "@/components/PagarComprobanteProduccionModal";
import type { ComprobanteProduccion } from "@/lib/comprobantes-produccion-reglas";

// La pieza de Finanzas ▸ Por pagar que necesita el navegador (ADR-0195 F4): el pago de la tela del Taller abierto por
// `?pagar=` («Ver» se fue con El telar: la sede la elige la barra común). El pago de una factura de proveedor usa `PagoDesdeUrl` de Compras tal cual.

/**
 * La tela del Taller se paga con el modal de Producción (ADR-0133), sin tocar su lógica: se abre al llegar con
 * `?pagar=<id>` y, al cerrarlo, se quita solo `pagar` de la URL (con `replace`, para que «atrás» no lo vuelva a abrir).
 * El modal pide el dato fresco por su cuenta al registrar.
 */
export function PagoTallerDesdeUrl({ comprobante, hoy }: { comprobante: ComprobanteProduccion; hoy: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  function cerrar() {
    const p = new URLSearchParams(params.toString());
    p.delete("pagar");
    router.replace(p.size ? `${ruta}?${p}` : ruta, { scroll: false });
  }
  return <PagarComprobanteProduccionModal comprobante={comprobante} hoy={hoy} onClose={cerrar} />;
}
