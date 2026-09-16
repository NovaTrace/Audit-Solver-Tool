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
	capstone: 'Capstone / Summit (CE track only)', 'cpen-core': 'Computer Engineering core', 'cpen-elect': 'Computer Engineering technical elective — pick at least 1 (~4 hrs)',
	'ee-core': 'Electrical Engineering core (ELEN-ADL)', 'ee-lec': 'EE elective — lecture — pick 2 (6 hrs)', 'ee-lab': 'EE elective — lab — pick 1 (1 hr)',
	'basic-sci': 'Basic science', math: 'Mathematics minor', writing: 'Writing / administrative'
};

//CATAGORY ORDER. WILL BE REPLACED
const catOrder = ['capstone', 'cpen-core', 'cpen-elect', 'ee-core', 'ee-lec', 'ee-lab', 'basic-sci', 'math', 'writing'];


const chipMap = {capstone: 'capstone', 'cpen-core': 'cpen-core', 'cpen-elect': 'cpen-elect', 'ee-core': 'ee-core', 'ee-lec': 'ee-elect', 'ee-lab': 'ee-elect', 'basic-sci': 'basic-sci', math: 'math', writing: 'writing'};

//COURSES PULLED FROM AUDIT. CONSTANTS TO BE REPLACED
const courses = [
		{id:'ece4891', cat:'capstone', code:'ECE 4891', title:'Senior Seminar', sub:'CE track — the only capstone seminar you need', cr:1, term:'Not on the standard ECE rotation table — confirm with the department', termC:'u', prereq:'ECE 3210, ECE 3430, ECE 3610, ECE 4242, CS 3300 (per your plan) — confirm ECE 3610 timing and D+ grade', preC:'c', dflt:'s27'},
  		{id:'ece4899', cat:'capstone', code:'ECE 4899', title:'Senior Design Project', sub:'CE track — the only capstone design you need', cr:3, term:'Fall & Spring', termC:'c', prereq:'ECE 4891, taken the prior semester', preC:'c', dflt:'f27'},
  		{id:'cs4500', cat:'cpen-core', code:'CS 4500', title:'Operating Systems I', sub:'', cr:3, term:'Spring, Fall', termC:'c', prereq:'Confirmed', preC:'c', dflt:'s27'},
  		{id:'ece3610', cat:'cpen-core', code:'ECE 3610', title:'Engineering Probability & Statistics', sub:'also fulfills EE math + writing-intensive', cr:3, term:'Spring only', termC:'c', prereq:'Confirmed', preC:'c', dflt:'s27'},
    		{id:'ece2021', cat:'ee-core', code:'ECE 2021', title:'Computer Based Modeling in C', sub:'', cr:3, term:'Spring, Summer, Fall', termC:'c', prereq:'', preC:'c', dflt:'su27'},
    		{id:'ece2050', cat:'ee-core', code:'ECE 2050', title:'Introduction to Physical Electronics', sub:'', cr:3, term:'Spring only', termC:'c', prereq:'Coreq. PES 2130', preC:'c', dflt:'s28'},
    		{id:'ece3020', cat:'ee-core', code:'ECE 3020', title:'Semiconductor Devices I', sub:'', cr:3, term:'Fall only', termC:'c', prereq:'ECE 2050, and either ECE 2205 or ECE 2210', preC:'i', dflt:'f27'},
    		{id:'ece3110', cat:'ee-core', code:'ECE 3110', title:'Electromagnetic Fields I', sub:'', cr:3, term:'Spring only', termC:'c', prereq:'ECE 2205 or ECE 2210 — College of Engineering students only', preC:'c', dflt:'s27'},
    		{id:'ece3205', cat:'ee-core', code:'ECE 3205', title:'Circuits and Systems II', sub:'', cr:4, term:'Fall only', termC:'c', prereq:'ECE 2205, or consent of instructor', preC:'c', dflt:'f27'},
    		{id:'ece3220', cat:'ee-core', code:'ECE 3220', title:'Electronics II', sub:'', cr:3, term:'Spring only', termC:'c', prereq:'ECE 3210', preC:'i', dflt:'s27'},
    		{id:'ece3230', cat:'ee-core', code:'ECE 3230', title:'Electronics Laboratory I', sub:'', cr:1, term:'Fall only', termC:'c', prereq:'Paired with ECE 3210', preC:'i', dflt:'f26'},
    		{id:'ece3240', cat:'ee-core', code:'ECE 3240', title:'Electronics Laboratory II', sub:'', cr:1, term:'Spring only', termC:'c', prereq:'ECE 3230 - Taken with ECE 3220', preC:'i', dflt:'s27'},
    		{id:'exitint', cat:'ee-core', code:'Exit interview', title:'ECE department exit interview', sub:'administrative, 0 credits', cr:0, term:'Final semester', termC:'c', prereq:'None — schedule with the ECE department office', preC:'c', dflt:null},
    		{id:'pes2130', cat:'basic-sci', code:'PES 2130', title:'General Physics III', sub:'', cr:3, term:'Confirm current-term offering (physics dept)', termC:'u', prereq:'PES 1120; coreq. MATH 2350', preC:'c', dflt:'s28'},
    		{id:'math4420', cat:'math', code:'MATH 4420', title:'Optimization', sub:'your chosen math minor elective', cr:3, term:'Confirm offering term', termC:'u', prereq:'Not confirmed — check catalog', preC:'u', dflt:'su27'},
    		{id:'tcid2090', cat:'writing', code:'TCID 2090', title:'Technical Writing & Presentation', sub:'often offered online/asynchronous', cr:3, term:'Regularly offered, fall & spring', termC:'i', prereq:'ENGL 1308, 1310, or 1410', preC:'c', dflt:'f26'},
    		{id:'port4000', cat:'writing', code:'PORT 4000', title:'Professional / Writing Portfolio', sub:'', cr:1, term:'Runs most terms', termC:'i', prereq:'~60+ completed credit hours, typically junior year', preC:'c', dflt:'s27'},

    		{id:'ece3120', cat:'ee-lec', code:'ECE 3120', title:'Electromagnetic Fields II', sub:'EE lecture elective option', cr:3, term:'Fall only', termC:'c', prereq:'ECE 3110', preC:'i', dflt:null},
    		{id:'ece4020', cat:'ee-lec', code:'ECE 4020', title:'Semiconductor Devices II', sub:'EE lecture elective option', cr:3, term:'Spring only', termC:'c', prereq:'ECE 3020 or equivalent', preC:'c', dflt:null},
    		{id:'ece4162', cat:'ee-lec', code:'ECE 4162', title:'Electric Machines', sub:'EE lecture elective option', cr:3, term:'Not on standard rotation — confirm', termC:'u', prereq:'Not confirmed', preC:'u', dflt:null},
    		{id:'ece4340', cat:'ee-lec', code:'ECE 4340', title:'VLSI Circuit Design I', sub:'EE lecture elective option', cr:3, term:'Fall only', termC:'c', prereq:'Not confirmed', preC:'u', dflt:null},
    		{id:'ece4510', cat:'ee-lec', code:'ECE 4510', title:'Feedback Control Systems', sub:'EE lecture elective option', cr:3, term:'Fall only', termC:'c', prereq:'Not confirmed', preC:'u', dflt:null},
    		{id:'ece4625', cat:'ee-lec', code:'ECE 4625', title:'Communication Systems I', sub:'EE lecture elective option', cr:3, term:'Spring only', termC:'c', prereq:'Not confirmed', preC:'u', dflt:null},
    		{id:'ece4650', cat:'ee-lec', code:'ECE 4650', title:'Modern Digital Signal Processing', sub:'EE lecture elective option', cr:3, term:'Fall only', termC:'c', prereq:'Not confirmed', preC:'u', dflt:null},
    		{id:'ece4910', cat:'ee-lec', code:'ECE 4910', title:'Power Systems II', sub:'EE lecture elective option', cr:3, term:'Not on standard rotation — confirm', termC:'u', prereq:'Not confirmed', preC:'u', dflt:null},

    		{id:'ece4040', cat:'ee-lab', code:'ECE 4040', title:'Introductory VLSI Fabrication Lab', sub:'EE lab elective option', cr:1, term:'Spring only', termC:'c', prereq:'Not confirmed', preC:'u', dflt:null},
    		{id:'ece4150', cat:'ee-lab', code:'ECE 4150', title:'Microwave Measurements Laboratory', sub:'EE lab elective option', cr:1, term:'Fall only', termC:'c', prereq:'Not confirmed', preC:'u', dflt:null},
    		{id:'ece4160', cat:'ee-lab', code:'ECE 4160', title:'Electric Machines Lab', sub:'EE lab elective option', cr:1, term:'Not on standard rotation — confirm', termC:'u', prereq:'Not confirmed', preC:'u', dflt:null},
    		{id:'ece4200', cat:'ee-lab', code:'ECE 4200', title:'Advanced Digital Design Laboratory', sub:'EE lab elective option', cr:1, term:'Spring only', termC:'c', prereq:'Not confirmed', preC:'u', dflt:null},
    		{id:'ece4530', cat:'ee-lab', code:'ECE 4530', title:'Control Systems Laboratory', sub:'EE lab elective option', cr:1, term:'Fall only', termC:'c', prereq:'Not confirmed', preC:'u', dflt:null},
    		{id:'ece4560', cat:'ee-lab', code:'ECE 4560', title:'Digital Control Laboratory', sub:'EE lab elective option', cr:1, term:'Not on standard rotation — confirm', termC:'u', prereq:'Not confirmed', preC:'u', dflt:null},
    		{id:'ece4670', cat:'ee-lab', code:'ECE 4670', title:'Communications Laboratory', sub:'EE lab elective option', cr:1, term:'Spring only', termC:'c', prereq:'Not confirmed', preC:'u', dflt:null},
    		{id:'ece4680', cat:'ee-lab', code:'ECE 4680', title:'Signal Processing Laboratory', sub:'EE lab elective option', cr:1, term:'Fall only', termC:'c', prereq:'Not confirmed', preC:'u', dflt:null},

    		{id:'cs3010', cat:'cpen-elect', code:'CS 3010', title:'Technical elective option', sub:'CpE elective pool', cr:3, term:'Confirm', termC:'u', prereq:'Varies', preC:'u', dflt:null},
    		{id:'cs3020', cat:'cpen-elect', code:'CS 3020', title:'Technical elective option', sub:'CpE elective pool', cr:3, term:'Confirm', termC:'u', prereq:'Varies', preC:'u', dflt:null},
    		{id:'cs3160', cat:'cpen-elect', code:'CS 3160', title:'Technical elective option', sub:'CpE elective pool', cr:3, term:'Confirm', termC:'u', prereq:'Varies', preC:'u', dflt:null},
    		{id:'cs3350', cat:'cpen-elect', code:'CS 3350', title:'Technical elective option', sub:'CpE elective pool', cr:3, term:'Confirm', termC:'u', prereq:'Varies', preC:'u', dflt:null},
    		{id:'cs4100', cat:'cpen-elect', code:'CS 4100', title:'Technical elective option', sub:'CpE elective pool', cr:3, term:'Confirm', termC:'u', prereq:'Varies', preC:'u', dflt:null},
    		{id:'cs4220', cat:'cpen-elect', code:'CS 4220', title:'Technical elective option', sub:'CpE elective pool', cr:3, term:'Confirm', termC:'u', prereq:'Varies', preC:'u', dflt:null},
    		{id:'cs4600', cat:'cpen-elect', code:'CS 4600', title:'Technical elective option', sub:'CpE elective pool', cr:3, term:'Confirm', termC:'u', prereq:'Varies', preC:'u', dflt:null},
    		{id:'cs4700', cat:'cpen-elect', code:'CS 4700', title:'Technical elective option', sub:'CpE elective pool', cr:3, term:'Confirm', termC:'u', prereq:'Varies', preC:'u', dflt:null},
    		{id:'cs4800', cat:'cpen-elect', code:'CS 4800', title:'Technical elective option', sub:'CpE elective pool', cr:3, term:'Confirm', termC:'u', prereq:'Varies', preC:'u', dflt:null},
    		{id:'cs4820', cat:'cpen-elect', code:'CS 4820', title:'Technical elective option', sub:'CpE elective pool', cr:3, term:'Confirm', termC:'u', prereq:'Varies', preC:'u', dflt:null},
    		{id:'ece3003', cat:'cpen-elect', code:'ECE 3003', title:'Advanced Robotics', sub:'CpE elective pool — non-overlapping with your EE core', cr:3, term:'Confirm', termC:'u', prereq:'Varies', preC:'u', dflt:null},
    		{id:'ece4211', cat:'cpen-elect', code:'ECE 4211', title:'Rapid Prototyping with FPGAs', sub:'CpE elective pool — non-overlapping with your EE core', cr:3, term:'Spring only', termC:'c', prereq:'Varies', preC:'u', dflt:null},
    		{id:'ece4222', cat:'cpen-elect', code:'ECE 4222', title:'Deep Learning', sub:'CpE elective pool — not on standard rotation, confirm', cr:3, term:'Confirm', termC:'u', prereq:'Varies', preC:'u', dflt:null},
    		{id:'ece4320', cat:'cpen-elect', code:'ECE 4320', title:'Technical elective option', sub:'CpE elective pool', cr:3, term:'Confirm', termC:'u', prereq:'Varies', preC:'u', dflt:null},

    		{id:'ece3210', cat:'ee-core', code:'ECE 3210', title:'Electronics I', sub:'already in progress — added for a complete Fall \u201926 view', cr:3, term:'Fall only', termC:'c', prereq:'ECE 2205 (per your plan)', preC:'c', dflt:'f26'},
    		{id:'cs3300', cat:'cpen-core', code:'CS 3300', title:'Intro to Software Engineering', sub:'already in progress', cr:3, term:'Spring, Summer, Fall', termC:'c', prereq:'CS 2080, CS 3060 (per your plan)', preC:'c', dflt:'f26'},
    		{id:'ece4330', cat:'ee-core', code:'ECE 4330', title:'Embedded Systems Design', sub:'already in progress', cr:3, term:'Fall only', termC:'c', prereq:'ECE 3430, CS 1450 (per your plan)', preC:'c', dflt:'f26'},
    		{id:'cs4420', cat:'cpen-core', code:'CS 4420', title:'Database Systems I', sub:'already in progress — already counts toward your CpE technical elective hours', cr:3, term:'Spring, Summer, Fall', termC:'c', prereq:'Confirmed', preC:'c', dflt:'f26'},
    		{id:'jpns3000', cat:'writing', code:'JPNS 3000', title:'Advanced Japanese I', sub:'Japanese minor — see note below on category', cr:3, term:'Confirm', termC:'c', prereq:'Confirmed', preC:'c', dflt:'f26'},
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