import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { AYUDA_HOY } from "@/lib/existencias-hoy";
import type { ViajeEnCamino } from "@/lib/inicio-almacen";
import type { Existencias } from "@/lib/inicio-almacen-reglas";
import { CifraAlVer } from "./CifraAlVer";
import { EnVista } from "./EnVista";
import { Ico, PrendaSinFoto, type ClaveIco } from "./iconos";
import { ReintentarLectura } from "./ReintentarLectura";

// Los bloques de la columna derecha del Inicio de Almacén: Pulso, En camino, Por colgar y Accesos. Cada uno dice la verdad
// de lo que pudo leer: un dato que falló es «—» con «No se pudo leer», nunca un cero.

const SIN_LEER = "No se pudo leer";

function Cabecera({ titulo }: { titulo: string }) {
  return (
    <div className="ia-sec-h">
      <p className="label-cayla text-[11px] text-tinta/65">{titulo}</p>
    </div>
  );
}

function Vacio({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="ia-vacio">
      <span className="ia-ck">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M5 12l4 4 10-10" />
        </svg>
      </span>
      <div>
        <b>{titulo}</b>
        <span>{detalle}</span>
      </div>
    </div>
  );
}

// ── Pulso del almacén ────────────────────────────────────────────────────────────────────────────

function Kpi({ etiqueta, valor, sub, aro }: { etiqueta: string; valor: number | null; sub: string; aro?: number | null }) {
  return (
    <div className="ia-k">
      <p className="ia-lbl">{etiqueta}</p>
      <p className="ia-v">
        {valor === null ? (
          "—"
        ) : (
          <>
            <CifraAlVer valor={valor} />
            {aro !== undefined && <small>%</small>}
          </>
        )}
      </p>
      <p className="ia-s">{sub}</p>
      {aro !== undefined && aro !== null && (
        <svg className="ia-ring ia-l" viewBox="0 0 44 44" aria-hidden>
          <circle className="ia-bg" cx="22" cy="22" r="18" pathLength="100" />
          <circle className="ia-fg" cx="22" cy="22" r="18" pathLength="100" style={{ "--off": 100 - aro } as CSSProperties} />
        </svg>
      )}
    </div>
  );
}

export function PulsoAlmacen({
  existencias,
  hoy,
  fotos,
}: {
  existencias: Existencias | null | undefined;
  hoy: { entraron: number; salieron: number } | null | undefined;
  fotos: { activos: number; conFoto: number } | null;
}) {
  const pctFoto = fotos && fotos.activos > 0 ? Math.round((fotos.conFoto / fotos.activos) * 100) : fotos ? 100 : null;
  return (
    <EnVista como="section" className="ia-rv" style={{ "--i": 4 } as CSSProperties}>
      <Cabecera titulo="Pulso del almacén" />
      <div className="ia-kp">
        {existencias !== undefined && (
          <Kpi
            etiqueta="En almacén"
            valor={existencias === null ? null : existencias.enAlmacen}
            sub={existencias === null ? SIN_LEER : existencias.enAlmacen === null ? "Esta sede no separa piso y almacén" : "prendas libres atrás"}
          />
        )}
        {hoy !== undefined && <Kpi etiqueta="Entraron hoy" valor={hoy === null ? null : hoy.entraron} sub={hoy === null ? SIN_LEER : "prendas a esta sede"} />}
        {hoy !== undefined && <Kpi etiqueta="Salieron hoy" valor={hoy === null ? null : hoy.salieron} sub={hoy === null ? SIN_LEER : "prendas de esta sede"} />}
        <Kpi etiqueta="Con foto" valor={pctFoto} aro={pctFoto} sub={fotos === null ? SIN_LEER : "del catálogo"} />
      </div>
    </EnVista>
  );
}

// ── En camino ────────────────────────────────────────────────────────────────────────────────────

