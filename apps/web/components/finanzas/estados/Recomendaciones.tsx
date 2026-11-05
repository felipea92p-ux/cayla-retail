import { Aviso } from "@/components/ui/Aviso";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import type { Recomendacion } from "@/lib/ganamos-reglas";

// «Qué te recomiendo» (ADR-0585, ADR-0611): hasta tres acciones que salen de las cifras del estado que se mira, la más urgente primero, a todo el ancho sobre su placa de vidrio. Cada una es un
// `<Aviso>` del sistema (ADR-0358: la franja con su ícono y su tono) con su `<BotonVer>` a donde se hace. Nada se cambia solo.
export function Recomendaciones({ recomendaciones }: { recomendaciones: readonly Recomendacion[] }) {
  return (
    <aside className="placa-estados estados-debajo" aria-labelledby="fin-recos-titulo" data-guia="fin-estados.recos">
      <TituloSeccion id="fin-recos-titulo">Qué te recomiendo</TituloSeccion>
      <div className="estados-recos mt-3">
        {recomendaciones.map((r) => (
          <Aviso
            key={r.clave}
            tono={r.tono}
            titulo={r.titulo}
            accion={
              r.accion ? (
                <BotonVer href={r.accion.href} chico>
                  {r.accion.texto}
                </BotonVer>
              ) : undefined
            }
          >
            {r.texto}
          </Aviso>
        ))}
      </div>
      <p className="mt-3 text-sm text-taupe">Sale de las cifras de este estado. Nada se cambia solo.</p>
    </aside>
  );
}
