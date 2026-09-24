import Matter from "matter-js";
import { gsap, ScrollTrigger } from "../lib/gsap.js";

const {
  Bodies,
  Body,
  Engine,
  Events,
  Mouse,
  MouseConstraint,
  World,
} = Matter;

const DROP_INTERVAL = 120;
const DESKTOP_QUERY = "(hover: hover) and (pointer: fine)";
// Resting bodies in a heavy pile sink a few px into a static edge; pad the
// header body so the text itself stays clear.
const OBSTACLE_PADDING = 12;
const OBSTACLE_REACH = 4000;

export function initCommunitiesPile() {
  initCommunitiesPile._resize?.();
  document.querySelectorAll("[data-communities-init]").forEach((section) => {
    const previous = section._communitiesPile;
    const redrop = Boolean(previous?.dropped);
    previous?.kill();

    const pile = section.querySelector("[data-communities-pile]");
    const obstacle = section.querySelector("[data-communities-obstacle]");
    const balls = [...section.querySelectorAll("[data-communities-ball]")];
    if (!pile || balls.length === 0) return;

    sizeBallsByPercentage(balls);

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    section.dataset.communitiesState = "physics";
    const dimensions = { width: pile.clientWidth, height: pile.clientHeight };
    if (!dimensions.width || !dimensions.height) {
      delete section.dataset.communitiesState;
      return;
    }

    const desktop = window.matchMedia?.(DESKTOP_QUERY).matches
      && window.innerWidth >= 768;
    const engine = Engine.create({
      enableSleeping: true,
      positionIterations: 10,
      velocityIterations: 8,
    });
    engine.gravity.y = 2;
    engine.gravity.scale = 0.001;
    const thickness = 100;
    const floor = Bodies.rectangle(
      dimensions.width / 2,
      dimensions.height + thickness / 2,
      dimensions.width + thickness * 2,
      thickness,
      { isStatic: true },
    );
    const leftWall = Bodies.rectangle(
      -thickness / 2,
      dimensions.height / 2,
      thickness,
      dimensions.height + thickness * 2,
      { isStatic: true },
    );
    const rightWall = Bodies.rectangle(
      dimensions.width + thickness / 2,
      dimensions.height / 2,
      thickness,
      dimensions.height + thickness * 2,
      { isStatic: true },
    );
    const staticBodies = [floor, leftWall, rightWall];

    World.add(engine.world, staticBodies);

    const bodies = balls.map((element) => {
      const diameter = element.offsetWidth;
      const body = Bodies.circle(0, 0, diameter / 2, {
        restitution: 0.3,
        friction: 0.3,
        frictionAir: 0.001,
        density: 0.005,
        label: "communities-ball",
      });
      body.plugin.communitiesElement = element;
      body.plugin.communitiesRadius = diameter / 2;
      element.style.transform = `translate3d(0, ${-diameter}px, 0)`;
      element.style.visibility = "hidden";
      return body;
    });

    const instance = {
      section,
      pile,
      engine,
      bodies,
      balls,
      staticBodies,
      trigger: null,
      mouse: null,
      mouseConstraint: null,
      mouseDownHandler: null,
      mouseUpHandler: null,
      obstacle,
      obstacleBody: null,
      ceiling: null,
      desktop,
      thickness,
      timers: new Set(),
      render: null,
      tickerActive: false,
      dropped: false,
      dimensions,
    };
    instance.kill = () => kill(instance);
    section._communitiesPile = instance;
    instance.render = (time, deltaTime) => {
      if (!instance.tickerActive) return;
      Engine.update(engine, Math.min(33, Math.max(0, deltaTime * 1000)));
      if (instance.dropped && !instance.ceiling && instance.timers.size === 0
        && bodies.every((body) => body.position.y - body.plugin.communitiesRadius >= 0)) {
        instance.ceiling = Bodies.rectangle(
          dimensions.width / 2,
          -instance.thickness / 2,
          dimensions.width + instance.thickness * 2,
          instance.thickness,
          { isStatic: true },
        );
        instance.staticBodies.push(instance.ceiling);
        World.add(engine.world, instance.ceiling);
      }
      bodies.forEach((body) => {
        const radius = body.plugin.communitiesRadius;
        const x = clamp(body.position.x, radius, dimensions.width - radius);
        const y = Math.min(body.position.y, dimensions.height - radius);
        if (x !== body.position.x || y !== body.position.y) Body.setPosition(body, { x, y });
        const tilt = Math.sin(body.angle) * 0.3;
        body.plugin.communitiesElement.style.transform =
          `translate3d(${body.position.x - radius}px, ${body.position.y - radius}px, 0) rotate(${tilt}rad)`;
      });
      const mouseReleased = !instance.mouse || instance.mouse.button === -1;
      if (instance.dropped && bodies.every((body) => body.isSleeping)
        && mouseReleased && !instance.mouseConstraint?.body) {
        stopTicker(instance);
      }
    };

    const resume = () => startTicker(instance);

    if (desktop) initMouse(instance, resume);
    instance.trigger = ScrollTrigger.create({
      trigger: section,
      start: "top 70%",
      once: true,
      onEnter: () => dropBalls(instance),
    });
    if (redrop) dropBalls(instance);
  });

  let lastWidth = window.innerWidth;
  let timer;
  const onResize = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      initCommunitiesPile();
    }, 150);
  };
  window.addEventListener("resize", onResize);
  initCommunitiesPile._resize = () => {
    window.removeEventListener("resize", onResize);
    clearTimeout(timer);
  };
}

