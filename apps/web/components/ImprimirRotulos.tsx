"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, Trash2, X } from "lucide-react";
import { Volver } from "@/components/ui/Volver";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { ComboBuscable, type OpcionCombo } from "@/components/ui/ComboBuscable";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { avisar } from "@/components/ui/Avisos";
import { RotuloAnaquel } from "@/components/RotuloAnaquel";
import { TiraBrother } from "@/components/rotulos/TiraBrother";
import { BotonGuiaImpresion } from "@/components/GuiaImpresion";
import { AvisoAyudanteMac, useImpresionBrother } from "@/components/impresion/useImpresionBrother";
import {
  armarRotulos,
  copiasDeTexto,
  MAX_JUNTOS,
  MAX_MODELOS_EN_URL,
  recorridoDeImpresion,
  urlRotulos,
  type ModeloRotulo,
} from "@/lib/rotulos-reglas";
import type { ModeloElegible } from "@/lib/rotulos";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
/** Un doble clic en una × no se lleva también la ficha que se corre a ocupar su lugar. */
const ENTRE_QUITAR_MS = 450;

/**
 * Rótulos de anaquel (ADR-0366; diseño A «Rollo», act. 2026-10-12): a la izquierda qué prendas van en el anaquel y cómo salen
 * (uno por prenda o todas en uno); a la derecha la Brother, que suelta la tira con los rótulos tal como van a salir, cada uno
 * con sus copias al costado (`TiraBrother`). El botón de la cabecera los manda a la Brother.
 *
 * Las prendas viven en el navegador: sumar o quitar una no vuelve al servidor (el catálogo ya trae la marca y las tallas de
 * cada modelo) y la URL (`?productos=`) se reescribe sin navegar, para que recargar la página no las pierda. Quitar no
 * pregunta —es una lista que se arma para imprimir, no toca la base— y se perdona: «Deshacer» en el aviso, también para
 * «Quitar todas» (Felipe, 2026-10-12). La hoja de impresión (`#rotulos-print`) va pegada a <body>, como la de etiquetas.
 */
