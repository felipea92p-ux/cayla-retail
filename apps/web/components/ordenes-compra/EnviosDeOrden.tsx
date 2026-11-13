"use client";

import { useRef, useState } from "react";
import { Ban } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { sePuedeAnularEnvio } from "@/lib/envio-orden-reglas";
import { ESTADO_ENVIO, numeroOrdenCompra, tieneEnvioVivo, type DetalleOrden, type EnvioDeOrden } from "@/lib/ordenes-compra-reglas";
import { AnularEnvioModal } from "./AnularEnvioModal";
import { TituloGrupo } from "@/components/ui/TituloSeccion";

// Los envíos de una orden (ADR-0362, fase 3): la lista que se ve en la orden abierta, del más reciente al más antiguo, con su estado
// (En camino, Abierto, Cerrado, Anulado) y «Anular envío» en los que siguen en camino. Una guía lleva lo de la orden a UNA sede; la sede
// la abre y la cierra al recibirla (fase 4) y desde entonces ya no se anula aquí. La orden no se edita ni se anula mientras tenga un
// envío vivo; la nota de abajo lo explica para que nadie busque un botón que no está.
//
// Anular es irreversible: la hoja (`AnularEnvioModal`, que también usa «Mis envíos») pide el motivo y, desde una terminal, quién lo hace.
// Corre dentro de la ventana de la orden (una hoja encima de otra), igual que «Anular comprobante».

const PLANTILLA = "@min-[44rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_5.5rem_4.5rem_6.5rem_7rem]";
const EN_COLUMNAS = "hidden @min-[44rem]:block";
const CIFRA = `${EN_COLUMNAS} min-w-0 whitespace-nowrap text-right tabular-nums`;

const unidadesTexto = (n: number) => `${n.toLocaleString("es-PE")} ${n === 1 ? "unidad" : "unidades"}`;
const salio = (e: EnvioDeOrden): string | null => {
  if (!e.despachadoEn) return null;
  const { dia, hora } = diaYHoraLima(e.despachadoEn);
  return `${dia} ${hora}`;
};

export function EnviosDeOrden({ orden }: { orden: DetalleOrden }) {
  const [anulando, setAnulando] = useState<EnvioDeOrden | null>(null);
  // El botón que abrió la hoja: al cerrarla, el foco vuelve a él (la hoja no tiene «disparador» de Radix).
  const origen = useRef<HTMLElement | null>(null);
  const envios = orden.envios ?? [];
  if (envios.length === 0) return null;

  return (
    <section aria-label="Envíos de la orden" data-guia="orden.envios" className="space-y-2">
      <TituloGrupo nota="lo que ya salió hacia las sedes">Envíos</TituloGrupo>
      <Tabla>
        <div className="hidden @min-[44rem]:block">
          <Encabezado
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "Envío" },
              { titulo: "Va a" },
              { titulo: "Guía" },
              { titulo: "Salió", alinear: "der" },
              { titulo: "Unidades", alinear: "der" },
              { titulo: "Estado" },
              { titulo: "" },
            ]}
          />
        </div>
        {envios.map((e) => {
          const estado = ESTADO_ENVIO[e.estado];
          const cuando = salio(e);
          return (
            <div key={e.id} className={fila(PLANTILLA)}>
              <span className={celda("izq", "font-medium tabular-nums text-tinta")}>{e.numero}</span>
              <span className={celda("izq", "whitespace-normal text-sm text-tinta")}>
                {e.sede}
                {/* Sin columnas: lo demás en un renglón, con su contexto. */}
                <span className="mt-0.5 block text-sm tabular-nums text-taupe @min-[44rem]:hidden">
                  {[e.numeroGuia ? `guía ${e.numeroGuia}` : null, cuando, unidadesTexto(e.unidades)].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className={`${EN_COLUMNAS} min-w-0 truncate text-sm tabular-nums text-tinta/80`}>{e.numeroGuia ?? "—"}</span>
              <span className={`${CIFRA} text-tinta/80`}>{cuando ?? "—"}</span>
              <span className={`${CIFRA} text-tinta`}>{e.unidades.toLocaleString("es-PE")}</span>
              <span className="min-w-0">
                <Chip tono={estado.tono}>{estado.texto}</Chip>
                {e.estado === "abierto" && !!e.enStock && (
                  <span className="text-sm text-taupe">
                    {e.enStock.toLocaleString("es-PE")} de {e.unidades.toLocaleString("es-PE")} ya en stock · se sigue contando
                  </span>
                )}
              </span>
              <span className="min-w-0 @min-[44rem]:text-right">
                {sePuedeAnularEnvio(e) && (
                  <Boton
                    peso="peligro"
                    className="px-3 py-1.5 text-sm"
                    data-guia="orden.anular-envio"
                    onClick={(ev) => {
                      origen.current = ev.currentTarget;
                      setAnulando(e);
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Ban aria-hidden className="h-3 w-3" /> Anular envío
                    </span>
                  </Boton>
                )}
              </span>
            </div>
          );
        })}
      </Tabla>
      {orden.estado === "generada" && (
        <p className="nota-cayla">
          {tieneEnvioVivo(orden)
            ? "Mientras la orden tenga un envío vigente, no se edita ni se anula. Si salió mal, anula el envío (solo mientras va en camino) y vuelve a enviar."
            : "Como esta orden ya tuvo un envío, no se edita."}
        </p>
      )}
      {anulando && (
        <AnularEnvioModal
          envio={anulando}
          contexto={numeroOrdenCompra(orden.numero)}
          queVuelve={`vuelve a quedar por enviar en ${numeroOrdenCompra(orden.numero)}`}
          onClose={() => setAnulando(null)}
          volverA={origen}
        />
      )}
    </section>
  );
}

