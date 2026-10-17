"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Pestanas, type Pestana } from "@/components/ui/Pestanas";
import { PedirAOtraSedeModal } from "@/components/PedirAOtraSedeModal";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { navegacionSinEspera } from "@/components/ui/Espera";
import { Contexto, type ContextoAnalisis, type FiltroAcaba } from "@/components/analisis/contexto";
import { ChipEstado } from "@/components/analisis/piezas";
import { HoyTodaviaNo, VistaTodaviaNo } from "@/components/analisis/TodaviaNo";
import { HojaConfianza } from "@/components/analisis/HojaConfianza";
import { FichaPrenda } from "@/components/analisis/FichaPrenda";
import { PestanaHoy } from "@/components/analisis/PestanaHoy";
import { PestanaAcaba } from "@/components/analisis/PestanaAcaba";
import { PestanaQuieta } from "@/components/analisis/PestanaQuieta";
import { PestanaPedir } from "@/components/analisis/PestanaPedir";
import { PestanaPiso } from "@/components/analisis/PestanaPiso";
import type { AccesoAnalisis, DatosAnalisis, PrendaAnalisis, VistaAnalisis } from "@/lib/analisis-tipos";
import { coincideBusqueda, GRUPOS_ACABA, GRUPOS_QUIETAS, prendasDe } from "@/lib/analisis-reglas";
import { nuncaSalio } from "@/lib/analisis-piso";
import { avisoCargaInicial, lecturaVieja, pausaDelPiso, pisoCuadradoDe, textoDatosDe, TITULO_CARGA_INICIAL } from "@/lib/analisis-al-dia";
import { lineasParaPedir } from "@/lib/analisis-acciones";
import { AVISO_QUE_FALTA, avisoDatosDeHoy, modoAnalisis, PARAM_QUE_FALTA, VALOR_QUE_FALTA } from "@/lib/analisis-aviso";
import {
  confianzaDelDato,
  contenidoDeAnalisis,
  hayCuentas,
  miTiendaSinLeer,
  notaDeFallas,
  TEXTO_TIENDA_SIN_LEER,
  tituloTiendaSinLeer,
  type ConfianzaDelDato,
} from "@/lib/analisis-con-tope";
import { Buscador } from "@/components/ui/Buscador";
import { Aviso } from "@/components/ui/Aviso";

// Análisis v4 (ADR-0357): la pantalla. Cabecera con el buscador → cinco pestañas (Hoy · Se está acabando · No se vende · Nunca salió
// al piso · Qué pedir) con el chip de confianza del dato → la pestaña. Cuando la tienda no cumple las tres condiciones del motor (ADR-0346),
// la pantalla se ve igual, con un aviso fijo arriba que dice qué falta; «Ver qué falta» lleva a «Todavía no», con el mismo aviso y
// «Ver con los datos de hoy» para volver (decisión 2, act. 2026-10-06). La ficha de cada prenda y la hoja de confianza son hojas
// del componente Modal (ADR-0136).
//
// Movimiento (ADR-0136, excepción de Análisis): al entrar a una pestaña, sus piezas suben en cascada, las barras crecen, las
// perchas y los puntos asoman y las cifras cuentan, UNA vez; con «reducir movimiento», nada se mueve.

// `corto`: la etiqueta de una pantalla angosta (a 1024 de ventana las cinco pestañas medían 742 px y el contenedor 672: «Qué pedir» quedaba fuera de
// la vista). La hoja de estilos cambia una por otra con la consulta de ancho (`.et-larga` / `.et-corta`, `analisis.css`).
const PESTANAS: { clave: VistaAnalisis; texto: string; corto?: string }[] = [
  { clave: "hoy", texto: "Hoy" },
  { clave: "acaba", texto: "Se está acabando", corto: "Se acaba" },
  { clave: "nose", texto: "No se vende" },
  { clave: "piso", texto: "Nunca salió al piso", corto: "Nunca salió" },
  { clave: "pedir", texto: "Qué pedir", corto: "Pedir" },
];

