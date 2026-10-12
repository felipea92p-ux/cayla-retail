"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { armarSugerencias, errorDeSugerencias, paresParaConfirmar, type ParejaSugerida, type PrendaDelCatalogo, type VentaPendiente } from "@/lib/cola-arranque-reglas";
import type { FilaPorRegularizar } from "@/lib/por-regularizar";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect } from "@/components/ui/campos";
import { conPrecioDeLaSede } from "@/lib/precio-sede-reglas";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const textoDiferencia = (d: number) => (d === 0 ? "Se cobró el precio oficial" : d < 0 ? `Se cobró ${soles(-d)} menos` : `Se cobró ${soles(d)} más`);

/** Lo último que respondió la base, con la clave (tienda + intento) a la que respondió: una respuesta de otra tienda no vale. */
type Respuesta = { clave: string; parejas: ParejaSugerida[] | null };

/**
 * «Identificar con sugerencias» (ADR-0334): antes de cerrar la cola de arranque, las ventas que tienen UNA sola prenda posible
 * (misma categoría, talla y color, con stock en la tienda) se identifican de una vez. La base propone; un líder CONFIRMA fila por
 * fila: una sola candidata no es certeza (si la prenda vendida nunca se cargó, la candidata es OTRA prenda que sigue colgada y
 * quedaría con 1 de menos). Las que no se marcan siguen pendientes para identificarlas a mano o cerrarlas.
 *
 * Es una REVISIÓN, no un formulario: no hay campos que llenar, solo marcar las sugerencias que se reconocen; por eso no lleva guía
 * de foco (ver su registro). Las casillas NACEN SIN MARCAR: confirmar sin mirar no puede ser un clic (revisión independiente, 2026-10-04;
 * «Marcar todas» es un gesto deliberado). Todo o nada: si una pareja falla (alguien vendió la última unidad mientras se revisaba), no se aplica
 * ninguna, se explica qué pasó y se vuelven a buscar las sugerencias.
 */
