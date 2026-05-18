
// =========================================================
// CONFIGURACIÓN GANTT Y CONSTANTES
// =========================================================
const GANTT_START_HOUR = 7;
const GANTT_START_MIN = 30; // Nuevo: empieza en 07:30
const GANTT_END_HOUR = 17;
const GANTT_END_MIN = 30;
let PX_PER_MINUTE = 2;

// Estado Global
let agendaData = {};
let currentDateStr = '';
let currentRole = null; // 'supervisor' | 'proveedor'

let puertasConfig = [
    { id: 'Puerta_1', label: 'PUERTA 1', type: 'door-cyan' },
    { id: 'Puerta_2', label: 'PUERTA 2', type: 'door-cyan' },
    { id: 'Puerta_3', label: 'PUERTA 3', type: 'door-cyan' },
    { id: 'Puerta_4', label: 'PUERTA 4', type: 'door-cyan' },
    { id: 'Puerta_5', label: 'PUERTA 5', type: 'door-cyan' },
    { id: 'Puerta_6', label: 'PUERTA 6', type: 'door-red' },
    { id: 'Puerta_7', label: 'PUERTA 7', type: 'door-red' },
    { id: 'Puerta_8', label: 'PUERTA 8', type: 'door-orange' },
    { id: 'Puerta_9', label: 'PUERTA 9', type: 'door-orange' },
    { id: 'Puerta_10', label: 'PUERTA 10', type: 'door-green' }
];

// Colores de barras
const BAR_COLORS = ['bg-cyan', 'bg-blue', 'bg-green', 'bg-orange', 'bg-purple'];

// Puertas con bloque DISTRIBUCIÓN (07:30-08:30)
const DIST_DOORS = ['Puerta_2', 'Puerta_3', 'Puerta_4', 'Puerta_5', 'Puerta_7'];

// Puertas con bloqueo extendido RESTRINGIDO (07:30-14:00)
const RESTRICTED_DOORS = ['Puerta_9', 'Puerta_10'];
// Credenciales
// Eliminadas para forzar rol de supervisor

// =========================================================
// SUPABASE
// =========================================================
const supabaseUrl = 'https://kdclsbscslklcypclohj.supabase.co';
const supabaseKey = 'sb_publishable_-jYliISAOxmckNHeoXMkpQ_7DIP0vp0';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// =========================================================
// DOM READY
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    currentRole = 'supervisor';

    const dashApp = document.getElementById('dashApp');
    if (dashApp) dashApp.style.display = 'flex';

    // Mostrar badge de rol en header
    const badge = document.createElement('div');
    badge.id = 'roleBadge';
    badge.className = 'role-badge-sup';
    badge.innerHTML = '<i class="fas fa-shield-halved"></i> Supervisor';
    const controls = document.querySelector('.header-controls');
    if (controls) controls.prepend(badge);

    // LOGIC: HOME REDIRECTION (PORTAL MAESTRO)
    const btnHome = document.getElementById('btnHome');
    if (btnHome) {
        btnHome.onclick = () => window.location.href = 'http://10.170.20.169:3004';
    }

    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
        btnRefresh.onclick = () => location.reload();
    }

    initClock();
    setupSupabase();

    // SIDEBAR INCIDENCES LOGIC
    const incidentsTab = document.getElementById('incidentsTab');
    const incidentsSidebar = document.getElementById('incidentsSidebar');
    const dashAppContainer = document.getElementById('dashApp');

    if (incidentsTab && incidentsSidebar) {
        incidentsTab.onclick = () => {
            const isHidden = incidentsSidebar.classList.toggle('hidden');
            dashAppContainer.classList.toggle('sidebar-open', !isHidden);

            // Toggle icon
            const icon = incidentsTab.querySelector('i');
            if (icon) {
                icon.className = isHidden ? 'fas fa-angles-left' : 'fas fa-angles-right';
            }

            if (!isHidden) {
                fetchIncidencias();
            }
        };
    }
});

