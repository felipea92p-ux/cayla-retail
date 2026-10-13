import { cambioBancarioLegible } from "@/lib/proveedores-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import type { CambioBancario } from "@/lib/proveedores";

// «Cambios de la cuenta» en la ficha del proveedor (20261013161000, Felipe 2026-10-13): cada vez que alguien cambió el CCI, la
// cuenta, el Yape o el titular, quién y cuándo. El historial lo escribe la base en la misma transacción que el cambio, así que no
// depende de qué pantalla lo hizo. Sin cambios no se dibuja nada: una ficha recién creada no necesita una tarjeta vacía.
export function CambiosCuentaProveedor({ cambios }: { cambios: CambioBancario[] }) {
  if (cambios.length === 0) return null;
  return (
    <section className="card-cayla p-5">
      <h2 className="label-cayla text-[11px] text-tinta/65">Cambios de la cuenta</h2>
      <p className="mt-1 max-w-prose text-sm text-tinta/65">
        Antes de pagar a una cuenta que cambió, confírmala con el proveedor por teléfono: cambiar la cuenta justo antes de un pago es
        la forma más común de desviarlo.
      </p>
      <ul className="mt-3 divide-y divide-sand">
        {cambios.map((c, i) => {
          const l = cambioBancarioLegible(c.campo, c.antes, c.despues);
          const { dia, hora } = diaYHoraLima(c.cambiadoEn);
          return (
            <li key={`${c.cambiadoEn}-${c.campo}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <span className="min-w-0">
                <b className="font-medium text-tinta">{l.dato}</b>
                <span className="tabular-nums text-tinta/65">: {l.antes}</span>
                <span className="text-tinta/65"> → </span>
                <span className="tabular-nums text-tinta">{l.despues}</span>
              </span>
              <span className="text-xs text-tinta/65">
                {dia} · {hora} · {c.cambiadoPor ?? "sin firma"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
