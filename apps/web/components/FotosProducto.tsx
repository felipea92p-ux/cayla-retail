"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { objecionFotoElegida, subirFotoProducto } from "@/lib/producto-fotos";
import { comoArchivo } from "@/lib/preparar-foto";
import { RevisarFotosModal, type FotoElegida } from "@/components/RevisarFotosModal";
import { ComboBuscable } from "@/components/ui/ComboBuscable";

/* ====================================================================
   FotosProducto · galería de un producto (ProductoForm.tsx, 20260915224500)

   Varias fotos, reordenables, una marcada principal. La foto sube al
   bucket público retail-productos-fotos EN CUANTO se elige el archivo
   (igual que AdjuntosCompra.tsx) — lo que se guarda con el formulario es
   la lista final (orden + cuál es principal) como `p_fotos` de
   catalogo_crear_producto/catalogo_actualizar_producto, no los bytes.

   Antes de subir, cada foto pasa por la revisión del ADR-0220
   (`RevisarFotosModal`): sale en 1200×1500 sobre blanco, sin fondo o con
   su fondo según se elija, y se guarda también su original.

   Reordenar es con flechas (‹ ›), no arrastre nativo: en una tablet de
   tienda el drag&drop HTML5 es poco confiable (touch), y una flecha se
   toca igual de rápido y se puede probar con un clic. Simplicidad
   radical (CLAUDE.md, principio 3) antes que una librería de DnD.
   ==================================================================== */

export type FotoLocal = {
  /** Estable para la key de React — no es el id de la fila (esa puede no existir todavía). */
  clientKey: string;
  /** Presente = ya existe una fila en producto_fotos. Ausente = subida en esta sesión. */
  id: string | null;
  url: string;
  esPrincipal: boolean;
  /** A qué color pertenece esta foto (20260917190000) — null = sin color
   *  todavía. Sin esto, el swatch interactivo de la Grilla (ADR-0077) no
   *  tiene con qué reemplazar el tinte por la foto real de ese color. */
  colorCodigo: string | null;
};

