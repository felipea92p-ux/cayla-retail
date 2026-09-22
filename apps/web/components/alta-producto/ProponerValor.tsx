"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { guardarEjesCategoria, proponerValorVocabulario, type EjeIds, type TipoVocabulario } from "@/lib/alta-producto-ejes";
import type { ValorVocabulario } from "@/lib/catalogo-v2";
import { sinTildes } from "@/lib/marcas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";

// "+ Nueva talla / tejido / patrón" dentro del bloque, sin salir del formulario
// (decidido con Felipe, 2026-09-18: salir a Atributos hacía perder lo llenado).
//
// Son DOS escrituras y se dicen así, porque la segunda puede fallar sola:
//   1. crear el valor en el vocabulario (queda aprobado si quien lo crea es Líder);
//   2. ofrecerlo en ESTA categoría (categoria_tallas / _tejidos / _patrones).
// Si la 2 falla, el valor existe pero no aparece aquí: se avisa con esas
// palabras y reintentar es seguro: como el valor ya existe, el reintento lo
// reconoce en el vocabulario (`universo`) y salta directo a la 2 en vez de
// chocar con el índice único; y "ofrecerlo" es idempotente.
//
// Lo mismo cuando el valor YA existía en el vocabulario pero esta categoría no lo
// ofrece («Liso» está en el catálogo, no en Blusas): escribirlo lo ofrece aquí,
// no rebota con un «ya existe» que no le deja a la persona ninguna salida.
//
// NO va dentro de la transacción del alta: si guardar una talla nueva fallara
// a mitad, la persona perdería el producto entero que estaba llenando.
//
// Colores NO se propone acá a propósito: un color necesita código corto, tono,
// familia de color y tipo (cinco datos), y merece su propia pantalla
// (Catálogo → Atributos → Colores); ver `EnlaceColorNuevo` en el formulario.
//
// Responsable (ADR-0161): agregar un valor es un guardado aparte del producto,
// así que lleva su propio combo. Vive en la parte ABIERTA (`ProponerValorAbierto`)
// para que el formulario no lea la asistencia tres veces por minuto por tres
// enlaces «+ Nueva …» que nadie abrió.

const TEXTOS: Record<TipoVocabulario, { boton: string; placeholder: string; singular: string }> = {
  tallas: { boton: "+ Nueva talla", placeholder: "Ej. 44", singular: "talla" },
  tejidos: { boton: "+ Nuevo tejido", placeholder: "Ej. Lana merino", singular: "tejido" },
  patrones: { boton: "+ Nuevo patrón", placeholder: "Ej. Pata de gallo", singular: "patrón" },
};

type Props = {
  tipo: TipoVocabulario;
  categoriaId: string;
  /** Lo que la categoría ofrece HOY en los tres ejes: la RPC reemplaza, así que hay que devolverlo entero + el valor nuevo. */
  ejesActuales: EjeIds;
  /** Todo el vocabulario aprobado de este tipo (no solo lo que la categoría ofrece): para reconocer un valor que ya existe. */
  universo: ValorVocabulario[];
  onCreado: (valor: ValorVocabulario) => void;
};

export function ProponerValor(props: Props) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="label-cayla text-[11px] text-tinta/70 underline underline-offset-4 hover:text-rojo">
        {TEXTOS[props.tipo].boton}
      </button>
    );
  }
  return <ProponerValorAbierto {...props} onCerrar={() => setAbierto(false)} />;
}

function ProponerValorAbierto({ tipo, categoriaId, ejesActuales, universo, onCreado, onCerrar }: Props & { onCerrar: () => void }) {
  const [texto, setTexto] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const responsable = useResponsable();
  const t = TEXTOS[tipo];

  async function agregar() {
    const limpio = texto.trim();
    if (!limpio || trabajando || !responsable.listo) return;
    setTrabajando(true);
    setError(null);

    const clave = (t: string) => sinTildes(t).replace(/\s+/g, " ");
    const existente = universo.find((v) => clave(v.texto) === clave(limpio));
    const idsDelEje = tipo === "tallas" ? ejesActuales.tallaIds : tipo === "tejidos" ? ejesActuales.tejidoIds : ejesActuales.patronIds;
    if (existente && idsDelEje.includes(existente.id)) {
      setError(`«${existente.texto}» ya está entre las opciones de arriba: tócala.`);
      setTrabajando(false);
      return;
    }

    const { valor, error: errCrear } = existente
      ? { valor: { id: existente.id, texto: existente.texto, aprobado: true }, error: null }
      : await proponerValorVocabulario(tipo, limpio, responsable.encabezados());
    if (errCrear || !valor) {
      setError(errCrear);
      setTrabajando(false);
      return;
    }
    if (!valor.aprobado) {
      responsable.despues(null);
      avisar.aviso(`Propuesta enviada: ${valor.texto}`, { detalle: "Un Líder tiene que aprobarla en Catálogo → Atributos antes de poder usarla." });
      setTrabajando(false);
      setTexto("");
      onCerrar();
      return;
    }

    const nuevos: EjeIds = {
      tallaIds: tipo === "tallas" ? [...ejesActuales.tallaIds, valor.id] : ejesActuales.tallaIds,
      tejidoIds: tipo === "tejidos" ? [...ejesActuales.tejidoIds, valor.id] : ejesActuales.tejidoIds,
      patronIds: tipo === "patrones" ? [...ejesActuales.patronIds, valor.id] : ejesActuales.patronIds,
    };
    const errOfrecer = await guardarEjesCategoria(categoriaId, nuevos, responsable.encabezados());
    setTrabajando(false);
    if (errOfrecer) {
      setError(`«${valor.texto}» ya está en el catálogo, pero no se pudo ofrecer en esta categoría: ${errOfrecer} Vuelve a tocar «Agregar»: no se crea otra vez.`);
      return;
    }
    responsable.despues(null);
    avisar.exito(`${valor.texto} agregada a la categoría`);
    onCreado({ id: valor.id, texto: valor.texto });
    setTexto("");
    onCerrar();
  }

  return (
    <div className="space-y-2">
      <ComboResponsable control={responsable} deshabilitado={trabajando} className="max-w-sm" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`nuevo-${tipo}`}>
          Nombre de la {t.singular} nueva
        </label>
        <input
          id={`nuevo-${tipo}`}
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter NO debe enviar el formulario grande: acá solo agrega este valor.
            if (e.key === "Enter") {
              e.preventDefault();
              void agregar();
            }
            if (e.key === "Escape") onCerrar();
          }}
          placeholder={t.placeholder}
          disabled={trabajando}
          className="h-9 w-44 border-b border-tinta/25 bg-transparent px-1 text-sm text-tinta outline-none placeholder:text-tinta/45 focus:border-tinta"
        />
        <button
          type="button"
          onClick={() => void agregar()}
          disabled={!texto.trim() || trabajando || !responsable.listo}
          title={responsable.motivo ?? undefined}
          className="label-cayla rounded-md bg-tinta px-3 py-2 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-40"
        >
          {trabajando ? "Guardando…" : "Agregar"}
        </button>
        <button type="button" onClick={() => onCerrar()} disabled={trabajando} className="label-cayla text-[11px] text-tinta/60 hover:text-tinta">
          Cancelar
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rojo-profundo">
          {error}
        </p>
      )}
    </div>
  );
}
