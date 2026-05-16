// ==================== DATA ====================

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const DAY_NAMES_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

// ==================== STATE ====================

const state = {
    activeShift: null,
    shifts: [],
    settings: {
        currencyRate: 90,
        monthlyGoalUSD: 3000,
        currentMonth: ''
    },
    translations: [],
    currentFilter: 'today',
    currentStatPeriod: 'week',
    calendarDate: new Date(),
    translateDir: 'ru-en',
    timerInterval: null,
    editingShiftId: null
};

// ==================== STORAGE ====================

const storage = {
    save() {
        localStorage.setItem('wt_activeShift', JSON.stringify(state.activeShift));
        localStorage.setItem('wt_shifts', JSON.stringify(state.shifts));
        localStorage.setItem('wt_settings', JSON.stringify(state.settings));
        localStorage.setItem('wt_translations', JSON.stringify(state.translations));
    },
    load() {
        try {
            const as = localStorage.getItem('wt_activeShift');
            if (as && as !== 'null') state.activeShift = JSON.parse(as);
        } catch(e) {}
        try {
            const s = localStorage.getItem('wt_shifts');
            if (s) state.shifts = JSON.parse(s);
        } catch(e) {}
        try {
            const st = localStorage.getItem('wt_settings');
            if (st) {
                const parsed = JSON.parse(st);
                state.settings = { ...state.settings, ...parsed };
            }
        } catch(e) {}
        try {
            const t = localStorage.getItem('wt_translations');
            if (t) state.translations = JSON.parse(t);
        } catch(e) {}

        const currentMonthKey = new Date().toISOString().slice(0, 7);
        if (state.settings.currentMonth !== currentMonthKey) {
            state.settings.currentMonth = currentMonthKey;
            storage.save();
        }
    }
};

// ==================== HELPERS ====================