// =========================================================
// ERROR MODAL LOGIC
// =========================================================
const errorModal = document.getElementById('errorModal');
const errorModalTitle = document.getElementById('errorModalTitle');
const errorModalMsg = document.getElementById('errorModalMsg');
const errorBtnOk = document.getElementById('errorBtnOk');
const errorBtnYesNo = document.getElementById('errorBtnYesNo');
const errorBtnYes = document.getElementById('errorBtnYes');
const errorBtnNo = document.getElementById('errorBtnNo');

let modalYesCallback = null;
let modalNoCallback = null;

function showModal(msg, title = 'Sistema CEDIS', type = 'ok', onYes = null, onNo = null) {
    errorModalTitle.textContent = title;
    errorModalMsg.textContent = msg;
    if (type === 'yesno') {
        errorBtnOk.style.display = 'none';
        errorBtnYesNo.style.display = 'flex';
        modalYesCallback = onYes;
        modalNoCallback = onNo;
    } else {
        errorBtnOk.style.display = 'block';
        errorBtnYesNo.style.display = 'none';
    }
    errorModal.classList.remove('hidden');
}

function hideModal() { errorModal.classList.add('hidden'); }

errorBtnOk.addEventListener('click', hideModal);
errorBtnYes.addEventListener('click', () => { hideModal(); if (modalYesCallback) modalYesCallback(); });
errorBtnNo.addEventListener('click', () => { hideModal(); if (modalNoCallback) modalNoCallback(); });

// FUNCIONES DE LOGIN ELIMINADAS

// =========================================================
// RELOJ SUPERIOR
// =========================================================
function initClock() {
    const clockEl = document.getElementById('current-datetime');
    function tick() {
        const now = new Date();
        const str = now.toLocaleString('es-ES', {
            month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
        }).toUpperCase();
        clockEl.textContent = str.replace(',', '');
    }
    tick();
    setInterval(tick, 1000);
}

// =========================================================
// SUPABASE SETUP + REALTIME
// =========================================================
async function setupSupabase() {
    const filterInput = document.getElementById('date-picker-filter');

    const todayISO = new Date().toISOString().split('T')[0];
    if (!filterInput.value) filterInput.value = todayISO;
    currentDateStr = filterInput.value;

    // Cambio directo en el input date oculto
    filterInput.addEventListener('change', (e) => {
        currentDateStr = e.target.value;
        fetchDataForDate(currentDateStr);
    });

    // Realtime — custom-all-channel
    supabaseClient
        .channel('custom-all-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_b100' }, payload => {
            console.log('Realtime Triggered:', payload);
            fetchDataForDate(currentDateStr); // Recarga todo el dashboard para el día actual
        })
        .subscribe((status) => {
            console.log('Supabase Realtime Status:', status);
        });

    // Carga inicial
    fetchDataForDate(currentDateStr);
}





async function fetchDataForDate(dateStr) {
    try {
        const { data, error } = await supabaseClient
            .from('agenda_b100')
            .select('*')
            .eq('fecha', dateStr)
            .neq('estado', 'Eliminado');

        if (error) throw error;

        const dayData = {};
        (data || []).forEach(item => {
            dayData[item.id_cita || item.id || Math.random().toString(36)] = item;
        });

        agendaData = { [dateStr]: dayData };

        const containerWidth = document.querySelector('.gantt-section').clientWidth - 164;
        const totalMins = ((GANTT_END_HOUR * 60 + GANTT_END_MIN) - (GANTT_START_HOUR * 60 + GANTT_START_MIN));
        // +30 de margen visual pero lo limitamos para no tener scroll
        PX_PER_MINUTE = Math.max(containerWidth / (totalMins + 30), 1);
        document.documentElement.style.setProperty('--gantt-hour-width', `${30 * PX_PER_MINUTE}px`);
        document.documentElement.style.setProperty('--gantt-px-min', `${PX_PER_MINUTE}`);

        buildGanttGrid();
        updateDashboard();
        fetchIncidencias(); // Ensure sidebar stays in sync with date

    } catch (err) {
        console.error('Supabase Error:', err);
    }
}

