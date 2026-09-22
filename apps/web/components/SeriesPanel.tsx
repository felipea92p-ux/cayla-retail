"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SerieComprobante, TipoComprobante } from "@/lib/comprobantes-reglas";
import type { SerieArchivada } from "@/lib/comprobantes";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { antiguedad } from "@/lib/facturacion-resumen-reglas";
import { ETIQUETA_TIPO } from "@/lib/comprobantes-reglas";
import { errorDeSerie, nombreDelTipo, numerosUsados, seriesPorTienda, TIPOS_CON_SERIE } from "@/lib/facturacion-comprobantes-reglas";
import { coincide } from "@/lib/facturacion-busqueda";
import { traducirError } from "@/lib/error-escritura";
import { useFacturacionBusqueda } from "@/lib/useFacturacionBusqueda";
import { Ayuda } from "@/components/Ayuda";
import { SinCoincidencias } from "@/components/SinCoincidencias";
import { avisar } from "@/components/ui/Avisos";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";

type Tienda = { id: string; nombre: string };

// La vista principal de Comprobantes (D-60, 2026-09-22): las series de cada tienda y en qué número va
// cada una. Desde que el envío a SUNAT es automático, esto es lo único que alguien tiene que mirar a
// propósito: qué series hay, cuál falta y cuál se está usando. Una tarjeta punteada por cada serie que
// le falta a una tienda (sin la de nota de crédito, una devolución de un comprobante aceptado no se
// puede aprobar, ADR-0100). Registrar una serie es solo del líder (candado real en la base).
export function SeriesPanel({
  series,
  archivadas,
  tiendas,
  esLider,
  enPruebas,
  ultimoPorSerie,
  ahora,
}: {
  series: SerieComprobante[];
  /** `null` si no se pudieron leer: la sección no se dibuja (las activas sí se exigen). */
  archivadas: SerieArchivada[] | null;
  tiendas: Tienda[];
  esLider: boolean;
  /** El envío va al sandbox: se muestra qué hacer el día de pasar a la SUNAT real. */
  enPruebas: boolean;
  /** Cuándo salió el último comprobante de cada serie (por id); una serie sin fecha no la dice. */
  ultimoPorSerie: Record<string, string>;
  ahora: Date;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [archivando, setArchivando] = useState<SerieComprobante | null>(null);
  const [motivoArchivo, setMotivoArchivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [ubicacionId, setUbicacionId] = useState(tiendas[0]?.id ?? "");
  const [tipo, setTipo] = useState<TipoComprobante>("boleta");
  const [texto, setTexto] = useState("");
  // Vacío = el sistema lleva el correlativo solo. Se llena únicamente para continuar una serie que ya
  // venía emitiéndose fuera de este sistema.
  const [numero, setNumero] = useState("");

  const { texto: busqueda } = useFacturacionBusqueda();
  const grupos = seriesPorTienda(series, tiendas)
    .map((g) => ({ ...g, series: g.series.filter((s) => coincide([s.serie, nombreDelTipo(s.tipo), g.tienda.nombre], busqueda)) }))
    .filter((g) => !busqueda || g.series.length > 0);

  function abrir(tiendaId?: string, tipoInicial?: TipoComprobante) {
    if (tiendaId) setUbicacionId(tiendaId);
    if (tipoInicial) setTipo(tipoInicial);
    setAbierto(true);
  }

  function cerrarModal() {
    setAbierto(false);
    setTexto("");
    setNumero("");
  }

  async function onArchivar(e: React.FormEvent) {
    e.preventDefault();
    if (!archivando) return;
    setLoading(true);
    const { error } = await createClient().rpc("archivar_serie_comprobante", { p_serie_id: archivando.id, p_motivo: motivoArchivo.trim() });
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "archivar la serie"));
      return;
    }
    avisar.exito(`Serie ${archivando.serie} archivada`, { detalle: "Ya no reserva números. Registra la nueva para seguir emitiendo." });
    setArchivando(null);
    setMotivoArchivo("");
    router.refresh();
  }

  async function onRegistrar(e: React.FormEvent) {
    e.preventDefault();
    // Una serie mal escrita queda guardada y todos sus comprobantes se rechazan (y cada intento quema un
    // número): se comprueba el formato antes de guardar, no después.
    const error = errorDeSerie(tipo, texto);
    if (error) {
      avisar.error(error);
      return;
    }
    const serie = texto.trim().toUpperCase();
    setLoading(true);
    const { error: errorBase } = await createClient().rpc("registrar_serie_comprobante", {
      p_ubicacion_id: ubicacionId,
      p_tipo: tipo,
      p_serie: serie,
      // undefined se cae del JSON: sin número, la RPC no toca el correlativo.
      p_siguiente_numero: numero ? Number(numero) : undefined,
    });
    setLoading(false);
    if (errorBase) {
      avisar.error(traducirError(errorBase, "registrar la serie"));
      return;
    }
    avisar.exito(`Serie ${serie} registrada`);
    cerrarModal();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="anim-sube flex flex-wrap items-end justify-between gap-3" style={{ "--i": 3 } as CSSProperties}>
        <div className="min-w-0">
          <h2 className="font-display text-xl leading-tight text-tinta">
            Series registradas
            <Ayuda titulo="Series de comprobantes">
              La serie identifica desde qué tienda salió el comprobante: una letra según el tipo (B para boleta, F para factura) más tres
              caracteres. En facturación electrónica las defines tú, no SUNAT — no hay que pedir autorización. Lo normal es una serie por
              tienda (B004 Trujillo, B005 Arequipa) para saber de dónde vino cada venta. El correlativo lo lleva el sistema.
            </Ayuda>
          </h2>
          <p className="mt-0.5 text-xs text-tinta/65">En qué número va cada una. El siguiente comprobante que emita la tienda sale con ese número.</p>
        </div>
        {esLider && (
          <BotonCompacto variante="primario" onClick={() => abrir()}>
            Nueva serie
          </BotonCompacto>
        )}
      </div>

      {busqueda && grupos.length === 0 ? (
        <SinCoincidencias />
      ) : (
        grupos.map((g, i) => (
          <section key={g.tienda.id} className="anim-sube space-y-3" style={{ "--i": 4 + i } as CSSProperties} aria-labelledby={`tienda-${g.tienda.id}`}>
            <h3 id={`tienda-${g.tienda.id}`} className="flex items-baseline gap-2">
              <span className="font-display text-lg text-tinta">{g.tienda.nombre}</span>
              <span className="text-xs text-tinta/60">
                {g.series.length === 0 ? "sin series: no emite comprobantes" : `${g.series.length} ${g.series.length === 1 ? "serie" : "series"}`}
              </span>
            </h3>
            {/* Una columna por tipo (boleta, factura, nota de venta, nota de crédito): se estiran a todo el ancho. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {g.series.map((s) => {
                const usados = numerosUsados(s);
                return (
                  <article key={s.id} className="card-cayla flex flex-col gap-2 px-4 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="label-cayla text-[11px] text-tinta/65">{nombreDelTipo(s.tipo)}</span>
                      {usados > 0 ? <Chip tono="verde">en uso</Chip> : <Chip tono="neutro">sin estrenar</Chip>}
                    </div>
                    <p className="font-display text-[28px] leading-none tracking-wide text-tinta">{s.serie}</p>
                    <p className="text-[13px] text-tinta/70">
                      Próximo: <b className="font-semibold tabular-nums text-tinta">{s.serie}-{String(s.siguiente_numero).padStart(8, "0")}</b>
                    </p>
                    <div className="flex items-center justify-between gap-2 border-t border-tinta/10 pt-2">
                      <p className="text-xs tabular-nums text-tinta/60">
                        {usados === 0 ? "Todavía no emitió ninguno" : `${usados} ${usados === 1 ? "número usado" : "números usados"}`}
                        {ultimoPorSerie[s.id] && <span className="block">Último: {antiguedad(ultimoPorSerie[s.id], ahora)}</span>}
                      </p>
                      {esLider && (
                        <button
                          type="button"
                          onClick={() => setArchivando(s)}
                          aria-label={`Archivar la serie ${s.serie}`}
                          className="rounded-md px-1.5 py-0.5 text-xs text-tinta/60 outline-none transition-colors duration-200 hover:bg-tinta/10 hover:text-tinta focus-visible:outline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-rojo/60"
                        >
                          Archivar
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
              {!busqueda &&
                g.faltan.map((t) => (
                  <div key={t} className="flex flex-col justify-center gap-2 rounded-[14px] border border-dashed border-tinta/25 px-4 py-3.5 text-[13px] text-tinta/70">
                    <p>
                      Sin serie de <b className="font-semibold text-tinta">{ETIQUETA_TIPO[t].toLowerCase()}</b>
                      {t === "nota_credito" ? ": las devoluciones de esta tienda no pueden emitir su nota de crédito." : "."}
                    </p>
                    {esLider && (
                      <BotonCompacto variante="fila" className="self-start" onClick={() => abrir(g.tienda.id, t)}>
                        Registrar
                      </BotonCompacto>
                    )}
                  </div>
                ))}
            </div>
          </section>
        ))
      )}

      {archivadas && archivadas.length > 0 && !busqueda && (
        <details className="anim-sube" style={{ "--i": 4 + grupos.length } as CSSProperties}>
          <summary className="label-cayla cursor-pointer list-none text-[11px] text-tinta/65 outline-none hover:text-tinta focus-visible:outline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-rojo/60 [&::-webkit-details-marker]:hidden">
            {archivadas.length === 1 ? "1 serie archivada" : `${archivadas.length} series archivadas`} ›
          </summary>
          <ul className="mt-3 space-y-1.5 text-[13px] text-tinta/70">
            {archivadas.map((a) => (
              <li key={a.id}>
                <b className="font-semibold text-tinta">{a.serie}</b> · {nombreDelTipo(a.tipo)} · {tiendas.find((t) => t.id === a.ubicacion_id)?.nombre ?? "—"} · llegó al{" "}
                {numerosUsados(a)} · archivada el {diaYHoraLima(a.archivada_at).dia}: {a.motivo_archivo}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* El día de pasar a la SUNAT real (D-60): las pruebas en sandbox gastan la misma numeración, así que
          se arranca con series nuevas. Se muestra solo mientras el envío va al sandbox. */}
      {enPruebas && esLider && !busqueda && (
        <section className="anim-sube rounded-[14px] border border-ambar/30 bg-ambar/[0.06] px-5 py-4 text-[13px] text-tinta/80" style={{ "--i": 5 + grupos.length } as CSSProperties}>
          <h3 className="font-display text-base text-tinta">El día de pasar a la SUNAT real</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              En Vercel, cambia <code className="font-mono">LUCODE_ENTORNO</code> a <code className="font-mono">produccion</code> y vuelve a desplegar.
            </li>
            <li>Aquí, archiva cada serie usada en pruebas y registra una nueva por tienda y tipo: empieza en 1.</li>
            <li>Haz una venta chica y revisa en Emitidos que SUNAT la aceptó.</li>
          </ol>
        </section>
      )}

      {archivando && (
        <Modal titulo="Archivar serie" onClose={() => setArchivando(null)}>
          {(cerrar) => (
            <form onSubmit={onArchivar} className="mt-5 space-y-2">
              <p className="border-l-2 border-ambar/50 pl-3 text-xs leading-relaxed text-tinta/75">
                <b className="font-semibold">{archivando.serie}</b> deja de reservar números: los comprobantes que ya emitió se quedan como están.
                Después registra la serie nueva de esta tienda, que empieza en 1. Una serie archivada no se vuelve a usar.
              </p>
              <CampoTexto
                id="archivo-motivo"
                etiqueta="Motivo"
                required
                minLength={3}
                value={motivoArchivo}
                onChange={(e) => setMotivoArchivo(e.target.value)}
                placeholder="Serie de pruebas: pasamos a la SUNAT real"
              />
              <div className="flex gap-2 pt-3">
                <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
                  Cancelar
                </Boton>
                <Boton type="submit" peso="primario" className="flex-1" cargando={loading}>
                  {loading ? "Archivando…" : "Archivar"}
                </Boton>
              </div>
            </form>
          )}
        </Modal>
      )}

      {abierto && (
        <Modal titulo="Nueva serie" onClose={cerrarModal}>
          {(cerrar) => (
            <form onSubmit={onRegistrar} className="mt-5 space-y-2">
              <CampoSelect etiqueta="Tienda" valor={ubicacionId} onValor={setUbicacionId} opciones={tiendas.map((u) => ({ valor: u.id, texto: u.nombre }))} />
              <CampoSelect etiqueta="Tipo" valor={tipo} onValor={setTipo} opciones={TIPOS_CON_SERIE.map((t) => ({ valor: t, texto: ETIQUETA_TIPO[t] }))} />
              <CampoTexto
                etiqueta="Serie"
                pie={
                  tipo === "nota_credito"
                    ? "Cuatro caracteres. Empieza con B si corrige boletas o con F si corrige facturas (por ejemplo BC01)."
                    : "Una letra según el tipo más tres caracteres."
                }
                mono
                required
                value={texto}
                onChange={(e) => setTexto(e.target.value.toUpperCase())}
                maxLength={4}
                placeholder={tipo === "factura" ? "F001" : tipo === "nota_credito" ? "BC01" : "B001"}
                className="uppercase"
              />
              <CampoTexto
                etiqueta="Próximo número"
                ayuda={
                  <Ayuda titulo="Próximo número">
                    Déjalo vacío si esta serie empieza de cero: el sistema arranca en 1 y lleva el correlativo solo. Llénalo únicamente si esta
                    serie ya venía emitiéndose fuera de este sistema — pon el número que sigue al último emitido. Mandarle a SUNAT un número ya
                    usado hace que el comprobante se rechace por duplicado.
                  </Ayuda>
                }
                pie="Vacío = el sistema lo lleva solo."
                mono
                type="number"
                min="1"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="1"
              />
              <div className="flex gap-2 pt-3">
                <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
                  Cancelar
                </Boton>
                <Boton type="submit" peso="primario" className="flex-1" cargando={loading}>
                  {loading ? "Guardando…" : "Registrar serie"}
                </Boton>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
