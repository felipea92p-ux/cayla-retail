"use client";

import { useState, type CSSProperties, type MouseEvent } from "react";
import { estiloDeGrupo, IconoDeGrupo } from "@/components/plan-piso/IconoDeGrupo";
import { PorQue } from "@/components/plan-piso/PorQue";
import { cifraEs, pctEs } from "@/lib/mix-piso-visual";
import { ariaDeLasFichasDeHoy, etiquetaDeChipHoy, leyendaDeGrupo, rotuloCabe, type BloqueDelRiel, type Libre, type PanelDelPorQue } from "@/lib/plan-piso-percha";
import { siluetaDe } from "@/lib/plan-piso-siluetas";

// Los dos rieles de perchas del Plan del piso ▸ Propuesta (maqueta A «La percha», ADR-0352 act. 2026-10-11): «Hoy» y «Cómo quedaría», cada uno con las perchas
// de sus grupos colgadas en tramos, y lo que hay para tocar: pasar por un grupo (o enfocarlo con el teclado) lo resalta en los dos rieles y en las leyendas, y
// tocarlo lo deja fijo. Es la parte INTERACTIVA de la tarjeta; el encabezado «78 de 1,800» y el aviso son del servidor y van alrededor.
//
// Aquí no se calcula nada: el servidor (`PropuestaDelMix`) trae todo armado de `lib/plan-piso-percha.ts` —los tramos, las frases, el panel— y este archivo solo lo
// dibuja y guarda qué grupo está resaltado. Las siluetas las dibuja `<SiluetasDelPlan />` una sola vez en la pantalla.

export type GrupoDelRiel = { clave: string; nombre: string; corto: string; indice: number; hoy: number; propuesta: number; propuestaPct: number | null };

type Props = {
  grupos: GrupoDelRiel[];
  hoy: BloqueDelRiel[];
  propuesta: BloqueDelRiel[];
  /** Cuántas perchas mide el riel entero: la escala de los dos. */
  escala: number;
  /** Las perchas del tramo más largo: si no cabe en una fila (celular), la percha se achica en vez de salirse de la tarjeta. */
  mayor: number;
  /** ¿La sede ya cuadró su piso? Si no, «hoy» es lo que el sistema CREE y las frases lo dicen. */
  cuadrado: boolean;
  libre: Libre;
  subHoy: string;
  subPropuesta: string;
  ariaHoy: string;
  ariaPropuesta: string;
  textoPorQue: string;
  panel: PanelDelPorQue;
  nota: { antes: string; unidad: string; despues: string };
};

const vars = (v: Record<string, string | number>) => v as unknown as CSSProperties;

function Percha({ clave, fraccion, i }: { clave: string; fraccion: number; i: number }) {
  return (
    <span className="pp-p" style={vars({ "--f": fraccion.toFixed(3), "--i": i })}>
      <svg viewBox="0 0 40 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <use href="#pp-h" />
        <use href={`#pp-s-${siluetaDe(clave)}`} className="pp-sil" />
      </svg>
    </span>
  );
}

