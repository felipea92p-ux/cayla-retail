import { Chip } from "@/components/ui/Chip";

/**
 * De qué empresa es una prenda, donde conviven dos (ADR-0505): «CLAURE» en Lima y en la vista Global, para no confundirla con la
 * misma blusa de CAYLA. El nombre lo decide `insigniaDeEmpresa` (`lib/empresas-de-sede-reglas.ts`); sin nombre no se dibuja nada.
 * Es un `<Chip>` informativo sin punto: nombra algo, no dice un estado (ADR-0358).
 */
export function InsigniaEmpresa({ nombre, className = "" }: { nombre: string | null | undefined; className?: string }) {
  if (!nombre) return null;
  return (
    <Chip tono="pizarra" versalitas={false} className={className} title={`Esta prenda es de ${nombre}: solo se vende, se recibe y se traslada en sus tiendas.`}>
      {nombre}
    </Chip>
  );
}
