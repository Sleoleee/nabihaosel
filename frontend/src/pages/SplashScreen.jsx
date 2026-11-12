import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

// Splash intro 3D: ribuan partikel berdatangan lalu "sync" membentuk mark SYNC,
// gradien merah brand, lalu fade ke halaman login. Klik untuk lewati.
export default function SplashScreen({ onDone }) {
  const mountRef = useRef(null)
  const [textIn, setTextIn] = useState(false)
  const [fade, setFade] = useState(false)
  const doneRef = useRef(false)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    setFade(true)
    setTimeout(() => onDone?.(), 650)
  }

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let raf, renderer, scene, camera, points, geo, mat, sprite
    let disposed = false
    const W = () => mount.clientWidth
    const H = () => mount.clientHeight

    // --- sprite partikel (dot lembut) ---
    const makeSprite = () => {
      const c = document.createElement('canvas'); c.width = c.height = 64
      const g = c.getContext('2d')
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      grd.addColorStop(0, 'rgba(255,255,255,1)')
      grd.addColorStop(0.3, 'rgba(255,255,255,0.85)')
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64)
      const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t
    }

    const start = (targets, colors) => {
      if (disposed) return
      scene = new THREE.Scene()
      camera = new THREE.PerspectiveCamera(55, W() / H(), 0.1, 1000)
      camera.position.z = 95
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(W(), H())
      mount.appendChild(renderer.domElement)

      const N = targets.length / 3
      const pos = new Float32Array(N * 3)       // posisi awal (acak di ruang)
      const start0 = new Float32Array(N * 3)
      for (let i = 0; i < N; i++) {
        const r = 70 + Math.random() * 120, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1)
        const x = r * Math.sin(ph) * Math.cos(th), y = r * Math.sin(ph) * Math.sin(th), z = r * Math.cos(ph)
        start0[i*3] = x; start0[i*3+1] = y; start0[i*3+2] = z
        pos[i*3] = x; pos[i*3+1] = y; pos[i*3+2] = z
      }
      geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      sprite = makeSprite()
      mat = new THREE.PointsMaterial({
        size: 1.25, map: sprite, vertexColors: true, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95,
      })
      points = new THREE.Points(geo, mat)
      scene.add(points)

      const t0 = performance.now()
      const ASSEMBLE = 1700
      const easeOut = (x) => 1 - Math.pow(1 - x, 3)
      const loop = () => {
        if (disposed) return
        const el = performance.now() - t0
        const p = Math.min(el / ASSEMBLE, 1), e = easeOut(p)
        const arr = geo.attributes.position.array
        for (let i = 0; i < N; i++) {
          const j = i * 3
          arr[j]   = start0[j]   + (targets[j]   - start0[j])   * e
          arr[j+1] = start0[j+1] + (targets[j+1] - start0[j+1]) * e
          arr[j+2] = start0[j+2] + (targets[j+2] - start0[j+2]) * e
        }
        geo.attributes.position.needsUpdate = true
        // rotasi halus + idle melayang setelah terbentuk
        const idle = Math.max(0, (el - ASSEMBLE) / 1000)
        points.rotation.y = (1 - e) * 0.6 + Math.sin(idle * 0.8) * 0.05
        points.rotation.x = Math.sin(idle * 0.6) * 0.03
        mat.size = 1.25 + (1 - e) * 1.6
        renderer.render(scene, camera)
        raf = requestAnimationFrame(loop)
      }
      loop()
      setTimeout(() => !disposed && setTextIn(true), 1500)
      setTimeout(() => !disposed && finish(), 3200)
    }

    // --- sampling mark -> target partikel ---
    const img = new Image()
    img.onload = () => {
      if (disposed) return
      const sw = 230, sh = Math.round(sw * img.height / img.width)
      const cv = document.createElement('canvas'); cv.width = sw; cv.height = sh
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, sw, sh)
      let data
      try { data = cx.getImageData(0, 0, sw, sh).data } catch { finish(); return }
      const pts = []
      for (let y = 0; y < sh; y += 1) for (let x = 0; x < sw; x += 1) {
        if (data[(y * sw + x) * 4 + 3] > 130) pts.push([x, y])
      }
      if (!pts.length) { finish(); return }
      // acak & ambil N
      for (let i = pts.length - 1; i > 0; i--) { const k = (Math.random() * (i + 1)) | 0;[pts[i], pts[k]] = [pts[k], pts[i]] }
      const N = Math.min(3000, pts.length)
      const scale = 70 / sw
      const targets = new Float32Array(N * 3), colors = new Float32Array(N * 3)
      const cA = new THREE.Color('#d31137'), cB = new THREE.Color('#ff6b86'), cW = new THREE.Color('#ffd9e0')
      for (let i = 0; i < N; i++) {
        const [px, py] = pts[i]
        targets[i*3]   = (px - sw / 2) * scale + (Math.random() - 0.5) * 0.4
        targets[i*3+1] = -(py - sh / 2) * scale + 11 + (Math.random() - 0.5) * 0.4
        targets[i*3+2] = (Math.random() - 0.5) * 10
        const tcol = px / sw
        const c = tcol < 0.5 ? cA.clone().lerp(cB, tcol * 2) : cB.clone().lerp(cW, (tcol - 0.5) * 2)
        if (Math.random() < 0.08) c.copy(cW)
        colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b
      }
      start(targets, colors)
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
      background: 'radial-gradient(circle at 50% 38%, #c20b32 0%, #7a0a22 42%, #120407 100%)',
      opacity: fade ? 0 : 1, transition: 'opacity 0.65s ease', overflow: 'hidden',
    }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: '26%', textAlign: 'center',
        pointerEvents: 'none',
        opacity: textIn ? 1 : 0, transform: textIn ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.8s ease, transform 0.8s ease',
      }}>
        <div style={{ color: '#fff', fontSize: 'clamp(38px,8vw,72px)', fontWeight: 800, letterSpacing: '0.18em', textShadow: '0 4px 30px rgba(0,0,0,0.4)' }}>SYNC</div>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, letterSpacing: '0.1em', marginTop: 8 }}>By TPF Group · BP Consulting Group</div>
      </div>
      <div style={{
        position: 'absolute', bottom: 28, left: 0, right: 0, textAlign: 'center',
        color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: '0.08em',
        opacity: textIn ? 1 : 0, transition: 'opacity 1s ease',
      }}>Ketuk untuk lanjut →</div>
    </div>
  )
}
