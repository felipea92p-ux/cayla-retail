"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { exportarClientas } from "@/lib/clientas-acciones";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { NuevaClientaModal } from "@/components/NuevaClientaModal";
import { ClientaFichaModal } from "@/components/ClientaFichaModal";
import { BuscadorClientas } from "@/components/clientas/BuscadorClientas";
import { Chip } from "@/components/ui/Chip";
import { TABLA, Tabla } from "@/components/ui/Tabla";
import { celularLegible } from "@/lib/club-caja-reglas";
import {
  COLUMNAS_EXPORTAR,
  cuentaDelFiltro,
  detalleConFicha,
  detalleFrecuentes,
  detallePublicidad,
  detalleSocias,
  estadoDeLaFila,
  filaParaExportar,
  filtrosParaRevisar,
  fraseDeLaFila,
  hrefLista,
  pieLista,
  suSedeLegible,
  ultimaCompraLegible,
  ultimaPagina,
  type CifrasClientas,
  type ClientaDeLista,
  type FiltroLista,
  type ParamsLista,
} from "@/lib/clientas-lista-reglas";
import { descargarCsv } from "@/lib/exportar-csv";
import { hoyLima } from "@/lib/fechas-lima";
import { contactoVisible } from "@/lib/documento-clienta-reglas";
import { FunnelX, QrCode, SearchX, Users } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { Paginas } from "@/components/ui/Paginas";

// Clientes ▸ Fichas, diseño B (Felipe 2026-10-20, docs/maquetas/fichas-b-2026-10/; antes, la tabla de seis columnas del spike del club,
// ADR-0288 «Actualización 2026-09-30 (f)»): cabecera con «Descargar lista», «Cartel del club» y «+ Nuevo cliente» en una fila (el
// «Más» se fue: tenía una sola opción); cuatro cifras que son también los filtros principales (tocar «Miembros del club» filtra
// la lista: así sobra la fila de píldoras repetida); el buscador, las píldoras «Para revisar» y, en vez de una tabla, una tarjeta por
// persona con una frase que dice quién es («Miembro desde mar 2026 · compra seguido · recibe novedades»), todo en UNA tarjeta
// (CLAUDE.md, ADR-0169); la nota de «su sede» al pie. La lista, sus cuentas y cada dato calculado (su sede, última compra, frecuente
// con compra neta) los da la base sobre TODAS las fichas (`fn_clientas_lista`, `fn_cifras_clientas`): la pantalla solo los pinta
// y pagina. Búsqueda, filtro y página viven en la URL (`?q=&filtro=&pagina=`).
// D-109: cualquier cuenta con el módulo ve a TODAS las clientas, sin distinguir sede — por eso la cabecera dice «Todas las
// sedes» en vez de la sede activa (Felipe, 2026-09-27).

