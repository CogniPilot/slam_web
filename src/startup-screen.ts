export function createStartupScreen(document: Document) {
  const app = document.getElementById('app')!;
  const screen = document.getElementById('startup-screen')!;
  const message = document.getElementById('startup-message')!;
  const progress = document.getElementById('startup-progress') as HTMLProgressElement;
  const open = document.getElementById('startup-open') as HTMLButtonElement;
  let state: 'loading' | 'failed' | 'ready' = 'loading';

  function reveal() {
    state = 'ready';
    app.inert = false;
    app.setAttribute('aria-busy', 'false');
    document.body.classList.remove('app-loading');
    screen.hidden = true;
  }
  open.onclick = () => {
    reveal();
    app.tabIndex = -1;
    app.focus({preventScroll: true});
  };
  return {
    stage(completed: number, text: string) {
      if (state !== 'loading') return;
      progress.value = Math.max(progress.value, Math.min(progress.max, completed));
      message.textContent = text;
    },
    complete() {
      if (state !== 'loading') return;
      progress.value = progress.max;
      reveal();
    },
    fail(error: unknown, canOpenWorkspace = true) {
      if (state !== 'loading') return;
      state = 'failed';
      message.textContent = `Unable to prepare SLAM Lab. ${error instanceof Error ? error.message : String(error)}`;
      progress.hidden = true;
      open.hidden = !canOpenWorkspace;
    },
  };
}

let screen: ReturnType<typeof createStartupScreen> | undefined;
export function startupScreen() {
  return screen ??= createStartupScreen(document);
}
