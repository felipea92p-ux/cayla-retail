"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Camera } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Desplegable, type Opcion } from "@/components/ui/campos";
import { BotonFoto } from "@/components/alta-producto/FotosAlta";
import type { ColorAlta } from "@/lib/alta-producto";
import {
  comoPrincipal,
  conFotosNuevas,
  fotosDelColor,
  pasadaAColor,
  pendienteDeFoto,
  primeraEnSuColor,
  sePuedePonerPrimera,
  sinLaFoto,
  textoCuenta,
  textoEstadoColor,
  vistaDeFotos,
  type EstadoColor,
  type FotoLocal,
} from "@/lib/fotos-por-color-reglas";
import { PuntoColor } from "./piezas";
import { useSubirFotos } from "./useSubirFotos";

// La sección «Fotos por color» de la ficha de una prenda (ADR-0279; spike docs/maquetas/producto-fotos-por-color-2026-09/,
// versión C que eligió Felipe el 2026-09-29). Un rectángulo por cada color que la prenda vende: la portada de ese color, o
// —si no tiene foto— un rectángulo punteado que dice «Agregar foto de Beige». Tocar uno con fotos abre una hoja para ver,
// hacer principal, pasar de color o quitar cada una.
//
// Por qué así: antes esto era una galería suelta con un combo de los 71 colores bajo cada foto. Toda foto nacía SIN color
// (`colorCodigo: null`) y `fotoDeVariante` la muestra en todos los colores que no tengan la suya: quien subía 4 fotos sin tocar
// los combos dejaba cada color mostrando la misma prenda. Aquí la foto nace dentro del color desde el que se agrega, y el
// único combo que queda (pasarla de color) solo ofrece los colores de ESTA prenda. El hueco se ve: «3 de 4 colores con foto».
//
// Los colores llegan como los ve la ficha (con las correcciones pendientes ya aplicadas, `fotosComoSeVen`) y esta pieza solo
// devuelve la lista nueva; el anclaje al color de origen y el guardado siguen en ProductoForm. Las reglas (qué ve cada color,
// la principal, el orden) son de `lib/fotos-por-color-reglas.ts`.

/** Valor del combo «Pasar a…» para «Todos los colores» (los códigos de color son 3 mayúsculas: este no choca con ninguno). */
const TODOS = "todos-los-colores";

