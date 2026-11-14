"use client";

import { Camera, Sparkles } from "lucide-react";
import { Globito } from "@/components/ui/Globito";
import { HiloEnEspera, Interruptor } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { BotonFoto, BotonQuitarFoto, type FotoPendiente } from "@/components/alta-producto/FotosAlta";
import type { CatalogoIAAlta } from "@/components/alta-producto/useCatalogoIAAlta";
import { textoFotosDeFila } from "@/lib/tabla-alta-reglas";

// Las fotos por color de una prenda que TODAVÍA no existe (2026-11-13): la miniatura de cada color con su estado («Preparando…», «Con IA ·
// Usar mi foto», «1 foto», «agrega su foto»), la hoja que las muestra en grande y la opción «Catálogo con IA». Las usa la tabla de Nuevo
// producto (`MatrizVariantes`); «Crear la prenda que llegó» de Recibir (`HojaPrenda`) usa solo el interruptor, porque sus fotos van en «Fotos
// y colores» (`FotosYColores`, ADR-0663) y la lista por color que tenía (`FotosDeLaPrenda`) repetía esas tarjetas. Las fotos viven en el
// navegador hasta que la prenda se crea; quien la crea las sube (`subirParDeCatalogo`, `subirFotoProducto`).

/** La opción «Catálogo con IA»: apagada de fábrica y recordada en el aparato (`useInterruptorIA`). */
export function InterruptorCatalogoIA({ catalogo }: { catalogo: CatalogoIAAlta }) {
  return (
    <Interruptor
      activo={catalogo.encendido}
      onActivo={catalogo.cambiarEncendido}
      etiqueta={
        <span className="inline-flex items-center gap-1.5 font-medium text-tinta">
          <Sparkles aria-hidden className="h-3.5 w-3.5" />
          Catálogo con IA
        </span>
      }
    />
  );
}

/** Lo que dice la fila de un color bajo su nombre: se prepara, es de IA (y se puede volver a la real), cuántas tiene, o que le falta. */
export function EstadoFotosDeFila({
  suyas,
  nombre,
  preparando,
  disabled,
  catalogo,
  onVer,
  usaLaGeneral,
}: {
  suyas: FotoPendiente[];
  nombre: string;
  preparando: boolean;
  disabled: boolean;
  catalogo: CatalogoIAAlta;
  onVer: () => void;
  /** Sin foto propia pero con la de «todos los colores»: lo dice en vez de «agrega su foto». */
  usaLaGeneral: boolean;
}) {
  const ultima = suyas[suyas.length - 1];
  if (preparando) return <small className="text-sm font-normal text-taupe">Preparando…</small>;
  if (ultima?.ia) {
    return (
      <span className="flex items-center gap-1.5">
        {ultima.ia.usar && <Chip tono="pizarra">Con IA</Chip>}
        <button type="button" disabled={disabled} onClick={() => catalogo.alternar(ultima.clave)} className="btn-enlace w-fit text-left text-sm font-normal">
          {ultima.ia.usar ? "Usar mi foto" : "Usar la de IA"}
        </button>
      </span>
    );
  }
  if (suyas.length > 0) {
    return (
      <button type="button" onClick={onVer} aria-label={`Ver o quitar las fotos de ${nombre}`} className="btn-enlace w-fit text-left text-sm font-normal">
        {textoFotosDeFila(suyas.length, false)}
      </button>
    );
  }
  return <small className="text-sm font-normal text-taupe">{textoFotosDeFila(0, usaLaGeneral)}</small>;
}

