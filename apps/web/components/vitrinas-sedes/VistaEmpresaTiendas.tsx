"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Pencil, Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { Ayuda } from "@/components/Ayuda";
import { BarraAvance, type TonoBarraAvance } from "@/components/ui/BarraAvance";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { Interruptor } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";
import { ComboResponsable } from "@/components/ComboResponsable";
import { MarcoCasilla, useGuardarCasilla, useVistoGuardado, type Guardar } from "@/components/ConfiguracionCasilla";
import { CierreCargaInicialModal } from "@/components/ConfiguracionCargaInicial";
import { AroSede, Instrumento, SelloEmpresa } from "@/components/vitrinas-sedes/Instrumentos";
import { useLuzDelMouse } from "@/components/vitrinas-sedes/useLuzDelMouse";
import { TOPE_MENSUAL_USD } from "@/lib/asistente/respuesta";
import { gastoDelMes } from "@/lib/asistente/sedes";
import { cambioLaCasilla, VISTO_MS } from "@/lib/configuracion-casilla";
import { validarTienda } from "@/lib/configuracion-reglas";
import type { DatosEmpresa } from "@/lib/configuracion-reglas";
import { ajustarCelular, celularValido } from "@/lib/club-reglas";
import type { LecturaCargaInicial, SedeCargaInicial } from "@/lib/carga-inicial-reglas";
import { solesRedondo } from "@/lib/gastos-reglas";
import { semanaConFondo } from "@/lib/metas-frescas-reglas";
import { NO_SE_PUDO_LEER, tiendaFresca } from "@/lib/metas-frescas";
import { camposDe, falta, fraseDeLaSede, hora12, llenadoTubo, NOMBRE_CAMPO, puedeCambiarCarga, valorDe, type CampoSede, type VitrinaSede } from "@/lib/vitrinas-sedes-reglas";

// Configuración ▸ Empresa y tiendas, «Las vitrinas» (Felipe 2026-11-04, docs/maquetas/empresa-tiendas-vitrinas-2026-11/): el carnet de la empresa y una tarjeta por sede. Antes
// eran cuatro tablas con las mismas filas. Cada dato se cambia ahí mismo y se guarda solo al salir de él, firmado con el responsable; la carga inicial abre su hoja, porque
// cerrar una sede no debe pasar por un Tab de más (ADR-0328). Las funciones de la base y sus permisos son los de siempre: aquí solo cambia cómo se ve.

type Carga = { esLider: boolean; esAdmin: boolean; puedeHorario: boolean };

const conVar = (x: Record<string, string | number>) => x as CSSProperties;

/** Cambiar un dato escrito: valida con las reglas de siempre, guarda con su función y dice cómo queda la vitrina. `null`: no se guardó. */
async function guardarDato(campo: "whatsapp" | "fondo", v: VitrinaSede, t: string, guardar: Guardar): Promise<VitrinaSede | null> {
  const tienda = v.tienda;
  if (!tienda) return null;
  if (campo === "whatsapp") {
    if (t !== "" && !celularValido(t)) {
      avisar.error(`WhatsApp de ${v.corto}: tiene 9 dígitos y empieza en 9. Si la tienda no tiene uno, déjalo vacío.`);
      return null;
    }
    const ok = await guardar(
      () => createClient().rpc("guardar_whatsapp_tienda", { p_ubicacion_id: v.id, p_numero: t || undefined }),
      "guardar el WhatsApp de la tienda",
      t ? `${v.corto}: WhatsApp guardado. Su QR del club ya se puede imprimir.` : `${v.corto}: sin WhatsApp. No muestra QR del club.`,
    );
    return ok ? { ...v, tienda: { ...tienda, whatsappNumero: t || null } } : null;
  }
  // `guardar_metas_tienda` reemplaza la semana y el fondo: se manda lo último de la base con solo el fondo cambiado, para no pisar lo de otra pestaña.
  const fresca = await tiendaFresca(v.id);
  if (!fresca) {
    avisar.error(NO_SE_PUDO_LEER);
    return null;
  }
  const r = validarTienda(semanaConFondo(fresca, t));
  if (!r.ok) {
    avisar.error(`${v.corto}: ${r.error}`);
    return null;
  }
  const ok = await guardar(
    () => createClient().rpc("guardar_metas_tienda" as never, { p_ubicacion_id: v.id, p_metas: r.valor.metas, p_fondo: r.valor.fondo } as never),
    "guardar el fondo de caja",
    `Fondo de caja de ${v.corto}: ${r.valor.fondo === null ? "sin fondo" : solesRedondo(r.valor.fondo)}.`,
  );
  return ok ? { ...v, tienda: { ...tienda, fondo: r.valor.fondo } } : null;
}

