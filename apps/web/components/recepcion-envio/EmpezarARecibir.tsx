"use client";

import { useEffect, useRef, useState } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { ArrowRight, MessageCircle, Package } from "lucide-react";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { BaldosaCategoria, CajaFardo } from "@/components/recepcion-conteo/piezas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { esFalloDeRed, esVersionCambiada, traducirError } from "@/lib/error-escritura";
import type { ControlResponsable } from "@/lib/useResponsable";
import { abrirDespacho } from "@/lib/recepcion-envio-acciones";
import { AVISO_DE_CORTE_APERTURA, mensajeDeLaRecepcion, ordenesDelEnvio, proveedoresDelEnvio, sugiereRecargarRecepcion, type DetalleEnvio, type ResultadoApertura } from "@/lib/recepcion-envio-reglas";
import { LoQueTrae } from "./PiezasEnvio";
import { VienenFardos } from "./VienenFardos";

// El envío llegó a la tienda pero todavía va «en camino» en el sistema (ADR-0362, fase 4): un solo botón, «Empezar a recibir»
// (`abrir_despacho`; entre ADR-0393 y 2026-10-26 la cara por categoría lo llamó «Abrir el fardo», ver DetalleEnvioPorRecibir). Abrirlo es el primer paso: desde ahí la compradora ya no lo puede anular y se cuenta lo que llegó. Antes se lee lo que
// trae. Firma quien recibe (el combo «Responsable»); si ya estaba abierto, la base devuelve lo mismo sin tocar nada.

