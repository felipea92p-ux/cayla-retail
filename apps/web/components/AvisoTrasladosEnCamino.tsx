import Link from "next/link";
import { Truck } from "lucide-react";
import type { TrasladoHaciaAca } from "@/lib/envio-reglas";

// El aviso de Recibir mercadería (ADR-0299): «lo que viene de otra sede de CAYLA no se recibe aquí».
//
// Recibir mercadería es de proveedores. Un traslado entre sedes se cuenta y se confirma en Traslados, donde además se elige si
// la ropa va al piso de venta o al almacén. Antes esta pantalla también recibía traslados (y no preguntaba el lugar): quien abría
// la caja de una sede la contaba aquí y la ropa caía en el almacén sin que nadie lo decidiera. Ahora, en vez de ofrecer el
// conteo, avisa que hay traslados en camino y lleva a la pantalla correcta.
//
// Server Component, sin estado: solo se pinta si hay algo en camino hacia la sede que se mira. No es una alarma (sin rojo):
// explica dónde se hace la cosa. `veTraslados` = el rol de quien mira tiene el módulo; sin él, el aviso dice dónde pero no enlaza
// (una URL directa a un módulo que no tiene terminaría en «Sin acceso»).
export function AvisoTrasladosEnCamino({ traslados, sedeNombre, veTraslados }: { traslados: TrasladoHaciaAca[]; sedeNombre: string; veTraslados: boolean }) {
  if (traslados.length === 0) return null;
  const uno = traslados.length === 1;
  const origenes = [...new Set(traslados.map((t) => t.origenNombre))];
  const titulo = uno
    ? `Viene el Traslado ${traslados[0].numero} desde ${traslados[0].origenNombre} hacia ${sedeNombre}.`
    : `Vienen ${traslados.length} traslados hacia ${sedeNombre} (desde ${origenes.join(" y ")}).`;
  const href = uno ? `/inventario/traslados/${traslados[0].id}` : "/inventario/traslados";

  return (
    <aside aria-label="Traslados de otras sedes en camino" className="nota-cayla anim-entra flex flex-wrap items-center gap-x-4 gap-y-2">
      <Truck aria-hidden strokeWidth={1.5} className="h-5 w-5 shrink-0 text-taupe" />
      <p className="min-w-0 flex-1 basis-64">
        <strong>{titulo}</strong> Eso no se recibe en esta pantalla: se cuenta y se confirma en Traslados, donde también eliges si va al piso de venta o al almacén.
      </p>
      {veTraslados && (
        <Link href={href} className="btn-cayla btn-secundario shrink-0">
          {uno ? `Abrir el Traslado ${traslados[0].numero}` : "Abrir Traslados"}
        </Link>
      )}
    </aside>
  );
}
