export function renderCaption(caption: HTMLElement, frame: HTMLElement, sentence: string, notes: string[]): void {
  const text = caption.querySelector<HTMLElement>('.caption-text')!;
  const noteList = caption.querySelector<HTMLElement>('.caption-note')!;

  text.textContent = sentence;
  noteList.replaceChildren(...notes.map((note) => {
    const line = document.createElement('span');
    line.className = 'caption-note-line';
    line.textContent = note;
    return line;
  }));
  noteList.hidden = notes.length === 0;

  caption.hidden = false;
  frame.classList.add('has-caption');
}
