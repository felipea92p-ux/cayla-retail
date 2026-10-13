"use client";

import { useEffect, useRef, useState } from "react";
import { SearchX } from "lucide-react";
import { Buscador } from "@/components/ui/Buscador";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { buscarPrendasParaRecibir } from "@/lib/recepcion-envio-acciones";
import { MAX_PRENDAS_PARA_RECIBIR, type CategoriaDeLinea, type PrendaRecepcion } from "@/lib/recepcion-envio-reglas";

// «Ya la tengo» (ADR-0362, fase 4): la prenda que llegó ya existe en el catálogo. Se busca entre las de ESA categoría y marca
// (`fn_prendas_para_recibir`, hasta 30, las que coinciden primero) mientras se escribe —nunca esperando un Enter (ADR-0358, buscador)— y se
// elige con un toque. Si no está, la salida es crearla como nueva.

export function ElegirPrendaExistente({
  categoria,
  marca,
  onElegir,
  onEsNueva,
}: {
  categoria: CategoriaDeLinea;
  marca: { id: string; nombre: string };
  onElegir: (prenda: PrendaRecepcion) => void;
  onEsNueva: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [prendas, setPrendas] = useState<PrendaRecepcion[] | null>(null);
  // Arranca buscando: al abrirse ya pide las prendas de la categoría y marca.
  const [buscando, setBuscando] = useState(true);
  const [fallo, setFallo] = useState(false);
  // La respuesta que llega tarde (de una búsqueda vieja) no pisa a la última.
  const vuelta = useRef(0);

  function escribir(texto: string) {
    setBusqueda(texto);
    setBuscando(true);
  }

  useEffect(() => {
    const mia = ++vuelta.current;
    const t = window.setTimeout(
      async () => {
        const { prendas: halladas, error } = await buscarPrendasParaRecibir(categoria.id, marca.id, busqueda);
        if (mia !== vuelta.current) return;
        setBuscando(false);
        setFallo(Boolean(error));
        setPrendas(error ? [] : halladas);
      },
      busqueda ? 250 : 0,
    );
    return () => window.clearTimeout(t);
  }, [categoria.id, marca.id, busqueda]);

  const conteo =
    prendas === null
      ? ""
      : prendas.length === 0
        ? ""
        : prendas.length >= MAX_PRENDAS_PARA_RECIBIR
          ? `Las primeras ${MAX_PRENDAS_PARA_RECIBIR}: escribe para encontrar la tuya`
          : `${prendas.length} ${prendas.length === 1 ? "prenda" : "prendas"} de ${categoria.nombre} · ${marca.nombre}`;

  return (
    <div data-guia="recepcion.ya-la-tengo" className="space-y-2.5">
      <Buscador
        valor={busqueda}
        onCambio={escribir}
        buscando={buscando}
        conteo={conteo}
        placeholder="Busca por nombre o código"
        etiqueta={`Buscar la prenda entre ${categoria.nombre} · ${marca.nombre}`}
        autoFocus
      />
      {fallo && (
        <Aviso tono="error" chico titulo="No se pudo buscar">
          Vuelve a escribir en un momento; si sigue, crea la prenda como nueva.
        </Aviso>
      )}
      {prendas !== null && prendas.length === 0 && !fallo && !buscando && (
        <Vacio tamano="chico" icono={<SearchX />} accion={{ texto: "Crearla como nueva", onClick: onEsNueva }}>
          {busqueda ? `No hay ${categoria.nombre.toLowerCase()} de ${marca.nombre} que digan «${busqueda}».` : `Todavía no hay ${categoria.nombre.toLowerCase()} de ${marca.nombre} en el catálogo.`}
        </Vacio>
      )}
      {prendas !== null && prendas.length > 0 && (
        <ul data-resultados className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-sand bg-papel p-1">
          {prendas.map((p) => {
            const tallas = new Set(p.variantes.map((v) => v.talla ?? "Única")).size;
            const colores = new Set(p.variantes.map((v) => v.color ?? "Sin color")).size;
            return (
              <li key={p.productoId}>
                <button type="button" onClick={() => onElegir(p)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-hueso focus-visible:bg-hueso">
                  <MiniaturaPrenda fotoUrl={p.fotoUrl} prefijo={categoria.prefijo} familia={categoria.familia} categoria={categoria.nombre} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-tinta">{p.nombre}</span>
                    <span className="block truncate text-xs text-taupe">
                      {[p.codigo, `${tallas} ${tallas === 1 ? "talla" : "tallas"} · ${colores} ${colores === 1 ? "color" : "colores"}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="text-xs font-medium text-tinta/70">Elegir</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
