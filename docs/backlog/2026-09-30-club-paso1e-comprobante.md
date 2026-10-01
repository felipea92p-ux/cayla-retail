## 🌸 Club de clientas · tanda 1e — el comprobante con carné y pasaporte (2026-09-30, ADR-0288 D-3) — migración `20260930250000` sin aplicar en producción; rama `claude/club-paso1e-comprobante-carne-pasaporte`

- [x] Migración: candado de tipos de `comprobantes` con `carne_extranjeria` y `pasaporte`, candado de formato
      `comprobantes_carne_pasaporte_formato`, y `emitir_comprobante` que los limpia y valida con `fn_documento_clienta`
      (reemplazo anclado, candado de versión: antes `392971c9…`, después `a3f15c5b…`). Probada en un Postgres desechable:
      `pruebas:comprobante-carne-pasaporte` 20/20; `registrar_venta`, `club-venta-ligada`, notas de crédito, separaciones,
      impuestos y comprobantes en verde.
- [x] Web: `lib/documento-comprobante-reglas.ts` (catálogo 06), `lib/lucode.ts` manda «4» y «7», QR, térmica, A4,
      registro de ventas y combo «Tipo de documento» en el paso Comprobante de Cobrar. `tsc`, vitest completo y eslint en verde.
- [ ] **Felipe: pegar la migración** `supabase/migrations/20260930250000_club_paso1e_comprobante_carne_pasaporte.sql` en el SQL
      Editor de producción, una sola parte, DESPUÉS de la 1a (`20260930160000`) y ANTES de fusionar la web de esta tanda.
      Si la sección 0 aborta con «cambió desde que se escribió», `emitir_comprobante` de producción no es la de main: no se
      pega a ciegas, se rehace el reemplazo sobre su definición viva.
- [ ] **Felipe: emitir UNA boleta de prueba real a un carné en Lucode y confirmar que SUNAT la acepta** (tipo «4»). Hasta
      entonces el código «4»/«7» está NO VERIFICADO contra Lucode: sale del catálogo 06 de SUNAT, pero ninguna boleta a un
      carné o pasaporte se transmitió aún, ni al sandbox. Después, una a un pasaporte («7»).
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando la migración esté en producción.
- [ ] Ver en el navegador, también a 375 px (PL-105): Cobrar → boleta → «Tipo de documento» ▸ Carné → número y nombre →
      cobrar; el ticket impreso dice «CE» y el QR lleva «4». Con un carné de 5 caracteres, el botón Cobrar dice qué falta.
- [ ] **Sin construir (su propia tanda):** apartados con carné o pasaporte. `separaciones.clienta_dni` y `p_clienta_dni`
      de `separar_prendas`/`separar_pedido_para_apartar` son solo de DNI; hoy ese apartado sale «sin documento» con su nombre.
- [ ] **Deuda vista de paso:** `/vender` sigue `pendiente` en la guía de foco (ADR-0284); el paso Comprobante no tiene guía.
