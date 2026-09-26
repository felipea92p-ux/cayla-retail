"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { escucharDescargaModelo, prepararFotoPrenda, type FotoPreparada } from "@/lib/preparar-foto";

/* ====================================================================
   RevisarFotosModal · antes de que una foto entre al catálogo (ADR-0228)

   Cada foto se prepara en el navegador en dos versiones, las dos en
   1200×1500 sobre blanco: SIN FONDO (la prenda recortada, centrada y del
   mismo tamaño que todas) y CON FONDO (la foto entera, encuadrada). Quien
   sube la foto ve el resultado y elige, porque el recortador (MODNet) a
   veces muerde una manga o un gancho: una foto de catálogo mordida se ve
   peor que una con fondo, y eso solo lo decide alguien mirándola.

   La elección nace en «sin fondo» cuando el recorte encontró la prenda y en
   «con fondo» cuando no. Una foto que no se pudo leer no se usa.

   Actualización del 2026-09-26 (tarde): si la foto salió apagada, cada
   versión trae además la LUZ CORREGIDA (`foto-luz.ts`: el tono no cambia) y
   nace elegida; «Luz original» la deja como llegó. Y un desplegable con
   cuatro consejos para tomar la foto, porque la mayor parte de la calidad
   —arrugas, gancho, etiqueta, cómo cae la prenda— se decide al tomarla, y
   eso ningún programa lo arregla sin inventar.
   ==================================================================== */

export type Fuente = { clave: string; etiqueta: string; blob: Blob };
export type Eleccion = "sinFondo" | "conFondo";

/** Qué foto sube según lo elegido: fondo y luz. */
function fotoElegida(p: FotoPreparada, eleccion: Eleccion, luz: boolean): Blob {
  const juego = luz && p.conLuz ? p.conLuz : p;
  return eleccion === "sinFondo" && juego.sinFondo ? juego.sinFondo : juego.conFondo;
}

const CONSEJOS_FOTO = [
  "Plancha o vaporiza la prenda: las arrugas no se pueden quitar después.",
  "Sin etiqueta de precio ni gancho a la vista.",
  "En maniquí, o extendida sobre algo blanco y liso, con las mangas acomodadas.",
  "Luz de ventana de frente, de día y sin flash. Evita las sombras de costado.",
];
export type FotoElegida = { clave: string; foto: Blob; original: Blob };

type Item = {
  fuente: Fuente;
  estado: "esperando" | "procesando" | "listo" | "error";
  preparada: FotoPreparada | null;
  /** Vistas previas (blob:). Se crean y se liberan en el mismo efecto: creadas en el estado inicial, el doble montaje
   *  de React las liberaba y la miniatura «Antes» salía rota. */
  vistas: { antes: string | null; sinFondo: string | null; conFondo: string | null; sinFondoLuz: string | null; conFondoLuz: string | null };
  /** `null` = todavía no hay versiones para elegir, o la imagen no se pudo leer (no se usa). */
  eleccion: Eleccion | null;
  /** ¿Va con la luz corregida? Nace en `true` cuando hay corrección (la foto estaba apagada). */
  luz: boolean;
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
      vistas: { antes: null, sinFondo: null, conFondo: null, sinFondoLuz: null, conFondoLuz: null },
      eleccion: null,
      luz: false,
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
          const sinFondoLuz = p.conLuz?.sinFondo ? vista(p.conLuz.sinFondo) : null;
          const conFondoLuz = p.conLuz ? vista(p.conLuz.conFondo) : null;
          setItems((prev) =>
            prev.map((it, n) =>
              n === i
                ? {
                    ...it,
                    estado: "listo",
                    preparada: p,
                    vistas: { ...it.vistas, sinFondo, conFondo, sinFondoLuz, conFondoLuz },
                    eleccion: p.sinFondo ? "sinFondo" : "conFondo",
                    luz: p.conLuz !== null,
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

  function elegirLuz(clave: string, luz: boolean) {
    setItems((prev) => prev.map((it) => (it.fuente.clave === clave ? { ...it, luz } : it)));
  }

  function elegirTodas(eleccion: "sinFondo" | "conFondo") {
    // «Todas sin fondo» solo cambia las que tienen recorte: a una sin recorte no se le inventa uno.
    setItems((prev) => prev.map((it) => (it.estado !== "listo" || (eleccion === "sinFondo" && !it.preparada?.sinFondo) ? it : { ...it, eleccion })));
  }

  function confirmar(cerrar: () => void) {
    const elegidas: FotoElegida[] = usadas.map((it) => ({
      clave: it.fuente.clave,
      foto: fotoElegida(it.preparada!, it.eleccion!, it.luz),
      original: it.preparada!.original,
    }));
    onListo(elegidas, cerrar);
  }

  const hechas = items.filter((it) => it.estado === "listo" || it.estado === "error").length;

  return (
    <Modal
      titulo={titulo}
      subtitulo="Todas quedan del mismo tamaño, sobre blanco. Elige en cada una si va sin fondo o con su fondo, y si la luz va corregida."
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

          <details className="nota-cayla text-[13px]">
            <summary className="cursor-pointer font-medium text-tinta">Cómo tomar una buena foto</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {CONSEJOS_FOTO.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </details>

          <ul className="grid max-h-[62vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4" data-sin-cascada>
            {items.map((it) => (
              <TarjetaRevision
                key={it.fuente.clave}
                item={it}
                deshabilitado={guardando}
                onElegir={(e) => elegir(it.fuente.clave, e)}
                onLuz={(l) => elegirLuz(it.fuente.clave, l)}
              />
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
  onLuz,
}: {
  item: Item;
  deshabilitado: boolean;
  onElegir: (e: Eleccion) => void;
  onLuz: (luz: boolean) => void;
}) {
  const { vistas, eleccion, estado, preparada, luz } = item;
  const conLuz = luz && preparada?.conLuz;
  const grande =
    eleccion === "sinFondo" ? (conLuz ? vistas.sinFondoLuz : vistas.sinFondo) : conLuz ? vistas.conFondoLuz : vistas.conFondo;
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
      {estado === "listo" && preparada?.conLuz && (
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Luz de ${item.fuente.etiqueta}`}>
          {[true, false].map((l) => (
            <button
              key={String(l)}
              type="button"
              role="radio"
              aria-checked={luz === l}
              data-activa={luz === l}
              disabled={deshabilitado}
              onClick={() => onLuz(l)}
              className="pildora-cayla !px-2.5 !py-1 !text-[11.5px]"
            >
              {l ? "Luz corregida" : "Luz original"}
            </button>
          ))}
        </div>
      )}
      {item.error && <p className="text-[11.5px] leading-snug text-taupe">{item.error}</p>}
    </li>
  );
}
