"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { diaYHoraLima } from "@/lib/fechas-lima";
import type { PedidoNoAtendido } from "@/lib/pedidos-no-atendidos";

// La mitad cliente de la pantalla de verificación (D-79, ADR-0152): marcar resuelto es la única
// escritura que esta pantalla ofrece — anotar uno nuevo todavía no tiene botón acá a propósito
// (nace en el Punto de Venta, en otra tanda de esta ronda). `marcar_pedido_no_atendido_resuelto`
// vuelve a exigir el candado de ubicación en la base: este botón nunca es la única puerta.
export function PedidosNoAtendidosLista({ pedidos }: { pedidos: PedidoNoAtendido[] }) {
  const router = useRouter();
  const [resolviendoId, setResolviendoId] = useState<string | null>(null);

  async function marcarResuelto(pedido: PedidoNoAtendido) {
    setResolviendoId(pedido.id);
    const { error } = await createClient().rpc("marcar_pedido_no_atendido_resuelto", { p_pedido_id: pedido.id });
    setResolviendoId(null);
    if (error) {
      avisar.error(traducirError(error, "marcar el pedido como resuelto"));
      return;
    }
    avisar.exito("Pedido marcado como resuelto");
    router.refresh();
  }

  const pendientes = pedidos.filter((p) => !p.resuelto);
  const resueltos = pedidos.filter((p) => p.resuelto);

  return (
    <div className="space-y-7">
      <section className="space-y-3">
        <h2 className="label-cayla text-tinta/60">Pendientes ({pendientes.length})</h2>
        {pendientes.length === 0 ? (
          <p className="text-sm text-tinta/60">Ningún pedido pendiente en esta sede.</p>
        ) : (
          <ul className="divide-y divide-tinta/10 rounded-md border border-tinta/10">
            {pendientes.map((pedido) => (
              <FilaPedido key={pedido.id} pedido={pedido} resolviendo={resolviendoId === pedido.id} onResolver={() => marcarResuelto(pedido)} />
            ))}
          </ul>
        )}
      </section>

      {resueltos.length > 0 && (
        <section className="space-y-3">
          <h2 className="label-cayla text-tinta/60">Resueltos ({resueltos.length})</h2>
          <ul className="divide-y divide-tinta/10 rounded-md border border-tinta/10 opacity-60">
            {resueltos.map((pedido) => (
              <FilaPedido key={pedido.id} pedido={pedido} resolviendo={false} onResolver={undefined} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FilaPedido({
  pedido,
  resolviendo,
  onResolver,
}: {
  pedido: PedidoNoAtendido;
  resolviendo: boolean;
  onResolver: (() => void) | undefined;
}) {
  const { dia, hora } = diaYHoraLima(pedido.creadoEn);
  const que = pedido.productoReferencia ?? pedido.descripcionLibre ?? "—";

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-tinta">
          {que}
          {pedido.talla && <span className="text-tinta/60"> · talla {pedido.talla}</span>}
        </p>
        <p className="text-xs text-tinta/55">
          {dia} {hora}
          {!pedido.productoReferencia && pedido.descripcionLibre && " · fuera de catálogo"}
        </p>
      </div>
      {pedido.resuelto ? (
        <Chip tono="verde">Resuelto</Chip>
      ) : (
        <Boton peso="fantasma" cargando={resolviendo} onClick={onResolver}>
          Marcar resuelto
        </Boton>
      )}
    </li>
  );
}
