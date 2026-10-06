"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  EVENTO_CERRAR_CAJA,
  bajadaTarjeta,
  cicloDeDespliegue,
  estadoAviso,
  hora12,
  horaLima12,
  lineaDelDia,
  mismosDatos,
  nombreCorto,
  rotuloPildora,
  textoCorto,
  tituloTarjeta,
  type CifrasRecordatorio,
  type DatosRecordatorioCierre,
  type NivelRecordatorio,
} from "@/lib/recordatorio-cierre-reglas";

// El «Marcador»: el recordatorio de cierre de caja, en el centro de la cabecera (ADR-0359; maqueta 3 de
// `docs/maquetas/recordatorio-cierre-barra-superior-2026-10/`; antes fue la «Isla» flotante de ADR-0305).
// Montada UNA vez en el layout de la app: acompaña a quien puede cerrar la caja por todas las pantallas desde 15 min ANTES de la
// hora de cierre de su tienda (`ubicaciones.hora_cierre`: a las 7:30 p. m. si cierra a las 7:45) hasta que la caja se cierra.
// No tiene ✕: se pliega, pero solo se va al cerrar la caja.
//
// Cómo se mueve (ADR-0136): nace del centro de la barra; sus paletas giran cuando cambia el minuto (antes de la hora cuentan lo
// que falta; después, lo que pasó); desde la hora de cierre y cada 5 minutos redondos (7:45, 7:50, 7:55…) la pestaña se
// despliega sola hacia abajo, se queda 5 s (más si el mouse está encima) y se pliega. Al subir de nivel cambia de color y lanza
// UNA onda; al cerrar la caja se pone verde, dibuja su ✓ y sube. Sus adornos en bucle (resplandor que deriva, destello en «sin
// cerrar», punto que late) son los que Felipe eligió en la maqueta (ADR-0359). Con `prefers-reduced-motion` todo pasa en un
// instante (`recordatorio-cierre.css`).

const TICK_MS = 5_000;
const SONDEO_ACTIVO_MS = 60_000;
const SONDEO_QUIETO_MS = 5 * 60_000;
const PLEGAR_MS = 5_000;

type Fase = "oculta" | "naciendo" | "viva" | "cerrada" | "saliendo";
type Visto = { datos: DatosRecordatorioCierre; nivel: NivelRecordatorio; previo: boolean };

const soles = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reducido = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const espera = (ms: number) => (reducido() ? 0 : ms);

/**
 * Cuánto cabe en la barra. La cápsula va en el medio de la cabecera; a su izquierda y a su derecha hay cosas que cambian de
 * ancho (el buscador, «Actividad», el selector de sede con nombres de largo distinto, y no todas las cuentas ven todo). En vez de
 * adivinar por anchos de pantalla se MIDE: el hueco que queda entre el último elemento de la izquierda y el primero de la derecha,
 * y se elige el tramo más completo que cabe (0 todo · 1 sin botón «Cerrar» · 2 sin «h : min» · 3 solo luz y paletas · 4 lo mismo, más apretado). Si ni el
 * más chico cabe (celular, barra apretada) la cápsula cuelga justo bajo la cabecera (tramo 5), así que NUNCA tapa un botón.
 */
const AIRE_PX = 12;
function medirHueco(isla: HTMLElement) {
  const cab = document.querySelector<HTMLElement>("[data-cabecera-app]");
  const caps = isla.querySelector<HTMLElement>(".rcc-caps");
  if (!cab || !caps) return;
  const r = cab.getBoundingClientRect();
  const centro = r.left + r.width / 2;
  let izq = r.left;
  let der = r.right;
  for (const el of Array.from(cab.firstElementChild?.children ?? [])) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue; // oculto en este ancho
    if (b.left + b.width / 2 < centro) izq = Math.max(izq, b.right);
    else der = Math.min(der, b.left);
  }
  const libre = 2 * Math.min(centro - izq, der - centro) - 2 * AIRE_PX;
  let tramo = 5;
  for (let t = 0; t <= 4; t++) {
    isla.dataset.tramo = String(t);
    if (caps.offsetWidth <= libre) {
      tramo = t;
      break;
    }
  }
  isla.dataset.tramo = String(tramo);
  const arriba = tramo === 5 ? r.bottom + 6 : r.top + (r.height - caps.offsetHeight) / 2;
  isla.style.setProperty("--rcc-top", `${arriba}px`);
}