/** El dato mientras se escribe: el pozo con su hilo, dentro de la misma placa. */
function EditarDato({ vitrina, campo, guardar, alTerminar }: { vitrina: VitrinaSede; campo: "whatsapp" | "fondo"; guardar: Guardar; alTerminar: (nueva: VitrinaSede | null) => void }) {
  const t0 = vitrina.tienda;
  const inicial = campo === "whatsapp" ? (t0?.whatsappNumero ?? "") : t0?.fondo === null || t0?.fondo === undefined ? "" : String(t0.fondo);
  const [t, setT] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const cancelado = useRef(false);
  const visto = useVistoGuardado();
  useEffect(() => {
    entrada.current?.focus();
    entrada.current?.select();
  }, [campo]);

  async function salir() {
    if (cancelado.current || !cambioLaCasilla(t, inicial)) return alTerminar(null);
    setOcupado(true);
    alTerminar(await guardarDato(campo, vitrina, t.trim(), guardar));
  }

  return (
    <MarcoCasilla vez={visto.vez}>
      <input
        ref={entrada}
        aria-label={`${NOMBRE_CAMPO[campo]} de ${vitrina.corto}`}
        type="text"
        inputMode={campo === "whatsapp" ? "tel" : campo === "fondo" ? "decimal" : undefined}
        value={t}
        disabled={ocupado}
        onChange={(e) => setT(campo === "whatsapp" ? ajustarCelular(e.target.value) : e.target.value)}
        onBlur={salir}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            cancelado.current = true;
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="fin-control fin-num vs-entrada"
      />
    </MarcoCasilla>
  );
}

