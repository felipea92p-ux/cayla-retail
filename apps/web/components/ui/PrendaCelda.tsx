import Image from "next/image";

/* ====================================================================
   PrendaCelda · miniatura + referencia + "SKU · color · talla"
   (2026-09-17, ADR-0097)

   La celda "Prenda · variante" que Existencias arma a mano
   (InventarioPanel.tsx:289-319) y el marcador de perchero que dibuja
   cuando la prenda no tiene foto (`SinFoto`, mismo trazo que
   IC.inventario en AppShell). Extraída para que Resumen la comparta en
   vez de copiarla. La segunda línea es texto (no la cápsula de color de
   Existencias): en una lista de decisiones se lee "Blanco · L", no se
   compara un swatch con otro.
   ==================================================================== */

export function SinFoto({ tamano = "h-9 w-9" }: { tamano?: string }) {
  return (
    <span aria-hidden className={`flex ${tamano} shrink-0 items-center justify-center rounded-md border border-tinta/10 bg-sand/50 text-tinta/25`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M4 7l8-4 8 4v10l-8 4-8-4V7zm8 4L4 7m8 4l8-4m-8 4v10" />
      </svg>
    </span>
  );
}

export function PrendaCelda({
  referencia,
  sku,
  talla,
  color,
  fotoUrl,
  compacta = false,
}: {
  referencia: string;
  sku: string;
  talla: string | null;
  color: string | null;
  fotoUrl: string | null;
  /** Una sola línea ("Blusa Camila · Blanco L"): para listas cortas. */
  compacta?: boolean;
}) {
  const miniatura = fotoUrl ? (
    <Image src={fotoUrl} alt="" width={36} height={36} unoptimized className="h-9 w-9 shrink-0 rounded-md border border-tinta/10 object-cover" />
  ) : (
    <SinFoto />
  );

  if (compacta) {
    return (
      <span className="flex min-w-0 items-center gap-2.5">
        {miniatura}
        <span className="truncate text-sm text-tinta">
          {referencia}
          {(color || talla) && <span className="text-tinta/65"> · {[color, talla].filter(Boolean).join(" ")}</span>}
        </span>
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-start gap-2.5">
      {miniatura}
      <span className="min-w-0">
        <span className="block truncate text-sm text-tinta" title={referencia}>
          {referencia}
        </span>
        <span className="flex items-center gap-1.5 truncate text-xs text-tinta/65">
          <span className="font-mono">{sku}</span>
          {color && <span>· {color}</span>}
          {talla && <span>· {talla}</span>}
        </span>
      </span>
    </span>
  );
}
