"use client";

import { useEffect, useState } from "react";
import { leerPrendasCreadasDelEnvio } from "@/lib/recepcion-envio-acciones";
import { anteriorDeLaCategoria, type PrendaAnterior, type PrendaCreada } from "@/lib/recepcion-igual-que-anterior";

/**
 * «Igual que la anterior» para una pantalla de Recibir (Contar y «Crear ahora» de «Para después»; innovar `recibir-crear-prenda#1`): lee de la
 * base las prendas del envío creadas desde que se abrió (sobreviven a recargar) y suma al momento la que se crea en la pantalla, sin esperar a
 * releer. `anteriorDe` da la última de una categoría. Sin respuesta de la base, la ficha usa solo lo creado en la pantalla.
 */
export function usePrendasCreadas(productoIds: readonly string[], desde: string | null) {
  const [creadas, setCreadas] = useState<PrendaCreada[]>([]);
  const clave = productoIds.join(",");
  useEffect(() => {
    let vivo = true;
    void leerPrendasCreadasDelEnvio(clave ? clave.split(",") : [], desde).then((leidas) => {
      // Lo leído manda; lo creado en la pantalla que la base todavía no devuelve se conserva.
      if (vivo) setCreadas((ya) => [...leidas, ...ya.filter((c) => !leidas.some((l) => l.nombre === c.nombre && l.categoriaId === c.categoriaId))]);
    });
    return () => {
      vivo = false;
    };
  }, [clave, desde]);
  return {
    anteriorDe: (categoriaId: string): PrendaAnterior | null => anteriorDeLaCategoria(creadas, categoriaId),
    recordar: (p: PrendaAnterior) => setCreadas((ya) => [...ya, { ...p, creadaEn: new Date().toISOString() }]),
  };
}