function fmt(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function fmtShort(ms) {
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m}м`;
    return `${h}ч ${m}м`;
}

function fmtMoney(usd) {
    const rub = usd * state.settings.currencyRate;
    return `$${usd.toFixed(2)} / ₽${Math.round(rub).toLocaleString('ru-RU')}`;
}

function fmtUSD(usd) {
    return `$${usd.toFixed(2)}`;
}

function fmtRUB(usd) {
    return `₽${Math.round(usd * state.settings.currencyRate).toLocaleString('ru-RU')}`;
}

function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
}

function getShiftsForPeriod(period) {
    const now = new Date();
    const today = getTodayStr();

    return state.shifts.filter(s => {
        if (period === 'today') return s.date === today;
        if (period === 'week') {
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return new Date(s.date) >= weekAgo;
        }
        if (period === 'month') {
            return s.date.slice(0, 7) === now.toISOString().slice(0, 7);
        }
        return true;
    });
}

function getShiftsForStatPeriod(period) {
    const now = new Date();
    if (period === 'week') {
        const start = new Date(now);
        start.setDate(start.getDate() - 7);
        return state.shifts.filter(s => new Date(s.date) >= start);
    }
    if (period === 'month') {
        const monthStr = now.toISOString().slice(0, 7);
        return state.shifts.filter(s => s.date.slice(0, 7) === monthStr);
    }
    return state.shifts;
}

function getTotalMs(shifts) {
    return shifts.reduce((sum, s) => sum + s.durationMs, 0);
}

function getTotalUSD(shifts) {
    return shifts.reduce((sum, s) => sum + s.earningsUSD, 0);
}

function getTodayShifts() {
    const today = getTodayStr();
    return state.shifts.filter(s => s.date === today);
}

function getMonthlyEarnings() {
    const monthStr = new Date().toISOString().slice(0, 7);
    return state.shifts
        .filter(s => s.date.slice(0, 7) === monthStr)
        .reduce((sum, s) => sum + s.earningsUSD, 0);
}

// ==================== APP ====================

const app = {
    init() {
        storage.load();
        this.loadSettingsUI();
        this.renderTranslateHistory();

        if (state.activeShift && state.activeShift.startTime) {
            this.startTimerUI(true);
        }

        this.updateHome();
        this.renderHistory();
        this.renderStats();

        document.getElementById('modal-earnings').addEventListener('input', function() {
            const usd = parseFloat(this.value) || 0;
            document.getElementById('modal-earnings-rub').textContent = `≈ ${fmtRUB(usd)}`;
        });

        document.getElementById('edit-earnings').addEventListener('input', function() {
            const usd = parseFloat(this.value) || 0;
            document.getElementById('edit-earnings-rub').textContent = `≈ ${fmtRUB(usd)}`;
        });

        this.updateTimerDisplay();
        state.timerInterval = setInterval(() => app.updateTimerDisplay(), 1000);
    },

    // --- TAB NAVIGATION ---
    switchTab(tab) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`screen-${tab}`).classList.add('active');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');

        if (tab === 'history') this.renderHistory();
        if (tab === 'stats') this.renderStats();
        if (tab === 'home') this.updateHome();
    },

    // --- TIMER ---
    toggleTimer() {
        if (state.activeShift) {
            this.showEndShiftModal();
        } else {
            state.activeShift = { startTime: Date.now() };
            storage.save();
            this.startTimerUI(false);
            this.updateHome();
        }
    },

    startTimerUI(resumed) {
        const btn = document.getElementById('btn-timer');
        btn.className = 'btn-timer btn-stop';
        btn.innerHTML = '⏹ Остановить';
        document.getElementById('timer-status').classList.remove('hidden');
        if (!resumed) {
            btn.style.animation = 'none';
            btn.offsetHeight;
        }
    },

    stopTimerUI() {
        const btn = document.getElementById('btn-timer');
        btn.className = 'btn-timer btn-start';
        btn.innerHTML = '▶ Начать смену';
        document.getElementById('timer-status').classList.add('hidden');
    },

    updateTimerDisplay() {
        if (state.activeShift && state.activeShift.startTime) {
            const elapsed = Date.now() - state.activeShift.startTime;
            document.getElementById('timer-display').textContent = fmt(elapsed);
        } else {
            document.getElementById('timer-display').textContent = '00:00:00';
        }
    },

    showEndShiftModal() {
        const elapsed = Date.now() - state.activeShift.startTime;
        document.getElementById('modal-duration').textContent = fmtShort(elapsed);
        document.getElementById('modal-earnings').value = '';
        document.getElementById('modal-comment').value = '';
        document.getElementById('modal-earnings-rub').textContent = '≈ ₽0';
        document.getElementById('modal-end-shift').classList.remove('hidden');
    },

    cancelEndShift() {
        document.getElementById('modal-end-shift').classList.add('hidden');
    },

    saveShift() {
        const earnings = parseFloat(document.getElementById('modal-earnings').value) || 0;
        const comment = document.getElementById('modal-comment').value.trim();
        const startTime = state.activeShift.startTime;
        const endTime = Date.now();
        const durationMs = endTime - startTime;

        const startDate = new Date(startTime);
        const endDate = new Date(endTime);

        const shift = {
            id: String(startTime),
            date: startDate.toISOString().slice(0, 10),
            start: startDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            end: endDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            durationMs,
            earningsUSD: earnings,
            comment
        };

        state.shifts.unshift(shift);
        state.activeShift = null;
        storage.save();

        this.stopTimerUI();
        document.getElementById('modal-end-shift').classList.add('hidden');
        this.updateHome();
        this.renderHistory();
    },

    // --- EDIT SHIFT ---
    editShift(id) {
        const shift = state.shifts.find(s => s.id === id);
        if (!shift) return;

        state.editingShiftId = id;

        document.getElementById('edit-date').value = shift.date;
        document.getElementById('edit-start').value = shift.start;
        document.getElementById('edit-end').value = shift.end;
        document.getElementById('edit-earnings').value = shift.earningsUSD;
        document.getElementById('edit-comment').value = shift.comment || '';
        document.getElementById('edit-earnings-rub').textContent = `≈ ${fmtRUB(shift.earningsUSD)}`;

        document.getElementById('modal-edit-shift').classList.remove('hidden');
    },

    cancelEditShift() {
        document.getElementById('modal-edit-shift').classList.add('hidden');
        state.editingShiftId = null;
    },

    saveEditShift() {
        const shift = state.shifts.find(s => s.id === state.editingShiftId);
        if (!shift) return;

        const newDate = document.getElementById('edit-date').value;
        const newStart = document.getElementById('edit-start').value;
        const newEnd = document.getElementById('edit-end').value;
        const newEarnings = parseFloat(document.getElementById('edit-earnings').value) || 0;
        const newComment = document.getElementById('edit-comment').value.trim();

        if (newDate) shift.date = newDate;
        if (newStart) shift.start = newStart;
        if (newEnd) shift.end = newEnd;

        if (newStart && newEnd) {
            const [sh, sm] = newStart.split(':').map(Number);
            const [eh, em] = newEnd.split(':').map(Number);
            const startMin = sh * 60 + sm;
            const endMin = eh * 60 + em;
            let diffMin = endMin - startMin;
            if (diffMin < 0) diffMin += 24 * 60;
            shift.durationMs = diffMin * 60000;
        }

        shift.earningsUSD = newEarnings;
        shift.comment = newComment;

        storage.save();
        document.getElementById('modal-edit-shift').classList.add('hidden');
        state.editingShiftId = null;

        this.renderHistory();
        this.updateHome();
        this.renderStats();
    },

    // --- HOME ---
    updateHome() {
        const today = getTodayShifts();
        document.getElementById('today-shifts').textContent = today.length;
        document.getElementById('today-hours').textContent = fmtShort(getTotalMs(today));
        document.getElementById('today-earnings').textContent = fmtMoney(getTotalUSD(today));

        const monthly = getMonthlyEarnings();
        const goal = state.settings.monthlyGoalUSD;
        const pct = goal > 0 ? Math.min((monthly / goal) * 100, 100) : 0;

        document.getElementById('goal-amount').textContent = `${fmtUSD(monthly)} / ${fmtUSD(goal)}`;
        document.getElementById('goal-progress').style.width = `${pct}%`;
        document.getElementById('goal-remaining').textContent = monthly >= goal
            ? '✅ Цель достигнута!'
            : `Осталось: ${fmtUSD(goal - monthly)}`;

        this.renderWeeklyBars();
    },

    renderWeeklyBars() {
        const container = document.getElementById('weekly-bars');
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const dayShifts = state.shifts.filter(s => s.date === dateStr);
            const hours = getTotalMs(dayShifts) / 3600000;
            days.push({
                label: DAY_NAMES[d.getDay()],
                hours,
                isToday: i === 0
            });
        }

        const maxHours = Math.max(...days.map(d => d.hours), 1);

        container.innerHTML = days.map(d => {
            const h = Math.max((d.hours / maxHours) * 60, 4);
            const filled = d.hours > 0 ? 'filled' : '';
            return `
                <div class="weekly-bar-item">
                    <div class="weekly-bar ${filled}" style="height:${h}px"></div>
                    <span class="weekly-bar-label">${d.label}</span>
                </div>
            `;
        }).join('');
    },

    // --- HISTORY ---
    setFilter(f) {
        state.currentFilter = f;
        document.querySelectorAll('.filter-btn[data-filter]').forEach(b => {
            b.classList.toggle('active', b.dataset.filter === f);
        });
        this.renderHistory();
    },

    renderHistory() {
        const filtered = getShiftsForPeriod(state.currentFilter);
        const container = document.getElementById('shifts-list');
        const summaryEl = document.getElementById('shifts-summary');

        if (filtered.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-sec)">Нет смен за этот период</div>';
            summaryEl.classList.add('hidden');
            return;
        }

        container.innerHTML = filtered.map(s => {
            const dateObj = new Date(s.date + 'T00:00:00');
            const dayName = DAY_NAMES_FULL[dateObj.getDay()];
            const dateStr = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
            return `
                <div class="shift-card" id="shift-${s.id}">
                    <div class="shift-info">
                        <div class="shift-date">${dateStr}, ${dayName}</div>
                        <div class="shift-time">${s.start} → ${s.end}</div>
                        ${s.comment ? `<div class="shift-comment">${this.escapeHtml(s.comment)}</div>` : ''}
                    </div>
                    <div class="shift-earnings">
                        <div class="shift-usd">${fmtUSD(s.earningsUSD)}</div>
                        <div class="shift-rub">${fmtRUB(s.earningsUSD)}</div>
                        <div class="shift-duration">${fmtShort(s.durationMs)}</div>
                    </div>
                    <div class="shift-actions">
                        <button class="shift-edit-btn" onclick="app.editShift('${s.id}')">✏️</button>
                        <button class="shift-delete-btn" onclick="app.deleteShift('${s.id}')">🗑</button>
                    </div>
                </div>
            `;
        }).join('');

        const totalMs = getTotalMs(filtered);
        const totalUSD = getTotalUSD(filtered);
        document.getElementById('summary-total').textContent = `${fmtShort(totalMs)} | ${fmtMoney(totalUSD)}`;
        summaryEl.classList.remove('hidden');
    },

    deleteShift(id) {
        if (!confirm('Удалить эту смену?')) return;
        state.shifts = state.shifts.filter(s => s.id !== id);
        storage.save();
        this.renderHistory();
        this.updateHome();
    },

    // --- STATS ---
    setStatPeriod(p) {
        state.currentStatPeriod = p;
        document.querySelectorAll('.filter-btn[data-stat]').forEach(b => {
            b.classList.toggle('active', b.dataset.stat === p);
        });
        this.renderStats();
    },

    renderStats() {
        const shifts = getShiftsForStatPeriod(state.currentStatPeriod);
        const totalMs = getTotalMs(shifts);
        const totalUSD = getTotalUSD(shifts);
        const totalHours = totalMs / 3600000;
        const avgPerHour = totalHours > 0 ? totalUSD / totalHours : 0;
        const avgPerShift = shifts.length > 0 ? totalUSD / shifts.length : 0;

        const bestDay = this.getBestDay(shifts);
        const bestWeek = this.getBestWeek(shifts);

        document.getElementById('stats-metrics').innerHTML = `
            <div class="metric-card">
                <div class="metric-value blue">${shifts.length}</div>
                <div class="metric-label">Всего смен</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${fmtShort(totalMs)}</div>
                <div class="metric-label">Всего часов</div>
            </div>
            <div class="metric-card full-width">
                <div class="metric-value green">${fmtMoney(totalUSD)}</div>
                <div class="metric-label">Всего заработано</div>
            </div>
            <div class="metric-card">
                <div class="metric-value orange">$${avgPerHour.toFixed(2)}</div>
                <div class="metric-label">Средний $/час</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${fmtUSD(avgPerShift)}</div>
                <div class="metric-label">Средняя смена</div>
            </div>
            <div class="metric-card">
                <div class="metric-value green">${bestDay ? fmtUSD(bestDay.total) : '$0'}</div>
                <div class="metric-label">Лучший день${bestDay ? ' (' + bestDay.date + ')' : ''}</div>
            </div>
            <div class="metric-card">
                <div class="metric-value orange">${bestWeek ? fmtUSD(bestWeek.total) : '$0'}</div>
                <div class="metric-label">Лучшая неделя</div>
            </div>
        `;

        this.renderHoursChart(shifts);
        this.renderEarningsChart(shifts);
        this.renderCalendar();
    },

    getBestDay(shifts) {
        const byDay = {};
        shifts.forEach(s => {
            byDay[s.date] = (byDay[s.date] || 0) + s.earningsUSD;
        });
        let best = null;
        for (const [date, total] of Object.entries(byDay)) {
            if (!best || total > best.total) best = { date, total };
        }
        return best;
    },

    getBestWeek(shifts) {
        const byWeek = {};
        shifts.forEach(s => {
            const d = new Date(s.date);
            const weekStart = new Date(d);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            const key = weekStart.toISOString().slice(0, 10);
            byWeek[key] = (byWeek[key] || 0) + s.earningsUSD;
        });
        let best = null;
        for (const [week, total] of Object.entries(byWeek)) {
            if (!best || total > best.total) best = { week, total };
        }
        return best;
    },

    renderHoursChart(shifts) {
        const canvas = document.getElementById('chart-hours');
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = 200 * dpr;
        ctx.scale(dpr, dpr);

        const w = canvas.offsetWidth;
        const h = 200;
        const pad = { top: 10, right: 10, bottom: 30, left: 40 };

        const data = this.getChartData(shifts, 'hours');
        if (data.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.font = '14px -apple-system';
            ctx.textAlign = 'center';
            ctx.fillText('Нет данных', w / 2, h / 2);
            return;
        }

        const maxVal = Math.max(...data.map(d => d.value), 1);
        const chartW = w - pad.left - pad.right;
        const chartH = h - pad.top - pad.bottom;
        const barW = Math.min(chartW / data.length * 0.7, 30);
        const gap = chartW / data.length;

        ctx.clearRect(0, 0, w, h);

        const textColor = getComputedStyle(document.body).getPropertyValue('--text-sec') || 'rgba(255,255,255,0.55)';
        const barGradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
        barGradient.addColorStop(0, '#00E5FF');
        barGradient.addColorStop(1, '#8B5CF6');

        ctx.fillStyle = textColor;
        ctx.font = '10px -apple-system';
        ctx.textAlign = 'right';

        for (let i = 0; i <= 4; i++) {
            const y = pad.top + chartH - (i / 4) * chartH;
            const val = (i / 4) * maxVal;
            ctx.fillText(val.toFixed(1) + 'ч', pad.left - 4, y + 4);
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(w - pad.right, y);
            ctx.stroke();
        }

        data.forEach((d, i) => {
            const x = pad.left + gap * i + gap / 2;
            const barH = (d.value / maxVal) * chartH;
            const y = pad.top + chartH - barH;

            ctx.fillStyle = barGradient;
            ctx.beginPath();
            const r = Math.min(barW / 2, 4);
            ctx.moveTo(x - barW / 2, pad.top + chartH);
            ctx.lineTo(x - barW / 2, y + r);
            ctx.quadraticCurveTo(x - barW / 2, y, x - barW / 2 + r, y);
            ctx.lineTo(x + barW / 2 - r, y);
            ctx.quadraticCurveTo(x + barW / 2, y, x + barW / 2, y + r);
            ctx.lineTo(x + barW / 2, pad.top + chartH);
            ctx.fill();

            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.font = '9px -apple-system';
            ctx.fillText(d.label, x, h - 8);
        });
    },

    renderEarningsChart(shifts) {
        const canvas = document.getElementById('chart-earnings');
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = 200 * dpr;
        ctx.scale(dpr, dpr);

        const w = canvas.offsetWidth;
        const h = 200;
        const pad = { top: 10, right: 10, bottom: 30, left: 40 };

        const data = this.getChartData(shifts, 'earnings');
        if (data.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.font = '14px -apple-system';
            ctx.textAlign = 'center';
            ctx.fillText('Нет данных', w / 2, h / 2);
            return;
        }

        const maxVal = Math.max(...data.map(d => d.value), 1);
        const chartW = w - pad.left - pad.right;
        const chartH = h - pad.top - pad.bottom;

        ctx.clearRect(0, 0, w, h);

        const textColor = getComputedStyle(document.body).getPropertyValue('--text-sec') || 'rgba(255,255,255,0.55)';
        const lineColor = '#00FFA3';

        ctx.fillStyle = textColor;
        ctx.font = '10px -apple-system';
        ctx.textAlign = 'right';

        for (let i = 0; i <= 4; i++) {
            const y = pad.top + chartH - (i / 4) * chartH;
            const val = (i / 4) * maxVal;
            ctx.fillText('$' + Math.round(val), pad.left - 4, y + 4);
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(w - pad.right, y);
            ctx.stroke();
        }

        const points = data.map((d, i) => ({
            x: pad.left + (chartW / Math.max(data.length - 1, 1)) * i,
            y: pad.top + chartH - (d.value / maxVal) * chartH
        }));

        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();

        ctx.fillStyle = lineColor;
        points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.font = '9px -apple-system';
        const step = Math.max(1, Math.floor(data.length / 7));
        data.forEach((d, i) => {
            if (i % step === 0 || i === data.length - 1) {
                const x = pad.left + (chartW / Math.max(data.length - 1, 1)) * i;
                ctx.fillText(d.label, x, h - 8);
            }
        });
    },

    getChartData(shifts, type) {
        const byDate = {};
        shifts.forEach(s => {
            if (!byDate[s.date]) byDate[s.date] = { earnings: 0, ms: 0 };
            byDate[s.date].earnings += s.earningsUSD;
            byDate[s.date].ms += s.durationMs;
        });

        const sorted = Object.keys(byDate).sort();
        return sorted.map(date => {
            const d = new Date(date + 'T00:00:00');
            const label = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            return {
                label,
                value: type === 'hours' ? byDate[date].ms / 3600000 : byDate[date].earnings
            };
        });
    },

    // --- CALENDAR ---
    renderCalendar() {
        const date = state.calendarDate;
        const year = date.getFullYear();
        const month = date.getMonth();
        const today = getTodayStr();

        document.getElementById('calendar-header').innerHTML = `
            <button class="calendar-nav-btn" onclick="app.calNav(-1)">‹</button>
            <span class="month-title">${MONTH_NAMES[month]} ${year}</span>
            <button class="calendar-nav-btn" onclick="app.calNav(1)">›</button>
        `;

        const grid = document.getElementById('calendar-grid');
        let html = DAY_NAMES.map(d => `<div class="cal-day-header">${d}</div>`).join('');

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            html += '<div class="cal-day empty"></div>';
        }

        const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
        const monthShifts = state.shifts.filter(s => s.date.startsWith(monthStr));

        const hoursByDay = {};
        monthShifts.forEach(s => {
            hoursByDay[s.date] = (hoursByDay[s.date] || 0) + s.durationMs / 3600000;
        });

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === today;
            const hours = hoursByDay[dateStr] || 0;
            let levelClass = '';
            if (hours > 0) {
                let level = 1;
                if (hours >= 2) level = 2;
                if (hours >= 4) level = 3;
                if (hours >= 6) level = 4;
                levelClass = `worked level-${level}`;
            }

            html += `<div class="cal-day ${isToday ? 'today' : ''} ${levelClass}">${day}</div>`;
        }

        grid.innerHTML = html;
    },

    calNav(dir) {
        state.calendarDate.setMonth(state.calendarDate.getMonth() + dir);
        this.renderCalendar();
    },

    // --- TRANSLATOR ---
    swapTranslateDir() {
        state.translateDir = state.translateDir === 'ru-en' ? 'en-ru' : 'ru-en';
        document.getElementById('translate-dir-label').textContent = state.translateDir === 'ru-en' ? 'RU → EN' : 'EN → RU';
        document.getElementById('translate-input').placeholder = state.translateDir === 'ru-en' ? 'Введите текст на русском...' : 'Enter text in English...';
    },

    async doTranslate() {
        const input = document.getElementById('translate-input').value.trim();
        if (!input) return;

        const btn = document.getElementById('btn-translate');
        btn.textContent = '...';
        btn.disabled = true;

        const langPair = state.translateDir === 'ru-en' ? 'ru|en' : 'en|ru';

        try {
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(input)}&langpair=${langPair}`;
            const resp = await fetch(url);
            const data = await resp.json();

            let result = '';
            if (data.responseStatus === 200 && data.responseData) {
                result = data.responseData.translatedText;
            } else if (data.matches && data.matches.length > 0) {
                result = data.matches[0].translation;
            } else {
                result = 'Ошибка перевода';
            }

            document.getElementById('translate-output').textContent = result;
            document.getElementById('translate-output').classList.remove('hidden');
            document.getElementById('btn-copy-translate').classList.remove('hidden');

            state.translations.unshift({
                from: state.translateDir === 'ru-en' ? 'ru' : 'en',
                to: state.translateDir === 'ru-en' ? 'en' : 'ru',
                text: input,
                result,
                timestamp: Date.now()
            });

            if (state.translations.length > 10) state.translations = state.translations.slice(0, 10);
            storage.save();
            this.renderTranslateHistory();
        } catch (e) {
            document.getElementById('translate-output').textContent = 'Ошибка сети. Проверьте интернет.';
            document.getElementById('translate-output').classList.remove('hidden');
        }

        btn.textContent = 'Перевести';
        btn.disabled = false;
    },

    copyTranslation() {
        const text = document.getElementById('translate-output').textContent;
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById('btn-copy-translate');
            btn.textContent = 'Скопировано ✓';
            setTimeout(() => { btn.textContent = 'Копировать'; }, 1500);
        });
    },

    renderTranslateHistory() {
        const section = document.getElementById('translate-history-section');
        const container = document.getElementById('translate-history');

        if (state.translations.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        container.innerHTML = state.translations.map(t => `
            <div class="translate-history-item">
                <div class="th-original">${this.escapeHtml(t.text)}</div>
                <div class="th-result">${this.escapeHtml(t.result)}</div>
            </div>
        `).join('');
    },

    // --- SETTINGS ---
    loadSettingsUI() {
        document.getElementById('setting-rate').value = state.settings.currencyRate;
        document.getElementById('setting-goal').value = state.settings.monthlyGoalUSD;
    },

    saveSetting(key, value) {
        if (key === 'currencyRate') {
            state.settings.currencyRate = parseFloat(value) || 90;
        } else if (key === 'monthlyGoalUSD') {
            state.settings.monthlyGoalUSD = parseFloat(value) || 0;
        }
        storage.save();
        this.updateHome();
    },

    exportData() {
        const data = {
            shifts: state.shifts,
            settings: state.settings,
            translations: state.translations,
            exportDate: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `worktracker-backup-${getTodayStr()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    importData(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.shifts) state.shifts = data.shifts;
                if (data.settings) state.settings = { ...state.settings, ...data.settings };
                if (data.translations) state.translations = data.translations;
                storage.save();
                this.loadSettingsUI();
                this.updateHome();
                this.renderHistory();
                this.renderStats();
                this.renderTranslateHistory();
                alert('Данные успешно импортированы!');
            } catch (err) {
                alert('Ошибка: неверный формат файла');
            }
        };
        reader.readAsText(file);
        input.value = '';
    },

    clearAllData() {
        if (!confirm('Удалить ВСЕ данные? Это действие нельзя отменить.')) return;
        if (!confirm('Точно удалить всё?')) return;

        state.shifts = [];
        state.activeShift = null;
        state.translations = [];
        state.settings = {
            currencyRate: 90,
            monthlyGoalUSD: 3000,
            currentMonth: new Date().toISOString().slice(0, 7)
        };
        storage.save();
        this.loadSettingsUI();
        this.stopTimerUI();
        this.updateHome();
        this.renderHistory();
        this.renderStats();
        this.renderTranslateHistory();
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

// ==================== INIT ====================

window.addEventListener('DOMContentLoaded', () => app.init());
