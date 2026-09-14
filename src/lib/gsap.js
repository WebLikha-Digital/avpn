import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { CustomEase } from "gsap/CustomEase";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin, CustomEase, Flip);

// Shared named eases. Register once here so any animation can use them by name.
CustomEase.create("smooth", "M0,0 C0.38,0.005 0.215,1 1,1");

export { gsap, ScrollTrigger, SplitText, DrawSVGPlugin, CustomEase, Flip };