function nuevaClave(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function fotoLocalDesdeUrl(url: string): FotoLocal {
  return { clientKey: nuevaClave(), id: null, url, esPrincipal: false, colorCodigo: null };
}

function BotonElegirFotos({ onArchivos, disabled }: { onArchivos: (f: File[]) => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        className="sr-only"
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
        className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1 border border-dashed border-tinta/25 text-center text-tinta/55 transition-colors hover:border-rojo/50 hover:text-rojo disabled:opacity-50"
      >
        <span aria-hidden className="text-xl leading-none">
          +
        </span>
        <span className="label-cayla text-[10px]">{disabled ? "Subiendo…" : "Agregar foto"}</span>
      </button>
    </>
  );
}

export function FotosProducto({
  fotos,
  onFotos,
  colores,
  disabled = false,
}: {
  fotos: FotoLocal[];
  onFotos: (f: FotoLocal[]) => void;
  /** Para el selector "de qué color es esta foto" — mismas opciones que ya
   *  usa el color de cada variante, más abajo en el mismo formulario. */
  colores: { codigo: string; nombre: string }[];
  disabled?: boolean;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [porRevisar, setPorRevisar] = useState<File[] | null>(null);
  const opcionesColor = colores.map((c) => ({ valor: c.codigo, texto: c.nombre }));
  // La subida termina después de un `await`: sin esto, las fotos que se agregaran entre medio se perderían al pisar la lista.
  const fotosRef = useRef(fotos);
  useEffect(() => {
    fotosRef.current = fotos;
  }, [fotos]);

  function elegir(archivos: File[]) {
    const buenas: File[] = [];
    const malas: string[] = [];
    for (const a of archivos) {
      const objecion = objecionFotoElegida(a);
      if (objecion) malas.push(`${a.name}: ${objecion}`);
      else buenas.push(a);
    }
    if (malas.length) avisar.error(malas.length === 1 ? "Una foto no se puede usar" : `${malas.length} fotos no se pueden usar`, { detalle: malas.join(" · ") });
    if (buenas.length) setPorRevisar(buenas);
  }

  async function subir(elegidas: FotoElegida[], cerrar: () => void) {
    setSubiendo(true);
    const supabase = createClient();
    const nuevas: FotoLocal[] = [];
    const fallidos: string[] = [];
    for (const e of elegidas) {
      const nombre = porRevisar?.[Number(e.clave)]?.name ?? "foto";
      const r = await subirFotoProducto(supabase, comoArchivo(e.foto, "foto.jpg"), e.original);
      if ("error" in r) fallidos.push(`${nombre}: ${r.error}`);
      else nuevas.push({ clientKey: nuevaClave(), id: null, url: r.url, esPrincipal: false, colorCodigo: null });
    }
    setSubiendo(false);
    cerrar();
    if (fallidos.length) avisar.error(fallidos.length === 1 ? "Una foto no subió" : `${fallidos.length} fotos no subieron`, { detalle: fallidos.join(" · ") });
    if (nuevas.length) {
      const lista = [...fotosRef.current, ...nuevas];
      if (!lista.some((f) => f.esPrincipal) && lista.length > 0) lista[0] = { ...lista[0], esPrincipal: true };
      onFotos(lista);
    }
  }

  function marcarPrincipal(i: number) {
    onFotos(fotos.map((f, n) => ({ ...f, esPrincipal: n === i })));
  }

  function quitar(i: number) {
    const eraPrincipal = fotos[i]?.esPrincipal;
    const resto = fotos.filter((_, n) => n !== i);
    if (eraPrincipal && resto.length > 0 && !resto.some((f) => f.esPrincipal)) resto[0] = { ...resto[0], esPrincipal: true };
    onFotos(resto);
  }

  function mover(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= fotos.length) return;
    const lista = [...fotos];
    [lista[i], lista[j]] = [lista[j], lista[i]];
    onFotos(lista);
  }

  function cambiarColor(i: number, colorCodigo: string | null) {
    onFotos(fotos.map((f, n) => (n === i ? { ...f, colorCodigo } : f)));
  }

  return (
    <div className="space-y-2">
      <p className="label-cayla text-[11px] text-tinta/65">Fotos</p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {fotos.map((f, i) => (
          <div key={f.clientKey} className="space-y-1">
            <div className="group relative aspect-[4/5] w-full overflow-hidden border border-tinta/15 bg-sand/40">
              <Image src={f.url} alt="" fill sizes="180px" className="object-cover" unoptimized />
              {f.esPrincipal && <span className="label-cayla absolute top-1 left-1 bg-rojo px-1.5 py-0.5 text-[9px] text-crema">Principal</span>}
              <div className="absolute inset-0 flex flex-col items-center justify-between bg-tinta/0 p-1.5 opacity-0 transition-opacity group-hover:bg-tinta/45 group-hover:opacity-100">
                <div className="flex w-full items-center justify-between">
                  <button
                    type="button"
                    onClick={() => mover(i, -1)}
                    disabled={i === 0}
                    aria-label="Mover a la izquierda"
                    className="label-cayla bg-crema/90 px-1 py-0.5 text-[10px] text-tinta disabled:opacity-30"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(i, 1)}
                    disabled={i === fotos.length - 1}
                    aria-label="Mover a la derecha"
                    className="label-cayla bg-crema/90 px-1 py-0.5 text-[10px] text-tinta disabled:opacity-30"
                  >
                    ›
                  </button>
                </div>
                <div className="flex w-full flex-col gap-1">
                  {!f.esPrincipal && (
                    <button type="button" onClick={() => marcarPrincipal(i)} className="label-cayla w-full bg-crema/90 py-0.5 text-[9px] text-tinta">
                      Marcar principal
                    </button>
                  )}
                  <button type="button" onClick={() => quitar(i)} className="label-cayla w-full bg-crema/90 py-0.5 text-[9px] text-rojo-profundo">
                    Quitar
                  </button>
                </div>
              </div>
            </div>
            <ComboBuscable
              etiquetaAccesible={`Color de la foto ${i + 1}`}
              valor={f.colorCodigo ?? ""}
              onValor={(c) => cambiarColor(i, c || null)}
              opciones={opcionesColor}
              marcador="¿Qué color es?"
            />
          </div>
        ))}
        <BotonElegirFotos onArchivos={elegir} disabled={disabled || subiendo || porRevisar !== null} />
      </div>
      <p className="text-xs text-tinta/45">
        JPG, PNG o WebP, hasta 25 MB. Cada foto sale del mismo tamaño, sobre blanco; antes de subirla eliges si va sin fondo. La primera queda de principal si no marcas otra. Decile a cada foto qué color es — sin eso,
        pasar el mouse por ese color en la Grilla no va a mostrar esta foto.
      </p>
      {porRevisar && (
        <RevisarFotosModal
          fuentes={porRevisar.map((a, i) => ({ clave: String(i), etiqueta: a.name, blob: a }))}
          guardando={subiendo}
          onListo={(elegidas, cerrar) => void subir(elegidas, cerrar)}
          onClose={() => setPorRevisar(null)}
        />
      )}
    </div>
  );
}
