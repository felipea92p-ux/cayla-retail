"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Chip } from "@/components/ui/Chip";
import { SelectFin } from "@/components/finanzas/kit";
import { PagarComprobanteProduccionModal } from "@/components/PagarComprobanteProduccionModal";
import type { ComprobanteProduccion } from "@/lib/comprobantes-produccion-reglas";
import type { UbicacionGastos, Ver } from "@/lib/gastos-reglas";

// Las dos piezas de Finanzas ▸ Por pagar que necesitan el navegador (ADR-0195 F4): «Ver» y el pago de la tela del Taller
// abierto por `?pagar=`. El pago de una factura de proveedor usa `PagoDesdeUrl` de Compras tal cual.

/** «Ver»: el líder elige todas, una unidad o la empresa (queda en la URL); quien tiene el módulo ve su tienda y no elige. */
export function VerPorPagar({ ver, unidades, esLider }: { ver: Ver; unidades: UbicacionGastos[]; esLider: boolean }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  if (!esLider) return <Chip versalitas={false}>{unidades[0]?.nombre ?? "Tu tienda"}</Chip>;
  const ir = (valor: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("ver", valor);
    p.delete("pagar");
    router.push(`${ruta}?${p.toString()}`, { scroll: false });
  };
  return (
    <label className="fin-ver">
      <span className="label-cayla text-[11px] text-taupe">Ver</span>
      <SelectFin value={ver.clave} onChange={(e) => ir(e.target.value)} aria-label="Qué mirar">
        <option value="todas">Todas las tiendas</option>
        {unidades.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre}
          </option>
        ))}
        <option value="empresa">De la empresa</option>
      </SelectFin>
    </label>
  );
}

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
