import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

// Top-level customer section
function OuterSection({ label, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/70 transition-colors text-start"
        onClick={() => setOpen(o => !o)}
      >
        {open
          ? <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
          : <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
        }
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</span>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}

// Nested sub-group section (contract / cycle level)
function InnerSection({ label, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-gray-100 dark:border-gray-800">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-6 py-2.5 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-start"
        onClick={() => setOpen(o => !o)}
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        }
        {typeof label === 'string'
          ? <span className="text-sm font-medium text-brand-600 dark:text-brand-400">{label}</span>
          : label
        }
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}

// Props:
// groups: [{ key, label: string|ReactNode, subGroups?: [{ key, label, items }], items? }]
// renderItem: (item) => ReactNode
// defaultOpen: boolean (default false)
export default function AccordionGroup({ groups, renderItem, defaultOpen = false }) {
  if (!groups?.length) return null
  return (
    <div className="space-y-4">
      {groups.map(group => (
        <OuterSection key={group.key} label={group.label} defaultOpen={defaultOpen}>
          {group.subGroups ? (
            group.subGroups.map(sub => (
              <InnerSection key={sub.key} label={sub.label} defaultOpen={defaultOpen}>
                <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
                  {sub.items?.map(item => renderItem(item))}
                </div>
              </InnerSection>
            ))
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
              {group.items?.map(item => renderItem(item))}
            </div>
          )}
        </OuterSection>
      ))}
    </div>
  )
}
