import { z } from "zod";
import { SEDES, TIPOS_MOVIMIENTO, CANALES_VENTA, MOTIVOS_SALIDA, METODOS_PAGO, GASTO_CATEGORIAS } from "./enums";

export const sedeSchema = z.enum(SEDES);

export const movimientoInputSchema = z
  .object({
    varianteId: z.string().uuid(),
    sedeId: z.string().uuid(),
    tipo: z.enum(TIPOS_MOVIMIENTO),
    cantidad: z.number().int().positive(),
    motivo: z.string().min(1),
    canal: z.enum(CANALES_VENTA).optional(),
    sedeDestinoId: z.string().uuid().optional(),
    monto: z.number().nonnegative().optional(),
    nota: z.string().optional(),
  })
  .refine((v) => (v.tipo === "traslado" ? !!v.sedeDestinoId : true), {
    message: "Traslado requiere sede de destino",
    path: ["sedeDestinoId"],
  })
  .refine((v) => (v.tipo === "salida" ? (MOTIVOS_SALIDA as readonly string[]).includes(v.motivo) : true), {
    message: "Motivo de salida inválido",
    path: ["motivo"],
  });

export type MovimientoInput = z.infer<typeof movimientoInputSchema>;

export const abrirCajaInputSchema = z.object({
  sedeId: z.string().uuid(),
  montoApertura: z.number().nonnegative(),
});
export type AbrirCajaInput = z.infer<typeof abrirCajaInputSchema>;

export const ventaItemSchema = z.object({
  varianteId: z.string().uuid(),
  cantidad: z.number().int().positive(),
  monto: z.number().nonnegative(), // precio unitario de la línea
});

export const ventaInputSchema = z.object({
  cajaId: z.string().uuid(),
  metodoPago: z.enum(METODOS_PAGO),
  items: z.array(ventaItemSchema).min(1, "El carrito está vacío"),
  nota: z.string().optional(),
});
export type VentaInput = z.infer<typeof ventaInputSchema>;

export const cerrarCajaInputSchema = z.object({
  cajaId: z.string().uuid(),
  montoContado: z.number().nonnegative(),
});
export type CerrarCajaInput = z.infer<typeof cerrarCajaInputSchema>;

export const gastoInputSchema = z.object({
  sedeId: z.string().uuid(),
  categoria: z.enum(GASTO_CATEGORIAS),
  subtotal: z.number().nonnegative(),
  igv: z.number().nonnegative(),
  total: z.number().positive(),
  especificacion: z.string().optional(),
});
export type GastoInput = z.infer<typeof gastoInputSchema>;
