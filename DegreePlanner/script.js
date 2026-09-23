//SEMESTERS. THESE ARE CONSTANTS THAT WILL BE REPLACED
const TERMS = [{key: 'f26', label: 'Fall \u201926'},
	{key: 's27', label: 'Spring \u201927'},
	{key: 'su27', label: 'Summer \u201927'},
	{key: 'f27', label: 'Fall \u201927'},
	{key: 's28', label: 'Spring \u201928'},
	{key: 'f28', label: 'Fall \u201928'},
];

//CATAGORY LABELS. THESE ARE ALSO CONSTANTS THAT WILL BE REPLACED
const catLabels = {
	'comp-cur': 'Compass Curriculum', 'cs-core': 'Computer Science', 'cs-math': 'Computer Science: Mathmatics', writing: 'Writing / administrative'
};

//CATAGORY ORDER. WILL BE REPLACED
const catOrder = ['comp-cur', 'cs-core', 'cs-math', 'writing'];


const chipMap = {'comp-cur': 'comp-cur', 'cs-core': 'cs-core', 'cs-math': 'cs-math', writing: 'writing'};
   				


//DEFAULTS. CONSTANTS TO BE REPLACED
const courses = [
		//Compass Curriculum
		{id:'gps1010', cat:'comp-cur', code:'GPS 1010', title:'Gateway Program Seminar', sub:'Required for all UCCS students', cr:3, term:'Fall & Spring', termC:'u', prereq:'None', preC:'c', dflt:'s27'},
  		{id:'pes1110', cat:'comp-cur', code:'PES 1110', title:'General Physics I - Calc Based', sub:'Part of Compass Curriculum: Explore - Physical & Natural World', cr:4, term:'Fall & Spring', termC:'c', prereq:'Coreq. MATH 1320 or MATH 1330 or MATH 1350', preC:'c', dflt:'f27'},
  		
		//Computer Science Core
		{id:'cs1450', cat:'cs-core', code:'CS 1450', title:'Data Structures and Algorithms', sub:'', cr:3, term:'Spring, Fall', termC:'c', prereq:'Confirmed', preC:'c', dflt:'s27'},
  		
		//Computer Science Math
		{id:'math1350', cat:'cs-math', code:'CS 1350', title:'Calculus I', sub:'', cr:4, term:'Spring only', termC:'u', prereq:'None', preC:'u', dflt:null},

		//writing/admin
		{id:'port4000', cat:'writing', code:'PORT 4000', title:'Professional / Writing Portfolio', sub:'', cr:1, term:'Runs most terms', termC:'i', prereq:'~60+ completed credit hours, typically junior year', preC:'c', dflt:'s27'},

	];

const assignments = {};
courses.forEach(c => assignments[c.id] = c.dflt);
const locked = {};

const STORAGE_KEY = 'ce-ece-planner-v1';

function loadState() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		const saved = JSON.parse(raw);
		if (saved.assignments) Object.keys(saved.assignments).forEach(id => {if (id in assignments) assignments[id] = saved.assignments[id]; });
		if (saved.locked) Object.keys(saved.locked).forEach(id => {locked[id] = saved.locked[id]; });
	}catch(e){ console.warn('Could not load saved planner state:', e); }
}

function saveState() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({assignments, locked}));
		const s = document.getElementById('save-status');
		if (s) {s.textContent = 'Saved ' + new Date().toLocalTimeString();}
	}catch(e){ console.warn('Could not save planner state:', e); }
}
loadState();

const poolGroups = {
	'ee-lec': {label:'EE lecture elective', need:2},
	'ee-lab': {label:'EE lab elective', need:1},
	'cpen-elect': {label:'CpE technical elective', need:1},
};

