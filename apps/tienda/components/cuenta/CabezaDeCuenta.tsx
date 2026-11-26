// Lo de arriba de los formularios de «Entrar» y «Crear cuenta» («A · Mostrador», 2026-11-25; ver `PantallaDeCuenta.tsx`).

/** Lo de arriba del formulario: «Mi cuenta», el título y una línea. */
export function CabezaDeCuenta({ titulo, linea }: { titulo: string; linea: string }) {
  return (
    <div className="cu-cabeza">
      <p className="cu-ceja">Mi cuenta</p>
      <h1 className="w-titulo">{titulo}</h1>
      <p className="cu-linea">{linea}</p>
    </div>
  );
}
