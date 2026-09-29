"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { ComboResponsable } from "@/components/ComboResponsable";
import { EstadoLinea } from "@/components/conteo/EstadoLinea";
import { ResumenConteo } from "@/components/conteo/ResumenConteo";
import { BarraFija } from "@/components/ui/BarraFija";
import { MuestraColor } from "@/components/ui/MuestraColor";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { bloqueoDeCierre, lineaDesdeJson, notaDeLinea, resumirLineas, textoFaltanPorContar } from "@/lib/conteo-reglas";
import { diferenciasEnOrden, pendientesPorPercha, textoConfirmaPrimero, type FilaConteoVista } from "@/lib/conteo-revision";
import { traducirError } from "@/lib/error-escritura";
import { paginar } from "@/lib/paginacion";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

/* ====================================================================
   Revisar conteo · lo que no coincide, antes de tocar las existencias
   (Inventario ▸ Conteo, rediseño 2026-09-29; plano §5)

   Segunda de las tres pantallas del conteo (Contar · Revisar · Confirmar). Aquí no se cambia ninguna existencia: se
   decide qué hacer con cada variante que NO coincidió —confirmar lo contado, o volver a contarla— y se ve qué falta por
   contar. Solo cuando todo eso está resuelto se puede pasar a Confirmar, donde recién se cierra.

   Qué muestra, decidido por `bloqueoDeCierre` (la misma regla, en el mismo orden, que aplica `cerrar_conteo`):
     · con pendientes → un aviso ámbar y la lista «Pendientes de contar» (por percha, con las tallas que faltan). Se
       puede volver a contar, o cerrar como conteo PARCIAL a propósito: las pendientes no cambian y quedan sin verificar.
     · con diferencias → una fila por variante: «CAYLA dice: 11 · Contaste: 9 · Faltan 2», con «Volver a contar» y
       «Confirmar 9». Confirmada, queda «✓ Confirmado» y solo se puede volver a contar.
     · todo coincide → un mensaje corto y «Continuar».

   Cada acción se hace en la base (`conteo_recontar`, `conteo_confirmar_diferencia`) y la respuesta —la línea ya
   actualizada— reemplaza a la de la pantalla: lo que se ve es lo que la base guardó, nunca una suposición. Van con
   `x-espera: no`: son gestos de una fila entre muchas y la fila dice «Confirmando…» por sí sola; un loader a pantalla
   completa por cada clic haría imposible revisar 30 diferencias seguidas.

   Firman con el combo «Responsable» de esta pantalla (ADR-0161/0162). Un éxito NO reinicia el combo (`despues` solo se
   llama en un rechazo): quien elige a otra persona y confirma 20 diferencias no debe volver a firmar como él mismo
   entre una y otra.
   ==================================================================== */

const POR_PAGINA_DIFERENCIAS = 20;
const POR_PAGINA_PENDIENTES = 20;

type Accion = "recontar" | "confirmar";

const TEXTO_ACCION: Record<Accion, string> = {
  recontar: "volver a contar esta variante",
  confirmar: "confirmar esta diferencia",
};

/** El mismo diccionario sin una clave (quitar el error o el «ocupada» de una variante sin tocar las demás). */
function sinClave<V>(o: Record<string, V>, clave: string): Record<string, V> {
  const copia = { ...o };
  delete copia[clave];
  return copia;
}

/** «▬ Beige · M»: el color como muestra y su nombre en texto (el celular ya lo escribe solo), y la talla. */
function ColorYTalla({ color, colorHex, talla, conTalla = false }: { color: string | null; colorHex: string | null; talla: string | null; conTalla?: boolean }) {
  return (
    <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-taupe">
      {color ? <MuestraColor nombre={color} hex={colorHex} compacta /> : null}
      <span className={`min-w-0 truncate ${color ? "max-sm:hidden" : ""}`}>{color ?? "Sin color"}</span>
      {conTalla && <span className="whitespace-nowrap">· {talla ?? "Única"}</span>}
    </span>
  );
}

