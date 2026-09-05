import { notFound } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getComprobanteCompleto } from "@/lib/comprobantes";
import { montoALetras } from "@/lib/pdf/numero-a-letras";
import { BotonImprimirTicket } from "@/components/BotonImprimirTicket";

const money = (n: number) => `S/ ${n.toFixed(2)}`;

const ETIQUETA_TIPO: Record<string, string> = {
  boleta: "BOLETA DE VENTA ELECTRÓNICA",
  factura: "FACTURA ELECTRÓNICA",
  nota_credito: "NOTA DE CRÉDITO ELECTRÓNICA",
};

// Ticket térmico (80mm, ancho fijo típico de la Epson TM-T20III que ya usa
// CAYLA — ver BACKLOG.md). Página aparte, fuera de (app): sin sidebar ni nav,
// porque esto se imprime tal cual, no se navega. `@page { size: 80mm auto }`
// deja que el driver de la impresora corte el papel por longitud del
// contenido real — a diferencia de un PDF de página fija, no desperdicia
// rollo. Se abre en una pestaña nueva desde el botón "Imprimir" del panel de
// comprobantes justo después de emitir, para que el colaborador de sede lo
// entregue en el momento de la venta.
export default async function TicketComprobantePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePersonaActual();
  const { id } = await params;
  const c = await getComprobanteCompleto(id);
  if (!c) notFound();

  const direccionSede = [c.sede.direccion, c.sede.distrito].filter(Boolean).join(", ");
  const fecha = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(c.created_at));
  const clienteDoc = c.cliente_num_doc ? `${c.cliente_tipo_doc === "ruc" ? "RUC" : "DNI"} ${c.cliente_num_doc}` : null;

  return (
    <>
      <style>{`
        @page { size: 80mm auto; margin: 0; }
        @media print {
          .no-imprimir { display: none !important; }
          html, body { background: #fff !important; }
        }
      `}</style>
      <div className="mx-auto max-w-[80mm] bg-white px-3 py-4 font-mono text-[11px] leading-snug text-black">
        <div className="no-imprimir mb-4">
          <BotonImprimirTicket />
        </div>

        <div className="text-center">
          <p className="text-sm font-bold">{c.empresa.nombre_comercial ?? c.empresa.razon_social}</p>
          <p>{c.empresa.razon_social}</p>
          <p>RUC {c.empresa.ruc}</p>
          {direccionSede && <p>{direccionSede}</p>}
          {(c.sede.telefono ?? c.empresa.telefono) && <p>Telf: {c.sede.telefono ?? c.empresa.telefono}</p>}
        </div>

        <hr className="my-2 border-dashed border-black" />

        <div className="text-center">
          <p className="font-bold">{ETIQUETA_TIPO[c.tipo]}</p>
          <p className="font-bold">{c.serie}-{String(c.numero).padStart(6, "0")}</p>
        </div>

        <hr className="my-2 border-dashed border-black" />

        <p>Fecha: {fecha}</p>
        <p>Cliente: {c.cliente_nombre ?? "Cliente varios"}</p>
        {clienteDoc && <p>{clienteDoc}</p>}

        <hr className="my-2 border-dashed border-black" />

        {c.items.map((item, i) => (
          <div key={i} className="mb-1">
            <p>{item.descripcion}</p>
            <div className="flex justify-between">
              <span>
                {item.cantidad} x {money(item.valor_unitario)}
              </span>
              <span>{money(item.total)}</span>
            </div>
          </div>
        ))}

        <hr className="my-2 border-dashed border-black" />

        <div className="flex justify-between">
          <span>Op. gravada</span>
          <span>{money(c.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>IGV (18%)</span>
          <span>{money(c.igv)}</span>
        </div>
        <div className="mt-1 flex justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span>{money(c.total)}</span>
        </div>

        <p className="mt-2 text-[10px] italic">{montoALetras(c.total)}</p>

        {c.estado === "pendiente" && (
          <p className="mt-2 text-[9px]">
            Comprobante con número oficial reservado, aún no transmitido a SUNAT.
          </p>
        )}

        <hr className="my-2 border-dashed border-black" />

        <p className="text-center text-[9px]">
          Representación impresa de {c.tipo === "factura" ? "factura" : "boleta"} de venta electrónica
        </p>
        {c.empresa.resolucion_autorizacion && (
          <p className="text-center text-[9px]">Res. N° {c.empresa.resolucion_autorizacion}</p>
        )}
        <p className="mt-2 text-center text-[9px]">¡Gracias por tu compra!</p>
      </div>
    </>
  );
}