/** La etiqueta de una pestaña: la larga y, si la tiene, la corta (una de las dos se oculta según el ancho; la oculta no la lee ningún lector). */
function etiquetaDe(p: { texto: string; corto?: string }) {
  if (!p.corto) return p.texto;
  return (
    <>
      <span className="et-larga">{p.texto}</span>
      <span className="et-corta">
        {p.corto}
      </span>
    </>
  );
}

/** Las marcas de los gráficos que encienden su prenda en toda la pantalla (no las filas: esas abren la ficha). */
const MARCA = "[data-ps]:not(.c-fila):not(.rank-f):not(.modelo)";

const reducido = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function AnalisisPantalla({
  datos,
  acceso,
  vistaInicial,
  busquedaInicial = "",
  queFaltaInicial = false,
}: {
  datos: DatosAnalisis;
  acceso: AccesoAnalisis;
  vistaInicial: VistaAnalisis;
  /** Lo buscado que llega en la dirección (`?q=`, `leerBusqueda`): otra pantalla trae Análisis ya filtrado. */
  busquedaInicial?: string;
  queFaltaInicial?: boolean;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<VistaAnalisis>(vistaInicial);
  const [q, setQ] = useState(busquedaInicial);
  const [filtroAcaba, setFiltroAcaba] = useState<FiltroAcaba>("todos");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [confianza, setConfianza] = useState(false);
  const [pedido, setPedido] = useState<{ origen: { id: string; nombre: string }; lineas: ReturnType<typeof lineasParaPedir> } | null>(null);
  // Cada cambio de pestaña vuelve a montar su contenido y lo anima una vez.
  const [vuelta, setVuelta] = useState(0);
  const [animar, setAnimar] = useState(true);
  const [foco, setFoco] = useState<string | null>(null);
  // Mientras la tienda no cumple, se ve con los datos de hoy y su aviso; «Ver qué falta» cambia a «Todavía no» (Felipe, 2026-10-06).
  const [verQueFalta, setVerQueFalta] = useState(queFaltaInicial);
  const raiz = useRef<HTMLDivElement>(null);
  const modo = modoAnalisis(datos.puedeHablar, verQueFalta);
  const forzado = modo === "datos-de-hoy";
  const recomienda = modo !== "que-falta";

  // Un modelo pasa el buscador por su nombre o categoría, o por el color o la talla de cualquiera de sus prendas («camel» halla el
  // Chaleco que tiene ese color).
  const prendas = useMemo(
    () => (q.trim() ? datos.prendas.filter((m) => coincideBusqueda(m, q) || m.variantes.some((v) => coincideBusqueda(v, q))) : datos.prendas),
    [datos.prendas, q],
  );
  // Cuántos días de ventas tiene la tienda en el ERP (hasta 30), del cargador: el ritmo y «vendiste 38 en 8 días».
  const ventana = datos.diasDeVentas;

  const apagarResaltado = useCallback(() => {
    raiz.current?.classList.remove("atenuar");
    raiz.current?.querySelectorAll(".hl").forEach((n) => n.classList.remove("hl"));
    document.querySelector(".an-tip")?.classList.remove("ver");
  }, []);

  const abrirFicha = useCallback(
    (varianteId: string) => {
      apagarResaltado();
      setFichaId(varianteId);
    },
    [apagarResaltado],
  );

  const irA = useCallback((v: VistaAnalisis, opciones?: { foco?: string }) => {
    apagarResaltado();
    setFichaId(null);
    setVista(v);
    setCategoria(null);
    setVuelta((n) => n + 1);
    setAnimar(true);
    setFoco(opciones?.foco ?? null);
    const url = new URL(window.location.href);
    if (v === "hoy") url.searchParams.delete("vista");
    else url.searchParams.set("vista", v);
    window.history.replaceState(window.history.state, "", url);
    if (!opciones?.foco) raiz.current?.scrollIntoView({ block: "start", behavior: reducido() ? "auto" : "smooth" });
  }, [apagarResaltado]);

  const pedir = useCallback(
    (marcadas: readonly PrendaAnalisis[], origenId: string) => {
      const origen = datos.sedes.find((s) => s.id === origenId);
      const lineas = lineasParaPedir(marcadas, origenId);
      if (!origen || lineas.length === 0) return;
      setFichaId(null);
      setPedido({ origen: { id: origen.id, nombre: origen.nombre }, lineas });
    },
    [datos.sedes],
  );

  // `si` = con los datos de hoy; no = «Todavía no», que se ve entero en Hoy (ahí están las tres condiciones, día a día y las tiendas).
  const verConDatosDeHoy = useCallback((si: boolean) => {
    apagarResaltado();
    setConfianza(false);
    setFichaId(null);
    setVerQueFalta(!si);
    if (!si) setVista("hoy");
    setVuelta((n) => n + 1);
    setAnimar(true);
    const url = new URL(window.location.href);
    if (si) url.searchParams.delete(PARAM_QUE_FALTA);
    else {
      url.searchParams.set(PARAM_QUE_FALTA, VALOR_QUE_FALTA);
      url.searchParams.delete("vista");
    }
    window.history.replaceState(window.history.state, "", url);
    raiz.current?.scrollIntoView({ block: "start", behavior: reducido() ? "auto" : "smooth" });
  }, [apagarResaltado]);

  const contexto: ContextoAnalisis = useMemo(
    () => ({
      datos,
      acceso,
      prendas,
      diasDeVentas: ventana,
      q,
      filtroAcaba,
      setFiltroAcaba,
      categoria,
      setCategoria,
      sedeDe: (id: string) => datos.sedes.find((s) => s.id === id),
      abrirFicha,
      irA,
      pedir,
      conDatosDeHoy: forzado,
      verConDatosDeHoy,
    }),
    [datos, acceso, prendas, ventana, q, filtroAcaba, categoria, abrirFicha, irA, pedir, forzado, verConDatosDeHoy],
  );

  // La animación de entrada dura lo que dura; después, lo que cambie (un filtro, el umbral) aparece sin volver a animarse.
  useEffect(() => {
    if (!animar) return;
    const t = window.setTimeout(() => setAnimar(false), 2000);
    return () => window.clearTimeout(t);
  }, [animar, vuelta]);

  // Las cifras que cuentan de 0 a su valor, una vez por pestaña.
  useEffect(() => {
    if (reducido() || !raiz.current) return;
    const marcos: number[] = [];
    raiz.current.querySelectorAll<HTMLElement>(".vista [data-cuenta]").forEach((el) => {
      const fin = Number(el.dataset.cuenta);
      if (!Number.isFinite(fin)) return;
      const t0 = performance.now();
      const paso = (t: number) => {
        const k = Math.min(1, (t - t0) / 700);
        el.textContent = String(Math.round(fin * (1 - Math.pow(1 - k, 3))));
        if (k < 1) marcos.push(requestAnimationFrame(paso));
      };
      el.textContent = "0";
      marcos.push(requestAnimationFrame(paso));
    });
    return () => marcos.forEach(cancelAnimationFrame);
  }, [vuelta, vista]);

  // Ir a un grupo del carril desde Hoy: se deja a la vista y destella una vez.
  useEffect(() => {
    if (!foco || !raiz.current) return;
    const el = raiz.current.querySelector<HTMLElement>(`[data-grupo="${CSS.escape(foco)}"]`);
    setFoco(null);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: reducido() ? "auto" : "smooth" });
    el.classList.add("destello");
    const t = window.setTimeout(() => el.classList.remove("destello"), 1200);
    return () => window.clearTimeout(t);
  }, [foco, vuelta]);

  // Las teclas: Enter o espacio sobre algo que se toca como botón (`role="button"`) lo activa.
  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if ((e.key === "Enter" || e.key === " ") && t.matches('[role="button"][tabindex]') && !e.defaultPrevented) {
      e.preventDefault();
      t.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
  };

  // Si mi tienda no se pudo leer, sus listas vienen vacías por eso y no por falta de prendas: ninguna cuenta («—») ni pestaña dice
  // «sin ventas» o «nada se acaba» (se leería «no se vendió, no pidas»). Dice que no se pudo leer (principio 9). Las decisiones son puras y
  // están probadas en `lib/analisis-con-tope.ts`; «Todavía no» (la tienda no cumple) lleva el mismo cuidado por dentro (`textoSiVacio`).
  const sinLeer = miTiendaSinLeer(datos);
  const conCuentas = hayCuentas(recomienda, sinLeer);
  const cuentaAcaba = conCuentas ? prendasDe(datos.prendas, GRUPOS_ACABA).length : null;
  const cuentaQuietas = conCuentas ? prendasDe(datos.prendas, GRUPOS_QUIETAS).length : null;
  // Sin saber cuándo salió al piso cada prenda (la base sin 20261007120000), «—»: nunca una cuenta inventada.
  const mia = datos.preparacion.find((p) => p.ubicacionId === datos.sede.id);
  // Mientras la tienda cargue su stock o su piso no esté cuadrado, «Nunca salió al piso» espera (B4): su cuenta tampoco es un número («—»).
  const pausaPiso = pausaDelPiso(datos.cargaInicial, pisoCuadradoDe(mia));
  const cuentaPiso = conCuentas && datos.sabePiso && !pausaPiso ? datos.prendas.filter(nuncaSalio).length : null;
  const avisoCarga = avisoCargaInicial(datos.cargaInicial);
  // El aviso grande de «No se pudo leer <tu tienda>» ya dice la falla de mi tienda: la nota gris no la repite (solo si el aviso está a la vista;
  // en «Todavía no» no lo está y la nota es lo único que lo dice).
  const queSeVe = contenidoDeAnalisis({ recomienda, sinLeer, vista });
  const notaFallas = notaDeFallas(datos.fallas, sinLeer, queSeVe === "tienda-sin-leer" ? datos : undefined);

  let contenido;
  switch (queSeVe) {
    case "todavia-no-hoy":
      contenido = <HoyTodaviaNo />;
      break;
    case "todavia-no-otra":
      contenido = <VistaTodaviaNo />;
      break;
    case "tienda-sin-leer":
      contenido = (
        <Aviso tono="error" titulo={tituloTiendaSinLeer(datos.sede.nombre)} accion={<VolverAIntentar />}>
          {TEXTO_TIENDA_SIN_LEER.linea}
        </Aviso>
      );
      break;
    case "hoy":
      contenido = <PestanaHoy />;
      break;
    case "acaba":
      contenido = <PestanaAcaba />;
      break;
    case "nose":
      contenido = <PestanaQuieta />;
      break;
    case "piso":
      contenido = <PestanaPiso />;
      break;
    case "pedir":
      contenido = <PestanaPedir />;
      break;
  }

  return (
    <Contexto.Provider value={contexto}>
      <div ref={raiz} className="analisis" onKeyDown={alTeclear}>
        <EncabezadoPagina
          sede={datos.sede.nombre}
          titulo="Análisis"
          subtitulo="Qué se acaba, qué no se mueve, qué nunca salió al piso y qué pedir."
          detalle={<HoraDeLectura leidoEn={datos.leidoEn} />}
        >
          {/* Filtra las prendas ya leídas, en el navegador: nunca dice «Buscando…» (ADR-0358, ronda 5). */}
          {/* Con la tienda sin leer no hay prendas que buscar: la caja se apaga (segundo pase visual, 2026-10-17: invitaba a buscar algo que no iba a encontrar). */}
          <Buscador
            guia="analisis.buscador"
            valor={q}
            onCambio={setQ}
            placeholder="Busca una prenda"
            etiqueta="Busca una prenda"
            className="w-60 max-w-full"
            disabled={sinLeer}
            title={sinLeer ? "Las prendas de tu tienda no cargaron: todavía no hay qué buscar" : undefined}
          />
        </EncabezadoPagina>

        <FilaPestanas
          vista={vista}
          irA={irA}
          cuentaAcaba={cuentaAcaba}
          cuentaQuietas={cuentaQuietas}
          cuentaPiso={cuentaPiso}
          confianza={confianzaDelDato(datos.puedeHablar, sinLeer)}
          onConfianza={() => setConfianza(true)}
        />

        {/* El aviso fijo mientras la tienda no cumple: con los datos de hoy dice qué falta; en «Todavía no», cómo volver. */}
        {modo !== "confiable" && (
          <Aviso guia="analisis.aviso"
            tono="atencion"
            titulo="Datos incompletos"
            className="mt-3.5"
            accion={
              <button type="button" className="btn-cayla btn-sutil btn-s" onClick={() => verConDatosDeHoy(modo === "que-falta")}>
                {modo === "datos-de-hoy" ? "Ver qué falta" : "Ver con los datos de hoy"}
              </button>
            }
          >
            {modo === "datos-de-hoy" ? avisoDatosDeHoy(mia) : AVISO_QUE_FALTA}
            {/* La carga inicial se junta con este aviso en vez de abrir otro (B4): no hay un quinto aviso grande. */}
            {avisoCarga && ` ${avisoCarga}`}
          </Aviso>
        )}
        {modo === "confiable" && avisoCarga && (
          <Aviso guia="analisis.carga" tono="atencion" titulo={TITULO_CARGA_INICIAL} className="mt-3.5">
            {avisoCarga}
          </Aviso>
        )}

        {notaFallas && (
          <p className="nota-cayla mt-4" role="status">
            {notaFallas}
          </p>
        )}

        <div key={`${vista}-${vuelta}`} className={`vista ${animar ? "anim" : ""}`} data-guia="analisis.vista" role="tabpanel" aria-label={PESTANAS.find((p) => p.clave === vista)?.texto}>
          {contenido}
        </div>
      </div>

      <TipDeLaPantalla raiz={raiz} />

      {fichaId && <FichaPrenda varianteId={fichaId} onCerrar={() => setFichaId(null)} />}
      {confianza && <HojaConfianza onCerrar={() => setConfianza(false)} />}
      {pedido && (
        <PedirAOtraSedeModal
          abierto
          ubicacionId={datos.sede.id}
          origen={pedido.origen}
          lineas={pedido.lineas}
          onCerrar={() => setPedido(null)}
          onPedido={() => {
            setPedido(null);
            avisar.exito(`Se lo pediste a ${pedido.origen.nombre}`);
            router.refresh();
          }}
        />
      )}
    </Contexto.Provider>
  );
}

