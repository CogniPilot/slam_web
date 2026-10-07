interface PaneOptions {
  name: string;
  panel: HTMLElement;
  header: HTMLElement;
  fullScreenControls?: HTMLElement;
}

export function mountWorkspacePanes(options: readonly PaneOptions[], onChange: () => void = () => {}) {
  let expanded: PaneOptions | undefined;
  let restoreFocus: HTMLElement | undefined;
  let inertElements: HTMLElement[] = [];
  let controlsMarker: Comment | undefined;
  const actions = new Map<HTMLElement, {collapse: HTMLButtonElement; expand: HTMLButtonElement}>();

  function exit() {
    if (!expanded) return;
    expanded.panel.classList.remove('pane-fullscreen');
    actions.get(expanded.panel)!.expand.setAttribute('aria-pressed', 'false');
    actions.get(expanded.panel)!.expand.textContent = 'Full screen';
    actions.get(expanded.panel)!.expand.setAttribute('aria-label', `Full screen ${expanded.name}`);
    if (controlsMarker && expanded.fullScreenControls) {
      controlsMarker.replaceWith(expanded.fullScreenControls);
      controlsMarker = undefined;
    }
    inertElements.forEach(element => {element.inert = false;});
    inertElements = [];
    document.body.classList.remove('workspace-fullscreen');
    expanded = undefined;
    restoreFocus?.focus({preventScroll: true});
    onChange();
  }

  function enter(pane: PaneOptions, button: HTMLButtonElement) {
    exit();
    pane.panel.classList.remove('pane-collapsed');
    actions.get(pane.panel)!.collapse.setAttribute('aria-expanded', 'true');
    actions.get(pane.panel)!.collapse.setAttribute('aria-label', `Collapse ${pane.name}`);
    actions.get(pane.panel)!.collapse.textContent = 'Collapse';
    expanded = pane;
    restoreFocus = button;
    pane.panel.classList.add('pane-fullscreen');
    button.setAttribute('aria-pressed', 'true');
    button.textContent = 'Exit full screen';
    button.setAttribute('aria-label', `Exit full screen ${pane.name}`);
    document.body.classList.add('workspace-fullscreen');
    if (pane.fullScreenControls) {
      controlsMarker = document.createComment('Simulation controls');
      pane.fullScreenControls.before(controlsMarker);
      pane.panel.append(pane.fullScreenControls);
    }
    // Keep focus inside the expanded pane without recreating its editor or canvas.
    for (let branch = pane.panel; branch.parentElement; branch = branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement && !sibling.inert) {
          sibling.inert = true;
          inertElements.push(sibling);
        }
      }
    }
    button.focus({preventScroll: true});
    onChange();
  }

  for (const pane of options) {
    const group = document.createElement('div');
    group.className = 'pane-actions';
    const collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.textContent = 'Collapse';
    collapse.setAttribute('aria-label', `Collapse ${pane.name}`);
    collapse.setAttribute('aria-expanded', 'true');
    const expand = document.createElement('button');
    expand.type = 'button';
    expand.textContent = 'Full screen';
    expand.setAttribute('aria-label', `Full screen ${pane.name}`);
    expand.setAttribute('aria-pressed', 'false');
    actions.set(pane.panel, {collapse, expand});
    group.append(collapse, expand);
    pane.header.append(group);
    expand.onclick = () => expanded === pane ? exit() : enter(pane, expand);
    collapse.onclick = () => {
      if (expanded === pane) exit();
      const collapsed = pane.panel.classList.toggle('pane-collapsed');
      collapse.textContent = collapsed ? 'Expand' : 'Collapse';
      collapse.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${pane.name}`);
      collapse.setAttribute('aria-expanded', String(!collapsed));
      collapse.focus({preventScroll: true});
      onChange();
    };
  }
  document.addEventListener('keydown', event => {
    if (!expanded) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      exit();
    } else if (event.key === 'Tab') {
      const focusable = Array.from(expanded.panel.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]'
      )).filter(element => element.tabIndex >= 0 && element.getClientRects().length && !element.closest('[hidden]'));
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();first?.focus();
      }
    }
  });
}