// =========================================================
    // MATRIZ DE MINUTOS REALES COMPARTIDOS POR INFRAESTRUCTURA
    // =========================================================
    const REAL_CEDIS_CAPACITY_MINUTES = 77 * 60; // 4620 minutos totales
    let totalMinutesOcupadosCEDIS = 0;

    const DIST_DOORS = ['Puerta_2', 'Puerta_3', 'Puerta_4', 'Puerta_5', 'Puerta_7'];
    const RESTRICTED_DOORS = ['Puerta_9', 'Puerta_10'];

    // Calculamos la ocupación real puerta por puerta de manera paralela
    puertasConfig.forEach(p => {
        let minsEnEstaPuerta = 0;

        // 1. Cargar bloqueos estáticos iniciales de la mañana
        if (RESTRICTED_DOORS.includes(p.id)) {
            minsEnEstaPuerta += 390; // Bloqueo de 07:30 a 14:00 (6.5 hrs)
        } else if (DIST_DOORS.includes(p.id)) {
            minsEnEstaPuerta += 60;  // Bloqueo de 07:30 a 08:30 (1 hr)
        }

        // 2. Sumar las citas de proveedores asignadas a esta puerta
        const doorId = p.id;
        if (blocksByDoor[doorId]) {
            blocksByDoor[doorId].forEach(record => {
                if (record.startTime && record.endTime) {
                    let s = timeToMinutes(record.startTime);
                    let e = timeToMinutes(record.endTime);
                    
                    // Restar el almuerzo del proveedor si su cita pasa por ahí
                    // para que no duplique minutos que ya están libres
                    if (s < 12*60 && e > 12*60+30) {
                        minsEnEstaPuerta += (e - s) - 30; // Quitamos los 30 min de comida
                    } else {
                        minsEnEstaPuerta += (e - s);
                    }
                }
            });
        }

        // Tope operativo: Ninguna puerta puede trabajar más de la jornada diaria (9.5 horas = 570 min)
        totalMinutesOcupadosCEDIS += Math.min(minsEnEstaPuerta, 570);
    });

    // --- RENDERIZADO DE KPIS BLINDADOS ---
    const availableMinutes = Math.max(REAL_CEDIS_CAPACITY_MINUTES - totalMinutesOcupadosCEDIS, 0);
    
    // Si la pantalla está colapsada de camiones, esto marcará un valor cercano a 0 o el colchón real matutino de las puertas 1 y 6
    document.getElementById('kpi-horas').textContent = (availableMinutes / 60).toFixed(1);
    
    const sparkHorasWidth = Math.min((availableMinutes / REAL_CEDIS_CAPACITY_MINUTES) * 100, 100);
    document.getElementById('spark-horas').style.width = sparkHorasWidth + '%';

    // Porcentaje de ocupación real de la agenda
    const cap = Math.min(Math.round((totalMinutesOcupadosCEDIS / REAL_CEDIS_CAPACITY_MINUTES) * 100), 100);
    document.getElementById('kpi-capacidad').textContent = cap + '%';
    document.getElementById('spark-cap').style.width = cap + '%';
    
    // --- CÁLCULO DE CAPACIDAD REAL CON MATRICES PARALELAS ---
    const REAL_CEDIS_CAPACITY_MINUTES = 77 * 60; // 4620 minutos totales en el CEDIS
    
    // Sumamos la ocupación real de cada puerta cuidando de no exceder el límite operativo diario por puerta (9.5 horas = 570 min)
    let totalMinutesOcupadosCEDIS = 0;
    puertasConfig.forEach(p => {
        const minsOcupadosEnPuerta = Math.min(occupiedMinutesByDoor[p.id], 570);
        totalMinutesOcupadosCEDIS += minsOcupadosEnPuerta;
    });

    // Horas disponibles reales (ahora sí considerará los huecos libres de las puertas 1 y 6)
    const availableMinutes = Math.max(REAL_CEDIS_CAPACITY_MINUTES - totalMinutesOcupadosCEDIS, 0);
    document.getElementById('kpi-horas').textContent = (availableMinutes / 60).toFixed(1);
    
    const sparkHorasWidth = Math.min((availableMinutes / REAL_CEDIS_CAPACITY_MINUTES) * 100, 100);
    document.getElementById('spark-horas').style.width = sparkHorasWidth + '%';

    // Porcentaje de ocupación real de la infraestructura general
    const cap = Math.min(Math.round((totalMinutesOcupadosCEDIS / REAL_CEDIS_CAPACITY_MINUTES) * 100), 100);
    document.getElementById('kpi-capacidad').textContent = cap + '%';
    document.getElementById('spark-cap').style.width = cap + '%';

    renderGanttBars(blocksByDoor);
}