export function EmpezarARecibir({
  detalle,
  sede,
  responsable,
  porCategoria = false,
  onAbierto,
}: {
  detalle: DetalleEnvio;
  sede: string;
  responsable: ControlResponsable;
  /** ADR-0393: se cuenta por categoría y lo demás puede quedar para después (la fase 4 contaba talla por talla). */
  porCategoria?: boolean;
  onAbierto: (r: ResultadoApertura | null) => void;
}) {
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<{ texto: string; recargar: boolean } | null>(null);
  const enVuelo = useRef(false);
  const avisoError = useRef<HTMLDivElement>(null);
  const guia = useGuiaCampos([{ id: "responsable", nombre: "Quién recibe", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién recibe." }], { enModal: false });

  useEffect(() => {
    if (error) avisoError.current?.focus();
  }, [error]);

  async function abrir() {
    if (abriendo || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      guia.ir("responsable");
      return;
    }
    enVuelo.current = true;
    try {
      setAbriendo(true);
      setError(null);
      const { resultado, error: falla } = await abrirDespacho({ p_despacho_id: detalle.id, p_version: detalle.version }, responsable.firma());
      // Abrir es el primer paso de la recepción: el éxito no vacía el combo (se sigue recibiendo con la misma persona).
      if (falla) responsable.despues(falla);
      if (falla) {
        setAbriendo(false);
        if (esFalloDeRed(falla)) setError({ texto: AVISO_DE_CORTE_APERTURA, recargar: false });
        // Los avisos de esta fase vienen en palabras de tienda (también la decisión 17: quien firma hizo una de las órdenes).
        else setError({ texto: mensajeDeLaRecepcion(falla) ?? traducirError(falla, "empezar a recibir el envío"), recargar: esVersionCambiada(falla) || sugiereRecargarRecepcion(falla.message) });
        return;
      }
      onAbierto(resultado);
    } finally {
      enVuelo.current = false;
    }
  }

  const errorDeApertura = error && (
    <Aviso ref={avisoError} enfocable tono="error" titulo="No se pudo empezar a recibir el envío" accion={error.recargar ? <Boton type="button" onClick={() => window.location.reload()}>Recargar</Boton> : undefined}>
      {error.texto}
    </Aviso>
  );

  // ADR-0393, la maqueta A: el fardo en su tarjeta —la caja, lo que trae con el ícono de cada categoría, lo que dijeron en total— y, al
  // costado, la salida para lo que llegó sin aviso. Mismo botón, misma firma y misma base que la fase 4.
  if (porCategoria) {
    const proveedores = proveedoresDelEnvio(detalle);
    const ordenes = ordenesDelEnvio(detalle);
    const cuando = detalle.despachadoEn ? diaYHoraLima(detalle.despachadoEn) : null;
    const categorias = new Set(detalle.lineas.map((l) => l.categoria?.id ?? l.id)).size;
    return (
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <article className="card-cayla grid gap-6 overflow-hidden p-5 sm:grid-cols-[200px_minmax(0,1fr)] sm:p-6">
          <div className="grid place-items-start justify-center pt-1.5">
            <CajaFardo />
          </div>
          <div className="min-w-0 space-y-3">
            <div>
              <p className="label-cayla text-[11px] text-taupe">En camino hacia {sede}</p>
              <TituloSeccion dato={<Chip tono="pizarra">En camino</Chip>}>Envío {detalle.numero}</TituloSeccion>
              <p className="mt-1 text-sm text-taupe">
                {[
                  detalle.despachadoPor ? `Lo despachó ${detalle.despachadoPor}` : null,
                  cuando ? `${cuando.dia} ${cuando.hora}` : null,
                  detalle.numeroGuia ? `guía ${detalle.numeroGuia}` : null,
                  ordenes.join(", ") || null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <ul data-guia="recepcion.trae" className="space-y-1.5" aria-label="Lo que trae">
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
              <p data-guia="recepcion.cifra" className="text-[14.5px] text-tinta">
                Dijeron <b className="font-display text-[22px] tabular-nums">{detalle.enviado.toLocaleString("es-PE")}</b> {detalle.enviado === 1 ? "prenda" : "prendas"} ·{" "}
                {categorias} {categorias === 1 ? "categoría" : "categorías"} · {proveedores.length} {proveedores.length === 1 ? "proveedor" : "proveedores"} ·{" "}
                <span className="text-taupe">todo viene sin etiqueta</span>
              </p>
            </div>
            {detalle.nota && <p className="nota-cayla">Nota de quien lo envió: {detalle.nota}</p>}
            <div data-guia="recepcion.empezar" className="space-y-3 pt-1">
              <CampoGuiado id="responsable" guia={guia} titulo="Quién recibe" className="max-w-sm">
                <ComboResponsable control={responsable} deshabilitado={abriendo} />
              </CampoGuiado>
              <PieGuia guia={guia} listo="Todo listo: empieza a recibir." />
              {errorDeApertura}
              <Boton type="button" peso="primario" cargando={abriendo} textoCargando="Empezando…" onClick={() => void abrir()} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                <span className="inline-flex items-center gap-2">
                  <Package aria-hidden className="h-4 w-4" />
                  Empezar a recibir
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </span>
              </Boton>
              <p className="text-xs text-taupe">
                Desde que empiezas, la compra ya no se puede anular. Puedes recibirla por partes: lo que cuentes queda guardado y sigues cuando quieras.
              </p>
            </div>
          </div>
        </article>
        <aside data-guia="recepcion.otro-sin-aviso" className="card-cayla space-y-2 p-5">
          <TituloSeccion nivel={3}>¿Llegó algo que no está aquí?</TituloSeccion>
          <p className="text-[13.5px] text-taupe">
            Si viene <b className="text-tinta">dentro de este envío</b>, empieza a recibirlo igual: al contar lo sumas con «+ Agregar categoría».
          </p>
          <p className="text-[13.5px] text-taupe">
            Si es <b className="text-tinta">otro paquete</b> que vino sin aviso de Compras (por WhatsApp, o directo del proveedor), se recibe aparte: cuentas lo mismo, solo que sin con qué comparar.
          </p>
          <BotonEnlace href="/recibir#sin-aviso" peso="fantasma">
            <span className="inline-flex items-center gap-2">
              <MessageCircle aria-hidden className="h-4 w-4" />
              Recibir sin aviso
            </span>
          </BotonEnlace>
          <p className="pt-1 text-xs text-taupe">
            Lo que manda otra sede de CAYLA no entra por aquí: se recibe en <b className="text-tinta">Traslados</b>.
          </p>
        </aside>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section data-guia="recepcion.trae" className="card-cayla space-y-3 p-4 sm:p-5" aria-label="Lo que trae">
        <TituloSeccion
          dato={
            <>
              {detalle.numeroGuia ? `Guía ${detalle.numeroGuia} · ` : ""}
              {detalle.despachadoPor ? `lo envió ${detalle.despachadoPor}` : "en camino"}
            </>
          }
        >
          Lo que trae
        </TituloSeccion>
        <LoQueTrae detalle={detalle} />
        {detalle.nota && <p className="nota-cayla">Nota de quien lo envió: {detalle.nota}</p>}
      </section>

      <section data-guia="recepcion.empezar" className="space-y-3" aria-label="Empezar a recibir">
        <p className="max-w-2xl text-sm text-tinta/75">
          Ábrelo cuando la caja esté en {sede}. Desde ese momento la compra ya no se puede anular y cuentas lo que llegó,{" "}
          {porCategoria ? "categoría por categoría: qué prendas son puede quedar para después." : "talla por talla y color por color."}
        </p>
        <CampoGuiado id="responsable" guia={guia} titulo="Quién recibe" className="max-w-sm">
          <ComboResponsable control={responsable} deshabilitado={abriendo} />
        </CampoGuiado>
        <PieGuia guia={guia} listo="Todo listo para empezar." />
        {errorDeApertura}
        <div className="flex justify-end">
          <Boton textoCargando="Abriendo…" type="button" peso="primario" cargando={abriendo} onClick={() => void abrir()} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
            Empezar a recibir
          </Boton>
        </div>
      </section>
    </div>
  );
}
