# ADR-0593 — «Esperan una talla» dice quién espera (Felipe, 2026-10-31)

**Estado:** aceptado · migración `20261031181000` solo en local, producción espera el OK de Felipe.

## Problema
La pantalla Tienda web ▸ Vitrina ▸ Esperan una talla (ADR-0408, act. 12) decía cuántas personas tocaron «Avísame», sin quiénes.
Su migración (`20261015030000`) lo decidió a propósito: sin datos personales, porque a cada persona le avisa su cuenta, nunca la tienda
por WhatsApp (ADR-0288 G-5). Felipe pidió verlos.

## Decisión
DECIDÍ: `fn_vitrina_esperan()` devuelve `quienes` por fila (nombre de la ficha, celular, correo de la cuenta y desde cuándo), y la
pantalla los muestra al tocar «N personas». Felipe eligió «nombre y contacto» (opción B) sobre «solo nombre» (A).
DESCARTÉ: solo el nombre (A, lo que ya hace Recomendaciones) porque no deja avisarle a quien espera una talla que ya llegó.
SE ROMPE SI: se usa el celular de alguien que no aceptó WhatsApp para ofrecerle otras cosas (Ley 29733).

## Cómo se cuida
- El celular sale con `acepta_whatsapp` (`whatsapp_consentimiento_en`); sin él, la pantalla marca «Sin permiso de WhatsApp».
- Ficha anonimizada o cuenta cerrada: sin nombre, celular ni correo (cuenta como persona, no se muestra).
- Mismo candado de siempre: módulo `vitrina_web`. El vigilante de fichas lo conoce (`DE_VITRINA_ESPERAN`).
- La Actividad no guarda nada de esto (ADR-0249): es una lectura.

Esto reemplaza la nota «Aquí no salen nombres» de la pantalla y de su guía.
