import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrinters } from '../../api/hooks/usePrinters'
import { useAssignments } from '../../api/hooks/useAssignments'
import { useDocTitle } from '../../hooks/useDocTitle'
import PageHeader from '../../components/PageHeader'
import PrinterMap from '../../components/PrinterMap'

const today = new Date().toISOString().slice(0, 10)

export default function MapPage() {
  const { t } = useTranslation()
  useDocTitle(t('nav.map'))

  const { data: printers = [] } = usePrinters()
  const { data: assignments = [] } = useAssignments()

  const activeAssignmentMap = useMemo(() => {
    const map = {}
    for (const a of assignments) {
      if (!a.assignedUntil || a.assignedUntil.slice(0, 10) >= today) {
        if (!map[a.printerId]) map[a.printerId] = a
      }
    }
    return map
  }, [assignments])

  const mapped = printers.filter(p => p.latitude != null && p.longitude != null)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title={t('map.title')}
        subtitle={`${mapped.length} ${t('map.mappedPrinters')}`}
      />
      <div className="flex-1 relative overflow-hidden" style={{ minHeight: 0 }}>
        <PrinterMap
          printers={printers}
          activeAssignmentMap={activeAssignmentMap}
          height="100%"
        />
      </div>
    </div>
  )
}
