"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { objecionArchivo, subirAdjuntosCompra } from "@/lib/adjuntos-compra";
import { ADJUNTOS_MAX_POR_FACTURA, fechaCorta, tamanoLegible, type AdjuntoCompra } from "@/lib/compras-reglas";
import { Boton } from "@/components/ui/campos";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";

// Adjuntos de una factura de proveedor (20260914180000_compras_adjuntos.sql).
// Dos piezas sobre el mismo <input type=file>:
//   · SelectorAdjuntos — en "Registrar factura": junta archivos en memoria
//     y el formulario los sube DESPUÉS de que la factura exista (la ruta
//     lleva el id de la compra).
//   · AdjuntosDeFactura — en el detalle: lista lo subido, abre con URL
//     firmada, agrega (sube al instante) y quita (archiva, nunca borra).
// Sin `capture`: con accept de PDF+imagen, iOS ya ofrece "Tomar foto /
// Fototeca / Explorar" solo, y forzar la cámara quitaría las otras dos.

const ACEPTA = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif";

function IconoTipo({ tipo }: { tipo: string }) {
  const esPdf = tipo === "application/pdf";
  return (
    <span
      aria-hidden
      className={`label-cayla inline-flex h-7 w-9 shrink-0 items-center justify-center rounded border text-[9px] ${
        esPdf ? "border-rojo/30 text-rojo-profundo" : "border-tinta/20 text-tinta/65"
      }`}
    >
      {esPdf ? "PDF" : "IMG"}
    </span>
  );
}

// El botón que abre el explorador. Es un <label> sobre un input oculto: el
// input nativo no se puede estilar y este sí parece un botón del sistema.
function BotonElegir({ onArchivos, disabled = false, texto }: { onArchivos: (f: File[]) => void; disabled?: boolean; texto: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACEPTA}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          onArchivos(Array.from(e.target.files ?? []));
          // Se limpia para que elegir el mismo archivo dos veces dispare onChange.
          e.target.value = "";
        }}
      />
      <Boton type="button" peso="discreto" disabled={disabled} onClick={() => input.current?.click()} className="w-full">
        {texto}
      </Boton>
    </>
  );
}

/* ------------------------------------------------------------------
   En "Registrar factura": la cola de archivos por subir.
   ------------------------------------------------------------------ */
