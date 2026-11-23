"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Package, SearchX } from "lucide-react";
import { useAlVerse } from "@/components/movimientos/useAlVerse";
import { MiniPase } from "@/components/traslados-pases/MiniPase";
import { Pestanas } from "@/components/ui/Pestanas";
import { coincideBusqueda } from "@/lib/traslados-reglas";
import { PESTANAS, paseInicial, primeroPorHacer, textoDelAnillo, vecinosEnPestana, type PestanaPase } from "@/lib/traslados-pases-reglas";
import type { Billetera as DatosBilletera, PaseDeBilletera } from "@/lib/traslados-billetera";
import { Anillo } from "@/components/ui/Anillo";
import { Buscador } from "@/components/ui/Buscador";
import { Vacio } from "@/components/ui/Vacio";

// La billetera de Traslados (ADR-0355): a la izquierda, los pases apilados por pestaña (Te llegan · Envías · Terminadas) con lo
// que te toca arriba, el anillo del día y el buscador; a la derecha, el pase grande (la página). Elegir un pase es navegar a
// `/inventario/traslados/<id>`: los enlaces de Movimientos y de WhatsApp abren su pase, y «atrás» funciona. En celular se ve una
// cosa a la vez: la billetera, o el pase abierto.

export const RUTA_TRASLADOS = "/inventario/traslados";
export const rutaDelPase = (id: string) => `${RUTA_TRASLADOS}/${id}`;
// Una caja (uuid), un pedido (`pedido-<uuid>`) o lo que hay para enviar a una sede (`enviar-<uuid>`).
const ID_EN_RUTA = /\/inventario\/traslados\/((?:pedido-|enviar-)?[0-9a-f-]{36})/;

type Contexto = { billetera: DatosBilletera; seleccion: string | null; idEnRuta: string | null };
const CtxBilletera = createContext<Contexto | null>(null);

/** La caja anterior y la siguiente del pase abierto, en su pestaña; y la siguiente que te toca (a dónde ir tras sellar). */
export function useVecinos(id: string) {
  const ctx = useContext(CtxBilletera);
  return useMemo(() => {
    if (!ctx) return { anterior: null, siguiente: null, posicion: -1, total: 0, siguientePorHacer: null as PaseDeBilletera | null };
    const pestana = PESTANAS.find((p) => ctx.billetera.pases[p.id].some((x) => x.id === id))?.id;
    const lista = pestana ? ctx.billetera.pases[pestana] : [];
    const v = vecinosEnPestana(lista, id);
    const otrosPorHacer = (["llegan", "envias"] as const).flatMap((p) => ctx.billetera.pases[p]).filter((x) => x.porHacer && x.id !== id);
    return { ...v, total: lista.length, siguientePorHacer: otrosPorHacer[0] ?? null };
  }, [ctx, id]);
}

