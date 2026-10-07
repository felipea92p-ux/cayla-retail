import Link from "next/link";

// «Esta pantalla no existe» (ADR-0336). Reemplaza la 404 por defecto de Next, que era una página BLANCA, en inglés y con su propia
// jerga: dentro de un ERP en modo oscuro, un fogonazo de pantalla entera. Misma tarjeta y tono que la barrera de error de `(app)`.
//
// `completa`: la 404 de una URL que no existe se dibuja SOLA en la página (`app/not-found.tsx`); la de un `notFound()` dentro de una
// pantalla (un producto, un conteo, una compra que ya no están) se dibuja dentro del lateral (`app/(app)/not-found.tsx`).
export function PantallaNoEncontrada({ completa = false }: { completa?: boolean }) {
  const tarjeta = (
    <div className="card-cayla anim-entrada max-w-md p-8 text-center">
      <p className="label-cayla text-[11px] text-rojo">Error 404</p>
      <h1 className="font-display mt-2 text-2xl text-tinta">Esta pantalla no existe</h1>
      <p className="mt-3 text-sm text-tinta/75">
        El enlace puede estar mal escrito, o lo que buscas ya no está. Vuelve al inicio y búscalo desde el menú.
      </p>
      <div className="mt-6 flex justify-center">
        <Link href="/" className="btn-cayla btn-primario">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
  return completa ? (
    <main className="flex min-h-screen items-center justify-center bg-crema px-6 py-12">{tarjeta}</main>
  ) : (
    <div className="flex min-h-[50vh] items-center justify-center">{tarjeta}</div>
  );
}
