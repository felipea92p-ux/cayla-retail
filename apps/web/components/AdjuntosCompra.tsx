"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
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
  const [objecion, setObjecion] = useState<string | null>(null);

  function agregar(nuevos: File[]) {
    const malos: string[] = [];
    const buenos = nuevos.filter((f) => {
      const o = objecionArchivo(f);
      if (o) malos.push(`${f.name}: ${o}`);
      return !o;
    });
    const cupo = ADJUNTOS_MAX_POR_FACTURA - archivos.length;
    if (buenos.length > cupo) malos.push(`Máximo ${ADJUNTOS_MAX_POR_FACTURA} adjuntos por factura.`);
    setObjecion(malos.length ? malos.join(" · ") : null);
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
      <BotonElegir
        onArchivos={agregar}
        texto={archivos.length ? "+ Otro archivo" : "Adjuntar factura o documentos"}
        disabled={archivos.length >= ADJUNTOS_MAX_POR_FACTURA}
      />
      <p className={`text-xs ${objecion ? "text-rojo" : "text-tinta/45"}`}>{objecion ?? "PDF o foto, hasta 10 MB. Se suben al registrar."}</p>
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
  const [aviso, setAviso] = useState<string | null>(
    avisoInicial?.length ? `Al registrar no se pudo subir: ${avisoInicial.join(", ")}. Puedes intentarlo de nuevo desde aquí.` : null,
  );
  const [aQuitar, setAQuitar] = useState<AdjuntoCompra | null>(null);

  async function agregar(nuevos: File[]) {
    if (!nuevos.length) return;
    if (adjuntos.length + nuevos.length > ADJUNTOS_MAX_POR_FACTURA) {
      setAviso(`Máximo ${ADJUNTOS_MAX_POR_FACTURA} adjuntos por factura.`);
      return;
    }
    setSubiendo(true);
    setAviso(null);
    const r = await subirAdjuntosCompra(createClient(), compraId, nuevos);
    setSubiendo(false);
    if (r.fallidos.length) setAviso(r.fallidos.map((f) => `${f.nombre}: ${f.motivo}`).join(" · "));
    if (r.subidos.length) router.refresh();
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
      {aviso && <p className="text-sm text-rojo">{aviso}</p>}
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function confirmar() {
    setLoading(true);
    setError(null);
    const { error } = await createClient().rpc("archivar_adjunto_compra", { p_adjunto_id: adjunto.id });
    setLoading(false);
    if (error) {
      setError(traducirError(error, "quitar el adjunto"));
      return;
    }
    onQuitado();
  }

  return (
    <Modal titulo="Quitar adjunto" subtitulo={adjunto.nombre} onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-4">
          <p className="text-sm text-tinta/75">Deja de verse en esta factura. El archivo no se destruye: queda guardado por si hace falta recuperarlo.</p>
          {error && <p className="text-sm text-rojo">{error}</p>}
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