export function RecordatorioCierreCaja({ inicial }: { inicial: DatosRecordatorioCierre | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [datos, setDatos] = useState<DatosRecordatorioCierre | null>(inicial);
  const [ahora, setAhora] = useState<Date | null>(null);
  const [fase, setFase] = useState<Fase>("oculta");
  const [abierta, setAbierta] = useState(false);
  const [cifras, setCifras] = useState<CifrasRecordatorio | null>(null);
  const [ola, setOla] = useState<number | null>(null);
  // Lo último que se mostró: la despedida necesita la sede y el nivel aunque `datos` ya diga «sin caja».
  const [despedida, setDespedida] = useState<Visto | null>(null);

  const islaRef = useRef<HTMLDivElement>(null);
  const encima = useRef(false);
  const plegarT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const visto = useRef<Visto | null>(null);

  // Lo que trae el layout manda cuando cambia (al cerrar desde aquí, `router.refresh()` lo trae sin caja).
  const [inicialPrevio, setInicialPrevio] = useState(inicial);
  if (!mismosDatos(inicial, inicialPrevio)) {
    setInicialPrevio(inicial);
    setDatos(inicial);
  }

  // El reloj: cada 5 s alcanza para que el minuto cambie y la pestaña baje a la hora, sin despertar a nadie.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la hora del navegador solo se lee ya montado: leerla al pintar en el servidor rompería la hidratación (misma decisión que la espera de Vender).
    setAhora(new Date());
    const id = setInterval(() => setAhora(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const caja = datos?.caja ?? null;
  const estado =
    ahora && caja && datos?.horaCierre
      ? estadoAviso({ ahora, abiertaEn: caja.abiertaEn, horaCierre: datos.horaCierre })
      : { nivel: 0 as NivelRecordatorio, minutos: 0, previo: false };
  const activo = estado.nivel >= 1;
  useEffect(() => {
    if (activo && datos) visto.current = { datos, nivel: estado.nivel, previo: estado.previo };
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

  // La pestaña baja sola desde la hora de cierre y cada 5 minutos redondos, hasta que la caja se cierre (Felipe 2026-10-06).
  // Sube cuando el número de despliegue CRECE: la primera lectura (cargar una pantalla a mitad de camino) no la despliega encima del
  // trabajo, y recargar tampoco repite el despliegue de este mismo cuarto de hora.
  const ciclo = activo && !estado.previo ? cicloDeDespliegue(estado.minutos) : -1;
  const cicloVisto = useRef<number | null>(null);
  useEffect(() => {
    if (!activo) {
      cicloVisto.current = null;
      return;
    }
    const antes = cicloVisto.current;
    cicloVisto.current = ciclo;
    if (antes !== null && ciclo > antes && ciclo >= 0) abrir(true);
  }, [activo, ciclo, abrir]);

  // Un clic fuera de la cápsula pliega la pestaña (no hay ✕: el aviso no se descarta, solo se guarda).
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: PointerEvent) => {
      if (islaRef.current && !islaRef.current.contains(e.target as Node)) plegar();
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierta, plegar]);

  // Las transiciones de fase: nace cuando llega el preaviso; se despide cuando la caja que mostraba ya no está abierta.
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
      programar(() => setFase("viva"), 620);
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
    if (activo && nivel > nivelAntes && nivelAntes >= 1 && !reducido()) setOla((o) => (o ?? 0) + 1);
  }, [activo, nivel, cajaId, ubicacionId, plegar, programar]);

  // Re-medir el hueco de la barra cuando cambia lo que la cápsula dice (el rótulo, uno o dos dígitos de hora), la pantalla (la
  // cabecera cambia de contenido) o el tamaño de la ventana o de cualquier pieza de la barra. Va antes de pintar: no hay salto.
  const minutosPaletas = activo ? (estado.previo ? -estado.minutos : estado.minutos) : 60;
  const claveAncho = minutosPaletas >= 1440 ? "dias" : minutosPaletas >= 600 ? "dos-digitos" : "uno";
  const hayCapsula = fase !== "oculta";
  const remedir = useCallback(() => {
    if (islaRef.current) medirHueco(islaRef.current);
  }, []);
  useLayoutEffect(() => {
    if (hayCapsula) remedir();
  }, [hayCapsula, fase, nivel, estado.previo, claveAncho, pathname, remedir]);
  useEffect(() => {
    if (!hayCapsula) return;
    const cab = document.querySelector<HTMLElement>("[data-cabecera-app]");
    const observador = new ResizeObserver(remedir);
    if (cab) {
      observador.observe(cab);
      Array.from(cab.firstElementChild?.children ?? []).forEach((el) => observador.observe(el));
    }
    // La barra de una pantalla nueva termina de montarse (botones, loader) un poco después: se vuelve a medir.
    const ids = [setTimeout(remedir, 400), setTimeout(remedir, 1500)];
    window.addEventListener("resize", remedir);
    return () => {
      observador.disconnect();
      ids.forEach(clearTimeout);
      window.removeEventListener("resize", remedir);
    };
  }, [hayCapsula, pathname, remedir]);

  const irACerrar = useCallback(() => {
    plegar();
    if (pathname === "/caja") window.dispatchEvent(new Event(EVENTO_CERRAR_CAJA));
    else router.push("/caja?cerrar=1");
  }, [pathname, plegar, router]);

  const vista: Visto | null = activo && datos ? { datos, nivel: estado.nivel, previo: estado.previo } : despedida;
  if (fase === "oculta" || !vista) return null;

  const { datos: d, nivel: n, previo } = vista;
  const cerrada = fase === "cerrada" || fase === "saliendo";
  const horaCierre = d.horaCierre ?? "00:00";
  // Antes de la hora cuenta lo que falta (7:30 → 15 min); después, lo que pasó.
  const minutos = activo ? (previo ? -estado.minutos : estado.minutos) : 60;
  const sede = nombreCorto(d.sede);
  const linea = d.caja && !previo ? lineaDelDia(d.caja.abiertaEn, horaCierre, minutos) : { extraPct: 0 };
  const titulo = tituloTarjeta(n, previo);
  const bajada = bajadaTarjeta(n, sede, horaCierre, previo);
  const alternar = () => (abierta ? plegar() : abrir(false));

  return (
    <div
      ref={islaRef}
      role="region"
      aria-label="Recordatorio de cierre de caja"
      data-nivel={n}
      data-fase={fase}
      className="rcc-isla papel-fijo"
    >
      {/* Lo que oye un lector de pantalla: el título, una vez por nivel (no cada minuto). */}
      <span className="sr-only" aria-live="polite">
        {cerrada ? "Caja cerrada." : `${titulo}. ${bajada}`}
      </span>

      <div className="rcc-hueco" onMouseEnter={() => (encima.current = true)} onMouseLeave={() => (encima.current = false)}>
        <span className="rcc-aurora" aria-hidden />

        {/* La cápsula entera abre y pliega la pestaña; el botón de la derecha es el control accesible. */}
        <div className={["rcc-caps", cerrada && "rcc-ok"].filter(Boolean).join(" ")} onClick={(e) => !cerrada && !(e.target as HTMLElement).closest("button") && alternar()}>
          {cerrada ? (
            <svg className="rcc-check-caja" viewBox="0 0 24 24" aria-hidden>
              <path className="rcc-check" d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          ) : (
            <span className="rcc-led" aria-hidden />
          )}
          <b className="rcc-rotulo">{cerrada ? "Caja cerrada" : rotuloPildora(n, previo)}</b>
          {cerrada ? (
            <span className="rcc-dias">
              <Rueda texto={cifras?.esperado != null ? soles(cifras.esperado) : "listo"} />
            </span>
          ) : (
            <Paletas minutos={minutos} />
          )}
          {!cerrada && (
            <button type="button" className="rcc-boton" onClick={irACerrar}>
              Cerrar <span aria-hidden className="rcc-flecha">→</span>
            </button>
          )}
          {!cerrada && (
            <button type="button" className="rcc-mas" aria-expanded={abierta} aria-controls="rcc-ticket" aria-label={abierta ? "Ocultar el detalle del cierre" : "Ver el detalle del cierre"} onClick={alternar}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          )}
        </div>
        {ola !== null && <span key={ola} aria-hidden className="rcc-ola" />}
        {/* Desde la hora de cierre la cápsula emite ondas sin parar, las mismas de cuando sube de nivel (Felipe 2026-10-06): dos
            anillos desfasados que salen y se apagan. En el preaviso (7:30–7:44) no hay: todavía no es la hora. */}
        {!previo && fase === "viva" && (
          <>
            <span aria-hidden className="rcc-pulso" />
            <span aria-hidden className="rcc-pulso rcc-pulso-b" />
          </>
        )}

        <div id="rcc-ticket" className={["rcc-ticket", abierta && !cerrada && "rcc-abierta"].filter(Boolean).join(" ")} inert={!abierta || cerrada}>
          <div className="rcc-papel">
            <p className="rcc-rot rcc-cas" style={{ "--i": 0 } as CSSProperties}>
              {titulo}
            </p>
            {cifras?.esperado != null ? (
              <>
                <p className="rcc-grande rcc-cas" style={{ "--i": 1 } as CSSProperties}>
                  <Cuenta valor={cifras.esperado} formato={soles} animar={abierta} />
                </p>
                <p className="rcc-bajada rcc-cas" style={{ "--i": 1 } as CSSProperties}>
                  efectivo que debería haber en el cajón
                </p>
              </>
            ) : (
              <p className="rcc-titulo rcc-cas" style={{ "--i": 1 } as CSSProperties}>
                {bajada}
              </p>
            )}
            {d.caja && (
              <>
                <div className="rcc-seg rcc-cas" style={{ "--i": 2 } as CSSProperties}>
                  <i className="rcc-seg-turno" />
                  {linea.extraPct > 0 && <i className="rcc-seg-extra" style={{ flex: Math.max(4, linea.extraPct * 4) }} />}
                </div>
                <div className="rcc-rotulos rcc-cas" style={{ "--i": 2 } as CSSProperties}>
                  <span>
                    Abrió <b>{horaLima12(d.caja.abiertaEn)}</b>
                    {d.caja.abiertaPor ? ` · ${d.caja.abiertaPor.split(" ")[0]}` : ""}
                  </span>
                  <span>
                    Cierre <b>{hora12(horaCierre)}</b>
                  </span>
                </div>
              </>
            )}
            <div className="rcc-corte" aria-hidden />
            <div className="rcc-stats rcc-cas" style={{ "--i": 3 } as CSSProperties}>
              <div>
                <b>{cifras && cifras.ventas !== null ? <Cuenta valor={cifras.ventas} formato={(v) => String(Math.round(v))} animar={abierta} /> : "—"}</b>
                ventas del turno
              </div>
              <div>
                <b>
                  <Rueda texto={textoCorto(Math.max(0, minutos))} />
                </b>
                {previo ? "para el cierre" : "desde la hora"}
              </div>
            </div>
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
      </div>
    </div>
  );
}

/** El contador de paletas: horas : minutos. Pasado un día, deja de ser un reloj y dice «2 días». */
function Paletas({ minutos }: { minutos: number }) {
  if (minutos >= 1440) return <span className="rcc-dias">{textoCorto(minutos)}</span>;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return (
    <span className="rcc-paletas" aria-hidden>
      {h >= 10 && <Paleta valor={Math.floor(h / 10)} />}
      <Paleta valor={h % 10} />
      <span className="rcc-dos-puntos">:</span>
      <Paleta valor={Math.floor(m / 10)} />
      <Paleta valor={m % 10} />
      <span className="rcc-unidad">h : min</span>
    </span>
  );
}

/** Una paleta que gira solo cuando su dígito cambia: la de arriba cae y la de abajo sube (ADR-0359). Sin rebote. */
function Paleta({ valor }: { valor: number }) {
  const [vista, setVista] = useState({ ahora: valor, antes: valor, gira: false });
  const [previo, setPrevio] = useState(valor);
  if (previo !== valor) {
    setPrevio(valor);
    setVista({ ahora: valor, antes: previo, gira: !reducido() });
  }
  useEffect(() => {
    if (!vista.gira) return;
    const id = setTimeout(() => setVista((v) => ({ ...v, antes: v.ahora, gira: false })), 520);
    return () => clearTimeout(id);
  }, [vista.gira, vista.ahora]);
  return (
    <span className={`rcc-flap ${vista.gira ? "rcc-gira" : ""}`}>
      <span className="rcc-f-top">
        <i>{vista.ahora}</i>
      </span>
      <span className="rcc-f-bot">
        <i>{vista.antes}</i>
      </span>
      <span className="rcc-f-a">
        <i>{vista.antes}</i>
      </span>
      <span className="rcc-f-b">
        <i>{vista.ahora}</i>
      </span>
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

/** Una cifra que cuenta hasta su valor al abrirse la pestaña (regla «cifra que cuenta», ADR-0136). */
function Cuenta({ valor, formato, animar }: { valor: number; formato: (n: number) => string; animar: boolean }) {
  const [animado, setAnimado] = useState(valor);
  const cuenta = animar && !reducido();
  useEffect(() => {
    if (!cuenta) return;
    let raf = 0;
    const t0 = performance.now();
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      setAnimado(valor * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor, cuenta]);
  return <>{formato(cuenta ? animado : valor)}</>;
}