function clearGanttAndKPIs() {
    ['kpi-skus', 'kpi-lpns', 'kpi-proveedores', 'kpi-horas'].forEach(id =>
        document.getElementById(id).textContent = '0'
    );
    document.getElementById('kpi-capacidad').textContent = '0%';
    document.querySelectorAll('.sparkline-fill').forEach(el => el.style.width = '0%');
    document.getElementById('gantt-bars-container').innerHTML = '';
}

// =========================================================
// BUILD GANTT GRID
// =========================================================
function buildGanttGrid() {
    const yAxis = document.getElementById('gantt-y-axis');
    const xAxis = document.getElementById('gantt-x-axis');
    const gridCont = document.getElementById('gantt-grid');
    const barsCont = document.getElementById('gantt-bars-container');

    // Limpiar
    yAxis.innerHTML = '<div class="gantt-corner">PUERTAS</div>';
    xAxis.innerHTML = '';
    gridCont.innerHTML = '';
    barsCont.innerHTML = '';

    // Puertas (Y-Axis)
    puertasConfig.forEach(p => {
        const div = document.createElement('div');
        div.className = `door-label ${p.type}`;
        div.innerHTML = `<span class="badge">${p.label}</span>`;
        yAxis.appendChild(div);

        const row = document.createElement('div');
        row.className = 'gantt-row';
        row.dataset.door = p.id;
        barsCont.appendChild(row);
    });

    // Horas (X-Axis) — desde 07:30
    const ganttStartMin = GANTT_START_HOUR * 60 + GANTT_START_MIN; // 450
    const ganttEndMin = GANTT_END_HOUR * 60 + GANTT_END_MIN;   // 1050
    const totalMins = ganttEndMin - ganttStartMin; // 600 min
    const totalSlots = totalMins / 30; // 20 slots de 30 min

    for (let i = 0; i <= totalSlots; i++) {
        const minsFromStart = i * 30;
        const absMin = ganttStartMin + minsFromStart;
        const h = Math.floor(absMin / 60);
        const m = absMin % 60;

        const col = document.createElement('div');
        col.className = 'time-slot';
        col.style.width = `${30 * PX_PER_MINUTE}px`;
        col.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        xAxis.appendChild(col);

        const line = document.createElement('div');
        line.className = 'grid-line';
        line.style.width = `${30 * PX_PER_MINUTE}px`;
        gridCont.appendChild(line);
    }

    // Scanner line
    const scanner = document.createElement('div');
    scanner.className = 'scanner-line';
    gridCont.appendChild(scanner);

    // Franja ALMUERZO (12:00-13:00) — overlay visual
    const refMin2 = ganttStartMin;
    const l1Left = (12 * 60 - refMin2) * PX_PER_MINUTE;
    const l1Width = (60) * PX_PER_MINUTE;
    const lunchEl = document.createElement('div');
    lunchEl.className = 'lunch-block';
    lunchEl.style.left = l1Left + 'px';
    lunchEl.style.width = l1Width + 'px';
    lunchEl.innerHTML = '<div class="lunch-text label-huge">ALMUERZO</div>';
    gridCont.appendChild(lunchEl);

    // Barras de DISTRIBUCIÓN (07:30-08:30) como barras Gantt grises estáticas
    addDistribucionBars(barsCont, ganttStartMin);
    }