function renderList(filterCat, query) {
	const list = document.getElementById('list');
	list.innerHTML = '';
	const grouped = {};
	courses.forEach(c => { if(!grouped[c.cat]) grouped[c.cat]=[]; grouped[c.cat].push(c); });
	catOrder.forEach(cat => {
		if (filterCat !== 'all' && chipMap[cat] !== filterCat) return;
		const items = (grouped[cat] || []).filter(c => {
			if (!query) return true;
			const hay = (c.code + ' ' + c.title + ' ' + c.sub).toLowerCase();
			return hay.includes(query);
		});
		if (items.length === 0) return;
		const head = document.createElement('div');
		head.className = 'cat-head';
		head.textContent = catLabels[cat];
		list.appendChild(head);
		items.forEach(c => {
		const row = document.createElement('div');
			const isLocked = !!locked[c.id];
			row.className = 'row' + (cat === 'ee-lec' || cat === 'ee-lab' || cat === 'cpen-elect' ? ' pool' : '') + (isLocked ? ' locked' : '');
			const pillsHtml = TERMS.map(t => `<button class="pill${assignments[c.id]===t.key?' on':''}" data-id="${c.id}" data-term="${t.key}" ${isLocked?'disabled':''}>${t.label}</button>`).join('');
			row.innerHTML = `
					<div><span class="r-code">${c.code}</span><span class="r-cr">${c.cr} cr</span></div>
					<div>
  						<span class="r-title">${c.title}</span>
  							${c.sub?`<span class="r-sub">${c.sub}</span>`:''}
  						<span class="r-term ${termClass(c.termC)}">${c.term}</span>
  						<span class="r-prereq"><i class="conf-dot ${confClass(c.preC)}" style="margin-right:5px;"></i>${c.prereq}</span>
					</div>
					<div class="pills">
  						${pillsHtml}
  						<button class="lock-btn${isLocked?' on':''}" data-id="${c.id}" ${!assignments[c.id] && !isLocked ? 'disabled':''}>${isLocked?'Locked':'Lock'}</button>
					</div>
  				`;
			list.appendChild(row);
		});
	});
	list.querySelectorAll('.pill').forEach(p => {
		p.addEventListener('click', () => {
			const id = p.dataset.id, term = p.dataset.term;
			if (locked[id]) return;
			assignments[id] = (assignments[id] === term) ? null : term;
			saveState();
			renderList(document.querySelector('.chip.active').dataset.cat, document.getElementById('search').value.trim().toLowerCase());
			renderSchedule();
		});
	});
	list.querySelectorAll('.lock-btn').forEach(b => {
		b.addEventListener('click', () => {
			const id = b.dataset.id;
			if (!assignments[id] && !locked[id]) return;
			locked[id] = !locked[id];
			saveState();
			renderList(document.querySelector('.chip.active').dataset.cat, document.getElementById('search').value.trim().toLowerCase());
			renderSchedule();
		});
	});
}

function termClass(c){return c==='c'?'term-c':c==='i'?'term-i':'term-u';}
function confClass(c){return c==='c'?'conf-c':c==='i'?'conf-i':'conf-u';}

function renderSchedule() {
	const grid = document.getElementById('sched-grid');
	grid.innerHTML = '';
	let totalAssigned = 0;
	TERMS.forEach(t => {
		const items = courses.filter(c => assignments[c.id] === t.key);
		const sub = items.reduce((s, c) => s + c.cr, 0);
		totalAssigned += sub;
		const card = document.createElement('div');
		card.className = 'term-card';
		card.innerHTML = `<h3>${t.label}<span>${sub} cr</span></h3>
  			<ul>${items.length? items.map(c=>`<li><span${locked[c.id]?' style="color:var(--green);font-weight:600;"':''}>${locked[c.id]?'\u2713 ':''}${c.code}</span><span>${c.cr} cr</span></li>`).join('') : '<li class="empty">Nothing assigned</li>'}</ul>`;
		grid.appendChild(card);
	});
	document.getElementById('stat-assigned').textContent = totalAssigned;
	document.getElementById('stat-total').textContent = 126 + totalAssigned;

	const poolStatus = document.getElementById('pool-status');
	poolStatus.innerHTML = '';
	Object.keys(poolGroups).forEach(key => {
		const g = poolGroups[key];
		const chosen = courses.filter(c => c.cat === key && assignments[c.id]).length;
		const el = document.createElement('div');
		el.className = 'ps ' + (chosen >= g.need ? 'done' : 'pending');
		el.textContent = `${g.label}: ${chosen} of ${g.need} selected`;
		poolStatus.appendChild(el);
	});

	const required = courses.filter(c => !['ee-lec', 'ee-lab', 'cpen-elect'].includes(c.cat));
	const missing = required.filter(c => !assignments[c.id] && c.id !== 'exitint');
	const un = document.getElementById('unassigned');
	un.innerHTML = missing.length 
		? `<b>Not yet placed in a term:</b> ${missing.map(c=>c.code).join(', ')}` 
		:`<b>Everything required has a term.</b> Elective picks above still show 0 until you check them off.`;
}

document.querySelectorAll('.chip').forEach(chip => {
	chip.addEventListener('click', () => {
		document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
		chip.classList.add('active');
		renderList(chip.dataset.cat, document.getElementById('search').value.trim().toLowerCase());
	});
});
document.getElementById('search').addEventListener('input', (e) => {
	const active = document.querySelector('.chip.active').dataset.cat;
	renderList(active, e.target.value.trim().toLowerCase());
});

renderList('all', '');
renderSchedule();

document.getElementById('reset-btn').addEventListener('click', () => {
	if (!confirm('Clear all saved term picks and locks, and go back to the built-in defaults?')) return;
	try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
	courses.forEach(c => assignments[c.id] = c.dflt);
	Object.keys(locked).forEach(id => delete locked[id]);
	const s = document.getElementById('save-status');
	if (s) s.textContent = 'Autosaves in this browser';
	renderList(document.querySelector('.chip.active').dataset.cat, document.getElementById('search').value.trim().toLowerCase());
	renderSchedule();
});