function Dato({ vitrina, campo, i, guardar, carga, guia, alAbrirCarga }: { vitrina: VitrinaSede; campo: CampoSede; i: number; guardar: Guardar; carga: Carga; guia?: string; alAbrirCarga: () => void }) {
  const router = useRouter();
  const [escribiendo, setEscribiendo] = useState(false);
  const [recien, setRecien] = useState(0);
  // Lo que acaba de guardarse se ve de inmediato, mientras la página vuelve a leer la base; cuando llega, manda la base.
  const [sobre, setSobre] = useState<VitrinaSede | null>(null);
  const [antes, setAntes] = useState(vitrina);
  if (vitrina !== antes) {
    setAntes(vitrina);
    setSobre(null);
  }
  const [pedido, setPedido] = useState(false);
  const [tocado, setTocado] = useState(false);
  useEffect(() => {
    if (!recien) return;
    const t = window.setTimeout(() => setRecien(0), VISTO_MS);
    return () => window.clearTimeout(t);
  }, [recien]);

  const v = sobre ?? vitrina;
  const clase = `vs-dato ${falta(v, campo) ? "falta" : ""} ${campo === "preguntar" && !v.preguntar ? "apagado" : ""} ${recien ? "recien" : ""} ${tocado ? "sin-entrada" : ""}`;
  const estilo = conVar({ "--i": i });
  const visto = recien > 0 && (
    <span key={recien} className="vs-visto" aria-hidden>
      <svg viewBox="0 0 24 24">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
  // Lo que se toca se nota (prueba ciega, 2026-11-04: «no sé si se puede cambiar»): lo que falta dice «Poner»; lo demás lleva su lápiz.
  const accion = falta(v, campo) ? (
    <span className="vs-accion poner" aria-hidden>
      Poner
    </span>
  ) : (
    <span className="vs-accion" aria-hidden>
      <Pencil className="h-4 w-4" /* unificar-fijo: el dato entero es el botón: un <LapizEditar> adentro sería un botón dentro de otro */ />
    </span>
  );
  const textos = (cuerpo: React.ReactNode) => (
    <span className="vs-textos">
      <span className="vs-rotulo">{NOMBRE_CAMPO[campo]}</span>
      {cuerpo}
    </span>
  );

  if (campo === "preguntar") {
    async function cambiar(encendido: boolean) {
      setPedido(true);
      const ok = await guardar(
        () => createClient().rpc("guardar_asistente_sede" as never, { p_ubicacion_id: v.id, p_encendido: encendido } as never),
        `${encendido ? "encender" : "apagar"} el asistente de ${v.corto}`,
        encendido ? `${v.corto}: ya puede preguntarle a CAYLA. «Preguntar» sale en su cabecera.` : `${v.corto}: asistente apagado. Lo que ya preguntaron queda anotado.`,
      );
      setPedido(false);
      if (ok) {
        setSobre({ ...v, preguntar: encendido });
        setRecien((x) => x + 1);
      }
    }
    return (
      <div className={clase} style={estilo} data-guia={guia}>
        <Instrumento vitrina={v} campo={campo} />
        {textos(<span className="vs-valor">{valorDe(v, campo)}</span>)}
        <Interruptor activo={!!v.preguntar} disabled={pedido} onActivo={cambiar} etiqueta={<span className="sr-only">Asistente en {v.corto}</span>} />
        {visto}
      </div>
    );
  }

  if (campo === "carga") {
    const e = v.carga?.estado;
    const puede = !!e && puedeCambiarCarga(e, carga.esLider, carga.esAdmin);
    return (
      <button
        type="button"
        className={clase}
        style={estilo}
        disabled={!puede}
        data-guia={guia}
        title={!carga.esLider ? "La fecha de cierre la fija un líder." : !puede ? "Reabrir una sede cerrada lo hace un Admin." : undefined}
        aria-label={`${NOMBRE_CAMPO[campo]} de ${v.corto}: ${valorDe(v, campo)}`}
        onClick={alAbrirCarga}
      >
        <Instrumento vitrina={v} campo={campo} />
        {textos(<span className="vs-valor">{valorDe(v, campo)}</span>)}
        {puede && accion}
      </button>
    );
  }

  // La hora de cierre NO se escribe aquí: sale del horario por días de Tienda web ▸ Conf. Tienda (una sola fuente, ADR-0642). Aquí se lee el cierre
  // de hoy y, a quien ve ese módulo, el dato lo lleva a cambiarlo.
  if (campo === "cierre") {
    const cuerpo = (
      <>
        <Instrumento vitrina={v} campo={campo} />
        {textos(<span className="vs-valor">{valorDe(v, campo)}</span>)}
        {carga.puedeHorario && accion}
      </>
    );
    return carga.puedeHorario ? (
      <button type="button" className={clase} style={estilo} data-guia={guia} aria-label={`Hora de cierre de ${v.corto}: ${valorDe(v, campo)}. Cambiar en Tienda web, Conf. Tienda`} onClick={() => router.push("/tienda-web/ajustes")}>
        {cuerpo}
      </button>
    ) : (
      <div className={clase} style={estilo} data-guia={guia} title="El horario de la tienda se cambia en Tienda web ▸ Conf. Tienda.">
        {cuerpo}
      </div>
    );
  }

  if (escribiendo) {
    return (
      <div className={`${clase} edita`} style={estilo} data-guia={guia}>
        <Instrumento vitrina={v} campo={campo} />
        {textos(
          <EditarDato
            vitrina={v}
            campo={campo}
            guardar={guardar}
            alTerminar={(nueva) => {
              setEscribiendo(false);
              if (nueva) {
                setSobre(nueva);
                setRecien((x) => x + 1);
              }
            }}
          />,
        )}
      </div>
    );
  }

  // El fondo cuenta desde 0 al entrar y hasta su valor nuevo al guardarse (la pieza de siempre).
  const fondo = v.tienda?.fondo;
  const valor =
    campo === "fondo" && fondo !== null && fondo !== undefined ? (
      <>
        S/{"\u00a0"}
        <CifraQueCuenta valor={Math.round(fondo)} alMontar={!tocado} />
      </>
    ) : (
      valorDe(v, campo)
    );

  return (
    <button type="button" className={clase} style={estilo} data-guia={guia} aria-label={`${NOMBRE_CAMPO[campo]} de ${v.corto}: ${valorDe(v, campo)}. Cambiar`} onClick={() => {
        setTocado(true);
        setEscribiendo(true);
      }}>
      <Instrumento vitrina={v} campo={campo} />
      {textos(<span className="vs-valor">{valor}</span>)}
      {accion}
      {visto}
    </button>
  );
}

function Vitrina({ vitrina, e, guardar, carga, guias, alAbrirCarga }: { vitrina: VitrinaSede; e: number; guardar: Guardar; carga: Carga; guias: Partial<Record<CampoSede, string>>; alAbrirCarga: (id: string) => void }) {
  const frase = fraseDeLaSede(vitrina);
  return (
    <article className="vs-vitrina vs-liquido" data-color={vitrina.color} data-luz style={conVar({ "--e": e })}>
      <header>
        <div className="min-w-0">
          <h2 className="vs-nombre">
            <span>{vitrina.corto}</span>
          </h2>
          {vitrina.direccion && (
            <p className="vs-direccion">
              <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" />
              {vitrina.direccion}
            </p>
          )}
          {vitrina.series.length > 0 && (
            <p className="vs-series" aria-label={`Series: ${vitrina.series.join(", ")}`}>
              {vitrina.series.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </p>
          )}
        </div>
        <AroSede vitrina={vitrina} />
      </header>
      {frase && <p className={`vs-frase ${frase === "Todo listo" ? "listo" : ""}`}>{frase}</p>}
      <div className="vs-datos">
        {camposDe(vitrina).map((c, i) => (
          <Dato key={c} vitrina={vitrina} campo={c} i={e + i} guardar={guardar} carga={carga} guia={guias[c]} alAbrirCarga={() => alAbrirCarga(vitrina.id)} />
        ))}
      </div>
    </article>
  );
}

function Carnet({ datos }: { datos: DatosEmpresa }) {
  const ruc = datos.ruc ?? "";
  return (
    <section className="vs-carnet vs-liquido" aria-label="Datos de la empresa" data-luz data-guia="config.empresa-datos">
      <i className="vs-puntos" aria-hidden />
      <i className="vs-barrido" aria-hidden />
      <div className="min-w-0">
        <b className="vs-marca">{datos.nombreComercial ?? "—"}</b>
        <span className="vs-rotulo">{datos.razonSocial ?? "Sin razón social"}</span>
      </div>
      <div>
        <span className="vs-rotulo">RUC</span>
        {ruc ? (
          <span className="vs-ruc" aria-label={ruc}>
            {ruc.split("").map((d, k) => (
              <span key={k} className="vs-digito" aria-hidden style={conVar({ "--d": d, "--k": k })}>
                <span>
                  {"0123456789".split("").map((x) => (
                    <i key={x}>{x}</i>
                  ))}
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span className="vs-ruc">—</span>
        )}
      </div>
      <div className="min-w-0">
        <span className="vs-rotulo">Correo</span>
        <b className="vs-dato-e">{datos.email ?? "—"}</b>
      </div>
      <div>
        <span className="vs-rotulo">Teléfono</span>
        <b className="vs-dato-e">{datos.telefono ?? "—"}</b>
      </div>
      <div className="vs-sello">
        <SelloEmpresa />
        <span className="vs-rotulo">Solo se lee</span>
        <Ayuda titulo="Solo se lee">Salen en boletas y facturas. Se corrigen con el contador y el proveedor de facturación: un RUC o una serie mal escritos hacen que SUNAT rechace cada comprobante.</Ayuda>
      </div>
    </section>
  );
}

/** Dónde explica la guía interactiva cada dato: en la primera sede que lo tenga. */
function anclasDeLaGuia(vitrinas: readonly VitrinaSede[]): Map<string, Partial<Record<CampoSede, string>>> {
  const ANCLA: Record<CampoSede, { guia: string }> = {
    whatsapp: { guia: "config.tiendas-whatsapp" },
    cierre: { guia: "config.tiendas-cierre" },
    fondo: { guia: "config.tiendas-fondo" },
    preguntar: { guia: "config.tiendas-asistente" },
    carga: { guia: "config.carga-inicial" },
  };
  const r = new Map<string, Partial<Record<CampoSede, string>>>();
  const usados = new Set<CampoSede>();
  for (const v of vitrinas) {
    const m: Partial<Record<CampoSede, string>> = {};
    for (const c of camposDe(v)) {
      if (!usados.has(c)) {
        usados.add(c);
        m[c] = ANCLA[c].guia;
      }
    }
    r.set(v.id, m);
  }
  return r;
}

export function VistaEmpresaTiendas({
  datos,
  vitrinas,
  gastado,
  carga,
  esLider,
  esAdmin,
  puedeHorario,
}: {
  datos: DatosEmpresa;
  vitrinas: VitrinaSede[];
  gastado: number | null;
  carga: LecturaCargaInicial | null;
  esLider: boolean;
  esAdmin: boolean;
  /** ¿Ve el módulo «Datos y plazos de la tienda web»? Con él, la hora de cierre lleva a Tienda web ▸ Conf. Tienda. */
  puedeHorario: boolean;
}) {
  const { responsable, guardando, guardar } = useGuardarCasilla();
  const raiz = useRef<HTMLDivElement>(null);
  useLuzDelMouse(raiz);
  const [hoja, setHoja] = useState<SedeCargaInicial | null>(null);
  const gasto = gastoDelMes(gastado, TOPE_MENSUAL_USD);
  const lleno = llenadoTubo(gastado, TOPE_MENSUAL_USD);
  const conPreguntar = vitrinas.some((v) => v.preguntar !== null);
  const anclas = anclasDeLaGuia(vitrinas);
  const contexto: Carga = { esLider, esAdmin, puedeHorario };
  const tono: TonoBarraAvance = gasto?.tono === "rojo" ? "rojo" : gasto?.tono === "ambar" ? "ambar" : "tinta";

  return (
    <div className="vs-raiz" ref={raiz}>
      <div className="vs-firma">
        <ComboResponsable control={responsable} deshabilitado={guardando} />
      </div>

      <Carnet datos={datos} />

      {vitrinas.length === 0 ? (
        <Vacio tamano="chico" icono={<Settings2 />}>
          Todavía no hay sedes activas.
        </Vacio>
      ) : (
        <div className="vs-vitrinas" data-guia="config.empresa-tiendas">
          {vitrinas.map((v, e) => (
            <Vitrina
              key={v.id}
              vitrina={v}
              e={e}
              guardar={guardar}
              carga={contexto}
              guias={anclas.get(v.id) ?? {}}
              alAbrirCarga={(id) => setHoja(carga?.sedes.find((s) => s.ubicacionId === id) ?? null)}
            />
          ))}
        </div>
      )}

      {conPreguntar && gasto && lleno !== null && (
        <section className="vs-tubo vs-liquido" aria-label="Lo gastado por el asistente este mes" data-luz>
          <b className="vs-tubo-nombre">Asistente CAYLA</b>
          <BarraAvance pct={lleno * 100} alto="gruesa" tono={tono} etiqueta="Lo gastado por el asistente este mes" texto={gasto.texto} className="vs-tubo-barra" />
          <span className="vs-rotulo">{gasto.texto}</span>
        </section>
      )}

      {hoja && carga && <CierreCargaInicialModal sede={hoja} hoy={carga.hoy} esLider={esLider} esAdmin={esAdmin} onClose={() => setHoja(null)} />}
    </div>
  );
}
