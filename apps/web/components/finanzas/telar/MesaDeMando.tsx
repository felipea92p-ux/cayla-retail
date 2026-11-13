"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { BotonEnlace } from "@/components/ui/campos";
import { TeToca } from "@/components/finanzas/telar/TeToca";
import { SelectorMes } from "@/components/ui/SelectorMes";
import { ESTADOS } from "@/lib/estados-financieros-reglas";
import { bordesQueFaltan } from "@/lib/fila-desliza-reglas";
import { rutaActiva } from "@/lib/menu";
import {
  aceptaVariasSedes,
  alcanceDeRuta,
  avisoDeAUna,
  dichoDelAlcance,
  alternarSede,
  claveDeSedes,
  dichoDeLaSede,
  DICHO_EMPRESA_SIN_BALANCE,
  esBalanceDeEmpresa,
  hilosDeLaRuta,
  hrefTelar,
  mesDeLaRuta,
  mesTelar,
  MOTIVO_SEDE_NO_APLICA,
  rotuloDeSedes,
  SEDE_EMPRESA,
  sedesDeLaUrl,
  sedesElegidas,
  sedesMarcadas,
  SEDE_TODAS,
  type ClaveSede,
  type SedeTelar,
  ultimoMesDeLaRuta,
} from "@/lib/finanzas-telar-reglas";

/** El Resumen elige sus fechas con el calendario de Estados financieros, en su cabecera. */
const RUTA_RESUMEN = "/finanzas/resumen";

const conRegistrar = (href: string) => `${href}${href.includes("?") ? "&" : "?"}registrar=1`;

/** El lugar de la barra donde una pantalla puede colgar su propio ajuste, junto al mes. */
export const SLOT_AJUSTES_RESUMEN = "slot-ajustes-resumen";

export type SubmoduloTelar = { clave: string; etiqueta: string; ruta: string };

/**
 * La mesa de mando de Finanzas (El telar, Felipe 2026-10-23): la barra fija que comparten los seis submódulos. Una fila: «Ver
 * sede» con un botón por sede (se marcan una, varias o «Todas»), el mes, «Te toca» y «Registrar gasto». La sede y el mes viven en
 * la URL (`?sede=<id>,<id>`, `?mes=`) y viajan al cambiar de submódulo, también por el menú lateral: una sola elección para todo
 * Finanzas. Las pestañas de los submódulos se fueron (Felipe 2026-10-24): repetían el menú lateral. Se monta una vez, en
 * `app/(app)/finanzas/layout.tsx`; un submódulo no tiene que hacer nada para tenerla.
 */
