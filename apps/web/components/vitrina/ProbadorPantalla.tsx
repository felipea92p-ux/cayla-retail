"use client";

import { useState, type CSSProperties } from "react";
import { Scissors } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { PrepararRecortesHoja } from "@/components/vitrina/PrepararRecortesHoja";
import { RevisarRecorteHoja } from "@/components/vitrina/RevisarRecorteHoja";
import { cifrasRecortes, conRecorte, porRecortar, porRevisar, type FotoDelProbador, type RecorteDeFoto } from "@/lib/recorte-probador-reglas";

/** Cuántas fotos entran en una página de la hoja de contactos: cinco filas en una pantalla ancha. */
const POR_PAGINA = 40;

type Filtro = "todas" | "listos" | "por_revisar" | "sin_recorte";

function filtrar(fotos: readonly FotoDelProbador[], filtro: Filtro): FotoDelProbador[] {
  if (filtro === "listos") return fotos.filter((f) => f.recorte?.estado === "listo");
  if (filtro === "por_revisar") return porRevisar(fotos);
  if (filtro === "sin_recorte") return porRecortar(fotos);
  return [...fotos];
}

/**
 * Tienda web ▸ Vitrina ▸ Probador (ADR-0434, actividad 1): lo que necesita «Arma el tuyo», el probador de looks de la tienda online.
 * Hoy, que cada foto de un modelo publicado tenga su recorte (la prenda sin fondo, para encimarla en el probador). «Preparar recortes»
 * los hace en este equipo y «Revisar» deja usar o descartar los que salieron dudosos. Ninguna foto se modifica: el recorte es un archivo
 * más (Felipe, 2026-10-16). Toda escritura pasa por una hoja con el combo «Responsable» (ADR-0162).
 */
export function ProbadorPantalla({ fotos: iniciales }: { fotos: FotoDelProbador[] }) {
  const [fotos, setFotos] = useState(iniciales);
  // Lo que trae el servidor al refrescar manda (sin un efecto: se ajusta al dibujar, como pide React).
  const [deServidor, setDeServidor] = useState(iniciales);
  if (deServidor !== iniciales) {
    setDeServidor(iniciales);
    setFotos(iniciales);
  }
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [pagina, setPagina] = useState(1);
  const [preparando, setPreparando] = useState(false);
  // Las fotos que se están revisando, en orden (una sola si se tocó en la hoja de contactos).
  const [revisando, setRevisando] = useState<string[] | null>(null);

  const cifras = cifrasRecortes(fotos);
  const visibles = filtrar(fotos, filtro);
  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const paginaVista = Math.min(pagina, totalPaginas);
  const deLaPagina = visibles.slice((paginaVista - 1) * POR_PAGINA, paginaVista * POR_PAGINA);
  const alternarFiltro = (f: Filtro) => {
    setFiltro((actual) => (actual === f ? "todas" : f));
    setPagina(1);
  };
  const actualizar = (foto: string, recorte: RecorteDeFoto) => setFotos((fs) => conRecorte(fs, foto, recorte));
  const aRevisar = revisando ? revisando.map((id) => fotos.find((f) => f.foto === id)).filter((f): f is FotoDelProbador => Boolean(f)) : [];

  const preparar = (
    <Boton type="button" peso="primario" aria-haspopup="dialog" data-guia="probador.preparar" onClick={() => setPreparando(true)}>
      {cifras.sinRecorte === 1 ? "Preparar 1 recorte" : `Preparar ${cifras.sinRecorte} recortes`}
    </Boton>
  );

  return (
    <div className="tw space-y-6">
      <div className="grid gap-3 sm:grid-cols-3" data-guia="probador.cifras">
        <TarjetaCifra
          punto="verde"
          etiqueta="Recortadas"
          className="anim-entra"
          style={{ ["--i" as string]: 0 } as CSSProperties}
          valor={<CifraQueCuenta valor={cifras.listos} alMontar />}
          activa={filtro === "listos"}
          onClick={() => alternarFiltro("listos")}
        >
          {`de ${cifras.fotos} ${cifras.fotos === 1 ? "foto" : "fotos"} de la web`}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.porRevisar > 0 ? "ambar" : "neutro"}
          etiqueta="Por revisar"
          className="anim-entra"
          style={{ ["--i" as string]: 1 } as CSSProperties}
          valor={<CifraQueCuenta valor={cifras.porRevisar} alMontar />}
          activa={filtro === "por_revisar"}
          onClick={() => alternarFiltro("por_revisar")}
        >
          {cifras.porRevisar > 0 ? "Salieron dudosas: míralas antes de usarlas" : "Ninguna salió dudosa"}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.sinRecorte > 0 ? "ambar" : "neutro"}
          etiqueta="Sin recorte"
          className="anim-entra"
          style={{ ["--i" as string]: 2 } as CSSProperties}
          valor={<CifraQueCuenta valor={cifras.sinRecorte} alMontar />}
          activa={filtro === "sin_recorte"}
          onClick={() => alternarFiltro("sin_recorte")}
        >
          {cifras.sinRecorte > 0 ? "No salen en el probador hasta recortarlas" : "Todas tienen su recorte"}
        </TarjetaCifra>
      </div>

      <section className="card-cayla space-y-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-sand px-5 py-4">
          <p className="min-w-[14rem] flex-1 text-[13px] text-taupe" data-guia="probador.ayuda">
            Así sale cada prenda en el probador de «Arma el tuyo»: recortada, sin fondo. Toca una para mirarla de cerca y usarla o descartarla.
          </p>
          {cifras.porRevisar > 0 && (
            <Boton type="button" aria-haspopup="dialog" data-guia="probador.revisar" onClick={() => setRevisando(porRevisar(fotos).map((f) => f.foto))}>
              {cifras.porRevisar === 1 ? "Revisar 1" : `Revisar ${cifras.porRevisar}`}
            </Boton>
          )}
          {cifras.sinRecorte > 0 && preparar}
        </div>

        {fotos.length === 0 ? (
          <Vacio icono={<Scissors />} titulo="Todavía no hay fotos en la web">
            Primero muestra modelos con foto en la pestaña Modelos: sus fotos aparecen aquí para recortarlas.
          </Vacio>
        ) : visibles.length === 0 ? (
          <Vacio icono={<Scissors />} tamano="chico">
            {filtro === "por_revisar" ? "Ningún recorte espera revisión." : filtro === "sin_recorte" ? "Todas las fotos tienen su recorte." : "Todavía no hay recortes listos."}
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
      </section>

      <div className="nota-cayla space-y-2 text-[13px]" data-guia="probador.nota">
        <p>
          El recorte sale de la foto original con el mismo «sin fondo» que se usa al subir una foto, y conserva la luz de la foto de la tienda.
          Ninguna foto cambia: el recorte es un archivo aparte que solo usa el probador. Una foto descartada no sale en el probador; la puedes
          volver a usar cuando quieras.
        </p>
      </div>

      {preparando && (
        <PrepararRecortesHoja
          pendientes={porRecortar(fotos)}
          onRecorte={actualizar}
          onClose={() => setPreparando(false)}
        />
      )}
      {revisando && aRevisar.length > 0 && (
        <RevisarRecorteHoja key={revisando.join(",")} fotos={aRevisar} onHecho={actualizar} onClose={() => setRevisando(null)} />
      )}
    </div>
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
