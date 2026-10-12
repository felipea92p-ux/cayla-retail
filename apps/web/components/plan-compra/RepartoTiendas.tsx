import { Ayuda } from "@/components/Ayuda";
import { enteroES } from "@/lib/plan-compra-reglas";
import { repartir, type TiendaReparto } from "@/lib/plan-compra-reparto";

// «Cómo se reparte entre tiendas» (ADR-0372, act. 2026-10-12 · Felipe: «de manera global debemos comprar tanto, pero cada sede es única»).
// Del objetivo de la categoría: cuánto le toca a cada tienda según lo que vende, cuánto ya tiene, cuánto mandarle al inicio y cuánto le
// sobra (se puede trasladar). Solo dice: no mueve nada. Se recalcula mientras se escribe el plan.

export function RepartoTiendas({ objetivo, tiendas, taller }: { objetivo: number; tiendas: readonly TiendaReparto[]; /** Lo que hay en el Taller (de donde se manda primero). */ taller: number }) {
  const r = repartir(objetivo, tiendas);
  return (
    <div data-guia="plan-modal.reparto" className="mt-4 border-t border-sand pt-3">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-tinta">
        Cómo se reparte entre tiendas
        <Ayuda titulo="El reparto">
          <span className="block">Lo que conviene tener se reparte según lo que vendió cada tienda en 90 días (su ritmo por día, para no castigar a la que abrió después).</span>
          <span className="mt-2 block">Una tienda con mínimo (lo fija un líder en «Ver detalle» del Plan) recibe por lo menos ese %, aunque venda poco.</span>
          <span className="mt-2 block">«Mandar» es lo que le falta para llegar a lo que le toca: se manda todo al inicio. «Sobra» se puede trasladar a otra tienda.</span>
        </Ayuda>
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-taupe">
              <th className="py-1 pr-3 text-left font-normal">Tienda</th>
              <th className="py-1 pr-3 text-right font-normal">Le toca</th>
              <th className="py-1 pr-3 text-right font-normal">Ya tiene</th>
              <th className="py-1 pr-3 text-right font-normal">Mandar</th>
              <th className="py-1 text-right font-normal">Sobra</th>
            </tr>
          </thead>
          <tbody>
            {r.filas.map((f) => (
              <tr key={f.id} className="border-t border-sand/70">
                <td className="py-1.5 pr-3 text-tinta">
                  {f.nombre}{" "}
                  <span className="text-xs text-taupe">
                    {Math.round(f.pct * 100)} %{f.porMinimo ? " · mínimo" : ""}
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-tinta">{enteroES.format(f.leToca)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-tinta/75">{enteroES.format(f.tiene)}</td>
                <td className={`py-1.5 pr-3 text-right tabular-nums ${f.falta > 0 ? "font-semibold text-tinta" : "text-tinta/45"}`}>{enteroES.format(f.falta)}</td>
                <td className={`py-1.5 text-right tabular-nums ${f.sobra > 0 ? "text-ambar-profundo" : "text-tinta/45"}`}>{enteroES.format(f.sobra)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-tinta/65">
        Para mandar {enteroES.format(r.falta)}: {taller > 0 ? `primero lo del Taller (${enteroES.format(taller)})` : "el Taller no tiene"}
        {r.sobra > 0 ? `, después lo que sobra en otras tiendas (${enteroES.format(r.sobra)})` : ""}, y lo que falte, de lo que se compra.
      </p>
    </div>
  );
}
