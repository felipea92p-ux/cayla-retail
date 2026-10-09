"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import type { AccionDecision, TrasladoReciente } from "@/lib/frescura-decisiones-reglas";
import type { BloqueDeDecision } from "@/lib/frescura-decisiones-pantalla";
import { FRASE_SIN_ELLA, QUIZA_MAS, palabraDias, type AccesoFrescura, type DetalleVista, type ReglaVista } from "@/lib/frescura-pantalla";
import type { FrescuraPrenda, Tramo, VaraCategoria } from "@/lib/frescura-reglas";
import { FrescuraDecidir, FrescuraQuitar } from "./FrescuraDecidir";
import { EstadoChip, ICONO_SUGERENCIA, NivelChip, TextoConNegritas } from "./piezas";

// La hoja de detalle de una prenda de Frescura del piso (ADR-0208, paso 4): el porqué de su estado en palabras de tienda,
// DÓNDE CAE entre las demás de su categoría (la regla, con cada zona escrita), cómo se vende, sus tallas y qué se puede
// hacer. Es un `<Modal variante="hoja">` (ADR-0136): hereda el velo, la entrada en cascada, el foco atrapado y el Escape
// que respeta a los controles de adentro (`useEscapeLibre`). Los botones llevan a la pantalla que hace cada cosa, solo si
// quien mira la ve (ninguno termina en «Sin acceso»).

/** Colores A en la regla: verde, arena, ámbar y la ÚNICA mancha roja de la pantalla, la zona Crítica (un tinte). */
const ZONA: Record<Tramo | "nada", string> = {
  nueva: "bg-verde/15",
  vigente: "bg-sand",
  envejecida: "bg-ambar/15",
  critica: "bg-rojo/10",
  nada: "bg-[repeating-linear-gradient(135deg,var(--color-sand)_0_3px,transparent_3px_6px)]",
};

const TRASLADO: Record<"inicio" | "medio" | "fin", string> = { inicio: "translate-x-0", medio: "-translate-x-1/2", fin: "-translate-x-full" };

