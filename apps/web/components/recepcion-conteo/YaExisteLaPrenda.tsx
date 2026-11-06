"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { ElegirPrendaExistente } from "@/components/recepcion-envio/ElegirPrendaExistente";
import { buscarParecidasParaRecibir } from "@/lib/recepcion-envio-acciones";
import type { CategoriaDeLinea, PrendaRecepcion } from "@/lib/recepcion-envio-reglas";

// Lo contado como nuevo puede ser una prenda que ya estaba en el catálogo (Felipe 2026-11-06, ADR-0393): antes de crear se pregunta si ya existe. Se busca con lo
// que se anotó al contar: su categoría, su marca y su nombre; el costo no se pide otra vez, sigue con la prenda (`ligar_prenda_a_pendiente` lo pasa a la elegida).
// Solo se elige dentro de la marca anotada, porque la base no deja mezclar marcas en una línea; una prenda con ese nombre en otra marca se avisa, para no crearla repetida.

export function YaExisteLaPrenda({
  categoria,
  marca,
  nombre,
  cantidad,
  costo,
  comoCorregirMarca,
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
  onUsar: (prenda: PrendaRecepcion) => Promise<void> | void;
  onCrear: () => void;
  onCerrar: () => void;
}) {
  const [elegida, setElegida] = useState<PrendaRecepcion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [enOtraMarca, setEnOtraMarca] = useState<PrendaRecepcion[]>([]);

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

  const costoEscrito = costo?.trim() ? `S/\u00a0${costo.trim()}` : null;
  const prendas = `${cantidad} ${cantidad === 1 ? "prenda" : "prendas"}`;

  async function usar(prenda: PrendaRecepcion) {
    setGuardando(true);
    try {
      await onUsar(prenda);
    } finally {
      setGuardando(false);
    }
  }

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
        {elegida ? (
          <div className="nota-cayla sin-i space-y-2.5">
            <div className="flex items-center gap-3">
              <MiniaturaPrenda fotoUrl={elegida.fotoUrl} tamano="md" prefijo={categoria.prefijo} familia={categoria.familia} categoria={categoria.nombre} />
              <p className="min-w-0 text-sm">
                <b className="block text-tinta">¿Llegó esta?</b>
                {elegida.nombre}
                <span className="block text-taupe">{[elegida.codigo, marca.nombre].filter(Boolean).join(" · ")}</span>
              </p>
            </div>
            <p className="text-sm text-taupe">
              Las {prendas} quedan como esta prenda{costoEscrito ? `, con el costo de ${costoEscrito}` : ""}. Después pones sus tallas y colores.
            </p>
            <div className="flex flex-wrap gap-2">
              <Boton type="button" peso="primario" cargando={guardando} onClick={() => void usar(elegida)}>
                Sí, es esta
              </Boton>
              <Boton type="button" peso="fantasma" disabled={guardando} onClick={() => setElegida(null)}>
                No, es otra
              </Boton>
            </div>
          </div>
        ) : (
          <ElegirPrendaExistente categoria={categoria} marca={marca} busquedaInicial={nombre ?? ""} onElegir={setElegida} onEsNueva={onCrear} />
        )}

        {enOtraMarca.length > 0 && (
          <Aviso tono="atencion" chico titulo={`«${enOtraMarca[0].nombre}» está en otra marca`}>
            {[...new Set(enOtraMarca.map((p) => p.marca?.nombre ?? "Sin marca"))].join(", ")}. Aquí solo se asocia a una prenda de {marca.id ? marca.nombre : "las sin marca"}. {comoCorregirMarca}
          </Aviso>
        )}

        {!elegida && (
          <div className="pie-acciones">
            <Boton type="button" peso="fantasma" onClick={onCrear}>
              No está, crearla como nueva
            </Boton>
          </div>
        )}
      </div>
    </Modal>
  );
}
