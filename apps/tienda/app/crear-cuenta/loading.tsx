import { EsperaDeCuenta } from "@/components/cuenta/EsperaDeCuenta";

// La espera con solo el logo, sin la franja de avisos: la de toda la tienda (`app/loading.tsx`) la dibujaba un instante.
export default function Cargando() {
  return <EsperaDeCuenta />;
}
