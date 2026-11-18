"use client";

import { BookOpen } from "lucide-react";
import { Cajon } from "@/components/ui/Cajon";
import { Chip } from "@/components/ui/Chip";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import {
  INSIGNIA,
  NOMBRE_DOCUMENTO,
  estadoDe,
  fechaCorta,
  fechaDelDia,
  montoEnSoles,
  plazoEnPalabras,
  type HojaLibro,
} from "@/lib/libro-reclamaciones-reglas";

type Navegacion = { indice: number; total: number; que: string; onNavegar: (d: 1 | -1) => void };

/**
 * Una hoja del Libro de Reclamaciones, completa, en el cajón de la derecha (ADR-0679): el plazo arriba (cuándo vence y cuántos días
 * hábiles quedan), y debajo lo mismo que firmó el cliente: sus datos, lo que compró o contrató y lo que reclama. Solo se lee: una hoja
 * no se corrige. Sin velo: la lista sigue viva detrás y ↑ ↓ pasan a la hoja de al lado.
 */
export function HojaCajon({
  hoja,
  hoy,
  navegacion,
  onClose,
}: {
  hoja: HojaLibro;
  hoy: string;
  navegacion?: Navegacion;
  onClose: () => void;
}) {
  const e = estadoDe(hoja);
  const monto = montoEnSoles(hoja.bien.monto);
  return (
    <Cajon
      onCerrar={onClose}
      clave={hoja.id}
      velo={false}
      guia="libro.cajon"
      sobre={hoja.tipo === "reclamo" ? "Reclamo" : "Queja"}
      titulo={`Hoja N.° ${hoja.codigo}`}
      frase={`Llegó el ${fechaCorta(hoja.creada_en)} · ${hoja.tienda ?? "Tienda online"}`}
      marca={
        <span className="grid h-10 w-10 place-items-center rounded-full bg-hueso text-tinta" aria-hidden>
          <BookOpen className="h-5 w-5" />
        </span>
      }
      debajo={
        <span className="flex flex-wrap items-center gap-2">
          <Chip tono={INSIGNIA[e].tono}>{INSIGNIA[e].texto}</Chip>
          {!hoja.copia_enviada && (
            <Chip tono="pizarra" title="La copia al correo del cliente todavía no salió: la tienda la reintenta cada 5 minutos">
              Copia por enviar
            </Chip>
          )}
        </span>
      }
      navegacion={navegacion}
    >
      <div className="space-y-6">
        <section data-guia="libro.plazo" className="rounded-[14px] bg-hueso px-4 py-3 text-[13.5px]">
          <p className="font-semibold text-tinta">{plazoEnPalabras(hoja)}</p>
          {!hoja.respuesta && (
            <p className="text-taupe">
              {hoja.vence_el < hoy ? "Venció" : "Vence"} el {fechaDelDia(hoja.vence_el)}: 15 días hábiles desde que llegó.
            </p>
          )}
        </section>

        <section className="space-y-2">
          <TituloGrupo>El cliente</TituloGrupo>
          <Datos
            filas={[
              ["Nombre", hoja.consumidor.nombre],
              [NOMBRE_DOCUMENTO[hoja.consumidor.tipo_documento], hoja.consumidor.documento],
              ["Correo", hoja.consumidor.correo],
              ["Teléfono", hoja.consumidor.telefono],
              ["Domicilio", hoja.consumidor.domicilio],
              ...(hoja.consumidor.menor_de_edad ? [["Menor de edad, lo representa", hoja.consumidor.apoderado ?? ""] as [string, string]] : []),
            ]}
          />
        </section>

        <section className="space-y-2">
          <TituloGrupo>Lo que compró o contrató</TituloGrupo>
          <Datos
            filas={[
              ["Fue", hoja.bien.tipo === "producto" ? "Un producto" : "Un servicio"],
              ["Qué", hoja.bien.descripcion],
              ["Monto reclamado", monto ?? "No lo indicó"],
            ]}
          />
        </section>

        <section className="space-y-2" data-guia="libro.detalle">
          <TituloGrupo>{hoja.tipo === "reclamo" ? "Lo que reclama" : "Su queja"}</TituloGrupo>
          <p className="whitespace-pre-line break-words text-[14px] leading-relaxed text-tinta">{hoja.detalle}</p>
          <TituloGrupo>Lo que pide</TituloGrupo>
          <p className="whitespace-pre-line break-words text-[14px] leading-relaxed text-tinta">{hoja.pedido}</p>
        </section>
      </div>
    </Cajon>
  );
}

function Datos({ filas }: { filas: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13.5px]">
      {filas.map(([t, v]) => (
        <div key={t} className="contents">
          <dt className="text-taupe">{t}</dt>
          <dd className="break-words text-tinta">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
