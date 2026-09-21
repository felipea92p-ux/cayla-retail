"use client";

import { claveCelda, type MatrizOrden } from "@/lib/produccion-reglas";

// La orden como grilla color × talla (ADR-0133, F2): así arma el Taller la curva sobre la mesa de corte y así
// la base espera el cierre (`cerrar_produccion` recibe las buenas POR VARIANTE). Tres modos:
//   plan       lo que se planeó, solo lectura
//   cierre     cuántas salieron buenas: una casilla editable por variante
//   resultado  lo que salió, «buenas / plan», solo lectura (órdenes ya terminadas)
// Una combinación que no está en la orden se pinta «—»: no hay variante a la que sumarle nada.

export type ModoMatriz = "plan" | "cierre" | "resultado";

export function MatrizOrdenTabla({
  matriz,
  modo,
  buenas,
  onCambio,
}: {
  matriz: MatrizOrden;
  modo: ModoMatriz;
  /** Solo en `cierre`: el texto de cada casilla por `varianteId`. */
  buenas?: Record<string, string>;
  onCambio?: (varianteId: string, valor: string) => void;
}) {
  // Los totales siguen al modo: en «resultado» suman lo que salió bueno, en los demás lo planeado.
  const valor = (c: string, t: string) => {
    const celda = matriz.celdas[claveCelda(c, t)];
    return celda ? (modo === "resultado" ? (celda.buenas ?? 0) : celda.plan) : 0;
  };
  const totalColor = (c: string) => matriz.tallas.reduce((s, t) => s + valor(c, t), 0);
  const totalTalla = (t: string) => matriz.colores.reduce((s, c) => s + valor(c.nombre, t), 0);
  const total = matriz.colores.reduce((s, c) => s + totalColor(c.nombre), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[18rem] border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th aria-hidden />
            {matriz.tallas.map((t) => (
              <th key={t} scope="col" className="label-cayla px-1 pb-0.5 text-center text-[10px] text-tinta/65">
                {t}
              </th>
            ))}
            <th scope="col" className="label-cayla px-1 pb-0.5 text-center text-[10px] text-tinta/65">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {matriz.colores.map((c) => (
            <tr key={c.nombre}>
              <th scope="row" className="whitespace-nowrap pr-2 text-left text-xs font-normal text-tinta/80">
                <span className="inline-flex items-center gap-1.5">
                  {c.hex && (
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-tinta/15" style={{ background: c.hex }} />
                  )}
                  {c.nombre}
                </span>
              </th>
              {matriz.tallas.map((t) => {
                const celda = matriz.celdas[claveCelda(c.nombre, t)];
                if (!celda) {
                  return (
                    <td key={t} className="rounded-md py-2 text-center text-tinta/35" aria-label={`${c.nombre} ${t}: no está en la orden`}>
                      —
                    </td>
                  );
                }
                if (modo === "cierre") {
                  return (
                    <td key={t}>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={buenas?.[celda.varianteId] ?? ""}
                        onChange={(e) => onCambio?.(celda.varianteId, e.target.value)}
                        aria-label={`Buenas de ${c.nombre} ${t}, de ${celda.plan} planeadas`}
                        className="w-full min-w-[2.75rem] rounded-md border border-tinta/15 bg-crema py-2 text-center tabular-nums text-tinta outline-none transition-colors focus:border-rojo"
                      />
                    </td>
                  );
                }
                const texto = modo === "resultado" && celda.buenas !== null ? `${celda.buenas}/${celda.plan}` : String(celda.plan);
                return (
                  <td key={t} className="rounded-md bg-tinta/[0.04] py-2 text-center tabular-nums text-tinta">
                    {texto}
                  </td>
                );
              })}
              <td className="px-1 text-center text-xs font-medium tabular-nums text-tinta">{totalColor(c.nombre)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td aria-hidden />
            {matriz.tallas.map((t) => (
              <td key={t} className="pt-0.5 text-center text-xs tabular-nums text-tinta/65">
                {totalTalla(t)}
              </td>
            ))}
            <td className="pt-0.5 text-center text-xs font-medium tabular-nums text-tinta">{total}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