function nuevaClave(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function FotosPorColor({
  fotos,
  onFotos,
  guardadas,
  colores,
  vocabulario,
  nombreColor,
  disabled = false,
}: {
  /** Las fotos como se ven (cada una en el color que le toca tras las correcciones pendientes). */
  fotos: FotoLocal[];
  onFotos: (f: FotoLocal[]) => void;
  /** Lo que tiene la base, con las mismas mudanzas: lo que no está ahí, o cambió de color, se marca como sin guardar. */
  guardadas: readonly FotoLocal[];
  /** Los colores que la prenda vende hoy, en el orden de sus variantes. Vacío = la prenda no tiene colores. */
  colores: readonly string[];
  /** El vocabulario de colores (nombre, muestra): para pintar cada punto. */
  vocabulario: readonly ColorAlta[];
  nombreColor: (codigo: string | null) => string;
  disabled?: boolean;
}) {
  // La subida termina después de un `await`: sin esto, las fotos que se agregaran entre medio se perderían al pisar la lista.
  const fotosRef = useRef(fotos);
  useEffect(() => {
    fotosRef.current = fotos;
  }, [fotos]);
  const { elegir, ocupado, revision } = useSubirFotos({
    onSubidas: (nuevas) =>
      onFotos(conFotosNuevas(fotosRef.current, nuevas.map((n) => ({ clientKey: nuevaClave(), id: null, url: n.url, esPrincipal: false, colorCodigo: n.colorCodigo })))),
  });
  // Qué hoja está abierta: `undefined` = ninguna; `null` = la de «Todos los colores» (o de la prenda, si no tiene colores).
  const [viendo, setViendo] = useState<string | null | undefined>(undefined);

  const vista = vistaDeFotos(colores, fotos);
  const guardadasPorClave = useMemo(() => new Map(guardadas.map((f) => [f.clientKey, f.colorCodigo])), [guardadas]);
  const bloqueado = disabled || ocupado;
  const cuenta = textoCuenta(vista);
  // Lo más fuerte que tenga pendiente una tarjeta: una foto nueva pesa más que una que solo cambió de color.
  const pendienteDe = (delColor: FotoLocal[]) => {
    const p = delColor.map((f) => pendienteDeFoto(f, guardadasPorClave));
    return p.includes("nueva") ? "nueva" : p.includes("movida") ? "movida" : null;
  };
  const hexDe = (codigo: string) => vocabulario.find((c) => c.codigo === codigo)?.hex ?? null;
  const tituloGeneral = vista.general.sinColores ? "La prenda" : "Todos los colores";
  const puntoGeneral = <PuntoTodos hexes={vista.tarjetas.map((t) => hexDe(t.codigo))} />;

  // Los destinos de «Pasar a…»: solo los colores de esta prenda y «Todos los colores». Nunca el vocabulario entero.
  function opcionesPasar(actual: string | null): Opcion<string>[] {
    return [
      ...vista.tarjetas.filter((t) => t.codigo !== actual).map((t) => ({ valor: t.codigo, texto: nombreColor(t.codigo) })),
      ...(actual !== null ? [{ valor: TODOS, texto: vista.general.sinColores ? "La prenda (sin color)" : "Todos los colores" }] : []),
    ];
  }
  const pasar = (clientKey: string, destino: string) => onFotos(pasadaAColor(fotos, clientKey, destino === TODOS ? null : destino));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="label-cayla text-[11px] text-tinta/65">Fotos por color</h2>
        {cuenta && <p className="text-[12.5px] text-taupe">{cuenta}</p>}
      </div>
      <p className="max-w-[72ch] text-[13px] text-taupe">
        {vista.general.sinColores ? (
          <>Toca el rectángulo para <b className="font-semibold text-tinta">agregar la foto de la prenda</b>, o para ver, cambiar o quitar las que ya tiene.</>
        ) : (
          <>
            Un rectángulo por color. Toca el de un color para <b className="font-semibold text-tinta">agregar su foto</b>, o para ver, cambiar o quitar las que ya tiene.
            Con una alcanza; el color que no tenga la suya usa la de «Todos los colores».
          </>
        )}
      </p>

      <ul className="grid grid-cols-2 gap-x-3.5 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
        {vista.tarjetas.map((t) => (
          <li key={t.codigo}>
            <Tarjeta
              titulo={nombreColor(t.codigo)}
              punto={<PuntoColor codigo={t.codigo} colores={vocabulario} />}
              fotos={t.fotos}
              estado={t.estado}
              pendiente={pendienteDe(t.fotos)}
              textoVacio={`Agregar foto de ${nombreColor(t.codigo)}`}
              subVacio="JPG, PNG o WebP"
              bloqueado={bloqueado}
              onAbrir={() => setViendo(t.codigo)}
              onElegir={(archivos) => elegir(archivos, t.codigo)}
            />
          </li>
        ))}
        {vista.general.visible && (
          <li>
            <Tarjeta
              general
              titulo={tituloGeneral}
              punto={puntoGeneral}
              fotos={vista.general.fotos}
              estado={vista.general.fotos.length > 0 ? "con-fotos" : "sin-foto"}
              pendiente={pendienteDe(vista.general.fotos)}
              textoVacio={vista.general.sinColores ? "Agregar foto de la prenda" : "Foto para todos los colores"}
              subVacio={vista.general.sinColores ? "JPG, PNG o WebP" : "Opcional"}
              bloqueado={bloqueado}
              onAbrir={() => setViendo(null)}
              onElegir={(archivos) => elegir(archivos, null)}
            />
          </li>
        )}
      </ul>

      {vista.huerfanas.length > 0 && (
        <div className="space-y-3 rounded-xl border border-dashed border-ambar/60 bg-ambar/5 p-3.5">
          <p className="text-[13px] text-tinta">
            <b className="font-semibold text-ambar-profundo">
              {vista.huerfanas.length === 1 ? "1 foto es de un color sin variantes activas." : `${vista.huerfanas.length} fotos son de colores sin variantes activas.`}
            </b>{" "}
            Se guardan igual y vuelven a su tarjeta si ese color se activa. Pásala a otro color o quítala si ya no sirve.
          </p>
          {vista.huerfanas.map((f) => (
            <div key={f.clientKey} className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Miniatura foto={f} ancho="w-14" />
              <p className="min-w-0 flex-1 basis-32 text-[13px] text-tinta">
                Era de <b className="font-semibold">{nombreColor(f.colorCodigo)}</b>
              </p>
              <Desplegable
                forma="cajaBaja"
                className="w-52"
                valor=""
                onValor={(v) => v && pasar(f.clientKey, v)}
                opciones={opcionesPasar(f.colorCodigo)}
                marcador="Pasar a otro color…"
                etiquetaAccesible={`Pasar la foto de ${nombreColor(f.colorCodigo)} a otro color`}
                deshabilitado={bloqueado}
              />
              <button type="button" disabled={bloqueado} onClick={() => onFotos(sinLaFoto(fotos, f.clientKey))} className="btn-cayla btn-peligro text-[12.5px]">
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-tinta/45">JPG, PNG o WebP, hasta 25 MB. Cada foto sale del mismo tamaño, sobre blanco; antes de subirla eliges si va sin fondo.</p>

      {viendo !== undefined && (
        <HojaDeFotos
          titulo={viendo === null ? tituloGeneral : nombreColor(viendo)}
          general={viendo === null}
          sinColores={vista.general.sinColores}
          fotos={fotosDelColor(fotos, viendo)}
          todas={fotos}
          guardadasPorClave={guardadasPorClave}
          bloqueado={bloqueado}
          opcionesPasar={opcionesPasar(viendo)}
          onFotos={onFotos}
          onPasar={pasar}
          onElegir={(archivos) => elegir(archivos, viendo)}
          onClose={() => setViendo(undefined)}
        />
      )}
      {/* Fuera de la hoja: la revisión se abre encima, y si se cerrara la hoja mientras tanto no debe llevársela. */}
      {revision}
    </div>
  );
}

/** El punto de «Todos los colores»: los primeros colores de la prenda en un solo círculo. */
function PuntoTodos({ hexes }: { hexes: (string | null)[] }) {
  const cs = hexes.filter((h): h is string => !!h).slice(0, 3);
  const fondo = cs.length >= 2 ? `conic-gradient(${[...cs, cs[0]].join(", ")})` : (cs[0] ?? "transparent");
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-tinta/20" style={{ background: fondo }} />;
}

/** Una foto en su marco 4:5 (como salen todas: 1200×1500 sobre blanco). */
function Miniatura({ foto, ancho }: { foto: FotoLocal; ancho: string }) {
  return (
    <span className={`relative block aspect-[4/5] ${ancho} shrink-0 overflow-hidden rounded-md border border-sand bg-papel`}>
      <Image src={foto.url} alt="" fill sizes="120px" className="object-cover" unoptimized />
    </span>
  );
}

const INSIGNIA_PRINCIPAL = "label-cayla absolute left-2 top-2 rounded bg-rojo px-1.5 py-0.5 text-[9px] text-crema";
const INSIGNIA_NUEVA = "absolute right-2 top-2 rounded-full bg-ambar px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-papel";

/** El rectángulo de un color (o de «Todos los colores»): su portada con cuántas fotos tiene, o el vacío punteado para agregar la primera. */
function Tarjeta({
  titulo,
  punto,
  fotos,
  estado,
  general = false,
  pendiente,
  textoVacio,
  subVacio,
  bloqueado,
  onAbrir,
  onElegir,
}: {
  titulo: string;
  punto: ReactNode;
  /** Las de este color, la portada primero (`fotosDelColor`). */
  fotos: FotoLocal[];
  estado: EstadoColor;
  general?: boolean;
  pendiente: "nueva" | "movida" | null;
  /** Lo que dice el rectángulo vacío («Agregar foto de Beige») y su línea de abajo. */
  textoVacio: string;
  subVacio: string;
  bloqueado: boolean;
  onAbrir: () => void;
  onElegir: (archivos: File[]) => void;
}) {
  const portada = fotos[0];
  return (
    <div className="space-y-2">
      {portada ? (
        <button
          type="button"
          onClick={onAbrir}
          aria-label={`Ver o cambiar las fotos de ${titulo} (${fotos.length})`}
          className={`relative block aspect-[4/5] w-full overflow-hidden rounded-xl border bg-papel transition-colors hover:border-tinta/40 ${pendiente ? "border-ambar ring-1 ring-ambar" : "border-sand"}`}
        >
          <Image src={portada.url} alt="" fill sizes="220px" className="object-cover" unoptimized />
          {fotos.some((f) => f.esPrincipal) && <span className={INSIGNIA_PRINCIPAL}>Principal</span>}
          {pendiente && <span className={INSIGNIA_NUEVA}>{pendiente === "nueva" ? "Nueva" : "Movida"}</span>}
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-crema/95 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-tinta shadow-sm">
            <Camera aria-hidden className="h-3 w-3" strokeWidth={1.8} />
            {fotos.length}
          </span>
        </button>
      ) : (
        <BotonFoto
          onArchivos={onElegir}
          disabled={bloqueado}
          etiqueta={textoVacio}
          className={`grid aspect-[4/5] w-full place-content-center justify-items-center gap-2 rounded-xl border-[1.5px] border-dashed p-3 text-center text-tinta transition-colors hover:border-tinta disabled:opacity-50 ${
            general ? "border-tinta/25 hover:bg-hueso/30" : "border-taupe/55 bg-hueso/35 hover:bg-hueso/60"
          }`}
        >
          <Camera aria-hidden className="h-6 w-6" strokeWidth={1.4} />
          <span className="text-[12.5px] font-semibold leading-tight">{textoVacio}</span>
          <span className="text-[11.5px] font-normal text-taupe">{subVacio}</span>
        </BotonFoto>
      )}
      <div className="flex min-w-0 items-center gap-2 text-[13.5px] font-medium text-tinta">
        {punto}
        <span className="min-w-0 truncate">{titulo}</span>
        {(!general || fotos.length > 0) && (
          <small className={`ml-auto shrink-0 text-xs font-normal ${estado === "sin-foto" ? "font-medium text-ambar-profundo" : "text-taupe"}`}>{textoEstadoColor(estado, fotos.length)}</small>
        )}
      </div>
    </div>
  );
}

/** «Fotos de Celeste»: cada foto de ese color con lo que se puede hacer con ella, y una casilla para agregar otra. */
function HojaDeFotos({
  titulo,
  general,
  sinColores,
  fotos,
  todas,
  guardadasPorClave,
  bloqueado,
  opcionesPasar,
  onFotos,
  onPasar,
  onElegir,
  onClose,
}: {
  titulo: string;
  general: boolean;
  sinColores: boolean;
  /** Las de este color, la portada primero. */
  fotos: FotoLocal[];
  todas: FotoLocal[];
  guardadasPorClave: ReadonlyMap<string, string | null>;
  bloqueado: boolean;
  opcionesPasar: Opcion<string>[];
  onFotos: (f: FotoLocal[]) => void;
  onPasar: (clientKey: string, destino: string) => void;
  onElegir: (archivos: File[]) => void;
  onClose: () => void;
}) {
  const subtitulo = general
    ? sinColores
      ? "Estas fotos se ven en toda la prenda."
      : "Se ven en los colores que no tienen la suya. ¿Es de un solo color? Pásala a ese color."
    : "Con una foto alcanza. La principal es la que representa a toda la prenda en Productos.";
  return (
    <Modal titulo={`Fotos de ${general ? titulo.toLowerCase() : titulo}`} subtitulo={subtitulo} onClose={onClose} ancho="max-w-xl">
      {(cerrar) => (
        <div className="space-y-4">
          {fotos.length === 0 && <p className="text-sm text-taupe">Ya no quedan fotos aquí. Agrega otra con el rectángulo de abajo.</p>}
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
            {fotos.map((f) => {
              const pendiente = pendienteDeFoto(f, guardadasPorClave);
              return (
                <div key={f.clientKey} className="space-y-2">
                  <div className={`relative aspect-[4/5] overflow-hidden rounded-xl border bg-papel ${pendiente ? "border-ambar ring-1 ring-ambar" : "border-sand"}`}>
                    <Image src={f.url} alt={`Foto de ${titulo}`} fill sizes="200px" className="object-cover" unoptimized />
                    {f.esPrincipal && <span className={INSIGNIA_PRINCIPAL}>Principal</span>}
                    {pendiente && <span className={INSIGNIA_NUEVA}>{pendiente === "nueva" ? "Nueva" : "Movida"}</span>}
                  </div>
                  <div className="grid gap-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      {f.esPrincipal ? (
                        <p className="self-center text-center text-xs text-taupe">Es la principal</p>
                      ) : (
                        <button type="button" disabled={bloqueado} onClick={() => onFotos(comoPrincipal(todas, f.clientKey))} className="btn-cayla btn-sutil btn-chico">
                          Principal
                        </button>
                      )}
                      <button type="button" disabled={bloqueado} onClick={() => onFotos(sinLaFoto(todas, f.clientKey))} className="btn-cayla btn-peligro btn-chico">
                        Quitar
                      </button>
                    </div>
                    {sePuedePonerPrimera(todas, f.clientKey) && (
                      <button type="button" disabled={bloqueado} onClick={() => onFotos(primeraEnSuColor(todas, f.clientKey))} className="btn-cayla btn-enlace justify-self-start text-[12.5px]">
                        Ponerla primera
                      </button>
                    )}
                    {opcionesPasar.length > 0 && (
                      <Desplegable
                        forma="cajaBaja"
                        valor=""
                        onValor={(v) => v && onPasar(f.clientKey, v)}
                        opciones={opcionesPasar}
                        marcador="Pasar a otro color…"
                        etiquetaAccesible={`Pasar esta foto de ${titulo} a otro color`}
                        deshabilitado={bloqueado}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            <BotonFoto
              onArchivos={onElegir}
              disabled={bloqueado}
              etiqueta={`Agregar otra foto de ${titulo}`}
              className="grid aspect-[4/5] w-full place-content-center justify-items-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-tinta/25 p-3 text-center text-taupe transition-colors hover:border-tinta hover:text-tinta disabled:opacity-50"
            >
              <Camera aria-hidden className="h-5 w-5" strokeWidth={1.5} />
              <span className="text-xs font-semibold uppercase tracking-wide">Agregar otra</span>
            </BotonFoto>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={cerrar} className="btn-cayla btn-primario">
              Listo
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
