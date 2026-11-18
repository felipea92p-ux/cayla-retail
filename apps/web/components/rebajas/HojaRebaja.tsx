"use client";

import { useEffect, useState } from "react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, Interruptor } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { traducirError } from "@/lib/error-escritura";
import { sePuedeConfirmar } from "@/lib/guia-campos";
import {
  camposDeRebaja,
  hayQueQuitar,
  leerRebajaDePrenda,
  lugarConPct,
  nombreDeLugar,
  nombreDePrenda,
  PCT_MAX_REBAJA,
  pctElegido,
  pctQueCobra,
  precioConPct,
  quedaBajoCosto,
  saleDe,
  sigueLlegando,
  textoDelBoton,
  textoPct,
  type AlcanceRebaja,
  type EleccionDePct,
  type RebajaDePrenda,
} from "@/lib/rebaja-rapida-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { rpcRebaja } from "@/lib/rebaja-rapida";
import type { useResponsable } from "@/lib/useResponsable";

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/**
 * «Poner un %» (ADR-0669, Felipe 2026-11-16): la hoja que abre al escanear una prenda en Campañas y ofertas. Dice qué % tiene hoy en esta
 * tienda y pregunta tres cosas, en este orden: a qué (solo esta prenda o todo el modelo), cuánto (un lugar de % que ya existe o «otro %») y
 * quién. La base decide (`poner_rebaja`, `quitar_rebaja`): la hoja solo muestra lo que va a pasar (el precio, de dónde sale, lo que le sigue
 * llegando, si queda bajo el costo).
 */
