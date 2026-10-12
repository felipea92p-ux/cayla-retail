// Las cuentas con las que se audita el modo oscuro «cuenta por cuenta» (ADR-0336). Todas son de la base LOCAL y su clave es la del
// seed. `pnpm --filter web tema:cuentas` crea las que el seed no trae. Cada una ve pantallas distintas: el rol decide los módulos
// (ADR-0161) y la vista decide la sede o CAYLA Global.
//
// `vista`: `undefined` = la sede de la cuenta; «global» = el Admin con CAYLA Global elegida; un nombre de ubicación («Taller») = el
// líder parado en esa sede. Se aplica con la cookie `cayla_ubicacion_activa`, igual que el selector de la cabecera.

export const CLAVE_LOCAL = "cayla-local";

export const CUENTAS = [
  { clave: "anonima", correo: null, descripcion: "Sin sesión: /login y las páginas públicas (no entra al ERP)" },
  { clave: "admin", correo: "felipe@cayla.local", descripcion: "Admin y Líder (Felipe) en Tienda Lima: ve todos los módulos y el selector de sede" },
  { clave: "admin-global", correo: "felipe@cayla.local", vista: "global", descripcion: "El mismo Admin con CAYLA Global elegida" },
  { clave: "admin-taller", correo: "felipe@cayla.local", vista: "Taller", descripcion: "El mismo Admin parado en el Taller: ve Producción" },
  { clave: "integrante", correo: "micaela@cayla.local", descripcion: "Integrante en Tienda Trujillo: el rol por defecto, sin Actividad" },
  { clave: "terminal-ventas", correo: "mostrador.lima@cayla.local", inicio: "/vender", descripcion: "Terminal de ventas de Lima: el mostrador (Ventas y Clientas)" },
  { clave: "terminal-administrativa", correo: "administrativa.lima@cayla.local", descripcion: "Terminal administrativa de Lima: inventario y catálogo" },
  { clave: "rol-personalizado", correo: "lucia@cayla.local", descripcion: "Colaboradora con un rol propio de 5 módulos: el menú más corto" },
];

/** La pantalla a la que cae la cuenta al entrar: la terminal de ventas no tiene Inicio, su casa es Vender. */
export const inicioDe = (cuenta) => cuenta.inicio ?? "/";
export const esAnonima = (c) => c.correo === null;
export const porClave = (clave) => CUENTAS.find((c) => c.clave === clave);
