/* ---------------- STATE ---------------- */
let state = {
  dbName: 'product_management',
  tables: [
    { name:'categories', columns:[
        { name:'id', type:'INT', pk:true, fk:null, notNull:true, unique:false, ai:true },
        { name:'user_id', type:'INT', pk:false, fk:null, notNull:false, unique:false, ai:false },
        { name:'name', type:'VARCHAR(255)', pk:false, fk:null, notNull:true, unique:false, ai:false }
      ], rows:[
        { id:1, user_id:1, name:'Electronics' },
        { id:2, user_id:1, name:'Home & Kitchen' }
      ]},
    { name:'products', columns:[
        { name:'id', type:'INT', pk:true, fk:null, notNull:true, unique:false, ai:true },
        { name:'category_id', type:'INT', pk:false, fk:{table:'categories', column:'id'}, notNull:true, unique:false, ai:false },
        { name:'user_id', type:'INT', pk:false, fk:null, notNull:false, unique:false, ai:false },
        { name:'name', type:'VARCHAR(255)', pk:false, fk:null, notNull:true, unique:false, ai:false },
        { name:'name_ar', type:'VARCHAR(255)', pk:false, fk:null, notNull:false, unique:false, ai:false },
        { name:'other_names', type:'TEXT', pk:false, fk:null, notNull:false, unique:false, ai:false },
        { name:'description', type:'TEXT', pk:false, fk:null, notNull:false, unique:false, ai:false },
        { name:'post', type:'TEXT', pk:false, fk:null, notNull:false, unique:false, ai:false },
        { name:'price', type:'DECIMAL(10,2)', pk:false, fk:null, notNull:false, unique:false, ai:false },
        { name:'quantity', type:'INT', pk:false, fk:null, notNull:false, unique:false, ai:false },
        { name:'image', type:'VARCHAR(500)', pk:false, fk:null, notNull:false, unique:false, ai:false },
        { name:'status', type:"ENUM('available','out_of_stock')", pk:false, fk:null, notNull:false, unique:false, ai:false },
        { name:'created_at', type:'TIMESTAMP', pk:false, fk:null, notNull:false, unique:false, ai:false },
        { name:'updated_at', type:'TIMESTAMP', pk:false, fk:null, notNull:false, unique:false, ai:false }
      ], rows:[
        { id:1, category_id:1, user_id:1, name:'Wireless Mouse', name_ar:'', other_names:'', description:'', post:'', price:'19.99', quantity:120, image:'', status:'available', created_at:'', updated_at:'' }
      ]}
  ],
  history: [],
  privileges: [ { user:'admin@localhost', grants:'ALL PRIVILEGES' } ],
  routines: [],
  events: [],
  triggers: []
};

let viewMode = 'tables';
let relVisible = true;
let dragState = null;
let modalCallback = null;
let columnModalCtx = null; // { tableIdx, colIdx (or -1 for new) }
let rowModalCtx = null;    // { tableIdx, rowIdx (or -1 for new) }
let dataPanelOpen = {};    // tableIdx -> bool
let searchTerm = '';

const STORAGE_KEY = 'db_designer_state_v1';

function log(action){
  state.history.unshift({ time:new Date().toLocaleTimeString(), action });
  if (state.history.length > 200) state.history.pop();
}

function save(){
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e){}
}

function loadSaved(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.tables) state = parsed;
    }
  } catch(e){}
}

/* ---------------- VIEW ROUTER ---------------- */
function setView(v){
  viewMode = v;
  document.querySelectorAll('.structure-item[data-view]').forEach(el=>{
    el.classList.toggle('active', el.dataset.view === v);
  });
  renderView();
}

function renderView(){
  const titleMap = {
    tables:'<i class="fas fa-project-diagram"></i> Diagram',
    search:'<i class="fas fa-search"></i> Search',
    query:'<i class="fas fa-terminal"></i> Query',
    operations:'<i class="fas fa-cogs"></i> Operations',
    privileges:'<i class="fas fa-user-lock"></i> Privileges',
    routines:'<i class="fas fa-code-branch"></i> Routines',
    events:'<i class="fas fa-clock"></i> Events',
    triggers:'<i class="fas fa-bolt"></i> Triggers',
    history:'<i class="fas fa-history"></i> History'
  };
  document.getElementById('viewTitle').innerHTML = (titleMap[viewMode]||'') + ' · <span id="diagramDbName">'+state.dbName+'</span>';

  const c = document.getElementById('viewContainer');
  c.innerHTML = '';
  if (viewMode === 'tables') return renderTablesView(c);
  if (viewMode === 'search') return renderSearchView(c);
  if (viewMode === 'query') return renderQueryView(c);
  if (viewMode === 'operations') return renderOperationsView(c);
  if (viewMode === 'privileges') return renderPrivilegesView(c);
  if (viewMode === 'routines') return renderRoutinesView(c);
  if (viewMode === 'events') return renderEventsView(c);
  if (viewMode === 'triggers') return renderTriggersView(c);
  if (viewMode === 'history') return renderHistoryView(c);
}

/* ---------------- TABLES + DIAGRAM VIEW ---------------- */
function renderTablesView(container){
  const wrap = document.createElement('div');
  wrap.className = 'tables-wrap';
  wrap.innerHTML = `<svg id="relSvg"></svg><div class="tables-container" id="tablesContainer"></div>`;
  container.appendChild(wrap);
  renderTableCards();
  requestAnimationFrame(drawRelationships);
}

