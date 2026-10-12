"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Chip } from "@/components/ui/Chip";
import { paginar } from "@/lib/paginacion";
import { POR_PAGINA_CUADRE, antesYDespues, cifrasDelCuadre, listasDeLaVista, type LineaVista, type ResumenCuadre } from "@/lib/cuadre-piso-reglas";

/*
 * «Revisar» del cuadre del piso (ADR-0328): lo que va a pasar, dicho con las cifras que devolvió la base
 * (`previsualizar_cuadre_piso`, la misma cuenta que aplica `cuadrar_piso`). Nada de aquí calcula: solo muestra.
 * Arriba las cuatro cifras; debajo, el antes → después de la sede; y las listas (lo que baja, lo que sube, lo que no se
 * carga y lo que no se toca), de 20 en 20, como tarjetas a 375 px.
 */

export function CifrasCuadre({ resumen, sede }: { resumen: ResumenCuadre; sede: string }) {
  const c = cifrasDelCuadre(resumen, sede);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <TarjetaCifra etiqueta="Pasan al piso" valor={resumen.prendasAlPiso.toLocaleString("es-PE")} unidad={resumen.prendasAlPiso === 1 ? "prenda" : "prendas"}>
          <span className="text-xs text-taupe">{resumen.lineasAlPiso === 1 ? "1 talla" : `${resumen.lineasAlPiso} tallas`}</span>
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Suben al almacén" valor={resumen.prendasAlAlmacen.toLocaleString("es-PE")} unidad={resumen.prendasAlAlmacen === 1 ? "prenda" : "prendas"}>
          <span className="text-xs text-taupe">{resumen.lineasAlAlmacen === 1 ? "1 talla" : `${resumen.lineasAlAlmacen} tallas`}</span>
        </TarjetaCifra>
        <TarjetaCifra
          etiqueta="No cargadas"
          valor={resumen.prendasNoCargadas.toLocaleString("es-PE")}
          unidad={resumen.prendasNoCargadas === 1 ? "prenda" : "prendas"}
          tono={resumen.prendasNoCargadas > 0 ? "text-ambar-profundo" : undefined}
          className="col-span-2 sm:col-span-1"
        >
          <span className="text-xs text-taupe">No se aplican</span>
        </TarjetaCifra>
      </div>
      <p className="text-sm text-tinta/80">
        {c.alPiso} · {c.alAlmacen} · {c.noCargadas} · <strong className="font-semibold text-tinta">{c.total}</strong>
      </p>
    </div>
  );
}

/** El antes → después de la sede, en prendas libres (lo apartado no se mueve y no está en estas cifras). */
export function AntesDespues({ resumen, sede }: { resumen: ResumenCuadre; sede: string }) {
  const fila = (nombre: string, antes: number, despues: number) => (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-sm text-tinta/80">{nombre}</span>
      <span className="flex items-center gap-2 text-sm tabular-nums text-tinta">
        <span className="text-taupe">{antes.toLocaleString("es-PE")}</span>
        <ArrowRight aria-hidden className="h-3.5 w-3.5 text-taupe" />
        <span className="sr-only">pasa a</span>
        <strong className="font-semibold">{despues.toLocaleString("es-PE")}</strong>
      </span>
    </div>
  );
  return (
    <section className="card-cayla divide-y divide-tinta/10 px-4 py-1 sm:px-5" aria-label={`Antes y después en ${sede}`}>
      {fila("Colgadas en el piso", resumen.antes.piso, resumen.despues.piso)}
      {fila("Guardadas en el almacén", resumen.antes.almacen, resumen.despues.almacen)}
    </section>
  );
}

