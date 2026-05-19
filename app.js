// ==================== DATA ====================

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_NAMES_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

// ==================== STATE ====================

const state = {
    activeShift: null,
    shifts: [],
    sites: [],
    settings: {
        currencyRate: 90,
        monthlyGoalUSD: 3000,
        currentMonth: '',
        tokenRate: 20,
        payoutPercent: 66
    },
    translations: [],
    currentFilter: 'today',
    currentStatPeriod: 'week',
    currentStatTab: 'earnings',
    calendarDate: new Date(),
    translateDir: 'auto-en',
    timerInterval: null,
    editingShiftId: null,
    frozenElapsed: null,
    editingSiteId: null,
    lastRateUpdate: 0,
    customPeriodStart: '',
    customPeriodEnd: ''
};

// ==================== STORAGE ====================

const storage = {
    save() {
        localStorage.setItem('wt_activeShift', JSON.stringify(state.activeShift));
        localStorage.setItem('wt_shifts', JSON.stringify(state.shifts));
        localStorage.setItem('wt_sites', JSON.stringify(state.sites));
        localStorage.setItem('wt_settings', JSON.stringify(state.settings));
        localStorage.setItem('wt_translations', JSON.stringify(state.translations));
        localStorage.setItem('wt_lastRateUpdate', String(state.lastRateUpdate || 0));
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
            const si = localStorage.getItem('wt_sites');
            if (si) state.sites = JSON.parse(si);
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
        try {
            const lru = localStorage.getItem('wt_lastRateUpdate');
            if (lru) state.lastRateUpdate = parseInt(lru) || 0;
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

function fmtMoneyLines(usd) {
    return `<span class="money-usd">${fmtUSD(usd)}</span><span class="money-rub">${fmtRUB(usd)}</span>`;
}

function getNetUSD(shift) {
    return shift.earningsUSD * state.settings.payoutPercent / 100;
}

function getGrossUSD(shift) {
    return shift.earningsUSD;
}

function getTotalTokens(shift) {
    if (!shift.tokensBySite) return 0;
    return Object.values(shift.tokensBySite).reduce((a, b) => a + b, 0);
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
            const dayOfWeek = now.getDay();
            const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const monday = new Date(now);
            monday.setDate(monday.getDate() + mondayOffset);
            const mondayStr = monday.toISOString().slice(0, 10);
            return s.date >= mondayStr && s.date <= today;
        }
        if (period === 'month') {
            const monthStr = now.toISOString().slice(0, 7);
            return s.date.startsWith(monthStr);
        }
        if (period === 'custom' && state.customPeriodStart && state.customPeriodEnd) {
            return s.date >= state.customPeriodStart && s.date <= state.customPeriodEnd;
        }
        return true;
    });
}

function getShiftsForStatPeriod(period) {
    const now = new Date();
    if (period === 'week') {
        const dayOfWeek = now.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(now);
        monday.setDate(monday.getDate() + mondayOffset);
        const mondayStr = monday.toISOString().slice(0, 10);
        const today = getTodayStr();
        return state.shifts.filter(s => s.date >= mondayStr && s.date <= today);
    }
    if (period === 'month') {
        const monthStr = now.toISOString().slice(0, 7);
        return state.shifts.filter(s => s.date.startsWith(monthStr));
    }
    if (period === 'custom' && state.customPeriodStart && state.customPeriodEnd) {
        return state.shifts.filter(s => s.date >= state.customPeriodStart && s.date <= state.customPeriodEnd);
    }
    return state.shifts;
}

function getPrevPeriodShifts(period) {
    const now = new Date();
    if (period === 'week') {
        const dayOfWeek = now.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const thisMonday = new Date(now);
        thisMonday.setDate(thisMonday.getDate() + mondayOffset);
        const prevMonday = new Date(thisMonday);
        prevMonday.setDate(prevMonday.getDate() - 7);
        const prevMondayStr = prevMonday.toISOString().slice(0, 10);
        const thisMondayStr = thisMonday.toISOString().slice(0, 10);
        return state.shifts.filter(s => s.date >= prevMondayStr && s.date < thisMondayStr);
    }
    if (period === 'month') {
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const monthStr = prevMonth.toISOString().slice(0, 7);
        return state.shifts.filter(s => s.date.startsWith(monthStr));
    }
    if (period === 'custom' && state.customPeriodStart && state.customPeriodEnd) {
        const start = new Date(state.customPeriodStart);
        const end = new Date(state.customPeriodEnd);
        const diffMs = end - start;
        const prevStart = new Date(start.getTime() - diffMs);
        const prevEnd = new Date(end.getTime() - diffMs);
        const prevStartStr = prevStart.toISOString().slice(0, 10);
        const prevEndStr = prevEnd.toISOString().slice(0, 10);
        return state.shifts.filter(s => s.date >= prevStartStr && s.date <= prevEndStr);
    }
    return [];
}

function getTotalMs(shifts) {
    return shifts.reduce((sum, s) => sum + s.durationMs, 0);
}

function getTotalNet(shifts) {
    return shifts.reduce((sum, s) => sum + getNetUSD(s), 0);
}

function getTotalGross(shifts) {
    return shifts.reduce((sum, s) => sum + getGrossUSD(s), 0);
}

function getTotalTokensAll(shifts) {
    return shifts.reduce((sum, s) => sum + getTotalTokens(s), 0);
}

function getTodayShifts() {
    const today = getTodayStr();
    return state.shifts.filter(s => s.date === today);
}

function getMonthlyNet() {
    const monthStr = new Date().toISOString().slice(0, 7);
    return state.shifts
        .filter(s => s.date.slice(0, 7) === monthStr)
        .reduce((sum, s) => sum + getNetUSD(s), 0);
}

