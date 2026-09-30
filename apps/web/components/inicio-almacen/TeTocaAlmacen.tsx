import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { Aviso, AvisosVisibles } from "@/lib/inicio-avisos";
import { cortarTeToca } from "@/lib/inicio-almacen-reglas";
import { CLASE_NIVEL } from "./CabinaAlmacen";
import { EnVista } from "./EnVista";
import { Ico } from "./iconos";
import { VerMas } from "./VerMas";

// «Te toca» del Inicio de Almacén: la misma lista y las mismas reglas de siempre (urgente → por hacer → informativo → sin
// leer; lo urgente no se oculta; lo que se ocultó y tiene algo se cuenta), con la estética de la cabina. Muestra 4 filas y el
// resto queda tras «Ver N más»; lo que no se pudo leer nunca queda detrás (`cortarTeToca`).

type FilaDeAviso = Aviso & { forzado: boolean };

function Fila({ a, i, primera }: { a: FilaDeAviso; i: number; primera: boolean }) {
  return (
    <Link href={a.href} className={`ia-ap ia-spot ia-rj ${a.nivel === "urgente" ? "ia-u" : ""} ${primera ? "ia-f" : ""}`} style={{ "--j": i } as CSSProperties}>
      <span className={`ia-pt ${CLASE_NIVEL[a.nivel]}`} />
      <div className="ia-tx">
        <p className="ia-t">
          {a.titulo}
          {a.nivel === "urgente" && <span className="ia-tag">Urgente</span>}
          {a.forzado && <span className="rounded-md bg-rojo/8 px-1.5 text-[10.5px] font-normal text-rojo-profundo">Lo ocultaste, pero es urgente</span>}
        </p>
        <p className="ia-d">{a.detalle}</p>
      </div>
      <span className={`ia-n ${CLASE_NIVEL[a.nivel]}`}>{a.cantidad === null ? "Sin leer" : a.cantidad}</span>
      <Ico clave="chevron" className="ia-chev" />
    </Link>
  );
}

export function TeTocaAlmacen({ visibles, ajustar }: { visibles: AvisosVisibles; ajustar: ReactNode }) {
  const { activos, alDia, ocultosConAlgo } = visibles;
  if (activos.length === 0 && alDia.length === 0 && ocultosConAlgo === 0) return null;
  const { visibles: primeras, extra } = cortarTeToca(activos, 4);
  return (
    <EnVista como="section" className="ia-rv" style={{ "--i": 3 } as CSSProperties}>
      <div className="ia-sec-h">
        <div className="ia-l">
          <p className="label-cayla text-[11px] text-tinta/65">Te toca</p>
          {activos.length > 0 && <span className="ia-cnt">{activos.length}</span>}
        </div>
        {ajustar}
      </div>
      <div className="card-cayla ia-tt">
        {activos.length === 0 ? (
          <div className="ia-vacio">
            <span className="ia-ck">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M5 12l4 4 10-10" />
              </svg>
            </span>
            <div>
              <b>Nada pendiente</b>
              <span>Todo lo que elegiste ver está al día.</span>
            </div>
          </div>
        ) : (
          <>
            {primeras.map((a, i) => (
              <Fila key={a.clave} a={a} i={i} primera={i === 0} />
            ))}
            {extra.length > 0 && (
              <VerMas cantidad={extra.length}>
                {extra.map((a, i) => (
                  <Fila key={a.clave} a={a} i={primeras.length + i} primera={false} />
                ))}
              </VerMas>
            )}
          </>
        )}
        {alDia.length > 0 && (
          <p className="ia-dial">
            <Ico clave="check" />
            <span>
              <b>Al día:</b> {alDia.map((a) => a.titulo.toLowerCase()).join(" · ")}
            </span>
          </p>
        )}
        {ocultosConAlgo > 0 && (
          <p className="px-4 py-3 text-xs text-taupe sm:px-5">
            {ocultosConAlgo} {ocultosConAlgo === 1 ? "aviso que ocultaste tiene" : "avisos que ocultaste tienen"} algo pendiente.
          </p>
        )}
      </div>
    </EnVista>
  );
}
