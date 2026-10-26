# Backlog · El telar de Finanzas, Resumen (2026-10-23)

- [ ] `/formidable` del Resumen nuevo: califica y propone 3 cambios; espera el OK de Felipe.
- [ ] El flujo de caja de 6 semanas por sede: `fn_flujo_caja_*` no recibe `p_ubicacion_id`. Es de la sesión de ADR-0433 y su migración en
  producción es de Felipe.
- [ ] Borrar de `app/estilos/finanzas.css` las clases del Pulso viejo del Resumen que ya nadie usa:
  - `fin-pulso-hero`, `fin-pulso-ritmo*`, `fin-pulso-lugar*`, `fin-pulso-pregunta`, `fin-pulso-si`, `fin-pulso-respuesta`, `fin-pulso-explica`
    y `fin-pulso-porque`.
  - Antes, revisar que Reportes no las use.
- [ ] Sacar `/finanzas` de `CON_TOPE_DE_ANCHO` (`components/AppShell.tsx`). Afecta a los seis submódulos: se acuerda entre las sesiones.
- [ ] «Hoy te toca» del Resumen sigue mostrando los avisos de `fn_resumen_finanzas`, que son de hoy. Hay que decidir si pasa a leer el
  cajón común (`/api/finanzas/te-toca`) cuando los seis submódulos le sumen sus pendientes.
