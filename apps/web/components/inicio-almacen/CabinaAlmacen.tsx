import Image from "next/image";
import { SinFoto, categoriaDe } from "@/components/ui/PrendaCelda";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Aviso, NivelAviso } from "@/lib/inicio-avisos";
import { hrefFichaProducto, type NuevoProducto, colorUnico } from "@/lib/inicio-almacen-reglas";
import { ChipSede } from "./ChipSede";
import { CifraAlVer } from "./CifraAlVer";
import { EnVista } from "./EnVista";
import { Ico } from "./iconos";
import { ReintentarLectura } from "./ReintentarLectura";

// La cabina del Inicio de Almacén (Felipe, 2026-09-30, maqueta docs/maquetas/inicio-almacen-2026-09/): «Nuevo producto» con
// su botón, debajo lo último que se registró (para mirar antes de crear otro igual), y al lado «Sigue ahora».

export const CLASE_NIVEL: Record<NivelAviso, string> = { urgente: "ia-urg", toca: "ia-toca", info: "ia-info", sinleer: "ia-sinleer", aldia: "ia-dia" };

export function CabinaAlmacen({
  nuevos,
  tituloLista,
  ahora,
  despues,
  alDia,
  avance,
  hayColaSinLeer,
}: {
  nuevos: NuevoProducto[] | null;
  tituloLista: string;
  /** La primera tarea de «Te toca»; `null` si no queda ninguna. */
  ahora: Aviso | null;
  /** Las tres siguientes. */
  despues: Aviso[];
  /** Colas que están al día (para el estado «Todo al día»). */
  alDia: Aviso[];
  avance: { alDia: number; total: number; pct: number };
  /** Alguna cola no se pudo leer: sin tareas, eso NO es «todo al día». */
  hayColaSinLeer: boolean;
}) {
  const lista = nuevos ? nuevos.slice(0, 3) : null;
  return (
    <section className="ia-hero ia-rv" style={{ "--i": 1 } as CSSProperties} aria-label="Nuevo producto">
      <i className="ia-aur ia-a" aria-hidden />
      <i className="ia-aur ia-b" aria-hidden />
      <div className="ia-hl">
        <p className="ia-lbl">Registrar mercadería</p>
        <h2>Nuevo producto</h2>
        <div className="ia-ac">
          <Link id="ia-cta" href="/productos/nuevo" className="ia-cta ia-mag">
            <span>Crear producto</span>
            <span className="ia-plus">
              <Ico clave="plus" />
            </span>
          </Link>
          <span className="ia-tecla">
            o presiona <kbd>N</kbd>
          </span>
        </div>
        <div className="ia-uh">
          <span>{tituloLista}</span>
          {nuevos && nuevos.length > 3 && (
            <a className="ia-vinc" href="#nuevos">
              Ver los {nuevos.length} <Ico clave="chevDown" />
            </a>
          )}
        </div>
        <div className="ia-lst">
          {lista === null ? (
            <p className="ia-rs-msg">
              No se pudo leer lo último registrado. Puedes crear el producto igual.
              <ReintentarLectura />
            </p>
          ) : lista.length === 0 ? (
            <p className="ia-rs-msg">Nada nuevo hoy ni ayer.</p>
          ) : (
            lista.map((p) => <FilaReciente key={p.id} p={p} />)
          )}
        </div>
      </div>
      <SigueAhora ahora={ahora} despues={despues} alDia={alDia} avance={avance} hayColaSinLeer={hayColaSinLeer} />
    </section>
  );
}

function FilaReciente({ p }: { p: NuevoProducto }) {
  return (
    <Link href={hrefFichaProducto(p.id)} className="ia-rs">
      <span className="ia-th">{p.fotoUrl ? <Image src={p.fotoUrl} alt="" fill sizes="44px" unoptimized /> : <SinFoto tamano="h-full w-full !rounded-none" colorHex={colorUnico(p.colores)} {...categoriaDe(p)} />}</span>
      <div className="ia-mtx">
        <p className="ia-nm">{p.referencia}</p>
        <p className="ia-mt">
          <ChipSede p={p} />
          <span>
            {p.codigo ? `${p.codigo} · ` : ""}
            {p.quien ? `${p.quien} · ` : ""}
            <span className="whitespace-nowrap">{p.hace}</span>
          </span>
        </p>
      </div>
      <span className="ia-ya">Ver →</span>
    </Link>
  );
}

function SigueAhora({
  ahora,
  despues,
  alDia,
  avance,
  hayColaSinLeer,
}: {
  ahora: Aviso | null;
  despues: Aviso[];
  alDia: Aviso[];
  avance: { alDia: number; total: number; pct: number };
  hayColaSinLeer: boolean;
}) {
  const aro = (
    <div className="ia-fila">
      <svg className="ia-ring" viewBox="0 0 44 44" aria-hidden>
        <circle className="ia-bg" cx="22" cy="22" r="18" pathLength="100" />
        <circle className="ia-fg" cx="22" cy="22" r="18" pathLength="100" style={{ "--off": 100 - avance.pct } as CSSProperties} />
      </svg>
      <p className="ia-t">
        <b>
          <CifraAlVer valor={avance.alDia} /> de {avance.total}
        </b>
        colas al día
      </p>
    </div>
  );

  if (!ahora) {
    return (
      <EnVista como="aside" className="ia-ah ia-rv" style={{ "--i": 2 } as CSSProperties}>
        <p className="ia-lbl">
          <i className={hayColaSinLeer ? "ia-toca" : "ia-ok"} />
          Sigue ahora
        </p>
        {hayColaSinLeer ? (
          <>
            <h3>No se pudo leer lo que te toca</h3>
            <p className="ia-d">Lo demás de esta pantalla sí está al día. Reintenta en un momento.</p>
            <ReintentarLectura className="ia-go" />
          </>
        ) : (
          <>
            <h3>Todo al día</h3>
            <p className="ia-d">Nada te espera ahora. Si llegó mercadería nueva, empieza por Nuevo producto.</p>
            {alDia.length > 0 && (
              <div className="ia-desp">
                <p className="ia-lbl2">Al día</p>
                {alDia.slice(0, 3).map((a) => (
                  <Link key={a.clave} href={a.href} className="ia-dp">
                    <Ico clave="check" />
                    <span className="ia-t">{a.titulo}</span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
        {aro}
      </EnVista>
    );
  }

  return (
    <EnVista como="aside" className="ia-ah ia-rv" style={{ "--i": 2 } as CSSProperties}>
      <p className="ia-lbl">
        <i className={ahora.nivel === "urgente" ? "" : "ia-toca"} />
        Sigue ahora
      </p>
      <h3>{ahora.ahora}</h3>
      <p className="ia-d">
        {ahora.nivel === "urgente" ? "Urgente: " : ""}
        {ahora.detalle}
      </p>
      <Link href={ahora.href} className="ia-go">
        Empezar <Ico clave="arrow" />
      </Link>
      {despues.length > 0 && (
        <div className="ia-desp">
          <p className="ia-lbl2">Después</p>
          {despues.map((a) => (
            <Link key={a.clave} href={a.href} className="ia-dp">
              <span className={`ia-pt ${CLASE_NIVEL[a.nivel]}`} />
              <span className="ia-t">{a.titulo}</span>
              <span className={`ia-n ${CLASE_NIVEL[a.nivel]}`}>{a.cantidad}</span>
            </Link>
          ))}
        </div>
      )}
      {aro}
    </EnVista>
  );
}
