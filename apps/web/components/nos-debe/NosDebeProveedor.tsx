import type { ReactNode } from "react";
import { ChevronDown, PackageCheck } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { soles } from "@/lib/compras-reglas";
import {
  avanceDeDeuda,
  cantidadDePrendas,
  nombreDeDeuda,
  porQueDebe,
  queDebe,
  textoDeDeuda,
  textoDeResolucion,
  type DeudaProveedor,
  type NosDebe,
} from "@/lib/nos-debe-reglas";
import { BotonDeposito } from "./HojaDeposito";
import { BotonReposicion } from "./HojaReposicion";
import { BotonSaldoAFavor } from "./HojaSaldoAFavor";

// «Nos debe» en la ficha del proveedor (ADR-0362, fase 5a, decisiones 14 y 24): lo que el proveedor le debe a CAYLA, junto. Primero las
// PRENDAS por reponer (cada faltante «No vino» de una recepción es una deuda: «2 chompas · S/ 84.00 · ENV-000061 · Tienda Trujillo · hace 3
// días»), cada una con «Llegó la reposición» y, si el proveedor no la va a mandar, «Pasar a saldo a favor» (fase 5b, decisión 58: un documento
// interno por lo que se pagó) o, si ya devolvió esa plata, «Depositó» (actividad 5: el documento y el reembolso juntos); abajo, las que se
// cerraron en los últimos 90 días (plegadas si son muchas). Debajo, la PLATA:
// el saldo a favor de siempre (`children`), que esta sección envuelve. Una debajo de la otra y a todo el ancho: lado a lado, en una laptop
// con el menú abierto, cada deuda se partía en cuatro renglones. Sin estado propio: sirve desde la página del servidor; lo único que se
// toca es el botón, que abre su hoja.

/** Hasta cuántas cerradas se muestran abiertas; con más, se pliegan. */
const CERRADAS_A_LA_VISTA = 3;

