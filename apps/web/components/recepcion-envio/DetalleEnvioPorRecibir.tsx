"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Package } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { BaldosaCategoria } from "@/components/recepcion-conteo/piezas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { VienenFardos } from "./VienenFardos";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { esFalloDeRed, esVersionCambiada, traducirError } from "@/lib/error-escritura";
import { useResponsable } from "@/lib/useResponsable";
import { abrirDespacho, leerDetalleDelEnvio } from "@/lib/recepcion-envio-acciones";
import {
  AVISO_DE_CORTE_APERTURA,
  mensajeDeLaRecepcion,
  ordenesDelEnvio,
  proveedoresDelEnvio,
  sugiereRecargarRecepcion,
  type DetalleEnvio,
  type EnvioPorAbrir,
} from "@/lib/recepcion-envio-reglas";

// «Detalle» de un envío que viene en camino (Felipe 2026-10-24): lo que antes era la primera etapa de «Recibir» —lo que trae, con su cantidad,
// y lo que dijeron en total— ahora es una hoja que se abre desde la lista. Al pie, «¿Vas a recepcionar una compra? Empieza a recibirla»:
// «Empezar a recibir» abre el envío (`abrir_despacho`, igual que antes) y salta directo a contar, la etapa 2. No es «Abrir el fardo» (Felipe
// 2026-10-26): un envío trae varios fardos y se reciben por partes —hoy uno, mañana otro—, así que el botón empieza la recepción del envío,
// no abre «el» fardo; arriba dice cuántos fardos vienen (`despachos.bultos`). Firma quien recibe (el combo «Responsable»). El detalle se
// lee al abrir la hoja, no con la lista: con muchos envíos, la puerta de Recibir no carga lo de todos.

export function DetalleEnvioPorRecibir({ envio, sede }: { envio: EnvioPorAbrir; sede: string }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <Boton type="button" peso="fantasma" onClick={() => setAbierta(true)} aria-label={`Ver el detalle de ${envio.numero}`}>
        Detalle
      </Boton>
      {abierta && <HojaDetalle envio={envio} sede={sede} onCerrar={() => setAbierta(false)} />}
    </>
  );
}

