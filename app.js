// --- DATA & CONFIG ---
const LESSONS = [
    {
        id: 1, title: "Basics 1", questions: [
            { q: "Как сказать 'Привет'?", options: ["Hello", "Bye", "Thanks"], correct: 0 },
            { q: "Переведи 'Кот'", options: ["Dog", "Cat", "Bird"], correct: 1 },
            { q: "Выбери 'Я'", options: ["You", "He", "I"], correct: 2 }
        ]
    },
    {
        id: 2, title: "Food", questions: [
            { q: "Что такое 'Apple'?", options: ["Банан", "Яблоко", "Груша"], correct: 1 },
            { q: "Переведи 'Вода'", options: ["Fire", "Water", "Earth"], correct: 1 },
            { q: "Хлеб - это...", options: ["Bread", "Milk", "Cheese"], correct: 0 }
        ]
    }
];

const WORDS = [
    { en: "Hello", ru: "Привет", ex: "Hello, how are you?" },
    { en: "World", ru: "Мир", ex: "Hello World" },
    { en: "Code", ru: "Код", ex: "I write code" },
    { en: "Learn", ru: "Учить", ex: "Learn English" },
    { en: "Success", ru: "Успех", ex: "Success is key" }
];

const ACHIEVEMENTS = [
    { id: 'first_step', title: "Первый шаг", desc: "Пройти первый урок", icon: "👶", unlocked: false },
    { id: 'word_master', title: "Словарь", desc: "Выучить 5 слов", icon: "📖", unlocked: false },
    { id: 'ai_friend', title: "Друг AI", desc: "Отправить первое сообщение AI", icon: "🤖", unlocked: false }
];

// --- STATE MANAGEMENT ---
const state = {
    apiKey: localStorage.getItem('groq_api_key') || '',
    xp: parseInt(localStorage.getItem('xp')) || 0,
    level: parseInt(localStorage.getItem('level')) || 1,
    streak: parseInt(localStorage.getItem('streak')) || 0,
    lastLogin: localStorage.getItem('last_login'),
    knownWords: JSON.parse(localStorage.getItem('known_words')) || [],
    achievements: JSON.parse(localStorage.getItem('achievements')) || ACHIEVEMENTS,
    currentLesson: null,
    currentQuestionIdx: 0,
    currentWordIdx: 0
};

