"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import { money, type VarianteBusqueda } from "@/components/PuntoDeVenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import type { ResumenApartados } from "@/lib/separaciones";
import {
  EXTENSIONES_MAX,
  GRACIA_DIAS,
  ORDEN_ESTADO,
  PLAZO_DIAS,
  coincide,
  enlaceWhatsapp,
  estadoVisible,
  formatoCelular,
  mensajeWhatsapp,
  textoDevolucion,
  type Apartado,
  type ClaveEstado,
} from "@/lib/separaciones-reglas";
import { BarraPlazo, EstadoChip, FotoPrenda, fechaCorta } from "@/components/apartados/piezas";
import { DevolverModal, ExtenderModal, LiberarModal } from "@/components/apartados/ModalesApartado";

type Filtro = "hoy" | "abiertos" | "cerrados" | "todos";
const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: "hoy", etiqueta: "Necesitan algo" },
  { id: "abiertos", etiqueta: "Por recoger" },
  { id: "cerrados", etiqueta: "Cerrados" },
  { id: "todos", etiqueta: "Todos" },
];
// Lista agrupada por urgencia (Felipe, 2026-09-22, sobre la demo `docs/maquetas/apartados-rediseno-2026-09/`): los
// bloques ya dicen qué va primero, así que no hace falta leer el estado de cada fila para saber por dónde empezar.
const GRUPOS: { titulo: string; claves: ClaveEstado[] }[] = [
  { titulo: "Hoy, sin falta", claves: ["devolver", "vencida"] },
  { titulo: "Vencen pronto", claves: ["porvencer"] },
  { titulo: "A tiempo", claves: ["vigente"] },
  { titulo: "Cerrados", claves: ["cerrada"] },
];
const NECESITAN_ALGO: ClaveEstado[] = ["porvencer", "vencida", "devolver"];
// El sombreado de «En custodia»: plata que está en la tienda pero todavía no es de CAYLA (ADR-0166 D2).
const RAYADO_CUSTODIA = "bg-[repeating-linear-gradient(135deg,transparent_0_9px,color-mix(in_oklab,var(--color-sand)_45%,transparent)_9px_10px)]";

/**
 * El tablero de Apartados (rediseño 2026-09-22, guía oficial ADR-0169): las 4 cifras, UNA tarjeta con los filtros, el
 * buscador y la lista agrupada por urgencia, y la nota en hueso. Es la portada del módulo: la acción principal
 * («+ Nuevo apartado») vive en la cabecera y Entregar sale de cada fila. Reemplaza a la pestaña «Todos» y absorbe el
 * buscador de la pestaña «Entregar» (antes había dos buscadores que encontraban lo mismo).
 */