function addDistribucionBars(barsCont, ganttStartMin) {
    const distStart = 7 * 60 + 30; // 450
    const distEnd = 8 * 60 + 30; // 510
    const leftPx = (distStart - ganttStartMin) * PX_PER_MINUTE;
    const widthPx = (distEnd - distStart) * PX_PER_MINUTE;

    puertasConfig.forEach(p => {
        if (!DIST_DOORS.includes(p.id)) return;
        const row = barsCont.querySelector(`.gantt-row[data-door="${p.id}"]`);
        if (!row) return;

        const bar = document.createElement('div');
        bar.className = 'gantt-bar dist-static-bar';
        bar.style.left = leftPx + 'px';
        bar.style.width = Math.max(widthPx, 2) + 'px';
        bar.dataset.isDistribucion = 'true';
        bar.innerHTML = `<div class="gantt-bar-content"><span class="gantt-bar-title dist-label">DISTRIBUCIÓN</span></div>`;
        row.appendChild(bar);
    });
}

// =========================================================
// RENDER BARS
// =========================================================
function renderGanttBars(blocksByDoor) {
    const barsCont = document.getElementById('gantt-bars-container');
    barsCont.querySelectorAll('.gantt-row').forEach(row => {
        // Solo borrar barras dinámicas (proveedores), preservar las de distribución
        row.querySelectorAll('.gantt-bar:not(.dist-static-bar)').forEach(b => b.remove());
    });

    const ganttStartMin = GANTT_START_HOUR * 60 + GANTT_START_MIN;
    const ganttEndMin = GANTT_END_HOUR * 60 + GANTT_END_MIN;

    puertasConfig.forEach(doorConf => {
        const doorBlocks = blocksByDoor[doorConf.id];
        if (!doorBlocks) return;

        const row = barsCont.querySelector(`.gantt-row[data-door="${doorConf.id}"]`);
        if (!row) return;

        doorBlocks.forEach(block => {
            if (!block.startTime || !block.endTime) return;

            const startMin = timeToMinutes(block.startTime);
            const endMin = timeToMinutes(block.endTime);

            if (endMin <= ganttStartMin || startMin >= ganttEndMin) return;
            if (endMin - startMin <= 0) return;

            // =========================================================
            // CORRECCIÓN PRE_PRO: CORTE DE ALMUERZO EXACTO (12:00 a 12:30)
            // =========================================================
            const lunchStart = 12 * 60;       // 720 minutos
            const lunchEnd = 12 * 60 + 30;    // 750 minutos
            let subBlocks = [];

            // Caso A: La cita cruza completamente todo el almuerzo
            if (startMin < lunchStart && endMin > lunchEnd) {
                subBlocks.push({ start: startMin, end: lunchStart });
                subBlocks.push({ start: lunchEnd, end: endMin });
            } 
            // Caso B: La cita empezó antes pero termina metida dentro del almuerzo
            else if (startMin < lunchStart && endMin > lunchStart && endMin <= lunchEnd) {
                subBlocks.push({ start: startMin, end: lunchStart });
            } 
            // Caso C: La cita arranca dentro del almuerzo y sale después de las 12:30
            else if (startMin >= lunchStart && startMin < lunchEnd && endMin > lunchEnd) {
                subBlocks.push({ start: lunchEnd, end: endMin });
            } 
            // Caso D: La cita está completamente fuera del horario de almuerzo
            else if (endMin <= lunchStart || startMin >= lunchEnd) {
                subBlocks.push({ start: startMin, end: endMin });
            }
            // Nota: Si la cita cae 100% adentro del almuerzo, no se agrega nada (se bloquea)

            // LÓGICA DE COLORES POR ESTADO (NUEVO)
            let barColor = 'bg-yellow'; // default
            const st = (block.estado || 'Agendado').toLowerCase();

            if (st === 'ingreso packing list') barColor = 'bg-green';
            else if (st === 'recepcionado') barColor = 'bg-blue';
            else if (st === 'cancelado') barColor = 'bg-red';

            // Clase extra para DP/CDS y Cancelados (Láser)
            let destClass = '';
            if (block.tipo_destino === 'DP') destClass = 'bar-dp';
            if (block.tipo_destino === 'CDS') destClass = 'bar-cds';
            if (st.startsWith('cancelado')) destClass += ' bar-cancelled';
            if (st === 'recepcionado') destClass += ' bar-received'; // Opcional

            subBlocks.forEach((sb, idx) => {
                const cS = Math.max(sb.start, ganttStartMin);
                const cE = Math.min(sb.end, ganttEndMin);
                if (cS >= cE) return;

                const leftPx = (cS - ganttStartMin) * PX_PER_MINUTE;
                const widthPx = (cE - cS) * PX_PER_MINUTE;

                const bar = document.createElement('div');
                bar.className = `gantt-bar ${barColor} ${destClass}`;
                bar.style.left = leftPx + 'px';
                bar.style.width = Math.max(widthPx, 2) + 'px';

                const isMain = (idx === 0);
                bar.innerHTML = `
                    <div class="gantt-bar-content">
                        <span class="gantt-bar-title">${isMain ? block.title : ''}</span>
                        ${isMain && widthPx > 80 ? `<span class="gantt-bar-meta">SKU:${block.skus}</span>` : ''}
                    </div>`;

                bar.addEventListener('mouseenter', e => showTooltip(e, block));
                bar.addEventListener('mousemove', moveTooltip);
                bar.addEventListener('mouseleave', hideTooltip);

                row.appendChild(bar);
            });
        });
    });
}

