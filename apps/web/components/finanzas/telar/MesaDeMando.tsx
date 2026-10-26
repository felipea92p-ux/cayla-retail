"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { BotonEnlace } from "@/components/ui/campos";
import { TeToca } from "@/components/finanzas/telar/TeToca";
import { SelectorMes } from "@/components/ui/SelectorMes";
import { rutaActiva } from "@/lib/menu";
import {
  aceptaVariasSedes,
  alternarSede,
  claveDeSedes,
  dichoDeLaSede,
  esMesTelar,
  hrefTelar,
  mesTelar,
  sedesDeLaUrl,
  sedesElegidas,
  SEDE_TODAS,
  type ClaveSede,
  type SedeTelar,
} from "@/lib/finanzas-telar-reglas";

const conRegistrar = (href: string) => `${href}${href.includes("?") ? "&" : "?"}registrar=1`;

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
  sedes,
  veTodo,
  sedePropia,
  mesDeHoy,
  puedeRegistrarGasto,
}: {
  submodulos: SubmoduloTelar[];
  /** Los hilos que la cuenta puede elegir (quien no ve todo: solo el suyo). */
  sedes: SedeTelar[];
  veTodo: boolean;
  sedePropia: ClaveSede | null;
  /** «2026-10»: el último mes que se puede elegir. */
  mesDeHoy: string;
  /** La cuenta ve Gastos: «Registrar gasto» queda a mano desde los seis submódulos. */
  puedeRegistrarGasto: boolean;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const actuales = [...sp.entries()];
  const elegidas = sedesElegidas(sedesDeLaUrl({ sede: sp.get("sede"), ver: sp.get("ver") }), sedes, veTodo, sedePropia);
  const mesUrl = sp.get("mes");
  const mes = esMesTelar(mesUrl) ? mesUrl : mesDeHoy;
  const [anio, m] = mes.split("-").map(Number) as [number, number];
  const [anioHoy, mHoy] = mesDeHoy.split("-").map(Number) as [number, number];

  const aqui = (cambios: { sede?: ClaveSede; mes?: string }) => hrefTelar(pathname, actuales, cambios, { mismaPantalla: true, mesDeHoy });
  // Esta pantalla todavía mira de a una sede: tocar una la deja sola, y si en la URL vienen varias (de otra pantalla) se dice.
  const deAUna = !aceptaVariasSedes(pathname);
  const variasSinJuntar = deAUna && elegidas.length > 1;
  const puedeElegir = veTodo && sedes.length > 1;
  // En una pantalla que todavía no suma varias, se dice: si no, tocar una segunda sede y ver que reemplaza a la primera parece una falla.
  const dicho = variasSinJuntar
    ? "Esta pantalla aún no suma varias: muestra todas. Toca una para verla sola."
    : deAUna && elegidas.length === 1
      ? `${dichoDeLaSede(elegidas, sedes)} (aquí, una a la vez)`
      : dichoDeLaSede(elegidas, sedes);
  const tocar = (clave: ClaveSede) => router.push(aqui({ sede: claveDeSedes(alternarSede(elegidas, clave, sedes, deAUna), sedes) }), { scroll: false });

  return (
    <header className="mesa-telar">
      <div className="mesa-telar-fila">
        <div className="sedes-telar" role="group" aria-label="Qué sedes mirar" data-guia="telar.sedes">
          <span className="sedes-telar-titulo">Ver sede</span>
          {puedeElegir ? (
            <>
              <button type="button" className="sede-telar" data-color="todas" aria-pressed={elegidas.length === 0} onClick={() => tocar(SEDE_TODAS)}>
                Todas
              </button>
              {sedes.map((s) => {
                const marcada = elegidas.includes(s.clave);
                return (
                  <button key={s.clave} type="button" className="sede-telar" data-color={s.color} aria-pressed={marcada} onClick={() => tocar(s.clave)}>
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
              <span key={s.clave} className="sede-telar" data-color={s.color} aria-pressed="true">
                <span className="sede-telar-punto" aria-hidden />
                {s.nombre}
              </span>
            ))
          )}
        </div>
        <SelectorMes
          valor={{ anio, mes: m }}
          actual={{ anio: anioHoy, mes: mHoy }}
          onCambiar={(x) => router.push(aqui({ mes: mesTelar(x.anio, x.mes) }), { scroll: false })}
          guia="telar.mes"
        />
        {puedeElegir && (
          <span className="mesa-telar-dice" role="status" title={dicho}>
            {dicho}
          </span>
        )}
        <TeToca submodulos={submodulos} />
        {/* En Gastos no: su cabecera ya trae «Registrar gasto» (y «Registrar activo» en su pestaña). */}
        {puedeRegistrarGasto && !rutaActiva(pathname, "/finanzas/gastos") && (
          // Abre la hoja de Gastos desde cualquier submódulo, con la sede y el mes elegidos (Gastos la abre al llegar con `?registrar=1`).
          <BotonEnlace href={conRegistrar(hrefTelar("/finanzas/gastos", actuales, {}, { mismaPantalla: false, mesDeHoy }))} peso="primario" className="mesa-telar-registrar" data-guia="telar.registrar">
            <Plus aria-hidden className="h-4 w-4" />
            <span className="mesa-telar-registrar-texto">Registrar gasto</span>
          </BotonEnlace>
        )}
      </div>
    </header>
  );
}
