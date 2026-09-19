"use client";

import type { CSSProperties } from "react";
import { soles } from "@/lib/compras-reglas";
import type { ResumenProveedores } from "@/lib/proveedores";
import type { TramoDeuda } from "@/lib/proveedores-reglas";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";

// Las cifras de arriba de la lista (ADR-0111; movidas del servidor a un componente cliente en ADR-0128).
// Nada del contenido cambió: son las mismas tarjetas y los mismos textos que `page.tsx` armaba. Lo nuevo
// son dos cosas que necesitan estado del navegador:
//   · las cifras se «arman» al llegar (cuentan desde 0, una vez) y CUENTAN hasta su valor nuevo cuando
//     cambian (registrar o desactivar un proveedor mueve «activos» y «deuda») — `useContar`;
//   · la barra de «Concentración»: cada tramo es un proveedor. Apuntarlo enciende su fila en la tabla y
//     apaga las demás (`onFoco`); tocarlo abre su vista rápida (`onAbrir`). «34 %» no decía QUIÉN.
//
// El tramo «Resto» no es un proveedor: se dibuja pero no responde a nada.
const COLOR_TRAMO = ["bg-tinta", "bg-tinta/60", "bg-tinta/30", "bg-sand"];

// Entrada escalonada: cada tarjeta llega 38 ms después de la anterior (`--i`, ver globals.css).
const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

export function ProveedoresIndicadores({
  resumen,
  reparto,
  foco,
  onFoco,
  onAbrir,
}: {
  resumen: ResumenProveedores;
  reparto: TramoDeuda[];
  foco: string | null;
  onFoco: (id: string | null) => void;
  onAbrir: (id: string) => void;
}) {
  // La quinta cifra (saldo a favor) solo aparece cuando algún proveedor le debe algo a CAYLA: sin nada a favor
  // no hay qué mostrar, y la banda queda como siempre.
  const conFavor = (resumen.saldoFavorTotal ?? 0) > 0;
  const deuda = resumen.deudaTotal ?? 0;
  const vencidas = resumen.conVencidas ?? 0;
  const sin90 = resumen.sinCompras90d ?? 0;

  return (
    <div className={`grid grid-cols-2 gap-3 ${conFavor ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
      <TarjetaCifra compacta {...entra(1)} punto="neutro" etiqueta="Proveedores activos" valor={<CifraQueCuenta valor={resumen.activos} alMontar />}>
        {resumen.desactivados === 0 ? "Ninguno desactivado" : `${resumen.desactivados.toLocaleString("es-PE")} ${resumen.desactivados === 1 ? "desactivado" : "desactivados"}`}
      </TarjetaCifra>
      <TarjetaCifra
        compacta
        {...entra(2)}
        punto={deuda > 0 ? "ambar" : "verde"}
        detalleTono={vencidas > 0 ? "text-rojo" : undefined}
        etiqueta="Deuda con proveedores"
        valor={<CifraQueCuenta valor={deuda} formato="soles" alMontar />}
      >
        {deuda > 0 ? `${resumen.conSaldo} con saldo${vencidas > 0 ? ` · ${vencidas} con comprobantes vencidos` : ""}` : "Nada por pagar"}
      </TarjetaCifra>
      {resumen.topProveedorNombre && resumen.topPct != null ? (
        <TarjetaCifra compacta {...entra(3)} punto="neutro" etiqueta="Concentración" valor={<CifraQueCuenta valor={resumen.topPct} formato="porcentaje" alMontar />}>
          {(resumen.conSaldo ?? 0) > 3 && resumen.top3Pct != null
            ? `${resumen.topProveedorNombre} · los 3 mayores suman el ${Math.round(resumen.top3Pct)} %`
            : `${resumen.topProveedorNombre} concentra la deuda`}
          {reparto.length > 0 && (
            <span role="group" aria-label="Reparto de la deuda por proveedor" className="mt-2.5 flex h-2 gap-[3px]" onMouseLeave={() => onFoco(null)}>
              {reparto.map((t, i) =>
                t.id ? (
                  <button
                    key={t.id}
                    type="button"
                    title={`${t.nombre} · ${soles(t.monto)}`}
                    aria-label={`${t.nombre}: ${soles(t.monto)}, ${Math.round(t.pct)} % de la deuda`}
                    onMouseEnter={() => onFoco(t.id)}
                    onFocus={() => onFoco(t.id)}
                    onBlur={() => onFoco(null)}
                    onClick={() => onAbrir(t.id!)}
                    style={{ flex: t.monto, ["--i" as string]: i + 3 }}
                    className={`anim-crece-x h-full min-w-1 rounded-[3px] transition-[opacity,transform] duration-200 ease-cayla hover:scale-y-[1.7] focus-visible:scale-y-[1.7] ${COLOR_TRAMO[i]} ${foco && foco !== t.id ? "opacity-35" : ""}`}
                  />
                ) : (
                  <span key="resto" aria-hidden style={{ flex: t.monto, ["--i" as string]: i + 3 }} className={`anim-crece-x h-full min-w-1 rounded-[3px] transition-opacity duration-200 ${COLOR_TRAMO[i]} ${foco ? "opacity-35" : ""}`} />
                ),
              )}
            </span>
          )}
        </TarjetaCifra>
      ) : (
        <TarjetaCifra compacta vacia {...entra(3)} etiqueta="Concentración" valor="—">
          Aparece cuando haya deuda
        </TarjetaCifra>
      )}
      <TarjetaCifra
        compacta
        {...entra(4)}
        punto={sin90 > 0 ? "ambar" : "verde"}
        detalleTono={sin90 > 0 ? "text-ambar-profundo" : "text-verde-profundo"}
        etiqueta="Sin compras en 90 días"
        valor={<CifraQueCuenta valor={sin90} alMontar />}
      >
        {sin90 > 0 ? "Revisa si siguen siendo proveedores" : "Nadie inactivo por revisar"}
      </TarjetaCifra>
      {conFavor && (
        <TarjetaCifra compacta {...entra(5)} punto="verde" tono="text-verde-profundo" detalleTono="text-verde-profundo" etiqueta="A favor con proveedores" valor={<CifraQueCuenta valor={resumen.saldoFavorTotal ?? 0} formato="soles" alMontar />}>
          {resumen.conSaldoFavor === 1 ? "1 proveedor te debe" : `${resumen.conSaldoFavor} proveedores te deben`} · se descuenta al pagar
        </TarjetaCifra>
      )}
    </div>
  );
}
