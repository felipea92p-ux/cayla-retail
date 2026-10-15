"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { MarcaNoDeducible } from "@/components/MarcaNoDeducible";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { Boton, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { useIntento } from "@/lib/useIntento";
import { huellaDe } from "@/lib/intento-reglas";
import { AvisoIntentoIncierto, avisarCongelado } from "@/components/ui/AvisoIntentoIncierto";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { diaMes, diaYHoraLima } from "@/lib/fechas-lima";
import type { ResumenMiFondo } from "@/lib/fondos-reglas";
import {
  MAX_TEXTO_RENDICION,
  camposRendir,
  cuentaRendicion,
  etiquetaItem,
  fraseCuenta,
  fraseFaltanteTuRendicion,
  fraseRendir,
  fraseSinFoto,
  textoPapel,
  type ItemRendicion,
} from "@/lib/rendicion-reglas";
import { devolverRendicion, leerItems, miRendicionAbierta, rendirFondo } from "@/lib/rendicion-acciones";
import { SubirFoto, VerFoto } from "./FotoDelGasto";

// «Rendir tu fondo» (ADR-0362, fase 6 · actividad 5; decisiones 32, 54 y 69): la hoja de la DUEÑA del fondo. Arriba, lo que dice el
// sistema del ciclo abierto (tenías, te entregaron, pagaste, gastos y «deberías tener»); debajo, cada pago y cada gasto con su papel
// —un gasto del viaje sin foto se la suma aquí mismo; la foto es opcional y la hoja avisa cuáles faltan—; y al final cuenta su efectivo.
// La hoja dice «Cuadra», «Te faltan S/ X» (con su explicación, opcional: sin ella, el faltante queda como deuda suya) o «sobra» (la base
// no lo acepta: falta anotar algo). Rendir va SIEMPRE con su propia cuenta (`fondo_rendir`); desde una terminal la base no deja.
//
// Con una rendición por aprobar, la hoja la muestra y deja retirarla para corregir (con un motivo): sus filas vuelven al ciclo.

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

function rechazoDe(error: Parameters<typeof traducirError>[0], que: string): Rechazo {
  if (error && esFalloDeRed(error)) {
    return { titulo: "Se cortó la conexión", texto: `No sabemos si alcanzó a ${que}. Vuelve a tocar el botón: si ya se guardó, no se repite.`, tono: "atencion" };
  }
  return { titulo: "No se guardó", texto: traducirError(error, que), tono: "error" };
}

/** El monto de una fila, con su signo de tienda: lo que entró al fondo va con «+». */
const montoFila = (i: ItemRendicion) => (i.monto >= 0 ? `+${soles(i.monto)}` : soles(-i.monto));

export function RendirFondo({ fondo, onClose, volverA }: { fondo: ResumenMiFondo; onClose: () => void; volverA: RefObject<HTMLElement | null> }) {
  const abierta = fondo.rendicion?.abierta ?? null;
  return abierta ? (
    <RendicionAbierta id={abierta.id} en={abierta.en} faltante={abierta.faltante} deuda={fondo.rendicion?.deuda ?? 0} onClose={onClose} volverA={volverA} />
  ) : (
    <RendirCiclo fondo={fondo} onClose={onClose} volverA={volverA} />
  );
}

// ---------- La lista de pagos y gastos, con su papel ----------

