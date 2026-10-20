import { exigirModulo } from "@/lib/persona-actual";
import { getResumenDeBeneficios } from "@/lib/club-puntos-config";
import { hoyLima } from "@/lib/fechas-lima";
import { BeneficiosPuntosPanel } from "@/components/clientas/BeneficiosPuntosPanel";

// Clientes ▸ Beneficios del club (programa de puntos, actividad 8): lo que se le ofrece al cliente, configurable sin deploy y solo para el
// líder. Reemplaza la hoja «Beneficios del club» que vivía dentro de Avisos (el % de cumpleaños y el vale de aniversario). La lectura
// la arma la base (`resumen_beneficios_puntos`); el panel solo la pinta y guarda con `guardar_beneficios_puntos`.
export default async function BeneficiosClubPage() {
  // La repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas (lo mismo que `avisos`).
  const persona = await exigirModulo("beneficios_club");
  const { resumen, falla } = await getResumenDeBeneficios();
  return <BeneficiosPuntosPanel sede={persona.ubicacionEtiqueta} resumen={resumen} falla={falla} hoy={hoyLima()} />;
}
