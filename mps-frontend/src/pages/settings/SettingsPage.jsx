import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Activity } from 'lucide-react'
import { useSettingsRaw, useUpdateSetting, useRecalculateExcess } from '../../api/hooks/useSettings'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmDialog from '../../components/ConfirmDialog'
import { fmtDate } from '../../utils/format'
import { useDocTitle } from '../../hooks/useDocTitle'

function Toggle({ enabled, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed ${
        enabled
          ? 'bg-brand-600 dark:bg-brand-500'
          : 'bg-gray-200 dark:bg-gray-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function SettingRow({ title, description, settingObj, onToggle, isPending }) {
  const { t } = useTranslation()
  const enabled = settingObj?.value === 'true'

  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{title}</p>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        {settingObj?.updatedAt && (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            {t('settings.lastChanged')}: {fmtDate(settingObj.updatedAt)}
            {settingObj.updatedByName && ` ${t('common.by')} ${settingObj.updatedByName}`}
          </p>
        )}
      </div>
      <div className="flex-shrink-0 pt-0.5">
        <Toggle
          enabled={enabled}
          onChange={() => onToggle(settingObj?.key, settingObj?.value ?? 'true')}
          disabled={isPending}
        />
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { t } = useTranslation()
  useDocTitle(t('settings.title'))

  const { user } = useAuth()
  const isAdmin = user?.role?.name === 'admin'

  const { data: settings, isLoading } = useSettingsRaw()
  const { mutate: updateSetting, isPending } = useUpdateSetting()
  const { showToast } = useToast()
  const recalcMutation = useRecalculateExcess()

  const [recalcOpen, setRecalcOpen] = useState(false)
  const [recalcResult, setRecalcResult] = useState(null)

  function handleToggle(key, currentValue) {
    const newValue = currentValue === 'true' ? 'false' : 'true'
    updateSetting(
      { key, value: newValue },
      {
        onSuccess: () => showToast({ title: t('settings.settingUpdated'), variant: 'success' }),
        onError: () => showToast({ title: t('settings.settingUpdateError'), variant: 'error' }),
      }
    )
  }

  async function handleRecalcConfirm() {
    const result = await recalcMutation.mutateAsync()
    setRecalcOpen(false)
    setRecalcResult(result)
  }

  const calcDetailsSetting = settings?.find(s => s.key === 'show_calculation_details')

  if (isLoading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title={t('settings.title')} />

      <div className="max-w-2xl space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t('settings.billingSection')}
            </h2>
          </div>
          <div className="px-5 divide-y divide-gray-100 dark:divide-gray-800">
            <SettingRow
              title={t('settings.calculationDetailsTitle')}
              description={t('settings.calculationDetailsDesc')}
              settingObj={calcDetailsSetting}
              onToggle={handleToggle}
              isPending={isPending}
            />
          </div>
        </div>

        {isAdmin && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {t('settings.dataMaintenance')}
              </h2>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('settings.recalcExcessTitle')}</p>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t('settings.recalcExcessDesc')}</p>
                  {recalcResult && (
                    <div className="mt-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-800 dark:text-green-300">
                      <p className="font-semibold">✓ {t('settings.recalcSuccess')}</p>
                      <ul className="mt-1 space-y-0.5 text-green-700 dark:text-green-400">
                        <li>{recalcResult.totalReadings.toLocaleString()} {t('settings.recalcReadingsProcessed')}</li>
                        <li>{recalcResult.updatedReadings.toLocaleString()} {t('settings.recalcReadingsUpdated')}</li>
                        <li>{recalcResult.skippedReadings.toLocaleString()} {t('settings.recalcReadingsUnchanged')}</li>
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0 pt-0.5">
                  <button
                    onClick={() => { setRecalcResult(null); setRecalcOpen(true) }}
                    disabled={recalcMutation.isPending}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {recalcMutation.isPending
                      ? <span className="flex items-center gap-2"><LoadingSpinner className="h-4 w-4" />{t('common.loading')}</span>
                      : t('settings.recalcNow')
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Integrations section */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Integrations
            </h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            <Link
              to="/settings/odoo-sync"
              className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                <Activity className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Odoo Sync Log</p>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  Track sale order sync status across all confirmed billing cycles
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 flex-shrink-0 transition-colors" />
            </Link>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={recalcOpen}
        onClose={() => setRecalcOpen(false)}
        onConfirm={handleRecalcConfirm}
        title={t('settings.recalcConfirmTitle')}
        description={t('settings.recalcConfirmDesc')}
        loading={recalcMutation.isPending}
      />
    </div>
  )
}