export function TableroApartados({
  ubicacionId,
  ubicacionEtiqueta,
  hoy,
  puedeGestionar,
  cajaAbierta,
  apartados,
  resumen,
  prendas,
  onEntregar,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  hoy: string;
  puedeGestionar: boolean;
  cajaAbierta: boolean;
  apartados: Apartado[];
  resumen: ResumenApartados;
  prendas: VarianteBusqueda[];
  onEntregar: (a: Apartado) => void;
}) {
  const fotos = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p.fotoUrl])), [prendas]);
  const conEstado = apartados.map((a) => ({ a, e: estadoVisible(a, hoy) }));
  const conteo: Record<Filtro, number> = {
    hoy: conEstado.filter(({ e }) => NECESITAN_ALGO.includes(e.clave)).length,
    abiertos: conEstado.filter(({ a }) => a.estado === "abierta").length,
    cerrados: conEstado.filter(({ e }) => e.clave === "cerrada").length,
    todos: conEstado.length,
  };
  // Abre en «Necesitan algo» solo si hay algo; si no, en «Por recoger»: un tablero que abre diciendo «Todo al día» y
  // escondiendo los apartados vigentes obliga a un clic para ver lo único que hay.
  const [filtro, setFiltro] = useState<Filtro>(conteo.hoy > 0 ? "hoy" : "abiertos");
  const [texto, setTexto] = useState("");
  const [liberar, setLiberar] = useState<Apartado | null>(null);
  const [devolver, setDevolver] = useState<Apartado | null>(null);
  const [extender, setExtender] = useState<Apartado | null>(null);
  // Extender, liberar y devolver firman con el combo «Responsable» (ADR-0161) dentro de su modal, de esta tienda.
  const ubicacion = { ubicacionId, etiqueta: ubicacionEtiqueta };

  const lista = conEstado
    .filter(({ a }) => coincide(a, texto))
    .filter(({ a, e }) =>
      filtro === "hoy" ? NECESITAN_ALGO.includes(e.clave) : filtro === "abiertos" ? a.estado === "abierta" : filtro === "cerrados" ? e.clave === "cerrada" : true,
    )
    .sort((x, y) => ORDEN_ESTADO[x.e.clave] - ORDEN_ESTADO[y.e.clave] || x.a.venceEl.localeCompare(y.a.venceEl));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-4">
        <TarjetaCifra etiqueta="Por recoger" valor={String(resumen.porRecoger)} className="anim-sube" style={{ ["--i" as string]: 1 }}>
          {resumen.prendasGuardadas} {resumen.prendasGuardadas === 1 ? "prenda guardada" : "prendas guardadas"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="En custodia" valor={money(resumen.enCustodia)} className={`anim-sube ${RAYADO_CUSTODIA}`} style={{ ["--i" as string]: 2 }}>
          No es ingreso hasta que recojan · {money(resumen.enCustodiaEfectivo)} en el cajón
        </TarjetaCifra>
        <TarjetaCifra
          etiqueta="Por devolver"
          valor={money(resumen.montoPorDevolver)}
          punto={resumen.porDevolver > 0 ? "rojo" : undefined}
          tono={resumen.porDevolver > 0 ? "text-rojo-profundo" : undefined}
          className="anim-sube"
          style={{ ["--i" as string]: 3 }}
        >
          {resumen.porDevolver === 0 ? "Nadie espera su dinero" : `${resumen.porDevolver} ${resumen.porDevolver === 1 ? "clienta espera" : "clientas esperan"} su dinero`}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Vencen en 2 días" valor={String(resumen.vencenPronto)} punto={resumen.vencenPronto > 0 ? "ambar" : undefined} className="anim-sube" style={{ ["--i" as string]: 4 }}>
          {resumen.vencenPronto > 0 ? "Buen momento para escribirles" : "Nadie vence en estos días"}
        </TarjetaCifra>
      </div>

      <section aria-label={`Apartados de ${ubicacionEtiqueta}`} className="card-cayla anim-sube p-4 sm:p-5" style={{ ["--i" as string]: 5 }}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)} className="pildora-cayla">
              {f.etiqueta} · {conteo[f.id]}
            </button>
          ))}
          <label className="caja-cayla flex h-10 w-full items-center gap-2.5 px-3 sm:ml-auto sm:w-96">
            <Search className="h-4 w-4 shrink-0 text-taupe" aria-hidden />
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Nombre, DNI, celular, APT- o B004-"
              aria-label="Buscar en los apartados"
              className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-taupe/80"
            />
          </label>
        </div>

        {apartados.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sand px-6 py-10 text-center">
            <p className="font-display text-xl text-tinta">Todavía no hay apartados en {ubicacionEtiqueta}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-taupe">Cuando una clienta deje un adelanto por una prenda, aparecerá aquí con su plazo, su saldo y lo que falta hacer.</p>
          </div>
        ) : lista.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sand px-6 py-10 text-center">
            <p className="font-display text-xl text-tinta">{texto ? `Nadie con «${texto}»` : filtro === "hoy" ? "Todo al día" : "Nada por aquí"}</p>
            <p className="mt-1 text-sm text-taupe">
              {texto ? "Prueba con el DNI, el celular o el N.º de boleta." : filtro === "hoy" ? "Ningún apartado vence ni espera devolución hoy." : "Cambia el filtro para ver los demás."}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {GRUPOS.map((g) => {
              const filas = lista.filter(({ e }) => g.claves.includes(e.clave));
              if (filas.length === 0) return null;
              return (
                <section key={g.titulo}>
                  <h3 className="font-display mb-2.5 flex items-baseline gap-2 text-lg text-tinta">
                    {g.titulo} <span className="font-sans text-[11.5px] font-medium text-taupe">{filas.length}</span>
                  </h3>
                  <ul className="divide-y divide-sand overflow-hidden rounded-xl border border-sand">
                    {filas.map(({ a, e }, i) => (
                      <li
                        key={a.id}
                        style={{ ["--i" as string]: i }}
                        className="anim-sube grid items-center gap-x-5 gap-y-2 px-4 py-3.5 transition-colors hover:bg-crema/60 sm:px-5 md:grid-cols-[minmax(190px,1.3fr)_minmax(130px,1fr)_150px_170px_auto]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="font-display grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sand/70 text-sm">{`${a.nombres[0] ?? ""}${a.apellidos[0] ?? ""}`.toUpperCase()}</span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-tinta">
                              {a.nombres} {a.apellidos}
                            </p>
                            <p className="truncate text-xs text-taupe tabular-nums">
                              {formatoCelular(a.celular)} · <span className="font-mono">{a.codigo}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex min-w-0 items-center gap-2 max-md:hidden">
                          <span className="flex">
                            {a.prendas.slice(0, 3).map((pr, j) => (
                              <FotoPrenda key={pr.varianteId} fotoUrl={fotos.get(pr.varianteId)} referencia={pr.referencia} ancho={32} className={`w-8 border border-papel ${j ? "-ml-3.5" : ""}`} />
                            ))}
                          </span>
                          <span className="truncate text-[12.5px] text-taupe">{a.prendas.map((pr) => pr.referencia.split(" ")[0]).join(", ")}</span>
                        </div>
                        <div className="text-sm whitespace-nowrap tabular-nums max-md:hidden">
                          <b className="font-semibold">{money(a.adelanto)}</b> <span className="text-xs text-taupe">de {money(a.total)}</span>
                          <p className="text-xs text-taupe">{a.estado === "liberada" ? `por ${textoDevolucion(a)}` : a.estado === "abierta" ? (a.saldo > 0 ? `saldo ${money(a.saldo)}` : "pagó el 100 %") : "cerrado"}</p>
                        </div>
                        <div className="space-y-1.5">
                          <EstadoChip {...e} />
                          {a.estado === "abierta" && <BarraPlazo creadaEl={a.creadaEn.slice(0, 10)} hoy={hoy} />}
                          <p className="text-[11.5px] text-taupe">
                            {a.estado === "abierta"
                              ? `vence ${fechaCorta(a.venceEl)}${a.extensiones ? " · extendido" : ""}`
                              : a.estado === "liberada"
                                ? a.liberadaSola
                                  ? "se liberó solo"
                                  : "liberado"
                                : a.estado === "entregada"
                                  ? `boleta ${a.comprobanteFinal ?? a.comprobanteAnticipo ?? ""}`
                                  : a.notaCredito
                                    ? `NC ${a.notaCredito}`
                                    : "devuelto"}
                          </p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {(e.clave === "vigente" || e.clave === "porvencer" || e.clave === "vencida") && (
                            <a
                              href={enlaceWhatsapp(a.celular, mensajeWhatsapp(a, ubicacionEtiqueta))}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Escribir a ${a.nombres} por WhatsApp`}
                              title="Escribir por WhatsApp"
                              className="btn-cayla btn-chico btn-sutil"
                            >
                              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                            </a>
                          )}
                          {e.clave === "vencida" && puedeGestionar && (
                            <>
                              <button
                                type="button"
                                disabled={a.extensiones >= EXTENSIONES_MAX}
                                title={a.extensiones >= EXTENSIONES_MAX ? "Ya se extendió una vez" : undefined}
                                onClick={() => setExtender(a)}
                                className="btn-cayla btn-chico btn-sutil"
                              >
                                +7 días
                              </button>
                              <button type="button" onClick={() => setLiberar(a)} className="btn-cayla btn-chico btn-peligro">
                                Liberar
                              </button>
                            </>
                          )}
                          {a.estado === "abierta" && (
                            <button
                              type="button"
                              disabled={!cajaAbierta}
                              title={cajaAbierta ? undefined : "Abre la caja para poder entregar"}
                              onClick={() => onEntregar(a)}
                              className="btn-cayla btn-chico btn-primario"
                            >
                              Entregar
                            </button>
                          )}
                          {e.clave === "devolver" &&
                            (puedeGestionar ? (
                              <button type="button" onClick={() => setDevolver(a)} className="btn-cayla btn-chico btn-primario">
                                Devolver {money(a.adelanto)}
                              </button>
                            ) : (
                              <span className="text-[11px] text-taupe">Lo devuelve la líder</span>
                            ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </section>

      <p className="nota-cayla anim-sube" style={{ ["--i" as string]: 6 }}>
        El adelanto <b>no es venta</b>: es de la clienta hasta que recoge. Al entregar, la venta nace por el total y el adelanto se descuenta de la boleta. Si no recoge en{" "}
        <b>{PLAZO_DIAS} días</b>, hay <b>{GRACIA_DIAS} de gracia</b> para decidir; después la prenda vuelve sola al piso y se le devuelve el 100 % por el medio que eligió.
      </p>

      {extender && <ExtenderModal apartado={extender} ubicacion={ubicacion} onClose={() => setExtender(null)} />}
      {liberar && <LiberarModal apartado={liberar} ubicacion={ubicacion} onClose={() => setLiberar(null)} />}
      {devolver && <DevolverModal apartado={devolver} ubicacion={ubicacion} cajaAbierta={cajaAbierta} onClose={() => setDevolver(null)} />}
    </>
  );
}
