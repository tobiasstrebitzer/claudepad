import { Settings } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/cn'
import { setAppSetting, useAppSettings } from '../../settings/appSettings'
import { Button } from '../ui/Button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover'
import { Switch } from '../ui/Switch'

// A small "Settings" surface (sibling to Appearance) for sharing-flow preferences.
export function SettingsMenu() {
  const settings = useAppSettings()
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Settings" title="Settings">
            <Settings />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 gap-3 p-3">
        <span className="text-label uppercase tracking-[0.02em] text-muted-foreground">Sharing</span>
        <ToggleRow
          label="Review secrets before stripping"
          desc="Show the secret-review step when sharing body-only."
          checked={settings.requireSecretReview}
          onChange={(v) => setAppSetting('requireSecretReview', v)}
        />
        <SegmentRow
          label="Fingerprint display"
          desc="How recipient keys are shown."
          value={settings.fingerprintDisplay}
          options={[
            { value: 'emoji', label: 'Emoji' },
            { value: 'hex', label: 'Hex' }
          ]}
          onChange={(v) => setAppSetting('fingerprintDisplay', v)}
        />
      </PopoverContent>
    </Popover>
  )
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange
}: {
  label: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  const id = React.useId()
  return (
    <div className="flex items-start gap-3">
      <span className="min-w-0 flex-1">
        <label htmlFor={id} className="block cursor-pointer text-body-sm font-medium text-text">
          {label}
        </label>
        <span className="block text-label text-muted-foreground">{desc}</span>
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  )
}

function SegmentRow<T extends string>({
  label,
  desc,
  value,
  options,
  onChange
}: {
  label: string
  desc: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-body-sm font-medium text-text">{label}</span>
        <span className="block text-label text-muted-foreground">{desc}</span>
      </span>
      <span className="inline-flex shrink-0 overflow-hidden rounded-md border border-border">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'px-2.5 py-1 text-body-sm transition-colors',
              value === o.value
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent-tint'
            )}
          >
            {o.label}
          </button>
        ))}
      </span>
    </div>
  )
}
