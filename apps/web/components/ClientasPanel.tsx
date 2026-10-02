"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { exportarClientas } from "@/lib/clientas-acciones";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { MenuAcciones } from "@/components/ui/MenuAcciones";
import { NuevaClientaModal } from "@/components/NuevaClientaModal";
import { ClientaFichaModal } from "@/components/ClientaFichaModal";
import { BuscadorClientas } from "@/components/clientas/BuscadorClientas";
import { Chip } from "@/components/ui/Chip";
import { TABLA, Tabla } from "@/components/ui/Tabla";
import { cumpleLegible } from "@/lib/club-clientas-reglas";
import { celularLegible } from "@/lib/club-caja-reglas";
import {
  FILTROS_LISTA,
  POR_PAGINA,
  cuentaDelFiltro,
  detalleFrecuentes,
  detallePublicidad,
  detalleSocias,
  estadoDeLaFila,
  hrefLista,
  pieLista,
  publicidadDeLaFila,
  suSedeLegible,
  ultimaCompraLegible,
  type CifrasClientas,
  type ClientaDeLista,
  type ParamsLista,
} from "@/lib/clientas-lista-reglas";
import { descargarCsv } from "@/lib/exportar-csv";
import { TIPOS_DOCUMENTO_CLIENTA, documentoLegible } from "@/lib/documento-clienta-reglas";

// Clientas ▸ Fichas, como el spike del club (docs/maquetas/club-clientas-spike-2026-09/, `fichasHTML` de 50-clientas.js; ADR-0288
// «Actualización 2026-09-30 (f)»): cabecera con Exportar, «Más» y «+ Nuevo cliente» en una fila; cuatro cifras (identificadas,
// socias, con publicidad, frecuentes); el buscador y los filtros en píldoras, y la tabla, en UNA tarjeta (CLAUDE.md, ADR-0169);
// la nota de «su sede» al pie. La lista, sus cuentas y cada columna calculada (su sede, última compra, frecuente con compra
// neta) las da la base sobre TODAS las fichas (`fn_clientas_lista`, `fn_cifras_clientas`): la pantalla solo las pinta y
// pagina. Búsqueda, filtro y página viven en la URL (`?q=&filtro=&pagina=`).
// D-109: cualquier cuenta con el módulo ve a TODAS las clientas, sin distinguir sede — por eso la cabecera dice «Todas las
// sedes» en vez de la sede activa (Felipe, 2026-09-27).
//
// La tabla decide su forma por el ancho de la TARJETA (`@container`), no por el de la ventana: con el lateral abierto, una
// ventana de 800 px deja ~450 px a la tabla, y las seis columnas del spike cortaban el chip de estado y el celular.
//   · 800 px o más: las seis columnas del spike, con un mínimo que deja entero cada chip, el celular y la última compra;
//   · de 560 a 800: cuatro (el celular va bajo el documento y la publicidad bajo el estado);
//   · menos de 560 (celular, o una ventana angosta con el lateral): cada fila apila sus datos.
// El spike tiene su propio error aquí (los chips se montan sobre la columna de al lado): no se copió.
const PLANTILLA =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 " +
  "@min-[560px]:grid-cols-[minmax(0,1.6fr)_minmax(4.5rem,0.7fr)_minmax(8rem,1fr)_minmax(7.5rem,0.9fr)] @min-[560px]:items-center " +
  "@min-[800px]:grid-cols-[minmax(8rem,1.7fr)_minmax(6.5rem,0.9fr)_minmax(4.5rem,0.7fr)_minmax(8rem,1.1fr)_minmax(7.5rem,1fr)_minmax(7.5rem,1.2fr)]";
const SOLO_ANCHA = "hidden @min-[800px]:block";
const DESDE_MEDIA = "hidden @min-[560px]:block";

