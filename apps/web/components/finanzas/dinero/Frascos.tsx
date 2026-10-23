import type { CSSProperties } from "react";
import { Landmark } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { Superficie } from "@/components/finanzas/kit";
import { solesRedondo } from "@/lib/gastos-reglas";
import { REPISA_CAMINO, REPISA_EMPRESA, type Frasco, type Repisa } from "@/lib/dinero-telar-reglas";

// Cuentas y dinero ▸ Dónde está (El telar, Felipe 2026-10-23): cada cuenta es un frasco que se llena hasta su nivel, en la repisa
// de su sede. El nivel y los grupos los decide `lib/dinero-telar-reglas.ts`; aquí solo se dibuja. Sin estado: sirve en el servidor.
// El líquido sube una sola vez al llegar, sin rebote (ADR-0136, excepción de Finanzas, D7), y no se mueve con
// `prefers-reduced-motion` (`app/estilos/finanzas-dinero.css`).

/** El color de cada repisa, hasta que la barra común traiga los tokens de sede (`--color-sede-*`, contrato de la barra). */
const COLORES_SEDE = ["var(--color-pizarra)", "var(--color-verde)", "var(--color-ambar)", "var(--color-taupe)"];
export function colorDeRepisa(clave: string, ubicaciones: readonly { id: string }[]): string {
  if (clave === REPISA_EMPRESA) return "color-mix(in srgb, var(--color-tinta) 55%, transparent)";
  if (clave === REPISA_CAMINO) return "color-mix(in srgb, var(--color-pizarra) 55%, transparent)";
  const i = ubicaciones.findIndex((u) => u.id === clave);
  return COLORES_SEDE[(i < 0 ? 0 : i) % COLORES_SEDE.length];
}

const JARRA = "M24 4h24v8c0 4 14 6 14 18v58a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6V30c0-12 14-14 14-18z";

function DibujoFrasco({ f, i }: { f: Frasco; i: number }) {
  const y = f.nivel === null ? 96 : 96 - f.nivel * 82 - 8;
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
        {f.nivel !== null && (
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

export function Frascos({ repisas, ubicaciones }: { repisas: Repisa[]; ubicaciones: readonly { id: string }[] }) {
  if (repisas.length === 0) {
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
      {repisas.map((r, i) => (
        <article
          key={r.clave}
          className="din-repisa anim-entra"
          style={{ ["--i" as string]: i + 1, ["--c" as string]: colorDeRepisa(r.clave, ubicaciones) } as CSSProperties}
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
          {r.frascos.length > 0 && (
            <div className="din-frascos">
              {r.frascos.map((f) => (
                <DibujoFrasco key={f.id} f={f} i={n++} />
              ))}
            </div>
          )}
          {r.nota && <p className="din-repisa-nota">{r.nota}</p>}
        </article>
      ))}
    </section>
  );
}
