import * as React from 'react'
import { ChevronRight } from 'lucide-react'

export interface Crumb { label: string; onClick?: () => void }

/**
 * Declarative contents of the single top bar (one-surface principle, D-49):
 * breadcrumbs + labels + actions on line 1, a context/meta line + view switch on
 * line 2. App-chrome (mobile menu, theme toggle) is injected via leading/trailing.
 */
export interface TopBarContent {
  crumbs: Crumb[]
  /** Render the final crumb as the page <h1> (the session title). */
  titleIsHeading?: boolean
  labels?: React.ReactNode
  actions?: React.ReactNode
  meta?: React.ReactNode
  viewSwitch?: React.ReactNode
}

export function TopBar({
  content,
  leading,
  trailing
}: {
  content?: TopBarContent
  leading?: React.ReactNode
  trailing?: React.ReactNode
}) {
  const hasSecondLine = Boolean(content?.meta || content?.viewSwitch)
  return (
    <header className="border-b border-border bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
      <div className="flex h-14 items-center gap-2 px-4">
        {leading}
        {content && (
          <Breadcrumbs crumbs={content.crumbs} titleIsHeading={content.titleIsHeading} />
        )}
        <div className="min-w-0 flex-1" />
        {content?.labels && (
          <div className="hidden items-center gap-1.5 sm:flex">{content.labels}</div>
        )}
        {content?.actions && (
          <div className="flex items-center gap-1.5">{content.actions}</div>
        )}
        {trailing}
      </div>

      {hasSecondLine && (
        <div className="-mt-1 flex items-center gap-3 px-4 pb-2">
          <div className="min-w-0 flex-1">{content?.meta}</div>
          {content?.viewSwitch}
        </div>
      )}
    </header>
  )
}

function Breadcrumbs({
  crumbs,
  titleIsHeading
}: {
  crumbs: Crumb[]
  titleIsHeading?: boolean
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1.5 text-body-sm"
    >
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1
        return (
          <React.Fragment key={`${crumb.label}-${i}`}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
            {last ? (
              titleIsHeading ? (
                <h1
                  className="truncate font-serif text-heading-3 text-text"
                  title={crumb.label}
                >
                  {crumb.label}
                </h1>
              ) : (
                <span className="truncate font-medium text-text" aria-current="page">
                  {crumb.label}
                </span>
              )
            ) : crumb.onClick ? (
              <button
                type="button"
                onClick={crumb.onClick}
                className="shrink-0 text-muted-foreground transition-colors hover:text-text"
              >
                {crumb.label}
              </button>
            ) : (
              <span className="shrink-0 text-muted-foreground">{crumb.label}</span>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
