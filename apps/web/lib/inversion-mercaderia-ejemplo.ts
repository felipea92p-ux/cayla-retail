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
      historia: {
        anterior: `Navidad ${anio - 1}`, campanas_previas: 1,
        categorias: [
          { nombre: "Casacas", compradas: 120, vendidas: 120, agotada_dia: 9, sugeridas: { min: 130, tipico: 150, max: 170 } },
          { nombre: "Vestidos", compradas: 90, vendidas: 85, agotada_dia: 21, sugeridas: { min: 88, tipico: 95, max: 105 } },
          { nombre: "Blusas", compradas: 200, vendidas: 164, agotada_dia: null, sugeridas: { min: 170, tipico: 190, max: 215 } },
          { nombre: "Pantalones", compradas: 150, vendidas: 117, agotada_dia: null, sugeridas: { min: 120, tipico: 140, max: 160 } },
          { nombre: "Faldas", compradas: 80, vendidas: 52, agotada_dia: null, sugeridas: { min: 45, tipico: 60, max: 75 } },
          { nombre: "Polos", compradas: 220, vendidas: 90, agotada_dia: null, sugeridas: { min: 80, tipico: 100, max: 130 } },
          { nombre: "Accesorios", compradas: 160, vendidas: 131, agotada_dia: null, sugeridas: { min: 130, tipico: 150, max: 175 } },
        ],
      },
      costos: {
        por_categoria: [
          { nombre: "Casacas", monto: 5400 }, { nombre: "Vestidos", monto: 4100 }, { nombre: "Blusas", monto: 3300 }, { nombre: "Pantalones", monto: 2900 },
          { nombre: "Faldas", monto: 1300 }, { nombre: "Polos", monto: 900 }, { nombre: "Accesorios", monto: 500 },
        ],
        ventas_esperadas: 52000, costo_de_lo_vendido: 21000, publicidad: 2500, comision: 900,
      },
    },
    {
      id: "ejemplo-cyber", nombre: "Cyber Wow (ejemplo)", desde: `${anio}-11-27`, hasta: `${anio}-11-30`,
      plan_sin_igv: 6200, igv: 1116, tope: 7000, pedido: 6200, pagado: 6200, fecha_limite: sumarDias(hoy, 13), pagos: [], visible: true, href_plan: "/compras/plan",
    },
  ];
}