/**
 * «Datos de las 09:20» junto a la fecha de la cabecera y, pasados 30 minutos, «Actualizar»: relee la pantalla SIN el loader a pantalla completa
 * (`navegacionSinEspera`, ADR-0149: es una lectura, y lo que se está mirando no desaparece). La hora de ahora se toma en el navegador, después
 * de montar y cada minuto: el servidor no sabe cuánto va a tardar la persona en volver a mirar.
 */
function HoraDeLectura({ leidoEn }: { leidoEn: string }) {
  const router = useRouter();
  const [leyendo, empezar] = useTransition();
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    const primero = window.setTimeout(() => setAhora(Date.now()), 0);
    const t = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => {
      window.clearTimeout(primero);
      window.clearInterval(t);
    };
  }, [leidoEn]);
  const texto = textoDatosDe(leidoEn);
  if (!texto) return null;
  return (
    <>
      <span data-guia="analisis.lectura">{texto}</span>
      {ahora !== null && lecturaVieja(leidoEn, ahora) && (
        <>
          {" · "}
          <button
            type="button"
            className="btn-cayla btn-enlace"
            disabled={leyendo}
            aria-busy={leyendo || undefined}
            onClick={() =>
              empezar(() => {
                navegacionSinEspera(window.location.href);
                router.refresh();
              })
            }
          >
            {leyendo ? "Leyendo…" : "Actualizar"}
          </button>
        </>
      )}
    </>
  );
}