function Regla({ regla }: { regla: ReglaVista }) {
  const alinearElla = regla.ella.pos < 8 ? "inicio" : regla.ella.pos > 92 ? "fin" : "medio";
  return (
    <div className="relative mt-3.5 pt-7" role="img" aria-label={`Dónde cae entre las demás de su categoría: ${regla.ella.texto}`}>
      <span
        className={`absolute top-0 flex flex-col text-[12px] font-semibold ${TRASLADO[alinearElla]} ${alinearElla === "medio" ? "items-center" : alinearElla === "fin" ? "items-end" : "items-start"}`}
        style={{ left: `${regla.ella.pos}%` } as CSSProperties}
      >
        <span className="whitespace-nowrap">{regla.ella.texto}</span>
        <span aria-hidden className="mt-0.5 h-6 w-0.5 rounded-sm bg-tinta" />
      </span>
      <div className="flex h-6 overflow-hidden rounded-md shadow-[inset_0_0_0_1px_var(--color-taupe)]">
        {regla.zonas.map((z, i) => (
          <span
            key={`${z.clave}-${i}`}
            title={z.nombre}
            className={`flex h-full min-w-0 items-center overflow-hidden px-1.5 text-[12px] text-tinta ${ZONA[z.clave]} ${i > 0 ? "border-l border-taupe" : ""}`}
            style={{ width: `${z.ancho}%` }}
          >
            <span className="truncate">{z.nombre}</span>
          </span>
        ))}
      </div>
      <div className="relative h-8">
        {regla.marcas.map((m, i) => (
          <span
            key={i}
            className={`absolute top-1.5 whitespace-nowrap text-center text-[12px] leading-tight text-taupe ${TRASLADO[m.alinear]}`}
            style={{ left: `${m.pos}%` }}
          >
            {m.arriba}
            {m.abajo && (
              <>
                <br />
                {m.abajo}
              </>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Todo lo que la hoja necesita para anotar lo decidido (paso 4b). Se arma en el panel, que ya tiene la sede y el contexto. */
export type ContextoDecision = {
  prenda: FrescuraPrenda;
  sede: { id: string; nombre: string };
  esLider: boolean;
  ahora: string;
  categoria: VaraCategoria | undefined;
  cayla: VaraCategoria | undefined;
  recientes: readonly TrasladoReciente[];
  acceso: AccesoFrescura;
  /** ¿Se pudo leer lo ya decidido? Sin eso no se sabe cuál es la última línea y «Ya decidí» chocaría: se esconde. */
  lecturaOk: boolean;
  bloque: BloqueDeDecision;
  /** La última línea de la libreta (a la que responde lo que se anote) y, si es una decisión vigente, la que «Quitar» quita. */
  anteriorId: string | null;
  vigenteId: string | null;
};

/** La barra «día 3 de 7»: se llena al abrir (200–500 ms, sin rebote; sin movimiento con `prefers-reduced-motion`). */
function BarraDias({ dia, de }: { dia: number; de: number }) {
  const [lleno, setLleno] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setLleno(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="mt-2.5 flex items-center gap-2.5">
      <div role="progressbar" aria-valuemin={1} aria-valuemax={de} aria-valuenow={dia} aria-label={`Día ${dia} de ${de}`} className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand">
        <div className="h-full rounded-full bg-tinta/55 transition-[width] duration-500 ease-cayla motion-reduce:transition-none" style={{ width: lleno ? `${(dia / de) * 100}%` : "0%" }} />
      </div>
      <span className="text-[12px] tabular-nums text-taupe">
        día {dia} de {de}
      </span>
    </div>
  );
}

function Bloque({ titulo, children, primero = false }: { titulo?: string; children: ReactNode; primero?: boolean }) {
  return (
    <div className={primero ? "pb-4" : "border-t border-sand py-4"}>
      {titulo && <span className="label-cayla mb-2 block text-[12px] text-taupe">{titulo}</span>}
      {children}
    </div>
  );
}

export function FrescuraDetalle({
  detalle,
  sede,
  volverA,
  onClose,
  decision,
  modoInicial = "detalle",
  opcionInicial = null,
}: {
  detalle: DetalleVista;
  sede: string;
  /** La fila que la abrió: al cerrar, el foco vuelve ahí. */
  volverA?: RefObject<HTMLElement | null>;
  onClose: () => void;
  decision: ContextoDecision;
  /** Con qué se abre: el detalle, o directo «Ya decidí» (el botón «Decidir» de la fila, act. 2026-10-07). */
  modoInicial?: "detalle" | "decidir";
  /** La opción ya marcada al abrir en «decidir» (el botón de la fila que no pudo anotar a un toque). */
  opcionInicial?: AccionDecision | null;
}) {
  // La MISMA hoja cambia de contenido (ADR-0136: no se abre un modal encima): el detalle, «Ya decidí» o «Quitar lo anotado».
  // El modo pedido vale SOLO para la última línea que se vio al pedirlo: si la lectura se refresca y esa línea cambió (otra
  // persona anotó, o se anotó aquí), se vuelve al detalle sin un efecto que lo corrija después de pintar.
  const [pedido, setPedido] = useState<{ modo: "detalle" | "decidir" | "quitar"; para: string | null }>({ modo: modoInicial, para: decision.anteriorId });
  const puedeDecidir = decision.lecturaOk && decision.prenda.pisoHoy > 0;
  // «Ya decidí» solo si se puede (la libreta leída y algo en el piso), venga de su botón o pedido por la fila al abrir.
  const modo = pedido.para !== decision.anteriorId || (pedido.modo === "decidir" && !puedeDecidir) ? "detalle" : pedido.modo;
  const setModo = (m: "detalle" | "decidir" | "quitar") => setPedido({ modo: m, para: decision.anteriorId });
  const { bloque } = decision;
  const temporada =
    detalle.temporada?.tipo === "pasada" ? (
      <>
        <Chip tono="ambar" className="!px-2 !text-[12.5px] !leading-[18px]">
          Temporada pasada
        </Chip>{" "}
        <span className="text-[12.5px]">{detalle.temporada.texto}</span>
      </>
    ) : detalle.temporada?.tipo === "sin" ? (
      <Chip tono="neutro" className="!px-2 !text-[12px] !leading-[18px]">
        ¿De qué temporada es? Complétala
      </Chip>
    ) : detalle.temporada?.tipo === "tiene" ? (
      <span className="text-[12.5px]">{detalle.temporada.nombre}</span>
    ) : null;

  return (
    <Modal conCerrar
      titulo={modo === "decidir" ? `¿Qué hiciste con ${detalle.titulo}?` : detalle.titulo}
      subtitulo={
        <>
          {detalle.bajada}
          {temporada && <> · {temporada}</>}
        </>
      }
      onClose={onClose}
      variante="hoja"
      ancho="sm:max-w-[40rem]"
      alCerrarEnfocar={volverA}
    >
      {(cerrar) => modo === "decidir" ? (
        <FrescuraDecidir
          prenda={decision.prenda}
          sede={decision.sede}
          esLider={decision.esLider}
          ahora={decision.ahora}
          categoria={decision.categoria}
          cayla={decision.cayla}
          recientes={decision.recientes}
          acceso={decision.acceso}
          anteriorId={decision.anteriorId}
          opcionInicial={opcionInicial}
          onVolver={() => setModo("detalle")}
          onListo={cerrar}
        />
      ) : (
        <>
          <Bloque primero>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {detalle.dias !== null && (
                <span className="font-display text-[30px] font-semibold leading-none tabular-nums">
                  {detalle.dias}
                  <small className="ml-1 font-sans text-[13px] font-medium text-taupe">
                    {palabraDias(detalle.dias)} en el piso{detalle.quizaMas ? ` ${QUIZA_MAS}` : ""}
                    {detalle.pausa ? " · parado: está apartada" : ""}
                  </small>
                </span>
              )}
              <EstadoChip estado={detalle.estado} apilado={false} />
            </div>
            <p className="mt-2.5 text-sm leading-relaxed">
              <TextoConNegritas texto={detalle.porque} />
            </p>
            {detalle.regla && <Regla regla={detalle.regla} />}
            {detalle.sinContarla && (
              <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-hueso/85 px-3 py-2.5 text-[13px] leading-normal text-taupe">
                <Info aria-hidden strokeWidth={1.6} className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <b className="font-semibold text-tinta">{FRASE_SIN_ELLA}</b> <TextoConNegritas texto={detalle.sinContarla} />
                  {detalle.confianzaSinElla && (
                    <>
                      {" "}
                      {detalle.confianzaSinElla.texto} <NivelChip nivel={detalle.confianzaSinElla.nivel} />
                    </>
                  )}
                </span>
              </div>
            )}
          </Bloque>

          <Bloque titulo={bloque.estado === "vigente" ? "Ya decidido" : bloque.estado === "volvio" ? "Volvió a «Por decidir»" : "Lo decidido"}>
            {bloque.estado !== "ninguna" ? (
              <div className="space-y-2">
                <p className="text-sm leading-relaxed">{bloque.linea}</p>
                {bloque.revisa && <p className="text-sm font-semibold">{bloque.revisa}</p>}
                {bloque.progreso && <BarraDias dia={bloque.progreso.dia} de={bloque.progreso.de} />}
                {bloque.nota && <p className="rounded-lg bg-hueso px-3 py-2 text-[13px] leading-snug">«{bloque.nota}»</p>}
                {bloque.resultado && (
                  <p className="flex flex-wrap items-start gap-x-2 gap-y-1 text-[13.5px] leading-relaxed">
                    {bloque.resultado.chip && (
                      <Chip tono={bloque.resultado.chip.tono} className="!px-2 !text-[12px] !leading-[18px]">
                        {bloque.resultado.chip.texto}
                      </Chip>
                    )}
                    <span>{bloque.resultado.texto}</span>
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[13.5px] leading-relaxed text-taupe">Todavía no se anotó nada de esta prenda.</p>
            )}
            {modo === "quitar" && decision.vigenteId ? (
              <div className="mt-3">
                <FrescuraQuitar decisionId={decision.vigenteId} sede={decision.sede} onNo={() => setModo("detalle")} onListo={cerrar} />
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                {puedeDecidir && bloque.estado === "vigente" && (
                  <button type="button" className="btn-cayla btn-secundario" onClick={() => setModo("decidir")}>
                    Anotar otra decisión
                  </button>
                )}
                {puedeDecidir && bloque.estado !== "vigente" && (
                  <button type="button" className={decision.prenda.porDecidir ? "btn-cayla btn-primario" : "btn-cayla btn-sutil"} onClick={() => setModo("decidir")}>
                    {decision.prenda.porDecidir ? "Ya decidí" : "Anotar lo que hice"}
                  </button>
                )}
                {bloque.estado === "vigente" && decision.vigenteId && decision.lecturaOk && (
                  <button type="button" className="btn-cayla btn-enlace text-[13px]" onClick={() => setModo("quitar")}>
                    Quitar lo anotado
                  </button>
                )}
                {!decision.lecturaOk && <span className="text-[12.5px] text-taupe">No se pudo leer lo ya decidido: por ahora no se puede anotar. Vuelve a intentar en un momento.</span>}
              </div>
            )}
            {bloque.historial.length > 0 && (
              <div className="mt-4 border-t border-sand pt-3">
                <span className="label-cayla mb-2 block text-[12px] text-taupe">Lo que se decidió antes</span>
                <ul className="space-y-1.5 text-[13px] leading-snug">
                  {bloque.historial.map((h) => (
                    <li key={h.id}>
                      <span className="tabular-nums text-taupe">{h.cuando}</span> · {h.texto}
                      {h.chip && (
                        <>
                          {" · "}
                          <b className="font-semibold">{h.chip.texto}</b>
                        </>
                      )}
                      {h.resultado && <span className="block text-[12.5px] text-taupe">{h.resultado}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Bloque>

          <Bloque titulo="Cómo se vende">
            {detalle.rapidez && (
              <p className="text-sm leading-relaxed">
                <TextoConNegritas texto={detalle.rapidez} /> {detalle.rapidezNivel && detalle.rapidezNivel !== "solido" && <NivelChip nivel={detalle.rapidezNivel} />}
              </p>
            )}
            {detalle.recientes && (
              <p className={`text-sm leading-relaxed ${detalle.rapidez ? "mt-1.5" : ""}`}>
                <TextoConNegritas texto={detalle.recientes} />
              </p>
            )}
            {!detalle.rapidez && !detalle.recientes && <p className="text-[13px] text-taupe">No se mide.</p>}
          </Bloque>

          <Bloque titulo={`Tallas en ${sede}`}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5">
              {detalle.tallas.map((t) => (
                <div key={t.varianteId} className="rounded-[10px] bg-hueso px-2.5 py-2 text-[12.5px] leading-normal">
                  <b className="block text-[13px] font-semibold">{t.talla}</b>
                  <span className="text-taupe">Piso</span> {t.piso}
                  <br />
                  <span className="text-taupe">Almacén</span> {t.almacen}
                  {t.apartadas > 0 && (
                    <>
                      <br />
                      <span className="text-taupe">Apartadas</span> {t.apartadas}
                    </>
                  )}
                </div>
              ))}
            </div>
          </Bloque>

          <Bloque titulo="Qué puedes hacer">
            {detalle.acciones.length > 0 ? (
              <>
                <div className="grid gap-2">
                  {detalle.acciones.map((a) => {
                    const Icono = ICONO_SUGERENCIA[a.clave];
                    return (
                      <div key={a.clave} className="rounded-xl border border-sand bg-papel px-3.5 py-3">
                        <div className="flex items-start gap-2 text-sm font-semibold">
                          <Icono aria-hidden strokeWidth={1.6} className="mt-0.5 h-4 w-4 shrink-0 text-taupe" />
                          <span>{a.titulo}</span>
                        </div>
                        <p className="mt-1 text-[13px] leading-relaxed text-tinta/70">{a.texto}</p>
                        {a.botones.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {a.botones.map((b) => (
                              <Link key={b.href + b.texto} href={b.href} className="btn-cayla btn-secundario btn-chico">
                                {b.texto}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2.5 text-[13px] text-taupe">Son preguntas, no órdenes: la decisión es tuya. Aquí no se rebaja nada; lo que decidas se anota con «Ya decidí».</p>
              </>
            ) : (
              <p className="text-sm">{detalle.sinAcciones}</p>
            )}
          </Bloque>

          <Bloque titulo="Datos de apoyo">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[13px]">
              {detalle.apoyo.map((d) => (
                <div key={d.que} className="contents">
                  <dt className="text-taupe">{d.que}</dt>
                  <dd>{d.dato}</dd>
                </div>
              ))}
            </dl>
          </Bloque>

        </>
      )}
    </Modal>
  );
}
