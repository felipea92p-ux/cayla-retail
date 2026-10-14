"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { Boton, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoSaleDe, useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { useIntento } from "@/lib/useIntento";
import { huellaDe } from "@/lib/intento-reglas";
import { AvisoIntentoIncierto, avisarCongelado } from "@/components/ui/AvisoIntentoIncierto";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { traducirError } from "@/lib/error-escritura";
import { leerMontoPlata } from "@/lib/monto-plata-reglas";
import { soles } from "@/lib/compras-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { cuentaEfectiva } from "@/lib/cuenta-sellada-reglas";
import { UMBRAL_BANCARIZACION, avisoBancarizacion } from "@/lib/no-deducible-reglas";
import { AvisoNoDeducible } from "@/components/AvisoNoDeducible";
import { ejemploNota, ejemploSerie } from "@/lib/sugerencias-gasto-viaje";
import {
  CONCEPTOS_DE,
  MAX_NOTA_GASTO_VIAJE,
  MAX_SERIE_GASTO_VIAJE,
  MEDIOS_GASTO_VIAJE,
  TEXTO_CONCEPTO,
  TEXTO_PAPEL,
  TIPOS_GASTO_VIAJE,
  camposGastoViaje,
  fraseRegistrarGasto,
  ordenesElegidas,
  ordenesParaAgregar,
  papelesPara,
  pistaDelPapel,
  repartirGasto,
  type ConceptoGastoViaje,
  type MedioGastoViaje,
  type OrdenParaGasto,
  type PapelGastoViaje,
  type TipoGastoViaje,
} from "@/lib/gastos-viaje-reglas";
import { leerOrdenesParaGastoDesdeLaHoja, leerSedeDelGasto, registrarGastoViaje } from "@/lib/gastos-viaje-acciones";

// «+ Gasto del viaje» (ADR-0362, fase 6 · actividad 3; Felipe 2026-10-13: «desde Órdenes de compra»). Lo que quien compra pagó para traer
// la mercadería (flete, agencia, cargador, embalaje) o en su viaje (pasaje, hotel, comida, taxi). Es un gasto de verdad: sale en Finanzas ▸
// Gastos y en el Estado de resultados, y nunca entra al costo de la prenda (decisión 20). La plata sale de «Mi fondo» (primero, si tiene uno)
// o de una cuenta de siempre. Va a una o varias órdenes: con varias se reparte según el total de cada una, y la hoja muestra el reparto
// antes de guardar (el mismo de la base). Sin comprobante, solo taxi o cargador, con planilla de movilidad (decisión 55).
// Las órdenes (Felipe 2026-10-14): la hoja muestra solo las elegidas —abierta desde una orden, esa— y las demás se suman con «+ Agregar
// otra orden», que abre el combo con buscador del sistema (su lista flota: la hoja no crece ni se encoge al abrirla). Va SIEMPRE al menos
// a una (decisión 75): la última no se quita, y la base frena un gasto sin orden.
//
// Guía de foco (ADR-0284): lo que falta es lo MISMO que rechaza `registrar_gasto_viaje` (`camposGastoViaje`). Quién firma (decisión 39):
// con la cuenta de una persona, ella (sin combo); desde una terminal, el combo «Responsable». Un doble clic no duplica y un reintento no cambia lo
// guardado: la marca de cada envío sigue a lo que se manda (`useIntento`, /chaos 2026-10-14).

type OrdenInicial = Pick<OrdenParaGasto, "id" | "numero" | "proveedor" | "total">;
type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

/** «+ Agregar otra orden»: el foco vuelve aquí después de sumar una (hay una sola hoja abierta a la vez). */
const ID_AGREGAR_ORDEN = "gasto-viaje-agregar-orden";

export function GastoDelViaje({ orden = null, guia }: { orden?: OrdenInicial | null; guia: string }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  return (
    <>
      <Boton
        peso="fantasma"
        data-guia={guia}
        onClick={(e) => {
          origen.current = e.currentTarget;
          setAbierta(true);
        }}
      >
        + Gasto del viaje
      </Boton>
      {abierta && <GastoDelViajeModal orden={orden} onClose={() => setAbierta(false)} volverA={origen} />}
    </>
  );
}

