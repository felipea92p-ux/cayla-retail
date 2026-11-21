import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { getContextoDinero, pendientesDeConciliar } from "@/lib/cuentas-dinero";
import { PantallaDinero } from "@/components/finanzas/CuentasDinero";
import { CuentaClaure } from "@/components/finanzas/dinero/CuentaClaure";
import { getAliadasConCuenta, getCuentaAliada, getCuentaClaure, getCuentasDeOtrasEmpresas } from "@/lib/cuenta-claure";
import { aliadaDeLaUrl, deAliada, deAliadaEnTodo, QUIEN_CLAURE, quienDe } from "@/lib/empresas-aliadas-reglas";
import { Vacio } from "@/components/ui/Vacio";
import { Handshake } from "lucide-react";
import { BotonPagarClaure } from "@/components/finanzas/dinero/BotonPagarClaure";
import { chipsClaure, fraseClaure, montoSugeridoPago, respuestaClaure, resumenClaure } from "@/lib/cuenta-claure-reglas";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { verDeLaVista } from "@/lib/vista-global";

// Finanzas ▸ Cuentas y dinero ▸ CLAURE (ADR-0560, actividad 1). Lo que CLAURE (la empresa de Claudia) cobró en cuentas de CAYLA, que es lo que
// CAYLA le debe: el POS y los Yape de Lima caen en cuentas de CAYLA, el efectivo lo tiene Claudia. La base lo calcula (`fn_claure_cuenta`) y
// solo mira lo que la cuenta ve (el líder, todo; con el módulo Cuentas y dinero, su sede), así que la puerta es la de Cuentas y dinero.
// La sede de la barra no la cambia: CLAURE solo opera donde lo dice `empresa_sedes` (hoy Tienda LIM), y por eso no lleva orillo.
// Desde la actividad 2 también muestra lo ya pagado (`fn_claure_pagos`) y el botón «Pagar a CLAURE» (solo el líder: sale de un banco).
// Rediseño 2026-10-31 («B+C · Fusión»): la cifra grande vive en la ficha oscura de la pantalla, así que la cabecera no repite la respuesta (`panorama`);
// el botón de la cabecera es «Pagar a CLAURE» y «Registrar movimiento» sigue en el dock.
// ADR-0683 (actividad 3): la misma cara, para cada empresa aliada con cuenta (`?empresa=<clave>`; sin ella, la primera). Si la base todavía no tiene las
// funciones por aliada, se lee a CLAURE como siempre.
export default async function ClaureDineroPage({ searchParams }: { searchParams: Promise<{ ver?: string; sede?: string; empresa?: string }> }) {
  const persona = await exigirModulo("cuentas_dinero");
  const sp = await searchParams;
  const hoy = hoyLima();
  const ctx = await getContextoDinero(persona, verDeLaVista(persona.vista, sedeDeLaUrl(sp)));
  const [aliadas, telar, cuentasAjenas] = await Promise.all([getAliadasConCuenta(), getSedesDelTelar(), getCuentasDeOtrasEmpresas()]);
  const aliada = aliadas ? aliadaDeLaUrl(aliadas, sp.empresa) : null;
  const quien = aliada ? quienDe(aliada) : QUIEN_CLAURE;
  if (aliadas && !aliada) {
    return (
      <PantallaDinero pestana="claure" esLider={ctx.esLider} sede="Empresas aliadas" respuesta={undefined} orillo={null} panorama acciones={null} aliadas={aliadas} sedes={telar.sedes} ver={ctx.ver} cuentas={ctx.cuentas.datos} deuda={ctx.deuda} hoy={hoy} fallas={[]}>
        <Vacio icono={<Handshake />} titulo="Ninguna empresa aliada con cuenta">
          Cuando una empresa aliada venda en tus tiendas, aquí verás lo que se le debe.
        </Vacio>
      </PantallaDinero>
    );
  }
  const cuenta = aliada ? await getCuentaAliada(aliada.id) : await getCuentaClaure();
  const resumen = resumenClaure(cuenta.datos.filas, cuenta.datos.pagos, cuenta.datos.gastos);
  const respuesta = deAliadaEnTodo(respuestaClaure(resumen.saldo), quien);
  const nombres = new Set(cuenta.datos.filas.map((f) => ctx.ubicaciones.find((u) => u.id === f.ubicacionId)?.nombre).filter((n): n is string => !!n));

  return (
    <PantallaDinero
      pestana="claure"
      esLider={ctx.esLider}
      conteos={{ conciliacion: pendientesDeConciliar(ctx.conciliacion.datos) }}
      sede={nombres.size ? [...nombres].join(" · ") : quien.nombre}
      aliadas={aliadas}
      aliada={aliada ?? undefined}
      respuesta={{
        pregunta: respuesta.pregunta,
        valor: cuenta.falla ? null : respuesta.valor,
        chips: cuenta.falla ? [] : deAliadaEnTodo(chipsClaure(resumen, cuenta.datos.filas.length > 0 || cuenta.datos.pagos.length > 0 || cuenta.datos.gastos.length > 0), quien),
      }}
      orillo={null}
      panorama
      subtitulo={deAliada(fraseClaure(cuenta.datos.desde), quien)}
      acciones={ctx.esLider ? <BotonPagarClaure montoSugerido={montoSugeridoPago(resumen.saldo)} nombre={quien.nombre} /> : null}
      sedes={telar.sedes}
      ver={ctx.ver}
      cuentas={ctx.cuentas.datos}
      deuda={ctx.deuda}
      hoy={hoy}
      fallas={[ctx.cuentas.falla, cuenta.falla].filter((f): f is string => !!f)}
    >
      {!cuenta.falla && <CuentaClaure filas={cuenta.datos.filas} pagos={cuenta.datos.pagos} gastos={cuenta.datos.gastos} cuentasAjenas={cuentasAjenas} esLider={ctx.esLider} hoy={hoy} quien={quien} />}
    </PantallaDinero>
  );
}
