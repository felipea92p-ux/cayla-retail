"use client";

import { useMemo, useState } from "react";
import { Check, SearchX } from "lucide-react";
import { Buscador } from "@/components/ui/Buscador";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { SinFoto } from "@/components/ui/PrendaCelda";
import { Vacio } from "@/components/ui/Vacio";
import { paginar } from "@/lib/paginacion";
import {
  categoriasParaLook,
  hayModeloEnTienda,
  modelosParaElegir,
  nombreCortoDeTienda,
  PRENDAS_POR_PAGINA_LOOK,
  SIN_PRENDAS_POR_TIENDA,
  type ModeloParaLook,
  type PrendasPorTienda,
} from "@/lib/vitrina-looks-reglas";

/**
 * Elegir las prendas de un look MIRÁNDOLAS (Felipe 2026-10-26: «es complicado elegir las prendas por sus nombres»): las categorías arriba como
 * píldoras (filtrar = `pildora-cayla`, ADR-0358), un buscador, y debajo la grilla de fotos de los modelos que se ven en la web; tocar una prenda
 * la elige y volver a tocarla la quita. Con el look lleno (4), las demás se apagan hasta que se quite una. No guarda nada ni decide qué se ve
 * en la web: la hoja recibe `onElegir` / `onQuitar` y su lista de modelos ya viene filtrada a los que se ven. Con `porTienda` (qué hay en cada tienda) suma el filtro
 * «Hay en: TRU / AQP / LIM» para armar el look con prendas de una misma tienda (Felipe 2026-10-27); sin él, la grilla es la de siempre. La lógica (categorías, filtro) es pura:
 * `lib/vitrina-looks-reglas.ts`.
 */
export function ElegirPrendasLook({
  modelos,
  elegidos,
  lleno,
  deshabilitado = false,
  porTienda = SIN_PRENDAS_POR_TIENDA,
  onElegir,
  onQuitar,
}: {
  modelos: readonly ModeloParaLook[];
  /** Los ids de las prendas que ya están en el look. */
  elegidos: ReadonlySet<string>;
  /** El look ya tiene el máximo: lo que no está elegido no se puede agregar. */
  lleno: boolean;
  deshabilitado?: boolean;
  /** Qué hay en cada tienda (vacío: no se sabe, y el filtro no se dibuja). */
  porTienda?: PrendasPorTienda;
  onElegir: (id: string) => void;
  onQuitar: (id: string) => void;
}) {
  const [categoria, setCategoria] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [pagina, setPagina] = useState(1);
  // La tienda por la que se filtra (su id) o ninguna.
  const [tienda, setTienda] = useState<string | null>(null);
  const categorias = useMemo(() => categoriasParaLook(modelos), [modelos]);
  const porTiendaContadas = useMemo(
    () => porTienda.tiendas.map((t) => ({ ...t, cuantos: modelos.filter((m) => hayModeloEnTienda(porTienda, m, t.id)).length })),
    [modelos, porTienda],
  );
  const lista = modelosParaElegir(modelos, { categoria, texto }).filter((m) => tienda === null || hayModeloEnTienda(porTienda, m, tienda));
  const pag = paginar(lista, pagina, PRENDAS_POR_PAGINA_LOOK);
  // Cambiar la categoría o lo escrito vuelve a la primera página (se ajusta al dibujar, como pide React).
  const clave = `${categoria ?? ""}|${texto}|${tienda ?? ""}`;
  const [claveVista, setClaveVista] = useState(clave);
  if (claveVista !== clave) {
    setClaveVista(clave);
    setPagina(1);
  }

  return (
    <div className="space-y-3" data-guia="look.elegir">
      <Buscador
        valor={texto}
        onCambio={setTexto}
        placeholder="Busca una prenda"
        conteo={texto.trim() ? `${lista.length} ${lista.length === 1 ? "coincide" : "coinciden"}` : undefined}
      />
      {categorias.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categorías">
          <button type="button" className="pildora-cayla" aria-pressed={categoria === null} onClick={() => setCategoria(null)}>
            {`Todas · ${modelos.length}`}
          </button>
          {categorias.map((c) => (
            <button key={c.nombre} type="button" className="pildora-cayla" aria-pressed={categoria === c.nombre} onClick={() => setCategoria(categoria === c.nombre ? null : c.nombre)}>
              {`${c.nombre} · ${c.modelos}`}
            </button>
          ))}
        </div>
      )}

      {porTiendaContadas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Dónde hay la prenda" data-guia="look.tienda">
          <span className="text-[12px] text-taupe">Hay en</span>
          <button type="button" className="pildora-cayla" aria-pressed={tienda === null} onClick={() => setTienda(null)}>
            Cualquier tienda
          </button>
          {porTiendaContadas.map((t) => (
            <button key={t.id} type="button" className="pildora-cayla" aria-pressed={tienda === t.id} onClick={() => setTienda(tienda === t.id ? null : t.id)}>
              {`${nombreCortoDeTienda(t.nombre)} · ${t.cuantos}`}
            </button>
          ))}
        </div>
      )}

      {lista.length === 0 ? (
        <Vacio icono={<SearchX />} tamano="chico">
          {modelos.length === 0 ? "No quedan modelos que se vean en la web." : tienda !== null ? "Ninguna prenda de esta búsqueda hay en esa tienda: prueba con otra tienda, categoría o palabra." : "Ninguna prenda coincide: prueba con otra categoría o con otra palabra."}
        </Vacio>
      ) : (
        <ul className="tw-elegir" aria-label="Las prendas que se pueden agregar">
          {pag.filas.map((m) => {
            const elegido = elegidos.has(m.id);
            const bloqueada = lleno && !elegido;
            const foto = m.foto ?? m.colores.find((c) => c.foto)?.foto ?? null;
            const sinFoto = <SinFoto tamano="h-full w-full !rounded-none" colorHex={m.colores[0]?.hex ?? null} prefijo={m.prefijo} familia={m.familia} categoria={m.categoria} conNombre />;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className="tw-elegir-tile"
                  aria-pressed={elegido}
                  aria-label={elegido ? `Quitar ${m.nombre} del look` : `Agregar ${m.nombre} al look`}
                  disabled={deshabilitado || bloqueada}
                  title={bloqueada ? "El look ya tiene 4 prendas: quita una para cambiarla." : undefined}
                  onClick={() => (elegido ? onQuitar(m.id) : onElegir(m.id))}
                >
                  <span className="tw-elegir-foto">
                    {foto ? <ImagenDePrenda src={foto} alt="" fill sizes="160px" className="object-cover" fondo={m.colores[0]?.hex ?? null} fallback={sinFoto} /> : sinFoto}
                    <span aria-hidden className="tw-elegir-visto">
                      <Check /* unificar-fijo: la marca sobre un punto lleno lleva trazo 3, como la casilla (ronda 15) */ strokeWidth={3} />
                    </span>
                  </span>
                  <span className="tw-elegir-nombre">{m.nombre}</span>
                  {categoria === null && m.categoria && <span className="tw-elegir-categoria">{m.categoria}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {pag.totalPaginas > 1 && (
        <div className="flex justify-center pt-1">
          <PaginacionLocal pagina={pag.pagina} totalPaginas={pag.totalPaginas} onPagina={setPagina} />
        </div>
      )}
    </div>
  );
}