function ListaItems({ items, alSubir, deshabilitado }: { items: ItemRendicion[] | null; alSubir?: () => void; deshabilitado?: boolean }) {
  if (items === null) {
    return (
      <div aria-hidden className="space-y-2">
        {[0, 1, 2].map((k) => (
          <div key={k} className="h-11 animate-pulse rounded-lg bg-tinta/5" />
        ))}
      </div>
    );
  }
  if (items.length === 0)
    return (
      <Vacio tamano="chico" icono={<Receipt />}>
        No hay pagos ni gastos en esta rendición.
      </Vacio>
    );
  return (
    <ul className="divide-y divide-sand rounded-xl border border-sand">
      {items.map((i) => (
        <li key={i.clave} className="flex items-start gap-3 px-3.5 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-tinta">{etiquetaItem(i)}</p>
            <p className="truncate text-xs text-taupe" title={i.detalle}>
              {i.detalle || "—"}
              {i.fecha ? ` · ${diaMes(i.fecha)}` : ""}
            </p>
            {i.conFoto !== null && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Chip tono={i.conFoto ? "verde" : "ambar"}>{textoPapel(i)}</Chip>
                {i.tipo === "gasto" && i.refId && i.conFoto && <VerFoto gastoId={i.refId} />}
                {i.tipo === "gasto" && i.refId && !i.conFoto && alSubir && <SubirFoto gastoId={i.refId} alSubir={alSubir} deshabilitado={deshabilitado} />}
                {i.tipo === "pago" && !i.conFoto && <span className="text-xs text-taupe">Se adjunta en su comprobante.</span>}
              </div>
            )}
            <MarcaNoDeducible nd={i.noDeducible} montoDeLaFila={i.monto} className="mt-1" />
          </div>
          <span className={`shrink-0 whitespace-nowrap tabular-nums ${i.monto >= 0 ? "text-verde-profundo" : "text-tinta"}`}>{montoFila(i)}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------- Rendir el ciclo abierto ----------

function RendirCiclo({ fondo, onClose, volverA }: { fondo: ResumenMiFondo; onClose: () => void; volverA: RefObject<HTMLElement | null> }) {
  const router = useRouter();
  const [items, setItems] = useState<ItemRendicion[] | null>(null);
  const [fallaLectura, setFallaLectura] = useState(false);
  const [efectivo, setEfectivo] = useState("");
  const [explicacion, setExplicacion] = useState("");
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  // La marca sigue a lo que se manda (`useIntento`, /chaos 2026-10-14): si la respuesta se pierde, el efectivo y la explicación se
  // congelan hasta saber qué pasó; corregirlos antes ya no anuncia una rendición que no se guardó.
  const intento = useIntento("rendir_fondo");
  const guardando = intento.enviando;
  const congelada = intento.incierto;
  const [revisando, setRevisando] = useState(false);

  // Se vuelve a leer al subir una foto (cambia «Sin foto» a «Con foto»).
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    let vigente = true;
    void leerItems(null).then((r) => {
      if (!vigente) return;
      setFallaLectura(Boolean(r.error));
      setItems(r.error ? [] : r.items);
    });
    return () => {
      vigente = false;
    };
  }, [vuelta]);
  const cargar = () => setVuelta((v) => v + 1);
  const reintentar = () => {
    setFallaLectura(false);
    setItems(null);
    cargar();
  };

  const arrastre = fondo.rendicion?.arrastre ?? 0;
  // Lo que ya debe por faltantes aprobados: el faltante de ahora dice en qué queda (/formidable 2026-10-14, cambio 3).
  const deuda = fondo.rendicion?.deuda ?? 0;
  const cuenta = cuentaRendicion(fondo.saldo, efectivo);
  const campos = camposRendir({ efectivo, explicacion }, fondo.saldo, deuda);
  const guia = useGuiaCampos(campos);
  // Sin la lista, los papeles sin foto salen de «Tu fondo» (lo cuenta la base): el aviso no desaparece por un corte.
  const sinFoto = fallaLectura ? (fondo.rendicion?.sinFoto ?? 0) : (items?.filter((i) => i.conFoto === false).length ?? 0);
  const vacio = items !== null && items.length === 0 && !fallaLectura;

  async function confirmar() {
    if (guardando) return;
    if (!congelada && (!guia.puedeConfirmar || vacio)) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    setRechazo(null);
    const args = {
      p_efectivo: cuenta.efectivo ?? 0,
      p_explicacion: cuenta.estado === "falta" && explicacion.trim() ? explicacion.trim() : null,
    };
    const r = await intento.enviar(huellaDe(args), (token, senal) => rendirFondo(args, firmaOmitida("fondo_rendir"), token, senal));
    if (r.tipo === "ocupado") return;
    if (r.tipo === "congelado") return avisarCongelado(avisar);
    // En duda: la hoja lo dice sobre los botones y se congela hasta saber qué pasó.
    if (r.tipo === "incierto") return;
    if (r.tipo === "error") return setRechazo(rechazoDe(r.error, "rendir tu fondo"));
    rendida();
  }

  // Lo que se anuncia es lo que se mandó: mientras estuvo en duda, el efectivo no se pudo cambiar.
  function rendida() {
    avisar.exito(`Rendiste tu fondo con ${soles(cuenta.efectivo ?? 0)} en la mano`, {
      detalle: "Otra persona que revise los fondos la aprueba. Mientras, puedes seguir comprando.",
    });
    onClose();
    router.refresh();
  }

  async function revisar() {
    setRevisando(true);
    const res = await intento.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") return rendida();
    if (res.tipo === "no_llego") return avisar.aviso("La rendición no se guardó", { detalle: "No quedó nada guardado: revisa lo que tienes en la mano y vuelve a rendir." });
    avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  const fila = (texto: string, monto: string, fuerte = false) => (
    <div className={`flex items-baseline justify-between gap-3 ${fuerte ? "border-t border-sand pt-2 font-semibold text-tinta" : "text-tinta/80"}`}>
      <span>{texto}</span>
      <span className="whitespace-nowrap tabular-nums">{monto}</span>
    </div>
  );

  return (
    <Modal
      titulo="Rendir tu fondo"
      subtitulo="Cuenta tu efectivo: otra persona revisa la rendición."
      onClose={onClose}
      variante="hoja"
      tamano="mediana"
      alCerrarEnfocar={volverA}
      bloqueado={guardando || congelada}
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="space-y-5"
        >
          <section className="space-y-2 text-sm">
            <TituloGrupo>Lo que dice el sistema</TituloGrupo>
            {Math.abs(arrastre) > 0.005 && fila(arrastre > 0 ? "Tenías de tu rendición anterior" : "CAYLA te debía de tu rendición anterior", soles(Math.abs(arrastre)))}
            {(fondo.entregado > 0.005 || Math.abs(arrastre) <= 0.005) && fila("Te entregaron", soles(fondo.entregado))}
            {fondo.devuelto > 0.005 && fila("Devolviste", `−${soles(fondo.devuelto)}`)}
            {fondo.pagado > 0.005 && fila("Pagaste a proveedores", `−${soles(fondo.pagado)}`)}
            {fondo.gastos > 0.005 && fila("Gastos del viaje", `−${soles(fondo.gastos)}`)}
            {cuenta.caylaTeDebe > 0.005 ? fila("CAYLA te debe", soles(cuenta.caylaTeDebe), true) : fila("Deberías tener en la mano", soles(cuenta.deberias), true)}
          </section>

          <section className="space-y-2">
            <TituloGrupo cuenta={items && !fallaLectura ? items.length : undefined}>Lo que entra en esta rendición</TituloGrupo>
            {/* Una lectura que falla no es una lista vacía (/formidable 2026-10-14, cambio 2): antes salía «No hay pagos ni gastos» debajo. */}
            {fallaLectura ? (
              <Aviso
                tono="atencion"
                titulo="No pude traer la lista"
                chico
                accion={
                  <button type="button" className="btn-cayla btn-enlace" onClick={reintentar}>
                    Volver a intentar
                  </button>
                }
              >
                Los números de arriba sí están al día: puedes rendir igual.
              </Aviso>
            ) : (
              <ListaItems items={items} alSubir={cargar} deshabilitado={guardando} />
            )}
            {fraseSinFoto(sinFoto) && <p className="nota-cayla text-xs">{fraseSinFoto(sinFoto)}</p>}
          </section>

          {vacio ? (
            <Aviso tono="info" titulo="No hay nada nuevo que rendir">
              Todo lo que pagaste y gastaste ya está en una rendición.
            </Aviso>
          ) : (
            <fieldset disabled={congelada} className="campos-congelables min-w-0 space-y-5">
              <CampoGuiado id="efectivo" guia={guia} titulo="¿Cuánto tienes en la mano?">
                <CampoMonto
                  etiqueta="¿Cuánto tienes en la mano?"
                  etiquetaOculta
                  inputMode="decimal"
                  autoComplete="off"
                  value={efectivo}
                  disabled={guardando}
                  onChange={(e) => {
                    setRechazo(null);
                    setEfectivo(e.target.value);
                  }}
                />
                {fraseCuenta(cuenta, deuda) && (
                  <p
                    className={`mt-1.5 text-xs ${cuenta.estado === "cuadra" ? "text-verde-profundo" : cuenta.estado === "falta" ? "text-ambar-profundo" : "text-tinta/75"}`}
                    role="status"
                  >
                    {fraseCuenta(cuenta, deuda)}
                  </p>
                )}
              </CampoGuiado>
              {cuenta.estado === "falta" && (
                <CampoGuiado id="explicacion" guia={guia} titulo="¿Qué pasó con lo que falta?">
                  <CampoTexto
                    etiqueta="¿Qué pasó con lo que falta?"
                    caja
                    maxLength={MAX_TEXTO_RENDICION}
                    // sugerir-fijo: la explicación es de lo que pasó con la plata; no depende de ningún control de la hoja.
                    placeholder="Ej. Pagué un taxi y no lo anoté"
                    value={explicacion}
                    disabled={guardando}
                    onChange={(e) => {
                      setRechazo(null);
                      setExplicacion(e.target.value);
                    }}
                  />
                  <p className="mt-1.5 text-xs text-taupe">Con tu explicación, quien revisa decide si lo asume CAYLA; sin ella, queda como deuda tuya.</p>
                </CampoGuiado>
              )}
            </fieldset>
          )}

          {congelada ? (
            <AvisoIntentoIncierto onRevisar={() => void revisar()} revisando={revisando} />
          ) : (
            rechazo && (
              <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
                {rechazo.texto}
              </Aviso>
            )
          )}
          {/* «¿Después puedo corregir?» (prueba ciega 2): mientras nadie la apruebe, sí. */}
          {!vacio && <PieGuia guia={guia} listo="Todo listo para rendir. Mientras nadie la apruebe, puedes retirarla y corregirla." conFrase />}
          <div className="pie-hoja-fijo flex justify-end gap-3 pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando || congelada}>
              Cancelar
            </Boton>
            {!vacio && (
              <Boton textoCargando="Rindiendo…" type="submit" peso="primario" cargando={guardando} disabled={!congelada && (!guia.puedeConfirmar || items === null)} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                {congelada ? "Volver a intentar" : fraseRendir(cuenta)}
              </Boton>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

// ---------- La rendición que espera aprobación ----------

function RendicionAbierta({
  id,
  en,
  faltante,
  deuda,
  onClose,
  volverA,
}: {
  id: string;
  en: string;
  faltante: number;
  /** Lo que ya debe por faltantes aprobados: «tu deuda pasa de … a …» (/formidable 2026-10-14, cambio 3). */
  deuda: number;
  onClose: () => void;
  volverA: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ItemRendicion[] | null>(null);
  const [falla, setFalla] = useState(false);
  // Su explicación (`fn_mi_rendicion_abierta`): sin ella el faltante es deuda sin elegir (decisión 54), y la hoja tiene que decirlo bien.
  // `undefined` mientras llega o si no se pudo leer; `leida` dice cuál de las dos.
  const [explicacion, setExplicacion] = useState<string | null | undefined>(undefined);
  const [leida, setLeida] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const enVuelo = useRef(false);

  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    let vigente = true;
    void leerItems(id).then((r) => {
      if (!vigente) return;
      setFalla(Boolean(r.error));
      setItems(r.error ? null : r.items);
    });
    return () => {
      vigente = false;
    };
  }, [id, vuelta]);
  const cargar = () => setVuelta((v) => v + 1);
  const reintentar = () => {
    setFalla(false);
    setItems(null);
    cargar();
  };

  useEffect(() => {
    if (faltante <= 0.005) return;
    let vigente = true;
    void miRendicionAbierta().then((r) => {
      if (!vigente) return;
      // Si la que espera ya no es esta (la retiraron en otra pantalla), no se afirma nada de su explicación.
      setExplicacion(r === undefined || r === null || r.id !== id ? undefined : r.explicacion);
      setLeida(true);
    });
    return () => {
      vigente = false;
    };
  }, [id, faltante]);

  async function retirar() {
    if (guardando || enVuelo.current || !motivo.trim()) return;
    enVuelo.current = true;
    try {
      setGuardando(true);
      setRechazo(null);
      const { error } = await devolverRendicion({ p_id: id, p_motivo: motivo.trim() }, firmaOmitida("fondo_rendicion_devolver"));
      setGuardando(false);
      if (error) {
        setRechazo(rechazoDe(error, "retirar tu rendición"));
        return;
      }
      avisar.exito("Retiraste tu rendición", { detalle: "Corrige lo que haga falta y vuelve a rendir." });
      onClose();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal
      titulo={`Tu rendición del ${en ? diaYHoraLima(en).dia : ""}`}
      subtitulo="Espera que otra persona que revise los fondos la apruebe."
      onClose={onClose}
      variante="hoja"
      tamano="mediana"
      alCerrarEnfocar={volverA}
      conCerrar
    >
      {() => (
        <div className="space-y-5">
          {faltante > 0.005 && (
            <Aviso tono="atencion" titulo={`Faltan ${soles(faltante)}`} chico>
              {leida ? fraseFaltanteTuRendicion(explicacion, faltante, deuda) : null}
            </Aviso>
          )}
          <section className="space-y-2">
            <TituloGrupo cuenta={items ? items.length : undefined}>Lo que rendiste</TituloGrupo>
            {falla ? (
              <Aviso
                tono="atencion"
                titulo="No pude traer lo que rendiste"
                chico
                accion={
                  <button type="button" className="btn-cayla btn-enlace" onClick={reintentar}>
                    Volver a intentar
                  </button>
                }
              >
                Tu rendición está guardada: solo falló la lectura.
              </Aviso>
            ) : (
              <ListaItems items={items} alSubir={cargar} deshabilitado={guardando} />
            )}
          </section>
          {retirando && (
            <CampoTexto
              etiqueta="¿Por qué la retiras?"
              caja
              maxLength={MAX_TEXTO_RENDICION}
              // sugerir-fijo: el motivo de retirar una rendición no depende de nada elegido en la hoja.
              placeholder="Ej. Me faltó anotar un taxi"
              value={motivo}
              disabled={guardando}
              onChange={(e) => {
                setRechazo(null);
                setMotivo(e.target.value);
              }}
            />
          )}
          {rechazo && (
            <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
              {rechazo.texto}
            </Aviso>
          )}
          <div className="pie-hoja-fijo flex flex-wrap justify-end gap-3 pt-1">
            {retirando ? (
              <Boton textoCargando="Retirando…" type="button" peso="peligro" cargando={guardando} disabled={!motivo.trim()} onClick={() => void retirar()}>
                Retirar para corregir
              </Boton>
            ) : (
              <Boton type="button" peso="fantasma" onClick={() => setRetirando(true)}>
                Retirar para corregir
              </Boton>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
