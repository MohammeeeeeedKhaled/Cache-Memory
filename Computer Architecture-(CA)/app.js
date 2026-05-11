/* ============================================
   Cache Memory Simulator — UI Controller
   ============================================ */
let simulator = null;
let results = null;
let currentStep = 0;
let autoPlayInterval = null;
let isPlaying = false;
let playSpeed = 800;

/* --- Init --- */
document.addEventListener('DOMContentLoaded', () => {
    onCacheTypeChange();
    updateCacheInfo();
    ['cache-size','block-size','num-ways'].forEach(id =>
        document.getElementById(id).addEventListener('input', updateCacheInfo));
    document.getElementById('cache-type').addEventListener('change', updateCacheInfo);
});

/* --- Cache Type Change --- */
function onCacheTypeChange() {
    const t = document.getElementById('cache-type').value;
    const w = document.getElementById('ways-group');
    const p = document.getElementById('policy-group');
    if (t === 'direct') { w.classList.add('hidden'); p.classList.add('hidden'); }
    else if (t === 'fully') { w.classList.add('hidden'); p.classList.remove('hidden'); }
    else { w.classList.remove('hidden'); p.classList.remove('hidden'); }
    updateCacheInfo();
}

/* --- Update Cache Info --- */
function updateCacheInfo() {
    const cs = parseInt(document.getElementById('cache-size').value) || 0;
    const bs = parseInt(document.getElementById('block-size').value) || 0;
    const ct = document.getElementById('cache-type').value;
    const ways = parseInt(document.getElementById('num-ways').value) || 1;
    if (cs <= 0 || bs <= 0) return;
    const tl = Math.floor(cs / bs);
    let ns, nw;
    if (ct === 'direct') { nw = 1; ns = tl; }
    else if (ct === 'fully') { nw = tl; ns = 1; }
    else { nw = ways; ns = tl > 0 && ways > 0 ? Math.floor(tl / ways) : 0; }
    const ob = bs > 0 ? Math.log2(bs) : 0;
    const ib = ns > 1 ? Math.log2(ns) : 0;
    const tb = 32 - ob - ib;
    document.getElementById('info-lines').textContent = tl;
    document.getElementById('info-sets').textContent = ns;
    document.getElementById('info-offset').textContent = isFinite(ob) ? ob : '—';
    document.getElementById('info-index').textContent = isFinite(ib) ? ib : '—';
    document.getElementById('info-tag').textContent = isFinite(tb) ? tb : '—';
}

/* --- Presets --- */
function applyPreset(size) {
    const presets = {
        small:  { cache: 64, block: 8, ways: 2 },
        medium: { cache: 256, block: 16, ways: 2 },
        large:  { cache: 1024, block: 32, ways: 4 }
    };
    const p = presets[size];
    document.getElementById('cache-size').value = p.cache;
    document.getElementById('block-size').value = p.block;
    document.getElementById('num-ways').value = p.ways;
    updateCacheInfo();
}

/* --- Address Input --- */
function loadSampleAddresses() {
    const samples = [
        '0, 4, 8, 16, 32, 0, 4, 64, 128, 0, 16, 32, 4, 8, 64',
        '2, 3, 11, 16, 21, 13, 64, 48, 19, 11, 3, 22, 4, 27, 6, 11',
        '0, 8, 0, 6, 8, 12, 14, 0, 6, 8, 12, 14, 0, 6, 8, 12',
        '1, 4, 8, 5, 20, 17, 19, 56, 9, 11, 4, 43, 5, 6, 9, 17'
    ];
    document.getElementById('address-input').value = samples[Math.floor(Math.random() * samples.length)];
}

function generateRandomAddresses() {
    const bs = parseInt(document.getElementById('block-size').value) || 16;
    const count = 16 + Math.floor(Math.random() * 8);
    const addrs = [];
    for (let i = 0; i < count; i++) {
        if (i > 3 && Math.random() < 0.3) addrs.push(addrs[Math.floor(Math.random() * addrs.length)]);
        else addrs.push(Math.floor(Math.random() * (256 / bs)) * bs);
    }
    document.getElementById('address-input').value = addrs.join(', ');
}

function loadScenario(name) {
    const bs = parseInt(document.getElementById('block-size').value) || 16;
    const s = generateScenarioAddresses(name, bs);
    document.getElementById('address-input').value = s.addresses.join(', ');
}

function loadFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => { document.getElementById('address-input').value = e.target.result.trim(); };
    reader.readAsText(file);
    event.target.value = '';
}

/* --- Run Simulation --- */
function runSimulation() {
    stopAutoPlay();
    const config = {
        cacheSize: parseInt(document.getElementById('cache-size').value),
        blockSize: parseInt(document.getElementById('block-size').value),
        cacheType: document.getElementById('cache-type').value,
        ways: parseInt(document.getElementById('num-ways').value) || 1,
        policy: document.getElementById('replacement-policy').value,
        hitTime: parseFloat(document.getElementById('hit-time').value) || 1,
        missPenalty: parseInt(document.getElementById('miss-penalty').value) || 100
    };
    const errors = validateConfig(config);
    if (errors.length > 0) { showAlert(errors.join('\n')); return; }
    let addresses;
    try { addresses = parseAddresses(document.getElementById('address-input').value); }
    catch (e) { showAlert(e.message); return; }
    if (addresses.length === 0) { showAlert('Please enter at least one memory address.'); return; }

    simulator = new CacheSimulator(config);
    results = simulator.simulate(addresses);
    currentStep = 0;
    displayResults();
}

/* --- Display Results --- */
function displayResults() {
    const section = document.getElementById('results-section');
    section.classList.remove('hidden');
    document.getElementById('btn-export').style.display = '';

    const cards = section.querySelectorAll('.glass-card');
    cards.forEach((card, i) => {
        card.style.opacity = '0';
        card.style.animation = 'none';
        card.offsetHeight;
        card.style.animation = `fadeInUp 0.5s cubic-bezier(0.16,1,0.3,1) ${i * 0.1}s forwards`;
    });

    updateMetrics();
    drawTimelineChart();
    buildCacheGrid();
    buildLogTable();
    goToStep(0);
    enableStepControls();
    // No auto-scroll — user scrolls manually
}

/* --- Metrics --- */
function updateMetrics() {
    const r = results;
    animateCounter('metric-hits', r.hits);
    animateCounter('metric-misses', r.misses);
    animateCounter('metric-total', r.total);
    document.getElementById('metric-hit-ratio').textContent = (r.hitRatio * 100).toFixed(1) + '%';
    document.getElementById('metric-miss-ratio').textContent = (r.missRatio * 100).toFixed(1) + '%';
    document.getElementById('metric-amat').textContent = r.amat.toFixed(2);
    setTimeout(() => {
        document.getElementById('hit-ratio-bar').style.width = (r.hitRatio * 100) + '%';
        document.getElementById('miss-ratio-bar').style.width = (r.missRatio * 100) + '%';
    }, 300);
}

