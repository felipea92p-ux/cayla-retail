import { sumarDias } from "./caja-proxima-reglas";

// Cifras de EJEMPLO para ver «Inversión en mercadería» armada mientras el Plan de campaña no entrega datos de verdad. Solo se usan en el
// computador de desarrollo (`getInversionMercaderia`); nada de aquí llega a producción ni se parece a un dato del negocio.
// Tienen la forma que entrega el Plan (la que lee `leerInversion`), con las fechas puestas a partir de hoy para que siempre se vean vigentes.
export function ejemploDeInversion(hoy: string): unknown[] {
  const anio = Number(hoy.slice(0, 4)) + (hoy.slice(5) > "12-01" ? 1 : 0);
  return [
    {
      id: "ejemplo-navidad", nombre: "Navidad (ejemplo)", desde: `${anio}-12-01`, hasta: `${anio}-12-24`,
      plan_sin_igv: 18400, igv: 3312, tope: 20000, pedido: 9200, pagado: 3000, fecha_limite: sumarDias(hoy, 17), pagos: [], visible: true, href_plan: "/compras/plan",
    },
    {
      id: "ejemplo-cyber", nombre: "Cyber Wow (ejemplo)", desde: `${anio}-11-27`, hasta: `${anio}-11-30`,
      plan_sin_igv: 6200, igv: 1116, tope: 7000, pedido: 6200, pagado: 6200, fecha_limite: sumarDias(hoy, 13), pagos: [], visible: true, href_plan: "/compras/plan",
    },
  ];
}
