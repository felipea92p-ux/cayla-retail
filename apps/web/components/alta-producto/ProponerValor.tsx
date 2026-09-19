"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { guardarEjesCategoria, proponerValorVocabulario, type EjeIds, type TipoVocabulario } from "@/lib/alta-producto-ejes";
import type { ValorVocabulario } from "@/lib/catalogo-v2";

// "+ Nueva talla / tejido / patrón" dentro del bloque, sin salir del formulario
// (decidido con Felipe, 2026-09-18: salir a Atributos hacía perder lo llenado).
//
// Son DOS escrituras y se dicen así, porque la segunda puede fallar sola:
//   1. crear el valor en el vocabulario (queda aprobado si quien lo crea es Líder);
//   2. ofrecerlo en ESTA categoría (categoria_tallas / _tejidos / _patrones).
// Si la 2 falla, el valor existe pero no aparece aquí: se avisa con esas
// palabras y reintentar es seguro (crear el mismo valor otra vez lo rechaza el
// índice único del vocabulario, y "ofrecerlo" es idempotente).
//
// NO va dentro de la transacción del alta: si guardar una talla nueva fallara
// a mitad, la persona perdería el producto entero que estaba llenando.
//
// Colores NO se propone acá a propósito: un color necesita código corto, tono,
// familia de color y tipo (cinco datos), y merece su propia pantalla
// (Catálogo → Atributos → Colores); ver `EnlaceColorNuevo` en el formulario.

const TEXTOS: Record<TipoVocabulario, { boton: string; placeholder: string; singular: string }> = {
  tallas: { boton: "+ Nueva talla", placeholder: "Ej. 44", singular: "talla" },
  tejidos: { boton: "+ Nuevo tejido", placeholder: "Ej. Lana merino", singular: "tejido" },
  patrones: { boton: "+ Nuevo patrón", placeholder: "Ej. Pata de gallo", singular: "patrón" },
};

export function ProponerValor({
  tipo,
  categoriaId,
  ejesActuales,
  onCreado,
}: {
  tipo: TipoVocabulario;
  categoriaId: string;
  /** Lo que la categoría ofrece HOY en los tres ejes: la RPC reemplaza, así que hay que devolverlo entero + el valor nuevo. */
  ejesActuales: EjeIds;
  onCreado: (valor: ValorVocabulario) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = TEXTOS[tipo];

  async function agregar() {
    const limpio = texto.trim();
    if (!limpio || trabajando) return;
    setTrabajando(true);
    setError(null);

    const { valor, error: errCrear } = await proponerValorVocabulario(tipo, limpio);
    if (errCrear || !valor) {
      setError(errCrear);
      setTrabajando(false);
      return;
    }
    if (!valor.aprobado) {
      avisar.aviso(`Propuesta enviada: ${valor.texto}`, { detalle: "Un Líder tiene que aprobarla en Catálogo → Atributos antes de poder usarla." });
      setTrabajando(false);
      setTexto("");
      setAbierto(false);
      return;
    }

    const nuevos: EjeIds = {
      tallaIds: tipo === "tallas" ? [...ejesActuales.tallaIds, valor.id] : ejesActuales.tallaIds,
      tejidoIds: tipo === "tejidos" ? [...ejesActuales.tejidoIds, valor.id] : ejesActuales.tejidoIds,
      patronIds: tipo === "patrones" ? [...ejesActuales.patronIds, valor.id] : ejesActuales.patronIds,
    };
    const errOfrecer = await guardarEjesCategoria(categoriaId, nuevos);
    setTrabajando(false);
    if (errOfrecer) {
      setError(`Se creó «${valor.texto}» en el catálogo, pero no se pudo ofrecer en esta categoría: ${errOfrecer} Reintenta agregándola de nuevo.`);
      return;
    }
    avisar.exito(`${valor.texto} agregada a la categoría`);
    onCreado({ id: valor.id, texto: valor.texto });
    setTexto("");
    setAbierto(false);
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="label-cayla text-[11px] text-tinta/70 underline underline-offset-4 hover:text-rojo">
        {t.boton}
      </button>
    );
  }

  return (
    <div className="space-y-2">
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
            if (e.key === "Escape") setAbierto(false);
          }}
          placeholder={t.placeholder}
          disabled={trabajando}
          className="h-9 w-44 border-b border-tinta/25 bg-transparent px-1 text-sm text-tinta outline-none placeholder:text-tinta/45 focus:border-tinta"
        />
        <button
          type="button"
          onClick={() => void agregar()}
          disabled={!texto.trim() || trabajando}
          className="label-cayla rounded-md bg-tinta px-3 py-2 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-40"
        >
          {trabajando ? "Guardando…" : "Agregar"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} disabled={trabajando} className="label-cayla text-[11px] text-tinta/60 hover:text-tinta">
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
