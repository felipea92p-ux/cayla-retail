import { Aviso } from "@/components/ui/Aviso";
import { textoIgvCambiado, type IgvCambiado } from "@/lib/impuestos-reglas";

// El IGV de un mes cerrado que ya no es el del cierre (tarea 19 de «Las 36»). Sale en Impuestos y en Cierre de mes: quien declara y quien cierra tienen que saberlo.
export function AvisoIgvCambiado({ cambios }: { cambios: readonly IgvCambiado[] }) {
  if (!cambios.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {cambios.map((c) => {
        const { titulo, texto } = textoIgvCambiado(c);
        return (
          <Aviso key={c.mes} tono="atencion" titulo={titulo}>
            {texto}
          </Aviso>
        );
      })}
    </div>
  );
}