/** «Fotos de Verde agua»: cada foto en grande (una sola, más grande: ahí se juzga la de IA), con «Usar mi foto» y «Quitar». */
export function HojaFotosDeColor({
  nombre,
  fotos,
  cuando,
  dondeAgregar,
  disabled,
  catalogo,
  onQuitar,
  onClose,
}: {
  nombre: string;
  fotos: FotoPendiente[];
  /** «al crear el producto», «al crear la prenda». */
  cuando: string;
  /** Dónde se agrega otra: «en la tabla», «en su fila». */
  dondeAgregar: string;
  disabled: boolean;
  catalogo: CatalogoIAAlta;
  onQuitar: (clave: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      titulo={`Fotos de ${nombre}`}
      // En una fila con foto de IA, tocar la miniatura abre esta hoja (no agrega otra): ahí no se promete lo que no hace.
      subtitulo={fotos.some((f) => f.ia) ? `Se suben ${cuando}.` : `Se suben ${cuando}. Para agregar otra, toca la foto ${dondeAgregar}.`}
      onClose={onClose}
    >
      {(cerrar) => (
        <div className="space-y-4">
          {fotos.length === 0 ? (
            <p className="text-sm text-taupe">Ya no quedan fotos de {nombre}.</p>
          ) : (
            // Una sola foto se ve grande: es donde se juzga la de IA antes de decidir «Usar mi foto» (formidable, 2026-11-13).
            <div className={fotos.length === 1 ? "mx-auto grid max-w-[260px] grid-cols-1" : "grid grid-cols-3 gap-2.5"}>
              {fotos.map((f, i) => (
                <div key={f.clave} className="space-y-1.5">
                  <div className="aspect-[4/5] overflow-hidden rounded-md border border-sand bg-hueso">
                    {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), next/image no la optimiza */}
                    <img src={f.vista} alt={`Foto ${i + 1} de ${nombre}`} className="h-full w-full object-contain" />
                  </div>
                  {f.ia && (
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      {f.ia.usar && <Chip tono="pizarra">Con IA</Chip>}
                      <button type="button" disabled={disabled} onClick={() => catalogo.alternar(f.clave)} className="btn-cayla btn-enlace text-sm">
                        {f.ia.usar ? "Usar mi foto" : "Usar la de IA"}
                      </button>
                    </div>
                  )}
                  <button type="button" onClick={() => onQuitar(f.clave)} disabled={disabled} className="btn-cayla btn-sutil btn-chico w-full">
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
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

/** La foto de una fila: la miniatura (con el número si tiene varias; tocarla agrega otra) con su × para quitarla, o, si no tiene, la cámara. */
export function FotosDeFila({
  suyas,
  nombre,
  disabled,
  preparando,
  onVer,
  onArchivos,
  onQuitar,
}: {
  suyas: FotoPendiente[];
  nombre: string;
  disabled: boolean;
  /** La IA está preparando la foto de esta fila: la propia, atenuada, con el hilo de espera. */
  preparando: boolean;
  /** Ver las fotos de la fila en grande: la miniatura de una foto de IA lleva ahí (su resultado se juzga grande, no a 34 px). */
  onVer: () => void;
  onArchivos: (a: File[]) => void;
  onQuitar: () => void;
}) {
  if (preparando && suyas.length > 0) {
    const ultima = suyas[suyas.length - 1];
    return (
      <span aria-busy className="relative block h-[42px] w-[34px] shrink-0 overflow-hidden rounded-[5px] border border-sand bg-hueso">
        {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), next/image no la optimiza */}
        <img src={ultima.vista} alt="" className="h-full w-full object-cover opacity-40" />
        <HiloEnEspera />
      </span>
    );
  }
  if (suyas.length === 0) {
    return (
      <BotonFoto
        onArchivos={onArchivos}
        disabled={disabled}
        etiqueta={`Agregar foto de ${nombre}`}
        className="grid h-[42px] w-[34px] shrink-0 place-items-center rounded-[5px] border border-dashed border-tinta/25 text-taupe transition-colors hover:border-tinta/45 hover:text-tinta disabled:opacity-40"
      >
        <Camera aria-hidden className="h-4 w-4" />
      </BotonFoto>
    );
  }
  if (suyas.some((f) => f.ia)) {
    return (
      <span className="relative shrink-0">
        <button
          type="button"
          onClick={onVer}
          aria-label={`Ver en grande la foto de ${nombre}`}
          className="relative block h-[42px] w-[34px] rounded-[5px] border border-sand bg-hueso transition-colors hover:border-tinta/45"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), next/image no la optimiza */}
          <img src={suyas[0].vista} alt="" className="h-full w-full rounded-[4px] object-cover" />
          {suyas.length > 1 && <Globito n={suyas.length} esquina etiqueta="fotos" className="absolute -right-1.5 -top-1.5" />}
        </button>
        <BotonQuitarFoto
          onClick={onQuitar}
          disabled={disabled}
          etiqueta={suyas.length === 1 ? `Quitar la foto de ${nombre}` : `Ver o quitar las ${suyas.length} fotos de ${nombre}`}
          className="-left-1.5 -top-1.5"
        />
      </span>
    );
  }
  return (
    <span className="relative shrink-0">
      <BotonFoto
        onArchivos={onArchivos}
        disabled={disabled}
        etiqueta={`${suyas.length} foto${suyas.length === 1 ? "" : "s"} de ${nombre} · toca para agregar otra`}
        className="relative block h-[42px] w-[34px] rounded-[5px] border border-sand bg-hueso disabled:opacity-40"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), next/image no la optimiza */}
        <img src={suyas[0].vista} alt="" className="h-full w-full rounded-[4px] object-cover" />
        {suyas.length > 1 && <Globito n={suyas.length} esquina etiqueta="fotos" className="absolute -right-1.5 -top-1.5" />}
      </BotonFoto>
      <BotonQuitarFoto
        onClick={onQuitar}
        disabled={disabled}
        etiqueta={suyas.length === 1 ? `Quitar la foto de ${nombre}` : `Ver o quitar las ${suyas.length} fotos de ${nombre}`}
        className="-left-1.5 -top-1.5"
      />
    </span>
  );
}
