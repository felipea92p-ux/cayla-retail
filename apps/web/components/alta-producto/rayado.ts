// El rayado de «no existe»: el mismo en los pasos 3 y 4 de Nuevo producto, en Editar producto, en Recibir un envío y en «Nueva orden de producción». Vivía en `MatrizVariantes.tsx`
// (que arrastra fotos y un modal); aquí es una constante sola, para que la tabla de cantidades no dependa de ese archivo. `MatrizVariantes` lo sigue exportando.
export const RAYADO_FUERA = "bg-[repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_srgb,var(--color-tinta)_5%,transparent)_6px_7px)] text-tinta/25";
