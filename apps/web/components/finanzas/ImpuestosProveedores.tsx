"use client";

import { ReceiptText } from "lucide-react";
import { Cajon } from "@/components/ui/Cajon";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { solesRedondo } from "@/lib/gastos-reglas";
import type { OrigenCosto, ProveedorSinFactura } from "@/lib/renta-anual-reglas";

// Finanzas ▸ Impuestos ▸ «A quién pedirle factura» (ADR-0598): los proveedores ordenados por lo que se les compró sin factura, con la renta que
// se ahorraría y hasta cuánto se le podría pagar con factura sin perder. Solo lee: la lista la arma `proveedoresSinFactura`.

const ORIGEN: Record<OrigenCosto, string> = { mercaderia: "Mercadería", taller: "Taller", gasto: "Gasto" };

export function ProveedoresSinFactura({ lista, desde, tasa, onCerrar }: { lista: ProveedorSinFactura[]; desde: string; tasa: number; onCerrar: () => void }) {
  const centimos = Math.round(tasa * 1000) / 10;
  return (
    <Cajon
      onCerrar={onCerrar}
      titulo="A quién pedirle factura"
      sobre="Renta del año"
      frase={`Lo que les compraste sin factura desde ${desde}, de mayor a menor. Empieza por arriba: es donde más renta pagas.`}
      marca={<ReceiptText aria-hidden className="h-5 w-5" />}
      guiaCuerpo="fin-impuestos.proveedores"
    >
      {lista.length === 0 ? (
        <Vacio tamano="chico" icono={<ReceiptText />}>
          Todo lo que compraste desde {desde} tiene factura.
        </Vacio>
      ) : (
        <>
          <p className="nota-cayla mb-4 text-sm">
            Con factura, el IGV que pagas lo recuperas al declarar y cada sol resta {centimos} céntimos de renta. Por eso te sale igual pagarle más a
            quien te da factura, hasta la cifra de cada fila (sin IGV).
          </p>
          <ul className="divide-y divide-sand">
            {lista.map((p) => (
              <li key={p.clave} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[15px] font-medium text-tinta">{p.proveedor ?? "Gastos sin proveedor"}</span>
                  <span className="shrink-0 tabular-nums text-[15px] text-tinta">{solesRedondo(p.sinPapel + p.enBoleta)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-taupe">
                  <Chip tono="pizarra" versalitas={false}>
                    {ORIGEN[p.origen]}
                  </Chip>
                  <span>
                    {p.documentos} {p.documentos === 1 ? "compra" : "compras"}
                    {p.enBoleta > 0 && `, ${solesRedondo(p.enBoleta)} con boleta`}
                  </span>
                </div>
                <p className="mt-1 text-sm text-tinta">
                  Con factura ahorras {solesRedondo(p.ahorroRenta)} de renta. Te sale igual pagarle hasta {solesRedondo(p.precioConFactura)}.
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Cajon>
  );
}
