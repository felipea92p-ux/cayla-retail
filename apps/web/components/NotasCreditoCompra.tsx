import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { BotonRegistrarNota } from "@/components/AccionesFaltantes";
import { ETIQUETA_MOTIVO_NOTA, fechaCorta, soles, type CompraResumen } from "@/lib/compras-reglas";
import type { NotaCreditoCompra } from "@/lib/compras-faltantes";

// Sección «Notas de crédito» del detalle de un comprobante (D2, ADR-0106): lo que el proveedor
// ya nos reconoció (faltantes, devoluciones, descuentos), con el enlace para registrar la que
// todavía no llega. Si no hay notas y ya no hay nada que se deba, la sección no aparece: no
// hay qué mostrar ni qué registrar.

// Fecha · Serie-número y motivo · Monto
const PLANTILLA = "sm:grid-cols-[6rem_1fr_8.5rem]";

export function NotasCreditoCompra({ compra, notas }: { compra: CompraResumen; notas: NotaCreditoCompra[] }) {
  const puedeRegistrar = compra.estado === "vigente" && compra.saldo > 0;
  if (notas.length === 0 && !puedeRegistrar) return null;
  const total = notas.reduce((a, n) => a + n.monto, 0);
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="label-cayla text-[11px] text-tinta/65">Notas de crédito</p>
        <BotonRegistrarNota compra={compra} />
      </div>
      {notas.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/65">Sin notas de crédito. Si el proveedor emite una por un faltante o una devolución, se registra aquí y baja lo que se debe.</p>
      ) : (
        <Tabla>
          <Encabezado plantilla={PLANTILLA} columnas={[{ titulo: "Fecha" }, { titulo: "Nota · Motivo" }, { titulo: "Monto", alinear: "der" }]} />
          {notas.map((n) => (
            <div key={n.id} className={fila(PLANTILLA)}>
              <span className={celda("izq", "text-xs tabular-nums text-tinta/65")}>{fechaCorta(n.fecha)}</span>
              <span className={celda("izq", "text-sm text-tinta")}>
                <span className="tabular-nums">{n.serieNumero}</span>
                <span className="block truncate text-xs text-tinta/65">{ETIQUETA_MOTIVO_NOTA[n.motivo] ?? n.motivo}{n.nota ? ` · ${n.nota}` : ""}</span>
              </span>
              <span className={celda("der", "text-sm tabular-nums text-tinta")}>− {soles(n.monto)}</span>
            </div>
          ))}
          {notas.length > 1 && (
            <div className={fila(PLANTILLA)}>
              <span className="hidden sm:block" />
              <span className={celda("izq", "label-cayla text-[11px] text-tinta/65")}>Total de notas</span>
              <span className={celda("der", "text-sm tabular-nums text-tinta")}>− {soles(total)}</span>
            </div>
          )}
        </Tabla>
      )}
    </section>
  );
}