// =========================================================
// HELPERS
// =========================================================
function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

// =========================================================
// TOOLTIP + ELIMINAR (Solo Supervisor)
// =========================================================
const tooltipEl = document.getElementById('custom-tooltip');

function showTooltip(e, data) {
    const delBtn = currentRole === 'supervisor'
        ? `<div style="margin-top:10px;">
             <button class="del-cita-btn" onclick="deleteCita('${data.id}')">
               <i class="fas fa-trash-alt"></i> Eliminar Cita
             </button>
           </div>`
        : '';

    const destBadge = data.tipo_destino
        ? `<div class="tooltip-row"><span class="tooltip-label">Destino:</span>
           <span class="tooltip-val ${data.tipo_destino === 'DP' ? 'text-dp' : 'text-cds'}">${data.tipo_destino}</span></div>`
        : '';

    tooltipEl.innerHTML = `
        <div class="tooltip-title">${data.title}</div>
        <div class="tooltip-row"><span class="tooltip-label">Horario:</span><span class="tooltip-val">${data.startTime} — ${data.endTime}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Estado:</span><span class="tooltip-val text-cyan">${data.estado}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">SKUs:</span><span class="tooltip-val">${data.skus}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Personal:</span><span class="tooltip-val">${data.personal}</span></div>
        ${destBadge}
        ${delBtn}
    `;
    tooltipEl.classList.add('visible');
}

function hideTooltip() { tooltipEl.classList.remove('visible'); }

function moveTooltip(e) {
    let top = e.clientY + 15;
    let left = e.clientX + 15;
    if (left + 230 > window.innerWidth) left = e.clientX - 240;
    if (top + 180 > window.innerHeight) top = e.clientY - 190;
    tooltipEl.style.top = top + 'px';
    tooltipEl.style.left = left + 'px';
}

