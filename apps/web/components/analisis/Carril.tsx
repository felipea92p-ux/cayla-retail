"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useAnalisis } from "@/components/analisis/contexto";
import { Icono, type NombreIcono } from "@/components/analisis/iconos";
import { Ayuda, COLOR_ESTADO, TilePrenda, type Estado } from "@/components/analisis/piezas";
import type { PrendaAnalisis } from "@/lib/analisis-tipos";

// Análisis v4 (ADR-0357): el carril de la maqueta, gráfico y lista en una sola pieza. Cada fila es una prenda: su miniatura,
// su nombre, su pista (cuántos días le quedan, o cuántos lleva quieta), sus píldoras y su botón. Toda la fila abre la ficha;
// sus botones no (paran el clic). Lo usan «Se está acabando» y «No se vende», cada una con sus grupos y su pista.

export type GrupoCarril = {
  /** La clave del grupo (`comprar`, `enviar`…): la usa `irA(vista, { foco })` para dejarlo a la vista. */
  clave: string;
  titulo: string;
  /** El «?» del grupo: qué significa, en una o dos frases. */
  ayuda: string;
  icono: NombreIcono;
  est: Estado;
  /** «Vigílalas»: más apagado, sin botón por fila. */
  mudo?: boolean;
  prendas: PrendaAnalisis[];
  /** El botón de todo el grupo («Comprar todas»), si lo hay. */
  lote?: ReactNode;
};

/** Para que un botón dentro de una fila no abra la ficha. */
export const sinAbrirFicha = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();

export function Carril({
  titulo,
  nota,
  herramienta,
  eje,
  grupos,
  pista,
  pildoras,
  accion,
}: {
  titulo: string;
  nota?: ReactNode;
  /** A la derecha del título en vez de la nota: los filtros o el control «Liquidar desde». */
  herramienta?: ReactNode;
  /** Las marcas del eje sobre las pistas: el texto y su posición (`"50%"`). */
  eje: { texto: ReactNode; left: string }[];
  grupos: GrupoCarril[];
  pista: (p: PrendaAnalisis, grupo: GrupoCarril) => ReactNode;
  pildoras: (p: PrendaAnalisis, grupo: GrupoCarril) => ReactNode;
  /** El botón de la fila (y lo que vaya debajo, como «o pedir a Arequipa»); null en los grupos sin acción. */
  accion: (p: PrendaAnalisis, grupo: GrupoCarril) => ReactNode;
}) {
  const { abrirFicha } = useAnalisis();
  const conPrendas = grupos.filter((g) => g.prendas.length > 0);
  return (
    <section className="tarjeta carril entra" style={{ ["--i" as string]: 0 }}>
      <div className="c-cab">
        <h3 className="b-tit">{titulo}</h3>
        <span className="b-nota">{herramienta ?? nota}</span>
      </div>
      <div className="c-eje" aria-hidden>
        <span />
        <span />
        <span className="ticks">
          {eje.map((t, k) => (
            <span key={k} style={{ left: t.left }}>
              {t.texto}
            </span>
          ))}
        </span>
        <span />
        <span />
      </div>
      {conPrendas.length === 0 && (
        <p className="b-nota" style={{ padding: "8px 18px 18px" }}>
          Nada con este filtro.
        </p>
      )}
      {conPrendas.map((g) => (
        <div key={g.clave} role="group" aria-label={g.titulo}>
          <div className={`c-grupo ${g.mudo ? "mudo" : ""}`} data-grupo={g.clave}>
            <span className="ic" style={{ ["--c" as string]: COLOR_ESTADO[g.est] }}>
              <Icono nombre={g.icono} />
            </span>
            <h4>{g.titulo}</h4>
            <span className="n">{g.prendas.length}</span>
            <Ayuda texto={g.ayuda} />
            {g.lote}
          </div>
          {g.prendas.map((p) => (
            <div
              key={p.varianteId}
              className={`c-fila ${g.mudo ? "mudo" : ""}`}
              role="button"
              tabIndex={0}
              data-ps={p.varianteId}
              aria-label={`${p.nombre} · ${p.color} · ${p.talla}: ver su ficha`}
              onClick={(e) => {
                if (!e.currentTarget.contains(e.target as Node)) return;
                abrirFicha(p.varianteId);
              }}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  abrirFicha(p.varianteId);
                }
              }}
            >
              <TilePrenda prenda={p} tamano={36} />
              <span className="c-nom">
                <b>{p.nombre}</b>
                <span>
                  {p.color} · {p.talla}
                </span>
              </span>
              {pista(p, g)}
              <span className="c-pil">{pildoras(p, g)}</span>
              <span className="c-acc" onClick={sinAbrirFicha} onKeyDown={sinAbrirFicha}>
                {g.mudo ? null : accion(p, g)}
              </span>
            </div>
          ))}
        </div>
      ))}
      <div style={{ height: 10 }} />
    </section>
  );
}
