"use client";

import { useId, useState, type CSSProperties } from "react";
import { estiloDeGrupo, IconoDeGrupo } from "@/components/plan-piso/IconoDeGrupo";
import { cifraEs, prendasEs } from "@/lib/mix-piso-visual";
import { detalleDeFila, leyendaDeGrupo, type BloqueDelRiel, type Libre, type PanelDelPorQue } from "@/lib/plan-piso-percha";
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

export function TarjetaDelRiel({ grupos, hoy, propuesta, escala, libre, subHoy, subPropuesta, ariaHoy, ariaPropuesta, textoPorQue, panel, nota }: Props) {
  const [sobre, setSobre] = useState<string | null>(null);
  const [fijo, setFijo] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const idPanel = useId();
  const sel = fijo ?? sobre;
  const grupoSel = sel === null ? undefined : grupos.find((g) => g.clave === sel);
  const leyenda = grupoSel ? leyendaDeGrupo(grupoSel) : null;

  const alternar = (clave: string) => setFijo((f) => (f === clave ? null : clave));
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
            <div key={b.clave} className={`pp-blq${on(b.clave)}`} data-g={b.clave} style={{ ...vars({ "--n": b.perchas.toFixed(4) }), ...estiloDeGrupo(b.indice) }} onMouseEnter={() => setSobre(b.clave)} onMouseLeave={() => setSobre(null)}>
              {rotulos && g && <span className="pp-et">{g.corto}</span>}
              {perchas}
            </div>
          );
        })}
      </>
    );
  }

  // La escala de los dos rieles (cuántas perchas mide el entero) y cuántos tramos hay: de ahí sale el ancho de cada percha (`plan-piso.css`).
  const estiloRiel = vars({ "--total": escala.toFixed(4), "--ng": Math.max(1, grupos.length) });

  return (
    <div className="pp-zona" data-sel={sel ?? undefined} onMouseLeave={() => setSobre(null)}>
      <div className="pp-riel" data-riel="hoy">
        <div className="pp-rcab">
          <div className="pp-rtit">
            <span className="pp-etq">Hoy</span>
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
        <ul className="pp-chips" aria-label="Prendas de hoy por grupo">
          {grupos.map((g) => (
            <li key={g.clave}>
              <button type="button" className={`pp-chip${on(g.clave)}`} data-g={g.clave} style={estiloDeGrupo(g.indice)} aria-pressed={fijo === g.clave} aria-label={`${g.nombre}: ${prendasEs(g.hoy)} hoy`} onClick={() => alternar(g.clave)} {...señas(g.clave)}>
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
            <span className="pp-etq">Cómo quedaría</span>
            <span className="pp-rsub">{subPropuesta}</span>
          </div>
          <button type="button" className="pp-porque" aria-expanded={abierto} aria-controls={idPanel} onClick={() => setAbierto((a) => !a)}>
            <span className="pp-q" aria-hidden="true">?</span>
            <span>{textoPorQue}</span>
          </button>
        </div>
        <div className="pp-banda">
          <div className="pp-rail" role="img" aria-label={ariaPropuesta} style={estiloRiel}>
            {tramos(propuesta, true)}
          </div>
        </div>
        <ul className="pp-leyenda" aria-label="Reparto propuesto por grupo">
          {grupos.map((g) => (
            <li key={g.clave}>
              <button type="button" className={`pp-lg${on(g.clave)}`} data-g={g.clave} style={estiloDeGrupo(g.indice)} aria-pressed={fijo === g.clave} onClick={() => alternar(g.clave)} {...señas(g.clave)}>
                <IconoDeGrupo clave={g.clave} />
                <span className="pp-lg-t">
                  <b>{g.nombre}</b>
                  <small>
                    {g.propuestaPct === null ? "sin propuesta" : `${cifraEs(g.propuestaPct)} % del riel`} · hoy {cifraEs(g.hoy)}
                  </small>
                </span>
                <span className="pp-lg-n">{cifraEs(g.propuesta)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="pp-panel" id={idPanel} hidden={!abierto}>
          {panel.parrafos.map((t, k) => (
            <p key={k}>{t}</p>
          ))}
          <div className="pp-pt">Cómo salió cada grupo</div>
          <ul>
            {panel.filas.map((f) => (
              <li key={f.clave}>
                <b>
                  {f.nombre}
                  {f.propuestaPct === null ? "" : ` → ${cifraEs(f.propuestaPct)} %`}
                </b>
                {detalleDeFila(f)}
              </li>
            ))}
          </ul>
        </div>
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
        <span className="pp-cap" aria-live="polite">
          {leyenda ? (
            <>
              <b>{leyenda.nombre}</b>
              {leyenda.resto}
            </>
          ) : (
            "Pasa el cursor o toca un grupo para ver dónde cuelga."
          )}
        </span>
      </div>
    </div>
  );
}
