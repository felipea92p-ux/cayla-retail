import { renderToBuffer } from "@react-pdf/renderer";
import { getComprobanteCompleto } from "@/lib/comprobantes";
import { ComprobanteA4 } from "@/lib/pdf/ComprobanteA4";

// @react-pdf/renderer compone el PDF en el propio proceso Node (sin Chromium,
// sin llamar a un servicio externo) — nada que romper si un servicio de
// terceros cae (principio 9), pero necesita el runtime completo de Node, no Edge.
export const runtime = "nodejs";

// RLS ya filtra qué comprobante puede ver esta persona (fn_puede_operar_sede) —
// getComprobanteCompleto no aplica ningún filtro propio, hereda el de la fila.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comprobante = await getComprobanteCompleto(id);
  if (!comprobante) {
    return Response.json({ error: "Comprobante no encontrado o sin permiso para verlo" }, { status: 404 });
  }

  const buffer = await renderToBuffer(<ComprobanteA4 c={comprobante} />);
  const nombreArchivo = `${comprobante.tipo}-${comprobante.serie}-${String(comprobante.numero).padStart(6, "0")}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombreArchivo}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
