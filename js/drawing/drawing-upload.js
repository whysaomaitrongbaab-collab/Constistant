/**
 * Handles file selection, PDF/image conversion, and page thumbnail generation
 * used by the Drawing Intelligence workflow.
 */
const qt_elementsData = globalThis.qt_elementsData || [];

export function qt_fileToBase64(f) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

export function qt_setFile(f) {
  globalThis.qt_selectedFile = f;
  globalThis.qt_pdfPageDataUrls = [];
  globalThis.qt_selectedLayoutPage = null;
  globalThis.qt_selectedLayoutPages = new Set();
  globalThis.qt_modalResolve = null;
  const dz = document.getElementById('drop-zone');
  dz.classList.add('has-file');
  document.getElementById('dz-icon').textContent = '📄';
  document.getElementById('dz-main').innerHTML = `<div class="dz-file">${f.name}</div><div class="dz-size">${(f.size / 1024).toFixed(1)} KB · คลิกเพื่อเปลี่ยน</div>`;
}

export async function qt_extractPdfPages(file, scale = 1.2) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('pdfjsLib not loaded — check script load order');
  }
  if (file.type !== 'application/pdf') {
    const b64 = await qt_fileToBase64(file);
    return [`data:${file.type};base64,${b64}`];
  }
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    pages.push(canvas.toDataURL('image/jpeg', scale < 0.5 ? 0.5 : 0.85));
  }
  return pages;
}

export function qt_onDragOver(e) { e.preventDefault(); document.getElementById('drop-zone').classList.add('drag'); }
export function qt_onDragLeave() { document.getElementById('drop-zone').classList.remove('drag'); }
export function qt_onDrop(e) { e.preventDefault(); document.getElementById('drop-zone').classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) qt_setFile(f); }
export function qt_onFileChange(e) { if (e.target.files[0]) qt_setFile(e.target.files[0]); }

export function qt_showPageModal(candidateIndices, allPages) {
  return new Promise(resolve => {
    globalThis.qt_modalResolve = resolve;
    globalThis.qt_selectedLayoutPages = new Set(candidateIndices);
    const grid = document.getElementById('page-thumb-grid');
    grid.innerHTML = '';
    const toShow = [...new Set(candidateIndices)].sort((a, b) => a - b);
    function updateCount() {
      document.getElementById('modal-selected-count').textContent =
        `เลือกแล้ว ${globalThis.qt_selectedLayoutPages.size} หน้า${globalThis.qt_selectedLayoutPages.size === 0 ? ' — กรุณาเลือกอย่างน้อย 1 หน้า' : ''}`;
    }
    toShow.forEach(i => {
      const div = document.createElement('div');
      div.className = 'page-thumb' + (globalThis.qt_selectedLayoutPages.has(i) ? ' selected' : '');
      div.dataset.page = i;
      div.innerHTML = `
        <div style="position:absolute;top:6px;left:6px;z-index:2">
          <input type="checkbox" ${globalThis.qt_selectedLayoutPages.has(i) ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent)">
        </div>
        <img src="${allPages[i]}" style="padding-top:4px">
        <div class="page-thumb-label">หน้า ${i + 1}</div>`;
      div.style.position = 'relative';
      div.onclick = () => {
        if (globalThis.qt_selectedLayoutPages.has(i)) {
          globalThis.qt_selectedLayoutPages.delete(i);
          div.classList.remove('selected');
          div.querySelector('input').checked = false;
        } else {
          globalThis.qt_selectedLayoutPages.add(i);
          div.classList.add('selected');
          div.querySelector('input').checked = true;
        }
        updateCount();
      };
      grid.appendChild(div);
    });
    updateCount();
    document.getElementById('page-modal').style.display = 'flex';
  });
}

export function qt_closePageModal(confirmed) {
  document.getElementById('page-modal').style.display = 'none';
  if (globalThis.qt_modalResolve) {
    globalThis.qt_modalResolve(confirmed && globalThis.qt_selectedLayoutPages.size > 0 ? [...globalThis.qt_selectedLayoutPages].sort((a, b) => a - b) : null);
    globalThis.qt_modalResolve = null;
  }
}
