const localSource = 'outputs/explanations/local_case_studies.json';

async function mountLocalExplainers() {
  const slides = Array.from(document.querySelectorAll('.page'));
  const targets = [slides[7], slides[8]];
  const panels = targets.map(slide => {
    slide.querySelector('.card, .grid').remove();
    const panel = document.createElement('div');
    panel.className = 'card';
    panel.textContent = 'Loading recorded explanations…';
    slide.append(panel);
    return panel;
  });
  try {
    const response = await fetch(localSource);
    if (!response.ok) throw new Error(response.status);
    const cases = await response.json();
    const stability = await fetch('outputs/explanations/local_stability.json')
      .then(result => result.ok ? result.json() : null)
      .catch(() => null);
    const names = ['Correct AI', 'Correct Human', 'Human flagged as AI', 'AI classified as Human'];
    function render(index) {
      const record = cases[index];
      function contributions(method) {
        return new Map(method.names.map((name, i) => [name, method.scores[i]]));
      }
      const lime = contributions(record.lime);
      const shap = contributions(record.kernel_shap);
      const ranked = scores => [...scores.keys()].sort((a, b) =>
        Math.abs(scores.get(b)) - Math.abs(scores.get(a)) || a.localeCompare(b));
      const order = ranked(lime);
      const shapOrder = ranked(shap);
      const overlap = order.slice(0, 3).filter(name => shapOrder.slice(0, 3).includes(name)).length;
      const label = value => value === 1 ? 'AI' : 'Human';
      const meta = record.metadata;
      panels.forEach((panel, i) => {
        const scores = i === 0 ? lime : shap;
        const repeat = stability?.cases[record.case];
        const metrics = repeat?.methods[i === 0 ? 'LIME' : 'Kernel SHAP'];
        const repeatSummary = metrics ? `
          <p class="graph-note"><strong>${metrics.badge}</strong> across ${stability.seeds.length} seeds.
          Mean rank correlation ${metrics.rank_correlation.toFixed(2)}, sign consistency
          ${(metrics.sign_consistency * 100).toFixed(0)}%, and top-three overlap
          ${(metrics.top3_overlap * 100).toFixed(0)}%. The frozen model score varied by
          ${(repeat.probability_range * 100).toFixed(2)} percentage points.</p>
          <details><summary>Stability method</summary><p>${stability.background}. The badge uses the lowest
          of the three pairwise means. Stable starts at 0.80, Mixed at 0.50, and lower values are Unstable.</p></details>` : '';
        const scale = Math.max(...Array.from(scores.values(), Math.abs), Number.EPSILON);
        panel.innerHTML = `
          <label>RAID case <select>${cases.map((_, j) =>
            `<option value="${j}" ${j === index ? 'selected' : ''}>${names[j]}</option>`).join('')}</select></label>
          <p>Actual <strong>${label(meta.ground_truth)}</strong> · Predicted <strong>${label(meta.predicted)}</strong> · Model AI score ${(meta.probabilities['1'] * 100).toFixed(0)}%</p>
          <p><strong>Agreement</strong> · ${overlap}/3 shared top features ranked by absolute contribution.
          ${overlap < 3 ? 'The methods prioritize different features. Treat the ranking with caution.' : 'The top-three feature sets match. Their order and signs can still differ.'}
          Agreement across methods and stability across reruns measure different things.</p>
          <div aria-label="Signed contributions">${order.map(name => {
            const value = scores.get(name);
            const width = 50 * Math.abs(value) / scale;
            const left = value < 0 ? 50 - width : 50;
            return `<div class="bar-row"><span>${name}</span><div class="bar" style="position:relative;background:linear-gradient(90deg,#ebe8df 49.7%,#68706b 49.7%,#68706b 50.3%,#ebe8df 50.3%)"><i style="position:absolute;left:${left}%;width:${width}%;background:${value < 0 ? 'var(--accent)' : 'var(--teal)'}"></i></div><b>${value >= 0 ? '+' : ''}${value.toFixed(3)}</b></div>`;
          }).join('')}</div>
          <p class="sub">Left lowers the explained output. Right raises it. Both charts use LIME’s feature order and scale their bars independently.</p>
          ${repeatSummary}`;
        panel.querySelector('select').onchange = event => {
          render(Number(event.target.value));
          panel.querySelector('select').focus();
        };
      });
    }
    render(0);
  } catch {
    panels.forEach(panel => {
      panel.textContent = 'Recorded explanations could not load. Open the site over HTTP or HTTPS and reload.';
    });
  }
}

