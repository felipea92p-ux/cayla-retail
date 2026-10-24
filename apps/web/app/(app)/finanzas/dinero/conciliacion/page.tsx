import { redirect } from "next/navigation";
import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { cuentaParaConciliar } from "@/lib/cuentas-dinero-reglas";
import { getConciliacion, getContextoDinero, pendientesDeConciliar } from "@/lib/cuentas-dinero";
import { ConciliacionPanel, PantallaDinero } from "@/components/finanzas/CuentasDinero";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { preguntaDeDinero, respuestaCuadrar } from "@/lib/dinero-telar-reglas";

// Finanzas ▸ Cuentas y dinero ▸ Conciliación (ADR-0195 F3, solo el líder): se anota el saldo que dice el banco en una fecha;
// el sistema suma el suyo, dice la diferencia y muestra las líneas del período para marcarlas revisadas. Es de CAYLA entera:
// la sede de la barra no la cambia, y por eso no lleva orillo. `?cuenta=` elige el banco (por defecto, el que lleva más tiempo sin conciliar) y `?hasta=` la fecha.
export default async function ConciliacionPage({ searchParams }: { searchParams: Promise<{ cuenta?: string; hasta?: string }> }) {
  const persona = await exigirModulo("cuentas_dinero");
  if (persona.rol !== "lider") redirect("/finanzas/dinero");
  const sp = await searchParams;
  const hoy = hoyLima();
  const ctx = await getContextoDinero(persona, "todas");
  const elegida = cuentaParaConciliar(ctx.conciliacion.datos, sp.cuenta);
  const hasta = sp.hasta && /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta) && sp.hasta <= hoy ? sp.hasta : null;
  const [actual, telar] = await Promise.all([elegida ? getConciliacion(elegida.id, hasta) : Promise.resolve({ datos: null, falla: null }), getSedesDelTelar()]);
  const cuadre = respuestaCuadrar(ctx.conciliacion.datos);

  return (
    <PantallaDinero
      pestana="conciliacion"
      esLider
      conteos={{ conciliacion: pendientesDeConciliar(ctx.conciliacion.datos) }}
      sede="CAYLA entera"
      respuesta={{
        pregunta: preguntaDeDinero("cuadrar", null),
        valor: ctx.conciliacion.falla ? null : cuadre.valor,
        chips: cuadre.chips,
        motivo: ctx.conciliacion.falla ? undefined : "Todavía no hay bancos: se agregan en Configuración ▸ Cuentas y cobros.",
      }}
      orillo={null}
      sedes={telar.sedes}
      ver={ctx.ver}
      cuentas={ctx.cuentas.datos}
      deuda={ctx.deuda}
      hoy={hoy}
      fallas={[ctx.cuentas.falla, ctx.conciliacion.falla, actual.falla].filter((f): f is string => !!f)}
    >
      <ConciliacionPanel key={`${elegida?.id}-${hasta ?? ""}`} cuentas={ctx.conciliacion.datos} actual={actual.datos} hoy={hoy} deUnaFecha={hasta !== null} />
    </PantallaDinero>
  );
}