// --- APP LOGIC ---
const app = {
    init: () => {
        app.checkStreak();
        app.updateStats();

        if (!state.apiKey) {
            app.navigate('welcome');
        } else {
            document.getElementById('api-key').value = state.apiKey;
            app.navigate('home');
        }

        // Event Listeners
        document.getElementById('btn-save-key').onclick = () => {
            const key = document.getElementById('api-key').value.trim();
            if (key) {
                state.apiKey = key;
                localStorage.setItem('groq_api_key', key);
                app.navigate('home');
            }
        };

        document.getElementById('btn-logout').onclick = () => {
            if (confirm('Сбросить API ключ?')) {
                localStorage.removeItem('groq_api_key');
                location.reload();
            }
        };

        document.getElementById('btn-send-chat').onclick = app.sendChat;
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') app.sendChat();
        });

        app.renderLessons();
        app.renderAchievements();
        app.loadWord(0);
    },

    navigate: (screenId) => {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`screen-${screenId}`).classList.add('active');
        if (screenId === 'words') app.loadWord(state.currentWordIdx);
    },

    checkStreak: () => {
        const today = new Date().toDateString();
        if (state.lastLogin !== today) {
            if (state.lastLogin) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                if (state.lastLogin === yesterday.toDateString()) {
                    state.streak++;
                } else {
                    state.streak = 1; // Reset if missed more than 1 day
                }
            } else {
                state.streak = 1;
            }
            state.lastLogin = today;
            localStorage.setItem('streak', state.streak);
            localStorage.setItem('last_login', today);
        }
        document.getElementById('streak-count').innerText = state.streak;
    },

    updateStats: () => {
        document.getElementById('user-level').innerText = state.level;
        document.getElementById('xp-text').innerText = `${state.xp % 100}/100 XP`;
        document.getElementById('xp-fill').style.width = `${state.xp % 100}%`;
        document.getElementById('streak-count').innerText = state.streak;
    },

    addXP: (amount) => {
        state.xp += amount;
        if (state.xp >= state.level * 100) {
            state.level++;
            state.xp = 0;
            alert(`🎉 Новый уровень: ${state.level}!`);
        }
        localStorage.setItem('xp', state.xp);
        localStorage.setItem('level', state.level);
        app.updateStats();
    },

    unlockAchievement: (id) => {
        const ach = state.achievements.find(a => a.id === id);
        if (ach && !ach.unlocked) {
            ach.unlocked = true;
            localStorage.setItem('achievements', JSON.stringify(state.achievements));
            app.renderAchievements();
            // Could show toast here
        }
    },

    // --- LESSONS ---
    renderLessons: () => {
        const container = document.getElementById('lessons-list');
        container.innerHTML = LESSONS.map(l => `
            <div class="lesson-item" onclick="app.startLesson(${l.id})">
                <span>${l.title}</span>
                <span>▶️</span>
            </div>
        `).join('');
    },

    startLesson: (id) => {
        state.currentLesson = LESSONS.find(l => l.id === id);
        state.currentQuestionIdx = 0;
        app.navigate('lesson-active');
        app.showQuestion();
    },

    showQuestion: () => {
        const q = state.currentLesson.questions[state.currentQuestionIdx];
        document.getElementById('lesson-question').innerText = q.q;
        document.getElementById('lesson-progress').style.width = `${((state.currentQuestionIdx) / state.currentLesson.questions.length) * 100}%`;

        const optsDiv = document.getElementById('lesson-options');
        optsDiv.innerHTML = '';
        document.getElementById('lesson-feedback').classList.add('hidden');
        document.getElementById('lesson-next-btn').classList.add('hidden');

        q.options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.innerText = opt;
            btn.onclick = () => app.checkAnswer(idx, btn);
            optsDiv.appendChild(btn);
        });
    },

    checkAnswer: (idx, btn) => {
        const q = state.currentLesson.questions[state.currentQuestionIdx];
        const feedback = document.getElementById('lesson-feedback');
        const nextBtn = document.getElementById('lesson-next-btn');

        // Disable all buttons
        document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);

        if (idx === q.correct) {
            btn.classList.add('correct');
            feedback.innerText = "Правильно! 🎉";
            feedback.className = "feedback correct";
            app.addXP(10);
            if (state.currentLesson.id === 1 && state.currentQuestionIdx === 0) app.unlockAchievement('first_step');
        } else {
            btn.classList.add('wrong');
            document.querySelectorAll('.option-btn')[q.correct].classList.add('correct');
            feedback.innerText = "Ошибка 😞";
            feedback.className = "feedback wrong";
        }

        feedback.classList.remove('hidden');
        nextBtn.classList.remove('hidden');
    },

    nextQuestion: () => {
        state.currentQuestionIdx++;
        if (state.currentQuestionIdx < state.currentLesson.questions.length) {
            app.showQuestion();
        } else {
            alert("Урок пройден!");
            app.navigate('home');
        }
    },

    quitLesson: () => {
        if (confirm("Выйти из урока?")) app.navigate('home');
    },

    // --- WORDS ---
    loadWord: (idx) => {
        if (idx < 0) idx = WORDS.length - 1;
        if (idx >= WORDS.length) idx = 0;
        state.currentWordIdx = idx;

        const w = WORDS[idx];
        document.getElementById('word-en').innerText = w.en;
        document.getElementById('word-ru').innerText = w.ru;
        document.getElementById('word-example').innerText = w.ex;
        document.getElementById('flashcard').classList.remove('flipped');
    },

    nextWord: () => app.loadWord(state.currentWordIdx + 1),
    prevWord: () => app.loadWord(state.currentWordIdx - 1),

    knowWord: () => {
        const w = WORDS[state.currentWordIdx];
        if (!state.knownWords.includes(w.en)) {
            state.knownWords.push(w.en);
            localStorage.setItem('known_words', JSON.stringify(state.knownWords));
            app.addXP(5);
            if (state.knownWords.length >= 5) app.unlockAchievement('word_master');
        }
        app.nextWord();
    },

    // --- AI CHAT ---
    sendChat: async () => {
        const input = document.getElementById('chat-input');
        const msg = input.value.trim();
        if (!msg) return;

        // Add user message
        const chatHist = document.getElementById('chat-history');
        chatHist.innerHTML += `<div class="message user">${msg}</div>`;
        input.value = '';
        chatHist.scrollTop = chatHist.scrollHeight;

        if (state.achievements.find(a => a.id === 'ai_friend' && !a.unlocked)) {
            app.unlockAchievement('ai_friend');
        }

        // Call Groq API
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${state.apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messages: [
                        { role: "system", content: "You are a friendly English teacher. Correct mistakes gently and keep conversation simple." },
                        { role: "user", content: msg }
                    ],
                    model: "llama3-8b",
                    temperature: 0.7,
                    max_tokens: 100
                })
            });

            const data = await response.json();
            if (data.choices && data.choices.length > 0) {
                const reply = data.choices[0].message.content;
                chatHist.innerHTML += `<div class="message ai">${reply}</div>`;
            } else {
                chatHist.innerHTML += `<div class="message ai">Error: ${JSON.stringify(data)}</div>`;
            }
        } catch (e) {
            chatHist.innerHTML += `<div class="message ai">Network Error: ${e.message}</div>`;
        }
        chatHist.scrollTop = chatHist.scrollHeight;
    },

    // --- ACHIEVEMENTS ---
    renderAchievements: () => {
        const list = document.getElementById('achievements-list');
        list.innerHTML = state.achievements.map(a => `
            <div class="ach-item ${a.unlocked ? 'unlocked' : ''}">
                <div class="ach-icon">${a.icon}</div>
                <div>
                    <strong>${a.title}</strong><br>
                    <small>${a.desc}</small>
                </div>
            </div>
        `).join('');
    }
};

// Start App
window.addEventListener('DOMContentLoaded', app.init);