/**
 * «Volver a intentar» (la tienda no se pudo leer): vuelve a leer la pantalla con `router.refresh()`, sin el loader a pantalla completa
 * (`navegacionSinEspera`, ADR-0149): es una LECTURA, no un guardado, y el aviso queda a la vista mientras se lee. La señal de que algo pasa
 * es el propio botón («Leyendo…» con su hilo), que no se puede apretar dos veces. Si vuelve a fallar, el aviso sigue ahí.
 */
function VolverAIntentar() {
  const router = useRouter();
  const [leyendo, empezar] = useTransition();
  return (
    <Boton
      type="button"
      peso="fantasma"
      cargando={leyendo}
      textoCargando="Leyendo…"
      onClick={() =>
        empezar(() => {
          navegacionSinEspera(window.location.href);
          router.refresh();
        })
      }
    >
      {TEXTO_TIENDA_SIN_LEER.accion}
    </Boton>
  );
}

// Las cinco preguntas son pestañas de vista (cambian de sección): la pieza única del ERP, el vidrio en mayúsculas (ADR-0358,
// Felipe 2026-10-06: «incluye lo de Análisis»). La vista es estado de la pantalla, no URL: `tablist` con flechas.
function FilaPestanas({
  vista,
  irA,
  cuentaAcaba,
  cuentaQuietas,
  cuentaPiso,
  confianza,
  onConfianza,
}: {
  vista: VistaAnalisis;
  irA: (v: VistaAnalisis) => void;
  cuentaAcaba: number | null;
  cuentaQuietas: number | null;
  cuentaPiso: number | null;
  confianza: ConfianzaDelDato;
  onConfianza: () => void;
}) {
  const items: Pestana[] = PESTANAS.map((p) => {
    // «Se está acabando» con prendas avisa (rojo, como antes); «No se vende» solo informa. Sin datos, «—».
    // El texto para lector va solo con un número: «— se están acabando» no dice nada.
    const guia = `analisis.pestana-${p.clave}`;
    if (p.clave === "acaba") return { clave: p.clave, guia, etiqueta: etiquetaDe(p), conteo: cuentaAcaba ?? "—", pide: cuentaAcaba == null ? undefined : "se están acabando", tono: cuentaAcaba ? "rojo" : "neutro" };
    if (p.clave === "nose") return { clave: p.clave, guia, etiqueta: etiquetaDe(p), conteo: cuentaQuietas ?? "—", pide: cuentaQuietas == null ? undefined : "no se venden", tono: "neutro" };
    if (p.clave === "piso") return { clave: p.clave, guia, etiqueta: etiquetaDe(p), conteo: cuentaPiso ?? "—", pide: cuentaPiso == null ? undefined : "nunca salieron al piso", tono: "neutro" };
    return { clave: p.clave, guia, etiqueta: etiquetaDe(p) };
  });

  return (
    <div className="tabs-fila">
      <Pestanas items={items} activa={vista} guia="analisis.pestanas" etiquetaAccesible="Preguntas de Análisis" onCambio={(c) => irA(c as VistaAnalisis)} idIndicador="analisis" />
      {confianza === "confiable" ? (
        <ChipEstado est="bien" guia="analisis.confianza" onClick={onConfianza} tip="14 días cobrando con la prenda · piso cuadrado · almacén contado">
          Datos confiables
        </ChipEstado>
      ) : confianza === "sin-leer" ? (
        <ChipEstado est="nd" guia="analisis.confianza" onClick={onConfianza} tip="No cargaron las prendas de tu tienda: no decidas con esta pantalla">
          Sin leer
        </ChipEstado>
      ) : (
        <ChipEstado est="nd" guia="analisis.confianza" onClick={onConfianza} tip="Todavía no se cumplen las 3 condiciones para recomendar">
          Datos incompletos
        </ChipEstado>
      )}
    </div>
  );
}

