import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { BotonRegistrarNota } from "@/components/AccionesFaltantes";
import { ETIQUETA_MOTIVO_NOTA, fechaCorta, soles, type CompraResumen } from "@/lib/compras-reglas";
import type { NotaCreditoCompra } from "@/lib/compras-faltantes";
import { estadoNotaFaltante, montoDeCierres, tasaIgv } from "@/lib/recepciones-reglas";

// Sección «Notas de crédito» del detalle de un comprobante (D2, ADR-0111): lo que el proveedor
// ya nos reconoció (faltantes, devoluciones, descuentos), con el enlace para registrar la que
// todavía no llega. Cada nota dice qué hizo: cuánto bajó lo que se debe de este comprobante y cuánto
// quedó A FAVOR del proveedor (típico de una factura al contado, que ya estaba pagada). Y mientras haya
// unidades cerradas sin nota, avisa que el proveedor todavía te la debe («esperando nota»).

// Fecha · Serie-número y motivo · Monto
const PLANTILLA = "sm:grid-cols-[6rem_1fr_8.5rem]";

export function NotasCreditoCompra({ compra, notas, cerrados }: { compra: CompraResumen; notas: NotaCreditoCompra[]; cerrados: { faltan: number; costoUnitario: number }[] }) {
  if (notas.length === 0 && compra.estado !== "vigente") return null;
  const total = notas.reduce((a, n) => a + n.monto, 0);
  const disp = estadoNotaFaltante(compra, notas);
  const esperado = montoDeCierres(cerrados, tasaIgv(compra));
  const unidadesCerradas = cerrados.reduce((a, c) => a + c.faltan, 0);
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="label-cayla text-[11px] text-tinta/65">Notas de crédito</p>
        <BotonRegistrarNota compra={compra} notas={notas} cerrados={cerrados} />
      </div>
      {(disp.estado === "disponible" || (disp.estado === "bloqueada" && unidadesCerradas > 0)) && (
        <p className="rounded-xl border border-ambar/40 bg-ambar/[0.06] px-4 py-3 text-sm leading-relaxed text-tinta">
          <b className="font-semibold text-ambar-profundo">Esperando nota de crédito · {soles(esperado)}</b>
          <br />
          {disp.estado === "disponible"
            ? `Cerraste ${unidadesCerradas} ${unidadesCerradas === 1 ? "unidad" : "unidades"} que no llegaron y el comprobante ya está resuelto. Cuando ${compra.proveedorNombre} emita la nota de crédito, regístrala aquí: ${compra.saldo > 0 ? "no pagues esa parte." : "como ya está pagado, quedará a tu favor."}`
            : `Cerraste ${unidadesCerradas} ${unidadesCerradas === 1 ? "unidad" : "unidades"} que no llegaron, pero quedan ${disp.quedan} sin recibir ni cerrar. La nota por faltante se registra cuando el comprobante quede al 100 %.`}
        </p>
      )}
      {notas.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/65">Sin notas de crédito. Si el proveedor emite una por un faltante o una devolución, se registra aquí: baja lo que se debe y, si ya estaba pagado, queda a tu favor con ese proveedor.</p>
      ) : (
        <Tabla>
          <Encabezado plantilla={PLANTILLA} columnas={[{ titulo: "Fecha" }, { titulo: "Nota · Motivo" }, { titulo: "Monto", alinear: "der" }]} />
          {notas.map((n) => (
            <div key={n.id} className={fila(PLANTILLA)}>
              <span className={celda("izq", "text-xs tabular-nums text-tinta/65")}>{fechaCorta(n.fecha)}</span>
              <span className={celda("izq", "text-sm text-tinta")}>
                <span className="tabular-nums">{n.serieNumero}</span>
                <span className="block truncate text-xs text-tinta/65">{ETIQUETA_MOTIVO_NOTA[n.motivo] ?? n.motivo}{n.nota ? ` · ${n.nota}` : ""}</span>
                <span className="block text-xs text-tinta/65">
                  {n.aplicado > 0 ? `Bajó lo que se debe ${soles(n.aplicado)}` : "No bajó ninguna deuda (ya estaba pagado)"}
                  {n.monto - n.aplicado > 0.004 && <b className="font-semibold text-verde-profundo"> · {soles(n.monto - n.aplicado)} a favor del proveedor</b>}
                </span>
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