function initMouse(instance, resume) {
  const { pile, engine, bodies } = instance;
  const mouse = Mouse.create(pile);
  const mouseConstraint = MouseConstraint.create(engine, {
    mouse,
    constraint: { stiffness: 0.5, render: { visible: false } },
  });
  // Mouse.create also binds wheel; removing it keeps page scrolling native.
  mouse.element.removeEventListener("wheel", mouse.mousewheel);
  mouse.element.removeEventListener("mousewheel", mouse.mousewheel);
  mouse.element.removeEventListener("DOMMouseScroll", mouse.mousewheel);
  World.add(engine.world, mouseConstraint);
  instance.mouse = mouse;
  instance.mouseConstraint = mouseConstraint;
  instance.mouseDownHandler = () => resume();
  pile.addEventListener("mousedown", instance.mouseDownHandler);
  instance.mouseUpHandler = (event) => {
    if (mouse.button !== -1) mouse.mouseup(event);
  };
  window.addEventListener("mouseup", instance.mouseUpHandler);
  Events.on(mouseConstraint, "startdrag", ({ body }) => {
    if (!body || !bodies.includes(body)) return;
    body.isSleeping = false;
    body.plugin.communitiesElement.dataset.communitiesDragging = "";
    resume();
  });
  Events.on(mouseConstraint, "enddrag", ({ body }) => {
    if (body?.plugin?.communitiesElement) {
      delete body.plugin.communitiesElement.dataset.communitiesDragging;
    }
    resume();
  });
}

function dropBalls(instance) {
  if (instance.dropped) return;
  instance.dropped = true;
  instance.obstacleBody = buildObstacle(instance);
  if (instance.obstacleBody) {
    instance.staticBodies.push(instance.obstacleBody);
    World.add(instance.engine.world, instance.obstacleBody);
  }
  const pileRect = instance.pile.getBoundingClientRect();
  const obstacleRight = instance.obstacleBody
    ? instance.obstacle.getBoundingClientRect().right + OBSTACLE_PADDING - pileRect.left
    : 0;
  document.fonts?.ready.then(() => {
    if (instance.section._communitiesPile === instance && instance.dropped) {
      refreshObstacle(instance);
    }
  });
  startTicker(instance);
  instance.bodies.forEach((body, index) => {
    const timer = setTimeout(() => {
      instance.timers.delete(timer);
      if (!instance.section._communitiesPile) return;
      const radius = body.plugin.communitiesRadius;
      const rangeStart = instance.desktop
        ? Math.max(radius, obstacleRight + radius)
        : radius;
      const rangeEnd = instance.dimensions.width - radius;
      const x = rangeStart + Math.random() * Math.max(1, rangeEnd - rangeStart);
      Body.setPosition(body, {
        x: clamp(x, radius, instance.dimensions.width - radius),
        y: -radius * (1 + Math.random() * 0.5),
      });
      Body.setVelocity(body, { x: (Math.random() - 0.5) * 0.8, y: 1 + Math.random() * 0.5 });
      Body.setAngle(body, (Math.random() - 0.5) * 0.5);
      body.plugin.communitiesElement.style.visibility = "visible";
      World.add(instance.engine.world, body);
      startTicker(instance);
    }, index * DROP_INTERVAL);
    instance.timers.add(timer);
  });
}

