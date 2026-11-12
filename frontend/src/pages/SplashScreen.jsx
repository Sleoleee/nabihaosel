import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

// Intro 3D (~7.6s): partikel berdatangan -> membentuk mark SYNC (bervolume) ->
// orbit 3D -> pulse/beat -> settle menghadap depan -> wordmark logo asli muncul ->
// fade ke halaman login. Klik untuk lewati.
const A = 2000, O = 4300, P = 5300, SET = 7100, END = 7700   // milestone (ms)

export default function SplashScreen({ onDone }) {
  const mountRef = useRef(null)
  const [textIn, setTextIn] = useState(false)
  const [fade, setFade] = useState(false)
  const doneRef = useRef(false)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    setFade(true)
    setTimeout(() => onDone?.(), 700)
  }

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let raf, renderer, scene, camera, points, geo, mat, sprite
    let disposed = false
    const W = () => mount.clientWidth
    const H = () => mount.clientHeight

    const makeSprite = () => {
      const c = document.createElement('canvas'); c.width = c.height = 64
      const g = c.getContext('2d')
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      grd.addColorStop(0, 'rgba(255,255,255,1)')
      grd.addColorStop(0.35, 'rgba(255,255,255,0.8)')
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64)
      const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t
    }

    const easeOut = (x) => 1 - Math.pow(1 - x, 3)
    const easeInOut = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2

    const start = (targets, start0, colors) => {
      if (disposed) return
      scene = new THREE.Scene()
      camera = new THREE.PerspectiveCamera(55, W() / H(), 0.1, 1000)
      camera.position.z = 100
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(W(), H())
      mount.appendChild(renderer.domElement)

      const N = targets.length / 3
      const pos = new Float32Array(start0)        // posisi berjalan (mulai dari start0)
      geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      sprite = makeSprite()
      mat = new THREE.PointsMaterial({
        size: 1.15, map: sprite, vertexColors: true, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.96,
      })
      points = new THREE.Points(geo, mat)
      scene.add(points)

      const t0 = performance.now()
      const loop = () => {
        if (disposed) return
        const el = performance.now() - t0
        const arr = geo.attributes.position.array

        // --- FASE 1: rakit (lerp start0 -> target) ---
        const p1 = Math.min(el / A, 1), e1 = easeOut(p1)
        if (p1 < 1) {
          for (let i = 0; i < N * 3; i++) arr[i] = start0[i] + (targets[i] - start0[i]) * e1
          geo.attributes.position.needsUpdate = true
        } else if (!geo._locked) {
          for (let i = 0; i < N * 3; i++) arr[i] = targets[i]
          geo.attributes.position.needsUpdate = true
          geo._locked = true
        }

        // --- rotasi: sedikit saat rakit, orbit penuh, lalu settle menghadap depan ---
        let ry
        if (el < A) ry = e1 * 0.45
        else if (el < O) ry = 0.45 + ((el - A) / (O - A)) * Math.PI * 2 * 1.1
        else if (el < P) ry = 0.45 + Math.PI * 2 * 1.1
        else {
          const target = Math.PI * 2            // satu putaran penuh = menghadap depan
          const from = 0.45 + Math.PI * 2 * 1.1
          const sp = Math.min((el - P) / (SET - P), 1)
          ry = from + (target - from) * easeInOut(sp)
        }
        points.rotation.y = ry
        points.rotation.x = Math.sin(el / 1400) * 0.06

        // --- FASE 3: pulse/beat (mengembang-mengempis) ---
        let sc = 1
        if (el >= O && el < SET) {
          const ph = (el - O) / (SET - O)
          sc = 1 + 0.16 * Math.sin(ph * Math.PI) * Math.sin(ph * Math.PI * 3)
        }
        points.scale.setScalar(sc)
        mat.size = 1.15 + (1 - e1) * 1.8 + (el >= O && el < SET ? Math.abs(Math.sin((el - O) / 180)) * 0.5 : 0)

        // kamera dolly halus
        camera.position.z = 100 - easeOut(Math.min(el / SET, 1)) * 18

        renderer.render(scene, camera)
        raf = requestAnimationFrame(loop)
      }
      loop()
      setTimeout(() => !disposed && setTextIn(true), P)
      setTimeout(() => !disposed && finish(), END)
    }

    // --- sampling mark -> target bervolume (ada kedalaman z) ---
    const img = new Image()
    img.onload = () => {
      if (disposed) return
      const sw = 240, sh = Math.round(sw * img.height / img.width)
      const cv = document.createElement('canvas'); cv.width = sw; cv.height = sh
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, sw, sh)
      let data
      try { data = cx.getImageData(0, 0, sw, sh).data } catch { finish(); return }
      const pts = []
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        if (data[(y * sw + x) * 4 + 3] > 130) pts.push([x, y])
      }
      if (!pts.length) { finish(); return }
      for (let i = pts.length - 1; i > 0; i--) { const k = (Math.random() * (i + 1)) | 0;[pts[i], pts[k]] = [pts[k], pts[i]] }
      const N = Math.min(3600, pts.length)
      const scale = 72 / sw
      const targets = new Float32Array(N * 3), start0 = new Float32Array(N * 3), colors = new Float32Array(N * 3)
      const cA = new THREE.Color('#d31137'), cB = new THREE.Color('#ff6b86'), cW = new THREE.Color('#ffe2e8')
      for (let i = 0; i < N; i++) {
        const [px, py] = pts[i]
        targets[i*3]   = (px - sw / 2) * scale
        targets[i*3+1] = -(py - sh / 2) * scale + 2
        targets[i*3+2] = (Math.random() - 0.5) * 30            // kedalaman (volume)
        // posisi awal: menyebar jauh di ruang 3D
        const r = 90 + Math.random() * 150, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1)
        start0[i*3]   = r * Math.sin(ph) * Math.cos(th)
        start0[i*3+1] = r * Math.sin(ph) * Math.sin(th)
        start0[i*3+2] = r * Math.cos(ph)
        const tcol = px / sw
        const c = tcol < 0.5 ? cA.clone().lerp(cB, tcol * 2) : cB.clone().lerp(cW, (tcol - 0.5) * 2)
        if (Math.random() < 0.09) c.copy(cW)
        colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b
      }
      start(targets, start0, colors)
    }
    img.onerror = () => finish()
    img.src = '/sync-mark.png'

    const onResize = () => { if (renderer && camera) { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()) } }
    window.addEventListener('resize', onResize)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      if (renderer) { renderer.dispose(); if (renderer.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement) }
      geo?.dispose(); mat?.dispose(); sprite?.dispose()
    }
  }, [])  // eslint-disable-line

  return (
    <div onClick={finish} style={{
      position: 'fixed', inset: 0, zIndex: 9999, cursor: 'pointer',
      background: 'radial-gradient(circle at 50% 42%, #c20b32 0%, #7a0a22 44%, #120407 100%)',
      opacity: fade ? 0 : 1, transition: 'opacity 0.7s ease', overflow: 'hidden',
    }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: '22%', textAlign: 'center', pointerEvents: 'none',
        opacity: textIn ? 1 : 0, transform: textIn ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.96)',
        transition: 'opacity 1s ease, transform 1s cubic-bezier(.2,.7,.2,1)',
      }}>
        <img src="/sync-word.png" alt="SYNC" style={{ height: 'clamp(42px,8vw,80px)', width: 'auto', filter: 'drop-shadow(0 6px 30px rgba(0,0,0,0.35))' }} />
        <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, letterSpacing: '0.14em', marginTop: 14, fontWeight: 500 }}>By TPF Group&nbsp;&nbsp;·&nbsp;&nbsp;BP Consulting Group</div>
      </div>
      <div style={{
        position: 'absolute', bottom: 26, left: 0, right: 0, textAlign: 'center',
        color: 'rgba(255,255,255,0.45)', fontSize: 11, letterSpacing: '0.1em',
        opacity: textIn ? 1 : 0, transition: 'opacity 1s ease',
      }}>Ketuk untuk lanjut →</div>
    </div>
  )
}