export function ImprimirRotulos({
  modelos: iniciales,
  catalogo,
  origen,
  volver,
  sede,
}: {
  modelos: ModeloRotulo[];
  catalogo: ModeloElegible[];
  /** Para reescribir la URL al sumar o quitar una prenda sin perder adónde vuelve «Volver». */
  origen: { desde: "existencias" | "almacen" } | { productos: string | null };
  volver: { href: string; a: string };
  sede: string;
}) {
  const [modelos, setModelos] = useState(iniciales);
  const [juntar, setJuntar] = useState(false);
  // Las copias son de cada rótulo (su clave): sumar otra prenda no le borra las copias a las que ya estaban.
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
    // El mismo papel que la etiqueta (62 × 40,1): en la Mac va derecho, sin pedirle otra medida al ayudante.
    prepararCopia: (copia) => copia.setAttribute("data-modo", "girada"),
  });
  const modo = montado ? modoDeEtiquetas() : "girada";

  // La lista de prendas: se cambia aquí y la URL la sigue sin navegar (`replaceState` no le pide nada al servidor).
  const actuales = useRef(modelos);
  useEffect(() => {
    actuales.current = modelos;
  }, [modelos]);
  const ir = (nuevos: ModeloRotulo[]) => {
    actuales.current = nuevos;
    setModelos(nuevos);
    const href = urlRotulos(
      nuevos.map((m) => m.productoId),
      origen,
    );
    if (href) window.history.replaceState(null, "", href);
  };
  const porId = useMemo(() => new Map(catalogo.map((m) => [m.productoId, m])), [catalogo]);
  // El buscador es un combo que guarda lo elegido: aquí cada prenda elegida se suma y el campo vuelve a quedar en blanco, con el
  // cursor puesto para la siguiente (antes lo hacía rearmar la pantalla entera en cada prenda).
  const [vueltaBuscador, setVueltaBuscador] = useState(0);
  const sumar = (id: string) => {
    const m = porId.get(id);
    setVueltaBuscador((v) => v + 1);
    if (!m || actuales.current.some((x) => x.productoId === id)) return;
    ir([...actuales.current, { productoId: m.productoId, referencia: m.referencia, marca: m.marca, tallas: m.tallas }]);
  };

  // Quitar una prenda o todas: sin pregunta y con «Deshacer» (vuelven las quitadas, en su lugar, sin perder lo sumado después).
  const ultimoQuitar = useRef(0);
  const avisoQuitar = useRef<number | null>(null);
  const quitar = (ids: readonly string[], cuando: number) => {
    if (cuando - ultimoQuitar.current < ENTRE_QUITAR_MS) return;
    ultimoQuitar.current = cuando;
    const antes = actuales.current;
    const quitadas = antes.filter((m) => ids.includes(m.productoId));
    if (quitadas.length === 0) return;
    ir(antes.filter((m) => !ids.includes(m.productoId)));
    if (avisoQuitar.current !== null) avisar.cerrar(avisoQuitar.current);
    avisoQuitar.current = avisar.exito(quitadas.length === 1 ? `Quitaste ${quitadas[0].referencia}` : `Quitaste las ${quitadas.length} prendas`, {
      detalle: quitadas.length > 1 ? "Sus rótulos ya no se imprimen." : undefined,
      accion: {
        texto: "Deshacer",
        onClick: () => {
          const ahora = actuales.current;
          const siguen = (m: ModeloRotulo) => ahora.some((x) => x.productoId === m.productoId);
          // Las quitadas vuelven a su lugar de antes; lo que se sumó mientras tanto queda al final.
          ir([...antes.filter((m) => quitadas.includes(m) || siguen(m)), ...ahora.filter((x) => !antes.some((m) => m.productoId === x.productoId))]);
        },
      },
      duracion: 7000,
    });
  };

  // Imprimir: primero el cabezal recorre la tira (≈1 s, ver `recorridoDeImpresion`) y después va a la Brother.
  const [recorriendo, setRecorriendo] = useState<{ porRotulo: number } | null>(null);
  const temporizador = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    },
    [],
  );
  const mandar = () => {
    if (total === 0 || enviando || recorriendo) return;
    const salen = rotulos.filter((r) => (numeros[r.clave] ?? 0) > 0).length;
    const { porRotulo, total: ms } = recorridoDeImpresion(salen);
    if (ms === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      imprimir();
      return;
    }
    setRecorriendo({ porRotulo });
    temporizador.current = window.setTimeout(() => {
      temporizador.current = null;
      setRecorriendo(null);
      imprimir();
    }, ms);
  };

  const elegidos = new Set(modelos.map((m) => m.productoId));
  const opciones: OpcionCombo<string>[] = catalogo
    .filter((m) => !elegidos.has(m.productoId))
    .map((m) => ({
      valor: m.productoId,
      texto: m.referencia,
      detalle: [m.categoria, m.codigo, m.marca].filter(Boolean).join(" · ") || undefined,
      claves: m.codigo ? [m.codigo] : undefined,
    }));
  const lleno = modelos.length >= MAX_MODELOS_EN_URL;
  const vacia = modelos.length === 0;

  const acciones = vacia ? undefined : (
    // La guía interactiva enciende los dos botones juntos (ADR-0389): el mismo flex que pone la cabecera, para que se vean igual.
    <div data-guia="rotulos.imprimir" className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
      <BotonGuiaImpresion />
      <button type="button" className="btn-cayla btn-primario" disabled={total === 0 || enviando || recorriendo !== null} onClick={mandar}>
        <Printer aria-hidden className="h-4 w-4" />
        {total === 0 ? "Nada que imprimir" : recorriendo || enviando ? "Imprimiendo…" : `Imprimir ${plural(total, "rótulo", "rótulos")}`}
      </button>
    </div>
  );

  return (
    <div className="space-y-8">
      <EncabezadoPagina
        sede={sede}
        titulo="Rótulos de anaquel"
        subtitulo="Para el canto del anaquel o el frente de las bolsas: dice de lejos qué prenda hay ahí, con su marca y sus tallas."
        volver={<Volver {...volver} />}
        acciones={acciones}
      />

      {/* El rótulo es el protagonista (Formidable, 2026-10-09): desde 1024 px, la Brother a la derecha; en una columna, después de elegir. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] xl:gap-10">
        <div className="min-w-0 space-y-4">
          <section aria-labelledby="rotulos-titulo" className="space-y-4 rounded-2xl border border-sand bg-papel p-5 sm:p-6">
            <div className="space-y-1.5" data-guia={vacia ? "rotulos.vacio" : undefined}>
              <h2 id="rotulos-titulo" className={`font-display leading-tight text-tinta ${vacia ? "text-[32px]" : "text-[26px]"}`}>
                ¿Qué prendas van en este anaquel?
              </h2>
              {vacia && <p className="text-[14.5px] text-tinta/70">Búscalas por nombre o código y el rótulo sale en la Brother, listo para pegar.</p>}
            </div>

            {!vacia && (
              <div className="space-y-2.5" data-guia="rotulos.modelos">
                <div className="flex min-h-8 items-center justify-between gap-3">
                  <span className="label-cayla text-[11px] text-taupe">{plural(modelos.length, "prenda", "prendas")}</span>
                  {modelos.length >= 2 && (
                    <button
                      type="button"
                      className="btn-cayla btn-peligro !px-3 !py-1.5 text-[12.5px]"
                      onClick={(ev) =>
                        quitar(
                          modelos.map((m) => m.productoId),
                          ev.timeStamp,
                        )
                      }
                    >
                      <Trash2 aria-hidden className="h-3.5 w-3.5" />
                      Quitar todas
                    </button>
                  )}
                </div>
                <ul aria-label="Prendas del rótulo" className="flex flex-wrap items-center gap-2">
                  {modelos.map((m) => (
                    <li key={m.productoId} className="rot-ficha inline-flex max-w-full items-center gap-1 rounded-full border border-sand bg-crema py-1 pl-3 pr-1 text-sm text-tinta">
                      <span className="truncate">{m.referencia}</span>
                      <button
                        type="button"
                        onClick={(ev) => quitar([m.productoId], ev.timeStamp)}
                        aria-label={`Quitar ${m.referencia}`}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-taupe transition-colors hover:bg-hueso hover:text-tinta"
                      >
                        <X aria-hidden className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!lleno && (
              <div data-guia="rotulos.agregar">
                <ComboBuscable
                  key={vueltaBuscador}
                  autoFocus={vueltaBuscador > 0}
                  etiquetaAccesible="Sumar una prenda al rótulo"
                  valor=""
                  onValor={sumar}
                  opciones={opciones}
                  marcador="Busca por nombre o código" // sugerir-fijo: busca en todo el catálogo, no depende de nada elegido
                  caja
                  className="w-full"
                />
              </div>
            )}

            {modelos.length >= 2 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-guia="rotulos.como-salen">
                <span className="label-cayla text-[11px] text-taupe">Cómo salen</span>
                <SegmentoDeslizante
                  forma="modo"
                  etiqueta="Cómo salen los rótulos"
                  valor={juntar && puedeJuntar ? "juntas" : "una"}
                  onCambio={(c) => setJuntar(c === "juntas")}
                  opciones={[
                    { clave: "una", etiqueta: "Uno por prenda", guia: "rotulos.por-modelo" },
                    { clave: "juntas", etiqueta: "Todas en uno", guia: "rotulos.juntos", deshabilitada: !puedeJuntar, ayuda: puedeJuntar ? undefined : `Juntas se leen hasta ${MAX_JUNTOS} prendas` },
                  ]}
                />
                {!puedeJuntar && <span className="w-full text-xs text-tinta/70">Juntas se leen hasta {MAX_JUNTOS} prendas: con más, va uno por prenda.</span>}
              </div>
            )}

            <p className="border-t border-sand pt-3.5 text-[12.5px] text-tinta/70">
              También puedes marcarlas en <b className="font-semibold text-tinta">Productos</b> o en <b className="font-semibold text-tinta">Existencias</b> y tocar «Rótulo».
            </p>
          </section>

          {avisoMac && (
            <div data-guia="rotulos.aviso-mac">
              <AvisoAyudanteMac {...avisoMac} instalar={instalar} mientras="Mientras tanto, «Imprimir» usa el diálogo de Chrome con el mismo papel de las etiquetas." />
            </div>
          )}
        </div>

        <TiraBrother rotulos={rotulos} copias={copias} onCopias={(clave, texto) => setCopias((c) => ({ ...c, [clave]: texto }))} recorriendo={recorriendo} />
      </div>

      <p className="nota-cayla" data-guia="rotulos.nota">
        <b>Sale en el mismo papel que las etiquetas de precio</b> (62 × 40,1 mm): no hay que cambiar nada en la Brother. Si sale corto,
        chico o girado, la{" "}
        <BotonGuiaImpresion className="font-semibold underline underline-offset-2 transition-colors hover:text-rojo">guía de impresión</BotonGuiaImpresion> lo
        muestra paso a paso.
      </p>

      {montado &&
        createPortal(
          // La forma A o B la elige cada computadora en Etiquetas de precio y se recuerda: los rótulos van igual que sus etiquetas.
          <div id="rotulos-print" data-modo={modo} aria-hidden>
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

/** La forma con que esta computadora manda las etiquetas a la Brother (`cayla.etiquetas.modo`, se elige en Etiquetas de precio). */
function modoDeEtiquetas(): "girada" | "derecha" {
  try {
    return localStorage.getItem("cayla.etiquetas.modo") === "derecha" ? "derecha" : "girada";
  } catch {
    return "girada";
  }
}
