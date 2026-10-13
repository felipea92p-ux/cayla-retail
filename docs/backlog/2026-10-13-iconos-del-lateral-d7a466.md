## 🎨 Íconos del lateral: los más directos y ninguno repetido (2026-10-13, ADR-0394) — solo web, sin migración; rama `claude/iconos-del-lateral-d7a466`

- [x] Medido por perfil: cuatro pares con el mismo ícono (Plan del piso y Rendimiento; Análisis y Compras ▸ Plan de campaña; Producción ▸ Recibir y Recibir mercadería). Prueba nueva en `menu.test.ts` que los cazaba (falló con cuatro) y ahora pasa.
- [x] Siete íconos nuevos elegidos con prueba ciega de dos rondas (12 jueces simulados, íconos actuales de control): maletín, microscopio, hoja, estantería, trofeo, megáfono y caja abierta; cuatro claves nuevas en `ClaveIcono`; foto del menú con las claves de cuatro filas.
- [x] Verificado: suite completa, `tsc`, el lateral del líder (tienda y Taller) a doble resolución en claro y oscuro, y el menú real en el navegador con la sesión de Felipe (solo lectura).
- [ ] **Sin probar:** que los íconos se entiendan con colaboradoras reales (los jueces son agentes que representan perfiles), `tema:auditar` y `guias:recorrer` (no hay base local en esta máquina).
- [ ] Felipe decide: Gestión quedó entre el maletín (3 votos a 2 en contra del timón; se prefirió por legibilidad a 18 px). Cambiar es una línea en `IC`.
- [ ] Felipe decide si se tocan los parecidos sin clave repetida: Finanzas ↔ Producción ▸ Resumen ↔ Atributos (grillas), Comprobantes ↔ Facturas de proveedor (hoja), y las tres bolsas (Ventas, Compras, Posventa).
