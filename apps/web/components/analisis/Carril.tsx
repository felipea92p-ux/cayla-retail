"use client";

import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useAnalisis } from "@/components/analisis/contexto";
import { Icono, type NombreIcono } from "@/components/analisis/iconos";
import { Ayuda, COLOR_ESTADO, TilePrenda, type Estado } from "@/components/analisis/piezas";
import type { PrendaAnalisis } from "@/lib/analisis-tipos";
import { textoVerMas } from "@/lib/analisis-piso";

// Análisis v4 (ADR-0357): el carril de la maqueta, gráfico y lista en una sola pieza. Cada fila es una prenda: su miniatura,
// su nombre, su pista (cuántos días le quedan, o cuántos lleva quieta), sus píldoras y su botón. Toda la fila abre la ficha;
// sus botones no (paran el clic). Lo usan «Se está acabando», «No se vende» y «Nunca salió al piso», cada una con sus grupos y
// su pista; un grupo con `corte` muestra sus primeras filas y «Ver N más» (los tipos de «Nunca salió al piso»).

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
  /** Un dibujo en vez del ícono de Análisis: el tipo de prenda en «Nunca salió al piso». */
  dibujo?: ReactNode;
  /** Junto a la cuenta, un dato del grupo («116 unidades · vendiste 38 en 8 días»). */
  detalle?: ReactNode;
  /** Cuántas filas se ven antes de «Ver N más»; sin corte, todas. */
  corte?: number;
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
  // Los grupos con corte que ya se abrieron enteros (se vuelven a cortar al entrar otra vez a la pestaña).
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(() => new Set());
  const conPrendas = grupos.filter((g) => g.prendas.length > 0);
  return (
    <section className="tarjeta carril entra" style={{ ["--i" as string]: 0 }}>
      <div className="c-cab">
        <div>
          <h3 className="b-tit">{titulo}</h3>
          {/* Con herramienta, la nota (de qué días habla el ritmo) baja bajo el título en vez de perderse. */}
          {herramienta && nota && <span className="c-sub">{nota}</span>}
        </div>
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
              {g.dibujo ?? <Icono nombre={g.icono} />}
            </span>
            <h4>{g.titulo}</h4>
            <span className="n">{g.prendas.length}</span>
            {g.detalle && <span className="detalle">{g.detalle}</span>}
            <Ayuda texto={g.ayuda} />
            {g.lote}
          </div>
          {(g.corte !== undefined && !abiertos.has(g.clave) ? g.prendas.slice(0, g.corte) : g.prendas).map((p) => (
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
          {g.corte !== undefined && !abiertos.has(g.clave) && g.prendas.length > g.corte && (
            <button type="button" className="c-mas" onClick={() => setAbiertos((s) => new Set(s).add(g.clave))}>
              {textoVerMas(g.prendas.length - g.corte)}
              <Icono nombre="sigue" />
            </button>
          )}
        </div>
      ))}
      <div style={{ height: 10 }} />
    </section>
  );
}
