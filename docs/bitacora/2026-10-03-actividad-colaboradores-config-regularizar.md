# 2026-10-03 · Actividad suma Colaboradores, Roles, Configuración y Regularizar (ADR-0207, actualización)

## 2026-10-03 (La líder ve quién dio accesos, cambió el fondo de caja o regularizó una prenda)
Qué hice: migración `20261003210000` con disparadores sobre `colaboradores_historial`, `roles_historial`, `configuracion_historial` y `prendas_por_regularizar`, y carga de lo pasado: «suspendió a «Micaela…» · motivo: …», «encendió Punto de venta y Caja en el rol «Vendedora»», «cambió en Tienda Trujillo: fondo de caja S/ 200.00 → S/ 300.00», «regularizó la prenda vendida sin registrar «…»: era «…»».
Por qué así: los cuatro ya guardaban su antes y su después; Actividad solo los pone en palabras, en la sede correcta. El dinero de la empresa (cuentas, presupuesto) no se escribe porque la línea la lee la líder de tienda.
Felipe se lleva: probado en local con las formas reales de producción (`pnpm pruebas:actividad-gestion` 9/9); falta pegarla en producción y fusionar después del #745.
