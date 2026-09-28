"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { FRASE_SIN_ELLA, QUIZA_MAS, type DetalleVista, type ReglaVista } from "@/lib/frescura-pantalla";
import type { Tramo } from "@/lib/frescura-reglas";
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
        className={`absolute top-0 flex flex-col text-[11.5px] font-semibold ${TRASLADO[alinearElla]} ${alinearElla === "medio" ? "items-center" : alinearElla === "fin" ? "items-end" : "items-start"}`}
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
            className={`flex h-full min-w-0 items-center overflow-hidden px-1.5 text-[11px] text-tinta ${ZONA[z.clave]} ${i > 0 ? "border-l border-taupe" : ""}`}
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
            className={`absolute top-1.5 whitespace-nowrap text-center text-[11px] leading-tight text-taupe ${TRASLADO[m.alinear]}`}
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

function Bloque({ titulo, children, primero = false }: { titulo?: string; children: ReactNode; primero?: boolean }) {
  return (
    <div className={primero ? "pb-4" : "border-t border-sand py-4"}>
      {titulo && <span className="label-cayla mb-2 block text-[11px] text-taupe">{titulo}</span>}
      {children}
    </div>
  );
}

export function FrescuraDetalle({
  detalle,
  sede,
  volverA,
  onClose,
}: {
  detalle: DetalleVista;
  sede: string;
  /** La fila que la abrió: al cerrar, el foco vuelve ahí. */
  volverA?: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const temporada =
    detalle.temporada?.tipo === "pasada" ? (
      <>
        <Chip tono="ambar" className="!px-2 !text-[11.5px] !leading-[18px]">
          Temporada pasada
        </Chip>{" "}
        <span className="text-[12.5px]">{detalle.temporada.texto}</span>
      </>
    ) : detalle.temporada?.tipo === "sin" ? (
      <Chip tono="neutro" className="!px-2 !text-[11.5px] !leading-[18px]">
        ¿De qué temporada es? Complétala
      </Chip>
    ) : detalle.temporada?.tipo === "tiene" ? (
      <span className="text-[12.5px]">{detalle.temporada.nombre}</span>
    ) : null;

  return (
    <Modal
      titulo={detalle.titulo}
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
      {(cerrar) => (
        <>
          <Bloque primero>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {detalle.dias !== null && (
                <span className="font-display text-[30px] font-semibold leading-none tabular-nums">
                  {detalle.dias}
                  <small className="ml-1 font-sans text-[13px] font-medium text-taupe">
                    días en el piso{detalle.quizaMas ? ` ${QUIZA_MAS}` : ""}
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
                  {detalle.nivelCategoria && detalle.nivelCategoria !== "solido" && (
                    <>
                      {" "}
                      Con {detalle.ventasCategoria} ventas en {sede}: <NivelChip nivel={detalle.nivelCategoria} />
                    </>
                  )}
                </span>
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
                <p className="mt-2.5 text-[13px] text-taupe">Son preguntas, no órdenes: la decisión es tuya. Aquí no se rebaja nada.</p>
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

          <div className="flex justify-end border-t border-sand pt-4">
            <button type="button" onClick={cerrar} className="btn-cayla btn-secundario">
              Cerrar
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
