import { Scale } from "lucide-react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Vacio } from "@/components/ui/Vacio";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { soles, solesConSigno } from "@/lib/flujo-caja-reglas";
import type { CambioRubro, CambiosMes } from "@/lib/resumen-cambios-reglas";

// Finanzas ▸ Resumen, «Lo que más se movió desde el mes pasado» (Felipe 2026-10-24, spike 2). Solo DIBUJA lo que arma `cambiosDelMes`: cada rubro con
// lo que movió lo que te deja el mes (la barra es a escala del mayor, `<BarraAvance>`), y una frase arriba que dice por qué. La lista suma exactamente
// lo que cambió el resultado: lo que no cabe se junta en «Otros».

const TITULO = "Lo que más se movió desde el mes pasado";

function detalleDe(f: CambioRubro): string | null {
  if (f.clave === "otros-ajustes") return "Devoluciones, notas de crédito o correcciones del mes.";
  if (f.clave === "otros") return "Los rubros más chicos, juntos.";
  const pct = f.pct === null ? "" : ` · ${f.pct > 0 ? "+" : f.pct < 0 ? "−" : ""}${Math.abs(f.pct)} %`;
  return f.antes === f.ahora ? null : `${soles(f.antes)} → ${soles(f.ahora)}${pct}`;
}

export function CambiosDelMesPieza({ cambios }: { cambios: CambiosMes }) {
  if (cambios.tipo !== "ok")
    return (
      <Superficie pad guia="fin-resumen.cambios">
        <CabeceraBloque titulo={TITULO} bajada={cambios.motivo} />
      </Superficie>
    );
  return (
    <Superficie pad guia="fin-resumen.cambios">
      <CabeceraBloque
        titulo={TITULO}
        bajada={
          <>
            <b>{cambios.titular}</b>
            {cambios.veredicto ? ` ${cambios.veredicto}` : ""}
          </>
        }
      />
      {cambios.filas.length === 0 ? (
        <Vacio tamano="chico" icono={<Scale />}>
          Nada se movió: todos los rubros están igual que en {cambios.contra}.
        </Vacio>
      ) : (
        <ul className="m-0 list-none p-0" aria-label="Qué movió lo que te deja el mes">
          {cambios.filas.map((f, i) => (
            <li key={f.clave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-sand py-2.5 last:border-b-0 sm:grid-cols-[minmax(9rem,1.1fr)_minmax(0,2fr)_6rem]">
              <span className="min-w-0 text-sm">
                <b className="font-semibold">{f.nombre}</b>
                {detalleDe(f) && <small className="block text-xs text-taupe">{detalleDe(f)}</small>}
              </span>
              <span className={`num text-right text-sm font-semibold sm:order-3 ${f.efecto > 0 ? "text-verde" : "text-taupe"}`}>{solesConSigno(f.efecto)}</span>
              <div className="col-span-2 sm:order-2 sm:col-span-1">
                <BarraAvance pct={(Math.abs(f.efecto) / cambios.tope) * 100} alto="fina" tono="tinta" decorativa indice={i} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="nota-cayla mt-3">Compara con el mismo tramo del mes pasado ({cambios.contra}), para que sea justo. Un número verde ayuda a lo que te deja; uno en taupe lo resta.</p>
    </Superficie>
  );
}
