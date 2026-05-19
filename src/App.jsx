import { Suspense } from 'react'
import { useStore } from './store/useStore'
import ProjectList from './components/ProjectList'
import Settings    from './components/Settings'
import Topbar      from './components/Topbar'
import PanelLeft   from './components/PanelLeft'
import Canvas3D    from './components/Canvas3D'
import PanelRight  from './components/PanelRight'
import StatusBar   from './components/StatusBar'

export default function App() {
  const { vista } = useStore()

  if (vista === 'projects') return <ProjectList />
  if (vista === 'settings') return <Settings />

  // Editor
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Topbar />
      <div style={{ flex: 1, display: 'flex', gap: '10px', padding: '10px', overflow: 'hidden' }}>
        <PanelLeft />
        <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)' }}>Cargando canvas…</div>}>
          <Canvas3D />
        </Suspense>
        <PanelRight />
      </div>
      <StatusBar />
    </div>
  )
}
