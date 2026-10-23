"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Pestanas } from "@/components/ui/Pestanas";
import { BotonEnlace } from "@/components/ui/campos";
import { TeToca } from "@/components/finanzas/telar/TeToca";
import { SelectorMes } from "@/components/ui/SelectorMes";
import { rutaActiva } from "@/lib/menu";
import {
  dichoDeLaSede,
  esMesTelar,
  hrefTelar,
  mesTelar,
  sedeDeLaUrl,
  sedeElegida,
  SEDE_TODAS,
  type ClaveSede,
  type SedeTelar,
} from "@/lib/finanzas-telar-reglas";

const conRegistrar = (href: string) => `${href}${href.includes("?") ? "&" : "?"}registrar=1`;

export type SubmoduloTelar = { clave: string; etiqueta: string; ruta: string };

/**
 * La mesa de mando de Finanzas (El telar, Felipe 2026-10-23): la barra fija que comparten los seis submódulos. Arriba, las
 * pestañas de los submódulos que la cuenta ve; abajo, los hilos de sede (elegir una sede es tirar de su hilo: su raya crece) y el
 * mes. La sede y el mes viven en la URL (`?sede=`, `?mes=`) y viajan al cambiar de submódulo: una sola elección para todo
 * Finanzas. Se monta una vez, en `app/(app)/finanzas/layout.tsx`; un submódulo no tiene que hacer nada para tenerla.
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
  const elegida = sedeElegida(sedeDeLaUrl({ sede: sp.get("sede"), ver: sp.get("ver") }), sedes, veTodo, sedePropia);
  const mesUrl = sp.get("mes");
  const mes = esMesTelar(mesUrl) ? mesUrl : mesDeHoy;
  const [anio, m] = mes.split("-").map(Number) as [number, number];
  const [anioHoy, mHoy] = mesDeHoy.split("-").map(Number) as [number, number];

  const activo = submodulos.find((s) => rutaActiva(pathname, s.ruta))?.clave ?? "";
  const aqui = (cambios: { sede?: ClaveSede; mes?: string }) => hrefTelar(pathname, actuales, cambios, { mismaPantalla: true, mesDeHoy });
  const hilos: { clave: ClaveSede; nombre: string; color: string }[] =
    veTodo && sedes.length > 1 ? [{ clave: SEDE_TODAS, nombre: "Todas las sedes", color: "todas" }, ...sedes] : sedes;

  return (
    <header className="mesa-telar">
      <div className="mesa-telar-fila">
        <span className="mesa-telar-palabra">Finanzas</span>
        <Pestanas
          etiquetaAccesible="Submódulos de Finanzas"
          idIndicador="telar-submodulos"
          activa={activo}
          guia="telar.submodulos"
          items={submodulos.map((s) => ({
            clave: s.clave,
            etiqueta: s.etiqueta,
            href: hrefTelar(s.ruta, actuales, {}, { mismaPantalla: false, mesDeHoy }),
          }))}
        />
        <span className="mesa-telar-espacio" />
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
      <div className="mesa-telar-fila mesa-telar-fila-2">
        <nav className="hilos-telar" aria-label="Sede" data-guia="telar.sedes">
          {hilos.map((h) =>
            hilos.length > 1 ? (
              <Link key={h.clave} href={aqui({ sede: h.clave })} scroll={false} className="hilo-telar" data-color={h.color} aria-current={h.clave === elegida ? "true" : undefined}>
                {h.nombre}
              </Link>
            ) : (
              <span key={h.clave} className="hilo-telar" data-color={h.color} aria-current="true">
                {h.nombre}
              </span>
            ),
          )}
        </nav>
        <SelectorMes
          valor={{ anio, mes: m }}
          actual={{ anio: anioHoy, mes: mHoy }}
          onCambiar={(x) => router.push(aqui({ mes: mesTelar(x.anio, x.mes) }), { scroll: false })}
          guia="telar.mes"
        />
        {hilos.length > 1 && <span className="mesa-telar-dice">{dichoDeLaSede(elegida, sedes)}</span>}
      </div>
    </header>
  );
}
