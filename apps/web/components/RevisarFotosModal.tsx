"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { escucharDescargaModelo, prepararFotoPrenda, type FotoPreparada } from "@/lib/preparar-foto";

/* ====================================================================
   RevisarFotosModal · antes de que una foto entre al catálogo (ADR-0220)

   Cada foto se prepara en el navegador en dos versiones, las dos en
   1200×1500 sobre blanco: SIN FONDO (la prenda recortada, centrada y del
   mismo tamaño que todas) y CON FONDO (la foto entera, encuadrada). Quien
   sube la foto ve el resultado y elige, porque el recortador (MODNet) a
   veces muerde una manga o un gancho: una foto de catálogo mordida se ve
   peor que una con fondo, y eso solo lo decide alguien mirándola.

   La elección nace en «sin fondo» cuando el recorte encontró la prenda y en
   «con fondo» cuando no. Una foto que no se pudo leer no se usa.
   ==================================================================== */

export type Fuente = { clave: string; etiqueta: string; blob: Blob };
export type Eleccion = "sinFondo" | "conFondo";
export type FotoElegida = { clave: string; foto: Blob; original: Blob };

type Item = {
  fuente: Fuente;
  estado: "esperando" | "procesando" | "listo" | "error";
  preparada: FotoPreparada | null;
  /** Vistas previas (blob:). Se crean y se liberan en el mismo efecto: creadas en el estado inicial, el doble montaje
   *  de React las liberaba y la miniatura «Antes» salía rota. */
  vistas: { antes: string | null; sinFondo: string | null; conFondo: string | null };
  /** `null` = todavía no hay versiones para elegir, o la imagen no se pudo leer (no se usa). */
  eleccion: Eleccion | null;
  error: string | null;
};

const TEXTO_ELECCION: Record<Eleccion, string> = { sinFondo: "Sin fondo", conFondo: "Con fondo" };