export function MesaDeMando({
  submodulos,
  sedes: sedesBase,
  veTodo: veTodoBase,
  sedesEstados,
  sedePropia,
  mesDeHoy,
  puedeRegistrarGasto,
  leidaEn,
}: {
  submodulos: SubmoduloTelar[];
  /** Los hilos que la cuenta puede elegir (quien no ve todo: solo el suyo). */
  sedes: SedeTelar[];
  veTodo: boolean;
  /** ADR-0585: todos los hilos, para Estados financieros, si la cuenta tiene el módulo y no ve todo Finanzas (`hilosDeLaRuta`). */
  sedesEstados: SedeTelar[] | null;
  sedePropia: ClaveSede | null;
  /** «2026-10»: el último mes que se puede elegir. */
  mesDeHoy: string;
  /** La cuenta ve Gastos: «Registrar gasto» queda a mano desde los seis submódulos. */
  puedeRegistrarGasto: boolean;
  /** Cuándo se dibujó el layout: cambia con cada `router.refresh()`, y «Te toca» vuelve a preguntar. */
  leidaEn: number;
}) {
  const pathname = usePathname();
  const { sedes, veTodo } = hilosDeLaRuta(pathname, { sedes: sedesBase, veTodo: veTodoBase }, sedesEstados);
  const sp = useSearchParams();
  const router = useRouter();
  const actuales = [...sp.entries()];
  const elegidas = sedesElegidas(sedesDeLaUrl({ sede: sp.get("sede"), ver: sp.get("ver") }), sedes, veTodo, sedePropia);
  // En Cierre de mes el mes en curso no se ofrece (nunca se cierra): la barra parte del anterior, como la página.
  const mes = mesDeLaRuta(pathname, sp.get("mes"), mesDeHoy);
  const [anio, m] = mes.split("-").map(Number) as [number, number];
  const [anioHoy, mHoy] = ultimoMesDeLaRuta(pathname, mesDeHoy).split("-").map(Number) as [number, number];

  const aqui = (cambios: { sede?: ClaveSede; mes?: string }) => hrefTelar(pathname, actuales, cambios, { mismaPantalla: true, mesDeHoy });
  // Esta pantalla todavía mira de a una sede: tocar una la deja sola, y si en la URL vienen varias (de otra pantalla) se dice.
  const deAUna = !aceptaVariasSedes(pathname);
  const variasSinJuntar = deAUna && elegidas.length > 1;
  const puedeElegir = veTodo && sedes.length > 1;
  const alcance = alcanceDeRuta(pathname);
  const sedeNoAplica = alcance.sede === "toda";
  // En una pantalla que todavía no suma varias, se dice: si no, tocar una segunda sede y ver que reemplaza a la primera parece una falla.
  const empresaSinBalance = esBalanceDeEmpresa(pathname, elegidas);
  const dicho = sedeNoAplica
    ? dichoDelAlcance(alcance)!
    : empresaSinBalance
    ? DICHO_EMPRESA_SIN_BALANCE
    : variasSinJuntar
    ? "Esta pantalla aún no suma varias: muestra todas. Toca una para verla sola."
    : deAUna && elegidas.length === 1
      ? `${dichoDeLaSede(elegidas, sedes)} (aquí, una a la vez)`
      : dichoDeLaSede(elegidas, sedes);
  const dichoMes = !sedeNoAplica && !alcance.mes ? `${dicho}. ${dichoDelAlcance(alcance)}` : dicho;
  const marcadas = sedesMarcadas(elegidas, deAUna);
  const rotulo = rotuloDeSedes({ sedeNoAplica, variasSinJuntar, empresaSinBalance });
  const apagada = sedeNoAplica ? { disabled: true, title: MOTIVO_SEDE_NO_APLICA } : {};
  // Un aviso por pantalla: explica la primera vez que una sede reemplaza a otra, sin repetirse cada vez que alguien pasa de una tienda a la otra.
  const avisadoEn = useRef<string | null>(null);
  const tocar = (clave: ClaveSede) => {
    const aviso = avisoDeAUna({ deAUna, elegidas, tocada: clave, sedes });
    if (aviso && avisadoEn.current !== pathname) {
      avisadoEn.current = pathname;
      avisar.aviso(aviso);
    }
    router.push(aqui({ sede: claveDeSedes(alternarSede(elegidas, clave, sedes, deAUna), sedes) }), { scroll: false });
  };

  // `FilasQueSeDeslizan` mide al deslizar y al cambiar la ventana; plegar el lateral cambia el ancho de la barra sin nada de eso, y las sedes
  // podían quedar tapadas sin su borde desvanecido.
  const filaSedes = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fila = filaSedes.current;
    if (!fila) return;
    const mide = new ResizeObserver(() => {
      const { izquierda, derecha } = bordesQueFaltan(fila.scrollLeft, fila.clientWidth, fila.scrollWidth);
      fila.toggleAttribute("data-mas-izq", izquierda);
      fila.toggleAttribute("data-mas-der", derecha);
    });
    mide.observe(fila);
    return () => mide.disconnect();
  }, []);

  return (
    <header className="mesa-telar">
      <div className="mesa-telar-fila">
        <div ref={filaSedes} className="sedes-telar pildoras-desliza" role="group" aria-label="Qué sedes mirar" data-guia="telar.sedes" data-dice={rotulo.dice || undefined} suppressHydrationWarning>
          <span className="sedes-telar-titulo" title={rotulo.dice ? dicho : undefined}>{rotulo.texto}</span>
          {puedeElegir ? (
            <>
              <button type="button" className="sede-telar" data-color="todas" aria-pressed={marcadas.length === 0} {...apagada} onClick={() => tocar(SEDE_TODAS)}>
                Todas
              </button>
              {sedes.map((s) => {
                const marcada = marcadas.includes(s.clave);
                return (
                  <button key={s.clave} type="button" className="sede-telar" data-color={s.color} aria-pressed={marcada} {...apagada} {...(empresaSinBalance && s.clave === SEDE_EMPRESA ? { title: DICHO_EMPRESA_SIN_BALANCE } : {})} onClick={() => tocar(s.clave)}>
                    <span className="sede-telar-punto" aria-hidden>
                      {marcada && <Check className="h-3 w-3" />}
                    </span>
                    {s.nombre}
                  </button>
                );
              })}
            </>
          ) : (
            sedes.map((s) => (
              <span key={s.clave} className="sede-telar" data-color={s.color} aria-pressed="true" title={sedeNoAplica ? MOTIVO_SEDE_NO_APLICA : undefined}>
                <span className="sede-telar-punto" aria-hidden />
                {s.nombre}
              </span>
            ))
          )}
        </div>
        {/* Los cuatro estados financieros y el Resumen eligen sus fechas con el calendario de su cabecera (ADR-0611; el Resumen desde el camino «A · Bolsillos»,
            Felipe 2026-11-09): un solo control de la fecha en la pantalla. */}
        {!ESTADOS.some((e) => e.ruta === pathname) && pathname !== RUTA_RESUMEN && (
          // El `title` va en la caja de afuera y el `inert` adentro: lo inerte no recibe el mouse, así que junto al `title` el motivo no salía nunca.
          <div className={alcance.mes ? "contents" : "mesa-telar-no-aplica"} title={alcance.mes ? undefined : "Esta pantalla no cambia con el mes"}>
            <div className="contents" inert={!alcance.mes}>
              <SelectorMes
                valor={{ anio, mes: m }}
                actual={{ anio: anioHoy, mes: mHoy }}
                onCambiar={(x) => router.push(aqui({ mes: mesTelar(x.anio, x.mes) }), { scroll: false })}
                guia="telar.mes"
              />
            </div>
          </div>
        )}
        {/* El Resumen cuelga aquí su ícono «Qué se ve» (`AjustesResumen`): solo esa pantalla lo dibuja, el resto de Finanzas no. */}
        <span id={SLOT_AJUSTES_RESUMEN} className="contents" />
        {(puedeElegir || !alcance.mes) && (
          <span className="mesa-telar-dice" role="status" title={puedeElegir ? dichoMes : dichoDelAlcance(alcance)!}>
            {puedeElegir ? dichoMes : dichoDelAlcance(alcance)}
          </span>
        )}
        <TeToca submodulos={submodulos} leidaEn={leidaEn} />
        {/* En Gastos no: su cabecera ya trae «Registrar gasto» (y «Registrar activo» en su pestaña). */}
        {puedeRegistrarGasto && !rutaActiva(pathname, "/finanzas/gastos") && (
          // Abre la hoja de Gastos desde cualquier submódulo, con la sede y el mes elegidos (Gastos la abre al llegar con `?registrar=1`).
          <BotonEnlace href={conRegistrar(hrefTelar("/finanzas/gastos", actuales, {}, { mismaPantalla: false, mesDeHoy }))} peso="primario" className="mesa-telar-registrar" data-guia="telar.registrar" title="Registrar gasto">
            <Plus aria-hidden className="h-4 w-4" />
            <span className="mesa-telar-registrar-texto">Registrar gasto</span>
          </BotonEnlace>
        )}
      </div>
    </header>
  );
}
