import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";
import { Flip } from "gsap/Flip";
import { useGSAP } from "@gsap/react";

// Un solo lugar donde se registran los plugins de GSAP y la curva compartida —
// para que ningún componente cliente invente su propio registro ni su propia
// aproximación de la curva y quede desalineado del resto con el tiempo.
gsap.registerPlugin(useGSAP, ScrollTrigger, CustomEase, Flip);

// Misma curva que --ease-cayla en app/globals.css (arranca suave, frena
// largo). GSAP no entiende cubic-bezier crudo como CSS, así que CustomEase es
// el puente: cualquier animación de GSAP que use ease: "caylaEase" se ve
// idéntica a las animaciones CSS del resto del sistema (ADR-0011).
if (!CustomEase.get("caylaEase")) {
  CustomEase.create("caylaEase", "0.32, 0.72, 0.24, 1");
}

export { gsap, ScrollTrigger, CustomEase, Flip, useGSAP };
