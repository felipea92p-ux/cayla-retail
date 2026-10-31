"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { navegacionSinEspera } from "@/components/ui/Espera";
import { AvisoIntentoIncierto, avisarCongelado } from "@/components/ui/AvisoIntentoIncierto";
import { Vacio } from "@/components/ui/Vacio";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { CabeceraBloque, CampoFin, InputFin, SelectFin, Superficie } from "@/components/finanzas/kit";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable, type ControlResponsable } from "@/lib/useResponsable";
import { useIntento } from "@/lib/useIntento";
import { huellaDe } from "@/lib/intento-reglas";
import { soles } from "@/lib/flujo-caja-reglas";
import { montoBandeja, type Bandeja, type CosaPorRevisar } from "@/lib/gastos-pulso-reglas";
import { DESDE_EL_UMBRAL } from "@/lib/gastos-extracto-reglas";
import { TEXTO_NO_GASTO, sugerenciaParaEgreso, type CategoriaGasto, type EgresoPorClasificar } from "@/lib/gastos-reglas";
import { avisoDeEgreso, decisionInicial, guardadoDeEgreso, vaAlBanco, type DecisionEgreso, type QueFue } from "@/lib/clasificar-egreso";
import { avanceDeLaPila, camposDeLaDecision, idas, type Destino } from "@/lib/gastos-pila-reglas";

// Gastos en camino A (Felipe 2026-10-15): la bandeja, lo que falta revisar, de a UNA cosa. Desde el 2026-10-31 es una PILA (la 03 del
// benchmark visual, Felipe eligió mirando): la de arriba se resuelve en su lugar (el sistema propone qué fue y tú lo confirmas con
// «Listo»), se va hacia un lado AL INSTANTE —la base confirma detrás, sin el loader (excepción de ADR-0149) y, si dice que no, vuelve con
// lo que elegiste—, el número baja, la barra se llena y la siguiente sube; al vaciarla, un visto que se dibuja. La pila nunca se reordena
// bajo el dedo (Copilot lo corrigió en marzo de 2026): va en el orden de siempre, la salida más vieja primero. Un gasto va con su marca
// (`useIntento("registrar_gasto")`): si se corta la red, la tarjeta vuelve diciendo que no se sabe si se guardó, y reintentar no lo duplica.
// Un gasto fijo, un activo o un gasto con su comprobante necesitan el registro completo: su botón abre la hoja de siempre.

const entra = (clase: string, i: number) => ({ className: `${clase} anim-entra`, style: { ["--i" as string]: i } as CSSProperties });
/** Lo que dura la salida de la tarjeta (debe coincidir con `.pila-sale` en telar.css). */
const MS_SALIDA = 360;

