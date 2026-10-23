"use client";

import { useState, type CSSProperties } from "react";
import { SearchX } from "lucide-react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Buscador } from "@/components/ui/Buscador";
import { Casilla } from "@/components/ui/Casilla";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { categoriasDeLaHoja, type FilaCategoria, type GrupoCategorias } from "@/lib/campana-hoja";

/* ====================================================================
   «Categorías» de la hoja «Configuración» de una campaña (ADR-0488; Felipe 2026-10-23: «ahora se ve todo muy desparramado»).
   Una grilla de casillas por familia en vez de 31 píldoras sueltas: cada familia con su título, su total y una casilla de «toda la
   familia» (a medias si eliges algunas); cada categoría en una fila que se toca entera, con cuántas prendas a la venta trae y una barra
   a escala de la que más trae. Las familias chicas comparten una fila; las categorías sin prendas van plegadas al final. El buscador
   filtra sin tildes por la categoría o por su familia. Orden y filtro: `categoriasDeLaHoja` (lib/campana-hoja.ts, con su prueba).
   ==================================================================== */

export function CategoriasDeCampana({
  categorias,
  prendasDe,
  elegidas,
  onAlternar,
  onFamilia,
}: {
  categorias: readonly { id: string; nombre: string; familia: string }[];
  /** Cuántas prendas a la venta trae cada categoría (`prendasPorCategoria`). */
  prendasDe: ReadonlyMap<string, number>;
  elegidas: ReadonlySet<string>;
  onAlternar: (id: string) => void;
  /** Marca (`true`) o quita (`false`) todas estas categorías de un toque: la casilla de «toda la familia». */
  onFamilia: (ids: string[], marcar: boolean) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const vista = categoriasDeLaHoja(categorias, prendasDe, busqueda);
  // Una categoría sin prendas ya elegida no se esconde: su grupo abre solo. Y si lo buscado solo está ahí, también.
  const sinPrendasAbierta = vista.sinPrendas.some((c) => elegidas.has(c.id)) || (busqueda.trim() !== "" && vista.sinPrendas.length > 0);

  const fila = (c: FilaCategoria, i: number) => (
    <label key={c.id} className="cph-cat" style={{ "--i": i } as CSSProperties} data-cat-id={c.id} data-elegida={elegidas.has(c.id) || undefined} title={`${c.nombre} · ${c.prendas} ${c.prendas === 1 ? "prenda" : "prendas"} a la venta`}>
      <Casilla marcada={elegidas.has(c.id)} onCambio={() => onAlternar(c.id)} etiqueta={`${c.nombre}, ${c.prendas} ${c.prendas === 1 ? "prenda" : "prendas"}`} />
      {/* Un espacio invisible tras cada «/»: en el celular «Ropa interior/Lencería» baja después de la barra, no a media palabra. */}
      <span className="cph-cat-n">{c.nombre.replaceAll("/", "/\u200b")}</span>
      <span className="cph-cat-c">{c.prendas.toLocaleString("es-PE")}</span>
      {vista.mayor > 0 && c.prendas > 0 && (
        <BarraAvance pct={Math.max(3, (c.prendas / vista.mayor) * 100)} alto="fina" tono="tinta" decorativa indice={i} className="cph-cat-b" />
      )}
    </label>
  );

  const grupo = (g: GrupoCategorias, chica: boolean) => {
    // «Toda la familia» es toda: también las categorías sin prendas (plegadas abajo) y las que no coinciden con lo buscado.
    const ids = g.todas;
    const marcadas = ids.filter((id) => elegidas.has(id)).length;
    return (
      <div key={g.familia} className="cph-fam">
        {/* La fila del título se toca entera (como cada categoría): la casilla sola medía 20 px. El teclado usa la casilla, que es el
            control; su clic no sube hasta aquí (`Casilla` lo detiene). */}
        <div className="cph-fam-cab" onClick={() => onFamilia(ids, marcadas < ids.length)}>
          <Casilla
            marcada={marcadas === ids.length}
            aMedias={marcadas > 0 && marcadas < ids.length}
            onCambio={() => onFamilia(ids, marcadas < ids.length)}
            etiqueta={`Toda la familia ${g.familia}, ${ids.length} ${ids.length === 1 ? "categoría" : "categorías"}`}
          />
          <TituloGrupo nota={`${g.total.toLocaleString("es-PE")}${chica ? "" : " prendas"}`} className="cph-fam-t">
            {g.familia}
          </TituloGrupo>
        </div>
        <div className="cph-cats">{g.categorias.map(fila)}</div>
      </div>
    );
  };

  return (
    <div className="cph-categorias">
      <Buscador
        valor={busqueda}
        onCambio={setBusqueda}
        placeholder="Busca una categoría o una familia" // sugerir-fijo: busca en todas las categorías; no depende de nada elegido antes
        etiqueta="Buscar una categoría"
        className="cph-buscador"
      />
      {vista.coinciden === 0 ? (
        <Vacio tamano="chico" alinear="izquierda" icono={<SearchX />} accion={{ texto: "Borrar la búsqueda", onClick: () => setBusqueda("") }}>
          Ninguna categoría se llama «{busqueda.trim()}».
        </Vacio>
      ) : (
        <>
          {vista.grandes.map((g) => grupo(g, false))}
          {vista.chicas.length > 0 && <div className="cph-chicas">{vista.chicas.map((g) => grupo(g, true))}</div>}
        </>
      )}
      {vista.sinPrendas.length > 0 && (
        // La llave cambia al abrirse sola: así un <details> que la persona cerró vuelve a abrir cuando hay algo que mostrar.
        <details key={sinPrendasAbierta ? "abierta" : "plegada"} open={sinPrendasAbierta || undefined} className="cph-sinp">
          <summary>
            {vista.sinPrendas.length} {vista.sinPrendas.length === 1 ? "categoría" : "categorías"} sin prendas a la venta
            <span> · elígelas si te van a llegar</span>
          </summary>
          <div className="cph-cats">{vista.sinPrendas.map(fila)}</div>
        </details>
      )}
    </div>
  );
}
