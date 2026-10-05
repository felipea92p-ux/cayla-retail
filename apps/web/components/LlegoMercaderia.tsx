"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, ScanLine, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { debeEncolarse, traducirError } from "@/lib/error-escritura";
import { leerCostosAtipicos, type CostoAtipico } from "@/lib/costo-atipico-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { nuevaOperacion } from "@/lib/cola-offline";
import { useColaRecibir } from "@/lib/useColaRecibir";
import { useResponsable } from "@/lib/useResponsable";
import { diaMes } from "@/lib/fechas-lima";
import {
  avisoMismaCaja,
  camposDeLlegada,
  despuesDeRecibir,
  facturasDelProveedor,
  fijarCantidad,
  fijarCosto,
  leerTexto,
  pedidoRecibirLote,
  sugerirPrendas,
  sumarPrenda,
  ayudaDelBuscador,
  PLACEHOLDER_BUSCADOR,
  textoDelProveedor,
  totalUnidades,
  urlContraFactura,
  varianteDeLineaEnviada,
  yaEntroHoy,
  type FacturaPendiente,
  type LlegadaReciente,
  type LineaLlegada,
  type PrendaLlegada,
} from "@/lib/llegada-reglas";
import { avisar } from "@/components/ui/Avisos";
import { Desplegable } from "@/components/ui/campos";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { AvisoCostoAtipico } from "@/components/AvisoCostoAtipico";
import { ColaOfflineAviso } from "@/components/ColaOfflineAviso";
import { useDestinoFlotante, usePosicionLista } from "@/components/ui/useAnclaje";

export type ProveedorLlegada = { id: string; nombre: string; marcas: string[] };

type Lectura = { bueno: boolean; texto: string; varianteId?: string; crear?: boolean };
type Recibido = { lineas: LineaLlegada[]; unidades: number; loteId: string | null; sinConexion?: boolean };

const ID_BUSCADOR = "llegada-buscador";

