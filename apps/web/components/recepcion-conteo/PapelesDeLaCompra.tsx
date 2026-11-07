"use client";

import { useRef, useState } from "react";
import { Camera, Expand, FileText, ImageOff } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { objecionArchivo } from "@/lib/adjuntos-compra";
import { diaMes } from "@/lib/fechas-lima";
import { TIPOS_PAPEL, type TipoPapel } from "@/lib/compra-rapida-reglas";
import type { PapelDelEnvio } from "@/lib/recepcion-envio-reglas";

// Compras simple (ADR-0480, actividad 6): los papeles de lo comprado desde el celular. Desde el 2026-11-02 (Felipe, ADR-0604) son un solo botón que abre una
// hoja: la columna fija ocupaba lugar y repetía lo que ya se ve a la izquierda al contar. Va en la cabecera al cerrar y en el resumen al contar (`enResumen`, a lo ancho y con
// cuántas fotos hay). La foto se abre EN GRANDE sobre la hoja, sin perder el lugar del conteo. Sin montos: la tienda no ve el dinero de Compras por tener Recibir. Un envío
// armado en el escritorio no tiene papeles y no dibuja nada.

type Papel = PapelDelEnvio & { fotoUrl: string | null };

const esPdf = (ruta: string | null) => !!ruta && ruta.toLowerCase().endsWith(".pdf");

function nombreDelPapel(p: Papel): string {
  const tipo = p.tipo && p.tipo in TIPOS_PAPEL ? TIPOS_PAPEL[p.tipo as TipoPapel].nombre : "Papel";
  return p.tipo === "sin_comprobante" ? `Sin papel de ${p.proveedor ?? "el proveedor"}` : `${tipo} de ${p.proveedor ?? "el proveedor"}`;
}

/**
 * El botón de «No subió foto» (Felipe 2026-10-27): la tienda tiene el papel en la mano y puede subirle la foto o tomarla ahí mismo. Sin
 * `capture`: en el celular el sistema ofrece la cámara o la galería; en el computador, el selector de archivos. Solo agrega: un papel que
 * ya tiene foto no la cambia (la base tampoco lo deja).
 */
