import { Settings } from 'lucide-react'
import * as React from 'react'
import { setAppSetting, useAppSettings } from '../../settings/appSettings'
import { Button } from '../ui/Button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover'
import { Switch } from '../ui/Switch'

// A small "Settings" surface (sibling to Appearance) for sharing-flow friction
// toggles. Both default on; turning them off trims the share wizard toward the
// three-click quick-share path.
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
          label="Confirm recipient fingerprint"
          desc="Require an out-of-band fingerprint match before adding a recipient."
          checked={settings.requireFingerprintConfirm}
          onChange={(v) => setAppSetting('requireFingerprintConfirm', v)}
        />
        <ToggleRow
          label="Review secrets before stripping"
          desc="Show the secret-review step when sharing body-only."
          checked={settings.requireSecretReview}
          onChange={(v) => setAppSetting('requireSecretReview', v)}
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
