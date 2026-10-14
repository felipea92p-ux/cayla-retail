"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, X } from "lucide-react";
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
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { useTrabajoPorSede } from "@/components/ui/TrabajoPorSede";
import { avisoConteoGuardado, avisoConteoRetomado, llegadaContada, mensajeDeSalida, unidadesDeLaLlegada } from "@/lib/recibir-cambio-de-sede";
import { Desplegable, Boton } from "@/components/ui/campos";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { AvisoCostoAtipico } from "@/components/AvisoCostoAtipico";
import { ColaOfflineAviso } from "@/components/ColaOfflineAviso";
import { BORRADOR_VACIO, ProveedorModal } from "@/components/ProveedorModal";
import { useDestinoFlotante, usePosicionLista } from "@/components/ui/useAnclaje";
import { Buscador } from "@/components/ui/Buscador";
import { ListaSugerencias, ariaDelBuscador } from "@/components/ui/ListaSugerencias";
import { MiniaturaPrenda, categoriaDe } from "@/components/ui/PrendaCelda";

export type ProveedorLlegada = { id: string; nombre: string; ruc: string | null; marcas: string[] };

type Lectura = { bueno: boolean; texto: string; varianteId?: string; crear?: boolean };
type Recibido = { lineas: LineaLlegada[]; unidades: number; loteId: string | null; sinConexion?: boolean };
/** Lo que queda guardado al cambiar de sede y vuelve al regresar (Felipe, 2026-10-11). El token viaja con lo escaneado: es la misma
 *  llegada, y reintentarla no la duplica. */
type ConteoDeLaLlegada = {
  proveedorId: string;
  numeroGuia: string;
  lineas: LineaLlegada[];
  sinFactura: string[];
  agregados: ProveedorLlegada[];
  token: string;
};

const ID_BUSCADOR = "llegada-buscador";
const ID_LISTA = "llegada-sugerencias";

