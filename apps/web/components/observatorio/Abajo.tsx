"use client";

// Lo de abajo del Observatorio (ADR-0322): el Taller y «Por revisar». Cada aviso es un orbe con su cuenta y un aro que se
// llena con los días que lleva esperando el más antiguo (a los 7, lleno); lo urgente respira. Tocar un orbe abre su
// detalle debajo, con una transición que lleva el orbe a la tarjeta (View Transitions donde el navegador las tiene); un
// aviso al día, o sin detalle, lleva directo a su pantalla.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { llenadoDelAro, type AvisoObs, type DetalleAviso, type NivelObs, type TallerObs, type Ventana } from "@/lib/observatorio-reglas";
import { useAlVerse } from "@/components/inicio-almacen/useAlVerse";
import { Ic } from "./iconos";
import { Anillo, Cifra, ancho, fmt, useArranque, useObs } from "./piezas";
import { Rutas } from "./PanelTienda";

const COLOR: Record<NivelObs, string> = { urg: "var(--o-urg)", hoy: "var(--o-warn)", semana: "var(--o-info)", ok: "var(--o-ok)" };

export function TallerTarjeta({ taller, ventana, textoVentana }: { taller: TallerObs | null; ventana: Ventana; textoVentana: string }) {
  const router = useRouter();
  const [ref, visto] = useAlVerse<HTMLElement>(0.1);
  const a = useArranque(visto);
  return (
    <section ref={ref} className={`o-tj o-luz o-revelar ${visto ? "visto" : ""}`} style={{ "--rd": "0ms" } as CSSProperties}>
      <div className="o-tcab">
        <span className="o-lbl">Taller</span>
      </div>
      {taller === null ? (
        <div className="o-fallo">
          <Ic n="alerta" />
          <b>Sin datos del Taller</b>
          <span>No se pudo leer. No mostramos 0.</span>
          <button type="button" onClick={() => router.refresh()}>
            Reintentar <Ic n="flecha" t="s" />
          </button>
        </div>
      ) : (
        <div className="o-tl">
          <div className="an">
            <Anillo pct={taller.avance === null ? null : taller.avance * 100} a={a} r={50} w={7} dl={600} />
            <b>
              {taller.avance === null ? "—" : <Cifra v={taller.avance * 100} f="p" activo={visto} />}
              <small>avance</small>
            </b>
          </div>
          <ul>
            <li>
              <b>{taller.enCurso}</b> {taller.enCurso === 1 ? "orden" : "órdenes"} en curso
            </li>
            <li>
              {taller.atrasadas > 0 ? (
                <span className="o-chip warn">
                  <i />
                  {taller.atrasadas} {taller.atrasadas === 1 ? "atrasada" : "atrasadas"}
                </span>
              ) : (
                <span className="o-chip ok">
                  <i />
                  Al día
                </span>
              )}
            </li>
            <li>
              <b>{fmt("n", taller.terminadas[ventana])}</b> prendas terminadas {textoVentana}
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}

function Detalle({ aviso, onCerrar }: { aviso: AvisoObs; onCerrar: () => void }) {
  const a = useArranque();
  const d = aviso.detalle as DetalleAviso;
  let viz: ReactNode = null;
  let pie: ReactNode = <span />;
  if (d.tipo === "diferencias") {
    const mx = Math.max(1, ...d.filas.map((f) => Math.abs(f.diferencia)));
    const total = d.filas.reduce((s, f) => s + f.diferencia, 0);
    viz = (
      <div className="o-dv">
        {d.filas.map((f, n) => (
          <Fragment key={n}>
            <span>
              {f.sede} · {f.dia}
            </span>
            <span className="eje izq">{f.diferencia < 0 && <i className="neg o-anima" style={ancho(a, (-f.diferencia / mx) * 100, n * 90)} />}</span>
            <span className="eje der">{f.diferencia > 0 && <i className="pos o-anima" style={ancho(a, (f.diferencia / mx) * 100, n * 90)} />}</span>
            <span className="v">
              {f.diferencia < 0 ? "−" : "+"}
              {fmt("s", Math.abs(f.diferencia))}
            </span>
          </Fragment>
        ))}
      </div>
    );
    pie =
      total < 0 ? (
        <span>
          Faltan <b>{fmt("s", -total)}</b> en total
        </span>
      ) : (
        <span>
          Sobran <b>{fmt("s", total)}</b> en total
        </span>
      );
  } else if (d.tipo === "porSede") {
    const mx = Math.max(1, ...d.filas.map((f) => f.n));
    viz = (
      <div className="o-hb">
        {d.filas.map((f, n) => (
          <Fragment key={f.sede}>
            <span>{f.sede}</span>
            <span className="pista">
              <i className="o-anima" style={ancho(a, (f.n / mx) * 100, n * 110)} />
            </span>
            <b>{f.n}</b>
          </Fragment>
        ))}
      </div>
    );
    pie = <span>{d.nota}</span>;
  } else if (d.tipo === "tramos") {
    viz = (
      <div className="o-lista">
        <div>
          <span>
            <b>Vencidas</b>
            <small>
              {d.vencidas.n} {d.vencidas.n === 1 ? "factura" : "facturas"}
            </small>
          </span>
          {d.vencidas.n > 0 ? (
            <span className="o-chip urg">
              <i />
              {fmt("s", d.vencidas.monto)}
            </span>
          ) : (
            <span className="o-chip ok">
              <i />
              Ninguna
            </span>
          )}
        </div>
        <div>
          <span>
            <b>Vencen esta semana</b>
            <small>
              {d.semana.n} {d.semana.n === 1 ? "factura" : "facturas"}
            </small>
          </span>
          {d.semana.n > 0 ? (
            <span className="o-chip warn">
              <i />
              {fmt("s", d.semana.monto)}
            </span>
          ) : (
            <span className="o-chip ok">
              <i />
              Ninguna
            </span>
          )}
        </div>
      </div>
    );
    pie = (
      <span>
        <b>{fmt("s", d.vencidas.monto + d.semana.monto)}</b> por pagar
      </span>
    );
  } else if (d.tipo === "rutas") {
    viz = (
      <div className="o-rutas">
        <Rutas rutas={d.rutas} />
      </div>
    );
  } else {
    viz = (
      <div className="o-lista">
        {d.filas.map((f, n) => (
          <div key={n}>
            <span>
              <b>{f.titulo}</b>
              <small>{f.detalle}</small>
            </span>
            {f.chip && (
              <span className="o-chip warn">
                <i />
                {f.chip}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="o-det">
      <div className="o-det-cab">
        <b>{aviso.n}</b>
        <span>{aviso.titulo}</span>
        <button type="button" className="cerrar" onClick={onCerrar} aria-label="Cerrar">
          <Ic n="x" t="s" />
        </button>
      </div>
      {viz}
      <div className="o-det-pie">
        {pie}
        <Link className="o-ir" href={aviso.href}>
          {d.tipo === "diferencias" ? "Revisar" : "Ver"} <Ic n="flecha" t="s" />
        </Link>
      </div>
    </div>
  );
}

export function PorRevisar({
  avisos,
  foco,
  focoSigla,
  siglas,
  abierta,
  onAbrir,
}: {
  avisos: readonly AvisoObs[];
  foco: string;
  focoSigla: string | null;
  /** id de tienda → sigla, para el reparto del tooltip. */
  siglas: Readonly<Record<string, string>>;
  abierta: string | null;
  onAbrir: (clave: string | null) => void;
}) {
  const router = useRouter();
  const { mostrarTip } = useObs();
  const [ref, visto] = useAlVerse<HTMLElement>(0.1);
  const a = useArranque(visto);
  const orden = [...avisos.filter((x) => x.nivel !== "ok"), ...avisos.filter((x) => x.nivel === "ok")];
  const urgentes = avisos.filter((x) => x.nivel === "urg" && x.n !== null).length;
  const delDetalle = abierta ? avisos.find((x) => x.clave === abierta && x.detalle) : undefined;

  const tocar = (x: AvisoObs) => {
    if (x.nivel === "ok" || !x.detalle || x.n === null) {
      router.push(x.href);
      return;
    }
    onAbrir(abierta === x.clave ? null : x.clave);
  };

  return (
    <section
      ref={ref}
      id="o-revisar"
      className={`o-revelar ${visto ? "visto" : ""}`}
      style={{ "--rd": "90ms" } as CSSProperties}
    >
      <div className="o-tcab">
        <span className="o-lbl">Por revisar · {focoSigla ?? `${urgentes} ${urgentes === 1 ? "urgente" : "urgentes"}`}</span>
      </div>
      <div className="o-orbes">
        {orden.map((x) => {
          const sinLeer = x.n === null;
          const nivel: NivelObs = sinLeer ? "semana" : x.nivel;
          const lleno = sinLeer ? 0 : llenadoDelAro(x);
          const tenue = foco !== "TODAS" && x.nivel !== "ok" && x.porTienda !== null && !x.porTienda[foco];
          const n = foco !== "TODAS" && x.porTienda ? (x.porTienda[foco] ?? 0) : x.n;
          return (
            <button
              key={x.clave}
              type="button"
              className={`o-orbe ${nivel} ${abierta === x.clave ? "abierto" : ""} ${tenue ? "tenue" : ""} ${sinLeer ? "sinleer" : ""}`}
              style={abierta === x.clave ? undefined : ({ viewTransitionName: `o-al-${x.clave}` } as CSSProperties)}
              onClick={() => tocar(x)}
              data-tip=""
              onPointerMove={(ev) =>
                mostrarTip(
                  <>
                    <b>{sinLeer ? "?" : x.n || "✓"}</b> {sinLeer ? `${x.titulo}: no se pudo leer` : x.titulo}
                    {x.porTienda && Object.keys(x.porTienda).length > 0 && !sinLeer && (
                      <>
                        <br />
                        {Object.entries(x.porTienda)
                          .filter(([, v]) => v > 0)
                          .map(([id, v]) => `${siglas[id] ?? ""} ${v}`)
                          .join(" · ")}
                      </>
                    )}
                    <br />
                    <span className="suave">Toca para ver</span>
                  </>,
                  ev.clientX,
                  ev.clientY
                )
              }
            >
              <span className="c">
                <svg className="aro" viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="50" r="48" stroke="var(--o-linea)" />
                  {nivel !== "ok" && lleno > 0 && (
                    <circle
                      cx="50"
                      cy="50"
                      r="48"
                      pathLength={100}
                      stroke={COLOR[nivel]}
                      className="o-anima"
                      style={{ strokeDasharray: a.listo ? `${(lleno * 100).toFixed(1)} 100` : "0 100", transitionDelay: a.demora(500) }}
                    />
                  )}
                </svg>
                <Ic n={x.icono} />
                {nivel === "ok" ? null : <b>{n === null ? "?" : <Cifra v={n} f="n" activo={visto} />}</b>}
              </span>
              <span className="t">{x.titulo}</span>
            </button>
          );
        })}
      </div>
      {delDetalle && (
        <div className="o-tj o-adet" style={{ viewTransitionName: `o-al-${delDetalle.clave}` } as CSSProperties}>
          <Detalle key={delDetalle.clave} aviso={delDetalle} onCerrar={() => onAbrir(null)} />
        </div>
      )}
    </section>
  );
}
