// Pantalla registrada: Ventas ▸ Vender — otra pantalla de demo con registro mínimo, pero de un
// módulo y una forma de UI distinta (ticket/formulario) a Existencias, para probar que el motor
// no depende de un único tipo de UI. Ver `responsive/README.md`.

/** @type {import('./registro.mjs').Pantalla} */
const pantallaVender = {
  id: "vender.vender",
  nombre: "Punto de venta",
  modulo: "vender",
  ruta: "/vender",
  viewports: "rapida",
};

export default pantallaVender;
