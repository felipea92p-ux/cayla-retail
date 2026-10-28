import type { CSSProperties } from "react";
import { Landmark } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { Superficie } from "@/components/finanzas/kit";
import { solesRedondo } from "@/lib/gastos-reglas";
import { colorDeGrupo, type FilaCuenta, type GrupoCuentas } from "@/lib/dinero-telar-reglas";
import type { SedeTelar } from "@/lib/finanzas-telar-reglas";

// Cuentas y dinero ▸ Dónde está (El telar, Felipe 2026-10-23): cada cuenta es un frasco que se llena hasta su nivel, en la repisa
// de su sede. El nivel y los grupos los decide `lib/dinero-telar-reglas.ts`; aquí solo se dibuja. Sin estado: sirve en el servidor.
// El líquido sube una sola vez al llegar, sin rebote (ADR-0136, excepción de Finanzas, D7), y no se mueve con
// `prefers-reduced-motion` (`app/estilos/finanzas-dinero.css`).

const JARRA = "M24 4h24v8c0 4 14 6 14 18v58a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6V30c0-12 14-14 14-18z";

function DibujoCuenta({ f, i }: { f: FilaCuenta; i: number }) {
  const y = f.escala === null ? 96 : 96 - f.escala * 82 - 8;
  const clip = `din-cl-${f.id}`;
  return (
    <div className="din-frasco" data-oculto={f.saldo === null ? "" : undefined}>
      <svg viewBox="0 0 72 96" aria-hidden="true">
        <defs>
          <clipPath id={clip}>
            <path d={JARRA} />
          </clipPath>
        </defs>
        <path className="din-vidrio" d={JARRA} />
        {f.escala !== null && (
          <g clipPath={`url(#${clip})`}>
            <g className="din-liquido" style={{ ["--i" as string]: i } as CSSProperties}>
              <rect x="0" y={y} width="72" height="100" />
              <path d={`M0 ${y} Q 18 ${y - 3} 36 ${y} T 72 ${y}`} />
            </g>
          </g>
        )}
        <path className="din-brillo" d="M17 36v40" />
      </svg>
      <span className="din-frasco-saldo">{f.saldo === null ? "Lo ve quien cierra la caja" : f.saldo < 0 ? `−${solesRedondo(-f.saldo)}` : solesRedondo(f.saldo)}</span>
      <span className="din-frasco-nombre">
        {f.nombre}
        {f.detalle && <small>{f.detalle}</small>}
      </span>
      {f.insignia && (
        <Chip tono={f.insignia.tono} versalitas={false}>
          {f.insignia.texto}
        </Chip>
      )}
    </div>
  );
}

export function GruposDeCuentas({ grupos, sedes }: { grupos: GrupoCuentas[]; sedes: readonly SedeTelar[] }) {
  if (grupos.length === 0) {
    return (
      <Superficie>
        <Vacio icono={<Landmark />} titulo="Todavía no hay cuentas: agrega los bancos de CAYLA">
          Los cajones y las cajas fuertes nacen con cada tienda. Los bancos, las billeteras, el POS y la tarjeta se agregan en Configuración ▸ Cuentas y cobros.
        </Vacio>
      </Superficie>
    );
  }
  let n = 0;
  return (
    <section className="din-estante" aria-label="Dónde está la plata" data-guia="fin-dinero.cuentas">
      {grupos.map((r, i) => (
        <article
          key={r.clave}
          className="din-repisa anim-entra"
          style={{ ["--i" as string]: i + 1, ["--c" as string]: colorDeGrupo(r.clave, sedes) } as CSSProperties}
          aria-label={`${r.titulo}: ${solesRedondo(r.total)}`}
        >
          <header className="din-repisa-cab">
            <span className="din-repisa-sede">
              <i aria-hidden="true" />
              {r.titulo}
            </span>
            <b className="din-repisa-total">
              {solesRedondo(r.total)}
              {r.ocultos && <span className="din-repisa-mas"> y lo que no ves</span>}
            </b>
          </header>
          {r.filas.length > 0 && (
            <div className="din-frascos">
              {r.filas.map((f) => (
                <DibujoCuenta key={f.id} f={f} i={n++} />
              ))}
            </div>
          )}
          {r.nota && <p className="din-repisa-nota">{r.nota}</p>}
        </article>
      ))}
    </section>
  );
}
