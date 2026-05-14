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
const DIST_DOORS = ['Puerta_2', 'Puerta_3', 'Puerta_4', 'Puerta_5', 'Puerta_7', 'Puerta_10'];

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
// UPDATE KPI + GANTT
// =========================================================
function updateDashboard() {
    if (!currentDateStr || !agendaData[currentDateStr]) {
        clearGanttAndKPIs();
        return;
    }

    const dayData = agendaData[currentDateStr];
    let totalSKUs = 0, totalLPNs = 0, totalMinutes = 0;
    let uniqueProviders = new Set();

    const blocksByDoor = {};
    puertasConfig.forEach(p => blocksByDoor[p.id] = []);

    for (const record of Object.values(dayData)) {
        if (!record?.puerta) continue;
        const doorId = record.puerta.replace(' ', '_');
        if (!blocksByDoor[doorId]) continue;

        const skus = parseInt(record.cant_sku || 0) || 0;
        const lpns = parseInt(record.cant_cajas || 0) || 0;
        const prov = record.proveedor || 'DESCONOCIDO';
        const dest = record.tipo_destino || null;

        totalSKUs += skus;
        totalLPNs += lpns;
        uniqueProviders.add(prov);

        if (record.hora_inicio && record.hora_fin) {
            const diff = timeToMinutes(record.hora_fin) - timeToMinutes(record.hora_inicio);
            if (diff > 0) totalMinutes += diff;
        }

        blocksByDoor[doorId].push({
            id: record.id_cita || doorId + '_' + record.hora_inicio,
            startTime: record.hora_inicio,
            endTime: record.hora_fin,
            title: prov,
            skus, lpns,
            personal: record.personal_requerido || 'N/A',
            estado: record.estado || 'Agendado',
            tipo_destino: dest
        });
    }

    // KPIs
    document.getElementById('kpi-skus').textContent = totalSKUs;
    document.getElementById('spark-skus').style.width = Math.min((totalSKUs / 1000) * 100, 100) + '%';

    document.getElementById('kpi-lpns').textContent = totalLPNs;
    document.getElementById('spark-lpns').style.width = Math.min((totalLPNs / 1000) * 100, 100) + '%';

    document.getElementById('kpi-proveedores').textContent = uniqueProviders.size;
    document.getElementById('spark-prov').style.width = Math.min((uniqueProviders.size / 50) * 100, 100) + '%';

    const maxCapacityMinutes = 10 * 9.5 * 60; // 5700 min
    const availableMinutes = Math.max(maxCapacityMinutes - totalMinutes, 0);
    document.getElementById('kpi-horas').textContent = (availableMinutes / 60).toFixed(1);
    document.getElementById('spark-horas').style.width = Math.min((availableMinutes / maxCapacityMinutes) * 100, 100) + '%';

    const cap = Math.min(Math.round((totalMinutes / maxCapacityMinutes) * 100), 100);
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

            // Corte almuerzo 12:00–13:00
            const lunchStart = 12 * 60;
            const lunchEnd = 13 * 60;
            let subBlocks = [];

            if (startMin < lunchStart && endMin > lunchEnd) {
                subBlocks.push({ start: startMin, end: lunchStart });
                subBlocks.push({ start: lunchEnd, end: endMin });
            } else if (startMin < lunchStart && endMin > lunchStart) {
                subBlocks.push({ start: startMin, end: lunchStart });
            } else if (startMin < lunchEnd && endMin > lunchEnd) {
                subBlocks.push({ start: lunchEnd, end: endMin });
            } else {
                subBlocks.push({ start: startMin, end: endMin });
            }

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