function comparisonHtml(current, previous) {
    if (previous === 0 || previous === null || previous === undefined) return '';
    const pct = ((current - previous) / previous) * 100;
    const rounded = Math.abs(pct).toFixed(0);
    if (rounded < 1) return `<div class="comparison-badge neutral">— 0%</div>`;
    if (pct > 0) return `<div class="comparison-badge up">↑ +${rounded}%</div>`;
    return `<div class="comparison-badge down">↓ -${rounded}%</div>`;
}

// ==================== CURRENCY API ====================

const currencyApi = {
    async fetchRate(force) {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        if (!force && state.lastRateUpdate && (now - state.lastRateUpdate) < oneHour) {
            return state.settings.currencyRate;
        }

        const apis = [
            {
                url: 'https://open.er-api.com/v6/latest/USD',
                parse: (data) => data?.rates?.RUB ? Math.round(data.rates.RUB * 100) / 100 : null
            },
            {
                url: 'https://api.exchangerate-api.com/v4/latest/USD',
                parse: (data) => data?.rates?.RUB ? Math.round(data.rates.RUB * 100) / 100 : null
            },
            {
                url: 'https://api.frankfurter.app/latest?base=USD&symbols=RUB',
                parse: (data) => data?.rates?.RUB ? Math.round(data.rates.RUB * 100) / 100 : null
            }
        ];

        for (const api of apis) {
            try {
                console.log('Fetching rate from:', api.url);
                const resp = await fetch(api.url);
                if (!resp.ok) continue;
                const data = await resp.json();
                const rate = api.parse(data);
                if (rate && rate > 10) {
                    state.settings.currencyRate = rate;
                    state.lastRateUpdate = now;
                    storage.save();
                    console.log('Rate updated:', rate);
                    return rate;
                }
            } catch(e) {
                console.warn('API failed:', api.url, e.message);
            }
        }

        console.warn('All currency APIs failed, keeping rate:', state.settings.currencyRate);
        return state.settings.currencyRate;
    }
};

// ==================== APP ====================

