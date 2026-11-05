// Configuración ▸ Dinero (Felipe 2026-11-05, docs/maquetas/configuracion-cuatro-vistas-2026-11/): junta lo que antes eran «Cuentas y cobros» y «Caja y avisos». Lógica pura.
//
// Contrato — PROMETE: ordenar lo que la base ya trae para dibujarlo: qué cobra una sede y a dónde entra, qué cuentas van a la vista y cuáles se pliegan, cómo se lee una máquina.
// NO decide a qué cuenta puede entrar un cobro (`tiposParaMedio` y `guardar_medio_de_cobro` lo hacen) ni qué sede solo paga (`idsSoloTransferencia`).

import { nombreCortoSede } from "./finanzas-telar-reglas";
import { solesRedondo } from "./gastos-reglas";
import {
  MEDIOS_COBRO,
  TEXTO_MEDIO_COBRO,
  TEXTO_TIPO_CUENTA,
  TIPOS_AUTOMATICOS,
  idsSoloTransferencia,
  mediosDeMaquina,
  textoTarifa,
  type CuentaDinero,
  type FilaMedio,
  type MaquinaPos,
  type MedioCobro,
} from "./cuentas-dinero-reglas";

export type CobroDeSede = { medio: MedioCobro; cuentaId: string };

/** Las sedes que aparecen en los medios de cobro: primero las que cobran, y el Taller (que solo paga) al final. */
export function sedesDeCobro(medios: readonly FilaMedio[]): { id: string; nombre: string; soloPaga: boolean }[] {
  const solo = idsSoloTransferencia(medios);
  const sedes = [...new Map(medios.map((m) => [m.ubicacionId, m.ubicacionNombre])).entries()].map(([id, nombre]) => ({ id, nombre, soloPaga: solo.has(id) }));
  return [...sedes.filter((s) => !s.soloPaga), ...sedes.filter((s) => s.soloPaga)];
}

/** Lo que cobra una sede, en el orden de siempre. La que solo paga tiene una sola fila: la transferencia. `cuentaId` vacío = todavía no tiene cuenta. */
export function cobrosDeSede(medios: readonly FilaMedio[], sedeId: string): CobroDeSede[] {
  const soloPaga = idsSoloTransferencia(medios).has(sedeId);
  return MEDIOS_COBRO.filter((m) => !soloPaga || m === "transferencia").map((medio) => ({
    medio,
    cuentaId: medios.find((x) => x.ubicacionId === sedeId && x.medio === medio)?.cuentaId ?? "",
  }));
}

const unir = (l: readonly string[]) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} y ${l[l.length - 1]}` : (l[0] ?? ""));

/** Por dónde empezar: qué cobro de esta sede no tiene cuenta y qué otra sede tiene alguno así. Sin nada que elegir, `null`. No bloquea nada: solo lo dice (prueba ciega, 2026-11-05). */
export function primerPasoCobros(medios: readonly FilaMedio[], sedeId: string): string | null {
  const sedes = sedesDeCobro(medios);
  const sede = sedes.find((s) => s.id === sedeId);
  if (!sede) return null;
  const sinCuenta = (id: string) => cobrosDeSede(medios, id).filter((c) => !c.cuentaId);
  const aqui = sinCuenta(sedeId);
  const otras = sedes.filter((s) => s.id !== sedeId && sinCuenta(s.id).length).map((s) => nombreCortoSede(s.nombre));
  const frases = [
    aqui.length ? (sede.soloPaga ? "Falta elegir de qué cuenta paga." : `Falta elegir la cuenta de ${unir(aqui.map((c) => TEXTO_MEDIO_COBRO[c.medio]))}.`) : null,
    otras.length ? `${aqui.length ? "También falta" : "Falta"} en ${unir(otras)}.` : null,
  ].filter(Boolean);
  return frases.length ? frases.join(" ") : null;
}

/** Las cuentas a las que llega algo en esta sede, sin repetir y en el orden en que aparecen: la columna de la derecha, a donde corren los hilos. */
export function destinosDeSede(cobros: readonly CobroDeSede[], cuentas: readonly CuentaDinero[]): CuentaDinero[] {
  const ids = new Set(cobros.map((c) => c.cuentaId).filter(Boolean));
  return cuentas.filter((c) => ids.has(c.id));
}

/** Lo que se lee bajo una cuenta de la derecha: su número, o qué es. «Por depositar Izipay» ya dice «por depositar». */
export function detalleDeDestino(c: Pick<CuentaDinero, "numero" | "tipo">): string {
  return c.numero || (c.tipo === "por_abonar" ? "Máquina de cobro" : TEXTO_TIPO_CUENTA[c.tipo]);
}

/** La curva de un hilo, de la orilla derecha de un cobro a la orilla izquierda de su cuenta. */
export function curvaHilo(x1: number, y1: number, x2: number, y2: number): string {
  const m = (x1 + x2) / 2;
  return `M${x1} ${y1}C${m} ${y1} ${m} ${y2} ${x2} ${y2}`;
}

/** Lo que se ve de entrada (bancos, máquinas, tarjeta) y lo que se pliega: los cajones y cajas nacen solos con cada sede, y lo archivado ya no se usa. */
export function gruposDeCuentas(cuentas: readonly CuentaDinero[]): { aLaVista: CuentaDinero[]; deLasSedes: CuentaDinero[]; archivadas: CuentaDinero[] } {
  const activas = cuentas.filter((c) => !c.archivada);
  return {
    aLaVista: activas.filter((c) => !TIPOS_AUTOMATICOS.includes(c.tipo)),
    deLasSedes: activas.filter((c) => TIPOS_AUTOMATICOS.includes(c.tipo)),
    archivadas: cuentas.filter((c) => c.archivada),
  };
}

/** Lo que dice el botón que abre lo plegado. */
export function textoDeLoPlegado(deLasSedes: number, archivadas: number): string {
  const partes = [
    deLasSedes ? (deLasSedes === 1 ? "el cajón o caja" : `los ${deLasSedes} cajones y cajas`) : null,
    archivadas ? (archivadas === 1 ? "la archivada" : `las ${archivadas} archivadas`) : null,
  ].filter(Boolean);
  return `Ver ${partes.join(" y ")}`;
}

/** El saldo de una cuenta. Nulo = a esta cuenta no le toca verlo. Una tarjeta de crédito debe: va en negativo. */
export function saldoDeCuenta(saldo: number | null): string {
  if (saldo === null) return "—";
  return saldo < 0 ? `−${solesRedondo(-saldo)}` : solesRedondo(saldo);
}

/** ¿A esta máquina le falta decir cuánto cobra? Sin tarifa, Finanzas no puede estimar su comisión. */
export function maquinaSinTarifa(m: Pick<MaquinaPos, "sedes">): boolean {
  return mediosDeMaquina(m).some((x) => x.tarifa === null);
}

/** Su tarifa, en una línea: si todos sus medios cobran lo mismo, una sola vez; si no, una por medio. */
export function tarifaDeMaquina(m: Pick<MaquinaPos, "sedes">): string {
  const medios = mediosDeMaquina(m);
  const textos = [...new Set(medios.map((x) => textoTarifa(x.tarifa)))];
  if (textos.length <= 1) return textos[0] ?? "";
  return medios.map((x) => `${TEXTO_MEDIO_COBRO[x.medio]}: ${textoTarifa(x.tarifa)}`).join(" · ");
}
