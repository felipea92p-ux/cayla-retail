"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoSelect } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ElegirPrendaExistente } from "@/components/recepcion-envio/ElegirPrendaExistente";
import { buscarParecidasParaRecibir } from "@/lib/recepcion-envio-acciones";
import type { CategoriaDeLinea, PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import { FichaDeLaPrenda } from "./FichaDeLaPrenda";
import type { ControlResponsable } from "@/lib/useResponsable";

// Lo contado como nuevo puede ser una prenda que ya estaba en el catálogo (Felipe 2026-11-06, ADR-0393): antes de crear se pregunta si ya existe. Se busca con lo
// que se anotó al contar: su categoría, su marca y su nombre; el costo no se pide otra vez, sigue con la prenda (`ligar_prenda_a_pendiente` lo pasa a la elegida).
// Solo se elige dentro de la marca anotada, porque la base no deja mezclar marcas en una línea; una prenda con ese nombre en otra marca se avisa, para no crearla repetida.
//
// La categoría y la marca sí se corrigen aquí, con el envío cerrado (Felipe 2026-11-06 y 2026-11-07): se anotó «Polos» y era un top, o «Sin marca» y sí tenía; o el
// aviso decía jeans y llegaron shorts (ahí se corrige la línea entera del aviso, que siempre lleva marca). Cambiar un combo solo busca, no guarda nada; el modelo pasa a su categoría y su marca al confirmar (`cambiar_linea_de_pendiente`). Tocar una tarjeta de la galería la elige ahí mismo (2026-11-14, tarea 9); su ficha queda a un toque, «Ver ficha», para cuando haya duda.

export function YaExisteLaPrenda({
  categoria: categoriaAnotada,
  marca: marcaAnotada,
  nombre,
  cantidad,
  costo,
  comoCorregirMarca,
  categorias = [],
  marcas = [],
  conSinMarca = true,
  responsable,
  onPasarALinea,
  onUsar,
  onCrear,
  onCerrar,
}: {
  categoria: CategoriaDeLinea;
  /** `id` nulo = sin marca. */
  marca: { id: string | null; nombre: string };
  /** Lo anotado al contar. Un nombre provisional («Blusa 1») no: no ayuda a buscar. */
  nombre: string | null;
  cantidad: number;
  /** El costo con el que entra, como se escribe en su campo. `null`: esta persona no lo ve, o todavía no se fija. */
  costo: string | null;
  /** Qué hacer si la marca anotada estaba mal: depende de si el envío sigue abierto. */
  comoCorregirMarca: string;
  /** Las categorías a las que se puede pasar. Vacío: la categoría no se cambia aquí (el envío sigue abierto, o la línea viene de una orden). */
  categorias?: readonly CategoriaDeLinea[];
  /** Las marcas a las que se puede pasar (con «Sin marca» siempre). Vacío: la marca no se cambia aquí. */
  marcas?: readonly { id: string; nombre: string }[];
  /** `false` en una línea del aviso: siempre lleva marca. */
  conSinMarca?: boolean;
  /** Quién firma el cambio. */
  responsable?: ControlResponsable;
  /** Pasa el modelo a esa categoría y esa marca (`null` = sin marca). Devuelve el error en palabras, o `null` si quedó. */
  onPasarALinea?: (categoriaId: string, marcaId: string | null) => Promise<string | null>;
  /** `cambioCategoria`: el modelo acaba de pasar a otra categoría o a otra marca. */
  onUsar: (prenda: PrendaRecepcion, cambioCategoria: boolean) => Promise<void> | void;
  onCrear: (cambioCategoria: boolean) => void;
  onCerrar: () => void;
}) {
  const [categoria, setCategoria] = useState(categoriaAnotada);
  const [marca, setMarca] = useState(marcaAnotada);
  const [elegida, setElegida] = useState<PrendaRecepcion | null>(null);
  /** La ficha de la elegida, abierta: solo si la persona la pide («Ver ficha»). Elegir en la galería ya basta para confirmar. */
  const [conFicha, setConFicha] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enOtraMarca, setEnOtraMarca] = useState<PrendaRecepcion[]>([]);
  const cambio = categoria.id !== categoriaAnotada.id || (marca.id || null) !== (marcaAnotada.id || null);

  useEffect(() => {
    if (!nombre || nombre.trim().length < 2) return;
    let vigente = true;
    void buscarParecidasParaRecibir(categoria.id, nombre).then((prendas) => {
      if (vigente) setEnOtraMarca(prendas.filter((p) => p.coincide && (p.marca?.id ?? null) !== (marca.id || null)).slice(0, 3));
    });
    return () => {
      vigente = false;
    };
  }, [categoria.id, marca.id, nombre]);

  const costoEscrito = costo?.trim() ? `S/ ${costo.trim()}` : null;
  const prendas = `${cantidad} ${cantidad === 1 ? "prenda" : "prendas"}`;

  function elegirCategoria(id: string) {
    const nueva = id === categoriaAnotada.id ? categoriaAnotada : categorias.find((c) => c.id === id);
    if (!nueva) return;
    setCategoria(nueva);
    setElegida(null);
    setConFicha(false);
    setError(null);
  }

  function elegirMarca(id: string) {
    const nueva = id ? marcas.find((m) => m.id === id) : { id: null, nombre: "Sin marca" };
    if (!nueva) return;
    setMarca(nueva);
    setElegida(null);
    setConFicha(false);
    setError(null);
  }

  /** Guarda el cambio de categoría o de marca, si lo hay. Si la base lo niega, se dice y no se sigue. */
  async function pasarSiCambio(): Promise<boolean> {
    if (!cambio || !onPasarALinea) return true;
    const problema = await onPasarALinea(categoria.id, marca.id || null);
    setError(problema);
    return problema === null;
  }

  async function usar(prenda: PrendaRecepcion) {
    setGuardando(true);
    try {
      if (await pasarSiCambio()) await onUsar(prenda, cambio);
    } finally {
      setGuardando(false);
    }
  }

  async function crear() {
    setGuardando(true);
    try {
      if (await pasarSiCambio()) onCrear(cambio);
    } finally {
      setGuardando(false);
    }
  }

  const faltaQuienFirma = cambio && responsable ? !responsable.listo : false;

  return (
    <Modal
      titulo="¿Esta prenda ya existe?"
      subtitulo={[nombre, marca.nombre, categoria.nombre, prendas, costoEscrito ? `costo ${costoEscrito}` : null].filter(Boolean).join(" · ")}
      tamano="mediana"
      conCerrar
      bloqueado={guardando}
      onClose={onCerrar}
    >
      <div className="space-y-4">
        {categorias.length > 0 && (
          <div className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoSelect
              etiqueta="Categoría"
              valor={categoria.id}
              onValor={elegirCategoria}
              deshabilitado={guardando}
              opciones={[categoriaAnotada, ...categorias.filter((c) => c.id !== categoriaAnotada.id)].map((c) => ({ valor: c.id, texto: c.nombre }))}
              sinPie
            />
              {marcas.length > 0 && (
                <CampoSelect
                  etiqueta="Marca"
                  valor={marca.id ?? ""}
                  onValor={elegirMarca}
                  deshabilitado={guardando}
                  opciones={[...(conSinMarca ? [{ valor: "", texto: "Sin marca" }] : []), ...marcas.map((m) => ({ valor: m.id, texto: m.nombre }))]}
                  sinPie
                />
              )}
            </div>
            {cambio && (
              <p className="nota-cayla text-sm">
                Se anotó en {categoriaAnotada.nombre} · {marcaAnotada.id ? marcaAnotada.nombre : "Sin marca"}. Al confirmar,{" "}
                {cantidad === 1 ? "esta prenda pasa" : `estas ${prendas} pasan`} a {categoria.nombre} · {marca.id ? marca.nombre : "Sin marca"}.
              </p>
            )}
            {cambio && responsable && <ComboResponsable control={responsable} deshabilitado={guardando} />}
          </div>
        )}

        {elegida && conFicha ? (
          <FichaDeLaPrenda
            key={elegida.productoId}
            prenda={elegida}
            categoria={categoria}
            marca={marca}
            nota={`Las ${prendas} quedan como esta prenda${costoEscrito ? `, con el costo de ${costoEscrito}` : ""}. Después pones sus tallas y colores.`}
          />
        ) : (
          <ElegirPrendaExistente
            categoria={categoria}
            marca={marca}
            busquedaInicial={nombre ?? ""}
            elegidaId={elegida?.productoId ?? null}
            onElegir={setElegida}
            onVerFicha={() => setConFicha(true)}
            onEsNueva={() => void crear()}
          />
        )}

        {error && <Aviso tono="error">{error}</Aviso>}

        {enOtraMarca.length > 0 && (
          <Aviso tono="atencion" chico titulo={`«${enOtraMarca[0].nombre}» está en otra marca`}>
            {[...new Set(enOtraMarca.map((p) => p.marca?.nombre ?? "Sin marca"))].join(", ")}. Aquí solo se asocia a una prenda de {marca.id ? marca.nombre : "las sin marca"}. {comoCorregirMarca}
          </Aviso>
        )}

        {/* `pie-hoja-fijo`: con la ficha abierta la hoja es larga, y «Sí, es esta» no se va bajo el pliegue. */}
        {elegida ? (
          <div className="pie-hoja-fijo pie-acciones pt-1">
            <Boton
              type="button"
              peso="fantasma"
              disabled={guardando}
              onClick={() => {
                setElegida(null);
                setConFicha(false);
              }}
            >
              No, es otra
            </Boton>
            <Boton type="button" peso="primario" cargando={guardando} disabled={faltaQuienFirma} onClick={() => void usar(elegida)}>
              Sí, es esta
            </Boton>
          </div>
        ) : (
          <div className="pie-acciones">
            <Boton type="button" peso="fantasma" cargando={guardando} textoCargando="Pasando…" disabled={faltaQuienFirma} onClick={() => void crear()}>
              No está, crearla como nueva
            </Boton>
          </div>
        )}
      </div>
    </Modal>
  );
}