export function RevisarFotosModal({
  fuentes,
  onListo,
  onClose,
  titulo = "Revisa las fotos",
  textoConfirmar = (n: number) => (n === 1 ? "Usar esta foto" : `Usar ${n} fotos`),
  guardando = false,
}: {
  fuentes: Fuente[];
  /** Las fotos que se usan, en el orden en que llegaron. Las que no se pudieron leer no vienen. */
  onListo: (elegidas: FotoElegida[], cerrar: () => void) => void;
  onClose: () => void;
  titulo?: string;
  textoConfirmar?: (n: number) => string;
  guardando?: boolean;
}) {
  const [items, setItems] = useState<Item[]>(() =>
    fuentes.map((fuente) => ({
      fuente,
      estado: "esperando",
      preparada: null,
      vistas: { antes: null, sinFondo: null, conFondo: null },
      eleccion: null,
      error: null,
    })),
  );
  const [descarga, setDescarga] = useState<number | null>(null);
  // Una foto a la vez, en orden: el recortador es uno solo y así la primera se ve lista enseguida.
  useEffect(() => {
    let vivo = true;
    const creadas: string[] = [];
    const vista = (b: Blob) => {
      const u = URL.createObjectURL(b);
      creadas.push(u);
      return u;
    };
    const quitar = escucharDescargaModelo((p) => vivo && setDescarga(p >= 100 ? null : p));
    (async () => {
      for (let i = 0; i < fuentes.length && vivo; i++) {
        const antes = vista(fuentes[i].blob);
        setItems((prev) => prev.map((it, n) => (n === i ? { ...it, estado: "procesando", vistas: { ...it.vistas, antes } } : it)));
        try {
          const p = await prepararFotoPrenda(fuentes[i].blob);
          if (!vivo) return;
          const sinFondo = p.sinFondo ? vista(p.sinFondo) : null;
          const conFondo = vista(p.conFondo);
          setItems((prev) =>
            prev.map((it, n) =>
              n === i
                ? {
                    ...it,
                    estado: "listo",
                    preparada: p,
                    vistas: { ...it.vistas, sinFondo, conFondo },
                    eleccion: p.sinFondo ? "sinFondo" : "conFondo",
                    error: p.motivoSinRecorte,
                  }
                : it,
            ),
          );
        } catch (err) {
          if (!vivo) return;
          console.warn("[revisar-fotos]", err);
          setItems((prev) =>
            prev.map((it, n) => (n === i ? { ...it, estado: "error", eleccion: null, error: "No se pudo leer esta imagen." } : it)),
          );
        }
      }
      setDescarga(null);
    })();
    return () => {
      vivo = false;
      quitar();
      creadas.forEach((u) => URL.revokeObjectURL(u));
    };
    // `fuentes` llega una sola vez: el modal se monta con ellas y se desmonta al cerrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const procesando = items.some((it) => it.estado === "esperando" || it.estado === "procesando");
  const listas = items.filter((it) => it.estado === "listo");
  const usadas = listas.filter((it) => it.eleccion !== null);

  function elegir(clave: string, eleccion: Eleccion) {
    setItems((prev) => prev.map((it) => (it.fuente.clave === clave ? { ...it, eleccion } : it)));
  }

  function elegirTodas(eleccion: "sinFondo" | "conFondo") {
    // «Todas sin fondo» solo cambia las que tienen recorte: a una sin recorte no se le inventa uno.
    setItems((prev) => prev.map((it) => (it.estado !== "listo" || (eleccion === "sinFondo" && !it.preparada?.sinFondo) ? it : { ...it, eleccion })));
  }

  function confirmar(cerrar: () => void) {
    const elegidas: FotoElegida[] = usadas.map((it) => ({
      clave: it.fuente.clave,
      foto: it.eleccion === "sinFondo" && it.preparada!.sinFondo ? it.preparada!.sinFondo : it.preparada!.conFondo,
      original: it.preparada!.original,
    }));
    onListo(elegidas, cerrar);
  }

  const hechas = items.filter((it) => it.estado === "listo" || it.estado === "error").length;

  return (
    <Modal
      titulo={titulo}
      subtitulo="Todas quedan del mismo tamaño, sobre blanco. Elige en cada una si va sin fondo o con su fondo."
      ancho="max-w-5xl"
      bloqueado={guardando}
      onClose={onClose}
    >
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-taupe" aria-live="polite">
              {descarga !== null
                ? `Preparando el recortador (solo la primera vez en este equipo) · ${Math.round(descarga)} %`
                : procesando
                  ? `Quitando el fondo · ${hechas} de ${items.length}`
                  : `${items.length === 1 ? "Lista" : `Listas las ${items.length}`}.`}
            </p>
            {items.length > 1 && (
              <div className="flex gap-1.5">
                <button type="button" className="pildora-cayla" onClick={() => elegirTodas("sinFondo")} disabled={guardando}>
                  Todas sin fondo
                </button>
                <button type="button" className="pildora-cayla" onClick={() => elegirTodas("conFondo")} disabled={guardando}>
                  Todas con fondo
                </button>
              </div>
            )}
          </div>

          <ul className="grid max-h-[62vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4" data-sin-cascada>
            {items.map((it) => (
              <TarjetaRevision key={it.fuente.clave} item={it} deshabilitado={guardando} onElegir={(e) => elegir(it.fuente.clave, e)} />
            ))}
          </ul>

          <div className="flex gap-2">
            <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton peso="primario" className="flex-1" cargando={guardando} disabled={procesando || usadas.length === 0} onClick={() => confirmar(cerrar)}>
              {procesando ? "Procesando…" : usadas.length === 0 ? "Nada que cambiar" : textoConfirmar(usadas.length)}
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}

function TarjetaRevision({
  item,
  deshabilitado,
  onElegir,
}: {
  item: Item;
  deshabilitado: boolean;
  onElegir: (e: Eleccion) => void;
}) {
  const { vistas, eleccion, estado, preparada } = item;
  const grande = eleccion === "sinFondo" ? vistas.sinFondo : vistas.conFondo;
  const opciones: Eleccion[] = preparada?.sinFondo ? ["sinFondo", "conFondo"] : ["conFondo"];

  return (
    <li className="space-y-1.5">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md border border-sand bg-hueso">
        {estado === "listo" && grande ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), next/image no la optimiza
          <img src={grande} alt="" className="h-full w-full object-contain" />
        ) : estado === "error" ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
          vistas.antes && <img src={vistas.antes} alt="" className="h-full w-full object-cover opacity-40" />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-taupe">{estado === "procesando" ? "Quitando el fondo…" : "En cola"}</div>
        )}
        {estado === "listo" && vistas.antes && (
          <figure className="absolute bottom-1.5 left-1.5 w-1/4 overflow-hidden rounded border border-sand bg-papel" title="La foto como llegó">
            {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
            <img src={vistas.antes} alt="" className="aspect-[4/5] w-full object-cover" />
            <figcaption className="label-cayla bg-papel py-0.5 text-center text-[8px] text-taupe">Antes</figcaption>
          </figure>
        )}
      </div>
      <p className="truncate text-xs text-tinta" title={item.fuente.etiqueta}>
        {item.fuente.etiqueta}
      </p>
      {estado === "listo" && (
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Versión de ${item.fuente.etiqueta}`}>
          {opciones.map((o) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={eleccion === o}
              data-activa={eleccion === o}
              disabled={deshabilitado}
              onClick={() => onElegir(o)}
              className="pildora-cayla !px-2.5 !py-1 !text-[11.5px]"
            >
              {TEXTO_ELECCION[o]}
            </button>
          ))}
        </div>
      )}
      {item.error && <p className="text-[11.5px] leading-snug text-taupe">{item.error}</p>}
    </li>
  );
}