export function ClientasPanel({
  filas,
  total,
  falla = null,
  params,
  cifras = null,
  hoy,
  verCompleto = false,
}: {
  /** La página de la lista que pidió la URL (`fn_clientas_lista`). */
  filas: ClientaDeLista[];
  /** Cuántas pasan el filtro y la búsqueda (para el pie y la paginación). */
  total: number;
  /** Si la base no pudo dar la lista (la migración de la tanda 1f sin pegar): la pantalla lo dice y sigue. */
  falla?: string | null;
  params: ParamsLista;
  /** El DNI y el celular completos (Felipe 2026-10-13: solo el líder); los demás los ven a medias. */
  verCompleto?: boolean;
  /** Las cifras y las cuentas de las píldoras, de toda la base; `null` = sin cifras. */
  cifras?: CifrasClientas | null;
  /** Hoy en Lima (`aaaa-mm-dd`), para «hace N d»: lo decide el servidor, no el reloj del navegador. */
  hoy: string;
}) {
  const router = useRouter();
  const [abriendoAlta, setAbriendoAlta] = useState(false);
  const [fichaAbiertaId, setFichaAbiertaId] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  // D-109/G.4 (CL-28): exportar la lista completa es solo de Admin — la base lo exige de nuevo y deja rastro en
  // `retail.actividad` de quién exportó y cuándo. El botón lo intenta cualquier cuenta; quien no es Admin recibe el mensaje
  // de la base, sin necesidad de ocultarlo a medias en la UI.
  async function onExportar() {
    setExportando(true);
    const { clientas, error } = await exportarClientas();
    setExportando(false);
    if (error) {
      avisar.error(traducirError(error, "exportar la lista de clientes", { lectura: true }));
      return;
    }
    descargarCsv(`clientes-${hoyLima()}.csv`, COLUMNAS_EXPORTAR, clientas.map(filaParaExportar));
    avisar.exito("Lista exportada", { detalle: `${clientas.length} cliente${clientas.length === 1 ? "" : "s"}` });
  }

  /** Tras cualquier cambio (ficha, BAJA, alta): la página vuelve a leerse del servidor, con la misma URL. */
  function refrescar() {
    router.refresh();
  }

  /** Tocar una cifra la pone de filtro; tocar la que ya está puesta vuelve a «Todos». */
  function filtrar(filtro: FiltroLista) {
    router.push(hrefLista(params, { filtro: params.filtro === filtro ? "todas" : filtro }), { scroll: false });
  }

  const paginas = ultimaPagina(total);
  // El vacío dice por qué y ofrece deshacerlo ahí mismo (ADR-0358 ronda 5): borrar la búsqueda o volver a «Todos».
  const vacioIcono = params.termino ? <SearchX /> : params.filtro === "todas" ? <Users /> : <FunnelX />;
  const vacioAccion = params.termino
    ? { texto: "Borrar la búsqueda", href: hrefLista(params, { termino: "" }) }
    : params.filtro === "todas"
      ? undefined
      : { texto: "Limpiar filtros", href: hrefLista(params, { filtro: "todas" }) };
  const vacio = params.termino
    ? `Sin coincidencias con «${params.termino}». Busca por el documento completo, el celular, el código de miembro o parte del nombre.`
    : params.filtro === "todas"
      ? "Todavía no hay clientes registrados."
      : "Ninguno con ese filtro.";

  return (
    <div className="space-y-8">
      <EncabezadoPagina
        sede="Todas las sedes"
        titulo="Fichas"
        subtitulo="Aquí están los clientes que la tienda recuerda. Toca uno para ver su historia y sus beneficios."
        acciones={
          // A 375 px los botones van con `px-3`, «Descargar» a secas y «Cartel» sin su «del club» ni su ícono: «Descargar» y «Cartel»
          // caben en una fila y «+ Nuevo cliente» baja a la suya (con el «Más» de antes cabían los tres). La fila se parte sola.
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2.5 sm:gap-x-3">
            <BotonDescargar onClick={onExportar} cargando={exportando} className="max-sm:px-3 max-sm:[&_.lucide-download]:hidden" title="Solo un Admin puede descargar la lista completa" guia="clientas.exportar">
              Descargar<span className="max-sm:hidden"> lista</span>
            </BotonDescargar>
            {/* Antes iba en un «Más» que tenía solo esta opción: ahora es un botón a la vista. Lleva a su pantalla (la hoja A4 con
                el QR de cada tienda), no imprime desde aquí: por eso el ícono es el del QR y no el de la impresora. */}
            <BotonEnlace href="/clientas/cartel" peso="fantasma" className="max-sm:px-3 max-sm:[&_.lucide-qr-code]:hidden" data-guia="clientas.cartel" title="Abre el cartel con el QR del club, para imprimirlo">
              <QrCode className="h-4 w-4" aria-hidden />
              Cartel<span className="max-sm:hidden"> del club</span>
            </BotonEnlace>
            <Boton peso="primario" className="max-sm:px-3" onClick={() => setAbriendoAlta(true)} data-guia="clientas.nuevo">
              + Nuevo cliente
            </Boton>
          </div>
        }
      />

      {cifras && (
        <div className="anim-sube grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ "--i": 1 } as React.CSSProperties} data-guia="clientas.cifras">
          {/* Cada cifra es también un filtro (la que está puesta se rellena; tocarla otra vez vuelve a «Todos»): la lista no repite
              esos cuatro como píldora. Un filtro por clic navega con el loader de siempre (ADR-0149). */}
          <TarjetaCifra etiqueta="Clientes con ficha" valor={cifras.identificadas} onClick={() => filtrar("todas")} activa={params.filtro === "todas"}>
            {detalleConFicha()}
          </TarjetaCifra>
          <TarjetaCifra etiqueta="Miembros del club" valor={cifras.socias} onClick={() => filtrar("socias")} activa={params.filtro === "socias"}>
            {detalleSocias(cifras)}
          </TarjetaCifra>
          <TarjetaCifra etiqueta="Reciben novedades" valor={cifras.conPublicidad} punto="verde" onClick={() => filtrar("con_publicidad")} activa={params.filtro === "con_publicidad"}>
            {detallePublicidad(cifras)}
          </TarjetaCifra>
          <TarjetaCifra etiqueta="Compran seguido" valor={cifras.frecuentes} onClick={() => filtrar("frecuentes")} activa={params.filtro === "frecuentes"}>
            {detalleFrecuentes()}
          </TarjetaCifra>
        </div>
      )}

      <div className="anim-sube space-y-4" style={{ "--i": 2 } as React.CSSProperties}>
        <Tabla className="@container">
          <div className="space-y-3 p-4">
            <BuscadorClientas params={params} />
            {/* «Para revisar»: lo que no es una cifra. Sin cifras (la base no las dio) vuelven todos los filtros como píldora. */}
            <nav className="flex flex-wrap items-center gap-2" aria-label="Filtrar la lista" data-guia="clientas.filtros">
              {cifras && <span className="label-cayla mr-1 text-[10.5px] text-tinta/60">Para revisar</span>}
              {filtrosParaRevisar(cifras !== null).map((f) => (
                <Link
                  key={f.valor}
                  href={hrefLista(params, { filtro: f.valor })}
                  scroll={false}
                  className="pildora-cayla"
                  aria-current={params.filtro === f.valor ? "page" : undefined}
                >
                  {f.texto}
                  {cifras && <span className="ml-1.5 font-medium tracking-normal tabular-nums dark:opacity-85">{cuentaDelFiltro(cifras, f.valor)}</span>}
                </Link>
              ))}
            </nav>
          </div>

          <div data-resultados data-guia="clientas.lista">
            {falla ? (
              <div className="p-5">
                <Aviso tono="error" chico>
                  {falla}
                </Aviso>
              </div>
            ) : filas.length === 0 ? (
              <Vacio tamano="chico" icono={vacioIcono} accion={vacioAccion} className="py-5">
                {vacio}
              </Vacio>
            ) : (
              <ul className="grid gap-2.5 p-4">
                {filas.map((c, i) => (
                  <li key={c.id}>
                    <FilaClienta c={c} hoy={hoy} verCompleto={verCompleto} onAbrir={() => setFichaAbiertaId(c.id)} guiaPrimera={i === 0} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!falla && (
            <div className={`${TABLA.pie} flex flex-wrap items-center justify-between gap-x-4 gap-y-2`} data-guia="clientas.pie">
              <span>{pieLista(total, params.filtro, cifras)}</span>
              {/* La paginación del sistema (ADR-0358, ronda 8), por URL como antes. */}
              <Paginas pagina={params.pagina} totalPaginas={paginas} hrefDe={(n) => hrefLista(params, { pagina: n })} />
            </div>
          )}
        </Tabla>
      </div>

      <p className="nota-cayla anim-sube" style={{ "--i": 3 } as React.CSSProperties} data-guia="clientas.nota">
        La <b>sede</b> de cada cliente es donde más compró en los últimos 12 meses: se calcula al leer, nunca se escribe. «No reciben novedades» son
        miembros que todavía no pidieron novedades y rebajas por WhatsApp: reciben solo los avisos informativos.
      </p>

      {abriendoAlta && (
        <NuevaClientaModal
          onClose={() => setAbriendoAlta(false)}
          onCreada={() => {
            setAbriendoAlta(false);
            refrescar();
          }}
          // Ese documento ya tenía ficha (un documento es de una sola persona): se abre la suya en vez de crear otra.
          onAbrirFicha={(id) => {
            setAbriendoAlta(false);
            setFichaAbiertaId(id);
            refrescar();
          }}
        />
      )}

      {fichaAbiertaId && (
        <ClientaFichaModal id={fichaAbiertaId} verCompleto={verCompleto} onClose={() => setFichaAbiertaId(null)} onCambiada={refrescar} />
      )}
    </div>
  );
}

/** Una tarjeta por persona (diseño B): su cara, su nombre y la frase que dice quién es; a la derecha, su última compra y dónde. El DNI
 *  y el celular completos solo para el líder; los demás, a medias (Felipe 2026-10-13, auditoría punto 18). */
function FilaClienta({ c, hoy, verCompleto, onAbrir, guiaPrimera }: { c: ClientaDeLista; hoy: string; verCompleto: boolean; onAbrir: () => void; guiaPrimera: boolean }) {
  const ultima = ultimaCompraLegible(c.ultimaCompra, hoy);
  const contacto = contactoVisible(c, verCompleto, celularLegible);
  const dondeYCelular = [c.suSede ? suSedeLegible(c.suSede) : null, contacto.celular].filter(Boolean).join(" · ") || "Sin celular";
  // El archivado, anonimizado o unido a otra ficha dice por qué en una insignia (la frase lo repite en palabras).
  const fuera = c.archivadaEn ? estadoDeLaFila(c) : null;
  // La guía interactiva escribe en el buscador la primera palabra de un nombre de esta lista: solo sirve una de 3 letras o más.
  const nombreDeEjemplo = (c.nombre ?? "").split(/\s+/).some((p) => p.length >= 3);
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`card-cayla grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-4 py-3 text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-taupe motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${c.archivadaEn ? "opacity-60" : ""}`}
      data-guia={guiaPrimera ? "clientas.fila" : undefined}
    >
      <AvatarPersona personaId={null} nombre={c.nombre ?? ""} tamano={40} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-display text-[19px] leading-tight text-tinta" data-guia={guiaPrimera && nombreDeEjemplo ? "clientas.nombre" : undefined}>
            {c.nombre ?? "Sin nombre"}
          </span>
          {fuera && (
            <Chip tono={fuera.tono} tachado={false}>
              {fuera.texto}
            </Chip>
          )}
        </span>
        <span className="block text-[13px] text-tinta/70">{fraseDeLaFila(c)}</span>
      </span>
      <span className="col-span-2 grid gap-0.5 text-xs text-tinta/65 sm:col-span-1 sm:justify-items-end sm:text-right">
        {ultima ? (
          <span>
            Última compra <b className="font-medium text-tinta">{ultima.hace}</b>
          </span>
        ) : (
          <span>Sin compras todavía</span>
        )}
        <span>{dondeYCelular}</span>
      </span>
    </button>
  );
}
