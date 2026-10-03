"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  EVENTO_CERRAR_CAJA,
  bajadaTarjeta,
  estadoRecordatorio,
  hora12,
  horaLima12,
  lineaDelDia,
  mismosDatos,
  nombreCorto,
  progreso,
  rotuloPildora,
  textoCorto,
  tituloTarjeta,
  type CifrasRecordatorio,
  type DatosRecordatorioCierre,
  type NivelRecordatorio,
} from "@/lib/recordatorio-cierre-reglas";

// La «Isla»: el recordatorio de cierre de caja (ADR-0305; maqueta 2 de `docs/maquetas/recordatorio-cierre-caja-2026-10/`).
// Montada UNA vez en el layout de la app: acompaña a quien puede cerrar la caja por todas las pantallas desde la hora de cierre
// de su tienda (`ubicaciones.hora_cierre`) hasta que la caja se cierra. No tiene ✕: se pliega, pero solo se va al cerrar.
//
// Cómo se mueve (ADR-0136): nace como un punto, se estira a píldora y la primera vez se abre en tarjeta; se pliega sola a los 5 s.
// Su anillo es un DATO (lo que pasó desde la hora, lleno a los 60 min); al subir de nivel cambia de color y lanza UNA onda; al
// cerrar la caja se pone verde, dibuja su ✓ y se encoge. El único bucle es el punto que late en «sin cerrar», la misma señal que
// el chip «Vencida». Con `prefers-reduced-motion` todo pasa en un instante (`recordatorio-cierre.css`).

const TICK_MS = 15_000;
const SONDEO_ACTIVO_MS = 60_000;
const SONDEO_QUIETO_MS = 5 * 60_000;
const PLEGAR_MS = 5_000;
const CIRCUNFERENCIA = 2 * Math.PI * 15;

type Fase = "oculta" | "naciendo" | "viva" | "cerrada" | "saliendo";

const soles = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reducido = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const espera = (ms: number) => (reducido() ? 0 : ms);