export function NosDebeProveedor({
  nosDebe,
  falla,
  proveedorNombre,
  hoy,
  puedeSaldoAFavor = false,
  children,
}: {
  /** `null` con `falla` = la base no respondió. */
  nosDebe: NosDebe | null;
  falla: string | null;
  proveedorNombre: string;
  hoy: string;
  /** Pasar a saldo a favor y «Depositó» mueven plata: Proveedores o líder (`fn_puede_gestionar_proveedores`, la misma regla que la base). */
  puedeSaldoAFavor?: boolean;
  /** El saldo a favor (la plata que el proveedor debe). */
  children?: ReactNode;
}) {
  const abiertas = nosDebe?.abiertas ?? [];
  const cerradas = nosDebe?.cerradas ?? [];
  const unidades = nosDebe?.unidadesPendientes ?? 0;
  return (
    <section id="nos-debe" aria-labelledby="nos-debe-titulo" data-guia="proveedor-ficha.nos-debe" className="scroll-mt-24 space-y-3">
      <TituloSeccion id="nos-debe-titulo">Nos debe</TituloSeccion>
      <div className="space-y-3">
        <div className="card-cayla anim-entra overflow-hidden" style={{ ["--i" as string]: 10 }}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pb-3 pt-4">
            <div>
              <p className="font-display text-lg text-tinta">Prendas por reponer</p>
              <p className="text-xs text-tinta/65">Lo que faltó o llegó dañado en una recepción y el proveedor todavía no repone.</p>
            </div>
            {unidades > 0 && (
              <p className="text-right text-sm tabular-nums text-tinta">
                <b className="font-semibold">{cantidadDePrendas(unidades, null)}</b> · {soles(nosDebe?.montoPendiente ?? 0)}
                {nosDebe?.montoConIgv != null && <span className="block text-[11px] text-taupe">{soles(nosDebe.montoConIgv)} con el IGV de las facturas</span>}
              </p>
            )}
          </div>

          {falla ? (
            <div className="px-5 pb-4">
              <Aviso tono="atencion" chico>
                {falla}
              </Aviso>
            </div>
          ) : abiertas.length === 0 ? (
            <div className="border-t border-tinta/10 px-5 py-4">
              <Vacio tamano="chico" alinear="izquierda" icono={<PackageCheck />}>
                No te debe prendas. Aparece aquí lo que falte en una recepción («No vino») y lo que le devuelvas desde Dañadas por llegar dañado.
              </Vacio>
            </div>
          ) : (
            // Las columnas de cada deuda las decide el ancho de la tarjeta (`@container`), no el de la ventana: con el menú abierto en una laptop,
            // los tres botones a la derecha dejaban al texto en una tira de cuatro renglones. Hasta 56rem, los botones van debajo.
            <ul className="@container divide-y divide-tinta/10 border-t border-tinta/10">
              {abiertas.map((d) => (
                <FilaDeuda key={d.diferenciaId} deuda={d} proveedorNombre={proveedorNombre} hoy={hoy} puedeSaldoAFavor={puedeSaldoAFavor} />
              ))}
            </ul>
          )}

          {cerradas.length > 0 && (
            <details data-guia="proveedor-ficha.nos-debe-cerradas" className="group border-t border-tinta/10" open={cerradas.length <= CERRADAS_A_LA_VISTA}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-[13px] text-tinta/75 hover:text-tinta [&::-webkit-details-marker]:hidden">
                <span>
                  Ya saldadas en los últimos 90 días <span className="tabular-nums">({cerradas.length.toLocaleString("es-PE")})</span>
                </span>
                <ChevronDown aria-hidden className="h-4 w-4 shrink-0 transition-transform duration-300 ease-cayla group-open:rotate-180" />
              </summary>
              <ul className="divide-y divide-tinta/10 border-t border-tinta/10">
                {cerradas.map((d) => (
                  <li key={d.diferenciaId} className="px-5 py-2.5">
                    <p className="text-[13px] text-tinta">
                      {cantidadDePrendas(d.cantidad, d.categoria)}
                      {d.marca && <> · {d.marca}</>}
                      {d.descripcion && <span className="text-tinta/65"> · {d.descripcion}</span>}
                    </p>
                    <p className="text-xs text-tinta/65">{porQueDebe(d, hoy)}</p>
                    {d.resoluciones.map((r, i) => (
                      <p key={i} className="text-xs text-verde">
                        {textoDeResolucion(r, hoy)}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

function FilaDeuda({
  deuda: d,
  proveedorNombre,
  hoy,
  puedeSaldoAFavor,
}: {
  deuda: DeudaProveedor;
  proveedorNombre: string;
  hoy: string;
  puedeSaldoAFavor: boolean;
}) {
  const avance = avanceDeDeuda(d);
  return (
    <li data-guia="proveedor-ficha.deuda" aria-label={textoDeDeuda(d, hoy)} className="grid gap-x-4 gap-y-2 px-5 py-3 @min-[56rem]:grid-cols-[minmax(0,1fr)_auto] @min-[56rem]:items-center">
      <div className="min-w-0">
        <p className="text-sm text-tinta">
          <b className="font-semibold">{queDebe(d)}</b>
          {d.marca && <> · {d.marca}</>}
          {d.descripcion && <span className="text-tinta/65"> · {d.descripcion}</span>}
        </p>
        <p className="mt-0.5 text-xs text-tinta/65" title={[nombreDeDeuda(d), d.orden].filter(Boolean).join(" · ")}>
          {porQueDebe(d, hoy)}
          {avance && <> · {avance}</>}
        </p>
        {d.nota && (
          <p className="mt-0.5 truncate text-xs text-tinta/65">
            Nota de la {d.causa === "devuelta" ? "devolución" : "recepción"}: «{d.nota}»
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 @min-[56rem]:justify-end">
        <p className="text-right">
          <span className="block text-sm tabular-nums text-tinta">{soles(d.montoPendiente)}</span>
          {d.conIgv && <span className="block text-[11px] text-taupe">{d.montoConIgv != null ? `${soles(d.montoConIgv)} con IGV` : "sin IGV"}</span>}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {puedeSaldoAFavor && <BotonDeposito deuda={d} proveedorNombre={proveedorNombre} hoy={hoy} />}
          {puedeSaldoAFavor && <BotonSaldoAFavor deuda={d} proveedorNombre={proveedorNombre} hoy={hoy} />}
          <BotonReposicion deuda={d} proveedorNombre={proveedorNombre} hoy={hoy} />
        </div>
      </div>
    </li>
  );
}
