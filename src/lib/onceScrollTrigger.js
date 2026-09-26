// Keep ScrollTrigger's once behavior, but defer only its kill(false, 1) splice
// when refresh is walking the trigger list.
export function deferOnceScrollTriggers(ScrollTrigger, gsap) {
  if (ScrollTrigger._avpnDeferredOnce) return;
  const create = ScrollTrigger.create;
  ScrollTrigger.create = function (vars, animation) {
    const trigger = create.call(this, vars, animation);
    if (!vars?.once || !trigger) return trigger;

    const kill = trigger.kill;
    let deferred;
    let killed = false;
    trigger.kill = function (...args) {
      if (args[0] !== false || args[1] !== 1) {
        deferred?.kill();
        deferred = null;
        killed = true;
        return kill.apply(this, args);
      }
      if (deferred || killed) return this;
      deferred = gsap.delayedCall(0, () => {
        deferred = null;
        if (!killed) {
          killed = true;
          kill.call(trigger, false, 1);
        }
      });
      return this;
    };
    return trigger;
  };
  ScrollTrigger._avpnDeferredOnce = true;
}
