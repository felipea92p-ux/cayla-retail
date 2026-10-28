"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { Cajon } from "@/components/ui/Cajon";
import { MatrizOrdenTabla } from "@/components/MatrizOrden";
import { ChipEntrega, semaforoDeOrden } from "@/components/OrdenTarjeta";
import { OrdenCierre } from "@/components/OrdenCierre";
import { OrdenInsumos } from "@/components/OrdenInsumos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { urlEtiquetasDePrecio } from "@/lib/etiqueta-precio-reglas";
import {
  desgloseCosto,
  estadoEntrega,
  etapaActual,
  etapasDe,
  LEYENDA_SEMAFORO,
  matrizDeLineas,
  posicionEnMedidor,
  urlLlevarATiendas,
  type EstadoEtapa,
} from "@/lib/produccion-reglas";
import type { OrdenProduccion } from "@/lib/produccion";
import type { ConsumoDeOrden, InsumoVista } from "@/lib/insumos";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { BotonImprimir } from "@/components/ui/BotonImprimir";

const COLOR_PARTE = {
  tela: "bg-tinta",
  avios: "bg-taupe",
  maquila: "bg-tinta/25",
} as const;

// Panel de una orden (ADR-0133, F2): al tocar una tarjeta se abre un cajón desde el borde derecho, con el tablero
// intacto detrás. Muestra dónde está la orden (etapas), qué se fabrica (talla × color), cuánto cuesta (solo el
// líder) y permite cerrarla por talla. Cierre en dos tiempos, igual que `ProveedorVistaRapida`: primero se anima la
// salida y recién ahí se le avisa al padre.
export function OrdenPanel({
  orden,
  tallerId,
  esLider,
  hoy,
  insumos,
  consumos,
  onCerrar,
  onAnular,
  onRevertir,
}: {
  orden: OrdenProduccion;
  tallerId: string;
  esLider: boolean;
  hoy: string;
  insumos: InsumoVista[];
  consumos: ConsumoDeOrden[];
  onCerrar: () => void;
  onAnular: () => void;
  onRevertir: () => void;
}) {
  const router = useRouter();
  const [cerrando, setCerrando] = useState(false); // el bloque de cierre por talla está abierto
  const [ocupada, setOcupada] = useState(false);
  // Responsable (ADR-0161 act. d): cada cambio de etapa queda en `produccion_etapas_historial` con quien se elige aquí.
  // Un solo combo para todos los botones de etapa: son clics rápidos y pedir a quién en cada uno sería fricción.
  const responsable = useResponsable();

  const abierta = orden.estado === "en_proceso";
  // F8: una orden de producción cerrada deja prendas en el stock del Taller; el enlace lleva al traslado con el origen y las líneas ya puestas.
  const llevarUrl = orden.estado === "terminada" && !orden.esMuestra ? urlLlevarATiendas(tallerId, orden.lineas) : null;
  const etapas = etapasDe(orden.esMuestra);
  const actual = etapaActual(orden.etapas, orden.esMuestra);
  const entrega = estadoEntrega(orden.fechaEntrega, hoy);
  const matriz = matrizDeLineas(orden.lineas);
  const costo = desgloseCosto(orden.costoTela, orden.costoAvios, orden.costoMaquila);
  const sem = semaforoDeOrden(orden);

  async function fijarEtapa(clave: string, nuevo: EstadoEtapa, anterior: EstadoEtapa, mensaje: string) {
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    // «Deshacer» firma con la misma persona que hizo el cambio: el combo pudo volver a vacío entre tanto.
    const firma = responsable.firma();
    setOcupada(true);
    const { error } = await firmar(
      createClient().rpc("set_etapa_produccion", {
        p_produccion_id: orden.id,
        p_etapa: clave,
        p_estado: nuevo,
      }),
      firma,
    );
    setOcupada(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "cambiar la etapa"));
      return;
    }
    avisar.exito(mensaje, {
      detalle: orden.referencia,
      accion: {
        texto: "Deshacer",
        onClick: async () => {
          const { error: e2 } = await firmar(
            createClient().rpc("set_etapa_produccion", {
              p_produccion_id: orden.id,
              p_etapa: clave,
              p_estado: anterior,
            }),
            firma,
          );
          if (e2) avisar.error(traducirError(e2, "deshacer el cambio de etapa"));
          router.refresh();
        },
      },
    });
    router.refresh();
  }

  return (
    <Cajon
      onCerrar={onCerrar}
      ancho="ancho"
      sobre={[orden.esMuestra ? "Muestra" : orden.categoria, `${orden.cantidadPlan} prendas`, orden.fechaEntrega ? `entrega ${diaMes(orden.fechaEntrega)}` : null]
        .filter(Boolean)
        .join(" · ")}
      titulo={orden.referencia}
      debajo={
        abierta || orden.estado === "terminada" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {abierta && <ChipEntrega entrega={entrega} />}
            {orden.estado === "terminada" && <Chip tono="verde">Terminada · {orden.cantidadBuenas} buenas</Chip>}
          </div>
        ) : undefined
      }
      claseCuerpo="space-y-7"
      encimaDelPie={
        llevarUrl ? (
          <section aria-label="Siguiente paso" className="mx-5 mb-4 rounded-2xl border border-sand bg-crema p-3.5">
            <p className="label-cayla text-[11px] text-tinta/65">Siguiente paso</p>
            <p className="mt-1 text-[13px] text-tinta/80">
              Las {orden.cantidadBuenas} prendas buenas están en el stock del Taller. Para venderlas hay que etiquetarlas y llevarlas a las tiendas: el traslado sale del Taller y cada tienda confirma lo que llegó.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Link href={llevarUrl} className="btn-cayla btn-primario">
                Llevarlas a las tiendas
              </Link>
              {/* ADR-0180: una etiqueta de precio por prenda buena; queda aquí para reimprimir mientras la orden siga cerrada. */}
              <BotonImprimir href={urlEtiquetasDePrecio({ produccion: orden.id })}>Imprimir etiquetas de precio</BotonImprimir>
            </div>
          </section>
        ) : undefined
      }
      pie={
        <>
          {abierta && !cerrando && (
            <>
              <Boton peso="primario" className="flex-1" onClick={() => setCerrando(true)}>
                {orden.esMuestra ? "Dar por terminada" : "Pasar al stock"}
              </Boton>
              <Boton peso="peligro" onClick={onAnular}>
                Anular
              </Boton>
            </>
          )}
          {abierta && cerrando && (
            <Boton peso="discreto" className="flex-1" onClick={() => setCerrando(false)}>
              Volver sin cerrar
            </Boton>
          )}
          {orden.estado === "terminada" && (
            <Boton peso="discreto" onClick={onRevertir}>
              Revertir cierre
            </Boton>
          )}
        </>
      }
    >
      {(cerrar) => (
        <>
        {/* -------- etapas (una orden terminada ya no las necesita: importa lo que salió) -------- */}
        {orden.estado !== "terminada" && (
          <section aria-label="Etapas">
            <TituloGrupo className="mb-3">Etapas</TituloGrupo>
            {abierta && <ComboResponsable control={responsable} deshabilitado={ocupada} className="mb-4" />}
            <ol className="grid grid-cols-3">
              {etapas.map((e, i) => {
                const estado = orden.etapas[e.clave] ?? "pendiente";
                const esActual = abierta && e.clave === actual;
                const previaHecha = i > 0 && orden.etapas[etapas[i - 1].clave] === "hecho";
                return (
                  <li key={e.clave} className="relative pt-9 text-center">
                    {i > 0 && (
                      <>
                        <span aria-hidden className="absolute left-[calc(-50%+1rem)] right-[calc(50%+1rem)] top-[13px] h-0.5 bg-sand" />
                        <span
                          aria-hidden
                          className={`absolute left-[calc(-50%+1rem)] right-[calc(50%+1rem)] top-[13px] h-0.5 origin-left bg-verde transition-transform duration-700 ease-cayla ${previaHecha ? "scale-x-100" : "scale-x-0"}`}
                        />
                      </>
                    )}
                    <span
                      aria-hidden
                      className={`absolute left-1/2 top-0 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full border-2 transition-colors duration-300 ${
                        estado === "hecho"
                          ? "border-verde bg-verde text-crema"
                          : estado === "tercerizado"
                            ? "border-ambar bg-ambar/10 text-ambar-profundo"
                            : esActual
                              ? "border-tinta bg-papel text-tinta"
                              : "border-sand bg-papel text-tinta/50"
                      }`}
                    >
                      {estado === "hecho" ? (
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5 fill-none stroke-current stroke-[2.6]"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className="trazo-linea anim-trazo" />
                        </svg>
                      ) : estado === "tercerizado" ? (
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5 fill-none stroke-current stroke-[2.4]"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      ) : (
                        <span className="text-xs font-semibold tabular-nums">{i + 1}</span>
                      )}
                    </span>
                    <p className="text-[13px] font-semibold text-tinta">{e.etiqueta}</p>
                    <p className="px-1 text-[11.5px] leading-snug text-tinta/65">
                      {estado === "tercerizado" ? "Afuera con un servicio" : e.detalle}
                    </p>
                    {abierta && esActual && (
                      <div className="mt-2.5 flex flex-col items-center gap-1.5">
                        <Boton
                          peso="primario"
                          disabled={ocupada || !responsable.listo}
                          className="!px-3 !py-2"
                          onClick={() => fijarEtapa(e.clave, "hecho", estado, `${e.etiqueta} hecho`)}
                        >
                          Marcar hecho
                        </Boton>
                        <Boton
                          peso="discreto"
                          disabled={ocupada || !responsable.listo}
                          className="!px-3 !py-2"
                          onClick={() =>
                            estado === "tercerizado"
                              ? fijarEtapa(e.clave, "pendiente", estado, `${e.etiqueta} volvió al Taller`)
                              : fijarEtapa(e.clave, "tercerizado", estado, `${e.etiqueta} salió afuera`)
                          }
                        >
                          {estado === "tercerizado" ? "Traer de vuelta" : "Mandar afuera"}
                        </Boton>
                      </div>
                    )}
                    {abierta && estado === "hecho" && (
                      <button
                        type="button"
                        disabled={ocupada || !responsable.listo}
                        onClick={() => fijarEtapa(e.clave, "pendiente", estado, `${e.etiqueta} reabierta`)}
                        className="mt-1.5 text-[11.5px] text-tinta/65 underline underline-offset-2 outline-none hover:text-tinta focus-visible:text-tinta disabled:opacity-50"
                      >
                        Reabrir
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* -------- qué se fabrica -------- */}
        <section aria-label="Qué se fabrica">
          <TituloGrupo className="mb-3">
            {orden.estado === "terminada" ? "Lo que salió · talla × color" : "Qué se fabrica · talla × color"}
          </TituloGrupo>
          <MatrizOrdenTabla matriz={matriz} modo={orden.estado === "terminada" ? "resultado" : "plan"} />
        </section>

        {/* -------- costo (solo el líder) -------- */}
        {esLider && (
          <section aria-label="Costo del lote">
            <TituloGrupo className="mb-3">
              {orden.estado === "terminada" ? "Costo real del lote" : "Costo del lote"}
            </TituloGrupo>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-display text-4xl leading-none tabular-nums text-tinta">
                  {costo.total > 0 ? <CifraQueCuenta valor={orden.costoUnitario} formato="soles" alMontar /> : "—"}
                </p>
                <p className="mt-1 text-xs text-tinta/65">
                  por prenda · {soles(costo.total)} entre {orden.cantidadBuenas ?? orden.cantidadPlan}
                </p>
              </div>
              <div className="text-right">
                {sem && (
                  <Chip tono={sem.tono === "gana" ? "verde" : sem.tono === "filo" ? "ambar" : "rojo"}>
                    {sem.texto} · {Math.round(sem.margen * 100)}%
                  </Chip>
                )}
                {orden.precioVenta > 0 && <p className="mt-1.5 text-xs text-tinta/65">precio de venta {soles(orden.precioVenta)}</p>}
                {sem?.sede && orden.precioMasBajo && (
                  <p className="mt-0.5 text-xs text-tinta/65">
                    el margen usa {soles(orden.precioMasBajo.precio)}, el precio propio de {sem.sede}
                  </p>
                )}
              </div>
            </div>
            {costo.total > 0 && (
              <>
                {/* La barra es `<BarraApilada>` (ADR-0358): decorativa, las cifras del costo van debajo. */}
                <BarraApilada decorativa className="mt-4" alto={12} segmentos={costo.partes.map((p) => ({ clave: p.clave, nombre: p.clave, valor: p.parte, clase: COLOR_PARTE[p.clave] }))} />
                <ul className="mt-3 space-y-1.5 text-[13px]">
                  {costo.partes.map((p) => (
                    <li key={p.clave} className="flex items-center gap-2.5">
                      <MuestraTramo /* unificar-fijo: el cuadrito de color de una leyenda, no un ícono */ clase={COLOR_PARTE[p.clave]} className="h-2.5 w-2.5 rounded-sm" />
                      <span className="text-tinta/80">{p.etiqueta}</span>
                      <span className="ml-auto tabular-nums text-tinta/75">{soles(p.valor)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {sem && (
              <div className="mt-5">
                <div className="relative">
                  <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                    <span className="flex-[40] bg-rojo/25" />
                    <span className="flex-[20] bg-ambar/30" />
                    <span className="flex-[40] bg-verde/30" />
                  </div>
                  <span
                    aria-hidden
                    className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-papel bg-tinta shadow-[0_0_0_1px_var(--color-tinta)] transition-[left] duration-700 ease-cayla"
                    style={{
                      left: `${posicionEnMedidor(sem.margen) * 100}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-tinta/65">
                  <span>{LEYENDA_SEMAFORO.pierde}</span>
                  <span>{LEYENDA_SEMAFORO.filo}</span>
                  <span>{LEYENDA_SEMAFORO.gana}</span>
                </div>
              </div>
            )}
          </section>
        )}

        {/* -------- insumos descontados (F3) -------- */}
        {!orden.esMuestra && <OrdenInsumos orden={orden} insumos={insumos} consumos={consumos} esLider={esLider} editable={abierta} />}

        {orden.nota && <p className="text-sm text-tinta/75">— {orden.nota}</p>}

        {/* -------- cierre por talla -------- */}
        {abierta && cerrando && <OrdenCierre orden={orden} tallerId={tallerId} matriz={matriz} esLider={esLider} onHecho={cerrar} />}
        </>
      )}
    </Cajon>
  );
}