function GastoDelViajeModal({ orden, onClose, volverA }: { orden: OrdenInicial | null; onClose: () => void; volverA: RefObject<HTMLElement | null> }) {
  const router = useRouter();
  const sede = useSedeActiva();
  const esPersona = Boolean(sede?.personaSesionId);
  const responsable = useResponsable();
  const hoy = hoyLima();

  const [tipo, setTipo] = useState<TipoGastoViaje | "">("");
  const [concepto, setConcepto] = useState<ConceptoGastoViaje | "">("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [papel, setPapel] = useState<PapelGastoViaje | "">("");
  const [serieNumero, setSerieNumero] = useState("");
  const [ruc, setRuc] = useState("");
  const [nota, setNota] = useState("");
  const [medio, setMedio] = useState<MedioGastoViaje>("efectivo");
  const [cuentaElegida, setCuentaElegida] = useState<string | undefined>(undefined);
  const [elegidas, setElegidas] = useState<string[]>(() => (orden ? [orden.id] : []));
  const [agregando, setAgregando] = useState(false);
  const [disponibles, setDisponibles] = useState<OrdenParaGasto[] | null>(null);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  // La marca sigue a lo que se manda (`useIntento`, /chaos 2026-10-14): si la respuesta se pierde, la hoja se congela hasta saber qué
  // pasó; cambiar el concepto o el monto antes ya no anuncia un gasto que no se guardó.
  const intento = useIntento("registrar_gasto_viaje");
  const guardando = intento.enviando;
  const congelada = intento.incierto;
  const [revisando, setRevisando] = useState(false);

  // Las órdenes para elegir: las más recientes que no están anuladas. La orden desde la que se abrió va primero aunque sea más vieja.
  useEffect(() => {
    let vivo = true;
    void leerOrdenesParaGastoDesdeLaHoja().then(({ ordenes }) => {
      if (vivo) setDisponibles(ordenes);
    });
    return () => {
      vivo = false;
    };
  }, []);
  const ordenes = useMemo(() => {
    const lista = disponibles ?? [];
    if (!orden) return lista;
    const desdeLaLista = lista.find((o) => o.id === orden.id);
    return [desdeLaLista ?? { ...orden, destino: null, fechaEmision: null }, ...lista.filter((o) => o.id !== orden.id)];
  }, [disponibles, orden]);

  // La caja que se propone es de la tienda del GASTO (la de quien registra o la de la primera orden, como la base), no la de arriba:
  // un cajón de otra tienda la base lo rechaza (/chaos 2026-10-14).
  const [sedeDelGasto, setSedeDelGasto] = useState<string | null>(null);
  const claveOrdenes = elegidas.join(",");
  useEffect(() => {
    let vivo = true;
    void leerSedeDelGasto(claveOrdenes ? claveOrdenes.split(",") : []).then((id) => {
      if (vivo) setSedeDelGasto(id);
    });
    return () => {
      vivo = false;
    };
  }, [claveOrdenes]);
  const cuentas = useCuentasParaElegir("pago", sedeDelGasto ?? sede?.ubicacionId ?? null, true, { conMiFondo: true });
  const cuentaId = cuentaEfectiva(cuentas.cuentas, "pago", medio, cuentaElegida);
  const montoLeido = leerMontoPlata(monto);
  const deFondo = cuentas.cuentas.some((c) => c.id === cuentaId && c.tipo === "fondo");
  // ADR-0362 (fase 6 · actividad 6, decisiones 56 y 70): un gasto de S/ 2 000 o más pagado en efectivo o desde un fondo queda «no
  // deducible». Se deja registrar; la hoja lo avisa. (Lo que pasa el tope de la planilla lo marca la base después: depende del día.)
  const avisoNoDeducible = avisoBancarizacion(montoLeido, [
    { monto: montoLeido ?? 0, medio, tipoCuenta: cuentas.cuentas.find((c) => c.id === cuentaId)?.tipo ?? null },
  ]);

  const valores = { tipo, concepto, monto, fecha, papel, serieNumero, ruc, nota, medio, cuentaId, ordenes: elegidas };
  const campos = camposGastoViaje(valores, hoy, { esPersona, listo: responsable.listo, motivo: responsable.motivo });
  const guia = useGuiaCampos(campos);

  const vistas = ordenesElegidas(ordenes, elegidas);
  const paraAgregar = useMemo(() => ordenesParaAgregar(ordenes, elegidas), [ordenes, elegidas]);
  const reparto = useMemo(
    () => repartirGasto(montoLeido ?? 0, ordenes.filter((o) => elegidas.includes(o.id))),
    [montoLeido, ordenes, elegidas],
  );

  const limpiar = <T,>(f: (v: T) => void) => (v: T) => {
    setRechazo(null);
    f(v);
  };
  const elegirTipo = (t: string) => {
    setRechazo(null);
    setTipo(t as TipoGastoViaje);
    // Cambiar de «para qué fue» cambia la lista de conceptos: el que estaba ya no es de esta lista.
    setConcepto("");
    if (papel === "planilla_movilidad") setPapel("");
  };
  const elegirConcepto = (c: string) => {
    setRechazo(null);
    setConcepto(c as ConceptoGastoViaje);
    if (papel === "planilla_movilidad" && !papelesPara(c as ConceptoGastoViaje).includes("planilla_movilidad")) setPapel("");
  };
  const agregarOrden = (id: string) => {
    setRechazo(null);
    setElegidas((xs) => (xs.includes(id) ? xs : [...xs, id]));
    setAgregando(false);
    // El combo se va con la orden elegida: el foco vuelve a «+ Agregar otra orden», por si se suma una más.
    requestAnimationFrame(() => document.getElementById(ID_AGREGAR_ORDEN)?.focus());
  };
  const quitarOrden = (id: string) => {
    setRechazo(null);
    setElegidas((xs) => xs.filter((x) => x !== id));
  };

  async function confirmar() {
    if (guardando) return;
    if (!congelada && !guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    setRechazo(null);
    const firma = esPersona ? firmaOmitida("gasto_viaje_registrar") : responsable.firma();
    const conPapel = papel !== "planilla_movilidad";
    const args = {
      p_tipo: tipo,
      p_concepto: concepto,
      p_monto: montoLeido ?? 0,
      p_fecha: fecha,
      p_papel: papel,
      p_medio_pago: medio,
      p_cuenta_id: cuentaId,
      p_ordenes: elegidas,
      p_serie_numero: conPapel && serieNumero.trim() ? serieNumero.trim() : null,
      p_ruc: conPapel && ruc.trim() ? ruc.trim() : null,
      p_nota: nota.trim() || null,
    };
    const r = await intento.enviar(huellaDe(args), (token, senal) => registrarGastoViaje(args, firma, token, senal));
    if (r.tipo === "ocupado") return;
    if (r.tipo === "congelado") return avisarCongelado(avisar);
    if (!esPersona) responsable.despues(r.tipo === "error" || r.tipo === "incierto" ? r.error : null);
    // En duda: la hoja lo dice sobre los botones y se congela hasta saber qué pasó.
    if (r.tipo === "incierto") return;
    if (r.tipo === "error") {
      // Un cajón de otra tienda: la base lo dice sin decir qué elegir.
      const otraTienda = /otra tienda que la caja/i.test(r.error.message ?? "");
      return setRechazo({
        titulo: "No se guardó",
        texto: otraTienda ? "Esa caja es de otra tienda que este gasto: elige la de la tienda de la orden, o tu fondo." : traducirError(r.error, "registrar el gasto"),
        tono: "error",
      });
    }
    registrado();
  }

  // Lo que se anuncia es lo que se mandó: mientras estuvo en duda, la hoja no se pudo cambiar.
  function registrado() {
    const aDonde = elegidas.length === 1 ? `va a ${ordenes.find((o) => o.id === elegidas[0])?.numero ?? "la orden"}` : `se reparte entre ${elegidas.length} órdenes`;
    avisar.exito(`Gasto de ${soles(montoLeido ?? 0)} registrado`, {
      detalle: `${concepto ? TEXTO_CONCEPTO[concepto] : "Gasto"} · ${aDonde}.${deFondo ? " Salió de tu fondo." : ""}`,
    });
    onClose();
    router.refresh();
  }

  async function revisar() {
    setRevisando(true);
    const res = await intento.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") return registrado();
    if (res.tipo === "no_llego") return avisar.aviso("El gasto no se registró", { detalle: "No quedó nada guardado: revisa los datos y vuelve a registrarlo." });
    avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  const conceptos = tipo ? CONCEPTOS_DE[tipo] : [];
  const papeles = papelesPara(concepto).map((p) => ({ valor: p, texto: TEXTO_PAPEL[p] }));
  const conPapel = papel !== "" && papel !== "planilla_movilidad";

  return (
    <Modal
      titulo="Gasto del viaje"
      subtitulo="Lo que pagaste para traer la compra o en el viaje. No entra al costo de la prenda."
      onClose={onClose}
      variante="hoja"
      // Ancha como Registrar gasto: con 5 conceptos y 4 papeles a la vista se elige de un toque, sin abrir desplegables.
      ancho="max-w-xl"
      alCerrarEnfocar={volverA}
      bloqueado={guardando || congelada}
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="@container space-y-5"
        >
          <fieldset disabled={congelada} className="campos-congelables min-w-0 space-y-5">
          <CampoGuiado id="tipo" guia={guia} titulo="¿Para qué fue?">
            <SegmentoDeslizante
              etiqueta="Para qué fue"
              valor={tipo}
              onCambio={elegirTipo}
              opciones={TIPOS_GASTO_VIAJE.map((t) => ({ clave: t.valor, etiqueta: t.texto }))}
            />
          </CampoGuiado>

          <CampoGuiado id="concepto" guia={guia} titulo="¿Qué pagaste?" retiene="fila">
            {tipo ? (
              <>
                {/* Cinco opciones piden ~480 px: en la hoja angosta (el celular, en Gamarra) se elige con el desplegable. */}
                <div className="@max-[30rem]:hidden">
                  <SegmentoDeslizante
                    etiqueta="Qué pagaste"
                    valor={concepto}
                    onCambio={elegirConcepto}
                    opciones={conceptos.map((c) => ({ clave: c.valor, etiqueta: c.texto }))}
                  />
                </div>
                <div className="@min-[30rem]:hidden">
                  <CampoSelect
                    etiqueta="Qué pagaste"
                    caja
                    valor={concepto}
                    onValor={elegirConcepto}
                    opciones={conceptos.map((c) => ({ valor: c.valor, texto: c.texto }))}
                    marcador="Elige qué pagaste"
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-taupe">Primero di para qué fue.</p>
            )}
          </CampoGuiado>

          <div className="grid gap-5 @min-[30rem]:grid-cols-2">
            <CampoGuiado id="monto" guia={guia} titulo="¿Cuánto costó?">
              <CampoMonto
                etiqueta="¿Cuánto costó?"
                etiquetaOculta
                inputMode="decimal"
                autoComplete="off"
                value={monto}
                disabled={guardando}
                onChange={(e) => limpiar(setMonto)(e.target.value)}
              />
            </CampoGuiado>
            <CampoGuiado id="fecha" guia={guia} titulo="¿Cuándo?">
              <CampoFecha etiqueta="¿Cuándo?" caja valor={fecha} onValor={limpiar(setFecha)} required disabled={guardando} />
            </CampoGuiado>
          </div>

          <CampoGuiado id="papel" guia={guia} titulo="¿Qué papel te dieron?">
            <div className="@max-[30rem]:hidden">
              <SegmentoDeslizante
                etiqueta="Qué papel te dieron"
                valor={papel}
                onCambio={limpiar((p: string) => setPapel(p as PapelGastoViaje))}
                opciones={papeles.map((p) => ({ clave: p.valor, etiqueta: p.texto }))}
              />
            </div>
            <div className="@min-[30rem]:hidden">
              <CampoSelect
                etiqueta="Qué papel te dieron"
                caja
                valor={papel}
                onValor={limpiar((p: string) => setPapel(p as PapelGastoViaje))}
                opciones={papeles}
                marcador="Elige el papel"
              />
            </div>
            {/* Con una factura, cuánto IGV se descuenta (o por qué no): fase 6 · actividad 8. */}
            <p className="mt-1.5 text-xs text-taupe">{pistaDelPapel({ papel, ruc }, montoLeido, avisoNoDeducible !== null)}</p>
          </CampoGuiado>

          {conPapel && (
            <div className="grid gap-5 @min-[30rem]:grid-cols-2">
              <CampoGuiado id="serie" guia={guia} titulo="Serie y número">
                <CampoTexto
                  etiqueta="Serie y número"
                  caja
                  mono
                  maxLength={MAX_SERIE_GASTO_VIAJE}
                  placeholder={ejemploSerie(papel)}
                  value={serieNumero}
                  disabled={guardando}
                  onChange={(e) => limpiar(setSerieNumero)(e.target.value)}
                />
              </CampoGuiado>
              <CampoGuiado id="ruc" guia={guia} titulo="RUC de quien te lo dio">
                <CampoTexto
                  etiqueta="RUC de quien te lo dio"
                  caja
                  mono
                  inputMode="numeric"
                  maxLength={11}
                  // sugerir-fijo: el formato de un RUC no depende de nada elegido antes en la hoja.
                  placeholder="11 números"
                  value={ruc}
                  disabled={guardando}
                  onChange={(e) => limpiar(setRuc)(e.target.value.replace(/\D/g, ""))}
                />
              </CampoGuiado>
            </div>
          )}

          <CampoGuiado id="ordenes" guia={guia} titulo={vistas.length > 1 ? "¿De qué órdenes?" : "¿De qué orden?"} retiene="fila">
            <div className="flex flex-col gap-2">
              {/* Solo las elegidas (abierta desde una orden, esa). Con dos o más, cada una con su «×»; la última no se quita (decisión 75):
                  para cambiarla, se agrega la buena y se quita la otra. */}
              {vistas.length > 0 && (
                <ul className="divide-y divide-sand rounded-xl border border-sand">
                  {vistas.map((o) => (
                    <li key={o.id} className="flex items-center gap-3 py-1.5 pl-3 pr-1.5 text-sm">
                      <span className="font-medium tabular-nums text-tinta">{o.numero}</span>
                      <span className="min-w-0 flex-1 truncate text-taupe">{o.proveedor}</span>
                      <span className="tabular-nums text-tinta/80">{soles(o.total)}</span>
                      {vistas.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => quitarOrden(o.id)}
                          disabled={guardando}
                          aria-label={`Quitar ${o.numero} de este gasto`}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-tinta/55 transition-colors hover:bg-tinta/[0.04] hover:text-rojo"
                        >
                          <X aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        // El lugar de la «×», para que la fila no cambie de ancho al sumar o quitar una orden.
                        <span aria-hidden className="h-7 w-7 shrink-0" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {agregando ? (
                // El combo con buscador del sistema (su lista flota). Si se sale sin elegir —clic afuera, Tab o Escape—, vuelve el botón.
                // El Escape se toma en la captura (antes que el combo): cierra la lista y el combo de una vez, y es de este control, así
                // que no cierra la hoja (useEscapeLibre); el siguiente, sí.
                <div
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAgregando(false);
                  }}
                  onKeyDownCapture={(e) => {
                    if (e.key !== "Escape") return;
                    e.stopPropagation();
                    setAgregando(false);
                    requestAnimationFrame(() => document.getElementById(ID_AGREGAR_ORDEN)?.focus());
                  }}
                >
                  <ComboBuscable
                    autoFocus
                    valor=""
                    onValor={agregarOrden}
                    opciones={paraAgregar}
                    // sugerir-fijo: dice por qué se busca (número u proveedor); no depende de nada elegido en la hoja.
                    marcador="N.º de orden o proveedor"
                    etiquetaAccesible="Agregar una orden al gasto"
                  />
                </div>
              ) : disponibles !== null && ordenes.length === 0 ? (
                <Vacio tamano="chico" alinear="izquierda" icono={<ClipboardList />}>
                  No hay órdenes para elegir: un gasto del viaje siempre va a una orden de compra.
                </Vacio>
              ) : disponibles === null || paraAgregar.length > 0 ? (
                // Una acción chica que agrega algo: botón chico (ADR-0358, ronda 9). Mientras llegan las órdenes, todavía no se puede.
                <Boton
                  id={ID_AGREGAR_ORDEN}
                  type="button"
                  peso="discreto"
                  className="btn-chico self-start"
                  disabled={disponibles === null || guardando}
                  onClick={() => setAgregando(true)}
                >
                  {vistas.length > 0 ? "+ Agregar otra orden" : "+ Agregar una orden"}
                </Boton>
              ) : null}
              <p className="text-xs text-taupe">
                {reparto.length > 1
                  ? `Se reparte según el total de cada orden: ${reparto.map((r) => `${ordenes.find((o) => o.id === r.id)?.numero ?? "OC"} ${soles(r.monto)}`).join(" · ")}.`
                  : "Con varias órdenes, el monto se reparte según el total de cada una."}
              </p>
            </div>
          </CampoGuiado>

          <CampoGuiado id="cuenta" guia={guia} titulo="¿Cómo pagaste?">
            <div className="space-y-4">
              {/* Cuatro medios en un segmento no entran a 375 px («Transferencia» se cortaba): ahí, el desplegable. */}
              <div className="@max-[30rem]:hidden">
                <SegmentoDeslizante
                  etiqueta="Cómo pagaste"
                  valor={medio}
                  onCambio={limpiar((m: string) => setMedio(m as MedioGastoViaje))}
                  opciones={MEDIOS_GASTO_VIAJE.map((m) => ({ clave: m.valor, etiqueta: m.texto }))}
                />
              </div>
              <div className="@min-[30rem]:hidden">
                <CampoSelect
                  etiqueta="Cómo pagaste"
                  caja
                  valor={medio}
                  onValor={limpiar((m: string) => setMedio(m as MedioGastoViaje))}
                  opciones={MEDIOS_GASTO_VIAJE.map((m) => ({ valor: m.valor, texto: m.texto }))}
                />
              </div>
              <CampoSaleDe
                id="gasto-viaje-cuenta"
                cuentas={cuentas.cuentas}
                listo={cuentas.listo}
                clase="pago"
                medio={medio}
                valor={cuentaId}
                onValor={limpiar((v: string) => setCuentaElegida(v))}
                deshabilitado={guardando}
                montoDelFondo={deFondo ? (montoLeido ?? 0) : 0}
              />
              <AvisoNoDeducible aviso={avisoNoDeducible} reservar={(montoLeido ?? 0) >= UMBRAL_BANCARIZACION} />
            </div>
          </CampoGuiado>

          <CampoGuiado id="nota" guia={guia} titulo={concepto === "otro" ? "¿Qué se pagó?" : "Nota"}>
            <CampoTexto
              etiqueta={concepto === "otro" ? "¿Qué se pagó?" : "Nota"}
              caja
              maxLength={MAX_NOTA_GASTO_VIAJE}
              placeholder={ejemploNota(tipo, concepto)}
              value={nota}
              disabled={guardando}
              onChange={(e) => limpiar(setNota)(e.target.value)}
            />
          </CampoGuiado>

          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién lo registra">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          </fieldset>
          {congelada ? (
            <AvisoIntentoIncierto onRevisar={() => void revisar()} revisando={revisando} />
          ) : (
            rechazo && (
              <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
                {rechazo.texto}
              </Aviso>
            )
          )}
          <PieGuia guia={guia} listo="Todo listo para registrar." conFrase />
          <div className="pie-hoja-fijo flex justify-end gap-3 pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando || congelada}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} disabled={!congelada && !guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? "Registrando…" : congelada ? "Volver a intentar" : fraseRegistrarGasto(montoLeido)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
