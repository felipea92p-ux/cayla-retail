"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, SearchX, Store, Tag, UserX } from "lucide-react";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { Buscador } from "@/components/ui/Buscador";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { DesplegablePildora, TODOS } from "@/components/ui/FiltrosPildora";
import { BotonLimpiar } from "@/components/ui/FiltrosPuestos";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { Encabezado, Tabla, fila } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { RecomendacionHoja } from "@/components/recomendaciones/RecomendacionHoja";
import { haceCuanto } from "@/lib/vender-hoy-reglas";
import {
  ESTADO_POR_DEFECTO,
  INSIGNIA,
  OPCIONES_ESTADO,
  POR_PAGINA,
  cifrasDe,
  deQuien,
  estadoDe,
  esFiltroEstado,
  filtrar,
  opcionesSobre,
  sobreQue,
  type FiltroEstado,
  type ListaRecomendaciones,
} from "@/lib/recomendaciones-reglas";

const RUTA = "/tienda-web/recomendaciones";
// Cada recomendación como un mensaje (ADR-0430): a la izquierda quién la escribió, sobre qué y cuándo; al centro lo que escribió, en su
// globo (y debajo, si ya se le respondió, la respuesta de CAYLA); a la derecha en qué está. En el celular, quién y el estado arriba y el
// mensaje debajo, a todo el ancho.
const PLANTILLA = "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[12rem_minmax(0,1fr)_7.5rem]";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

/**
 * Tienda web ▸ Recomendaciones (ADR-0408, Felipe 2026-10-15): lo que los clientes recomiendan desde la tienda online, con su nombre. Las
 * cifras (sin leer, respondidas, del mes, archivadas: las que filtran se tocan), la lista en UNA tarjeta con su buscador y sus dos
 * filtros (en qué estado y sobre qué), y la nota. Tocar una fila abre su hoja (la URL lo recuerda: `?r=`), donde se marca como leída,
 * se responde (el cliente lo ve en su cuenta) o se archiva, siempre con el combo «Responsable». Nada se borra.
 */
