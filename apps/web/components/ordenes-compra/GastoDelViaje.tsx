"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Casilla } from "@/components/ui/Casilla";
import { Buscador } from "@/components/ui/Buscador";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoSaleDe, useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { leerMonto } from "@/lib/caja-cierre-reglas";
import { soles } from "@/lib/compras-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { cuentaEfectiva } from "@/lib/cuenta-sellada-reglas";
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
  etiquetaOrdenParaGasto,
  fraseRegistrarGasto,
  papelesPara,
  repartirGasto,
  type ConceptoGastoViaje,
  type MedioGastoViaje,
  type OrdenParaGasto,
  type PapelGastoViaje,
  type TipoGastoViaje,
} from "@/lib/gastos-viaje-reglas";
import { leerOrdenesParaGastoDesdeLaHoja, registrarGastoViaje } from "@/lib/gastos-viaje-acciones";

// «+ Gasto del viaje» (ADR-0362, fase 6 · actividad 3; Felipe 2026-10-13: «desde Órdenes de compra»). Lo que quien compra pagó para traer
// la mercadería (flete, agencia, cargador, embalaje) o en su viaje (pasaje, hotel, comida, taxi). Es un gasto de verdad: sale en Finanzas ▸
// Gastos y en el Estado de resultados, y nunca entra al costo de la prenda (decisión 20). La plata sale de «Mi fondo» (primero, si tiene uno)
// o de una cuenta de siempre. Va a una o varias órdenes: con varias se reparte según el total de cada una, y la hoja muestra el reparto
// antes de guardar (el mismo de la base). Sin comprobante, solo taxi o cargador, con planilla de movilidad (decisión 55).
//
// Guía de foco (ADR-0284): lo que falta es lo MISMO que rechaza `registrar_gasto_viaje` (`camposGastoViaje`). Quién firma (decisión 39):
// con la cuenta de una persona, ella (sin combo); desde una terminal, el combo «Responsable». Un doble clic no duplica (token por hoja).

type OrdenInicial = Pick<OrdenParaGasto, "id" | "numero" | "proveedor" | "total">;
type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

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
  const [busqueda, setBusqueda] = useState("");
  const [disponibles, setDisponibles] = useState<OrdenParaGasto[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const [token] = useState(() => crypto.randomUUID());
  const enVuelo = useRef(false);

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

  const cuentas = useCuentasParaElegir("pago", sede?.ubicacionId ?? null, true, { conMiFondo: true });
  const cuentaId = cuentaEfectiva(cuentas.cuentas, "pago", medio, cuentaElegida);
  const montoLeido = leerMonto(monto);
  const deFondo = cuentas.cuentas.some((c) => c.id === cuentaId && c.tipo === "fondo");

  const valores = { tipo, concepto, monto, fecha, papel, serieNumero, ruc, nota, medio, cuentaId };
  const campos = [
    ...camposGastoViaje(valores, hoy, { esPersona, listo: responsable.listo, motivo: responsable.motivo }),
    // Las órdenes son opcionales (el cargador se paga a veces antes de saber a qué orden va).
    { id: "ordenes", nombre: "De qué órdenes", requerido: false, hecho: elegidas.length > 0, pendiente: "" },
  ];
  const guia = useGuiaCampos(campos);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return ordenes;
    return ordenes.filter((o) => `${o.numero} ${o.proveedor} ${o.destino ?? ""}`.toLowerCase().includes(q));
  }, [ordenes, busqueda]);
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
  const alternarOrden = (id: string) => {
    setRechazo(null);
    setElegidas((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  };

  async function confirmar() {
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    enVuelo.current = true;
    try {
      setGuardando(true);
      setRechazo(null);
      const firma = esPersona ? firmaOmitida("gasto_viaje_registrar") : responsable.firma();
      const conPapel = papel !== "planilla_movilidad";
      const { id, error } = await registrarGastoViaje(
        {
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
          p_token: token,
        },
        firma,
      );
      setGuardando(false);
      if (!esPersona) responsable.despues(error);
      if (error || !id) {
        setRechazo(
          error && esFalloDeRed(error)
            ? { titulo: "Se cortó la conexión", texto: "No sabemos si alcanzó a guardarse. Vuelve a tocar el botón: si ya se guardó, no se repite.", tono: "atencion" }
            : { titulo: "No se guardó", texto: traducirError(error, "registrar el gasto"), tono: "error" },
        );
        return;
      }
      const aDonde = elegidas.length === 0 ? "del viaje" : elegidas.length === 1 ? `va a ${ordenes.find((o) => o.id === elegidas[0])?.numero ?? "la orden"}` : `se reparte entre ${elegidas.length} órdenes`;
      avisar.exito(`Gasto de ${soles(montoLeido ?? 0)} registrado`, {
        detalle: `${concepto ? TEXTO_CONCEPTO[concepto] : "Gasto"} · ${aDonde}.${deFondo ? " Salió de tu fondo." : ""}`,
      });
      onClose();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
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
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="@container space-y-5"
        >
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
            <p className="mt-1.5 text-xs text-taupe">
              {papel === "planilla_movilidad"
                ? "Va en la planilla de movilidad: sin boleta, solo taxi y cargador."
                : "Sin comprobante solo se acepta taxi o cargador (planilla de movilidad)."}
            </p>
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

          <CampoGuiado id="ordenes" guia={guia} titulo="¿De qué órdenes?" retiene="fila">
            <div className="space-y-2">
              {ordenes.length > 8 && (
                <Buscador
                  valor={busqueda}
                  onCambio={setBusqueda}
                  etiqueta="Buscar una orden"
                  // sugerir-fijo: dice por qué se busca (número u proveedor); no depende de nada elegido en la hoja.
                  placeholder="N.º de orden o proveedor"
                />
              )}
              {disponibles === null && ordenes.length === 0 ? (
                <p className="text-sm text-taupe">Buscando las órdenes…</p>
              ) : ordenes.length === 0 ? (
                <p className="text-sm text-taupe">No hay órdenes para elegir: el gasto queda solo como gasto del viaje.</p>
              ) : (
                <ul className="max-h-56 divide-y divide-sand overflow-y-auto rounded-xl border border-sand">
                  {filtradas.map((o) => (
                    <li key={o.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-hueso">
                        <Casilla marcada={elegidas.includes(o.id)} onCambio={() => alternarOrden(o.id)} etiqueta={`Elegir ${etiquetaOrdenParaGasto(o)}`} />
                        <span className="font-medium tabular-nums text-tinta">{o.numero}</span>
                        <span className="min-w-0 flex-1 truncate text-taupe">{o.proveedor}</span>
                        <span className="tabular-nums text-tinta/80">{soles(o.total)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-taupe">
                {reparto.length > 1
                  ? `Se reparte según el total de cada orden: ${reparto.map((r) => `${ordenes.find((o) => o.id === r.id)?.numero ?? "OC"} ${soles(r.monto)}`).join(" · ")}.`
                  : "Opcional. Con varias órdenes, el monto se reparte según el total de cada una."}
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
          {rechazo && (
            <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
              {rechazo.texto}
            </Aviso>
          )}
          <PieGuia guia={guia} listo="Todo listo para registrar." conFrase />
          <div className="pie-hoja-fijo flex justify-end gap-3 pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? "Registrando…" : fraseRegistrarGasto(montoLeido)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