mountLocalExplainers();

async function mountGlobalEvidence() {
  const slides = document.querySelectorAll('.page');
  const container = document.createElement('div');
  container.className = 'card';
  slides[5].querySelector('.evidence').before(container);
  try {
    const read = async name => {
      const response = await fetch(`outputs/explanations/${name}.json`);
      if (!response.ok) throw new Error(name);
      return response.json();
    };
    const [curves, morris] = await Promise.all([
      read('partial_dependence_global'), read('morris_global')
    ]);
    const ranking = morris.names.map((name, index) => [name, morris.scores[index]])
      .sort((a, b) => b[1] - a[1]);
    const chart = document.querySelector('#featureChart');
    chart.innerHTML = `<h3>Measured Morris scores</h3>
      ${ranking.map(([name, value]) => `<div class="bar-row"><span>${name}</span>
      <div class="bar"><i style="width:${value / ranking[0][1] * 100}%"></i></div>
      <b>${value.toFixed(3)}</b></div>`).join('')}
      <p class="sub">Bar lengths are relative to the largest measured score. Morris summarizes the
      size of output changes. The PDP slide shows their direction and shape across feature values.</p>`;
    container.innerHTML = '<label>Feature <select></select></label><div class="pdp-chart"></div>';
    const select = container.querySelector('select');
    morris.names.forEach((name, i) => select.add(new Option(name, i)));
    function render() {
      const curve = curves[Number(select.value)];
      const min = Math.min(...curve.values);
      const max = Math.max(...curve.values);
      const x = value => 64 + (value - min) / (max - min || 1) * 530;
      const y = score => 205 - score * 175;
      const points = curve.names.map((value, i) => [x(value), y(curve.scores[i])]);
      container.querySelector('.pdp-chart').innerHTML = `
        <svg viewBox="0 0 640 245" width="100%" aria-label="Partial dependence plot">
          <text x="64" y="18" font-size="12">Mean AI probability</text>
          ${[0, .25, .5, .75, 1].map(tick => `<text x="20" y="${y(tick)+4}" font-size="12">${tick}</text><path d="M64 ${y(tick)}H594" stroke="#d8d8ce"/>`).join('')}
          <polyline fill="none" stroke="#178b83" stroke-width="3" points="${points.map(point => point.join(',')).join(' ')}"/>
          ${points.map(([cx, cy], i) => `<circle tabindex="0" cx="${cx}" cy="${cy}" r="6" fill="#178b83" data-index="${i}"><title>${curve.names[i].toFixed(2)} · ${(100 * curve.scores[i]).toFixed(1)}%</title></circle>`).join('')}
          <text x="64" y="231" font-size="12">${select.selectedOptions[0].text}</text>
        </svg>
        <p role="status">Hover or focus a curve point for its recorded score.</p>`;
      const chart = container.querySelector('.pdp-chart');
      chart.querySelectorAll('circle').forEach(dot => {
        const show = () => { chart.querySelector('[role=status]').textContent = dot.textContent; };
        dot.addEventListener('focus', show);
        dot.addEventListener('pointerenter', show);
      });
    }
    select.onchange = render;
    render();
  } catch {
    container.textContent = 'Interactive PDP data could not load. The original plot remains below.';
  }
}

mountGlobalEvidence();

const comparison = document.querySelectorAll('.page')[10];
comparison.querySelector('tbody').insertAdjacentHTML('beforeend',
  '<tr><td>What-if</td><td>One case</td><td>What happens under a controlled feature change?</td><td>Feature combinations may be unusual</td></tr>');

