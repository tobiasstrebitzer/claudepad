import { Play, Square } from 'lucide-react';
import { Button } from '../components/ui/button';
import { usePlayback } from './PlaybackProvider';

// The viewer's "Play" affordance (PRD-08 §4.1) - toggles the playback surface +
// transport bar on/off. Lives in the unified top bar's session actions.
export function PlayToggleButton() {
  const pb = usePlayback();
  if (!pb.available) return null;
  return (
    <Button
      size="sm"
      variant={pb.active ? 'secondary' : 'ghost'}
      onClick={pb.toggleActive}
      aria-pressed={pb.active}
      aria-label={pb.active ? 'Stop playback' : 'Play session'}
    >
      {pb.active ? <Square /> : <Play />}
      {pb.active ? 'Stop' : 'Play'}
    </Button>
  );
}