// «Llegó mercadería» (ADR-0330): la puerta única para lo que llega de un proveedor. Dos preguntas —¿de quién? y ¿qué llegó?— y
// se recibe en la sede de la cabecera; lo recibido entra al almacén (ADR-0328) y después se etiqueta y se baja al piso. Escribe
// con `recibir_lote` sin cambios: una transacción, token contra el doble clic (ADR-0190) y cola sin conexión (ADR-0210). La
// factura no se pide aquí: si existe, se recibe contra ella en `RecepcionEnvio`; si no, se une después (fase 2 del ADR).
// Toda la regla vive en `lib/llegada-reglas.ts` (con su prueba); este archivo solo la dibuja.
//
// «¿No está? + Agregar proveedor» (2026-10-10): un proveedor que llega por primera vez no estaba en el directorio y quien
// recibía no tenía salida —tenía que irse a Compras ▸ Proveedores, perder lo escaneado y volver—. Abre el MISMO formulario de
// Proveedores (`ProveedorModal`: RUC con consulta a SUNAT, aviso de parecidos, la RPC `registrar_proveedor`) y el proveedor
// recién guardado queda elegido. Solo a quien tiene el módulo Proveedores (`puedeAgregarProveedor`, lo que la base exige en
// `fn_puede_gestionar_proveedores`); quien no, ve a quién pedírselo. El formulario va FUERA del <form> de la llegada: un
// `submit` que sube desde un modal llegaría a su `onSubmit` y recibiría la mercadería (CLAUDE.md, ADR-0128).
export function LlegoMercaderia({
  ubicacionId,
  ubicacionEtiqueta,
  prendas,
  proveedores,
  rubrosEnUso,
  puedeAgregarProveedor,
  facturas,
  recientes,
  verMontos,
  veExistencias,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  prendas: PrendaLlegada[];
  proveedores: ProveedorLlegada[];
  /** Los rubros que ya usan los proveedores: los botones del formulario de «Agregar proveedor». */
  rubrosEnUso: string[];
  /** La cuenta tiene el módulo Proveedores: puede dar de alta uno desde aquí. */
  puedeAgregarProveedor: boolean;
  /** Las facturas ya registradas a las que les falta mercadería en esta sede: si el proveedor elegido tiene, se pregunta. */
  facturas: FacturaPendiente[];
  /** Lo que ya entró en esta sede estos días: si el proveedor elegido ya entró hoy, se avisa antes de recibir. */
  recientes: LlegadaReciente[];
  /** Quien ve el dinero de Compras escribe el costo (ADR-0126); los demás reciben sin costo. */
  verMontos: boolean;
  veExistencias: boolean;
}) {
  const router = useRouter();
  // Lo escaneado es de SU sede (Felipe, 2026-10-11): la página monta esta pantalla con la sede en la key, y lo que se escaneó en
  // otra sede quedó guardado en `TrabajoPorSede`. Si se vuelve a una sede con algo escaneado, se arranca desde ahí.
  const { inicial: guardado, reportar: reportarConteo, otras: guardadosEnOtras } = useTrabajoPorSede<ConteoDeLaLlegada>(ubicacionId);
  const [proveedorId, setProveedorId] = useState(guardado?.proveedorId ?? "");
  const [numeroGuia, setNumeroGuia] = useState(guardado?.numeroGuia ?? "");
  const [lineas, setLineas] = useState<LineaLlegada[]>(guardado?.lineas ?? []);
  const [busqueda, setBusqueda] = useState("");
  const [enBuscador, setEnBuscador] = useState(false);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [destello, setDestello] = useState<{ id: string; n: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [atipicos, setAtipicos] = useState<CostoAtipico[] | null>(null);
  const [ok, setOk] = useState<Recibido | null>(null);
  // Los proveedores para los que ya se contestó «No, sin factura» (la pregunta no vuelve a insistir con ese proveedor).
  const [sinFactura, setSinFactura] = useState<string[]>(guardado?.sinFactura ?? []);
  // Los proveedores que se agregaron aquí mismo: salen en el combo y quedan elegidos sin esperar a que la página relea el directorio.
  const [agregados, setAgregados] = useState<ProveedorLlegada[]>(guardado?.agregados ?? []);
  const [agregando, setAgregando] = useState(false);
  const buscador = useRef<HTMLInputElement>(null);
  const formulario = useRef<HTMLFormElement>(null);
  // Doble clic (ADR-0190): un token por intento; se renueva solo al guardar bien.
  const token = useRef<string>(guardado?.token ?? crypto.randomUUID());
  // Si fueron a crear una prenda nueva en otra pestaña, al volver se relee el catálogo (la lista de aquí no se pierde).
  const fueACrear = useRef(false);
  const colaOffline = useColaRecibir();
  const responsable = useResponsable({ ubicacionId, etiqueta: ubicacionEtiqueta });

  const porId = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p])), [prendas]);
  // Cuando la página relee el directorio, el recién agregado ya viene en `proveedores`: no se repite.
  const directorio = useMemo(() => {
    const nuevos = agregados.filter((a) => !proveedores.some((p) => p.id === a.id));
    return nuevos.length === 0 ? proveedores : [...proveedores, ...nuevos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [proveedores, agregados]);
  const proveedor = directorio.find((p) => p.id === proveedorId) ?? null;
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

  // «¿Salir sin guardar?» (2026-10-11): lo escaneado se perdía en silencio al tocar el menú. Llegó junto con guardar lo de cada
  // sede: lo guardado en otra sede solo vive mientras se siga en Recibir, así que salir también lo pierde y también pregunta.
  const contado = llegadaContada({ lineas, numeroGuia });
  const avisoSalida = useSalidaSinGuardar(
    !ok && (contado || guardadosEnOtras.length > 0),
    mensajeDeSalida(contado ? "Hay prendas escaneadas que todavía no se recibieron. Si sales ahora, se pierde lo escaneado." : null, guardadosEnOtras),
  );
  // Lo escaneado, al día, para `TrabajoPorSede`: si la sede cambia, queda guardado en ESTA sede.
  useEffect(() => {
    reportarConteo(
      !ok && contado
        ? {
            etiqueta: ubicacionEtiqueta,
            unidades: unidadesDeLaLlegada(lineas),
            trabajo: { proveedorId, numeroGuia, lineas, sinFactura, agregados, token: token.current },
            avisoAlGuardar: avisoConteoGuardado({ etiqueta: ubicacionEtiqueta, unidades: unidadesDeLaLlegada(lineas) }),
            avisoAlVolver: avisoConteoRetomado({ etiqueta: ubicacionEtiqueta, unidades: 0 }),
          }
        : null,
    );
  }, [reportarConteo, ok, contado, ubicacionEtiqueta, proveedorId, numeroGuia, lineas, sinFactura, agregados]);

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

  function alAgregarProveedor(id: string | null, datos?: { nombre: string; ruc: string | null }) {
    setAgregando(false);
    router.refresh();
    if (!id || !datos) return;
    setAgregados((a) => [...a, { id, nombre: datos.nombre, ruc: datos.ruc, marcas: [] }]);
    elegirProveedor(id);
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
    // El refresco va DESPUÉS de retirar la guardia de «¿Salir sin guardar?», como en la recepción contra factura: juntos, Next
    // podía volver a montar la página y se perdía la pantalla de «Recibida» (2026-10-08).
    void avisoSalida.retirarYa().then(() => router.refresh());
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
              : `Entraron al almacén de ${ubicacionEtiqueta}. Para venderlas, etiquétalas y bájalas al piso.`}
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
            <div data-guia="recibir.proveedor">
            <CampoGuiado id="llegada-proveedor" guia={guia} titulo="¿De quién es?" ayuda="El proveedor que la mandó">
              <Desplegable
                forma="campo"
                etiquetaAccesible="Proveedor"
                marcador="Elige el proveedor"
                valor={proveedorId}
                onValor={elegirProveedor}
                opciones={directorio.map((p) => ({ valor: p.id, texto: textoDelProveedor(p.nombre, p.marcas) }))}
              />
              {puedeAgregarProveedor ? (
                <p className="mt-1.5 text-xs text-taupe">
                  ¿No está?{" "}
                  <button type="button" onClick={() => setAgregando(true)} className="btn-cayla btn-enlace whitespace-normal text-left text-xs">
                    + Agregar proveedor
                  </button>
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-taupe">¿No está? Pídele a quien administra Proveedores que lo agregue.</p>
              )}
            </CampoGuiado>
            </div>
            <label data-guia="recibir.guia" className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-tinta">
                Guía <span className="font-normal text-taupe">opcional</span>
              </span>
              <input value={numeroGuia} onChange={(e) => setNumeroGuia(e.target.value)} className="caja-campo-input" />
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
                <button type="button" onClick={() => setSinFactura((a) => a.filter((id) => id !== proveedorId))} className="btn-enlace">
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

          <div data-guia="recibir.prendas">
          <CampoGuiado id="llegada-prendas" guia={guia} titulo="¿Qué llegó?" ayuda={ayudaDelBuscador(proveedor)}>
            <div className="relative">
              {/* El buscador de la pistola (<Buscador icono="barras">, ADR-0358, como el de «Contra factura») y, debajo, la lista de
                  sugerencias del sistema (ronda 9). */}
              <Buscador
                id={ID_BUSCADOR}
                ref={buscador}
                {...ariaDelBuscador(ID_LISTA, listaAbierta, 0)}
                valor={busqueda}
                onCambio={setBusqueda}
                icono="barras"
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
                aria-describedby="llegada-lectura"
              />
              {listaAbierta &&
                posLista &&
                destino &&
                createPortal(
                  // La lista de sugerencias del sistema (ADR-0358, ronda 9): la miniatura de la prenda, su código debajo y la tecla
                  // que la toma. El Enter suma la primera (`leer`), así que la activa es siempre la primera y el mouse solo tiñe.
                  <ListaSugerencias
                    id={ID_LISTA}
                    etiqueta="Prendas que coinciden"
                    style={{ position: "fixed", ...posLista }}
                    className="z-50"
                    sugerencias={sugerencias.map((p) => ({
                      clave: p.varianteId,
                      miniatura: <Muestra prenda={p} />,
                      titulo: p.referencia,
                      detalle: `${detalle(p)} · ${p.sku}${p.marca ? ` · ${p.marca}` : ""}`,
                    }))}
                    onElegir={(i) => {
                      sumar(sugerencias[i]);
                      buscador.current?.focus();
                    }}
                  />,
                  destino,
                )}
            </div>
            <p id="llegada-lectura" role="status" className="mt-2 min-h-5 text-[13px]">
              {lectura && (
                <span className={lectura.bueno ? "text-verde" : "text-ambar-profundo"}>
                  {lectura.bueno ? "✓ " : ""}
                  {lectura.texto}{" "}
                  {lectura.varianteId && (
                    <button type="button" onClick={deshacer} className="btn-enlace">
                      Deshacer
                    </button>
                  )}
                  {lectura.crear && (
                    <Link href="/productos/nuevo" target="_blank" onClick={() => (fueACrear.current = true)} className="btn-enlace">
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
                          className="caja-campo-input h-8 min-h-8 w-14 px-1 text-center tabular-nums"
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
                          className="caja-campo-input h-8 min-h-8 w-32 px-2 text-right tabular-nums"
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
          </div>

          <div data-guia="recibir.responsable">
            <CampoGuiado id="llegada-responsable" guia={guia}>
              <ComboResponsable control={responsable} deshabilitado={loading} />
            </CampoGuiado>
          </div>

          <div data-guia="recibir.confirmar" className="space-y-3">
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
              <Boton peso="primario" cargando={loading} textoCargando="Recibiendo…" type="submit" disabled={loading} title={guia.frase ?? undefined} className={`w-full sm:w-auto ${guia.claseConfirmar}`}>
                {unidades > 0 ? `Recibir ${unidades} ${unidades === 1 ? "prenda" : "prendas"} en ${ubicacionEtiqueta}` : `Recibir en ${ubicacionEtiqueta}`}
              </Boton>
            )}
          </div>
        </form>
      )}

      {agregando && (
        <ProveedorModal
          inicial={BORRADOR_VACIO}
          rubros={rubrosEnUso}
          existentes={directorio.map((p) => ({ id: p.id, nombre: p.nombre, ruc: p.ruc, activo: true }))}
          onClose={() => setAgregando(false)}
          onGuardado={alAgregarProveedor}
        />
      )}
      {avisoSalida.aviso}
    </div>
  );
}

const detalle = (p: PrendaLlegada) => [p.talla, p.color].filter(Boolean).join(" · ");

/** La miniatura de la prenda: su foto o, sin foto, el ícono de su categoría sobre su color (`MiniaturaPrenda`, ADR-0333): lo que se
 *  reconoce de un vistazo con la caja abierta, igual que en todo el ERP. */
function Muestra({ prenda }: { prenda: PrendaLlegada }) {
  return <MiniaturaPrenda fotoUrl={prenda.fotoUrl ?? null} colorHex={prenda.colorHex ?? null} {...categoriaDe(prenda)} />;
}
