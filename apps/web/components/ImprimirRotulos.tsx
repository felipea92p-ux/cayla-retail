"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { SignpostBig, X } from "lucide-react";
import { Volver } from "@/components/ui/Volver";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { ComboBuscable, type OpcionCombo } from "@/components/ui/ComboBuscable";
import { Vacio } from "@/components/ui/Vacio";
import { RotuloAnaquel } from "@/components/RotuloAnaquel";
import { BotonGuiaImpresion } from "@/components/GuiaImpresion";
import { AvisoAyudanteMac, useImpresionBrother } from "@/components/impresion/useImpresionBrother";
import { MEDIDA_ROTULO, VERSION_CON_MEDIDA } from "@/lib/mac-etiquetas";
import { armarRotulos, copiasDeTexto, MAX_COPIAS, MAX_JUNTOS, MAX_MODELOS_EN_URL, urlRotulos, type ModeloRotulo } from "@/lib/rotulos-reglas";
import type { ModeloElegible } from "@/lib/rotulos";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Rótulos de anaquel (ADR-0365): los modelos elegidos, cómo salen (uno por modelo o todos juntos), cuántas copias de cada
 * uno y el botón que los manda a la Brother. Los modelos viven en la URL (`?productos=`): sumar o quitar uno vuelve a leer
 * sus colores y tallas del servidor. La hoja de impresión (`#rotulos-print`) va pegada a <body>, como la de etiquetas.
 */
