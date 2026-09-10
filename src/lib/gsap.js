import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin, Flip);

export { gsap, ScrollTrigger, SplitText, DrawSVGPlugin, Flip };
