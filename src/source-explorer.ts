export interface SourceFile {
  id: string;
  path: string;
}

export function createSourceExplorer(onSelect: (id: string) => void) {
  const element = document.createElement('nav');
  element.className = 'source-explorer';
  element.id = 'source-explorer';
  element.setAttribute('aria-label', 'Project files');
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Find a file…';
  search.setAttribute('aria-label', 'Find a file');
  const listing = document.createElement('div');
  listing.className = 'source-file-list';
  const empty = document.createElement('p');
  empty.textContent = 'No matching files';
  empty.hidden = true;
  element.append(search, listing, empty);

  let files: readonly SourceFile[] = [];
  let selected = '';
  const openFolders = new Set(['Examples', 'Experiment', 'SLAM sources', 'SLAM sources/SLAM']);

  function render() {
    const filter = search.value.trim().toLowerCase();
    const folders = new Map<string, HTMLElement>();
    listing.replaceChildren();
    function folder(path: string): HTMLElement {
      if (!path) return listing;
      const existing = folders.get(path);
      if (existing) return existing;
      const parts = path.split('/');
      const name = parts.pop()!;
      const parent = folder(parts.join('/'));
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = name;
      details.open = !!filter || openFolders.has(path)
        || files.some(file => file.id === selected && file.path.startsWith(path + '/'));
      details.addEventListener('toggle', () => {
        if (filter) return;
        if (details.open) openFolders.add(path);
        else openFolders.delete(path);
      });
      details.append(summary);
      parent.append(details);
      folders.set(path, details);
      return details;
    }
    for (const file of files) {
      if (filter && !file.path.toLowerCase().includes(filter)) continue;
      const parts = file.path.split('/');
      const name = parts.pop()!;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'source-file';
      button.textContent = name;
      button.title = file.path;
      button.dataset.sourceId = file.id;
      button.setAttribute('aria-label', 'Open ' + file.path);
      if (file.id === selected) button.setAttribute('aria-current', 'page');
      button.onclick = () => onSelect(file.id);
      folder(parts.join('/')).append(button);
    }
    empty.hidden = listing.childElementCount !== 0;
  }
  search.addEventListener('input', render);
  return {
    element,
    update(next: readonly SourceFile[], active: string) {
      files = next;
      selected = active;
      render();
    },
  };
}
