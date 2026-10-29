"use client";

import { useRef, useState } from "react";
import { PackageCheck } from "lucide-react";
import { BotonEnlace } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import type { CostoRecepcion } from "@/components/RecepcionesRecientes";
import { RecibidoPorEnvio } from "./RecibidoPorEnvio";
import type { RecepcionReciente } from "@/lib/compras-reglas";
import { diaLima, diaMes } from "@/lib/fechas-lima";
import { paginar } from "@/lib/paginacion";
import { diasDesde, textoPrendas, type PendientesDeLaSede } from "@/lib/recepcion-conteo-reglas";
import {
  esViejoPorTerminar,
  ordenarPorTerminar,
  POR_TERMINAR_POR_PAGINA,
  prendasPorTerminar,
  TERMINADOS_MAXIMO,
  TERMINADOS_POR_PAGINA,
  textoHaceDias,
  vistaInicialRecibido,
  type VistaRecibido,
} from "@/lib/por-terminar-reglas";

// «Lo recibido en la sede» (Recibir mercadería): UNA tarjeta con dos vistas lado a lado (Felipe 2026-10-27). «Por terminar» lista, en una
// tabla, todos los envíos que ya se contaron y están en el almacén pero no terminaron en el sistema (ADR-0393: faltan separar por color,
// poner tallas o crear la prenda); antes eran seis botones dentro de un aviso y el séptimo no se veía. «Terminados» es lo que ya entró al
// stock, lo más reciente primero, de 10 en 10 (las últimas 50; para ver más, «Ver todo lo recibido»). Abre en «Por terminar» si hay algo; si no, en
// «Terminados». Sin la lectura de pendientes (la base sin sus migraciones) no hay selector: solo «Terminados».

// Con la tarjeta angosta, «Lo que falta» es una línea de texto; desde @4xl (el ancho de la TARJETA) cada cosa tiene su columna.
const PLANTILLA = "sm:grid-cols-[6.5rem_7rem_minmax(0,1fr)_6rem_9rem] @4xl:grid-cols-[6.5rem_7rem_repeat(3,minmax(0,1fr))_6rem_9rem]";
const COLUMNAS: Columna[] = [
  { titulo: "Cerrado", ayuda: "El día en que se terminó de contar el envío" },
  { titulo: "Envío" },
  { titulo: "Lo que falta", clase: "@4xl:hidden" },
  { titulo: "Por separar", alinear: "der", clase: "hidden @4xl:block" },
  { titulo: "Por poner tallas", alinear: "der", clase: "hidden @4xl:block" },
  { titulo: "Por crear", alinear: "der", clase: "hidden @4xl:block" },
  { titulo: "Prendas", alinear: "der" },
  { titulo: "", alinear: "der" },
];

export function RecibidoEnLaSede({
  sede,
  pendientes,
  recibidos,
  costos,
  vacio,
}: {
  sede: string;
  /** `null`: la base todavía no cuenta lo que quedó por terminar; entonces solo hay «Terminados». */
  pendientes: PendientesDeLaSede | null;
  /** Lo ya recibido, lo más reciente primero (la pantalla trae hasta 10). */
  recibidos: RecepcionReciente[];
  costos?: Record<string, CostoRecepcion>;
  /** Lo que dice «Terminados» si no hay nada. */
  vacio: string;
}) {
  const [vista, setVista] = useState<VistaRecibido>(() => vistaInicialRecibido(pendientes?.envios));
  const porTerminar = pendientes ? ordenarPorTerminar(pendientes.envios) : [];
  return (
    <section data-guia="recibir.semana" className="space-y-3">
      <TituloSeccion
        accion={
          vista === "terminados" ? (
            <EnlaceVer href="/recibir?vista=recibidas" guia="recibir.ver-todo">
              Ver todo lo recibido
            </EnlaceVer>
          ) : undefined
        }
      >
        Lo recibido · {sede}
      </TituloSeccion>
      {pendientes && (
        <SegmentoDeslizante
          forma="modo"
          etiqueta="Qué ver de lo recibido"
          valor={vista}
          onCambio={(v) => setVista(v as VistaRecibido)}
          opciones={[
            { clave: "por-terminar", etiqueta: "Por terminar", conteo: porTerminar.length, guia: "recibir.vista-por-terminar" },
            { clave: "terminados", etiqueta: "Terminados", guia: "recibir.vista-terminados" },
          ]}
        />
      )}
      {vista === "por-terminar" && pendientes ? (
        <TablaPorTerminar envios={porTerminar} />
      ) : (
        <>
          {/* Un envío contado sin nada en el stock no tiene lote (ADR-0393): sin esta frase, «Terminados» diría que no llegó nada. */}
          <RecibidoPorEnvio
            recepciones={recibidos}
            costos={costos}
            porPagina={TERMINADOS_POR_PAGINA}
            vacio={porTerminar.length > 0 ? "Todavía no hay nada terminado: lo que llegó está en «Por terminar»." : vacio}
          />
          {recibidos.length >= TERMINADOS_MAXIMO && <p className="nota-cayla">Se muestran las {TERMINADOS_MAXIMO} más recientes. Para ver el resto, «Ver todo lo recibido».</p>}
        </>
      )}
    </section>
  );
}

