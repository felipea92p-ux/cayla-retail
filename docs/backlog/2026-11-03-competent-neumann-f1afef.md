## Cantidades tecleadas: los campos que faltaban (2026-11-03)
Hecho: Nos debe (las 3 hojas), Ajustar stock, «Llenar todas con», las cajas de Colgar y Subir y los billetes de Cerrar caja ya no convierten «2,5», «1.5» ni «-5» en otro número. El código de recojo se lee igual y dice «Solo cifras». Sin migración y sin cambiar ningún tope.

**Para decidir (Felipe):** en Ajustar y «Llenar todas con», pegar «1,200» se rechaza porque pasa de su tope (999 y 99). Antes dejaba 120 y 1, sin avisar. ¿Se quedan esos topes?

**Falta:**
- [ ] El mismo error en 7 cajas más, sin tocar: `GastosFijosYActivos.tsx` (2: día del mes y días antes), `finanzas/TarifaMaquinaModal.tsx`, `orden-pagina/FilasDeFalla.tsx`, `plan-compra/CantidadEditable.tsx`, `plan-compra/RecuperoModal.tsx` y `plan-compra/RepartoModal.tsx`. `DEUDA` en `lib/cantidad-escrita-campos.test.ts` las lleva y solo baja.
- [ ] `frenar()` en Nuevo producto, Editar producto y Producción: ahí sigue el «Límite conocido» de `2026-11-02-mockup-receiving-merchandise-3f444e.md` (escribir «2,5» y hacer clic directo en guardar).
- [ ] Saldo a favor, Depósito y el código de recojo se probaron en una pantalla temporal con datos de prueba, ya borrada: los datos locales no muestran esos botones ni un pedido por entregar. Falta verlos con datos reales.
- [ ] En la planilla de Ajustar, Tab no pasa a la siguiente cantidad: el foco cae en la hoja. Ya pasaba antes de este cambio (comparado con la misma pantalla sin él). Enter sí avanza.
