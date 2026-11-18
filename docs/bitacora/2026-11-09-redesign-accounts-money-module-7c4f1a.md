## 2026-11-09 (Cuentas y dinero: el banco manda, actividad 1)
Qué hice: el ERP ya guarda cada línea del extracto de Interbank (tablas `banco_cortes/cargas/lineas`, RPC `cargar_lineas_banco` y `fn_banco_cuadre`) y la pantalla Cuadrar con el banco muestra «El banco dice» al lado del ERP; recuperé el trabajo tras el límite semanal y apliqué las correcciones de dos revisiones.
Por qué así: la diferencia con el banco necesita historia línea por línea; solo agrega, sin duplicar y con la cuenta del archivo comprobada (ADR-0637).
Estado: `pruebas:banco-lineas` 136/136 y control de 11 mutantes en verde en una pila local; migración sin aplicar en producción; faltan /chaos, guias:recorrer y la mirada en navegador.