function renderTableCards(){
  const tc = document.getElementById('tablesContainer');
  if (!tc) return;
  tc.innerHTML = '';
  if (state.tables.length === 0) {
    tc.innerHTML = '<div class="empty-state"><i class="fas fa-inbox" style="font-size:2rem;display:block;margin-bottom:0.5rem;"></i>No tables yet. Click "New Table" to create one.</div>';
    document.getElementById('currentDbDisplay').textContent = state.dbName;
    return;
  }
  state.tables.forEach((table, tableIdx) => {
    const card = document.createElement('div');
    card.className = 'table-card';
    card.draggable = true;
    card.dataset.index = tableIdx;
    card.dataset.table = table.name;

    card.addEventListener('dragstart', e => { dragState = { index: tableIdx }; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); drawRelationships(); });
    card.addEventListener('drag', () => drawRelationships());
    card.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    card.addEventListener('drop', e => {
      e.preventDefault();
      if (dragState && dragState.index !== tableIdx) {
        const [removed] = state.tables.splice(dragState.index, 1);
        state.tables.splice(tableIdx, 0, removed);
        log(`Table "${removed.name}" reordered`);
        renderTableCards();
        drawRelationships();
        save();
      }
      dragState = null;
    });

    const header = document.createElement('div');
    header.className = 'table-header';
    header.innerHTML = `
      <div class="table-name"><i class="fas fa-table"></i> ${table.name}</div>
      <div class="table-actions">
        <button onclick="event.stopPropagation();toggleDataPanel(${tableIdx})" title="View Data"><i class="fas fa-list"></i></button>
        <button onclick="event.stopPropagation();renameTable(${tableIdx})" title="Rename"><i class="fas fa-pen"></i></button>
        <button class="del" onclick="event.stopPropagation();deleteTable(${tableIdx})" title="Delete"><i class="fas fa-trash"></i></button>
      </div>`;
    card.appendChild(header);

    const colList = document.createElement('div');
    colList.className = 'column-list';
    table.columns.forEach((col, colIdx) => {
      const item = document.createElement('div');
      item.className = 'column-item';
      item.dataset.col = col.name;
      let badges = '';
      if (col.pk) badges += '<span class="badge pk">PK</span>';
      if (col.fk) badges += `<span class="badge fk" title="→ ${col.fk.table}.${col.fk.column}">FK</span>`;
      if (col.ai) badges += '<span class="badge ai">AI</span>';
      if (col.notNull) badges += '<span class="badge nn">NN</span>';
      if (col.unique) badges += '<span class="badge uq">UQ</span>';
      item.innerHTML = `
        <i class="fas fa-grip-vertical" style="color:var(--muted);"></i>
        <span class="col-name">${col.name}</span>
        <span class="col-type">${col.type}</span>
        ${badges}
        <div class="col-actions">
          <button onclick="editColumn(${tableIdx}, ${colIdx})" title="Edit"><i class="fas fa-edit"></i></button>
          <button onclick="deleteColumn(${tableIdx}, ${colIdx})" title="Delete"><i class="fas fa-times"></i></button>
        </div>`;
      colList.appendChild(item);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'add-column-btn';
    addBtn.innerHTML = '<i class="fas fa-plus"></i> Add Column';
    addBtn.onclick = () => addColumn(tableIdx);
    colList.appendChild(addBtn);
    card.appendChild(colList);

    if (dataPanelOpen[tableIdx]) {
      card.appendChild(buildDataPanel(tableIdx));
    }

    tc.appendChild(card);
  });
  document.getElementById('currentDbDisplay').textContent = state.dbName;
}

function drawRelationships(){
  const svg = document.getElementById('relSvg');
  const wrap = document.querySelector('.tables-wrap');
  if (!svg || !wrap) return;
  svg.innerHTML = `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#5b8fc9"/></marker></defs>`;
  if (!relVisible) return;
  const wrapRect = wrap.getBoundingClientRect();

  state.tables.forEach((table, tableIdx) => {
    table.columns.forEach(col => {
      if (!col.fk) return;
      const fromEl = document.querySelector(`.table-card[data-index="${tableIdx}"] .column-item[data-col="${col.name}"]`);
      const targetTableIdx = state.tables.findIndex(t => t.name === col.fk.table);
      if (targetTableIdx === -1 || !fromEl) return;
      const toEl = document.querySelector(`.table-card[data-index="${targetTableIdx}"] .column-item[data-col="${col.fk.column}"]`);
      if (!toEl) return;
      const fr = fromEl.getBoundingClientRect(), tr = toEl.getBoundingClientRect();
      const x1 = fr.left - wrapRect.left, y1 = fr.top - wrapRect.top + fr.height/2;
      const x2 = tr.left - wrapRect.left, y2 = tr.top - wrapRect.top + tr.height/2;
      const startX = x1 < x2 ? x1 + fr.width : x1;
      const endX = x1 < x2 ? x2 : x2 + tr.width;
      const midX = (startX + endX) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d', `M${startX},${y1} C${midX},${y1} ${midX},${y2} ${endX},${y2}`);
      path.setAttribute('stroke', '#5b8fc9');
      path.setAttribute('stroke-width', '1.6');
      path.setAttribute('fill', 'none');
      path.setAttribute('marker-end', 'url(#arrow)');
      path.setAttribute('opacity', '0.8');
      svg.appendChild(path);
    });
  });
}

function toggleRelationships(){
  relVisible = !relVisible;
  document.getElementById('relToggleBtn').classList.toggle('active', relVisible);
  drawRelationships();
}

window.addEventListener('resize', () => { if (viewMode==='tables') drawRelationships(); });

/* ---------------- SEARCH VIEW ---------------- */
function renderSearchView(container){
  const div = document.createElement('div');
  div.className = 'view-panel';
  div.innerHTML = `
    <input type="text" class="search-box" id="searchBox" placeholder="Search tables or columns…" value="${searchTerm}">
    <div class="search-results-summary" id="searchSummary"></div>
    <div id="searchResults"></div>`;
  container.appendChild(div);
  const box = document.getElementById('searchBox');
  box.addEventListener('input', () => { searchTerm = box.value; runSearch(); });
  box.focus();
  runSearch();
}

function runSearch(){
  const term = (searchTerm||'').trim().toLowerCase();
  const results = document.getElementById('searchResults');
  const summary = document.getElementById('searchSummary');
  if (!results) return;
  results.innerHTML = '';
  let tableMatches = 0, colMatches = 0;
  state.tables.forEach(table => {
    const tMatch = !term || table.name.toLowerCase().includes(term);
    const matchingCols = table.columns.filter(c => !term || c.name.toLowerCase().includes(term) || c.type.toLowerCase().includes(term));
    if (!term || tMatch || matchingCols.length) {
      if (tMatch) tableMatches++;
      colMatches += matchingCols.length;
      const box = document.createElement('div');
      box.style.cssText = 'border:1px solid var(--line);border-radius:16px;padding:0.8rem 1.2rem;margin-bottom:0.8rem;background:var(--card2);';
      const colsToShow = term ? (matchingCols.length ? matchingCols : table.columns) : table.columns;
      box.innerHTML = `<div style="font-weight:700;color:var(--text);margin-bottom:0.4rem;"><i class="fas fa-table" style="color:var(--gold);"></i> ${table.name}</div>` +
        colsToShow.map(c => `<div style="font-size:0.82rem;color:${(term && (c.name.toLowerCase().includes(term)||c.type.toLowerCase().includes(term))) ? 'var(--gold2);font-weight:700;background:rgba(212,175,55,.15);border-radius:8px;padding:2px 6px;display:inline-block;margin:2px 4px 2px 0;' : 'var(--muted);padding:2px 4px;'}">${c.name} <span style="color:var(--muted);">(${c.type})</span></div>`).join('');
      results.appendChild(box);
    }
  });
  summary.textContent = term ? `${tableMatches} table(s), ${colMatches} column(s) matched "${term}"` : `${state.tables.length} table(s) total — type to search`;
  if (!results.innerHTML) results.innerHTML = '<div class="empty-state">No matches found.</div>';
}

/* ---------------- QUERY VIEW ---------------- */
function renderQueryView(container){
  const div = document.createElement('div');
  div.className = 'view-panel';
  div.innerHTML = `
    <div class="desc">Run lightweight SQL-style commands against your schema. Supported: <code>SHOW TABLES</code>, <code>DESCRIBE table</code>, <code>SELECT * FROM table</code>, <code>SELECT cols FROM table</code>, <code>DROP TABLE table</code>, <code>CREATE DATABASE name</code>.</div>
    <div class="console-input" style="margin-bottom:1rem;max-width:600px;">
      <i class="fas fa-chevron-right"></i>
      <input type="text" id="queryBoxInput" placeholder="SELECT * FROM products;" onkeydown="if(event.key==='Enter') runQueryBox()">
    </div>
    <button class="pill-btn" onclick="runQueryBox()"><i class="fas fa-play"></i> Run</button>
    <div class="console-output" id="queryBoxOutput" style="margin-top:1rem;max-height:300px;">Run a query to see results here.</div>`;
  container.appendChild(div);
}

function runQueryBox(){
  const input = document.getElementById('queryBoxInput');
  const out = document.getElementById('queryBoxOutput');
  const cmd = input.value.trim();
  if (!cmd) return;
  out.textContent = executeCommand(cmd);
  document.getElementById('consoleInput').value = cmd;
  log(`Query: ${cmd}`);
}

/* ---------------- OPERATIONS VIEW ---------------- */
function renderOperationsView(container){
  const div = document.createElement('div');
  div.className = 'view-panel';
  const opts = state.tables.map((t,i)=>`<option value="${i}">${t.name}</option>`).join('');
  div.innerHTML = `
    <div class="desc">Quick maintenance operations on a selected table.</div>
    <div class="field-row" style="max-width:500px;margin-bottom:1rem;">
      <div><span class="field-label">Table</span><select id="opsTableSelect">${opts || '<option>No tables</option>'}</select></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button class="pill-btn" onclick="opEmptyTable()"><i class="fas fa-eraser"></i> Empty Table (truncate rows)</button>
      <button class="pill-btn" onclick="opCopyTable()"><i class="fas fa-copy"></i> Copy Table Structure</button>
      <button class="pill-btn" onclick="opCopyTableWithData()"><i class="fas fa-clone"></i> Duplicate With Data</button>
    </div>`;
  container.appendChild(div);
}
function getOpsTableIdx(){ return parseInt(document.getElementById('opsTableSelect').value, 10); }
function opEmptyTable(){
  const idx = getOpsTableIdx(); if (isNaN(idx)) return;
  state.tables[idx].rows = [];
  log(`Table "${state.tables[idx].name}" emptied`);
  save(); renderView();
}
function opCopyTable(){
  const idx = getOpsTableIdx(); if (isNaN(idx)) return;
  const src = state.tables[idx];
  const name = uniqueTableName(src.name + '_copy');
  state.tables.push({ name, columns: JSON.parse(JSON.stringify(src.columns)), rows: [] });
  log(`Structure of "${src.name}" copied to "${name}"`);
  save(); renderView();
}
function opCopyTableWithData(){
  const idx = getOpsTableIdx(); if (isNaN(idx)) return;
  const src = state.tables[idx];
  const name = uniqueTableName(src.name + '_copy');
  state.tables.push({ name, columns: JSON.parse(JSON.stringify(src.columns)), rows: JSON.parse(JSON.stringify(src.rows)) });
  log(`Table "${src.name}" duplicated with data as "${name}"`);
  save(); renderView();
}
function uniqueTableName(base){
  let name = base, n = 1;
  while (state.tables.find(t=>t.name===name)) { name = base + n; n++; }
  return name;
}

/* ---------------- PRIVILEGES VIEW ---------------- */
function renderPrivilegesView(container){
  const div = document.createElement('div');
  div.className = 'view-panel';
  div.innerHTML = `
    <div class="desc">Manage user grants for this database (in-memory demo).</div>
    <ul class="generic-list" id="privList"></ul>
    <button class="pill-btn" onclick="addPrivilege()"><i class="fas fa-plus"></i> Add User Grant</button>`;
  container.appendChild(div);
  const list = document.getElementById('privList');
  state.privileges.forEach((p, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<div><i class="fas fa-user-shield" style="color:var(--gold);margin-right:8px;"></i>${p.user} <span class="meta">— ${p.grants}</span></div>
      <button onclick="removePrivilege(${i})" style="background:none;border:none;color:var(--danger);cursor:pointer;"><i class="fas fa-trash"></i></button>`;
    list.appendChild(li);
  });
}
function addPrivilege(){
  showTextModal('Add Grant', 'user@host', user => {
    if (!user || !user.trim()) return;
    showTextModal('Grants', 'e.g. SELECT, INSERT, UPDATE', grants => {
      state.privileges.push({ user: user.trim(), grants: (grants||'ALL PRIVILEGES').trim() });
      log(`Granted "${grants||'ALL PRIVILEGES'}" to ${user.trim()}`);
      save(); renderView();
    });
  });
}
function removePrivilege(i){
  const p = state.privileges[i];
  state.privileges.splice(i,1);
  log(`Revoked grants from ${p.user}`);
  save(); renderView();
}

/* ---------------- ROUTINES VIEW ---------------- */
function renderRoutinesView(container){
  const div = document.createElement('div');
  div.className = 'view-panel';
  div.innerHTML = `
    <div class="desc">Stored procedures / functions attached to this database.</div>
    <ul class="generic-list" id="routineList"></ul>
    <button class="pill-btn" onclick="addRoutine()"><i class="fas fa-plus"></i> Add Routine</button>`;
  container.appendChild(div);
  const list = document.getElementById('routineList');
  if (!state.routines.length) list.innerHTML = '<div class="empty-state">No routines defined.</div>';
  state.routines.forEach((r,i) => {
    const li = document.createElement('li');
    li.innerHTML = `<div><i class="fas fa-code-branch" style="color:var(--gold);margin-right:8px;"></i>${r.name} <span class="meta">— ${r.type}</span></div>
      <button onclick="removeRoutine(${i})" style="background:none;border:none;color:var(--danger);cursor:pointer;"><i class="fas fa-trash"></i></button>`;
    list.appendChild(li);
  });
}
function addRoutine(){
  showTextModal('Routine Name', 'e.g. get_low_stock_products', name => {
    if (!name || !name.trim()) return;
    showTextModal('Routine Type', 'PROCEDURE or FUNCTION', type => {
      state.routines.push({ name:name.trim(), type:(type||'PROCEDURE').trim().toUpperCase() });
      log(`Routine "${name.trim()}" created`);
      save(); renderView();
    });
  });
}
function removeRoutine(i){
  const r = state.routines[i];
  state.routines.splice(i,1);
  log(`Routine "${r.name}" dropped`);
  save(); renderView();
}

/* ---------------- EVENTS VIEW ---------------- */
function renderEventsView(container){
  const div = document.createElement('div');
  div.className = 'view-panel';
  div.innerHTML = `
    <div class="desc">Scheduled events for this database.</div>
    <ul class="generic-list" id="eventList"></ul>
    <button class="pill-btn" onclick="addEvent()"><i class="fas fa-plus"></i> Add Event</button>`;
  container.appendChild(div);
  const list = document.getElementById('eventList');
  if (!state.events.length) list.innerHTML = '<div class="empty-state">No scheduled events.</div>';
  state.events.forEach((ev,i) => {
    const li = document.createElement('li');
    li.innerHTML = `<div><i class="fas fa-clock" style="color:var(--gold);margin-right:8px;"></i>${ev.name} <span class="meta">— every ${ev.interval}</span></div>
      <button onclick="removeEvent(${i})" style="background:none;border:none;color:var(--danger);cursor:pointer;"><i class="fas fa-trash"></i></button>`;
    list.appendChild(li);
  });
}
function addEvent(){
  showTextModal('Event Name', 'e.g. cleanup_expired_carts', name => {
    if (!name || !name.trim()) return;
    showTextModal('Interval', 'e.g. 1 DAY', interval => {
      state.events.push({ name:name.trim(), interval:(interval||'1 DAY').trim() });
      log(`Event "${name.trim()}" scheduled`);
      save(); renderView();
    });
  });
}
function removeEvent(i){
  const ev = state.events[i];
  state.events.splice(i,1);
  log(`Event "${ev.name}" removed`);
  save(); renderView();
}

/* ---------------- TRIGGERS VIEW ---------------- */
function renderTriggersView(container){
  const div = document.createElement('div');
  div.className = 'view-panel';
  div.innerHTML = `
    <div class="desc">Triggers attached to tables in this database.</div>
    <ul class="generic-list" id="triggerList"></ul>
    <button class="pill-btn" onclick="addTrigger()"><i class="fas fa-plus"></i> Add Trigger</button>`;
  container.appendChild(div);
  const list = document.getElementById('triggerList');
  if (!state.triggers.length) list.innerHTML = '<div class="empty-state">No triggers defined.</div>';
  state.triggers.forEach((tr,i) => {
    const li = document.createElement('li');
    li.innerHTML = `<div><i class="fas fa-bolt" style="color:var(--gold);margin-right:8px;"></i>${tr.name} <span class="meta">— ${tr.timing} ${tr.event} ON ${tr.table}</span></div>
      <button onclick="removeTrigger(${i})" style="background:none;border:none;color:var(--danger);cursor:pointer;"><i class="fas fa-trash"></i></button>`;
    list.appendChild(li);
  });
}
function addTrigger(){
  if (!state.tables.length) { alert('Create a table first.'); return; }
  showTextModal('Trigger Name', 'e.g. trg_update_timestamp', name => {
    if (!name || !name.trim()) return;
    const table = state.tables[0].name;
    state.triggers.push({ name:name.trim(), timing:'BEFORE', event:'UPDATE', table });
    log(`Trigger "${name.trim()}" created on ${table}`);
    save(); renderView();
  });
}
function removeTrigger(i){
  const tr = state.triggers[i];
  state.triggers.splice(i,1);
  log(`Trigger "${tr.name}" dropped`);
  save(); renderView();
}

/* ---------------- HISTORY VIEW ---------------- */
function renderHistoryView(container){
  const div = document.createElement('div');
  div.className = 'view-panel';
  div.innerHTML = `<div class="desc">Action log for this session.</div><ul class="generic-list" id="histList"></ul>`;
  container.appendChild(div);
  const list = document.getElementById('histList');
  if (!state.history.length) { list.innerHTML = '<div class="empty-state">No actions yet.</div>'; return; }
  state.history.forEach(h => {
    const li = document.createElement('li');
    li.innerHTML = `<div>${h.action}</div><span class="meta">${h.time}</span>`;
    list.appendChild(li);
  });
}

/* ---------------- DATABASE / TABLE ACTIONS ---------------- */
function createDatabase(){
  showTextModal('Create Database', 'Enter database name:', val => {
    if (val && val.trim()) {
      state.dbName = val.trim();
      state.tables = [];
      log(`Database "${state.dbName}" created`);
      save(); renderView();
    }
  });
}
function renameDatabase(){
  showTextModal('Rename Database', 'New database name:', val => {
    if (val && val.trim()) {
      const old = state.dbName;
      state.dbName = val.trim();
      log(`Database renamed from "${old}" to "${state.dbName}"`);
      save(); renderView();
    }
  });
}
function deleteDatabase(){
  if (confirm(`Drop database "${state.dbName}"? This deletes all tables.`)) {
    log(`Database "${state.dbName}" dropped`);
    state.tables = [];
    save(); renderView();
  }
}
function createTable(){
  showTextModal('Create Table', 'Enter table name:', val => {
    if (val && val.trim()) {
      const name = val.trim();
      if (state.tables.find(t => t.name === name)) { alert(`Table "${name}" already exists.`); return; }
      state.tables.push({ name, columns:[], rows:[] });
      log(`Table "${name}" created`);
      save(); setView('tables');
    }
  });
}
function renameTable(idx){
  const table = state.tables[idx];
  showTextModal('Rename Table', 'New table name:', val => {
    if (val && val.trim()) {
      const newName = val.trim();
      if (state.tables.find(t => t.name === newName && t !== table)) { alert(`Table "${newName}" already exists.`); return; }
      const old = table.name;
      state.tables.forEach(t => t.columns.forEach(c => { if (c.fk && c.fk.table === old) c.fk.table = newName; }));
      table.name = newName;
      log(`Table renamed from "${old}" to "${newName}"`);
      save(); renderTableCards(); drawRelationships();
    }
  });
}
function deleteTable(idx){
  const t = state.tables[idx];
  if (confirm(`Delete table "${t.name}"?`)) {
    state.tables.forEach(other => { other.columns.forEach(c => { if (c.fk && c.fk.table === t.name) c.fk = null; }); });
    state.tables.splice(idx,1);
    log(`Table "${t.name}" deleted`);
    save(); renderTableCards(); drawRelationships();
  }
}

/* ---------------- COLUMN MODAL ---------------- */
const COMMON_TYPES = ['INT','BIGINT','VARCHAR(255)','TEXT','DECIMAL(10,2)','FLOAT','BOOLEAN','DATE','DATETIME','TIMESTAMP','JSON',"ENUM('a','b')"];

function addColumn(tableIdx){
  columnModalCtx = { tableIdx, colIdx: -1 };
  document.getElementById('columnModalTitle').innerHTML = '<i class="fas fa-columns"></i> Add Column';
  document.getElementById('colNameInput').value = '';
  setColTypeSelect('VARCHAR(255)');
  document.getElementById('colPk').checked = false;
  document.getElementById('colNotNull').checked = false;
  document.getElementById('colUnique').checked = false;
  document.getElementById('colAi').checked = false;
  document.getElementById('colFkToggle').checked = false;
  toggleFkFields();
  populateFkTableOptions(tableIdx);
  document.getElementById('columnModalOverlay').classList.add('show');
  document.getElementById('colNameInput').focus();
}
function editColumn(tableIdx, colIdx){
  columnModalCtx = { tableIdx, colIdx };
  const col = state.tables[tableIdx].columns[colIdx];
  document.getElementById('columnModalTitle').innerHTML = '<i class="fas fa-columns"></i> Edit Column';
  document.getElementById('colNameInput').value = col.name;
  setColTypeSelect(col.type);
  document.getElementById('colPk').checked = !!col.pk;
  document.getElementById('colNotNull').checked = !!col.notNull;
  document.getElementById('colUnique').checked = !!col.unique;
  document.getElementById('colAi').checked = !!col.ai;
  document.getElementById('colFkToggle').checked = !!col.fk;
  toggleFkFields();
  populateFkTableOptions(tableIdx);
  if (col.fk) {
    document.getElementById('fkTableSelect').value = col.fk.table;
    populateFkColumnOptions();
    document.getElementById('fkColumnSelect').value = col.fk.column;
  }
  document.getElementById('columnModalOverlay').classList.add('show');
  document.getElementById('colNameInput').focus();
}
function setColTypeSelect(type){
  const sel = document.getElementById('colTypeSelect');
  const custom = document.getElementById('colTypeCustom');
  if (COMMON_TYPES.includes(type)) {
    sel.value = type; custom.style.display = 'none'; custom.value = '';
  } else {
    sel.value = '__custom'; custom.style.display = 'block'; custom.value = type;
  }
}
function onColTypeChange(){
  const sel = document.getElementById('colTypeSelect');
  document.getElementById('colTypeCustom').style.display = (sel.value === '__custom') ? 'block' : 'none';
}
function toggleFkFields(){
  document.getElementById('fkFields').style.display = document.getElementById('colFkToggle').checked ? 'block' : 'none';
}
function populateFkTableOptions(currentTableIdx){
  const sel = document.getElementById('fkTableSelect');
  sel.innerHTML = '';
  state.tables.forEach((t, i) => {
    if (i === currentTableIdx) return;
    const hasPk = t.columns.some(c => c.pk);
    if (!hasPk) return;
    const opt = document.createElement('option');
    opt.value = t.name; opt.textContent = t.name;
    sel.appendChild(opt);
  });
  populateFkColumnOptions();
}
function populateFkColumnOptions(){
  const tableName = document.getElementById('fkTableSelect').value;
  const colSel = document.getElementById('fkColumnSelect');
  colSel.innerHTML = '';
  const t = state.tables.find(x => x.name === tableName);
  if (!t) return;
  t.columns.filter(c => c.pk).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name; opt.textContent = c.name;
    colSel.appendChild(opt);
  });
}
function closeColumnModal(){
  document.getElementById('columnModalOverlay').classList.remove('show');
  columnModalCtx = null;
}
function submitColumnModal(){
  const name = document.getElementById('colNameInput').value.trim();
  if (!name) { alert('Column name is required.'); return; }
  const typeSel = document.getElementById('colTypeSelect').value;
  const type = typeSel === '__custom' ? (document.getElementById('colTypeCustom').value.trim() || 'VARCHAR(255)') : typeSel;
  const pk = document.getElementById('colPk').checked;
  const notNull = document.getElementById('colNotNull').checked;
  const unique = document.getElementById('colUnique').checked;
  const ai = document.getElementById('colAi').checked;
  const isFk = document.getElementById('colFkToggle').checked;
  let fk = null;
  if (isFk) {
    const ft = document.getElementById('fkTableSelect').value;
    const fc = document.getElementById('fkColumnSelect').value;
    if (ft && fc) fk = { table: ft, column: fc };
  }
  const { tableIdx, colIdx } = columnModalCtx;
  const table = state.tables[tableIdx];
  const dup = table.columns.find((c, i) => c.name === name && i !== colIdx);
  if (dup) { alert(`Column "${name}" already exists in this table.`); return; }
  const newCol = { name, type, pk, fk, notNull, unique, ai };
  if (colIdx === -1) {
    table.columns.push(newCol);
    log(`Column "${name}" added to "${table.name}"`);
  } else {
    table.columns[colIdx] = newCol;
    log(`Column "${name}" updated on "${table.name}"`);
  }
  closeColumnModal();
  save(); renderTableCards(); drawRelationships();
}
function deleteColumn(tableIdx, colIdx){
  const table = state.tables[tableIdx];
  const col = table.columns[colIdx];
  if (confirm(`Delete column "${col.name}" from "${table.name}"?`)) {
    table.columns.splice(colIdx,1);
    log(`Column "${col.name}" deleted from "${table.name}"`);
    save(); renderTableCards(); drawRelationships();
  }
}

/* ---------------- DATA (ROWS) PANEL ---------------- */
function toggleDataPanel(tableIdx){
  dataPanelOpen[tableIdx] = !dataPanelOpen[tableIdx];
  renderTableCards();
  drawRelationships();
}
function buildDataPanel(tableIdx){
  const table = state.tables[tableIdx];
  const panel = document.createElement('div');
  panel.className = 'data-panel';
  if (!table.columns.length) {
    panel.innerHTML = '<div style="font-size:0.75rem;color:var(--muted);padding:0.4rem;">Add columns before entering data.</div>';
    return panel;
  }
  const tbl = document.createElement('table');
  tbl.className = 'data-table';
  const thead = document.createElement('tr');
  table.columns.forEach(c => { const th = document.createElement('th'); th.textContent = c.name; thead.appendChild(th); });
  const thAction = document.createElement('th'); thAction.textContent = ''; thead.appendChild(thAction);
  tbl.appendChild(thead);
  (table.rows||[]).forEach((row, rowIdx) => {
    const tr = document.createElement('tr');
    table.columns.forEach(c => { const td = document.createElement('td'); td.textContent = (row[c.name] ?? ''); tr.appendChild(td); });
    const tdA = document.createElement('td');
    tdA.innerHTML = `<div class="data-row-actions">
      <button onclick="editRow(${tableIdx}, ${rowIdx})" title="Edit"><i class="fas fa-edit"></i></button>
      <button onclick="deleteRow(${tableIdx}, ${rowIdx})" title="Delete"><i class="fas fa-times"></i></button></div>`;
    tr.appendChild(tdA);
    tbl.appendChild(tr);
  });
  panel.appendChild(tbl);
  if (!table.rows || !table.rows.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:0.72rem;color:var(--muted);padding:0.3rem 0;';
    empty.textContent = 'No rows yet.';
    panel.appendChild(empty);
  }
  const addBtn = document.createElement('button');
  addBtn.className = 'add-row-btn';
  addBtn.innerHTML = '<i class="fas fa-plus"></i> Add Row';
  addBtn.onclick = () => addRow(tableIdx);
  panel.appendChild(addBtn);
  return panel;
}
function addRow(tableIdx){
  rowModalCtx = { tableIdx, rowIdx: -1 };
  openRowModal();
}
function editRow(tableIdx, rowIdx){
  rowModalCtx = { tableIdx, rowIdx };
  openRowModal();
}
function openRowModal(){
  const { tableIdx, rowIdx } = rowModalCtx;
  const table = state.tables[tableIdx];
  const existing = rowIdx === -1 ? {} : table.rows[rowIdx];
  document.getElementById('rowModalTitle').innerHTML = `<i class="fas fa-list"></i> ${rowIdx === -1 ? 'Add' : 'Edit'} Row · ${table.name}`;
  const fc = document.getElementById('rowFieldsContainer');
  fc.innerHTML = '';
  table.columns.forEach(col => {
    const label = document.createElement('span');
    label.className = 'field-label';
    label.textContent = col.name + (col.pk ? ' (PK)' : '') + (col.fk ? ` → ${col.fk.table}.${col.fk.column}` : '');
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'rowfield_' + col.name;
    input.value = existing[col.name] ?? '';
    input.placeholder = col.type;
    fc.appendChild(label);
    fc.appendChild(input);
  });
  document.getElementById('rowModalOverlay').classList.add('show');
}
function closeRowModal(){
  document.getElementById('rowModalOverlay').classList.remove('show');
  rowModalCtx = null;
}
function submitRowModal(){
  const { tableIdx, rowIdx } = rowModalCtx;
  const table = state.tables[tableIdx];
  const row = {};
  table.columns.forEach(col => { row[col.name] = document.getElementById('rowfield_' + col.name).value; });
  if (!table.rows) table.rows = [];
  if (rowIdx === -1) { table.rows.push(row); log(`Row inserted into "${table.name}"`); }
  else { table.rows[rowIdx] = row; log(`Row updated in "${table.name}"`); }
  closeRowModal();
  save(); renderTableCards(); drawRelationships();
}
function deleteRow(tableIdx, rowIdx){
  const table = state.tables[tableIdx];
  if (confirm('Delete this row?')) {
    table.rows.splice(rowIdx,1);
    log(`Row deleted from "${table.name}"`);
    save(); renderTableCards(); drawRelationships();
  }
}

/* ---------------- SIMPLE TEXT MODAL ---------------- */
function showTextModal(title, placeholder, callback){
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalInput').placeholder = placeholder;
  document.getElementById('modalInput').value = '';
  document.getElementById('modalOverlay').classList.add('show');
  modalCallback = callback;
  document.getElementById('modalInput').focus();
}
function closeModal(){ document.getElementById('modalOverlay').classList.remove('show'); modalCallback = null; }
function modalConfirm(){ const val = document.getElementById('modalInput').value; if (modalCallback) modalCallback(val); closeModal(); }
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
document.getElementById('modalInput').addEventListener('keydown', e => { if (e.key === 'Enter') modalConfirm(); if (e.key === 'Escape') closeModal(); });
function closeModalById(id){ document.getElementById(id).classList.remove('show'); }
[ 'columnModalOverlay','rowModalOverlay','exportModalOverlay','importModalOverlay' ].forEach(id => {
  document.getElementById(id).addEventListener('click', e => { if (e.target === e.currentTarget) closeModalById(id); });
});

/* ---------------- SQL EXPORT ---------------- */
function generateSQL(){
  let sql = `-- Export of database "${state.dbName}"\n-- Generated by Interactive Database Manager\n\n`;
  sql += `CREATE DATABASE IF NOT EXISTS \`${state.dbName}\`;\nUSE \`${state.dbName}\`;\n\n`;
  state.tables.forEach(table => {
    sql += `CREATE TABLE \`${table.name}\` (\n`;
    const lines = table.columns.map(col => {
      let l = `  \`${col.name}\` ${col.type}`;
      if (col.notNull || col.pk) l += ' NOT NULL';
      if (col.ai) l += ' AUTO_INCREMENT';
      if (col.unique) l += ' UNIQUE';
      return l;
    });
    const pkCols = table.columns.filter(c => c.pk).map(c => `\`${c.name}\``);
    if (pkCols.length) lines.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
    table.columns.filter(c => c.fk).forEach(c => {
      lines.push(`  FOREIGN KEY (\`${c.name}\`) REFERENCES \`${c.fk.table}\`(\`${c.fk.column}\`)`);
    });
    sql += lines.join(',\n');
    sql += `\n);\n\n`;
    if (table.rows && table.rows.length) {
      const cols = table.columns.map(c => `\`${c.name}\``).join(', ');
      table.rows.forEach(row => {
        const vals = table.columns.map(c => {
          const v = row[c.name];
          if (v === undefined || v === '') return 'NULL';
          if (/^-?\d+(\.\d+)?$/.test(String(v))) return v;
          return `'${String(v).replace(/'/g, "''")}'`;
        }).join(', ');
        sql += `INSERT INTO \`${table.name}\` (${cols}) VALUES (${vals});\n`;
      });
      sql += '\n';
    }
  });
  return sql;
}
function openExportModal(){
  document.getElementById('exportTextarea').value = generateSQL();
  document.getElementById('exportModalOverlay').classList.add('show');
  log('Schema exported to SQL');
}
function copyExport(){
  const ta = document.getElementById('exportTextarea');
  ta.select();
  document.execCommand ? document.execCommand('copy') : navigator.clipboard.writeText(ta.value);
  updateConsole('Export SQL copied to clipboard.');
}
function downloadExport(){
  const blob = new Blob([document.getElementById('exportTextarea').value], { type:'text/sql' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = state.dbName + '.sql';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------------- SQL IMPORT (simple CREATE TABLE parser) ---------------- */
function openImportModal(){
  document.getElementById('importTextarea').value = '';
  document.getElementById('importModalOverlay').classList.add('show');
}
function runImport(){
  const text = document.getElementById('importTextarea').value;
  const results = parseCreateTableStatements(text);
  if (!results.length) { alert('No valid CREATE TABLE statements found.'); return; }
  results.forEach(tbl => {
    const existingIdx = state.tables.findIndex(t => t.name === tbl.name);
    if (existingIdx !== -1) state.tables[existingIdx] = tbl; else state.tables.push(tbl);
    log(`Table "${tbl.name}" imported`);
  });
  save();
  closeModalById('importModalOverlay');
  setView('tables');
}
function parseCreateTableStatements(sql){
  const tables = [];
  const stmtRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\)\s*;/gi;
  let m;
  while ((m = stmtRegex.exec(sql)) !== null) {
    const tableName = m[1];
    const body = m[2];
    const parts = splitTopLevelCommas(body);
    const columns = [];
    const fkMap = {};
    parts.forEach(rawPart => {
      const part = rawPart.trim();
      if (!part) return;
      const upper = part.toUpperCase();
      if (upper.startsWith('PRIMARY KEY')) {
        const cols = (part.match(/\(([^)]+)\)/) || [,''])[1].split(',').map(s => s.trim().replace(/[`"']/g,''));
        cols.forEach(c => fkMap['__pk_' + c] = true);
        return;
      }
      if (upper.startsWith('FOREIGN KEY')) {
        const colMatch = part.match(/FOREIGN\s+KEY\s*\(([^)]+)\)/i);
        const refMatch = part.match(/REFERENCES\s+[`"']?(\w+)[`"']?\s*\(([^)]+)\)/i);
        if (colMatch && refMatch) {
          const col = colMatch[1].trim().replace(/[`"']/g,'');
          fkMap['__fk_' + col] = { table: refMatch[1], column: refMatch[2].trim().replace(/[`"']/g,'') };
        }
        return;
      }
      if (upper.startsWith('UNIQUE KEY') || upper.startsWith('KEY ') || upper.startsWith('INDEX') || upper.startsWith('CONSTRAINT')) return;
      const colMatch = part.match(/^[`"']?(\w+)[`"']?\s+([A-Za-z0-9_]+(?:\([^)]*\))?)/);
      if (!colMatch) return;
      const name = colMatch[1];
      const type = colMatch[2].toUpperCase();
      columns.push({
        name, type,
        pk: /PRIMARY\s+KEY/i.test(part),
        fk: null,
        notNull: /NOT\s+NULL/i.test(part),
        unique: /UNIQUE/i.test(part) && !/UNIQUE\s+KEY/i.test(part),
        ai: /AUTO_INCREMENT/i.test(part)
      });
    });
    columns.forEach(c => {
      if (fkMap['__pk_' + c.name]) c.pk = true;
      if (fkMap['__fk_' + c.name]) c.fk = fkMap['__fk_' + c.name];
    });
    tables.push({ name: tableName, columns, rows: [] });
  }
  return tables;
}
function splitTopLevelCommas(str){
  const parts = []; let depth = 0, current = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/* ---------------- CONSOLE / COMMAND ENGINE ---------------- */
function executeCommand(raw){
  const cmd = raw.trim().replace(/;$/, '');
  const upper = cmd.toUpperCase();

  if (/^SHOW\s+TABLES/i.test(cmd)) {
    return `Tables in ${state.dbName} (${state.tables.length}):\n` + (state.tables.map(t => '  - ' + t.name).join('\n') || '  (none)');
  }
  if (/^DESCRIBE\s+|^DESC\s+/i.test(cmd)) {
    const name = cmd.split(/\s+/)[1];
    const t = state.tables.find(x => x.name === name);
    if (!t) return `ERROR: Table "${name}" doesn't exist.`;
    return `Table: ${t.name}\n` + t.columns.map(c => {
      const flags = [c.pk && 'PK', c.fk && `FK→${c.fk.table}.${c.fk.column}`, c.notNull && 'NOT NULL', c.unique && 'UNIQUE', c.ai && 'AUTO_INCREMENT'].filter(Boolean).join(', ');
      return `  ${c.name.padEnd(16)} ${c.type.padEnd(22)} ${flags}`;
    }).join('\n');
  }
  if (/^SELECT\s+.+\s+FROM\s+/i.test(cmd)) {
    const m = cmd.match(/^SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
    if (!m) return 'ERROR: Could not parse SELECT statement.';
    const cols = m[1].trim();
    const tableName = m[2];
    const t = state.tables.find(x => x.name === tableName);
    if (!t) return `ERROR: Table "${tableName}" doesn't exist.`;
    const rows = t.rows || [];
    if (!rows.length) return `0 rows in "${tableName}".`;
    const useCols = cols === '*' ? t.columns.map(c => c.name) : cols.split(',').map(s => s.trim());
    const header = useCols.join(' | ');
    const body = rows.map(r => useCols.map(c => String(r[c] ?? '')).join(' | ')).join('\n');
    return `${header}\n${'-'.repeat(header.length)}\n${body}\n\n(${rows.length} row${rows.length===1?'':'s'})`;
  }
  if (/^DROP\s+TABLE\s+/i.test(cmd)) {
    const name = cmd.split(/\s+/)[2];
    const idx = state.tables.findIndex(t => t.name === name);
    if (idx === -1) return `ERROR: Table "${name}" doesn't exist.`;
    state.tables.splice(idx,1);
    log(`Table "${name}" dropped via console`);
    save(); renderView();
    return `Table "${name}" dropped.`;
  }
  if (/^CREATE\s+DATABASE\s+/i.test(cmd)) {
    const name = cmd.split(/\s+/)[2];
    state.dbName = name; state.tables = [];
    log(`Database "${name}" created via console`);
    save(); renderView();
    return `Database "${name}" created.`;
  }
  if (/^CREATE\s+TABLE/i.test(cmd)) {
    const parsed = parseCreateTableStatements(cmd + ';');
    if (!parsed.length) return 'ERROR: Could not parse CREATE TABLE statement.';
    parsed.forEach(tbl => {
      const existingIdx = state.tables.findIndex(t => t.name === tbl.name);
      if (existingIdx !== -1) state.tables[existingIdx] = tbl; else state.tables.push(tbl);
    });
    log(`Table created via console: ${parsed.map(t=>t.name).join(', ')}`);
    save(); renderView();
    return `Table(s) created: ${parsed.map(t=>t.name).join(', ')}`;
  }
  return `-- Unknown command. Try: SHOW TABLES / DESCRIBE table / SELECT * FROM table / DROP TABLE table / CREATE DATABASE name / CREATE TABLE ...`;
}
function runConsole(){
  const input = document.getElementById('consoleInput');
  const cmd = input.value.trim();
  if (!cmd) return;
  const result = executeCommand(cmd);
  updateConsole(`${cmd}\n→ ` + result.replace(/\n/g, '\n  '));
  log(`Console: ${cmd}`);
}
function updateConsole(msg){ document.getElementById('consoleOutput').textContent = msg; }

/* ================= UPGRADE LAYER ================= */
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const IDENT=/^[A-Za-z_][A-Za-z0-9_]*$/;
let confirmCb=null,undoStack=[],redoStack=[],animateCards=true,browse={ti:0,q:'',sort:null,dir:1};
function toast(msg,type='ok'){const t=document.createElement('div');t.className='toast '+type;t.innerHTML=`<i class="fas ${type==='error'?'fa-circle-exclamation':'fa-check'}"></i><span>${esc(msg)}</span>`;$('toasts').appendChild(t);setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),300)},2800);}
window.alert=m=>toast(m,'error');
function okName(n,what){if(IDENT.test(n))return true;toast(`${what} must start with a letter or _ and use only letters, digits and _`,'error');return false;}
function askConfirm(msg,fn){$('confirmMsg').textContent=msg;confirmCb=fn;$('confirmOverlay').classList.add('show');}
function log(a){state.history.unshift({time:new Date().toLocaleTimeString(),action:a});if(state.history.length>200)state.history.pop();if(!/^(Console|Query|Schema exported)/.test(a))toast(a);}
/* persistence + undo/redo */
const snap=()=>JSON.stringify(state);
function updateStats(){const r=state.tables.reduce((a,t)=>a+(t.rows||[]).length,0),c=state.tables.reduce((a,t)=>a+t.columns.length,0);$('stats').innerHTML=`<span><b>${state.tables.length}</b> tables</span><span><b>${c}</b> columns</span><span><b>${r}</b> rows</span>`;$('currentDbDisplay').textContent=state.dbName;}
function save(){const s=snap();try{localStorage.setItem(STORAGE_KEY,s);}catch(e){}if(undoStack[undoStack.length-1]!==s){undoStack.push(s);if(undoStack.length>60)undoStack.shift();redoStack=[];}updateStats();}
function restore(s){state=JSON.parse(s);try{localStorage.setItem(STORAGE_KEY,s);}catch(e){}renderView();updateStats();}
function undo(){if(undoStack.length<2)return toast('Nothing to undo','error');redoStack.push(undoStack.pop());restore(undoStack[undoStack.length-1]);}
function redo(){if(!redoStack.length)return toast('Nothing to redo','error');const s=redoStack.pop();undoStack.push(s);restore(s);}
function loadSaved(){try{const p=JSON.parse(localStorage.getItem(STORAGE_KEY));if(p&&Array.isArray(p.tables)){state=Object.assign(state,p);['privileges','routines','events','triggers','history'].forEach(k=>{if(!Array.isArray(state[k]))state[k]=[];});state.tables.forEach(t=>{t.columns=t.columns||[];t.rows=t.rows||[];});if(!IDENT.test(state.dbName||''))state.dbName='product_management';}}catch(e){}}
function refresh(){if(viewMode==='tables'){renderTableCards();drawRelationships();}else renderView();}
/* modals */
function showTextModal(title,ph,cb,init=''){$('modalTitle').textContent=title;const i=$('modalInput');i.placeholder=ph;i.value=init;modalCallback=cb;$('modalOverlay').classList.add('show');setTimeout(()=>{i.focus();i.select();},60);}
function closeModal(){$('modalOverlay').classList.remove('show');modalCallback=null;}
function modalConfirm(){const cb=modalCallback,v=$('modalInput').value;closeModal();if(cb)cb(v);}
/* database (single DB, renamable) */
function createDatabase(){renameDatabase();}
function renameDatabase(){showTextModal('Rename Database','Database name',v=>{v=v.trim();if(!okName(v,'Database name')||v===state.dbName)return;const o=state.dbName;state.dbName=v;log(`Database renamed from "${o}" to "${v}"`);save();renderView();},state.dbName);}
function deleteDatabase(){askConfirm(`Reset "${state.dbName}"? All tables and data will be removed (you can undo).`,()=>{state.tables=[];state.triggers=[];log(`Database "${state.dbName}" reset`);save();renderView();});}
/* tables */
function createTable(){showTextModal('Create Table','Table name',v=>{v=v.trim();if(!okName(v,'Table name'))return;if(state.tables.some(t=>t.name.toLowerCase()===v.toLowerCase()))return alert(`Table "${v}" already exists.`);state.tables.push({name:v,columns:[],rows:[]});log(`Table "${v}" created`);save();setView('tables');});}
function renameTable(i){const t=state.tables[i];showTextModal('Rename Table','New table name',v=>{v=v.trim();if(!okName(v,'Table name')||v===t.name)return;if(state.tables.some(x=>x!==t&&x.name.toLowerCase()===v.toLowerCase()))return alert(`Table "${v}" already exists.`);const o=t.name;state.tables.forEach(x=>x.columns.forEach(c=>{if(c.fk&&c.fk.table===o)c.fk.table=v;}));state.triggers.forEach(g=>{if(g.table===o)g.table=v;});t.name=v;log(`Table renamed from "${o}" to "${v}"`);save();refresh();},t.name);}
function deleteTable(i){const t=state.tables[i];askConfirm(`Delete table "${t.name}" and its ${(t.rows||[]).length} row(s)?`,()=>{state.tables.forEach(o=>o.columns.forEach(c=>{if(c.fk&&c.fk.table===t.name)c.fk=null;}));state.triggers=state.triggers.filter(g=>g.table!==t.name);state.tables.splice(i,1);log(`Table "${t.name}" deleted`);save();refresh();});}
function toggleDataPanel(i){browse={ti:i,q:'',sort:null,dir:1};setView('browse');}
/* columns */
function submitColumnModal(){const name=$('colNameInput').value.trim();if(!okName(name,'Column name'))return;const ts=$('colTypeSelect').value,type=ts==='__custom'?($('colTypeCustom').value.trim()||'VARCHAR(255)'):ts;let fk=null;if($('colFkToggle').checked){const ft=$('fkTableSelect').value,fc=$('fkColumnSelect').value;if(!ft||!fc)return alert('Choose a target table that has a primary key.');fk={table:ft,column:fc};}
const ai=$('colAi').checked;if(ai&&!/INT/i.test(type))return alert('Auto Increment needs an integer type.');
const {tableIdx,colIdx}=columnModalCtx,t=state.tables[tableIdx];if(t.columns.some((c,i)=>c.name.toLowerCase()===name.toLowerCase()&&i!==colIdx))return alert(`Column "${name}" already exists in this table.`);
const col={name,type,pk:$('colPk').checked,fk,notNull:$('colNotNull').checked,unique:$('colUnique').checked,ai};
if(colIdx===-1){t.columns.push(col);log(`Column "${name}" added to "${t.name}"`);}
else{const o=t.columns[colIdx].name;if(o!==name){(t.rows||[]).forEach(r=>{r[name]=r[o];delete r[o];});state.tables.forEach(x=>x.columns.forEach(c=>{if(c.fk&&c.fk.table===t.name&&c.fk.column===o)c.fk.column=name;}));}t.columns[colIdx]=col;log(`Column "${name}" updated on "${t.name}"`);}
closeColumnModal();save();refresh();}
function deleteColumn(ti,ci){const t=state.tables[ti],c=t.columns[ci];askConfirm(`Delete column "${c.name}" from "${t.name}"?`,()=>{t.columns.splice(ci,1);(t.rows||[]).forEach(r=>delete r[c.name]);state.tables.forEach(x=>x.columns.forEach(k=>{if(k.fk&&k.fk.table===t.name&&k.fk.column===c.name)k.fk=null;}));log(`Column "${c.name}" deleted from "${t.name}"`);save();refresh();});}
/* rows: validation, auto-increment, timestamps, FK integrity */
function checkRow(t,row,skip){const pkn=t.columns.filter(c=>c.pk).length;for(const c of t.columns){const v=String(row[c.name]??'').trim();row[c.name]=v;
if(v===''){if(c.notNull||c.pk)return `"${c.name}" is required.`;continue;}
if(/INT/i.test(c.type)&&!/^-?\d+$/.test(v))return `"${c.name}" must be an integer.`;
if(/DECIMAL|FLOAT|DOUBLE/i.test(c.type)&&isNaN(+v))return `"${c.name}" must be a number.`;
if(/^BOOL/i.test(c.type)&&!/^(0|1|true|false)$/i.test(v))return `"${c.name}" must be 0, 1, true or false.`;
if(/^(DATE|DATETIME|TIMESTAMP)$/i.test(c.type)&&isNaN(Date.parse(v)))return `"${c.name}" must be a valid date (YYYY-MM-DD).`;
const en=c.type.match(/^ENUM\((.*)\)$/i);if(en){const o=[...en[1].matchAll(/'([^']*)'/g)].map(m=>m[1]);if(!o.includes(v))return `"${c.name}" must be one of: ${o.join(', ')}.`;}
if((c.unique||(c.pk&&pkn===1))&&t.rows.some((r,i)=>i!==skip&&String(r[c.name]??'')===v))return `Duplicate value "${v}" in "${c.name}".`;
if(c.fk){const rt=state.tables.find(x=>x.name===c.fk.table);if(rt&&!(rt.rows||[]).some(r=>String(r[c.fk.column]??'')===v))return `"${c.name}": no row with ${c.fk.column}=${v} in ${c.fk.table}.`;}}return null;}
function commitRow(t,row,ri){t.rows=t.rows||[];const now=new Date().toISOString().slice(0,19).replace('T',' ');
t.columns.forEach(c=>{const v=String(row[c.name]??'').trim();if(c.ai&&v==='')row[c.name]=String(Math.max(0,...t.rows.map((r,i)=>i===ri?0:+r[c.name]||0))+1);if(c.name==='created_at'&&v==='')row[c.name]=now;if(c.name==='updated_at'&&(v===''||ri!==-1))row[c.name]=now;});
const err=checkRow(t,row,ri);if(err)return err;if(ri===-1)t.rows.push(row);else t.rows[ri]=row;return null;}
function openRowModal(){const {tableIdx,rowIdx}=rowModalCtx,t=state.tables[tableIdx],ex=rowIdx===-1?{}:t.rows[rowIdx],fc=$('rowFieldsContainer');$('rowModalTitle').innerHTML=`<i class="fas fa-list"></i> ${rowIdx===-1?'Add':'Edit'} Row · ${esc(t.name)}`;fc.innerHTML='';
t.columns.forEach(c=>{const l=document.createElement('span');l.className='field-label';l.textContent=c.name+(c.pk?' (PK)':'')+(c.fk?` → ${c.fk.table}.${c.fk.column}`:'');let i;const en=c.type.match(/^ENUM\((.*)\)$/i);
if(en){i=document.createElement('select');i.innerHTML='<option value=""></option>'+[...en[1].matchAll(/'([^']*)'/g)].map(m=>`<option>${esc(m[1])}</option>`).join('');}else{i=document.createElement('input');i.type='text';i.placeholder=c.ai?'auto':c.type;}
i.id='rowfield_'+c.name;i.value=ex[c.name]??'';fc.append(l,i);});$('rowModalOverlay').classList.add('show');}
function submitRowModal(){const {tableIdx,rowIdx}=rowModalCtx,t=state.tables[tableIdx],row={};t.columns.forEach(c=>row[c.name]=$('rowfield_'+c.name).value);const err=commitRow(t,row,rowIdx);if(err)return alert(err);log(`Row ${rowIdx===-1?'inserted into':'updated in'} "${t.name}"`);closeRowModal();save();refresh();}
function fkBlock(t,row){for(const o of state.tables)for(const c of o.columns)if(c.fk&&c.fk.table===t.name){const v=String(row[c.fk.column]??'');if(v!==''&&(o.rows||[]).some(r=>String(r[c.name]??'')===v))return `Row is still referenced by ${o.name}.${c.name}.`;}return null;}
function deleteRow(ti,ri){const t=state.tables[ti],b=fkBlock(t,t.rows[ri]);if(b)return alert("Can't delete: "+b);askConfirm('Delete this row?',()=>{t.rows.splice(ri,1);log(`Row deleted from "${t.name}"`);save();refresh();});}
/* data browser view */
function renderBrowseView(c){if(!state.tables.length){c.innerHTML='<div class="empty-state">Create a table first.</div>';return;}if(browse.ti>=state.tables.length)browse.ti=0;const t=state.tables[browse.ti];
c.innerHTML=`<div class="view-panel"><div class="browse-bar"><select id="bTable">${state.tables.map((x,i)=>`<option value="${i}"${i===browse.ti?' selected':''}>${esc(x.name)}</option>`).join('')}</select><input class="search-box" id="bQ" placeholder="Filter rows…" value="${esc(browse.q)}"><button class="pill-btn" id="bAdd"><i class="fas fa-plus"></i> Add Row</button></div><div id="bGrid"></div></div>`;
$('bTable').onchange=e=>{browse={ti:+e.target.value,q:'',sort:null,dir:1};renderView();};$('bQ').oninput=e=>{browse.q=e.target.value;drawGrid();};$('bAdd').onclick=()=>t.columns.length?addRow(browse.ti):alert('Add columns first.');drawGrid();}
function drawGrid(){const t=state.tables[browse.ti],g=$('bGrid');if(!g)return;const q=browse.q.toLowerCase();let rows=(t.rows||[]).map((r,i)=>({r,i})).filter(({r})=>!q||t.columns.some(c=>String(r[c.name]??'').toLowerCase().includes(q)));
if(browse.sort){const k=browse.sort,num=rows.every(({r})=>r[k]===''||!isNaN(+r[k]));rows.sort((a,b)=>(num?+a.r[k]-+b.r[k]:String(a.r[k]??'').localeCompare(String(b.r[k]??'')))*browse.dir);}
g.innerHTML=`<div class="grid-wrap"><table class="data-table"><thead><tr>${t.columns.map(c=>`<th data-k="${esc(c.name)}">${esc(c.name)}${browse.sort===c.name?(browse.dir>0?' ▲':' ▼'):''}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map(({r,i})=>`<tr>${t.columns.map(c=>`<td title="${esc(r[c.name])}">${esc(r[c.name])}</td>`).join('')}<td><div class="data-row-actions"><button data-e="${i}"><i class="fas fa-edit"></i></button><button data-d="${i}"><i class="fas fa-trash"></i></button></div></td></tr>`).join('')}</tbody></table></div>${rows.length?'':'<div class="empty-state">No rows.</div>'}<div class="search-results-summary">${rows.length} of ${(t.rows||[]).length} row(s)</div>`;
g.querySelectorAll('th[data-k]').forEach(th=>th.onclick=()=>{const k=th.dataset.k;browse.dir=browse.sort===k?-browse.dir:1;browse.sort=k;drawGrid();});
g.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>editRow(browse.ti,+b.dataset.e));g.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>deleteRow(browse.ti,+b.dataset.d));}
const _renderView=renderView;
renderView=function(){if(viewMode!=='browse')return _renderView();$('viewTitle').innerHTML='<i class="fas fa-table-list"></i> Data · <span>'+esc(state.dbName)+'</span>';const c=$('viewContainer');c.innerHTML='';renderBrowseView(c);};
const _setView=setView;setView=function(v){animateCards=true;_setView(v);};
/* history, grants, routines, events, triggers (validated, escaped) */
function renderHistoryView(c){const d=document.createElement('div');d.className='view-panel';d.innerHTML=`<div class="desc">Action log · <a href="#" id="clrHist">clear</a></div><ul class="generic-list">${state.history.map(h=>`<li><div>${esc(h.action)}</div><span class="meta">${esc(h.time)}</span></li>`).join('')||'<div class="empty-state">No actions yet.</div>'}</ul>`;c.appendChild(d);$('clrHist').onclick=e=>{e.preventDefault();state.history=[];save();renderView();};}
function addPrivilege(){showTextModal('Add Grant','user@host',u=>{u=u.trim();if(!/^\w[\w.-]*@[\w.%-]+$/.test(u))return alert('Use the format user@host, e.g. admin@localhost.');if(state.privileges.some(p=>p.user===u))return alert(`${u} already has a grant entry.`);showTextModal('Grants','e.g. SELECT, INSERT, UPDATE',g=>{g=(g.trim()||'ALL PRIVILEGES').replace(/[<>&"']/g,'').toUpperCase();state.privileges.push({user:u,grants:g});log(`Granted "${g}" to ${u}`);save();renderView();},'ALL PRIVILEGES');});}
function addRoutine(){showTextModal('Routine Name','e.g. get_low_stock_products',n=>{n=n.trim();if(!okName(n,'Routine name'))return;showTextModal('Routine Type','PROCEDURE or FUNCTION',t=>{t=(t||'PROCEDURE').trim().toUpperCase();if(!/^(PROCEDURE|FUNCTION)$/.test(t))return alert('Type must be PROCEDURE or FUNCTION.');state.routines.push({name:n,type:t});log(`Routine "${n}" created`);save();renderView();},'PROCEDURE');});}
function addEvent(){showTextModal('Event Name','e.g. cleanup_expired_carts',n=>{n=n.trim();if(!okName(n,'Event name'))return;showTextModal('Interval','e.g. 1 DAY',iv=>{iv=iv.trim().toUpperCase();if(!/^\d+\s+(SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|YEAR)S?$/.test(iv))return alert('Interval like "1 DAY" or "6 HOUR".');state.events.push({name:n,interval:iv});log(`Event "${n}" scheduled`);save();renderView();},'1 DAY');});}
function addTrigger(){if(!state.tables.length)return alert('Create a table first.');showTextModal('Trigger Name','e.g. trg_update_timestamp',n=>{n=n.trim();if(!okName(n,'Trigger name'))return;showTextModal('Definition','BEFORE|AFTER INSERT|UPDATE|DELETE ON table',d=>{const m=d.trim().match(/^(BEFORE|AFTER)\s+(INSERT|UPDATE|DELETE)\s+ON\s+(\w+)$/i);if(!m)return alert('Use: BEFORE UPDATE ON products');if(!state.tables.some(t=>t.name===m[3]))return alert(`Table "${m[3]}" doesn't exist.`);state.triggers.push({name:n,timing:m[1].toUpperCase(),event:m[2].toUpperCase(),table:m[3]});log(`Trigger "${n}" created on ${m[3]}`);save();renderView();},`BEFORE UPDATE ON ${state.tables[0].name}`);});}
function opEmptyTable(){const i=getOpsTableIdx();if(isNaN(i))return;const t=state.tables[i];askConfirm(`Remove all ${(t.rows||[]).length} row(s) from "${t.name}"?`,()=>{const b=(t.rows||[]).map(r=>fkBlock(t,r)).find(Boolean);if(b)return alert("Can't empty: "+b);t.rows=[];log(`Table "${t.name}" emptied`);save();renderView();});}
/* relationships: clamped to scroll area, hover highlight */
function drawRelationships(){const svg=$('relSvg'),wrap=document.querySelector('.tables-wrap');if(!svg||!wrap)return;svg.innerHTML='<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#d4af37"/></marker></defs>';if(!relVisible)return;const W=wrap.getBoundingClientRect();
const pos=el=>{const r=el.getBoundingClientRect(),l=el.closest('.column-list').getBoundingClientRect();return{l:r.left-W.left,r:r.right-W.left,y:Math.min(Math.max(r.top+r.height/2,l.top+6),l.bottom-6)-W.top};};
state.tables.forEach((t,ti)=>t.columns.forEach(col=>{if(!col.fk)return;const tj=state.tables.findIndex(x=>x.name===col.fk.table);if(tj<0)return;const a=document.querySelector(`.table-card[data-index="${ti}"] .column-item[data-col="${CSS.escape(col.name)}"]`),b=document.querySelector(`.table-card[data-index="${tj}"] .column-item[data-col="${CSS.escape(col.fk.column)}"]`);if(!a||!b)return;
const A=pos(a),B=pos(b),right=A.l<B.l,x1=right?A.r:A.l,x2=right?B.l:B.r,mx=(x1+x2)/2,p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',`M${x1},${A.y} C${mx},${A.y} ${mx},${B.y} ${x2},${B.y}`);p.setAttribute('class','rel');p.setAttribute('marker-end','url(#arrow)');p.dataset.a=t.name;p.dataset.b=col.fk.table;svg.appendChild(p);}));}
function hl(n){const ps=[...document.querySelectorAll('#relSvg .rel')],rel=new Set();ps.forEach(p=>{const on=n&&(p.dataset.a===n||p.dataset.b===n);p.classList.toggle('on',!!on);p.classList.toggle('off',!!n&&!on);if(on){rel.add(p.dataset.a);rel.add(p.dataset.b);}});document.querySelectorAll('.table-card').forEach(c=>c.classList.toggle('dim',!!n&&rel.size>0&&!rel.has(c.dataset.table)));}
const _rtc=renderTableCards;
renderTableCards=function(){_rtc();document.querySelectorAll('.table-card').forEach((c,i)=>{if(animateCards){c.classList.add('enter');c.style.animationDelay=i*70+'ms';}c.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain','t'));c.addEventListener('dragend',()=>{dragState=null;});c.addEventListener('mouseenter',()=>hl(c.dataset.table));c.addEventListener('mouseleave',()=>hl(null));c.querySelector('.column-list').addEventListener('scroll',drawRelationships);});
document.querySelectorAll('.col-actions').forEach(x=>{});document.querySelectorAll('.column-item .fa-grip-vertical').forEach(g=>g.remove());if(animateCards){animateCards=false;setTimeout(drawRelationships,900);}};
/* SQL export (dependency-ordered) / clipboard / import */
function topo(ts){const out=[],seen=new Set(),v=t=>{if(seen.has(t.name))return;seen.add(t.name);t.columns.forEach(c=>{if(c.fk&&c.fk.table!==t.name){const d=ts.find(x=>x.name===c.fk.table);if(d)v(d);}});out.push(t);};ts.forEach(v);return out;}
const _gen=generateSQL;generateSQL=function(){const o=state.tables;state.tables=topo(o);try{return _gen();}finally{state.tables=o;}};
function copyExport(){const ta=$('exportTextarea');(navigator.clipboard?navigator.clipboard.writeText(ta.value):Promise.reject()).catch(()=>{ta.select();document.execCommand('copy');}).then(()=>toast('SQL copied to clipboard'));}
function parseCreateTableStatements(sql){sql=sql.replace(/--.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');const tables=[],re=/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(/gi;let m;
while((m=re.exec(sql))){let d=1,i=re.lastIndex;while(i<sql.length&&d>0){const ch=sql[i++];if(ch==='(')d++;else if(ch===')')d--;}if(d)break;const body=sql.slice(re.lastIndex,i-1);re.lastIndex=i;const cols=[],pk=new Set(),fks={};
splitTopLevelCommas(body).forEach(raw=>{const p=raw.trim().replace(/^CONSTRAINT\s+[`"']?\w+[`"']?\s+/i,'');if(!p)return;const U=p.toUpperCase();
if(U.startsWith('PRIMARY KEY')){((p.match(/\(([^)]+)\)/)||[,''])[1]).split(',').forEach(s=>pk.add(s.trim().replace(/[`"']/g,'')));return;}
if(U.startsWith('FOREIGN KEY')){const a=p.match(/FOREIGN\s+KEY\s*\(([^)]+)\)/i),b=p.match(/REFERENCES\s+[`"']?(\w+)[`"']?\s*\(([^)]+)\)/i);if(a&&b)fks[a[1].trim().replace(/[`"']/g,'')]={table:b[1],column:b[2].trim().replace(/[`"']/g,'')};return;}
if(/^(UNIQUE|KEY|INDEX|FULLTEXT|CHECK)\b/i.test(p))return;const cm=p.match(/^[`"']?(\w+)[`"']?\s+([A-Za-z0-9_]+(?:\([^)]*\))?)/);if(!cm)return;const rf=p.match(/REFERENCES\s+[`"']?(\w+)[`"']?\s*\(([^)]+)\)/i);
cols.push({name:cm[1],type:cm[2].replace(/^\w+/,s=>s.toUpperCase()),pk:/PRIMARY\s+KEY/i.test(p),fk:rf?{table:rf[1],column:rf[2].trim().replace(/[`"']/g,'')}:null,notNull:/NOT\s+NULL/i.test(p),unique:/\bUNIQUE\b/i.test(p),ai:/AUTO_INCREMENT/i.test(p)});});
cols.forEach(c=>{if(pk.has(c.name)){c.pk=true;c.notNull=true;}if(fks[c.name])c.fk=fks[c.name];});tables.push({name:m[1],columns:cols,rows:[]});}return tables;}
const sqlVal=s=>{s=s.trim();return /^NULL$/i.test(s)?'':/^['"]/.test(s)?s.slice(1,-1).replace(/''/g,"'").replace(/\\(.)/g,'$1'):s;};
const VAL_RE=/'(?:[^'\\]|\\.|'')*'|"[^"]*"|[^,]+/g;
function runImport(){const text=$('importTextarea').value,res=parseCreateTableStatements(text);let n=0;const re=/INSERT\s+INTO\s+[`"']?(\w+)[`"']?\s*(?:\(([^)]*)\))?\s*VALUES\s*([\s\S]*?);/gi,ins=[];let m;while((m=re.exec(text)))(m[3].match(/\((?:'(?:[^'\\]|\\.|'')*'|[^()'])*\)/g)||[]).forEach(g=>ins.push({table:m[1],cols:m[2]?m[2].split(',').map(s=>s.trim().replace(/[`"']/g,'')):null,vals:(g.slice(1,-1).match(VAL_RE)||[]).map(sqlVal)}));
if(!res.length&&!ins.length)return alert('No valid CREATE TABLE or INSERT statements found.');
res.forEach(t=>{const i=state.tables.findIndex(x=>x.name===t.name);if(i>-1)state.tables[i]=t;else state.tables.push(t);});
ins.forEach(({table,cols,vals})=>{const t=state.tables.find(x=>x.name===table);if(!t)return;const row={};t.columns.forEach(c=>row[c.name]='');(cols||t.columns.map(c=>c.name)).forEach((k,i)=>{if(k in row)row[k]=vals[i]??'';});t.rows.push(row);n++;});
log(`Imported ${res.length} table(s), ${n} row(s)`);save();closeModalById('importModalOverlay');setView('tables');}
/* console engine: WHERE / ORDER BY / LIMIT / COUNT / INSERT / UPDATE / DELETE / TRUNCATE */
const tbl=n=>{const t=state.tables.find(x=>x.name===n);if(!t)throw Error(`Table "${n}" doesn't exist.`);return t;};
const chk=(t,ks)=>ks.forEach(k=>{if(!t.columns.some(c=>c.name===k))throw Error(`Unknown column "${k}" in "${t.name}".`);});
function parseWhere(t,w){if(!w)return()=>true;const cs=w.split(/\s+AND\s+/i).map(s=>{const m=s.trim().match(/^(\w+)\s*(>=|<=|<>|!=|=|>|<|\s+LIKE\s+)\s*(.+)$/i);if(!m)throw Error(`Can't parse condition: ${s}`);chk(t,[m[1]]);return{k:m[1],op:m[2].trim().toUpperCase(),v:sqlVal(m[3])};});
return r=>cs.every(({k,op,v})=>{const a=String(r[k]??''),num=a!==''&&v!==''&&!isNaN(+a)&&!isNaN(+v),x=num?+a:a,y=num?+v:v;switch(op){case'=':return x===y;case'!=':case'<>':return x!==y;case'>':return x>y;case'<':return x<y;case'>=':return x>=y;case'<=':return x<=y;default:return new RegExp('^'+v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/%/g,'.*').replace(/_/g,'.')+'$','i').test(a);}});}
const _exec=executeCommand;
executeCommand=function(raw){const cmd=raw.trim().replace(/;+\s*$/,'').replace(/`/g,'');let m;try{
if((m=cmd.match(/^SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?$/i))){const t=tbl(m[2]);let rows=(t.rows||[]).filter(parseWhere(t,m[3]));if(/^COUNT\(\*\)$/i.test(m[1].trim()))return `COUNT(*)\n--------\n${rows.length}`;
const cols=m[1].trim()==='*'?t.columns.map(c=>c.name):m[1].split(',').map(s=>s.trim());chk(t,cols);if(m[4]){const k=m[4];chk(t,[k]);const d=/DESC/i.test(m[5]||'')?-1:1,num=rows.every(r=>r[k]===''||!isNaN(+r[k]));rows=[...rows].sort((a,b)=>(num?+a[k]-+b[k]:String(a[k]).localeCompare(String(b[k])))*d);}
if(m[6])rows=rows.slice(0,+m[6]);if(!rows.length)return '0 rows.';const g=[cols,...rows.map(r=>cols.map(c=>String(r[c]??'')))],w=cols.map((_,i)=>Math.max(...g.map(x=>x[i].length))),ln=x=>x.map((s,i)=>s.padEnd(w[i])).join(' | ');
return `${ln(g[0])}\n${w.map(n=>'-'.repeat(n)).join('-+-')}\n${g.slice(1).map(ln).join('\n')}\n\n(${rows.length} row${rows.length===1?'':'s'})`;}
if((m=cmd.match(/^INSERT\s+INTO\s+(\w+)\s*(?:\(([^)]*)\))?\s*VALUES\s*\((.*)\)$/i))){const t=tbl(m[1]),names=m[2]?m[2].split(',').map(s=>s.trim()):t.columns.map(c=>c.name),vals=(m[3].match(VAL_RE)||[]).map(sqlVal);chk(t,names);if(names.length!==vals.length)throw Error('Column count does not match value count.');const row={};t.columns.forEach(c=>row[c.name]='');names.forEach((k,i)=>row[k]=vals[i]);const e=commitRow(t,row,-1);if(e)throw Error(e);log(`Row inserted into "${t.name}" via console`);save();renderView();return '1 row inserted.';}
if((m=cmd.match(/^UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i))){const t=tbl(m[1]),f=parseWhere(t,m[3]),sets=[...m[2].matchAll(/(\w+)\s*=\s*('(?:[^'\\]|\\.|'')*'|"[^"]*"|[^,]+)/g)].map(x=>[x[1],sqlVal(x[2])]);if(!sets.length)throw Error('Nothing to SET.');chk(t,sets.map(s=>s[0]));const bak=JSON.stringify(t.rows);let n=0;
for(let i=0;i<t.rows.length;i++)if(f(t.rows[i])){const row={...t.rows[i]};sets.forEach(([k,v])=>row[k]=v);const e=commitRow(t,row,i);if(e){t.rows=JSON.parse(bak);throw Error(e+' (nothing changed)');}n++;}
log(`${n} row(s) updated in "${t.name}" via console`);save();renderView();return `${n} row(s) updated.`;}
if((m=cmd.match(/^DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i))){const t=tbl(m[1]),f=parseWhere(t,m[2]),hit=t.rows.filter(f);const b=hit.map(r=>fkBlock(t,r)).find(Boolean);if(b)throw Error(b);t.rows=t.rows.filter(r=>!hit.includes(r));log(`${hit.length} row(s) deleted from "${t.name}" via console`);save();renderView();return `${hit.length} row(s) deleted.`;}
if((m=cmd.match(/^TRUNCATE\s+(?:TABLE\s+)?(\w+)$/i))){const t=tbl(m[1]),b=t.rows.map(r=>fkBlock(t,r)).find(Boolean);if(b)throw Error(b);t.rows=[];log(`Table "${t.name}" truncated via console`);save();renderView();return `Table "${t.name}" truncated.`;}
if((m=cmd.match(/^(?:RENAME|CREATE)\s+DATABASE\s+(\w+)$/i))){if(!okName(m[1],'Database name'))return 'ERROR: invalid name.';state.dbName=m[1];log(`Database renamed to "${m[1]}" via console`);save();renderView();return `Single-database mode: database renamed to "${m[1]}".`;}
}catch(e){return 'ERROR: '+e.message;}return _exec(cmd+';');};
/* global shortcuts */
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-overlay.show').forEach(o=>o.classList.remove('show'));
if((e.ctrlKey||e.metaKey)&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){if(e.key==='z'){e.preventDefault();undo();}if(e.key==='y'){e.preventDefault();redo();}}});
$('confirmOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModalById('confirmOverlay');});

/* ---------------- INIT ---------------- */
loadSaved();undoStack=[snap()];updateStats();$('relToggleBtn').classList.add('active');setView('tables');if(document.fonts)document.fonts.ready.then(()=>{if(viewMode==='tables')drawRelationships();});
console.log('Interactive Database Manager · Mohamed Amine El Hadani');