function HojaDetalle({ envio, sede, onCerrar }: { envio: EnvioPorAbrir; sede: string; onCerrar: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [detalle, setDetalle] = useState<DetalleEnvio | null>(null);
  const [cargando, setCargando] = useState(true);
  const [falloLectura, setFalloLectura] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<{ texto: string; recargar: boolean } | null>(null);
  const enVuelo = useRef(false);
  const avisoError = useRef<HTMLDivElement>(null);
  const guia = useGuiaCampos([{ id: "responsable", nombre: "Quién recibe", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién recibe." }]);

  useEffect(() => {
    let vivo = true;
    void leerDetalleDelEnvio(envio.id)
      .then(({ detalle: d, error: e }) => {
        if (!vivo) return;
        setDetalle(d);
        setFalloLectura(Boolean(e) || !d);
      })
      .catch(() => vivo && setFalloLectura(true))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [envio.id]);

  useEffect(() => {
    if (error) avisoError.current?.focus();
  }, [error]);

  async function abrir() {
    if (!detalle || abriendo || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      guia.ir("responsable");
      return;
    }
    enVuelo.current = true;
    try {
      setAbriendo(true);
      setError(null);
      const { resultado, error: falla } = await abrirDespacho({ p_despacho_id: detalle.id, p_version: detalle.version }, responsable.firma());
      if (falla) responsable.despues(falla);
      if (falla) {
        setAbriendo(false);
        if (esFalloDeRed(falla)) setError({ texto: AVISO_DE_CORTE_APERTURA, recargar: false });
        else setError({ texto: mensajeDeLaRecepcion(falla) ?? traducirError(falla, "empezar a recibir el envío"), recargar: esVersionCambiada(falla) || sugiereRecargarRecepcion(falla.message) });
        return;
      }
      avisar.exito(`${resultado?.numero ?? detalle.numero} abierto`, { detalle: "Cuenta lo que llegó." });
      // Abierto, el envío ya está en la etapa 2: contar por categoría.
      router.push(`/recibir/envio/${detalle.id}`);
    } finally {
      enVuelo.current = false;
    }
  }

  const proveedores = detalle ? proveedoresDelEnvio(detalle) : [];
  const ordenes = detalle ? ordenesDelEnvio(detalle) : [];
  const cuando = detalle?.despachadoEn ? diaYHoraLima(detalle.despachadoEn) : null;
  const categorias = detalle ? new Set(detalle.lineas.map((l) => l.categoria?.id ?? l.id)).size : 0;

  return (
    <Modal
      titulo={`Envío ${envio.numero}`}
      subtitulo={
        detalle
          ? [detalle.despachadoPor ? `Lo despachó ${detalle.despachadoPor}` : null, cuando ? `${cuando.dia} ${cuando.hora}` : null, detalle.numeroGuia ? `guía ${detalle.numeroGuia}` : null, ordenes.join(", ") || null]
              .filter(Boolean)
              .join(" · ")
          : `En camino hacia ${sede}.`
      }
      tamano="mediana"
      bloqueado={abriendo}
      onClose={onCerrar}
    >
      {(cerrar) => (
        <div className="space-y-4">
          {cargando && <p className="text-sm text-taupe">Leyendo lo que trae…</p>}
          {!cargando && falloLectura && (
            <Aviso tono="error" titulo="No se pudo leer el envío">
              Vuelve a intentarlo en un momento; si sigue, avísale a tu líder.
            </Aviso>
          )}
          {detalle && (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="label-cayla text-[11px] text-taupe">Lo que trae</p>
                <Chip tono="pizarra">En camino</Chip>
              </div>
              <ul className="space-y-1.5" aria-label="Lo que trae">
                {detalle.lineas.map((l) => (
                  <li key={l.id} className="flex items-center gap-2.5 rounded-xl bg-crema px-2.5 py-1.5">
                    <BaldosaCategoria categoria={l.categoria} tamano="chico" />
                    <b className="text-sm text-tinta">{l.categoria?.nombre ?? "Categoría"}</b>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-taupe">{[l.marca?.nombre, proveedores.length >= 2 ? l.proveedor?.nombre : null, l.descripcion].filter(Boolean).join(" · ")}</span>
                    <b className="text-[17px] tabular-nums text-tinta">{l.enviado.toLocaleString("es-PE")}</b>
                  </li>
                ))}
              </ul>
              <div className="space-y-1">
                <VienenFardos bultos={detalle.bultos} />
                <p className="text-[14.5px] text-tinta">
                  Dijeron <b className="font-display text-[22px] tabular-nums">{detalle.enviado.toLocaleString("es-PE")}</b> {detalle.enviado === 1 ? "prenda" : "prendas"} · {categorias}{" "}
                  {categorias === 1 ? "categoría" : "categorías"} · {proveedores.length} {proveedores.length === 1 ? "proveedor" : "proveedores"} ·{" "}
                  <span className="text-taupe">todo viene sin etiqueta</span>
                </p>
              </div>
              {detalle.nota && <p className="nota-cayla">Nota de quien lo envió: {detalle.nota}</p>}

              <div className="space-y-3 border-t border-sand pt-4">
                <p className="text-[14.5px] font-semibold text-tinta">¿Vas a recepcionar una compra? Empieza a recibirla.</p>
                <CampoGuiado id="responsable" guia={guia} titulo="Quién recibe">
                  <ComboResponsable control={responsable} deshabilitado={abriendo} />
                </CampoGuiado>
                <PieGuia guia={guia} listo="Todo listo: empieza a recibir." />
                {error && (
                  <Aviso ref={avisoError} enfocable tono="error" titulo="No se pudo empezar a recibir el envío" accion={error.recargar ? <Boton type="button" onClick={() => window.location.reload()}>Recargar</Boton> : undefined}>
                    {error.texto}
                  </Aviso>
                )}
                <div className="pie-acciones">
                  <Boton type="button" onClick={cerrar} disabled={abriendo}>
                    Cerrar {/* unificar-fijo: Felipe 2026-10-24 pidió «Cerrar» en el detalle del envío, que además empieza a recibir */}
                  </Boton>
                  <Boton type="button" peso="primario" cargando={abriendo} textoCargando="Empezando…" onClick={() => void abrir()} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                    <span className="inline-flex items-center gap-2">
                      <Package aria-hidden className="h-4 w-4" />
                      Empezar a recibir
                      <ArrowRight aria-hidden className="h-4 w-4" />
                    </span>
                  </Boton>
                </div>
                <p className="text-xs text-taupe">
                  Desde que empiezas, la compra ya no se puede anular. Puedes recibirla por partes: lo que cuentes queda guardado y sigues cuando quieras.
                </p>
              </div>
            </>
          )}
          {!detalle && !cargando && (
            <div className="pie-acciones">
              <Boton type="button" onClick={cerrar}>
                Cerrar {/* unificar-fijo: Felipe 2026-10-24 pidió «Cerrar» en el detalle del envío, que además empieza a recibir */}
              </Boton>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
