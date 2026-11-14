"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, SearchX } from "lucide-react";
import { Buscador } from "@/components/ui/Buscador";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { FotoDePrenda } from "@/components/ui/FotoDePrenda";
import { Chip } from "@/components/ui/Chip";
import { buscarParecidasParaRecibir, buscarPrendasParaRecibir, leerRecibidasDelProveedorEnLaBase } from "@/lib/recepcion-envio-acciones";
import { MAX_PRENDAS_PARA_RECIBIR, type CategoriaDeLinea, type PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import { MAX_COLORES_EN_TARJETA, coloresDeLaPrenda, galeriaDePrendas, porQueArriba, type ReferenciaDelModelo } from "@/lib/recepcion-galeria-reglas";

// «Ya la tengo» (ADR-0362, fase 4): la prenda que llegó ya existe en el catálogo. Se busca entre las de ESA categoría y marca
// (`fn_prendas_para_recibir`, hasta 30) o de todas las marcas (`fn_parecidas_para_recibir`, hasta 200) mientras se escribe —nunca esperando
// un Enter (ADR-0358, buscador)—.
//
// Desde el 2026-11-14 (tablero de Recibir, tarea 9) es una GALERÍA: la reposición se reconoce por la foto, así que cada prenda es una tarjeta
// con su foto en grande, su nombre, su marca y sus colores. Al escribir quedan solo las que coinciden (antes solo se ordenaban) y salen
// primero las marcas que ya trae el envío (`galeriaDePrendas`, lógica pura con su prueba). Tocar una tarjeta la ELIGE ahí mismo, sin abrir su
// ficha: descartar una candidata ya no cuesta abrir y volver. La ficha queda a un toque («Ver ficha») para cuando haya duda.
// Arriba van las más parecidas (Felipe 2026-11-14): lo que este proveedor ya mandó, y lo de mismo costo y precio que el modelo que llegó; cada
// tarjeta dice su porqué en una línea. Lo que ya está en la lista del envío lleva «En tu lista» sobre la foto.

export function ElegirPrendaExistente({
  categoria,
  marca,
  busquedaInicial = "",
  todasLasMarcas = false,
  marcasDelEnvio = [],
  elegidaId = null,
  proveedorIds = [],
  referencia = null,
  enLaLista,
  onElegir,
  onVerFicha,
  onEsNueva,
}: {
  categoria: CategoriaDeLinea;
  /** `id` vacío = sin marca (ADR-0393, 2026-10-14). */
  marca: { id: string | null; nombre: string };
  /** Lo que ya se sabe de la prenda: se escribe en el buscador al abrir. */
  busquedaInicial?: string;
  /** Busca en todas las marcas de la categoría (`fn_parecidas_para_recibir`), y cada tarjeta dice la suya. `marca` queda solo como nombre del filtro. */
  todasLasMarcas?: boolean;
  /** Las marcas que ya trae este envío: sus prendas salen primero. */
  marcasDelEnvio?: readonly (string | null)[];
  /** La tarjeta elegida, marcada con su ✓. */
  elegidaId?: string | null;
  /** Los proveedores del envío: lo que ya mandaron sale primero (`fn_recibidas_del_proveedor`). */
  proveedorIds?: readonly string[];
  /** El costo y el precio del modelo que llegó: lo de mismo costo y precio sale arriba. */
  referencia?: ReferenciaDelModelo | null;
  /** Las prendas que ya están en la lista del envío. */
  enLaLista?: ReadonlySet<string>;
  onElegir: (prenda: PrendaRecepcion) => void;
  /** Abre la ficha de la elegida. Sin él, no se ofrece. */
  onVerFicha?: () => void;
  onEsNueva: () => void;
}) {
  const [busqueda, setBusqueda] = useState(busquedaInicial);
  const [prendas, setPrendas] = useState<PrendaRecepcion[] | null>(null);
  // Arranca buscando: al abrirse ya pide las prendas de la categoría y marca.
  const [buscando, setBuscando] = useState(true);
  const [fallo, setFallo] = useState(false);
  // La respuesta que llega tarde (de una búsqueda vieja) no pisa a la última.
  const vuelta = useRef(0);
  // Lo que ya mandó el proveedor: se pide una vez por categoría. Si no responde, la galería ordena sin ello.
  const [recibidas, setRecibidas] = useState<ReadonlyMap<string, string>>(new Map());
  const claveProveedores = [...proveedorIds].sort().join(",");
  useEffect(() => {
    let vigente = true;
    const ids = claveProveedores ? claveProveedores.split(",") : [];
    void leerRecibidasDelProveedorEnLaBase(categoria.id, ids).then((m) => {
      if (vigente) setRecibidas(m);
    });
    return () => {
      vigente = false;
    };
  }, [categoria.id, claveProveedores]);

  function escribir(texto: string) {
    setBusqueda(texto);
    setBuscando(true);
  }

  useEffect(() => {
    const mia = ++vuelta.current;
    const t = window.setTimeout(
      async () => {
        const { prendas: halladas, error } = todasLasMarcas
          ? await buscarParecidasParaRecibir(categoria.id, busqueda).then((prendas) => ({ prendas, error: null }))
          : await buscarPrendasParaRecibir(categoria.id, marca.id, busqueda);
        if (mia !== vuelta.current) return;
        setBuscando(false);
        setFallo(Boolean(error));
        setPrendas(error ? [] : halladas);
      },
      busqueda ? 250 : 0,
    );
    return () => window.clearTimeout(t);
  }, [categoria.id, marca.id, busqueda, todasLasMarcas]);

  const galeria = useMemo(
    () => (prendas ? galeriaDePrendas(prendas, { busqueda, marcasDelEnvio, recibidas, referencia }) : null),
    [prendas, busqueda, marcasDelEnvio, recibidas, referencia],
  );
  const elegida = elegidaId ? galeria?.find((p) => p.productoId === elegidaId) ?? prendas?.find((p) => p.productoId === elegidaId) ?? null : null;

  // `fn_parecidas_para_recibir` trae hasta 200; `fn_prendas_para_recibir`, hasta MAX_PRENDAS_PARA_RECIBIR.
  const tope = todasLasMarcas ? 200 : MAX_PRENDAS_PARA_RECIBIR;
  const conteo =
    galeria === null || galeria.length === 0
      ? ""
      : !busqueda.trim() && (prendas?.length ?? 0) >= tope
        ? `Las primeras ${tope}: escribe para encontrar la tuya`
        : `${galeria.length} ${galeria.length === 1 ? "prenda" : "prendas"}`;
  // Cómo se nombra lo que se busca: «polos de Miramhe», «polos sin marca» o, en todas las marcas, solo «polos».
  const deQue = `${categoria.nombre.toLowerCase()}${todasLasMarcas ? "" : marca.id ? ` de ${marca.nombre}` : " sin marca"}`;
  const hayEnLaCategoria = (prendas?.length ?? 0) > 0;

  return (
    <div data-guia="recepcion.ya-la-tengo" className="space-y-2.5">
      <Buscador
        valor={busqueda}
        onCambio={escribir}
        buscando={buscando}
        conteo={conteo}
        placeholder="Nombre, código, marca o color" // sugerir-fijo: dice en qué se busca, no un ejemplo de prenda
        etiqueta={`Buscar la prenda entre ${todasLasMarcas ? categoria.nombre : `${categoria.nombre} · ${marca.nombre}`}`}
        autoFocus
      />
      {fallo && (
        <Aviso tono="error" chico titulo="No se pudo buscar">
          Vuelve a escribir en un momento; si sigue, crea la prenda como nueva.
        </Aviso>
      )}
      {galeria !== null && galeria.length === 0 && !fallo && !buscando && (
        <Vacio
          tamano="chico"
          icono={<SearchX />}
          // Con algo escrito y prendas en la categoría, lo primero es ver todas: el nombre anotado al contar no siempre es el del catálogo.
          accion={busqueda.trim() && hayEnLaCategoria ? { texto: "Ver todas", onClick: () => escribir("") } : { texto: "Crearla como nueva", onClick: onEsNueva }}
        >
          {busqueda.trim() ? `No hay ${deQue} que digan «${busqueda.trim()}».` : `Todavía no hay ${deQue} en el catálogo.`}
        </Vacio>
      )}
      {/* La línea está desde antes de elegir: si apareciera al tocar, empujaría la galería bajo el dedo (ADR-0185). */}
      {onVerFicha && galeria !== null && galeria.length > 0 && (
        <p className="flex items-baseline gap-1.5 text-sm text-taupe" aria-live="polite">
          {elegida ? (
            <>
              {/* Un nombre largo se recorta; «Ver ficha» queda siempre a la vista, también a 375 px. */}
              <span className="min-w-0 truncate">
                Elegiste <b className="font-semibold text-tinta">{elegida.nombre}</b>
              </span>
              <button type="button" className="btn-enlace shrink-0" onClick={onVerFicha}>
                Ver ficha
              </button>
            </>
          ) : (
            "Toca la que llegó."
          )}
        </p>
      )}
      {galeria !== null && galeria.length > 0 && (
        <ul data-resultados className="rc-galeria" aria-label={`Prendas de ${categoria.nombre}`}>
          {galeria.map((p) => {
            const colores = coloresDeLaPrenda(p);
            const marcaDe = todasLasMarcas ? (p.marca?.nombre ?? "Sin marca") : null;
            const esta = p.productoId === elegidaId;
            const porQue = porQueArriba(p, { recibidas, referencia });
            return (
              <li key={p.productoId}>
                <button type="button" className="rc-galeria-tarjeta" aria-pressed={esta} onClick={() => onElegir(p)}>
                  <span className="rc-galeria-foto">
                    {/* `next/image` carga la foto recién cuando la tarjeta se acerca a la vista: 200 tarjetas no bajan 200 fotos al abrir. */}
                    <FotoDePrenda fotoUrl={p.fotoUrl} colorHex={colores[0]?.hex ?? null} prefijo={categoria.prefijo} familia={categoria.familia} categoria={categoria.nombre} />
                    {esta && (
                      <span className="rc-galeria-visto" aria-hidden>
                        <Check className="h-3.5 w-3.5" strokeWidth={3} /* unificar-fijo: la marca sobre un punto lleno lleva trazo 3 */ />
                      </span>
                    )}
                  </span>
                  {/* Junto al texto y no sobre la foto: sobre una foto rosa o estampada no se leía. */}
                  {enLaLista?.has(p.productoId) && (
                    <span className="rc-galeria-en-lista">
                      <Chip tono="pizarra">En tu lista</Chip>
                    </span>
                  )}
                  <span className="rc-galeria-nombre">{p.nombre}</span>
                  {(marcaDe || p.codigo) && <span className="rc-galeria-dato">{[marcaDe, p.codigo].filter(Boolean).join(" · ")}</span>}
                  {porQue && <span className="rc-galeria-porque">{porQue}</span>}
                  {colores.length > 0 && (
                    <span className="rc-galeria-colores" title={colores.map((c) => c.nombre).join(", ")}>
                      <span className="sr-only">{colores.map((c) => c.nombre).join(", ")}</span>
                      {colores.slice(0, MAX_COLORES_EN_TARJETA).map((c) => (
                        <span key={c.nombre} aria-hidden data-color-dato className="rc-galeria-punto" style={c.hex ? { backgroundColor: c.hex } : undefined} />
                      ))}
                      {colores.length > MAX_COLORES_EN_TARJETA && <span aria-hidden>+{colores.length - MAX_COLORES_EN_TARJETA}</span>}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