async function mountCorrelation() {
  const slide = document.querySelectorAll('.page')[4];
  const response = await fetch('outputs/explanations/feature_correlation.json');
  if (!response.ok) return;
  const data = await response.json();
  const figure = document.createElement('figure');
  const image = document.createElement('img');
  image.className = 'evidence';
  image.src = 'outputs/figures/feature_correlation.png';
  image.alt = 'Pearson correlation heatmap for eight stylometric inputs';
  const caption = document.createElement('figcaption');
  caption.className = 'graph-note';
  const pair = (first, second) => {
    const i = data.features.indexOf(first);
    const j = data.features.indexOf(second);
    return `${first} and ${second} (${data.matrix[i][j].toFixed(2)})`;
  };
  caption.textContent = `Each cell shows Pearson r across ${data.n} RAID rows used for partial dependence. Compare ${pair('char_count', 'word_count')}, ${pair('word_count', 'sentence_count')}, and ${pair('word_count', 'avg_sentence_len')}. Values near ±1 indicate a strong linear relationship. These coefficients describe the inputs; model sensitivity is measured on the Morris slide.`;
  figure.append(image, caption);
  slide.querySelector('.grid').before(figure);
  slide.classList.add('correlation-layout');
}

mountCorrelation().catch(error => console.error('Correlation heatmap unavailable', error));

