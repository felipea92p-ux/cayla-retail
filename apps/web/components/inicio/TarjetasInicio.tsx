// La etiqueta de sección del Inicio («Tu día», «Hoy en la sede»). Vive aparte de `page.tsx` porque la usan también las
// secciones de «Mi meta» (`MiMeta.tsx`) y una página de Next no puede exportar nada más que la pantalla.
// La tarjeta de cifra que vivía aquí (`Tarjeta`: el nombre en tinta/65 sin negrita, la misma letra que esta etiqueta, y
// el número de 24 a 30 px) se fue el 2026-10-06: el Inicio usa la pieza única `TarjetaCifra` (ADR-0358, /unificar).

// Con el vidrio (ADR-0596, Felipe 2026-11-01, docs/maquetas/inicio-lider-vidrio-2026-10/, «B · Con hilo»): versalitas con el hilo taupe
// que se desvanece hasta el borde, como `TituloGrupo`. `cuenta` es cuántos hay (el globito de los títulos, pegado al nombre) y
// `accion` lo que va a la derecha del hilo («Ajustar» en «Te toca»). Lo dibuja `app/estilos/vidrio/inicio.css` (`inicio-titulo`).
export function Etiqueta({ children, cuenta, accion }: { children: React.ReactNode; cuenta?: number; accion?: React.ReactNode }) {
  return (
    <div className="inicio-titulo mb-2.5">
      <p className="label-cayla text-[11px] text-tinta/65">{children}</p>
      {cuenta !== undefined && <span className="titulo-cuenta">{cuenta.toLocaleString("es-PE")}</span>}
      <span aria-hidden className="inicio-titulo-hilo" />
      {accion}
    </div>
  );
}
