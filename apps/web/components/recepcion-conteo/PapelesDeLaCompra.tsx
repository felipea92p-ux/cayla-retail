"use client";

import { useState } from "react";
import { Expand, FileText, ImageOff } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { diaMes } from "@/lib/fechas-lima";
import { TIPOS_PAPEL, type TipoPapel } from "@/lib/compra-rapida-reglas";
import type { PapelDelEnvio } from "@/lib/recepcion-envio-reglas";
import type { LineaParaContar } from "@/lib/recepcion-conteo-reglas";
import { estadoAnotada, lineasAnotadas, nombreAnotado } from "@/lib/recibir-papel-reglas";

// Compras simple (ADR-0480, actividad 6): la tienda cuenta mirando el papel de la compra. Rediseño (maqueta
// docs/maquetas/compras-formidable-2026-10/, Felipe 2026-10-23): el papel va en una columna fija a la izquierda mientras se cuenta. La foto
// se abre EN GRANDE sobre la pantalla (antes, en otra pestaña: se perdía el lugar del conteo) y, debajo, «Lo que anotó X»: cada prenda que
// anotó la compradora con su miniatura y cómo va (contada, a medias o la que sigue). Sin montos: la tienda no ve el dinero de Compras por
// tener Recibir. Un envío armado en el escritorio no tiene papeles y no dibuja nada.

type Papel = PapelDelEnvio & { fotoUrl: string | null };

const esPdf = (ruta: string | null) => !!ruta && ruta.toLowerCase().endsWith(".pdf");

function nombreDelPapel(p: Papel): string {
  const tipo = p.tipo && p.tipo in TIPOS_PAPEL ? TIPOS_PAPEL[p.tipo as TipoPapel].nombre : "Papel";
  return p.tipo === "sin_comprobante" ? `Sin papel de ${p.proveedor ?? "el proveedor"}` : `${tipo} de ${p.proveedor ?? "el proveedor"}`;
}

function Visor({ papel, onGrande }: { papel: Papel; onGrande: () => void }) {
  if (!papel.fotoUrl) {
    return (
      <span className="flex items-center gap-3 rounded-2xl bg-hueso p-4 text-sm text-taupe">
        <ImageOff className="h-5 w-5 shrink-0" aria-hidden />
        {papel.fotoRuta ? "La foto no se pudo abrir: recarga la pantalla." : "No subió foto."}
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
    <button type="button" onClick={onGrande} className="group relative block w-full overflow-hidden rounded-2xl bg-hueso p-3" title="Ver la foto en grande" data-guia="recepcion.papel-foto">
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

export function PapelesDeLaCompra({ papeles, lineas = [], siguiente = null }: { papeles: readonly Papel[]; lineas?: readonly LineaParaContar[]; siguiente?: string | null }) {
  const [grande, setGrande] = useState<Papel | null>(null);
  if (papeles.length === 0) return null;
  const compradoras = [...new Set(papeles.map((p) => p.compradora).filter((x): x is string => !!x))];
  const quien = compradoras.length === 1 ? compradoras[0].split(" ")[0] : null;
  const anotadas = lineasAnotadas(lineas);
  return (
    <section className="card-cayla flex flex-col gap-4 p-4" aria-label="El papel de la compra" data-guia="recepcion.papeles">
      <TituloSeccion cuenta={papeles.length > 1 ? papeles.length : undefined}>{papeles.length > 1 ? "Los papeles de la compra" : "El papel de la compra"}</TituloSeccion>
      {papeles.map((p) => (
        <div key={p.id} className="flex flex-col gap-2">
          <Visor papel={p} onGrande={() => setGrande(p)} />
          <span className="text-xs text-taupe">
            {[nombreDelPapel(p), p.compradora ? `compró ${p.compradora.split(" ")[0]}` : null, p.fecha ? `el ${diaMes(p.fecha)}` : null].filter(Boolean).join(" · ")}
          </span>
        </div>
      ))}
      {anotadas.length > 0 && (
        <div className="flex flex-col gap-1" data-guia="recepcion.anotado">
          <span className="label-cayla text-[11px] text-taupe">{quien ? `Lo que anotó ${quien}` : "Lo que anotaron"}</span>
          <ul className="divide-y divide-sand">
            {anotadas.map((l) => {
              const e = estadoAnotada(l);
              return (
                <li key={l.clave} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 py-2">
                  <MiniaturaPrenda fotoUrl={null} prefijo={l.categoria?.prefijo} familia={l.categoria?.familia} categoria={l.categoria?.nombre} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-tinta">
                      {l.dijeron} · {nombreAnotado(l)}
                    </span>
                    <span className="block truncate text-xs text-taupe">{l.categoria?.nombre ?? ""}</span>
                  </span>
                  {e === "contada" ? (
                    <Chip tono="verde">Contada</Chip>
                  ) : e === "a-medias" ? (
                    <Chip tono="ambar">{`${l.conteo?.contadas ?? 0} de ${l.dijeron}`}</Chip>
                  ) : siguiente === l.clave ? (
                    <Chip tono="pizarra">Ahora</Chip>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="text-xs text-taupe">Cuenta mirando el papel: lo que dice es lo que se pagó.</p>
      {grande?.fotoUrl && (
        <Modal titulo={nombreDelPapel(grande)} subtitulo={grande.compradora ? `Lo compró ${grande.compradora}` : undefined} onClose={() => setGrande(null)} tamano="ancha" conCerrar>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={grande.fotoUrl} alt={`Foto: ${nombreDelPapel(grande)}`} className="max-h-[75vh] w-full rounded-xl bg-hueso object-contain" />
        </Modal>
      )}
    </section>
  );
}
