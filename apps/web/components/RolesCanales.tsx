"use client";

import { Lock } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Casilla } from "@/components/ui/Casilla";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { alternarCanal, motivoCanalPorLoMio, sinCanales, type CanalVenta, type RolVista } from "@/lib/roles-reglas";
import { avisar } from "@/components/ui/Avisos";

// Los canales de venta que opera un rol (ADR-0607). Como SAP (canal de distribución en la autorización), NetSuite (restricción del rol por
// una dimensión del dato) y Odoo (equipo de ventas): el apartado lleva su canal y el rol dice cuáles opera, sin una pantalla ni un módulo
// por canal. Quien opera la tienda ve y registra los apartados de la tienda; quien opera TikTok, los de TikTok. El Líder opera todos.

export function RolesCanales({
  rol,
  catalogo,
  borrador,
  suma,
  quita,
  editable,
  misCanales,
  onCambiar,
}: {
  rol: RolVista;
  catalogo: readonly CanalVenta[];
  borrador: readonly string[];
  suma: readonly string[];
  quita: readonly string[];
  editable: boolean;
  /** Los canales de quien mira (`null` = líder: da todos). */
  misCanales: readonly string[] | null;
  onCambiar: (canales: string[]) => void;
}) {
  if (catalogo.length < 2 && !editable) return null;

  const alternar = (clave: string) => {
    const despues = alternarCanal(catalogo, borrador, clave);
    const motivo = motivoCanalPorLoMio(catalogo, rol.canales, despues, misCanales);
    if (motivo) {
      avisar.error(motivo);
      return;
    }
    onCambiar(despues);
  };

  return (
    <div className="border-t border-sand px-5 pb-5 pt-4" data-guia="roles.canales">
      <TituloSeccion
        ayuda="Cada apartado y cada venta lleva el canal por donde se vendió (tienda, TikTok…). Un rol solo ve y registra los canales que opera. Quien opera solo TikTok no ve los apartados de la tienda, y al revés."
      >
        Canales de venta
      </TituloSeccion>
      <p className="mt-1 text-sm text-tinta/70">
        {rol.fijo ? "El Líder de equipo opera todos los canales." : "Qué ventas puede ver y registrar este rol."}
      </p>

      <ul className="mt-3 grid gap-2 @[560px]/mod:grid-cols-2" aria-label="Canales de venta">
        {catalogo.map((c) => {
          const marcado = borrador.includes(c.clave);
          const cambia = suma.includes(c.clave) ? "suma" : quita.includes(c.clave) ? "quita" : null;
          const bloqueado = !editable || rol.fijo;
          return (
            <li
              key={c.clave}
              className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 ${marcado ? "border-borde-control bg-hueso/60" : "border-sand"}`}
            >
              <Casilla marcada={marcado} onCambio={() => alternar(c.clave)} etiqueta={`${c.nombre}: ${marcado ? "lo opera" : "no lo opera"}`} disabled={bloqueado} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 text-[15px] text-tinta">
                  {c.nombre}
                  {cambia === "suma" && <span className="text-sm font-semibold text-verde">+ suma</span>}
                  {cambia === "quita" && <span className="text-sm font-semibold text-rojo-profundo">− quita</span>}
                  {rol.fijo && <Lock aria-hidden className="h-3 w-3 text-taupe-profundo" />}
                </span>
                <span className="block text-sm text-tinta/70">{c.esFisico ? "Ventas en la tienda física" : "Ventas que llegan por este canal online"}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {editable && sinCanales(borrador) && (
        <Aviso tono="atencion" className="mt-3" titulo="Este rol no opera ningún canal">
          No vería ni registraría apartados. Enciende al menos uno.
        </Aviso>
      )}
    </div>
  );
}
