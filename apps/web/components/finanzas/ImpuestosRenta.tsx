"use client";

import { useState } from "react";
import Link from "next/link";
import { Receipt, Settings2 } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { Superficie } from "@/components/finanzas/kit";
import { solesRedondo, textoMes } from "@/lib/gastos-reglas";
import { proveedoresSinFactura, type RentaPantalla } from "@/lib/renta-anual-reglas";
import { ProveedoresSinFactura } from "@/components/finanzas/ImpuestosProveedores";

// Finanzas ▸ Impuestos, la renta de marzo (ADR-0598): cuánto tocaría pagar por el año, cuánto ya se pagó a cuenta y cuánto de esa renta es por
// lo que no tiene factura. Las cifras las arma `lib/renta-anual-reglas.ts`; aquí solo se dibujan. Es una estimación y lo dice.

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

export function RentaDelAno({ renta, falla, guia }: { renta: RentaPantalla | null; falla: string | null; guia?: string }) {
  const [verProveedores, setVerProveedores] = useState(false);
  if (!renta) {
    return (
      <Superficie pad className="anim-sube" guia={guia}>
        <div className="fin-imp-cab">
          <h3 className="fin-imp-titulo">Renta del año</h3>
        </div>
        <Vacio tamano="chico" icono={<Settings2 />} accion={{ texto: "Revisa Configuración ▸ Impuestos", href: "/configuracion?tab=impuestos" }}>
          {falla ?? "Todavía no se puede estimar la renta del año."}
        </Vacio>
      </Superficie>
    );
  }

  const r = renta.proyeccion;
  // La barra dice «desde octubre»: lo medido, no lo proyectado al año (la hoja de proveedores también lista lo medido).
  const s = renta.medido;
  const conPapel = s.inventario.sustenta + s.gasto.sustenta + s.boletasQueRestan;
  const sinPapel = s.inventario.noSustenta + s.gasto.noSustenta + s.boletasQueNoRestan;
  const total = conPapel + sinPapel;
  const desde = textoMes(renta.desdeSistema.slice(0, 7));

  return (
    <Superficie pad className="anim-sube" guia={guia}>
      <div className="fin-imp-cab">
        <h3 className="fin-imp-titulo">Renta de {renta.anio}</h3>
        <Chip tono="pizarra">Se paga en marzo {renta.anio + 1}</Chip>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="text-sm text-taupe">Faltaría pagar en marzo</p>
          <p className="fin-imp-vendido">{solesRedondo(r.faltaEnMarzo)}</p>
          <dl className="mt-2 space-y-1 text-[15px] text-tinta">
            <div className="flex justify-between gap-4">
              <dt>Renta estimada del año</dt>
              <dd className="tabular-nums">{solesRedondo(r.renta)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>− Ya pagado a cuenta (el 1 % de cada mes)</dt>
              <dd className="tabular-nums">{solesRedondo(r.pagosACuenta)}</dd>
            </div>
          </dl>
          {r.cuestaSinFactura > 0 && (
            <Aviso tono="atencion" chico className="mt-3" titulo={`${solesRedondo(r.cuestaSinFactura)} de esa renta es por lo que no tiene factura`}>
              Con factura en todo, la renta del año sería {solesRedondo(r.rentaConFactura)}. Cada sol sin factura paga {Math.round(r.tasaMarginal * 1000) / 10} céntimos de renta.
            </Aviso>
          )}
        </div>

        <div>
          <p className="text-sm text-taupe">Lo que compraste desde {desde}, según su papel</p>
          {total > 0 ? (
            <>
              <BarraApilada
                className="mt-2"
                etiqueta={`De ${solesRedondo(total)} comprados, ${solesRedondo(conPapel)} restan en la renta y ${solesRedondo(sinPapel)} no`}
                segmentos={[
                  { clave: "con", nombre: "Resta (factura o boleta en el tope)", valor: conPapel, clase: "bg-verde" },
                  { clave: "sin", nombre: "No resta (sin factura)", valor: sinPapel, clase: "bg-rojo" },
                ]}
                formato={solesRedondo}
              />
              <ul className="mt-2 space-y-1 text-sm text-tinta">
                <li className="flex items-center gap-2">
                  <MuestraTramo clase="bg-verde" />
                  Resta: {solesRedondo(conPapel)} ({pct(conPapel, total)} %)
                </li>
                <li className="flex items-center gap-2">
                  <MuestraTramo clase="bg-rojo" />
                  No resta: {solesRedondo(sinPapel)} ({pct(sinPapel, total)} %)
                </li>
              </ul>
              {sinPapel > 0 && (
                <button
                  type="button"
                  className="btn-cayla btn-secundario btn-chico mt-3"
                  onClick={() => setVerProveedores(true)}
                  aria-haspopup="dialog"
                  data-guia="fin-impuestos.pedir-factura"
                >
                  A quién pedirle factura
                </button>
              )}
            </>
          ) : (
            <Vacio tamano="chico" icono={<Receipt />}>
              Todavía no hay compras ni gastos registrados desde {desde}.
            </Vacio>
          )}
        </div>
      </div>

      <p className="fin-tenue mt-4 text-sm">
        {renta.previoCargado
          ? `Enero a ${textoMes(`${renta.anio}-${String(renta.mesesAntes).padStart(2, "0")}`).split(" ")[0]}, de tu contador; desde ${desde}, del sistema, y lo que falta del año a ese ritmo.`
          : renta.mesesAntes > 0
            ? `Proyectado a un año con lo que el sistema tiene desde ${desde}. `
            : "Proyectado a un año al ritmo de lo que va. "}
        {!renta.previoCargado && renta.mesesAntes > 0 && (
          <Link href="/configuracion?tab=impuestos" className="btn-enlace">
            Carga lo de tu contador
          </Link>
        )}
        {" "}Es una estimación: la confirma tu contador.
      </p>
      {verProveedores && (
        <ProveedoresSinFactura lista={proveedoresSinFactura(renta.filas, r.tasaMarginal)} desde={desde} tasa={r.tasaMarginal} onCerrar={() => setVerProveedores(false)} />
      )}
    </Superficie>
  );
}
