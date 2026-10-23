import { FileText, ImageOff } from "lucide-react";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { diaMes } from "@/lib/fechas-lima";
import { TIPOS_PAPEL, type TipoPapel } from "@/lib/compra-rapida-reglas";
import type { PapelDelEnvio } from "@/lib/recepcion-envio-reglas";

// Compras simple (ADR-0480, actividad 6): la tienda cuenta mirando el papel de la compra. Lo que la compradora anotó desde el celular viene
// con la foto de su boleta, factura o nota (o de las prendas, si no le dieron papel): aquí se ve de quién es, quién compró y, al tocarla,
// la foto en grande. Sin montos: la tienda no ve el dinero de Compras por tener Recibir. Un envío armado en el escritorio no tiene papeles
// y no dibuja nada.

type Papel = PapelDelEnvio & { fotoUrl: string | null };

const esPdf = (ruta: string | null) => !!ruta && ruta.toLowerCase().endsWith(".pdf");

function nombreDelPapel(p: Papel): string {
  const tipo = p.tipo && p.tipo in TIPOS_PAPEL ? TIPOS_PAPEL[p.tipo as TipoPapel].nombre : "Papel";
  return p.tipo === "sin_comprobante" ? `Sin papel de ${p.proveedor ?? "el proveedor"}` : `${tipo} de ${p.proveedor ?? "el proveedor"}`;
}

export function PapelesDeLaCompra({ papeles }: { papeles: readonly Papel[] }) {
  if (papeles.length === 0) return null;
  const compradoras = [...new Set(papeles.map((p) => p.compradora).filter((x): x is string => !!x))];
  return (
    <section className="card-cayla space-y-3 p-4 sm:p-5" aria-label="Lo que anotó al comprar" data-guia="recepcion.papeles">
      <TituloSeccion cuenta={papeles.length > 1 ? papeles.length : undefined}>
        {compradoras.length === 1 ? `Lo que anotó ${compradoras[0].split(" ")[0]} al comprar` : "Lo que anotaron al comprar"}
      </TituloSeccion>
      <p className="text-sm text-taupe">Cuenta mirando el papel: lo que dice es lo que se pagó. Toca la foto para verla en grande.</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {papeles.map((p) => (
          <li key={p.id} className="flex items-center gap-3">
            {p.fotoUrl ? (
              <a
                href={p.fotoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-hueso text-taupe"
                title="Ver la foto en grande"
              >
                {esPdf(p.fotoRuta) ? (
                  <FileText className="h-6 w-6" aria-hidden />
                ) : (
                  // La foto es un enlace firmado de 10 minutos del depósito privado: no pasa por la optimización de imágenes.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.fotoUrl} alt={`Foto: ${nombreDelPapel(p)}`} className="h-full w-full object-cover" />
                )}
              </a>
            ) : (
              <span className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-hueso text-taupe" title="Sin foto">
                <ImageOff className="h-5 w-5" aria-hidden />
                <span className="sr-only">Sin foto</span>
              </span>
            )}
            <span className="min-w-0">
              <span className="block text-sm font-medium text-tinta">{nombreDelPapel(p)}</span>
              <span className="block text-xs text-taupe">
                {[p.compradora ? `La compró ${p.compradora}` : null, p.fecha ? diaMes(p.fecha) : null].filter(Boolean).join(" · ")}
              </span>
              {!p.fotoUrl && <span className="block text-xs text-taupe">{p.fotoRuta ? "La foto no se pudo abrir: recarga la pantalla." : "No subió foto."}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