export function EnCaminoAlmacen({ viajes }: { viajes: ViajeEnCamino[] | null }) {
  return (
    <EnVista como="section" className="ia-rv" style={{ "--i": 5 } as CSSProperties}>
      <Cabecera titulo="En camino" />
      <div className="card-cayla ia-ruta">
        {viajes === null ? (
          <div className="ia-err">
            <Ico clave="warn" />
            <p>No se pudo leer lo que viene en camino. Lo demás sí está al día.</p>
            <ReintentarLectura />
          </div>
        ) : viajes.length === 0 ? (
          <Vacio titulo="Nada en camino" detalle="Todo lo enviado ya llegó." />
        ) : (
          viajes.map((v) => (
            <Link key={v.id} href="/inventario/traslados" className="ia-rr">
              <div className="ia-hd">
                <b>
                  {v.de.sigla} → {v.a.sigla} · {v.prendas} {v.prendas === 1 ? "prenda" : "prendas"}
                </b>
                <span>{v.llegada ?? "sin hora estimada"}</span>
              </div>
              <div className="ia-via" style={{ "--pv": v.avance ?? 0 } as CSSProperties}>
                <i className="ia-ln">
                  <i />
                </i>
                <span className="ia-nd ia-on">{v.de.sigla}</span>
                {v.avance !== null && (
                  <span className="ia-tk">
                    <Ico clave="truck" />
                  </span>
                )}
                <span className="ia-nd ia-on">{v.a.sigla}</span>
              </div>
              <p className="ia-prog">
                <span>{v.sentido === "entra" ? `Viene hacia aquí · traslado ${v.numero}` : `Salió de aquí · traslado ${v.numero}`}</span>
                {v.avance !== null && <span className="tabular-nums">{Math.round(v.avance * 100)} % del trayecto</span>}
              </p>
            </Link>
          ))
        )}
      </div>
    </EnVista>
  );
}

// ── Por colgar ───────────────────────────────────────────────────────────────────────────────────

/** Lo que está por colgar en la sede, con la cifra y la palabra de «Para hoy» en Existencias (`existenciasDeAlmacen`): cada prenda
 *  lleva a la lista filtrada por «Hoy ▸ Por colgar» y el pie, a «Bajar al piso» con esas tallas ya cargadas. */
export function PorColgarAlmacen({ existencias }: { existencias: Existencias | null | undefined }) {
  if (existencias === undefined) return null;
  if (existencias !== null && existencias.enAlmacen === null) return null; // la sede no separa piso y almacén: no hay nada que colgar
  const tallas = existencias?.porColgar.tallas ?? 0;
  return (
    <EnVista como="section" className="ia-rv" style={{ "--i": 6 } as CSSProperties}>
      <Cabecera titulo="Por colgar" />
      <div className="card-cayla ia-rp">
        {existencias === null ? (
          <div className="ia-err">
            <Ico clave="warn" />
            <p>No se pudo leer el piso de venta. Lo demás sí está al día.</p>
            <ReintentarLectura />
          </div>
        ) : tallas === 0 ? (
          <Vacio titulo="Nada por colgar" detalle="Cada talla guardada ya tiene una colgada." />
        ) : (
          <>
            {existencias.primeras.map((p, i) => (
              <Link key={p.clave} href="/inventario?hoy=por_colgar" className={`ia-it ${i === 0 ? "ia-f" : ""}`}>
                <span className="ia-mg">{p.fotoUrl ? <Image src={p.fotoUrl} alt="" fill sizes="40px" unoptimized /> : <PrendaSinFoto />}</span>
                <div className="min-w-0">
                  <p className="ia-nm">{p.referencia}</p>
                  {p.color && <p className="ia-cl">{p.color}</p>}
                </div>
                <span className="ia-tl" title={AYUDA_HOY.por_colgar}>
                  {p.tallas.slice(0, 5).map((t) => (
                    <span key={t} className="ia-p">
                      {t}
                    </span>
                  ))}
                  {p.tallas.length > 5 && <span>+{p.tallas.length - 5}</span>}
                </span>
              </Link>
            ))}
            <div className="ia-pie">
              <span className="tabular-nums">
                {tallas} {tallas === 1 ? "talla" : "tallas"} por colgar
              </span>
              <Link href={existencias.hrefBajar} className="ia-enl">
                Bajar al piso <Ico clave="arrow" />
              </Link>
            </div>
          </>
        )}
      </div>
    </EnVista>
  );
}

// ── Accesos ──────────────────────────────────────────────────────────────────────────────────────

export type AccesoAlmacen = { href: string; etiqueta: string; icono: ClaveIco; destacado?: boolean };

export function AccesosAlmacen({ accesos }: { accesos: AccesoAlmacen[] }) {
  if (accesos.length === 0) return null;
  return (
    <section className="ia-rv" style={{ "--i": 7 } as CSSProperties}>
      <Cabecera titulo="Accesos" />
      <div className="ia-acs">
        {accesos.map((a, j) => (
          <Link key={a.href} href={a.href} className={`ia-ax ia-rj ${a.destacado ? "ia-esc" : ""}`} style={{ "--j": j } as CSSProperties}>
            <Ico clave={a.icono} />
            {a.etiqueta}
          </Link>
        ))}
      </div>
    </section>
  );
}
