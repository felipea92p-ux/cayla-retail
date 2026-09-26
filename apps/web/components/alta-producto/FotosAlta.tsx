"use client";

import { useRef, useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { objecionFotoElegida } from "@/lib/producto-fotos";
import { comoArchivo } from "@/lib/preparar-foto";
import { RevisarFotosModal, type FotoElegida } from "@/components/RevisarFotosModal";
import { Punto } from "@/components/alta-producto/ElegirColores";

// Las fotos del alta, POR COLOR, sin subir nada todavía (spike Nuevo producto, 2026-09-24).
//
// Por qué antes no se podía: la galería de la edición (`FotosProducto`) sube cada archivo al almacén apenas se elige.
// En el alta eso dejaba el archivo huérfano si la persona cancelaba el formulario, así que las fotos se habían dejado
// para después de crear. Felipe (2026-09-24): «cuando agrego un nuevo producto no puedo cargar imagen».
//
// Ahora el archivo se guarda en el NAVEGADOR (con una vista previa local, `URL.createObjectURL`) y recién se sube
// cuando la base ya creó el producto (`NuevoProductoForm.onSubmit`). Cancelar no deja nada en el almacén, y crear el
// producto sigue siendo una sola transacción: si una foto no sube, el producto ya existe y la pantalla de éxito dice
// cuál faltó (principio 9: se degrada, no pierde el producto).
//
// Desde el ADR-0220 cada foto pasa antes por la revisión (`RevisarFotosModal`): lo que queda acá ya es la foto
// preparada —1200×1500 sobre blanco, sin fondo o con su fondo— y su original, que se suben juntos al crear.

export type FotoPendiente = {
  clave: string;
  /** La foto preparada (encuadrada, con o sin fondo): la que se sube y se muestra. */
  archivo: File;
  /** La foto tal cual la tomaron, reducida: se guarda al lado para poder reprocesarla (ADR-0220). */
  original: Blob | null;
  /** URL local (blob:) solo para mostrarla; se libera al quitarla o al salir. */
  vista: string;
  colorCodigo: string | null;
};

export function FotosAlta({
  colores,
  fotos,
  onFotos,
  disabled = false,
}: {
  /** Los colores elegidos, en su orden: una casilla por color. */
  colores: { codigo: string; nombre: string; hex: string | null; familiaColor?: string | null }[];
  fotos: FotoPendiente[];
  onFotos: (f: FotoPendiente[]) => void;
  disabled?: boolean;
}) {
  // Las vistas previas NO se liberan al desmontar: el paso 3 se pliega al seguir y se vuelve a abrir con «Cambiar», y
  // las fotos tienen que seguir ahí. Las libera el formulario (al quitarlas, al subirlas o al quitar su color).

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

  // Sin colores, una sola casilla «General». Con colores, una por color y la general al final (fotos de detalle, etiqueta…).
  const casillas: { codigo: string | null; nombre: string; hex: string | null; familiaColor?: string | null }[] = [...colores, { codigo: null, nombre: colores.length ? "General" : "Fotos", hex: null }];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
        {casillas.map((c) => {
          const suyas = fotos.filter((f) => f.colorCodigo === c.codigo);
          return (
            <div key={c.codigo ?? "general"} className="rounded-xl border border-sand bg-crema p-2">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-tinta">
                {c.codigo && <Punto hex={c.hex} familia={c.familiaColor} />}
                <span className="min-w-0 truncate">{c.nombre}</span>
                {suyas.length > 0 && <span className="ml-auto shrink-0 tabular-nums text-taupe">{suyas.length}</span>}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suyas.map((f) => (
                  <div key={f.clave} className="group relative h-16 w-[3.25rem] overflow-hidden rounded-md border border-sand bg-hueso">
                    {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), next/image no la optimiza */}
                    <img src={f.vista} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => quitar(f.clave)}
                      disabled={disabled}
                      aria-label={`Quitar foto de ${c.nombre}`}
                      className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-crema/90 text-xs text-tinta opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <BotonFoto disabled={disabled} etiqueta={`Agregar foto de ${c.nombre}`} onArchivos={(a) => agregar(a, c.codigo)} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-taupe">
        JPG, PNG o WebP, hasta 25 MB. Cada foto sale del mismo tamaño, sobre blanco; antes de agregarla eliges si va sin fondo. Se suben al crear el producto; si cancelas, no se guarda nada. La primera del primer color queda de principal.
      </p>
      {porRevisar && (
        <RevisarFotosModal
          fuentes={porRevisar.archivos.map((a, i) => ({ clave: String(i), etiqueta: a.name, blob: a }))}
          onListo={(elegidas, cerrar) => {
            usar(elegidas, porRevisar.colorCodigo);
            cerrar();
          }}
          onClose={() => setPorRevisar(null)}
        />
      )}
    </div>
  );
}

function BotonFoto({ onArchivos, disabled, etiqueta }: { onArchivos: (f: File[]) => void; disabled: boolean; etiqueta: string }) {
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
        className="grid h-16 w-[3.25rem] place-items-center rounded-md border border-dashed border-tinta/25 text-lg text-taupe transition-colors hover:border-tinta/50 hover:text-tinta disabled:opacity-40"
      >
        +
      </button>
    </>
  );
}
