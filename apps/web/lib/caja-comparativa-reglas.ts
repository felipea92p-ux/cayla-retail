// Caja compara hoy contra ayer (ADR-0319). Lógica pura, sin React ni Supabase: todo se calcula en el navegador a partir de los
// pagos de dos días (`fn_comparativa_caja`) y de la hora de Lima, así que el reloj de cada minuto basta para mover toda la pantalla.

/** Un pago de una venta completada. `minuto` = minuto del día en Lima (0–1439). */
export type PagoDelDia = { ventaId: string; minuto: number; metodo: string; monto: number };

const suma = (xs: readonly PagoDelDia[]) => xs.reduce((a, p) => a + p.monto, 0);

/** Lo vendido hasta un minuto del día (exclusivo). `null` = el día completo. */
export function vendidoHasta(pagos: readonly PagoDelDia[], minuto: number | null): number {
  return suma(minuto === null ? pagos : pagos.filter((p) => p.minuto < minuto));
}

export function tickets(pagos: readonly PagoDelDia[], minuto: number | null = null): number {
  return new Set((minuto === null ? pagos : pagos.filter((p) => p.minuto < minuto)).map((p) => p.ventaId)).size;
}

export type Veredicto = {
  /** Lo vendido hoy hasta ahora. */
  hoy: number;
  /** El día completo de ayer: la meta, ya que no hay metas diarias (Felipe 2026-10-02). */
  ayerDia: number;
  /** Lo que ayer llevaba a esta misma hora. */
  ayerAEstaHora: number;
  /** 0–100+: cuánto del día de ayer ya se vendió. */
  pctDelDiaDeAyer: number;
  falta: number;
  superado: boolean;
  /** Contra la misma hora de ayer: positivo = vas por encima. `null` si ayer no vendió nada. */
  pctAEstaHora: number | null;
  ticketsHoy: number;
  ticketsAyerAEstaHora: number;
  ticketPromedio: number;
};

export function veredicto(hoy: readonly PagoDelDia[], ayer: readonly PagoDelDia[], ahoraMin: number): Veredicto {
  const h = vendidoHasta(hoy, null);
  const ayerDia = vendidoHasta(ayer, null);
  const ayerAhora = vendidoHasta(ayer, ahoraMin);
  const tk = tickets(hoy);
  return {
    hoy: h,
    ayerDia,
    ayerAEstaHora: ayerAhora,
    pctDelDiaDeAyer: ayerDia > 0 ? (h / ayerDia) * 100 : 0,
    falta: Math.max(0, ayerDia - h),
    superado: ayerDia > 0 && h >= ayerDia,
    pctAEstaHora: ayerAhora > 0 ? ((h - ayerAhora) / ayerAhora) * 100 : null,
    ticketsHoy: tk,
    ticketsAyerAEstaHora: tickets(ayer, ahoraMin),
    ticketPromedio: tk > 0 ? h / tk : 0,
  };
}

export type PuntoCurva = { minuto: number; monto: number };
export type Curva = { hoy: PuntoCurva[]; ayer: PuntoCurva[]; desdeMin: number; hastaMin: number };

/**
 * Las dos líneas del gráfico: el acumulado en cada hora en punto. La de hoy termina exactamente en `ahoraMin` (el punto
 * siempre está en la hora actual); la de ayer sigue hasta el final de su día para ver cuánto falta.
 */
export function curvaAcumulada(hoy: readonly PagoDelDia[], ayer: readonly PagoDelDia[], ahoraMin: number, horaCierreMin: number | null): Curva {
  const primeros = [...hoy, ...ayer].map((p) => p.minuto);
  const desdeH = Math.floor(Math.min(...primeros, ahoraMin) / 60);
  const ultimaAyer = ayer.length ? Math.max(...ayer.map((p) => p.minuto)) : ahoraMin;
  const hastaH = Math.min(24, Math.max(Math.ceil(Math.max(ultimaAyer + 1, horaCierreMin ?? 0, ahoraMin) / 60), desdeH + 2));
  const desdeMin = desdeH * 60;
  const hastaMin = hastaH * 60;
  const hoyPts: PuntoCurva[] = [{ minuto: desdeMin, monto: 0 }];
  for (let m = desdeMin + 60; m < ahoraMin; m += 60) hoyPts.push({ minuto: m, monto: vendidoHasta(hoy, m) });
  hoyPts.push({ minuto: Math.max(desdeMin, ahoraMin), monto: vendidoHasta(hoy, ahoraMin + 1) });
  const ayerPts: PuntoCurva[] = [{ minuto: desdeMin, monto: 0 }];
  for (let m = desdeMin + 60; m <= hastaMin; m += 60) ayerPts.push({ minuto: m, monto: vendidoHasta(ayer, m) });
  return { hoy: hoyPts, ayer: ayerPts, desdeMin, hastaMin };
}

