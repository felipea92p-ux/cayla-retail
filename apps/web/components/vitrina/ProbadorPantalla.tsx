"use client";

import { useRef, useState, type CSSProperties } from "react";
import { ChevronRight, Ruler, Scissors } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { LargosTipicosHoja } from "@/components/vitrina/LargosTipicosHoja";
import { PrepararRecortesHoja } from "@/components/vitrina/PrepararRecortesHoja";
import { ProbadorPrendaHoja } from "@/components/vitrina/ProbadorPrendaHoja";
import { RevisarRecorteHoja } from "@/components/vitrina/RevisarRecorteHoja";
import { cifrasRecortes, conRecorte, porRecortar, porRevisar, type FotoDelProbador, type RecorteDeFoto } from "@/lib/recorte-probador-reglas";
import {
  cifrasProbador,
  coloresPorFotografiar,
  estaLista,
  filtrarPrendas,
  largoEfectivo,
  textoDelLargo,
  type FiltroPrendas,
  type LecturaProbador,
  type PrendaDelProbador,
} from "@/lib/vitrina-probador-reglas";

/** Cuántas fotos entran en una página de la hoja de contactos: cinco filas en una pantalla ancha. */
const POR_PAGINA = 40;
/** Cuántas prendas por página en la lista. */
const PRENDAS_POR_PAGINA = 25;

type FiltroFotos = "todas" | "listos" | "por_revisar" | "sin_recorte";

const FILTROS_FOTOS: { clave: FiltroFotos; texto: string }[] = [
  { clave: "todas", texto: "Todas" },
  { clave: "listos", texto: "Recortadas" },
  { clave: "por_revisar", texto: "Por revisar" },
  { clave: "sin_recorte", texto: "Sin recorte" },
];

function filtrarFotos(fotos: readonly FotoDelProbador[], filtro: FiltroFotos): FotoDelProbador[] {
  if (filtro === "listos") return fotos.filter((f) => f.recorte?.estado === "listo");
  if (filtro === "por_revisar") return porRevisar(fotos);
  if (filtro === "sin_recorte") return porRecortar(fotos);
  return [...fotos];
}

const COLUMNAS: Columna[] = [
  { titulo: "Prenda" },
  { titulo: "Vendidas", subtitulo: "en 90 días", alinear: "der" },
  { titulo: "Largo" },
  { titulo: "Fotos por color" },
  { titulo: "Recorte" },
  { titulo: "" },
];
const PLANTILLA = "sm:grid-cols-[minmax(0,1fr)_5.5rem_9.5rem_8.5rem_7rem_1.25rem]";

/**
 * Tienda web ▸ Vitrina ▸ Probador (ADR-0434): lo que necesita «Arma el tuyo», el probador de looks de la tienda online, prenda por prenda y
 * foto por foto. Arriba, la lista viva (actividad 3): de lo que más se vende a lo que menos, qué le falta a cada prenda —su largo, la foto
 * de cada color, su recorte—; tocar una abre su hoja para anotar el largo. Abajo, los recortes (actividad 1): «Preparar recortes» los hace
 * en este equipo y «Revisar» deja usar o descartar los dudosos. Ninguna foto se modifica: el recorte es un archivo más (Felipe, 2026-10-16).
 * Toda escritura pasa por una hoja con el combo «Responsable» (ADR-0162).
 */
