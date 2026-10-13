"use client";

import { useRef, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { ComboResponsable } from "@/components/ComboResponsable";
import { AvisoCostoAtipico } from "@/components/AvisoCostoAtipico";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ElegirOpcion } from "@/components/recepcion-envio/BloquePrenda";
import type { ControlResponsable } from "@/lib/useResponsable";
import { pendienteDe } from "@/lib/nos-debe-reglas";
import {
  atipicosPorLinea,
  leerCostoAtipicoRecepcion,
  type CausaFaltante,
  type CausaSobrante,
  type CostoAtipicoRecepcion,
  type DetalleEnvio,
} from "@/lib/recepcion-envio-reglas";
import {
  camposDelCierre,
  causasDe,
  contadasDe,
  decisionInicial,
  detalladas,
  diferenciaDe,
  HINT_CONTEO_CAMBIADO,
  idCampoCierre,
  leerCostoCierre,
  lineaVisible,
  lineasParaCerrar,
  nombreDeLinea,
  textoBotonCerrar,
  TOPES_CONTEO,
  type DecisionCierre,
  type LineaParaContar,
  mensajeAlGuardar,
} from "@/lib/recepcion-conteo-reglas";
import { cerrarConteo } from "@/lib/recepcion-conteo-acciones";

// Cerrar (ADR-0393, el paso 3 de la cara A): una fila por categoría —lo que dijeron, lo que se contó, lo que entra hoy al stock y lo que
// queda para después—, el costo de cada una (decisión 6: quien cierra lo ve y lo corrige; en un envío sin aviso, solo quien ve el dinero de
// Compras, y vacío entra sin costo), qué pasó con lo que no cuadró, una nota y quién cierra. Separar y detallar NO frenan: son pendientes.
// Las reglas son las de `cerrar_conteo_envio` (`camposDelCierre`): la guía de foco enciende lo que falta.

// Las columnas del cierre, una sola vez para el encabezado y cada fila (la pieza <Tabla>, ADR-0358). En celular se apilan.
const PLANTILLA_CIERRE = "sm:grid-cols-[minmax(0,1.5fr)_8.5rem_4.5rem_4.5rem_6rem_minmax(0,2.5fr)]";

