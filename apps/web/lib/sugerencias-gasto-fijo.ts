// Los ejemplos de la ficha de un gasto fijo, coherentes con lo que la persona ya eligió (ADR-0290): con «Alquileres», la caja del
// código dice «N.º de contrato»; con «Servicios básicos», «N.º de suministro, de cliente o de línea». La fuente es la CATEGORÍA
// (`categorias_gasto.codigo`, nunca el nombre visible, que se renombra). Una categoría que un líder crea sin deploy, o ninguna
// elegida todavía, cae al texto neutro: nunca al ejemplo de otra. Sin azar y sin red.

export type SugerenciaFicha = { beneficiario: string; codigo: string; recibo: string };

export const SUGERENCIA_NEUTRA: SugerenciaFicha = {
  beneficiario: "A quién se le paga",
  codigo: "N.º de contrato, cliente o suministro",
  recibo: "Cómo llega y dónde se paga",
};

/** Una por cada categoría de gasto que trae el sistema (20260924235000). El resto cae a la neutra. */
export const SUGERENCIAS_POR_CATEGORIA: Record<string, SugerenciaFicha> = {
  alquileres: { beneficiario: "Nombre del propietario del local", codigo: "N.º de contrato", recibo: "Cómo te avisa que toca pagar" },
  servicios_basicos: {
    beneficiario: "Empresa de luz, agua, teléfono o internet",
    codigo: "N.º de suministro, de cliente o de línea",
    recibo: "Correo, app de la empresa o papel en la puerta",
  },
  transporte: { beneficiario: "Empresa o persona que presta el servicio", codigo: "N.º de cliente o de contrato", recibo: "Cómo llega la cuenta de cobro" },
  suministros: { beneficiario: "Proveedor de útiles o limpieza", codigo: "N.º de cliente", recibo: "Cómo llega la factura" },
  mantenimiento: { beneficiario: "Técnico o empresa de mantenimiento", codigo: "N.º de contrato o de orden", recibo: "Cómo llega el cobro" },
  publicidad: { beneficiario: "Plataforma o agencia de publicidad", codigo: "ID de la cuenta publicitaria", recibo: "Cómo llega la factura" },
  asesoria: { beneficiario: "Contador, abogado o estudio", codigo: "N.º de contrato", recibo: "Cómo llega el recibo por honorarios" },
  gastos_bancarios: { beneficiario: "Banco", codigo: "N.º de cuenta o de cliente", recibo: "Dónde se ve el cobro" },
  tributos: { beneficiario: "Municipalidad o entidad que cobra", codigo: "N.º de contribuyente, de predio o de licencia", recibo: "Cómo llega el aviso de pago" },
  seguros: { beneficiario: "Aseguradora", codigo: "N.º de póliza", recibo: "Cómo llega la cuota" },
};

/** El ejemplo de cada caja de la ficha para la categoría elegida (`""` o desconocida = el neutro). */
export function sugerirFicha(categoria: string): SugerenciaFicha {
  return SUGERENCIAS_POR_CATEGORIA[categoria] ?? SUGERENCIA_NEUTRA;
}