export function TarjetaDelRiel({ grupos, hoy, propuesta, escala, mayor, cuadrado, libre, subHoy, subPropuesta, ariaHoy, ariaPropuesta, textoPorQue, panel, nota }: Props) {
  const [sobre, setSobre] = useState<string | null>(null);
  const [fijo, setFijo] = useState<string | null>(null);
  const sel = fijo ?? sobre;
  const grupoSel = sel === null ? undefined : grupos.find((g) => g.clave === sel);
  const leyenda = grupoSel ? leyendaDeGrupo(grupoSel, cuadrado) : null;
  // Un grupo sin ninguna percha (0 hoy y 0 en la propuesta) no tiene tramo que resaltar: sin esto, señalarlo bajaba TODOS los tramos y no encendía ninguno.
  const hayTramo = sel !== null && [...hoy, ...propuesta].some((b) => b.clave === sel);

  // Con un toque no hay cursor que siga encima: al soltar lo fijado también se suelta lo señalado (si no, el segundo toque dejaba el resaltado pegado).
  // El mouse y el teclado no entran aquí: un cursor que sigue encima SÍ sigue señalando el grupo.
  const alternar = (clave: string, e: MouseEvent) => {
    setFijo((f) => (f === clave ? null : clave));
    if ((e.nativeEvent as PointerEvent).pointerType === "touch") setSobre(null);
  };
  // Un grupo que se señala (con el mouse o el teclado) se resalta; al soltarlo vuelve todo. Lo fijado con un toque manda sobre lo señalado.
  const señas = (clave: string) => ({ onMouseEnter: () => setSobre(clave), onMouseLeave: () => setSobre(null), onFocus: () => setSobre(clave), onBlur: () => setSobre(null) });
  const on = (clave: string) => (sel === clave ? " pp-on" : "");

  // OJO: es una función que devuelve JSX, NO un componente: uno definido aquí se remontaría en cada resaltado y las perchas volverían a colgar.
  function tramos(bloques: BloqueDelRiel[], rotulos: boolean) {
    let i = 0;
    return (
      <>
        {bloques.map((b) => {
          const g = grupos.find((x) => x.clave === b.clave);
          const perchas = [];
          for (let k = 0; k < b.llenas; k++) perchas.push(<Percha key={k} clave={b.clave} fraccion={1} i={i++} />);
          if (b.resto > 0) perchas.push(<Percha key="resto" clave={b.clave} fraccion={b.resto} i={i++} />);
          return (
            <div key={b.clave} className={`pp-blq${on(b.clave)}`} data-g={b.clave} title={g?.nombre} style={{ ...vars({ "--n": b.perchas.toFixed(4) }), ...estiloDeGrupo(b.indice) }} onMouseEnter={() => setSobre(b.clave)} onMouseLeave={() => setSobre(null)}>
              {rotulos && g && rotuloCabe(b.perchas) && <span className="pp-et">{g.corto}</span>}
              {perchas}
            </div>
          );
        })}
      </>
    );
  }

  // La escala de los dos rieles (cuántas perchas mide el entero) y cuántos tramos hay: de ahí sale el ancho de cada percha (`plan-piso.css`).
  const estiloRiel = vars({ "--total": escala.toFixed(4), "--ng": Math.max(1, grupos.length), "--mayor": Math.max(1, mayor).toFixed(4) });

  return (
    <div className="pp-zona" data-sel={hayTramo ? sel : undefined} onMouseLeave={() => setSobre(null)}>
      <div className="pp-riel" data-riel="hoy">
        <div className="pp-rcab">
          <div className="pp-rtit">
            <h3 className="pp-etq">Hoy</h3>
            <span className="pp-rsub">{subHoy}</span>
          </div>
        </div>
        <div className="pp-banda">
          <div className="pp-rail" role="img" aria-label={ariaHoy} style={estiloRiel}>
            {tramos(hoy, false)}
            <div className="pp-libre">
              <b>{libre.cifra}</b>
              <span>{libre.etiqueta}</span>
              <small>{libre.nota}</small>
            </div>
          </div>
        </div>
        <ul className="pp-chips" aria-label={ariaDeLasFichasDeHoy(cuadrado)}>
          {grupos.map((g) => (
            <li key={g.clave}>
              <button type="button" className={`pp-chip${on(g.clave)}`} data-g={g.clave} style={estiloDeGrupo(g.indice)} aria-pressed={fijo === g.clave} aria-label={etiquetaDeChipHoy(g, cuadrado)} onClick={(e) => alternar(g.clave, e)} {...señas(g.clave)}>
                <IconoDeGrupo clave={g.clave} />
                {g.corto} <b>{cifraEs(g.hoy)}</b>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="pp-riel" data-riel="prop">
        <div className="pp-rcab">
          <div className="pp-rtit">
            <h3 className="pp-etq">Cómo quedaría</h3>
            <span className="pp-rsub">{subPropuesta}</span>
          </div>
          <PorQue texto={textoPorQue} panel={panel} />
        </div>
        <div className="pp-banda">
          <div className="pp-rail" role="img" aria-label={ariaPropuesta} style={estiloRiel}>
            {tramos(propuesta, true)}
          </div>
        </div>
        <ul className="pp-leyenda" aria-label="Reparto propuesto por grupo">
          {grupos.map((g) => (
            <li key={g.clave}>
              <button type="button" className={`pp-lg${on(g.clave)}`} data-g={g.clave} style={estiloDeGrupo(g.indice)} aria-pressed={fijo === g.clave} onClick={(e) => alternar(g.clave, e)} {...señas(g.clave)}>
                <IconoDeGrupo clave={g.clave} />
                <span className="pp-lg-t">
                  <b>{g.nombre}</b>
                  <small>
                    {g.propuestaPct === null ? "sin propuesta" : `${pctEs(g.propuestaPct)} del riel`} · hoy {cifraEs(g.hoy)}
                  </small>
                </span>
                <span className="pp-lg-n">
                  <span className="sr-only">quedaría con </span>
                  {cifraEs(g.propuesta)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="pp-pie">
        <span className="pp-escala">
          <svg className="pp-ic" viewBox="0 0 40 60" aria-hidden="true" focusable="false">
            <use href="#pp-h" />
          </svg>
          <span>
            {nota.antes}
            <b>{nota.unidad}</b>
            {nota.despues}
          </span>
        </span>
        <span className="pp-cap">
          {leyenda ? (
            <>
              <b>{leyenda.nombre}</b>
              {leyenda.resto}
            </>
          ) : (
            "Pasa el cursor, usa Tab o toca un grupo para ver dónde cuelga."
          )}
        </span>
      </div>
    </div>
  );
}
