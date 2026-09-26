// Lo que ve un líder que llega a una pantalla de Producción parado en otra ubicación (por la URL guardada, o por el
// enlace «Producción» del Resumen de Inventario). Producción solo se ve parado en el Taller (`puedeVerProduccion`);
// en vez de devolverlo al inicio sin decir nada, se le explica dónde está y qué cambiar. Quien no puede cambiar de
// ubicación no llega hasta acá: su página lo redirige, porque no tendría qué hacer con este aviso.
export function ProduccionSoloEnTaller({ ubicacionActual }: { ubicacionActual: string }) {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-tinta">Producción</h1>
      <p className="card-cayla p-5 text-sm text-tinta/75">
        Producción se trabaja desde el Taller, y ahora estás mirando desde «{ubicacionActual}». Cambia la ubicación en el selector de arriba
        y elige el Taller para ver las órdenes y los insumos.
      </p>
    </div>
  );
}
