"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { avisar } from "@/components/ui/Avisos";
import { useEsperando } from "@/components/ui/Espera";
import { sistemaDelEquipo } from "@/lib/guia-impresion-reglas";
import {
  avisoDelAyudante,
  COMANDO_INSTALAR,
  documentoParaAyudante,
  estadoDelAyudante,
  resultadoDeImpresion,
  URL_AYUDANTE,
  type EstadoAyudante,
  type PiezaImpresa,
} from "@/lib/mac-etiquetas";

const sinSuscripcion = () => () => {};

/**
 * Mandar una hoja a la Brother (ADR-0180, ADR-0304): lo comparten las etiquetas de precio y los rótulos de anaquel (ADR-0365).
 *
 * En Windows (y en una Mac sin ayudante) es `window.print()`: `globals.css` oculta todo menos la hoja. En una Mac con el
 * ayudante, la hoja se clona tal cual se ve y se le manda por HTTP local; el ayudante la pasa a PDF y la imprime con el
 * papel exacto. `medida` es el papel que se le pide (`?medida=`, lista cerrada en `servidor.sh`); sin ella, el de la
 * etiqueta. `versionMinima`: un ayudante más viejo no conoce otra medida y se avisa que hay que actualizarlo.
 * `prepararCopia` ajusta la copia antes de mandarla (la etiqueta la fija en su forma A).
 */
export function useImpresionBrother({
  idHoja,
  total,
  pieza,
  detalleEspera,
  medida,
  versionMinima,
  prepararCopia,
}: {
  idHoja: string;
  total: number;
  pieza: PiezaImpresa;
  detalleEspera: string;
  medida?: string;
  versionMinima?: number;
  prepararCopia?: (copia: HTMLElement) => void;
}) {
  // El portal de la hoja necesita `document`: en el servidor (y al hidratar) no hay hoja; en el navegador, sí.
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  // En una Mac, Chrome entrega la hoja girada y la Brother la saca larga: se imprime por el ayudante local (ADR-0304).
  const esMac = montado && sistemaDelEquipo(navigator.userAgent, navigator.platform) === "mac";
  const [ayudante, setAyudante] = useState<EstadoAyudante>("comprobando");
  const [enviando, setEnviando] = useState(false);
  useEsperando(enviando, { etiqueta: "Un momento", titulo: "Imprimiendo", detalle: detalleEspera });
  useEffect(() => {
    if (!esMac) return;
    let vigente = true;
    fetch(`${URL_AYUDANTE}/estado`, { cache: "no-store", signal: AbortSignal.timeout(2500) })
      .then((r) => r.json())
      .then((j) => vigente && setAyudante(estadoDelAyudante(j, versionMinima)))
      .catch(() => vigente && setAyudante("sin-ayudante"));
    return () => {
      vigente = false;
    };
  }, [esMac, versionMinima]);
  const porAyudante = esMac && ayudante === "listo";

  const imprimirEnMac = async () => {
    const nodo = document.getElementById(idHoja);
    if (!nodo) return;
    const copia = nodo.cloneNode(true) as HTMLElement;
    prepararCopia?.(copia);
    const estilos = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style, link[rel="preload"][as="font"]'), (n) => n.outerHTML);
    const documento = documentoParaAyudante({
      estilos,
      base: `${location.origin}/`,
      clases: `${document.documentElement.className} ${document.body.className}`.trim(),
      hoja: copia.outerHTML,
    });
    setEnviando(true);
    let status: number | null = null;
    let cuerpo: unknown = null;
    try {
      const destino = medida ? `${URL_AYUDANTE}/imprimir?medida=${encodeURIComponent(medida)}` : `${URL_AYUDANTE}/imprimir`;
      const r = await fetch(destino, { method: "POST", headers: { "Content-Type": "text/html" }, body: documento });
      status = r.status;
      cuerpo = await r.json().catch(() => null);
    } catch {
      status = null;
    } finally {
      setEnviando(false);
    }
    const res = resultadoDeImpresion(status, cuerpo, total, pieza);
    if (res.ok) avisar.exito(res.texto);
    else avisar.error(res.texto, { detalle: res.detalle });
  };

  return {
    montado,
    porAyudante,
    enviando,
    /** Lo que muestra la pantalla si esta Mac no puede imprimir por el ayudante (`null` = puede, o no es una Mac). */
    avisoMac: esMac ? avisoDelAyudante(ayudante) : null,
    /** El aviso trae la línea de Terminal: falta instalarlo o hay que reinstalarlo para tener la versión nueva. */
    instalar: ayudante === "sin-ayudante" || ayudante === "desactualizado",
    imprimir: () => (porAyudante ? void imprimirEnMac() : window.print()),
  };
}

/** Una Mac que todavía no puede imprimir por el ayudante (ADR-0304): qué le falta y, si es el ayudante, la línea para instalarlo. */
export function AvisoAyudanteMac({ titulo, detalle, instalar, mientras }: { titulo: string; detalle: string; instalar: boolean; mientras: string }) {
  const copiar = () =>
    navigator.clipboard.writeText(COMANDO_INSTALAR).then(
      () => avisar.exito("Línea copiada", { detalle: "Pégala en Terminal y presiona Enter." }),
      () => avisar.error("No se pudo copiar", { detalle: "Selecciona la línea y cópiala con ⌘C." }),
    );
  return (
    <div role="status" className="nota-cayla space-y-2">
      <p>
        <b>{titulo}.</b> {detalle}
      </p>
      {instalar && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="select-all break-all rounded bg-papel px-2 py-1 font-mono text-xs text-tinta">{COMANDO_INSTALAR}</code>
          <button type="button" className="btn-cayla btn-secundario" onClick={copiar}>
            Copiar
          </button>
        </div>
      )}
      <p className="text-xs">{mientras}</p>
    </div>
  );
}
