"use client";

import { useRef, useState, type ReactNode } from "react";
import { avisar } from "@/components/ui/Avisos";
import { objecionFotoElegida } from "@/lib/producto-fotos";
import { comoArchivo } from "@/lib/preparar-foto";
import { RevisarFotosModal, type FotoElegida } from "@/components/RevisarFotosModal";

// Las fotos del alta, POR COLOR, sin subir nada todavía (spike Nuevo producto, 2026-09-24).
//
// Por qué antes no se podía: la edición (`FotosPorColor`, con `useSubirFotos`) sube cada archivo al almacén apenas se elige.
// En el alta eso dejaba el archivo huérfano si la persona cancelaba el formulario, así que las fotos se habían dejado
// para después de crear. Felipe (2026-09-24): «cuando agrego un nuevo producto no puedo cargar imagen».
//
// Ahora el archivo se guarda en el NAVEGADOR (con una vista previa local, `URL.createObjectURL`) y recién se sube
// cuando la base ya creó el producto (`NuevoProductoForm.onSubmit`). Cancelar no deja nada en el almacén, y crear el
// producto sigue siendo una sola transacción: si una foto no sube, el producto ya existe y la pantalla de éxito dice
// cuál faltó (principio 9: se degrada, no pierde el producto).
//
// Desde el ADR-0228 cada foto pasa antes por la revisión (`RevisarFotosModal`): lo que queda acá ya es la foto
// preparada —1200×1500 sobre blanco, sin fondo o con su fondo— y su original, que se suben juntos al crear.

export type FotoPendiente = {
  clave: string;
  /** La foto preparada (encuadrada, con o sin fondo): la que se sube y se muestra. */
  archivo: File;
  /** La foto tal cual la tomaron, reducida: se guarda al lado para poder reprocesarla (ADR-0228). */
  original: Blob | null;
  /** URL local (blob:) solo para mostrarla; se libera al quitarla o al salir. */
  vista: string;
  colorCodigo: string | null;
};

/** Agregar y quitar fotos pendientes, compartido por esta grilla y por la tabla de la prenda (`MatrizVariantes`, spike
 *  v2 2026-09-28: la foto va en la fila de su color). Cada archivo elegido pasa primero por `RevisarFotosModal`
 *  (ADR-0228); `revision` es ese modal, y quien use el hook lo pinta donde quiera. */
export function useFotosPendientes({ fotos, onFotos }: { fotos: FotoPendiente[]; onFotos: (f: FotoPendiente[]) => void }) {
  const [porRevisar, setPorRevisar] = useState<{ archivos: File[]; colorCodigo: string | null } | null>(null);
  function agregar(archivos: File[], colorCodigo: string | null) {
    const buenas: File[] = [];
    const malas: string[] = [];
    for (const archivo of archivos) {
      const objecion = objecionFotoElegida(archivo);
      if (objecion) malas.push(`${archivo.name}: ${objecion}`);
      else buenas.push(archivo);
    }
    if (malas.length) avisar.error(malas.length === 1 ? "Una foto no se puede usar" : `${malas.length} fotos no se pueden usar`, { detalle: malas.join(" · ") });
    if (buenas.length) setPorRevisar({ archivos: buenas, colorCodigo });
  }

  function usar(elegidas: FotoElegida[], colorCodigo: string | null) {
    const nuevas: FotoPendiente[] = elegidas.map((e) => {
      const archivo = comoArchivo(e.foto, "foto.jpg");
      return { clave: crypto.randomUUID(), archivo, original: e.original, vista: URL.createObjectURL(archivo), colorCodigo };
    });
    onFotos([...fotos, ...nuevas]);
  }

  function quitar(clave: string) {
    const f = fotos.find((x) => x.clave === clave);
    if (f) URL.revokeObjectURL(f.vista);
    onFotos(fotos.filter((x) => x.clave !== clave));
  }

  const revision = porRevisar ? (
    <RevisarFotosModal
      fuentes={porRevisar.archivos.map((a, i) => ({ clave: String(i), etiqueta: a.name, blob: a }))}
      onListo={(elegidas, cerrar) => {
        usar(elegidas, porRevisar.colorCodigo);
        cerrar();
      }}
      onClose={() => setPorRevisar(null)}
    />
  ) : null;

  return { agregar, quitar, revision };
}

/** El botón que abre el selector de archivos. Sin `children` es la casilla «+» de siempre; la tabla de la prenda le
 *  pasa su propio aspecto (cámara, miniatura) con `className` y `children`. */
export function BotonFoto({
  onArchivos,
  disabled,
  etiqueta,
  className = "grid h-16 w-[3.25rem] place-items-center rounded-md border border-dashed border-tinta/25 text-lg text-taupe transition-colors hover:border-tinta/50 hover:text-tinta disabled:opacity-40",
  children = "+",
}: {
  onArchivos: (f: File[]) => void;
  disabled: boolean;
  etiqueta: string;
  className?: string;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => {
          onArchivos(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled}
        aria-label={etiqueta}
        title={etiqueta}
        className={className}
      >
        {children}
      </button>
    </>
  );
}
