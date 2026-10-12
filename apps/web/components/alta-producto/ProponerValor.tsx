"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { guardarEjesCategoria, proponerValorVocabulario, sumarAlEje, type EjeIds, type TipoVocabulario } from "@/lib/alta-producto-ejes";
import type { ValorVocabulario } from "@/lib/catalogo-v2";
import { sinTildes } from "@/lib/marcas";
import { sugerirValorNuevo } from "@/lib/sugerencias-alta-producto";
import { AvisoSinIdentidad, useFirmaDeMitad } from "@/components/alta-producto/IdentidadAlta";
import { Aviso } from "@/components/ui/Aviso";

// "+ Nueva talla / tejido / patrón" sin salir del formulario
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
// Agregar un valor es un guardado aparte del producto; lo firma quien inició el alta (`useFirmaDeMitad`), sin combo
// propio desde 2026-09-29. Vive dentro de las hojas de tallas y muestras, de ahí el aviso `enHoja`.
//
// Desde 2026-10-02 (Felipe) el botón es un botón de verdad y se pone donde se ve: en la cabecera de la hoja de tejidos y
// patrones (`<Modal acciones=…>`), no como un enlace al fondo; y abre su propio modal corto en vez de desplegar el campo en
// línea. El formulario es el mismo; solo cambió dónde se pide.

// El ejemplo de la caja ya no vive aquí: sigue a la familia de la categoría y evita lo que ya existe
// (`lib/sugerencias-alta-producto.ts`, skill `/sugerir`). «Ej. 44» le decía «talla de zapato» a quien armaba una casaca.
const TEXTOS: Record<TipoVocabulario, { boton: string; singular: string; titulo: string }> = {
  tallas: { boton: "+ Nueva talla", singular: "talla", titulo: "Nueva talla" },
  tejidos: { boton: "+ Nuevo tejido", singular: "tejido", titulo: "Nuevo tejido" },
  patrones: { boton: "+ Nuevo patrón", singular: "patrón", titulo: "Nuevo patrón" },
};

type Props = {
  tipo: TipoVocabulario;
  categoriaId: string;
  /** `familias.codigo` de la categoría: de ella sale el ejemplo de la caja. Sin ella (Editar producto aún no la pasa), texto neutro. */
  familia?: string | null;
  /** Lo que la categoría ofrece HOY en los tres ejes: la RPC reemplaza, así que hay que devolverlo entero + el valor nuevo. */
  ejesActuales: EjeIds;
  /** Todo el vocabulario aprobado de este tipo (no solo lo que la categoría ofrece): para reconocer un valor que ya existe. */
  universo: ValorVocabulario[];
  onCreado: (valor: ValorVocabulario) => void;
};

export function ProponerValor(props: Props) {
  const [abierto, setAbierto] = useState(false);
  const t = TEXTOS[props.tipo];
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="btn-cayla btn-primario h-9 whitespace-nowrap">
        {t.boton}
      </button>
      {abierto && (
        <Modal
          variante="hoja"
          ancho="max-w-md"
          titulo={t.titulo}
          subtitulo="¿No está? Agrégalo. Si no eres Líder, queda pendiente hasta que un Líder lo apruebe."
          onClose={() => setAbierto(false)}
        >
          {(cerrar) => <ProponerValorAbierto {...props} onCerrar={cerrar} />}
        </Modal>
      )}
    </>
  );
}

function ProponerValorAbierto({ tipo, categoriaId, familia, ejesActuales, universo, onCreado, onCerrar }: Props & { onCerrar: () => void }) {
  const [texto, setTexto] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firma = useFirmaDeMitad("alta_producto_valor");
  const t = TEXTOS[tipo];

  async function agregar() {
    const limpio = texto.trim();
    if (!limpio || trabajando || !firma.listo) return;
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
      : await proponerValorVocabulario(tipo, limpio, firma.encabezados());
    if (errCrear || !valor) {
      setError(errCrear);
      setTrabajando(false);
      return;
    }
    if (!valor.aprobado) {
      avisar.aviso(`Propuesta enviada: ${valor.texto}`, { detalle: "Un Líder tiene que aprobarla en Catálogo → Atributos antes de poder usarla." });
      setTrabajando(false);
      setTexto("");
      onCerrar();
      return;
    }

    const errOfrecer = await guardarEjesCategoria(categoriaId, sumarAlEje(ejesActuales, tipo, valor.id), firma.encabezados());
    setTrabajando(false);
    if (errOfrecer) {
      setError(`«${valor.texto}» ya está en el catálogo, pero no se pudo ofrecer en esta categoría: ${errOfrecer} Vuelve a tocar «Agregar»: no se crea otra vez.`);
      return;
    }
    avisar.exito(`${valor.texto} agregada a la categoría`);
    onCreado({ id: valor.id, texto: valor.texto });
    setTexto("");
    onCerrar();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`nuevo-${tipo}`}>
          Nombre {tipo === "tallas" ? "de la" : "del"} {t.singular} nuev{tipo === "tallas" ? "a" : "o"}
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
          placeholder={sugerirValorNuevo(tipo, familia, universo).texto}
          disabled={trabajando}
          className="caja-cayla h-10 min-w-0 flex-1 px-3 text-sm text-tinta placeholder:text-tinta/45"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => void agregar()}
          disabled={!texto.trim() || trabajando || !firma.listo}
          title={firma.motivo ?? undefined}
          className="btn-cayla btn-primario"
        >
          {trabajando ? "Guardando…" : "Agregar"}
        </button>
        <button type="button" onClick={() => onCerrar()} disabled={trabajando} className="btn-cayla btn-sutil">
          Cancelar
        </button>
      </div>
      <AvisoSinIdentidad firma={firma} enHoja />
      {error && <Aviso tono="error">{error}</Aviso>}

    </div>
  );
}
