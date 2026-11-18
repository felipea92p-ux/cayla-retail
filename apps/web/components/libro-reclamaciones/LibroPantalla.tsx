"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, SearchX, Tag } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Buscador } from "@/components/ui/Buscador";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { DesplegablePildora } from "@/components/ui/FiltrosPildora";
import { BotonLimpiar } from "@/components/ui/FiltrosPuestos";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { Encabezado, Tabla, fila } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { HojaCajon } from "@/components/libro-reclamaciones/HojaCajon";
import {
  ESTADO_POR_DEFECTO,
  INSIGNIA,
  OPCIONES_ESTADO,
  POR_PAGINA,
  cifrasDe,
  esFiltroEstado,
  estadoDe,
  fechaCorta,
  filtrar,
  plazoEnPalabras,
  type FiltroEstado,
  type ListaLibro,
} from "@/lib/libro-reclamaciones-reglas";

const RUTA = "/tienda-web/libro-de-reclamaciones";
// Cada hoja en una fila: el número y cuándo llegó, quién y lo que reclama, y el plazo con su estado. En el celular, el número y el estado
// arriba y lo demás debajo, a todo el ancho.
const PLANTILLA = "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[9rem_minmax(0,1fr)_12rem]";

/**
 * Tienda web ▸ Libro de Reclamaciones (ADR-0679): las cifras (por responder, vencen pronto, vencidas, de este mes: las que filtran se
 * tocan), la lista en UNA tarjeta con su buscador y su filtro, y la nota. Tocar una fila abre la hoja completa al costado (la URL lo
 * recuerda: `?h=`), donde se responde con el combo «Responsable». Las por responder van primero las que vencen antes. Nada se borra.
 */
