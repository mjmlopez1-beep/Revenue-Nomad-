/* RN.w: form widgets bound to the field registry (RN.fields).
   Every flow that asks for a standard field renders it through RN.w.field(key, value), so the
   label, help text, options, order, limits and stored values are identical everywhere:
   operator intake, Studio profile edits, browse filters, project posting, buyer company profile,
   review forms and admin tools.

   Field definition shape (js/data/fields.js):
     { key, label, type, options: [{ v: 'slug', l: 'Label', d: 'help text', level: 1-4 }],
       max, min, help, placeholder, unit, prefix, optional, group }
   Types: single | multi | select | optcards | tags | text | textarea | number | money | date | email | url
*/
(function () {
  'use strict';
  const RN = window.RN;
  const esc = RN.esc, icon = RN.icon;
  const w = (RN.w = {});

  w.def = (key) => {
    const d = RN.fields[key];
    if (!d) throw new Error('Unknown field: ' + key);
    return d;
  };
  w.opt = (key, v) => (w.def(key).options || []).find((o) => o.v === v || o.l === v);
  /* Display label for a stored value (accepts slug or label) */
  w.label = (key, v) => { const o = w.opt(key, v); return o ? o.l : v == null ? '' : String(v); };
  w.labels = (key, vs, sep) => (vs || []).map((v) => w.label(key, v)).filter(Boolean).join(sep || ', ');

  /* Full field: label + help + control. opts: { name, id, label, help, compact, max, required, hideLabel } */
  w.field = function (key, value, opts) {
    const d = w.def(key);
    opts = opts || {};
    const id = opts.id || 'f-' + (opts.name || key);
    const label = opts.label || d.label;
    const help = opts.help !== undefined ? opts.help : d.help;
    const max = opts.max || d.max;
    const countNote = (d.type === 'multi' || d.type === 'tags' || d.type === 'tagsearch') && max ? `<span class="opt">Up to ${max}</span>` : d.optional && !opts.required ? '<span class="opt">Optional</span>' : '';
    return `<div class="field" data-field="${esc(key)}">
      ${opts.hideLabel ? '' : `<label for="${esc(id)}">${esc(label)} ${countNote}</label>`}
      ${w.control(key, value, Object.assign({}, opts, { id }))}
      ${help && !opts.compact ? `<p class="help">${esc(help)}</p>` : ''}
    </div>`;
  };

  w.control = function (key, value, opts) {
    const d = w.def(key);
    opts = opts || {};
    const name = opts.name || key;
    const id = opts.id || 'f-' + name;
    const ph = opts.placeholder || d.placeholder || '';
    const req = opts.required ? 'required' : '';
    switch (d.type) {
      case 'single':
      case 'multi': {
        const multi = d.type === 'multi';
        const vals = multi ? (value || []) : value ? [value] : [];
        return `<div class="chipset" role="group" aria-label="${esc(d.label)}" id="${esc(id)}">
          ${d.options.map((o) => `<button type="button" class="chip" aria-pressed="${vals.includes(o.v)}" data-act="w-chip" data-name="${esc(name)}" data-v="${esc(o.v)}" data-multi="${multi ? 1 : ''}" data-max="${esc(opts.max || d.max || '')}" ${o.d ? `title="${esc(o.d)}"` : ''}>${esc(o.l)}</button>`).join('')}
          <input type="hidden" name="${esc(name)}" value="${esc(vals.join('|'))}" ${multi ? 'data-multi="1"' : ''} ${opts.change ? `data-change="${esc(opts.change)}"` : ''}>
        </div>`;
      }
      case 'optcards': {
        const multi = !!d.multi;
        const vals = multi ? (value || []) : value ? [value] : [];
        const levels = d.options.some((o) => o.level);
        return `<div class="optcards" role="group" aria-label="${esc(d.label)}" id="${esc(id)}">
          ${d.options.map((o) => `<button type="button" class="optcard" aria-pressed="${vals.includes(o.v)}" data-act="w-chip" data-name="${esc(name)}" data-v="${esc(o.v)}" data-multi="${multi ? 1 : ''}">
            <b>${esc(o.l)}</b>
            ${levels ? `<span class="bars" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i <= (o.level || 0) ? 'on' : ''}"></i>`).join('')}</span>` : ''}
            ${o.d ? `<span>${esc(o.d)}</span>` : ''}
          </button>`).join('')}
          <input type="hidden" name="${esc(name)}" value="${esc(vals.join('|'))}" ${multi ? 'data-multi="1"' : ''} ${opts.change ? `data-change="${esc(opts.change)}"` : ''}>
        </div>`;
      }
      case 'select': {
        const list = key === 'role' && opts.cat && RN.fields.rolesByCat[opts.cat] ? d.options.filter((o) => RN.fields.rolesByCat[opts.cat].includes(o.v)) : d.options;
        return `<select class="select" id="${esc(id)}" name="${esc(name)}" ${req} ${opts.change ? `data-change="${esc(opts.change)}"` : ''}>
          <option value="">${esc(ph || 'Select')}</option>
          ${list.map((o) => `<option value="${esc(o.v)}" ${o.v === value ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
        </select>`;
      }
      case 'tags':
      case 'tagsearch':
        return w.tagPicker(name, value || [], Object.assign({ id, max: opts.max || d.max, source: key }, opts));
      case 'textarea':
        return `<textarea class="textarea" id="${esc(id)}" name="${esc(name)}" placeholder="${esc(ph)}" ${req} ${d.maxlength ? `maxlength="${d.maxlength}"` : ''}>${esc(value || '')}</textarea>`;
      case 'money':
        return `<div class="input-affix"><span class="affix">$</span><input class="input" id="${esc(id)}" name="${esc(name)}" type="number" inputmode="numeric" min="${d.min || 0}" step="${d.step || 5}" value="${esc(value == null ? '' : value)}" placeholder="${esc(ph)}" ${req}>${d.unit ? `<span class="affix">${esc(d.unit)}</span>` : ''}</div>`;
      case 'number':
        return `<div class="input-affix"><input class="input" id="${esc(id)}" name="${esc(name)}" type="number" inputmode="numeric" min="${d.min == null ? '' : d.min}" max="${d.max == null ? '' : d.max}" value="${esc(value == null ? '' : value)}" placeholder="${esc(ph)}" ${req}>${d.unit ? `<span class="affix">${esc(d.unit)}</span>` : ''}</div>`;
      default:
        return `<input class="input" id="${esc(id)}" name="${esc(name)}" type="${esc(d.type === 'text' ? 'text' : d.type)}" value="${esc(value || '')}" placeholder="${esc(ph)}" ${req} ${d.maxlength ? `maxlength="${d.maxlength}"` : ''}>`;
    }
  };

  /* Chip / option card toggle */
  RN.actions['w-chip'] = function (el) {
    const group = el.parentElement;
    const input = group.querySelector('input[type=hidden]');
    const multi = !!el.dataset.multi;
    let vals = input.value ? input.value.split('|') : [];
    const v = el.dataset.v;
    const max = +el.dataset.max || 0;
    if (multi) {
      if (vals.includes(v)) vals = vals.filter((x) => x !== v);
      else {
        if (max && vals.length >= max) { RN.ui.toast(`Pick up to ${max}. Remove one to add another.`, { icon: 'info' }); return; }
        vals.push(v);
      }
    } else vals = vals[0] === v && el.closest('[data-deselect]') ? [] : [v];
    input.value = vals.join('|');
    RN.$$('[data-act="w-chip"]', group).forEach((b) => b.setAttribute('aria-pressed', vals.includes(b.dataset.v)));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  /* ---------- Fit tag picker with inline search ----------
     Scope fixes built in: searchable library, "N more" count, add a tag that is not in the list,
     search field inside the "add more tags" view. */
  w.tagPicker = function (name, values, opts) {
    opts = opts || {};
    const id = opts.id || 'tp-' + name;
    const src = opts.source || 'fitTags';
    const isTags = src === 'fitTags';
    const noun = isTags ? (opts.client ? 'focus areas' : 'fit tags') : RN.fields[src].label.toLowerCase();
    return `<div class="tagpick" id="${esc(id)}" data-tagpick="${esc(name)}" data-src="${esc(src)}" data-max="${esc(opts.max || '')}" data-cat="${esc(opts.cat || '')}" data-custom="${isTags && !opts.noCustom ? 1 : ''}">
      <div class="tagpick-sel" data-empty="${esc(opts.emptyText || (isTags ? 'No tags yet. Search or pick from suggestions below.' : 'None selected yet. Search below.'))}">${values.map((t) => tagChip(t, src)).join('')}</div>
      <div class="tagpick-search">${icon('search')}<input type="search" placeholder="Search ${RN.fmt.int((RN.fields[src].options || []).length)} ${esc(noun)}${isTags && !opts.noCustom ? ', or type your own' : ''}" data-input="w-tag-search" aria-label="Search ${esc(noun)}" autocomplete="off"></div>
      <div class="tagpick-list">${tagList(values, '', opts.cat, src, isTags && !opts.noCustom)}</div>
      <div class="tagpick-foot"><span data-count>${values.length}${opts.max ? ' of ' + opts.max : ''} selected</span>${isTags ? '<span>Verified when a client review confirms it</span>' : ''}</div>
      <input type="hidden" name="${esc(name)}" value="${esc(values.join('|'))}" data-multi="1" ${opts.change ? `data-change="${esc(opts.change)}"` : ''}>
    </div>`;
  };
  function tagChip(t, src) {
    const l = src && src !== 'fitTags' ? w.label(src, t) : t;
    return `<button type="button" class="chip chip-sm on" data-act="w-tag-remove" data-t="${esc(t)}" aria-label="Remove ${esc(l)}">${esc(l)}<span class="x">${icon('x')}</span></button>`;
  }
  function tagList(selected, q, cat, src, allowCustom) {
    src = src || 'fitTags';
    const lib = RN.fields[src].options || [];
    const ql = (q || '').trim().toLowerCase();
    let pool = lib.filter((o) => !selected.includes(o.v));
    if (ql) pool = pool.filter((o) => o.l.toLowerCase().includes(ql) || (o.g || '').toLowerCase().includes(ql));
    else if (cat) pool = pool.filter((o) => o.c === cat).concat(pool.filter((o) => o.c !== cat)).slice(0, 60);
    else pool = pool.slice(0, 60);
    const groups = {};
    pool.slice(0, 80).forEach((o) => { const g = o.c || ''; (groups[g] = groups[g] || []).push(o); });
    const exact = lib.some((o) => o.l.toLowerCase() === ql);
    const custom = allowCustom && ql && !exact && !selected.some((s) => s.toLowerCase() === ql) ? `<div><button type="button" class="chip chip-sm" data-act="w-tag-add" data-t="${esc(q.trim())}">${icon('plus')}Add “${esc(q.trim())}” as a new tag</button><p class="tiny muted" style="margin-top:6px">New tags are reviewed by the team and added to the library.</p></div>` : '';
    const body = Object.keys(groups).map((c) => `<div class="tagpick-group">${c ? `<span class="label">${esc(RN.fields.catLabel(c))}</span>` : ''}<div class="chipset">${groups[c].map((o) => `<button type="button" class="chip" data-act="w-tag-add" data-t="${esc(o.v)}" title="${esc(o.d || o.g || '')}">${icon('plus')}${esc(o.l)}</button>`).join('')}</div></div>`).join('');
    const remaining = Math.max(0, lib.length - selected.length - pool.slice(0, 80).length);
    return custom + (body || (ql ? '' : '<p class="small muted">All tags added.</p>')) + (!ql && remaining ? `<p class="tiny muted">${RN.fmt.int(remaining)} more in the library. Search to find them.</p>` : '');
  }
  function syncPicker(box, vals) {
    const input = box.querySelector('input[type=hidden]');
    input.value = vals.join('|');
    box.querySelector('.tagpick-sel').innerHTML = vals.map((t) => tagChip(t, box.dataset.src)).join('');
    const max = box.dataset.max;
    box.querySelector('[data-count]').textContent = `${vals.length}${max ? ' of ' + max : ''} selected`;
    box.querySelector('.tagpick-list').innerHTML = tagList(vals, box.querySelector('input[type=search]').value, box.dataset.cat, box.dataset.src, !!box.dataset.custom);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const pickerVals = (box) => { const v = box.querySelector('input[type=hidden]').value; return v ? v.split('|') : []; };
  RN.actions['w-tag-add'] = (el) => {
    const box = el.closest('[data-tagpick]');
    const vals = pickerVals(box);
    const max = +box.dataset.max || 0;
    if (max && vals.length >= max) { RN.ui.toast(`Pick up to ${max}. Remove one to add another.`, { icon: 'info' }); return; }
    if (!vals.includes(el.dataset.t)) vals.push(el.dataset.t);
    box.querySelector('input[type=search]').value = '';
    syncPicker(box, vals);
    box.querySelector('input[type=search]').focus();
  };
  RN.actions['w-tag-remove'] = (el) => {
    const box = el.closest('[data-tagpick]');
    syncPicker(box, pickerVals(box).filter((t) => t !== el.dataset.t));
    const s = box.querySelector('input[type=search]'); if (s) s.focus(); // keep focus in the picker
  };
  RN.inputs['w-tag-search'] = (el) => {
    const box = el.closest('[data-tagpick]');
    box.querySelector('.tagpick-list').innerHTML = tagList(pickerVals(box), el.value, box.dataset.cat, box.dataset.src, !!box.dataset.custom);
  };
})();
