// Reglas de «apartar» sin nada de servidor: las importan los modales (cliente), la lectura
// (`apartados.ts`) y las pruebas. Quien manda es la base (`apartar_stock`/`liberar_apartado`,
// 20260920160000, ADR-0141): acá solo se adelanta lo que se puede validar sin un viaje, y se
// traduce a lenguaje de tienda. Nada de esto reemplaza un candado de la base.

export type Apartado = {
  id: string;
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  sububicacionId: string | null;
  cantidad: number;
  clienta: string;
  contacto: string;
  nota: string | null;
  /** `aaaa-mm-dd`, día de Lima. Null SOLO en la reserva de un pedido de otra sede (ADR-0328 act. 17, decisión del
   *  2026-10-04): no vence sola, la sostiene la tienda que pidió; aquí se ve como «Pedido de Tienda Trujillo», sin el cliente. */
  venceEl: string | null;
  creadoEn: string;
  /** Nombre de quien apartó (`personas.nombres`); null si esa persona ya no existe. */
  apartoNombre: string | null;
  /** Si QUIEN MIRA puede liberarlo. Lo calcula la base (`listar_apartados`): decisión de Felipe —
   *  cualquiera aparta, pero el apartado de otra persona solo lo libera una líder. Es la MISMA regla
   *  que aplica `liberar_apartado`, en un solo lugar: la pantalla solo decide si ofrece el botón. */
  puedeLiberar: boolean;
  /** La reserva de un pedido web (ADR-0408, act. 8): se entrega o se libera desde Tienda web ▸ Pedidos, nunca desde aquí (la base
   *  lo rechaza). Se rotula con su número en vez de esconderla: la unidad sigue «apartada» en el stock y así se explica. */
  pedidoWeb?: { codigo: string; tiendaPedido: string; paraOtraTienda: boolean } | null;
  /** La prenda de un apartado con adelanto (un APT, ADR-0166; auditoría 2026-11-28, N.º 2): es de la separación del cliente, que ya
   *  pagó una parte, y se entrega o se libera desde Apartados. Soltarla aquí dejaba el APT abierto sin su prenda (la base lo rechaza).
   *  `href` abre ese APT en Apartados; null si quien mira no ve ese módulo. */
  separacion?: { id: string; codigo: string; href: string | null } | null;
};

/**
 * Si se ofrece «Liberar» en Existencias ▸ Apartados. Parte de lo que dice la base (`puede_liberar`), salvo la terminal, que libera
 * siempre (Felipe, 2026-09-22); nunca la reserva de un pedido web ni la prenda de un apartado con adelanto, que tienen su propio
 * lugar (Tienda web ▸ Pedidos y Apartados). La base rechaza igual las dos: esto solo evita ofrecer un botón que va a fallar.
 */
export function puedeLiberarApartado(f: { puedeLiberarBase: boolean; esTerminal: boolean; esPedidoWeb: boolean; esDeSeparacion: boolean }): boolean {
  if (f.esPedidoWeb || f.esDeSeparacion) return false;
  return f.esTerminal || f.puedeLiberarBase;
}

/** Por qué se libera un apartado — los mismos cuatro valores que valida `liberar_apartado`. */
export const MOTIVOS_LIBERACION = [
  { valor: "clienta_no_vino", texto: "El cliente no vino" },
  { valor: "entregada", texto: "Se la entrego al cliente ahora (luego se cobra en Vender)" },
  { valor: "error_de_carga", texto: "Me equivoqué al apartar" },
  { valor: "otro", texto: "Otro motivo" },
] as const;
export type MotivoLiberacion = (typeof MOTIVOS_LIBERACION)[number]["valor"];

/** Días de calendario entre `hoy` y `venceEl`: negativo = ya venció. */
export function diasHasta(venceEl: string, hoy: string): number {
  const [a, m, d] = venceEl.split("-").map(Number);
  const [ha, hm, hd] = hoy.split("-").map(Number);
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(ha, hm - 1, hd)) / 86_400_000);
}

export type EstadoVencimiento = "vencido" | "hoy" | "vigente";

/** «Hoy» todavía vale: vence AL FINAL del día límite, no a su medianoche inicial. */
export function estadoVencimiento(venceEl: string, hoy: string): EstadoVencimiento {
  const dias = diasHasta(venceEl, hoy);
  if (dias < 0) return "vencido";
  return dias === 0 ? "hoy" : "vigente";
}

export function textoVencimiento(venceEl: string, hoy: string): string {
  const dias = diasHasta(venceEl, hoy);
  if (dias < 0) return `Venció hace ${-dias} ${-dias === 1 ? "día" : "días"}`;
  if (dias === 0) return "Vence hoy";
  if (dias === 1) return "Vence mañana";
  return `Vence en ${dias} días`;
}

export function resumirApartados(apartados: Apartado[], hoy: string): { abiertos: number; unidades: number; vencidos: number } {
  return {
    abiertos: apartados.length,
    unidades: apartados.reduce((acc, a) => acc + a.cantidad, 0),
    vencidos: apartados.filter((a) => a.venceEl !== null && estadoVencimiento(a.venceEl, hoy) === "vencido").length,
  };
}

/**
 * Lo que el barrido diario (`fn_vencer_apartados_de_todas`, 20261128162000) no pudo vencer: cada apartado va aislado y, si uno falla,
 * los demás vencen igual y este queda abierto. La ruta del cron lo manda a Sentry con estos ids (nunca nombres). Lee con cuidado lo que
 * vuelve: una base sin la migración no trae estas claves, y eso es «nada falló», no un error.
 */
export function fallidosDelBarrido(resumen: unknown): { total: number; apartadosConAdelanto: string[]; simples: string[] } {
  const r = (typeof resumen === "object" && resumen !== null ? resumen : {}) as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const apartadosConAdelanto = ids(r.fallidas_ids);
  const simples = ids(r.simples_fallidos_ids);
  const total = typeof r.fallidas === "number" ? r.fallidas : apartadosConAdelanto.length + simples.length;
  return { total, apartadosConAdelanto, simples };
}
