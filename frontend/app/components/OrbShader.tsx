"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

/**
 * OrbShader — inline WebGL orb rendered directly in React.
 * Same GLSL shader as the old iframe orb, no external CDN, no iframe.
 */

const RESOLUTION = 256;

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec3 u_color1;
  uniform vec3 u_color2;
  uniform vec3 u_color3;
  uniform float u_speed;
  uniform sampler2D u_waterTexture;
  uniform float u_waterStrength;
  uniform float u_ripple_time;
  uniform vec2 u_ripple_position;
  uniform float u_ripple_strength;
  uniform float u_audioLow;
  uniform float u_audioMid;
  uniform float u_audioHigh;
  uniform float u_audioOverall;
  uniform float u_audioReactivity;

  varying vec2 vUv;

  void main() {
    vec2 r = u_resolution;
    vec2 FC = gl_FragCoord.xy;
    vec2 screenP = (FC.xy * 2.0 - r) / min(r.x, r.y);

    vec2 wCoord = vec2(FC.x / r.x, FC.y / r.y);
    float waterHeight = texture2D(u_waterTexture, wCoord).r;
    float waterInfluence = clamp(waterHeight * u_waterStrength, -0.5, 0.5);

    float baseRadius = 0.9;
    float audioPulse = u_audioOverall * u_audioReactivity * 0.1;
    float waterPulse = waterInfluence * 0.3;
    float circleRadius = baseRadius + audioPulse + waterPulse;

    float distFromCenter = length(screenP);
    float inCircle = smoothstep(circleRadius + 0.1, circleRadius - 0.1, distFromCenter);

    vec4 o = vec4(0.0);

    if (inCircle > 0.0) {
      vec2 p = screenP * 1.1;

      float rippleTime = u_time - u_ripple_time;
      vec2 ripplePos = u_ripple_position * r;
      float rippleDist = distance(FC.xy, ripplePos);

      float clickRipple = 0.0;
      if (rippleTime < 3.0 && rippleTime > 0.0) {
        float rippleRadius = rippleTime * 150.0;
        float rippleWidth = 30.0;
        float rippleDecay = 1.0 - rippleTime / 3.0;
        clickRipple = exp(-abs(rippleDist - rippleRadius) / rippleWidth) * rippleDecay * u_ripple_strength;
      }

      float totalWaterInfluence = clamp((waterInfluence + clickRipple * 0.1) * u_waterStrength, -0.8, 0.8);
      float audioInfluence = (u_audioLow * 0.3 + u_audioMid * 0.4 + u_audioHigh * 0.3) * u_audioReactivity;

      float angle = length(p) * 4.0 + audioInfluence * 2.0;
      mat2 R = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
      p *= R;

      float l = length(p) - 0.7 + totalWaterInfluence * 0.5 + audioInfluence * 0.2;
      float t = u_time * u_speed + totalWaterInfluence * 2.0 + audioInfluence * 1.5;
      float enhancedY = p.y + totalWaterInfluence * 0.3 + audioInfluence * 0.2;

      float pattern1 = 0.5 + 0.5 * tanh(0.1 / max(l / 0.1, -l) - sin(l + enhancedY * max(1.0, -l / 0.1) + t));
      float pattern2 = 0.5 + 0.5 * tanh(0.1 / max(l / 0.1, -l) - sin(l + enhancedY * max(1.0, -l / 0.1) + t + 1.0));
      float pattern3 = 0.5 + 0.5 * tanh(0.1 / max(l / 0.1, -l) - sin(l + enhancedY * max(1.0, -l / 0.1) + t + 2.0));

      float intensity = 1.0 + totalWaterInfluence * 0.5 + audioInfluence * 0.3;

      o.r = pattern1 * u_color1.r * intensity;
      o.g = pattern2 * u_color2.g * intensity;
      o.b = pattern3 * u_color3.b * intensity;
      o.a = inCircle;
    }

    gl_FragColor = vec4(o.rgb, o.a);
  }
