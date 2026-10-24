"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { soloDigitos, validarRuc } from "@cayla-retail/shared";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { AvisoIntentoIncierto, avisarCongelado } from "@/components/ui/AvisoIntentoIncierto";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { AvisoNoDeducible } from "@/components/AvisoNoDeducible";
import { CampoCuentaFin, useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { useIntento } from "@/lib/useIntento";
import { huellaDe } from "@/lib/intento-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { medioDeCuenta, mediosDeBanco } from "@/lib/cuenta-sellada-reglas";
import { UMBRAL_BANCARIZACION, avisoBancarizacion } from "@/lib/no-deducible-reglas";
import { MAX_DESCRIPCION_GASTO } from "@/lib/finanzas-topes";
import { soles } from "@/lib/compras-reglas";
import { TEXTO_MEDIO, mediosPara, parsearMonto, type CategoriaGasto, type MedioGasto, type ProveedorGasto, type TipoComprobante } from "@/lib/gastos-reglas";
import type { SedeTelar } from "@/lib/finanzas-telar-reglas";
import { sugerirQueFue, sugerirSerie } from "@/lib/sugerencias-hoja-gasto";
import {
  aCredito,
  camposDeLaHoja,
  conComprobante,
  hojaDePlantilla,
  hojaSiguiente,
  hojaVacia,
  motivoDelMonto,
  proveedorDelRuc,
  salidaDeLaHoja,
  serieNumeroLegible,
  ticketDeLaHoja,
  validarHoja,
  type HojaGasto,
  type PlantillaGasto,
  type SalidaDeLaHoja,
} from "@/lib/hoja-gasto-reglas";

const COMPROBANTES: { valor: TipoComprobante; texto: string }[] = [
  { valor: "factura", texto: "Factura" },
  { valor: "boleta", texto: "Boleta" },
  { valor: "recibo_por_honorarios", texto: "Recibo por honorarios" },
  { valor: "sin_comprobante", texto: "Sin comprobante" },
];

/**
 * La hoja «Registrar gasto» de El telar (ADR-0493). Lo de todos los días son cinco toques —monto, sede, en qué, ¿tiene comprobante?,
 * ¿ya lo pagaste?— y lo demás aparece solo cuando el comprobante lo pide: con factura, boleta o recibo, el RUC (que se consulta en el
 * padrón y trae la razón social) y la serie, que se escribe como sea y queda como en SUNAT. A la derecha, «Así queda»: el registro como
 * un ticket que se arma mientras se llena, y lo que va a pasar al guardar. «Guardar y registrar otro» conserva la sede y la fecha.
 *
 * Guarda con `registrar_gasto`, igual que la hoja de antes (`RegistrarGastoModal`, que sigue para clasificar un egreso, un gasto fijo
 * y un activo): la misma validación (`validarHoja` = `validarGasto`), la misma salida de la plata, el mismo aviso de bancarización y la
 * misma marca que no deja guardar dos veces (`useIntento`). Un RUC nuevo se suma al directorio con `registrar_proveedor_de_gasto`.
 */
export function HojaRegistrarGasto({
  categorias,
  sedes,
  proveedores: proveedoresIniciales,
  cajasAbiertas,
  sedeInicial,
  plantillas,
  hoy,
  onCerrar,
}: {
  categorias: CategoriaGasto[];
  /** Las sedes a las que se le puede cargar el gasto (con «Empresa» solo si la cuenta puede). */
  sedes: SedeTelar[];
  proveedores: ProveedorGasto[];
  cajasAbiertas: { id: string; ubicacionId: string }[];
  sedeInicial: string;
  plantillas: PlantillaGasto[];
  hoy: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const intento = useIntento("registrar_gasto");
  const [revisando, setRevisando] = useState(false);
  const [sumando, setSumando] = useState(false);
  const [proveedores, setProveedores] = useState(proveedoresIniciales);
  const [h, setH] = useState<HojaGasto>(() => hojaVacia(hoy, sedes.some((s) => s.clave === sedeInicial) ? sedeInicial : ""));
  const poner = <K extends keyof HojaGasto>(k: K, v: HojaGasto[K]) => setH((x) => ({ ...x, [k]: v }));

  // De dónde salió la plata: la cuenta (el cajón, la caja fuerte, un banco, la tarjeta) y, con un banco, por qué camino. Las mismas
  // reglas que la hoja de antes: un gasto de una tienda solo sale del cajón de ESA tienda; los de la empresa, de cualquiera.
  const [cuentaId, setCuentaId] = useState("");
  const [medioBanco, setMedioBanco] = useState<"transferencia" | "yape" | "plin" | "deposito">("transferencia");
  const [medioSinCuentas, setMedioSinCuentas] = useState<MedioGasto | "">("");
  const [referencia, setReferencia] = useState("");
  const papel = conComprobante(h);
  const credito = aCredito(h);
  const cuentasPago = useCuentasParaElegir("pago", h.sede && h.sede !== "empresa" ? h.sede : null, true);
  const cuentasGasto = useMemo(
    () => cuentasPago.cuentas.filter((c) => c.tipo !== "cajon" || h.sede === "empresa" || c.ubicacionId === h.sede),
    [cuentasPago.cuentas, h.sede],
  );
  const conCuentas = cuentasPago.listo && cuentasGasto.length > 0;
  // Al cambiar de sede, lo que ya no sirve queda por elegir (no se reemplaza solo: `salidaDeLaHoja`).
  const [porElegir, setPorElegir] = useState(false);
  const cuentaSalida = salidaDeLaHoja(cuentasGasto, h, cuentaId, porElegir);
  const salida = cuentasGasto.find((c) => c.id === cuentaSalida) ?? null;
  const bancoConMedio = salida?.tipo === "banco" ? (mediosDeBanco(papel).includes(medioBanco) ? medioBanco : "transferencia") : null;
  const medioSalida: MedioGasto | "" = salida ? (medioDeCuenta(salida.tipo) ?? bancoConMedio ?? "transferencia") : "";
  const cajaDe = (ubicacionId: string | null | undefined) => cajasAbiertas.find((c) => c.ubicacionId === ubicacionId)?.id ?? "";
  const salidaHoja: SalidaDeLaHoja = conCuentas
    ? { medio: medioSalida, cuentaId: cuentaSalida ?? undefined, cajaId: salida?.tipo === "cajon" ? cajaDe(salida.ubicacionId) : "", referencia }
    : { medio: medioSinCuentas, cajaId: medioSinCuentas === "efectivo" ? cajaDe(h.sede) : "", referencia };
  const salidaLista = !h.sede ? false : conCuentas ? Boolean(cuentaSalida) : Boolean(medioSinCuentas) && (medioSinCuentas !== "efectivo" || Boolean(cajaDe(h.sede)));

  // El proveedor sale del RUC: el que ya está en el directorio, o la razón social que trajo el padrón (o se escribió) para sumarlo.
  const rucValido = validarRuc(h.ruc).valido;
  const existente = papel ? proveedorDelRuc(h.ruc, proveedores) : null;
  const proveedorListo = Boolean(existente) || (rucValido && h.razonSocial.trim().length > 1);

  const monto = parsearMonto(h.monto);
  const categoria = categorias.find((c) => c.codigo === h.categoria) ?? null;
  const sede = sedes.find((s) => s.clave === h.sede) ?? null;
  const campos = camposDeLaHoja(h, { proveedorListo, salidaLista, responsableListo: responsable.listo, responsableMotivo: responsable.motivo });
  const guia = useGuiaCampos(campos);
  const ticket = ticketDeLaHoja(h, {
    categoriaNombre: categoria?.nombre ?? null,
    sedeNombre: sede?.nombre ?? null,
    salidaNombre: credito || !h.sede ? null : conCuentas ? (salida?.nombre ?? null) : medioSinCuentas ? TEXTO_MEDIO[medioSinCuentas] : null,
    proveedorNombre: existente?.nombre ?? (h.razonSocial.trim() || null),
  });
  const pagaAhora = papel && !credito && monto.ok;
  const avisoNoDeducible = pagaAhora ? avisoBancarizacion(monto.valor, [{ monto: monto.valor, medio: medioSalida || medioSinCuentas, tipoCuenta: salida?.tipo ?? null }]) : null;
  const guardando = intento.enviando || sumando;

  function elegirSede(id: string) {
    if (id === h.sede) return;
    // Lo que se veía en «Salió de» se recuerda: si sirve en la sede nueva (un banco) se queda; si no (el cajón de la otra), queda por elegir.
    if (h.sede) {
      setCuentaId(cuentaSalida ?? "");
      setPorElegir(true);
    }
    poner("sede", id);
  }

  function elegirComprobante(t: TipoComprobante) {
    setH((x) => ({ ...x, comprobante: t, pagado: t === "sin_comprobante" ? "si" : x.pagado }));
    if (medioSinCuentas && !mediosPara(t).includes(medioSinCuentas)) setMedioSinCuentas("");
  }

  async function guardar(otro: boolean) {
    const v0 = validarHoja(h, existente?.id ?? "x", salidaHoja, hoy, proveedorListo);
    if (!v0.ok) return avisar.error(v0.error);
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    // Un RUC que no está en el directorio se suma antes (la base no duplica por RUC: si ya existía, devuelve el mismo).
    let proveedorId = existente?.id ?? "";
    if (papel && !proveedorId) {
      setSumando(true);
      const { data, error } = await createClient().rpc("registrar_proveedor_de_gasto" as never, { p_nombre: h.razonSocial.trim(), p_ruc: soloDigitos(h.ruc) } as never);
      setSumando(false);
      if (error) return avisar.error(traducirError(error, "sumar el proveedor"));
      proveedorId = String(data);
      setProveedores((ps) => (ps.some((p) => p.id === proveedorId) ? ps : [...ps, { id: proveedorId, nombre: h.razonSocial.trim(), ruc: soloDigitos(h.ruc), rubros: ["Gastos"] }]));
    }
    const v = validarHoja(h, proveedorId, salidaHoja, hoy);
    if (!v.ok) return avisar.error(v.error);
    const r = await intento.enviar(huellaDe(v.valor), (token, senal) =>
      firmar(createClient().rpc("registrar_gasto" as never, { ...v.valor, p_token: token } as never), responsable.firma()).abortSignal(senal),
    );
    if (r.tipo === "ocupado") return;
    if (r.tipo === "congelado") return avisarCongelado(avisar);
    responsable.despues(r.tipo === "error" || r.tipo === "incierto" ? r.error : null);
    if (r.tipo === "incierto") return;
    if (r.tipo === "error") return avisar.error(traducirError(r.error, "registrar el gasto"));
    registrado(otro);
  }

  async function revisar() {
    setRevisando(true);
    const res = await intento.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") return registrado(false);
    if (res.tipo === "no_llego") return avisar.aviso("El gasto no se registró", { detalle: "No quedó nada guardado. Revisa los datos y vuelve a registrarlo." });
    avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  function registrado(otro: boolean) {
    avisar.exito("Gasto registrado", { detalle: ticket.pasara.at(-1) });
    if (otro) {
      // Lo de recién se limpia; la sede, la fecha y de dónde salió se quedan para el siguiente.
      setH(hojaSiguiente(h));
      setReferencia("");
      router.refresh();
      return;
    }
    const guardiaFuera = avisoSalida.retirarYa();
    onCerrar();
    void guardiaFuera.then(() => router.refresh());
  }

  // ⌘↵ guarda; ⌘⇧↵ guarda y deja la hoja lista para el siguiente.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || guardando) return;
      e.preventDefault();
      void guardar(e.shiftKey);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  });

  const fotoActual = fotoFormulario({ h, cuentaId, medioSinCuentas, referencia });
  const [fotoAlAbrir, setFotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Llenaste parte de este gasto y todavía no se registró. Si cierras ahora, se pierde lo que llenaste.");

  function repetir(p: PlantillaGasto) {
    const nueva = hojaDePlantilla(p, h.fecha);
    setH(nueva);
    setCuentaId("");
    setPorElegir(false);
    setFotoAlAbrir(fotoFormulario({ h: nueva, cuentaId, medioSinCuentas, referencia }));
  }

  const nombreSede = (s: SedeTelar) => s.nombre;

  return (
    <Modal
      variante="hoja"
      titulo="Registrar gasto"
      subtitulo="Lo de todos los días son cinco toques. Si tiene comprobante, la hoja te pide lo que hace falta."
      onClose={onCerrar}
      antesDeCerrar={avisoSalida.pedirAccion}
      tamano="ancha"
      bloqueado={guardando || intento.incierto}
    >
      <div className="hoja-gasto">
        <fieldset disabled={intento.incierto} className="campos-congelables hoja-gasto-form min-w-0" data-guia="fin-hoja.cinco">
          {plantillas.length > 0 && (
            <div className="hoja-gasto-repetir" data-guia="fin-hoja.repetir">
              <span className="campo-etiqueta">Repetir uno anterior</span>
              <div className="flex flex-wrap gap-1.5">
                {plantillas.map((p) => (
                  <button key={p.clave} type="button" className="pildora-cayla" onClick={() => repetir(p)} title={`${p.descripcion} · ${soles(Number(p.monto))}`}>
                    {p.descripcion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <CampoGuiado id="monto" guia={guia} titulo="Cuánto">
            <CampoMonto etiqueta="Monto" etiquetaOculta sinPie={!motivoDelMonto(h.monto)} pie={motivoDelMonto(h.monto) ?? undefined} tono={motivoDelMonto(h.monto) ? "aviso" : undefined} inputMode="decimal" value={h.monto} onChange={(e) => poner("monto", e.target.value)} placeholder="0.00" /* sugerir-fijo: el formato de un monto no depende de lo elegido */ autoFocus />
          </CampoGuiado>

          <CampoGuiado id="sede" guia={guia} titulo="Para qué sede">
            <div className="hoja-gasto-opciones" role="radiogroup" aria-label="Sede">
              {sedes.map((s) => (
                <button key={s.clave} type="button" role="radio" aria-checked={h.sede === s.clave} className="hoja-gasto-sede" data-color={s.color} onClick={() => elegirSede(s.clave)}>
                  <span className="hoja-gasto-punto" aria-hidden />
                  {nombreSede(s)}
                </button>
              ))}
            </div>
          </CampoGuiado>

          <div className="grid gap-x-3 sm:grid-cols-2">
            <CampoGuiado id="categoria" guia={guia} titulo="En qué">
              <CampoSelect
                etiqueta="Categoría"
                caja
                valor={h.categoria}
                onValor={(v) => poner("categoria", v)}
                marcador="Elige…"
                opciones={categorias.map((c) => ({ valor: c.codigo, texto: c.nombre }))}
              />
            </CampoGuiado>
            <CampoGuiado id="descripcion" guia={guia} titulo="Qué fue">
              <CampoTexto etiqueta="Qué fue" caja sinPie value={h.descripcion} onChange={(e) => poner("descripcion", e.target.value)} placeholder={sugerirQueFue(categoria)} maxLength={MAX_DESCRIPCION_GASTO} />
            </CampoGuiado>
          </div>

          <CampoGuiado id="comprobante" guia={guia} titulo="¿Tiene comprobante?">
            <div className="hoja-gasto-opciones" role="radiogroup" aria-label="Comprobante">
              {COMPROBANTES.map((c) => (
                <button key={c.valor} type="button" role="radio" aria-checked={h.comprobante === c.valor} className="pildora-cayla" data-activa={h.comprobante === c.valor ? "true" : undefined} onClick={() => elegirComprobante(c.valor)}>
                  {c.texto}
                </button>
              ))}
            </div>
          </CampoGuiado>

          {papel && (
            <div className="hoja-gasto-papel anim-entra" data-sin-cascada>
              <CampoGuiado id="ruc" guia={guia}>
                <ConsultaDocumento
                  tipo="ruc"
                  obligatorio
                  numero={h.ruc}
                  onNumero={(v) => poner("ruc", v)}
                  nombre={h.razonSocial}
                  onNombre={(v) => poner("razonSocial", v)}
                  contador
                  conocido={existente ? { nombre: existente.nombre, origen: "Ya está en tus proveedores" } : null}
                />
              </CampoGuiado>
              <CampoGuiado id="serie" guia={guia} titulo="Serie y número">
                <CampoTexto
                  etiqueta="Serie y número"
                  caja
                  value={h.serieNumero}
                  onChange={(e) => poner("serieNumero", e.target.value)}
                  onBlur={() => {
                    const legible = serieNumeroLegible(h.serieNumero);
                    if (legible) poner("serieNumero", legible);
                  }}
                  placeholder={sugerirSerie(h.comprobante)}
                  pie={h.serieNumero && !serieNumeroLegible(h.serieNumero) ? "Escríbela como F001-2231 (la letra, tres números, un guion y el número)." : undefined}
                  tono={h.serieNumero && !serieNumeroLegible(h.serieNumero) ? "aviso" : undefined}
                />
              </CampoGuiado>
            </div>
          )}

          <div className="grid gap-x-3 sm:grid-cols-2">
            <CampoFecha etiqueta={papel ? "Fecha del comprobante" : "Fecha"} valor={h.fecha} onValor={(v) => poner("fecha", v)} />
            {papel && (
              <div>
                <span className="campo-etiqueta">¿Ya lo pagaste?</span>
                <div className="hoja-gasto-opciones mt-1.5" role="radiogroup" aria-label="¿Ya lo pagaste?">
                  {(
                    [
                      ["si", "Sí, ya salió"],
                      ["no", "Todavía no"],
                    ] as const
                  ).map(([v, t]) => (
                    <button key={v} type="button" role="radio" aria-checked={h.pagado === v} className="pildora-cayla" data-activa={h.pagado === v ? "true" : undefined} onClick={() => poner("pagado", v)}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {credito ? (
            <CampoGuiado id="vence" guia={guia}>
              <CampoFecha etiqueta="Cuándo vence" valor={h.vence} onValor={(v) => poner("vence", v)} ayuda="Queda en Cuentas y dinero ▸ Por pagar hasta ese día." />
            </CampoGuiado>
          ) : !h.sede ? null : (
            // «Salió de» depende de la sede (un gasto de una tienda sale de SU cajón): aparece cuando ya se eligió.
            <CampoGuiado id="salida" guia={guia}>
              {conCuentas ? (
                <div className="grid gap-x-3 sm:grid-cols-2">
                  <CampoCuentaFin id="hoja-gasto-cuenta" etiqueta="Salió de" cuentas={cuentasGasto} listo={cuentasPago.listo} clase="pago" medio={medioSalida || "transferencia"} sinMedio valor={cuentaSalida} onValor={(v) => setCuentaId(v)} />
                  {bancoConMedio && (
                    <CampoSelect etiqueta="Cómo" caja valor={bancoConMedio} onValor={(m) => setMedioBanco(m)} opciones={mediosDeBanco(papel).map((m) => ({ valor: m, texto: TEXTO_MEDIO[m] }))} />
                  )}
                </div>
              ) : (
                <CampoSelect<MedioGasto | "">
                  etiqueta="Salió de"
                  caja
                  valor={medioSinCuentas}
                  onValor={setMedioSinCuentas}
                  marcador="Elige…"
                  opciones={mediosPara(h.comprobante || "sin_comprobante").map((m) => ({ valor: m, texto: m === "efectivo" ? "Efectivo del cajón" : TEXTO_MEDIO[m] }))}
                  pie={medioSinCuentas === "efectivo" && !cajaDe(h.sede) ? "La caja de esa sede no está abierta: regístralo en Caja y clasifícalo después." : undefined}
                  tono={medioSinCuentas === "efectivo" && !cajaDe(h.sede) ? "aviso" : undefined}
                />
              )}
            </CampoGuiado>
          )}

          <AvisoNoDeducible aviso={avisoNoDeducible} reservar={pagaAhora && monto.valor >= UMBRAL_BANCARIZACION} />

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando || intento.incierto} />
          </CampoGuiado>
        </fieldset>

        <aside className="hoja-gasto-lado" aria-label="Así queda" data-guia="fin-hoja.asi-queda">
          <p className="campo-etiqueta">Así queda</p>
          <div className="hoja-gasto-ticket papel-fijo">
            {ticket.lineas.length ? (
              <dl>
                {ticket.lineas.map((l, i) => (
                  <div key={l.etiqueta} className="hoja-gasto-linea" data-fuerte={l.fuerte ? "" : undefined} style={{ "--i": i } as CSSProperties}>
                    <dt>{l.etiqueta}</dt>
                    <dd>{l.valor}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="hoja-gasto-ticket-vacio">Lo que escribas aparece aquí, como va a quedar registrado.</p>
            )}
          </div>
          {ticket.pasara.length > 0 && (
            <ul className="hoja-gasto-pasara" aria-label="Al guardar">
              {ticket.pasara.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {intento.incierto && <AvisoIntentoIncierto onRevisar={revisar} revisando={revisando} className="mt-4" />}

      <PieGuia guia={guia} listo="Todo listo para registrar." />
      <PieAcciones className="mt-3" guia="fin-hoja.botones">
        <Boton type="button" peso="fantasma" onClick={() => avisoSalida.pedirAccion(onCerrar)} disabled={guardando || intento.incierto}>
          Cancelar
        </Boton>
        <Boton type="button" peso="fantasma" onClick={() => void guardar(true)} disabled={guardando || revisando || intento.incierto} title="Guardar y registrar otro (⌘⇧↵)">
          Guardar y registrar otro
        </Boton>
        <Boton type="button" peso="primario" cargando={guardando} onClick={() => void guardar(false)} disabled={guardando || revisando || !responsable.listo} title="Registrar (⌘↵)">
          {intento.incierto ? "Volver a intentar" : "Registrar gasto"}
        </Boton>
      </PieAcciones>
      {avisoSalida.aviso}
    </Modal>
  );
}
