import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { getAlertasPos, getCierresConDiferencia, getContextoDinero, getEfectivo, getMediosDeCobro, getMovimientos, getPlanillaCuentas, getPlanillaPorRegistrar, getSinCuenta, pendientesDeConciliar } from "@/lib/cuentas-dinero";
import { avisosDePlanilla } from "@/lib/planilla-salidas-reglas";
import { CuentasPanel, MovimientosEnPantalla, PantallaDinero } from "@/components/finanzas/CuentasDinero";
import { AlcanzaDinero } from "@/components/finanzas/dinero/AlcanzaDinero";
import { alcanzaPulso, tienesPulso } from "@/lib/dinero-pulso-reglas";
import { getProyeccion } from "@/lib/flujo-caja";
import { verDeLaVista } from "@/lib/vista-global";
import { deudaConDueno, explicacionCuenta, type EfectivoFila } from "@/lib/cuentas-dinero-reglas";
import { avisoCajaFuerte, avisoCajon, chipsDondeEsta, cuentasDelAlcance, detalleCajon, gruposDelAlcance, movimientosDeLaEmpresa, orilloDeDinero, preguntaDeDinero, gruposDeDinero } from "@/lib/dinero-telar-reglas";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { sedeDeLaCabecera } from "@/lib/gastos-telar-reglas";
import { sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { PanoramaDinero } from "@/components/finanzas/dinero/PanoramaDinero";
import { PlataDelDueno } from "@/components/finanzas/dinero/PlataDelDueno";
import { CobrosDinero } from "@/components/finanzas/dinero/CobrosDinero";
import { filasDeCobros, movimientosDelDueno } from "@/lib/dinero-dueno-cobros-reglas";
import { CampanaDinero } from "@/components/finanzas/dinero/CampanaDinero";
import { contadorDeCampana, filasDeCierres, filasDeEstado, itemsDeAtencion, porRegistrar } from "@/lib/dinero-estados-reglas";
import { getCuentaClaure } from "@/lib/cuenta-claure";
import { chipsDisponible, resumenClaure } from "@/lib/cuenta-claure-reglas";

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
  const [movimientos, medios, sinCuenta, proyeccion, alertas, efectivo, cierres, telar, claure, planilla, cuentasPlanilla] = await Promise.all([
    getMovimientos(ctx.ver.ubicacionId),
    ctx.esLider ? getMediosDeCobro() : Promise.resolve({ datos: [], falla: null }),
    ctx.esLider && !ctx.ver.ubicacionId ? getSinCuenta() : Promise.resolve([]),
    ctx.esLider ? getProyeccion(6) : Promise.resolve({ datos: null, falla: null }),
    // Las máquinas que se atrasaron con su depósito (ADR-0429, act. 4): solo el líder; vacío si la base no lo sabe todavía.
    ctx.esLider ? getAlertasPos() : Promise.resolve([]),
    deLaEmpresa ? Promise.resolve(sinEfectivo) : getEfectivo(ctx.ver.ubicacionId),
    deLaEmpresa ? Promise.resolve([]) : getCierresConDiferencia(ctx.ver.ubicacionId),
    getSedesDelTelar(),
    // Lo que se le debe a CLAURE (ADR-0560, actividad 4): la plata de los bancos y las máquinas de CAYLA incluye lo de Claudia, así que «tienes» dice cuánto es suyo y cuánto
    // queda disponible. Solo cuando se mira CAYLA entera o la empresa (una sede no lleva los bancos) y quien lo ve es el líder. Si no se pudo leer, no se inventa nada.
    ctx.esLider && !ctx.ver.ubicacionId ? getCuentaClaure() : Promise.resolve(null),
    // La planilla que Dynamic pagó y no dice de qué banco salió (ADR-0567): como las máquinas atrasadas, en toda vista, porque baja un banco
    // de la empresa y el líder entra mirando su sede.
    ctx.esLider ? getPlanillaPorRegistrar() : Promise.resolve([]),
    ctx.esLider ? getPlanillaCuentas() : Promise.resolve(null),
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
    // La caja fuerte sin depositar y, en el cajón, si la caja está abierta o cerrada (la campana y las filas lo muestran como estado).
    avisar: (c) => avisoCajaFuerte(c, movimientos.datos, hoy) ?? avisoCajon(c, efectivo.datos, esTaller(c)),
  });

  // La campana «Estado de las cuentas»: los mismos datos de la pantalla, ordenados por lo que pide mirada (lib/dinero-estados-reglas.ts).
  const atrasadas = new Set(alertas.filter((a) => a.atrasados > 0).map((a) => a.cuentaId));
  const filasEstado = filasDeEstado(grupos, atrasadas);
  const filasCierres = filasDeCierres(cierres);
  const avisosPlanilla = avisosDePlanilla(planilla, cuentasPlanilla ?? []);
  const pendientes = porRegistrar(alertas, avisosPlanilla);
  const contador = contadorDeCampana(filasEstado, filasCierres, pendientes);
  const itemsAtencion = itemsDeAtencion(filasEstado, filasCierres, pendientes, ctx.esLider, ctx.esLider && !sedeId ? deudaConDueno(ctx.plata) : null);
  const movimientosVisibles = deLaEmpresa ? movimientosDeLaEmpresa(movimientos.datos, ctx.cuentas.datos) : movimientos.datos;

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
        chips: [...chipsDondeEsta(tienes), ...(claure && !claure.falla ? chipsDisponible(tienes.total, resumenClaure(claure.datos.filas, claure.datos.pagos, claure.datos.gastos).saldo) : [])],
      }}
      orillo={{ porSede: orilloDeDinero(ctx.cuentas.datos), que: "en plata" }}
      sedes={telar.sedes}
      ver={ctx.ver}
      cuentas={ctx.cuentas.datos}
      deuda={ctx.deuda}
      hoy={hoy}
      fallas={[ctx.cuentas.falla, movimientos.falla, medios.falla, efectivo.falla].filter((f): f is string => !!f)}
      panorama
      campana={<CampanaDinero filas={filasEstado} cierres={filasCierres} pendientes={pendientes} planilla={avisosPlanilla} cuentas={ctx.cuentas.datos} contador={contador} esLider={ctx.esLider} />}
    >
      <PanoramaDinero
        titulo={quien ? `Tiene ${quien}` : "Tienes en total"}
        total={ctx.cuentas.falla ? null : tienes.total}
        tarjeta={tienes.tarjeta}
        notas={[
          ...(claure && !claure.falla ? chipsDisponible(tienes.total, resumenClaure(claure.datos.filas, claure.datos.pagos, claure.datos.gastos).saldo) : []),
          ...(tienes.ocultas ? [{ texto: "El cajón abierto lo ve quien cierra la caja", tono: "apagado" as const }] : []),
        ]}
        filas={filasEstado}
        cuentas={ctx.cuentas.datos}
        movimientos={movimientosVisibles}
        hoy={hoy}
        items={itemsAtencion}
        alcanza={<AlcanzaDinero alcanza={alcanzaPulso(proyeccion.datos, tienes.guardado)} deCaylaEntera={!!sedeId} />}
        ultimos={<MovimientosEnPantalla movimientos={movimientosVisibles} hoy={hoy} />}
      />
      {/* Solo el líder y con todas las sedes: lo del dueño es de CAYLA entera, y a qué cuenta entra cada cobro se explica sede por sede (no la empresa). */}
      {ctx.esLider && !sedeId && <PlataDelDueno deuda={ctx.deuda} prestamos={deudaConDueno(ctx.plata).prestamos} movimientos={movimientosDelDueno(movimientosVisibles)} />}
      {ctx.esLider && !sedeId && !deLaEmpresa && <CobrosDinero filas={filasDeCobros(medios.datos, ctx.cuentas.datos)} />}
      <CuentasPanel
        sinCuenta={sinCuenta}
        ver={ctx.ver}
        esLider={ctx.esLider}
      />
    </PantallaDinero>
  );
}