export function RecomendacionesPantalla({
  lista,
  hoy,
  ahoraIso,
  abiertaInicial,
}: {
  lista: ListaRecomendaciones;
  /** Hoy en Lima (aaaa-mm-dd), para «este mes». */
  hoy: string;
  ahoraIso: string;
  /** La recomendación que pide la URL (`?r=`), si es una de la lista. */
  abiertaInicial: string | null;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<FiltroEstado>(ESTADO_POR_DEFECTO);
  const [sobre, setSobre] = useState<string>(TODOS);
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(1);
  const [abiertaId, setAbiertaId] = useState<string | null>(abiertaInicial);
  // La recomendación recién marcada, respondida o archivada respira una vez en su fila.
  const [recien, setRecien] = useState<string | null>(null);
  // «Hace 3 h» parte de la hora del servidor (el primer dibujo es idéntico en los dos lados) y avanza cada minuto.
  const [ahora, setAhora] = useState(() => Date.parse(ahoraIso));
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const cifras = useMemo(() => cifrasDe(lista.recomendaciones, hoy), [lista.recomendaciones, hoy]);
  const visibles = useMemo(() => filtrar(lista.recomendaciones, { estado, sobre, q }), [lista.recomendaciones, estado, sobre, q]);
  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const enPagina = visibles.slice((Math.min(pagina, paginas) - 1) * POR_PAGINA, Math.min(pagina, paginas) * POR_PAGINA);
  const abierta = lista.recomendaciones.find((r) => r.id === abiertaId) ?? null;
  const filtrosPuestos = estado !== ESTADO_POR_DEFECTO || sobre !== TODOS || q.trim() !== "";
  const nombreMes = MESES[Number(hoy.slice(5, 7)) - 1] ?? "este mes";

  const conUrl = (id: string | null) => window.history.replaceState(null, "", id ? `${RUTA}?r=${id}` : RUTA);
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
    setSobre(TODOS);
    setQ("");
    setPagina(1);
  };
  /** Una cifra que filtra: tocada otra vez, vuelve a la bandeja. */
  const filtroDeCifra = (e: FiltroEstado) => () => elegirEstado(estado === e ? ESTADO_POR_DEFECTO : e);

  return (
    <div className="tw space-y-6">
      {abiertaInicial && !lista.recomendaciones.some((r) => r.id === abiertaInicial) && (
        <Aviso tono="atencion" titulo="No se encontró esa recomendación">
          Puede que el enlace esté mal copiado. Elige una de la lista.
        </Aviso>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-guia="recomendaciones.cifras">
        <TarjetaCifra
          punto={cifras.porResponder > 0 ? "ambar" : "neutro"}
          etiqueta="Por responder"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          valor={<CifraQueCuenta valor={cifras.porResponder} alMontar />}
          activa={estado === "por_responder"}
          onClick={filtroDeCifra("por_responder")}
        >
          {cifras.porResponder > 0 ? "Esperan tu respuesta" : "No queda nada por responder"}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.respondidas > 0 ? "verde" : "neutro"}
          etiqueta="Respondidas"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          valor={<CifraQueCuenta valor={cifras.respondidas} alMontar />}
          activa={estado === "respondidas"}
          onClick={filtroDeCifra("respondidas")}
        >
          El cliente lee la respuesta en su cuenta
        </TarjetaCifra>
        <TarjetaCifra
          etiqueta="Este mes"
          className="anim-entra"
          style={{ ["--i" as string]: 2 }}
          valor={<CifraQueCuenta valor={cifras.delMes} alMontar />}
        >
          {cifras.delMes === 1 ? `Llegó en ${nombreMes}` : `Llegaron en ${nombreMes}`}
        </TarjetaCifra>
        <TarjetaCifra
          etiqueta="Archivadas"
          className="anim-entra"
          style={{ ["--i" as string]: 3 }}
          valor={<CifraQueCuenta valor={cifras.archivadas} alMontar />}
          activa={estado === "archivadas"}
          onClick={filtroDeCifra("archivadas")}
        >
          Ya no esperan nada: no se borran
        </TarjetaCifra>
      </div>

      <Tabla guia="recomendaciones.lista">
        <div className="flex flex-wrap items-center gap-2.5 px-5 py-3" data-guia="recomendaciones.filtros">
          <Buscador
            valor={q}
            onCambio={(v) => {
              setQ(v);
              setPagina(1);
            }}
            placeholder="Buscar en lo que escribieron o por nombre"
            etiqueta="Buscar una recomendación"
            atajo
            conteo={q.trim() ? `${visibles.length} de ${lista.recomendaciones.length}` : undefined}
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
          <DesplegablePildora
            icono={Store}
            etiqueta="Sobre"
            valor={sobre}
            onValor={(v) => {
              setSobre(v);
              setPagina(1);
            }}
            opciones={opcionesSobre(lista.tiendas)}
          />
          {filtrosPuestos && <BotonLimpiar onClick={limpiar}>Limpiar todo</BotonLimpiar>}
        </div>

        {visibles.length === 0 ? (
          lista.recomendaciones.length === 0 ? (
            <Vacio icono={<MessageSquareText />} titulo="Todavía no llegó ninguna recomendación" guia="recomendaciones.vacio">
              Cuando un cliente escriba una desde su cuenta de la tienda online, aparece aquí con su nombre.
            </Vacio>
          ) : !filtrosPuestos ? (
            // Lo de siempre («Por responder») vacío: no hay filtro que limpiar, hay lo ya respondido o archivado por ver.
            <Vacio tamano="chico" icono={<MessageSquareText />} accion={{ texto: "Ver todas", onClick: () => elegirEstado("todas") }}>
              No queda nada por responder.
            </Vacio>
          ) : (
            <Vacio
              tamano="chico"
              icono={q.trim() ? <SearchX /> : <MessageSquareText />}
              accion={{ texto: q.trim() ? "Borrar la búsqueda" : "Limpiar los filtros", onClick: limpiar }}
            >
              {q.trim() ? `Ninguna dice «${q.trim()}» con estos filtros.` : "No hay recomendaciones con estos filtros."}
            </Vacio>
          )
        ) : (
          <>
            <Encabezado plantilla={PLANTILLA} columnas={[{ titulo: "Quién" }, { titulo: "Lo que escribió" }, { titulo: "Estado" }]} />
            {enPagina.map((r, i) => {
              const e = estadoDe(r);
              return (
                <div
                  key={r.id}
                  role="row"
                  tabIndex={0}
                  aria-current={abierta?.id === r.id ? "true" : undefined}
                  data-recien={recien === r.id ? "" : undefined}
                  data-guia={i === 0 ? "recomendaciones.fila" : undefined}
                  onClick={(ev) => {
                    // Un clic que sube desde la hoja abierta (vive en un portal) no vuelve a abrir.
                    if (!ev.currentTarget.contains(ev.target as Node)) return;
                    abrir(r.id);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.target !== ev.currentTarget) return;
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      abrir(r.id);
                    }
                  }}
                  className={fila(PLANTILLA, "cursor-pointer items-start sm:items-start")}
                  aria-label={`Recomendación de ${deQuien(r)} sobre ${sobreQue(r)}: ${INSIGNIA[e].texto}`}
                >
                  <span className="flex min-w-0 items-start gap-2.5">
                    {r.cliente ? (
                      <AvatarPersona personaId={null} nombre={r.cliente.nombre} tamano={32} />
                    ) : (
                      // Sin nombre (su ficha se anonimizó): sin iniciales que inventar.
                      <UserX aria-hidden className="h-8 w-8 shrink-0 p-1 text-taupe" />
                    )}
                    <span className="min-w-0">
                      <button
                        type="button"
                        onClick={(ev) => {
                          // La fila también abre: sin esto, el clic subiría y abriría dos veces.
                          ev.stopPropagation();
                          abrir(r.id);
                        }}
                        title={r.cliente ? undefined : "Su ficha se anonimizó: la recomendación se queda, sin su nombre"}
                        className={`block max-w-full truncate text-left hover:text-rojo-profundo ${r.cliente ? "text-tinta" : "italic text-taupe"} ${e === "por_responder" ? "font-semibold" : ""}`}
                      >
                        {deQuien(r)}
                      </button>
                      <span className="block truncate text-[12px] text-taupe">
                        {sobreQue(r)} · {haceCuanto(r.creadaEn, ahora)}
                      </span>
                    </span>
                  </span>
                  <span className="col-start-2 row-start-1 flex justify-end sm:hidden">
                    <Chip tono={INSIGNIA[e].tono} tachado={false}>
                      {INSIGNIA[e].texto}
                    </Chip>
                  </span>
                  <span className="col-span-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1">
                    <span className="tw-globo line-clamp-3" data-sin-leer={e === "por_responder" ? "" : undefined}>
                      {r.texto}
                    </span>
                    {r.respuesta && (
                      <span className="tw-globo-respuesta line-clamp-2">
                        <small>CAYLA respondió</small>
                        {r.respuesta}
                      </span>
                    )}
                  </span>
                  <span className="hidden sm:block">
                    <Chip tono={INSIGNIA[e].tono} tachado={false}>
                      {INSIGNIA[e].texto}
                    </Chip>
                  </span>
                </div>
              );
            })}
            {paginas > 1 && (
              <div className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs text-taupe">
                <span>
                  {visibles.length} {visibles.length === 1 ? "recomendación" : "recomendaciones"}
                </span>
                <PaginacionLocal pagina={Math.min(pagina, paginas)} totalPaginas={paginas} onPagina={setPagina} />
              </div>
            )}
          </>
        )}
      </Tabla>

      <div className="nota-cayla space-y-2 text-[13px]" data-guia="recomendaciones.nota">
        <p>
          Cada recomendación llega con el nombre de quien la escribió, desde su cuenta de la tienda online: sobre una tienda o sobre CAYLA en
          general. Tu respuesta la lee en su cuenta, en «Recomendaciones», y se escribe una sola vez. Si no hace falta responder,
          archívala: sale de la bandeja sin borrarse, y el cliente la ve como leída. Si su ficha se anonimiza, la recomendación se queda
          sin su nombre ni sus datos.
          {lista.hayMas ? " Aquí se ven las 1000 más nuevas." : ""}
        </p>
      </div>

      {abierta && (
        <RecomendacionHoja
          key={abierta.id}
          recomendacion={abierta}
          veFichas={lista.veFichas}
          ahora={ahora}
          onClose={cerrar}
          onCambio={(id) => {
            setRecien(id);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