function TablaPorTerminar({ envios }: { envios: ReturnType<typeof ordenarPorTerminar> }) {
  const [pagina, setPagina] = useState(1);
  const tarjeta = useRef<HTMLDivElement>(null);
  const hoy = new Date();
  const actual = paginar(envios, pagina, POR_TERMINAR_POR_PAGINA);
  function irAPagina(n: number) {
    setPagina(n);
    const t = tarjeta.current;
    if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ block: "start" });
  }
  if (envios.length === 0) {
    return (
      <Vacio tamano="chico" alinear="izquierda" icono={<PackageCheck />}>
        Nada por terminar: todo lo contado ya está en el sistema.
      </Vacio>
    );
  }
  return (
    <div ref={tarjeta} data-guia="recibir.por-terminar">
      <Tabla className="@container">
        <Encabezado plantilla={PLANTILLA} columnas={COLUMNAS} />
        {actual.filas.map((e) => {
          const dias = diasDesde(e.cerradoEn, hoy);
          const viejo = esViejoPorTerminar(dias);
          const hace = textoHaceDias(dias);
          return (
            <div key={e.despachoId} className={fila(PLANTILLA, "sm:items-center")}>
              <span className={celda("izq", "text-sm tabular-nums text-tinta")}>
                <span className="text-xs text-taupe sm:hidden">Cerrado el </span>
                {diaMes(diaLima(e.cerradoEn))}
                {hace && <small className={`block text-xs ${viejo ? "text-tinta" : "text-taupe"}`}>{viejo ? <Chip tono="ambar" versalitas={false}>{hace}</Chip> : hace}</small>}
              </span>
              <span className={celda("izq", "text-sm font-semibold tabular-nums text-tinta")}>{e.numero ?? "Envío"}</span>
              <span className={celda("izq", "text-sm text-taupe @4xl:hidden")} title={quFalta(e)}>
                {quFalta(e)}
              </span>
              <span className={celda("der", "hidden text-sm tabular-nums text-tinta @4xl:block")}>{e.porSeparar || "—"}</span>
              <span className={celda("der", "hidden text-sm tabular-nums text-tinta @4xl:block")}>{e.porDetallar || "—"}</span>
              <span className={celda("der", "hidden text-sm tabular-nums text-tinta @4xl:block")}>{e.porCrear || "—"}</span>
              <span className={celda("der", "text-sm text-tinta")}>{textoPrendas(prendasPorTerminar(e))}</span>
              <span className={celda("der", "overflow-visible whitespace-normal sm:flex sm:justify-end")}>
                <BotonEnlace href={`/recibir/envio/${e.despachoId}`} peso="fantasma" aria-label={`Terminar ${e.numero ?? "el envío"}`}>
                  Terminar
                </BotonEnlace>
              </span>
            </div>
          );
        })}
        {actual.totalPaginas > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs text-taupe">
            <span>
              Mostrando {actual.desde}–{actual.hasta} de {envios.length}
            </span>
            <PaginacionLocal pagina={actual.pagina} totalPaginas={actual.totalPaginas} onPagina={irAPagina} />
          </div>
        )}
      </Tabla>
    </div>
  );
}

/** «79 por separar · 43 por poner tallas»: lo que falta de un envío, solo lo que no es cero (con la tarjeta ancha, cada cosa tiene su columna). */
function quFalta(e: { porSeparar: number; porDetallar: number; porCrear: number }): string {
  const partes = [e.porSeparar ? `${e.porSeparar} por separar` : null, e.porDetallar ? `${e.porDetallar} por poner tallas` : null, e.porCrear ? `${e.porCrear} por crear` : null].filter(Boolean);
  return partes.join(" · ") || "—";
}
