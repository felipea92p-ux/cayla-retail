// Finanzas ▸ Cuentas y dinero en «El telar» (Felipe 2026-10-23, docs/maquetas/finanzas-telar-2026-10/): «Dónde está» dibuja
// cada cuenta como un frasco que se llena hasta su nivel, agrupado por sede (una repisa por sede). Lógica pura: no suma plata
// que la base no haya sumado (`fn_cuentas_dinero_saldos`), solo agrupa, ordena y decide el nivel de cada frasco.
//
// Qué es de quién (decisiones D1–D4, 2026-10-23: con lo que la base ya trae): el cajón y la caja fuerte son de su sede; los
// bancos, lo entregado al líder (`por_rendir`) y la tarjeta de crédito son de CAYLA entera; lo «por depositar» de las máquinas
// va aparte, «En camino», porque todavía no tiene sede.

import { cuentasVisibles, insigniaCuenta, type CuentaDinero, type Insignia } from "./cuentas-dinero-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** La clave de la repisa de CAYLA entera y la de lo que viene en camino (las de sede son el id de la ubicación). */
export const REPISA_EMPRESA = "empresa";
export const REPISA_CAMINO = "camino";

export type Frasco = {
  id: string;
  nombre: string;
  tipo: CuentaDinero["tipo"];
  /** Nulo = no le toca verlo (el cajón abierto, para quien no cierra la caja): el frasco se dibuja sin líquido y lo dice. */
  saldo: number | null;
  /** De 0 a 1: cuánto se llena el frasco. Nulo si el saldo no se ve. */
  nivel: number | null;
  insignia: Insignia | null;
  /** Para qué es, en palabras («Caja abierta hoy», «Yape de TRU y AQP»): lo pone quien llama, que conoce los medios de cobro. */
  detalle: string | null;
};

export type Repisa = {
  /** El id de la sede, `empresa` o `camino`. */
  clave: string;
  titulo: string;
  /** Lo que suman los saldos que se ven (sin los ocultos). */
  total: number;
  /** Algún frasco de la repisa no deja ver su saldo. */
  ocultos: boolean;
  frascos: Frasco[];
  /** Una línea que explica la repisa cuando hace falta («Los bancos son de CAYLA entera»). */
  nota: string | null;
};

/**
 * El nivel de un frasco contra el más lleno de la pantalla. Con raíz cuadrada, para que un cajón de S/ 500 se vea al lado de un
 * banco de S/ 18,000 (lineal, quedaría vacío). Un frasco en cero o en negativo muestra un fondo mínimo: «hay frasco, está vacío».
 */
export function nivelFrasco(saldo: number | null, maximo: number): number | null {
  if (saldo === null) return null;
  if (saldo <= 0 || maximo <= 0) return 0.04;
  return r2(0.07 + 0.86 * Math.sqrt(Math.min(saldo, maximo) / maximo));
}

/** En cada repisa, de lo que está más a la mano a lo que está más lejos: el cajón, la caja fuerte, lo del líder, el banco. */
const ORDEN_TIPO: Record<CuentaDinero["tipo"], number> = { cajon: 0, caja_fuerte: 1, por_rendir: 2, banco: 3, por_abonar: 4, tarjeta_credito: 5 };

/** La repisa a la que va una cuenta (ver el encabezado). La tarjeta de crédito no es un frasco: es deuda. */
export function repisaDe(c: Pick<CuentaDinero, "tipo" | "ubicacionId">): string | null {
  if (c.tipo === "tarjeta_credito") return null;
  if (c.tipo === "por_abonar") return REPISA_CAMINO;
  if ((c.tipo === "cajon" || c.tipo === "caja_fuerte") && c.ubicacionId) return c.ubicacionId;
  return REPISA_EMPRESA;
}

/**
 * Las repisas de «Dónde está». Con una sede elegida, solo la suya (aunque esté vacía: «Lima todavía no tiene plata»); con todas,
 * una por sede en el orden de `ubicaciones` (tiendas y después el Taller), luego CAYLA entera y al final lo que viene en camino.
 * Las repisas sin cuentas no salen.
 */
export function repisasDeDinero(
  cuentas: readonly CuentaDinero[],
  ubicaciones: readonly { id: string; nombre: string }[],
  ubicacionId: string | null,
  hoy: string,
  explicar: (c: CuentaDinero) => string | null = () => null,
): Repisa[] {
  const vis = cuentasVisibles(cuentas, null).filter((c) => repisaDe(c) !== null);
  const maximo = Math.max(0, ...vis.map((c) => c.saldo ?? 0));
  const claves = ubicacionId ? [ubicacionId] : [...ubicaciones.map((u) => u.id), REPISA_EMPRESA, REPISA_CAMINO];
  const repisas: Repisa[] = [];
  for (const clave of claves) {
    const suyas = vis.filter((c) => repisaDe(c) === clave).sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
    if (!suyas.length && !ubicacionId) continue;
    const titulo =
      clave === REPISA_EMPRESA ? "CAYLA entera" : clave === REPISA_CAMINO ? "En camino" : (ubicaciones.find((u) => u.id === clave)?.nombre ?? "Tu tienda");
    const nota =
      clave === REPISA_EMPRESA
        ? "Los bancos y lo que se entregó al líder son de CAYLA entera."
        : clave === REPISA_CAMINO
          ? "Lo que las máquinas de tarjeta y QR depositan en 1 o 2 días. Todavía no tiene sede."
          : suyas.length === 0
            ? "Todavía no tiene cajón ni caja fuerte con plata."
            : null;
    repisas.push({
      clave,
      titulo,
      total: r2(suyas.reduce((a, c) => a + (c.saldo ?? 0), 0)),
      ocultos: suyas.some((c) => c.saldo === null),
      frascos: suyas.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, saldo: c.saldo, nivel: nivelFrasco(c.saldo, maximo), insignia: insigniaCuenta(c, hoy), detalle: explicar(c) })),
      nota,
    });
  }
  return repisas;
}

/**
 * Lo que pone cada sede en «Dónde está», para el orillo de la barra común (`{ [ubicacionId | "empresa"]: monto }`, contrato de
 * `telar-barra-comun.md`). Lo en camino se cuenta en «empresa» hasta que tenga sede (D1).
 * @public Sin uso hasta que el `<Orillo>` de la barra común llegue a main (actividad 6 de docs/maquetas/finanzas-v3-2026-10/dinero/CONSTRUIR.md).
 */
export function orilloDeDinero(cuentas: readonly CuentaDinero[]): Record<string, number> {
  const porSede: Record<string, number> = {};
  for (const c of cuentasVisibles(cuentas, null)) {
    const clave = repisaDe(c);
    if (clave === null) continue;
    const k = clave === REPISA_CAMINO ? REPISA_EMPRESA : clave;
    porSede[k] = r2((porSede[k] ?? 0) + (c.saldo ?? 0));
  }
  return porSede;
}

/**
 * La sede que se mira, leída de la URL: la barra común usa `?sede=` (`todas | empresa | <id>`) y hasta que llegue a main las
 * pantallas usan `?ver=`. `sede` manda; «Dónde está» no tiene «empresa» propia (la empresa no tiene cajón), así que la lee como
 * todas.
 */
export function verDeLaUrl(sp: { sede?: string; ver?: string }): string | undefined {
  const v = sp.sede ?? sp.ver;
  return v === REPISA_EMPRESA ? "todas" : v;
}
