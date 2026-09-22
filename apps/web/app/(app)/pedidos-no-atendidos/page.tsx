import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getPedidosNoAtendidos } from "@/lib/pedidos-no-atendidos";
import { PedidosNoAtendidosLista } from "@/components/PedidosNoAtendidosLista";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";

// Pantalla MÍNIMA de verificación (D-79, ADR-0152) — a propósito FUERA de `lib/menu.ts`: se abre
// solo por esta URL directa, nunca desde el lateral. Prueba que el backend
// (`registrar_pedido_no_atendido`/`marcar_pedido_no_atendido_resuelto`,
// 20260922190000_pedidos_no_atendidos.sql) funciona de punta a punta sin depender de que el botón
// «no había esto» ya viva en el Punto de Venta — eso lo hace otra tanda de esta misma ronda, para
// no chocar con las demás piezas que también tocan `PuntoDeVenta.tsx` ahora mismo.
export default async function PedidosNoAtendidosPage() {
  const persona = await requirePersonaActualV2();
  const pedidos = await getPedidosNoAtendidos(persona.ubicacionId);

  return (
    <div className="space-y-7">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Pedidos no atendidos"
        subtitulo="Verificación (D-79): lo que una clienta pidió y esta sede no tenía."
      />
      <PedidosNoAtendidosLista pedidos={pedidos} />
    </div>
  );
}