async function mountAudit() {
  const wrapUp = document.querySelectorAll('.page')[14];
  const sections = [
    ['Calibration', 'Can we trust the score?'],
    ['Error analysis', 'Where the model gets it wrong'],
    ['Slice explanations', 'Do the same features matter across groups?']
  ].map(([label, title]) => {
    const slide = document.createElement('section');
    slide.className = 'page';
    slide.innerHTML = `<div class="eyebrow">${label}</div><h2>${title}</h2>`;
    const status = document.createElement('p');
    status.textContent = 'Loading the 10,000-record audit…';
    slide.append(status);
    wrapUp.before(slide);
    return {slide, status};
  });
  show(cur);
  const response = await fetch('outputs/metrics/audit.json');
  if (!response.ok) {
    sections.forEach(({status}) => { status.textContent = 'The measured audit export is unavailable.'; });
    return;
  }
  const audit = await response.json();
  const panel = document.createElement('div');
  panel.className = 'card';
  const x = score => 42 + score * 240;
  const y = rate => 260 - rate * 240;
  const maxCount = Math.max(1, ...audit.bins.flatMap(bin => [bin.human, bin.ai]));
  const histogram = audit.bins.map((bin, index) =>
    ['human', 'ai'].map((label, offset) => {
      const height = 110 * bin[label] / maxCount;
      return `<rect x="${40 + index * 42 + offset * 16}" y="${142 - height}"
        width="15" height="${height}" fill="${offset ? '#178b83' : '#bd492e'}">
        <title>${label}, ${bin.lower.toFixed(1)}–${bin.upper.toFixed(1)}: ${bin[label]}</title></rect>`;
    }).join('') + `<text x="${40 + index * 42}" y="158" font-size="10">${bin.lower.toFixed(1)}</text>`
  ).join('');
  const distribution = (feature, quantiles) => {
    const [min, q1, median, q3, max] = [0, .25, .5, .75, 1].map(q => quantiles[q]);
    const position = value => 8 + 144 * (value - min) / (max - min || 1);
    return `<svg viewBox="0 0 160 22" width="160" role="img"
      aria-label="${feature} box plot, minimum ${min}, maximum ${max}">
      <path d="M8 11H${position(max)}" stroke="currentColor"/>
      <rect x="${position(q1)}" width="${Math.max(1, position(q3) - position(q1))}"
        y="4" height="14" fill="#178b83"/>
      <path d="M${position(median)} 3V19" stroke="#202523" stroke-width="2"/>
    </svg>`;
  };
  panel.innerHTML = `
    <h3>Do the probabilities match the observed rates?</h3>
    <p>Brier score <strong>${audit.brier.toFixed(4)}</strong> · Ten-bin ECE
    <strong>${(audit.ece * 100).toFixed(1)}%</strong> · ${audit.n.toLocaleString()} records</p>
    <svg viewBox="0 0 310 295" width="100%" style="max-width:450px" aria-label="Reliability diagram">
      <path d="M42 20V260H282" fill="none" stroke="currentColor"/>
      <path d="M42 260L282 20" stroke="#69716c" stroke-dasharray="5 4"/>
      <text x="44" y="16" font-size="11">Observed AI fraction</text>
      <text x="90" y="285" font-size="11">Mean predicted AI probability</text>
      ${audit.bins.filter(bin => bin.count).map(bin => `<circle tabindex="0" cx="${x(bin.mean_score)}"
        cy="${y(bin.observed_rate)}" r="5" fill="#178b83"><title>Predicted ${bin.mean_score.toFixed(3)},
        observed ${bin.observed_rate.toFixed(3)}, n=${bin.count}</title></circle>`).join('')}
    </svg>
    <p class="sub">Dots below the diagonal have fewer AI examples than their mean model score suggests.</p>
    <h3>Score distributions by actual class</h3>
    <figure style="margin:1rem 0">
      <svg viewBox="0 0 480 185" width="100%" style="max-width:640px" role="img" aria-label="Grouped histogram of AI scores by true class">
        <text x="40" y="18" font-size="12">Record count · shared maximum ${maxCount}</text>
        <path d="M35 30V142H460" fill="none" stroke="currentColor"/>
        ${histogram}
        <text x="170" y="180" font-size="11">Lower bound of AI score bin</text>
      </svg>
      <figcaption>Orange bars show human records. Teal bars show AI records. Where both colors are tall, many records of both classes received similar scores.</figcaption>
    </figure>
    <details><summary>Exact bin counts</summary>
    <table><thead><tr><th>Score bin</th><th>Human count</th><th>AI count</th></tr></thead>
    <tbody>${audit.bins.map(bin => `<tr><td>${bin.lower.toFixed(1)}–${bin.upper.toFixed(1)}</td>
      <td>${bin.human}</td><td>${bin.ai}</td></tr>`).join('')}</tbody></table></details>
    <h3>Threshold trade-off</h3>
    <label>Flag scores above <output></output><input type="range" min="0" max="100" value="50"></label>
    <p role="status"></p>
    <h3>Where the default threshold fails</h3>
    ${Object.entries(audit.errors).map(([name, group]) => `
      <details><summary>${name.replace('_', ' ')} (${group.count.toLocaleString()})</summary>
      <p>Average length ${group.mean_chars.toFixed(0)} characters. The local slides include a representative case.</p>
      <p class="sub">Each box spans the middle half of the errors for that feature. The center line
      marks the median. Each row uses its own minimum-to-maximum scale.</p>
      <table><thead><tr><th>Feature</th><th>Distribution</th><th>25th percentile</th><th>Median</th><th>75th percentile</th></tr></thead>
      <tbody>${Object.entries(group.feature_quantiles).map(([feature, q]) => `<tr><td>${feature}</td>
        <td>${distribution(feature, q)}</td>
        <td>${q['0.25'].toFixed(2)}</td><td>${q['0.5'].toFixed(2)}</td><td>${q['0.75'].toFixed(2)}</td></tr>`).join('')}</tbody></table>
      ${Object.entries(group.breakdowns).map(([field, counts]) => `<p><strong>${field}</strong> ·
        ${Object.entries(counts).map(([key, count]) => `${key} (${count})`).join(', ')}</p>`).join('')}
      </details>`).join('')}`;
  const slider = panel.querySelector('input');
  function renderThreshold() {
    const [[tn, fp], [fn, tp]] = audit.thresholds[Number(slider.value)];
    panel.querySelector('output').value = (Number(slider.value) / 100).toFixed(2);
    panel.querySelector('[role=status]').textContent =
      `${tn} true negatives · ${fp} false positives · ${fn} false negatives · ${tp} true positives`;
  }
  slider.oninput = renderThreshold;
  renderThreshold();
  const errorHeading = [...panel.querySelectorAll('h3')].at(-1);
  const errorPanel = document.createElement('div');
  errorPanel.className = 'card';
  while (errorHeading.nextElementSibling) errorPanel.append(errorHeading.nextElementSibling);
  errorHeading.remove();
  panel.classList.add('calibration-layout');
  const headings = [...panel.querySelectorAll('h3')];
  headings.forEach(heading => {
    const column = document.createElement('section');
    heading.before(column);
    column.append(heading);
    while (column.nextElementSibling && column.nextElementSibling.tagName !== 'H3') {
      column.append(column.nextElementSibling);
    }
  });
  sections[0].status.replaceWith(panel);
  sections[1].status.replaceWith(errorPanel);
  const slices = document.createElement('section');
  slices.className = 'card';
  const fields = {
    label: 'Actual class', domain: 'Domain / genre', model: 'Generator',
    attack_status: 'Attack status', decoding: 'Decoding', repetition_penalty: 'Repetition penalty'
  };
  slices.innerHTML = `
    <h3>Compare explanations across RAID groups</h3>
    <p class="sub">Mean absolute Kernel SHAP measures attribution magnitude with a shared reference
    background. Differences are descriptive and may reflect other differences between groups.</p>
    <label>Group by <select class="slice-field"></select></label>
    <label>First group <select class="slice-first"></select></label>
    <label>Second group <select class="slice-second"></select></label>
    <div class="slice-results"></div>`;
  const field = slices.querySelector('.slice-field');
  const first = slices.querySelector('.slice-first');
  const second = slices.querySelector('.slice-second');
  Object.entries(fields).forEach(([key, label]) => field.add(new Option(label, key)));
  function renderSlices() {
    const groups = audit.slices[field.value];
    const a = groups[first.value];
    const b = groups[second.value];
    const results = slices.querySelector('.slice-results');
    if (!a || !b) return;
    const table = document.createElement('table');
    const header = table.createTHead().insertRow();
    ['Feature', first.value, second.value].forEach(label => {
      const cell = document.createElement('th');
      cell.textContent = label;
      cell.scope = 'col';
      header.append(cell);
    });
    const body = table.createTBody();
    function row(...values) {
      const entry = body.insertRow();
      values.forEach(value => { entry.insertCell().textContent = value; });
    }
    row('Records explained / group size', `${a.explained} / ${a.n}`, `${b.explained} / ${b.n}`);
    row('Mean model AI score (all group records)', a.average_ai_score.toFixed(3), b.average_ai_score.toFixed(3));
    Object.keys(a.mean_absolute_shap).forEach(feature => row(feature,
      a.mean_absolute_shap[feature].toFixed(4), b.mean_absolute_shap[feature].toFixed(4)));
    results.replaceChildren(table);
  }
  field.onchange = () => {
    const options = Object.keys(audit.slices[field.value]);
    [first, second].forEach(select => {
      select.replaceChildren(...options.map(name => new Option(name, name)));
    });
    second.selectedIndex = Math.min(1, options.length - 1);
    renderSlices();
  };
  first.onchange = second.onchange = renderSlices;
  field.onchange();
  sections[2].status.replaceWith(slices);
}

