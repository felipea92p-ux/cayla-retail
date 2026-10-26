"use client";

import { useRef } from "react";
import { FAMILIAS_DE_COLOR } from "@cayla-retail/shared/colores-de-la-tienda";
import { fraseDeTalla, nombreDeFamilia, type Faceta } from "@/lib/filtros-color-talla";
import { useFiltros } from "./ProveedorFiltros";

// Lo elegido a la vista, bajo la barra: una ficha por color y por talla («Negro ✕», «Talla M ✕») que se quita de un toque, y el aviso de lo que
// el sistema quitó solo («En Pantalones no hay talla M: la quitamos · Deshacer»). Una ficha de una opción «muerta» (elegida, pero con lo otro ya no
// queda ninguna prenda) lleva borde discontinuo y lo dice. Maqueta «Opción 1», ADR-0512 actividad 4.

const Equis = () => (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <path d="m2 2 8 8M10 2 2 10" />
  </svg>
);

type Ficha = { clave: string; faceta: Faceta; valor: string; nombre: string; hex: string | null };

export function FichasDeFiltros() {
  const f = useFiltros();
  const lista = useRef<HTMLUListElement>(null);
  if (!f) return null;
  const { elegido, vivo, aviso } = f;
  const fichas: Ficha[] = [
    ...elegido.color.map((id) => ({ clave: `c-${id}`, faceta: "color" as const, valor: id as string, nombre: nombreDeFamilia(id), hex: FAMILIAS_DE_COLOR.find((c) => c.id === id)?.muestra ?? null })),
    ...elegido.talla.map((t) => {
      const frase = fraseDeTalla(t);
      return { clave: `t-${t}`, faceta: "talla" as const, valor: t, nombre: frase.charAt(0).toUpperCase() + frase.slice(1), hex: null };
    }),
  ];

  /** Se quita la ficha y el foco pasa a su vecina (o, si era la última, a COLOR): nunca cae al cuerpo de la página. */
  function quitarFicha(ficha: Ficha) {
    const botones = Array.from(lista.current?.querySelectorAll<HTMLElement>(".fp-ficha") ?? []);
    const i = botones.findIndex((b) => b.dataset.clave === ficha.clave);
    const vecina = botones[i + 1] ?? botones[i - 1];
    const claveVecina = vecina?.dataset.clave;
    f?.tocar(ficha.faceta, ficha.valor);
    requestAnimationFrame(() => {
      const siguiente = claveVecina ? lista.current?.querySelector<HTMLElement>(`.fp-ficha[data-clave="${claveVecina}"]`) : null;
      (siguiente ?? f?.colorRef.current)?.focus({ preventScroll: true });
    });
  }

  return (
    <>
      <div className="fp-aviso-zona" role="status" aria-live="polite">
        {aviso && (
          <div className="fp-aviso">
            <p>{aviso.texto}</p>
            <button
              type="button"
              onClick={() => {
                const hacer = aviso.deshacer;
                f.descartarAviso();
                hacer();
                f.colorRef.current?.focus({ preventScroll: true });
              }}
            >
              Deshacer
            </button>
          </div>
        )}
      </div>
      <div className="fp-sel" data-hay={fichas.length > 0 ? "" : undefined} inert={fichas.length === 0}>
        <div className="fp-sel-in">
          <div className="fp-sel-pad">
            <ul ref={lista} className="fp-fichas" aria-label="Filtros puestos">
              {fichas.map((x) => {
                const muerta = (vivo?.muertas[x.faceta] as readonly string[] | undefined)?.includes(x.valor) === true;
                return (
                  <li key={x.clave}>
                    <button
                      type="button"
                      className="fp-ficha"
                      data-clave={x.clave}
                      data-muerta={muerta ? "" : undefined}
                      aria-label={`Quitar ${x.nombre}${muerta ? " (sin prendas con lo otro elegido)" : ""}`}
                      onClick={() => quitarFicha(x)}
                    >
                      {x.hex && <i className="fp-pto" style={{ "--hex": x.hex } as React.CSSProperties} />}
                      <span>{x.nombre}</span>
                      {muerta && <span className="fp-ficha-nota">· sin prendas con lo otro elegido</span>}
                      <Equis />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