const sinSuscripcion = () => () => {};

/**
 * El tooltip de la pantalla (uno solo, como en la maqueta): sale al pasar el mouse, al enfocar con el teclado y al tocar un «?»
 * (nunca solo con el mouse: ADR-0350, ley 6). Lee `data-tip` (texto) o el `TipRico` oculto de adentro (una lista de prendas).
 * Pasar por una marca de un gráfico enciende la misma prenda en toda la pantalla y apaga el resto (`data-ps`).
 */
function TipDeLaPantalla({ raiz }: { raiz: RefObject<HTMLDivElement | null> }) {
  const tip = useRef<HTMLDivElement>(null);
  // En el servidor (y al hidratar) no hay `document`: el tooltip se monta recién en el navegador.
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);

  useEffect(() => {
    const r = raiz.current;
    const t = tip.current;
    if (!r || !t || !montado) return;
    const conTip = (el: EventTarget | null) => (el instanceof Element ? el.closest<HTMLElement>("[data-tip],:has(> .tip-rico)") : null);
    const ver = (el: HTMLElement) => {
      const rico = el.querySelector<HTMLElement>(":scope > .tip-rico");
      if (rico) t.innerHTML = rico.innerHTML;
      else if (el.dataset.tip) t.textContent = el.dataset.tip;
      else return;
      t.classList.add("ver");
      const b = el.getBoundingClientRect();
      const w = t.offsetWidth;
      const h = t.offsetHeight;
      const x = Math.max(8, Math.min(b.left + b.width / 2 - w / 2, window.innerWidth - w - 8));
      let y = b.top - h - 8;
      if (y < 8) y = b.bottom + 8;
      t.style.left = `${x}px`;
      t.style.top = `${y}px`;
    };
    const ocultar = () => t.classList.remove("ver");
    const resaltar = (el: HTMLElement) => {
      const ids = (el.dataset.ps ?? "").split(" ").filter(Boolean);
      if (ids.length === 0) return;
      r.classList.add("atenuar");
      r.querySelectorAll<HTMLElement>("[data-ps]").forEach((n) => n.classList.toggle("hl", (n.dataset.ps ?? "").split(" ").some((m) => ids.includes(m))));
    };
    const apagar = () => {
      r.classList.remove("atenuar");
      r.querySelectorAll(".hl").forEach((n) => n.classList.remove("hl"));
    };
    const sobre = (e: Event) => {
      const el = conTip(e.target);
      if (el && r.contains(el)) ver(el);
      const m = e.target instanceof Element ? e.target.closest<HTMLElement>(MARCA) : null;
      if (m && r.contains(m)) resaltar(m);
    };
    const fuera = (e: Event) => {
      if (conTip(e.target)) ocultar();
      if (e.target instanceof Element && e.target.closest(MARCA)) apagar();
    };
    // Tocar un «?» lo muestra (en una pantalla táctil no hay «pasar el mouse»).
    const toque = (e: Event) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>(".ayuda") : null;
      if (el && r.contains(el)) ver(el);
    };
    r.addEventListener("mouseover", sobre);
    r.addEventListener("mouseout", fuera);
    r.addEventListener("focusin", sobre);
    const salir = () => {
      ocultar();
      apagar();
    };
    r.addEventListener("focusout", salir);
    r.addEventListener("click", toque);
    window.addEventListener("scroll", ocultar, { passive: true });
    return () => {
      r.removeEventListener("mouseover", sobre);
      r.removeEventListener("mouseout", fuera);
      r.removeEventListener("focusin", sobre);
      r.removeEventListener("focusout", salir);
      r.removeEventListener("click", toque);
      window.removeEventListener("scroll", ocultar);
    };
  }, [raiz, montado]);

  if (!montado) return null;
  return createPortal(<div ref={tip} className="an-tip" role="tooltip" />, document.body);
}
