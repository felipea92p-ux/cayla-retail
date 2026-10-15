"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

// Lo que la cuenta guardó con el corazón, para TODA tarjeta y la ficha (ADR-0408, actividad 12; maqueta v4, `S.w.favoritos`). Lo lee
// el servidor una vez por petición en el marco del catálogo (`app/(catalogo)/layout.tsx`) y lo reparte aquí: así cada corazón sabe si
// está guardado sin que cada página se lo pase. Cuando un corazón se guarda o se quita, lo anota aquí y los demás corazones del mismo
// modelo en la pantalla (la tarjeta de «Combínalo con» y el corazón grande de la ficha, por ejemplo) cambian con él. Si el servidor
// vuelve a dibujar el marco (una acción que escribe la cookie de la bolsa), manda lo que dice la base.

type Guardados = {
  esFavorito: (productoId: string) => boolean;
  marcar: (productoId: string, guardado: boolean) => void;
  /** Cuántos favoritos tiene ahora (con lo que se acaba de tocar): el globo del corazón de la cabecera, si lo quiere al día. */
  cuantos: number;
};

const Contexto = createContext<Guardados | null>(null);

export function ProveedorGuardados({ favoritos, children }: { favoritos: readonly string[]; children: React.ReactNode }) {
  const huella = favoritos.join(",");
  const [deServidor, setDeServidor] = useState(huella);
  const [lista, setLista] = useState<ReadonlySet<string>>(() => new Set(favoritos));
  // Lo que trae el servidor al volver a dibujar manda (sin un efecto: se ajusta al dibujar).
  if (deServidor !== huella) {
    setDeServidor(huella);
    setLista(new Set(favoritos));
  }
  const marcar = useCallback((productoId: string, guardado: boolean) => {
    setLista((antes) => {
      if (antes.has(productoId) === guardado) return antes;
      const nueva = new Set(antes);
      if (guardado) nueva.add(productoId);
      else nueva.delete(productoId);
      return nueva;
    });
  }, []);
  const valor = useMemo<Guardados>(() => ({ esFavorito: (id) => lista.has(id), marcar, cuantos: lista.size }), [lista, marcar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** Lo guardado de la cuenta, o null fuera del catálogo («Mi cuenta» le pasa a cada corazón lo suyo). */
export const useGuardados = () => useContext(Contexto);