export function RecordatorioCierreCaja({ inicial }: { inicial: DatosRecordatorioCierre | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [datos, setDatos] = useState<DatosRecordatorioCierre | null>(inicial);
  const [ahora, setAhora] = useState<Date | null>(null);
  const [fase, setFase] = useState<Fase>("oculta");
  const [abierta, setAbierta] = useState(false);
  const [cifras, setCifras] = useState<CifrasRecordatorio | null>(null);
  const [ola, setOla] = useState<{ n: number; w: number; h: number } | null>(null);
  // Lo último que se mostró: la despedida necesita la sede y el nivel aunque `datos` ya diga «sin caja».
  const [despedida, setDespedida] = useState<{ datos: DatosRecordatorioCierre; nivel: NivelRecordatorio } | null>(null);
  const [apuntar, setApuntar] = useState(false);

  const islaRef = useRef<HTMLDivElement>(null);
  const pildoraRef = useRef<HTMLButtonElement>(null);
  const tarjetaRef = useRef<HTMLDivElement>(null);
  const encima = useRef(false);
  const plegarT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const visto = useRef<{ datos: DatosRecordatorioCierre; nivel: NivelRecordatorio } | null>(null);

  // Lo que trae el layout manda cuando cambia (al cerrar desde aquí, `router.refresh()` lo trae sin caja).
  const [inicialPrevio, setInicialPrevio] = useState(inicial);
  if (!mismosDatos(inicial, inicialPrevio)) {
    setInicialPrevio(inicial);
    setDatos(inicial);
  }

  // El reloj: cada 15 s alcanza para que «12 min» cambie a tiempo sin despertar a nadie.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la hora del navegador solo se lee ya montado: leerla al pintar en el servidor rompería la hidratación (misma decisión que la espera de Vender).
    setAhora(new Date());
    const id = setInterval(() => setAhora(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const caja = datos?.caja ?? null;
  const estado = ahora && caja && datos?.horaCierre ? estadoRecordatorio({ ahora, abiertaEn: caja.abiertaEn, horaCierre: datos.horaCierre }) : { nivel: 0 as NivelRecordatorio, minutos: 0 };
  const activo = estado.nivel >= 1;
  useEffect(() => {
    if (activo && datos) visto.current = { datos, nivel: estado.nivel };
  });

  const programar = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, espera(ms)));
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const pedir = useCallback(async (conCifras: boolean) => {
    try {
      const res = await fetch(`/api/caja/recordatorio${conCifras ? "?cifras=1" : ""}`, { cache: "no-store", headers: { "x-espera": "no" } });
      if (!res.ok) return; // la base no respondió: se queda lo último que se sabía
      const cuerpo = (await res.json()) as { datos: DatosRecordatorioCierre | null; cifras: CifrasRecordatorio | null };
      setDatos((d) => (mismosDatos(d, cuerpo.datos) ? d : cuerpo.datos));
      if (cuerpo.cifras) setCifras(cuerpo.cifras);
    } catch {
      // Sin red: igual que arriba.
    }
  }, []);

  // El sondeo: cada minuto mientras está a la vista (si cierran desde otra terminal, aquí también se despide); cada 5 min si no
  // (si abren la caja desde otra terminal, aquí se entera antes de la hora). También al volver a la pestaña.
  useEffect(() => {
    const id = setInterval(() => pedir(false), activo ? SONDEO_ACTIVO_MS : SONDEO_QUIETO_MS);
    const alVolver = () => document.visibilityState === "visible" && pedir(false);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [activo, pedir]);

  const plegar = useCallback(() => {
    if (plegarT.current) clearTimeout(plegarT.current);
    plegarT.current = null;
    setAbierta(false);
  }, []);

  const abrir = useCallback(
    (sola: boolean) => {
      setAbierta(true);
      pedir(true);
      if (plegarT.current) clearTimeout(plegarT.current);
      plegarT.current = null;
      if (sola) {
        const intentar = () => {
          if (encima.current) plegarT.current = setTimeout(intentar, 1500);
          else plegar();
        };
        plegarT.current = setTimeout(intentar, PLEGAR_MS);
      }
    },
    [pedir, plegar],
  );

  // Las transiciones de fase: nace cuando llega la hora; se despide cuando la caja que mostraba ya no está abierta.
  const prevActivo = useRef(false);
  const prevNivel = useRef<NivelRecordatorio>(0);
  const cajaId = caja?.id ?? null;
  const ubicacionId = datos?.ubicacionId ?? null;
  const nivel = estado.nivel;
  useEffect(() => {
    const antes = prevActivo.current;
    prevActivo.current = activo;
    const nivelAntes = prevNivel.current;
    prevNivel.current = nivel;

    if (activo && !antes) {
      setFase("naciendo");
      setApuntar(false);
      programar(() => setApuntar(true), 40);
      programar(() => setFase("viva"), 320);
      // Se abre sola UNA vez por caja en esta pestaña: recargar no la vuelve a desplegar encima del trabajo.
      const clave = `cayla:recordatorio-cierre:${cajaId}`;
      let yaSeAbrio = false;
      try {
        yaSeAbrio = sessionStorage.getItem(clave) === "1";
        sessionStorage.setItem(clave, "1");
      } catch {
        // Sin almacenamiento (modo privado): se abre igual, no pasa nada.
      }
      if (!yaSeAbrio) programar(() => abrir(true), 950);
      return;
    }
    if (!activo && antes) {
      plegar();
      const ultimo = visto.current?.datos;
      const cambioDeSede = ultimo && ubicacionId !== ultimo.ubicacionId;
      const seCerro = ultimo && !cambioDeSede && cajaId !== ultimo.caja?.id;
      if (!seCerro) {
        setFase("oculta");
        return;
      }
      setDespedida(visto.current);
      setFase("cerrada");
      programar(() => setFase("saliendo"), 1700);
      programar(() => {
        setFase("oculta");
        setCifras(null);
      }, 2300);
      return;
    }
    const isla = islaRef.current;
    if (activo && nivel > nivelAntes && nivelAntes >= 1 && isla && !reducido()) {
      setOla((o) => ({ n: (o?.n ?? 0) + 1, w: isla.offsetWidth, h: isla.offsetHeight }));
    }
  }, [activo, nivel, cajaId, ubicacionId, abrir, plegar, programar]);

  // El ancho y el alto se animan entre medidas reales: la píldora mide lo que dice; la tarjeta, lo que trae. Se vuelve a medir
  // cuando cambia el tamaño de cualquiera de las dos (el minuto que rueda, las cifras que llegan), no solo al pintar esta pieza.
  useLayoutEffect(() => {
    const isla = islaRef.current;
    const pildora = pildoraRef.current;
    const tarjeta = tarjetaRef.current;
    if (!isla || !pildora || !tarjeta) return;
    const medir = () => {
      if (fase === "naciendo" || fase === "saliendo") {
        isla.style.width = "44px";
        isla.style.height = "44px";
      } else if (abierta && !(fase === "cerrada")) {
        isla.style.width = `${tarjeta.offsetWidth}px`;
        isla.style.height = `${tarjeta.scrollHeight}px`;
      } else {
        isla.style.width = `${pildora.scrollWidth}px`;
        isla.style.height = "44px";
      }
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(pildora);
    observador.observe(tarjeta);
    return () => observador.disconnect();
  }, [fase, abierta]);

  // No tapar una barra fija de abajo (el «Cobrar» del celular, la barra de Caja, la de un formulario): la isla flota sobre ella.
  useEffect(() => {
    const isla = islaRef.current;
    if (!isla || fase === "oculta") return;
    const medir = () => isla.style.setProperty("--rcc-abajo", `${alturaBarraInferior(isla)}px`);
    medir();
    // La pantalla nueva termina de montarse (y el loader se va) un poco después: se vuelve a mirar. El reloj de 15 s hace el resto.
    const ids = [setTimeout(medir, 600), setTimeout(medir, 2000)];
    window.addEventListener("resize", medir);
    return () => {
      ids.forEach(clearTimeout);
      window.removeEventListener("resize", medir);
    };
  }, [fase, pathname, ahora]);

  const irACerrar = useCallback(() => {
    plegar();
    if (pathname === "/caja") window.dispatchEvent(new Event(EVENTO_CERRAR_CAJA));
    else router.push("/caja?cerrar=1");
  }, [pathname, plegar, router]);

  const vista = activo && datos ? { datos, nivel: estado.nivel } : despedida;
  if (fase === "oculta" || !vista) return null;

  const { datos: d, nivel: n } = vista;
  const cerrada = fase === "cerrada" || fase === "saliendo";
  const horaCierre = d.horaCierre ?? "00:00";
  const minutos = activo ? estado.minutos : 60;
  const lleno = cerrada ? 0 : CIRCUNFERENCIA * (1 - progreso(minutos));
  const sede = nombreCorto(d.sede);
  const linea = d.caja ? lineaDelDia(d.caja.abiertaEn, horaCierre, minutos) : { extraPct: 0 };
  const total = minutosHora(horaCierre);
  const agujas = { "--rcc-rh": `${apuntar ? ((Math.floor(total / 60) % 12) + (total % 60) / 60) * 30 : 0}deg`, "--rcc-rm": `${apuntar ? (total % 60) * 6 + 360 : 0}deg` } as CSSProperties;

  return (
    <>
      {ola && <span key={ola.n} aria-hidden className="rcc-ola" style={{ width: ola.w, height: ola.h }} />}
      <div
        ref={islaRef}
        role="region"
        aria-label="Recordatorio de cierre de caja"
        data-nivel={n}
        className={["rcc-isla", fase === "naciendo" && "rcc-naciendo", abierta && !cerrada && "rcc-abierta", cerrada && "rcc-ok", fase === "saliendo" && "rcc-saliendo"].filter(Boolean).join(" ")}
        onMouseEnter={() => (encima.current = true)}
        onMouseLeave={() => (encima.current = false)}
      >
        {/* Lo que oye un lector de pantalla: el título, una vez por nivel (no cada minuto). */}
        <span className="sr-only" aria-live="polite">
          {cerrada ? "Caja cerrada." : `${tituloTarjeta(n)}. ${bajadaTarjeta(n, sede, horaCierre)}`}
        </span>

        <button
          ref={pildoraRef}
          type="button"
          className="rcc-pildora"
          aria-expanded={abierta}
          aria-controls="rcc-tarjeta"
          inert={abierta && !cerrada}
          onClick={() => !cerrada && abrir(false)}
        >
          <Anillo vacio={lleno} agujas={agujas} cerrada={cerrada} />
          <span className="rcc-pildora-txt">
            {n === 3 && !cerrada && <span className="rcc-late" aria-hidden />}
            <b>{cerrada ? "Caja cerrada" : rotuloPildora(n)}</b>
            <span className="rcc-sep" aria-hidden />
            <Rueda texto={cerrada ? (cifras?.esperado != null ? soles(cifras.esperado) : "listo") : textoCorto(minutos)} />
          </span>
        </button>

        <div ref={tarjetaRef} id="rcc-tarjeta" className="rcc-tarjeta" inert={!abierta || cerrada}>
          <div className="rcc-cab rcc-cas" style={{ "--i": 0 } as CSSProperties}>
            <Anillo vacio={lleno} agujas={agujas} cerrada={false} grande />
            <div className="min-w-0">
              <p className="rcc-lugar">
                {n === 3 && <span className="rcc-late" aria-hidden />}
                {d.sede} · {hora12(horaCierre)}
              </p>
              <h2 className="rcc-titulo">{tituloTarjeta(n)}</h2>
              <p className="rcc-bajada">{bajadaTarjeta(n, sede, horaCierre)}</p>
            </div>
          </div>

          {d.caja && (
            <div className="rcc-linea rcc-cas" style={{ "--i": 1, "--rcc-extra": `${linea.extraPct}%` } as CSSProperties}>
              <div className="rcc-pista">
                <span className="rcc-turno" />
                <span className="rcc-extra" />
                <span className="rcc-marca" />
              </div>
              <div className="rcc-rotulos">
                <span>
                  Abrió <b>{horaLima12(d.caja.abiertaEn)}</b>
                  {d.caja.abiertaPor ? ` · ${d.caja.abiertaPor.split(" ")[0]}` : ""}
                </span>
                <span>
                  Cierre <b>{hora12(horaCierre)}</b>
                </span>
              </div>
            </div>
          )}

          <div className="rcc-cifras rcc-cas" style={{ "--i": 2 } as CSSProperties}>
            {cifras?.esperado !== null && (
              <div>
                <p>Efectivo en el cajón</p>
                <b>{cifras ? <Cuenta valor={cifras.esperado ?? 0} formato={soles} animar={abierta} /> : "—"}</b>
              </div>
            )}
            <div>
              <p>Ventas del turno</p>
              <b>{cifras && cifras.ventas !== null ? <Cuenta valor={cifras.ventas} formato={(v) => String(Math.round(v))} animar={abierta} /> : "—"}</b>
            </div>
          </div>

          <p className="rcc-consejo rcc-cas" style={{ "--i": 3 } as CSSProperties}>
            Cuenta el efectivo y ciérrala: mañana la caja se abre con lo que cuentes hoy.
          </p>

          <div className="rcc-acciones rcc-cas" style={{ "--i": 4 } as CSSProperties}>
            <button type="button" className="rcc-luego" onClick={plegar}>
              Más tarde
            </button>
            <button type="button" className="rcc-si" onClick={irACerrar}>
              Cerrar caja <span aria-hidden className="rcc-flecha">→</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function minutosHora(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** El anillo de la isla: se llena con lo que pasó desde la hora y lleva dentro un reloj con la hora de cierre de la sede. */
function Anillo({ vacio, agujas, cerrada, grande = false }: { vacio: number; agujas: CSSProperties; cerrada: boolean; grande?: boolean }) {
  return (
    <span className={`rcc-anillo ${grande ? "rcc-anillo-grande" : ""}`} aria-hidden>
      <svg className="rcc-aro" viewBox="0 0 36 36">
        <circle className="rcc-aro-fondo" cx="18" cy="18" r="15" />
        <circle className="rcc-aro-avance" cx="18" cy="18" r="15" style={{ strokeDasharray: CIRCUNFERENCIA, strokeDashoffset: vacio }} />
      </svg>
      {cerrada ? (
        <svg className="rcc-reloj" viewBox="0 0 24 24">
          <path className="rcc-check" d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      ) : (
        <svg className="rcc-reloj" viewBox="0 0 24 24" style={agujas}>
          <circle className="rcc-reloj-aro" cx="12" cy="12" r="9.25" />
          <line className="rcc-aguja-h" x1="12" y1="12" x2="12" y2="7.4" />
          <line className="rcc-aguja-m" x1="12" y1="12" x2="12" y2="5.1" />
          <circle cx="12" cy="12" r="1.1" fill="currentColor" />
        </svg>
      )}
    </span>
  );
}

/** Un texto que rueda hacia arriba cuando cambia («12 min» → «13 min»): el minuto que pasó se ve pasar. */
function Rueda({ texto }: { texto: string }) {
  const [pila, setPila] = useState([{ t: texto, k: 0, sale: false }]);
  const ultimo = pila[pila.length - 1];
  if (ultimo.t !== texto) setPila([{ ...ultimo, sale: true }, { t: texto, k: ultimo.k + 1, sale: false }]);
  useEffect(() => {
    if (pila.length < 2) return;
    const id = setTimeout(() => setPila((p) => p.slice(-1)), 380);
    return () => clearTimeout(id);
  }, [pila]);
  return (
    <span className="rcc-rueda">
      {pila.map((x) => (
        <span key={x.k} className={x.sale ? "rcc-rueda-sale" : x.k > 0 ? "rcc-rueda-entra" : ""}>
          {x.t}
        </span>
      ))}
    </span>
  );
}

/** Una cifra que cuenta hasta su valor al abrirse la tarjeta (regla «cifra que cuenta», ADR-0136). */
function Cuenta({ valor, formato, animar }: { valor: number; formato: (n: number) => string; animar: boolean }) {
  const [animado, setAnimado] = useState(valor);
  const cuenta = animar && !reducido();
  useEffect(() => {
    if (!cuenta) return;
    let raf = 0;
    const t0 = performance.now();
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / 650);
      setAnimado(valor * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor, cuenta]);
  return <>{formato(cuenta ? animado : valor)}</>;
}

/**
 * Cuánto ocupa desde abajo una barra fija de la pantalla (la de cobrar en el celular, la de Caja, la de un formulario largo),
 * mirando qué hay pintado justo bajo la isla. Se mira el DOM y no una lista de pantallas: una barra nueva queda cubierta sola.
 * Algo fijo que ocupa más del 40 % (un modal, el loader) no es una barra: se mira lo que hay debajo.
 */
function alturaBarraInferior(isla: HTMLElement): number {
  const x = window.innerWidth < 640 ? window.innerWidth / 2 : window.innerWidth - 60;
  const y = window.innerHeight - 3;
  const vistos = new Set<Element>();
  for (const el of document.elementsFromPoint(x, y)) {
    if (isla.contains(el) || el.classList.contains("rcc-ola")) continue;
    for (let n: Element | null = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (vistos.has(n)) break;
      vistos.add(n);
      // `sticky` también: la barra «Cerrar caja» de escritorio (ADR-0318) se pega al borde de abajo igual que una fija.
      const pos = getComputedStyle(n).position;
      if (pos !== "fixed" && pos !== "sticky") continue;
      const alto = window.innerHeight - n.getBoundingClientRect().top;
      if (alto > 0 && alto < window.innerHeight * 0.4) return Math.round(alto);
      break; // una capa a pantalla completa: se sigue con lo que hay debajo
    }
  }
  return 0;
}
