"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoSelect } from "@/components/ui/campos";
import { FotoDePrenda } from "@/components/ui/FotoDePrenda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ElegirPrendaExistente } from "@/components/recepcion-envio/ElegirPrendaExistente";
import { buscarParecidasParaRecibir, leerFichaDePrenda } from "@/lib/recepcion-envio-acciones";
import { tallasYColoresDe, type CategoriaDeLinea, type FichaParaRecibir, type PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import type { ControlResponsable } from "@/lib/useResponsable";

// Lo contado como nuevo puede ser una prenda que ya estaba en el catálogo (Felipe 2026-11-06, ADR-0393): antes de crear se pregunta si ya existe. Se busca con lo
// que se anotó al contar: su categoría, su marca y su nombre; el costo no se pide otra vez, sigue con la prenda (`ligar_prenda_a_pendiente` lo pasa a la elegida).
// Solo se elige dentro de la marca anotada, porque la base no deja mezclar marcas en una línea; una prenda con ese nombre en otra marca se avisa, para no crearla repetida.
//
// La categoría sí se corrige aquí, con el envío cerrado y en lo de fuera de la guía (Felipe 2026-11-06): se anotó «Polos» y era un top. Cambiar el combo solo busca, no
// guarda nada; el modelo pasa a su categoría al confirmar (`cambiar_categoria_de_pendiente`). Tocar una sugerencia abre su ficha, para reconocerla antes de decir «es esta».

export function YaExisteLaPrenda({
  categoria: categoriaAnotada,
  marca,
  nombre,
  cantidad,
  costo,
  comoCorregirMarca,
  categorias = [],
  responsable,
  onPasarACategoria,
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
  /** Quién firma el cambio de categoría. */
  responsable?: ControlResponsable;
  /** Pasa el modelo a esa categoría. Devuelve el error en palabras, o `null` si quedó. */
  onPasarACategoria?: (categoriaId: string) => Promise<string | null>;
  /** `cambioCategoria`: el modelo acaba de pasar a otra categoría. */
  onUsar: (prenda: PrendaRecepcion, cambioCategoria: boolean) => Promise<void> | void;
  onCrear: (cambioCategoria: boolean) => void;
  onCerrar: () => void;
}) {
  const [categoria, setCategoria] = useState(categoriaAnotada);
  const [elegida, setElegida] = useState<PrendaRecepcion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enOtraMarca, setEnOtraMarca] = useState<PrendaRecepcion[]>([]);
  const cambio = categoria.id !== categoriaAnotada.id;

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
    setError(null);
  }

  /** Guarda el cambio de categoría, si lo hay. Si la base lo niega, se dice y no se sigue. */
  async function pasarSiCambio(): Promise<boolean> {
    if (!cambio || !onPasarACategoria) return true;
    const problema = await onPasarACategoria(categoria.id);
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
            <CampoSelect
              etiqueta="Categoría"
              valor={categoria.id}
              onValor={elegirCategoria}
              deshabilitado={guardando}
              opciones={[categoriaAnotada, ...categorias.filter((c) => c.id !== categoriaAnotada.id)].map((c) => ({ valor: c.id, texto: c.nombre }))}
              sinPie
            />
            {cambio && (
              <p className="nota-cayla text-sm">
                Se anotó en {categoriaAnotada.nombre}. Al confirmar, {cantidad === 1 ? "esta prenda pasa" : `estas ${prendas} pasan`} a {categoria.nombre}.
              </p>
            )}
            {cambio && responsable && <ComboResponsable control={responsable} deshabilitado={guardando} />}
          </div>
        )}

        {elegida ? (
          <FichaDeLaPrenda
            key={elegida.productoId}
            prenda={elegida}
            categoria={categoria}
            marca={marca}
            prendas={prendas}
            costoEscrito={costoEscrito}
          />
        ) : (
          <ElegirPrendaExistente categoria={categoria} marca={marca} busquedaInicial={nombre ?? ""} textoElegir="Ver ficha" onElegir={setElegida} onEsNueva={() => void crear()} />
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
            <Boton type="button" peso="fantasma" disabled={guardando} onClick={() => setElegida(null)}>
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

/** La ficha para reconocer la prenda: la foto en grande y lo esencial. Lo que no está registrado se dice, porque también ayuda a decidir. */
function FichaDeLaPrenda({
  prenda,
  categoria,
  marca,
  prendas,
  costoEscrito,
}: {
  prenda: PrendaRecepcion;
  categoria: CategoriaDeLinea;
  marca: { id: string | null; nombre: string };
  prendas: string;
  costoEscrito: string | null;
}) {
  // `null`: todavía no llega. `false`: no se pudo leer; se decide con la foto, el nombre y las tallas.
  const [ficha, setFicha] = useState<FichaParaRecibir | null | false>(null);

  useEffect(() => {
    let vigente = true;
    void leerFichaDePrenda(prenda.productoId).then((f) => {
      if (vigente) setFicha(f ?? false);
    });
    return () => {
      vigente = false;
    };
  }, [prenda.productoId]);

  const { tallas, colores } = tallasYColoresDe(prenda);
  const leida = ficha || null;
  const dato = (valor: string | null | undefined) => (ficha === null ? "…" : valor?.trim() || "Sin registrar");
  const filas: [string, string][] = [
    ["Marca", leida?.marca ?? marca.nombre],
    ["Categoría", leida?.categoria ?? categoria.nombre],
    ["Material", dato(leida?.material)],
    ["Patrón", dato(leida?.patron)],
    ["Tallas", tallas.join(", ")],
    ["Colores", colores.join(", ")],
  ];

  return (
    <div className="space-y-3 rounded-xl border border-sand bg-hueso p-3">
      <div className="grid gap-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[13rem]">
          <FotoDePrenda fotoUrl={prenda.fotoUrl} prefijo={categoria.prefijo} familia={categoria.familia} categoria={categoria.nombre} />
        </div>
        <div className="min-w-0 space-y-3">
          <p className="text-sm">
            <b className="block text-tinta">¿Llegó esta?</b>
            <span className="block text-base text-tinta">{prenda.nombre}</span>
            {prenda.codigo && <span className="block text-taupe">{prenda.codigo}</span>}
          </p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            {filas.map(([rotulo, valor]) => (
              <div key={rotulo} className="contents">
                <dt className="text-taupe">{rotulo}</dt>
                <dd className="text-tinta">{valor}</dd>
              </div>
            ))}
          </dl>
          <div className="text-sm">
            <p className="text-taupe">Descripción</p>
            <p className="whitespace-pre-line text-tinta">{dato(leida?.descripcion)}</p>
          </div>
          {ficha === false && <p className="text-sm text-taupe">No se pudo leer toda su ficha. Puedes decidir con la foto y las tallas, o volver a abrirla.</p>}
        </div>
      </div>
      <p className="text-sm text-taupe">
        Las {prendas} quedan como esta prenda{costoEscrito ? `, con el costo de ${costoEscrito}` : ""}. Después pones sus tallas y colores.
      </p>
    </div>
  );
}