export function ProbadorPantalla({ fotos: iniciales, probador }: { fotos: FotoDelProbador[]; probador: LecturaProbador }) {
  const [fotos, setFotos] = useState(iniciales);
  const [prendas, setPrendas] = useState(probador.prendas);
  const [tipicos, setTipicos] = useState(probador.tipicos);
  // Lo que trae el servidor al refrescar manda (sin un efecto: se ajusta al dibujar, como pide React).
  const [deServidor, setDeServidor] = useState({ iniciales, probador });
  if (deServidor.iniciales !== iniciales || deServidor.probador !== probador) {
    setDeServidor({ iniciales, probador });
    setFotos(iniciales);
    setPrendas(probador.prendas);
    setTipicos(probador.tipicos);
  }
  const [filtro, setFiltro] = useState<FiltroPrendas>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [paginaPrendas, setPaginaPrendas] = useState(1);
  const [filtroFotos, setFiltroFotos] = useState<FiltroFotos>("todas");
  const [pagina, setPagina] = useState(1);
  const [preparando, setPreparando] = useState(false);
  const [viendoTipicos, setViendoTipicos] = useState(false);
  const [prendaAbierta, setPrendaAbierta] = useState<string | null>(null);
  // Las fotos que se están revisando, en orden (una sola si se tocó en la hoja de contactos).
  const [revisando, setRevisando] = useState<string[] | null>(null);
  const recortesRef = useRef<HTMLElement>(null);

  const cifras = cifrasProbador(prendas);
  const cifrasFotos = cifrasRecortes(fotos);
  const visibles = filtrarPrendas(prendas, filtro, busqueda);
  const totalPaginasPrendas = Math.max(1, Math.ceil(visibles.length / PRENDAS_POR_PAGINA));
  const paginaPrendasVista = Math.min(paginaPrendas, totalPaginasPrendas);
  const prendasDeLaPagina = visibles.slice((paginaPrendasVista - 1) * PRENDAS_POR_PAGINA, paginaPrendasVista * PRENDAS_POR_PAGINA);
  const fotosVisibles = filtrarFotos(fotos, filtroFotos);
  const totalPaginas = Math.max(1, Math.ceil(fotosVisibles.length / POR_PAGINA));
  const paginaVista = Math.min(pagina, totalPaginas);
  const deLaPagina = fotosVisibles.slice((paginaVista - 1) * POR_PAGINA, paginaVista * POR_PAGINA);

  const alternarFiltro = (f: FiltroPrendas) => {
    setFiltro((actual) => (actual === f ? "todas" : f));
    setPaginaPrendas(1);
  };
  const verFotos = (f: FiltroFotos) => {
    setFiltroFotos(f);
    setPagina(1);
    recortesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // Un recorte nuevo o revisado cambia también cómo va su prenda: se suma o se resta en sus cuentas sin volver a leer todo.
  const actualizarRecorte = (foto: string, recorte: RecorteDeFoto) => {
    const antes = fotos.find((f) => f.foto === foto)?.recorte?.estado ?? null;
    const productoId = fotos.find((f) => f.foto === foto)?.productoId;
    setFotos((fs) => conRecorte(fs, foto, recorte));
    if (!productoId || antes === recorte.estado) return;
    setPrendas((ps) =>
      ps.map((p) => {
        if (p.productoId !== productoId) return p;
        const r = { ...p.recortes };
        if (antes === null) r.sin = Math.max(0, r.sin - 1);
        if (antes === "listo") r.listos = Math.max(0, r.listos - 1);
        if (antes === "por_revisar") r.porRevisar = Math.max(0, r.porRevisar - 1);
        if (recorte.estado === "listo") r.listos++;
        if (recorte.estado === "por_revisar") r.porRevisar++;
        return { ...p, recortes: r };
      }),
    );
  };
  const aRevisar = revisando ? revisando.map((id) => fotos.find((f) => f.foto === id)).filter((f): f is FotoDelProbador => Boolean(f)) : [];
  const abierta = prendaAbierta ? (prendas.find((p) => p.productoId === prendaAbierta) ?? null) : null;

  const preparar = (
    <Boton type="button" peso="primario" aria-haspopup="dialog" data-guia="probador.preparar" onClick={() => setPreparando(true)}>
      {cifrasFotos.sinRecorte === 1 ? "Preparar 1 recorte" : `Preparar ${cifrasFotos.sinRecorte} recortes`}
    </Boton>
  );

  return (
    <div className="tw space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-guia="probador.cifras">
        <TarjetaCifra
          punto="verde"
          etiqueta="Listas para el probador"
          className="anim-entra"
          style={{ ["--i" as string]: 0 } as CSSProperties}
          valor={<CifraQueCuenta valor={cifras.listas} alMontar />}
          activa={filtro === "listas"}
          onClick={() => alternarFiltro("listas")}
        >
          {`de ${cifras.prendas} ${cifras.prendas === 1 ? "prenda" : "prendas"} de la web`}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.sinLargo > 0 ? "ambar" : "neutro"}
          etiqueta="Les falta el largo"
          className="anim-entra"
          style={{ ["--i" as string]: 1 } as CSSProperties}
          valor={<CifraQueCuenta valor={cifras.sinLargo} alMontar />}
          activa={filtro === "sin_largo"}
          onClick={() => alternarFiltro("sin_largo")}
        >
          {cifras.sinLargo > 0 ? "No entran hasta anotarlo" : "Todas tienen su largo"}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.coloresPorFotografiar > 0 ? "ambar" : "neutro"}
          etiqueta="Colores por fotografiar"
          className="anim-entra"
          style={{ ["--i" as string]: 2 } as CSSProperties}
          valor={<CifraQueCuenta valor={cifras.coloresPorFotografiar} alMontar />}
          activa={filtro === "por_fotografiar"}
          onClick={() => alternarFiltro("por_fotografiar")}
        >
          {cifras.coloresPorFotografiar > 0
            ? `Con stock y sin su foto, en ${cifras.prendasPorFotografiar} ${cifras.prendasPorFotografiar === 1 ? "prenda" : "prendas"}`
            : "Cada color con stock tiene su foto"}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifrasFotos.porRevisar + cifrasFotos.sinRecorte > 0 ? "ambar" : "neutro"}
          etiqueta="Recortes pendientes"
          className="anim-entra"
          style={{ ["--i" as string]: 3 } as CSSProperties}
          valor={<CifraQueCuenta valor={cifrasFotos.porRevisar + cifrasFotos.sinRecorte} alMontar />}
          onClick={() => verFotos(cifrasFotos.porRevisar > 0 ? "por_revisar" : "sin_recorte")}
        >
          {cifrasFotos.porRevisar + cifrasFotos.sinRecorte > 0
            ? `${cifrasFotos.porRevisar} por revisar · ${cifrasFotos.sinRecorte} sin recorte`
            : `Las ${cifrasFotos.fotos} fotos tienen su recorte`}
        </TarjetaCifra>
      </div>

      <section className="space-y-3">
        <TituloSeccion cuenta={cifras.prendas}>Prendas</TituloSeccion>
        <Tabla guia="probador.prendas">
          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <div className="min-w-[14rem] flex-1">
              <Buscador
                valor={busqueda}
                onCambio={(v) => {
                  setBusqueda(v);
                  setPaginaPrendas(1);
                }}
                etiqueta="Buscar una prenda por su nombre, su código o su categoría"
                conteo={busqueda ? `${visibles.length} de ${prendas.length}` : undefined}
                guia="probador.buscador"
              />
            </div>
            <Boton type="button" aria-haspopup="dialog" data-guia="probador.tipicos" onClick={() => setViendoTipicos(true)}>
              <Ruler aria-hidden className="h-4 w-4" />
              Largos típicos
            </Boton>
          </div>
          {prendas.length === 0 ? (
            <Vacio icono={<Ruler />} titulo="Todavía no hay prendas en la web">
              Primero muestra modelos en la pestaña Modelos: aquí sale lo que le falta a cada uno para el probador.
            </Vacio>
          ) : visibles.length === 0 ? (
            <Vacio icono={<Ruler />} tamano="chico">
              {busqueda ? `Ninguna prenda se llama «${busqueda}».` : filtro === "sin_largo" ? "Todas tienen su largo." : filtro === "listas" ? "Ninguna está lista todavía." : "Cada color con stock tiene su foto."}
            </Vacio>
          ) : (
            <>
              <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
              <ul aria-label="Las prendas de la web, de lo que más se vende a lo que menos">
                {prendasDeLaPagina.map((p, i) => (
                  <FilaPrenda key={p.productoId} prenda={p} i={i} onAbrir={() => setPrendaAbierta(p.productoId)} />
                ))}
              </ul>
              {totalPaginasPrendas > 1 && (
                <div className="px-5 py-3">
                  <PaginacionLocal pagina={paginaPrendasVista} totalPaginas={totalPaginasPrendas} onPagina={setPaginaPrendas} />
                </div>
              )}
            </>
          )}
        </Tabla>
      </section>

      <section className="space-y-3" ref={recortesRef}>
        <TituloSeccion cuenta={cifrasFotos.fotos}>Recortes</TituloSeccion>
        <div className="card-cayla space-y-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-sand px-5 py-4">
            <p className="min-w-[14rem] flex-1 text-[13px] text-taupe" data-guia="probador.ayuda">
              Así sale cada prenda en el probador de «Arma el tuyo»: recortada, sin fondo. Toca una para mirarla de cerca y usarla o descartarla.
            </p>
            {cifrasFotos.porRevisar > 0 && (
              <Boton type="button" aria-haspopup="dialog" data-guia="probador.revisar" onClick={() => setRevisando(porRevisar(fotos).map((f) => f.foto))}>
                {cifrasFotos.porRevisar === 1 ? "Revisar 1" : `Revisar ${cifrasFotos.porRevisar}`}
              </Boton>
            )}
            {cifrasFotos.sinRecorte > 0 && preparar}
          </div>
          <div className="flex flex-wrap gap-2 px-5 pt-4" role="group" aria-label="Qué recortes ver" data-guia="probador.filtros-fotos">
            {FILTROS_FOTOS.map((f) => (
              <button
                key={f.clave}
                type="button"
                className="pildora-cayla"
                aria-pressed={filtroFotos === f.clave}
                onClick={() => {
                  setFiltroFotos(f.clave);
                  setPagina(1);
                }}
              >
                {f.texto}
              </button>
            ))}
          </div>

          {fotos.length === 0 ? (
            <Vacio icono={<Scissors />} titulo="Todavía no hay fotos en la web">
              Primero muestra modelos con foto en la pestaña Modelos: sus fotos aparecen aquí para recortarlas.
            </Vacio>
          ) : fotosVisibles.length === 0 ? (
            <Vacio icono={<Scissors />} tamano="chico">
              {filtroFotos === "por_revisar" ? "Ningún recorte espera revisión." : filtroFotos === "sin_recorte" ? "Todas las fotos tienen su recorte." : "Todavía no hay recortes listos."}
            </Vacio>
          ) : (
            <>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3 p-4 sm:p-5" data-guia="probador.lista" aria-label="Las fotos de la web y sus recortes">
                {deLaPagina.map((f, i) => (
                  <CeldaRecorte key={f.foto} foto={f} i={i} onAbrir={() => setRevisando([f.foto])} />
                ))}
              </ul>
              {totalPaginas > 1 && (
                <div className="border-t border-sand px-5 py-3">
                  <PaginacionLocal pagina={paginaVista} totalPaginas={totalPaginas} onPagina={setPagina} />
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <div className="nota-cayla space-y-2 text-[13px]" data-guia="probador.nota">
        <p>
          Una prenda sale en el probador con su largo y un recorte listo. El recorte sale de la foto original con el mismo «sin fondo» que se usa
          al subir una foto y conserva la luz de la foto de la tienda: ninguna foto cambia. Un color sin foto propia se elige igual: se ve otra
          foto de la prenda y se avisa.
        </p>
      </div>

      {preparando && <PrepararRecortesHoja pendientes={porRecortar(fotos)} onRecorte={actualizarRecorte} onClose={() => setPreparando(false)} />}
      {revisando && aRevisar.length > 0 && (
        <RevisarRecorteHoja key={revisando.join(",")} fotos={aRevisar} onHecho={actualizarRecorte} onClose={() => setRevisando(null)} />
      )}
      {abierta && (
        <ProbadorPrendaHoja
          key={abierta.productoId}
          prenda={abierta}
          onClose={() => setPrendaAbierta(null)}
          onGuardado={(id, largo) => setPrendas((ps) => ps.map((p) => (p.productoId === id ? { ...p, largo } : p)))}
        />
      )}
      {viendoTipicos && (
        <LargosTipicosHoja
          tipicos={tipicos}
          onClose={() => setViendoTipicos(false)}
          onGuardado={(nuevos) => {
            setTipicos(nuevos);
            const porCategoria = new Map(nuevos.map((t) => [t.categoriaId, t.largo]));
            setPrendas((ps) => ps.map((p) => (p.categoria && porCategoria.has(p.categoria.id) ? { ...p, tipico: porCategoria.get(p.categoria.id) ?? null } : p)));
          }}
        />
      )}
    </div>
  );
}

/** Una prenda de la lista: lo que le falta para el probador, con su hoja al tocarla. */
function FilaPrenda({ prenda: p, i, onAbrir }: { prenda: PrendaDelProbador; i: number; onAbrir: () => void }) {
  const faltanColores = coloresPorFotografiar(p).length;
  const conFoto = p.colores.filter((c) => c.foto).length;
  return (
    <li>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onAbrir}
        data-guia={i === 0 ? "probador.prenda" : undefined}
        className={`${fila(PLANTILLA, "w-full text-left sm:items-center")} anim-entra`}
        style={{ ["--i" as string]: Math.min(i, 12) } as CSSProperties}
        aria-label={`${p.nombre}: ${estaLista(p) ? "lista para el probador" : "le falta algo para el probador"}`}
      >
        <span className={celda("izq", "flex items-center gap-3")}>
          <span className="papel-fijo relative h-12 w-10 shrink-0 overflow-hidden rounded-md border border-sand bg-hueso">
            {p.miniatura && <ImagenDePrenda src={p.miniatura} alt="" fill sizes="40px" fallback={null} className={`object-contain ${p.miniaturaEsRecorte ? "p-0.5" : ""}`} />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-medium text-tinta">{p.nombre}</span>
            <span className="block truncate text-[12px] text-taupe">{[p.codigo, p.categoria?.nombre].filter(Boolean).join(" · ")}</span>
          </span>
        </span>
        <span className={celda("der", "text-[13px] text-tinta")}>{p.vendidas}</span>
        <span className={celda("izq", "text-[13px]")}>
          {largoEfectivo(p) === null ? <Chip tono="ambar">Falta el largo</Chip> : <span className={p.largo === null ? "text-taupe" : "text-tinta"}>{textoDelLargo(p)}</span>}
        </span>
        <span className={celda("izq", "text-[13px] text-tinta")}>
          {`${conFoto} de ${p.colores.length}`}
          {faltanColores > 0 && <span className="text-taupe">{` · ${faltanColores} por foto`}</span>}
        </span>
        <span className={celda("izq")}>
          {p.recortes.listos > 0 ? (
            <Chip tono="verde">Listo</Chip>
          ) : p.recortes.porRevisar > 0 ? (
            <Chip tono="ambar">Por revisar</Chip>
          ) : (
            <Chip tono="neutro">Sin recorte</Chip>
          )}
        </span>
        <ChevronRight aria-hidden className="hidden h-4 w-4 text-taupe sm:block" />
      </button>
    </li>
  );
}

/** Una foto en la hoja de contactos: su recorte sobre el fondo claro de la tienda (o la foto, si aún no tiene) y en qué está. */
function CeldaRecorte({ foto: f, i, onAbrir }: { foto: FotoDelProbador; i: number; onAbrir: () => void }) {
  const r = f.recorte;
  const color = f.colorNombre ?? "Todos los colores";
  return (
    <li className="anim-entra" style={{ ["--i" as string]: Math.min(i, 12) } as CSSProperties}>
      <button
        type="button"
        aria-haspopup={r ? "dialog" : undefined}
        disabled={!r}
        onClick={onAbrir}
        data-guia={i === 0 ? "probador.recorte" : undefined}
        className="mov-boton group flex w-full flex-col gap-1.5 rounded-xl text-left disabled:cursor-default"
        aria-label={`${f.nombre} · ${color}${r ? ` · ${r.estado === "listo" ? "recortada" : r.estado === "por_revisar" ? "por revisar" : "descartada"}` : " · sin recorte"}`}
      >
        <div className="papel-fijo relative aspect-[4/5] w-full overflow-hidden rounded-xl border border-sand bg-hueso">
          <ImagenDePrenda
            src={r ? r.url : f.url}
            alt=""
            fill
            sizes="140px"
            fallback={null}
            className={`object-contain ${r ? "p-3" : "opacity-60 grayscale"} ${r?.estado === "descartado" ? "opacity-40" : ""}`}
          />
        </div>
        <span className="line-clamp-1 text-[12.5px] font-medium text-tinta">{f.nombre}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="line-clamp-1 text-[12px] text-taupe">{color}</span>
          {!r ? (
            <Chip tono="neutro">Sin recorte</Chip>
          ) : r.estado === "por_revisar" ? (
            <Chip tono="ambar">Por revisar</Chip>
          ) : r.estado === "descartado" ? (
            <Chip tono="apagado" tachado={false}>
              Descartada
            </Chip>
          ) : null}
        </span>
      </button>
    </li>
  );
}