export function ClientasPanel({
  filas,
  total,
  falla = null,
  params,
  cifras = null,
  hoy,
}: {
  /** La página de la lista que pidió la URL (`fn_clientas_lista`). */
  filas: ClientaDeLista[];
  /** Cuántas pasan el filtro y la búsqueda (para el pie y la paginación). */
  total: number;
  /** Si la base no pudo dar la lista (la migración de la tanda 1f sin pegar): la pantalla lo dice y sigue. */
  falla?: string | null;
  params: ParamsLista;
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
      avisar.error(traducirError(error, "exportar la lista de clientes"));
      return;
    }
    descargarCsv(
      `clientes-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Tipo de documento", "Número de documento", "Nombre", "Celular", "Miembro desde", "Código de miembro", "Novedades por WhatsApp", "Cumpleaños", "Registrado", "Estado"],
      clientas.map((c) => [
        c.documentoNumero ? (TIPOS_DOCUMENTO_CLIENTA.find((t) => t.valor === c.documentoTipo)?.etiqueta ?? "") : "",
        c.documentoNumero ?? "",
        c.nombre ?? "",
        c.telefonoWhatsapp ?? "",
        c.clubDesde?.slice(0, 10) ?? "",
        c.codigoClub ?? "",
        c.publicidadDesde ? "sí" : "no",
        c.cumpleDia && c.cumpleMes ? cumpleLegible(c.cumpleDia, c.cumpleMes, c.cumpleAnio) : "",
        c.createdAt.slice(0, 10),
        c.archivadaEn ? (c.anonimizada ? "anonimizado" : c.fusionadaEnId ? "unido a otra ficha" : "archivado") : "activo",
      ]),
    );
    avisar.exito("Lista exportada", { detalle: `${clientas.length} cliente${clientas.length === 1 ? "" : "s"}` });
  }

  /** Tras cualquier cambio (ficha, BAJA, alta): la página vuelve a leerse del servidor, con la misma URL. */
  function refrescar() {
    router.refresh();
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const vacio = params.termino
    ? `Sin coincidencias con «${params.termino}». Busca por el documento completo, el celular, el código de miembro o parte del nombre.`
    : params.filtro === "todas"
      ? "Todavía no hay clientes registrados."
      : "Ninguno con ese filtro.";

  return (
    <div className="space-y-8">
      <EncabezadoPagina
        sede="Todas las sedes"
        titulo="Clientes"
        subtitulo="El club de CAYLA: la tienda recuerda a cada cliente y le escribe solo cuando tiene algo que le sirve."
        acciones={
          <>
            {/* `max-sm:px-3`: a 375 px los tres botones caben en una fila (con el padding de siempre, «+ Nuevo cliente» bajaba). */}
            <Boton onClick={onExportar} cargando={exportando} className="max-sm:px-3" title="Solo un Admin puede exportar la lista completa">
              Exportar
            </Boton>
            {/* Lo de vez en cuando, en el «Más» (como el de Movimientos): así las acciones caben en una fila, también a 375 px.
                «Llegó un mensaje de WhatsApp» se fue en la tanda 1g (G-7): ella se une desde el cartel y la BAJA va en su ficha. */}
            <MenuAcciones
              etiqueta="Más acciones de Clientes"
              texto="Más"
              items={[
                { clave: "cartel", etiqueta: "Imprimir el cartel del club", onSelect: () => router.push("/clientas/cartel") },
              ]}
            />
            <Boton peso="primario" className="max-sm:px-3" onClick={() => setAbriendoAlta(true)}>
              + Nuevo cliente
            </Boton>
          </>
        }
      />

      {cifras && (
        <div className="anim-sube grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ "--i": 1 } as React.CSSProperties}>
          <TarjetaCifra etiqueta="Identificados" valor={cifras.identificadas}>
            Con ficha: sus compras se ligan
          </TarjetaCifra>
          <TarjetaCifra etiqueta="Miembros del club" valor={cifras.socias}>
            {detalleSocias(cifras)}
          </TarjetaCifra>
          <TarjetaCifra etiqueta="Con publicidad" valor={cifras.conPublicidad} punto="verde">
            {detallePublicidad(cifras)}
          </TarjetaCifra>
          <TarjetaCifra etiqueta="Frecuentes" valor={cifras.frecuentes}>
            {detalleFrecuentes()}
          </TarjetaCifra>
        </div>
      )}

      <div className="anim-sube space-y-4" style={{ "--i": 2 } as React.CSSProperties}>
        <Tabla className="@container">
          <div className="space-y-3 p-4">
            <BuscadorClientas params={params} />
            {/* Un filtro por clic es una acción decidida: navega con el loader de siempre (ADR-0149). «Archivados» es una
                píldora más, al final: mira solo las fichas fuera de la libreta (para reactivar una o revisar una fusión). */}
            <nav className="flex flex-wrap gap-2" aria-label="Filtrar la lista">
              {FILTROS_LISTA.map((f) => (
                <Link
                  key={f.valor}
                  href={hrefLista(params, { filtro: f.valor })}
                  scroll={false}
                  className="pildora-cayla"
                  aria-current={params.filtro === f.valor ? "page" : undefined}
                >
                  {f.texto}
                  {cifras && <span className="ml-1.5 font-medium tracking-normal tabular-nums opacity-60">{cuentaDelFiltro(cifras, f.valor)}</span>}
                </Link>
              ))}
            </nav>
          </div>

          <div data-resultados>
            {falla ? (
              <p className={`${TABLA.vacio} text-rojo-profundo`}>{falla}</p>
            ) : filas.length === 0 ? (
              <p className={TABLA.vacio}>{vacio}</p>
            ) : (
              <>
                <div className={`encabezado-tabla-cayla hidden px-5 py-2 @min-[560px]:grid ${PLANTILLA.replace("grid ", "")}`} role="row">
                  <span className={TABLA.titulo} role="columnheader">
                    Cliente
                  </span>
                  <span className={`${TABLA.titulo} ${SOLO_ANCHA}`} role="columnheader">
                    Celular
                  </span>
                  <span className={TABLA.titulo} role="columnheader" title="Donde más compró en los últimos 12 meses">
                    Su sede
                  </span>
                  <span className={TABLA.titulo} role="columnheader" title="Identificado: tiene ficha y sus compras se ligan. Miembro: dijo que sí al club.">
                    Estado
                  </span>
                  <span className={`${TABLA.titulo} ${SOLO_ANCHA}`} role="columnheader" title="Novedades, rebajas y su saludo por WhatsApp: solo si lo pidió.">
                    Publicidad
                  </span>
                  <span className={TABLA.titulo} role="columnheader">
                    Última compra
                  </span>
                </div>
                {filas.map((c) => (
                  <FilaClienta key={c.id} c={c} hoy={hoy} onAbrir={() => setFichaAbiertaId(c.id)} />
                ))}
              </>
            )}
          </div>

          {!falla && (
            <div className={`${TABLA.pie} flex flex-wrap items-center justify-between gap-x-4 gap-y-2`}>
              <span>{pieLista(total, params.filtro, cifras)}</span>
              {paginas > 1 && (
                <nav className="flex items-center gap-3" aria-label="Páginas">
                  {params.pagina > 1 ? (
                    <Link href={hrefLista(params, { pagina: params.pagina - 1 })} className="label-cayla text-[11px] text-tinta hover:text-rojo">
                      ‹ Anterior
                    </Link>
                  ) : null}
                  <span className="tabular-nums">
                    Página {Math.min(params.pagina, paginas)} de {paginas}
                  </span>
                  {params.pagina < paginas ? (
                    <Link href={hrefLista(params, { pagina: params.pagina + 1 })} className="label-cayla text-[11px] text-tinta hover:text-rojo">
                      Siguiente ›
                    </Link>
                  ) : null}
                </nav>
              )}
            </div>
          )}
        </Tabla>
      </div>

      <p className="nota-cayla anim-sube" style={{ "--i": 3 } as React.CSSProperties}>
        La <b>sede</b> de cada cliente es donde más compró en los últimos 12 meses: se calcula al leer, nunca se escribe. «Sin publicidad» son miembros
        que todavía no pidieron novedades y rebajas por WhatsApp: reciben solo los avisos informativos.
      </p>

      {abriendoAlta && (
        <NuevaClientaModal
          onClose={() => setAbriendoAlta(false)}
          onCreada={() => {
            setAbriendoAlta(false);
            refrescar();
          }}
        />
      )}

      {fichaAbiertaId && (
        <ClientaFichaModal id={fichaAbiertaId} onClose={() => setFichaAbiertaId(null)} onCambiada={refrescar} />
      )}
    </div>
  );
}

/** Una fila: las seis columnas del spike cuando la tarjeta es ancha; más angosta, lo mismo apilado (ver PLANTILLA). */
function FilaClienta({ c, hoy, onAbrir }: { c: ClientaDeLista; hoy: string; onAbrir: () => void }) {
  const estado = estadoDeLaFila(c);
  const publicidad = publicidadDeLaFila(c);
  const ultima = ultimaCompraLegible(c.ultimaCompra, hoy);
  // Como el spike: bajo el nombre, solo el documento (el código de miembro se busca igual en el buscador).
  const documento = documentoLegible(c.documentoTipo, c.documentoNumero, false) ?? "Sin documento";
  const celular = c.telefonoWhatsapp ? celularLegible(c.telefonoWhatsapp) : null;
  const chipPublicidad = publicidad ? (
    <Chip tono={publicidad.tono} tachado={false}>
      {publicidad.texto}
    </Chip>
  ) : null;
  return (
    <button type="button" onClick={onAbrir} className={`fila-cayla w-full cursor-pointer px-5 py-3 text-left ${PLANTILLA} ${c.archivadaEn ? "opacity-60" : ""}`}>
      <span className="min-w-0">
        <span className="block break-words text-sm font-medium text-tinta @min-[560px]:truncate">{c.nombre ?? "Sin nombre"}</span>
        <span className="block truncate text-xs text-tinta/65">
          {documento}
          {celular && <span className="hidden @min-[560px]:inline @min-[800px]:hidden"> · {celular}</span>}
        </span>
      </span>
      <span className={`min-w-0 truncate text-sm tabular-nums text-tinta/80 ${SOLO_ANCHA}`}>{celular ?? "—"}</span>
      <span className={`min-w-0 truncate text-sm text-tinta/80 ${DESDE_MEDIA}`}>{suSedeLegible(c.suSede)}</span>
      <span className="flex min-w-0 flex-col items-end gap-1 @min-[560px]:items-start">
        <Chip tono={estado.tono} tachado={false}>
          {estado.texto}
        </Chip>
        {chipPublicidad && <span className="@min-[800px]:hidden">{chipPublicidad}</span>}
      </span>
      <span className={`min-w-0 ${SOLO_ANCHA}`}>{chipPublicidad ?? <span className="text-sm text-tinta/50">—</span>}</span>
      <span className={`min-w-0 text-sm text-tinta/80 ${DESDE_MEDIA}`}>
        {ultima ? (
          <>
            <span className="whitespace-nowrap">{ultima.fecha}</span> <span className="whitespace-nowrap text-xs text-tinta/55">· {ultima.hace}</span>
          </>
        ) : (
          "—"
        )}
      </span>
      {/* Menos de 560 px: su celular, su sede y su última compra en una línea bajo lo demás (se parte si no cabe: nada se
          corta a la mitad). */}
      <span className="col-span-2 min-w-0 text-xs text-tinta/65 @min-[560px]:hidden">
        {[celular, c.suSede ? `sede ${suSedeLegible(c.suSede)}` : null, ultima ? `última compra ${ultima.fecha} · ${ultima.hace}` : "sin compras todavía"]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </button>
  );
}