/** El anillo del día, solo como dibujo: lo que dice va en palabras al lado (Formidable, 2026-10-06: «3/4» no se entendió). */
function AnilloDelDia({ fraccion }: { fraccion: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useAlVerse(ref);
  return (
    <span ref={ref} className="tp-anillo" style={{ "--tp-fraccion": fraccion } as CSSProperties} aria-hidden>
      <svg viewBox="0 0 48 48">
        <circle className="tp-anillo-fondo" cx="24" cy="24" r="20" />
        <circle className="tp-anillo-valor" cx="24" cy="24" r="20" />
      </svg>
    </span>
  );
}

export function Billetera({ billetera, puedeVerVacios, children }: { billetera: DatosBilletera; puedeVerVacios: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const idEnRuta = ID_EN_RUTA.exec(pathname ?? "")?.[1] ?? null;
  const inicial = useMemo(() => paseInicial(billetera.pases), [billetera.pases]);
  const seleccion = idEnRuta ?? inicial?.id ?? null;
  const pestanaDeSeleccion = seleccion ? (PESTANAS.find((p) => billetera.pases[p.id].some((x) => x.id === seleccion))?.id ?? null) : null;
  // Al abrir un pase de otra pestaña (desde un enlace, al pasar a la siguiente caja tras sellar, o porque la caja abierta acaba de
  // terminarse y pasó a Terminadas), la billetera lo acompaña. Se deriva al dibujar (el patrón de React para «estado que sigue a
  // una prop»), no con un efecto: la clave es el pase abierto Y la pestaña donde vive.
  const para = `${seleccion ?? ""}|${pestanaDeSeleccion ?? ""}`;
  const [elegida, setElegida] = useState<{ para: string; pestana: PestanaPase }>({ para, pestana: pestanaDeSeleccion ?? "llegan" });
  if (elegida.para !== para) setElegida({ para, pestana: pestanaDeSeleccion ?? elegida.pestana });
  const pestana = elegida.para !== para ? (pestanaDeSeleccion ?? elegida.pestana) : elegida.pestana;
  const setPestana = (p: PestanaPase) => setElegida({ para, pestana: p });
  const [consulta, setConsulta] = useState("");
  const coincide = (p: PaseDeBilletera) => !consulta.trim() || coincideBusqueda(p.buscable, consulta);
  const lista = billetera.pases[pestana].filter(coincide);
  const k = PESTANAS.findIndex((p) => p.id === pestana);

  // ← → pasa a la caja anterior o siguiente de la pestaña (nunca mientras se escribe ni con una ventana abierta).
  const listaRef = useRef(lista);
  useEffect(() => {
    listaRef.current = lista;
  });
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const objetivo = e.target instanceof Element ? e.target : null;
      if (objetivo?.closest("input, textarea, select, [contenteditable], [role=dialog], [role=listbox]")) return;
      if (document.querySelector("[role=dialog]")) return;
      const actual = seleccion;
      if (!actual) return;
      const v = vecinosEnPestana(listaRef.current, actual);
      const destino = e.key === "ArrowRight" ? v.siguiente : v.anterior;
      if (!destino) return;
      e.preventDefault();
      router.push(rutaDelPase(destino.id), { scroll: false });
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [router, seleccion]);

  const { anillo } = billetera;
  const dia = textoDelAnillo(anillo);
  // A dónde lleva el anillo en el celular: a lo primero que te toca. Solo si el anillo dice que hay algo (su cuenta y los pases salen de
  // dos lecturas de la base): sin pendientes, o si no se encuentra el pase, queda como dibujo y no promete un toque que no lleva a nada.
  const teToca = anillo.pendientes > 0 ? primeroPorHacer(billetera.pases) : null;
  const anilloChico = (
    <Anillo pct={anillo.fraccion * 100} tamano="chico" tono={anillo.pendientes === 0 ? "verde" : "ambar"} decorativa>
      <span className="text-tinta">{anillo.pendientes > 0 ? anillo.pendientes : "✓"}</span>
    </Anillo>
  );
  // La misma píldora del «N de M hoy» de Existencias (`AnilloMision`): 40 px, crema con su línea arena.
  const clasePildora = "tp-dia-chico h-10 shrink-0 items-center rounded-full border border-sand bg-crema";
  return (
    <CtxBilletera.Provider value={{ billetera, seleccion, idEnRuta }}>
      {/* `.tp-marco`: el contenedor que decide si billetera y pase van lado a lado (`traslados-pases.css`), por su ancho y no el de la ventana. */}
      <div className="tp-marco">
        <div className="tp-cols" data-con-pase={idEnRuta ? "" : undefined}>
          <aside data-guia="traslados.billetera" className="tp-billetera" aria-label="Tus cajas">
            {/* Lo de hoy y el buscador. Desde 640 px, la tarjeta arriba y el buscador debajo, como siempre. En el celular (Felipe 2026-11-17:
                «lo de nada pendiente como en existencias») la tarjeta se pliega al anillo chico del sistema, a la derecha del buscador, como
                el «N de M hoy» de Existencias (`AnilloMision`): adentro, cuántas te tocan o un ✓ si no queda nada; ámbar mientras falte y
                verde al día. Las palabras siguen ahí para el lector de pantalla. Es UNA sola pieza que se pliega (`traslados-pases.css`,
                «Lo de hoy en el celular»): la guía la encuentra en los dos anchos.
                Si algo te toca, el anillo es un enlace a esa caja (allá abre «Pendientes»; aquí lo pendiente ES una caja). Al día, no se toca. */}
            <div className="tp-dia-busca">
              <div data-guia="traslados.dia" className="tp-dia">
                <AnilloDelDia fraccion={anillo.fraccion} />
                {teToca ? (
                  <Link
                    href={rutaDelPase(teToca.id)}
                    scroll={false}
                    aria-label="Ir a lo primero que te toca"
                    title={`${dia.titulo}. Toca para ir a lo primero.`}
                    className={`area-dedo ${clasePildora} transition-colors hover:border-taupe`}
                  >
                    {anilloChico}
                  </Link>
                ) : (
                  <span title={`${dia.titulo}. ${dia.detalle}`} className={clasePildora}>
                    {anilloChico}
                  </span>
                )}
                <div className="min-w-0 max-sm:sr-only">
                  <p className="text-sm font-semibold text-tinta">{dia.titulo}</p>
                  <p className="texto-detalle">{dia.detalle}</p>
                </div>
              </div>

              <Buscador guia="traslados.buscador"
                valor={consulta}
                onCambio={setConsulta}
                // Corto, como el de Existencias («Prenda, marca o código…»): con el anillo al lado, a 375 px el de antes («Busca una caja
                // por número, sede o prenda») se cortaba a media palabra. Qué se busca lo dice `etiqueta`.
                placeholder="Número, sede o prenda…" // sugerir-fijo: el buscador no depende de nada elegido antes
                etiqueta="Buscar una caja"
              />
            </div>

            {/* Llegan / Envías / Terminados cambian qué cajas se ven: la pestaña de vista del sistema (ADR-0358). El número de cada una
                es cuántas hay; «por hacer» va en ámbar y con su texto para lector. */}
            <Pestanas
              etiquetaAccesible="Qué cajas ver"
              activa={pestana}
              onCambio={(c) => setPestana(c as PestanaPase)}
              idIndicador="billetera"
              guia="traslados.pestanas"
              className="pestanas-cayla--llenar"
              items={PESTANAS.map((p) => {
                const hay = billetera.pases[p.id].filter(coincide).length;
                const porHacer = consulta.trim() ? 0 : billetera.porHacer[p.id];
                return porHacer > 0
                  ? { clave: p.id, etiqueta: p.nombre, conteo: porHacer, pide: "por hacer", guia: `traslados.pestana-${p.id}` }
                  : { clave: p.id, etiqueta: p.nombre, conteo: hay, tono: "neutro" as const, pide: hay === 1 ? "caja" : "cajas", guia: `traslados.pestana-${p.id}` };
              })}
            />

            <nav data-guia="traslados.pila" className="tp-pila" aria-label={PESTANAS[k].nombre}>
              {lista.length > 0 ? (
                lista.map((p) => <MiniPase key={p.id} pase={p} href={rutaDelPase(p.id)} actual={p.id === seleccion} />)
              ) : (
                consulta.trim() ? (
                  <Vacio tamano="chico" icono={<SearchX />} accion={{ texto: "Borrar la búsqueda", onClick: () => setConsulta("") }}>
                    Ninguna caja con «{consulta.trim()}». Prueba con el número, la sede o la prenda.
                  </Vacio>
                ) : (
                  <Vacio tamano="chico" icono={<Package />}>
                    {pestana === "llegan" ? "Nada viene hacia ti" : pestana === "envias" ? "No tienes envíos en camino" : "Nada terminado todavía"}. Cuando haya, aparece aquí.
                  </Vacio>
                )
              )}
            </nav>
            {pestana === "terminadas" && billetera.terminadasAcotadas && <p className="px-1 text-sm text-tinta/60">Se ven las últimas 30 terminadas.</p>}
            {puedeVerVacios && billetera.vacios > 0 && (
              <p className="px-1 text-sm text-tinta/60">
                {billetera.vacios === 1 ? "1 traslado sin prendas no se muestra" : `${billetera.vacios} traslados sin prendas no se muestran`} (cabeceras vacías de la limpieza de datos).
              </p>
            )}
          </aside>
          <section className="tp-lado-pase min-w-0" aria-label="La caja abierta">
            {children}
          </section>
        </div>
      </div>
    </CtxBilletera.Provider>
  );
}
