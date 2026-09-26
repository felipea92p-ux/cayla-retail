"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Archive, Bell, Check, MessageCircle, Search, SlidersHorizontal } from "lucide-react";
import { money, type VarianteBusqueda } from "@/components/PuntoDeVenta";
import type { ResumenApartados } from "@/lib/separaciones";
import {
  EXTENSIONES_MAX,
  ORDEN_ESTADO,
  avisadaHoy,
  coincide,
  colaPorAvisar,
  encendida,
  diaLima,
  estadoVisible,
  formatoCelular,
  textoDevolucion,
  type Apartado,
  type AvisoApartado,
  type ClaveEstado,
} from "@/lib/separaciones-reglas";
import { BarraPlazo, EstadoChip, FotoPrenda, fechaCorta } from "@/components/apartados/piezas";
import { DevolverModal, ExtenderModal, LiberarModal, RecordarModal } from "@/components/apartados/ModalesApartado";

type Filtro = "hoy" | "abiertos" | "cerrados" | "todos";
const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: "hoy", etiqueta: "Necesitan algo" },
  { id: "abiertos", etiqueta: "Por recoger" },
  { id: "cerrados", etiqueta: "Cerrados" },
  { id: "todos", etiqueta: "Todos" },
];
const GRUPOS: { titulo: string; claves: ClaveEstado[] }[] = [
  { titulo: "Hoy, sin falta", claves: ["devolver", "vencida"] },
  { titulo: "Vencen pronto", claves: ["porvencer"] },
  { titulo: "A tiempo", claves: ["vigente"] },
  { titulo: "Cerrados", claves: ["cerrada"] },
];
type ColumnaTodos = "prendas" | "pagado" | "celular" | "estante" | "asesora";
const COLUMNAS_TODOS: { id: ColumnaTodos; etiqueta: string }[] = [
  { id: "prendas", etiqueta: "Prendas" },
  { id: "pagado", etiqueta: "Pagado y saldo" },
  { id: "celular", etiqueta: "Celular" },
  { id: "estante", etiqueta: "Estante" },
  { id: "asesora", etiqueta: "Quién atendió" },
];
const COLUMNAS_DE_FABRICA: Record<ColumnaTodos, boolean> = { prendas: true, pagado: true, celular: true, estante: true, asesora: false };
const CLAVE_QUE_VER = "cayla:apartados:que-ver";
const EVENTO_QUE_VER = "cayla:apartados:que-ver";
function suscribirQueVer(avisar: () => void) {
  window.addEventListener(EVENTO_QUE_VER, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO_QUE_VER, avisar);
    window.removeEventListener("storage", avisar);
  };
}
function leerQueVer(): string | null {
  try {
    return localStorage.getItem(CLAVE_QUE_VER);
  } catch {
    return null;
  }
}
const BOTON_CHICO = "label-cayla h-8 whitespace-nowrap rounded-md border border-tinta/25 px-3 text-[10.5px] text-tinta transition-colors hover:border-rojo hover:text-rojo disabled:opacity-40 disabled:hover:border-tinta/25 disabled:hover:text-tinta";
const BOTON_CHICO_NEGRO = "label-cayla h-8 whitespace-nowrap rounded-md bg-tinta px-3 text-[10.5px] text-crema transition-colors hover:bg-rojo";