export function CerrarEnvio({
  detalle,
  version,
  lineas,
  sinAviso,
  reabierto,
  sede,
  responsable,
  veDinero,
  esperandoGuardar,
  onVolver,
  onConteoCambiado,
  onCerrado,
}: {
  detalle: DetalleEnvio;
  version: number;
  lineas: readonly LineaParaContar[];
  sinAviso: boolean;
  reabierto: boolean;
  sede: string;
  responsable: ControlResponsable;
  veDinero: boolean;
  /** Algo de lo contado todavía se está guardando: se espera antes de cerrar. */
  esperandoGuardar: boolean;
  onVolver: () => void;
  onConteoCambiado: () => void;
  onCerrado: () => void;
}) {
  const visibles = lineas.filter(lineaVisible);
  const [decisiones, setDecisiones] = useState<Record<string, DecisionCierre>>(() => Object.fromEntries(visibles.map((l) => [l.clave, decisionInicial(l)])));
  const [nota, setNota] = useState("");
  const [token] = useState(() => crypto.randomUUID());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ texto: string; recargar: boolean } | null>(null);
  const [atipicos, setAtipicos] = useState<CostoAtipicoRecepcion[] | null>(null);
  const avisoError = useRef<HTMLDivElement>(null);

  const decisionDe = (clave: string): DecisionCierre => decisiones[clave] ?? decisionInicial(visibles.find((l) => l.clave === clave) ?? visibles[0]);
  const cambiar = (clave: string, cambio: Partial<DecisionCierre>) => {
    setAtipicos(null);
    setDecisiones((d) => ({ ...d, [clave]: { ...decisionDe(clave), ...cambio } }));
  };

  const campos = camposDelCierre({ lineas: visibles, decisiones, sinAviso, responsable: responsable.listo });
  const guia = useGuiaCampos(campos, { enModal: false });
  const contadas = visibles.reduce((a, l) => a + contadasDe(l), 0);
  const porDetallar = visibles.reduce((a, l) => a + Math.max(0, contadasDe(l) - (l.conteo?.enStock ?? 0) - detalladas(l.conteo?.separado ?? { prendas: [], nuevas: [] })), 0);

  async function cerrar(confirmados: ReadonlySet<string> = new Set()) {
    if (!guia.puedeConfirmar || esperandoGuardar) return;
    setGuardando(true);
    setError(null);
    const conConfirmados = Object.fromEntries(Object.entries(decisiones).map(([k, d]) => [k, confirmados.has(k) ? { ...d, confirmaCosto: true } : d]));
    const { resultado, error: e } = await cerrarConteo(
      {
        p_despacho_id: detalle.id,
        p_version: version,
        p_lineas: lineasParaCerrar(visibles, conConfirmados, sinAviso),
        p_nota: nota.trim() ? nota.trim().slice(0, TOPES_CONTEO.notaEnvio) : null,
        p_token: token,
      },
      responsable.firma(),
    );
    responsable.despues(e);
    setGuardando(false);
    if (e) {
      const atip = leerCostoAtipicoRecepcion(e, (item) => {
        const l = visibles.find((x) => x.linea?.id === item);
        return l ? nombreDeLinea(l) : null;
      });
      if (atip && atip.length) {
        setAtipicos(atip);
        return;
      }
      const cambio = e.hint === HINT_CONTEO_CAMBIADO;
      setError({ texto: mensajeAlGuardar(e, "cerrar el envío"), recargar: cambio || e.hint === "version_cambiada" });
      if (cambio) onConteoCambiado();
      requestAnimationFrame(() => avisoError.current?.focus());
      return;
    }
    avisar.exito(`${detalle.numero} cerrado`, {
      detalle: resultado && resultado.unidades > 0 ? `${resultado.unidades} prendas entraron al stock${porDetallar > 0 ? `; ${porDetallar} quedan para después` : ""}` : porDetallar > 0 ? `${porDetallar} prendas quedan para después` : undefined,
    });
    onCerrado();
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void cerrar();
      }}
      className="space-y-5"
     
    >
      {reabierto && (
        <Aviso tono="info" titulo="Lo cierras de nuevo">
          Lo que ya entró al stock queda donde está. Lo que faltó o sobró se vuelve a anotar con lo que diga este cierre.
        </Aviso>
      )}

      <Tabla guia="recepcion.tabla-cierre">
        <Encabezado
          plantilla={PLANTILLA_CIERRE}
          columnas={[
            { titulo: "Categoría" },
            { titulo: "Costo c/u", alinear: "der", ayuda: "El costo que trae el envío; quien cierra lo corrige si el papel dice otra cosa" },
            { titulo: "Dijeron", alinear: "der" },
            { titulo: "Contaste", alinear: "der" },
            { titulo: "Al stock", alinear: "der" },
            { titulo: "Diferencia y por qué" },
          ]}
        />
            {visibles.map((l) => {
              const d = decisionDe(l.clave);
              const dif = diferenciaDe(l);
              const causas = causasDe(l, l.proveedor && l.categoria && l.marca ? pendienteDe(detalle.deudas, l.proveedor.id, l.categoria.id, l.marca.id) : 0, sinAviso);
              const alStock = (l.conteo?.enStock ?? 0) + detalladas(l.conteo?.separado ?? { prendas: [], nuevas: [] });
              const para = Math.max(0, contadasDe(l) - alStock);
              const costo = leerCostoCierre(d.costo);
              const editaCosto = !(sinAviso && !l.linea && !veDinero);
              return (
                <div key={l.clave} className={fila(PLANTILLA_CIERRE, "sm:items-start")} role="row">
                  <div className="min-w-0" role="cell">
                    <p className="font-medium text-tinta">{l.categoria?.nombre ?? "Categoría"}</p>
                    <p className="text-xs text-taupe">
                      {[l.marca?.nombre, l.conteo?.contadoPor?.nombre ? `contó ${l.conteo.contadoPor.nombre.split(" ")[0]}` : null, !l.linea && !sinAviso ? "no estaba en la guía" : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="min-w-0 sm:text-right" role="cell">
                    {editaCosto ? (
                      <CampoGuiado id={idCampoCierre("costo", l.clave)} guia={guia}>
                        <CampoTexto
                          caja
                          etiqueta={`Costo por prenda de ${nombreDeLinea(l)}`}
                          inputMode="decimal"
                          value={d.costo}
                          // sugerir-fijo: un costo es un monto de soles, no depende de nada elegido antes
                          placeholder={sinAviso ? "S/ sin costo" : "S/ 0.00"}
                          onChange={(e) => cambiar(l.clave, { costo: e.target.value, confirmaCosto: false })}
                          tono={costo.problema ? "error" : undefined}
                          pie={costo.problema ?? undefined}
                          sinPie={!costo.problema}
                          className="text-right tabular-nums"
                        />
                      </CampoGuiado>
                    ) : (
                      <span className="text-xs text-taupe">llega con la factura</span>
                    )}
                  </div>
                  <div className={celda("der", "text-taupe")} role="cell">
                    <span className="sm:hidden">Dijeron </span>
                    {l.dijeron ?? "—"}
                  </div>
                  <div className={celda("der", "text-tinta")} role="cell">
                    <span className="text-taupe sm:hidden">Contaste </span>
                    {l.conteo ? contadasDe(l) : <Chip tono="ambar">Sin contar</Chip>}
                  </div>
                  <div className="min-w-0 sm:text-right" role="cell">
                    <span className="text-taupe sm:hidden">Al stock </span>
                    <span className="tabular-nums text-verde">{alStock}</span>
                    {para > 0 && <p className="text-[11px] text-taupe">{para} para después</p>}
                  </div>
                  <div className="min-w-0" role="cell">
                    {!l.conteo ? (
                      <CampoGuiado id={idCampoCierre("contar", l.clave)} guia={guia}>
                        <Boton type="button" peso="discreto" onClick={onVolver}>
                          Contarla
                        </Boton>
                      </CampoGuiado>
                    ) : causas ? (
                      <CampoGuiado id={idCampoCierre("causa", l.clave)} guia={guia} retiene="fila">
                        <p className="mb-1.5 text-xs font-semibold text-tinta">
                          {dif != null && dif < 0 ? `Faltan ${-dif}` : dif != null && dif > 0 ? `Sobran ${dif}` : `${contadasDe(l)} que no venían`}
                        </p>
                        <ElegirOpcion
                          etiqueta={`Qué pasó con ${nombreDeLinea(l)}`}
                          opciones={causas.opciones}
                          valor={causas.tipo === "faltante" ? d.faltanteCausa : d.sobranteCausa}
                          onValor={(v) => cambiar(l.clave, causas.tipo === "faltante" ? { faltanteCausa: v as CausaFaltante } : { sobranteCausa: v as CausaSobrante })}
                        />
                      </CampoGuiado>
                    ) : dif == null ? (
                      <Chip tono="neutro">{sinAviso ? "Sin aviso" : "Sin guía"}</Chip>
                    ) : (
                      <Chip tono="verde">Cuadra</Chip>
                    )}
                  </div>
                </div>
              );
            })}
      </Tabla>

      <p className="nota-cayla">
        {sinAviso ? "Lo que llega sin aviso no tiene con qué compararse: nada sobra ni falta. " : "El costo de cada línea viene de la orden: si la factura dice otra cosa, corrígelo aquí. "}
        ¿Alguna llegó dañada? Márcala en «Tallas y colores» (va a la cuarentena), o repórtala después en Existencias.
      </p>

      <div className="card-cayla space-y-4 p-4 sm:p-5">
        <CampoTexto
          etiqueta="Nota (opcional)"
          value={nota}
          maxLength={TOPES_CONTEO.notaEnvio}
          onChange={(e) => setNota(e.target.value)}
          // sugerir-fijo: la nota de la recepción no depende de nada elegido antes
          placeholder="Ej. Llegó en dos bolsas"
        />
        <CampoGuiado id="responsable" guia={guia}>
          <p className="mb-1.5 text-[13px] font-semibold text-tinta">{guia.etiqueta("responsable", "Quién cierra")}</p>
          <ComboResponsable control={responsable} />
        </CampoGuiado>
      </div>

      {error && (
        <Aviso ref={avisoError} enfocable tono="error" titulo="No se pudo cerrar">
          {error.texto}
          {error.recargar && " Revisa lo contado y vuelve a cerrar."}
        </Aviso>
      )}

      {/* El pie de una hoja, pegado abajo mientras la tabla pasa por detrás; aquí vive en la página, así que su fondo es el de la página. */}
      <div className="pie-hoja-fijo" style={{ "--fondo-hoja": "var(--color-crema)" } as CSSProperties}>
        <div className="card-cayla space-y-3 p-4">
          {atipicos ? (
            <AvisoCostoAtipico
              costos={atipicosPorLinea(atipicos)}
              pie="Revisa el costo de esa línea con la factura. Si está bien, confírmalo: el costo de la prenda se promedia con él."
              textoCorregir="Corregir el costo"
              textoConfirmar="Está bien, cerrar"
              textoCargando="Cerrando…"
              cargando={guardando}
              listo={responsable.listo}
              motivoNoListo={responsable.motivo}
              onCorregir={() => setAtipicos(null)}
              onConfirmar={() => {
                const claves = new Set(
                  atipicos
                    .map((a) => visibles.find((l) => (a.despachoItemId ? l.linea?.id === a.despachoItemId : !l.linea && l.conteo?.extraPosicion === a.extra))?.clave)
                    .filter((x): x is LineaParaContar["clave"] => !!x),
                );
                void cerrar(claves);
              }}
            />
          ) : (
            <>
              <PieGuia guia={guia} listo={porDetallar > 0 ? `Todo listo. ${porDetallar} quedan para después: no frenan el cierre.` : "Todo listo para cerrar."} />
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <Volver onClick={onVolver} a="contar" deshabilitado={guardando} />
                <Boton
                  type="submit"
                  peso="primario"
                  cargando={guardando}
                  disabled={!guia.puedeConfirmar || esperandoGuardar}
                  title={esperandoGuardar ? "Espera: lo último que contaste se está guardando" : (guia.frase ?? undefined)}
                  className={guia.claseConfirmar}
                  data-guia="recepcion.cerrar-boton"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Check aria-hidden className="h-4 w-4" />
                    {guardando ? "Cerrando…" : textoBotonCerrar(contadas, sede, reabierto)}
                  </span>
                </Boton>
              </div>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
