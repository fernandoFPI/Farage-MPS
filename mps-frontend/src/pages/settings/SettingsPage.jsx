import { useTranslation } from 'react-i18next'
import { useSettingsRaw, useUpdateSetting } from '../../api/hooks/useSettings'
import { useToast } from '../../components/Toast'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
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

  const { data: settings, isLoading } = useSettingsRaw()
  const { mutate: updateSetting, isPending } = useUpdateSetting()
  const { showToast } = useToast()

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
      </div>
    </div>
  )
}