function SubirFoto({ papel, alSubir }: { papel: Papel; alSubir: (papelId: string, archivo: File) => Promise<string | null> }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [rechazo, setRechazo] = useState<string | null>(null);
  async function elegido(archivo: File) {
    const motivo = objecionArchivo(archivo);
    if (motivo) return setRechazo(`${motivo} Elige otra.`);
    setRechazo(null);
    setSubiendo(true);
    const porQue = await alSubir(papel.id, archivo);
    setSubiendo(false);
    if (porQue) setRechazo(porQue);
  }
  return (
    <>
      <Boton
        type="button"
        peso="fantasma"
        cargando={subiendo}
        textoCargando="Subiendo…"
        className="btn-chico ml-auto"
        title="Subir o tomar una foto del papel"
        onClick={() => entrada.current?.click()}
      >
        <span className="inline-flex items-center gap-1.5">
          <Camera className="h-4 w-4" aria-hidden />
          Subir foto
        </span>
      </Boton>
      <input
        ref={entrada}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Foto de ${nombreDelPapel(papel)}`}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (f) void elegido(f);
        }}
      />
      {rechazo && (
        <span className="basis-full text-sm text-rojo-profundo" role="alert">
          {rechazo}
        </span>
      )}
    </>
  );
}

function Visor({ papel, onGrande, alSubir }: { papel: Papel; onGrande: () => void; alSubir?: (papelId: string, archivo: File) => Promise<string | null> }) {
  if (!papel.fotoUrl) {
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-hueso p-4 text-sm text-taupe">
        <ImageOff className="h-5 w-5 shrink-0" aria-hidden />
        {papel.fotoRuta ? "La foto no se pudo abrir: recarga la pantalla." : "No subió foto."}
        {!papel.fotoRuta && alSubir && <SubirFoto papel={papel} alSubir={alSubir} />}
      </span>
    );
  }
  if (esPdf(papel.fotoRuta)) {
    return (
      <a href={papel.fotoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl bg-hueso p-4 text-sm text-tinta">
        <FileText className="h-5 w-5 shrink-0" aria-hidden />
        Abrir el PDF del papel
      </a>
    );
  }
  return (
    <button type="button" onClick={onGrande} className="group relative block w-full overflow-hidden rounded-2xl bg-hueso p-3" title="Ver la foto en grande">
      {/* La foto es un enlace firmado de 10 minutos del depósito privado: no pasa por la optimización de imágenes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={papel.fotoUrl} alt={`Foto: ${nombreDelPapel(papel)}`} className="max-h-80 w-full object-contain" />
      <span className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full border border-sand bg-papel text-tinta">
        <Expand className="h-4 w-4" aria-hidden />
        <span className="sr-only">Ver en grande</span>
      </span>
    </button>
  );
}

export function PapelesDeLaCompra({
  papeles,
  alSubirFoto,
  enResumen = false,
}: {
  papeles: readonly Papel[];
  enResumen?: boolean;
  /** Sube y guarda la foto de un papel que llegó sin ella; devuelve por qué no se pudo, o `null` si quedó. Sin ella, el papel sin foto no ofrece subirla. */
  alSubirFoto?: (papelId: string, archivo: File) => Promise<string | null>;
}) {
  const [abierta, setAbierta] = useState(false);
  const [grande, setGrande] = useState<Papel | null>(null);
  if (papeles.length === 0) return null;
  // Con todas las fotos ya subidas no queda nada que subir: el botón dice lo que hace, mirarlas.
  const faltaAlguna = papeles.some((p) => !p.fotoRuta);
  const quePuedeHacer = faltaAlguna ? "Subir foto de facturas" : "Ver fotos de facturas";
  return (
    <>
      <Boton type="button" peso="fantasma" className={enResumen ? "rc-fotos-boton" : "shrink-0"} onClick={() => setAbierta(true)} data-guia="recepcion.papeles" aria-label={quePuedeHacer} title={quePuedeHacer}>
        <span className="inline-flex items-center gap-2">
          <Camera aria-hidden className="h-4 w-4" />
          {enResumen ? (
            <>
              <span className="rc-fotos-texto">{quePuedeHacer}</span>
              <small>
                {papeles.filter((p) => p.fotoRuta).length} de {papeles.length}
              </small>
            </>
          ) : (
            <>
              {/* En la fila del título: desde 1700 px cabe entero; antes, corto, para no empujar el Trayecto a otra fila. */}
              <span className="max-[1699px]:hidden">{quePuedeHacer}</span>
              <span className="min-[1700px]:hidden">Facturas</span>
            </>
          )}
        </span>
      </Boton>
      {abierta && (
        <Modal
          titulo="Fotos de las facturas"
          subtitulo="Los papeles de esta compra. Sube la foto del que tengas en la mano: una foto ya subida no se cambia."
          onClose={() => setAbierta(false)}
          tamano="mediana"
          conCerrar
        >
          <div className="flex flex-col gap-4">
            {papeles.map((p) => (
              <div key={p.id} className="flex flex-col gap-2">
                <Visor papel={p} onGrande={() => setGrande(p)} alSubir={alSubirFoto} />
                <span className="text-sm text-taupe">
                  {[nombreDelPapel(p), p.compradora ? `compró ${p.compradora.split(" ")[0]}` : null, p.fecha ? `el ${diaMes(p.fecha)}` : null].filter(Boolean).join(" · ")}
                </span>
              </div>
            ))}
          </div>
          {grande?.fotoUrl && (
            <Modal titulo={nombreDelPapel(grande)} subtitulo={grande.compradora ? `Lo compró ${grande.compradora}` : undefined} onClose={() => setGrande(null)} tamano="ancha" conCerrar>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={grande.fotoUrl} alt={`Foto: ${nombreDelPapel(grande)}`} className="max-h-[75vh] w-full rounded-xl bg-hueso object-contain" />
            </Modal>
          )}
        </Modal>
      )}
    </>
  );
}
