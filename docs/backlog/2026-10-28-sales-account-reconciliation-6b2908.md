## 🧾 El Taller con su cuenta de pago por defecto (2026-10-28, ADR-0553) — migración 20261028065000 por pegar; rama `claude/sales-account-reconciliation-6b2908`

- [x] Migración de 7 reemplazos anclados (idempotente; las 7 anclas verificadas una vez en las funciones VIVAS de producción el 2026-10-28), web (Configuración, Cuentas y dinero, 3 formularios de Producción) y pruebas de base (`cuentas_dinero` 7b, `cuenta_sellada` 11b, módulo `sello-taller-antes-de-cuenta`).
- [ ] **POR PEGAR (después de publicar la web):** `supabase/migrations/20261028065000_taller_cuenta_de_pago_por_defecto.sql`, UNA parte, con la sonda de anclas y un solo Taller activo comprobados antes. Después, en Configuración ▸ Cuentas y cobros, elegir **BCP Operativa** para el Taller.
- [ ] Refrescar el diccionario (`docs/datos/generado`) cuando la migración esté pegada.
- [ ] Mirar Configuración ▸ Cuentas y cobros y Finanzas ▸ Cuentas y dinero en el navegador (escritorio, 375 px, oscuro) con el Taller ya listado por la base: ninguna prueba vigila esas casillas.
- [ ] Aparte (ADR-0552): la lista «Por explicar» para las salidas de octubre sin registrar; los formularios de depósitos de máquina (lista días viejos, vuelve a la fecha de hoy, destino por defecto).
