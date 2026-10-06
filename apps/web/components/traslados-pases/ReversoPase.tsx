"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, Check, Minus, Plus, ScanLine, Store, Warehouse } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { EscanerConteo } from "@/components/EscanerConteo";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos, type GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { FaltanDelPaso } from "@/components/alta-producto/guia";
import { SelloPase } from "@/components/traslados-pases/SelloPase";
import { usePase } from "@/components/traslados-pases/PaseTraslado";
import { rutaDelPase } from "@/components/traslados-pases/Billetera";
import { useRecepcion, type VarianteBusqueda } from "@/components/traslados-pases/useRecepcion";
import { codigoPrenda } from "@/lib/prenda-reglas";
import { ejemploNotaCierre } from "@/lib/sugerencias-traslados";
import { enlaceWhatsAppA } from "@/lib/facturacion-comprobantes-reglas";
import { etiquetaDePrenda, mensajeParaLaOtraSede } from "@/lib/traslados-reglas";
import {
  anulacion,
  consecuenciaAnular,
  consecuenciaCierre,
  leerCasilla,
  lugarTexto,
  resumenAntesDeConfirmar,
  textoObligatorioValido,
  valorContado,
  type ConsecuenciaCierre,
  type DestinoRecepcion,
  type EstadoGuardado,
} from "@/lib/traslados-recepcion-reglas";
import {
  camposAnular,
  camposCerrar,
  camposDelConteo,
  faltaQue,
  idCampoPrenda,
  modoDelReverso,
  selloAlConfirmar,
  textoTerminar,
  tituloDelReverso,
  tonoDelReverso,
} from "@/lib/traslados-reverso-reglas";
import type { LineaTraslado, TrasladoDetalle } from "@/lib/traslados";
import type { VistaPase } from "@/lib/traslados-pases-reglas";
import type { FirmaDelPaso } from "@/lib/firma-heredada";
import { preguntaFirma } from "@/lib/firma-heredada";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// El reverso del pase (ADR-0354, maqueta D): lo que se hace con la caja al darle vuelta.
//  · Te llega: cuentas a ciegas (− / +, la pistola o la cámara; lo contado se guarda solo). «Terminé de contar» destapa lo que
//    venía junto a lo que contaste, marca lo que no cuadra y nombra la prenda; eliges piso o almacén y confirmas: cae el sello.
//  · Faltó algo: lo que no cuadra, y al líder de la sede destino, la nota para cerrar con la diferencia.
//  · La enviaste: lo que va en la caja, el WhatsApp para la otra sede y, mientras nadie la cuente, anular con su motivo.
//  · Terminada o anulada: lo que llegó (o por qué se anuló) con la nota de quien la cerró.
// La lógica de recibir es la de siempre (`useRecepcion`); aquí solo se dibuja y se decide qué toca.

const LUGARES: Record<"piso_venta" | "almacen_tienda", { texto: string; icono: ReactNode }> = {
  piso_venta: {
    texto: "Al piso",
    icono: <Store aria-hidden strokeWidth={1.7} className="h-5 w-5" />,
  },
  almacen_tienda: {
    texto: "Al almacén",
    icono: <Warehouse aria-hidden strokeWidth={1.7} className="h-5 w-5" />,
  },
};