`;

interface OrbShaderProps {
  size?: number;
  colors?: { color1: number[]; color2: number[]; color3: number[] };
  audioData?: { bass: number; mid: number; treble: number; overall: number };
  onRipple?: boolean;
  ripplePosition?: { x: number; y: number };
}

export default function OrbShader({ size = 240, colors, audioData, onRipple, ripplePosition }: OrbShaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const clockRef = useRef<THREE.Clock | null>(null);
  const waterRef = useRef<{ current: Float32Array; previous: Float32Array; velocity: Float32Array } | undefined>(undefined);
  const waterTextureRef = useRef<THREE.DataTexture | null>(null);
  const animFrameRef = useRef<number>(0);

  // Water simulation
  const initWater = useCallback(() => {
    const res = RESOLUTION;
    const current = new Float32Array(res * res);
    const previous = new Float32Array(res * res);
    const velocity = new Float32Array(res * res * 2);
    waterRef.current = { current, previous, velocity };

    const tex = new THREE.DataTexture(current, res, res, THREE.RedFormat, THREE.FloatType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    waterTextureRef.current = tex;
    return tex;
  }, []);

  const updateWater = useCallback(() => {
    const w = waterRef.current;
    if (!w) return;
    const res = RESOLUTION;
    const { current, previous, velocity } = w;
    const damping = 0.913;
    const tension = 0.02;

    // Velocity dissipation
    for (let i = 0; i < res * res * 2; i++) {
      velocity[i] *= 0.92;
    }

    // Water sim (matches original script-v2.js exactly)
    for (let i = 1; i < res - 1; i++) {
      for (let j = 1; j < res - 1; j++) {
        const idx = i * res + j;
        const top = previous[idx - res];
        const bottom = previous[idx + res];
        const left = previous[idx - 1];
        const right = previous[idx + 1];
        current[idx] = (top + bottom + left + right) / 2 - current[idx];
        current[idx] = current[idx] * damping + previous[idx] * (1 - damping);
        current[idx] += (0 - previous[idx]) * tension;
        const vi = idx * 2;
        const velMag = Math.sqrt(velocity[vi] * velocity[vi] + velocity[vi + 1] * velocity[vi + 1]);
        current[idx] += Math.min(velMag * 0.01, 0.1);
        current[idx] *= 0.99;
        current[idx] = Math.max(-2.0, Math.min(2.0, current[idx]));
      }
    }

    // Zero boundary
    for (let i = 0; i < res; i++) {
      current[i] = 0;
      current[(res - 1) * res + i] = 0;
      current[i * res] = 0;
      current[i * res + (res - 1)] = 0;
    }

    // Swap buffers (reference swap like original)
    w.previous = w.current;
    w.current = current;

    if (waterTextureRef.current) {
      (waterTextureRef.current.image as any).data = w.current;
      waterTextureRef.current.needsUpdate = true;
    }
  }, []);

  const addRipple = useCallback((nx: number, ny: number, strength = 3.0) => {
    const w = waterRef.current;
    if (!w) return;
    const res = RESOLUTION;
    const texX = Math.floor(nx * res);
    const texY = Math.floor((1.0 - ny) * res);
    const radius = 8;
    const radiusSq = radius * radius;

    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        const distSq = i * i + j * j;
        if (distSq > radiusSq) continue;
        const px = texX + i;
        const py = texY + j;
        if (px < 0 || px >= res || py < 0 || py >= res) continue;
        const idx = py * res + px;
        const dist = Math.sqrt(distSq);
        const falloff = 1.0 - dist / radius;
        const rippleVal = Math.cos((dist / radius) * Math.PI * 0.5) * strength * falloff * 0.5;
        w.previous[idx] += rippleVal;
        const angle = Math.atan2(j, i);
        const vi = idx * 2;
        w.velocity[vi] += Math.cos(angle) * rippleVal * 0.2;
        w.velocity[vi + 1] += Math.sin(angle) * rippleVal * 0.2;
      }
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const waterTex = initWater();

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      uniforms: {
        u_time: { value: 0.0 },
        u_resolution: { value: new THREE.Vector2(size, size) },
        u_speed: { value: 1.3 },
        u_color1: { value: new THREE.Vector3(1.0, 0.70, 0.16) },
        u_color2: { value: new THREE.Vector3(1.0, 0.46, 0.18) },
        u_color3: { value: new THREE.Vector3(0.55, 0.16, 0.48) },
        u_waterTexture: { value: waterTex },
        u_waterStrength: { value: 0.55 },
        u_ripple_time: { value: -10.0 },
        u_ripple_position: { value: new THREE.Vector2(0.5, 0.5) },
        u_ripple_strength: { value: 0.5 },
        u_audioLow: { value: 0.0 },
        u_audioMid: { value: 0.0 },
        u_audioHigh: { value: 0.0 },
        u_audioOverall: { value: 0.0 },
        u_audioReactivity: { value: 1.0 },
      },
    });
    materialRef.current = material;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const clock = new THREE.Clock();
    clockRef.current = clock;

    // Initial ripple
    setTimeout(() => addRipple(0.5, 0.5, 1.5), 500);

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      material.uniforms.u_time.value = clock.getElapsedTime();
      updateWater();
      renderer.render(scene, camera);
    };
    animate();

    // Fade in
    renderer.domElement.style.opacity = "0";
    renderer.domElement.style.transition = "opacity 0.3s ease";
    setTimeout(() => { renderer.domElement.style.opacity = "1"; }, 100);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      material.dispose();
      geometry.dispose();
      waterTex.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [size, initWater, updateWater, addRipple]);

  // Update colors
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat || !colors) return;
    mat.uniforms.u_color1.value.fromArray(colors.color1);
    mat.uniforms.u_color2.value.fromArray(colors.color2);
    mat.uniforms.u_color3.value.fromArray(colors.color3);
  }, [colors]);

  // Update audio data
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat || !audioData) return;
    const s = 0.8;
    mat.uniforms.u_audioLow.value = mat.uniforms.u_audioLow.value * s + audioData.bass * (1 - s);
    mat.uniforms.u_audioMid.value = mat.uniforms.u_audioMid.value * s + audioData.mid * (1 - s);
    mat.uniforms.u_audioHigh.value = mat.uniforms.u_audioHigh.value * s + audioData.treble * (1 - s);
    mat.uniforms.u_audioOverall.value = mat.uniforms.u_audioOverall.value * s + audioData.overall * (1 - s);
  }, [audioData]);

  // Handle ripple trigger
  useEffect(() => {
    if (!onRipple) return;
    const x = ripplePosition?.x ?? 0.5;
    const y = ripplePosition?.y ?? 0.5;
    addRipple(x, y, 3.0);
    const mat = materialRef.current;
    if (mat) {
      mat.uniforms.u_ripple_position.value.set(x, 1.0 - y);
      mat.uniforms.u_ripple_time.value = clockRef.current?.getElapsedTime() ?? 0;
    }
  }, [onRipple, ripplePosition, addRipple]);

  // Mouse/touch ripple on the orb itself
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    addRipple(nx, ny, 0.8);
  }, [addRipple]);

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden" }}
    />
  );
}
