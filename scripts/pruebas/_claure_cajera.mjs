/**
 * Una cajera de Tienda Lima que NO es líder y puede cerrar la caja (solo el módulo «Caja»), para las pruebas de CLAURE que ensayan «quien cierra la caja y no es
 * líder» (ADR-0560). Se crea DENTRO de la transacción de cada caso (que termina en ROLLBACK): la base del CI parte del seed y no trae a nadie así (la copia local de
 * Felipe tenía una cuenta de prueba sembrada a mano, `lucia@cayla.local`, que el CI nunca vio). El rol es propio, con un solo módulo: tampoco ve Finanzas.
 */
export const CAJERA_AUTH = "22222222-2222-4222-8222-0000000000b1";
const CAJERA_PERSONA = "22222222-2222-4222-8222-0000000000b2";
const CAJERA_ROL = "22222222-2222-4222-8222-0000000000b4";

/** `lima` es el id ya entre comillas (`'…'`); `felipe`, el id del líder del seed (para tomar su sede base). */
export const escenaCajera = (lima, felipe) => `
insert into auth.users (id, aud, role, email) values ('${CAJERA_AUTH}', 'authenticated', 'authenticated', 'cajera-claure@prueba.local') on conflict (id) do nothing;
insert into retail.roles (id, nombre, descripcion) values ('${CAJERA_ROL}', 'Cajera de prueba (CLAURE)', 'Rol de prueba: solo el módulo Caja') on conflict (id) do nothing;
insert into retail.rol_modulos (rol_id, modulo) values ('${CAJERA_ROL}', 'caja') on conflict do nothing;
insert into public.personas (id, nombres, apellidos, estado, sede_base_id, auth_user_id)
  values ('${CAJERA_PERSONA}', 'Cajera', 'Prueba', 'activo', (select sede_base_id from public.personas where auth_user_id = '${felipe}'), '${CAJERA_AUTH}') on conflict (id) do nothing;
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id, rol_id) values ('${CAJERA_PERSONA}', 'colaborador', ${lima}, '${CAJERA_ROL}') on conflict (persona_id) do nothing;
`;