mountAudit().catch(error => console.error('Calibration and error analysis unavailable', error));

async function mountLiterature() {
  const response = await fetch('academic_report/presentation_references.json');
  if (!response.ok) throw new Error('Bibliography unavailable');
  const papers = await response.json();
  const slides = document.querySelectorAll('.page');
  const midpoint = Math.ceil(papers.length / 2);
  [papers.slice(0, midpoint), papers.slice(midpoint)].forEach((group, index) => {
    const slide = slides[index + 1];
    const original = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = index === 0 ? 'InterpretML method map' : 'Experiment pipeline';
    original.append(summary, ...slide.childNodes);
    slide.innerHTML = `<div class="eyebrow">Literature review · ${index + 1} of 2</div>
      <h2>${index === 0 ? 'How detectors generalize' : 'How to audit the evidence'}</h2>
      <p class="sub">${papers.length} papers published after 2020. Expand a paper to see its relevance to the project.</p>`;
    group.forEach(paper => {
      const entry = document.createElement('details');
      const title = document.createElement('summary');
      title.textContent = `${paper.year} · ${paper.title}`;
      const citation = document.createElement('p');
      citation.textContent = `${paper.authors} · ${paper.venue}`;
      const relevance = document.createElement('p');
      relevance.textContent = paper.relevance;
      const link = document.createElement('a');
      link.href = paper.url;
      link.textContent = 'Open publication record';
      entry.append(title, citation, relevance, link);
      slide.append(entry);
    });
    slide.append(original);
  });
}