function deleteCita(id) {
    showModal('¿Confirma la eliminación de esta cita?', 'Eliminar Cita', 'yesno', async () => {
        hideTooltip();
        try {
            const { error } = await supabaseClient
                .from('agenda_b100')
                .delete()
                .eq('id_cita', id);
            if (error) throw error;
        } catch (err) {
            showModal('Error al eliminar: ' + err.message, 'Error Crítico');
        }
    });
}
// =========================================================
// INCIDENCIAS MODULE
// =========================================================
async function fetchIncidencias() {
    const tableWrapper = document.querySelector('.incidents-table-wrapper');
    try {
        if (!currentDateStr) return;

        // SHOW LOADING SPINNER
        if (tableWrapper) {
            tableWrapper.innerHTML = `
                <div class="empty-incidents">
                    <i class="fas fa-circle-notch fa-spin" style="font-size:30px; margin-bottom:15px; color:var(--neon-cyan);"></i>
                    <span>Buscando incidencias...</span>
                </div>
            `;
        }

        // FILTRADO POR FECHA: YYYY-MM-DD puro sin desfases
        const selectedDateStr = currentDateStr;
        console.log("Fecha enviada a Supabase (Centro de Incidencias):", selectedDateStr);

        // QUERY CORREGIDA: Usar 'motivos' (PLURAL) para evitar ERROR 42703
        const { data, error } = await supabaseClient
            .from('incidencias_proveedores')
            .select('proveedor, incidencias, motivos, tipo, hr_atraso, hr_perdida')
            .eq('fecha', selectedDateStr);

        if (error) throw error;

        if (!data || data.length === 0) {
            if (tableWrapper) {
                tableWrapper.innerHTML = `
                    <div class="empty-incidents">
                        <i class="fas fa-search" style="font-size:25px; margin-bottom:10px; opacity:0.4;"></i>
                        <span style="text-align:center;">Sin incidencias para esta fecha</span>
                    </div>`;
            }
            return;
        }

        renderIncidencias(data, selectedDateStr);
    } catch (err) {
        console.error('Error fetching incidencias:', err);
        if (tableWrapper) {
            tableWrapper.innerHTML = `<div class="empty-incidents">Error en la conexión a Supabase</div>`;
        }
    }
}

function renderIncidencias(data, dateStr) {
    const tableWrapper = document.querySelector('.incidents-table-wrapper');
    if (!tableWrapper) return;

    // ESTRUCTURA DE TABLA CON 4 COLUMNAS (Motivos se consulta pero se oculta en UI)
    tableWrapper.innerHTML = `
        <table class="incidents-table">
            <thead>
                <tr>
                    <th>PROVEEDOR</th>
                    <th>INCIDENCIA</th>
                    <th>TIPO</th>
                    <th style="width:60px; text-align:center;">Hrs Perd.</th>
                </tr>
            </thead>
            <tbody id="incidents-body">
                ${data.map(item => {
                    // Lógica de Horas: Si es 'NO VINO' -> hr_perdida, de lo contrario hr_atraso
                    const st = (item.tipo || '').toUpperCase();
                    const isNoVino = st === 'NO VINO';
                    const rawTimeValue = isNoVino ? item.hr_perdida : item.hr_atraso;

                    const formatTime = (val) => {
                        if (!val) return '00:00';
                        if (typeof val === 'string' && val.includes(':')) return val.substring(0, 5);
                        return val;
                    };

                    return `
                        <tr>
                            <td class="col-prov">${item.proveedor || 'N/A'}</td>
                            <td class="col-inc">${item.incidencias || 'N/A'}</td>
                            <td class="col-tipo">${item.tipo || '...'}</td>
                            <td class="col-hrs">${formatTime(rawTimeValue)}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}
