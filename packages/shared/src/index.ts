export * from "./enums";
// Los esquemas de zod NO van en este índice (ADR-0674): viven en `@cayla-retail/shared/schemas`. Aquí, cualquier pantalla que importara un
// enum se llevaba zod entero (52 KB ya armados) aunque no validara nada: 52 de las 139 pantallas del ERP lo bajaban sin usarlo.
// Lo vigila `apps/web/lib/compartido-sin-zod.test.ts`.
export * from "./documento";
export * from "./design-tokens";
export * from "./nombre-del-padron";
export * from "./documento-clienta";
export * from "./campanas-web";
export * from "./campana-movimiento";
export * from "./campana-imagen";