export function GastosPulso({
  bandeja,
  onResolver,
  onVerTodas,
  sinComprobante,
  onVerSinComprobante,
  categorias,
  destinosDeposito,
  hoy,
  onRegistroCompleto,
}: {
  bandeja: Bandeja;
  /** Un gasto fijo del mes: abre la hoja de registrar gasto con el fijo ya puesto. */
  onResolver: (cosa: CosaPorRevisar) => void;
  onVerTodas: () => void;
  /**
   * Lo grande sin boleta ni factura del mes y el IGV que se recuperaría (`sinComprobanteGrande`, lo mismo que marca la lista): no se resuelve
   * de a uno, se filtra en la lista. Lo chico sin papel (el mototaxi, el baño) no se avisa (Felipe 2026-10-30).
   */
  sinComprobante: { n: number; igv: number };
  onVerSinComprobante: () => void;
  categorias: CategoriaGasto[];
  /** Los bancos a los que se deposita (Cuentas y dinero); vacío si la cuenta no tiene ese módulo. */
  destinosDeposito: Destino[];
  hoy: string;
  /** Un activo, o un gasto que llegó con boleta o factura: sigue al registro completo con el monto y la tienda del egreso. */
  onRegistroCompleto: (egreso: EgresoPorClasificar, clase: "gasto" | "activo") => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const intento = useIntento("registrar_gasto");
  // La tarjeta cuyo gasto quedó en duda (se cortó la red): vuelve arriba con su aviso hasta saber qué pasó.
  const [enDuda, setEnDuda] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);
  // Lo resuelto aquí que la base todavía no saca de la lista: ya no se ve. Si la base dice que no, vuelve.
  const [enCamino, setEnCamino] = useState<ReadonlySet<string>>(() => new Set());
  // Lo que se resolvió en esta visita (aquí o en una hoja): para la barra.
  const [hechas, setHechas] = useState(0);
  // La tarjeta que se está yendo, dibujada encima de la que sube.
  const [saliendo, setSaliendo] = useState<CosaPorRevisar | null>(null);
  // Lo elegido en cada tarjeta, por si una vuelve: vuelve como estaba.
  const [borradores, setBorradores] = useState<Record<string, DecisionEgreso>>({});
  const resueltasAqui = useRef(new Set<string>());
  const anteriores = useRef(bandeja.cosas);
  const frenteAnterior = useRef<CosaPorRevisar | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibles = bandeja.cosas.filter((c) => !enCamino.has(c.clave));
  const frente = visibles[0] ?? null;

  const irse = (cosa: CosaPorRevisar) => {
    if (timer.current) clearTimeout(timer.current);
    setSaliendo(cosa);
    timer.current = setTimeout(() => setSaliendo(null), MS_SALIDA);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // Llegó la lista nueva de la base: lo que se fue y no se resolvió aquí (un fijo registrado en su hoja, otra persona) también cuenta como
  // hecho y, si era la de arriba, se va con su movimiento. Lo que la base ya sacó deja de estar «en camino».
  useEffect(() => {
    const fueron = idas(anteriores.current, bandeja.cosas);
    const deAfuera = fueron.filter((c) => !resueltasAqui.current.has(c.clave));
    if (deAfuera.length > 0) setHechas((h) => h + deAfuera.length);
    const arriba = frenteAnterior.current;
    if (arriba && deAfuera.some((c) => c.clave === arriba.clave)) irse(arriba);
    for (const c of fueron) resueltasAqui.current.delete(c.clave);
    anteriores.current = bandeja.cosas;
    const quedan = new Set(bandeja.cosas.map((c) => c.clave));
    setEnCamino((prev) => new Set([...prev].filter((k) => quedan.has(k))));
  }, [bandeja.cosas]);
  useEffect(() => {
    frenteAnterior.current = frente;
  });

  const borradorDe = (e: EgresoPorClasificar, clave: string) => borradores[clave] ?? decisionInicial(e, destinosDeposito, sugerenciaParaEgreso(e.motivo));
  const cambiar = (clave: string, e: EgresoPorClasificar, cambio: Partial<DecisionEgreso>) =>
    setBorradores((b) => ({ ...b, [clave]: { ...(b[clave] ?? decisionInicial(e, destinosDeposito, sugerenciaParaEgreso(e.motivo))), ...cambio } }));

  /** La tarjeta vuelve a su lugar (la pila va por fecha), con lo que se había elegido. */
  const volver = (clave: string) => {
    resueltasAqui.current.delete(clave);
    setEnCamino((s) => {
      const n = new Set(s);
      n.delete(clave);
      return n;
    });
    setHechas((h) => Math.max(0, h - 1));
  };
  /** Se guardó: la base lo saca de la lista al refrescar, sin el loader. Un «no es gasto» dice además dónde se deshace. */
  const guardado = (d: DecisionEgreso) => {
    setEnDuda(null);
    const aviso = avisoDeEgreso(d, destinosDeposito);
    if (aviso.detalle) avisar.exito(aviso.texto, { detalle: aviso.detalle });
    navegacionSinEspera(window.location.href);
    router.refresh();
  };

  async function listo(cosa: Extract<CosaPorRevisar, { tipo: "egreso" }>) {
    if (intento.enviando) return;
    const d = borradorDe(cosa.egreso, cosa.clave);
    const g = guardadoDeEgreso(cosa.egreso, d, destinosDeposito, hoy);
    if (!g.ok) return avisar.error(g.error);
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    const firma = responsable.firma();
    // Al instante (Felipe 2026-10-31, excepción de ADR-0149): la tarjeta se va y la de abajo sube antes de que la base responda.
    resueltasAqui.current.add(cosa.clave);
    setEnCamino((s) => new Set(s).add(cosa.clave));
    setHechas((h) => h + 1);
    irse(cosa);
    if (g.rpc === "registrar_gasto") {
      const r = await intento.enviar(huellaDe(g.args), (token, senal) =>
        firmar(createClient().rpc("registrar_gasto" as never, { ...g.args, p_token: token } as never).setHeader("x-espera", "no"), firma).abortSignal(senal),
      );
      if (r.tipo === "ok" || r.tipo === "hecho") return guardado(d);
      volver(cosa.clave);
      if (r.tipo === "ocupado") return;
      if (r.tipo === "congelado") return avisarCongelado(avisar);
      responsable.despues(r.error);
      if (r.tipo === "incierto") return setEnDuda(cosa.clave);
      return avisar.error(traducirError(r.error, "registrar el gasto"), { detalle: "La tarjeta volvió a la pila con lo que elegiste." });
    }
    const args = g.conMarca ? { ...g.args, p_token: crypto.randomUUID() } : g.args;
    const { error } = await firmar(createClient().rpc(g.rpc as never, args as never).setHeader("x-espera", "no"), firma);
    responsable.despues(error);
    if (!error) return guardado(d);
    volver(cosa.clave);
    avisar.error(traducirError(error, "clasificar el egreso"), { detalle: "La tarjeta volvió a la pila con lo que elegiste." });
  }

  async function revisar(cosa: Extract<CosaPorRevisar, { tipo: "egreso" }>) {
    setRevisando(true);
    const res = await intento.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") {
      resueltasAqui.current.add(cosa.clave);
      setEnCamino((s) => new Set(s).add(cosa.clave));
      setHechas((h) => h + 1);
      irse(cosa);
      return guardado(borradorDe(cosa.egreso, cosa.clave));
    }
    if (res.tipo === "no_llego") {
      setEnDuda(null);
      return avisar.aviso("El gasto no se registró", { detalle: "No quedó nada guardado. Revisa lo elegido y vuelve a tocar «Listo»." });
    }
    avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  const avance = avanceDeLaPila(hechas, visibles.length);
  const quedan = visibles.length;

  return (
    <div {...entra("", 5)}>
      <Superficie pad guia="fin-gastos.bandeja">
        <CabeceraBloque
          titulo={
            quedan === 0 ? (
              bandeja.n === 0 && hechas === 0 ? (
                bandeja.frase
              ) : (
                "Todo revisado."
              )
            ) : (
              <>
                {quedan === 1 ? "Te falta " : "Te faltan "}
                <CifraAnimada valor={quedan} />
                {quedan === 1 ? " cosa por revisar." : " cosas por revisar."}
              </>
            )
          }
          bajada={quedan > 0 ? `${montoBandeja({ ...bandeja, cosas: visibles, n: quedan })}. Una por una: el sistema propone y tú solo confirmas de qué fue.` : hechas > 0 ? undefined : bandeja.bajadaVacia}
        >
          {quedan > 0 ? (
            <Chip tono="ambar" vivo>
              {quedan} por revisar
            </Chip>
          ) : (
            <Chip tono="verde">{bandeja.chipVacio}</Chip>
          )}
        </CabeceraBloque>

        {avance && (
          <div className="pila-avance">
            <BarraAvance pct={avance.pct} decorativa />
            <span className="num">{avance.texto}</span>
          </div>
        )}

        {(frente || saliendo) && (
          <div className="pila" data-capas={Math.min(Math.max(visibles.length - 1, 0), 2)}>
            {visibles.length > 2 && <span aria-hidden className="pila-capa" data-capa="2" />}
            {visibles.length > 1 && <span aria-hidden className="pila-capa" data-capa="1" />}
            {frente &&
              (frente.tipo === "egreso" ? (
                <TarjetaEgreso
                  key={frente.clave}
                  cosa={frente}
                  decision={borradorDe(frente.egreso, frente.clave)}
                  onCambio={(c) => cambiar(frente.clave, frente.egreso, c)}
                  categorias={categorias}
                  destinos={destinosDeposito}
                  responsable={responsable}
                  subio={hechas > 0 && enDuda !== frente.clave}
                  enDuda={enDuda === frente.clave && intento.incierto}
                  ocupado={intento.enviando}
                  revisando={revisando}
                  onRevisar={() => revisar(frente)}
                  onListo={() => listo(frente)}
                  onRegistroCompleto={(clase) => onRegistroCompleto(frente.egreso, clase)}
                />
              ) : (
                <div key={frente.clave} className="pila-tarjeta" data-subio={hechas > 0 || undefined}>
                  <CabezaTarjeta cosa={frente} />
                  <div className="pila-pie">
                    <Boton type="button" peso="primario" onClick={() => onResolver(frente)} aria-haspopup="dialog" data-guia="fin-gastos.resolver">
                      Registrar
                    </Boton>
                  </div>
                </div>
              ))}
            {saliendo && (
              <div className="pila-tarjeta pila-sale" aria-hidden>
                <CabezaTarjeta cosa={saliendo} />
              </div>
            )}
          </div>
        )}

        {quedan === 0 && hechas > 0 && (
          <div className="pila-listo">
            <Vacio tamano="chico" icono={<Check />}>
              {bandeja.bajadaVacia}
            </Vacio>
          </div>
        )}

        {sinComprobante.n > 0 && (
          <p className="fin-gastos-cosa-mas" data-guia="fin-gastos.sin-comprobante">
            {sinComprobante.n} {sinComprobante.n === 1 ? "gasto" : "gastos"} {DESDE_EL_UMBRAL} {sinComprobante.n === 1 ? "no tiene" : "no tienen"} boleta ni factura: con
            factura recuperarías {soles(sinComprobante.igv)} de IGV.{" "}
            <button type="button" className="btn-cayla btn-enlace" onClick={onVerSinComprobante}>
              Ver {sinComprobante.n === 1 ? "cuál" : "cuáles"}
            </button>
          </p>
        )}
        {quedan > 1 && (
          <p className="fin-gastos-cosa-mas">
            Todas en una lista:{" "}
            <button type="button" className="btn-cayla btn-enlace" onClick={onVerTodas}>
              Ver todas
            </button>
          </p>
        )}
      </Superficie>
    </div>
  );
}

/** Lo que dice la tarjeta arriba: qué es, de dónde salió y cuánto. Igual en la que está y en la que se va. */
function CabezaTarjeta({ cosa }: { cosa: CosaPorRevisar }) {
  return (
    <div className="pila-cabeza">
      <div className="min-w-0">
        <span className="label-cayla pila-sobre">{cosa.tipo === "egreso" ? "Salida de caja sin clasificar" : "Gasto fijo del mes sin registrar"}</span>
        <b>{cosa.titulo}</b>
        <p>{cosa.detalle}</p>
      </div>
      <span className="pila-monto num">{soles(cosa.monto)}</span>
    </div>
  );
}

const QUE: { valor: QueFue; texto: string }[] = [
  { valor: "gasto", texto: "Un gasto" },
  ...(["deposito", "retiro", "ajuste", "otro"] as const).map((t) => ({ valor: t, texto: TEXTO_NO_GASTO[t].titulo })),
];

/** La salida de caja de arriba de la pila, que se resuelve en su lugar: qué fue (ya propuesto), lo que eso pide y quién lo hace. */
function TarjetaEgreso({
  cosa,
  decision: d,
  onCambio,
  categorias,
  destinos,
  responsable,
  subio,
  enDuda,
  ocupado,
  revisando,
  onRevisar,
  onListo,
  onRegistroCompleto,
}: {
  cosa: Extract<CosaPorRevisar, { tipo: "egreso" }>;
  decision: DecisionEgreso;
  onCambio: (c: Partial<DecisionEgreso>) => void;
  categorias: CategoriaGasto[];
  destinos: Destino[];
  responsable: ControlResponsable;
  /** Subió desde atrás (ya se resolvió otra en esta visita): entra con su movimiento. */
  subio: boolean;
  /** Su gasto quedó en duda (se cortó la red): se congela con su aviso hasta revisar o reintentar lo mismo. */
  enDuda: boolean;
  /** Hay un gasto de la pila en camino a la base: «Listo» espera a que vuelva (la marca es una por vez). */
  ocupado: boolean;
  revisando: boolean;
  onRevisar: () => void;
  onListo: () => void;
  onRegistroCompleto: (clase: "gasto" | "activo") => void;
}) {
  // La guía de foco (ADR-0284) sale de la misma validación que guarda (`guardadoDeEgreso`); no agrega ninguna regla.
  const guia = useGuiaCampos(camposDeLaDecision(d, destinos, responsable), { enModal: false });
  const id = (campo: string) => `pila-${cosa.egreso.id}-${campo}`;
  const aBanco = vaAlBanco(d, destinos);
  const cat = categorias.find((c) => c.codigo === d.categoria);
  return (
    <div className="pila-tarjeta" data-subio={subio || undefined}>
      <CabezaTarjeta cosa={cosa} />
      <fieldset disabled={enDuda} className="campos-congelables pila-decision">
      <div className="pila-que" role="radiogroup" aria-label="¿Qué fue?">
        {QUE.map((o) => (
          <button key={o.valor} type="button" role="radio" aria-checked={d.que === o.valor} data-activa={d.que === o.valor} className="pildora-cayla" onClick={() => onCambio({ que: o.valor })}>
            {o.texto}
          </button>
        ))}
        <button type="button" className="btn-cayla btn-enlace" onClick={() => onRegistroCompleto("activo")}>
          Es un activo fijo
        </button>
      </div>
      {d.que === "gasto" && (
        <div className="pila-campos">
          <CampoGuiado id="categoria" guia={guia}>
            <CampoFin etiqueta={guia.etiqueta("categoria", "Categoría")} htmlFor={id("categoria")} ayuda={cat ? `Va a la cuenta ${cat.cuenta}.` : undefined}>
              <SelectFin id={id("categoria")} valor={d.categoria} onValor={(categoria) => onCambio({ categoria })} marcador="Elige…" opciones={categorias.map((c) => ({ valor: c.codigo, texto: c.nombre }))} />
            </CampoFin>
          </CampoGuiado>
          <CampoGuiado id="descripcion" guia={guia}>
            <CampoFin etiqueta={guia.etiqueta("descripcion", "Qué se pagó")} htmlFor={id("descripcion")}>
              <InputFin id={id("descripcion")} value={d.descripcion} onChange={(ev) => onCambio({ descripcion: ev.target.value })} />
            </CampoFin>
          </CampoGuiado>
          <p className="pila-nota">
            ¿Llegó con factura o boleta?{" "}
            <button type="button" className="btn-cayla btn-enlace" onClick={() => onRegistroCompleto("gasto")}>
              Regístralo con su comprobante
            </button>
          </p>
        </div>
      )}
      {aBanco && (
        <div className="pila-campos">
          <CampoGuiado id="destino" guia={guia}>
            <CampoFin etiqueta={guia.etiqueta("destino", "¿A qué cuenta llegó?")} htmlFor={id("destino")}>
              <SelectFin id={id("destino")} valor={d.destino} onValor={(destino) => onCambio({ destino })} opciones={destinos.map((x) => ({ valor: x.id, texto: x.nombre }))} />
            </CampoFin>
          </CampoGuiado>
        </div>
      )}
      {d.que !== "gasto" && d.que !== "activo" && (
        <div className="pila-campos">
          <CampoGuiado id="motivo" guia={guia}>
            <CampoFin etiqueta={guia.etiqueta("motivo", d.que === "otro" ? "Qué fue" : aBanco ? "Voucher o nota" : "Nota")} htmlFor={id("motivo")}>
              <InputFin id={id("motivo")} value={d.motivo} onChange={(ev) => onCambio({ motivo: ev.target.value })} />
            </CampoFin>
          </CampoGuiado>
        </div>
      )}
      </fieldset>
      {enDuda && <AvisoIntentoIncierto onRevisar={onRevisar} revisando={revisando} />}
      <div className="pila-pie">
        <CampoGuiado id="responsable" guia={guia} className="pila-responsable">
          <ComboResponsable control={responsable} compacto deshabilitado={enDuda} />
        </CampoGuiado>
        <div className="pila-listo-boton">
          {!enDuda && <PieGuia guia={guia} listo="Listo para guardar." />}
          <Boton type="button" peso="primario" onClick={onListo} disabled={!guia.puedeConfirmar || ocupado || revisando} title={guia.frase ?? undefined} className={guia.claseConfirmar} data-guia="fin-gastos.resolver">
            {enDuda ? "Volver a intentar" : "Listo"}
          </Boton>
        </div>
      </div>
    </div>
  );
}
