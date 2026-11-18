// Finanzas ▸ Resumen por bloques (ADR-0661): las cuentas que cada bloque arma con lo que ya le llegó. Lógica pura, sin pedir nada.
//
// Antes, el panel esperaba TODAS las lecturas y armaba estas cuentas una vez, en línea. Ahora cada bloque se dibuja cuando llega lo suyo, así que
// cada uno las arma por su cuenta con lo que tiene: «Libre para usar» no espera la inversión en mercadería, «Lo que te deja» no espera la caja. Son
// las MISMAS funciones con los MISMOS argumentos que antes (no hay una regla nueva aquí: solo dónde se juntan), y dos bloques que muestran la misma
// cifra la sacan de la misma función.

import { campanasQueSeVen, type AjustesResumen } from "./ajustes-resumen-reglas";
import { saldoEnBolsillos } from "./bolsillos-reglas";
import { cajaProxima, type FlujoProximo } from "./caja-proxima-reglas";
import { pagosDeLaCompra, type CampanaInversion } from "./inversion-mercaderia-reglas";
import { proximosPagos } from "./proximos-reglas";
import type { FilaER } from "./resultados-reglas";
import { filaDeVer, type ResumenFinanzas } from "./resumen-finanzas-reglas";
import { mesAnteriorDe } from "./resumen-telar-reglas";
import { teDejaDelMes } from "./te-deja-mes-reglas";
import type { FaltaDelMes } from "./equilibrio-mes-reglas";
import type { Periodo } from "./estados-periodo";

/**
 * La caja: «Libre para usar» y sus bolsillos (de la caja de 14 días SIN la compra de campaña, que todavía no tiene dueño), y «Próximos» y la caja
 * que dibuja la pantalla (CON la compra, si la persona la deja y se mira CAYLA entera). `inversion` es lo que entrega el Plan de campaña; quien no la
 * usa (lo libre) pasa `null` y su cifra es la misma, porque no la mira.
 */
export function armarCaja(o: {
  r: Pick<ResumenFinanzas, "cuentas" | "ver">;
  flujo: FlujoProximo;
  planillaSinSalida: number | null;
  inversion: readonly CampanaInversion[] | null;
  ajustes: AjustesResumen;
  elegidas: Readonly<Record<string, string>>;
}) {
  const { r, flujo, ajustes } = o;
  // La inversión en mercadería es de CAYLA entera: mirando una sola sede no se reparte (como el saldo de los bancos), así que ahí no se cuenta.
  const todasLasCampanas = r.ver.todas ? [...(o.inversion ?? [])] : [];
  const campanas = campanasQueSeVen(todasLasCampanas, ajustes);
  // La compra de campaña que falta pedir entra a la caja como un pago aparte (no como un gasto) si la persona la deja y se mira CAYLA entera.
  const proyeccion = flujo.estado === "ok" ? flujo.datos : null;
  const pagosDeCompra = ajustes.enCaja && proyeccion ? pagosDeLaCompra(campanas, proyeccion, ajustes.conIgv, o.elegidas) : [];
  const cuentas = r.cuentas.estado === "ok" ? r.cuentas.datos : null;
  const caja = cajaProxima({ flujo, cuentas, ver: r.ver, inversion: pagosDeCompra.length ? { pagos: pagosDeCompra, dias: 42 } : null });
  // «Libre para usar» y sus bolsillos (camino A, Felipe 2026-11-09): de la misma caja, pero sin la compra de campaña que todavía no se pide (no tiene dueño
  // aún) y con su ventana de 14 días de siempre, aunque la caja mire seis semanas por la inversión.
  const cajaSola = cajaProxima({ flujo, cuentas, ver: r.ver });
  const saldo = saldoEnBolsillos({ caja: cajaSola, proyeccion, planillaSinSalida: o.planillaSinSalida, cuentas });
  // «Próximos»: los mismos pagos de los bolsillos, uno por renglón, y el día más justo de la caja que dibuja la pantalla (con la compra si se cuenta).
  const deLaSede = r.ver.todas ? null : r.ver.soloEmpresa ? (u: string | null) => u === null : (u: string | null) => u === r.ver.ubicacionId;
  const proximos = proximosPagos({ cajaSola, caja, proyeccion, compra: pagosDeCompra, deLaSede });
  return { todasLasCampanas, campanas, proyeccion, pagosDeCompra, caja, cajaSola, saldo, proximos };
}

/**
 * El mes que se mira: el Resumen con el estado de resultados del mes elegido (los avisos son de hoy, pero la respuesta, el orillo y el recorrido salen
 * del mes de la barra), su fila (CAYLA, la empresa o la sede) y «lo que te deja». `base` es el Resumen que el bloque ya tiene (la lectura rápida, o las
 * tres juntas si el bloque usa el presupuesto).
 */
export function armarMes(o: {
  base: ResumenFinanzas;
  estadoMes: { datos: FilaER[]; falla: string | null };
  mes: string;
  hoy: string;
  periodo: Pick<Periodo, "unMes">;
  faltaDelMes: readonly FaltaDelMes[] | null;
}) {
  const { base, estadoMes, mes, hoy } = o;
  const r: ResumenFinanzas = {
    ...base,
    mes,
    mesAnterior: mesAnteriorDe(mes),
    resultadosMes: estadoMes.falla
      ? { estado: "falla", mensaje: "No se pudo leer el estado de resultados de este mes. Vuelve a cargar la página en un rato." }
      : { estado: "ok", datos: estadoMes.datos },
  };
  const filas = estadoMes.falla ? [] : estadoMes.datos;
  const fila = filaDeVer(filas, r.ver) ?? null;
  const te = teDejaDelMes({ f: fila, ver: r.ver, mes, hoy, unMes: o.periodo.unMes, faltaDelMes: o.faltaDelMes });
  return { r, filas, fila, te };
}
