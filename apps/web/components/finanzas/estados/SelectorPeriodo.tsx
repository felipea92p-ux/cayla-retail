"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { useDestinoFlotante } from "@/components/ui/useAnclaje";
import { useEnCelular } from "@/components/ui/useEnCelular";
import { conBarras } from "@/lib/campo-fecha-reglas";
import {
  alturaDelMes,
  atajosDelPeriodo,
  comparacionDelPeriodo,
  cubreElMes,
  diaPorTecla,
  diasDelMes,
  fechaEnCampo,
  fechaLarga,
  hrefPeriodo,
  intensidadDelDia,
  marcaDelDia,
  mesesDelHilo,
  nombreDelMes,
  periodoDe,
  revisarEscritas,
  sumarMeses,
  vecinos,
  type Periodo,
  type Rango,
} from "@/lib/estados-periodo";
import { soles } from "@/lib/flujo-caja-reglas";
import { letraEstados } from "@/lib/letra-estados";

const ANCHO_PANEL = 868;
const DIAS_DE_LA_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

type ResultadoDelMes = { mes: string; resultado: number | null };

// Lo que el calendario pide aparte se recuerda unos minutos: abrirlo otra vez no vuelve a preguntar. Sin respuesta no pasa nada: salen sin barras ni puntitos.
const RECUERDO_MS = 5 * 60_000;
const recuerdo = new Map<string, { en: number; respuesta: Promise<unknown> }>();
function leerDeApoyo<T>(url: string): Promise<T | null> {
  const guardado = recuerdo.get(url);
  if (guardado && Date.now() - guardado.en < RECUERDO_MS) return guardado.respuesta as Promise<T | null>;
  // `x-espera: no`: esto no bloquea la pantalla con el loader (ADR-0149).
  const respuesta = fetch(url, { headers: { "x-espera": "no" } })
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null);
  recuerdo.set(url, { en: Date.now(), respuesta });
  return respuesta;
}

/**
 * El selector de fechas de Estados financieros (ADR-0611; maqueta `docs/maquetas/finanzas-eeff-vidrio-2026-11/`): «‹ Octubre 2026 ›». Las flechas saltan al
 * vecino del mismo largo y al tocar el nombre se abre el calendario de vidrio: atajos, la fila de meses, los días y dos campos para escribir. Vive en la URL,
 * así que cada elección rehace la pantalla y el calendario se cierra. En el Balance (`una`) se elige una sola fecha. En el celular es una hoja (ADR-0479).
 */
