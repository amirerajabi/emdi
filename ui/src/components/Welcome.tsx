import { ArrowRight, FileText, FolderOpen, X } from 'lucide-react';
import { openFile, openFolder, openRecent } from '../app/actions';
import { keyLabel } from '../app/commands';
import { basename, dirname } from '../lib/paths';
import { useWorkspace } from '../store/workspace';
import { EmdiMark, FileIcon } from './common/icons';

export function Welcome() {
  const recents = useWorkspace((s) => s.recents);
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-brand">
          <EmdiMark size={40} />
          <div>
            <div className="welcome-brand-name">Emdi</div>
            <div className="welcome-brand-tagline">A beautiful Markdown viewer</div>
          </div>
        </div>
        <div>
          <h1>Read Markdown the way it was meant to look.</h1>
          <p className="welcome-lead">GitHub-flavoured Markdown with tables, task lists, alerts, footnotes, math, Mermaid diagrams and highlighted code, in light and dark themes, with an outline, search and live reload.</p>
        </div>
        <section>
          <h2>Start</h2>
          <div className="action-cards">
            <button className="action-card" onClick={() => void openFile()}>
              <span className="action-card-icon">
                <FileText size={20} />
              </span>
              <span className="action-card-name">Open file</span>
              <span className="action-card-blurb">One or more .md files; they open as tabs.</span>
            </button>
            <button className="action-card" onClick={() => void openFolder()}>
              <span className="action-card-icon">
                <FolderOpen size={20} />
              </span>
              <span className="action-card-name">Open folder</span>
              <span className="action-card-blurb">A repository, docs folder or notes; browse its Markdown files.</span>
            </button>
          </div>
        </section>
        {recents.length > 0 && (
          <section>
            <h2>Recent</h2>
            <div className="recent-list">
              {recents.map((r) => (
                <div key={r.path} className="recent-item" role="button" tabIndex={0} onClick={() => void openRecent(r)} onKeyDown={(e) => e.key === 'Enter' && void openRecent(r)} title={r.path}>
                  <FileIcon path={r.path} isDir={r.isDir} size={18} />
                  <span className="recent-text">
                    <span className="recent-name">{basename(r.path)}</span>
                    <span className="recent-path">{dirname(r.path)}</span>
                  </span>
                  <button
                    className="icon-btn sm"
                    title="Remove from list"
                    onClick={(e) => {
                      e.stopPropagation();
                      useWorkspace.getState().removeRecent(r.path);
                    }}
                  >
                    <X size={14} />
                  </button>
                  <ArrowRight size={14} className="muted" />
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="welcome-keys">
          <span>
            Search everywhere <span className="kbd-group"><kbd>Shift</kbd><kbd>Shift</kbd></span>
          </span>
          <span>
            Find action <span className="kbd-group"><kbd>{keyLabel('Ctrl+Shift+A')}</kbd></span>
          </span>
          <span>
            Open file <span className="kbd-group"><kbd>{keyLabel('Ctrl+O')}</kbd></span>
          </span>
          <span>
            Settings <span className="kbd-group"><kbd>{keyLabel('Ctrl+,')}</kbd></span>
          </span>
        </div>
        <p className="welcome-lead muted" style={{ fontSize: 'var(--text-sm)' }}>
          Tip: drop .md files or a folder onto this window to open them.
        </p>
      </div>
    </div>
  );
}
