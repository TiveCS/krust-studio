import { DataGrid } from './DataGrid'
import { StructureView } from './StructureView'
import { NewTableEditor } from './NewTableEditor'
import { QueryView } from './QueryView'
import { useConnections } from '@/store/connections'

export function TableTabView(): React.JSX.Element | null {
  const { tabs, activeTabId } = useConnections()
  const tab = tabs.find((t) => t.id === activeTabId)
  if (!tab) return null

  if (tab.draft) return <NewTableEditor tab={tab} />
  if (tab.query) return <QueryView key={tab.id} />

  // Data/Structure switch lives in each view's own footer (bottom-left), so the
  // active view fills the whole height here.
  return tab.view === 'data' ? <DataGrid key={tab.id} /> : <StructureView key={tab.id} />
}
