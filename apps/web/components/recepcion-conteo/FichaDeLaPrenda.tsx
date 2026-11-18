"use client";

import { useEffect, useState } from "react";
import { FotoDePrenda } from "@/components/ui/FotoDePrenda";
import { leerFichaDePrenda } from "@/lib/recepcion-envio-acciones";
import { tallasYColoresDe, type CategoriaDeLinea, type FichaParaRecibir, type PrendaRecepcion } from "@/lib/recepcion-envio-reglas";

// La ficha de una prenda del catálogo para reconocerla antes de decir «es esta» (Felipe 2026-11-06): la usan «¿Esta prenda ya existe?» de un envío cerrado
// y «Ya la tenemos» de «Otro modelo» al contar (Felipe 2026-11-07).

/** La ficha para reconocer la prenda: la foto en grande y lo esencial. Lo que no está registrado se dice, porque también ayuda a decidir. */
export function FichaDeLaPrenda({
  prenda,
  categoria,
  marca,
  nota,
}: {
  prenda: PrendaRecepcion;
  categoria: CategoriaDeLinea;
  marca: { id: string | null; nombre: string };
  /** Qué pasa con lo contado si se elige esta prenda. */
  nota: string;
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
      <p className="text-sm text-taupe">{nota}</p>
    </div>
  );
}