/** El acumulado de una curva en un minuto cualquiera (interpolación lineal entre dos puntos). */
export function valorEn(pts: readonly PuntoCurva[], minuto: number): number {
  if (pts.length === 0) return 0;
  if (minuto <= pts[0]!.minuto) return pts[0]!.monto;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    if (minuto <= b.minuto) return b.minuto === a.minuto ? b.monto : a.monto + ((b.monto - a.monto) * (minuto - a.minuto)) / (b.minuto - a.minuto);
  }
  return pts[pts.length - 1]!.monto;
}

export type HoraComparada = {
  hora: number;
  hoy: number;
  ayer: number;
  diferencia: number;
  /** La hora todavía no termina: las dos se cuentan solo hasta los mismos minutos. */
  enCurso: boolean;
  /** Hasta qué minuto del día se cuenta esta hora (60·(hora+1) si ya cerró; `ahoraMin` si va en curso). */
  hastaMin: number;
};

/**
 * Hora por hora, el mismo tramo de cada día: la hora en curso se compara por los minutos transcurridos (a las 15:10, de 15:00
 * a 15:10 de hoy contra de 15:00 a 15:10 de ayer), NUNCA contra la hora entera de ayer.
 */
export function horasComparadas(hoy: readonly PagoDelDia[], ayer: readonly PagoDelDia[], ahoraMin: number): HoraComparada[] {
  const enBloque = (xs: readonly PagoDelDia[], de: number, hasta: number) => suma(xs.filter((p) => p.minuto >= de && p.minuto < hasta));
  const primero = hoy.length ? Math.min(...hoy.map((p) => p.minuto)) : ahoraMin;
  const desdeH = Math.floor(Math.min(primero, ...(ayer.length ? [Math.min(...ayer.map((p) => p.minuto))] : [primero]), ahoraMin) / 60);
  const horaActual = Math.floor(ahoraMin / 60);
  const filas: HoraComparada[] = [];
  for (let h = desdeH; h <= horaActual; h++) {
    const enCurso = h === horaActual;
    const hasta = enCurso ? ahoraMin + 1 : (h + 1) * 60;
    const a = enBloque(hoy, h * 60, hasta);
    const b = enBloque(ayer, h * 60, hasta);
    filas.push({ hora: h, hoy: a, ayer: b, diferencia: a - b, enCurso, hastaMin: enCurso ? ahoraMin : (h + 1) * 60 });
  }
  return filas;
}

export type MetodoComparado = { metodo: string; hoy: number; ayerDia: number };

/** Cómo te pagaron, hoy contra el día completo de ayer. Orden fijo del sistema; solo los medios que alguno de los dos usó. */
export function metodosComparados(hoy: readonly PagoDelDia[], ayer: readonly PagoDelDia[]): MetodoComparado[] {
  const orden = ["efectivo", "yape", "tarjeta", "plin", "transferencia"];
  const por = (xs: readonly PagoDelDia[], m: string) => suma(xs.filter((p) => p.metodo === m));
  const otros = [...new Set([...hoy, ...ayer].map((p) => p.metodo))].filter((m) => !orden.includes(m));
  return [...orden, ...otros].map((metodo) => ({ metodo, hoy: por(hoy, metodo), ayerDia: por(ayer, metodo) })).filter((m) => m.hoy > 0 || m.ayerDia > 0);
}

/** La mejor y la peor hora (solo entre las que ya cerraron o van en curso con algo vendido): para decirlo en palabras. */
export function mejorYPeorHora(filas: readonly HoraComparada[]): { mejor: HoraComparada | null; peor: HoraComparada | null } {
  if (filas.length === 0) return { mejor: null, peor: null };
  const mejor = filas.reduce((m, x) => (x.diferencia > m.diferencia ? x : m));
  const peor = filas.reduce((m, x) => (x.diferencia < m.diferencia ? x : m));
  return { mejor: mejor.diferencia > 0 ? mejor : null, peor: peor.diferencia < 0 ? peor : null };
}

/** «15:40» desde minutos del día. */
export function horaTexto(minuto: number): string {
  return `${Math.floor(minuto / 60)}:${String(Math.floor(minuto % 60)).padStart(2, "0")}`;
}

/** Lo que la fila del RPC trae (los montos pueden llegar como texto). */
export function leerPagos(filas: unknown): PagoDelDia[] {
  if (!Array.isArray(filas)) return [];
  return filas.map((f) => {
    const r = f as Record<string, unknown>;
    return { ventaId: String(r.venta_id), minuto: Number(r.minuto), metodo: String(r.metodo), monto: Number(r.monto) };
  });
}
