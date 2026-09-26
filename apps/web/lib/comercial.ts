import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { hoyLima } from "@/lib/etiqueta-vigencia";
import { horaLima, ritmoDelMes, ordenarPorExcepcion, type NumerosSede, type RitmoMes } from "@/lib/comercial-reglas";

// Panel comercial (ADR-0110). Tres fuentes, ninguna inventada acá:
//   - `retail.fn_comercial_sedes`         : lo vendido, tickets, unidades y devuelto por tienda (hoy/semana/mes).
//   - `retail.fn_comercial_horas`         : ventas del día por hora de Lima.
//   - `retail.fn_comercial_colaboradoras` : ventas del día y del mes por colaboradora, con lo descontado.
//   - `comercial-reglas.ts`               : qué significan esos números (única casa de las reglas).
// Este archivo NO suma ni promedia: solo trae, nombra y ordena. Lo que se muestra es exactamente lo que
// devolvió el SQL — así dos pantallas nunca pueden decir dos cifras distintas de lo vendido.
//
// Es dinero: se usa `exigir()`, no `tolerar()`. Si una consulta falla, la pantalla NO se dibuja. Preferimos
// mostrar un error a mostrar "S/0 en ventas" con cara de normalidad (ver `lib/resultado.ts`).
//
// SE ROMPE SI: la migración `20260918191000_panel_comercial.sql` no está aplicada en la base a la que
// apunta la app — `rpc()` responde "function does not exist" y `exigir()` lo muestra. Orden de despliegue:
// primero el SQL, después el código. El error es visible y no inventa datos, pero rompe la pantalla.

export type SedeComercial = NumerosSede & {
  ubicacionId: string;
  nombre: string;
  ritmo: RitmoMes;
};

export type HoraComercial = { ubicacionId: string; hora: number; ventas: number; tickets: number };

export type ColaboradoraComercial = {
  ubicacionId: string;
  /** Null = ventas sin colaboradora registrada; no se pierden, salen como su propia fila. */
  personaId: string | null;
  nombre: string;
  ventasHoy: number;
  ticketsHoy: number;
  ventasMes: number;
  ticketsMes: number;
  unidadesMes: number;
  brutoMes: number;
  descuentoMes: number;
};

export type PanelComercial = {
  /** Día que se está mirando, `YYYY-MM-DD`, en hora de Lima. */
  fecha: string;
  /** Hora (0-23) de Lima en el momento de armar el panel, para resaltarla en el gráfico. */
  horaActual: number;
  sedes: SedeComercial[];
  horas: HoraComercial[];
  colaboradoras: ColaboradoraComercial[];
};

const SIN_NOMBRE = "Sin colaboradora registrada";

export async function getPanelComercial(): Promise<PanelComercial> {
  const supabase = await createClient();
  // Se manda la fecha explícita (en vez de dejar que el SQL use su propio `now()`) para que la fecha que
  // muestra la pantalla y la que usó el SQL sean, por construcción, la misma.
  const fecha = hoyLima();

  const [filasSedes, filasHoras, filasColab] = await Promise.all([
    supabase.rpc("fn_comercial_sedes", { p_dia: fecha }),
    supabase.rpc("fn_comercial_horas", { p_dia: fecha }),
    supabase.rpc("fn_comercial_colaboradoras", { p_dia: fecha }),
  ]);
  const sedesCrudas = exigir(filasSedes, "las ventas por tienda");
  const horasCrudas = exigir(filasHoras, "las ventas por hora");
  const colabCrudas = exigir(filasColab, "las ventas por colaboradora");

  // Los nombres viven en Dynamic (`public.personas`): se piden por su función, igual que en Caja.
  const ids = [...new Set(colabCrudas.map((c) => c.persona_id).filter((id): id is string => id !== null))];
  const nombres =
    ids.length === 0 ? [] : exigir(await supabase.rpc("fn_nombres_personas", { p_ids: ids }), "los nombres de las colaboradoras");
  const nombrePorId = new Map(nombres.map((n) => [n.id, n.nombre]));

  const sedes: SedeComercial[] = sedesCrudas.map((s) => {
    const numeros: NumerosSede = {
      metaVentaDiaria: s.meta_venta_diaria === null ? null : Number(s.meta_venta_diaria),
      ventasHoy: Number(s.ventas_hoy),
      ticketsHoy: s.tickets_hoy,
      unidadesHoy: s.unidades_hoy,
      devueltoHoy: Number(s.devuelto_hoy),
      ventasSemana: Number(s.ventas_semana),
      ticketsSemana: s.tickets_semana,
      unidadesSemana: s.unidades_semana,
      devueltoSemana: Number(s.devuelto_semana),
      ventasMes: Number(s.ventas_mes),
      ticketsMes: s.tickets_mes,
      unidadesMes: s.unidades_mes,
      devueltoMes: Number(s.devuelto_mes),
    };
    return {
      ...numeros,
      ubicacionId: s.ubicacion_id,
      nombre: s.nombre,
      ritmo: ritmoDelMes({ ventasMes: numeros.ventasMes, ventasHoy: numeros.ventasHoy, metaVentaDiaria: numeros.metaVentaDiaria, fecha }),
    };
  });

  return {
    fecha,
    horaActual: horaLima(),
    sedes: ordenarPorExcepcion(sedes),
    horas: horasCrudas.map((h) => ({ ubicacionId: h.ubicacion_id, hora: h.hora, ventas: Number(h.ventas), tickets: h.tickets })),
    colaboradoras: colabCrudas.map((c) => ({
      ubicacionId: c.ubicacion_id,
      personaId: c.persona_id,
      nombre: c.persona_id === null ? SIN_NOMBRE : (nombrePorId.get(c.persona_id) ?? "Colaboradora sin nombre"),
      ventasHoy: Number(c.ventas_hoy),
      ticketsHoy: c.tickets_hoy,
      ventasMes: Number(c.ventas_mes),
      ticketsMes: c.tickets_mes,
      unidadesMes: c.unidades_mes,
      brutoMes: Number(c.bruto_mes),
      descuentoMes: Number(c.descuento_mes),
    })),
  };
}