function buildObstacle(instance) {
  if (!instance.obstacle || !instance.desktop) return null;

  const pileRect = instance.pile.getBoundingClientRect();
  const obstacleRect = instance.obstacle.getBoundingClientRect();
  // Span from the pile's left edge too: a fling could otherwise wedge a ball
  // in the gap between the wall and the header column, above the pile.
  const overlapLeft = pileRect.left;
  const overlapRight = Math.min(pileRect.right, obstacleRect.right + OBSTACLE_PADDING);
  // The body reaches far above the pile so nothing can perch on it and settle
  // above the heading, clipped by the section.
  const overlapTop = pileRect.top - OBSTACLE_REACH;
  const overlapBottom = Math.min(pileRect.bottom, obstacleRect.bottom + OBSTACLE_PADDING);
  if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) return null;

  return Bodies.rectangle(
    (overlapLeft + overlapRight) / 2 - pileRect.left,
    (overlapTop + overlapBottom) / 2 - pileRect.top,
    overlapRight - overlapLeft,
    overlapBottom - overlapTop,
    { isStatic: true },
  );
}

function refreshObstacle(instance) {
  if (instance.obstacleBody) {
    World.remove(instance.engine.world, instance.obstacleBody);
    const index = instance.staticBodies.indexOf(instance.obstacleBody);
    if (index !== -1) instance.staticBodies.splice(index, 1);
  }
  instance.obstacleBody = buildObstacle(instance);
  if (!instance.obstacleBody) return;
  instance.staticBodies.push(instance.obstacleBody);
  World.add(instance.engine.world, instance.obstacleBody);
  startTicker(instance);
}

function startTicker(instance) {
  if (instance.tickerActive || !instance.render) return;
  instance.tickerActive = true;
  gsap.ticker.add(instance.render, false, true);
}

function stopTicker(instance) {
  if (!instance.tickerActive) return;
  instance.tickerActive = false;
  gsap.ticker.remove(instance.render);
}

function kill(instance) {
  instance.timers.forEach((timer) => clearTimeout(timer));
  instance.timers.clear();
  stopTicker(instance);
  instance.trigger?.kill();
  if (instance.mouseConstraint) {
    Events.off(instance.mouseConstraint);
    World.remove(instance.engine.world, instance.mouseConstraint);
  }
  if (instance.mouse) {
    instance.mouse.element.removeEventListener("mousemove", instance.mouse.mousemove);
    instance.mouse.element.removeEventListener("mousedown", instance.mouse.mousedown);
    instance.mouse.element.removeEventListener("mouseup", instance.mouse.mouseup);
    instance.mouse.element.removeEventListener("wheel", instance.mouse.mousewheel);
    instance.mouse.element.removeEventListener("touchmove", instance.mouse.mousemove);
    instance.mouse.element.removeEventListener("touchstart", instance.mouse.mousedown);
    instance.mouse.element.removeEventListener("touchend", instance.mouse.mouseup);
    instance.mouse.element.removeEventListener("mousewheel", instance.mouse.mousewheel);
    instance.mouse.element.removeEventListener("DOMMouseScroll", instance.mouse.mousewheel);
  }
  if (instance.mouseDownHandler) {
    instance.pile.removeEventListener("mousedown", instance.mouseDownHandler);
  }
  if (instance.mouseUpHandler) {
    window.removeEventListener("mouseup", instance.mouseUpHandler);
  }
  World.clear(instance.engine.world, false);
  Engine.clear(instance.engine);
  instance.balls.forEach((ball) => {
    ball.style.transform = "";
    ball.style.visibility = "";
    delete ball.dataset.communitiesDragging;
  });
  delete instance.section.dataset.communitiesState;
  instance.section._communitiesPile = null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sizeBallsByPercentage(balls) {
  const values = balls.map((element) => {
    element.style.removeProperty("--communities-t");
    const value = Number.parseFloat(
      element.querySelector(".communities_ball-value")?.textContent ?? "",
    );
    return Number.isFinite(value) ? value : null;
  });
  const parsedValues = values.filter((value) => value !== null);
  if (parsedValues.length === 0) return;

  const min = Math.min(...parsedValues);
  const max = Math.max(...parsedValues);
  balls.forEach((element, index) => {
    const value = values[index];
    if (value === null) return;
    const t = max === min ? 0.5 : clamp((value - min) / (max - min), 0, 1);
    element.style.setProperty("--communities-t", String(Math.round(t * 10000) / 10000));
  });
}

export function teardownCommunitiesPile(section) {
  section?._communitiesPile?.kill();
}
