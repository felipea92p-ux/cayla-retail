import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { getAlertasPos, getCierresConDiferencia, getContextoDinero, getEfectivo, getMediosDeCobro, getMovimientos, getSinCuenta, pendientesDeConciliar } from "@/lib/cuentas-dinero";
import { CuentasPanel, PantallaDinero } from "@/components/finanzas/CuentasDinero";
import { DineroPulso } from "@/components/finanzas/DineroPulso";
import { alcanzaPulso, tienesPulso } from "@/lib/dinero-pulso-reglas";
import { getProyeccion } from "@/lib/flujo-caja";
import { verDeLaVista } from "@/lib/vista-global";
import { explicacionCuenta, type EfectivoFila } from "@/lib/cuentas-dinero-reglas";
import { avisoCajaFuerte, chipsDondeEsta, cuentasDelAlcance, detalleCajon, gruposDelAlcance, movimientosDeLaEmpresa, orilloDeDinero, preguntaDeDinero, gruposDeDinero } from "@/lib/dinero-telar-reglas";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { sedeDeLaCabecera } from "@/lib/gastos-telar-reglas";
import { sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { GruposDeCuentas } from "@/components/finanzas/dinero/GruposDeCuentas";
import { RepartoDeDinero } from "@/components/finanzas/dinero/RepartoDeDinero";
import { repartoDeDinero, textosDelReparto } from "@/lib/dinero-reparto-reglas";
import { CierresConDiferencia } from "@/components/finanzas/dinero/CierresConDiferencia";

// Finanzas ▸ Cuentas y dinero ▸ Dónde está (ADR-0195 F3; El telar, Felipe 2026-10-23). Lee en el servidor y deja a una pieza
// cliente operar. `?sede=` (la barra común; `?ver=` mientras dure el cambio; solo el líder) elige qué mirar: por defecto la sede
// donde trabaja; una sede (su cajón y su caja fuerte); «empresa» (solo lo que no es de ninguna sede: bancos, lo del líder, lo que viene
// en camino y la tarjeta de crédito); o «todas» (toda la plata, un grupo por sede, y aparecen la plata del dueño y a qué cuenta entra
// cada cobro). «Todas» y «Empresa» NO son lo mismo (Felipe 2026-10-28): una es el conjunto y la otra una de sus partes. Con el módulo,
// una cuenta ve su cajón y su caja fuerte, y registra sus depósitos al banco. Cada cuenta es una fila en la tarjeta de su sede.
export default async function CuentasDineroPage({ searchParams }: { searchParams: Promise<{ ver?: string; sede?: string }> }) {
  const persona = await exigirModulo("cuentas_dinero");
  const sp = await searchParams;
  const hoy = hoyLima();
  // La sede sale de la barra común (`?sede=`, o `?ver=` mientras dure el cambio); «empresa» llega tal cual y `ctx.ver.soloEmpresa` la dice.
  const ctx = await getContextoDinero(persona, verDeLaVista(persona.vista, sedeDeLaUrl(sp)));
  const deLaEmpresa = ctx.ver.soloEmpresa;
  // El telar: arriba, «tienes»; luego las cuentas de cada sede y «¿me alcanza?» (el flujo de 6 semanas, solo el líder). Lo que se
  // debe es su propia cara, «Qué debes» (/finanzas/dinero/por-pagar).
  // El efectivo de hoy (la misma cuenta del cierre) y los cierres con diferencia viven aquí desde que se retiró la pestaña Efectivo;
  // son del cajón de una tienda, así que la empresa no los lee.
  const sinEfectivo: { datos: EfectivoFila[]; falla: string | null } = { datos: [], falla: null };
  const [movimientos, medios, sinCuenta, proyeccion, alertas, efectivo, cierres, telar] = await Promise.all([
    getMovimientos(ctx.ver.ubicacionId),
    ctx.esLider ? getMediosDeCobro() : Promise.resolve({ datos: [], falla: null }),
    ctx.esLider && !ctx.ver.ubicacionId ? getSinCuenta() : Promise.resolve([]),
    ctx.esLider ? getProyeccion(6) : Promise.resolve({ datos: null, falla: null }),
    // Las máquinas que se atrasaron con su depósito (ADR-0429, act. 4): solo el líder; vacío si la base no lo sabe todavía.
    ctx.esLider ? getAlertasPos() : Promise.resolve([]),
    deLaEmpresa ? Promise.resolve(sinEfectivo) : getEfectivo(ctx.ver.ubicacionId),
    deLaEmpresa ? Promise.resolve([]) : getCierresConDiferencia(ctx.ver.ubicacionId),
    getSedesDelTelar(),
  ]);
  // Con una sede elegida, «tienes» es SOLO lo suyo (su cajón y su caja fuerte): los bancos son de la empresa y no se le suman. Con la
  // empresa, solo lo suyo: lo que ponen las cajas de las tiendas no entra.
  const sedeId = ctx.ver.ubicacionId;
  const alcance = gruposDelAlcance(sedeId, deLaEmpresa);
  const tienes = tienesPulso(cuentasDelAlcance(ctx.cuentas.datos, alcance), null);
  const esTaller = (c: { ubicacionId: string | null }) => c.ubicacionId !== null && ctx.talleres.includes(c.ubicacionId);
  const grupos = gruposDeDinero(ctx.cuentas.datos, ctx.ubicaciones, alcance, hoy, {
    explicar: (c) =>
      (c.tipo === "cajon" ? detalleCajon(efectivo.datos.find((f) => f.ubicacionId === c.ubicacionId), esTaller(c)) : null) ?? explicacionCuenta(c, medios.datos, esTaller(c)),
    avisar: (c) => avisoCajaFuerte(c, movimientos.datos, hoy),
  });

  // El resumen de arriba (un círculo con la plata de lo que se mira, partido por cuenta): está con todas las sedes, con una sola y con la empresa, también si tiene una cuenta con plata o ninguna.
  const reparto = repartoDeDinero(grupos);

  const sede = sedeDeLaCabecera(ctx.ver, ctx.ubicaciones);
  // «¿Cuánta plata tiene la empresa hoy?», como lo dice Gastos; «tienes» solo cuando se mira todo.
  const quien = sedeId ? sede : deLaEmpresa ? "la empresa" : null;

  return (
    <PantallaDinero
      pestana="cuentas"
      esLider={ctx.esLider}
      conteos={{ conciliacion: pendientesDeConciliar(ctx.conciliacion.datos) }}
      sede={sede}
      respuesta={{
        pregunta: preguntaDeDinero("donde", quien),
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
            {reparto && <RepartoDeDinero reparto={reparto} textos={textosDelReparto(sedeId ? sede : null, deLaEmpresa)} />}
            <GruposDeCuentas grupos={grupos} />
            <CierresConDiferencia cierres={cierres} />
          </>
        }
      />
      <CuentasPanel
        cuentas={ctx.cuentas.datos}
        movimientos={deLaEmpresa ? movimientosDeLaEmpresa(movimientos.datos, ctx.cuentas.datos) : movimientos.datos}
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
