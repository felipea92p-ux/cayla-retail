import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fraseDelMotor, leerPreparacion, preparacionDeSede, RPC_PREPARACION, type PreparacionSede } from "@/lib/motor-demanda-reglas";
import { DIAS_DEMANDA, leerDemanda, RPC_DEMANDA, type SedeDemanda } from "@/lib/demanda-reglas";
import { getUbicaciones } from "@/lib/ubicaciones";

// Motor de demanda, etapa 0 (ADR-0346): lectura del servidor. Solo LEE, por la función de la base
// (`fn_motor_demanda_preparacion`, 20261005210000). Si falla —la web publicada antes que la migración, o la base caída—, lo
// dice (principio 9): una sede nunca aparece «lista» ni «sin datos» por un error.

export type LecturaMotor = { sedes: PreparacionSede[]; falla: string | null };

/** Sin sede: todas las tiendas (pide CAYLA Global). Con sede: solo esa (también para quien la opera). */
export async function getPreparacionMotor(ubicacionId?: string): Promise<LecturaMotor> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    RPC_PREPARACION as never,
    (ubicacionId ? { p_ubicacion_id: ubicacionId } : {}) as never
  );
  if (error) {
    console.error(`${RPC_PREPARACION}: ${error.message}`);
    return { sedes: [], falla: "No se pudo leer si el sistema ya puede recomendar en cada tienda" };
  }
  return { sedes: leerPreparacion(data).map(preparacionDeSede), falla: null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Etapa 1 (ADR-0347): la cifra única de demanda, tienda por tienda, con su permiso para hablar.
// ---------------------------------------------------------------------------------------------------------------------

export type MotorDeLaRed = {
  /** Una por tienda activa: si puede hablar, su frase (ADR-0346) y lo que leyó (null si la base no respondió). */
  sedes: (SedeDemanda & { frase: string })[];
  falla: string | null;
};

/**
 * El motor de toda la red, para quien opera todas las tiendas (el líder; así se usa en «Nueva orden» de Producción). Cada tienda se
 * lee con su propia puerta: una que no se pudo leer queda callada, nunca «sin ventas».
 */
export async function getMotorDeLaRed(): Promise<MotorDeLaRed> {
  const supabase = await createClient();
  const tiendas = (await getUbicaciones()).filter((u) => u.tipo === "tienda");
  const sedes = await Promise.all(
    tiendas.map(async (u) => {
      const [prep, dem] = await Promise.all([
        supabase.rpc(RPC_PREPARACION as never, { p_ubicacion_id: u.id } as never),
        supabase.rpc(RPC_DEMANDA as never, { p_ubicacion_id: u.id, p_dias: DIAS_DEMANDA } as never),
      ]);
      if (prep.error) console.error(`${RPC_PREPARACION}: ${prep.error.message}`);
      if (dem.error) console.error(`${RPC_DEMANDA}: ${dem.error.message}`);
      const p = prep.error ? null : (leerPreparacion(prep.data).map(preparacionDeSede)[0] ?? null);
      const lectura = dem.error ? null : leerDemanda(dem.data);
      const puedeHablar = !!p?.puedeHablar && lectura !== null;
      const frase = p ? fraseDelMotor(p) : `No se pudo leer si el motor puede recomendar en ${u.nombre}.`;
      return { ubicacionId: u.id, nombre: u.nombre, puedeHablar, lectura, frase, fallo: !!(prep.error || dem.error) };
    })
  );
  const fallaron = sedes.filter((s) => s.fallo).map((s) => s.nombre);
  return {
    sedes: sedes.map(({ fallo: _fallo, ...s }) => s),
    falla: fallaron.length > 0 ? `No se pudo leer el motor de demanda de ${fallaron.join(", ")}` : null,
  };
}