const app = {
    init() {
        storage.load();
        this.loadSettingsUI();
        this.renderSites();
        this.renderTranslateHistory();

        if (state.activeShift && state.activeShift.startTime) {
            this.startTimerUI(true);
        }

        this.updateHome();
        this.renderHistory();
        this.renderStats();
        this.renderCalendar();

        this.updateTimerDisplay();
        state.timerInterval = setInterval(() => app.updateTimerDisplay(), 1000);

        const translateInput = document.getElementById('translate-input');
        if (translateInput) {
            translateInput.addEventListener('input', () => {
                const btn = document.getElementById('btn-clear-input');
                if (translateInput.value.trim()) {
                    btn.classList.remove('hidden');
                } else {
                    btn.classList.add('hidden');
                }
            });
        }

        currencyApi.fetchRate().then(() => {
            this.updateHome();
            this.renderHistory();
        });

        window.addEventListener('resize', () => {
            if (document.getElementById('screen-stats').classList.contains('active')) {
                this.renderStats();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => {
                    m.classList.add('hidden');
                });
                state.editingShiftId = null;
                state.editingSiteId = null;
                state.frozenElapsed = null;
            }
        });
    },

    // --- TAB NAVIGATION ---
    switchTab(tab) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`screen-${tab}`).classList.add('active');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');

        currencyApi.fetchRate().then(() => {
            if (tab === 'history') this.renderHistory();
            if (tab === 'home') { this.updateHome(); this.renderCalendar(); }
        });

        if (tab === 'stats') this.renderStats();
        if (tab === 'settings') this.renderSites();
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
        btn.innerHTML = 'Остановить';
        document.getElementById('timer-status').classList.remove('hidden');
        if (!resumed) {
            btn.style.animation = 'none';
            btn.offsetHeight;
        }
    },

    stopTimerUI() {
        const btn = document.getElementById('btn-timer');
        btn.className = 'btn-timer btn-start';
        btn.innerHTML = 'Начать смену';
        document.getElementById('timer-status').classList.add('hidden');
    },

    updateTimerDisplay() {
        if (state.frozenElapsed !== null) {
            document.getElementById('timer-display').textContent = fmt(state.frozenElapsed);
            return;
        }
        if (state.activeShift && state.activeShift.startTime) {
            const elapsed = Date.now() - state.activeShift.startTime;
            document.getElementById('timer-display').textContent = fmt(elapsed);
        } else {
            document.getElementById('timer-display').textContent = '00:00:00';
        }
    },

    // --- END SHIFT MODAL ---
    showEndShiftModal() {
        state.frozenElapsed = Date.now() - state.activeShift.startTime;
        document.getElementById('modal-duration').textContent = fmtShort(state.frozenElapsed);
        document.getElementById('modal-comment').value = '';

        const inputsContainer = document.getElementById('modal-token-inputs');
        const section = document.getElementById('modal-tokens-section');

        if (state.sites.length === 0) {
            section.classList.add('hidden');
            document.getElementById('modal-total-tokens').textContent = '0';
            document.getElementById('modal-gross').innerHTML = fmtMoneyLines(0);
            document.getElementById('modal-net').textContent = '$0';
            document.getElementById('modal-net-rub').textContent = '₽0';
        } else {
            section.classList.remove('hidden');
            inputsContainer.innerHTML = state.sites.map(site => `
                <div class="token-input-row">
                    <span class="token-site-name">${this.escapeHtml(site.name)}</span>
                    <input type="number" class="token-input" data-site-id="${site.id}" placeholder="0" min="0" oninput="app.updateModalEarnings()">
                </div>
            `).join('');
            this.updateModalEarnings();
        }

        document.getElementById('modal-end-shift').classList.remove('hidden');
    },

    updateModalEarnings() {
        let totalTokens = 0;
        document.querySelectorAll('#modal-token-inputs .token-input').forEach(input => {
            totalTokens += parseInt(input.value) || 0;
        });

        const gross = totalTokens / state.settings.tokenRate;
        const net = gross * state.settings.payoutPercent / 100;

        document.getElementById('modal-total-tokens').textContent = totalTokens;
        document.getElementById('modal-gross').innerHTML = fmtMoneyLines(gross);
        document.getElementById('modal-net').textContent = fmtUSD(net);
        document.getElementById('modal-net-rub').textContent = fmtRUB(net);
    },

    cancelEndShift(e) {
        if (e && e.target !== e.currentTarget) return;
        state.frozenElapsed = null;
        document.getElementById('modal-end-shift').classList.add('hidden');
    },

    saveShift() {
        let tokensBySite = {};
        let totalTokens = 0;

        document.querySelectorAll('#modal-token-inputs .token-input').forEach(input => {
            const val = parseInt(input.value) || 0;
            if (val > 0) {
                tokensBySite[input.dataset.siteId] = val;
                totalTokens += val;
            }
        });

        const gross = totalTokens / state.settings.tokenRate;
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
            earningsUSD: gross,
            tokensBySite: Object.keys(tokensBySite).length > 0 ? tokensBySite : null,
            comment
        };

        state.shifts.unshift(shift);
        state.activeShift = null;
        state.frozenElapsed = null;
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

        const tokensSection = document.getElementById('edit-tokens-section');
        const tokensContainer = document.getElementById('edit-token-inputs');

        if (shift.tokensBySite && state.sites.length > 0) {
            tokensSection.classList.remove('hidden');
            tokensContainer.innerHTML = state.sites.map(site => {
                const val = shift.tokensBySite[site.id] || 0;
                return `
                    <div class="token-input-row">
                        <span class="token-site-name">${this.escapeHtml(site.name)}</span>
                        <input type="number" class="edit-token-input" data-site-id="${site.id}" value="${val}" min="0" oninput="app.updateEditEarnings()">
                    </div>
                `;
            }).join('');
            this.updateEditEarnings();
        } else {
            tokensSection.classList.add('hidden');
        }

        this.updateEditNet();
        document.getElementById('modal-edit-shift').classList.remove('hidden');
    },

    updateEditEarnings() {
        let totalTokens = 0;
        document.querySelectorAll('#edit-token-inputs .edit-token-input').forEach(input => {
            totalTokens += parseInt(input.value) || 0;
        });
        const gross = totalTokens / state.settings.tokenRate;
        document.getElementById('edit-earnings').value = gross.toFixed(2);
        this.updateEditNet();
    },

    updateEditNet() {
        const gross = parseFloat(document.getElementById('edit-earnings').value) || 0;
        const net = gross * state.settings.payoutPercent / 100;
        document.getElementById('edit-net').textContent = fmtUSD(net);
        document.getElementById('edit-net-rub').textContent = fmtRUB(net);
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

        let tokensBySite = {};
        let totalTokens = 0;
        document.querySelectorAll('#edit-token-inputs .edit-token-input').forEach(input => {
            const val = parseInt(input.value) || 0;
            if (val > 0) {
                tokensBySite[input.dataset.siteId] = val;
                totalTokens += val;
            }
        });
        if (Object.keys(tokensBySite).length > 0) {
            shift.tokensBySite = tokensBySite;
        } else {
            shift.tokensBySite = null;
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

    deleteShiftFromEdit() {
        if (!confirm('Удалить эту смену?')) return;
        state.shifts = state.shifts.filter(s => s.id !== state.editingShiftId);
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
        const todayNet = getTotalNet(today);
        document.getElementById('today-hours').textContent = fmtShort(getTotalMs(today));
        document.getElementById('today-earnings').innerHTML = fmtMoneyLines(todayNet);

        const monthly = getMonthlyNet();
        const goal = state.settings.monthlyGoalUSD;
        const pct = goal > 0 ? Math.min((monthly / goal) * 100, 100) : 0;

        document.getElementById('goal-amount').innerHTML = `<span class="money-usd" style="color:var(--primary)">${fmtUSD(monthly)}</span><span class="money-rub">${fmtRUB(monthly)}</span> / <span class="money-usd" style="color:var(--primary)">${fmtUSD(goal)}</span><span class="money-rub">${fmtRUB(goal)}</span>`;
        document.getElementById('goal-progress').style.width = `${pct}%`;
        document.getElementById('goal-remaining').textContent = monthly >= goal
            ? '✅ Цель достигнута!'
            : `Осталось: ${fmtUSD(goal - monthly)} / ${fmtRUB(goal - monthly)}`;
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
            const net = getNetUSD(s);
            const gross = getGrossUSD(s);
            return `
                <div class="shift-card" data-shift-id="${s.id}" onclick="app.editShift('${s.id}')">
                    <div class="shift-info">
                        <div class="shift-date">${dateStr}, ${dayName}</div>
                        <div class="shift-time">${s.start} → ${s.end}</div>
                        <div class="shift-duration">${fmtShort(s.durationMs)}</div>
                        ${s.comment ? `<div class="shift-comment">${this.escapeHtml(s.comment)}</div>` : ''}
                    </div>
                    <div class="shift-earnings">
                        <div class="shift-net">${fmtUSD(net)}</div>
                        <div class="shift-net-rub">${fmtRUB(net)}</div>
                        <div class="shift-gross">${fmtUSD(gross)}</div>
                        <div class="shift-gross-rub">${fmtRUB(gross)}</div>
                    </div>
                </div>
            `;
        }).join('');

        const totalMs = getTotalMs(filtered);
        const totalNet = getTotalNet(filtered);
        const totalGross = getTotalGross(filtered);
        document.getElementById('summary-hours').textContent = fmtShort(totalMs);
        document.getElementById('summary-net').innerHTML = fmtMoneyLines(totalNet);
        document.getElementById('summary-gross').innerHTML = fmtMoneyLines(totalGross);
        summaryEl.classList.remove('hidden');
    },

    // --- STATS ---
    setStatPeriod(p) {
        state.currentStatPeriod = p;
        document.querySelectorAll('.filter-btn[data-stat]').forEach(b => {
            b.classList.toggle('active', b.dataset.stat === p);
        });
        this.renderStats();
    },

    setStatTab(tab) {
        state.currentStatTab = tab;
        document.querySelectorAll('.stats-tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.stab === tab);
        });
        document.querySelectorAll('.stats-tab-content').forEach(c => {
            c.classList.toggle('active', c.id === `stats-tab-${tab}`);
        });
        this.renderStats();
    },

    renderStats() {
        const shifts = getShiftsForStatPeriod(state.currentStatPeriod);
        const prevShifts = getPrevPeriodShifts(state.currentStatPeriod);

        const totalMs = getTotalMs(shifts);
        const totalNet = getTotalNet(shifts);
        const totalGross = getTotalGross(shifts);
        const totalTokens = getTotalTokensAll(shifts);
        const totalHours = totalMs / 3600000;

        const prevMs = getTotalMs(prevShifts);
        const prevNet = getTotalNet(prevShifts);
        const prevGross = getTotalGross(prevShifts);
        const prevCount = prevShifts.length;

        const avgNetPerHour = totalHours > 0 ? totalNet / totalHours : 0;
        const avgNetPerShift = shifts.length > 0 ? totalNet / shifts.length : 0;
        const avgGrossPerHour = totalHours > 0 ? totalGross / totalHours : 0;
        const avgGrossPerShift = shifts.length > 0 ? totalGross / shifts.length : 0;

        const bestDayNet = this.getBestDay(shifts, 'net');
        const bestDayHours = this.getBestDayHours(shifts);

        // --- EARNINGS TAB ---
        document.getElementById('stats-tab-earnings').innerHTML = `
            <div class="section-title" style="padding: 0 22px 6px;">Общие</div>
            <div class="metrics-grid" style="margin-bottom: 16px;">
                <div class="metric-card">
                    <div class="metric-value">${shifts.length}</div>
                    <div class="metric-label">Всего смен</div>
                    ${comparisonHtml(shifts.length, prevCount)}
                </div>
                <div class="metric-card">
                    <div class="metric-value green">${fmtMoneyLines(totalNet)}</div>
                    <div class="metric-label">На карту</div>
                    ${comparisonHtml(totalNet, prevNet)}
                </div>
                <div class="metric-card">
                    <div class="metric-value orange">${fmtMoneyLines(totalGross)}</div>
                    <div class="metric-label">Общий</div>
                    ${comparisonHtml(totalGross, prevGross)}
                </div>
                <div class="metric-card">
                    <div class="metric-value" style="color:var(--secondary)">${totalTokens.toLocaleString('ru-RU')}</div>
                    <div class="metric-label">Токены</div>
                </div>
            </div>
            <div class="section-title" style="padding: 0 22px 6px;">Средние</div>
            <div class="metrics-grid" style="margin-bottom: 16px;">
                <div class="metric-card">
                    <div class="metric-value orange">${fmtMoneyLines(avgNetPerHour)}</div>
                    <div class="metric-label">Средний $/час</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${fmtMoneyLines(avgNetPerShift)}</div>
                    <div class="metric-label">Средняя смена</div>
                </div>
            </div>
            <div class="section-title" style="padding: 0 22px 6px;">Рекорды</div>
            <div class="metrics-grid" style="margin-bottom: 16px;">
                <div class="metric-card full-width">
                    <div class="metric-value green">${bestDayNet ? fmtMoneyLines(bestDayNet.total) : fmtMoneyLines(0)}</div>
                    <div class="metric-label">Лучший день${bestDayNet ? ' (' + bestDayNet.date + ')' : ''}</div>
                </div>
            </div>
            <div class="card chart-card">
                <div class="section-title">На карту по дням</div>
                <canvas id="chart-net" height="200"></canvas>
            </div>
            <div class="card chart-card">
                <div class="section-title">Общий заработок по дням</div>
                <canvas id="chart-gross" height="200"></canvas>
            </div>
            <div class="card chart-card">
                <div class="section-title">Средний заработок по дням недели</div>
                <canvas id="chart-weekdays" height="200"></canvas>
            </div>
        `;

        // --- HOURS TAB ---
        document.getElementById('stats-tab-hours').innerHTML = `
            <div class="section-title" style="padding: 0 22px 6px;">Общие</div>
            <div class="metrics-grid" style="margin-bottom: 16px;">
                <div class="metric-card">
                    <div class="metric-value cyan">${fmtShort(totalMs)}</div>
                    <div class="metric-label">Всего часов</div>
                    ${comparisonHtml(totalHours, prevMs / 3600000)}
                </div>
                <div class="metric-card">
                    <div class="metric-value">${shifts.length}</div>
                    <div class="metric-label">Всего смен</div>
                </div>
                <div class="metric-card full-width">
                    <div class="metric-value orange">${totalHours > 0 ? (totalHours / shifts.length).toFixed(1) : '0'}ч</div>
                    <div class="metric-label">Среднее за смену</div>
                </div>
            </div>
            <div class="section-title" style="padding: 0 22px 6px;">Рекорды</div>
            <div class="metrics-grid" style="margin-bottom: 16px;">
                <div class="metric-card full-width">
                    <div class="metric-value cyan">${bestDayHours ? fmtShort(bestDayHours.ms) : '0ч'}</div>
                    <div class="metric-label">Лучший день по часам${bestDayHours ? ' (' + bestDayHours.date + ')' : ''}</div>
                </div>
            </div>
            <div class="card chart-card">
                <div class="section-title">Часы по дням</div>
                <canvas id="chart-hours" height="200"></canvas>
            </div>
        `;

        // Render charts after DOM update
        setTimeout(() => {
            if (state.currentStatTab === 'earnings') {
                this.renderEarningsChart(shifts, 'chart-net', 'net');
                this.renderEarningsChart(shifts, 'chart-gross', 'gross');
                this.renderWeekdaysAvgChart();
            } else if (state.currentStatTab === 'hours') {
                this.renderHoursChart(shifts);
            }
        }, 50);
    },

    getBestDay(shifts, type) {
        const byDay = {};
        shifts.forEach(s => {
            const val = type === 'net' ? getNetUSD(s) : getGrossUSD(s);
            byDay[s.date] = (byDay[s.date] || 0) + val;
        });
        let best = null;
        for (const [date, total] of Object.entries(byDay)) {
            if (!best || total > best.total) best = { date, total };
        }
        return best;
    },

    getBestDayHours(shifts) {
        const byDay = {};
        shifts.forEach(s => {
            byDay[s.date] = (byDay[s.date] || 0) + s.durationMs;
        });
        let best = null;
        for (const [date, ms] of Object.entries(byDay)) {
            if (!best || ms > best.ms) best = { date, ms };
        }
        return best;
    },

    renderHoursChart(shifts) {
        const canvas = document.getElementById('chart-hours');
        if (!canvas) return;
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
            ctx.font = '14px Inter, -apple-system';
            ctx.textAlign = 'center';
            ctx.fillText('Нет данных', w / 2, h / 2);
            return;
        }

        const maxVal = Math.max(...data.map(d => d.value), 1);
        const chartW = w - pad.left - pad.right;
        const chartH = h - pad.top - pad.bottom;

        ctx.clearRect(0, 0, w, h);

        const textColor = 'rgba(255,255,255,0.55)';
        const lineColor = '#00E5FF';

        ctx.fillStyle = textColor;
        ctx.font = '10px Inter, -apple-system';
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
        ctx.font = '9px Inter, -apple-system';
        const step = Math.max(1, Math.floor(data.length / 7));
        data.forEach((d, i) => {
            if (i % step === 0 || i === data.length - 1) {
                const x = pad.left + (chartW / Math.max(data.length - 1, 1)) * i;
                ctx.fillText(d.label, x, h - 8);
            }
        });
    },

    renderEarningsChart(shifts, canvasId, type) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = 200 * dpr;
        ctx.scale(dpr, dpr);

        const w = canvas.offsetWidth;
        const h = 200;
        const pad = { top: 10, right: 10, bottom: 30, left: 40 };

        const data = this.getChartData(shifts, type);
        if (data.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.font = '14px Inter, -apple-system';
            ctx.textAlign = 'center';
            ctx.fillText('Нет данных', w / 2, h / 2);
            return;
        }

        const maxVal = Math.max(...data.map(d => d.value), 1);
        const chartW = w - pad.left - pad.right;
        const chartH = h - pad.top - pad.bottom;

        ctx.clearRect(0, 0, w, h);

        const textColor = 'rgba(255,255,255,0.55)';
        const lineColor = type === 'net' ? '#00FFA3' : '#8B5CF6';

        ctx.fillStyle = textColor;
        ctx.font = '10px Inter, -apple-system';
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
        ctx.font = '9px Inter, -apple-system';
        const step = Math.max(1, Math.floor(data.length / 7));
        data.forEach((d, i) => {
            if (i % step === 0 || i === data.length - 1) {
                const x = pad.left + (chartW / Math.max(data.length - 1, 1)) * i;
                ctx.fillText(d.label, x, h - 8);
            }
        });
    },

    renderTokensChart(shifts) {
        const canvas = document.getElementById('chart-tokens');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = 200 * dpr;
        ctx.scale(dpr, dpr);

        const w = canvas.offsetWidth;
        const h = 200;
        const pad = { top: 10, right: 10, bottom: 30, left: 40 };

        const byDate = {};
        shifts.forEach(s => {
            byDate[s.date] = (byDate[s.date] || 0) + getTotalTokens(s);
        });

        const sorted = Object.keys(byDate).sort();
        const data = sorted.map(date => {
            const d = new Date(date + 'T00:00:00');
            const label = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            return { label, value: byDate[date] };
        });

        if (data.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.font = '14px Inter, -apple-system';
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

        const textColor = 'rgba(255,255,255,0.55)';
        const barGradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
        barGradient.addColorStop(0, '#FFB800');
        barGradient.addColorStop(1, '#FF6B9D');

        ctx.fillStyle = textColor;
        ctx.font = '10px Inter, -apple-system';
        ctx.textAlign = 'right';

        for (let i = 0; i <= 4; i++) {
            const y = pad.top + chartH - (i / 4) * chartH;
            const val = Math.round((i / 4) * maxVal);
            ctx.fillText(val.toLocaleString('ru-RU'), pad.left - 4, y + 4);
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
            ctx.font = '9px Inter, -apple-system';
            ctx.fillText(d.label, x, h - 8);
        });
    },

    renderWeekdaysAvgChart() {
        const canvas = document.getElementById('chart-weekdays');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = 200 * dpr;
        ctx.scale(dpr, dpr);

        const w = canvas.offsetWidth;
        const h = 200;
        const pad = { top: 10, right: 10, bottom: 30, left: 40 };

        const byWeekday = [0, 0, 0, 0, 0, 0, 0];
        const countByWeekday = [0, 0, 0, 0, 0, 0, 0];
        const jsDayToIdx = [6, 0, 1, 2, 3, 4, 5];
        state.shifts.forEach(s => {
            const d = new Date(s.date + 'T00:00:00');
            const idx = jsDayToIdx[d.getDay()];
            byWeekday[idx] += getNetUSD(s);
            countByWeekday[idx]++;
        });

        const data = DAY_NAMES.map((label, i) => ({
            label,
            value: countByWeekday[i] > 0 ? byWeekday[i] / countByWeekday[i] : 0
        }));
        const maxVal = Math.max(...data.map(d => d.value), 1);
        const bestIdx = byWeekday.findIndex((v, i) => countByWeekday[i] > 0 && v / countByWeekday[i] === maxVal);

        const chartW = w - pad.left - pad.right;
        const chartH = h - pad.top - pad.bottom;
        const barW = Math.min(chartW / data.length * 0.65, 36);
        const gap = chartW / data.length;

        ctx.clearRect(0, 0, w, h);

        const textColor = 'rgba(255,255,255,0.55)';

        ctx.fillStyle = textColor;
        ctx.font = '10px Inter, -apple-system';
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

        data.forEach((d, i) => {
            const x = pad.left + gap * i + gap / 2;
            const barH = (d.value / maxVal) * chartH;
            const y = pad.top + chartH - barH;

            if (d.value > 0) {
                const isBest = i === bestIdx;
                ctx.fillStyle = isBest ? '#00FFA3' : 'rgba(139, 92, 246, 0.6)';
                if (isBest) {
                    ctx.shadowColor = 'rgba(0, 255, 163, 0.5)';
                    ctx.shadowBlur = 12;
                }
                ctx.beginPath();
                const r = Math.min(barW / 2, 4);
                ctx.moveTo(x - barW / 2, pad.top + chartH);
                ctx.lineTo(x - barW / 2, y + r);
                ctx.quadraticCurveTo(x - barW / 2, y, x - barW / 2 + r, y);
                ctx.lineTo(x + barW / 2 - r, y);
                ctx.quadraticCurveTo(x + barW / 2, y, x + barW / 2, y + r);
                ctx.lineTo(x + barW / 2, pad.top + chartH);
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            ctx.fillStyle = i === bestIdx ? '#00FFA3' : textColor;
            ctx.textAlign = 'center';
            ctx.font = `${i === bestIdx ? '600 ' : ''}11px Inter, -apple-system`;
            ctx.fillText(d.label, x, h - 8);
        });
    },

    getChartData(shifts, type) {
        const byDate = {};
        shifts.forEach(s => {
            if (!byDate[s.date]) byDate[s.date] = { earnings: 0, net: 0, ms: 0 };
            byDate[s.date].earnings += getGrossUSD(s);
            byDate[s.date].net += getNetUSD(s);
            byDate[s.date].ms += s.durationMs;
        });

        const sorted = Object.keys(byDate).sort();
        return sorted.map(date => {
            const d = new Date(date + 'T00:00:00');
            const label = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            return {
                label,
                value: type === 'hours' ? byDate[date].ms / 3600000 : (type === 'net' ? byDate[date].net : byDate[date].earnings)
            };
        });
    },

    // --- CALENDAR ---
    renderCalendar() {
        const date = state.calendarDate;
        const year = date.getFullYear();
        const month = date.getMonth();
        const today = getTodayStr();

        const headerEl = document.getElementById('calendar-header');
        if (!headerEl) return;

        headerEl.innerHTML = `
            <button class="calendar-nav-btn" onclick="app.calNav(-1)">‹</button>
            <span class="month-title">${MONTH_NAMES[month]} ${year}</span>
            <button class="calendar-nav-btn" onclick="app.calNav(1)">›</button>
        `;

        const grid = document.getElementById('calendar-grid');
        if (!grid) return;

        let html = DAY_NAMES.map(d => `<div class="cal-day-header">${d}</div>`).join('');

        const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            html += '<div class="cal-day empty"></div>';
        }

        const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
        const monthShifts = state.shifts.filter(s => s.date.startsWith(monthStr));

        const netByDay = {};
        monthShifts.forEach(s => {
            netByDay[s.date] = (netByDay[s.date] || 0) + getNetUSD(s);
        });

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === today;
            const net = netByDay[dateStr] || 0;
            let levelClass = '';
            let dotHtml = '';
            if (net > 0) {
                let level = 1;
                if (net >= 10) level = 2;
                if (net >= 25) level = 3;
                if (net >= 50) level = 4;
                levelClass = `worked level-${level}`;
                dotHtml = `<span class="work-dot"></span>`;
            }

            html += `<div class="cal-day ${isToday ? 'today' : ''} ${levelClass}" onclick="app.showDayStats('${dateStr}')"><span>${day}</span>${dotHtml}</div>`;
        }

        grid.innerHTML = html;
    },

    calNav(dir) {
        const d = state.calendarDate;
        state.calendarDate = new Date(d.getFullYear(), d.getMonth() + dir, 1);
        this.renderCalendar();
    },

    showDayStats(dateStr) {
        const dayShifts = state.shifts.filter(s => s.date === dateStr);
        const dateObj = new Date(dateStr + 'T00:00:00');
        const dateDisplay = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

        document.getElementById('day-stats-title').textContent = dateDisplay;
        const content = document.getElementById('day-stats-content');

        if (dayShifts.length === 0) {
            content.innerHTML = `<div class="day-stats-no-shifts">Нет смен за этот день</div>`;
        } else {
            const totalMs = getTotalMs(dayShifts);
            const totalNet = getTotalNet(dayShifts);
            const totalGross = getTotalGross(dayShifts);
            const totalTokens = getTotalTokensAll(dayShifts);
            const totalHours = totalMs / 3600000;
            const ratePerHourNet = totalHours > 0 ? totalNet / totalHours : 0;
            const ratePerHourGross = totalHours > 0 ? totalGross / totalHours : 0;

            let earliestStart = '23:59';
            let latestEnd = '00:00';
            dayShifts.forEach(s => {
                if (s.start < earliestStart) earliestStart = s.start;
                if (s.end > latestEnd) latestEnd = s.end;
            });

            const mergedTokens = {};
            dayShifts.forEach(s => {
                if (s.tokensBySite) {
                    Object.entries(s.tokensBySite).forEach(([siteId, tokens]) => {
                        mergedTokens[siteId] = (mergedTokens[siteId] || 0) + tokens;
                    });
                }
            });

            let tokensHtml = '';
            if (Object.keys(mergedTokens).length > 0) {
                tokensHtml = `<div class="section-title" style="margin-top:12px;margin-bottom:8px">Токены по сайтам</div>`;
                Object.entries(mergedTokens).forEach(([siteId, tokens]) => {
                    const site = state.sites.find(s => s.id === siteId);
                    const siteName = site ? site.name : siteId;
                    const gross = tokens / state.settings.tokenRate;
                    tokensHtml += `
                        <div class="day-shift-detail">
                            <span>${this.escapeHtml(siteName)}</span>
                            <span>${tokens} тк / ${fmtUSD(gross)} / ${fmtRUB(gross)}</span>
                        </div>
                    `;
                });
            }

            content.innerHTML = `
                <div class="card" style="margin-bottom: 0;">
                    <div class="summary-row">
                        <span class="summary-label">Часов</span>
                        <span class="summary-value" style="color: var(--secondary);">${fmtShort(totalMs)}</span>
                    </div>
                    <div class="summary-row">
                        <span class="summary-label">Общий заработок</span>
                        <span class="summary-value">${fmtMoneyLines(totalGross)}</span>
                    </div>
                    <div class="summary-row">
                        <span class="summary-label">На карту</span>
                        <span class="summary-value">${fmtMoneyLines(totalNet)}</span>
                    </div>
                    <div class="summary-row">
                        <span class="summary-label">Токены</span>
                        <span class="summary-value">${totalTokens.toLocaleString('ru-RU')}</span>
                    </div>
                </div>
                ${tokensHtml}
                <div class="day-stats-rate">$${ratePerHourNet.toFixed(2)} / ₽${Math.round(ratePerHourNet * state.settings.currencyRate).toLocaleString('ru-RU')} / час</div>
                <button class="btn-copy-shift" onclick="app.copyShift('${dateStr}')">📋 Копировать смену</button>
            `;
        }

        document.getElementById('modal-day-stats').classList.remove('hidden');
    },

    copyShift(dateStr) {
        const dayShifts = state.shifts.filter(s => s.date === dateStr);
        if (dayShifts.length === 0) return;

        const dateObj = new Date(dateStr + 'T00:00:00');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        const dateFormatted = `${day}.${month}.${year}`;

        const nickname = state.settings.nickname || '';

        let earliestStart = '23:59';
        let latestEnd = '00:00';
        dayShifts.forEach(s => {
            if (s.start < earliestStart) earliestStart = s.start;
            if (s.end > latestEnd) latestEnd = s.end;
        });

        const mergedTokens = {};
        dayShifts.forEach(s => {
            if (s.tokensBySite) {
                Object.entries(s.tokensBySite).forEach(([siteId, tokens]) => {
                    mergedTokens[siteId] = (mergedTokens[siteId] || 0) + tokens;
                });
            }
        });

        let lines = [];
        lines.push(`Смена ${dateFormatted}`);
        if (nickname) lines.push(nickname);
        lines.push(`${earliestStart} - ${latestEnd}`);

        let totalTokens = 0;
        let totalGross = 0;

        Object.entries(mergedTokens).forEach(([siteId, tokens]) => {
            const site = state.sites.find(s => s.id === siteId);
            const siteName = site ? site.name : siteId;
            const gross = tokens / state.settings.tokenRate;
            lines.push(`${siteName} - ${tokens}тк/ ${gross.toFixed(2)}$`);
            totalTokens += tokens;
            totalGross += gross;
        });

        lines.push('');
        lines.push(`Total - ${totalTokens}тк/ ${totalGross.toFixed(2)}$`);

        const text = lines.join('\n');

        navigator.clipboard.writeText(text).then(() => {
            const btn = document.querySelector('.btn-copy-shift');
            if (btn) {
                btn.textContent = '✓ Скопировано';
                setTimeout(() => { btn.textContent = '📋 Копировать смену'; }, 2000);
            }
        });
    },

    closeDayStats(e) {
        if (e && e.target !== e.currentTarget) return;
        document.getElementById('modal-day-stats').classList.add('hidden');
    },

    // --- TRANSLATOR ---
    detectLanguage(text) {
        const cyrillic = /[а-яё]/i;
        return cyrillic.test(text) ? 'ru' : 'en';
    },

    clearTranslateInput() {
        document.getElementById('translate-input').value = '';
        document.getElementById('btn-clear-input').classList.add('hidden');
        document.getElementById('translate-output').classList.add('hidden');
        document.getElementById('btn-copy-translate').classList.add('hidden');
        document.getElementById('btn-reverse-translate').classList.add('hidden');
        document.getElementById('translate-detected').classList.add('hidden');
    },

    async doTranslate() {
        const input = document.getElementById('translate-input').value.trim();
        if (!input) return;

        const btn = document.getElementById('btn-translate');
        btn.classList.add('loading');
        btn.disabled = true;

        const detectedLang = this.detectLanguage(input);
        const targetLang = detectedLang === 'ru' ? 'en' : 'ru';
        const langPair = `${detectedLang}|${targetLang}`;

        const dirLabel = document.getElementById('translate-dir-label');
        dirLabel.textContent = detectedLang === 'ru' ? 'RU → EN' : 'EN → RU';

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
            document.getElementById('btn-reverse-translate').classList.remove('hidden');

            state.translations.unshift({
                from: detectedLang,
                to: targetLang,
                text: input,
                result,
                timestamp: Date.now()
            });

            if (state.translations.length > 10) state.translations = state.translations.slice(0, 10);
            storage.save();
            this.renderTranslateHistory();
        } catch (e) {
            console.error('Translate error:', e);
            document.getElementById('translate-output').textContent = 'Ошибка сети. Проверьте интернет.';
            document.getElementById('translate-output').classList.remove('hidden');
        }

        btn.classList.remove('loading');
        btn.disabled = false;
    },

    async reverseTranslate() {
        const result = document.getElementById('translate-output').textContent;
        if (!result) return;

        document.getElementById('translate-input').value = result;
        document.getElementById('btn-clear-input').classList.remove('hidden');
        document.getElementById('translate-output').classList.add('hidden');
        document.getElementById('btn-copy-translate').classList.add('hidden');
        document.getElementById('btn-reverse-translate').classList.add('hidden');

        await this.doTranslate();
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

    clearTranslateHistory() {
        state.translations = [];
        storage.save();
        this.renderTranslateHistory();
    },

    // --- SITES CRUD ---
    renderSites() {
        const container = document.getElementById('sites-list');
        const countEl = document.getElementById('sites-count');
        if (!container) return;

        countEl.textContent = `${state.sites.length} сайт${state.sites.length === 1 ? '' : state.sites.length < 5 ? 'а' : 'ов'}`;

        if (state.sites.length === 0) {
            container.innerHTML = '<div style="padding: 12px 18px; font-size: 13px; color: var(--text-sec);">Добавьте сайты для стримов</div>';
            return;
        }

        container.innerHTML = state.sites.map(site => `
            <div class="site-item">
                <span class="site-name">${this.escapeHtml(site.name)}</span>
                <div class="site-actions">
                    <button class="btn-site-edit" onclick="app.editSite('${site.id}')">✏️</button>
                    <button class="btn-site-delete" onclick="app.deleteSite('${site.id}')">🗑</button>
                </div>
            </div>
        `).join('');
    },

    showAddSite() {
        state.editingSiteId = null;
        document.getElementById('modal-site-title').textContent = 'Добавить сайт';
        document.getElementById('new-site-name').value = '';
        document.getElementById('modal-add-site').classList.remove('hidden');
    },

    closeAddSite(e) {
        if (e && e.target !== e.currentTarget) return;
        document.getElementById('modal-add-site').classList.add('hidden');
        state.editingSiteId = null;
    },

    saveNewSite() {
        const name = document.getElementById('new-site-name').value.trim();
        if (!name) return;

        if (state.editingSiteId) {
            const site = state.sites.find(s => s.id === state.editingSiteId);
            if (site) site.name = name;
        } else {
            state.sites.push({
                id: 'site_' + Date.now(),
                name
            });
        }

        storage.save();
        this.renderSites();
        document.getElementById('modal-add-site').classList.add('hidden');
        state.editingSiteId = null;
    },

    editSite(id) {
        const site = state.sites.find(s => s.id === id);
        if (!site) return;

        state.editingSiteId = id;
        document.getElementById('modal-site-title').textContent = 'Редактировать сайт';
        document.getElementById('new-site-name').value = site.name;
        document.getElementById('modal-add-site').classList.remove('hidden');
    },

    deleteSite(id) {
        if (!confirm('Удалить этот сайт? Токены этого сайта будут удалены из всех смен.')) return;

        state.sites = state.sites.filter(s => s.id !== id);
        state.shifts.forEach(shift => {
            if (shift.tokensBySite && shift.tokensBySite[id]) {
                delete shift.tokensBySite[id];
                if (Object.keys(shift.tokensBySite).length === 0) {
                    shift.tokensBySite = null;
                }
            }
        });

        storage.save();
        this.renderSites();
        this.renderHistory();
        this.updateHome();
        this.renderStats();
    },

    // --- SETTINGS ---
    loadSettingsUI() {
        document.getElementById('setting-token-rate').value = state.settings.tokenRate;
        document.getElementById('setting-payout').value = state.settings.payoutPercent;
        document.getElementById('setting-goal').value = state.settings.monthlyGoalUSD;
        document.getElementById('setting-nickname').value = state.settings.nickname || '';
        this.updateCurrencyDisplay();
    },

    updateCurrencyDisplay() {
        const el = document.getElementById('currency-rate-display');
        if (!el) return;
        const rate = state.settings.currencyRate;
        const lastUpdate = state.lastRateUpdate;
        let timeStr = 'не обновлялся';
        if (lastUpdate) {
            const d = new Date(lastUpdate);
            const now = new Date();
            const diff = now - d;
            if (diff < 60000) timeStr = 'только что';
            else if (diff < 3600000) timeStr = `${Math.floor(diff / 60000)} мин назад`;
            else if (diff < 86400000) timeStr = `сегодня, ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
            else timeStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        }
        el.innerHTML = `1 USD = <strong>${rate.toFixed(2)} RUB</strong><br><span style="font-size:11px;opacity:0.6">Обновлено: ${timeStr}</span>`;
    },

    async refreshRate() {
        const btn = document.querySelector('.btn-refresh-rate');
        if (btn) {
            btn.classList.add('spinning');
            btn.disabled = true;
        }
        await currencyApi.fetchRate(true);
        this.updateCurrencyDisplay();
        this.updateHome();
        this.renderHistory();
        if (btn) {
            btn.classList.remove('spinning');
            btn.disabled = false;
        }
    },

    saveSetting(key, value) {
        if (key === 'tokenRate') {
            state.settings.tokenRate = parseFloat(value) || 20;
        } else if (key === 'payoutPercent') {
            state.settings.payoutPercent = parseFloat(value) || 66;
        } else if (key === 'monthlyGoalUSD') {
            state.settings.monthlyGoalUSD = parseFloat(value) || 0;
        } else if (key === 'nickname') {
            state.settings.nickname = value.trim();
        }
        storage.save();
        this.updateHome();
        this.renderHistory();
        this.renderStats();
    },

    exportData() {
        const data = {
            shifts: state.shifts,
            sites: state.sites,
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
                if (data.sites) state.sites = data.sites;
                if (data.settings) state.settings = { ...state.settings, ...data.settings };
                if (data.translations) state.translations = data.translations;
                storage.save();
                this.loadSettingsUI();
                this.renderSites();
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

        const savedRate = state.settings.currencyRate;
        state.shifts = [];
        state.sites = [];
        state.activeShift = null;
        state.translations = [];
        state.lastRateUpdate = 0;
        state.settings = {
            currencyRate: savedRate,
            monthlyGoalUSD: 3000,
            currentMonth: new Date().toISOString().slice(0, 7),
            tokenRate: 20,
            payoutPercent: 66,
            nickname: ''
        };
        storage.save();
        this.loadSettingsUI();
        this.renderSites();
        this.stopTimerUI();
        this.updateHome();
        this.renderHistory();
        this.renderStats();
        this.renderCalendar();
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
