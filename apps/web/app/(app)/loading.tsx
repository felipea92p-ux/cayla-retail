// Suspense boundary automática de Next.js alrededor de cada page.tsx bajo (app) — sin
// esto, el árbol completo (layout + página) se renderizaba como una sola unidad
// síncrona: el navegador no recibía ni un byte de HTML hasta que TODOS los awaits
// (persona, sedes, catálogo, movimientos...) terminaban. El layout (nav, selector de
// sede) igual espera su propia data — pero una vez resuelto, el contenido de CUALQUIER
// página puede mostrar esto en vez de pantalla en blanco mientras carga la suya.
export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="label-cayla text-[10px] text-tinta/45">Cargando…</p>
    </div>
  );
}