export function HojaRebaja({
  varianteId,
  ubicacionId,
  sede,
  responsable,
  onClose,
  onCambio,
}: {
  varianteId: string;
  ubicacionId: string;
  sede: string;
  responsable: ReturnType<typeof useResponsable>;
  onClose: () => void;
  /** Se puso o se quitó un %: la pantalla relee sus lugares. */
  onCambio: () => void;
}) {
  const [datos, setDatos] = useState<{ estado: "cargando" } | { estado: "error"; mensaje: string } | { estado: "listo"; r: RebajaDePrenda }>({ estado: "cargando" });
  const [alcance, setAlcance] = useState<AlcanceRebaja | null>(null);
  const [eleccion, setEleccion] = useState<EleccionDePct>(null);
  const [todas, setTodas] = useState(false);
  const [guardando, setGuardando] = useState<"poner" | "quitar" | null>(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const { data, error } = await rpcRebaja("campanas_rebaja_de_prenda", { p_variante_id: varianteId, p_ubicacion_id: ubicacionId });
      if (!vigente) return;
      const r = error ? null : leerRebajaDePrenda(data);
      setDatos(r ? { estado: "listo", r } : { estado: "error", mensaje: traducirError(error, "leer la prenda", { lectura: true }) });
    })();
    return () => {
      vigente = false;
    };
  }, [varianteId, ubicacionId]);

  const r = datos.estado === "listo" ? datos.r : null;
  const lugares = r?.lugares ?? [];
  const pct = pctElegido(eleccion, lugares);
  // «Otro %» que ya existe en la tienda va a ese lugar (no se crea un cajón igual al lado).
  const destino = eleccion?.tipo === "lugar" ? lugares.find((l) => l.etiquetaId === eleccion.etiquetaId) ?? null : pct !== null ? lugarConPct(pct, lugares) : null;
  const campos = camposDeRebaja({ alcance, eleccion, pct, responsableListo: responsable.listo, responsableMotivo: responsable.motivo });
  const guia = useGuiaCampos(campos);

  async function guardar(accion: "poner" | "quitar") {
    if (!r || !alcance) return;
    setGuardando(accion);
    const consulta =
      accion === "poner"
        ? rpcRebaja("poner_rebaja", {
            p_variante_id: varianteId,
            p_alcance: alcance,
            p_pct: pct,
            p_etiqueta_id: todas ? null : (destino?.etiquetaId ?? null),
            p_ubicacion_id: ubicacionId,
            p_todas: todas,
          })
        : rpcRebaja("quitar_rebaja", { p_variante_id: varianteId, p_alcance: alcance, p_ubicacion_id: ubicacionId, p_todas: todas });
    const { error } = await firmar(consulta, responsable.firma());
    setGuardando(null);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, accion === "poner" ? "poner el %" : "quitar el %"));
      return;
    }
    const que = alcance === "modelo" ? `${r.prenda.referencia} (todo el modelo)` : nombreDePrenda(r.prenda);
    avisar.exito(accion === "poner" ? `${textoPct(pct ?? 0)} puesto` : "% quitado", { detalle: `${que} · ${todas ? "todas las tiendas" : sede}` });
    onCambio();
    onClose();
  }

  function onConfirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!sePuedeConfirmar(campos)) return;
    void guardar("poner");
  }

  return (
    <Modal
      titulo={r ? r.prenda.referencia : "Poner un %"}
      subtitulo={r ? [r.prenda.color, r.prenda.talla, soles(r.prenda.precio)].filter(Boolean).join(" · ") : undefined}
      tamano="mediana"
      onClose={onClose}
      bloqueado={guardando !== null}
    >
      {(cerrar) =>
        datos.estado === "cargando" ? (
          <p className="text-sm text-tinta/70" role="status">
            Leyendo la prenda…
          </p>
        ) : datos.estado === "error" ? (
          <Aviso tono="error" titulo="No se pudo leer la prenda">
            {datos.mensaje}
          </Aviso>
        ) : (
          <form onSubmit={onConfirmar} onKeyDown={enterNoGuarda} className="space-y-6">
            {/* Lo que tiene hoy: el dato antes que la pregunta (ley 5, ver antes que leer). */}
            <div className="flex items-center gap-3">
              <MiniaturaPrenda
                fotoUrl={datos.r.prenda.foto}
                colorHex={datos.r.prenda.colorHex}
                tamano="lg"
                prefijo={datos.r.prenda.categoria.prefijo}
                familia={datos.r.prenda.categoria.familia}
                categoria={datos.r.prenda.categoria.nombre}
              />
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-tinta/70">Hoy en {sede}</p>
                <div className="flex flex-wrap gap-1.5">
                  {datos.r.tiene.length === 0 ? (
                    <Chip tono="apagado">Sin descuento</Chip>
                  ) : (
                    datos.r.tiene.map((t) => (
                      <Chip key={t.etiquetaId} tono="rojo" title={t.como === "categoria" ? "Le llega por su categoría" : t.como === "oferta" ? "Le llega por una oferta" : undefined}>
                        {nombreDeLugar(t)}
                      </Chip>
                    ))
                  )}
                </div>
              </div>
            </div>

            <CampoGuiado id="alcance" guia={guia} titulo="¿A qué?">
              <div role="group" aria-label="A qué se le pone el %" className="flex flex-wrap gap-2">
                <button type="button" className="pildora-cayla" aria-pressed={alcance === "prenda"} onClick={() => setAlcance("prenda")}>
                  {`Solo esta · ${[datos.r.prenda.color, datos.r.prenda.talla].filter(Boolean).join(" ") || "esta prenda"}`}
                </button>
                <button type="button" className="pildora-cayla" aria-pressed={alcance === "modelo"} onClick={() => setAlcance("modelo")}>
                  {`Todo el modelo · ${datos.r.prenda.modeloPrendas} ${datos.r.prenda.modeloPrendas === 1 ? "prenda" : "prendas"}`}
                </button>
              </div>
            </CampoGuiado>

            <CampoGuiado id="pct" guia={guia} titulo="¿Cuánto menos?">
              <div role="group" aria-label="Cuánto menos" className="flex flex-wrap gap-2">
                {lugares.map((l) => (
                  <button
                    key={l.etiquetaId}
                    type="button"
                    className="pildora-cayla tabular-nums"
                    aria-pressed={eleccion?.tipo === "lugar" && eleccion.etiquetaId === l.etiquetaId}
                    title={`${l.prendas} ${l.prendas === 1 ? "prenda" : "prendas"}${l.hasta ? ` · hasta el ${l.hasta.split("-").reverse().join("/")}` : ""}`}
                    onClick={() => setEleccion({ tipo: "lugar", etiquetaId: l.etiquetaId })}
                  >
                    {nombreDeLugar(l)}
                  </button>
                ))}
                <button
                  type="button"
                  className="pildora-cayla"
                  aria-pressed={eleccion?.tipo === "otro"}
                  onClick={() => setEleccion({ tipo: "otro", pct: eleccion?.tipo === "otro" ? eleccion.pct : null })}
                >
                  Otro %
                </button>
              </div>
              {eleccion?.tipo === "otro" && (
                <div className="mt-3 w-44">
                  <PasoCantidad
                    menos={{ onClick: () => setEleccion({ tipo: "otro", pct: Math.max(1, (eleccion.pct ?? 10) - 5) }), etiqueta: "Bajar el %" }}
                    mas={{ onClick: () => setEleccion({ tipo: "otro", pct: Math.min(PCT_MAX_REBAJA, (eleccion.pct ?? 0) + 5) }), etiqueta: "Subir el %" }}
                    sufijo="%"
                    campo={{
                      inputMode: "decimal",
                      autoFocus: true,
                      "aria-label": "Cuánto menos, en %",
                      value: eleccion.pct === null ? "" : String(eleccion.pct),
                      onChange: (ev) => {
                        const n = Number(ev.target.value.replace(",", "."));
                        setEleccion({ tipo: "otro", pct: ev.target.value.trim() === "" || !Number.isFinite(n) ? null : n });
                      },
                    }}
                  />
                </div>
              )}
              {pct !== null && (
                <p className="mt-3 text-sm tabular-nums" role="status">
                  <span className="text-tinta/70 line-through">{soles(datos.r.prenda.precio)}</span>
                  {"  →  "}
                  <span className="font-semibold">{soles(precioConPct(datos.r.prenda.precio, pctQueCobra(datos.r.tiene, destino?.etiquetaId ?? null, pct)))}</span>
                  {` en ${todas ? "todas las tiendas" : sede}`}
                </p>
              )}
            </CampoGuiado>

            {/* Lo que va a pasar, antes de confirmar: de dónde sale, lo que le sigue llegando y si se pierde plata. */}
            {pct !== null && (
              <div className="space-y-2">
                {saleDe(datos.r.tiene, destino?.etiquetaId ?? null).length > 0 && (
                  <Aviso tono="info" chico titulo={`Sale de ${saleDe(datos.r.tiene, destino?.etiquetaId ?? null).join(" y ")}`}>
                    Una prenda está en un solo %.
                  </Aviso>
                )}
                {sigueLlegando(datos.r.tiene, destino?.etiquetaId ?? null).some((t) => t.pct > pct) && (
                  <Aviso tono="atencion" chico titulo={`La caja cobra ${textoPct(pctQueCobra(datos.r.tiene, destino?.etiquetaId ?? null, pct))}`}>
                    {`Le sigue llegando por ${sigueLlegando(datos.r.tiene, destino?.etiquetaId ?? null)
                      .map((t) => t.nombre)
                      .join(" y ")}: gana el mayor.`}
                  </Aviso>
                )}
                {quedaBajoCosto(datos.r.prenda, pct) && (
                  <Aviso tono="atencion" chico titulo="Queda por debajo del costo">
                    Se puede poner igual, pero se pierde plata en cada una.
                  </Aviso>
                )}
              </div>
            )}

            {datos.r.esLider && (
              <div>
                <Interruptor activo={todas} onActivo={setTodas} etiqueta="En todas las tiendas" />
              </div>
            )}

            <CampoGuiado id="responsable" guia={guia}>
              <div>
                <ComboResponsable control={responsable} deshabilitado={guardando !== null} />
              </div>
            </CampoGuiado>

            <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
              <PieGuia guia={guia} listo="Listo para poner el %." />
              <PieAcciones
                className="ml-auto"
                izquierda={
                  hayQueQuitar(datos.r.tiene) ? (
                    <Boton
                      type="button"
                      peso="peligro"
                      cargando={guardando === "quitar"}
                      textoCargando="Quitando…"
                      disabled={guardando !== null || alcance === null || !responsable.listo}
                      title={alcance === null ? "Elige primero a qué: solo esta prenda o todo el modelo." : (responsable.motivo ?? undefined)}
                      onClick={() => void guardar("quitar")}
                    >
                      Quitar el %
                    </Boton>
                  ) : undefined
                }
              >
                <Boton type="button" onClick={cerrar}>
                  Cancelar
                </Boton>
                <Boton
                  type="submit"
                  peso="primario"
                  cargando={guardando === "poner"}
                  disabled={guardando !== null}
                  confirma={guia}
                  title={responsable.motivo ?? guia.frase ?? undefined}
                  className={guia.claseConfirmar}
                >
                  {textoDelBoton(pct)}
                </Boton>
              </PieAcciones>
            </div>
          </form>
        )
      }
    </Modal>
  );
}
