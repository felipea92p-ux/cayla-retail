# 2026-10-29 · Roles y accesos: módulos con vista previa del menú

- Felipe eligió la maqueta «B · Vista previa» (`docs/maquetas/roles-modulos-2026-10/`): los módulos de un rol ahora son áreas que se abren al tocarlas
  (ícono, «4 de 7», casillas con su explicación) y, a la derecha, el menú tal como lo vería esa cuenta, con lo que se suma resaltado y lo que se quita tachado.
- `components/RolesModulos.tsx` (nuevo) reemplaza las píldoras de `RolesPanel.tsx`. La lógica (candados, «solo das lo que tienes», «Todos», borrador y barra de guardado) no cambió.
- Guía de «Roles» al día (paso nuevo `roles.vista-previa`) y huella de `colaboradores` aceptada.
- Verificado: tsc, pruebas de guías/unificar/colores/guía de foco, y en el navegador con datos inventados (abrir área, sumar y quitar). Sin probar con cuentas reales ni a 375 px.