export function ReversoPase({
  vista,
  traslado: t,
  esDestino,
  esOrigen,
  esLider,
  puedeCerrarDiferencia,
  opcionesDestino,
  lugarRecibido,
  firma,
  catalogo,
  whatsappDestino,
}: {
  vista: VistaPase;
  traslado: TrasladoDetalle;
  esDestino: boolean;
  esOrigen: boolean;
  esLider: boolean;
  puedeCerrarDiferencia: boolean;
  /** Dónde se puede dejar lo que llega; vacío = la sede no tiene piso de venta y no se pregunta (D-131). */
  opcionesDestino: ("piso_venta" | "almacen_tienda")[];
  lugarRecibido: DestinoRecepcion;
  firma: FirmaDelPaso;
  catalogo: VarianteBusqueda[];
  /** El WhatsApp de la sede destino, para avisarle desde el pase que salió la caja. */
  whatsappDestino: string | null;
}) {
  const pase = usePase();
  const r = useRecepcion({
    traslado: t,
    esDestino,
    firma,
    catalogo,
    puedeCerrarDiferencia,
    lugarRecibido,
  });
  const [termino, setTermino] = useState(false);
  const [camara, setCamara] = useState(false);
  const [lugar, setLugar] = useState<DestinoRecepcion>(opcionesDestino.includes("piso_venta") ? "piso_venta" : (opcionesDestino[0] ?? null));
  const [nota, setNota] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [anulandoAhora, setAnulandoAhora] = useState(false);
  const responsable = useResponsable();
  // Doble clic al anular (ADR-0190): un token por intento; se renueva solo si la anulación salió bien.
  const tokenAnular = useRef<string>(crypto.randomUUID());

  const modo = modoDelReverso({
    estado: t.estado,
    esDestino,
    terminoDeContar: termino && r.lectura.lista,
  });
  const que = faltaQue(t.lineas, r.conteos);
  const tono = tonoDelReverso(modo, {
    tonoDelPase: vista.tono,
    hayDiferencia: que !== "",
  });
  const titulo = tituloDelReverso(modo, { numero: t.numero, faltaQue: que });
  const anular = anulacion({
    estado: t.estado,
    esOrigen,
    esLider,
    lineas: t.lineas,
    destinoNombre: t.ubicacionDestinoNombre,
  });
  const cierraLider = modo === "revisar" && esDestino && puedeCerrarDiferencia;
  const guiaCerrar = useGuiaCampos(cierraLider ? camposCerrar(nota) : [], {
    enModal: false,
  });
  const guiaAnular = useGuiaCampos(anulando ? camposAnular(motivo, responsable.listo) : [], { enModal: false });
  const guiaConteo = useGuiaCampos(modo === "contar" ? camposDelConteo(t.lineas, r.conteos) : [], { enModal: false });
  const ocupado = r.ocupado || anulandoAhora;
  const { firma: f } = r;

  async function alTerminar() {
    if (await r.terminarDeContar()) setTermino(true);
  }

  async function alConfirmar() {
    const sello = selloAlConfirmar(r.lectura);
    if (await r.confirmar(lugar)) pase.sellar(sello.texto, sello.tono);
  }

  async function alCerrar() {
    if (await r.cerrarConDiferencia(nota.trim())) pase.sellar("CON NOTA", "dif");
  }

  async function alAnular() {
    if (!responsable.listo) return;
    setAnulandoAhora(true);
    r.setError(null);
    const { error } = await firmar(
      createClient().rpc("anular_traslado", {
        p_transferencia_id: t.id,
        p_motivo: motivo.trim(),
        p_token: tokenAnular.current,
      }),
      responsable.firma(),
    );
    setAnulandoAhora(false);
    responsable.despues(error);
    if (error) {
      r.setError(traducirError(error, "anular el envío"));
      return;
    }
    tokenAnular.current = crypto.randomUUID();
    const n = r.lectura.unidadesEnviadas;
    avisar.exito(`Traslado ${t.numero} anulado`, {
      detalle: n === 1 ? `La prenda volvió al stock de ${t.ubicacionOrigenNombre}.` : `Las ${n} prendas volvieron al stock de ${t.ubicacionOrigenNombre}.`,
    });
    pase.sellar("ANULADA", "anulado");
  }

  function avisarPorWhatsApp() {
    const mensaje = mensajeParaLaOtraSede({
      numero: t.numero,
      origen: t.ubicacionOrigenNombre,
      destino: t.ubicacionDestinoNombre,
      prendas: t.lineas.filter((l) => l.cantidadEnviada !== null).map(etiquetaDePrenda),
      enlace: `${window.location.origin}${rutaDelPase(t.id)}`,
    });
    window.open(enlaceWhatsAppA(whatsappDestino, mensaje), "_blank", "noopener,noreferrer");
  }

  const aro = modo === "contar" ? (r.lectura.enviadas === 0 ? 0 : r.lectura.contadas / r.lectura.enviadas) : modo === "comparar" ? 1 : null;

  if (t.lineas.length === 0) {
    return (
      <>
        <Cabecera titulo="Caja sin prendas" numero={t.numero} aro={null} onVolver={() => pase.girar(false)} />
        <div className="tp-reverso-cuerpo">
          <p className="tp-cita">
            Este traslado no tiene prendas registradas: es una cabecera vacía de la limpieza de datos de prueba. No mueve stock y no hay nada que confirmar.
          </p>
        </div>
      </>
    );
  }

  return (
    <div className="contents" data-tp-tono={tono}>
      <Cabecera titulo={titulo} numero={t.numero} aro={aro} onVolver={() => pase.girar(false)} tono={tono} />

      <div className="tp-reverso-cuerpo" data-revela={modo === "comparar" || modo === "revisar" || modo === "llegada" ? "" : undefined}>
        {r.error && (
          <p role="alert" className="tp-cita" data-error>
            {r.error}
          </p>
        )}

        {modo === "contar" && (
          <>
            <p className="tp-consejo">
              <SelloPase glifo="ciega" tono="contando" tamano={30} />
              <span>
                <b>Cuenta lo que ves en la caja.</b> Lo que venía aparece al final.
              </span>
            </p>
            <Firma r={r} />
          </>
        )}

        {(modo === "contar" || (modo === "revisar" && r.contable)) && (
          <div className="tp-escaneo" inert={f.sinNombre}>
            <label className="caja-cayla relative flex h-10 items-center">
              <ScanLine aria-hidden strokeWidth={1.5} className="pointer-events-none absolute left-3 h-4 w-4 text-taupe" />
              <span className="sr-only">Escanear o buscar una prenda</span>
              <input
                type="text"
                value={r.escaneo}
                onChange={(e) => r.setEscaneo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  r.alEscanear();
                }}
                placeholder="Escanea o escribe el código" // sugerir-fijo: la etiqueta se escanea igual sea cual sea la prenda
                autoComplete="off"
                disabled={r.trabajando === "extra"}
                className="h-full w-full rounded-lg bg-transparent pl-9 pr-3 text-sm text-tinta outline-none placeholder:text-taupe"
              />
            </label>
            {r.avisoEscaneo && (
              <div role="status" className="tp-cita flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span>{r.avisoEscaneo.texto}</span>
                {r.avisoEscaneo.fueraId && (
                  <button type="button" onClick={() => void r.anotarDeMas(r.avisoEscaneo!.fueraId!)} disabled={ocupado} className="btn-cayla btn-enlace btn-chico">
                    {r.trabajando === "extra" ? "Anotando…" : "Llegó igual: anotarla como prenda de más"}
                  </button>
                )}
              </div>
            )}
            {r.sugerencias.length > 0 && (
              <ul className="space-y-1">
                {r.sugerencias.map((l) => (
                  <li key={l.varianteId}>
                    <button
                      type="button"
                      onClick={() => {
                        r.setEscaneo("");
                        r.setAvisoEscaneo(null);
                        r.sumar(l.varianteId, 1);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-hueso/60"
                    >
                      <span className="min-w-0 truncate">
                        {l.referencia}{" "}
                        <span className="text-taupe">
                          · {[l.talla, l.color].filter(Boolean).join(" · ")} · {codigoPrenda(l)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-taupe">+1</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ul
          className="tp-prendas"
          aria-label="Prendas de la caja"
          inert={modo === "contar" && f.sinNombre}
          data-espera={modo === "contar" && f.sinNombre ? "" : undefined}
        >
          {t.lineas.map((l, k) => {
            const valor = valorContado(l, r.conteos);
            const editable = r.contable && !l.ingresado && (modo === "contar" || modo === "revisar");
            const verComparacion = modo === "comparar" || modo === "revisar" || modo === "llegada";
            const noCuadra = verComparacion && (valor ?? 0) !== (l.cantidadEnviada ?? 0);
            return (
              <li key={l.varianteId} className="tp-prenda-fila" data-no-cuadra={noCuadra ? "" : undefined} style={{ "--tp-k": k } as CSSProperties}>
                <Fila guiada={modo === "contar" && l.cantidadEnviada !== null && !l.ingresado} id={idCampoPrenda(l.varianteId)} guia={guiaConteo}>
                  <MiniaturaPrenda fotoUrl={l.fotoUrl} colorHex={l.colorHex ?? null} />
                  <Nombre linea={l} marca={modo === "contar" ? (texto) => guiaConteo.etiqueta(idCampoPrenda(l.varianteId), texto) : undefined} />
                  {modo === "contar" ? (
                    <span className="tp-derecha">
                      <Contador
                        linea={l}
                        valor={valor}
                        deshabilitado={ocupado || !editable}
                        onSumar={(d) => r.sumar(l.varianteId, d)}
                        onCambiar={(n) => r.cambiar(l.varianteId, n)}
                      />
                      <EstadoLinea estado={r.guardado[l.varianteId]} onReintentar={() => r.reintentar(l.varianteId)} />
                    </span>
                  ) : verComparacion ? (
                    <span className="tp-comparar">
                      <span className="tp-venian">
                        venían<b>{l.cantidadEnviada ?? 0}</b>
                      </span>
                      <span
                        className="tp-marca"
                        data-ok={!noCuadra ? "" : undefined}
                        data-no={noCuadra ? "" : undefined}
                        aria-label={noCuadra ? "No cuadra" : "Coincide"}
                      >
                        {noCuadra ? <Minus aria-hidden strokeWidth={2.6} /> : <Check aria-hidden strokeWidth={2.6} />}
                      </span>
                      {editable && noCuadra ? (
                        <span className="tp-derecha">
                          <Contador
                            linea={l}
                            valor={valor}
                            deshabilitado={ocupado}
                            onSumar={(d) => r.sumar(l.varianteId, d)}
                            onCambiar={(n) => r.cambiar(l.varianteId, n)}
                          />
                          <EstadoLinea estado={r.guardado[l.varianteId]} onReintentar={() => r.reintentar(l.varianteId)} />
                        </span>
                      ) : (
                        <span className="tp-llegaron">{valor ?? 0}</span>
                      )}
                    </span>
                  ) : (
                    <span className="tp-llegaron" aria-label={`${l.cantidadEnviada ?? 0} en la caja`}>
                      {l.cantidadEnviada ?? 0}
                    </span>
                  )}
                </Fila>
              </li>
            );
          })}
        </ul>

        {modo === "comparar" && <ResumenComparar r={r} lugar={lugar} sede={t.ubicacionDestinoNombre} />}

        {t.nota && (modo === "envio" || modo === "llegada" || modo === "anulada") && (
          <blockquote className="tp-cita">
            “{t.nota}”<cite>{t.creadoPorNombre !== "—" ? `${t.creadoPorNombre}, al enviarla` : "Al enviarla"}</cite>
          </blockquote>
        )}
        {modo === "llegada" && t.notaCierre && (
          <blockquote className="tp-cita">
            “{t.notaCierre}”<cite>{t.cerradoPorNombre ? `${t.cerradoPorNombre}, al cerrarla` : "Al cerrarla"}</cite>
          </blockquote>
        )}
        {modo === "llegada" && lugarRecibido && <p className="tp-dato">Entró {lugarTexto(lugarRecibido, t.ubicacionDestinoNombre)}.</p>}
        {modo === "anulada" && (
          <blockquote className="tp-cita">
            “{t.motivoAnulacion ?? "Sin motivo escrito"}”<cite>{t.anuladoPorNombre ? `${t.anuladoPorNombre}, al anularla` : "Al anularla"}</cite>
          </blockquote>
        )}
        {modo === "anulada" && <p className="tp-dato">Las prendas volvieron al stock de {t.ubicacionOrigenNombre}.</p>}

        {modo === "revisar" && !cierraLider && (
          <p className="tp-dato">
            Lo que coincidió ya está en el stock de {t.ubicacionDestinoNombre}. Lo que no cuadra espera a que un líder de {t.ubicacionDestinoNombre} lo revise y cierre.
            {esDestino && " Si encuentras algo, corrígelo aquí: se guarda solo."}
          </p>
        )}
        {cierraLider && (
          <>
            <CampoGuiado id="nota-cierre" guia={guiaCerrar} titulo="¿Qué pasó con lo que falta?">
              <textarea
                id="nota-cierre"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder={ejemploNotaCierre(t.lineas, r.conteos, t.ubicacionOrigenNombre)}
                aria-label="Qué pasó con lo que falta"
                rows={3}
                disabled={ocupado}
                className="tp-campo-nota"
              />
            </CampoGuiado>
            <Consecuencia
              c={consecuenciaCierre(t.lineas, r.conteos, {
                destino: lugarRecibido,
                sede: t.ubicacionDestinoNombre,
              })}
            />
          </>
        )}

        {anulando && (
          <>
            <p className="tp-dato">{consecuenciaAnular(r.lectura.unidadesEnviadas, t.ubicacionOrigenNombre, t.ubicacionDestinoNombre)}</p>
            <CampoGuiado id="motivo-anular" guia={guiaAnular} titulo="¿Por qué la anulas?">
              <textarea
                id="motivo-anular"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. La caja no salió: se armó con la talla equivocada" // sugerir-fijo: el motivo de anular no depende de la prenda
                aria-label="Por qué la anulas"
                rows={3}
                disabled={ocupado}
                className="tp-campo-nota"
              />
            </CampoGuiado>
            <CampoGuiado id="responsable-anular" guia={guiaAnular} titulo="¿Quién la anula?">
              <ComboResponsable control={responsable} deshabilitado={ocupado} compacto className="w-full" />
            </CampoGuiado>
          </>
        )}
      </div>

      <Pie>
        {modo === "contar" ? (
          <>
            {!f.sinNombre && <FaltanPorContar guia={guiaConteo} />}
            <div className="tp-fila">
              <button type="button" onClick={() => setCamara(true)} disabled={ocupado || f.sinNombre} className="btn-cayla btn-secundario">
                <ScanLine aria-hidden strokeWidth={1.7} className="h-4 w-4" /> Escanear
              </button>
              <button
                type="button"
                onClick={() => void alTerminar()}
                disabled={ocupado || !r.terminar.habilitado || f.sinNombre}
                className={`btn-cayla btn-primario tp-grande ${r.terminar.habilitado ? guiaConteo.claseConfirmar : ""}`}
              >
                {textoTerminar(r.lectura, r.terminar)}
              </button>
            </div>
          </>
        ) : modo === "comparar" ? (
          <>
            {opcionesDestino.length > 1 && (
              <div className="tp-lugar" role="group" aria-label="Dónde la dejas">
                {opcionesDestino.map((o) => (
                  <button key={o} type="button" aria-pressed={lugar === o} onClick={() => setLugar(o)} disabled={ocupado}>
                    {LUGARES[o].icono}
                    {LUGARES[o].texto}
                  </button>
                ))}
              </div>
            )}
            <div className="tp-fila">
              <button type="button" onClick={() => setTermino(false)} disabled={ocupado} className="btn-cayla btn-secundario">
                Volver a contar
              </button>
              <button type="button" onClick={() => void alConfirmar()} disabled={ocupado || r.resumenGuardado.errores > 0} className="btn-cayla btn-primario tp-grande">
                {r.trabajando === "confirmar" ? "Confirmando…" : que ? "Confirmar lo que llegó" : "Confirmar"}
              </button>
            </div>
          </>
        ) : cierraLider ? (
          <>
            <PieGuia guia={guiaCerrar} listo="Listo: ya puedes cerrarla." />
            <button
              type="button"
              onClick={() => void alCerrar()}
              disabled={ocupado || !textoObligatorioValido(nota) || r.resumenGuardado.errores > 0 || f.sinNombre}
              className="btn-cayla btn-primario tp-grande"
            >
              {r.trabajando === "cerrar" ? "Cerrando…" : "Cerrar con la diferencia"}
            </button>
          </>
        ) : modo === "envio" && esOrigen && anulando ? (
          <>
            <PieGuia guia={guiaAnular} listo="Listo: ya puedes anularla." />
            <div className="tp-fila">
              <button type="button" onClick={() => setAnulando(false)} disabled={ocupado} className="btn-cayla btn-secundario">
                No anular
              </button>
              <button
                type="button"
                onClick={() => void alAnular()}
                disabled={ocupado || !textoObligatorioValido(motivo) || !responsable.listo}
                className="btn-cayla btn-peligro tp-grande"
              >
                {anulandoAhora ? "Anulando…" : "Anular · vuelve a tu stock"}
              </button>
            </div>
          </>
        ) : modo === "envio" && (esOrigen || anular.mostrar) ? (
          <>
            <div className="tp-fila">
              {esOrigen && (
                <button type="button" onClick={avisarPorWhatsApp} className="btn-cayla btn-secundario">
                  Avisar por WhatsApp
                </button>
              )}
              {anular.mostrar && (
                <button
                  type="button"
                  onClick={() => setAnulando(true)}
                  disabled={ocupado || !anular.habilitado}
                  className="btn-cayla btn-secundario ml-auto"
                  title={anular.porQueNo ?? undefined}
                >
                  Anular
                </button>
              )}
            </div>
            {anular.porQueNo && <p className="tp-dato">{anular.porQueNo}</p>}
          </>
        ) : null}
      </Pie>

      {camara && (
        <EscanerConteo
          onCodigo={r.leerConCamara}
          actual={r.enCamara}
          avance={{ contadas: r.lectura.contadas, total: r.lectura.enviadas }}
          onPaso={(paso) => {
            if (r.ultimaLeida) r.sumar(r.ultimaLeida, paso);
          }}
          onEscribir={() => setCamara(false)}
          aviso={
            r.avisoEscaneo ? (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{r.avisoEscaneo.texto}</span>
                {r.avisoEscaneo.fueraId && (
                  <button type="button" onClick={() => void r.anotarDeMas(r.avisoEscaneo!.fueraId!)} disabled={ocupado} className="btn-cayla btn-enlace btn-chico">
                    Anotarla como prenda de más
                  </button>
                )}
              </span>
            ) : undefined
          }
          textos={{
            titulo: `Contar la caja Nº ${t.numero}`,
            subtitulo: "Pasa las etiquetas una tras otra: cada una suma 1.",
            etiqueta: "Contar la caja · cada lectura suma 1",
            vacio: "Lo que escanees aparece aquí, con − / + para corregir.",
          }}
          onClose={() => setCamara(false)}
        />
      )}
    </div>
  );
}

function Cabecera({ titulo, numero, aro, onVolver, tono }: { titulo: string; numero: number; aro: number | null; onVolver: () => void; tono?: string }) {
  return (
    <header className="tp-banda tp-banda-atras" data-tp-tono={tono}>
      <button type="button" className="tp-volver" onClick={onVolver} data-foco-reverso>
        <ArrowLeft aria-hidden strokeWidth={2} className="h-4 w-4" /> Volver
      </button>
      <span className="tp-banda-nombre" role="heading" aria-level={2}>
        {titulo}
      </span>
      {aro !== null ? (
        <svg className="tp-aro" viewBox="0 0 40 40" aria-hidden style={{ "--tp-v": aro } as CSSProperties}>
          <circle className="tp-aro-fondo" cx="20" cy="20" r="16" />
          <circle className="tp-aro-valor" cx="20" cy="20" r="16" />
        </svg>
      ) : (
        <span className="tp-banda-num">Nº {numero}</span>
      )}
    </header>
  );
}

/** Lo que pasa al cerrar con la diferencia, escrito antes de apretar (lo que antes decía la ventana de cerrar). */
function Consecuencia({ c }: { c: ConsecuenciaCierre }) {
  return (
    <div className="tp-cita">
      <p>{c.entran}</p>
      {c.perdidas && <p className="mt-1">{c.perdidas}</p>}
      {c.deMas && <p className="mt-1">{c.deMas}</p>}
    </div>
  );
}

function Pie({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="tp-reverso-pie">{children}</div>;
}

/** Una prenda que hay que contar se ENCIENDE cuando es la que sigue (la guía de foco, ADR-0284); las demás, una fila sin más. */
function Fila({ guiada, id, guia, children }: { guiada: boolean; id: string; guia: GuiaCampos; children: ReactNode }) {
  if (!guiada) return <div className="tp-prenda">{children}</div>;
  return (
    <CampoGuiado id={id} guia={guia} className="tp-prenda">
      {children}
    </CampoGuiado>
  );
}

/** «Faltan: ● Blusa Emma S ○ Falda Ariana M y 3 más», cada una tocable (lleva a su fila). Con muchas, solo las primeras: el resto
 *  ya lo dice el botón («Faltan 7 por contar»). */
const MAX_FALTAN_A_LA_VISTA = 3;
function FaltanPorContar({ guia }: { guia: GuiaCampos }) {
  if (guia.faltan.length === 0) return null;
  const resto = guia.faltan.length - MAX_FALTAN_A_LA_VISTA;
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <FaltanDelPaso faltan={guia.faltan.slice(0, MAX_FALTAN_A_LA_VISTA)} ahora={guia.ahora} onIr={(c) => guia.ir(c.id)} />
      {resto > 0 && <span className="text-[12.5px] text-taupe">y {resto} más</span>}
    </div>
  );
}

/** Quién recibe (ADR-0328): una sola vez por recepción. */
function Firma({ r }: { r: ReturnType<typeof useRecepcion> }) {
  const { firma: f } = r;
  if (f.enPantalla?.modo === "elegir") {
    return (
      <section className="tp-firma" aria-label="Quién recibe la caja">
        <p className="text-sm text-tinta/80">{f.enPantalla.texto}</p>
        <CampoGuiado id="firma" guia={f.guiaFirma} titulo={preguntaFirma("recepcion_traslado")}>
          <ComboResponsable control={f.comboRecibe} deshabilitado={r.ocupado} compacto className="w-full" />
        </CampoGuiado>
        <PieGuia guia={f.guiaFirma} listo="Listo: ya puedes contar." />
      </section>
    );
  }
  if ((f.enPantalla?.modo === "base" || f.enPantalla?.modo === "recordada") && f.enPantalla.texto) {
    return (
      <p className="tp-dato flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span>{f.enPantalla.texto}</span>
        {f.enPantalla.cambiar && (
          <button type="button" onClick={f.pedirCambio} disabled={r.ocupado} className="btn-cayla btn-enlace text-xs">
            {f.enPantalla.cambiar}
          </button>
        )}
      </p>
    );
  }
  return null;
}

/** Lo que entra y lo que espera, escrito antes de confirmar (lo que antes decía la ventana de confirmar). */
function ResumenComparar({ r, lugar, sede }: { r: ReturnType<typeof useRecepcion>; lugar: DestinoRecepcion; sede: string }) {
  const resumen = resumenAntesDeConfirmar(r.lectura, { destino: lugar, sede });
  return (
    <div className="tp-cita">
      <p>{resumen.entran}</p>
      {resumen.esperan && <p className="mt-1">{resumen.esperan}</p>}
    </div>
  );
}

/** La prenda: nombre y talla · color · código (a ciegas, el código es lo que se compara contra la etiqueta). */
function Nombre({ linea: l, marca }: { linea: LineaTraslado; marca?: (texto: ReactNode) => ReactNode }) {
  return (
    <span className="tp-prenda-nombre">
      <b title={l.referencia}>
        {marca ? marca(l.referencia) : l.referencia}
        {l.cantidadEnviada === null && <em> · no venía</em>}
      </b>
      <span>{[l.talla, l.color, codigoPrenda(l)].filter(Boolean).join(" · ")}</span>
    </span>
  );
}

/** «−», la cifra y «+». La casilla vacía es «sin contar» (no 0); se puede escribir encima si son muchas. */
function Contador({
  linea: l,
  valor,
  deshabilitado,
  onSumar,
  onCambiar,
}: {
  linea: LineaTraslado;
  valor: number | null;
  deshabilitado: boolean;
  onSumar: (delta: number) => void;
  onCambiar: (n: number | null) => void;
}) {
  const nombre = `${l.referencia}${l.talla ? ` talla ${l.talla}` : ""}`;
  return (
    <span className="tp-contador">
      <button type="button" onClick={() => onSumar(-1)} disabled={deshabilitado} aria-label={`Una menos de ${nombre}`}>
        <Minus aria-hidden strokeWidth={2} className="h-3.5 w-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={valor ?? ""}
        placeholder="—" // sugerir-fijo: el guion es «sin contar», igual para toda prenda
        onChange={(e) => {
          const n = leerCasilla(e.target.value);
          if (n !== undefined) onCambiar(n);
        }}
        onFocus={(e) => e.target.select()}
        disabled={deshabilitado}
        aria-label={`Contado de ${nombre}`}
      />
      <button type="button" onClick={() => onSumar(1)} disabled={deshabilitado} aria-label={`Una más de ${nombre}`}>
        <Plus aria-hidden strokeWidth={2} className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/** El guardado de una prenda, discreto y con su alto reservado (la fila no salta). */
function EstadoLinea({ estado, onReintentar }: { estado: EstadoGuardado | undefined; onReintentar: () => void }) {
  return (
    <span aria-live="polite" className="tp-guardado">
      {estado?.tipo === "espera" || estado?.tipo === "guardando" ? (
        <span className="text-taupe">Guardando…</span>
      ) : estado?.tipo === "guardado" ? (
        <span className="flex items-center gap-1 text-verde">
          <Check aria-hidden strokeWidth={2} className="h-3 w-3" /> Guardado
        </span>
      ) : estado?.tipo === "error" ? (
        <span className="flex items-center gap-1 text-rojo-profundo" title={estado.mensaje}>
          No se guardó ·
          <button type="button" onClick={onReintentar} className="underline underline-offset-2">
            reintentar
          </button>
        </span>
      ) : null}
    </span>
  );
}