export function SelectorPeriodo({ desde, hasta, hoy, minimo, una, sede }: { desde: string; hasta: string; hoy: string; minimo: string | null; una: boolean; sede: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const sp = useSearchParams();
  const [abierto, setAbierto] = useState(false);
  const grupo = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const p = periodoDe(desde, hasta, hoy);
  const { anterior, siguiente } = vecinos(p, hoy, minimo, una);
  const queSeMira = una || p.unMes ? "mes" : "período";

  function aplicar(r: Rango) {
    setAbierto(false);
    boton.current?.focus({ preventScroll: true });
    if (r.hasta === hasta && (una || r.desde === desde)) return;
    router.push(hrefPeriodo(ruta, sp.entries(), r, hoy), { scroll: false });
  }

  return (
    <div ref={grupo} className="estados-fecha" role="group" aria-label={una ? "Fecha del Balance" : "Período"} data-guia="fin-estados.fecha">
      <button type="button" className="estados-fecha-flecha area-dedo" disabled={!anterior} aria-label={`Ver el ${queSeMira} anterior`} onClick={() => anterior && aplicar(anterior)}>
        <ChevronLeft aria-hidden className="h-4 w-4" />
      </button>
      <button ref={boton} type="button" className="estados-fecha-boton" aria-haspopup="dialog" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        <CalendarDays aria-hidden className="estados-fecha-icono h-4 w-4" />
        <span className="estados-fecha-texto">
          <b className="tabular-nums" aria-live="polite">
            {una ? p.al : p.titulo}
          </b>
          <small>
            {una ? (
              hasta === hoy ? "Hoy" : "Una foto a esa fecha"
            ) : (
              <>
                <span className="estados-fecha-tramo">{`${p.tramo} · `}</span>
                {p.largo}
              </>
            )}
          </small>
        </span>
        <ChevronDown aria-hidden className="estados-fecha-giro h-4 w-4" />
      </button>
      <button type="button" className="estados-fecha-flecha area-dedo" disabled={!siguiente} aria-label={`Ver el ${queSeMira} siguiente`} onClick={() => siguiente && aplicar(siguiente)}>
        <ChevronRight aria-hidden className="h-4 w-4" />
      </button>
      {abierto && <Calendario p={p} hoy={hoy} minimo={minimo} una={una} sede={sede} control={grupo} volverA={boton} onAplicar={aplicar} onCerrar={() => setAbierto(false)} />}
    </div>
  );
}

function Calendario({
  p,
  hoy,
  minimo,
  una,
  sede,
  control,
  volverA,
  onAplicar,
  onCerrar,
}: {
  p: Periodo;
  hoy: string;
  minimo: string | null;
  una: boolean;
  sede: string;
  control: RefObject<HTMLDivElement | null>;
  volverA: RefObject<HTMLButtonElement | null>;
  onAplicar: (r: Rango) => void;
  onCerrar: () => void;
}) {
  const enCelular = useEnCelular();
  const idTitulo = useId();
  const panel = useRef<HTMLDivElement>(null);
  const destino = useDestinoFlotante(control, true);
  const mesHoy = hoy.slice(0, 7);
  const mesMinimo = minimo ? minimo.slice(0, 7) : sumarMeses(mesHoy, -36);
  // Con dos meses a la vista, `visible` es el de la derecha: el de la izquierda también tiene que existir.
  const visibleMinimo = enCelular ? mesMinimo : sumarMeses(mesMinimo, 1) > mesHoy ? mesHoy : sumarMeses(mesMinimo, 1);
  const [visible, setVisible] = useState(p.mes < visibleMinimo ? visibleMinimo : p.mes);
  const visibles = useMemo(() => (enCelular ? [visible] : [sumarMeses(visible, -1), visible]), [enCelular, visible]);

  const [pendiente, setPendiente] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [foco, setFoco] = useState(p.hasta);
  const [textoDesde, setTextoDesde] = useState(fechaEnCampo(p.desde));
  const [textoHasta, setTextoHasta] = useState(fechaEnCampo(p.hasta));
  // Solo lo que la persona tecleó pide «Ver»: un día tocado también se ve en los campos, pero ya se aplica con el segundo toque.
  const [tecleo, setTecleo] = useState(false);
  const [errorEscrito, setErrorEscrito] = useState<string | null>(null);
  const [resultados, setResultados] = useState<ResultadoDelMes[] | null>(null);
  const [ventas, setVentas] = useState<Record<string, number>>({});
  const [arrastre, setArrastre] = useState<[number, number] | null>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const ignorarClic = useRef(false);
  const llevarFoco = useRef<string | null>(null);

  const meses = useMemo(() => mesesDelHilo(hoy, minimo), [hoy, minimo]);
  const atajos = useMemo(() => atajosDelPeriodo(hoy, minimo, una), [hoy, minimo, una]);

  // Flota bajo el control, con su borde derecho alineado al de él. Es `fixed` y colgado del documento: la cabecera no lo recorta.
  useLayoutEffect(() => {
    if (enCelular) return;
    function calcular() {
      const r = control.current?.getBoundingClientRect();
      if (!r) return;
      const ancho = Math.min(ANCHO_PANEL, window.innerWidth - 16);
      setPos({ top: r.bottom + 10, right: Math.min(Math.max(8, window.innerWidth - r.right), window.innerWidth - ancho - 8) });
    }
    calcular();
    window.addEventListener("resize", calcular);
    window.addEventListener("scroll", calcular, true);
    return () => {
      window.removeEventListener("resize", calcular);
      window.removeEventListener("scroll", calcular, true);
    };
  }, [control, enCelular]);

  // Lo de apoyo llega después y no hace esperar a nadie: las barritas crecen cuando llegan.
  useEffect(() => {
    let vivo = true;
    void leerDeApoyo<{ meses: ResultadoDelMes[] }>(`/finanzas/reportes/periodo?sede=${encodeURIComponent(sede)}`).then((d) => {
      if (vivo && d) setResultados(d.meses);
    });
    return () => {
      vivo = false;
    };
  }, [sede]);
  useEffect(() => {
    let vivo = true;
    for (const mes of visibles) {
      if (mes < mesMinimo) continue;
      void leerDeApoyo<{ dias: Record<string, number> }>(`/finanzas/reportes/periodo?sede=${encodeURIComponent(sede)}&mes=${mes}`).then((d) => {
        if (vivo && d) setVentas((v) => ({ ...v, ...d.dias }));
      });
    }
    return () => {
      vivo = false;
    };
  }, [visibles, sede, mesMinimo]);

  // Al abrir, el foco va al atajo puesto (en el celular, no: Radix lo lleva a la hoja y un campo enfocado abriría el teclado).
  const colocado = pos !== null;
  useEffect(() => {
    if (enCelular || !colocado) return;
    panel.current?.querySelector<HTMLElement>('.estados-cal-atajo[aria-pressed="true"], .estados-cal-atajo')?.focus({ preventScroll: true });
  }, [enCelular, colocado]);

  // Donde la fila de meses o la de atajos no caben enteras, se abren mostrando lo que está puesto. Con una ref de función: dentro de la hoja del celular
  // la fila nace después que este componente, y un efecto no la encontraría.
  const mostrarLoPuesto = useCallback((fila: HTMLElement | null) => {
    const pieza = fila?.querySelector<HTMLElement>('[aria-pressed="true"], [data-cubre="parte"]');
    if (fila && pieza && fila.scrollWidth > fila.clientWidth) fila.scrollLeft = pieza.offsetLeft - fila.offsetLeft - (fila.clientWidth - pieza.offsetWidth) / 2;
  }, []);

  // Escape cierra y devuelve el foco. En el celular lo hace la hoja.
  useEffect(() => {
    if (enCelular) return;
    function alTeclear(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCerrar();
      volverA.current?.focus({ preventScroll: true });
    }
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [enCelular, onCerrar, volverA]);

  // Arrastrar por la fila de meses: al soltar en cualquier parte se aplica. El clic que viene detrás no cuenta.
  useEffect(() => {
    if (!arrastre) return;
    function soltar() {
      const [x, y] = arrastre!;
      setArrastre(null);
      ignorarClic.current = true;
      setTimeout(() => (ignorarClic.current = false), 50);
      elegirMeses(x, y);
    }
    window.addEventListener("pointerup", soltar);
    return () => window.removeEventListener("pointerup", soltar);
  });

  // La flecha cambió de día (y quizás de mes): el foco va a ese día cuando ya está dibujado.
  useEffect(() => {
    if (!llevarFoco.current) return;
    panel.current?.querySelector<HTMLElement>(`[data-dia="${llevarFoco.current}"]`)?.focus({ preventScroll: true });
    llevarFoco.current = null;
  });

  function elegirMeses(x: number, y: number) {
    const a = meses[Math.min(x, y)]!;
    const z = meses[Math.max(x, y)]!;
    onAplicar(una ? { desde: z.desde, hasta: z.hasta } : { desde: a.desde, hasta: z.hasta });
  }

  function elegirDia(iso: string) {
    setErrorEscrito(null);
    if (una) return onAplicar({ desde: `${iso.slice(0, 7)}-01`, hasta: iso });
    if (pendiente === null) {
      setPendiente(iso);
      setSobre(iso);
      setFoco(iso);
      setTextoDesde(fechaEnCampo(iso));
      setTextoHasta(fechaEnCampo(iso));
      setTecleo(false);
      return;
    }
    onAplicar(pendiente <= iso ? { desde: pendiente, hasta: iso } : { desde: iso, hasta: pendiente });
  }

  function alTeclear() {
    setErrorEscrito(null);
    setTecleo(true);
    setPendiente(null);
    setSobre(null);
  }

  function usarEscritas() {
    const r = revisarEscritas(textoDesde, textoHasta, hoy, minimo, una);
    if ("error" in r) return setErrorEscrito(r.error);
    setErrorEscrito(null);
    onAplicar(r.rango);
  }

  function alTeclearDias(e: KeyboardEvent<HTMLDivElement>) {
    const dia = (e.target as HTMLElement).closest<HTMLElement>("[data-dia]")?.dataset.dia;
    if (!dia) return;
    const nuevo = diaPorTecla(dia, e.key, hoy, minimo);
    if (!nuevo) return;
    e.preventDefault();
    setFoco(nuevo);
    if (pendiente !== null) setSobre(nuevo);
    const mes = nuevo.slice(0, 7);
    if (mes > visible) setVisible(mes);
    else if (!visibles.includes(mes)) setVisible(enCelular ? mes : sumarMeses(mes, 1));
    llevarFoco.current = nuevo;
  }

  function alPasarPorDias(e: PointerEvent<HTMLDivElement>) {
    if (pendiente === null) return;
    const dia = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-dia]:not(:disabled)")?.dataset.dia;
    if (dia) setSobre(dia);
  }

  function alEmpezarArrastre(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch" || una) return;
    const i = (e.target as HTMLElement).closest<HTMLElement>("[data-i]")?.dataset.i;
    if (i !== undefined) setArrastre([Number(i), Number(i)]);
  }

  function alArrastrar(e: PointerEvent<HTMLDivElement>) {
    if (!arrastre) return;
    const i = (e.target as HTMLElement).closest<HTMLElement>("[data-i]")?.dataset.i;
    if (i !== undefined && Number(i) !== arrastre[1]) setArrastre([arrastre[0], Number(i)]);
  }

  const tramo: Rango =
    pendiente !== null
      ? { desde: pendiente <= (sobre ?? pendiente) ? pendiente : sobre!, hasta: pendiente <= (sobre ?? pendiente) ? (sobre ?? pendiente) : pendiente }
      : una
        ? { desde: p.hasta, hasta: p.hasta }
        : { desde: p.desde, hasta: p.hasta };
  const mayorDelMes = Math.max(0, ...(resultados ?? []).map((r) => Math.abs(r.resultado ?? 0)));
  const diasPorMes = visibles.map((mes) => ({ mes, ...diasDelMes(mes, hoy, minimo) }));
  const mayorDelDia = Math.max(0, ...diasPorMes.flatMap((m) => m.dias.map((d) => ventas[d.iso] ?? 0)));
  const elegibles = diasPorMes.flatMap((m) => m.dias.filter((d) => !d.apagado));
  const conTab = elegibles.some((d) => d.iso === foco) ? foco : (elegibles.at(-1)?.iso ?? null);
  const cambioEscrito = tecleo && (textoHasta !== fechaEnCampo(p.hasta) || (!una && textoDesde !== fechaEnCampo(p.desde)));
  const paso = errorEscrito ?? (una ? "Elige la fecha de la foto, o escríbela" : pendiente !== null ? "Ahora elige el último día" : "Toca el primer día y luego el último. Se aplica solo.");
  const titulo = pendiente !== null ? `Desde el ${fechaLarga(pendiente)}` : una ? p.al : p.titulo;
  const dosEnMovimiento = arrastre ? ([Math.min(...arrastre), Math.max(...arrastre)] as const) : null;

  const cuerpo = (
    <div className="estados-cal-marco">
      <div className="estados-cal-cuerpo">
        <div className="estados-cal-cabeza">
          <div className="min-w-0">
            <p className="estados-cal-paso" data-tono={errorEscrito ? "mal" : pendiente !== null ? "sigue" : undefined} aria-live="polite">
              {paso}
            </p>
            {!enCelular && (
              <h2 id={idTitulo} className="estados-cal-titulo">
                {titulo}
              </h2>
            )}
          </div>
          {pendiente === null && (
            <Chip tono="pizarra" versalitas={false}>
              {comparacionDelPeriodo(p, minimo, una)}
            </Chip>
          )}
          <div className="estados-cal-tipeo" onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            usarEscritas();
          }}>
            {!una && (
              <CampoTexto
                etiqueta="Desde"
                sinPie
                inputMode="numeric"
                // sugerir-fijo: el formato de una fecha no depende de nada elegido antes
                placeholder="DD/MM/AAAA"
                className="tabular-nums"
                value={textoDesde}
                tono={errorEscrito ? "error" : undefined}
                onChange={(e) => {
                  alTeclear();
                  setTextoDesde(conBarras(e.target.value));
                }}
                onFocus={(e) => e.target.select()}
              />
            )}
            <CampoTexto
              etiqueta={una ? "Fecha" : "Hasta"}
              sinPie
              inputMode="numeric"
              // sugerir-fijo: el formato de una fecha no depende de nada elegido antes
              placeholder="DD/MM/AAAA"
              className="tabular-nums"
              value={textoHasta}
              tono={errorEscrito ? "error" : undefined}
              onChange={(e) => {
                alTeclear();
                setTextoHasta(conBarras(e.target.value));
              }}
              onFocus={(e) => e.target.select()}
            />
            {cambioEscrito && (
              <Boton type="button" peso="primario" onClick={usarEscritas}>
                Ver
              </Boton>
            )}
          </div>
          {!enCelular && (
            <button type="button" className="estados-cal-cerrar" aria-label="Cerrar" onClick={() => {
              onCerrar();
              volverA.current?.focus({ preventScroll: true });
            }}>
              <X aria-hidden className="h-4 w-4" />
            </button>
          )}
        </div>

        <div ref={mostrarLoPuesto} className="estados-cal-atajos" role="group" aria-label="Atajos">
          {atajos.map((a, i) => {
            const puesto = una ? a.hasta === p.hasta : a.desde === p.desde && a.hasta === p.hasta;
            return (
              <button key={a.clave} type="button" className="estados-cal-atajo" aria-pressed={puesto} style={{ "--i": i } as CSSProperties} onClick={() => onAplicar({ desde: a.desde, hasta: a.hasta })}>
                <b>{a.titulo}</b>
                <small className="tabular-nums">{a.detalle}</small>
              </button>
            );
          })}
        </div>

        <div className="estados-cal-lado">
          <div className="estados-cal-hilo-titulo">
            <span>Meses</span>
            <small>{una ? "Toca uno para ver su cierre" : enCelular ? "Toca uno para verlo completo" : "Toca uno, o arrastra para elegir varios"}</small>
          </div>
          <div
            ref={mostrarLoPuesto}
            className="estados-cal-hilo"
            role="group"
            aria-label="Meses"
            style={{ "--columnas": meses.length } as CSSProperties}
            onPointerDown={alEmpezarArrastre}
            onPointerOver={alArrastrar}
          >
            {meses.map((m, i) => {
              const r = resultados?.find((x) => x.mes === m.mes)?.resultado ?? null;
              const cubre = dosEnMovimiento ? (i >= dosEnMovimiento[0] && i <= dosEnMovimiento[1] ? "entero" : "no") : cubreElMes(m, p, una);
              const dicho = r === null ? m.nombre : r === 0 ? `${m.nombre}, sin ganancia ni pérdida` : `${m.nombre}, ${r < 0 ? "perdiste" : "ganaste"} ${soles(Math.abs(r))}`;
              return (
                <button
                  key={m.mes}
                  type="button"
                  className="estados-cal-hilo-mes"
                  data-i={i}
                  data-anio={m.anio ?? undefined}
                  data-cubre={cubre}
                  aria-pressed={cubre === "entero"}
                  aria-label={dicho}
                  title={dicho}
                  onClick={() => {
                    if (!ignorarClic.current) elegirMeses(i, i);
                  }}
                >
                  {r !== null && r !== 0 && (
                    <span
                      aria-hidden
                      className="estados-cal-hilo-barra"
                      style={{ "--i": i, "--h": `${alturaDelMes(r, mayorDelMes)}px`, "--f": r < 0 ? "var(--color-rojo)" : "var(--color-verde)" } as CSSProperties}
                    />
                  )}
                  {m.etiqueta}
                </button>
              );
            })}
          </div>
          <div className="estados-cal-paginado">
          <div className="estados-cal-paginas">
            <button type="button" className="estados-fecha-flecha area-dedo" disabled={visible <= visibleMinimo} aria-label="Meses anteriores" onClick={() => setVisible((v) => sumarMeses(v, -1))}>
              <ChevronLeft aria-hidden className="h-4 w-4" />
            </button>
            <button type="button" className="estados-fecha-flecha area-dedo" disabled={visible >= mesHoy} aria-label="Meses siguientes" onClick={() => setVisible((v) => sumarMeses(v, 1))}>
              <ChevronRight aria-hidden className="h-4 w-4" />
            </button>
          </div>
          <div className="estados-cal-meses" data-uno={enCelular || undefined} onKeyDown={alTeclearDias} onPointerOver={alPasarPorDias}>
            {diasPorMes.map(({ mes, huecos, dias }) => (
              <div key={mes} className="estados-cal-mes">
                <div className="estados-cal-mes-nombre">{nombreDelMes(mes)}</div>
                <div className="estados-cal-semana" aria-hidden>
                  {DIAS_DE_LA_SEMANA.map((d, i) => (
                    <span key={i}>{d}</span>
                  ))}
                </div>
                <div className="estados-cal-dias" role="group" aria-label={nombreDelMes(mes)}>
                  {Array.from({ length: huecos }, (_, i) => (
                    <span key={i} />
                  ))}
                  {dias.map((d, i) => {
                    const m = marcaDelDia(d.iso, tramo, hoy);
                    const punto = intensidadDelDia(ventas[d.iso], mayorDelDia);
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        className="estados-cal-dia tabular-nums"
                        disabled={d.apagado}
                        title={d.motivo ?? undefined}
                        tabIndex={d.iso === conTab ? 0 : -1}
                        data-dia={d.iso}
                        data-tramo={(m.dentro && !m.solo) || undefined}
                        data-punta={m.inicio ? "inicio" : m.fin ? "fin" : m.solo ? "solo" : undefined}
                        data-hoy={m.hoy || undefined}
                        data-izquierda={m.bordeIzquierdo || undefined}
                        data-derecha={m.bordeDerecho || undefined}
                        aria-label={fechaLarga(d.iso)}
                        aria-pressed={m.dentro}
                        aria-current={m.hoy ? "date" : undefined}
                        style={{ "--i": i } as CSSProperties}
                        onClick={() => elegirDia(d.iso)}
                      >
                        {d.n}
                        {punto > 0 && <i aria-hidden style={{ "--n": punto } as CSSProperties} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          </div>
          <div className="estados-cal-leyenda">
            {mayorDelDia > 0 && (
              <span className="estados-cal-leyenda-ventas">
                <i style={{ "--n": 0.3 } as CSSProperties} />
                <i style={{ "--n": 0.6 } as CSSProperties} />
                <i style={{ "--n": 1 } as CSSProperties} />
                Días con más ventas
              </span>
            )}
            <span className="estados-cal-leyenda-hoy">
              <i />
              Hoy
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  if (enCelular) {
    return (
      <Modal titulo={titulo} onClose={onCerrar} conCerrar focoEnLaHoja tamano="ancha" alCerrarEnfocar={volverA}>
        <div className={`${letraEstados.variable} estados-vidrio`}>{cuerpo}</div>
      </Modal>
    );
  }
  if (!pos || !destino) return null;
  return createPortal(
    <>
      {/* Tocar afuera cierra, como `SelectorMes` y `MenuAcciones`. */}
      <div className="fixed inset-0 z-[59]" onClick={onCerrar} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-labelledby={idTitulo}
        style={{ top: pos.top, right: pos.right, maxHeight: `calc(100dvh - ${pos.top}px - 12px)` }}
        className={`${letraEstados.variable} estados-vidrio placa-estados estados-cal z-[60]`}
      >
        {cuerpo}
      </div>
    </>,
    destino,
  );
}
