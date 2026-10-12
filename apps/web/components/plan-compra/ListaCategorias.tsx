"use client";

import { useMemo, type ReactNode } from "react";
import { ChevronDown, SearchX } from "lucide-react";
import { Buscador } from "@/components/ui/Buscador";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
import { Desplegable, Boton, type Opcion } from "@/components/ui/campos";
import { Encabezado, Tabla } from "@/components/ui/Tabla";
import { Vacio, type FiltroVacio } from "@/components/ui/Vacio";
import { FilaCategoria, columnasDelPlan, plantillaDelPlan } from "@/components/plan-compra/FilaCategoria";
import { LeyendaRango } from "@/components/plan-compra/BarraRango";
import { aplicarFiltro, conteosDeFiltros, filtrarFilas, ordenarFilas, plegarSinMovimiento, type EstadoCampana, type FilaPlan, type FiltroPlan, type OrdenPlan } from "@/lib/plan-compra-reglas";
import type { FamiliaPlan } from "@/lib/plan-compra";

// La tarjeta de las categorías del plan de campaña (ADR-0349): el buscador, las píldoras, la familia y el orden, la leyenda de la barra
// y la tabla, todo en UNA tarjeta (la `Tabla`). Con lo que dicen la familia y el buscador se cuentan las píldoras; la píldora elegida
// recorta lo que se ve. Las categorías sin plan, sin stock y sin ventas se pliegan en una sola línea mientras nadie filtre ni busque:
// con 40 categorías, la mitad no tiene nada que decir en diciembre. La lógica vive en lib/plan-compra-reglas.ts (con su prueba).

const PILDORAS: { clave: FiltroPlan; texto: string }[] = [
  { clave: "todas", texto: "Todas" },
  { clave: "sin", texto: "Sin plan" },
  { clave: "con", texto: "Con plan" },
  { clave: "top", texto: "Las que más venden" },
  { clave: "agotadas", texto: "Se agotaron" },
];

const ORDENES: Opcion<OrdenPlan>[] = [
  { valor: "ventas", texto: "Las que más venden" },
  { valor: "inversion", texto: "Mayor inversión" },
  { valor: "nombre", texto: "A–Z" },
];

export type VistaPlan = "tabla" | "guiado";

/** «indumentaria» → «Indumentaria», cuando la lectura de las familias no trajo su nombre. */
const ponerNombre = (codigo: string) => codigo.charAt(0).toUpperCase() + codigo.slice(1);

