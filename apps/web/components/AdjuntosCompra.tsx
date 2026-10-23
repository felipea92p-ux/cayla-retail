"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { subirAdjuntosCompra } from "@/lib/adjuntos-compra";
import { ADJUNTOS_MAX_POR_FACTURA, fechaCorta, tamanoLegible, type AdjuntoCompra } from "@/lib/compras-reglas";
import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { firmar } from "@/lib/responsable-reglas";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { Paperclip } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";

// Adjuntos de una factura de proveedor (20260914180000_compras_adjuntos.sql).
// AdjuntosDeFactura — en el detalle: lista lo subido, abre con URL firmada,
// agrega (sube al instante) y quita (archiva, nunca borra). El selector de
// «Registrar factura» se fue con ese formulario (2026-10-23, ADR-0480 act.).
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
  // Adjuntar va sin responsable (Felipe, 2026-09-29): `registrar_adjunto_compra` firma la persona de la sesión.
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
    const r = await subirAdjuntosCompra(createClient(), compraId, nuevos, firmaOmitida("compra_adjunto_subir"));
    cerrarProceso();
    setSubiendo(false);
    if (r.fallidos.length) avisar.error(r.fallidos.length === 1 ? "Un archivo no subió" : `${r.fallidos.length} archivos no subieron`, { detalle: r.fallidos.map((f) => `${f.nombre}: ${f.motivo}`).join(" · ") });
    if (r.subidos.length) {
      avisar.exito(r.subidos.length === 1 ? "Adjunto subido" : `${r.subidos.length} adjuntos subidos`);
      router.refresh();
    }
  }

  return (
    <section className="space-y-2" data-guia="factura.adjuntos">
      <div className="flex items-baseline justify-between">
        <p className="label-cayla text-[11px] text-tinta/65">Adjuntos</p>
        {adjuntos.some((a) => a.url === null) && <span className="text-xs text-tinta/45">Sin acceso al almacén de archivos ahora</span>}
      </div>
      <div className="card-cayla divide-y divide-tinta/10">
        {adjuntos.length === 0 && <Vacio tamano="chico" alinear="izquierda" className="px-5" icono={<Paperclip />}>Sin documentos adjuntos.</Vacio>}
        {adjuntos.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-5 py-2.5">
            <IconoTipo tipo={a.tipo} />
            <span className="min-w-0 flex-1">
              {a.url ? (
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="btn-enlace block truncate text-sm">
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
          <div className="space-y-3 px-5 py-3">
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
  // Quitar un adjunto va sin responsable (Felipe, 2026-09-29).

  async function confirmar() {
    setLoading(true);
    const { error } = await firmar(createClient().rpc("archivar_adjunto_compra", { p_adjunto_id: adjunto.id }), firmaOmitida("compra_adjunto_quitar"));
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
          <div className="pie-acciones">
            <button type="button" onClick={cerrar} className="btn-cayla btn-secundario" disabled={loading}>
              Cancelar
            </button>
            <Boton peso="primario" cargando={loading} textoCargando="Quitando…" type="button" onClick={confirmar} disabled={loading}>
              Quitar
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
