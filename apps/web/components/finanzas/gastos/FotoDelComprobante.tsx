"use client";

// La foto del comprobante de un gasto, en su hoja (ADR-0588, actividad 5): la misma que se adjunta a la factura en Compras (`compra_adjuntos`), una
// sola fuente. Se ve lo que ya está subido (se abre con su enlace firmado) y se suma una foto o un PDF al momento. Quitarla va en la factura de Compras
// (su «Quitar» abre otra hoja, y aquí no se abre una hoja sobre otra). NO cambia permisos: lo ve quien ya ve el dinero de Compras y suma quien ya
// adjunta facturas (`registrar_adjunto_compra`); a los demás no se les muestra nada.
import { useEffect, useRef, useState } from "react";
import { FileText, ImageIcon, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Boton } from "@/components/ui/campos";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { cargarAdjuntosDeComprobante, subirAdjuntosCompra } from "@/lib/adjuntos-compra";
import { ADJUNTOS_MAX_POR_FACTURA, type AdjuntoCompra } from "@/lib/compras-reglas";

const ACEPTA = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif";

export function FotoDelComprobante({ compraId, puedeAgregar }: { compraId: string; puedeAgregar: boolean }) {
  const [adjuntos, setAdjuntos] = useState<AdjuntoCompra[] | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vigente = true;
    void cargarAdjuntosDeComprobante(createClient(), compraId).then((a) => {
      if (vigente) setAdjuntos(a);
    });
    return () => {
      vigente = false;
    };
  }, [compraId]);

  async function agregar(archivos: File[]) {
    if (!archivos.length) return;
    if ((adjuntos?.length ?? 0) + archivos.length > ADJUNTOS_MAX_POR_FACTURA) return avisar.error(`Máximo ${ADJUNTOS_MAX_POR_FACTURA} archivos por comprobante.`);
    setSubiendo(true);
    const r = await subirAdjuntosCompra(createClient(), compraId, archivos, firmaOmitida("compra_adjunto_subir"));
    setSubiendo(false);
    if (r.fallidos.length) avisar.error(r.fallidos.length === 1 ? "La foto no subió" : `${r.fallidos.length} archivos no subieron`, { detalle: r.fallidos.map((f) => `${f.nombre}: ${f.motivo}`).join(" · ") });
    if (r.subidos.length) {
      avisar.exito(r.subidos.length === 1 ? "Foto del comprobante guardada" : `${r.subidos.length} archivos guardados`);
      setAdjuntos(await cargarAdjuntosDeComprobante(createClient(), compraId));
    }
  }

  // Sin permiso para verlos (o sin respuesta) y sin poder sumar: nada que decir.
  if (adjuntos === null || (adjuntos.length === 0 && !puedeAgregar)) return null;
  return (
    <div className="mb-4 rounded-[12px] bg-hueso px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="campo-etiqueta">Foto del comprobante</span>
        {adjuntos.length > 0 && (
          <EnlaceVer href={`/compras/factura/${compraId}`}>Quitar o ver todo en Compras</EnlaceVer>
        )}
      </div>
      {adjuntos.length > 0 ? (
        <ul className="mt-1.5 space-y-1 text-sm">
          {adjuntos.map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              {a.tipo === "application/pdf" ? <FileText aria-hidden className="h-3.5 w-3.5 text-taupe" /> : <ImageIcon aria-hidden className="h-3.5 w-3.5 text-taupe" />}
              {a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer" className="btn-enlace min-w-0 truncate">
                  {a.nombre}
                </a>
              ) : (
                <span className="min-w-0 truncate text-tinta">{a.nombre}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-taupe">Todavía sin foto: súmala para no buscar el papel después.</p>
      )}
      {puedeAgregar && adjuntos.length < ADJUNTOS_MAX_POR_FACTURA && (
        <>
          <input
            ref={input}
            type="file"
            accept={ACEPTA}
            className="sr-only"
            onChange={(e) => {
              void agregar(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <Boton type="button" peso="fantasma" cargando={subiendo} textoCargando="Subiendo…" disabled={subiendo} onClick={() => input.current?.click()} className="btn-chico mt-2">
            {/* El ícono y la palabra en una fila: `cargando` envuelve lo de adentro para guardar el ancho mientras sube. */}
            <span className="inline-flex items-center gap-1.5">
              <Paperclip aria-hidden className="h-4 w-4" />
              Agregar foto o PDF
            </span>
          </Boton>
        </>
      )}
    </div>
  );
}
