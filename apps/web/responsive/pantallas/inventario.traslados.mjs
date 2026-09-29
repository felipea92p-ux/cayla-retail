// Pantalla registrada: Inventario ▸ Traslados — registro mínimo a propósito, para demostrar que
// una pantalla sencilla no necesita escenarios ni exclusiones: hereda todo del motor genérico
// (un único escenario "inicial" y la matriz de viewports completa). Ver `responsive/README.md`.

/** @type {import('./registro.mjs').Pantalla} */
const pantallaTraslados = {
  id: "inventario.traslados",
  nombre: "Traslados",
  modulo: "inventario",
  ruta: "/inventario/traslados",
  viewports: "rapida", // pantalla de demo de reutilización: 4 anchos alcanzan para probar el registro
};

export default pantallaTraslados;
