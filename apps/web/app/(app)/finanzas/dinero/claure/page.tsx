import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { getContextoDinero, pendientesDeConciliar } from "@/lib/cuentas-dinero";
import { PantallaDinero } from "@/components/finanzas/CuentasDinero";
import { CuentaClaure } from "@/components/finanzas/dinero/CuentaClaure";
import { getCuentaClaure } from "@/lib/cuenta-claure";
import { chipsClaure, respuestaClaure, resumenClaure } from "@/lib/cuenta-claure-reglas";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { verDeLaVista } from "@/lib/vista-global";

// Finanzas ▸ Cuentas y dinero ▸ CLAURE (ADR-0560, actividad 1). Lo que CLAURE (la empresa de Claudia) cobró en cuentas de CAYLA, que es lo que
// CAYLA le debe: el POS y los Yape de Lima caen en cuentas de CAYLA, el efectivo lo tiene Claudia. La base lo calcula (`fn_claure_cuenta`) y
// solo mira lo que la cuenta ve (el líder, todo; con el módulo Cuentas y dinero, su sede), así que la puerta es la de Cuentas y dinero.
// La sede de la barra no la cambia: CLAURE solo opera donde lo dice `empresa_sedes` (hoy Tienda LIM), y por eso no lleva orillo.
// Desde la actividad 2 también muestra lo ya pagado (`fn_claure_pagos`) y el botón «Pagar a CLAURE» (solo el líder: sale de un banco).
export default async function ClaureDineroPage({ searchParams }: { searchParams: Promise<{ ver?: string; sede?: string }> }) {
  const persona = await exigirModulo("cuentas_dinero");
  const sp = await searchParams;
  const hoy = hoyLima();
  const ctx = await getContextoDinero(persona, verDeLaVista(persona.vista, sedeDeLaUrl(sp)));
  const [cuenta, telar] = await Promise.all([getCuentaClaure(), getSedesDelTelar()]);
  const resumen = resumenClaure(cuenta.datos.filas, cuenta.datos.pagos);
  const respuesta = respuestaClaure(resumen.saldo);
  const nombres = new Set(cuenta.datos.filas.map((f) => ctx.ubicaciones.find((u) => u.id === f.ubicacionId)?.nombre).filter((n): n is string => !!n));

  return (
    <PantallaDinero
      pestana="claure"
      esLider={ctx.esLider}
      conteos={{ conciliacion: pendientesDeConciliar(ctx.conciliacion.datos) }}
      sede={nombres.size ? [...nombres].join(" · ") : "CLAURE"}
      respuesta={{
        pregunta: respuesta.pregunta,
        valor: cuenta.falla ? null : respuesta.valor,
        chips: cuenta.falla ? [] : chipsClaure(resumen, cuenta.datos.filas.length > 0 || cuenta.datos.pagos.length > 0),
      }}
      orillo={null}
      sedes={telar.sedes}
      ver={ctx.ver}
      cuentas={ctx.cuentas.datos}
      deuda={ctx.deuda}
      hoy={hoy}
      fallas={[ctx.cuentas.falla, cuenta.falla].filter((f): f is string => !!f)}
    >
      {!cuenta.falla && <CuentaClaure filas={cuenta.datos.filas} pagos={cuenta.datos.pagos} desde={cuenta.datos.desde} esLider={ctx.esLider} />}
    </PantallaDinero>
  );
}
