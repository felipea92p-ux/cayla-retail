"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Clienta } from "@/lib/clientas-reglas";
import type { CifrasClientas } from "@/lib/clientas";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { buscarClienta, exportarClientas } from "@/lib/clientas-acciones";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { CampoTexto, Boton, Interruptor } from "@/components/ui/campos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { NuevaClientaModal } from "@/components/NuevaClientaModal";
import { ClientaFichaModal } from "@/components/ClientaFichaModal";
import { LlegoMensajeWhatsappModal } from "@/components/clientas/LlegoMensajeWhatsappModal";
import { Chip } from "@/components/ui/Chip";
import { Encabezado, TABLA, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { estadoClub } from "@/lib/club-reglas";
import { FILTROS_CLUB, cumpleLegible, pasaFiltroClub, type FiltroClub } from "@/lib/club-clientas-reglas";
import { descargarCsv } from "@/lib/exportar-csv";
import { TIPOS_DOCUMENTO_CLIENTA, documentoLegible } from "@/lib/documento-clienta-reglas";

// Clientas, paso 2 del acta (D-92 a D-111, docs/datos/DECISIONES-2026-09-26-clientas.md sección
// H): de la pantalla mínima de verificación (D-76/D-77) a la de verdad — buscar por documento
// (DNI, carné de extranjería o pasaporte, ADR-0288 D-2) o celular, abrir la ficha (compras,
// cambios, devoluciones y apartados LEÍDOS de sus tablas, nunca copiados), editar con candado
// optimista, archivar/anonimizar y unir dos fichas (D-99).
// D-109: cualquier cuenta con el módulo ve a TODAS las clientas, sin distinguir sede — por eso
// la cabecera dice «Todas las sedes» en vez de mostrar la sede activa (Felipe, 2026-09-27).
// ADR-0288 tanda 1b: cada fila dice si es socia (con su código) y si recibe novedades por WhatsApp; la cabecera suma
// «Llegó un mensaje de WhatsApp» (registrar su permiso, registrarla desde el cartel o su BAJA) y el cartel del mostrador.
const PLANTILLA = "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)]";
const COLUMNAS: Columna[] = [
  { titulo: "Clienta" },
  { titulo: "Celular" },
  { titulo: "Estado", ayuda: "Identificada: tiene ficha y sus compras se ligan. Socia: dijo que sí al club (beneficios y avisos informativos)." },
  { titulo: "Publicidad", ayuda: "Novedades, rebajas y su saludo por WhatsApp: solo si ella se lo pidió a la tienda desde su QR." },
  { titulo: "Cumpleaños" },
];

export function ClientasPanel({
  clientasIniciales,
  busquedaInicial = "",
  whatsappPorTienda = {},
  cifras = null,
  mesActual,
}: {
  clientasIniciales: Clienta[];
  busquedaInicial?: string;
  /** El WhatsApp de cada tienda (id → número), para el QR de una socia en su ficha. */
  whatsappPorTienda?: Record<string, string | null>;
  /** Las cifras de la cabecera, contadas por la base; `null` = sin cifras (la base aún no tiene el club). */
  cifras?: CifrasClientas | null;
  /** 1–12, el mes de hoy en Lima. */
  mesActual: number;
}) {
  const [termino, setTermino] = useState(busquedaInicial);
  const [incluirArchivadas, setIncluirArchivadas] = useState(false);
  const [resultados, setResultados] = useState<Clienta[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [recientes, setRecientes] = useState(clientasIniciales);
  // Tras un cambio, `router.refresh()` trae la lista de nuevo del servidor: la de «Últimas registradas» la toma.
  const [recientesDelServidor, setRecientesDelServidor] = useState(clientasIniciales);
  if (clientasIniciales !== recientesDelServidor) {
    setRecientesDelServidor(clientasIniciales);
    setRecientes(clientasIniciales);
  }
  const router = useRouter();
  const [abriendoAlta, setAbriendoAlta] = useState(false);
  const [abriendoMensaje, setAbriendoMensaje] = useState(false);
  const [fichaAbiertaId, setFichaAbiertaId] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [filtro, setFiltro] = useState<FiltroClub>("todas");

  // D-109/G.4: exportar la lista completa es solo de Admin — la base lo exige de nuevo y deja
  // rastro en `retail.actividad` de quién exportó y cuándo. El botón lo intenta cualquier cuenta;
  // quien no es Admin recibe el mensaje de la base, sin necesidad de ocultarlo a medias en la UI.
  async function onExportar() {
    setExportando(true);
    const { clientas, error } = await exportarClientas();
    setExportando(false);
    if (error) {
      avisar.error(traducirError(error, "exportar la lista de clientas"));
      return;
    }
    descargarCsv(
      `clientas-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Tipo de documento", "Número de documento", "Nombre", "Celular", "Socia desde", "Código de socia", "Novedades por WhatsApp", "Cumpleaños", "Registrada", "Estado"],
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
        c.archivadaEn ? (c.anonimizada ? "anonimizada" : c.fusionadaEnId ? "unida a otra" : "archivada") : "activa",
      ]),
    );
    avisar.exito("Lista exportada", { detalle: `${clientas.length} clienta${clientas.length === 1 ? "" : "s"}` });
  }

  async function buscar(termino: string, incluirArchivadas: boolean) {
    if (termino.trim() === "") {
      setResultados(null);
      return;
    }
    setBuscando(true);
    const { clientas, error } = await buscarClienta(termino, incluirArchivadas);
    setBuscando(false);
    if (error) {
      avisar.error(traducirError(error, "buscar la clienta"));
      return;
    }
    setResultados(clientas);
  }

  async function onBuscar(e: React.FormEvent) {
    e.preventDefault();
    await buscar(termino, incluirArchivadas);
  }

  // «Ficha de la clienta» desde Ventas ▸ Historial (ADR-0230) llega con `?q=<nombre>`: se busca una vez al abrir.
  const yaBuscoInicial = useRef(false);
  useEffect(() => {
    if (!busquedaInicial.trim() || yaBuscoInicial.current) return;
    yaBuscoInicial.current = true;
    void buscar(busquedaInicial, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

  const lista = resultados ?? recientes;
  const filtradas = lista.filter((c) => pasaFiltroClub(c, filtro, mesActual));

  /** Tras cualquier cambio (ficha, club, mensaje): la lista vuelve a leerse, sin perder la búsqueda activa. */
  function refrescar() {
    router.refresh();
    if (resultados !== null) void buscar(termino, incluirArchivadas);
  }

  return (
    <div className="space-y-8">
      <EncabezadoPagina
        sede="Todas las sedes"
        titulo="Clientas"
        subtitulo="El club de CAYLA: la tienda la recuerda y le escribe solo cuando tiene algo que le sirve."
        acciones={
          <>
            <Boton onClick={onExportar} cargando={exportando} title="Solo un Admin puede exportar la lista completa">
              Exportar
            </Boton>
            <Boton onClick={() => router.push("/clientas/cartel")} title="El QR del club para el mostrador de cada tienda">
              Imprimir cartel
            </Boton>
            <Boton onClick={() => setAbriendoMensaje(true)} title="Registrar su permiso de novedades, su alta desde el cartel o su BAJA">
              Llegó un mensaje de WhatsApp
            </Boton>
            <Boton peso="primario" onClick={() => setAbriendoAlta(true)}>
              + Nueva clienta
            </Boton>
          </>
        }
      />

      {/* Las cifras del spike del club (`fichasHTML`), contadas por la base. Sin «Frecuentes»: necesita las compras de cada
          clienta y hoy solo la ficha las lee (fn_clienta_compras). */}
      {cifras && (
        <div className="anim-sube grid grid-cols-2 gap-3 lg:grid-cols-3" style={{ "--i": 1 } as React.CSSProperties}>
          <TarjetaCifra etiqueta="Identificadas" valor={cifras.identificadas}>
            Con ficha: sus compras se ligan
          </TarjetaCifra>
          <TarjetaCifra etiqueta="Socias del club" valor={cifras.socias}>
            {cifras.identificadas > 0 ? `${Math.round((cifras.socias / cifras.identificadas) * 100)} % de las identificadas` : "Todavía ninguna"}
          </TarjetaCifra>
          <TarjetaCifra etiqueta="Con publicidad" valor={cifras.conPublicidad} punto="verde">
            {cifras.socias - cifras.conPublicidad} socia{cifras.socias - cifras.conPublicidad === 1 ? "" : "s"} sin publicidad
          </TarjetaCifra>
        </div>
      )}

      <div className="card-cayla space-y-4 p-5">
        <form onSubmit={onBuscar} className="flex flex-wrap items-end gap-3">
          <div className="max-w-sm flex-1">
            <CampoTexto etiqueta="Buscar" value={termino} onChange={(e) => setTermino(e.target.value)} placeholder="Documento, WhatsApp o nombre…" /* sugerir-fijo: qué se puede buscar en la libreta; no depende de nada elegido antes */ caja />
          </div>
          <Boton type="submit" peso="primario" cargando={buscando}>
            Buscar
          </Boton>
          {resultados !== null && (
            <Boton
              type="button"
              onClick={() => {
                setTermino("");
                setResultados(null);
              }}
            >
              Limpiar
            </Boton>
          )}
          <div className="ml-auto">
            <Interruptor
              activo={incluirArchivadas}
              onActivo={(v) => {
                setIncluirArchivadas(v);
                if (resultados !== null) void buscar(termino, v);
              }}
              etiqueta="Incluir archivadas"
            />
          </div>
        </form>

        {/* Como el spike del club (`fichasHTML`): filtros en píldoras y la lista en una tabla con «Estado» y «Publicidad». */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar la lista">
          {FILTROS_CLUB.map((f) => (
            <button key={f.valor} type="button" className="pildora-cayla" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}>
              {f.texto}
              <span className="ml-1.5 font-medium tracking-normal tabular-nums opacity-60">{lista.filter((c) => pasaFiltroClub(c, f.valor, mesActual)).length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="label-cayla text-[11px] text-tinta/65">
          {resultados !== null ? `${resultados.length} resultado${resultados.length === 1 ? "" : "s"}` : "Últimas registradas"}
          {filtro !== "todas" && ` · ${filtradas.length} con «${FILTROS_CLUB.find((f) => f.valor === filtro)?.texto}»`}
        </p>
        {filtradas.length === 0 ? (
          <p className="card-cayla p-5 text-sm text-tinta/75">
            {lista.length === 0 ? (resultados !== null ? "Sin coincidencias." : "Todavía no hay clientas registradas.") : "Ninguna con ese filtro."}
          </p>
        ) : (
          <Tabla>
            <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
            {filtradas.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFichaAbiertaId(c.id)}
                className={`${fila(PLANTILLA, "w-full cursor-pointer text-left")} ${c.archivadaEn ? "opacity-60" : ""}`}
              >
                <span className={celda()}>
                  <span className="block truncate text-sm font-medium text-tinta">{c.nombre ?? "Sin nombre"}</span>
                  <span className="block truncate text-xs text-tinta/65">
                    {[documentoLegible(c.documentoTipo, c.documentoNumero, false), c.codigoClub].filter(Boolean).join(" · ") || "Sin documento"}
                  </span>
                </span>
                <span className={celda("izq", "text-sm text-tinta/80")}>{c.telefonoWhatsapp ?? "—"}</span>
                <span className={celda()}>
                  {c.archivadaEn ? (
                    <Chip tono="apagado" tachado={false}>
                      {c.anonimizada ? "Anonimizada" : c.fusionadaEnId ? "Unida a otra" : "Archivada"}
                    </Chip>
                  ) : estadoClub(c) === "no_socia" ? (
                    <Chip tono="pizarra">Identificada</Chip>
                  ) : (
                    <Chip tono="neutro">Socia</Chip>
                  )}
                </span>
                <span className={celda()}>
                  {c.archivadaEn || estadoClub(c) === "no_socia" ? (
                    <span className="text-sm text-tinta/50">—</span>
                  ) : c.publicidadDesde ? (
                    <Chip tono="verde">Publicidad</Chip>
                  ) : (
                    <Chip tono="neutro">Sin publicidad</Chip>
                  )}
                </span>
                <span className={celda("izq", "text-sm text-tinta/80")}>{c.cumpleDia && c.cumpleMes ? cumpleLegible(c.cumpleDia, c.cumpleMes, c.cumpleAnio) : "—"}</span>
              </button>
            ))}
            <div className={TABLA.pie}>
              {filtradas.length} de {lista.length} · el filtro mira lo que está a la vista (las últimas registradas o el resultado de la búsqueda) · todas las
              cuentas con el módulo ven a todas
            </div>
          </Tabla>
        )}
        <p className="nota-cayla">«Sin publicidad» son socias que todavía no pidieron novedades y rebajas por WhatsApp: reciben solo los avisos informativos.</p>
      </div>

      {abriendoAlta && (
        <NuevaClientaModal
          onClose={() => setAbriendoAlta(false)}
          onCreada={(clienta) => {
            setAbriendoAlta(false);
            setRecientes((prev) => [clienta, ...prev.filter((c) => c.id !== clienta.id)]);
          }}
        />
      )}

      {fichaAbiertaId && (
        <ClientaFichaModal
          id={fichaAbiertaId}
          onClose={() => setFichaAbiertaId(null)}
          onCambiada={refrescar}
          whatsappPorTienda={whatsappPorTienda}
        />
      )}

      {abriendoMensaje && (
        <LlegoMensajeWhatsappModal
          onClose={() => setAbriendoMensaje(false)}
          onListo={(clientaId) => {
            setAbriendoMensaje(false);
            refrescar();
            // Queda a la vista la ficha que se registró: ahí se ve «Socia · recibe novedades por WhatsApp».
            if (clientaId) setFichaAbiertaId(clientaId);
          }}
        />
      )}
    </div>
  );
}