mountLiterature().catch(error => console.error('Literature review unavailable', error));

async function mountRecordedPerturbations() {
  const slide = document.querySelectorAll('.page')[9];
  const panel = document.createElement('div');
  panel.className = 'card';
  slide.querySelector('.card').replaceWith(panel);
  panel.textContent = 'Loading recorded perturbations…';
  const responses = await Promise.all([
    fetch(localSource), fetch('outputs/explanations/what_if_results.csv')
  ]);
  if (responses.some(response => !response.ok)) {
    panel.textContent = 'Recorded perturbations unavailable.';
    return;
  }
  const [cases, csv] = await Promise.all([responses[0].json(), responses[1].text()]);
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  const keys = header.split(',');
  const rows = lines.map(line => Object.fromEntries(line.split(',').map((value, i) => [keys[i], value])));
  panel.innerHTML = '<label>Case <select></select></label> <label>Feature <select></select></label><div class="perturbation"></div>';
  const [caseSelect, feature] = panel.querySelectorAll('select');
  cases.forEach(record => caseSelect.add(new Option(record.case.replaceAll('_', ' '), record.metadata.id)));
  [...new Set(rows.map(row => row.feature))].forEach(name => feature.add(new Option(name, name)));
  function render() {
    const selected = rows.filter(row => row.record_id === caseSelect.value && row.feature === feature.value);
    const percent = value => `${(Number(value) * 100).toFixed(1)}%`;
    const label = value => value === '1' ? 'AI' : 'Human';
    panel.querySelector('.perturbation').innerHTML = `
      <table><thead><tr><th>Setting</th><th>Feature value</th><th>AI score</th><th>Predicted class</th></tr></thead><tbody>
      <tr><td>Original</td><td>${Number(selected[0].original_value).toFixed(2)}</td>
      <td>${percent(selected[0].original_p_ai)}</td><td>${label(selected[0].original_predicted_label)}</td></tr>
      ${selected.map(row => `<tr><td>Sample ${percent(row.quantile)} quantile</td>
        <td>${Number(row.modified_value).toFixed(2)}</td><td>${percent(row.modified_p_ai)}</td>
        <td>${label(row.modified_predicted_label)}</td></tr>`).join('')}</tbody></table>
      <p class="sub">The experiment changed one numeric input while holding the other seven fixed. A resulting vector can combine statistics that would rarely occur together in real text.</p>`;
  }
  caseSelect.onchange = feature.onchange = render;
  render();
}

mountRecordedPerturbations().catch(error => console.error('Perturbations unavailable', error));

const originalSlides = [...document.querySelectorAll('.page')];
function stackSlide(target, source) {
  const section = document.createElement('section');
  section.className = 'stacked-section';
  source.querySelector('.eyebrow')?.remove();
  section.append(...source.childNodes);
  target.append(section);
  source.remove();
}
stackSlide(originalSlides[11], originalSlides[12]);
stackSlide(originalSlides[11], originalSlides[13]);
stackSlide(originalSlides[15], originalSlides[17]);
show(cur);
