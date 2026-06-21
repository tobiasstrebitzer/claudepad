import * as React from 'react';
import { usePersistedState } from '../../lib/usePersistedState';
import { DEFAULT_VISIBILITY, type EventGroup, type EventVisibility } from './eventFilter';

interface EventFilterValue {
  visibility: EventVisibility;
  setGroup: (group: EventGroup, on: boolean) => void;
  reset: () => void;
}

const EventFilterContext = React.createContext<EventFilterValue>({
  visibility: DEFAULT_VISIBILITY,
  setGroup: () => {},
  reset: () => {},
});

/**
 * Persisted transcript event-group visibility, shared by the viewer and the
 * playback engine so both filter identically. System events are off by default.
 */
export function EventFilterProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = usePersistedState<Partial<EventVisibility>>(
    'claudepad.eventFilter',
    DEFAULT_VISIBILITY,
    (v) => v != null && typeof v === 'object',
  );
  // Merge over defaults so a future-added group can't read back as undefined.
  const visibility = React.useMemo<EventVisibility>(
    () => ({ ...DEFAULT_VISIBILITY, ...stored }),
    [stored],
  );
  const setGroup = React.useCallback(
    (group: EventGroup, on: boolean) =>
      setStored((prev) => ({ ...DEFAULT_VISIBILITY, ...prev, [group]: on })),
    [setStored],
  );
  const reset = React.useCallback(() => setStored(DEFAULT_VISIBILITY), [setStored]);
  const value = React.useMemo(
    () => ({ visibility, setGroup, reset }),
    [visibility, setGroup, reset],
  );
  return <EventFilterContext.Provider value={value}>{children}</EventFilterContext.Provider>;
}

export function useEventFilter(): EventFilterValue {
  return React.useContext(EventFilterContext);
}
