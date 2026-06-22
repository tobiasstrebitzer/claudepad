import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible'
import { type FunctionComponent } from 'react'

export const Collapsible: FunctionComponent<CollapsiblePrimitive.Root.Props> = ({ ...props }) => {
  return <CollapsiblePrimitive.Root data-slot='collapsible' {...props} />
}

export const CollapsibleTrigger: FunctionComponent<CollapsiblePrimitive.Trigger.Props> = ({ ...props }) => {
  return <CollapsiblePrimitive.Trigger data-slot='collapsible-trigger' {...props} />
}

export const CollapsibleContent: FunctionComponent<CollapsiblePrimitive.Panel.Props> = ({ ...props }) => {
  return <CollapsiblePrimitive.Panel data-slot='collapsible-content' {...props} />
}
