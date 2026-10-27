"use client";

import { useMemo } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { MuestraTramo } from "@/components/ui/BarraApilada";
import { Linea, topeRedondo } from "@/components/ui/Linea";
import { diasEntre, fechaEnPalabras, sumarDias } from "@/lib/caja-proxima-reglas";
import { queFaltaEnLaProyeccion, soles } from "@/lib/flujo-caja-reglas";
import { cajaConCompra, saldoBase } from "@/lib/inversion-mercaderia-reglas";
import type { PagoDeCompra } from "@/lib/plan-compra-inversion";
import { alertaDeLaCaja, leerLaCaja, pagosEnSoles, type AlertaDeCaja, type FlujoDelPlan } from "@/lib/plan-compra-pagar";
import { fechaCortaES } from "@/lib/plan-compra-reglas";

// «Así quedaría tu caja» (ADR-0527, spike ⑤ «Así se ve en Finanzas»): la caja de las próximas 12 semanas que Finanzas ya proyecta, con los pagos de esta compra restados el día en que caen, el mínimo de caja
// que el dueño escribió y el último día para pedir. Es la misma cuenta y la misma gráfica que «Pagar la compra» del Resumen de Finanzas (`cajaConCompra`, `Linea`): si algo cambia en una, cambia en las dos.
// Mirar no guarda nada. Se mueve con lo que la persona arma a la izquierda (tandas y formas de pago), sin guardar.
//
// CAÍDA EXTERNA. La caja es de CAYLA entera y la base se la da solo a un líder de equipo: sin permiso, la pieza lo dice y el plan de pagos sigue. Si no responde, lo dice sin cifras: nunca una caja inventada.

const TONO_DE_LA_ALERTA: Record<AlertaDeCaja["tono"], "error" | "atencion" | "exito" | "info"> = { urgente: "error", atencion: "atencion", ok: "exito", info: "info" };

export function CajaConLaCompra({ flujo, pagos, saleDeCaja, limite }: { flujo: FlujoDelPlan | null; pagos: readonly PagoDeCompra[]; saleDeCaja: number; /** El último día para pedir; null = la campaña ya empezó. */ limite: string | null }) {
  const caja = useMemo(() => leerLaCaja(flujo), [flujo]);
  const calculo = useMemo(() => {
    if (!caja) return null;
    const conCompra = cajaConCompra(caja, pagosEnSoles(pagos, saleDeCaja, caja.hoy));
    const sinLaCompra = cajaConCompra(caja, []);
    return { conCompra, sinLaCompra, base: saldoBase(caja), alerta: alertaDeLaCaja(caja, conCompra, sinLaCompra) };
  }, [caja, pagos, saleDeCaja]);

  if (flujo === null) return null;
  if (flujo.estado === "sin_permiso") {
    return (
      <Aviso tono="info" chico titulo="La caja la ve un líder de equipo">
        La caja de las próximas semanas es de toda CAYLA y solo la ve un líder de equipo. Tu plan de pagos sigue igual; pídele a un líder que mire cómo queda.
      </Aviso>
    );
  }
  if (!caja || !calculo || !calculo.conCompra) {
    return (
      <Aviso tono="atencion" chico titulo="No se pudo leer tu caja">
        {flujo.estado === "falla" ? "La base no respondió." : "La caja llegó sin semanas."} Vuelve a cargar la página; si sigue, avísale a tu líder. Tu plan de pagos no cambia.
      </Aviso>
    );
  }

  const { conCompra, base, alerta } = calculo;
  // Finanzas marca su caja «provisional» mientras le falten saldos de arranque, días de ventas o facturas: lo que se ve aquí hereda ese límite y se dice, para no parecer más seguro de lo que es.
  const { provisional, faltan } = queFaltaEnLaProyeccion(caja);
  const ultimo = base.at(-1)!;
  const menor = Math.min(0, ...conCompra.puntos.map((x) => x.saldo), ...base.map((x) => x.saldo));
  const diasAlLimite = limite ? diasEntre(caja.hoy, limite) : null;
  const marcas = [0, 28, 56, ultimo.dia].filter((x, k, a) => x <= ultimo.dia && a.indexOf(x) === k);
  return (
    <div className="space-y-3" data-guia="pagos.caja">
      <Linea
        etiqueta={`Tu caja con esta compra: ${alerta.titulo}. ${alerta.detalle}`}
        serie={conCompra.puntos.map((x) => ({ x: x.dia, y: x.saldo }))}
        proyeccion={base.map((x) => ({ x: x.dia, y: x.saldo }))}
        referencia={caja.minimoCaja > 0 ? [{ x: 0, y: caja.minimoCaja }, { x: ultimo.dia, y: caja.minimoCaja }] : null}
        desde={0}
        hasta={ultimo.dia}
        minY={menor < 0 ? -topeRedondo(-menor) : 0}
        marcasX={marcas.map((x) => ({ x, texto: x === 0 ? "hoy" : fechaCortaES(sumarDias(caja.hoy, x)), fuerte: x === 0 }))}
        cifraReferencia={caja.minimoCaja > 0 ? { valor: soles(caja.minimoCaja), texto: "mínimo" } : null}
        ahora={diasAlLimite !== null && diasAlLimite > 0 && diasAlLimite < ultimo.dia ? { x: diasAlLimite, texto: `pedir antes del ${fechaCortaES(limite!)}` } : null}
        leer={(x) => {
          const p = conCompra.puntos.reduce((a, b) => (Math.abs(b.dia - x) < Math.abs(a.dia - x) ? b : a));
          const sin = base.reduce((a, b) => (Math.abs(b.dia - p.dia) < Math.abs(a.dia - p.dia) ? b : a));
          return (
            <>
              <b>{p.dia === 0 ? "Hoy" : fechaEnPalabras(p.fecha)}</b>
              <span>Con la compra: {soles(p.saldo)}</span>
              <span>Sin la compra: {soles(sin.saldo)}</span>
            </>
          );
        }}
        alto={220}
      />
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-taupe">
        <span className="inline-flex items-center gap-1.5">
          <MuestraTramo clase="bg-tinta" /> Con esta compra
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MuestraTramo clase="bg-tinta/30" /> Sin la compra
        </span>
        {caja.minimoCaja > 0 && <span>Línea punteada: tu mínimo de caja</span>}
      </p>
      <Aviso tono={TONO_DE_LA_ALERTA[alerta.tono]} chico titulo={alerta.titulo}>
        {alerta.detalle}
      </Aviso>
      {provisional && (
        <Aviso tono="atencion" chico titulo="Tu caja todavía es provisional">
          Finanzas aún no tiene todo para proyectarla con seguridad, así que lo que ves puede cambiar. {faltan[0]?.texto}
          {faltan.length > 1 ? ` Y ${faltan.length - 1} ${faltan.length === 2 ? "cosa más" : "cosas más"} en Finanzas ▸ Resumen.` : ""}
        </Aviso>
      )}
      {conCompra.fueraDelHorizonte.length > 0 && conCompra.salePorLaCompra > 0 && (
        <p className="text-xs text-taupe">
          {conCompra.fueraDelHorizonte.length === 1 ? "Un pago cae" : `${conCompra.fueraDelHorizonte.length} pagos caen`} después de lo que la caja alcanza a ver (el {fechaEnPalabras(conCompra.fueraDelHorizonte[0]!.fecha)}): no está en la gráfica.
        </p>
      )}
    </div>
  );
}
