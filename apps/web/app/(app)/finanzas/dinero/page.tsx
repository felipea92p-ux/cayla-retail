import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { getAlertasPos, getCierresConDiferencia, getContextoDinero, getEfectivo, getMediosDeCobro, getMovimientos, getSinCuenta, pendientesDeConciliar } from "@/lib/cuentas-dinero";
import { CuentasPanel, PantallaDinero } from "@/components/finanzas/CuentasDinero";
import { DineroPulso } from "@/components/finanzas/DineroPulso";
import { alcanzaPulso, tienesPulso } from "@/lib/dinero-pulso-reglas";
import { getProyeccion } from "@/lib/flujo-caja";
import { verDeLaVista } from "@/lib/vista-global";
import { explicacionCuenta } from "@/lib/cuentas-dinero-reglas";
import { avisoCajaFuerte, chipsDondeEsta, detalleCajon, orilloDeDinero, preguntaDeDinero, grupoDe, gruposDeDinero } from "@/lib/dinero-telar-reglas";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { sedeDeLaCabecera } from "@/lib/gastos-telar-reglas";
import { SEDE_EMPRESA, SEDE_TODAS, sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { GruposDeCuentas } from "@/components/finanzas/dinero/GruposDeCuentas";
import { CierresConDiferencia } from "@/components/finanzas/dinero/CierresConDiferencia";

// Finanzas ▸ Cuentas y dinero ▸ Dónde está (ADR-0195 F3; El telar, Felipe 2026-10-23). Lee en el servidor y deja a una pieza
// cliente operar. `?sede=` (la barra común; `?ver=` mientras dure el cambio; solo el líder) elige qué sede mirar: por defecto la sede
// donde trabaja, o «todas» (ahí aparecen la plata del dueño y a qué cuenta entra cada cobro). Con el módulo, una cuenta ve su
// cajón y su caja fuerte, y registra sus depósitos al banco. Cada cuenta es un frasco en la repisa de su sede.
export default async function CuentasDineroPage({ searchParams }: { searchParams: Promise<{ ver?: string; sede?: string }> }) {
  const persona = await exigirModulo("cuentas_dinero");
  const sp = await searchParams;
  const hoy = hoyLima();
  // La sede sale de la barra común (`?sede=`, o `?ver=` mientras dure el cambio). «Dónde está» no tiene «empresa» propia (la empresa
  // no tiene cajón): se lee como todas, y los bancos se ven en la repisa de CAYLA entera.
  const pedida = sedeDeLaUrl(sp);
  const ctx = await getContextoDinero(persona, verDeLaVista(persona.vista, pedida === SEDE_EMPRESA ? SEDE_TODAS : pedida));
  // El telar: arriba, «tienes»; luego los frascos de cada sede y «¿me alcanza?» (el flujo de 6 semanas, solo el líder). Lo que se
  // debe es su propia cara, «Qué debes» (/finanzas/dinero/por-pagar).
  // El efectivo de hoy (la misma cuenta del cierre) y los cierres con diferencia viven aquí desde que se retiró la pestaña Efectivo.
  const [movimientos, medios, sinCuenta, proyeccion, alertas, efectivo, cierres, telar] = await Promise.all([
    getMovimientos(ctx.ver.ubicacionId),
    ctx.esLider ? getMediosDeCobro() : Promise.resolve({ datos: [], falla: null }),
    ctx.esLider && !ctx.ver.ubicacionId ? getSinCuenta() : Promise.resolve([]),
    ctx.esLider ? getProyeccion(6) : Promise.resolve({ datos: null, falla: null }),
    // Las máquinas que se atrasaron con su depósito (ADR-0429, act. 4): solo el líder; vacío si la base no lo sabe todavía.
    ctx.esLider ? getAlertasPos() : Promise.resolve([]),
    getEfectivo(ctx.ver.ubicacionId),
    getCierresConDiferencia(ctx.ver.ubicacionId),
    getSedesDelTelar(),
  ]);
  // Con una sede elegida, «tienes» es SOLO lo suyo (su cajón y su caja fuerte): los bancos son de CAYLA entera y no se le suman.
  const sedeId = ctx.ver.ubicacionId;
  const tienes = tienesPulso(sedeId ? ctx.cuentas.datos.filter((c) => grupoDe(c) === sedeId) : ctx.cuentas.datos, null);
  const esTaller = (c: { ubicacionId: string | null }) => c.ubicacionId !== null && ctx.talleres.includes(c.ubicacionId);
  const grupos = gruposDeDinero(ctx.cuentas.datos, ctx.ubicaciones, sedeId, hoy, {
    explicar: (c) =>
      (c.tipo === "cajon" ? detalleCajon(efectivo.datos.find((f) => f.ubicacionId === c.ubicacionId), esTaller(c)) : null) ?? explicacionCuenta(c, medios.datos, esTaller(c)),
    avisar: (c) => avisoCajaFuerte(c, movimientos.datos, hoy),
  });

  const sede = sedeDeLaCabecera(ctx.ver, ctx.ubicaciones);

  return (
    <PantallaDinero
      pestana="cuentas"
      esLider={ctx.esLider}
      conteos={{ conciliacion: pendientesDeConciliar(ctx.conciliacion.datos) }}
      sede={sede}
      respuesta={{
        pregunta: preguntaDeDinero("donde", sedeId ? sede : null),
        valor: ctx.cuentas.falla ? null : tienes.total,
        chips: chipsDondeEsta(tienes),
      }}
      orillo={{ porSede: orilloDeDinero(ctx.cuentas.datos), que: "en plata" }}
      sedes={telar.sedes}
      ver={ctx.ver}
      cuentas={ctx.cuentas.datos}
      deuda={ctx.deuda}
      hoy={hoy}
      fallas={[ctx.cuentas.falla, movimientos.falla, medios.falla, efectivo.falla].filter((f): f is string => !!f)}
    >
      <DineroPulso
        alcanza={alcanzaPulso(proyeccion.datos, tienes.guardado)}
        deCaylaEntera={!!sedeId}
        grupos={
          <>
            <GruposDeCuentas grupos={grupos} sedes={telar.sedes} />
            <CierresConDiferencia cierres={cierres} />
          </>
        }
      />
      <CuentasPanel
        cuentas={ctx.cuentas.datos}
        movimientos={movimientos.datos}
        medios={medios.datos}
        plata={ctx.plata}
        sinCuenta={sinCuenta}
        alertas={alertas}
        ver={ctx.ver}
        esLider={ctx.esLider}
      />
    </PantallaDinero>
  );
}
