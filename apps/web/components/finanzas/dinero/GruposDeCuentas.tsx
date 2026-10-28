import type { CSSProperties } from "react";
import { Landmark } from "lucide-react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { Superficie } from "@/components/finanzas/kit";
import { colorDeGrupo, montoConSigno, type FilaCuenta, type GrupoCuentas } from "@/lib/dinero-telar-reglas";
import type { SedeTelar } from "@/lib/finanzas-telar-reglas";

// Cuentas y dinero ▸ Dónde está (El telar, Felipe 2026-10-23): una tarjeta por sede y, adentro, una fila por cuenta con su saldo a
// la derecha, lo que dice de ella debajo del nombre y una barra fina de cuánto pesa contra la cuenta con más plata. Hasta el
// 2026-10-28 cada cuenta era un frasco que se llenaba (ADR-0497); se cambió porque un dibujo no deja comparar cifras ni leerlas.
// El grupo, el orden y el peso de cada fila los decide `lib/dinero-telar-reglas.ts`; aquí solo se dibuja. Sin estado: sirve en el
// servidor. Sin movimiento propio: las barras son las de `BarraAvance` (se llenan una vez al verse) y las tarjetas entran en cascada.

function FilaDeCuenta({ f, i }: { f: FilaCuenta; i: number }) {
  const oculto = f.saldo === null;
  const saldo = f.saldo ?? 0;
  return (
    <li className="din-fila" data-oculto={oculto ? "" : undefined} data-negativo={Math.round(saldo) < 0 ? "" : undefined}>
      <div className="din-fila-cab">
        <span className="din-fila-nombre">
          {f.nombre}
          {f.detalle && <small>{f.detalle}</small>}
        </span>
        <b className="din-fila-saldo">{oculto ? "Lo ve quien cierra la caja" : montoConSigno(saldo)}</b>
      </div>
      {f.insignia && (
        <Chip tono={f.insignia.tono} versalitas={false}>
          {f.insignia.texto}
        </Chip>
      )}
      {f.escala !== null && <BarraAvance pct={f.escala * 100} alto="fina" tono="tinta" decorativa indice={i} />}
    </li>
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
    <section className="din-grupos" aria-label="Dónde está la plata" data-guia="fin-dinero.cuentas">
      {grupos.map((g, i) => (
        <article
          key={g.clave}
          className="din-grupo anim-entra"
          style={{ ["--i" as string]: i + 1, ["--c" as string]: colorDeGrupo(g.clave, sedes) } as CSSProperties}
          aria-label={`${g.titulo}: ${montoConSigno(g.total)}`}
        >
          <header className="din-grupo-cab">
            <span className="din-grupo-sede">
              <i aria-hidden="true" />
              {g.titulo}
            </span>
            <b className="din-grupo-total">
              {montoConSigno(g.total)}
              {g.ocultos && <span className="din-grupo-mas"> y lo que no ves</span>}
            </b>
          </header>
          {g.filas.length > 0 && (
            <ul className="din-filas" role="list">
              {g.filas.map((f) => (
                <FilaDeCuenta key={f.id} f={f} i={n++} />
              ))}
            </ul>
          )}
          {g.nota && <p className="din-grupo-nota">{g.nota}</p>}
        </article>
      ))}
    </section>
  );
}