function Lista({
  titulo,
  ayuda,
  lineas,
  fotos,
  render,
}: {
  titulo: string;
  ayuda: string;
  lineas: LineaVista[];
  fotos: ReadonlyMap<string, string | null>;
  render: (l: LineaVista) => React.ReactNode;
}) {
  const [pagina, setPagina] = useState(1);
  if (lineas.length === 0) return null;
  const p = paginar(lineas, pagina, POR_PAGINA_CUADRE);
  return (
    <section className="card-cayla overflow-hidden" aria-label={titulo}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-tinta/10 px-4 py-3 sm:px-5">
        <h2 className="font-display text-lg text-tinta">
          {titulo} <span className="text-sm tabular-nums text-taupe">· {lineas.length}</span>
        </h2>
        <p className="text-xs text-taupe">{ayuda}</p>
      </header>
      <ul className="divide-y divide-tinta/10">
        {p.filas.map((l) => (
          <li key={l.varianteId} className="flex items-start gap-3 px-4 py-3 sm:px-5">
            <MiniaturaPrenda fotoUrl={fotos.get(l.varianteId) ?? null} tamano="md" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-tinta">{l.prenda}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-taupe">{render(l)}</div>
            </div>
          </li>
        ))}
      </ul>
      {p.totalPaginas > 1 && (
        <footer className="flex items-center justify-between gap-3 border-t border-tinta/10 px-4 py-2 sm:px-5">
          <span className="text-xs tabular-nums text-taupe">
            {p.desde}–{p.hasta} de {lineas.length}
          </span>
          <PaginacionLocal pagina={p.pagina} totalPaginas={p.totalPaginas} onPagina={setPagina} />
        </footer>
      )}
    </section>
  );
}

const flecha = (antes: number, despues: number) => (
  <span className="tabular-nums">
    {antes} → <strong className="font-semibold text-tinta">{despues}</strong>
  </span>
);

export function ListasCuadre({ lineas, fotos, sede }: { lineas: readonly LineaVista[]; fotos: ReadonlyMap<string, string | null>; sede: string }) {
  const listas = listasDeLaVista(lineas);
  return (
    <div className="space-y-4">
      <Lista
        titulo="Pasan al piso"
        ayuda="El sistema las tenía guardadas y nadie las escaneó: están colgadas."
        lineas={listas.alPiso}
        fotos={fotos}
        render={(l) => {
          const d = antesYDespues(l);
          return (
            <>
              <span>Guardadas {flecha(...d.almacen)}</span>
              <span>Colgadas {flecha(...d.piso)}</span>
              {l.apartadas > 0 && <Chip tono="pizarra">{l.apartadas === 1 ? "1 apartada no se mueve" : `${l.apartadas} apartadas no se mueven`}</Chip>}
            </>
          );
        }}
      />
      <Lista
        titulo="Suben al almacén"
        ayuda="Las escaneaste guardadas y el sistema las creía colgadas."
        lineas={listas.alAlmacen}
        fotos={fotos}
        render={(l) => {
          const d = antesYDespues(l);
          return (
            <>
              <span>Colgadas {flecha(...d.piso)}</span>
              <span>Guardadas {flecha(...d.almacen)}</span>
            </>
          );
        }}
      />
      <Lista
        titulo="No cargadas"
        ayuda={`Escaneaste más de las que el sistema tiene en ${sede}. No se aplican: cárgalas aparte.`}
        lineas={listas.noCargadas}
        fotos={fotos}
        render={(l) => (
          <>
            <span className="tabular-nums">
              Escaneadas {l.escaneadas} · el sistema tiene {l.almacen + l.piso}
            </span>
            <Chip tono="ambar">{l.noCargadas === 1 ? "1 no cargada" : `${l.noCargadas} no cargadas`}</Chip>
          </>
        )}
      />
      <Lista
        titulo="No se tocan"
        ayuda="Tallas archivadas o productos de prueba: el cuadre no las mueve."
        lineas={listas.fuera}
        fotos={fotos}
        render={(l) => (
          <>
            <Chip tono="apagado">{l.motivo === "archivada" ? "Archivada" : "No es inventario"}</Chip>
            <span className="tabular-nums">
              Guardadas {l.almacen} · colgadas {l.piso}
              {l.escaneadas > 0 ? ` · escaneadas ${l.escaneadas}` : ""}
            </span>
          </>
        )}
      />
    </div>
  );
}