// «Llegó mercadería» (ADR-0330): la puerta única para lo que llega de un proveedor. Dos preguntas —¿de quién? y ¿qué llegó?— y
// se recibe en la sede de la cabecera; lo recibido entra al almacén (ADR-0328) y después se etiqueta y se cuelga en el piso. Escribe
// con `recibir_lote` sin cambios: una transacción, token contra el doble clic (ADR-0190) y cola sin conexión (ADR-0210). La
// factura no se pide aquí: si existe, se recibe contra ella en `RecepcionEnvio`; si no, se une después (fase 2 del ADR).
// Toda la regla vive en `lib/llegada-reglas.ts` (con su prueba); este archivo solo la dibuja.
export function LlegoMercaderia({
  ubicacionId,
  ubicacionEtiqueta,
  prendas,
  proveedores,
  facturas,
  recientes,
  verMontos,
  veExistencias,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  prendas: PrendaLlegada[];
  proveedores: ProveedorLlegada[];
  /** Las facturas ya registradas a las que les falta mercadería en esta sede: si el proveedor elegido tiene, se pregunta. */
  facturas: FacturaPendiente[];
  /** Lo que ya entró en esta sede estos días: si el proveedor elegido ya entró hoy, se avisa antes de recibir. */
  recientes: LlegadaReciente[];
  /** Quien ve el dinero de Compras escribe el costo (ADR-0126); los demás reciben sin costo. */
  verMontos: boolean;
  veExistencias: boolean;
}) {
  const router = useRouter();
  const [proveedorId, setProveedorId] = useState("");
  const [numeroGuia, setNumeroGuia] = useState("");
  const [lineas, setLineas] = useState<LineaLlegada[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [enBuscador, setEnBuscador] = useState(false);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [destello, setDestello] = useState<{ id: string; n: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [atipicos, setAtipicos] = useState<CostoAtipico[] | null>(null);
  const [ok, setOk] = useState<Recibido | null>(null);
  // Los proveedores para los que ya se contestó «No, sin factura» (la pregunta no vuelve a insistir con ese proveedor).
  const [sinFactura, setSinFactura] = useState<string[]>([]);
  const buscador = useRef<HTMLInputElement>(null);
  const formulario = useRef<HTMLFormElement>(null);
  // Doble clic (ADR-0190): un token por intento; se renueva solo al guardar bien.
  const token = useRef<string>(crypto.randomUUID());
  // Si fueron a crear una prenda nueva en otra pestaña, al volver se relee el catálogo (la lista de aquí no se pierde).
  const fueACrear = useRef(false);
  const colaOffline = useColaRecibir();
  const responsable = useResponsable({ ubicacionId, etiqueta: ubicacionEtiqueta });

  const porId = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p])), [prendas]);
  const proveedor = proveedores.find((p) => p.id === proveedorId) ?? null;
  const marcas = proveedor?.marcas ?? [];
  const sugerencias = sugerirPrendas(busqueda, prendas, marcas);
  // La lista flota en `fixed` sobre todo (ADR-0185, como los combos): dentro de la tarjeta, el bloque de abajo la tapaba.
  const listaAbierta = enBuscador && sugerencias.length > 0;
  const posLista = usePosicionLista(buscador, listaAbierta, 288, 4);
  const destino = useDestinoFlotante(buscador, listaAbierta);
  const unidades = totalUnidades(lineas);

  const susFacturas = facturasDelProveedor(facturas, proveedorId);
  const mismaCaja = proveedor ? avisoMismaCaja(yaEntroHoy(recientes, proveedorId), proveedor.nombre) : null;
  const campos = camposDeLlegada({
    proveedorId,
    lineas,
    responsableListo: responsable.listo,
    responsableMotivo: responsable.motivo,
    facturaRespondida: susFacturas.length > 0 ? sinFactura.includes(proveedorId) : null,
  });
  const guia = useGuiaCampos(campos, { enModal: false });

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== "visible" || !fueACrear.current) return;
      fueACrear.current = false;
      router.refresh();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [router]);

  function cambiarLineas(nuevas: LineaLlegada[]) {
    // Cambiar lo que se recibe borra la pregunta del costo: lo que vio el líder ya no es lo que se va a recibir.
    setAtipicos(null);
    setLineas(nuevas);
  }

  function elegirProveedor(id: string) {
    const primeraVez = proveedorId === "";
    setProveedorId(id);
    // Con la pistola en la mano, lo que sigue es leer: el cursor va al buscador. Si ese proveedor tiene facturas pendientes,
    // primero va la pregunta (la luz de la guía la marca) y el cursor espera.
    if (primeraVez && facturasDelProveedor(facturas, id).length === 0) setTimeout(() => buscador.current?.focus(), 0);
  }

  function recibirSinFactura() {
    setSinFactura((actual) => (actual.includes(proveedorId) ? actual : [...actual, proveedorId]));
    setTimeout(() => buscador.current?.focus(), 0);
  }

  function sumar(p: PrendaLlegada) {
    const n = (lineas.find((l) => l.varianteId === p.varianteId)?.cantidad ?? 0) + 1;
    cambiarLineas(sumarPrenda(lineas, p.varianteId));
    setDestello((d) => ({ id: p.varianteId, n: (d?.n ?? 0) + 1 }));
    setLectura({ bueno: true, texto: `${p.referencia} ${detalle(p)} (${n})`, varianteId: p.varianteId });
    setBusqueda("");
  }

  function leer(texto: string) {
    const t = texto.trim();
    if (!t) return;
    const p = leerTexto(t, prendas, marcas);
    if (p) {
      sumar(p);
      return;
    }
    setLectura({ bueno: false, texto: `«${t}» no está en el catálogo.`, crear: true });
    setBusqueda("");
  }

  function deshacer() {
    const id = lectura?.varianteId;
    if (!id) return;
    cambiarLineas(sumarPrenda(lineas, id, -1));
    setLectura(null);
    buscador.current?.focus();
  }

  function corregirCostos() {
    const id = varianteDeLineaEnviada(lineas, atipicos?.find((a) => a.linea !== null)?.linea ?? null) ?? lineas.find((l) => l.costo)?.varianteId;
    setAtipicos(null);
    if (id) formulario.current?.querySelector<HTMLInputElement>(`[data-campo="llegada-costo-${id}"]`)?.focus();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await recibir(null);
  }

  /** `confirmadas`: las líneas (desde 1, las de la base) cuyo costo atípico confirmó el líder; `null` en el primer intento. */
  async function recibir(confirmadas: number[] | null) {
    if (!guia.puedeConfirmar) {
      const falta = guia.faltan[0];
      if (falta) guia.ir(falta.id);
      if (falta?.id === "llegada-responsable" && responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setLoading(true);
    const params = pedidoRecibirLote({ ubicacionId, proveedorId, lineas, numeroGuia, token: token.current, confirmadas });
    const firma = responsable.firma();
    const { data: loteId, error, status } = await firmar(createClient().rpc("recibir_lote", params), firma);
    setLoading(false);

    // Sin red (ADR-0210): la llegada no se pierde. Entra a la cola con su token y sube sola al volver internet.
    if (error && debeEncolarse(error, status)) {
      const op = nuevaOperacion({
        token: token.current,
        rpc: "recibir_lote",
        params,
        firma,
        resumen: `${unidades} ${unidades === 1 ? "prenda" : "prendas"} de ${proveedor?.nombre ?? "proveedor"} · ${ubicacionEtiqueta}`,
      });
      if (!colaOffline.encolar(op)) {
        avisar.error("Se cortó el internet y este navegador no pudo guardar la llegada. Anota lo que llegó y recíbelo cuando vuelva la conexión.");
        return;
      }
      token.current = crypto.randomUUID();
      avisar.aviso("Llegada guardada sin conexión", { detalle: "Sube sola cuando vuelva el internet." });
      setOk({ lineas, unidades, loteId: null, sinConexion: true });
      return;
    }
    responsable.despues(error);
    if (error) {
      const marcadas = leerCostosAtipicos(error);
      if (marcadas) {
        setAtipicos(marcadas);
        return;
      }
      if (error.message === "costo_atipico_sin_lider") {
        avisar.error("Un costo que escribiste está fuera de lo normal y solo un líder puede confirmarlo. Bórralo (el costo es opcional) o pídele a un líder que lo confirme.");
        return;
      }
      avisar.error(traducirError(error, "recibir la mercadería"));
      return;
    }
    setAtipicos(null);
    token.current = crypto.randomUUID();
    avisar.exito(`${unidades} ${unidades === 1 ? "prenda recibida" : "prendas recibidas"}`, { detalle: `Ya están en el almacén de ${ubicacionEtiqueta}.` });
    setOk({ lineas, unidades, loteId: (loteId as string | null) ?? null });
    router.refresh();
  }

  function otraLlegada() {
    setOk(null);
    setSinFactura([]);
    setProveedorId("");
    setNumeroGuia("");
    setLineas([]);
    setLectura(null);
  }

  return (
    <div className="space-y-4">
      {/* Lo que se recibió sin red y espera subir (ADR-0210): a la vista aunque no se esté recibiendo nada. */}
      <ColaOfflineAviso cola={colaOffline.cola} onDescartar={colaOffline.descartar} uno="llegada" varias="llegadas" />

      {ok ? (
        <section className="card-cayla space-y-4 p-6 text-center" aria-live="polite">
          <p className="label-cayla text-[11px] text-tinta/65">{ok.sinConexion ? "Guardada sin conexión" : "Recibida"}</p>
          <p className="font-display text-3xl text-tinta">
            {ok.unidades} {ok.unidades === 1 ? "prenda" : "prendas"}
          </p>
          <p className="text-sm text-tinta/70">
            {ok.sinConexion
              ? `Sumarán al almacén de ${ubicacionEtiqueta} cuando vuelva el internet.`
              : `Entraron al almacén de ${ubicacionEtiqueta}. Para venderlas, etiquétalas y cuélgalas en el piso.`}
          </p>
          <div className="mx-auto flex max-w-sm flex-col gap-2">
            {despuesDeRecibir({ loteId: ok.loteId, lineas: ok.lineas, veExistencias }).map((a) => (
              <Link key={a.clave} href={a.href} className={`btn-cayla w-full ${a.principal ? "btn-primario" : "btn-secundario"}`}>
                {a.texto}
              </Link>
            ))}
            <button type="button" onClick={otraLlegada} className="btn-cayla btn-sutil w-full">
              Recibir otra llegada
            </button>
          </div>
        </section>
      ) : (
        <form ref={formulario} onSubmit={onSubmit} className="card-cayla space-y-6 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <CampoGuiado id="llegada-proveedor" guia={guia} titulo="¿De quién es?" ayuda="El proveedor que la mandó">
              <Desplegable
                forma="caja"
                etiquetaAccesible="Proveedor"
                marcador="Elige el proveedor"
                valor={proveedorId}
                onValor={elegirProveedor}
                opciones={proveedores.map((p) => ({ valor: p.id, texto: textoDelProveedor(p.nombre, p.marcas) }))}
              />
            </CampoGuiado>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-tinta">
                Guía <span className="font-normal text-taupe">opcional</span>
              </span>
              <input value={numeroGuia} onChange={(e) => setNumeroGuia(e.target.value)} className="caja-cayla h-10 w-full px-3 text-sm text-tinta" />
            </label>
          </div>

          {mismaCaja && (
            <p role="status" className="-mt-2 rounded-lg border border-ambar/30 bg-ambar/[0.07] px-3.5 py-2.5 text-[13px] text-ambar-profundo">
              {mismaCaja}
            </p>
          )}

          {susFacturas.length > 0 &&
            (sinFactura.includes(proveedorId) ? (
              <p className="-mt-2 text-[13px] text-taupe">
                Se recibe sin factura.{" "}
                <button type="button" onClick={() => setSinFactura((a) => a.filter((id) => id !== proveedorId))} className="text-tinta/80 underline underline-offset-2 hover:text-rojo">
                  Ver sus facturas pendientes
                </button>
              </p>
            ) : (
              <CampoGuiado id="llegada-factura" guia={guia} titulo="¿Viene con su factura?" ayuda="Si no la trae, igual se recibe">
                <div className="nota-cayla space-y-3">
                  <p>
                    {proveedor?.nombre} tiene {susFacturas.length === 1 ? "una factura" : `${susFacturas.length} facturas`} por recibir en {ubicacionEtiqueta}. Si
                    viene con {susFacturas.length === 1 ? "ella" : "una"}, se cuenta contra la factura y queda claro qué faltó.
                    {lineas.length > 0 && " Lo que ya escaneaste aquí se vuelve a contar allá."}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {susFacturas.slice(0, 3).map((f) => (
                      // `whitespace-normal`: el botón de la casa no baja de línea, y a 375 px el número de factura con su detalle se salía de
                      // la tarjeta; en el celular el detalle va en su propia línea.
                      <Link key={f.id} href={urlContraFactura(f.id)} className="btn-cayla btn-secundario btn-chico h-auto flex-wrap justify-start whitespace-normal text-left">
                        Sí, viene con la {f.documento}
                        <span className="font-normal text-taupe max-sm:basis-full">
                          <span className="max-sm:hidden"> · </span>
                          {f.pendientes} {f.pendientes === 1 ? "prenda" : "prendas"} · {diaMes(f.fechaEmision)}
                        </span>
                      </Link>
                    ))}
                    {susFacturas.length > 3 && (
                      <Link href={`/recibir?vista=factura&prov=${proveedorId}`} className="btn-cayla btn-enlace btn-chico">
                        Ver las {susFacturas.length}
                      </Link>
                    )}
                    <button type="button" onClick={recibirSinFactura} className="btn-cayla btn-sutil btn-chico">
                      No, recibir sin factura
                    </button>
                  </div>
                </div>
              </CampoGuiado>
            ))}

          <CampoGuiado id="llegada-prendas" guia={guia} titulo="¿Qué llegó?" ayuda={ayudaDelBuscador(proveedor)}>
            <div className="relative">
              <ScanLine aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-taupe" />
              <input
                id={ID_BUSCADOR}
                ref={buscador}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onFocus={() => setEnBuscador(true)}
                onBlur={() => setEnBuscador(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    leer(busqueda);
                  } else if (e.key === "Escape" && busqueda) {
                    // El Escape que usa el buscador (borrar lo escrito) no sigue de largo (CLAUDE.md, «Escape dentro de una hoja»).
                    e.stopPropagation();
                    setBusqueda("");
                  }
                }}
                placeholder={PLACEHOLDER_BUSCADOR}
                autoComplete="off"
                aria-describedby="llegada-lectura"
                className="caja-cayla h-11 w-full pl-9 pr-3 text-sm text-tinta"
              />
              {listaAbierta &&
                posLista &&
                destino &&
                createPortal(
                  <ul style={{ position: "fixed", ...posLista }} className="anim-revelar lista-flotante z-50 overflow-y-auto rounded-xl p-1" role="listbox" aria-label="Prendas que coinciden">
                    {sugerencias.map((p, i) => (
                      <li key={p.varianteId}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={i === 0}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            sumar(p);
                            buscador.current?.focus();
                          }}
                          className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-hueso ${i === 0 ? "bg-hueso/60" : ""}`}
                        >
                          <Muestra prenda={p} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-tinta">{p.referencia}</span>
                            <span className="block truncate text-xs text-taupe">
                              {detalle(p)} · {p.sku}
                              {p.marca ? ` · ${p.marca}` : ""}
                            </span>
                          </span>
                          {i === 0 && <span className="label-cayla text-[10px] text-taupe">Enter</span>}
                        </button>
                      </li>
                    ))}
                  </ul>,
                  destino,
                )}
            </div>
            <p id="llegada-lectura" role="status" className="mt-2 min-h-5 text-[13px]">
              {lectura && (
                <span className={lectura.bueno ? "text-verde" : "text-ambar-profundo"}>
                  {lectura.bueno ? "✓ " : ""}
                  {lectura.texto}{" "}
                  {lectura.varianteId && (
                    <button type="button" onClick={deshacer} className="text-tinta/70 underline underline-offset-2 hover:text-rojo">
                      Deshacer
                    </button>
                  )}
                  {lectura.crear && (
                    <Link href="/productos/nuevo" target="_blank" onClick={() => (fueACrear.current = true)} className="text-tinta/80 underline underline-offset-2 hover:text-rojo">
                      Crearla en Nuevo producto
                    </Link>
                  )}
                </span>
              )}
            </p>

            {lineas.length > 0 && verMontos && (
              <p className="mt-1 text-xs text-taupe">El costo por prenda es opcional: si todavía no lo sabes, recibe sin costo y llega con la factura.</p>
            )}
            {lineas.length > 0 && (
              <ul className="mt-3 divide-y divide-tinta/10 border-y border-tinta/10">
                {lineas.map((l) => {
                  const p = porId.get(l.varianteId);
                  if (!p) return null;
                  const destellar = destello?.id === l.varianteId;
                  return (
                    <li key={l.varianteId} className="relative flex flex-wrap items-center gap-3 py-2.5">
                      {/* La fila que acaba de leer la pistola se tiñe y se apaga; `n` repite el destello aunque sea la misma prenda. */}
                      {destellar && <span key={destello?.n} aria-hidden className="anim-destello-lectura pointer-events-none absolute inset-0" />}
                      <Muestra prenda={p} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-tinta">{p.referencia}</p>
                        <p className="truncate text-xs text-taupe">
                          {detalle(p)} · {p.sku}
                        </p>
                      </div>
                      <div className="flex items-center gap-1" role="group" aria-label={`Cantidad de ${p.referencia}`}>
                        <button type="button" aria-label="Una menos" onClick={() => cambiarLineas(sumarPrenda(lineas, l.varianteId, -1))} className="btn-cayla btn-sutil h-8 w-8 p-0">
                          <Minus aria-hidden className="h-3.5 w-3.5" />
                        </button>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          aria-label="Cantidad"
                          value={l.cantidad}
                          onChange={(e) => cambiarLineas(fijarCantidad(lineas, l.varianteId, Number(e.target.value)))}
                          className="caja-cayla h-8 w-14 px-1 text-center text-sm tabular-nums text-tinta"
                        />
                        <button type="button" aria-label="Una más" onClick={() => cambiarLineas(sumarPrenda(lineas, l.varianteId, 1))} className="btn-cayla btn-sutil h-8 w-8 p-0">
                          <Plus aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {verMontos && (
                        <input
                          type="number"
                          min={0}
                          step="0.10"
                          inputMode="decimal"
                          aria-label={`Costo por prenda de ${p.referencia}`}
                          placeholder="Costo S/" // sugerir-fijo: nombra el campo y la moneda, no da un costo de ejemplo
                          data-campo={`llegada-costo-${l.varianteId}`}
                          value={l.costo}
                          onChange={(e) => cambiarLineas(fijarCosto(lineas, l.varianteId, e.target.value))}
                          className="caja-cayla h-8 w-32 px-2 text-right text-sm tabular-nums text-tinta"
                        />
                      )}
                      <button type="button" aria-label={`Quitar ${p.referencia}`} onClick={() => cambiarLineas(fijarCantidad(lineas, l.varianteId, 0))} className="text-taupe hover:text-rojo">
                        <X aria-hidden className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CampoGuiado>

          <CampoGuiado id="llegada-responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={loading} />
          </CampoGuiado>

          <div className="space-y-3">
            <PieGuia guia={guia} listo="Todo listo para recibir." />
            {atipicos ? (
              <AvisoCostoAtipico
                costos={atipicos}
                pie="Revisa los costos que escribiste. Si son correctos, confírmalos: entran al costo de esas prendas en todas las sedes."
                textoCorregir="Corregir los costos"
                textoConfirmar="Sí, son correctos — recibir con estos costos"
                cargando={loading}
                listo={responsable.listo}
                motivoNoListo={responsable.motivo}
                onCorregir={corregirCostos}
                onConfirmar={() => recibir(atipicos.flatMap((a) => (a.linea === null ? [] : [a.linea])))}
              />
            ) : (
              <button type="submit" disabled={loading} title={guia.frase ?? undefined} className={`btn-cayla btn-primario w-full sm:w-auto ${guia.claseConfirmar}`}>
                {loading ? "Recibiendo…" : unidades > 0 ? `Recibir ${unidades} ${unidades === 1 ? "prenda" : "prendas"} en ${ubicacionEtiqueta}` : `Recibir en ${ubicacionEtiqueta}`}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

const detalle = (p: PrendaLlegada) => [p.talla, p.color].filter(Boolean).join(" · ");

/** La foto de la prenda o, si no tiene, el tinte de su color: lo que se reconoce de un vistazo con la caja abierta. */
function Muestra({ prenda }: { prenda: PrendaLlegada }) {
  if (prenda.fotoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- miniatura de 32 px de Storage; el optimizador no aporta aquí
    return <img src={prenda.fotoUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />;
  }
  return <span aria-hidden className="h-8 w-8 shrink-0 rounded border border-tinta/10 bg-hueso" style={prenda.colorHex ? { backgroundColor: prenda.colorHex } : undefined} />;
}