export function RevisarConteo({ conteoId, filas: filasIniciales }: { conteoId: string; filas: FilaConteoVista[] }) {
  const responsable = useResponsable();
  const [filas, setFilas] = useState(filasIniciales);
  const [ocupadas, setOcupadas] = useState<Record<string, Accion>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [paginaDif, setPaginaDif] = useState(1);
  const [paginaPend, setPaginaPend] = useState(1);
  const tarjetaDif = useRef<HTMLElement>(null);
  const tarjetaPend = useRef<HTMLElement>(null);

  const resumen = useMemo(() => resumirLineas(filas), [filas]);
  const diferencias = useMemo(() => diferenciasEnOrden(filas), [filas]);
  const perchas = useMemo(() => pendientesPorPercha(filas), [filas]);
  const sinConfirmar = resumen.conDiferencia - resumen.confirmadas;
  const conPendientes = resumen.pendientes > 0;
  const bloqueo = bloqueoDeCierre(resumen, false);
  const bloqueoParcial = bloqueoDeCierre(resumen, true);

  const hoja = paginar(diferencias, paginaDif, POR_PAGINA_DIFERENCIAS);
  const hojaPend = paginar(perchas, paginaPend, POR_PAGINA_PENDIENTES);

  function irA(tarjeta: RefObject<HTMLElement | null>) {
    // Paginar cambia el largo de la lista: sin esto la vista se queda a media tarjeta (ADR-0185).
    tarjeta.current?.scrollIntoView({ block: "start" });
  }

  async function actuar(varianteId: string, cual: Accion) {
    if (ocupadas[varianteId]) return;
    setOcupadas((o) => ({ ...o, [varianteId]: cual }));
    setErrores((e) => sinClave(e, varianteId));
    try {
      const supabase = createClient();
      const args = { p_conteo_id: conteoId, p_variante_id: varianteId };
      const { data, error } =
        cual === "recontar"
          ? await firmar(supabase.rpc("conteo_recontar", args).setHeader("x-espera", "no"), responsable.firma())
          : await firmar(supabase.rpc("conteo_confirmar_diferencia", args).setHeader("x-espera", "no"), responsable.firma());
      if (error) {
        responsable.despues(error);
        setErrores((e) => ({ ...e, [varianteId]: traducirError(error, TEXTO_ACCION[cual]) }));
        return;
      }
      // La base devuelve la línea ya actualizada; `null` = la línea se retiró (una variante que nadie esperaba y a la
      // que se le borró la cantidad): no cuenta para nada y sale de la pantalla.
      const nueva = lineaDesdeJson(data);
      setFilas((prev) => (nueva ? prev.map((f) => (f.varianteId === varianteId ? { ...f, ...nueva } : f)) : prev.filter((f) => f.varianteId !== varianteId)));
      // El botón que se pulsó desaparece (confirmar) o la fila se va (volver a contar): el foco no debe quedar en el aire.
      requestAnimationFrame(() => {
        const destino =
          cual === "confirmar" && nueva
            ? document.querySelector<HTMLElement>(`[data-recontar="${varianteId}"]`)
            : (document.getElementById("revisar-diferencias") ?? document.getElementById("revisar-resumen"));
        destino?.focus();
      });
    } catch (e) {
      console.error("Revisar conteo:", e);
      setErrores((prev) => ({ ...prev, [varianteId]: `No se pudo ${TEXTO_ACCION[cual]}. Vuelve a intentar.` }));
    } finally {
      setOcupadas((o) => sinClave(o, varianteId));
    }
  }

  const alguienOcupado = Object.keys(ocupadas).length > 0;
  const urlContar = `/inventario/conteo/${conteoId}`;
  const urlConfirmar = `${urlContar}/confirmar`;

  // Lo que dice el pie: una sola frase, la que explica por qué el botón está como está.
  let textoPie: string;
  if (conPendientes) {
    textoPie =
      bloqueoParcial === "conteo_vacio"
        ? "Verifica al menos una variante para poder cerrar como conteo parcial."
        : bloqueoParcial === "diferencias_sin_confirmar"
          ? textoConfirmaPrimero(sinConfirmar, "cerrar como conteo parcial")
          : "Las pendientes no cambian y quedan sin verificar.";
  } else if (bloqueo === "conteo_vacio") {
    textoPie = "Este conteo no tiene ninguna variante verificada.";
  } else if (bloqueo === "diferencias_sin_confirmar") {
    textoPie = textoConfirmaPrimero(sinConfirmar, "continuar");
  } else {
    textoPie = "Todo listo para confirmar.";
  }

  const volverAContar = (
    <Link href={urlContar} className="btn-cayla btn-primario h-11 w-full sm:w-auto">
      Volver a contar
    </Link>
  );

  return (
    <>
      <section id="revisar-resumen" tabIndex={-1} className="card-cayla space-y-3 p-4 outline-none sm:p-5">
        <ResumenConteo resumen={resumen} variante="revision" />
        <ComboResponsable control={responsable} deshabilitado={alguienOcupado} className="w-full sm:w-72" />
      </section>

      {conPendientes && (
        <>
          <p role="status" className="rounded-xl border border-ambar/35 bg-ambar/[0.07] px-3.5 py-3 text-sm text-ambar-profundo">
            {textoFaltanPorContar(resumen.pendientes)}
          </p>

          <section ref={tarjetaPend} className="card-cayla @container scroll-mt-24 overflow-hidden">
            <div className="space-y-1 border-b border-sand px-4 py-4 @[36rem]:px-5">
              <h2 className="font-display text-lg text-tinta">Pendientes de contar</h2>
              <p className="text-sm text-taupe">Estas variantes todavía no fueron verificadas.</p>
            </div>
            <ul className="divide-y divide-sand">
              {hojaPend.filas.map((g) => {
                const enReconteo = g.tallas.some((t) => t.estado === "en_reconteo");
                return (
                  <li key={g.clave} className="space-y-2.5 px-4 py-3 @[36rem]:flex @[36rem]:items-center @[36rem]:gap-6 @[36rem]:space-y-0 @[36rem]:px-5">
                    {/* Ancho fijo en la tarjeta ancha: las tallas quedan junto al nombre de su percha, no a un metro de él. */}
                    <div className="flex min-w-0 items-center gap-2.5 @[36rem]:w-64 @[36rem]:shrink-0">
                      <MiniaturaPrenda fotoUrl={g.fotoUrl} colorHex={g.colorHex} tamano="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-tinta">{g.referencia}</p>
                        <ColorYTalla color={g.color} colorHex={g.colorHex} talla={null} />
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {g.tallas.map((t) => (
                        <span
                          key={t.varianteId}
                          className={`inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border px-1.5 text-xs tabular-nums ${
                            t.estado === "en_reconteo" ? "border-ambar/35 bg-ambar/[0.07] text-ambar-profundo" : "border-taupe/25 bg-hueso text-tinta"
                          }`}
                        >
                          {t.talla ?? "Única"}
                          {t.estado === "en_reconteo" && <span className="sr-only"> (en reconteo)</span>}
                        </span>
                      ))}
                      {enReconteo && <EstadoLinea estado="en_reconteo" debeHaber={0} contada={null} diferencia={null} />}
                    </div>
                  </li>
                );
              })}
            </ul>
            {hojaPend.totalPaginas > 1 && (
              <div className="flex justify-center border-t border-sand px-4 py-3">
                <PaginacionLocal
                  pagina={hojaPend.pagina}
                  totalPaginas={hojaPend.totalPaginas}
                  onPagina={(n) => {
                    setPaginaPend(n);
                    irA(tarjetaPend);
                  }}
                />
              </div>
            )}
          </section>
        </>
      )}

      {diferencias.length > 0 ? (
        <section ref={tarjetaDif} className="card-cayla @container scroll-mt-24 overflow-hidden">
          <div className="space-y-1 border-b border-sand px-4 py-4 @[36rem]:px-5">
            <h2 id="revisar-diferencias" tabIndex={-1} className="font-display text-lg text-tinta outline-none">
              Diferencias
            </h2>
            <p className="text-sm text-taupe">Confirma lo que contaste, o vuelve a contar la variante.</p>
          </div>
          <ul className="divide-y divide-sand">
            {hoja.filas.map((f) => {
              const ocupada = ocupadas[f.varianteId];
              const puedeActuar = responsable.listo && !ocupada;
              const nota = notaDeLinea(f);
              const error = errores[f.varianteId];
              return (
                <li key={f.varianteId} className="px-4 py-3.5 @[36rem]:px-5">
                  {/* Tres formas según el ANCHO DE LA TARJETA (no de la ventana: con el lateral abierto una ventana de 1024 deja ~670 px):
                      angosta, tres renglones; media, prenda y estado arriba y cifras y botones debajo; ancha (≥ 56 rem), todo en una fila.
                      Una sola fila necesita ~900 px: con menos, la prenda quedaba en «Blus…». La última columna es fija (15 rem): con `auto`, las cifras se corrían de una fila a otra según hubiera uno o dos botones. */}
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 @[56rem]:grid-cols-[minmax(0,1fr)_7rem_7rem_8.5rem_15rem] @[56rem]:gap-x-4">
                    <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 @[56rem]:col-auto @[56rem]:row-auto">
                      <MiniaturaPrenda fotoUrl={f.fotoUrl} colorHex={f.colorHex} tamano="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-tinta">{f.referencia}</p>
                        <ColorYTalla color={f.color} colorHex={f.colorHex} talla={f.talla} conTalla />
                      </div>
                    </div>
                    <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-5 gap-y-1 @[36rem]:col-span-1 @[56rem]:contents">
                      <p className="whitespace-nowrap text-sm tabular-nums">
                        <span className="text-xs text-taupe">CAYLA dice: </span>
                        <span className="font-semibold text-tinta">{f.debeHaber}</span>
                      </p>
                      <p className="whitespace-nowrap text-sm tabular-nums">
                        <span className="text-xs text-taupe">Contaste: </span>
                        <span className="font-semibold text-tinta">{f.contada}</span>
                      </p>
                    </div>
                    {/* `EstadoLinea` reserva debajo del chip la línea de «Confirmado» (para que confirmar no mueva nada): en la fila ancha
                        eso deja el chip 9 px por encima del centro de las cifras. Se baja con `translate` (no cambia el alto de la fila). */}
                    <div className="col-start-2 row-start-1 @[56rem]:col-auto @[56rem]:row-auto @[56rem]:translate-y-[9px]">
                      <EstadoLinea estado={f.estado} debeHaber={f.debeHaber} contada={f.contada} diferencia={f.diferencia} />
                    </div>
                    <div className="col-span-2 row-start-3 flex flex-wrap gap-2 @[36rem]:col-span-1 @[36rem]:col-start-2 @[36rem]:row-start-2 @[36rem]:justify-end @[56rem]:col-auto @[56rem]:row-auto">
                      <button
                        type="button"
                        data-recontar={f.varianteId}
                        disabled={!puedeActuar}
                        title={responsable.motivo ?? undefined}
                        onClick={() => void actuar(f.varianteId, "recontar")}
                        className="btn-cayla btn-chico btn-secundario min-w-0 flex-1 @[36rem]:flex-none"
                      >
                        {ocupada === "recontar" ? "Un momento…" : "Volver a contar"}
                      </button>
                      {f.estado === "con_diferencia" && (
                        <button
                          type="button"
                          disabled={!puedeActuar}
                          title={responsable.motivo ?? undefined}
                          onClick={() => void actuar(f.varianteId, "confirmar")}
                          className="btn-cayla btn-chico btn-primario min-w-0 flex-1 @[36rem]:flex-none"
                        >
                          {ocupada === "confirmar" ? "Confirmando…" : `Confirmar ${f.contada}`}
                        </button>
                      )}
                    </div>
                  </div>
                  {nota && <p className="mt-2 text-[11px] leading-[15px] text-taupe">{nota}</p>}
                  {error && (
                    <p role="alert" className="mt-2 text-xs text-rojo-profundo">
                      {error}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {hoja.totalPaginas > 1 && (
            <div className="flex justify-center border-t border-sand px-4 py-3">
              <PaginacionLocal
                pagina={hoja.pagina}
                totalPaginas={hoja.totalPaginas}
                onPagina={(n) => {
                  setPaginaDif(n);
                  irA(tarjetaDif);
                }}
              />
            </div>
          )}
        </section>
      ) : !conPendientes ? (
        <p className="rounded-xl bg-hueso px-3.5 py-3 text-sm text-tinta">
          {resumen.variantes === 0
            ? "Este conteo todavía no tiene ninguna variante. Vuelve a contar y escanea las prendas, o cancélalo desde Conteo si no se va a contar."
            : "Todo lo contado coincide con lo que CAYLA esperaba."}
        </p>
      ) : null}

      <BarraFija
        resumen={<p>{textoPie}</p>}
        acciones={
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center">
            {conPendientes ? (
              <>
                {bloqueoParcial === null ? (
                  <Link href={`${urlConfirmar}?parcial=1`} className="btn-cayla btn-secundario h-11 w-full sm:w-auto">
                    Cerrar como conteo parcial
                  </Link>
                ) : (
                  <button type="button" disabled title={textoPie} className="btn-cayla btn-secundario h-11 w-full sm:w-auto">
                    Cerrar como conteo parcial
                  </button>
                )}
                {volverAContar}
              </>
            ) : bloqueo === "conteo_vacio" ? (
              volverAContar
            ) : bloqueo === null ? (
              <Link href={urlConfirmar} className="btn-cayla btn-primario h-11 w-full sm:w-auto">
                Continuar
              </Link>
            ) : (
              <button type="button" disabled title={textoPie} className="btn-cayla btn-primario h-11 w-full sm:w-auto">
                Continuar
              </button>
            )}
          </div>
        }
      />
    </>
  );
}