export function LibroPantalla({ libro, abiertaInicial }: { libro: ListaLibro; abiertaInicial: string | null }) {
  const router = useRouter();
  const [estado, setEstado] = useState<FiltroEstado>(ESTADO_POR_DEFECTO);
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(1);
  const [abiertaId, setAbiertaId] = useState<string | null>(abiertaInicial);

  const cifras = useMemo(() => cifrasDe(libro.hojas, libro.hoy), [libro.hojas, libro.hoy]);
  const visibles = useMemo(() => filtrar(libro.hojas, { estado, q }), [libro.hojas, estado, q]);
  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const enPagina = visibles.slice((Math.min(pagina, paginas) - 1) * POR_PAGINA, Math.min(pagina, paginas) * POR_PAGINA);
  const abierta = libro.hojas.find((h) => h.id === abiertaId) ?? null;
  const filtrosPuestos = estado !== ESTADO_POR_DEFECTO || q.trim() !== "";

  const conUrl = (id: string | null) => window.history.replaceState(null, "", id ? `${RUTA}?h=${id}` : RUTA);
  const abrir = (id: string) => {
    setAbiertaId(id);
    conUrl(id);
  };
  const cerrar = () => {
    setAbiertaId(null);
    conUrl(null);
  };
  const elegirEstado = (e: FiltroEstado) => {
    setEstado(e);
    setPagina(1);
  };
  const limpiar = () => {
    setEstado(ESTADO_POR_DEFECTO);
    setQ("");
    setPagina(1);
  };
  /** Una cifra que filtra: tocada otra vez, vuelve a las por responder. */
  const filtroDeCifra = (e: FiltroEstado) => () => elegirEstado(estado === e ? ESTADO_POR_DEFECTO : e);

  const indiceAbierta = abierta ? visibles.findIndex((x) => x.id === abierta.id) : -1;
  const navegacion =
    indiceAbierta >= 0
      ? {
          indice: indiceAbierta,
          total: visibles.length,
          que: "Hoja",
          onNavegar: (d: 1 | -1) => {
            const otra = visibles[indiceAbierta + d];
            if (!otra) return;
            const i = visibles.findIndex((x) => x.id === otra.id);
            setPagina(Math.floor(i / POR_PAGINA) + 1);
            abrir(otra.id);
          },
        }
      : undefined;

  return (
    <div className="space-y-6">
      {abiertaInicial && !libro.hojas.some((h) => h.id === abiertaInicial) && (
        <Aviso tono="atencion" titulo="No se encontró esa hoja">
          Puede que el enlace esté mal copiado. Elige una de la lista.
        </Aviso>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-guia="libro.cifras">
        <TarjetaCifra
          punto={cifras.porResponder > 0 ? "ambar" : "neutro"}
          etiqueta="Por responder"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          valor={<CifraQueCuenta valor={cifras.porResponder} alMontar />}
          activa={estado === "por_responder"}
          onClick={filtroDeCifra("por_responder")}
        >
          {cifras.porResponder > 0 ? "Esperan la respuesta de CAYLA" : "No queda ninguna por responder"}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.vencenPronto > 0 ? "ambar" : "neutro"}
          etiqueta="Vencen pronto"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          valor={<CifraQueCuenta valor={cifras.vencenPronto} alMontar />}
          activa={estado === "vencen"}
          onClick={filtroDeCifra("vencen")}
        >
          Les quedan 3 días hábiles o menos
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.vencidas > 0 ? "rojo" : "neutro"}
          etiqueta="Vencidas"
          className="anim-entra"
          style={{ ["--i" as string]: 2 }}
          valor={<CifraQueCuenta valor={cifras.vencidas} alMontar />}
          activa={estado === "vencen"}
          onClick={filtroDeCifra("vencen")}
        >
          {cifras.vencidas > 0 ? "Pasó el plazo de la ley: respóndelas ya" : "Ninguna pasó el plazo"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Este mes" className="anim-entra" style={{ ["--i" as string]: 3 }} valor={<CifraQueCuenta valor={cifras.delMes} alMontar />}>
          {cifras.delMes === 1 ? "Llegó una hoja" : "Hojas que llegaron"}
        </TarjetaCifra>
      </div>

      <Tabla guia="libro.lista">
        <div className="flex flex-wrap items-center gap-2.5 px-5 py-3" data-guia="libro.filtros">
          <Buscador
            valor={q}
            onCambio={(v) => {
              setQ(v);
              setPagina(1);
            }}
            placeholder="Buscar por número, nombre, documento o lo que reclama"
            etiqueta="Buscar una hoja"
            atajo
            conteo={q.trim() ? `${visibles.length} de ${libro.hojas.length}` : undefined}
            className="min-w-0 flex-1 sm:max-w-sm"
          />
          <DesplegablePildora
            icono={Tag}
            etiqueta="Estado"
            valor={estado}
            onValor={(v) => elegirEstado(esFiltroEstado(v) ? v : ESTADO_POR_DEFECTO)}
            opciones={OPCIONES_ESTADO}
            valorPorDefecto={ESTADO_POR_DEFECTO}
          />
          {filtrosPuestos && <BotonLimpiar onClick={limpiar}>Limpiar todo</BotonLimpiar>}
        </div>

        {visibles.length === 0 ? (
          libro.hojas.length === 0 ? (
            <Vacio icono={<BookOpen />} titulo="Todavía no llegó ninguna hoja" guia="libro.vacio">
              Cuando un cliente deje un reclamo o una queja en el Libro de Reclamaciones de la tienda online, aparece aquí con su plazo.
            </Vacio>
          ) : !filtrosPuestos ? (
            <Vacio tamano="chico" icono={<BookOpen />} accion={{ texto: "Ver todas", onClick: () => elegirEstado("todas") }}>
              No queda ninguna hoja por responder.
            </Vacio>
          ) : (
            <Vacio
              tamano="chico"
              icono={q.trim() ? <SearchX /> : <BookOpen />}
              accion={{ texto: q.trim() ? "Borrar la búsqueda" : "Limpiar los filtros", onClick: limpiar }}
            >
              {q.trim() ? `Ninguna hoja dice «${q.trim()}» con este filtro.` : "No hay hojas con este filtro."}
            </Vacio>
          )
        ) : (
          <>
            <Encabezado plantilla={PLANTILLA} columnas={[{ titulo: "Hoja" }, { titulo: "Quién y qué reclama" }, { titulo: "Plazo" }]} />
            {enPagina.map((h, i) => {
              const e = estadoDe(h);
              return (
                <div
                  key={h.id}
                  role="row"
                  tabIndex={0}
                  aria-current={abierta?.id === h.id ? "true" : undefined}
                  data-guia={i === 0 ? "libro.fila" : undefined}
                  onClick={(ev) => {
                    // Un clic que sube desde el cajón abierto (vive en un portal) no vuelve a abrir.
                    if (!ev.currentTarget.contains(ev.target as Node)) return;
                    abrir(h.id);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.target !== ev.currentTarget) return;
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      abrir(h.id);
                    }
                  }}
                  className={fila(PLANTILLA, "cursor-pointer items-start")}
                  aria-label={`Hoja ${h.codigo} de ${h.consumidor.nombre}: ${INSIGNIA[e].texto}, ${plazoEnPalabras(h)}`}
                >
                  <span className="min-w-0">
                    <span className={`block tabular-nums text-tinta ${e !== "respondida" ? "font-semibold" : ""}`}>N.° {h.codigo}</span>
                    <span className="block text-[12px] text-taupe">
                      {h.tipo === "reclamo" ? "Reclamo" : "Queja"} · {fechaCorta(h.creada_en)}
                    </span>
                  </span>
                  <span className="col-start-2 row-start-1 flex justify-end sm:hidden">
                    <Chip tono={INSIGNIA[e].tono}>{INSIGNIA[e].texto}</Chip>
                  </span>
                  <span className="col-span-2 min-w-0 sm:col-span-1">
                    <span className="block truncate text-tinta">{h.consumidor.nombre}</span>
                    <span className="block truncate text-[13px] text-taupe">
                      {h.bien.descripcion} — {h.detalle}
                    </span>
                  </span>
                  <span className="hidden flex-col items-start gap-1 sm:flex">
                    <Chip tono={INSIGNIA[e].tono}>{INSIGNIA[e].texto}</Chip>
                    <span className="text-[12px] text-taupe">{plazoEnPalabras(h)}</span>
                  </span>
                </div>
              );
            })}
            {paginas > 1 && (
              <div className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs text-taupe">
                <span>
                  {visibles.length} {visibles.length === 1 ? "hoja" : "hojas"}
                </span>
                <PaginacionLocal pagina={Math.min(pagina, paginas)} totalPaginas={paginas} onPagina={setPagina} />
              </div>
            )}
          </>
        )}
      </Tabla>

      <div className="nota-cayla space-y-2 text-[13px]" data-guia="libro.nota">
        <p>
          15 días hábiles para responder, sin sábados, domingos ni feriados. Una hoja no se borra ni se corrige.
          {libro.hayMas ? " Aquí se ven las 1000 más nuevas." : ""}
        </p>
      </div>

      {abierta && <HojaCajon hoja={abierta} hoy={libro.hoy} navegacion={navegacion} onClose={cerrar} onCambio={() => router.refresh()} />}
    </div>
  );
}
