/**
 * CryptoVault — UI Controller
 * ui.js — All DOM interactions, canvas management, event handling
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  // ─── State ───────────────────────────────────────────────────────────────

  const state = {
    enc: {
      imageData: null,       // original ImageData
      encryptedData: null,   // encrypted ImageData
      file: null,
      algo: 'xor',
      currentView: 'original',
    },
    dec: {
      imageData: null,
      decryptedData: null,
      file: null,
      currentView: 'encInput',
    },
    history: [],
    encryptedCount: parseInt(localStorage.getItem('cv_count') || '0'),
  };

  // ─── DOM refs ────────────────────────────────────────────────────────────

  const $ = id => document.getElementById(id);

  // Update encrypted count
  $('encryptedCount').textContent = state.encryptedCount;

  // ─── Tab navigation ──────────────────────────────────────────────────────

  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const tab = link.dataset.tab;
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      $('panel-' + tab).classList.add('active');
    });
  });

  // ─── Hero pixel grid animation ───────────────────────────────────────────

  const grid = $('heroPixelGrid');
  const COLS = 20, ROWS = 15, TOTAL = COLS * ROWS;
  const cells = [];
  const palette = [
    '#00f5a0','#00d4ff','#ff6b35','#8b5cf6',
    '#0f1117','#161920','#1e2330','#0a3d2e',
  ];

  for (let i = 0; i < TOTAL; i++) {
    const c = document.createElement('div');
    c.className = 'pixel-cell';
    c.style.background = palette[Math.floor(Math.random() * palette.length)];
    c.style.opacity = (Math.random() * 0.6 + 0.1).toFixed(2);
    grid.appendChild(c);
    cells.push(c);
  }

  function animateGrid() {
    const n = Math.floor(Math.random() * 20) + 5;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * TOTAL);
      cells[idx].style.background = palette[Math.floor(Math.random() * palette.length)];
      cells[idx].style.opacity = (Math.random() * 0.6 + 0.1).toFixed(2);
    }
  }
  setInterval(animateGrid, 120);

  // ─── Algorithm selection (encrypt) ───────────────────────────────────────

  document.querySelectorAll('.algo-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.algo-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      state.enc.algo = item.dataset.algo;
      item.querySelector('input[type=radio]').checked = true;
    });
  });

  // ─── Key field ───────────────────────────────────────────────────────────

  const encKeyInput = $('encKey');

  function updateKeyUI() {
    const key = encKeyInput.value;
    const strength = CryptoEngine.keyStrength(key);
    const labels = ['', 'Weak', 'Weak', 'Moderate', 'Strong', 'Very strong'];
    const classes = ['', 'weak', 'weak', 'med', 'strong', 'strong'];

    for (let i = 1; i <= 5; i++) {
      const bar = $('ks' + i);
      bar.className = 'ks-bar ' + (i <= strength ? classes[strength] : '');
    }
    $('ksLabel').textContent = key.length === 0 ? 'No key' : labels[strength];

    const hash = CryptoEngine.keyHash(key);
    $('keyHash').textContent = '0x' + hash.toString(16).toUpperCase().padStart(8, '0');
  }

  encKeyInput.addEventListener('input', updateKeyUI);
  updateKeyUI();

  // Toggle visibility
  let keyVisible = false;
  $('toggleKeyVis').addEventListener('click', () => {
    keyVisible = !keyVisible;
    encKeyInput.type = keyVisible ? 'text' : 'password';
    $('eyeIcon').style.opacity = keyVisible ? '0.5' : '1';
  });
  // Start as password type for security
  encKeyInput.type = 'password';

  // Random key generator
  $('randomKeyBtn').addEventListener('click', () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*-_';
    let k = '';
    for (let i = 0; i < 18; i++) k += chars[Math.floor(Math.random() * chars.length)];
    encKeyInput.value = k;
    if (!keyVisible) encKeyInput.type = 'password';
    updateKeyUI();
  });

  // Copy key
  $('copyKeyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(encKeyInput.value).then(() => {
      showToast('encToast', 'Key copied to clipboard', 'success');
    });
  });

  // ─── File upload (encrypt) ───────────────────────────────────────────────

  function setupDropZone(zoneId, inputId, fileInfoId, fiNameId, fiSizeId, fiClearId, onLoad) {
    const zone = $(zoneId);
    const input = $(inputId);

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) onLoad(file);
    });

    input.addEventListener('change', e => {
      if (e.target.files[0]) onLoad(e.target.files[0]);
    });

    if (fiClearId) {
      $(fiClearId).addEventListener('click', () => {
        input.value = '';
        $(fileInfoId).classList.add('hidden');
        onLoad(null);
      });
    }
  }

  function loadImageFile(file, targetState, canvasId, emptyId, metaCallback) {
    if (!file) {
      targetState.imageData = null;
      targetState.file = null;
      const c = $(canvasId);
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
      $(emptyId).style.display = '';
      if (metaCallback) metaCallback(null);
      return;
    }

    targetState.file = file;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = $(canvasId);
        canvas.width  = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        targetState.imageData = ctx.getImageData(0, 0, img.width, img.height);
        $(emptyId).style.display = 'none';
        if (metaCallback) metaCallback(img, file);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Encrypt drop zone
  setupDropZone('dropZone', 'fileInput', 'fileInfo', 'fiName', 'fiSize', 'fiClear', file => {
    loadImageFile(file, state.enc, 'previewCanvas', 'canvasEmpty', (img, f) => {
      if (!img) return;
      $('fileInfo').classList.remove('hidden');
      $('fiName').textContent = f.name;
      $('fiSize').textContent = formatBytes(f.size);
      $('imgMeta').classList.remove('hidden');
      $('metaDim').textContent = img.width + ' × ' + img.height + 'px';
      $('metaSize').textContent = (img.width * img.height).toLocaleString() + ' px';
      $('metaAlgo').textContent = state.enc.algo;
      state.enc.currentView = 'original';
      setPreviewTab('original');
      computeEntropy(state.enc.imageData);
    });
  });

  // Decrypt drop zone
  setupDropZone('dropZoneDec', 'fileInputDec', 'fileInfoDec', 'fiNameDec', 'fiSizeDec', 'fiClearDec', file => {
    loadImageFile(file, state.dec, 'previewCanvasDec', 'canvasEmptyDec', (img, f) => {
      if (!img) return;
      $('fileInfoDec').classList.remove('hidden');
      $('fiNameDec').textContent = f.name;
      $('fiSizeDec').textContent = formatBytes(f.size);
      state.dec.currentView = 'encInput';
    });
  });

  // ─── Preview tabs ─────────────────────────────────────────────────────────

  function setPreviewTab(view) {
    state.enc.currentView = view;
  }

  document.querySelectorAll('#panel-encrypt .ptab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#panel-encrypt .ptab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.ptab;
      state.enc.currentView = view;
      renderEncPreview(view);
    });
  });

  document.querySelectorAll('#panel-decrypt .ptab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#panel-decrypt .ptab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.dec.currentView = btn.dataset.ptab;
      renderDecPreview(btn.dataset.ptab);
    });
  });

  function renderEncPreview(view) {
    if (!state.enc.imageData) return;
    const canvas = $('previewCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width  = state.enc.imageData.width;
    canvas.height = state.enc.imageData.height;

    if (view === 'original') {
      ctx.putImageData(state.enc.imageData, 0, 0);
    } else if (view === 'encrypted' && state.enc.encryptedData) {
      ctx.putImageData(state.enc.encryptedData, 0, 0);
    } else if (view === 'diff' && state.enc.encryptedData) {
      const orig = state.enc.imageData.data;
      const enc  = state.enc.encryptedData.data;
      const diff = new Uint8ClampedArray(orig.length);
      for (let i = 0; i < orig.length; i += 4) {
        diff[i]     = Math.abs(orig[i]     - enc[i])     * 4;
        diff[i + 1] = Math.abs(orig[i + 1] - enc[i + 1]) * 4;
        diff[i + 2] = Math.abs(orig[i + 2] - enc[i + 2]) * 4;
        diff[i + 3] = 255;
      }
      ctx.putImageData(new ImageData(diff, canvas.width, canvas.height), 0, 0);
    }
  }

  function renderDecPreview(view) {
    const canvas = $('previewCanvasDec');
    const ctx = canvas.getContext('2d');
    if (view === 'encInput' && state.dec.imageData) {
      canvas.width  = state.dec.imageData.width;
      canvas.height = state.dec.imageData.height;
      ctx.putImageData(state.dec.imageData, 0, 0);
    } else if (view === 'decOutput' && state.dec.decryptedData) {
      canvas.width  = state.dec.decryptedData.width;
      canvas.height = state.dec.decryptedData.height;
      ctx.putImageData(state.dec.decryptedData, 0, 0);
    }
  }

  // ─── Encrypt ─────────────────────────────────────────────────────────────

  $('encryptBtn').addEventListener('click', () => {
    if (!state.enc.imageData) {
      showToast('encToast', 'Please load an image first.', 'error');
      return;
    }
    const key = encKeyInput.value.trim();
    if (!key) {
      showToast('encToast', 'Please enter an encryption key.', 'error');
      return;
    }

    const algo   = state.enc.algo;
    const { width, height, data } = state.enc.imageData;

    setProgress(true, 0, 'Encrypting pixels...');

    setTimeout(() => {
      try {
        setProgress(true, 40, 'Applying ' + algo + ' algorithm...');
        const outData = CryptoEngine.run(data, width, height, key, algo, false);
        setProgress(true, 80, 'Rendering output...');
        const outImageData = new ImageData(outData, width, height);
        state.enc.encryptedData = outImageData;

        setProgress(true, 100, 'Done!');

        // Render encrypted view
        const canvas = $('previewCanvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').putImageData(outImageData, 0, 0);
        state.enc.currentView = 'encrypted';
        document.querySelectorAll('#panel-encrypt .ptab').forEach(b => {
          b.classList.toggle('active', b.dataset.ptab === 'encrypted');
        });

        $('metaAlgo').textContent = algo.toUpperCase();
        $('downloadEncBtn').classList.remove('hidden');
        showToast('encToast', `Encrypted with ${algo.toUpperCase()} — keep your key safe!`, 'success');

        // Compute entropy on encrypted output
        computeEntropy(outImageData);

        // Update counter
        state.encryptedCount++;
        localStorage.setItem('cv_count', state.encryptedCount);
        animateCounter($('encryptedCount'), state.encryptedCount);

        // Add to history
        addHistory('ENCRYPT', algo, key, width + '×' + height);

        setTimeout(() => setProgress(false), 1000);
      } catch (err) {
        setProgress(false);
        showToast('encToast', 'Error: ' + err.message, 'error');
      }
    }, 50);
  });

  // ─── Download encrypted ───────────────────────────────────────────────────

  $('downloadEncBtn').addEventListener('click', () => {
    if (!state.enc.encryptedData) return;
    canvasToDownload($('previewCanvas'), 'cryptovault_encrypted_' + Date.now() + '.png');
  });

  // ─── Decrypt ─────────────────────────────────────────────────────────────

  $('decryptBtn').addEventListener('click', () => {
    if (!state.dec.imageData) {
      showToast('decToast', 'Please load an encrypted image first.', 'error');
      return;
    }
    const key  = $('decKey').value.trim();
    const algo = $('decAlgo').value;
    if (!key) {
      showToast('decToast', 'Please enter the decryption key.', 'error');
      return;
    }

    const { width, height, data } = state.dec.imageData;

    $('processingOverlayDec').style.display = 'flex';

    setTimeout(() => {
      try {
        const outData = CryptoEngine.run(data, width, height, key, algo, true);
        const outImageData = new ImageData(outData, width, height);
        state.dec.decryptedData = outImageData;

        const canvas = $('previewCanvasDec');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').putImageData(outImageData, 0, 0);
        state.dec.currentView = 'decOutput';
        document.querySelectorAll('#panel-decrypt .ptab').forEach(b => {
          b.classList.toggle('active', b.dataset.ptab === 'decOutput');
        });

        $('processingOverlayDec').style.display = 'none';
        $('downloadDecBtn').classList.remove('hidden');
        showToast('decToast', 'Decrypted! If image looks wrong, check key and algorithm.', 'success');
        addHistory('DECRYPT', algo, key, width + '×' + height);
      } catch (err) {
        $('processingOverlayDec').style.display = 'none';
        showToast('decToast', 'Error: ' + err.message, 'error');
      }
    }, 50);
  });

  $('downloadDecBtn').addEventListener('click', () => {
    if (!state.dec.decryptedData) return;
    canvasToDownload($('previewCanvasDec'), 'cryptovault_decrypted_' + Date.now() + '.png');
  });

  // ─── Entropy analysis ────────────────────────────────────────────────────

  function computeEntropy(imageData) {
    if (!imageData) return;
    const { data, width, height } = imageData;

    const H    = CryptoEngine.shannonEntropy(data);
    const uniq = CryptoEngine.uniqueColors(data);
    const avg  = CryptoEngine.avgBrightness(data);
    const hist = CryptoEngine.histogram(data);

    $('eShan').textContent = H.toFixed(3) + ' b';
    $('eUniq').textContent = uniq.toLocaleString();
    $('eAvg').textContent  = Math.round(avg);

    drawHistogram(hist, width * height);
  }

  function drawHistogram(hist, total) {
    const canvas = $('histogramCanvas');
    const ctx    = canvas.getContext('2d');
    const W = canvas.offsetWidth || 300;
    const H = 80;
    canvas.width  = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    const channels = [
      { data: hist.r, color: 'rgba(255,100,100,0.6)' },
      { data: hist.g, color: 'rgba(0,245,160,0.5)' },
      { data: hist.b, color: 'rgba(0,212,255,0.5)' },
    ];

    const maxVal = Math.max(
      ...hist.r, ...hist.g, ...hist.b
    );

    channels.forEach(ch => {
      ctx.beginPath();
      ctx.strokeStyle = ch.color;
      ctx.lineWidth = 1;
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * W;
        const y = H - (ch.data[i] / maxVal) * H * 0.9;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = ch.color.replace('0.6', '0.15').replace('0.5', '0.1');
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();
    });
  }

  // ─── Progress bar ────────────────────────────────────────────────────────

  function setProgress(show, pct = 0, label = '') {
    const wrap  = $('progressWrap');
    const fill  = $('progressFill');
    const lbl   = $('progressLabel');
    const ovl   = $('processingOverlay');
    const ovlLbl = $('processingLabel');

    if (show) {
      wrap.classList.remove('hidden');
      fill.style.width = pct + '%';
      lbl.textContent  = pct + '%';
      if (pct < 100) {
        ovl.style.display = 'flex';
        ovlLbl.textContent = label;
      } else {
        ovl.style.display = 'none';
      }
    } else {
      wrap.classList.add('hidden');
      ovl.style.display = 'none';
      fill.style.width = '0%';
    }
  }

  // ─── History ─────────────────────────────────────────────────────────────

  $('histFab').addEventListener('click', () => {
    $('histDrawer').classList.toggle('open');
  });
  $('hdClose').addEventListener('click', () => {
    $('histDrawer').classList.remove('open');
  });

  function addHistory(op, algo, key, dim) {
    const masked = key.substring(0, 3) + '•'.repeat(Math.max(0, key.length - 3));
    state.history.unshift({ op, algo, key: masked, dim, time: new Date().toLocaleTimeString() });
    renderHistory();
    const badge = $('histBadge');
    badge.style.display = 'flex';
    badge.textContent = state.history.length;
  }

  function renderHistory() {
    const list = $('hdList');
    if (state.history.length === 0) {
      list.innerHTML = '<p class="hd-empty">No operations yet.</p>';
      return;
    }
    list.innerHTML = state.history.slice(0, 20).map(h => `
      <div class="hd-item">
        <div class="hd-item-top">
          <span class="hd-op ${h.op === 'ENCRYPT' ? 'hd-op-enc' : 'hd-op-dec'}">${h.op}</span>
          <span class="hd-algo">${h.algo.toUpperCase()}</span>
        </div>
        <span class="hd-meta">${h.time} · ${h.dim} · key: ${h.key}</span>
      </div>
    `).join('');
  }

  // ─── Toast ───────────────────────────────────────────────────────────────

  const toastTimers = {};
  function showToast(toastId, msg, type = 'info') {
    const el = $(toastId);
    if (!el) return;
    el.textContent = msg;
    el.className   = 'toast ' + type;
    el.classList.remove('hidden');
    clearTimeout(toastTimers[toastId]);
    toastTimers[toastId] = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  // ─── Download helper ─────────────────────────────────────────────────────

  function canvasToDownload(canvas, filename) {
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  // ─── Animated counter ────────────────────────────────────────────────────

  function animateCounter(el, target) {
    const start = parseInt(el.textContent) || 0;
    const dur   = 600;
    const t0    = performance.now();
    function step(t) {
      const progress = Math.min((t - t0) / dur, 1);
      el.textContent = Math.round(start + (target - start) * easeOut(progress));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  // ─── Utility: format bytes ───────────────────────────────────────────────

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // ─── Initial entropy (empty histogram) ──────────────────────────────────

  drawHistogram({ r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256) }, 1);

});