export function ListaCategorias({
  filas,
  estado,
  familias,
  filtro,
  onFiltro,
  familia,
  onFamilia,
  q,
  onQ,
  orden,
  onOrden,
  sinMovAbiertas,
  onSinMov,
  onAbrir,
  recientes,
  vista,
  onVista,
  pasoAPaso,
}: {
  filas: readonly FilaPlan[];
  estado: EstadoCampana;
  familias: readonly FamiliaPlan[];
  filtro: FiltroPlan;
  onFiltro: (f: FiltroPlan) => void;
  familia: string;
  onFamilia: (f: string) => void;
  q: string;
  onQ: (q: string) => void;
  orden: OrdenPlan;
  onOrden: (o: OrdenPlan) => void;
  sinMovAbiertas: boolean;
  onSinMov: (abiertas: boolean) => void;
  onAbrir: (f: FilaPlan) => void;
  /** Las categorías guardadas en esta visita: su fila se enciende una vez (la confirmación de que entró). */
  recientes: ReadonlySet<string>;
  /** Cómo se llena el plan: la tabla (cada categoría se abre en su hoja) o el paso a paso (una a la vez, aquí mismo). */
  vista: VistaPlan;
  onVista: (v: VistaPlan) => void;
  /** Lo que se dibuja en vez de la tabla cuando la vista es «Paso a paso». */
  pasoAPaso: ReactNode;
}) {
  const verReal = estado !== "antes";
  const nombreDe = useMemo(() => new Map(familias.map((f) => [f.codigo, f.nombre])), [familias]);
  const opcionesFamilia = useMemo((): Opcion<string>[] => {
    const codigos = [...new Set(filas.map((f) => f.c.familia).filter((c): c is string => !!c))];
    return [
      { valor: "todas", texto: "Todas las familias" },
      ...codigos.map((c) => ({ valor: c, texto: nombreDe.get(c) ?? ponerNombre(c) })).sort((a, b) => a.texto.localeCompare(b.texto, "es")),
    ];
  }, [filas, nombreDe]);

  const { conteos, aplicadas } = useMemo(() => {
    const porBuscador = filtrarFilas(filas, { familia, q });
    return { conteos: conteosDeFiltros(porBuscador), aplicadas: ordenarFilas(aplicarFiltro(porBuscador, filtro), orden) };
  }, [filas, familia, q, filtro, orden]);

  const plegar = filtro === "todas" && familia === "todas" && q.trim() === "" && orden === "ventas";
  const { visibles, plegadas } = plegar ? plegarSinMovimiento(aplicadas) : { visibles: aplicadas, plegadas: [] };

  const quitar: FiltroVacio[] = [
    ...(filtro !== "todas" ? [{ texto: PILDORAS.find((p) => p.clave === filtro)!.texto, onQuitar: () => onFiltro("todas") }] : []),
    ...(familia !== "todas" ? [{ texto: opcionesFamilia.find((o) => o.valor === familia)?.texto ?? ponerNombre(familia), onQuitar: () => onFamilia("todas") }] : []),
  ];
  const limpiar = () => {
    onQ("");
    onFiltro("todas");
    onFamilia("todas");
  };

  return (
    <Tabla>
      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          {vista === "tabla" ? (
            <Buscador valor={q} onCambio={onQ} placeholder="Buscar una categoría" etiqueta="Buscar una categoría" atajo className="min-w-0 flex-1 sm:max-w-sm" />
          ) : (
            <p className="min-w-0 flex-1 text-sm text-tinta/70">Una categoría a la vez, de la que más vende a la que menos.</p>
          )}
          <SegmentoDeslizante
            forma="modo"
            etiqueta="Cómo llenar el plan"
            valor={vista}
            onCambio={(v) => onVista(v as VistaPlan)}
            opciones={[
              { clave: "tabla", etiqueta: "Tabla" },
              { clave: "guiado", etiqueta: "Paso a paso" },
            ]}
            className="ml-auto"
          />
        </div>
        {vista === "tabla" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar categorías">
                {PILDORAS.map((p) => (
                  <BotonFiltro key={p.clave} activo={filtro === p.clave} cuenta={conteos[p.clave]} onClick={() => onFiltro(filtro === p.clave && p.clave !== "todas" ? "todas" : p.clave)}>
                    {p.texto}
                  </BotonFiltro>
                ))}
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <Desplegable valor={familia} onValor={onFamilia} opciones={opcionesFamilia} forma="cajaBaja" etiquetaAccesible="Familia" className="w-52" />
                <Desplegable valor={orden} onValor={onOrden} opciones={ORDENES} forma="cajaBaja" etiquetaAccesible="Ordenar por" className="w-52" />
              </span>
            </div>
            <LeyendaRango conVendido={verReal} />
          </>
        )}
      </div>

      {vista === "guiado" ? (
        pasoAPaso
      ) : (
      <>
      <Encabezado columnas={columnasDelPlan(estado)} plantilla={plantillaDelPlan(verReal)} />

      {filas.length === 0 ? (
        <Vacio tamano="chico" icono={<SearchX />} accion={{ texto: "Ir a Categorías", href: "/productos/categorias" }}>
          No hay categorías activas.
        </Vacio>
      ) : visibles.length === 0 && plegadas.length === 0 ? (
        <Vacio
          icono={<SearchX />}
          titulo={q.trim() ? <>Nada coincide con «{q.trim()}»</> : "Ninguna categoría está en este filtro"}
          filtros={quitar}
          acciones={
            <Boton type="button" peso="fantasma" onClick={limpiar}>
              {q.trim() ? "Borrar la búsqueda" : "Quitar los filtros"}
            </Boton>
          }
        >
          {q.trim() ? "Ninguna categoría se llama así. Prueba con otra palabra." : "Cambia el filtro para ver las demás."}
        </Vacio>
      ) : (
        <>
          {visibles.map((f, i) => (
            <FilaCategoria key={f.c.id} f={f} estado={estado} indice={i} recienGuardada={recientes.has(f.c.id)} onAbrir={() => onAbrir(f)} />
          ))}
          {plegadas.length > 0 && (
            <>
              <button
                type="button"
                aria-expanded={sinMovAbiertas}
                onClick={() => onSinMov(!sinMovAbiertas)}
                className="flex w-full items-center gap-3 bg-hueso/60 px-5 py-3 text-left text-sm text-tinta/80 transition-colors hover:bg-hueso"
              >
                <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 transition-transform duration-200 ease-cayla motion-reduce:transition-none ${sinMovAbiertas ? "rotate-180" : ""}`} />
                <span>
                  <b className="font-semibold text-tinta">{plegadas.length}</b> {plegadas.length === 1 ? "categoría sin ventas ni stock" : "categorías sin ventas ni stock"} · no hace falta plan ahora
                </span>
              </button>
              {sinMovAbiertas && plegadas.map((f, i) => <FilaCategoria key={f.c.id} f={f} estado={estado} indice={i} recienGuardada={recientes.has(f.c.id)} onAbrir={() => onAbrir(f)} />)}
            </>
          )}
        </>
      )}
      </>
      )}
    </Tabla>
  );
}
