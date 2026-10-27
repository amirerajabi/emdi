import { useRef, useState } from 'react';
import { DOCK_MAX, DOCK_MIN, useUi } from '../store/ui';
import { Splitter } from './common/Splitter';
import { Explorer } from './Explorer';
import { Outline } from './Outline';
import { SearchPanel } from './SearchPanel';

/** The side panel: the left tool window open on the stripe (Explorer, Outline, Find in Files), resizable. */
export function Dock() {
  const visible = useUi((s) => s.dockVisible);
  const width = useUi((s) => s.dockWidth);
  const dock = useUi((s) => s.dock);
  const ref = useRef<HTMLElement>(null);
  const [start, setStart] = useState(width);
  if (!visible) return null;
  return (
    <>
      <aside ref={ref} className="dock" style={{ width: Math.max(DOCK_MIN, Math.min(DOCK_MAX, width)) }} aria-label="Side panel">
        <div className="dock-body">
          {dock === 'explorer' && <Explorer />}
          {dock === 'outline' && <Outline />}
          {dock === 'search' && <SearchPanel />}
        </div>
      </aside>
      <Splitter
        direction="vertical"
        onDragStart={() => setStart(ref.current?.offsetWidth ?? width)}
        onDrag={(d) => useUi.getState().setLayout({ dockWidth: Math.max(DOCK_MIN, Math.min(DOCK_MAX, start + d)) })}
        onDoubleClick={() => useUi.getState().setLayout({ dockWidth: 280 })}
      />
    </>
  );
}