function animateCounter(id, target) {
    const el = document.getElementById(id);
    const start = performance.now();
    function tick(now) {
        const p = Math.min((now - start) / 800, 1);
        el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
        if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

/* --- Timeline Chart (Canvas) --- */
function drawTimelineChart() {
    const canvas = document.getElementById('timeline-chart');
    if (!canvas || !results) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 120 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '120px';
    ctx.scale(dpr, dpr);
    const w = rect.width, h = 120;
    ctx.clearRect(0, 0, w, h);

    const history = results.history;
    if (history.length === 0) return;
    const barW = Math.max(4, Math.min(30, (w - 40) / history.length - 2));
    const gap = 2;
    const totalW = history.length * (barW + gap);
    const startX = Math.max(20, (w - totalW) / 2);

    // Running hit ratio line
    let cumHits = 0;
    const ratios = [];
    history.forEach((s, i) => { if (s.hit) cumHits++; ratios.push(cumHits / (i + 1)); });

    // Draw bars
    history.forEach((s, i) => {
        const x = startX + i * (barW + gap);
        const barH = s.hit ? h * 0.5 : h * 0.7;
        const y = h - barH - 10;
        ctx.fillStyle = s.hit ? '#00D4AA' : '#FF6B9D';
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        // Step number
        if (barW > 12) {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '9px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(i + 1, x + barW / 2, h - 2);
        }
    });

    // Draw hit ratio line
    ctx.beginPath();
    ctx.strokeStyle = '#6C63FF';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ratios.forEach((r, i) => {
        const x = startX + i * (barW + gap) + barW / 2;
        const y = (1 - r) * (h - 30) + 10;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Label
    ctx.fillStyle = '#6C63FF';
    ctx.font = '10px Inter';
    ctx.textAlign = 'right';
    ctx.fillText('Hit Ratio', w - 10, 18);
}

/* --- Cache Grid --- */
function buildCacheGrid() {
    const grid = document.getElementById('viz-cache-grid');
    const info = results.cacheInfo;
    let html = '';
    for (let s = 0; s < info.numSets; s++) {
        html += `<div class="viz-set-row" id="viz-set-${s}">`;
        html += `<div class="viz-set-label" id="viz-set-label-${s}">`;
        html += info.cacheType === 'direct' ? `Line ${s}` : info.cacheType === 'fully' ? 'Set 0' : `Set ${s}`;
        html += `</div><div class="viz-set-ways">`;
        for (let w = 0; w < info.ways; w++) {
            html += `<div class="viz-cache-block empty" id="viz-block-${s}-${w}">`;
            html += `<span class="viz-block-way">Way ${w}</span>`;
            html += `<span class="viz-block-empty-label">Empty</span></div>`;
        }
        html += `</div></div>`;
    }
    grid.innerHTML = html;
}

/* --- Render Visual State --- */
function renderVisualState(snapshotIndex) {
    const snapshot = results.snapshots[snapshotIndex];
    const info = results.cacheInfo;
    const stepData = snapshotIndex > 0 ? results.history[snapshotIndex - 1] : null;
    if (!snapshot) return;

    for (let s = 0; s < snapshot.length; s++) {
        const row = document.getElementById(`viz-set-${s}`);
        const lbl = document.getElementById(`viz-set-label-${s}`);
        const isTarget = stepData && stepData.setIndex === s;
        row.classList.toggle('highlighted', !!isTarget);
        lbl.classList.toggle('highlighted', !!isTarget);

        for (let w = 0; w < snapshot[s].length; w++) {
            const line = snapshot[s][w];
            const block = document.getElementById(`viz-block-${s}-${w}`);
            if (!block) continue;
            block.classList.remove('empty','filled','block-hit','block-miss');
            const isTargetBlock = stepData && stepData.setIndex === s && stepData.lineIndex === w;
            if (line.valid) {
                block.classList.add('filled');
                if (isTargetBlock) block.classList.add(stepData.hit ? 'block-hit' : 'block-miss');
                block.innerHTML = `<span class="viz-block-way">Way ${w}</span><span class="viz-block-tag">Tag: 0x${line.tag.toString(16).toUpperCase()}</span>`;
            } else {
                block.classList.add('empty');
                block.innerHTML = `<span class="viz-block-way">Way ${w}</span><span class="viz-block-empty-label">Empty</span>`;
            }
        }
    }

    // CPU node
    const cpu = document.getElementById('viz-cpu');
    cpu.classList.remove('active-hit','active-miss');
    document.getElementById('cpu-request').textContent = stepData ? `Read ${stepData.addressHex}` : 'Waiting...';
    if (stepData) cpu.classList.add(stepData.hit ? 'active-hit' : 'active-miss');

    // Address decomposition
    const decomp = document.getElementById('viz-addr-decomp');
    decomp.classList.toggle('active', !!stepData);
    document.getElementById('viz-tag-val').textContent = stepData ? stepData.tagHex : '—';
    document.getElementById('viz-index-val').textContent = stepData ? stepData.index : '—';
    document.getElementById('viz-offset-val').textContent = stepData ? stepData.offset : '—';

    // Result badge
    const badge = document.getElementById('viz-result-badge');
    if (stepData) {
        badge.textContent = stepData.hit ? '✓ HIT' : '✗ MISS';
        badge.className = 'viz-result-badge ' + (stepData.hit ? 'hit-badge' : 'miss-badge');
    } else { badge.textContent = ''; badge.className = 'viz-result-badge'; }

    // Arrows
    const mem = document.getElementById('viz-memory');
    mem.classList.remove('active');
    if (stepData) {
        document.getElementById('arrow-cpu-label').textContent = stepData.addressHex;
        if (stepData.hit) {
            document.getElementById('arrow-decomp-label').textContent = 'Tag Match → HIT';
            document.getElementById('arrow-decomp-label').className = 'viz-arrow-label hit-label';
            document.getElementById('arrow-mem-label').textContent = '—';
            document.getElementById('arrow-mem-label').className = 'viz-arrow-label';
            document.getElementById('mem-detail').textContent = 'Not accessed';
        } else {
            document.getElementById('arrow-decomp-label').textContent = 'No Match → MISS';
            document.getElementById('arrow-decomp-label').className = 'viz-arrow-label miss-label';
            document.getElementById('arrow-mem-label').textContent = 'Fetch Block';
            document.getElementById('arrow-mem-label').className = 'viz-arrow-label miss-label';
            mem.classList.add('active');
            const ba = Math.floor(stepData.address / simulator.blockSize) * simulator.blockSize;
            document.getElementById('mem-detail').textContent = `Fetching @ 0x${ba.toString(16).toUpperCase()}`;
        }
    } else {
        document.getElementById('arrow-cpu-label').textContent = 'Address';
        document.getElementById('arrow-decomp-label').textContent = 'Look up';
        document.getElementById('arrow-decomp-label').className = 'viz-arrow-label';
        document.getElementById('arrow-mem-label').textContent = '—';
        document.getElementById('arrow-mem-label').className = 'viz-arrow-label';
        document.getElementById('mem-detail').textContent = 'RAM';
    }

    // Explanation panel
    const expEl = document.getElementById('explanation-content');
    if (stepData && stepData.explanation) {
        expEl.innerHTML = stepData.explanation.split('\n').map(l => `<span class="exp-line">${l}</span>`).join('');
    } else {
        expEl.innerHTML = '<p class="empty-state">Step through the simulation to see explanations.</p>';
    }

    animateParticles(stepData);
}

/* --- Particles --- */
function animateParticles(stepData) {
    const ps = ['particle-cpu-cache','particle-decomp-cache','particle-cache-mem'].map(id => document.getElementById(id));
    ps.forEach(p => { p.className = 'viz-arrow-particle'; void p.offsetWidth; });
    if (!stepData) return;
    setTimeout(() => ps[0].classList.add(stepData.hit ? 'hit-particle' : 'miss-particle', 'animate-down'), 50);
    setTimeout(() => ps[1].classList.add(stepData.hit ? 'hit-particle' : 'miss-particle', 'animate-down'), 250);
    if (!stepData.hit) setTimeout(() => ps[2].classList.add('mem-particle', 'animate-up'), 450);
}

/* --- Log Table --- */
function buildLogTable() {
    const tbody = document.getElementById('log-tbody');
    tbody.innerHTML = '';
    for (const step of results.history) {
        const tr = document.createElement('tr');
        tr.className = step.hit ? 'log-hit' : 'log-miss';
        tr.dataset.step = step.step;
        const bin = `<span style="color:var(--accent-orange)">${step.binary.tagPart}</span>` +
            (step.binary.indexPart ? `<span style="color:var(--accent-teal)">${step.binary.indexPart}</span>` : '') +
            `<span style="color:var(--accent-purple)">${step.binary.offsetPart}</span>`;
        tr.innerHTML = `<td>${step.step}</td><td>${step.addressHex}<br><span style="color:var(--text-muted);font-size:.72rem">(${step.address})</span></td><td style="font-size:.7rem;letter-spacing:.5px">${bin}</td><td>${step.tagHex}</td><td>${step.index}</td><td>${step.offset}</td><td>${step.hit ? '✓ HIT' : '✗ MISS'}</td><td style="font-size:.75rem;color:var(--text-muted)">${step.detail}</td>`;
        tr.addEventListener('click', () => goToStep(step.step));
        tr.style.cursor = 'pointer';
        tbody.appendChild(tr);
    }
}

/* --- Step Navigation --- */
function goToStep(step) {
    if (!results) return;
    currentStep = Math.max(0, Math.min(step, results.history.length));
    document.getElementById('step-indicator').textContent = `Step ${currentStep} / ${results.history.length}`;
    document.getElementById('btn-step-back').disabled = currentStep <= 0;
    document.getElementById('btn-step-forward').disabled = currentStep >= results.history.length;
    renderVisualState(currentStep);
    const rows = document.querySelectorAll('#log-tbody tr');
    rows.forEach(row => {
        const active = parseInt(row.dataset.step) === currentStep;
        row.classList.toggle('log-active', active);
    });
}
function stepForward() { goToStep(currentStep + 1); }
function stepBack() { goToStep(currentStep - 1); }
function enableStepControls() {
    document.getElementById('btn-step-back').disabled = currentStep <= 0;
    document.getElementById('btn-step-forward').disabled = currentStep >= results.history.length;
    document.getElementById('btn-play').disabled = false;
}

/* --- Auto Play --- */
function toggleAutoPlay() { isPlaying ? stopAutoPlay() : startAutoPlay(); }
function startAutoPlay() {
    if (!results) return;
    isPlaying = true; updatePlayButton();
    if (currentStep >= results.history.length) goToStep(0);
    autoPlayInterval = setInterval(() => {
        if (currentStep >= results.history.length) { stopAutoPlay(); return; }
        stepForward();
    }, playSpeed);
}
function stopAutoPlay() {
    isPlaying = false;
    if (autoPlayInterval) { clearInterval(autoPlayInterval); autoPlayInterval = null; }
    updatePlayButton();
}
function updatePlayButton() {
    const icon = document.getElementById('play-icon');
    icon.innerHTML = isPlaying
        ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
        : '<polygon points="5 3 19 12 5 21 5 3"/>';
}
function updateSpeed(val) {
    playSpeed = 2200 - parseInt(val);
    if (isPlaying) { stopAutoPlay(); startAutoPlay(); }
}

/* --- Export --- */
function exportResults() {
    if (!results) return;
    const csv = exportToCSV(results);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cache_simulation_results.csv';
    a.click();
    URL.revokeObjectURL(a.href);
}

/* --- Reset --- */
function resetSimulator() {
    stopAutoPlay();
    simulator = null; results = null; currentStep = 0;
    document.getElementById('results-section').classList.add('hidden');
    document.getElementById('btn-export').style.display = 'none';
    document.getElementById('address-input').value = '';
    document.getElementById('viz-cache-grid').innerHTML = '<p class="empty-state">Run a simulation to see the visualization.</p>';
    document.getElementById('log-tbody').innerHTML = '';
    ['metric-hits','metric-misses','metric-total'].forEach(id => document.getElementById(id).textContent = '0');
    document.getElementById('metric-hit-ratio').textContent = '0%';
    document.getElementById('metric-miss-ratio').textContent = '0%';
    document.getElementById('metric-amat').textContent = '0';
    document.getElementById('hit-ratio-bar').style.width = '0%';
    document.getElementById('miss-ratio-bar').style.width = '0%';
    document.getElementById('viz-cpu').classList.remove('active-hit','active-miss');
    document.getElementById('viz-memory').classList.remove('active');
    document.getElementById('cpu-request').textContent = 'Waiting...';
    document.getElementById('mem-detail').textContent = 'RAM';
    document.getElementById('viz-result-badge').textContent = '';
    document.getElementById('viz-result-badge').className = 'viz-result-badge';
    document.getElementById('explanation-content').innerHTML = '<p class="empty-state">Run a simulation to see explanations for each memory access.</p>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* --- Alert Modal --- */
function showAlert(message) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:9999;animation:fadeInUp .2s ease';
    const modal = document.createElement('div');
    modal.style.cssText = 'background:var(--bg-secondary);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:28px 32px;max-width:440px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.5)';
    modal.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><strong style="font-size:1.05rem">Configuration Error</strong></div><p style="color:var(--text-secondary);font-size:.9rem;white-space:pre-line;line-height:1.7;margin-bottom:20px">${message}</p><button onclick="this.closest('div[style*=fixed]').remove()" style="background:linear-gradient(135deg,var(--accent-purple),#8B5CF6);color:#fff;border:none;padding:10px 24px;border-radius:var(--radius-md);font-family:var(--font-sans);font-size:.85rem;font-weight:500;cursor:pointer;width:100%">Got it</button>`;
    overlay.appendChild(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

/* --- Keyboard Shortcuts --- */
document.addEventListener('keydown', e => {
    if (!results || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === 'l') { e.preventDefault(); stepForward(); }
    else if (e.key === 'ArrowLeft' || e.key === 'h') { e.preventDefault(); stepBack(); }
    else if (e.key === ' ') { e.preventDefault(); toggleAutoPlay(); }
});