export function SugerenciasColaModal({
  filas,
  prendas: prendasCatalogo,
  preciosPorSede = {},
  sedes,
  inicial,
  onClose,
}: {
  filas: FilaPorRegularizar[];
  prendas: PrendaDelCatalogo[];
  /** Precio propio de cada tienda: las sugerencias comparan con el precio de la tienda elegida. */
  preciosPorSede?: Record<string, Record<string, number>>;
  sedes: { ubicacionId: string; sede: string; pendientes: number }[];
  inicial: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const varias = sedes.length > 1;
  const [ubicacionId, setUbicacionId] = useState(sedes.length === 1 ? sedes[0].ubicacionId : (sedes.find((s) => s.ubicacionId === inicial)?.ubicacionId ?? ""));
  const [reintento, setReintento] = useState(0);
  const prendas = useMemo(() => conPrecioDeLaSede(prendasCatalogo, preciosPorSede[ubicacionId], (p) => p.id), [prendasCatalogo, preciosPorSede, ubicacionId]);
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  // Lo que el líder ELIGIÓ: nada viene marcado de fábrica. «marcadas» se deriva de esto y de lo que hay ahora (una sugerencia que ya no
  // está, porque se recargó la lista, no cuenta aunque su id siga aquí).
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(new Set());
  const [guardando, setGuardando] = useState(false);

  // Las parejas de la tienda elegida. Lectura (`fn_…`): no abre el cargador de pantalla completa; la hoja dice «Buscando…».
  // El estado de la carga se DERIVA de la clave: solo se escribe estado cuando la base responde, nunca de forma síncrona en el efecto.
  const clave = `${ubicacionId}:${reintento}`;
  useEffect(() => {
    if (!ubicacionId) return;
    let vigente = true;
    createClient()
      .rpc("fn_cola_arranque_candidatas", { p_ubicacion_id: ubicacionId })
      .then(({ data, error }) => {
        if (vigente) setRespuesta({ clave, parejas: error || !data ? null : data });
      });
    return () => {
      vigente = false;
    };
  }, [ubicacionId, clave]);
  const parejas = respuesta?.clave === clave ? respuesta.parejas : null;
  const fase = !ubicacionId ? "sin-tienda" : respuesta?.clave !== clave ? "buscando" : parejas ? "lista" : "error";

  const ventas = useMemo<VentaPendiente[]>(
    () => filas.filter((f) => f.estado === "pendiente" && f.ubicacionId === ubicacionId).map((f) => ({ id: f.id, descripcion: f.descripcion, categoria: f.categoria, talla: f.talla, color: f.color, precioCobrado: f.precioCobrado, vendidoEn: f.vendidoEn, vendidoPor: f.vendidoPor })),
    [filas, ubicacionId],
  );
  const sugerencias = useMemo(() => (parejas ? armarSugerencias(parejas, ventas, prendas) : []), [parejas, ventas, prendas]);
  const marcadas = useMemo(() => new Set(sugerencias.filter((s) => elegidas.has(s.prendaId)).map((s) => s.prendaId)), [sugerencias, elegidas]);

  const pares = paresParaConfirmar(sugerencias, marcadas);

  async function confirmar() {
    if (pares.length === 0 || guardando) return;
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("regularizar_prendas_sugeridas", { p_ubicacion_id: ubicacionId, p_pares: pares }),
      firmaOmitida("cola_arranque_identificar"),
    );
    setGuardando(false);
    if (error) {
      // Algo cambió mientras se revisaba (stock, una venta ya regularizada): se explica en ESTA hoja, no con el mensaje de «Llegó nueva», y se
      // vuelven a buscar las sugerencias para no repetir el mismo intento con datos viejos.
      const cambio = errorDeSugerencias(error);
      if (cambio) {
        avisar.error(cambio.texto);
        setElegidas(new Set());
        setReintento((n) => n + 1);
        router.refresh();
        return;
      }
      avisar.error(traducirError(error, "identificar las ventas con sugerencias"));
      return;
    }
    avisar.exito("Ventas identificadas", {
      detalle: `${pares.length} ${pares.length === 1 ? "venta quedó unida" : "ventas quedaron unidas"} a su prenda y el stock de esas prendas bajó 1 por cada una.`,
    });
    onClose();
    router.refresh();
  }

  return (
    <Modal
      titulo="Identificar con sugerencias"
      subtitulo="Ventas sin registrar que tienen una sola prenda posible en el sistema. Marca las que reconozcas."
      onClose={onClose}
      variante="hoja"
      ancho="max-w-3xl"
    >
      {(cerrar) => (
        <div className="space-y-5">
          {varias && (
            <CampoSelect
              etiqueta="Tienda"
              valor={ubicacionId}
              onValor={setUbicacionId}
              opciones={sedes.map((s) => ({ valor: s.ubicacionId, texto: `${s.sede} · ${s.pendientes} pendientes` }))}
              marcador="Elige la tienda"
              caja
            />
          )}

          {fase === "sin-tienda" && <p className="text-sm text-taupe">Elige la tienda para buscar sugerencias.</p>}
          {fase === "buscando" && (
            <p role="status" className="text-sm text-taupe">
              Buscando sugerencias…
            </p>
          )}
          {fase === "error" && (
            <div className="rounded-md bg-hueso px-4 py-3 text-sm text-tinta">
              <p>No se pudieron buscar las sugerencias. No se cambió nada.</p>
              <button type="button" onClick={() => setReintento((n) => n + 1)} className="btn-cayla btn-secundario mt-2">
                Reintentar
              </button>
            </div>
          )}
          {fase === "lista" && sugerencias.length === 0 && (
            <div className="rounded-md bg-hueso px-4 py-3 text-sm text-tinta">
              <p>No hay ventas con una sola prenda posible en esta tienda.</p>
              <p className="mt-1 text-[13px] text-tinta/70">Sin sugerencias, cada venta se identifica a mano con «Regularizar» o se cierra con «Cerrar la cola de arranque».</p>
            </div>
          )}

          {sugerencias.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-3 text-[13px] text-tinta/75">
                <span>
                  {pares.length} de {sugerencias.length} marcadas
                </span>
                <button
                  type="button"
                  onClick={() => setElegidas(pares.length === sugerencias.length ? new Set() : new Set(sugerencias.map((s) => s.prendaId)))}
                  className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo"
                >
                  {pares.length === sugerencias.length ? "Desmarcar todas" : "Marcar todas"}
                </button>
              </div>
              <ul className="space-y-2">
                {sugerencias.map((s) => {
                  const marcada = marcadas.has(s.prendaId);
                  const { dia } = diaYHoraLima(s.venta.vendidoEn);
                  return (
                    <li key={s.prendaId}>
                      <label className={`flex cursor-pointer items-start gap-3 rounded-md border px-3.5 py-3 transition-colors ease-cayla ${marcada ? "border-tinta bg-hueso" : "border-tinta/15 bg-papel"}`}>
                        <input
                          type="checkbox"
                          checked={marcada}
                          onChange={(e) =>
                            setElegidas((actual) => {
                              const nuevo = new Set(actual);
                              if (e.target.checked) nuevo.add(s.prendaId);
                              else nuevo.delete(s.prendaId);
                              return nuevo;
                            })
                          }
                          className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-tinta)]"
                        />
                        <span className="grid min-w-0 flex-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                          <span className="min-w-0">
                            <span className="block text-[11px] uppercase tracking-wide text-taupe">Lo que anotó caja</span>
                            <span className="block truncate text-sm text-tinta">{s.venta.descripcion}</span>
                            <span className="block text-xs text-taupe">
                              {[s.venta.categoria, s.venta.talla, s.venta.color].join(" · ")} · {soles(s.venta.precioCobrado)} · {s.venta.vendidoPor} · {dia}
                            </span>
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[11px] uppercase tracking-wide text-taupe">Sugerida</span>
                            <span className="block truncate text-sm text-tinta">{s.prenda.nombre}</span>
                            <span className="block text-xs text-taupe">
                              {s.prenda.codigo} · {[s.prenda.talla, s.prenda.color].join(" · ")} · oficial {soles(s.prenda.precio)} · {textoDiferencia(s.diferencia)} · hay {s.enStock}
                            </span>
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="rounded-md bg-hueso px-3.5 py-2.5 text-[13px] text-tinta/80">
                <strong className="font-semibold text-tinta">Una sola candidata no es certeza.</strong> Si la prenda vendida nunca se cargó, la sugerida es OTRA
                prenda que sigue en la tienda y quedaría con 1 de menos. Marca solo las que reconozcas. Se descuenta 1 de cada una del stock de la tienda.
              </p>
            </>
          )}

          <div className="pie-hoja-fijo flex justify-end gap-3 pt-1">
            <Boton type="button" onClick={cerrar}>
              {sugerencias.length > 0 ? "Cancelar" : "Cerrar"}
            </Boton>
            {sugerencias.length > 0 && (
              <Boton type="button" peso="primario" cargando={guardando} disabled={pares.length === 0} onClick={() => void confirmar()}>
                {pares.length === 0 ? "Marca al menos una" : `Identificar ${pares.length} ${pares.length === 1 ? "venta" : "ventas"}`}
              </Boton>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