export function ImprimirRotulos({
  modelos,
  catalogo,
  origen,
  volver,
  sede,
}: {
  modelos: ModeloRotulo[];
  catalogo: ModeloElegible[];
  /** Para armar el enlace al sumar o quitar un modelo sin perder adónde vuelve «Volver». */
  origen: { desde: "existencias" | "almacen" } | { productos: string | null };
  volver: { href: string; a: string };
  sede: string;
}) {
  const router = useRouter();
  const [juntar, setJuntar] = useState(false);
  const [copias, setCopias] = useState<Record<string, string>>({});
  const puedeJuntar = modelos.length >= 2 && modelos.length <= MAX_JUNTOS;
  const rotulos = useMemo(() => armarRotulos(modelos, juntar && puedeJuntar), [modelos, juntar, puedeJuntar]);
  const numeros = useMemo(() => Object.fromEntries(rotulos.map((r) => [r.clave, copiasDeTexto(copias[r.clave] ?? "1")])), [rotulos, copias]);
  const hoja = rotulos.flatMap((r) => Array.from({ length: numeros[r.clave] ?? 0 }, () => r));
  const total = hoja.length;

  const { montado, enviando, avisoMac, instalar, imprimir } = useImpresionBrother({
    idHoja: "rotulos-print",
    total,
    pieza: "rotulo",
    detalleEspera: "Preparando los rótulos para la Brother…",
    medida: MEDIDA_ROTULO,
    versionMinima: VERSION_CON_MEDIDA,
  });

  const ids = modelos.map((m) => m.productoId);
  const ir = (nuevos: string[]) => {
    const href = urlRotulos(nuevos, origen);
    if (href) router.replace(href, { scroll: false });
  };
  const elegidos = new Set(ids);
  const opciones: OpcionCombo<string>[] = catalogo
    .filter((m) => !elegidos.has(m.productoId))
    .map((m) => ({ valor: m.productoId, texto: m.referencia, detalle: [m.categoria, m.codigo].filter(Boolean).join(" · ") || undefined, claves: m.codigo ? [m.codigo] : undefined }));
  const lleno = ids.length >= MAX_MODELOS_EN_URL;

  const agregar = (
    <ComboBuscable
      etiquetaAccesible="Agregar un modelo al rótulo"
      valor=""
      onValor={(id) => ir([...ids, id])}
      opciones={opciones}
      marcador={lleno ? "Ya no caben más modelos" : "Agrega un modelo: nombre o código…"} // sugerir-fijo: busca en todo el catálogo, no depende de nada elegido
      caja
      className="w-full sm:max-w-sm"
    />
  );

  const botonImprimir = (
    <div className="flex flex-wrap items-center gap-2">
      <BotonGuiaImpresion />
      <button type="button" className="btn-cayla btn-primario" disabled={total === 0 || enviando} onClick={imprimir}>
        {total === 0 ? "Nada que imprimir" : enviando ? "Imprimiendo…" : `Imprimir ${plural(total, "rótulo", "rótulos")}`}
      </button>
    </div>
  );

  const cabecera = (
    <div>
      <Volver {...volver} className="mb-4" />
      <CabeceraPantalla
        sobretitulo={sede}
        titulo="Rótulos de anaquel"
        bajada="Para el anaquel o la bolsa: dice de lejos qué modelo hay ahí, con sus colores y tallas."
        acciones={modelos.length > 0 ? botonImprimir : undefined}
      />
    </div>
  );

  if (modelos.length === 0) {
    return (
      <div className="space-y-6">
        {cabecera}
        <Vacio
          icono={<SignpostBig />}
          titulo="¿Qué modelos van en este anaquel?"
          acciones={<div className="w-[min(24rem,calc(100vw-2rem))] text-left">{agregar}</div>}
        >
          Búscalos por nombre o código y aparece el rótulo listo para imprimir. También puedes marcarlos en Productos o en
          Existencias y tocar «Rótulo».
        </Vacio>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {cabecera}
      {avisoMac && (
        <AvisoAyudanteMac {...avisoMac} instalar={instalar} mientras="Mientras tanto, «Imprimir» usa el diálogo de Chrome: elige el papel «62 mm» de la Brother." />
      )}

      <section aria-label="Modelos del rótulo" className="space-y-4 rounded-xl border border-sand bg-papel p-4">
        <div className="flex flex-wrap items-center gap-2">
          {modelos.map((m) => (
            <span key={m.productoId} className="inline-flex items-center gap-1 rounded-full border border-sand bg-crema py-1 pl-3 pr-1 text-sm text-tinta">
              {m.referencia}
              <button
                type="button"
                onClick={() => ir(ids.filter((id) => id !== m.productoId))}
                aria-label={`Quitar ${m.referencia}`}
                className="grid h-6 w-6 place-items-center rounded-full text-taupe hover:bg-hueso hover:text-tinta"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        {!lleno && agregar}
        {modelos.length >= 2 && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-taupe">
            <span>Cómo salen:</span>
            <button type="button" className="pildora-cayla" aria-pressed={!juntar || !puedeJuntar} onClick={() => setJuntar(false)}>
              Un rótulo por modelo
            </button>
            <button type="button" className="pildora-cayla" aria-pressed={juntar && puedeJuntar} disabled={!puedeJuntar} onClick={() => setJuntar(true)}>
              Todos en un rótulo
            </button>
            {!puedeJuntar && <span className="text-xs">Juntos se leen hasta {MAX_JUNTOS} modelos.</span>}
          </div>
        )}
      </section>

      <section aria-label="Vista previa" className="space-y-3">
        <p className="text-sm text-taupe">Así salen, a tamaño real (100 × 62 mm):</p>
        <div className="flex flex-wrap gap-6">
          {rotulos.map((r) => (
            <figure key={r.clave} className="space-y-2">
              <div className="ring-1 ring-sand">
                <RotuloAnaquel rotulo={r} />
              </div>
              <figcaption className="flex items-center justify-end gap-2 text-sm text-taupe">
                <label htmlFor={`copias-${r.clave}`}>Copias</label>
                <input
                  id={`copias-${r.clave}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_COPIAS}
                  value={copias[r.clave] ?? "1"}
                  onChange={(ev) => setCopias((c) => ({ ...c, [r.clave]: ev.target.value }))}
                  className="caja-cayla h-9 w-20 px-2 text-right tabular-nums text-tinta"
                />
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <div className="nota-cayla flex flex-wrap items-center justify-between gap-3">
        <span>
          <b>Sale en el mismo rollo de 62 mm que las etiquetas, cortado cada 100 mm.</b> En Windows, elige el papel «62 mm» de la
          Brother; si sale corto, chico o girado, la guía lo muestra paso a paso.
        </span>
        <BotonGuiaImpresion className="btn-cayla btn-secundario shrink-0" />
      </div>

      {montado &&
        createPortal(
          <div id="rotulos-print" aria-hidden>
            {hoja.map((r, i) => (
              <div key={i} className="rot-hoja">
                <RotuloAnaquel rotulo={r} />
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
