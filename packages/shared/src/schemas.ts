import { z } from "zod";
import { SEDES, TIPOS_MOVIMIENTO, CANALES_VENTA, MOTIVOS_SALIDA } from "./enums";

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
