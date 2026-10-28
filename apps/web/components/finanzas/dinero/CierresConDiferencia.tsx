import { Herramientas, Superficie } from "@/components/finanzas/kit";
import { soles } from "@/lib/compras-reglas";
import { diaYNumero, type CierreConDiferencia } from "@/lib/cuentas-dinero-reglas";

// Cuentas y dinero ▸ Dónde está (El telar, actividad 2): los últimos cierres de caja donde lo contado no coincidió con lo que
// debía haber, debajo de las cuentas. Antes vivía en la pestaña «Efectivo por tienda», que se retiró: el efectivo de hoy ya lo
// dicen las filas del cajón y de la caja fuerte. Sin estado: sirve en el servidor.
export function CierresConDiferencia({ cierres }: { cierres: CierreConDiferencia[] }) {
  if (cierres.length === 0) return null;
  return (
    <Superficie className="anim-sube" guia="fin-dinero.diferencias">
      <Herramientas>
        <b className="text-sm font-semibold text-tinta">Últimos cierres con diferencia</b>
      </Herramientas>
      <ul className="fin-lista-mov px-[14px] pb-1.5">
        {cierres.map((c) => (
          <li key={c.cajaId}>
            <span>
              {c.ubicacionNombre} · {diaYNumero(c.cerradaEn)} · {c.diferencia < 0 ? "faltaron" : "sobraron"} {soles(Math.abs(c.diferencia))}
            </span>
            <span>{c.cerradaPor ? `Lo cerró ${c.cerradaPor}.` : ""}</span>
          </li>
        ))}
      </ul>
    </Superficie>
  );
}
