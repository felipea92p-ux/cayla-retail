# Impuestos: qué exige SUNAT a CAYLA y qué cubre hoy el módulo (2026-10-26)

Pregunta de Felipe: «¿con esta maqueta estaría completo el módulo de Impuestos?». **No**: la maqueta (`docs/maquetas/impuestos-simple-2026-10/`) es
solo el rediseño de la pantalla. Esto es lo que se investigó para saber qué falta de verdad. Nada de aquí es asesoría tributaria: las fuentes son en
su mayoría blogs contables y páginas de SUNAT que respondieron a medias (una dio 403), así que **todo lo marcado «confirmar» lo decide el contador**.

## Qué cubre hoy el módulo (leído del código, no de la documentación)

| Obligación | Estado | Dónde |
|---|---|---|
| IGV mensual (formulario 621) | Calcula; **no declara** (lo presenta el contador) | `fn_impuestos_panel`, `lib/impuestos-balanza-reglas.ts` |
| Pago a cuenta de renta (1 % hasta 300 UIT) | Sí, con parámetros por año | `parametros_tributarios`, Configuración ▸ Impuestos |
| Límite de 300 UIT y aviso a las 250 | Sí, año calendario (ADR-0484) | `lib/impuestos-reglas.ts` (`avisoUmbral`) |
| «Antes de declarar» (rechazados, ventas sin comprobante, boletas, IGV perdido, honorarios) | Sí | `lib/impuestos-antes-reglas.ts` |
| Registros de ventas y compras para el contador | **Parcial**: CSV de apoyo, no el formato oficial | `csvRegistroVentas`, `csvRegistroCompras` |
| Libro Diario / Mayor | Parcial: `fn_diario` y Balance existen; D-36 deja los libros al contador | `docs/datos/DECISIONES-2026-09-12.md` (D-36) |
| Renta anual (declaración jurada) | **No existe** | — |
| ITAN | **No existe** | — |
| Detracciones (compras de servicios sobre S/ 700) | **No existe** | — |
| Planilla (PLAME, EsSalud, renta de 5ta) | Fuera de este módulo | Colaboradores / Dynamic |

## Hallazgos de la investigación

1. **El SIRE puede haber reemplazado al PLE 14.1 y 8.1.** El código llama al CSV «insumo del PLE 14.1 y 8.1 simplificado, D-36» y una nota del
   backlog habla de un umbral de 75 UIT para el SIRE. Fuentes secundarias (Misha, Gestión, El Peruano) dicen que el Régimen MYPE Tributario está
   obligado al SIRE **desde el periodo agosto 2024** si ya llevaba los registros de ventas y compras. La página oficial de SUNAT que se pudo leer
   (`orientacion.sunat.gob.pe/registros-y-libros-1`) solo habla de Régimen General y RER con 75 UIT y no menciona al RMT. **Confirmar con el contador.**
   Si aplica, falta una pieza que compare lo del ERP con la propuesta de SUNAT.
2. **Una frase de la pantalla puede ser imprecisa.** `components/ImpuestosPanel.tsx` (tarjeta del límite) dice «Al cruzarlo, SUNAT te exige llevar el
   Libro Diario y el Mayor electrónicos». La tabla de SUNAT para el RMT dice: hasta 300 UIT, Registro de Ventas, de Compras y Libro Diario simplificado;
   de 300 a 500 UIT, se suman Diario y Mayor; de 500 a 1 700 UIT, también Inventarios y Balances. **No dice «electrónicos»**. Sugerencia: quitar la palabra
   hasta que el contador la confirme.
3. **ITAN.** Según guías contables (DL 1269), el RMT con activos netos sobre S/ 1 000 000 al 31 de diciembre queda afecto. Los activos incluyen inventario
   y los activos fijos cargados; hoy nada lo vigila. Se puede estimar con el Balance General de diciembre. **Confirmar umbral y tasa.**
4. **Renta anual.** Una nota de prensa de diciembre de 2025 (Infobae, Ley 31940) da plazos entre el 27 de mayo y el 10 de junio de 2026 para el RMT con
   hasta 1 700 UIT; la tasa anual sería 10 % sobre las primeras 15 UIT y 29,5 % sobre el exceso. Falta estimar el impuesto anual y compararlo con lo
   pagado a cuenta. **Confirmar fechas y tasas.**
5. **Sin verificar:** retenciones y percepciones del IGV (sin resultados útiles) y las tasas actuales de detracción (la regla de S/ 700 viene de una
   fuente antigua; las tasas, de blogs).

## Orden sugerido

1. El ciclo mensual completo: unir cada pago a SUNAT con el mes que paga y la fecha de vencimiento por último dígito del RUC (decisiones de Felipe).
2. Confirmar con el contador el SIRE y el formato del archivo que se le entrega.
3. Aviso de ITAN y estimación de la renta anual.
4. Preguntar por detracciones y retenciones.

## Fuentes

- Resolución 125-2026/SUNAT (SIRE): https://www.sunat.gob.pe/legislacion/superin/2026/000125-2026.pdf
- Régimen MYPE obligado al SIRE (Misha): https://misha.pe/tributario/regimen-mype-tributario-obligado-sire-sunat/
- Registros y libros (SUNAT): https://orientacion.sunat.gob.pe/registros-y-libros-1
- Libros contables obligatorios (Misha): https://misha.pe/tributario/libros-contables-obligatorios-sunat
- Régimen MYPE Tributario e ITAN (Misha): https://misha.pe/tributario/regimen-mype-tributario-itan
- Cronograma de renta anual 2026 (Infobae): https://www.infobae.com/peru/2025/12/30/declaracion-jurada-2025-sunat-publica-nuevo-cronograma-de-pago-del-impuesto-a-la-renta-para-personas-naturales-y-mype-en-2026/
- Pagos a cuenta del Régimen MYPE (Misha): https://misha.pe/?p=53390
- Detracciones 2026 (Modelo.pe): https://modelo.pe/blog/detracciones-sunat-como-funcionan-2026/