export function SelectorAdjuntos({ archivos, onArchivos }: { archivos: File[]; onArchivos: (f: File[]) => void }) {
  const [arrastrando, setArrastrando] = useState(false);

  function agregar(nuevos: File[]) {
    const malos: string[] = [];
    const buenos = nuevos.filter((f) => {
      const o = objecionArchivo(f);
      if (o) malos.push(`${f.name}: ${o}`);
      return !o;
    });
    const cupo = ADJUNTOS_MAX_POR_FACTURA - archivos.length;
    if (buenos.length > cupo) malos.push(`Máximo ${ADJUNTOS_MAX_POR_FACTURA} adjuntos por comprobante.`);
    if (malos.length) avisar.aviso(malos.length === 1 ? "Un archivo no se puede adjuntar" : `${malos.length} archivos no se pueden adjuntar`, { detalle: malos.join(" · ") });
    if (buenos.length) onArchivos([...archivos, ...buenos.slice(0, Math.max(0, cupo))]);
  }

  return (
    <div className="space-y-2">
      <p className="label-cayla text-[11px] text-tinta/65">Adjuntos</p>
      {archivos.length > 0 && (
        <ul className="divide-y divide-tinta/10 rounded-md border border-tinta/10">
          {archivos.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2.5 px-2.5 py-2">
              <IconoTipo tipo={f.type} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-tinta">{f.name}</span>
                <span className="block text-xs text-tinta/55">{tamanoLegible(f.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => onArchivos(archivos.filter((_, n) => n !== i))}
                aria-label={`Quitar ${f.name}`}
                className="text-base leading-none text-tinta/45 hover:text-rojo"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* Zona de arrastre: mismo <input> oculto que ya abría `BotonElegir`,
          solo se suma `onDrop` encima — nadie pierde el botón de siempre. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (archivos.length < ADJUNTOS_MAX_POR_FACTURA) setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          agregar(Array.from(e.dataTransfer.files));
        }}
        className={`rounded-md border border-dashed p-3 text-center transition-colors ${arrastrando ? "border-rojo bg-rojo/5" : "border-tinta/20"}`}
      >
        <BotonElegir
          onArchivos={agregar}
          texto={archivos.length ? "+ Otro archivo" : "Adjuntar el comprobante o documentos"}
          disabled={archivos.length >= ADJUNTOS_MAX_POR_FACTURA}
        />
        <p className="mt-2 text-xs text-tinta/45">Arrastra aquí, o PDF/foto hasta 10 MB. Se suben al registrar.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   En el detalle: lo que ya está pegado a la factura.
   ------------------------------------------------------------------ */
export function AdjuntosDeFactura({
  compraId,
  adjuntos,
  puedeEditar,
  avisoInicial,
}: {
  compraId: string;
  adjuntos: AdjuntoCompra[];
  puedeEditar: boolean;
  /** Archivos que no se pudieron subir al registrar (vienen por la URL). */
  avisoInicial?: string[];
}) {
  const router = useRouter();
  const [subiendo, setSubiendo] = useState(false);
  const [aQuitar, setAQuitar] = useState<AdjuntoCompra | null>(null);
  // Lo que no subió al registrar viene por la URL; se avisa una sola vez.
  const avisoDado = useRef(false);
  useEffect(() => {
    if (avisoDado.current || !avisoInicial?.length) return;
    avisoDado.current = true;
    avisar.aviso(`Al registrar no se pudo subir: ${avisoInicial.join(", ")}`, { detalle: "Puedes intentarlo de nuevo desde aquí." });
  }, [avisoInicial]);

  async function agregar(nuevos: File[]) {
    if (!nuevos.length) return;
    if (adjuntos.length + nuevos.length > ADJUNTOS_MAX_POR_FACTURA) {
      avisar.error(`Máximo ${ADJUNTOS_MAX_POR_FACTURA} adjuntos por comprobante.`);
      return;
    }
    setSubiendo(true);
    const cerrarProceso = avisar.proceso(nuevos.length === 1 ? `Subiendo ${nuevos[0].name}…` : `Subiendo ${nuevos.length} archivos…`);
    const r = await subirAdjuntosCompra(createClient(), compraId, nuevos);
    cerrarProceso();
    setSubiendo(false);
    if (r.fallidos.length) avisar.error(r.fallidos.length === 1 ? "Un archivo no subió" : `${r.fallidos.length} archivos no subieron`, { detalle: r.fallidos.map((f) => `${f.nombre}: ${f.motivo}`).join(" · ") });
    if (r.subidos.length) {
      avisar.exito(r.subidos.length === 1 ? "Adjunto subido" : `${r.subidos.length} adjuntos subidos`);
      router.refresh();
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="label-cayla text-[11px] text-tinta/65">Adjuntos</p>
        {adjuntos.some((a) => a.url === null) && <span className="text-xs text-tinta/45">Sin acceso al almacén de archivos ahora</span>}
      </div>
      <div className="card-cayla divide-y divide-tinta/10">
        {adjuntos.length === 0 && <p className="px-5 py-4 text-sm text-tinta/65">Sin documentos adjuntos.</p>}
        {adjuntos.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-5 py-2.5">
            <IconoTipo tipo={a.tipo} />
            <span className="min-w-0 flex-1">
              {a.url ? (
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-tinta hover:text-rojo hover:underline">
                  {a.nombre}
                </a>
              ) : (
                <span className="block truncate text-sm text-tinta/60">{a.nombre}</span>
              )}
              <span className="block text-xs text-tinta/55">
                {tamanoLegible(a.bytes)} · {fechaCorta(a.creadoEn)}
              </span>
            </span>
            {a.url && (
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="label-cayla shrink-0 text-[10px] text-tinta/65 hover:text-rojo">
                Ver
              </a>
            )}
            {puedeEditar && (
              <button type="button" onClick={() => setAQuitar(a)} className="label-cayla shrink-0 text-[10px] text-tinta/45 hover:text-rojo">
                Quitar
              </button>
            )}
          </div>
        ))}
        {puedeEditar && (
          <div className="px-5 py-3">
            <BotonElegir
              onArchivos={agregar}
              disabled={subiendo || adjuntos.length >= ADJUNTOS_MAX_POR_FACTURA}
              texto={subiendo ? "Subiendo…" : "+ Adjuntar documento"}
            />
          </div>
        )}
      </div>
      {aQuitar && (
        <QuitarAdjuntoModal
          adjunto={aQuitar}
          onClose={() => setAQuitar(null)}
          onQuitado={() => {
            setAQuitar(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function QuitarAdjuntoModal({ adjunto, onClose, onQuitado }: { adjunto: AdjuntoCompra; onClose: () => void; onQuitado: () => void }) {
  const [loading, setLoading] = useState(false);

  async function confirmar() {
    setLoading(true);
    const { error } = await createClient().rpc("archivar_adjunto_compra", { p_adjunto_id: adjunto.id });
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "quitar el adjunto"));
      return;
    }
    avisar.exito(`${adjunto.nombre} quitado`, { detalle: "El archivo no se destruye: queda guardado." });
    onQuitado();
  }

  return (
    <Modal titulo="Quitar adjunto" subtitulo={adjunto.nombre} onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-4">
          <p className="text-sm text-tinta/75">Deja de verse en esta factura. El archivo no se destruye: queda guardado por si hace falta recuperarlo.</p>
          <div className="flex gap-3">
            <button type="button" onClick={cerrar} className={botonCancelar} disabled={loading}>
              Cancelar
            </button>
            <button type="button" onClick={confirmar} className={botonPrimario} disabled={loading}>
              {loading ? "Quitando…" : "Quitar"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