export function TodosVista({
  ubicacionId,
  ubicacionEtiqueta,
  hoy,
  puedeGestionar,
  cajaAbierta,
  apartados,
  resumen,
  prendas,
  avisos,
  irAEntregar,
  apagadas = [],
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  hoy: string;
  puedeGestionar: boolean;
  cajaAbierta: boolean;
  apartados: Apartado[];
  resumen: ResumenApartados;
  prendas: VarianteBusqueda[];
  avisos: Record<string, AvisoApartado>;
  irAEntregar: (id: string) => void;
  /** Lo que la tienda apagó en «Opciones» (paso 5). */
  apagadas?: string[];
}) {
  const fotos = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p.fotoUrl])), [prendas]);
  const [filtro, setFiltro] = useState<Filtro>("hoy");
  const [texto, setTexto] = useState("");
  const [liberar, setLiberar] = useState<Apartado | null>(null);
  const [devolver, setDevolver] = useState<Apartado | null>(null);
  const [extender, setExtender] = useState<Apartado | null>(null);
  // Recordar (Apartados v2, paso 1): la cola del día o una sola clienta desde su fila. Lo avisado en esta visita se
  // marca al instante; la base lo confirma al refrescar.
  const [recordar, setRecordar] = useState<Apartado[] | null>(null);
  const [avisadasAhora, setAvisadasAhora] = useState<ReadonlySet<string>>(() => new Set());
  const avisoDe = (id: string): AvisoApartado | undefined =>
    avisadasAhora.has(id) ? { avisos: (avisos[id]?.avisos ?? 0) + 1, ultimoEn: new Date().toISOString(), ultimoPor: null } : avisos[id];
  const conAvisosAhora = Object.fromEntries(apartados.map((a) => [a.id, avisoDe(a.id)]).filter(([, v]) => v)) as Record<string, AvisoApartado>;
  const { porAvisar, avisadasHoy } = colaPorAvisar(apartados, conAvisosAhora, hoy);
  const conLote = encendida(apagadas, "lote");
  const conEstante = encendida(apagadas, "estante");
  const conAbonos = encendida(apagadas, "abonos");
  // «Qué ver» (spike Apartados v2): qué lleva cada fila. Es comodidad de quien mira, así que vive en SU navegador; si el
  // navegador no deja guardar, queda lo de fábrica.
  const crudo = useSyncExternalStore(suscribirQueVer, leerQueVer, () => null);
  const ver = useMemo<Record<ColumnaTodos, boolean>>(() => {
    try {
      const guardado = JSON.parse(crudo ?? "null");
      return guardado && typeof guardado === "object" ? { ...COLUMNAS_DE_FABRICA, ...guardado } : COLUMNAS_DE_FABRICA;
    } catch {
      return COLUMNAS_DE_FABRICA;
    }
  }, [crudo]);
  const [verAbierto, setVerAbierto] = useState(false);
  const cambiarVer = (siguiente: Record<ColumnaTodos, boolean>) => {
    try {
      localStorage.setItem(CLAVE_QUE_VER, JSON.stringify(siguiente));
    } catch {}
    window.dispatchEvent(new Event(EVENTO_QUE_VER));
  };
  // Extender, liberar y devolver firman con el combo «Responsable» (ADR-0161) dentro de su modal, de esta tienda.
  const ubicacion = { ubicacionId, etiqueta: ubicacionEtiqueta };

  const conEstado = apartados.map((a) => ({ a, e: estadoVisible(a, hoy) }));
  const lista = conEstado
    .filter(({ a }) => coincide(a, texto))
    .filter(({ a, e }) =>
      filtro === "hoy" ? ["porvencer", "vencida", "devolver"].includes(e.clave) : filtro === "abiertos" ? a.estado === "abierta" : filtro === "cerrados" ? e.clave === "cerrada" : true,
    )
    .sort((x, y) => ORDEN_ESTADO[x.e.clave] - ORDEN_ESTADO[y.e.clave] || x.a.venceEl.localeCompare(y.a.venceEl));

  const cifras = [
    { etiqueta: "Por recoger", valor: String(resumen.porRecoger), pie: `${resumen.prendasGuardadas} ${resumen.prendasGuardadas === 1 ? "prenda guardada" : "prendas guardadas"}` },
    { etiqueta: "En custodia", valor: money(resumen.enCustodia), pie: `Anticipos: entran a ventas al entregar${resumen.enCustodiaEfectivo > 0 ? ` · ${money(resumen.enCustodiaEfectivo)} fue en efectivo` : ""}`, custodia: true },
    { etiqueta: "Por devolver", valor: money(resumen.montoPorDevolver), pie: `${resumen.porDevolver} ${resumen.porDevolver === 1 ? "clienta espera" : "clientas esperan"} su dinero`, alerta: resumen.porDevolver > 0 },
    { etiqueta: "Vencen en 2 días", valor: String(resumen.vencenPronto), pie: "Buen momento para escribirles" },
  ];

  return (
    <div className="space-y-5 p-5 sm:p-6">
      <div className="grid overflow-hidden rounded-2xl border border-sand sm:grid-cols-2 lg:grid-cols-4">
        {cifras.map((c, i) => (
          <div
            key={c.etiqueta}
            style={{ ["--i" as string]: i }}
            className={`anim-sube border-sand px-5 py-4 max-lg:[&:nth-child(n+3)]:border-t sm:[&:nth-child(even)]:border-l lg:[&:not(:first-child)]:border-l ${c.custodia ? "bg-[repeating-linear-gradient(135deg,transparent_0_9px,rgb(232_224_208/0.35)_9px_10px)]" : ""} max-sm:[&:not(:first-child)]:border-t`}
          >
            <p className={`label-cayla text-[11px] ${c.alerta ? "text-rojo-profundo" : "text-tinta/60"}`}>{c.etiqueta}</p>
            <p className={`font-display mt-1 text-3xl leading-tight tabular-nums ${c.alerta ? "text-rojo-profundo" : "text-tinta"}`}>{c.valor}</p>
            <p className="text-xs text-tinta/60">{c.pie}</p>
          </div>
        ))}
      </div>

      {conLote && porAvisar.length + avisadasHoy.length > 0 && (
        <div className={`anim-revelar flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl px-4 py-3.5 ${porAvisar.length ? "bg-ambar/10 text-ambar-profundo" : "bg-verde/10 text-verde-profundo"}`}>
          {porAvisar.length ? <Bell className="h-5 w-5 shrink-0" aria-hidden /> : <Check className="h-5 w-5 shrink-0" aria-hidden />}
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-semibold">
              {porAvisar.length
                ? `${porAvisar.length} ${porAvisar.length === 1 ? "clienta por avisar" : "clientas por avisar"} hoy`
                : "Todas avisadas hoy"}
              {avisadasHoy.length > 0 && <span className="font-normal"> · {avisadasHoy.length} ya {avisadasHoy.length === 1 ? "avisada" : "avisadas"}</span>}
            </p>
            {porAvisar.length > 0 && <p>Vencen pronto o ya vencieron. Se abre WhatsApp con el mensaje listo, una tras otra.</p>}
          </div>
          {porAvisar.length > 0 && (
            <button type="button" onClick={() => setRecordar(porAvisar)} className={`${BOTON_CHICO_NEGRO} inline-flex h-10 items-center gap-2 max-sm:w-full max-sm:justify-center`}>
              <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Escribirles en lote
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)} className={`label-cayla h-9 rounded-lg border px-3.5 text-[11px] transition-colors ${filtro === f.id ? "border-tinta bg-tinta text-crema" : "border-sand text-tinta/70 hover:border-tinta/40"}`}>
            {f.etiqueta}
          </button>
        ))}
        <div className="relative flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-sand bg-papel px-3.5 focus-within:border-taupe sm:w-80 sm:flex-none">
          <Search className="h-4 w-4 text-tinta/55" aria-hidden />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, DNI, celular, APT- o B004-" aria-label="Buscar en los apartados" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none" />
        </label>
        <button type="button" onClick={() => setVerAbierto((v) => !v)} aria-expanded={verAbierto} className={`${BOTON_CHICO} inline-flex h-10 items-center gap-1.5`}>
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> <span className="max-sm:hidden">Qué ver</span>
        </button>
        {verAbierto && (
          <div className="anim-revelar absolute top-12 right-0 z-30 w-64 rounded-xl border border-sand bg-papel p-2 shadow-lg">
            <p className="label-cayla px-2 pt-1 pb-1.5 text-[10px] text-tinta/55">Qué ver en cada apartado</p>
            {COLUMNAS_TODOS.filter((c) => c.id !== "estante" || conEstante).map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-crema">
                <input type="checkbox" checked={ver[c.id]} onChange={(e) => cambiarVer({ ...ver, [c.id]: e.target.checked })} className="accent-tinta" />
                <span className="flex-1">{c.etiqueta}</span>
                {COLUMNAS_DE_FABRICA[c.id] && <span className="text-[10.5px] text-tinta/45">de fábrica</span>}
              </label>
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-sand px-2 pt-2">
              <button type="button" onClick={() => cambiarVer(COLUMNAS_DE_FABRICA)} className="label-cayla text-[10px] text-tinta/60 hover:text-tinta">Lo de fábrica</button>
              <button type="button" onClick={() => setVerAbierto(false)} className={BOTON_CHICO_NEGRO}>Listo</button>
            </div>
          </div>
        )}
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-sand px-6 py-10 text-center">
          <p className="font-display text-xl text-tinta">{filtro === "hoy" ? "Todo al día" : "Nada por aquí"}</p>
          {filtro === "hoy" && <p className="mt-1 text-sm text-tinta/60">Ningún apartado vence ni espera devolución hoy.</p>}
        </div>
      ) : (
        GRUPOS.map((g) => {
          const filas = lista.filter(({ e }) => g.claves.includes(e.clave));
          if (filas.length === 0) return null;
          return (
            <section key={g.titulo}>
              <h3 className="font-display mb-2.5 flex items-baseline gap-2 text-lg text-tinta">
                {g.titulo} <span className="font-sans text-[11px] text-tinta/55">{filas.length}</span>
              </h3>
              <ul className="divide-y divide-sand overflow-hidden rounded-2xl border border-sand">
                {filas.map(({ a, e }, i) => (
                  <li key={a.id} style={{ ["--i" as string]: i }} className="anim-sube grid items-center gap-x-5 gap-y-2 px-5 py-3.5 hover:bg-crema/60 md:grid-cols-[minmax(190px,1.3fr)_minmax(130px,1fr)_150px_170px_auto]">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="font-display grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sand/70 text-sm">{`${a.nombres[0] ?? ""}${a.apellidos[0] ?? ""}`.toUpperCase()}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-tinta">{a.nombres} {a.apellidos}</p>
                        <p className="text-xs text-tinta/60 tabular-nums">
                          {ver.celular && `${formatoCelular(a.celular)} · `}<span className="font-mono">{a.codigo}</span>
                          {ver.estante && conEstante && a.estante && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-hueso px-1.5 font-mono text-[10.5px] text-tinta/80"><Archive className="h-2.5 w-2.5" aria-hidden />{a.estante}</span>
                          )}
                        </p>
                        {ver.asesora && a.asesora && <p className="text-[11.5px] text-tinta/55">atendió {a.asesora}</p>}
                      </div>
                    </div>
                    <div className={`flex min-w-0 items-center gap-2 max-md:hidden ${ver.prendas ? "" : "invisible"}`}>
                      <span className="flex">
                        {a.prendas.slice(0, 3).map((pr, j) => (
                          <FotoPrenda key={pr.varianteId} fotoUrl={fotos.get(pr.varianteId)} referencia={pr.referencia} ancho={32} className={`w-8 border border-papel ${j ? "-ml-3.5" : ""}`} />
                        ))}
                      </span>
                      <span className="truncate text-[12.5px] text-tinta/60">{a.prendas.map((pr) => pr.referencia.split(" ")[0]).join(", ")}</span>
                    </div>
                    <div className={`text-sm tabular-nums max-md:hidden ${ver.pagado ? "" : "invisible"}`}>
                      <b className="font-semibold">{money(a.adelanto)}</b> <span className="text-xs text-tinta/55">de {money(a.total)}</span>
                      <p className="text-xs text-tinta/60">
                        {a.estado === "liberada" ? `por ${textoDevolucion(a)}` : a.estado === "abierta" ? `saldo ${money(a.saldo)}` : "cerrado"}
                        {conAbonos && a.pagos.some((p) => p.abono) && (
                          <span className="text-verde-profundo"> · {a.pagos.filter((p) => p.abono).length} {a.pagos.filter((p) => p.abono).length === 1 ? "abono" : "abonos"}</span>
                        )}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <EstadoChip {...e} />
                      {a.estado === "abierta" && <BarraPlazo creadaEl={a.creadaEn.slice(0, 10)} hoy={hoy} />}
                      <p className="text-[11.5px] text-tinta/60">
                        {a.estado === "abierta" ? `vence ${fechaCorta(a.venceEl)}${a.extensiones ? " · extendido" : ""}` : a.estado === "liberada" ? (a.liberadaSola ? "se liberó solo" : "liberado") : a.estado === "entregada" ? `boleta ${a.comprobanteFinal ?? a.comprobanteAnticipo ?? ""}` : a.notaCredito ? `NC ${a.notaCredito}` : "devuelto"}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {(e.clave === "vigente" || e.clave === "porvencer" || e.clave === "vencida") &&
                        (() => {
                          // El botón de cada fila abre la misma ventana que el lote, con esta sola clienta: así todo
                          // aviso queda registrado, y el que ya se dio hoy se ve en verde.
                          const aviso = avisoDe(a.id);
                          const hoyYa = avisadaHoy(aviso, hoy);
                          return (
                            <button
                              type="button"
                              onClick={() => setRecordar([a])}
                              aria-label={hoyYa ? `${a.nombres} ya fue avisada hoy; escribirle otra vez` : `Escribir a ${a.nombres} por WhatsApp`}
                              title={hoyYa ? `Avisada hoy${aviso?.ultimoPor ? ` por ${aviso.ultimoPor}` : ""}` : aviso ? `Último aviso: ${fechaCorta(diaLima(aviso.ultimoEn))}` : "Escribirle por WhatsApp"}
                              className={`${BOTON_CHICO} inline-flex items-center ${hoyYa ? "border-verde/40 text-verde-profundo" : ""}`}
                            >
                              {hoyYa ? <Check className="h-3.5 w-3.5" aria-hidden /> : <MessageCircle className="h-3.5 w-3.5" aria-hidden />}
                            </button>
                          );
                        })()}
                      {e.clave === "vencida" && puedeGestionar && (
                        <>
                          <button type="button" disabled={a.extensiones >= EXTENSIONES_MAX} title={a.extensiones >= EXTENSIONES_MAX ? "Ya se extendió una vez" : undefined} onClick={() => setExtender(a)} className={BOTON_CHICO}>
                            +7 días
                          </button>
                          <button type="button" onClick={() => setLiberar(a)} className={BOTON_CHICO}>Liberar</button>
                        </>
                      )}
                      {a.estado === "abierta" && (
                        <button type="button" onClick={() => irAEntregar(a.id)} className={BOTON_CHICO_NEGRO}>Entregar</button>
                      )}
                      {e.clave === "devolver" &&
                        (puedeGestionar ? (
                          <button type="button" onClick={() => setDevolver(a)} className={BOTON_CHICO_NEGRO}>Devolver {money(a.adelanto)}</button>
                        ) : (
                          <span className="text-[11px] text-tinta/55">Lo devuelve la líder</span>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      {recordar && (
        <RecordarModal
          cola={recordar}
          ubicacion={ubicacion}
          hoy={hoy}
          onAvisada={(id) => setAvisadasAhora((s) => new Set([...s, id]))}
          onClose={() => setRecordar(null)}
        />
      )}
      {extender && <ExtenderModal apartado={extender} ubicacion={ubicacion} onClose={() => setExtender(null)} />}
      {liberar && <LiberarModal apartado={liberar} ubicacion={ubicacion} onClose={() => setLiberar(null)} />}
      {devolver && <DevolverModal apartado={devolver} ubicacion={ubicacion} cajaAbierta={cajaAbierta} onClose={() => setDevolver(null)} />}
    </div>
  );
}
