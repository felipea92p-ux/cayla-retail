"use client";

import { useEffect, useRef, useState } from "react";
import type { Clienta } from "@/lib/clientas-reglas";
import { buscarClienta, exportarClientas } from "@/lib/clientas-acciones";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { CampoTexto, Boton, Interruptor } from "@/components/ui/campos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { NuevaClientaModal } from "@/components/NuevaClientaModal";
import { ClientaFichaModal } from "@/components/ClientaFichaModal";
import { descargarCsv } from "@/lib/exportar-csv";
import { TIPOS_DOCUMENTO_CLIENTA, documentoLegible } from "@/lib/documento-clienta-reglas";

// Clientas, paso 2 del acta (D-92 a D-111, docs/datos/DECISIONES-2026-09-26-clientas.md sección
// H): de la pantalla mínima de verificación (D-76/D-77) a la de verdad — buscar por documento
// (DNI, carné de extranjería o pasaporte, ADR-0288 D-2) o celular, abrir la ficha (compras,
// cambios, devoluciones y apartados LEÍDOS de sus tablas, nunca copiados), editar con candado
// optimista, archivar/anonimizar y unir dos fichas (D-99).
// D-109: cualquier cuenta con el módulo ve a TODAS las clientas, sin distinguir sede — por eso
// la cabecera dice «Todas las sedes» en vez de mostrar la sede activa (Felipe, 2026-09-27).
export function ClientasPanel({ clientasIniciales, busquedaInicial = "" }: { clientasIniciales: Clienta[]; busquedaInicial?: string }) {
  const [termino, setTermino] = useState(busquedaInicial);
  const [incluirArchivadas, setIncluirArchivadas] = useState(false);
  const [resultados, setResultados] = useState<Clienta[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [recientes, setRecientes] = useState(clientasIniciales);
  const [abriendoAlta, setAbriendoAlta] = useState(false);
  const [fichaAbiertaId, setFichaAbiertaId] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

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
      ["Tipo de documento", "Número de documento", "Nombre", "WhatsApp", "Permiso WhatsApp", "Cumpleaños", "Registrada", "Estado"],
      clientas.map((c) => [
        c.documentoNumero ? (TIPOS_DOCUMENTO_CLIENTA.find((t) => t.valor === c.documentoTipo)?.etiqueta ?? "") : "",
        c.documentoNumero ?? "",
        c.nombre ?? "",
        c.telefonoWhatsapp ?? "",
        c.tienePermisoWhatsapp ? "sí" : "no",
        c.cumpleDia && c.cumpleMes ? `${c.cumpleDia}/${c.cumpleMes}` : "",
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

  return (
    <div className="space-y-8">
      <EncabezadoPagina
        sede="Todas las sedes"
        titulo="Clientas"
        subtitulo="El club de CAYLA: identifícala por su documento o celular y la tienda la recuerda."
        acciones={
          <>
            <Boton onClick={onExportar} cargando={exportando} title="Solo un Admin puede exportar la lista completa">
              Exportar
            </Boton>
            <Boton peso="primario" onClick={() => setAbriendoAlta(true)}>
              + Nueva clienta
            </Boton>
          </>
        }
      />

      <div className="card-cayla space-y-4 p-5">
        <form onSubmit={onBuscar} className="flex flex-wrap items-end gap-3">
          <div className="max-w-sm flex-1">
            <CampoTexto etiqueta="Buscar" value={termino} onChange={(e) => setTermino(e.target.value)} placeholder="Documento, WhatsApp o nombre…" caja />
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

        <div className="space-y-3">
          <p className="label-cayla text-[11px] text-tinta/65">
            {resultados !== null ? `${resultados.length} resultado${resultados.length === 1 ? "" : "s"}` : "Últimas registradas"}
          </p>
          {lista.length === 0 ? (
            <p className="text-sm text-tinta/65">{resultados !== null ? "Sin coincidencias." : "Todavía no hay clientas registradas."}</p>
          ) : (
            <div className="space-y-2">
              {lista.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFichaAbiertaId(c.id)}
                  className={`card-cayla flex w-full items-center justify-between gap-4 p-4 text-left ${c.archivadaEn ? "opacity-60" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-tinta">{c.nombre ?? "Sin nombre"}</p>
                    <p className="mt-0.5 truncate text-xs text-tinta/65">
                      {[documentoLegible(c.documentoTipo, c.documentoNumero, false), c.telefonoWhatsapp].filter(Boolean).join(" · ") ||
                        "Sin documento ni WhatsApp"}
                      {c.cumpleDia && c.cumpleMes ? ` · cumple ${c.cumpleDia}/${c.cumpleMes}` : ""}
                    </p>
                  </div>
                  <span className={`label-cayla shrink-0 text-[10px] ${c.archivadaEn ? "text-tinta/40" : c.tienePermisoWhatsapp ? "text-verde" : "text-tinta/40"}`}>
                    {c.archivadaEn ? (c.anonimizada ? "Anonimizada" : c.fusionadaEnId ? "Unida a otra" : "Archivada") : c.tienePermisoWhatsapp ? "WhatsApp permitido" : "Sin permiso WhatsApp"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
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
          onCambiada={() => {
            // Tras editar/archivar/unir: refresca lo que la lista tenga cargado, sin perder la búsqueda activa.
            if (resultados !== null) void buscar(termino, incluirArchivadas);
          }}
        />
      )}
    </div>
  );
}
